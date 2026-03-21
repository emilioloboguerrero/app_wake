'use strict';

/**
 * Minimal HTTP client for API testing. No dependencies.
 */
function createClient(baseUrl, token) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  async function request(method, path, { body, headers: extraHeaders, query } = {}) {
    let url = `${baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) params.append(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const opts = {
      method,
      headers: { ...defaultHeaders, ...extraHeaders },
    };

    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      opts.body = JSON.stringify(body);
    }

    const start = Date.now();
    const res = await fetch(url, opts);
    const elapsed = Date.now() - start;

    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') && res.status !== 204) {
      try { data = await res.json(); } catch { data = null; }
    }

    return {
      status: res.status,
      ok: res.ok,
      data,
      headers: Object.fromEntries(res.headers.entries()),
      elapsed,
      method,
      path,
    };
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    patch: (path, opts) => request('PATCH', path, opts),
    put: (path, opts) => request('PUT', path, opts),
    delete: (path, opts) => request('DELETE', path, opts),
  };
}

module.exports = { createClient };
