// POST /api/v1/public/checkout/start — initiates a MercadoPago checkout
// (one_time or subscription) using the currently signed-in user's ID token.
//
// Returns { initPoint } on success. Throws on validation/network errors.
// On 409 with requireAlternateEmail, returns { needsAlternateEmail: true }.
// On 409 with alreadyPurchased, returns { alreadyPurchased: true, appUrl }.

import { getCurrentIdToken, getAppCheckTokenForRequest } from './storefrontAuthService';

const CHECKOUT_TIMEOUT_MS = 30_000;

export class StorefrontCheckoutError extends Error {
  constructor(message, code, status, requireAlternateEmail = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.requireAlternateEmail = requireAlternateEmail;
    this.name = 'StorefrontCheckoutError';
  }
}

async function postCheckout({ token, appCheckToken, body, signal }) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Wake-Client': 'landing/1.0',
  };
  // Backend's global authMiddleware enforces App Check via enforceAppCheck.
  // Without this header production checkouts return 401 "App Check token
  // requerido". Header is omitted only when App Check isn't configured
  // (dev/preview), which lines up with the backend's enforcement env gate.
  if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;

  return fetch('/api/v1/public/checkout/start', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
}

export async function startStorefrontCheckout({
  username,
  courseId,
  mode,
  payerEmail,
}) {
  let token = await getCurrentIdToken();
  if (!token) {
    throw new StorefrontCheckoutError(
      'Debes iniciar sesión para continuar',
      'UNAUTHENTICATED',
      401
    );
  }
  const appCheckToken = await getAppCheckTokenForRequest();

  const body = {
    username,
    courseId,
    mode,
    ...(payerEmail ? { payerEmail } : {}),
  };

  // Hard timeout so a stuck MP API call never hangs the UI indefinitely.
  // AbortController is reused for the optional retry below.
  const callOnce = async (authToken) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CHECKOUT_TIMEOUT_MS);
    try {
      return await postCheckout({
        token: authToken,
        appCheckToken,
        body,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res;
  try {
    res = await callOnce(token);
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new StorefrontCheckoutError(
        'La conexión tardó demasiado. Intenta de nuevo.',
        'TIMEOUT',
        0
      );
    }
    throw new StorefrontCheckoutError(
      'Error de red. Intenta de nuevo.',
      'NETWORK_ERROR',
      0
    );
  }

  // 401: ID token may be stale (clock skew, idle session). Force-refresh once
  // and retry before giving up.
  if (res.status === 401) {
    const refreshed = await getCurrentIdToken(true);
    if (refreshed && refreshed !== token) {
      token = refreshed;
      try {
        res = await callOnce(token);
      } catch (err) {
        throw new StorefrontCheckoutError(
          err?.name === 'AbortError'
            ? 'La conexión tardó demasiado. Intenta de nuevo.'
            : 'Error de red. Intenta de nuevo.',
          err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          0
        );
      }
    }
  }

  let respBody = null;
  try { respBody = await res.json(); } catch { /* non-JSON */ }

  if (res.status === 409) {
    if (respBody?.requireAlternateEmail) {
      return { needsAlternateEmail: true };
    }
    if (respBody?.alreadyPurchased) {
      return {
        alreadyPurchased: true,
        appUrl: respBody.appUrl || '/app/',
      };
    }
  }

  if (!res.ok) {
    throw new StorefrontCheckoutError(
      respBody?.error?.message || 'No se pudo iniciar el pago',
      respBody?.error?.code || 'INTERNAL_ERROR',
      res.status
    );
  }

  return respBody?.data ?? null;
}
