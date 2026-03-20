const BASE_URL = '/api/v1';

export class WakeApiError extends Error {
  constructor(code, message, status, field = null, retryAfter = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
    this.retryAfter = retryAfter;
    this.name = 'WakeApiError';
  }
}

async function request(method, path, body, options = {}) {
  const { timeout = 15000, signal, params } = options;

  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Wake-Client': 'landing/1.0',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const mergedSignal = signal
    ? AbortSignal.any([controller.signal, signal])
    : controller.signal;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: mergedSignal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      if (res.status === 204) return null;
      return await res.json();
    }

    let errBody = null;
    try { errBody = await res.json(); } catch { /* non-JSON */ }
    const retryAfterRaw = res.status === 429 ? res.headers.get('Retry-After') : null;
    const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : null;
    throw new WakeApiError(
      errBody?.error?.code ?? 'INTERNAL_ERROR',
      errBody?.error?.message ?? 'Error desconocido',
      res.status,
      errBody?.error?.field ?? null,
      Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec : null
    );
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof WakeApiError) throw err;
    if (err.name === 'AbortError') throw new WakeApiError('REQUEST_TIMEOUT', 'La solicitud tardó demasiado', 0);
    throw new WakeApiError('NETWORK_ERROR', 'Error de red', 0);
  }
}

async function withRetry(fn, isIdempotent) {
  const delays = [0, 150, 300];
  let lastErr;
  for (let i = 0; i < delays.length; i++) {
    if (i > 0) {
      if (!isIdempotent) throw lastErr;
      await new Promise(r => setTimeout(r, delays[i]));
    }
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof WakeApiError)) throw err;
      if (err.status === 429) {
        if (!err.retryAfter) throw err;
        await new Promise(r => setTimeout(r, err.retryAfter * 1000));
        return await fn();
      }
      if (err.status >= 500 || err.status === 0) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const apiClient = {
  get: (path, options) => withRetry(() => request('GET', path, undefined, options), true),
  post: (path, body, options = {}) => withRetry(() => request('POST', path, body, options), options.idempotent ?? false),
  patch: (path, body, options) => withRetry(() => request('PATCH', path, body, options), true),
  put: (path, body, options) => withRetry(() => request('PUT', path, body, options), true),
  delete: (path, options) => withRetry(() => request('DELETE', path, undefined, options), true),
};

export default apiClient;
