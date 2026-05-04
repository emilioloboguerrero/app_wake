import React, { useEffect, useState } from 'react';
import apiClient from '../utils/apiClient';

// Polling cadence — the MP webhook normally lands within ~10s but a cold
// Functions instance can stretch it. 30s of polling at 2s intervals covers
// the long tail without making the user stare at a spinner forever.
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 30_000;

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

const PaymentSuccessScreen = () => {
  const courseId = getCourseIdFromUrl();
  const bundleId = getBundleIdFromUrl();
  // Bundle access lookup isn't yet exposed via the API, so we fall back to
  // the soft "se está activando" copy for bundle purchases. Course purchases
  // poll /public/checkout/status (auth-gated; works for any signed-in user)
  // and only claim success once Firestore confirms the access grant.
  const canVerify = !!courseId && !bundleId;
  const [state, setState] = useState(canVerify ? 'verifying' : 'soft');

  useEffect(() => {
    if (!canVerify) return undefined;
    let cancelled = false;
    let timer = null;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      let active = false;
      try {
        const result = await apiClient.get(
          `/public/checkout/status?course=${encodeURIComponent(courseId)}`
        );
        active = !!result?.data?.active;
      } catch {
        // Treat transient errors as "not yet" and keep polling.
      }
      if (cancelled) return;
      if (active) {
        setState('active');
        return;
      }
      if (Date.now() - startedAt >= POLL_MAX_MS) {
        setState('timeout');
        return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [canVerify, courseId]);

  const showCheck = state === 'active';
  const showSpinner = state === 'verifying';
  const title = showCheck
    ? 'Pago completado'
    : state === 'timeout'
      ? 'Pago en proceso'
      : state === 'verifying'
        ? 'Verificando tu pago'
        : 'Pago completado';
  const subtitle = showCheck
    ? 'Tu acceso al programa ya está activo.'
    : state === 'timeout'
      ? 'La activación puede tardar unos minutos. Te avisaremos por correo cuando esté lista.'
      : state === 'verifying'
        ? 'Estamos confirmando con Mercado Pago. Esto tarda unos segundos.'
        : 'Tu acceso al programa está siendo activado.';

  return (
    <div style={styles.container}>
      <div style={styles.card}>
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
        <p style={styles.close}>Cierra esta ventana y regresa a la app.</p>
      </div>
      <style>{`
        @keyframes pp-spin { to { transform: rotate(360deg); } }
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
    gap: '20px',
    maxWidth: '360px',
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
  close: {
    margin: 0,
    fontSize: '14px',
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
  },
};

export default PaymentSuccessScreen;
