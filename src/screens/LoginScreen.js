// Mobile LoginScreen - React Native version
import React, { useState, useEffect } from 'react';
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

const LoginScreen = ({ navigation }) => {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    // Check both AuthContext user and Firebase currentUser directly
    const currentUser = user || auth.currentUser;
    if (!loading && currentUser) {
      console.log('[LOGIN SCREEN] User detected, redirecting to MainApp');
      navigation.replace('MainApp');
    }
  }, [user, loading, navigation]);

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
    if (emailError) {
      setEmailError(null);
    }
  };

  const handlePasswordChange = (text) => {
    setPassword(text);
    if (passwordError) {
      setPasswordError(null);
    }
  };

  // Sign In handler
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
      const user = await authService.signInUser(email, password);
      setIsLoading(false);
      // Immediately navigate after successful login
      // Check both the returned user and auth.currentUser as fallback
      if (user || auth.currentUser) {
        console.log('[LOGIN SCREEN] Login successful, navigating to MainApp');
        navigation.replace('MainApp');
      }
      // Navigation will also happen via useEffect when user state updates (backup)
    } catch (error) {
      setIsLoading(false);
      
      let errorMessage = 'Ocurrió un error. Por favor intenta de nuevo.';
      
      if (error.code) {
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
          default:
            errorMessage = error.message || errorMessage;
        }
      } else {
        errorMessage = error.message || errorMessage;
      }
      
      Alert.alert('Error', errorMessage);
    }
  };

  // Register handler
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
      Alert.alert('Atención', 'Debes aceptar la política de privacidad y los términos y condiciones para continuar.');
      return;
    }

    setIsLoading(true);
    try {
      const initialDisplayName = email.split('@')[0];
      const user = await authService.registerUser(email, password, initialDisplayName);
      setIsLoading(false);
      // Immediately navigate after successful registration
      // Check both the returned user and auth.currentUser as fallback
      if (user || auth.currentUser) {
        console.log('[LOGIN SCREEN] Registration successful, navigating to MainApp');
        navigation.replace('MainApp');
      }
      // Navigation will also happen via useEffect when user state updates (backup)
    } catch (error) {
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
      
      Alert.alert('Error', errorMessage);
    }
  };

  // Google Sign-In handler
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await googleAuthService.signIn();
      
      if (result.success) {
        setIsLoading(false);
        // Navigation will happen via useEffect when user state updates
      } else {
        Alert.alert('Error', result.error || 'Error al iniciar sesión con Google');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      Alert.alert('Error', 'Error al iniciar sesión con Google');
      setIsLoading(false);
    }
  };

  // Forgot Password handler
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Atención', 'Por favor ingresa tu correo electrónico primero');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Atención', 'Por favor ingresa un correo electrónico válido');
      return;
    }

    try {
      await authService.resetPassword(email);
      Alert.alert('Éxito', 'Revisa tu correo (spam). Puede estar en la carpeta de spam.');
    } catch (error) {
      console.error('Password Reset Error:', error);
      Alert.alert('Error', 'Error al enviar el email de recuperación');
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
              <TextInput
                style={[styles.input, passwordError && styles.inputError]}
                placeholder="Contraseña"
                placeholderTextColor="#999"
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
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

            {/* Main Action Button */}
            <TouchableOpacity
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
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    marginTop: 4,
    marginLeft: 4,
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

