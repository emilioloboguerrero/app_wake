import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  Alert,
  Keyboard,
  Platform,
  Switch,
  Dimensions,
} from 'react-native';
import { auth } from '../config/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { createUserDocument } from '../services/firestoreService';
import googleAuthService from '../services/googleAuthService';
import appleAuthService from '../services/appleAuthService';
import Input from '../components/Input';
import Button from '../components/Button';
import LegalDocumentsWebView from '../components/LegalDocumentsWebView';
import { KeyboardAvoidingView, ScrollView, TouchableWithoutFeedback } from 'react-native';
import Constants from 'expo-constants';
import logger from '../utils/logger.js';

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

// Get screen dimensions
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');


const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isLegalWebViewVisible, setIsLegalWebViewVisible] = useState(false);
  const [AppleButtonComponent, setAppleButtonComponent] = useState(null);


  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password) => {
    return password.length >= 6;
  };

  const handleEmailChange = (text) => {
    setEmail(text);
    // Clear error when user starts typing
    if (emailError) {
      setEmailError(null);
    }
  };

  const handlePasswordChange = (text) => {
    setPassword(text);
    // Clear error when user starts typing
    if (passwordError) {
      setPasswordError(null);
    }
  };

  const handleContinue = async () => {
    // Clear previous errors
    setEmailError(null);
    setPasswordError(null);
    setShowForgotPassword(false);

    // Validate email
    if (!email.trim()) {
      setEmailError('Por favor ingresa tu correo electrónico');
      return;
    }

    if (!validateEmail(email)) {
      setEmailError('Correo no válido');
      return;
    }

    // Validate password
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
      // Try to login first
      logger.log('Attempting to sign in with:', email);
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      logger.log('User signed in successfully:', user.uid);
      
      // Check if user has displayName in Firebase Auth
      // If not, sync from Firestore (for users who registered before this fix)
      if (!user.displayName) {
        logger.log('User has no displayName in Firebase Auth, syncing from Firestore...');
        try {
          const userData = await firestoreService.getUser(user.uid);
          if (userData?.displayName) {
            await updateProfile(user, {
              displayName: userData.displayName
            });
            await user.reload();
            logger.log('✅ Synced displayName from Firestore:', userData.displayName);
          } else {
            // Fallback: set email prefix if no displayName in Firestore either
            const fallbackName = email.split('@')[0];
            await updateProfile(user, {
              displayName: fallbackName
            });
            await user.reload();
            logger.log('✅ Set fallback displayName:', fallbackName);
          }
        } catch (syncError) {
          logger.warn('⚠️ Failed to sync displayName:', syncError);
          // Continue anyway, not critical
        }
      }
      
      // Auth state will handle navigation automatically
      
    } catch (error) {
      logger.error('Sign in error:', error);
      
      // If user doesn't exist, show friendly prompt instead of error
      if (error.code === 'auth/user-not-found') {
        logger.log('User not found, showing create account prompt...');
        Alert.alert(
          '¿No tienes cuenta?',
          'No encontramos una cuenta con este correo electrónico. ¿Te gustaría crear una nueva cuenta?',
          [
            {
              text: 'Cancelar',
              style: 'cancel'
            },
            {
              text: 'Crear Cuenta',
              onPress: () => {
                // Switch to sign up mode
                setIsSignUp(true);
              }
            }
          ]
        );
        return; // Exit early to avoid showing error message
      }
      
      // Handle other sign-in errors
      let errorMessage = 'Ocurrió un error. Por favor intenta de nuevo.';
      
      switch (error.code) {
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
      
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    // Clear previous errors
    setEmailError(null);
    setPasswordError(null);
    setShowForgotPassword(false);

    // Validate email
    if (!email.trim()) {
      setEmailError('Por favor ingresa tu correo electrónico');
      return;
    }

    if (!validateEmail(email)) {
      setEmailError('Correo no válido');
      return;
    }

    // Validate password
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
      Alert.alert('Términos y Condiciones', 'Debes aceptar la política de privacidad y los términos y condiciones para continuar.');
      return;
    }

    setIsLoading(true);
    try {
      logger.log('Attempting to create user with:', email);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      logger.log('Firebase user created successfully:', user.uid);
      
      // Set initial displayName in Firebase Auth (using email prefix)
      const initialDisplayName = email.split('@')[0];
      try {
        await updateProfile(user, {
          displayName: initialDisplayName
        });
        // Reload user to trigger onAuthStateChanged with updated displayName
        await user.reload();
        logger.log('Firebase Auth displayName set to:', initialDisplayName);
      } catch (profileError) {
        logger.warn('Failed to set displayName in Firebase Auth:', profileError);
        // Continue anyway, not critical
      }
      
      // Try to create user document in Firestore
      try {
        await createUserDocument(user.uid, {
          email: user.email,
          displayName: initialDisplayName,
          lastLoginAt: new Date(),
          profileCompleted: false,     // Show Registro (OnboardingScreen) first
          onboardingCompleted: false,  // Then show questions flow
        });
        logger.log('User document created successfully');
      } catch (docError) {
        logger.warn('Failed to create user document, but user account was created:', docError);
        // Don't show error to user since the account was created successfully
        // The user can still use the app, and we can retry document creation later
      }

      // Auth state will handle navigation automatically
      
    } catch (error) {
      logger.error('Registration error:', error);
      
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
      
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await googleAuthService.signIn();
      
      if (result.success) {
        logger.log('Google sign-in successful:', result.user.uid);
        // Auth state will handle navigation automatically
      } else {
        Alert.alert('Error', result.error || 'Error al iniciar sesión con Google');
      }
    } catch (error) {
      logger.error('Google Sign-In Error:', error);
      Alert.alert('Error', 'Error al iniciar sesión con Google');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await appleAuthService.signIn();
      
      if (result.success) {
        logger.log('Apple sign-in successful:', result.user.uid);
        // Auth state will handle navigation automatically
      } else {
        Alert.alert('Error', result.error || 'Error al iniciar sesión con Apple');
      }
    } catch (error) {
      logger.error('Apple Sign-In Error:', error);
      Alert.alert('Error', 'Error al iniciar sesión con Apple');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Por favor ingresa tu correo electrónico primero');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Error', 'Por favor ingresa un correo electrónico válido');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert('Revisa tu correo (spam)', 'Puede estar en la carpeta de spam.');
    } catch (error) {
      logger.error('Password Reset Error:', error);
      Alert.alert('Error', 'Error al enviar el email de recuperación');
    }
  };

  // Load Apple Button component when screen mounts (iOS only)
  useEffect(() => {
    const loadAppleButton = async () => {
      if (!isExpoGo && Platform.OS === 'ios') {
        try {
          const AppleButton = await appleAuthService.getAppleButton();
          if (AppleButton) {
            setAppleButtonComponent(() => AppleButton);
          }
        } catch (error) {
          logger.warn('Could not load Apple Button component:', error);
        }
      }
    };
    loadAppleButton();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{flex: 1}} behavior="padding" keyboardVerticalOffset={0}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView 
            contentContainerStyle={{flexGrow: 1}}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
          {/* WAKE Logo */}
          <View style={styles.logoContainer}>
            <Image 
              source={require('../../assets/wake-logo-new.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Welcome Text */}
          <Text style={styles.welcomeText}>
            {isSignUp ? "Crear Cuenta" : "Inicio"}
          </Text>

          {/* Email Input */}
          <Input
            placeholder="Correo electrónico"
            value={email}
            onChangeText={handleEmailChange}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={emailError}
            returnKeyType="next"
          />

          {/* Password Input */}
          <Input
            placeholder="Contraseña"
            value={password}
            onChangeText={handlePasswordChange}
            secureTextEntry={true}
            autoCapitalize="none"
            autoCorrect={false}
            error={passwordError}
            returnKeyType="done"
            onSubmitEditing={isSignUp ? handleRegister : handleContinue}
          />

        {/* Terms and Conditions Agreement - Only show during signup */}
        {isSignUp && (
          <View style={styles.termsContainer}>
            <View style={styles.termsRow}>
              <Switch
                value={acceptTerms}
                onValueChange={setAcceptTerms}
                trackColor={{ false: '#333', true: 'rgba(191, 168, 77, 0.3)' }}
                thumbColor={acceptTerms ? 'rgba(191, 168, 77, 1)' : '#f4f3f4'}
                ios_backgroundColor="#333"
                style={styles.termsSwitch}
              />
              <View style={styles.termsTextContainer}>
                <Text style={styles.termsText}>
                  Acepto la{' '}
                  <Text 
                    style={styles.termsLink}
                    onPress={() => setIsLegalWebViewVisible(true)}
                  >
                    política de privacidad
                  </Text>
                  {' '}y{' '}
                  <Text 
                    style={styles.termsLink}
                    onPress={() => setIsLegalWebViewVisible(true)}
                  >
                    términos y condiciones
                  </Text>
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Main Action Button */}
        <Button
          title={isSignUp ? "Crear Cuenta" : "Iniciar Sesión"}
          onPress={isSignUp ? handleRegister : handleContinue}
          loading={isLoading}
          disabled={isLoading || (isSignUp && (!validateEmail(email) || !validatePassword(password) || !acceptTerms)) || (!isSignUp && (!validateEmail(email) || !validatePassword(password)))}
          active={isSignUp ? (validateEmail(email) && validatePassword(password) && acceptTerms) : (validateEmail(email) && validatePassword(password))}
        />

        {/* Toggle between Sign In and Sign Up */}
        <TouchableOpacity 
          onPress={() => {
            setIsSignUp(!isSignUp);
            setEmailError(null);
            setPasswordError(null);
            setShowForgotPassword(false);
            setAcceptTerms(false); // Reset terms acceptance when switching modes
          }}
          style={styles.toggleContainer}
        >
          <Text style={styles.toggleText}>
            {isSignUp ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
            <Text style={styles.toggleLink}>
              {isSignUp ? "Iniciar Sesión" : "Crear Cuenta"}
            </Text>
          </Text>
        </TouchableOpacity>

        {/* Forgot Password Link - Only show when authentication fails */}
        {showForgotPassword && (
          <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotPasswordContainer}>
            <Text style={styles.forgotPasswordText}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>
        )}

        {/* Separator - Only show if Google Sign-In is available */}
        {!isExpoGo && <View style={styles.separator} />}

        {/* Google Sign-In Button - Only show in production builds */}
        {!isExpoGo && (
          <Button
            title="Continua con Google"
            onPress={handleGoogleLogin}
            variant="social"
            icon={require('../../assets/google-icon.png')}
            loading={isLoading}
            disabled={isLoading}
          />
        )}

        {/* Apple Sign-In Button - Only show in production builds on iOS */}
        {!isExpoGo && Platform.OS === 'ios' && AppleButtonComponent && (
          <View style={styles.appleButtonContainer}>
            <AppleButtonComponent
              buttonType={AppleButtonComponent.Type.SIGN_IN}
              buttonStyle={AppleButtonComponent.Style.BLACK}
              cornerRadius={8}
              onPress={handleAppleLogin}
              style={styles.appleButton}
            />
          </View>
        )}
        
        {/* Fallback to custom button if Apple Button component not loaded */}
        {!isExpoGo && Platform.OS === 'ios' && !AppleButtonComponent && (
          <Button
            title="Continua con Apple"
            onPress={handleAppleLogin}
            variant="social"
            icon={require('../../assets/apple-icon.png')}
            loading={isLoading}
            disabled={isLoading}
            style={styles.appleButton}
          />
        )}

        {/* Expo Go Message - Only show in Expo Go */}
        {isExpoGo && (
          <View style={styles.expoGoMessage}>
            <Text style={styles.expoGoText}>
              Google Sign-In y Apple Sign-In disponibles en la versión de producción
            </Text>
          </View>
        )}
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      
      {/* Legal Documents WebView */}
      <LegalDocumentsWebView
        visible={isLegalWebViewVisible}
        onClose={() => setIsLegalWebViewVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom:20,  // Reduced from 60 to 30
  },
  logo: {
    width: 200,  // Increased from 120
    height: 200,  // Increased from 60 (maintains aspect ratio)
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 20,
    textAlign: 'center',
  },
  forgotPasswordContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(191, 168, 77, 0.72)',
    textDecorationLine: 'underline',
  },
  separator: {
    width: '100%',
    height: 1,
    backgroundColor: '#333',
    marginBottom: 24,
  },
  toggleContainer: {
    marginTop: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#cccccc',
    textAlign: 'center',
  },
  toggleLink: {
    color: 'rgba(191, 168, 77, 0.72)',
    fontWeight: '500',
  },
  termsContainer: {
    width: '100%',
    marginBottom: 20,
    marginTop: 10,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  termsSwitch: {
    marginRight: 12,
    marginTop: 2,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    color: '#cccccc',
    lineHeight: 18,
  },
  termsTextContainer: {
    flex: 1,
    flexShrink: 1,
  },
  termsLink: {
    color: 'rgba(191, 168, 77, 0.72)',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  expoGoMessage: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(191, 168, 77, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(191, 168, 77, 0.3)',
  },
  expoGoText: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(191, 168, 77, 0.8)',
    textAlign: 'center',
    lineHeight: 20,
  },
  appleButtonContainer: {
    width: Math.max(280, screenWidth * 0.7),
    height: Math.max(50, screenHeight * 0.06),
    marginBottom: 16,
    alignSelf: 'center',
    marginTop: 12,
  },
  appleButton: {
    width: '100%',
    height: '100%',
  },
});

export default LoginScreen;