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
import { buildAppUrl } from '../utils/basePath';

const STORAGE_KEY = 'wake_email_for_sign_in';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Validate `?next=` to a SAME-ORIGIN PATH ONLY (no query string). Reject
// anything with a scheme, protocol-relative URLs, backslash tricks, or
// query-string punctuation — accepting `https://evil.com` here would turn
// this screen into an open redirector on a freshly signed-in session,
// and `?` / `&` / `=` open the door to params we don't want to round-trip.
const NEXT_PATH_RE = /^\/[A-Za-z0-9/_.\-]{0,256}$/;

// Pull and validate the post-signin destination. Returns a path under /app
// or null when no safe next is present (caller falls back to /app/library).
function getValidatedNext() {
  try {
    const raw = new URLSearchParams(window.location.search).get('next');
    if (!raw) return null;
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('//') || decoded.includes('\\')) return null;
    if (!NEXT_PATH_RE.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

// Pull the email the link was generated for, baked in by the server in
// the continueUrl. Falls back to null when missing (older emails) and the
// caller will then consult localStorage or prompt.
function getEmailFromQuery() {
  try {
    const raw = new URLSearchParams(window.location.search).get('email');
    if (!raw) return null;
    const decoded = decodeURIComponent(raw).trim().toLowerCase();
    return EMAIL_RE.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

// Resolve the absolute redirect target for post-signin. Delegated to the
// shared basePath helper so App.web.js, WebAppNavigator, and this screen
// all agree on what the base prefix is for a given runtime.
function resolveAbsoluteRedirect(nextPath) {
  return buildAppUrl(nextPath);
}

const EmailLinkSignInScreen = () => {
  const navigate = useNavigate();
  // 'verifying' | 'needs_email' | 'signing_in' | 'error' | 'done'
  const [state, setState] = useState('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  // Tracks whether the failure is the "already used" case — those messages
  // need a softer copy because the buyer is most likely already inside.
  const [errorAlreadyUsed, setErrorAlreadyUsed] = useState(false);
  // Count completion attempts so we can distinguish "you typed the wrong
  // email" (first try) from "this code is genuinely used/expired" (second
  // try). Firebase returns the same error code in both cases.
  const [attemptCount, setAttemptCount] = useState(0);
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    const href = window.location.href;
    if (!isSignInWithEmailLink(auth, href)) {
      // No oobCode in URL — direct visit. Bounce to login.
      navigate('/login', { replace: true });
      return;
    }
    // Resolution priority:
    //   1. `?email=` baked into the link by the server (matches the address
    //      the oobCode was generated for — best signal).
    //   2. localStorage (set by /acceso when the same browser made the
    //      original magic-link request).
    //   3. Manual prompt.
    const queryEmail = getEmailFromQuery();
    const stored = (() => {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    const auto = queryEmail || (stored && EMAIL_RE.test(stored) ? stored.trim().toLowerCase() : null);
    if (auto) {
      completeSignIn(auto);
    } else {
      setState('needs_email');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeSignIn = async (email) => {
    setState('signing_in');
    setErrorMsg('');
    setErrorAlreadyUsed(false);
    setAttemptCount((c) => c + 1);
    try {
      await signInWithEmailLink(auth, email, window.location.href);
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      setState('done');
      // Honor `?next=` from the email-link continueUrl so confirmation emails
      // (and UnauthAccessGate's magic-link kick) deep-link to a specific
      // screen. The server validates and embeds `next` before it ever reaches
      // this URL, so we just trust the parsed value here.
      // window.location.replace clears the oobCode from history so the link
      // can't be re-used on back-button.
      const next = getValidatedNext() || '/library';
      window.location.replace(resolveAbsoluteRedirect(next));
    } catch (err) {
      const code = err?.code || '';
      // If the user is already signed in (e.g. they clicked the link twice
      // after a successful first sign-in), the second invalid-action-code
      // failure is harmless — treat it as success and redirect them through
      // instead of showing an alarming "ya lo usaste" page.
      if (code === 'auth/invalid-action-code' && auth.currentUser) {
        setState('done');
        const next = getValidatedNext() || '/library';
        window.location.replace(resolveAbsoluteRedirect(next));
        return;
      }
      // Firebase returns auth/invalid-action-code for BOTH wrong-email-on-
      // first-attempt AND genuinely-consumed codes. Branch on attempt:
      // first failure most likely means the typed/stored email doesn't
      // match the one the link was generated for; later failures are the
      // genuine "used or expired" case.
      if (code === 'auth/invalid-action-code') {
        if (attemptCount === 0) {
          setErrorMsg('El correo no coincide con el del enlace. Probá con el mismo correo que usaste al recibirlo.');
          setState('needs_email');
          return;
        }
        setErrorAlreadyUsed(true);
        setErrorMsg('Este enlace es de un solo uso y ya lo usaste. Si ya estás dentro, abrí Wake desde la pantalla de inicio.');
      } else if (code === 'auth/expired-action-code') {
        setErrorMsg('El enlace expiró. Pedí uno nuevo desde /acceso.');
      } else if (code === 'auth/invalid-email') {
        setErrorMsg('Correo inválido.');
      } else {
        setErrorMsg('No pudimos entrar con este enlace. Pedí uno nuevo desde /acceso.');
      }
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
    // Compare against ?email= when present — catches the "buyer typed
    // the wrong email" case BEFORE we burn the oobCode. Firebase would
    // otherwise return auth/invalid-action-code on the wrong-email
    // attempt, which both consumes the code AND is indistinguishable
    // from "already used."
    const expected = getEmailFromQuery();
    if (expected && expected !== trimmed) {
      setErrorMsg('El correo no coincide con el del enlace. Usá el mismo correo al que recibiste el email.');
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
            <h1 style={styles.title}>{errorAlreadyUsed ? 'Enlace ya usado' : 'No pudimos entrar'}</h1>
            <p style={styles.message}>{errorMsg}</p>
            <a href="/acceso" style={styles.link}>
              {errorAlreadyUsed ? 'Pedir uno nuevo solo si no estás dentro' : 'Pedir un enlace nuevo'}
            </a>
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
