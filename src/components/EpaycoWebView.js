// Simple Epayco WebView Component
// Opens Epayco checkout URLs in a WebView

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  Text,
  Image,
} from 'react-native';
import { WebView } from 'react-native-webview';

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

  // Handle WebView navigation
  const handleNavigationStateChange = (navState) => {
    console.log('📍 WebView Navigation:', navState.url);
    
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
      console.log('✅ Payment/Subscription success detected:', navState.url);
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
      console.log('❌ Payment error detected:', navState.url);
      onPaymentError?.({ url: navState.url });
      onClose?.();
      return;
    }
  };

  // Handle WebView load
  const handleWebViewLoad = () => {
    console.log('✅ Epayco checkout loaded');
    setLoading(false);
    setError(null);
  };

  // Handle WebView error
  const handleWebViewError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    console.error('❌ WebView error:', nativeEvent);
    setError('Error al cargar la página de pago');
    setLoading(false);
  };

  // Handle close
  const handleClose = () => {
    setLoading(true);
    setError(null);
    onClose?.();
  };

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

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setError(null);
                  setLoading(true);
                }}
              >
                <Text style={styles.retryButtonText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          )}

          <WebView
            source={{ uri: checkoutURL }}
            style={styles.webview}
            onNavigationStateChange={handleNavigationStateChange}
            onLoad={handleWebViewLoad}
            onError={handleWebViewError}
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
});

export default EpaycoWebView;
