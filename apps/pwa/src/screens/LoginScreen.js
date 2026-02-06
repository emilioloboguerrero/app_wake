// Mobile LoginScreen - React Native version
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import authService from '../services/authService';
import googleAuthService from '../services/googleAuthService';
import logger from '../utils/logger';
import SvgEye from '../components/icons/vectors_fig/Interface/Eye';
import SvgEyeSlash from '../components/icons/vectors_fig/Interface/EyeSlash';

const LoginScreen = ({ navigation }) => {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // When in sign-up mode, show password min-length error if field has 1–5 chars
  useEffect(() => {
    if (!isSignUp) return;
    if (password.length > 0 && password.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres');
    } else if (password.length >= 6) {
      setPasswordError(null);
    }
  }, [isSignUp, password]);

  // Redirect if already logged in
  // Note: On web, this is handled by LoginScreen.web.js to prevent infinite loops
  // Only run this for native apps
  const redirectAttemptedRef = useRef(false);
  useEffect(() => {
    // Skip on web (web wrapper handles redirects)
    if (Platform.OS === 'web') return;
    
    // Prevent multiple redirect attempts
    if (redirectAttemptedRef.current) return;
    
    // Check both AuthContext user and Firebase currentUser directly
    const currentUser = user || auth.currentUser;
    if (!loading && currentUser) {
      logger.debug('[LOGIN SCREEN] User detected, redirecting to MainApp');
      redirectAttemptedRef.current = true;
      navigation.replace('MainApp');
    }
  }, [user, loading]);

  // Validation functions
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password) => {
    return password.length >= 6;
  };

  const handleEmailChange = (text) => {
    setEmail(text);
    if (emailError) setEmailError(null);
    if (authError) setAuthError(null);
  };

  const handlePasswordChange = (text) => {
    setPassword(text);
    if (authError) setAuthError(null);
    // Upfront validation when creating account: show error as they type if < 6 chars
    if (isSignUp) {
      if (text.length > 0 && text.length < 6) {
        setPasswordError('La contraseña debe tener al menos 6 caracteres');
      } else {
        setPasswordError(null);
      }
    } else {
      if (passwordError) setPasswordError(null);
    }
  };

  // Sign In handler
  const handleContinue = async () => {
    setEmailError(null);
    setPasswordError(null);
    setAuthError(null);
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
      const user = await authService.signInUser(email, password);
      setIsLoading(false);
      
      logger.debug('[LOGIN SCREEN] ✅ Login successful', {
        userId: user?.uid,
        email: user?.email,
        firebaseUser: !!auth.currentUser,
        firebaseUserId: auth.currentUser?.uid
      });
      
      const currentUser = user || auth.currentUser;
      if (currentUser) {
        logger.debug('[LOGIN SCREEN] User available immediately, calling navigation.replace');
        setTimeout(() => {
          navigation.replace('MainApp');
        }, 200);
      } else {
        logger.debug('[LOGIN SCREEN] User not immediately available, waiting for AuthContext update');
      }
    } catch (error) {
      setIsLoading(false);
      
      let errorMessage = 'No pudimos iniciar sesión. Intenta de nuevo.';
      const code = error?.code;

      if (code) {
        switch (code) {
          case 'auth/user-not-found':
            errorMessage = 'No hay ninguna cuenta con este correo. Crea una cuenta o revisa el correo.';
            setEmailError(errorMessage);
            break;
          case 'auth/wrong-password':
            errorMessage = 'Contraseña incorrecta. Revisa tu contraseña o usa "¿Olvidaste tu contraseña?".';
            setPasswordError('Contraseña incorrecta');
            setShowForgotPassword(true);
            break;
          case 'auth/invalid-credential':
            errorMessage = 'Correo o contraseña incorrectos. Revisa los datos o crea una cuenta si no tienes una.';
            setShowForgotPassword(true);
            break;
          case 'auth/invalid-email':
            errorMessage = 'Correo electrónico no válido.';
            setEmailError(errorMessage);
            break;
          case 'auth/too-many-requests':
            errorMessage = 'Demasiados intentos. Espera un momento e intenta de nuevo.';
            break;
          case 'auth/user-disabled':
            errorMessage = 'Esta cuenta ha sido desactivada. Contacta a soporte si crees que es un error.';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Sin conexión. Revisa tu internet e intenta de nuevo.';
            break;
          case 'auth/operation-not-allowed':
            errorMessage = 'Inicio de sesión con correo no está habilitado. Contacta a soporte.';
            break;
          default:
            errorMessage = error?.message || errorMessage;
        }
      } else {
        errorMessage = error?.message || errorMessage;
      }

      setAuthError(errorMessage);
      logger.debug('[LOGIN SCREEN] Sign-in error:', code, errorMessage);
    }
  };

  // Register handler
  const handleRegister = async () => {
    setEmailError(null);
    setPasswordError(null);
    setAuthError(null);
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
      setAuthError('Debes aceptar la política de privacidad y los términos y condiciones para continuar.');
      return;
    }

    setIsLoading(true);
    try {
      const initialDisplayName = email.split('@')[0];
      const user = await authService.registerUser(email, password, initialDisplayName);
      setIsLoading(false);
      if (user || auth.currentUser) {
        logger.debug('[LOGIN SCREEN] Registration successful, navigating to MainApp');
        navigation.replace('MainApp');
      }
    } catch (error) {
      setIsLoading(false);
      
      let errorMessage = 'No pudimos crear la cuenta. Intenta de nuevo.';
      const code = error?.code;

      if (code) {
        switch (code) {
          case 'auth/email-already-in-use':
            errorMessage = 'Ya existe una cuenta con este correo. Inicia sesión o usa "¿Olvidaste tu contraseña?" si no la recuerdas.';
            setEmailError('Este correo ya está registrado');
            break;
          case 'auth/weak-password':
            errorMessage = 'La contraseña es muy débil. Usa al menos 6 caracteres.';
            setPasswordError('Mínimo 6 caracteres');
            break;
          case 'auth/invalid-email':
            errorMessage = 'Correo electrónico no válido.';
            setEmailError(errorMessage);
            break;
          case 'auth/operation-not-allowed':
            errorMessage = 'El registro con correo no está habilitado. Contacta a soporte.';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Sin conexión. Revisa tu internet e intenta de nuevo.';
            break;
          default:
            errorMessage = error?.message || errorMessage;
        }
      } else {
        errorMessage = error?.message || errorMessage;
      }

      setAuthError(errorMessage);
      logger.debug('[LOGIN SCREEN] Register error:', code, errorMessage);
    }
  };

  // Google Sign-In handler
  const handleGoogleLogin = async () => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const result = await googleAuthService.signIn();
      
      if (result.success) {
        setIsLoading(false);
        const currentUser = result.user || auth.currentUser;
        if (currentUser) {
          logger.debug('[LOGIN SCREEN] Google sign-in successful, calling navigation.replace (same as email sign-in)');
          setTimeout(() => {
            navigation.replace('MainApp');
          }, 200);
        }
      } else {
        setIsLoading(false);
        setAuthError(result.error || 'No se pudo iniciar sesión con Google. Intenta de nuevo.');
      }
    } catch (error) {
      logger.error('Google Sign-In Error:', error);
      setIsLoading(false);
      setAuthError(error?.message || 'Error al iniciar sesión con Google. Intenta de nuevo.');
    }
  };

  // Forgot Password handler
  const handleForgotPassword = async () => {
    setAuthError(null);
    if (!email.trim()) {
      setAuthError('Ingresa tu correo electrónico para recuperar tu contraseña.');
      setEmailError('Ingresa tu correo');
      return;
    }

    if (!validateEmail(email)) {
      setAuthError('Correo electrónico no válido.');
      setEmailError('Correo no válido');
      return;
    }

    try {
      await authService.resetPassword(email);
      setAuthError(null);
      Alert.alert('Éxito', 'Revisa tu correo (spam). Puede estar en la carpeta de spam.');
    } catch (error) {
      logger.error('Password Reset Error:', error);
      const code = error?.code;
      let msg = 'No pudimos enviar el correo de recuperación. Intenta de nuevo.';
      if (code === 'auth/user-not-found') {
        msg = 'No hay ninguna cuenta con este correo. Revisa el correo o crea una cuenta.';
      } else if (code === 'auth/invalid-email') {
        msg = 'Correo electrónico no válido.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'Demasiados intentos. Espera un momento e intenta de nuevo.';
      } else if (error?.message) {
        msg = error.message;
      }
      setAuthError(msg);
    }
  };

  const isFormValid = validateEmail(email) && validatePassword(password);

  if (user) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            {/* WAKE Logo */}
            <Image
              source={require('../../assets/wake-logo-new.png')}
              style={styles.logo}
              resizeMode="contain"
            />

            {/* Welcome Text */}
            <Text style={styles.welcomeText}>
              {isSignUp ? "Crear Cuenta" : "Inicio"}
            </Text>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, emailError && styles.inputError]}
                placeholder="Correo electrónico"
                placeholderTextColor="#999"
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {emailError && (
                <Text style={styles.errorText}>{emailError}</Text>
              )}
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <View style={styles.passwordInputRow}>
                <TextInput
                  style={[styles.input, styles.inputWithToggle, passwordError && styles.inputError]}
                  placeholder="Contraseña"
                  placeholderTextColor="#999"
                  value={password}
                  onChangeText={handlePasswordChange}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword((prev) => !prev)}
                  accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  accessibilityRole="button"
                >
                  {showPassword ? (
                    <SvgEye width={22} height={22} stroke="rgba(255, 255, 255, 0.7)" strokeWidth={2} />
                  ) : (
                    <SvgEyeSlash width={22} height={22} stroke="rgba(255, 255, 255, 0.7)" strokeWidth={2} />
                  )}
                </TouchableOpacity>
              </View>
              {passwordError && (
                <Text style={styles.errorText}>{passwordError}</Text>
              )}
            </View>

            {/* Terms and Conditions - Only show during signup */}
            {isSignUp && (
              <View style={styles.termsContainer}>
                <TouchableOpacity
                  style={styles.checkbox}
                  onPress={() => setAcceptTerms(!acceptTerms)}
                >
                  <View style={[styles.checkboxBox, acceptTerms && styles.checkboxChecked]}>
                    {acceptTerms && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.termsText}>
                    Acepto la política de privacidad y los términos y condiciones
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Auth error message (sign-in / sign-up failures) */}
            {authError && (
              <View style={styles.authErrorBlock}>
                <Text style={styles.authErrorText}>{authError}</Text>
              </View>
            )}

            {/* Main Action Button */}
            <TouchableOpacity
              testID="login-primary-button"
              aria-disabled={isLoading || (isSignUp && (!isFormValid || !acceptTerms)) || (!isSignUp && !isFormValid)}
              style={[
                styles.button,
                (isLoading || (isSignUp && (!isFormValid || !acceptTerms)) || (!isSignUp && !isFormValid)) && styles.buttonDisabled
              ]}
              onPress={isSignUp ? handleRegister : handleContinue}
              disabled={isLoading || (isSignUp && (!isFormValid || !acceptTerms)) || (!isSignUp && !isFormValid)}
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={[
                  styles.buttonText,
                  (isLoading || (isSignUp && (!isFormValid || !acceptTerms)) || (!isSignUp && !isFormValid)) && styles.buttonTextDisabled
                ]}>
                  {isSignUp ? "Crear Cuenta" : "Iniciar Sesión"}
                </Text>
              )}
            </TouchableOpacity>

            {/* Toggle between Sign In and Sign Up */}
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={() => {
                setIsSignUp(!isSignUp);
                setEmailError(null);
                setPasswordError(null);
                setAuthError(null);
                setShowForgotPassword(false);
                setAcceptTerms(false);
              }}
            >
              <Text style={styles.toggleText}>
                {isSignUp ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
                <Text style={styles.toggleLink}>
                  {isSignUp ? "Iniciar Sesión" : "Crear Cuenta"}
                </Text>
              </Text>
            </TouchableOpacity>

            {/* Forgot Password Link */}
            {showForgotPassword && (
              <TouchableOpacity
                style={styles.forgotButton}
                onPress={handleForgotPassword}
              >
                <Text style={styles.forgotText}>
                  ¿Olvidaste tu contraseña?
                </Text>
              </TouchableOpacity>
            )}

            {/* Separator */}
            <View style={styles.separator} />

            {/* Google Sign-In Button */}
            <TouchableOpacity
              testID="login-google-button"
              aria-disabled={isLoading}
              style={[styles.googleButton, isLoading && styles.buttonDisabled]}
              onPress={handleGoogleLogin}
              disabled={isLoading}
            >
              <Image
                source={require('../../assets/google-icon.png')}
                style={styles.googleIcon}
                resizeMode="contain"
              />
              <Text style={styles.googleButtonText}>
                Continua con Google
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  logo: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    marginBottom: 0,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 16,
  },
  passwordInputRow: {
    position: 'relative',
    width: '100%',
  },
  inputWithToggle: {
    paddingRight: 80,
  },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
  },
  input: {
    width: '100%',
    height: 56,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 20,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#333',
  },
  inputError: {
    borderColor: '#FF6B6B',
    borderWidth: 1,
  },
  inputSuccess: {
    borderColor: 'rgba(191, 168, 77, 0.7)',
    borderWidth: 1,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    marginTop: 4,
    marginLeft: 4,
  },
  authErrorBlock: {
    width: '100%',
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.35)',
  },
  authErrorText: {
    color: '#FF6B6B',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  termsContainer: {
    width: '100%',
    marginBottom: 20,
    marginTop: 10,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 4,
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
  },
  checkboxChecked: {
    backgroundColor: 'rgba(191, 168, 77, 0.3)',
    borderColor: 'rgba(191, 168, 77, 1)',
  },
  checkmark: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 16,
    fontWeight: 'bold',
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: '#cccccc',
    lineHeight: 18,
  },
  button: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: '#666666',
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(191, 168, 77, 1)',
  },
  buttonTextDisabled: {
    color: '#ffffff',
  },
  toggleButton: {
    marginTop: 16,
    marginBottom: 24,
  },
  toggleText: {
    fontSize: 14,
    color: '#cccccc',
    textAlign: 'center',
  },
  toggleLink: {
    color: 'rgba(191, 168, 77, 0.72)',
    fontWeight: '500',
  },
  forgotButton: {
    marginBottom: 24,
  },
  forgotText: {
    fontSize: 14,
    color: 'rgba(191, 168, 77, 0.72)',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  separator: {
    width: '100%',
    height: 1,
    backgroundColor: '#333',
    marginBottom: 24,
  },
  googleButton: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: '#333333',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  googleIcon: {
    width: 20,
    height: 20,
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
});

// Export both default and named for web wrapper compatibility
export default LoginScreen;
export { LoginScreen as LoginScreenBase };

