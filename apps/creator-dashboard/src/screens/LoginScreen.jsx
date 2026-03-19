import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';
import googleAuthService from '../services/googleAuthService';
import { ASSET_BASE } from '../config/assets';
import logger from '../utils/logger';
import './LoginScreen.css';

const LoginScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isCreator, webOnboardingCompleted, loading, userRole } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isLegalModalVisible, setIsLegalModalVisible] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (userRole === null) return;
    if (location.pathname !== '/login') return;

    const urlParams = new URLSearchParams(window.location.search);
    const redirectPath = urlParams.get('redirect');

    if (redirectPath) {
      try {
        const [path] = redirectPath.split('?');
        if (path && path !== '/login') {
          navigate(path, { replace: true });
          return;
        }
      } catch (e) {}
    }

    if (isCreator && webOnboardingCompleted !== null) {
      if (webOnboardingCompleted === false) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/lab', { replace: true });
      }
    } else if (!isCreator) {
      window.location.href = '/';
    }
  }, [user, loading, userRole, isCreator, webOnboardingCompleted, navigate, location.pathname]);

  const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const validatePassword = (v) => v.length >= 6;

  const clearErrors = () => {
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);
  };

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (emailError) setEmailError(null);
    if (formError) setFormError(null);
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (passwordError) setPasswordError(null);
    if (formError) setFormError(null);
  };

  const handleContinue = async () => {
    clearErrors();
    setShowForgotPassword(false);

    if (!email.trim()) { setEmailError('Ingresa tu correo'); return; }
    if (!validateEmail(email)) { setEmailError('Correo no válido'); return; }
    if (!password.trim()) { setPasswordError('Ingresa tu contraseña'); return; }
    if (!validatePassword(password)) { setPasswordError('Mínimo 6 caracteres'); return; }

    setIsLoading(true);
    try {
      await authService.signInUser(email, password);
      setTimeout(() => setIsLoading(false), 100);
    } catch (error) {
      setIsLoading(false);
      switch (error.code) {
        case 'auth/user-not-found':
          setEmailError('No hay cuenta con este correo');
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setFormError('Correo o contraseña incorrectos');
          setShowForgotPassword(true);
          break;
        case 'auth/invalid-email':
          setEmailError('Correo no válido');
          break;
        case 'auth/too-many-requests':
          setFormError('Demasiados intentos. Espera un momento e intenta de nuevo');
          break;
        default:
          setFormError('Algo salió mal. Intenta de nuevo');
      }
    }
  };

  const handleRegister = async () => {
    clearErrors();

    if (!email.trim()) { setEmailError('Ingresa tu correo'); return; }
    if (!validateEmail(email)) { setEmailError('Correo no válido'); return; }
    if (!password.trim()) { setPasswordError('Ingresa tu contraseña'); return; }
    if (!validatePassword(password)) { setPasswordError('Mínimo 6 caracteres'); return; }
    if (!acceptTerms) {
      setFormError('Acepta los términos para continuar');
      return;
    }

    setIsLoading(true);
    try {
      await authService.registerUser(email, password, email.split('@')[0]);
      setTimeout(() => setIsLoading(false), 100);
    } catch (error) {
      setIsLoading(false);
      switch (error.code) {
        case 'auth/email-already-in-use':
          setEmailError('Ya existe una cuenta con este correo');
          break;
        case 'auth/weak-password':
          setPasswordError('Contraseña muy débil. Usa al menos 6 caracteres');
          break;
        case 'auth/invalid-email':
          setEmailError('Correo no válido');
          break;
        default:
          setFormError('No pudimos crear tu cuenta. Intenta de nuevo');
      }
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    clearErrors();
    try {
      const result = await googleAuthService.signIn();
      if (result.success) {
        setTimeout(() => setIsLoading(false), 100);
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

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setEmailError('Ingresa tu correo primero');
      return;
    }
    if (!validateEmail(email)) {
      setEmailError('Ingresa un correo válido');
      return;
    }

    try {
      await authService.resetPassword(email);
      setForgotSent(true);
      setShowForgotPassword(false);
      setFormError(null);
    } catch (error) {
      logger.error('[LoginScreen] Password Reset Error:', error);
      setFormError('No pudimos enviar el correo. Intenta de nuevo');
    }
  };

  const switchMode = () => {
    setIsSignUp(!isSignUp);
    clearErrors();
    setShowForgotPassword(false);
    setForgotSent(false);
    setAcceptTerms(false);
  };

  const isFormValid = validateEmail(email) && validatePassword(password);

  return (
    <div className="ln-root">
      <div className="ln-card">
        {/* Logo */}
        <div className="ln-logo-wrap">
          <img
            src={`${ASSET_BASE}wake-logo-new.png`}
            alt="Wake"
            className="ln-logo"
          />
          <span className="ln-badge">Creadores</span>
        </div>

        {/* Title */}
        <h1 className="ln-title">
          {isSignUp ? 'Crear cuenta' : 'Bienvenido'}
        </h1>

        {/* Forgot sent confirmation */}
        {forgotSent && (
          <div className="ln-info-banner">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-2.5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1zm0-2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" fill="currentColor"/>
            </svg>
            Revisá tu bandeja (también spam). Te enviamos el enlace.
          </div>
        )}

        {/* Form error */}
        {formError && (
          <div className="ln-error-banner">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" fill="currentColor"/>
            </svg>
            {formError}
          </div>
        )}

        {/* Email */}
        <div className="ln-field-wrap">
          <input
            className={`ln-input${emailError ? ' ln-input--error' : ''}`}
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={handleEmailChange}
            autoComplete="email"
            disabled={isLoading}
          />
          {emailError && <p className="ln-field-error">{emailError}</p>}
        </div>

        {/* Password */}
        <div className="ln-field-wrap">
          <input
            className={`ln-input${passwordError ? ' ln-input--error' : ''}`}
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={handlePasswordChange}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            disabled={isLoading}
            onKeyDown={(e) => { if (e.key === 'Enter' && !isSignUp) handleContinue(); }}
          />
          {passwordError && <p className="ln-field-error">{passwordError}</p>}
        </div>

        {/* Terms (sign up only) */}
        {isSignUp && (
          <label className="ln-terms">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => {
                setAcceptTerms(e.target.checked);
                if (formError) setFormError(null);
              }}
              disabled={isLoading}
            />
            <span className="ln-terms-track">
              <span className="ln-terms-thumb" />
            </span>
            <span className="ln-terms-text">
              Acepto la{' '}
              <span className="ln-terms-link" onClick={() => setIsLegalModalVisible(true)}>
                política de privacidad
              </span>{' '}
              y los{' '}
              <span className="ln-terms-link" onClick={() => setIsLegalModalVisible(true)}>
                términos y condiciones
              </span>
            </span>
          </label>
        )}

        {/* Primary CTA */}
        <button
          className={`ln-btn-primary${isLoading ? ' ln-btn-primary--loading' : ''}`}
          onClick={isSignUp ? handleRegister : handleContinue}
          disabled={isLoading || (isSignUp ? (!isFormValid || !acceptTerms) : !isFormValid)}
        >
          {isLoading ? (
            <span className="ln-spinner" />
          ) : (
            isSignUp ? 'Crear cuenta' : 'Iniciar sesión'
          )}
        </button>

        {/* Forgot password link */}
        {showForgotPassword && !isSignUp && (
          <button className="ln-link-btn" onClick={handleForgotPassword}>
            ¿Olvidaste tu contraseña?
          </button>
        )}

        {/* Toggle mode */}
        <button className="ln-toggle" onClick={switchMode} disabled={isLoading}>
          {isSignUp ? '¿Ya tienes cuenta? ' : '¿Sin cuenta? '}
          <span className="ln-toggle-accent">
            {isSignUp ? 'Inicia sesión' : 'Créala gratis'}
          </span>
        </button>

        {/* Divider */}
        <div className="ln-divider">
          <span>o</span>
        </div>

        {/* Google */}
        <button
          className="ln-btn-google"
          onClick={handleGoogleLogin}
          disabled={isLoading}
        >
          <img
            src={`${ASSET_BASE}google-icon.png`}
            alt=""
            className="ln-google-icon"
          />
          Continuar con Google
        </button>
      </div>

      {/* Legal modal */}
      {isLegalModalVisible && (
        <div
          className="ln-modal-overlay"
          onClick={() => setIsLegalModalVisible(false)}
        >
          <div
            className="ln-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ln-modal-header">
              <h2 className="ln-modal-title">Documentos legales</h2>
              <button
                className="ln-modal-close"
                onClick={() => setIsLegalModalVisible(false)}
                aria-label="Cerrar"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="ln-modal-body">
              {[
                {
                  title: 'Términos y Condiciones',
                  href: 'https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/legal%2F1%20-%20TE%CC%81RMINOS%20Y%20CONDICIONES%20DE%20USO%20WAKE.pdf?alt=media&token=500e1ddd-c126-43ba-bb0d-e8b4e571b49c',
                  label: 'Ver Términos y Condiciones',
                },
                {
                  title: 'Política de Tratamiento de Datos',
                  href: 'https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/legal%2F2%20-%20POLI%CC%81TICA%20DE%20TRATAMIENTO%20DE%20DATOS%20PERSONALES%20WAKE.pdf?alt=media&token=5cd87b24-bb70-4daa-b2cf-16f31c46cef7',
                  label: 'Ver Política de Privacidad',
                },
                {
                  title: 'Política de Reembolsos',
                  href: 'https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/legal%2F3-%20POLI%CC%81TICA%20DE%20REEMBOLSOS%2C%20RETRACTO%20Y%20REVERSIO%CC%81N%20DE%20PAGO%20WAKE.pdf?alt=media&token=da5f7fe3-f699-46cb-8fd9-5e0da2e7efb6',
                  label: 'Ver Política de Reembolsos',
                },
              ].map((doc) => (
                <div key={doc.title} className="ln-modal-doc">
                  <p className="ln-modal-doc-title">{doc.title}</p>
                  <a
                    href={doc.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ln-modal-doc-link"
                  >
                    {doc.label}
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M3.5 1H11v7.5M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginScreen;
