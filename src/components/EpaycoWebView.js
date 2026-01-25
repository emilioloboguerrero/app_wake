// Simple Epayco WebView Component
// Opens Epayco checkout URLs in a WebView (native) or redirects to new window (web)

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  Text,
  Image,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import logger from '../utils/logger';
import { isWeb, isPWA } from '../utils/platform';

const MERCADO_PAGO_LOGO = require('../../assets/images.png');
const MERCADO_PAGO_LOADING_LOGO = require('../../assets/mercado-pago-logo-png_seeklogo-342347.png');

const EpaycoWebView = ({
  visible,
  onClose,
  checkoutURL,
  onPaymentSuccess,
  onPaymentError,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [useRedirect, setUseRedirect] = useState(false);
  const redirectWindowRef = useRef(null);
  const loadTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const webViewLoadStartRef = useRef(false);

  // Handle redirect for web browsers (Mercado Pago blocks iframes)
  const handleWebRedirect = () => {
    if (!checkoutURL || !isWeb) return;
    
    logger.log('🌐 [EpaycoWebView] Using redirect for web browser');
    setUseRedirect(true);
    setLoading(false);
    
    // Open checkout in new window
    try {
      const newWindow = window.open(
        checkoutURL,
        'MercadoPagoCheckout',
        'width=800,height=600,scrollbars=yes,resizable=yes'
      );
      
      if (!newWindow) {
        // Popup blocked - show alert
        Alert.alert(
          'Popup bloqueado',
          'Por favor permite ventanas emergentes para completar el pago, o haz clic en el botón para abrir manualmente.',
          [
            {
              text: 'Abrir manualmente',
              onPress: () => {
                window.open(checkoutURL, '_blank');
              }
            },
            {
              text: 'Cancelar',
              style: 'cancel',
              onPress: () => {
                onPaymentError?.({ url: checkoutURL, reason: 'popup_blocked' });
                onClose?.();
              }
            }
          ]
        );
        return;
      }
      
      redirectWindowRef.current = newWindow;
      
      // Poll to check if window is closed (payment completed)
      pollIntervalRef.current = setInterval(() => {
        if (newWindow.closed) {
          logger.log('✅ [EpaycoWebView] Redirect window closed - payment may be complete');
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          
          // Give a moment for webhook to process, then trigger success
          // The Firestore listener will detect the purchase
          setTimeout(() => {
            onPaymentSuccess?.({ url: checkoutURL, method: 'redirect' });
            onClose?.();
          }, 2000);
        }
      }, 1000);
      
      // Focus the new window
      newWindow.focus();
    } catch (err) {
      logger.error('❌ [EpaycoWebView] Error opening redirect window:', err);
      setError('Error al abrir la página de pago');
      setLoading(false);
    }
  };

  // Cleanup on unmount or close
  useEffect(() => {
    if (!visible) {
      // Clear intervals
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      // Close redirect window if still open
      if (redirectWindowRef.current && !redirectWindowRef.current.closed) {
        redirectWindowRef.current.close();
        redirectWindowRef.current = null;
      }
      // Reset state
      setUseRedirect(false);
      setLoading(true);
      setError(null);
      webViewLoadStartRef.current = false;
    }
  }, [visible]);

  // Handle WebView load start
  const handleWebViewLoadStart = () => {
    logger.debug('📍 [EpaycoWebView] WebView load started');
    webViewLoadStartRef.current = true;
    
    // Set timeout for web (15 seconds) - if page doesn't load, likely blocked
    if (isWeb && !isPWA()) {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      
      loadTimeoutRef.current = setTimeout(() => {
        if (loading && webViewLoadStartRef.current) {
          logger.warn('⚠️ [EpaycoWebView] WebView load timeout - likely blocked by X-Frame-Options');
          setError('La página de pago no se puede cargar en esta ventana. Redirigiendo...');
          
          // Wait a moment, then redirect
          setTimeout(() => {
            handleWebRedirect();
          }, 1000);
        }
      }, 15000);
    }
  };

  // Handle WebView navigation
  const handleNavigationStateChange = (navState) => {
    logger.debug('📍 WebView Navigation:', navState.url);
    
    // Clear timeout if navigation happens
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    
    // Check for actual payment success URLs (only after leaving checkout)
    const successPatterns = [
      '/congrats/approved',
      '/congrats/success',
      '/success',
      '/approved',
      '/payment-approved',
      '/payment-success',
      '/exito', // Spanish success
      '/pago-exitoso', // Spanish payment success
    ];
    
    // Check for subscription management page (after subscription completion)
    // This is the page Mercado Pago redirects to after subscription is set up
    const isSubscriptionManagementPage = navState.url.includes('/subscriptions') && 
                                        !navState.url.includes('/checkout') &&
                                        !navState.url.includes('preapproval_id');
    
    const isPaymentSuccess = successPatterns.some(pattern => 
      navState.url.includes(pattern)
    );
    
    // If user is redirected to subscription management page or success page, payment is complete
    if (isPaymentSuccess || isSubscriptionManagementPage) {
      logger.debug('✅ Payment/Subscription success detected:', navState.url);
      onPaymentSuccess?.({ url: navState.url });
      onClose?.();
      return;
    }

    // Check if it's a checkout page (should NOT trigger success)
    const isCheckoutPage = navState.url.includes('/checkout/v1/payment/redirect?') || 
                          navState.url.includes('/subscriptions/checkout') ||
                          navState.url.includes('preapproval_id');
    
    // For checkout pages, don't do anything - let the user complete the payment
    if (isCheckoutPage) {
      return; // Stay on checkout page, don't close modal
    }
    
    // Check for payment error URLs
    const errorPatterns = [
      '/error',
      '/declined',
      '/rejected',
      '/failed',
      '/fallido', // Spanish failed
      '/pago-fallido', // Spanish payment failed
    ];
    
    const isPaymentError = errorPatterns.some(pattern => 
      navState.url.includes(pattern)
    );
    
    if (isPaymentError) {
      logger.debug('❌ Payment error detected:', navState.url);
      onPaymentError?.({ url: navState.url });
      onClose?.();
      return;
    }
  };

  // Handle WebView load
  const handleWebViewLoad = () => {
    logger.debug('✅ [EpaycoWebView] Epayco checkout loaded');
    setLoading(false);
    setError(null);
    webViewLoadStartRef.current = false;
    
    // Clear timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  };

  // Handle WebView error
  const handleWebViewError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    logger.error('❌ [EpaycoWebView] WebView error:', nativeEvent);
    
    // On web, if error occurs, likely X-Frame-Options blocking
    if (isWeb && !isPWA()) {
      logger.warn('⚠️ [EpaycoWebView] WebView error on web - likely X-Frame-Options blocking');
      setError('La página de pago no se puede cargar aquí. Redirigiendo...');
      
      // Redirect after showing error briefly
      setTimeout(() => {
        handleWebRedirect();
      }, 1500);
    } else {
      setError('Error al cargar la página de pago');
      setLoading(false);
    }
    
    webViewLoadStartRef.current = false;
    
    // Clear timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  };

  // Handle HTTP errors
  const handleHttpError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    logger.error('❌ [EpaycoWebView] HTTP error:', nativeEvent);
    
    // On web, redirect on HTTP errors too
    if (isWeb && !isPWA() && nativeEvent.statusCode >= 400) {
      logger.warn('⚠️ [EpaycoWebView] HTTP error on web - redirecting');
      handleWebRedirect();
    }
  };

  // Handle close
  const handleClose = () => {
    // Clear intervals
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    // Close redirect window if still open
    if (redirectWindowRef.current && !redirectWindowRef.current.closed) {
      redirectWindowRef.current.close();
      redirectWindowRef.current = null;
    }
    
    setLoading(true);
    setError(null);
    setUseRedirect(false);
    webViewLoadStartRef.current = false;
    onClose?.();
  };

  // Auto-redirect on web when modal opens
  useEffect(() => {
    if (visible && checkoutURL && isWeb && !isPWA()) {
      // For regular web browsers, use redirect immediately
      logger.log('🌐 [EpaycoWebView] Web browser detected - using redirect instead of WebView');
      handleWebRedirect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, checkoutURL]);

  if (!checkoutURL) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <View style={styles.headerBranding}>
            <Image source={MERCADO_PAGO_LOGO} style={styles.headerLogo} />
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {useRedirect ? (
            // Redirect mode for web browsers
            <View style={styles.redirectContainer}>
              <View style={styles.redirectContent}>
                <Image source={MERCADO_PAGO_LOADING_LOGO} style={styles.loadingLogo} />
                <Text style={styles.redirectTitle}>Redirigiendo a Mercado Pago...</Text>
                <Text style={styles.redirectText}>
                  Se abrirá una nueva ventana para completar tu pago de forma segura.
                </Text>
                {error && (
                  <Text style={styles.redirectErrorText}>{error}</Text>
                )}
                <TouchableOpacity
                  style={styles.redirectButton}
                  onPress={() => {
                    if (checkoutURL) {
                      window.open(checkoutURL, '_blank');
                    }
                  }}
                >
                  <Text style={styles.redirectButtonText}>Abrir página de pago</Text>
                </TouchableOpacity>
                <Text style={styles.redirectSubtext}>
                  Si la ventana no se abrió automáticamente, haz clic en el botón arriba.
                </Text>
                <Text style={styles.redirectSubtext}>
                  Una vez completes el pago, puedes cerrar esta ventana.
                </Text>
              </View>
            </View>
          ) : (
            <>
              {loading && (
                <View style={styles.loadingContainer}>
                  <View style={styles.loadingContent}>
                    <Image source={MERCADO_PAGO_LOADING_LOGO} style={styles.loadingLogo} />
                    <ActivityIndicator size="large" color="#4A4A4A" />
                    <Text style={styles.loadingText}>Procesando pago seguro...</Text>
                    <Text style={styles.loadingSubtext}>Espera mientras cargamos tu información</Text>
                  </View>
                </View>
              )}

              {error && !useRedirect && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                  {isWeb && !isPWA() ? (
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={handleWebRedirect}
                    >
                      <Text style={styles.retryButtonText}>Abrir en nueva ventana</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={() => {
                        setError(null);
                        setLoading(true);
                        webViewLoadStartRef.current = false;
                      }}
                    >
                      <Text style={styles.retryButtonText}>Reintentar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <WebView
                source={{ uri: checkoutURL }}
                style={styles.webview}
                onNavigationStateChange={handleNavigationStateChange}
                onLoadStart={handleWebViewLoadStart}
                onLoad={handleWebViewLoad}
                onError={handleWebViewError}
                onHttpError={handleHttpError}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                scalesPageToFit={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                mixedContentMode="compatibility"
                onShouldStartLoadWithRequest={(request) => {
                  // Allow all navigation within the WebView
                  return true;
                }}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    backgroundColor: '#FFFFFF',
  },
  headerSpacer: {
    width: 32,
    height: 32,
  },
  headerBranding: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 100,
    height: 30,
    resizeMode: 'contain',
    opacity: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    position: 'relative',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingLogo: {
    width: 96,
    height: 96,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#1a1a1a',
    textAlign: 'center',
    opacity: 0.8,
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1000,
  },
  errorText: {
    fontSize: 16,
    color: '#FF6B6B',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#BFB84D',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  redirectContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  redirectContent: {
    alignItems: 'center',
    maxWidth: 400,
  },
  redirectTitle: {
    marginTop: 20,
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 16,
  },
  redirectText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  redirectErrorText: {
    fontSize: 14,
    color: '#ff4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  redirectButton: {
    backgroundColor: '#BFB84D',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 16,
  },
  redirectButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  redirectSubtext: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
});

export default EpaycoWebView;
