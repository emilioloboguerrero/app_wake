import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Input from '../components/Input';
import Button from '../components/Button';
import authService from '../services/authService';
import googleAuthService from '../services/googleAuthService';
import { handleAutoLoginFromToken } from '../utils/autoLogin';
import { ASSET_BASE } from '../config/assets';
import './LoginScreen.css';

const LoginScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isCreator, webOnboardingCompleted, loading, userRole } = useAuth();

  useEffect(() => {
    console.log('[LoginScreen] mounted', {
      pathname: location.pathname,
      windowPath: window.location.pathname,
      search: location.search,
      loading,
      hasUser: !!user,
      userRole,
    });
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [autoLoginInProgress, setAutoLoginInProgress] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isLegalModalVisible, setIsLegalModalVisible] = useState(false);

  // Attempt auto-login if token is present in URL
  useEffect(() => {
    // Skip if already in progress or user is logged in
    if (autoLoginInProgress || user) return;
    
    const urlParams = new URLSearchParams(location.search);
    const redirectPath = urlParams.get('redirect');
    
    // Check for token in redirect parameter (from ProtectedRoute) or directly in URL
    let token = urlParams.get('token');
    let fromApp = urlParams.get('fromApp') === 'true';
    
    // If token is in redirect parameter, parse it
    if (!token && redirectPath) {
      const redirectParams = new URLSearchParams(redirectPath.split('?')[1] || '');
      token = redirectParams.get('token');
      fromApp = redirectParams.get('fromApp') === 'true' || fromApp;
    }

    // Only attempt auto-login if we have a token and came from app
    if (token && fromApp) {
      console.log('🔍 LoginScreen: Attempting auto-login from token...');
      setAutoLoginInProgress(true);

      handleAutoLoginFromToken(token)
        .then((success) => {
          if (success) {
            console.log('✅ LoginScreen: Auto-login successful');
            // Redirect will be handled by the next useEffect when user state updates
          } else {
            console.warn('⚠️ LoginScreen: Auto-login failed, showing login form');
            setAutoLoginInProgress(false);
          }
        })
        .catch((error) => {
          console.error('❌ LoginScreen: Auto-login error:', error);
          setAutoLoginInProgress(false);
        });
    }
  }, [location.search, user]);

  // Redirect logged-in users away from login page - wait for role to load
  useEffect(() => {
    // Don't redirect if still loading or no user
    if (loading || !user) return;
    
    // Wait for userRole to be loaded (not null) before redirecting
    if (userRole === null) return;
    
    // Only redirect if we're on the login page (use location.pathname - relative to basename /creators)
    const currentPath = location.pathname;
    if (currentPath !== '/login') {
      console.log('[LoginScreen] Skip redirect: not on login route', { currentPath, windowPath: window.location.pathname });
      return;
    }

    console.log('[LoginScreen] Redirecting logged-in user', { 
      userRole, 
      isCreator, 
      webOnboardingCompleted 
    });

    // Check for redirect parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const redirectPath = urlParams.get('redirect');
    
    if (redirectPath) {
      try {
        const [path] = redirectPath.split('?');
        if (path && path !== '/login') {
          navigate(path, { replace: true });
          return;
        }
      } catch (e) {
        // Ignore errors
      }
    }

    // Default redirect based on role
    // Admins and creators should go to creator pages
    if (isCreator && webOnboardingCompleted !== null) {
      if (webOnboardingCompleted === false) {
        navigate('/onboarding', { replace: true });
      } else if (webOnboardingCompleted === true) {
        navigate('/lab', { replace: true });
      }
    } else if (!isCreator) {
      // Regular users: creator dashboard is for creators only. Redirect to PWA.
      console.log('[LoginScreen] User is not creator, redirecting to PWA');
      window.location.href = '/';
    }
  }, [user, loading, userRole, isCreator, webOnboardingCompleted, navigate, location.pathname]);

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password) => {
    return password.length >= 6;
  };

  const handleEmailChange = (e) => {
    const text = e.target.value;
    setEmail(text);
    if (emailError) {
      setEmailError(null);
    }
  };

  const handlePasswordChange = (e) => {
    const text = e.target.value;
    setPassword(text);
    if (passwordError) {
      setPasswordError(null);
    }
  };

  const handleContinue = async () => {
    setEmailError(null);
    setPasswordError(null);
    setShowForgotPassword(false);

    if (!email.trim()) {
      setEmailError('Por favor ingresa tu correo electrónico');
      return;
    }

    if (!validateEmail(email)) {
      setEmailError('Correo no válido');
      return;
    }

    if (!password.trim()) {
      setPasswordError('Por favor ingresa tu contraseña');
      return;
    }

    if (!validatePassword(password)) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setIsLoading(true);
    console.log('[LoginScreen] signIn: attempting email/password login', { email: email.replace(/(.{2}).*(@.*)/, '$1***$2') });
    try {
      await authService.signInUser(email, password);
      console.log('[LoginScreen] signIn: success, waiting for AuthContext redirect');
      // AuthContext will automatically fetch user role and handle redirect
      setTimeout(() => {
        setIsLoading(false);
      }, 100);
    } catch (error) {
      console.error('[LoginScreen] signIn: error', { code: error?.code, message: error?.message });
      setIsLoading(false);
      
      // Handle specific Firebase errors
      let errorMessage = 'Ocurrió un error. Por favor intenta de nuevo.';
      
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'No encontramos una cuenta con este correo electrónico.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Contraseña incorrecta';
          setShowForgotPassword(true);
          break;
        case 'auth/invalid-credential':
          errorMessage = 'Correo o contraseña incorrectos';
          setShowForgotPassword(true);
          break;
        case 'auth/invalid-email':
          errorMessage = 'Correo electrónico no válido';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Demasiados intentos fallidos. Intenta más tarde';
          break;
      }
      
      alert(errorMessage);
    }
  };

  const handleRegister = async () => {
    setEmailError(null);
    setPasswordError(null);
    setShowForgotPassword(false);

    if (!email.trim()) {
      setEmailError('Por favor ingresa tu correo electrónico');
      return;
    }

    if (!validateEmail(email)) {
      setEmailError('Correo no válido');
      return;
    }

    if (!password.trim()) {
      setPasswordError('Por favor ingresa tu contraseña');
      return;
    }

    if (!validatePassword(password)) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    // Validate terms acceptance
    if (!acceptTerms) {
      alert('Debes aceptar la política de privacidad y los términos y condiciones para continuar.');
      return;
    }

    setIsLoading(true);
    console.log('[LoginScreen] register: attempting account creation', { email: email.replace(/(.{2}).*(@.*)/, '$1***$2') });
    try {
      const initialDisplayName = email.split('@')[0];
      await authService.registerUser(email, password, initialDisplayName);
      console.log('[LoginScreen] register: success, waiting for AuthContext redirect');
      // AuthContext will automatically fetch user role and handle redirect
      setTimeout(() => {
        setIsLoading(false);
      }, 100);
    } catch (error) {
      console.error('[LoginScreen] register: error', { code: error?.code, message: error?.message });
      setIsLoading(false);
      
      // Handle specific Firebase errors
      let errorMessage = 'Ocurrió un error al crear la cuenta. Por favor intenta de nuevo.';
      
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Ya existe una cuenta con este correo electrónico';
          break;
        case 'auth/weak-password':
          errorMessage = 'La contraseña es muy débil. Usa al menos 6 caracteres';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Correo electrónico no válido';
          break;
      }
      
      alert(errorMessage);
    }
  };


  const handleGoogleLogin = async () => {
    setIsLoading(true);
    console.log('[LoginScreen] Google: attempting sign-in');
    try {
      const result = await googleAuthService.signIn();
      console.log('[LoginScreen] Google: result', { success: result.success, error: result?.error });
      if (result.success) {
        // AuthContext will automatically fetch user role and handle redirect
        // Wait a moment for AuthContext to update, then let useEffect handle redirect
        setTimeout(() => {
          setIsLoading(false);
        }, 100);
      } else {
        alert(result.error || 'Error al iniciar sesión con Google');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      alert('Error al iniciar sesión con Google');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      alert('Por favor ingresa tu correo electrónico primero');
      return;
    }

    if (!validateEmail(email)) {
      alert('Por favor ingresa un correo electrónico válido');
      return;
    }

    try {
      await authService.resetPassword(email);
      alert('Revisa tu correo (spam). Puede estar en la carpeta de spam.');
    } catch (error) {
      console.error('Password Reset Error:', error);
      alert('Error al enviar el email de recuperación');
    }
  };

  const isFormValid = validateEmail(email) && validatePassword(password);

  // Show loading while auto-login is in progress
  if (autoLoginInProgress) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a1a',
        color: '#ffffff'
      }}>
        <div style={{ textAlign: 'center' }}>
          <p>Iniciando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-content">
        {/* WAKE Logo */}
        <div className="logo-container">
          <img 
            src={`${ASSET_BASE}wake-logo-new.png`}
            alt="Wake Logo" 
            className="logo"
          />
          <p className="login-subtitle">Creadores</p>
        </div>

        {/* Welcome Text */}
        <h1 className="welcome-text">
          {isSignUp ? "Crear Cuenta" : "Inicio"}
        </h1>

        {/* Email Input */}
        <Input
          placeholder="Correo electrónico"
          value={email}
          onChange={handleEmailChange}
          type="email"
          error={emailError}
        />

        {/* Password Input */}
        <Input
          placeholder="Contraseña"
          value={password}
          onChange={handlePasswordChange}
          type="password"
          error={passwordError}
        />

        {/* Terms and Conditions Agreement - Only show during signup */}
        {isSignUp && (
          <div className="terms-container">
            <div className="terms-row">
              <label className="terms-switch">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                />
                <span className="terms-slider"></span>
              </label>
              <div className="terms-text-container">
                <span className="terms-text">
                  Acepto la{' '}
                  <span 
                    className="terms-link"
                    onClick={() => setIsLegalModalVisible(true)}
                  >
                    política de privacidad
                  </span>
                  {' '}y{' '}
                  <span 
                    className="terms-link"
                    onClick={() => setIsLegalModalVisible(true)}
                  >
                    términos y condiciones
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Main Action Button */}
        <Button
          title={isSignUp ? "Crear Cuenta" : "Iniciar Sesión"}
          onClick={isSignUp ? handleRegister : handleContinue}
          loading={isLoading}
          disabled={isLoading || (isSignUp && (!isFormValid || !acceptTerms)) || (!isSignUp && !isFormValid)}
          active={isSignUp ? (isFormValid && acceptTerms) : isFormValid}
        />

        {/* Toggle between Sign In and Sign Up */}
        <button 
          onClick={() => {
            setIsSignUp(!isSignUp);
            setEmailError(null);
            setPasswordError(null);
            setShowForgotPassword(false);
            setAcceptTerms(false);
          }}
          className="toggle-button"
        >
          <span className="toggle-text">
            {isSignUp ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
            <span className="toggle-link">
              {isSignUp ? "Iniciar Sesión" : "Crear Cuenta"}
            </span>
          </span>
        </button>

        {/* Forgot Password Link - Only show when authentication fails */}
        {showForgotPassword && (
          <button 
            onClick={handleForgotPassword} 
            className="forgot-password-button"
          >
            <span className="forgot-password-text">¿Olvidaste tu contraseña?</span>
          </button>
        )}

        {/* Separator */}
        <div className="separator" />

        {/* Google Sign-In Button */}
        <Button
          title="Continua con Google"
          onClick={handleGoogleLogin}
          variant="social"
          icon={`${ASSET_BASE}google-icon.png`}
          loading={isLoading}
          disabled={isLoading}
        />
      </div>

      {/* Legal Documents Modal */}
      {isLegalModalVisible && (
        <div className="legal-modal-overlay" onClick={() => setIsLegalModalVisible(false)}>
          <div className="legal-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="legal-modal-header">
              <h2 className="legal-modal-title">Documentos Legales</h2>
              <button
                className="legal-modal-close"
                onClick={() => setIsLegalModalVisible(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="legal-modal-body">
              <div className="legal-modal-documents">
                <div className="legal-modal-document-item">
                  <h3>Términos y Condiciones</h3>
                  <a
                    href="https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/legal%2F1%20-%20TE%CC%81RMINOS%20Y%20CONDICIONES%20DE%20USO%20WAKE.pdf?alt=media&token=500e1ddd-c126-43ba-bb0d-e8b4e571b49c"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="legal-modal-link"
                  >
                    Ver Términos y Condiciones
                  </a>
                </div>
                <div className="legal-modal-document-item">
                  <h3>Política de Tratamiento de Datos Personales</h3>
                  <a
                    href="https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/legal%2F2%20-%20POLI%CC%81TICA%20DE%20TRATAMIENTO%20DE%20DATOS%20PERSONALES%20WAKE.pdf?alt=media&token=5cd87b24-bb70-4daa-b2cf-16f31c46cef7"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="legal-modal-link"
                  >
                    Ver Política de Privacidad
                  </a>
                </div>
                <div className="legal-modal-document-item">
                  <h3>Política de Reembolsos</h3>
                  <a
                    href="https://firebasestorage.googleapis.com/v0/b/wolf-20b8b.firebasestorage.app/o/legal%2F3-%20POLI%CC%81TICA%20DE%20REEMBOLSOS%2C%20RETRACTO%20Y%20REVERSIO%CC%81N%20DE%20PAGO%20WAKE.pdf?alt=media&token=da5f7fe3-f699-46cb-8fd9-5e0da2e7efb6"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="legal-modal-link"
                  >
                    Ver Política de Reembolsos
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginScreen;

