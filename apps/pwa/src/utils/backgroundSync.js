import { getAll, remove } from './offlineQueue';
import apiClient, { WakeApiError } from './apiClient';
import logger from './logger';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RETRIES = 3;

// Race condition guard: prevents multiple tabs / overlapping visibilitychange
// events from processing the queue concurrently.
let _processing = false;

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

// NOTE: Queued entries must never contain auth tokens — tokens will be stale
// by replay time. apiClient re-attaches a fresh Firebase ID token on every
// outgoing request via its request interceptor.
export async function processPendingQueue() {
  if (_processing) {
    logger.debug('[backgroundSync] already processing — skipped');
    return;
  }

  _processing = true;

  try {
    const queue = getAll();
    if (queue.length === 0) return;

    // Within equal priority, FIFO order is preserved by sorting on enqueuedAt.
    const sorted = [...queue].sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (b.priority === 'high' && a.priority !== 'high') return 1;
      return new Date(a.enqueuedAt) - new Date(b.enqueuedAt);
    });

    logger.debug('[backgroundSync] processing', sorted.length, 'queued operations');

    for (const entry of sorted) {
      // Dead-letter after MAX_RETRIES so one bad entry never blocks the queue.
      if (entry.retryCount >= MAX_RETRIES) {
        remove(entry.id);
        logger.warn('[backgroundSync] dropped (max retries):', entry.id);
        continue;
      }

      if (Date.now() - new Date(entry.enqueuedAt).getTime() > SEVEN_DAYS_MS) {
        remove(entry.id);
        logger.warn('[backgroundSync] dropped (expired):', entry.id);
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
        } else {
          // Unknown method — remove to avoid queue blockage.
          remove(entry.id);
          logger.warn('[backgroundSync] dropped (unknown method):', entry.method, entry.id);
          continue;
        }

        remove(entry.id);
        logger.debug('[backgroundSync] replayed successfully:', entry.id);
      } catch (err) {
        if (err instanceof WakeApiError) {
          if (entry.path === '/workout/complete' && err.status === 409) {
            remove(entry.id);
            logger.debug('[backgroundSync] dropped (409 already saved):', entry.id);
          } else if (err.status >= 400 && err.status < 500) {
            // Permanent client-side failure — retrying won't help.
            remove(entry.id);
            logger.warn('[backgroundSync] dropped (4xx permanent failure):', entry.id, err.status);
          } else {
            // 5xx / network — increment retry counter and leave in queue.
            updateRetryCount(entry.id);
            logger.warn('[backgroundSync] retry later (5xx/network):', entry.id, err.status);
          }
        } else {
          updateRetryCount(entry.id);
          logger.warn('[backgroundSync] retry later (unknown error):', entry.id, String(err));
        }
      }
    }
  } catch (err) {
    logger.error('[backgroundSync] processPendingQueue failed unexpectedly:', err);
  } finally {
    _processing = false;
  }
}

export function registerOnlineListener() {
  if (typeof window === 'undefined') return;

  try {
    window.addEventListener('online', processPendingQueue);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') processPendingQueue();
    });
    logger.debug('[backgroundSync] online listeners registered');
  } catch (err) {
    logger.error('[backgroundSync] registerOnlineListener failed:', err);
  }
}
