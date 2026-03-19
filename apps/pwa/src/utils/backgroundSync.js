import { getAll, remove } from './offlineQueue';
import apiClient, { WakeApiError } from './apiClient';
import logger from './logger';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function updateRetryCount(id) {
  try {
    const raw = localStorage.getItem('wake_offline_queue');
    const queue = raw ? JSON.parse(raw) : [];
    const updated = queue.map(entry =>
      entry.id === id ? { ...entry, retryCount: entry.retryCount + 1 } : entry
    );
    localStorage.setItem('wake_offline_queue', JSON.stringify(updated));
  } catch (err) {
    logger.error('[backgroundSync] updateRetryCount failed:', err);
  }
}

export async function processPendingQueue() {
  const queue = getAll();
  if (queue.length === 0) return;

  const sorted = [...queue].sort((a, b) => {
    if (a.priority === 'high' && b.priority !== 'high') return -1;
    if (b.priority === 'high' && a.priority !== 'high') return 1;
    return new Date(a.enqueuedAt) - new Date(b.enqueuedAt);
  });

  logger.log('[backgroundSync] processing', sorted.length, 'queued operations');

  for (const entry of sorted) {
    if (entry.retryCount >= 3) {
      remove(entry.id);
      logger.log('[backgroundSync] dropped (max retries):', entry.id);
      continue;
    }

    if (Date.now() - new Date(entry.enqueuedAt).getTime() > SEVEN_DAYS_MS) {
      remove(entry.id);
      logger.log('[backgroundSync] dropped (expired):', entry.id);
      continue;
    }

    try {
      if (entry.method === 'POST') {
        await apiClient.post(entry.path, entry.body);
      } else if (entry.method === 'PATCH') {
        await apiClient.patch(entry.path, entry.body);
      } else if (entry.method === 'PUT') {
        await apiClient.put(entry.path, entry.body);
      } else if (entry.method === 'DELETE') {
        await apiClient.delete(entry.path);
      }
      remove(entry.id);
      logger.log('[backgroundSync] replayed successfully:', entry.id);
    } catch (err) {
      if (err instanceof WakeApiError) {
        if (entry.path === '/workout/complete' && err.status === 409) {
          remove(entry.id);
          logger.log('[backgroundSync] dropped (409 already saved):', entry.id);
        } else if (err.status >= 400 && err.status < 500) {
          remove(entry.id);
          logger.warn('[backgroundSync] dropped (4xx permanent failure):', entry.id, err.status);
        } else {
          updateRetryCount(entry.id);
          logger.warn('[backgroundSync] retry later (5xx/network):', entry.id, err.status);
        }
      } else {
        updateRetryCount(entry.id);
        logger.warn('[backgroundSync] retry later (unknown error):', entry.id);
      }
    }
  }
}

export function registerOnlineListener() {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', processPendingQueue);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') processPendingQueue();
  });
  logger.log('[backgroundSync] online listeners registered');
}
