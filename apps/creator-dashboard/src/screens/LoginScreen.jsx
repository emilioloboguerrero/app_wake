import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import { signInWithCustomToken } from 'firebase/auth';
import authService from '../services/authService';
import googleAuthService from '../services/googleAuthService';
import { ASSET_BASE } from '../config/assets';
import logger from '../utils/logger';
import { recordLoginMethod, getLastLoginMethod } from '../utils/lastLoginMethod';
import './LoginScreen.css';

const HERO_IMAGE = `${ASSET_BASE}IMG_4441.JPG`;

// Same-origin API base (creators served from wakelab.co/creators → /api/v1).
const API_BASE = '/api/v1';

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="ln-google-icon" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
  </svg>
);

const LoginScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isCreator, webOnboardingCompleted, profileCompleted, loading, userRole, authError } = useAuth();

  // Email + code — the only password-free door (mirror of the PWA login).
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState(null);

  const [isLoading, setIsLoading] = useState(false); // Google
  const [formError, setFormError] = useState(null);

  // Nudge the returning creator toward the door they already used (per-device),
  // so they don't pick a different provider and split into a second account.
  const [lastMethod, setLastMethod] = useState(null);
  useEffect(() => {
    setLastMethod(getLastLoginMethod().method);
  }, []);

  // Redirect logic for logged-in users
  useEffect(() => {
    if (loading || !user) return;
    if (userRole === null) return;
    if (location.pathname !== '/login') return;

    const urlParams = new URLSearchParams(window.location.search);
    const redirectPath = urlParams.get('redirect');

    if (redirectPath) {
      try {
        const [path] = redirectPath.split('?');
        if (path && path.startsWith('/') && !path.startsWith('//') && path !== '/login') {
          navigate(path, { replace: true });
          return;
        }
      } catch { /* invalid redirect param, ignore */ }
    }

    if (authError) {
      setFormError(authError);
      return;
    }

    if (isCreator && webOnboardingCompleted !== null) {
      if (webOnboardingCompleted === false) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/lab', { replace: true });
      }
    } else if (user && userRole && !isCreator) {
      if (!profileCompleted) {
        navigate('/complete-profile', { replace: true });
      } else {
        setFormError('Esta cuenta no tiene permisos de creador.');
        authService.signOutUser().catch(() => {});
      }
    }
  }, [user, loading, userRole, isCreator, profileCompleted, webOnboardingCompleted, authError, navigate, location.pathname]);

  const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (emailError) setEmailError(null);
    if (formError) setFormError(null);
  };

  // ─── Email code ────────────────────────────────────────
  const handleSendCode = async (emailOverride) => {
    setOtpError(null);
    setFormError(null);
    const trimmed = ((typeof emailOverride === 'string' ? emailOverride : email) || '').trim().toLowerCase();
    if (!validateEmail(trimmed)) {
      setEmailError('Ingresa un correo válido');
      return;
    }
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/email-code/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) throw new Error('request failed');
      setEmail(trimmed);
      setOtpSent(true);
    } catch {
      setOtpError('No pudimos enviar el código. Intenta de nuevo.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setOtpError(null);
    const trimmed = (email || '').trim().toLowerCase();
    const c = (otpCode || '').trim();
    if (!/^\d{6}$/.test(c)) {
      setOtpError('El código son 6 dígitos.');
      return;
    }
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/email-code/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, code: c }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data?.token) {
        setOtpError(json?.error?.message || 'Código incorrecto o expirado.');
        setOtpLoading(false);
        return;
      }
      await signInWithCustomToken(auth, json.data.token);
      recordLoginMethod('email', trimmed);
      // The redirect effect routes once AuthContext picks up the session.
    } catch {
      setOtpError('No pudimos verificar el código. Intenta de nuevo.');
      setOtpLoading(false);
    }
  };

  // ─── Google ────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setFormError(null);
    setIsLoading(true);
    try {
      const result = await googleAuthService.signIn();

      // Email already has an account (one-account-per-email): route to the code
      // flow for that account instead of spawning a Google duplicate.
      if (result.needsCode) {
        setIsLoading(false);
        const e = (result.email || '').trim().toLowerCase();
        if (e) setEmail(e);
        handleSendCode(e);
        return;
      }

      if (result.success) {
        recordLoginMethod('google', result.user?.email);
        setTimeout(() => setIsLoading(false), 100);
        // The redirect effect handles routing.
      } else {
        setFormError(result.error || 'Error al conectar con Google');
        setIsLoading(false);
      }
    } catch (error) {
      logger.error('[LoginScreen] Google Sign-In Error:', error);
      setFormError('Error al conectar con Google');
      setIsLoading(false);
    }
  };

  return (
    <div className="ln-root">
      {/* ── Left Column: Form ── */}
      <section className="ln-form-col">
        <div className="ln-form-inner">
          {/* Logo */}
          <div className="ln-logo-wrap ln-animate ln-delay-1">
            <img
              src={`${ASSET_BASE}wake-logo-new.png`}
              alt="Wake"
              className="ln-logo"
            />
            <span className="ln-badge">Creadores</span>
          </div>

          {/* Form error */}
          {formError && (
            <div className="ln-error-banner ln-animate ln-delay-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" fill="currentColor"/>
              </svg>
              {formError}
            </div>
          )}

          {!otpSent ? (
            <>
              <div className="ln-field-wrap ln-animate ln-delay-3">
                <label className="ln-field-label">Email</label>
                <div className={`ln-glass-input${emailError ? ' ln-glass-input--error' : ''}`}>
                  <input
                    className="ln-glass-field"
                    type="email"
                    placeholder="tu@correo.com"
                    value={email}
                    onChange={handleEmailChange}
                    autoComplete="email"
                    disabled={otpLoading}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode(); }}
                  />
                </div>
                {emailError && <p className="ln-field-error">{emailError}</p>}
              </div>

              <button
                className="ln-btn-primary ln-btn-relative ln-animate ln-delay-4"
                onClick={() => handleSendCode()}
                disabled={otpLoading || !validateEmail(email)}
              >
                {lastMethod === 'email' && <span className="ln-last-badge">Última vez</span>}
                {otpLoading ? <span className="ln-spinner" /> : 'Continuar con mi correo'}
              </button>

              <div className="ln-divider ln-animate ln-delay-5">
                <span className="ln-divider-line" />
                <span className="ln-divider-text">o continúa con</span>
                <span className="ln-divider-line" />
              </div>

              <button
                className="ln-btn-google ln-btn-relative ln-animate ln-delay-6"
                onClick={handleGoogleLogin}
                disabled={isLoading}
              >
                {lastMethod === 'google' && <span className="ln-last-badge">Última vez</span>}
                <GoogleIcon />
                Continúa con Google
              </button>

              <p className="ln-terms ln-animate ln-delay-7">
                Al continuar aceptas nuestros Términos y la Política de privacidad.
              </p>
            </>
          ) : (
            <div className="ln-code-box ln-animate">
              <h2 className="ln-code-title">Revisa tu correo</h2>
              <p className="ln-code-hint">
                Escribe el código de 6 dígitos que enviamos a<br />
                <span className="ln-code-email">{(email || '').trim().toLowerCase()}</span>
              </p>
              <input
                className="ln-code-input"
                value={otpCode}
                onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (otpError) setOtpError(null); }}
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                autoComplete="one-time-code"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && otpCode.length === 6) handleVerifyCode(); }}
              />
              {otpError && <p className="ln-code-error">{otpError}</p>}
              <button
                className="ln-btn-primary"
                onClick={handleVerifyCode}
                disabled={otpLoading || otpCode.length !== 6}
              >
                {otpLoading ? <span className="ln-spinner" /> : 'Entrar'}
              </button>
              <div className="ln-code-actions">
                <button
                  className="ln-forgot-btn"
                  onClick={() => { setOtpSent(false); setOtpCode(''); setOtpError(null); }}
                  disabled={otpLoading}
                >
                  Cambiar correo
                </button>
                <button className="ln-forgot-btn" onClick={() => handleSendCode()} disabled={otpLoading}>
                  Reenviar código
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Right Column: Hero ── */}
      <section className="ln-hero-col">
        <div
          className="ln-hero-image"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        >
          <div className="ln-hero-overlay" />
        </div>
      </section>
    </div>
  );
};

export default LoginScreen;
