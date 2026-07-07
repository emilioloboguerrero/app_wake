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

// POST /api/v1/public/checkout/guest-start — same contract as
// startStorefrontCheckout but the buyer's identity is just an email: no
// session, no ID token, no App Check (public path; server rate-limits per
// IP + email). Backend finds or creates the Firebase Auth user for the email
// and starts checkout for it. `provider: 'polar'` returns { checkoutUrl };
// MercadoPago returns { initPoint }.
export async function startGuestCheckout({
  username,
  courseId,
  mode,
  provider,
  email,
  payerEmail,
}) {
  const body = {
    username,
    courseId,
    mode,
    email,
    ...(provider === 'polar' ? { provider } : {}),
    ...(payerEmail ? { payerEmail } : {}),
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECKOUT_TIMEOUT_MS);
  let res;
  try {
    res = await fetch('/api/v1/public/checkout/guest-start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Wake-Client': 'landing/1.0',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new StorefrontCheckoutError(
      err?.name === 'AbortError'
        ? 'La conexión tardó demasiado. Intenta de nuevo.'
        : 'Error de red. Intenta de nuevo.',
      err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      0
    );
  }
  clearTimeout(timer);

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

// POST /api/v1/public/checkout/plan-start — pay-first MercadoPago subscription.
// No email, no session, no App Check (public path; server rate-limits per IP).
// Returns { initPoint } pointing at MP's own hosted "checkout externo", where
// the buyer pays as guest and MP collects their email. Only for MP
// subscriptions — the webhook provisions the account from the MP payer email.
export async function startPlanCheckout({ username, courseId }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHECKOUT_TIMEOUT_MS);
  let res;
  try {
    res = await fetch('/api/v1/public/checkout/plan-start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Wake-Client': 'landing/1.0',
      },
      body: JSON.stringify({ username, courseId }),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new StorefrontCheckoutError(
      err?.name === 'AbortError'
        ? 'La conexión tardó demasiado. Intenta de nuevo.'
        : 'Error de red. Intenta de nuevo.',
      err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      0
    );
  }
  clearTimeout(timer);

  let respBody = null;
  try { respBody = await res.json(); } catch { /* non-JSON */ }

  if (!res.ok) {
    throw new StorefrontCheckoutError(
      respBody?.error?.message || 'No se pudo iniciar el pago',
      respBody?.error?.code || 'INTERNAL_ERROR',
      res.status
    );
  }

  return respBody?.data ?? null;
}

// POST /api/v1/payments/polar/checkout — international (USD) hosted checkout via
// Polar. Same auth as the MercadoPago storefront checkout (Firebase ID token +
// App Check). Returns { checkoutUrl } on success, or { alreadyPurchased, appUrl }
// on a 409 already-owned. Throws StorefrontCheckoutError otherwise — CAPACITY_FULL
// is surfaced via .code so the screen can flip to the waitlist.
export async function startPolarCheckout({ courseId, paymentType }) {
  let token = await getCurrentIdToken();
  if (!token) {
    throw new StorefrontCheckoutError(
      'Debes iniciar sesión para continuar',
      'UNAUTHENTICATED',
      401
    );
  }
  const appCheckToken = await getAppCheckTokenForRequest();

  const callOnce = async (authToken) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CHECKOUT_TIMEOUT_MS);
    try {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${authToken}`,
        'X-Wake-Client': 'landing/1.0',
      };
      if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;
      return await fetch('/api/v1/payments/polar/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ courseId, paymentType }),
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
    throw new StorefrontCheckoutError(
      err?.name === 'AbortError'
        ? 'La conexión tardó demasiado. Intenta de nuevo.'
        : 'Error de red. Intenta de nuevo.',
      err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      0
    );
  }

  // 401: ID token may be stale — force-refresh once and retry.
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

  if (res.status === 409 && respBody?.alreadyPurchased) {
    return { alreadyPurchased: true, appUrl: respBody.appUrl || '/app/' };
  }

  if (!res.ok) {
    throw new StorefrontCheckoutError(
      respBody?.error?.message || 'No se pudo iniciar el pago',
      respBody?.error?.code || 'INTERNAL_ERROR',
      res.status
    );
  }

  const checkoutUrl = respBody?.data?.checkout_url;
  if (!checkoutUrl) {
    throw new StorefrontCheckoutError('Respuesta inesperada del servidor', 'INTERNAL_ERROR', 500);
  }
  return { checkoutUrl };
}

// Polled by /comprado to confirm the webhook has granted access before
// sending the user into the PWA. Returns { active, expiresAt } or null on a
// transient error (caller treats null as "not yet" and keeps polling).
export async function getCheckoutStatus({ courseId }) {
  const token = await getCurrentIdToken();
  if (!token) return null;
  const appCheckToken = await getAppCheckTokenForRequest();

  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Wake-Client': 'landing/1.0',
  };
  if (appCheckToken) headers['X-Firebase-AppCheck'] = appCheckToken;

  let res;
  try {
    res = await fetch(
      `/api/v1/public/checkout/status?course=${encodeURIComponent(courseId)}`,
      { method: 'GET', headers }
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let body = null;
  try { body = await res.json(); } catch { return null; }
  return body?.data ?? null;
}
