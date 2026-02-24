// Legal Documents WebView Component
// Opens https://wakelab.co/legal for legal documents (Terms, Privacy, Refund)
// On web/PWA: open link immediately (new tab, or same tab if popup blocked) — no modal. On native: modal with WebView.

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Text,
} from 'react-native';
import { WebView } from 'react-native-webview';
import logger from '../utils/logger';
import WakeLoader from './WakeLoader';
import { isWeb } from '../utils/platform';

const LEGAL_URL = 'https://wakelab.co/legal';

// Top padding inside the modal so content starts further down (native only)
const MODAL_CONTENT_TOP_PADDING = 32;

const LegalDocumentsWebView = ({
  visible,
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasOpenedRef = useRef(false);

  // On web: open legal URL immediately when "modal" would open — no modal, same as payment redirect
  useEffect(() => {
    if (!visible || !isWeb) return;
    if (hasOpenedRef.current) return;
    hasOpenedRef.current = true;
    logger.log('🌐 [LegalDocumentsWebView] Opening legal page immediately');
    try {
      const w = window.open(LEGAL_URL, '_blank', 'noopener,noreferrer');
      if (w) {
        w.focus();
      } else {
        // Popup blocked: open in same tab (like payment full-page redirect)
        window.location.href = LEGAL_URL;
      }
      onClose?.();
    } catch (err) {
      logger.error('❌ [LegalDocumentsWebView] Error opening legal URL:', err);
      window.location.href = LEGAL_URL;
      onClose?.();
    }
  }, [visible, isWeb, onClose]);

  useEffect(() => {
    if (!visible) hasOpenedRef.current = false;
  }, [visible]);

  // Handle WebView navigation (native only)
  const handleNavigationStateChange = (navState) => {
    logger.debug('📍 Legal WebView Navigation:', navState.url);
  };

  const handleWebViewLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleWebViewError = (syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    logger.error('❌ Legal WebView error:', nativeEvent);
    setError('Error al cargar los documentos legales');
    setLoading(false);
  };

  const handleClose = () => {
    setLoading(true);
    setError(null);
    onClose?.();
  };

  // On web we open the link immediately in useEffect; don't show the modal
  if (isWeb && visible) {
    return null;
  }

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Documentos Legales</Text>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.content, { paddingTop: MODAL_CONTENT_TOP_PADDING }]}>
          {loading && (
            <View style={styles.loadingContainer}>
              <View style={styles.loadingContent}>
                <WakeLoader />
                <Text style={styles.loadingText}>Cargando documentos...</Text>
                <Text style={styles.loadingSubtext}>Conectando con nuestros términos y políticas</Text>
              </View>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => { setError(null); setLoading(true); }}
              >
                <Text style={styles.retryButtonText}>Reintentar</Text>
              </TouchableOpacity>
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
            onShouldStartLoadWithRequest={() => true}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Documentos legales de Wake</Text>
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
});

export default LegalDocumentsWebView;
