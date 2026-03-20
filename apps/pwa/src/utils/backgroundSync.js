import { getAll, remove } from './offlineQueue';
import apiClient, { WakeApiError } from './apiClient';
import logger from './logger';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RETRIES = 3;

// Race condition guard: prevents multiple tabs / overlapping visibilitychange
// events from processing the queue concurrently.
let _processing = false;

function updateRetryCount(id) {
  if (!id) return;
  try {
    const raw = localStorage.getItem('wake_offline_queue');
    const queue = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(queue)) return;
    const updated = queue.map(entry =>
      entry?.id === id ? { ...entry, retryCount: (entry.retryCount ?? 0) + 1 } : entry
    );
    localStorage.setItem('wake_offline_queue', JSON.stringify(updated));
  } catch (err) {
    logger.error('[backgroundSync] Error al actualizar contador de reintentos:', err);
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
      if (!entry?.id || !entry.method || !entry.path) {
        logger.warn('[backgroundSync] entrada inválida en la cola, omitiendo');
        continue;
      }

      const retryCount = entry.retryCount ?? 0;

      // Dead-letter after MAX_RETRIES so one bad entry never blocks the queue.
      if (retryCount >= MAX_RETRIES) {
        remove(entry.id);
        logger.warn('[backgroundSync] descartado (máximo de reintentos):', entry.id);
        continue;
      }

      const enqueuedTime = entry.enqueuedAt ? new Date(entry.enqueuedAt).getTime() : 0;
      if (Date.now() - enqueuedTime > SEVEN_DAYS_MS) {
        remove(entry.id);
        logger.warn('[backgroundSync] descartado (expirado):', entry.id);
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
          logger.warn('[backgroundSync] descartado (método desconocido):', entry.method, entry.id);
          continue;
        }

        remove(entry.id);
        logger.debug('[backgroundSync] reenviado exitosamente:', entry.id);
      } catch (err) {
        if (err instanceof WakeApiError) {
          if (entry.path === '/workout/complete' && err.status === 409) {
            remove(entry.id);
            logger.debug('[backgroundSync] descartado (409 ya guardado):', entry.id);
          } else if (err.status >= 400 && err.status < 500) {
            // Permanent client-side failure — retrying won't help.
            remove(entry.id);
            logger.warn('[backgroundSync] descartado (error 4xx permanente):', entry.id, err.status);
          } else {
            // 5xx / network — increment retry counter and leave in queue.
            updateRetryCount(entry.id);
            logger.warn('[backgroundSync] reintentando después (5xx/red):', entry.id, err.status);
          }
        } else {
          updateRetryCount(entry.id);
          logger.warn('[backgroundSync] reintentando después (error desconocido):', entry.id, String(err));
        }
      }
    }
  } catch (err) {
    logger.error('[backgroundSync] Error inesperado al procesar cola pendiente:', err);
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
    logger.debug('[backgroundSync] listeners de reconexión registrados');
  } catch (err) {
    logger.error('[backgroundSync] Error al registrar listeners de reconexión:', err);
  }
}
