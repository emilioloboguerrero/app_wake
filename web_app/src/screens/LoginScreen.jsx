import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Input from '../components/Input';
import Button from '../components/Button';
import authService from '../services/authService';
import googleAuthService from '../services/googleAuthService';
import appleAuthService from '../services/appleAuthService';
import { handleAutoLoginFromToken } from '../utils/autoLogin';
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
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [autoLoginInProgress, setAutoLoginInProgress] = useState(false);

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
    
    // Only redirect if we're on the login page
    const currentPath = window.location.pathname;
    if (currentPath !== '/login') return;

    console.log('🔍 LoginScreen: Redirecting user', { 
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
      // Regular users go to user page
      navigate('/user/biblioteca', { replace: true });
    }
  }, [user, loading, userRole, isCreator, webOnboardingCompleted, navigate]);

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
    try {
      await authService.signInUser(email, password);
      
      // AuthContext will automatically fetch user role and handle redirect
      // Wait a moment for AuthContext to update, then let useEffect handle redirect
      // This ensures the user state is properly set before navigation
      setTimeout(() => {
        setIsLoading(false);
      }, 100);
    } catch (error) {
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


  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await googleAuthService.signIn();
      
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

  const handleAppleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await appleAuthService.signIn();
      
      if (result.success) {
        // AuthContext will automatically fetch user role and handle redirect
        // Wait a moment for AuthContext to update, then let useEffect handle redirect
        setTimeout(() => {
          setIsLoading(false);
        }, 100);
      } else {
        alert(result.error || 'Error al iniciar sesión con Apple');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Apple Sign-In Error:', error);
      alert('Error al iniciar sesión con Apple');
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
            src="/wake-logo-new.png" 
            alt="Wake Logo" 
            className="logo"
          />
        </div>

        {/* Welcome Text */}
        <h1 className="welcome-text">
          Inicio
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

        {/* Main Action Button */}
        <Button
          title="Iniciar Sesión"
          onClick={handleContinue}
          loading={isLoading}
          disabled={isLoading || !isFormValid}
          active={isFormValid}
        />

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
          icon="/google-icon.png"
          loading={isLoading}
          disabled={isLoading}
        />

        {/* Apple Sign-In Button */}
        <Button
          title="Continua con Apple"
          onClick={handleAppleLogin}
          variant="social"
          icon="/apple-icon.png"
          loading={isLoading}
          disabled={isLoading}
        />
      </div>
    </div>
  );
};

export default LoginScreen;

