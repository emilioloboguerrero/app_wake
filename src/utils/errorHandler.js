// Centralized Error Handling for Wake
// Provides user-friendly error messages and proper error handling

import { Alert } from 'react-native';
import logger from './logger';

/**
 * Error types we handle
 */
export const ErrorTypes = {
  NETWORK: 'network',
  AUTH: 'auth',
  PAYMENT: 'payment',
  FIREBASE: 'firebase',
  VALIDATION: 'validation',
  UNKNOWN: 'unknown',
};

/**
 * User-friendly error messages in Spanish
 */
const ErrorMessages = {
  // Network errors
  'network/offline': 'No tienes conexión a internet. Verifica tu conexión e intenta de nuevo.',
  'network/timeout': 'La solicitud tardó demasiado. Por favor, intenta de nuevo.',
  'network/slow': 'Tu conexión es lenta. Esto puede tardar un poco...',
  
  // Auth errors
  'auth/user-not-found': 'No existe una cuenta con este correo electrónico.',
  'auth/wrong-password': 'Contraseña incorrecta. Por favor, intenta de nuevo.',
  'auth/email-already-in-use': 'Ya existe una cuenta con este correo electrónico.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'El correo electrónico no es válido.',
  'auth/user-disabled': 'Esta cuenta ha sido deshabilitada.',
  'auth/too-many-requests': 'Demasiados intentos fallidos. Intenta más tarde.',
  'auth/network-request-failed': 'Error de conexión. Verifica tu internet.',
  'auth/session-expired': 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.',
  
  // Payment errors
  'payment/failed': 'El pago no pudo procesarse. Por favor, intenta de nuevo.',
  'payment/cancelled': 'El pago fue cancelado.',
  'payment/invalid-card': 'Los datos de la tarjeta no son válidos.',
  'payment/insufficient-funds': 'Fondos insuficientes.',
  'payment/network-error': 'Error de conexión durante el pago. Tu tarjeta no fue cargada.',
  
  // Firebase/Firestore errors
  'firebase/permission-denied': 'No tienes permisos para realizar esta acción.',
  'firebase/not-found': 'No se encontró el recurso solicitado.',
  'firebase/already-exists': 'Este recurso ya existe.',
  'firebase/unavailable': 'El servicio no está disponible. Intenta más tarde.',
  'firebase/deadline-exceeded': 'La operación tardó demasiado. Intenta de nuevo.',
  
  // Validation errors
  'validation/invalid-input': 'Por favor, verifica que todos los campos sean correctos.',
  'validation/required-field': 'Este campo es obligatorio.',
  'validation/invalid-format': 'El formato no es válido.',
  
  // Generic errors
  'unknown': 'Ocurrió un error inesperado. Por favor, intenta de nuevo.',
};

/**
 * Map Firebase/common errors to our error types
 */
function categorizeError(error) {
  if (!error) return ErrorTypes.UNKNOWN;
  
  const errorCode = error.code || '';
  const errorMessage = error.message || '';
  
  // Network errors
  if (errorCode.includes('network') || errorMessage.toLowerCase().includes('network')) {
    return ErrorTypes.NETWORK;
  }
  
  // Auth errors
  if (errorCode.startsWith('auth/')) {
    return ErrorTypes.AUTH;
  }
  
  // Payment errors
  if (errorCode.startsWith('payment/')) {
    return ErrorTypes.PAYMENT;
  }
  
  // Firebase errors
  if (errorCode.includes('permission') || errorCode.includes('firestore') || errorCode.includes('storage')) {
    return ErrorTypes.FIREBASE;
  }
  
  // Validation errors
  if (errorCode.startsWith('validation/')) {
    return ErrorTypes.VALIDATION;
  }
  
  return ErrorTypes.UNKNOWN;
}

/**
 * Get user-friendly error message
 */
function getErrorMessage(error) {
  if (!error) return ErrorMessages.unknown;
  
  const errorCode = error.code;
  
  // Try to find specific error message
  if (errorCode && ErrorMessages[errorCode]) {
    return ErrorMessages[errorCode];
  }
  
  // Try to extract meaningful message from error
  if (error.message) {
    // Check if message contains known error patterns
    const lowerMessage = error.message.toLowerCase();
    
    if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
      return ErrorMessages['network/offline'];
    }
    
    if (lowerMessage.includes('permission')) {
      return ErrorMessages['firebase/permission-denied'];
    }
    
    if (lowerMessage.includes('not found')) {
      return ErrorMessages['firebase/not-found'];
    }
  }
  
  // Default fallback
  return ErrorMessages.unknown;
}

/**
 * Show error alert to user
 */
export function showErrorAlert(error, title = 'Error') {
  const message = getErrorMessage(error);
  
  Alert.alert(
    title,
    message,
    [{ text: 'Entendido', style: 'default' }],
    { cancelable: true }
  );
}

/**
 * Show error with retry option
 */
export function showErrorWithRetry(error, onRetry, title = 'Error') {
  const message = getErrorMessage(error);
  
  Alert.alert(
    title,
    message,
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Reintentar', onPress: onRetry, style: 'default' }
    ],
    { cancelable: true }
  );
}

/**
 * Handle error comprehensively
 * - Logs error
 * - Shows user-friendly message
 * - Optionally provides retry
 */
export function handleError(error, options = {}) {
  const {
    showAlert = true,
    logError = true,
    title = 'Error',
    onRetry = null,
    context = '',
  } = options;
  
  // Log error for debugging
  if (logError) {
    const errorType = categorizeError(error);
    logger.error(`[${errorType}] ${context}`, error);
  }
  
  // Show user-friendly alert
  if (showAlert) {
    if (onRetry) {
      showErrorWithRetry(error, onRetry, title);
    } else {
      showErrorAlert(error, title);
    }
  }
  
  return {
    type: categorizeError(error),
    message: getErrorMessage(error),
    originalError: error,
  };
}

/**
 * Handle async operations with automatic error handling
 */
export async function withErrorHandling(asyncFn, options = {}) {
  try {
    return await asyncFn();
  } catch (error) {
    handleError(error, options);
    throw error; // Re-throw so caller can handle if needed
  }
}

/**
 * Check network connectivity
 */
export async function checkNetworkConnectivity() {
  try {
    const response = await fetch('https://www.google.com', {
      method: 'HEAD',
      cache: 'no-cache',
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Handle network-dependent operations
 */
export async function handleNetworkOperation(asyncFn, options = {}) {
  const {
    checkConnection = true,
    offlineMessage = 'No tienes conexión a internet',
    ...otherOptions
  } = options;
  
  // Check connection if requested
  if (checkConnection) {
    const isConnected = await checkNetworkConnectivity();
    if (!isConnected) {
      const error = new Error(offlineMessage);
      error.code = 'network/offline';
      handleError(error, { ...otherOptions, context: 'Network Check' });
      throw error;
    }
  }
  
  // Execute operation with error handling
  return withErrorHandling(asyncFn, otherOptions);
}

/**
 * Create custom error
 */
export function createError(code, message) {
  const error = new Error(message || ErrorMessages[code] || ErrorMessages.unknown);
  error.code = code;
  return error;
}

/**
 * Validate and handle errors in one step
 */
export function validateOrThrow(condition, errorCode, customMessage) {
  if (!condition) {
    throw createError(errorCode, customMessage);
  }
}

/**
 * Safe async wrapper - never throws, always returns [error, result]
 */
export async function safeAsync(asyncFn) {
  try {
    const result = await asyncFn();
    return [null, result];
  } catch (error) {
    return [error, null];
  }
}

export default {
  handleError,
  withErrorHandling,
  handleNetworkOperation,
  showErrorAlert,
  showErrorWithRetry,
  checkNetworkConnectivity,
  createError,
  validateOrThrow,
  safeAsync,
  ErrorTypes,
};