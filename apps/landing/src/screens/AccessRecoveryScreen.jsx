import React, { useEffect, useRef, useState } from 'react';
import { requestMagicLink } from '../services/magicLinkService';
import { subscribeAuthState, signOutStorefront } from '../services/storefrontAuthService';
import './AccessRecoveryScreen.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AccessRecoveryScreen() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');
  // Retry-After countdown: when the server returns 429 with Retry-After, we
  // disable the submit button for that many seconds and surface the wait
  // time. Without this the user can hammer submit against a still-active
  // rate-limit and see the same error over and over.
  const [retryWait, setRetryWait] = useState(0);
  const retryTimerRef = useRef(null);

  // Auth-aware: if the buyer is already signed in, the magic-link round
  // trip is pointless. Surface a "you're already in" card with a CTA into
  // the app, plus an option to switch accounts.
  const [user, setUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);

  useEffect(() => {
    document.title = 'Acceder a tu cuenta — Wake';
    // noindex: /acceso is an auth gate, never a search-result destination.
    // Manage a single <meta name="robots"> tag so we don't duplicate it
    // across mounts.
    let meta = document.querySelector('meta[name="robots"]');
    let created = false;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      document.head.appendChild(meta);
      created = true;
    }
    const prev = meta.getAttribute('content');
    meta.setAttribute('content', 'noindex, nofollow');
    return () => {
      if (created) meta.remove();
      else if (prev != null) meta.setAttribute('content', prev);
    };
  }, []);

  useEffect(() => {
    let graceTimer = null;
    let resolvedRef = false;
    const flipResolved = () => {
      if (resolvedRef) return;
      resolvedRef = true;
      setAuthResolved(true);
    };
    const unsub = subscribeAuthState((u) => {
      setUser(u || null);
      if (u) {
        if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
        flipResolved();
      } else if (!resolvedRef && !graceTimer) {
        graceTimer = setTimeout(flipResolved, 1500);
      }
    });
    return () => {
      if (graceTimer) clearTimeout(graceTimer);
      unsub?.();
    };
  }, []);

  useEffect(() => () => {
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
  }, []);

  const startRetryCountdown = (seconds) => {
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    setRetryWait(seconds);
    retryTimerRef.current = setInterval(() => {
      setRetryWait((prev) => {
        if (prev <= 1) {
          if (retryTimerRef.current) clearInterval(retryTimerRef.current);
          retryTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Ingresa un correo válido');
      setState('error');
      return;
    }
    setState('sending');
    setError('');
    const result = await requestMagicLink(trimmed);
    if (result.success) {
      setState('sent');
    } else {
      setError(result.error || 'No pudimos enviar el enlace. Intentalo de nuevo.');
      setState('error');
      if (result.retryAfter) startRetryCountdown(result.retryAfter);
    }
  };

  // Already-signed-in branch: don't make the buyer round-trip through email
  // just to enter the app. Shown only after auth has resolved so we don't
  // flash the wrong UI to a user whose session was about to restore.
  if (authResolved && user) {
    return (
      <div className="access-recovery-screen">
        <article className="ar-card">
          <h1 className="ar-title">Ya estás dentro</h1>
          <p className="ar-message">
            Estás conectado como <strong>{user.email || 'tu cuenta'}</strong>.
            Abrí Wake para empezar.
          </p>
          <a href="/app/" className="ar-submit" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
            Abrir Wake
          </a>
          <p className="ar-help">
            ¿Necesitás otra cuenta?{' '}
            <button
              type="button"
              className="ar-link-button"
              onClick={async () => {
                // Real Firebase sign-out, not just local state — otherwise
                // onAuthStateChanged immediately flips the screen back to
                // "Ya estás dentro" before the buyer can do anything.
                try { await signOutStorefront(); } catch { /* tolerate */ }
                setUser(null);
              }}
            >
              Usá otro correo
            </button>.
          </p>
        </article>
      </div>
    );
  }

  return (
    <div className="access-recovery-screen">
      <article className="ar-card">
        {state === 'sent' ? (
          <>
            <div className="ar-icon" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h1 className="ar-title">Revisá tu correo</h1>
            <p className="ar-message">
              Si tu correo está registrado, te enviamos un enlace para entrar a tu cuenta.
              El enlace funciona en cualquier dispositivo.
            </p>
            <p className="ar-spam-note">
              ¿No lo ves? Revisá tu carpeta de <strong>spam</strong> o <strong>promociones</strong>.
              Si pasaron más de 5 minutos, podés{' '}
              <button
                type="button"
                className="ar-link-button"
                onClick={() => { setState('idle'); }}
              >
                pedir otro
              </button>.
            </p>
          </>
        ) : (
          <>
            <h1 className="ar-title">Acceder a tu cuenta</h1>
            <p className="ar-message">
              Te enviamos un enlace para entrar sin contraseña. Tu correo es tu llave —
              guardálo y siempre podés volver a este lugar para recibir uno nuevo.
            </p>
            <form className="ar-form" onSubmit={handleSubmit} noValidate>
              <label htmlFor="ar-email" className="ar-label">Correo electrónico</label>
              <input
                id="ar-email"
                type="email"
                className="ar-input"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setState('idle'); setError(''); }}
                placeholder="tu@correo.com"
                autoComplete="email"
                inputMode="email"
                required
                disabled={state === 'sending' || retryWait > 0}
              />
              {state === 'error' && error ? (
                <p className="ar-error">{error}</p>
              ) : null}
              <button
                type="submit"
                className="ar-submit"
                disabled={state === 'sending' || !email || retryWait > 0}
              >
                {state === 'sending'
                  ? 'Enviando…'
                  : retryWait > 0
                    ? `Reintentar en ${retryWait}s`
                    : 'Enviarme el enlace'}
              </button>
            </form>
          </>
        )}

        <p className="ar-help">
          ¿Necesitás ayuda? <a href="mailto:soporte@wakelab.co">soporte@wakelab.co</a>
        </p>
      </article>
    </div>
  );
}
