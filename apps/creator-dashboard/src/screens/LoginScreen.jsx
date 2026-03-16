import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Input from '../components/Input';
import Button from '../components/Button';
import authService from '../services/authService';
import googleAuthService from '../services/googleAuthService';
import { ASSET_BASE } from '../config/assets';
import logger from '../utils/logger';
import './LoginScreen.css';

const LoginScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isCreator, webOnboardingCompleted, loading, userRole } = useAuth();

  useEffect(() => {
    logger.log('[LoginScreen] mounted', {
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
  const [isSignUp, setIsSignUp] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isLegalModalVisible, setIsLegalModalVisible] = useState(false);

  useEffect(() => {
    if (loading || !user) return;

    if (userRole === null) return;

    const currentPath = location.pathname;
    if (currentPath !== '/login') {
      return;
    }

    logger.log('[LoginScreen] Redirecting logged-in user', {
      userRole,
      isCreator,
      webOnboardingCompleted,
    });

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
        // Ignore malformed redirect params
      }
    }

    if (isCreator && webOnboardingCompleted !== null) {
      if (webOnboardingCompleted === false) {
        navigate('/onboarding', { replace: true });
      } else if (webOnboardingCompleted === true) {
        navigate('/lab', { replace: true });
      }
    } else if (!isCreator) {
      logger.log('[LoginScreen] User is not creator, redirecting to PWA');
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
    logger.log('[LoginScreen] signIn: attempting email/password login', { email: email.replace(/(.{2}).*(@.*)/, '$1***$2') });
    try {
      await authService.signInUser(email, password);
      setTimeout(() => {
        setIsLoading(false);
      }, 100);
    } catch (error) {
      logger.error('[LoginScreen] signIn: error', { code: error?.code, message: error?.message });
      setIsLoading(false);
      
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

    if (!acceptTerms) {
      alert('Debes aceptar la política de privacidad y los términos y condiciones para continuar.');
      return;
    }

    setIsLoading(true);
    logger.log('[LoginScreen] register: attempting account creation', { email: email.replace(/(.{2}).*(@.*)/, '$1***$2') });
    try {
      const initialDisplayName = email.split('@')[0];
      await authService.registerUser(email, password, initialDisplayName);
      setTimeout(() => {
        setIsLoading(false);
      }, 100);
    } catch (error) {
      logger.error('[LoginScreen] register: error', { code: error?.code, message: error?.message });
      setIsLoading(false);
      
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
    logger.log('[LoginScreen] Google: attempting sign-in');
    try {
      const result = await googleAuthService.signIn();
      logger.log('[LoginScreen] Google: result', { success: result.success, error: result?.error });
      if (result.success) {
        setTimeout(() => {
          setIsLoading(false);
        }, 100);
      } else {
        alert(result.error || 'Error al iniciar sesión con Google');
        setIsLoading(false);
      }
    } catch (error) {
      logger.error('[LoginScreen] Google Sign-In Error:', error);
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
      logger.error('[LoginScreen] Password Reset Error:', error);
      alert('Error al enviar el email de recuperación');
    }
  };

  const isFormValid = validateEmail(email) && validatePassword(password);

  return (
    <div className="login-container">
      <div className="login-content">
        <div className="logo-container">
          <img
            src={`${ASSET_BASE}wake-logo-new.png`}
            alt="Wake Logo"
            className="logo"
          />
          <p className="login-subtitle">Creadores</p>
        </div>

        <h1 className="welcome-text">
          {isSignUp ? "Crear Cuenta" : "Inicio"}
        </h1>

        <Input
          placeholder="Correo electrónico"
          value={email}
          onChange={handleEmailChange}
          type="email"
          error={emailError}
        />

        <Input
          placeholder="Contraseña"
          value={password}
          onChange={handlePasswordChange}
          type="password"
          error={passwordError}
        />

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

        <Button
          title={isSignUp ? "Crear Cuenta" : "Iniciar Sesión"}
          onClick={isSignUp ? handleRegister : handleContinue}
          loading={isLoading}
          disabled={isLoading || (isSignUp && (!isFormValid || !acceptTerms)) || (!isSignUp && !isFormValid)}
          active={isSignUp ? (isFormValid && acceptTerms) : isFormValid}
        />

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

        {showForgotPassword && (
          <button
            onClick={handleForgotPassword}
            className="forgot-password-button"
          >
            <span className="forgot-password-text">¿Olvidaste tu contraseña?</span>
          </button>
        )}

        <div className="separator" />

        <Button
          title="Continua con Google"
          onClick={handleGoogleLogin}
          variant="social"
          icon={`${ASSET_BASE}google-icon.png`}
          loading={isLoading}
          disabled={isLoading}
        />
      </div>

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

