import logger from './logger';

const STORAGE_KEY = 'wake_offline_queue';

// Allowed HTTP methods for queued operations.
const ALLOWED_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

// Shape guard — rejects entries that cannot be safely replayed.
function isValidEntry(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    typeof entry.id === 'string' &&
    ALLOWED_METHODS.includes(entry.method) &&
    typeof entry.path === 'string' &&
    entry.path.length > 0 &&
    typeof entry.enqueuedAt === 'string' &&
    typeof entry.retryCount === 'number'
  );
}

function readQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      logger.warn('[offlineQueue] cola corrupta — reiniciando');
      return [];
    }
    // Filter out any entries that don't match the expected shape.
    const valid = parsed.filter(entry => {
      if (!isValidEntry(entry)) {
        logger.warn('[offlineQueue] descartando entrada malformada:', entry?.id ?? '(sin id)');
        return false;
      }
      return true;
    });
    return valid;
  } catch (err) {
    logger.error('[offlineQueue] Error al leer la cola:', err);
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    logger.error('[offlineQueue] Error al escribir la cola:', err);
  }
}

export function enqueue(operation) {
  if (
    !operation ||
    !ALLOWED_METHODS.includes(operation.method) ||
    typeof operation.path !== 'string' ||
    !operation.path.trim()
  ) {
    logger.error('[offlineQueue] enqueue llamado con operación inválida:', operation);
    return null;
  }

  const queue = readQueue();

  // Trim string values in the body to avoid storing leading/trailing whitespace.
  // NOTE: Auth tokens must NOT be stored here — they will be stale by the time the
  // entry is replayed. The apiClient re-attaches a fresh token on every request;
  // never include Authorization headers or token fields in operation.body.
  let sanitizedBody = null;
  if (operation.body && typeof operation.body === 'object') {
    sanitizedBody = Object.fromEntries(
      Object.entries(operation.body).map(([k, v]) => [
        k,
        typeof v === 'string' ? v.trim() : v,
      ])
    );
  }

  const entry = {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    method: operation.method,
    path: operation.path.trim(),
    body: sanitizedBody,
    enqueuedAt: new Date().toISOString(),
    retryCount: 0,
    priority: operation.priority ?? 'normal',
  };

  queue.push(entry);
  writeQueue(queue);
  return entry.id;
}

export function dequeue() {
  try {
    const queue = readQueue();
    if (!queue || queue.length === 0) return null;
    const [first, ...rest] = queue;
    writeQueue(rest);
    return first ?? null;
  } catch (err) {
    logger.error('[offlineQueue] Error al desencolar:', err);
    return null;
  }
}

export function getAll() {
  return readQueue();
}

export function remove(id) {
  if (!id) {
    logger.warn('[offlineQueue] remove llamado sin id');
    return;
  }
  try {
    const queue = readQueue();
    writeQueue(queue.filter(entry => entry?.id !== id));
  } catch (err) {
    logger.error('[offlineQueue] Error al eliminar entrada:', err);
  }
}

export function clear() {
  try {
    writeQueue([]);
  } catch (err) {
    logger.error('[offlineQueue] Error al limpiar la cola:', err);
  }
}
