// Mobile LoginScreen - React Native version
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import { signInWithCustomToken } from 'firebase/auth';
import authService from '../services/authService';
import googleAuthService from '../services/googleAuthService';
import logger from '../utils/logger';
import { recordLoginMethod, getLastLoginMethod } from '../utils/lastLoginMethod';

// API base: relative on web (same origin as /app), absolute on native.
const API_BASE = Platform.OS === 'web' ? '' : 'https://wakelab.co';

const LoginScreen = ({ navigation }) => {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [authError, setAuthError] = useState(null);

  // Entrance animations
  const mountAnim = useRef(new Animated.Value(0)).current;
  const logoAnim  = useRef(new Animated.Value(0)).current;
  const fieldAnims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.timing(mountAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    Animated.timing(logoAnim,  { toValue: 1, duration: 900, useNativeDriver: true }).start();
    const staggered = fieldAnims.map((anim, i) =>
      Animated.timing(anim, { toValue: 1, duration: 420, delay: 200 + i * 100, useNativeDriver: true })
    );
    Animated.parallel(staggered).start();
  }, []);

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
      redirectAttemptedRef.current = true;
      navigation.replace('MainApp');
    }
  }, [user, loading]);

  // Validation functions
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Nudge the returning buyer toward the door they already used (per-device),
  // so they don't pick a different provider and split into a second account.
  const [lastMethod, setLastMethod] = useState(null);
  useEffect(() => {
    getLastLoginMethod().then((r) => setLastMethod(r.method)).catch(() => {});
  }, []);

  // Passwordless CODE login — the door that works inside the installed PWA
  // (a magic link opens in Safari and never carries the session in on iOS).
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState(null);

  const handleSendCode = async () => {
    setOtpError(null);
    const trimmed = (email || '').trim().toLowerCase();
    if (!validateEmail(trimmed)) {
      setOtpError('Escribe tu correo arriba para enviarte el código.');
      return;
    }
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/email-code/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) throw new Error('request failed');
      setOtpSent(true);
    } catch (e) {
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
      const res = await fetch(`${API_BASE}/api/v1/auth/email-code/verify`, {
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
      setTimeout(() => { navigation.replace('MainApp'); }, 200);
    } catch (e) {
      setOtpError('No pudimos verificar el código. Intenta de nuevo.');
      setOtpLoading(false);
    }
  };

  const handleEmailChange = (text) => {
    setEmail(text);
    if (emailError) setEmailError(null);
    if (authError) setAuthError(null);
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
          recordLoginMethod('google', currentUser?.email);
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


  if (user) {
    return null;
  }

  const logoStyle = {
    opacity: logoAnim,
    transform: [{ scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
  };
  const makeFieldStyle = (anim) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
  });

  return (
    <Animated.View style={[{ flex: 1 }, { opacity: mountAnim }]}>
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
            <Animated.View style={logoStyle}>
            <Image
              source={require('../../assets/wake-logo-new.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            </Animated.View>

            {/* Welcome Text */}
            <Text style={styles.welcomeText}>Inicio</Text>

            {/* Email Input */}
            <Animated.View style={makeFieldStyle(fieldAnims[0])}>
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
                editable={!otpSent}
              />
              {emailError && (
                <Text style={styles.errorText}>{emailError}</Text>
              )}
            </View>
            </Animated.View>

            {/* Auth error message */}
            {authError && (
              <View style={styles.authErrorBlock}>
                <Text style={styles.authErrorText}>{authError}</Text>
              </View>
            )}

            {/* Email CODE login — the primary email door. No password anywhere;
                the code works inside the installed PWA (a magic link would open
                in Safari and never carry the session into the standalone app). */}
            <Animated.View style={makeFieldStyle(fieldAnims[2])}>
            {!otpSent ? (
              <TouchableOpacity
                testID="login-code-button"
                style={[styles.button, otpLoading && styles.buttonDisabled]}
                onPress={handleSendCode}
                disabled={otpLoading}
              >
                {lastMethod === 'email' ? (
                  <View style={styles.lastUsedBadge}>
                    <Text style={styles.lastUsedBadgeText}>Última vez</Text>
                  </View>
                ) : null}
                <Text style={styles.buttonText}>
                  {otpLoading ? 'Enviando código…' : 'Enviarme un código'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.codeBox}>
                <Text style={styles.codeHint}>
                  Te enviamos un código de 6 dígitos a {(email || '').trim().toLowerCase()}. Escríbelo aquí:
                </Text>
                <TextInput
                  style={styles.codeInput}
                  value={otpCode}
                  onChangeText={(t) => { setOtpCode(t.replace(/\D/g, '').slice(0, 6)); if (otpError) setOtpError(null); }}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="------"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  autoFocus
                />
                {otpError ? <Text style={styles.authErrorText}>{otpError}</Text> : null}
                <TouchableOpacity
                  style={[styles.button, (otpLoading || otpCode.length !== 6) && styles.buttonDisabled]}
                  onPress={handleVerifyCode}
                  disabled={otpLoading || otpCode.length !== 6}
                >
                  <Text style={styles.buttonText}>{otpLoading ? 'Verificando…' : 'Entrar'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSendCode} disabled={otpLoading} style={styles.codeLinkBtn}>
                  <Text style={styles.codeLinkText}>Reenviar código</Text>
                </TouchableOpacity>
              </View>
            )}
            </Animated.View>

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
              {lastMethod === 'google' ? (
                <View style={styles.lastUsedBadge}>
                  <Text style={styles.lastUsedBadgeText}>Última vez</Text>
                </View>
              ) : null}
              <Image
                source={require('../../assets/google-icon.png')}
                style={styles.googleIcon}
                resizeMode="contain"
              />
              <Text style={styles.googleButtonText}>
                Continua con Google
              </Text>
            </TouchableOpacity>

            {/* Passive terms acceptance — no signup form anymore */}
            <Text style={styles.termsLine}>
              Al continuar aceptas nuestros Términos y la Política de privacidad.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </Animated.View>
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
    borderWidth: 1,
  },
  inputSuccess: {
    borderColor: 'rgba(255, 255, 255, 0.7)',
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
  button: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
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
    color: '#1a1a1a',
  },
  separator: {
    width: '100%',
    height: 1,
    backgroundColor: '#333',
    marginBottom: 24,
  },
  lastUsedBadge: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    zIndex: 2,
  },
  lastUsedBadgeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
  codeLinkBtn: {
    paddingVertical: 10,
  },
  codeLinkText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  codeBox: {
    width: '100%',
  },
  codeHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 12,
  },
  codeInput: {
    width: '100%',
    height: 54,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    color: '#fff',
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 12,
  },
  termsLine: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 12,
  },
  googleButton: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
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

