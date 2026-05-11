// Handles the redirect from the magic-link email sent by
// POST /api/v1/auth/request-magic-link. Firebase Auth doesn't auto-complete
// passwordless sign-in for us — the email-link itself is a one-shot oobCode
// that we have to feed into `signInWithEmailLink` on the destination page.
//
// Flow:
//   1. The link in the email points here.
//   2. We pull the buyer's email from localStorage (the requesting screen
//      saved it under `wake_email_for_sign_in` right before sending).
//   3. If it's missing, we prompt — Firebase requires the email to match the
//      one the link was generated for.
//   4. signInWithEmailLink consumes the oobCode and Firebase Auth restores
//      the session. Then we hand off to /library.
//
// If anyone lands here without a valid email-link in the URL, we redirect
// back to /login so they have a clear next step.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { auth } from '../config/firebase';

const STORAGE_KEY = 'wake_email_for_sign_in';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EmailLinkSignInScreen = () => {
  const navigate = useNavigate();
  // 'verifying' | 'needs_email' | 'signing_in' | 'error' | 'done'
  const [state, setState] = useState('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    const href = window.location.href;
    if (!isSignInWithEmailLink(auth, href)) {
      // No oobCode in URL — direct visit. Bounce to login.
      navigate('/login', { replace: true });
      return;
    }
    const stored = (() => {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (stored && EMAIL_RE.test(stored)) {
      completeSignIn(stored);
    } else {
      setState('needs_email');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeSignIn = async (email) => {
    setState('signing_in');
    setErrorMsg('');
    try {
      await signInWithEmailLink(auth, email, window.location.href);
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      setState('done');
      // window.location.replace clears the oobCode from history so the link
      // can't be re-used on back-button.
      window.location.replace('/app/library');
    } catch (err) {
      const code = err?.code || '';
      const msg =
        code === 'auth/invalid-action-code'
          ? 'Este enlace expiró o ya fue usado. Pedí uno nuevo desde /acceso.'
          : code === 'auth/invalid-email'
            ? 'Correo inválido.'
            : 'No pudimos entrar con este enlace. Pedí uno nuevo desde /acceso.';
      setErrorMsg(msg);
      setState('error');
    }
  };

  const submitEmail = (e) => {
    e.preventDefault();
    const trimmed = emailInput.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setErrorMsg('Ingresa un correo válido.');
      return;
    }
    completeSignIn(trimmed);
  };

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {state === 'verifying' || state === 'signing_in' || state === 'done' ? (
          <>
            <div style={styles.spinner} aria-hidden="true" />
            <h1 style={styles.title}>
              {state === 'done' ? 'Listo' : 'Verificando tu enlace'}
            </h1>
            <p style={styles.message}>
              {state === 'done' ? 'Abriendo tu cuenta…' : 'Un momento.'}
            </p>
          </>
        ) : state === 'needs_email' ? (
          <>
            <h1 style={styles.title}>Confirma tu correo</h1>
            <p style={styles.message}>
              Para entrar con este enlace necesitamos el correo al que lo enviamos.
            </p>
            <form onSubmit={submitEmail} style={styles.form}>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
                style={styles.input}
                required
              />
              {errorMsg ? <p style={styles.error}>{errorMsg}</p> : null}
              <button type="submit" style={styles.button}>
                Entrar
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 style={styles.title}>No pudimos entrar</h1>
            <p style={styles.message}>{errorMsg}</p>
            <a href="/acceso" style={styles.link}>Pedir un enlace nuevo</a>
          </>
        )}
      </div>
    </div>
  );
};

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
  spinner: {
    width: 28,
    height: 28,
    border: '2px solid rgba(255,255,255,0.15)',
    borderTopColor: 'rgba(255,255,255,0.85)',
    borderRadius: '50%',
    margin: '0 auto 20px',
    animation: 'wake-spin 0.9s linear infinite',
  },
  title: {
    fontSize: 22,
    fontWeight: 600,
    margin: '0 0 12px',
    letterSpacing: '-0.3px',
  },
  message: {
    fontSize: 15,
    lineHeight: 1.5,
    color: 'rgba(255,255,255,0.7)',
    margin: '0 0 20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginTop: 4,
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
  button: {
    padding: '12px 18px',
    borderRadius: 12,
    border: 'none',
    background: '#fff',
    color: '#1a1a1a',
    fontWeight: 600,
    fontSize: 15,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  error: {
    color: '#ff6b6b',
    fontSize: 13,
    margin: 0,
  },
  link: {
    color: 'rgba(255,255,255,0.85)',
    textDecoration: 'underline',
    fontSize: 14,
  },
};

if (typeof document !== 'undefined' && !document.getElementById('wake-spin-style')) {
  const s = document.createElement('style');
  s.id = 'wake-spin-style';
  s.textContent = '@keyframes wake-spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}

export default EmailLinkSignInScreen;
