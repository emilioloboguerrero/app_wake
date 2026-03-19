const BASE_URL = '/api/v1';

export class WakeApiError extends Error {
  constructor(code, message, status, field = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
    this.name = 'WakeApiError';
  }
}

async function request(method, path, body, options = {}) {
  const { timeout = 15000 } = options;
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) return await res.json();
    let errBody = null;
    try { errBody = await res.json(); } catch { /* non-JSON */ }
    throw new WakeApiError(
      errBody?.error?.code ?? 'INTERNAL_ERROR',
      errBody?.error?.message ?? 'Error desconocido',
      res.status,
      errBody?.error?.field ?? null
    );
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof WakeApiError) throw err;
    if (err.name === 'AbortError') throw new WakeApiError('REQUEST_TIMEOUT', 'La solicitud tardó demasiado', 0);
    throw new WakeApiError('NETWORK_ERROR', 'Error de red', 0);
  }
}

const apiClient = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
};

export default apiClient;
