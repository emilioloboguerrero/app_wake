// Wraps a screen that has to be reachable from a confirmation-email CTA in
// any browser (so the InstallScreen bypass keeps it visible to unauthenticated
// visitors) but still requires a Firebase session to actually do anything.
// When auth resolves and there's no user, we render a magic-link card here
// instead of redirecting to /login. We pass the current path as `next` to
// /auth/request-magic-link; the server allowlist-validates it and embeds it
// in the email-link continueUrl so the buyer lands back here after sign-in.
//
// Used by /course/:courseId, /bundle/:bundleId, and /library/manage/:courseId.

import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingScreen from '../screens/LoadingScreen';

const STORAGE_KEY = 'wake_email_for_sign_in';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requestMagicLink(email, nextPath) {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed) return { success: false, error: 'Ingresá tu correo' };
  // The server validates and embeds `next` into the email-link continueUrl,
  // so the buyer lands back on this screen's path after sign-in. The server
  // applies its own allowlist; we don't need to validate here.
  try {
    const res = await fetch('/api/v1/auth/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmed, next: nextPath || undefined }),
    });
    if (!res.ok) {
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After');
        const parsedRetry = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const retryAfter = Number.isFinite(parsedRetry) && parsedRetry > 0 ? parsedRetry : 60;
        return {
          success: false,
          error: 'Esperá un momento antes de pedir otro enlace.',
          retryAfter,
        };
      }
      if (res.status === 503) return { success: false, error: 'No pudimos enviar el enlace. Intentá de nuevo en un momento.' };
      return { success: false, error: 'No pudimos enviar el enlace. Intentalo de nuevo.' };
    }
    try { window.localStorage.setItem(STORAGE_KEY, trimmed); } catch { /* ignore */ }
    return { success: true };
  } catch {
    return { success: false, error: 'Error de red. Intentalo de nuevo.' };
  }
}

export default function UnauthAccessGate({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Pass the path only — the server's sanitizeNext rejects query-string
  // punctuation by design. Query params on the deep-link destination are
  // rarely meaningful for an auth round trip; drop them so the server
  // allowlist stays simple.
  const nextPath = location.pathname;

  const [email, setEmail] = useState('');
  // 'idle' | 'sending' | 'sent' | 'failed'
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [retryWait, setRetryWait] = useState(0);

  useEffect(() => {
    if (retryWait <= 0) return undefined;
    const id = setInterval(() => setRetryWait((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [retryWait]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Ingresá un correo válido.');
      setState('failed');
      return;
    }
    setState('sending');
    setError('');
    const r = await requestMagicLink(trimmed, nextPath);
    if (r.success) {
      setState('sent');
    } else {
      setError(r.error || 'No pudimos enviar el enlace.');
      setState('failed');
      if (r.retryAfter) setRetryWait(r.retryAfter);
    }
  }, [email, nextPath]);

  if (loading) return <LoadingScreen />;
  if (user) return children;

  if (state === 'sent') {
    return (
      <div style={styles.root}>
        <div style={styles.card}>
          <h1 style={styles.title}>Revisá tu correo</h1>
          <p style={styles.body}>
            Te enviamos un enlace a <strong>{email}</strong>. Tocalo para
            entrar a tu cuenta. ¿No lo ves? Revisá tu carpeta de
            <strong> spam</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <h1 style={styles.title}>Entrá a tu cuenta</h1>
        <p style={styles.body}>
          Para ver este programa necesitamos confirmar tu cuenta.
          Ingresá el correo que usaste al comprar y te enviamos un enlace
          de acceso.
        </p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (state === 'failed') setState('idle'); }}
            disabled={state === 'sending' || retryWait > 0}
            required
            style={styles.input}
          />
          {state === 'failed' && error ? <p style={styles.error}>{error}</p> : null}
          <button
            type="submit"
            style={styles.submit}
            disabled={state === 'sending' || !email || retryWait > 0}
          >
            {state === 'sending'
              ? 'Enviando…'
              : retryWait > 0
                ? `Reintentar en ${retryWait}s`
                : 'Enviarme el enlace'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#1a1a1a',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    maxWidth: 380,
    width: '100%',
    textAlign: 'center',
  },
  title: {
    margin: '0 0 12px',
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: '-0.3px',
  },
  body: {
    margin: '0 0 20px',
    fontSize: 15,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  input: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.95)',
    fontSize: 15,
    fontFamily: 'inherit',
  },
  submit: {
    padding: '12px 18px',
    borderRadius: 12,
    border: 'none',
    background: '#fff',
    color: '#1a1a1a',
    fontWeight: 600,
    fontSize: 15,
    cursor: 'pointer',
  },
  error: {
    color: '#ff6b6b',
    fontSize: 13,
    margin: 0,
  },
};
