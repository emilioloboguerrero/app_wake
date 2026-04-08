import { getToken } from 'firebase/app-check';
import { auth, appCheck } from '../config/firebase';

const BASE_URL = '/api/v1';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

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

class ApiClient {
  #tokenCache = null;
  #clientId = 'creator-dashboard/1.0';
  #mode = 'firebase';
  #apiKey = null;
  #refreshPromise = null;

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

  async #refreshToken() {
    if (this.#refreshPromise) return this.#refreshPromise;
    this.#refreshPromise = (async () => {
      try {
        this.#tokenCache = null;
        const user = auth.currentUser;
        if (!user) throw new WakeApiError('UNAUTHENTICATED', 'Session expired', 401);
        const fresh = await user.getIdToken(true);
        this.#tokenCache = { value: fresh, expiresAt: Date.now() + 3600 * 1000 };
        return fresh;
      } finally {
        this.#refreshPromise = null;
      }
    })();
    return this.#refreshPromise;
  }

  async #request(method, path, body, options = {}) {
    const { includeAuth = true, timeout = 15000, signal, params } = options;

    if (!navigator.onLine) {
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

    const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: serializedBody,
        signal: mergedSignal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        if (res.status === 204) return null;
        return await res.json();
      }

      if (res.status === 401 && includeAuth && this.#mode === 'firebase') {
        const fresh = await this.#refreshToken();
        headers['Authorization'] = `Bearer ${fresh}`;

        const retryController = new AbortController();
        const retryTimeoutId = setTimeout(() => retryController.abort(), timeout);
        const retrySignal = signal
          ? AbortSignal.any([retryController.signal, signal])
          : retryController.signal;

        try {
          const retry = await fetch(url, {
            method,
            headers,
            body: serializedBody,
            signal: retrySignal,
          });
          clearTimeout(retryTimeoutId);
          if (retry.ok) return retry.status === 204 ? null : await retry.json();
          const retryErr = await retry.json().catch(() => null);
          throw new WakeApiError(
            retryErr?.error?.code ?? 'UNAUTHENTICATED',
            retryErr?.error?.message ?? 'Unauthorized',
            retry.status,
            retryErr?.error?.field ?? null
          );
        } catch (retryFetchErr) {
          clearTimeout(retryTimeoutId);
          if (retryFetchErr instanceof WakeApiError) throw retryFetchErr;
          if (retryFetchErr.name === 'AbortError') {
            if (signal?.aborted) throw new WakeApiError('REQUEST_CANCELLED', 'Request was cancelled', 0);
            throw new WakeApiError('REQUEST_TIMEOUT', 'Request timed out', 0);
          }
          throw new WakeApiError('NETWORK_ERROR', 'Network request failed', 0);
        }
      }

      let errBody = null;
      try { errBody = await res.json(); } catch { /* non-JSON */ }
      const retryAfterRaw = res.status === 429 ? res.headers.get('Retry-After') : null;
      const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : null;
      throw new WakeApiError(
        errBody?.error?.code ?? 'INTERNAL_ERROR',
        errBody?.error?.message ?? 'Unknown error',
        res.status,
        errBody?.error?.field ?? null,
        Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec : null
      );
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof WakeApiError) throw err;
      if (err.name === 'AbortError') {
        if (signal?.aborted) throw new WakeApiError('REQUEST_CANCELLED', 'Request was cancelled', 0);
        throw new WakeApiError('REQUEST_TIMEOUT', 'Request timed out', 0);
      }
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
        if (err.status === 429 && err.retryAfter) {
          if (i >= delays.length - 1) throw err;
          await new Promise(r => setTimeout(r, err.retryAfter * 1000));
          lastErr = err;
          continue;
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

  async get(path, options)             { return this.#withRetry(() => this.#request('GET', path, undefined, options), true); }
  async post(path, body, options = {}) { return this.#withRetry(() => this.#request('POST', path, body, options), options.idempotent ?? false); }
  async patch(path, body, options)     { return this.#withRetry(() => this.#request('PATCH', path, body, options), true); }
  async put(path, body, options)       { return this.#withRetry(() => this.#request('PUT', path, body, options), true); }
  async delete(path, options)          { return this.#withRetry(() => this.#request('DELETE', path, undefined, options), true); }
}

export const apiClient = new ApiClient();
export default apiClient;
