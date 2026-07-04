// Reached when MercadoPago redirects an installed-PWA buyer back to the app
// after one-time checkout, OR as the fallback when the back_url builder
// couldn't resolve a creator username (the typical post-payment landing is
// the LANDING'S `/{username}/comprado`). Has to work for both authenticated
// and unauthenticated visitors — cookies often don't survive the
// cross-origin MP redirect on Safari.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import apiClient from '../utils/apiClient';
import { auth } from '../config/firebase';
import analyticsService from '../services/analyticsService';

// Inline magic-link request rather than introduce a new shared service —
// it's a single fetch and the only PWA caller is this screen. Mirrors the
// landing's magicLinkService contract.
const STORAGE_KEY = 'wake_email_for_sign_in';
async function requestMagicLink(email) {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed) return { success: false, error: 'Ingresa tu correo' };
  try {
    const res = await fetch('/api/v1/auth/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmed }),
    });
    if (!res.ok) {
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After');
        const parsedRetry = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const retryAfter = Number.isFinite(parsedRetry) && parsedRetry > 0 ? parsedRetry : 60;
        return { success: false, error: 'Esperá un momento antes de pedir otro enlace.', retryAfter };
      }
      if (res.status === 503) return { success: false, error: 'No pudimos enviar el enlace. Intentá de nuevo en un momento.' };
      return { success: false, error: 'No pudimos enviar el enlace. Intentalo de nuevo.' };
    }
    try { window.localStorage.setItem(STORAGE_KEY, trimmed); } catch { /* private mode */ }
    return { success: true };
  } catch {
    return { success: false, error: 'Error de red. Intentalo de nuevo.' };
  }
}

// Polling cadence — the MP webhook normally lands within ~10s but a cold
// Functions instance can stretch it. 90s of polling at 2s intervals covers
// the long tail without making the user stare at a spinner forever — and
// is wider than the previous 30s window that timed out during cold starts.
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 90_000;

const COURSE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function getCourseIdFromUrl() {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('courseId') || '';
  return COURSE_ID_RE.test(raw) ? raw : null;
}

function getBundleIdFromUrl() {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('bundleId') || '';
  return COURSE_ID_RE.test(raw) ? raw : null;
}

function isSubscriptionMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mode') === 'subscription';
}

const PaymentSuccessScreen = () => {
  const courseId = getCourseIdFromUrl();
  const bundleId = getBundleIdFromUrl();
  const navigate = useNavigate();
  const isSubscription = isSubscriptionMode();

  const [user, setUser] = useState(() => auth.currentUser || null);
  const [authResolved, setAuthResolved] = useState(false);
  // 'verifying' | 'active' | 'timeout' | 'soft'
  const [state, setState] = useState(courseId || bundleId ? 'verifying' : 'soft');
  const [pollFailedTicks, setPollFailedTicks] = useState(0);
  const activatedFiredRef = useRef(false);

  // Fire once on mount: buyer has returned from MP checkout.
  useEffect(() => {
    analyticsService.track('subscription.checkout.returned', {
      surface: 'pwa_web',
      course_id: courseId ?? null,
      bundle_id: bundleId ?? null,
      kind: courseId ? 'course' : (bundleId ? 'bundle' : null),
      status: 'verifying',
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire once when polling confirms access is active.
  useEffect(() => {
    if (state === 'active' && !activatedFiredRef.current) {
      activatedFiredRef.current = true;
      analyticsService.track('subscription.activated', {
        surface: 'pwa_web',
        course_id: courseId ?? null,
        bundle_id: bundleId ?? null,
        kind: courseId ? 'course' : (bundleId ? 'bundle' : null),
      });
    }
  }, [state, courseId, bundleId]);

  // Magic-link fallback for cookie-loss across the MP redirect — buyer
  // enters their email and we re-send a fresh sign-in link instead of
  // dead-ending on a screen they can't act on.
  const [fallbackEmail, setFallbackEmail] = useState('');
  // 'idle' | 'sending' | 'sent' | 'failed'
  const [fallbackState, setFallbackState] = useState('idle');
  const [fallbackError, setFallbackError] = useState('');
  // Retry-After countdown: server returns 429 with a Retry-After header
  // when the per-email cap fires. Disable submit and surface the wait.
  const [fallbackRetryWait, setFallbackRetryWait] = useState(0);
  useEffect(() => {
    if (fallbackRetryWait <= 0) return undefined;
    const id = setInterval(() => setFallbackRetryWait((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [fallbackRetryWait]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setAuthResolved(true);
    });
    return () => unsub();
  }, []);

  // Public courseId status endpoint — anyone-with-the-id can check; access
  // is binary. When the endpoint 401s (auth required because this is the
  // first-party variant), we treat it as "can't verify" and switch to the
  // soft-success / magic-link fallback path so the buyer isn't stuck on a
  // spinner forever.
  useEffect(() => {
    if (state !== 'verifying') return undefined;
    if (!courseId) return undefined; // bundle handling below
    let cancelled = false;
    let timer = null;
    const startedAt = Date.now();
    let consecutiveFails = 0;

    const tick = async () => {
      if (cancelled) return;
      try {
        const result = await apiClient.get(
          `/public/checkout/status?course=${encodeURIComponent(courseId)}`
        );
        const active = !!result?.data?.active;
        consecutiveFails = 0;
        if (active) {
          if (!cancelled) setState('active');
          return;
        }
      } catch (err) {
        consecutiveFails += 1;
        if (!cancelled) setPollFailedTicks(consecutiveFails);
        // 401 means the public route requires auth in this build and the
        // buyer isn't signed in — we'll never confirm via this poll. Drop
        // to soft state immediately so they can request a magic-link.
        const status = err?.status || err?.response?.status;
        if (status === 401) {
          if (!cancelled) setState('soft');
          return;
        }
      }
      if (Date.now() - startedAt >= POLL_MAX_MS) {
        if (!cancelled) setState('timeout');
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [state, courseId]);

  // Bundle polling: fetch the bundle's courseIds[], then walk /users/me to
  // see if ANY of those specific course ids has flipped to active. The
  // earlier "any active course = success" heuristic falsely confirmed any
  // existing customer's prior purchases as if they belonged to this bundle.
  useEffect(() => {
    if (state !== 'verifying') return undefined;
    if (!bundleId || !user?.uid) return undefined;
    let cancelled = false;
    let timer = null;
    const startedAt = Date.now();
    let bundleCourseIds = null; // resolved on first tick

    const tick = async () => {
      if (cancelled) return;
      try {
        if (bundleCourseIds == null) {
          // /bundles/:id is public; we don't need auth to read courseIds.
          const b = await apiClient.get(`/bundles/${encodeURIComponent(bundleId)}`);
          const ids = b?.data?.courseIds;
          bundleCourseIds = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
        }
        if (bundleCourseIds.length === 0) {
          // Can't verify — drop to soft state and let the magic-link
          // fallback carry the buyer.
          if (!cancelled) setState('soft');
          return;
        }
        const me = await apiClient.get('/users/me');
        const courses = me?.data?.courses || {};
        const anyBundleCourseActive = bundleCourseIds.some(
          (id) => courses[id]?.status === 'active'
        );
        if (anyBundleCourseActive) {
          if (!cancelled) setState('active');
          return;
        }
      } catch { /* treat as not-yet */ }
      if (Date.now() - startedAt >= POLL_MAX_MS) {
        if (!cancelled) setState('timeout');
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [state, bundleId, user?.uid]);

  const handleFallbackSubmit = useCallback(async (e) => {
    e.preventDefault();
    const trimmed = fallbackEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFallbackError('Ingresa un correo válido.');
      setFallbackState('failed');
      return;
    }
    setFallbackState('sending');
    setFallbackError('');
    const r = await requestMagicLink(trimmed);
    if (r?.success) {
      setFallbackState('sent');
    } else {
      setFallbackError(r?.error || 'No pudimos enviar el enlace.');
      setFallbackState('failed');
      if (r?.retryAfter) setFallbackRetryWait(r.retryAfter);
    }
  }, [fallbackEmail]);

  const showCheck = state === 'active';
  const showSpinner = state === 'verifying';
  const title =
    state === 'active' ? 'Pago completado' :
      state === 'timeout' ? 'Pago en proceso' :
        state === 'verifying' ? 'Verificando tu pago' :
          'Pago completado';
  const subtitle =
    state === 'active' ?
      (isSubscription ? 'Tu suscripción está activa.' : 'Tu acceso al programa ya está activo.') :
      state === 'timeout' ?
        'La activación puede tardar unos minutos. Te avisaremos por correo cuando esté lista.' :
        state === 'verifying' ?
          (pollFailedTicks >= 3 ?
            'Estamos teniendo problemas para confirmar. Vamos a seguir intentando.' :
            'Estamos confirmando con Mercado Pago. Esto tarda unos segundos.') :
          'Tu acceso al programa está siendo activado.';

  // Show the magic-link fallback any time the buyer is unauthenticated AND
  // they aren't on the happy path of an in-PWA install. Auth must have
  // resolved first to avoid flashing the form to a user whose session was
  // about to restore.
  const showFallback = authResolved && !user && state !== 'active';

  return (
    <div style={styles.container}>
      <div style={styles.card} role="status" aria-live="polite">
        <div style={styles.iconWrap}>
          {showCheck ? (
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
              <circle cx="36" cy="36" r="35" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <circle cx="36" cy="36" r="26" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" fill="none" />
              <polyline
                points="25,36 33,44 48,28"
                stroke="rgba(255,255,255,0.95)"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <div style={showSpinner ? styles.spinner : styles.clockWrap}>
              {showSpinner ? null : (
                <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
                  <circle cx="36" cy="36" r="35" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
                  <circle cx="36" cy="36" r="26" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" fill="none" />
                  <polyline
                    points="36,22 36,36 46,42"
                    stroke="rgba(255,255,255,0.85)"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          )}
        </div>
        <h1 style={styles.title}>{title}</h1>
        <p style={styles.subtitle}>{subtitle}</p>

        {showFallback ? (
          fallbackState === 'sent' ? (
            <p style={styles.fallbackNote}>
              Te enviamos un enlace a <strong>{fallbackEmail}</strong>. Revisá tu
              correo (mirá <strong>spam</strong> también) para entrar.
            </p>
          ) : (
            <form onSubmit={handleFallbackSubmit} style={styles.fallbackForm}>
              <p style={styles.fallbackPrompt}>
                Para entrar a tu cuenta, ingresá el correo que usaste al comprar.
                Te enviamos un enlace de acceso.
              </p>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={fallbackEmail}
                onChange={(e) => {
                  setFallbackEmail(e.target.value);
                  if (fallbackState === 'failed') setFallbackState('idle');
                }}
                disabled={fallbackState === 'sending' || fallbackRetryWait > 0}
                style={styles.fallbackInput}
                required
              />
              {fallbackState === 'failed' && fallbackError ? (
                <p style={styles.fallbackError}>{fallbackError}</p>
              ) : null}
              <button
                type="submit"
                style={styles.fallbackButton}
                disabled={fallbackState === 'sending' || !fallbackEmail || fallbackRetryWait > 0}
              >
                {fallbackState === 'sending'
                  ? 'Enviando…'
                  : fallbackRetryWait > 0
                    ? `Reintentar en ${fallbackRetryWait}s`
                    : 'Enviarme el enlace'}
              </button>
            </form>
          )
        ) : null}

        {state === 'timeout' ? (
          <div style={styles.ctaRow}>
            <button
              type="button"
              style={styles.ctaPrimary}
              onClick={() => { setState('verifying'); setPollFailedTicks(0); }}
            >
              Reintentar
            </button>
            <button
              type="button"
              style={styles.ctaSecondary}
              onClick={() => navigate('/library')}
            >
              Volver a la biblioteca
            </button>
          </div>
        ) : null}

        {state === 'active' && user ? (
          <button
            type="button"
            style={styles.ctaPrimary}
            onClick={() => navigate(courseId ? `/course/${courseId}` : '/library')}
          >
            Abrir mi programa
          </button>
        ) : null}
      </div>
      <style>{`
        @keyframes pp-spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    background: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    maxWidth: '380px',
    width: '100%',
    animation: 'fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both',
  },
  iconWrap: {
    marginBottom: '8px',
  },
  spinner: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.16)',
    borderTopColor: 'rgba(255,255,255,0.85)',
    animation: 'pp-spin 0.9s linear infinite',
  },
  clockWrap: {
    display: 'inline-flex',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    margin: 0,
    fontSize: '15px',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: '1.5',
  },
  ctaRow: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    width: '100%',
  },
  ctaPrimary: {
    padding: '12px 18px',
    borderRadius: 12,
    border: 'none',
    background: '#fff',
    color: '#1a1a1a',
    fontWeight: 600,
    fontSize: 15,
    cursor: 'pointer',
  },
  ctaSecondary: {
    padding: '12px 18px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'transparent',
    color: 'rgba(255,255,255,0.85)',
    fontWeight: 500,
    fontSize: 14,
    cursor: 'pointer',
  },
  fallbackNote: {
    margin: '16px 0 0',
    fontSize: '14px',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: '1.5',
  },
  fallbackForm: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    width: '100%',
  },
  fallbackPrompt: {
    margin: 0,
    fontSize: '13px',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: '1.5',
  },
  fallbackInput: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.95)',
    fontSize: 15,
    fontFamily: 'inherit',
  },
  fallbackButton: {
    padding: '12px 18px',
    borderRadius: 12,
    border: 'none',
    background: '#fff',
    color: '#1a1a1a',
    fontWeight: 600,
    fontSize: 15,
    cursor: 'pointer',
  },
  fallbackError: {
    margin: 0,
    color: '#ff6b6b',
    fontSize: 13,
    textAlign: 'center',
  },
};

export default PaymentSuccessScreen;
