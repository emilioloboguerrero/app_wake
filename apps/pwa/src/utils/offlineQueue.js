import logger from './logger';

const STORAGE_KEY = 'wake_offline_queue';

function readQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (err) {
    logger.error('[offlineQueue] writeQueue failed:', err);
  }
}

export function enqueue(operation) {
  const queue = readQueue();
  const entry = {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    method: operation.method,
    path: operation.path,
    body: operation.body ?? null,
    enqueuedAt: new Date().toISOString(),
    retryCount: 0,
    priority: operation.priority ?? 'normal',
  };
  queue.push(entry);
  writeQueue(queue);
  logger.log('[offlineQueue] enqueued:', entry.id, entry.method, entry.path);
  return entry.id;
}

export function dequeue() {
  const queue = readQueue();
  if (queue.length === 0) return null;
  const [first, ...rest] = queue;
  writeQueue(rest);
  return first;
}

export function getAll() {
  return readQueue();
}

export function remove(id) {
  const queue = readQueue();
  writeQueue(queue.filter(entry => entry.id !== id));
}

export function clear() {
  writeQueue([]);
}
