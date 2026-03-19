import { getToken } from 'firebase/app-check';
import { auth, appCheck } from '../config/firebase';

const BASE_URL = '/api/v1';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class WakeApiError extends Error {
  constructor(code, message, status, field = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
    this.name = 'WakeApiError';
  }
}

class ApiClient {
  #tokenCache = null;
  #clientId = 'creator-dashboard/1.0';
  #mode = 'firebase';
  #apiKey = null;

  constructor(options = {}) {
    if (options.mode) this.#mode = options.mode;
    if (options.apiKey) this.#apiKey = options.apiKey;
    if (options.clientId) this.#clientId = options.clientId;
  }

  async #getToken() {
    if (this.#mode === 'apikey') return this.#apiKey;
    const user = auth.currentUser;
    if (!user) throw new WakeApiError('UNAUTHENTICATED', 'No authenticated user', 401);
    const now = Date.now();
    if (this.#tokenCache && now < this.#tokenCache.expiresAt - REFRESH_MARGIN_MS) {
      return this.#tokenCache.value;
    }
    const token = await user.getIdToken(false);
    this.#tokenCache = { value: token, expiresAt: now + 3600 * 1000 };
    return token;
  }

  async #request(method, path, body, options = {}) {
    const { includeAuth = true, timeout = 15000, signal, params } = options;

    if (!navigator.onLine && method === 'GET') {
      throw new WakeApiError('NETWORK_ERROR', 'No network connection', 0);
    }

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
      'X-Wake-Client': this.#clientId,
    };

    if (includeAuth) {
      headers['Authorization'] = `Bearer ${await this.#getToken()}`;
      if (appCheck) {
        try {
          const { token } = await getToken(appCheck, false);
          headers['X-Firebase-AppCheck'] = token;
        } catch {
          // emulator — skip silently
        }
      }
    }

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

      if (res.status === 401 && includeAuth && this.#mode === 'firebase') {
        this.#tokenCache = null;
        const user = auth.currentUser;
        if (user) {
          const fresh = await user.getIdToken(true);
          this.#tokenCache = { value: fresh, expiresAt: Date.now() + 3600 * 1000 };
          headers['Authorization'] = `Bearer ${fresh}`;
          const retry = await fetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
          });
          if (retry.ok) return retry.status === 204 ? null : await retry.json();
          const retryErr = await retry.json().catch(() => null);
          throw new WakeApiError(
            retryErr?.error?.code ?? 'UNAUTHENTICATED',
            retryErr?.error?.message ?? 'Unauthorized',
            retry.status,
            retryErr?.error?.field ?? null
          );
        }
        throw new WakeApiError('UNAUTHENTICATED', 'Session expired', 401);
      }

      let errBody = null;
      try { errBody = await res.json(); } catch { /* non-JSON */ }
      throw new WakeApiError(
        errBody?.error?.code ?? 'INTERNAL_ERROR',
        errBody?.error?.message ?? 'Unknown error',
        res.status,
        errBody?.error?.field ?? null
      );
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof WakeApiError) throw err;
      if (err.name === 'AbortError') throw new WakeApiError('REQUEST_TIMEOUT', 'Request timed out', 0);
      throw new WakeApiError('NETWORK_ERROR', 'Network request failed', 0);
    }
  }

  async #withRetry(fn, isIdempotent) {
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
        if (err.status === 429 || err.status >= 500 || err.status === 0) {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async get(path, options)             { return this.#withRetry(() => this.#request('GET', path, undefined, options), true); }
  async post(path, body, options = {}) { return this.#withRetry(() => this.#request('POST', path, body, options), options.idempotent ?? false); }
  async patch(path, body, options)     { return this.#withRetry(() => this.#request('PATCH', path, body, options), true); }
  async put(path, body, options)       { return this.#withRetry(() => this.#request('PUT', path, body, options), true); }
  async delete(path, options)          { return this.#withRetry(() => this.#request('DELETE', path, undefined, options), true); }
}

export const apiClient = new ApiClient({ clientId: 'creator-dashboard/1.0' });
export default apiClient;
