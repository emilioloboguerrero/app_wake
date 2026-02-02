// Legal Documents WebView Component
// Opens https://wakelab.co/legal for legal documents (Terms, Privacy, Refund)
// On web browsers, opens externally instead of WebView

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TouchableOpacity,
  Text,
} from 'react-native';
import { WebView } from 'react-native-webview';
import logger from '../utils/logger';
import { isWeb, isPWA } from '../utils/platform';

const LEGAL_URL = 'https://wakelab.co/legal';

const LegalDocumentsWebView = ({
  visible,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [useRedirect, setUseRedirect] = useState(false);

  // Handle redirect for web browsers
  const handleWebRedirect = () => {
    if (!isWeb) return;
    
    logger.log('🌐 [LegalDocumentsWebView] Using redirect for web browser');
    setUseRedirect(true);
    setLoading(false);
    
    // Open legal documents in new window/tab
    try {
      const newWindow = window.open(
        LEGAL_URL,
        '_blank',
        'noopener,noreferrer'
      );
      
      if (!newWindow) {
        // Popup blocked - show alert with manual link
        Alert.alert(
          'Ventana bloqueada',
          'Por favor permite ventanas emergentes para ver los documentos legales, o haz clic en el botón para abrir manualmente.',
          [
            {
              text: 'Abrir manualmente',
              onPress: () => {
                window.open(LEGAL_URL, '_blank');
              }
            },
            {
              text: 'Cerrar',
              style: 'cancel',
              onPress: () => {
                onClose?.();
              }
            }
          ]
        );
        return;
      }
      
      // Focus the new window
      newWindow.focus();
      
      // Close modal after opening external window
      setTimeout(() => {
        onClose?.();
      }, 500);
    } catch (err) {
      logger.error('❌ [LegalDocumentsWebView] Error opening redirect window:', err);
      setError('Error al abrir los documentos legales');
      setLoading(false);
    }
  };

  // Auto-redirect on web when modal opens
  useEffect(() => {
    if (visible && isWeb && !isPWA()) {
      // For regular web browsers, use redirect immediately
      logger.log('🌐 [LegalDocumentsWebView] Web browser detected - using redirect instead of WebView');
      handleWebRedirect();
    } else if (visible) {
      // For PWA or native, reset state
      setUseRedirect(false);
      setLoading(true);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Handle WebView navigation
  const handleNavigationStateChange = (navState) => {
    logger.debug('📍 Legal WebView Navigation:', navState.url);
  };

  // Handle WebView load
  const handleWebViewLoad = () => {
    logger.debug('✅ Legal documents loaded');
    setLoading(false);
    setError(null);
  };

  // Handle WebView error
  const handleWebViewError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    logger.error('❌ Legal WebView error:', nativeEvent);
    
    // On web, if error occurs, redirect
    if (isWeb && !isPWA()) {
      logger.warn('⚠️ [LegalDocumentsWebView] WebView error on web - redirecting');
      handleWebRedirect();
    } else {
      setError('Error al cargar los documentos legales');
      setLoading(false);
    }
  };

  // Handle close
  const handleClose = () => {
    setLoading(true);
    setError(null);
    setUseRedirect(false);
    onClose?.();
  };

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
          <Text style={styles.headerTitle}>Documentos Legales</Text>
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
                <Text style={styles.redirectTitle}>Abriendo documentos legales...</Text>
                <Text style={styles.redirectText}>
                  Se abrirá una nueva ventana con los términos y condiciones, política de privacidad y política de reembolsos.
                </Text>
                {error && (
                  <Text style={styles.redirectErrorText}>{error}</Text>
                )}
                <TouchableOpacity
                  style={styles.redirectButton}
                  onPress={() => {
                    window.open(LEGAL_URL, '_blank');
                  }}
                >
                  <Text style={styles.redirectButtonText}>Abrir documentos legales</Text>
                </TouchableOpacity>
                <Text style={styles.redirectSubtext}>
                  Si la ventana no se abrió automáticamente, haz clic en el botón arriba.
                </Text>
              </View>
            </View>
          ) : (
            <>
              {loading && (
                <View style={styles.loadingContainer}>
                  <View style={styles.loadingContent}>
                    <ActivityIndicator size="large" color="#FFFFFF" />
                    <Text style={styles.loadingText}>Cargando documentos...</Text>
                    <Text style={styles.loadingSubtext}>Conectando con nuestros términos y políticas</Text>
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
                      }}
                    >
                      <Text style={styles.retryButtonText}>Reintentar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <WebView
                source={{ uri: LEGAL_URL }}
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
            </>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Documentos legales de Wake
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    backgroundColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
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
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.8,
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1a1a1a',
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
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#333333',
    backgroundColor: '#1a1a1a',
  },
  footerText: {
    fontSize: 12,
    color: '#CCCCCC',
    textAlign: 'center',
    opacity: 0.7,
  },
  redirectContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  redirectContent: {
    alignItems: 'center',
    maxWidth: 400,
  },
  redirectTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  redirectText: {
    fontSize: 16,
    color: '#CCCCCC',
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

export default LegalDocumentsWebView;
