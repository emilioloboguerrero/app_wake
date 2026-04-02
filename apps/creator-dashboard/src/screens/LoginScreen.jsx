import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import authService from '../services/authService';
import googleAuthService from '../services/googleAuthService';
import apiClient from '../utils/apiClient';
import { InlineError } from '../components/ui/ErrorStates';
import { ASSET_BASE } from '../config/assets';
import logger from '../utils/logger';
import './LoginScreen.css';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1642615835477-d303d7dc9ee9?w=2160&q=80';

const TESTIMONIALS = [
  {
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    name: 'Valentina R.',
    handle: '@valfit_co',
    text: 'Wake me permitio organizar todos mis programas y clientes en un solo lugar. Mis atletas lo aman.',
  },
  {
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    name: 'Andres M.',
    handle: '@andres.coach',
    text: 'Desde que uso Wake, mis clientes tienen mejor adherencia. La experiencia es increible.',
  },
  {
    avatar: 'https://randomuser.me/api/portraits/women/68.jpg',
    name: 'Camila S.',
    handle: '@cami.wellness',
    text: 'Simple, bonito y funcional. Exactamente lo que necesitaba para escalar mi negocio fitness.',
  },
];

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="ln-google-icon" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
  </svg>
);

const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const TestimonialCard = ({ testimonial }) => (
  <div className="ln-testimonial-card">
    <img src={testimonial.avatar} alt="" className="ln-testimonial-avatar" />
    <div className="ln-testimonial-body">
      <div className="ln-testimonial-name">{testimonial.name}</div>
      <div className="ln-testimonial-handle">{testimonial.handle}</div>
      <div className="ln-testimonial-text">{testimonial.text}</div>
    </div>
  </div>
);

const LoginScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isCreator, webOnboardingCompleted, loading, userRole, authError, refreshUserData } = useAuth();
  const { showToast } = useToast();

  const [mode, setMode] = useState('login');
  const isSigningUpRef = useRef(false);

  // Login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Signup fields
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupShowPassword, setSignupShowPassword] = useState(false);
  const [signupErrors, setSignupErrors] = useState({});

  // Redirect logic for logged-in users
  useEffect(() => {
    if (loading || !user) return;
    if (userRole === null) return;
    if (location.pathname !== '/login') return;
    if (isSigningUpRef.current) return;

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
      setIsLoading(false);
      return;
    }

    if (isCreator && webOnboardingCompleted !== null) {
      if (webOnboardingCompleted === false) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/lab', { replace: true });
      }
    } else if (user && userRole && !isCreator) {
      setFormError('Esta cuenta no tiene permisos de creador.');
      setIsLoading(false);
      authService.signOutUser().catch(() => {});
    }
  }, [user, loading, userRole, isCreator, webOnboardingCompleted, authError, navigate, location.pathname]);

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

  // ─── Login ─────────────────────────────────────────────
  const handleContinue = async () => {
    clearErrors();
    setShowForgotPassword(false);

    if (!email.trim()) { setEmailError('Ingresa tu correo'); return; }
    if (!validateEmail(email)) { setEmailError('Correo no valido'); return; }
    if (!password.trim()) { setPasswordError('Ingresa tu contraseña'); return; }
    if (!validatePassword(password)) { setPasswordError('Minimo 6 caracteres'); return; }

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
          setPasswordError('Email o contraseña incorrectos.');
          setShowForgotPassword(true);
          break;
        case 'auth/invalid-email':
          setEmailError('Correo no valido');
          break;
        case 'auth/user-disabled':
          setPasswordError('Esta cuenta ha sido deshabilitada. Contacta soporte.');
          break;
        case 'auth/network-request-failed':
          showToast('No pudimos conectar con el servidor. Revisa tu conexion.', 'error');
          break;
        case 'auth/too-many-requests':
          setFormError('Demasiados intentos. Espera un momento e intenta de nuevo');
          break;
        default:
          logger.error('[LoginScreen] Unhandled login error:', error?.code, error?.message, error);
          setFormError('Algo salio mal. Intenta de nuevo');
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
    if (!email.trim()) { setEmailError('Ingresa tu correo primero'); return; }
    if (!validateEmail(email)) { setEmailError('Ingresa un correo valido'); return; }

    setIsLoading(true);
    try {
      await authService.resetPassword(email);
      setForgotSent(true);
      setShowForgotPassword(false);
      setFormError(null);
    } catch (error) {
      logger.error('[LoginScreen] Password Reset Error:', error);
      setFormError('No pudimos enviar el correo. Intenta de nuevo');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Signup ────────────────────────────────────────────
  const handleSignup = async () => {
    setFormError(null);
    const errors = {};
    if (!signupName.trim()) errors.name = 'Nombre es requerido';
    if (!signupEmail.trim() || !validateEmail(signupEmail)) errors.email = 'Correo no valido';
    if (!signupPassword || signupPassword.length < 6) errors.password = 'Minimo 6 caracteres';
    if (Object.keys(errors).length > 0) { setSignupErrors(errors); return; }

    setIsLoading(true);
    isSigningUpRef.current = true;
    try {
      await authService.registerUser(signupEmail, signupPassword, signupName);
      navigate('/complete-profile', { replace: true });
    } catch (error) {
      setIsLoading(false);
      isSigningUpRef.current = false;
      if (error.code === 'auth/email-already-in-use') {
        setSignupErrors({ email: 'Ya existe una cuenta con este correo' });
      } else {
        logger.error('[LoginScreen] Signup error:', error);
        setFormError(error.message || 'Algo salio mal. Intenta de nuevo');
      }
    }
  };

  // ─── Google signup ─────────────────────────────────────
  const handleGoogleSignup = async () => {
    setIsLoading(true);
    clearErrors();
    setFormError(null);
    isSigningUpRef.current = true;
    try {
      const result = await googleAuthService.signIn();
      if (result.success) {
        // Check if already a creator — if so, let normal redirect handle it
        try {
          const { data } = await apiClient.get('/users/me');
          if (data.role === 'creator' || data.role === 'admin') {
            isSigningUpRef.current = false;
            await refreshUserData();
            return;
          }
        } catch { /* new user or error, proceed to profile completion */ }
        navigate('/complete-profile', { replace: true });
      } else {
        isSigningUpRef.current = false;
        setFormError(result.error || 'Error al conectar con Google');
        setIsLoading(false);
      }
    } catch (error) {
      isSigningUpRef.current = false;
      logger.error('[LoginScreen] Google Sign-Up Error:', error);
      setFormError('Error al conectar con Google');
      setIsLoading(false);
    }
  };

  const isFormValid = validateEmail(email) && validatePassword(password);

  const switchMode = (newMode) => {
    setMode(newMode);
    setFormError(null);
    setSignupErrors({});
    clearErrors();
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

          {/* Mode toggle */}
          <div className="ln-mode-toggle ln-animate ln-delay-2">
            <button
              className={`ln-mode-btn${mode === 'login' ? ' ln-mode-btn--active' : ''}`}
              onClick={() => switchMode('login')}
              disabled={isLoading}
            >
              Iniciar sesion
            </button>
            <button
              className={`ln-mode-btn${mode === 'signup' ? ' ln-mode-btn--active' : ''}`}
              onClick={() => switchMode('signup')}
              disabled={isLoading}
            >
              Crear cuenta
            </button>
          </div>

          {/* Forgot sent confirmation */}
          {forgotSent && mode === 'login' && (
            <div className="ln-info-banner">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-2.5a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1zm0-2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" fill="currentColor"/>
              </svg>
              Revisa tu bandeja (tambien spam). Te enviamos el enlace.
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

          {/* ─── LOGIN MODE ─── */}
          {mode === 'login' && (
            <>
              <div className="ln-field-wrap ln-animate ln-delay-4">
                <label className="ln-field-label">Email</label>
                <div className={`ln-glass-input${emailError ? ' ln-glass-input--error' : ''}`}>
                  <input
                    className="ln-glass-field"
                    type="email"
                    placeholder="tu@correo.com"
                    value={email}
                    onChange={handleEmailChange}
                    autoComplete="email"
                    disabled={isLoading}
                  />
                </div>
                <InlineError message={emailError} field="email" />
              </div>

              <div className="ln-field-wrap ln-animate ln-delay-5">
                <label className="ln-field-label">Contraseña</label>
                <div className={`ln-glass-input${passwordError ? ' ln-glass-input--error' : ''}`}>
                  <div className="ln-password-wrap">
                    <input
                      className="ln-glass-field"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Ingresa tu contraseña"
                      value={password}
                      onChange={handlePasswordChange}
                      autoComplete="current-password"
                      disabled={isLoading}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleContinue(); }}
                    />
                    <button
                      type="button"
                      className="ln-eye-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
                <InlineError message={passwordError} field="password" />
              </div>

              <div className="ln-row-between ln-animate ln-delay-6">
                {showForgotPassword ? (
                  <button className="ln-forgot-btn" onClick={handleForgotPassword}>
                    Recuperar contraseña
                  </button>
                ) : (
                  <button className="ln-forgot-btn" onClick={() => {
                    if (email.trim()) handleForgotPassword();
                    else setEmailError('Ingresa tu correo primero');
                  }}>
                    Olvidaste tu contraseña?
                  </button>
                )}
              </div>

              <button
                className={`ln-btn-primary ln-animate ln-delay-7${isLoading ? ' ln-btn-primary--loading' : ''}`}
                onClick={handleContinue}
                disabled={isLoading || !isFormValid}
              >
                {isLoading ? <span className="ln-spinner" /> : 'Entrar'}
              </button>

              <div className="ln-divider ln-animate ln-delay-8">
                <span className="ln-divider-line" />
                <span className="ln-divider-text">o continua con</span>
                <span className="ln-divider-line" />
              </div>

              <button
                className="ln-btn-google ln-animate ln-delay-9"
                onClick={handleGoogleLogin}
                disabled={isLoading}
              >
                <GoogleIcon />
                Continuar con Google
              </button>
            </>
          )}

          {/* ─── SIGNUP MODE ─── */}
          {mode === 'signup' && (
            <>
              <div className="ln-field-wrap ln-animate ln-delay-3">
                <label className="ln-field-label">Nombre completo</label>
                <div className={`ln-glass-input${signupErrors.name ? ' ln-glass-input--error' : ''}`}>
                  <input
                    className="ln-glass-field"
                    type="text"
                    placeholder="Tu nombre"
                    value={signupName}
                    onChange={(e) => { setSignupName(e.target.value); setSignupErrors(prev => { const n = { ...prev }; delete n.name; return n; }); }}
                    disabled={isLoading}
                  />
                </div>
                <InlineError message={signupErrors.name} field="name" />
              </div>

              <div className="ln-field-wrap ln-animate ln-delay-4">
                <label className="ln-field-label">Email</label>
                <div className={`ln-glass-input${signupErrors.email ? ' ln-glass-input--error' : ''}`}>
                  <input
                    className="ln-glass-field"
                    type="email"
                    placeholder="tu@correo.com"
                    value={signupEmail}
                    onChange={(e) => { setSignupEmail(e.target.value); setSignupErrors(prev => { const n = { ...prev }; delete n.email; return n; }); }}
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>
                <InlineError message={signupErrors.email} field="signup-email" />
              </div>

              <div className="ln-field-wrap ln-animate ln-delay-5">
                <label className="ln-field-label">Contraseña</label>
                <div className={`ln-glass-input${signupErrors.password ? ' ln-glass-input--error' : ''}`}>
                  <div className="ln-password-wrap">
                    <input
                      className="ln-glass-field"
                      type={signupShowPassword ? 'text' : 'password'}
                      placeholder="Minimo 6 caracteres"
                      value={signupPassword}
                      onChange={(e) => { setSignupPassword(e.target.value); setSignupErrors(prev => { const n = { ...prev }; delete n.password; return n; }); }}
                      disabled={isLoading}
                      autoComplete="new-password"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSignup(); }}
                    />
                    <button
                      type="button"
                      className="ln-eye-btn"
                      onClick={() => setSignupShowPassword(!signupShowPassword)}
                      tabIndex={-1}
                    >
                      {signupShowPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
                <InlineError message={signupErrors.password} field="signup-password" />
              </div>

              <button
                className={`ln-btn-primary ln-animate ln-delay-6${isLoading ? ' ln-btn-primary--loading' : ''}`}
                onClick={handleSignup}
                disabled={isLoading}
              >
                {isLoading ? <span className="ln-spinner" /> : 'Crear cuenta'}
              </button>

              <div className="ln-divider ln-animate ln-delay-7">
                <span className="ln-divider-line" />
                <span className="ln-divider-text">o continua con</span>
                <span className="ln-divider-line" />
              </div>

              <button
                className="ln-btn-google ln-animate ln-delay-8"
                onClick={handleGoogleSignup}
                disabled={isLoading}
              >
                <GoogleIcon />
                Registrarse con Google
              </button>
            </>
          )}
        </div>
      </section>

      {/* ── Right Column: Hero + Testimonials ── */}
      <section className="ln-hero-col">
        <div
          className="ln-hero-image"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        >
          <div className="ln-hero-overlay" />
        </div>
        <div className="ln-testimonials">
          {TESTIMONIALS.map((t, i) => (
            <TestimonialCard key={i} testimonial={t} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default LoginScreen;
