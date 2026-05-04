import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
} from '../services/storefrontAuthService';
import './AuthModal.css';

const ANIM_MS = 220;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function mapAuthError(err) {
  const code = err?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Este correo ya tiene una cuenta. Inicia sesión.';
    case 'auth/invalid-email':
      return 'Correo inválido.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Correo o contraseña incorrectos.';
    case 'auth/user-not-found':
      return 'No encontramos una cuenta con ese correo.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null; // silent — user cancelled
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana. Permite los popups e intenta de nuevo.';
    case 'auth/network-request-failed':
      return 'Error de red. Intenta de nuevo.';
    default:
      return err?.message || 'Algo no funcionó. Intenta de nuevo.';
  }
}

export default function AuthModal({ open, onClose, onAuthenticated, title, subtitle }) {
  // Default to signup — storefront traffic is overwhelmingly first-time
  // buyers. Returning users flip to signin via the footer link.
  const [tab, setTab] = useState('signup'); // 'signup' | 'signin'
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [animating, setAnimating] = useState(false);
  // Mirror busy synchronously so a Tab/Esc that fires in the same tick as a
  // popup-open can't slip past the close-while-busy guard.
  const busyRef = useRef(false);
  const modalRef = useRef(null);
  const firstFocusRef = useRef(null);
  // Restore focus to the trigger when modal closes — basic a11y hygiene.
  const lastActiveElementRef = useRef(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    } else {
      setAnimating(false);
    }
  }, [open]);

  // iOS Safari scroll lock — `body { overflow: hidden }` doesn't actually stop
  // rubber-band scrolling on iOS. Pin the body to the current scroll position
  // so the page underneath can't move while the modal is open.
  useEffect(() => {
    if (!open) return undefined;
    const scrollY = window.scrollY;
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setEmailMode(false);
      setEmail('');
      setPassword('');
      setName('');
      setBusy(false);
      busyRef.current = false;
      setTab('signup');
      // Restore focus to whatever opened the modal.
      const last = lastActiveElementRef.current;
      if (last && typeof last.focus === 'function') {
        try { last.focus(); } catch { /* ignore */ }
      }
      lastActiveElementRef.current = null;
    } else {
      lastActiveElementRef.current = document.activeElement;
    }
  }, [open]);

  // Auto-focus the first interactive element after the modal opens, and trap
  // Tab so keyboard users can't tab out into the page underneath.
  useEffect(() => {
    if (!open) return undefined;
    const focusFirst = () => {
      const target =
        firstFocusRef.current ||
        modalRef.current?.querySelector(FOCUSABLE_SELECTOR);
      if (target && typeof target.focus === 'function') {
        try { target.focus(); } catch { /* ignore */ }
      }
    };
    // Defer one frame so the entrance animation has applied opacity/transform
    // and the element is actually focusable.
    const id = requestAnimationFrame(focusFirst);
    return () => cancelAnimationFrame(id);
  }, [open, emailMode, tab]);

  const handleClose = () => {
    if (busyRef.current) return;
    setAnimating(false);
    setTimeout(() => onClose?.(), ANIM_MS);
  };

  // Esc closes; Tab / Shift+Tab cycles within the modal.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key !== 'Tab' || !modalRef.current) return;
      const focusables = Array.from(
        modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const handle = async (fn) => {
    // Synchronous busy flip prevents a race where the close-button is still
    // active in the same tick that signInWithPopup is firing off.
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const user = await fn();
      if (user) onAuthenticated?.(user);
    } catch (err) {
      const msg = mapAuthError(err);
      if (msg !== null) setError(msg);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!open) return null;

  const submitEmail = (e) => {
    e.preventDefault();
    if (busy) return;
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Correo inválido.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (tab === 'signup') {
      handle(() => signUpWithEmail(trimmedEmail, password, name.trim() || null));
    } else {
      handle(() => signInWithEmail(trimmedEmail, password));
    }
  };

  return createPortal(
    <>
      <div
        className={`am-overlay ${animating ? 'is-open' : ''}`}
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        className={`am-modal ${animating ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="am-title"
      >
        <button
          type="button"
          className="am-close"
          onClick={handleClose}
          disabled={busy}
          aria-label="Cerrar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>

        <h2 id="am-title" className="am-title">{title || 'Continúa para comprar'}</h2>
        {subtitle ? <p className="am-subtitle">{subtitle}</p> : null}

        <div className="am-tabs" role="tablist" aria-label="Cuenta">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'signup'}
            className={`am-tab ${tab === 'signup' ? 'is-active' : ''}`}
            onClick={() => { setTab('signup'); setError(null); }}
            disabled={busy}
          >
            Crear cuenta
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'signin'}
            className={`am-tab ${tab === 'signin' ? 'is-active' : ''}`}
            onClick={() => { setTab('signin'); setError(null); }}
            disabled={busy}
          >
            Iniciar sesión
          </button>
        </div>

        {tab === 'signup' ? (
          <p className="am-explainer">
            Te creamos una cuenta de Wake para guardar tu compra y darte
            acceso al programa desde la app.
          </p>
        ) : null}

        {!emailMode ? (
          <div className="am-providers">
            <button
              ref={firstFocusRef}
              type="button"
              className="am-provider-btn"
              onClick={() => handle(signInWithGoogle)}
              disabled={busy}
            >
              <span className="am-provider-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 11v3.4h4.7c-.2 1.3-1.5 3.7-4.7 3.7-2.8 0-5.1-2.3-5.1-5.1S9.2 7.9 12 7.9c1.6 0 2.7.7 3.3 1.3l2.3-2.2C16.1 5.6 14.2 4.8 12 4.8c-4 0-7.2 3.2-7.2 7.2s3.2 7.2 7.2 7.2c4.2 0 6.9-2.9 6.9-7 0-.5 0-.8-.1-1.2H12z"/></svg>
              </span>
              {tab === 'signup' ? 'Crear cuenta con Google' : 'Continuar con Google'}
            </button>

            <button
              type="button"
              className="am-provider-btn"
              onClick={() => setEmailMode(true)}
              disabled={busy}
            >
              <span className="am-provider-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></svg>
              </span>
              {tab === 'signup' ? 'Crear cuenta con correo' : 'Continuar con correo'}
            </button>

            {error ? <p className="am-error" role="alert">{error}</p> : null}
          </div>
        ) : (
          <form className="am-email-form" onSubmit={submitEmail}>
            {tab === 'signup' ? (
              <input
                ref={firstFocusRef}
                type="text"
                className="am-input"
                placeholder="Nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={120}
                disabled={busy}
              />
            ) : null}

            <input
              ref={tab === 'signin' ? firstFocusRef : null}
              type="email"
              className="am-input"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={254}
              required
              disabled={busy}
            />

            <input
              type="password"
              className="am-input"
              placeholder={tab === 'signup' ? 'Crea una contraseña' : 'Contraseña'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              maxLength={128}
              disabled={busy}
            />

            {error ? <p className="am-error" role="alert">{error}</p> : null}

            <button type="submit" className="am-submit" disabled={busy}>
              {busy
                ? 'Procesando…'
                : tab === 'signup' ? 'Crear mi cuenta' : 'Iniciar sesión'}
            </button>

            <button
              type="button"
              className="am-back"
              onClick={() => { setEmailMode(false); setError(null); }}
              disabled={busy}
            >
              Otro método
            </button>
          </form>
        )}
      </div>
    </>,
    document.body
  );
}
