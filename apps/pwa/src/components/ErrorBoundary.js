import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { currentConfig } from '../config/environment';
import logger from '../utils/logger';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    logger.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // In production, you might want to send this to a crash reporting service
    // Skip on web (monitoring service uses React Native Firebase)
    if (currentConfig.enableCrashReporting && typeof window === 'undefined') {
      try {
        const { reportError } = require('../services/monitoringService');
        reportError(error, {
          component: 'ErrorBoundary',
          errorInfo: errorInfo?.componentStack,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        // Monitoring service not available (e.g., on web)
        logger.warn('Monitoring service not available for error reporting');
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Check for debug mode
      const isDebugMode = typeof window !== 'undefined' && 
        (localStorage.getItem('WAKE_DEBUG') === 'true' || 
         window.location.search.includes('debug=true'));
      
      // Fallback UI
      return (
        <View style={styles.container}>
          <Text style={styles.title}>¡Oops! Algo salió mal</Text>
          <Text style={styles.message}>
            La aplicación encontró un error inesperado. Por favor, intenta de nuevo.
          </Text>
          
          {(isDebugMode || currentConfig.debugMode) && this.state.error && (
            <View style={styles.debugContainer}>
              <Text style={styles.debugTitle}>Error Details (Debug Mode):</Text>
              <Text style={styles.debugText}>
                {this.state.error.toString()}
              </Text>
              {this.state.error?.stack && (
                <Text style={styles.debugText}>
                  Stack: {this.state.error.stack.split('\n').slice(0, 10).join('\n')}
                </Text>
              )}
              {this.state.errorInfo && (
                <Text style={styles.debugText}>
                  Component Stack: {this.state.errorInfo.componentStack}
                </Text>
              )}
            </View>
          )}
          
          <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
          
          {typeof window !== 'undefined' && (
            <TouchableOpacity 
              style={[styles.retryButton, { marginTop: 12, backgroundColor: '#333' }]} 
              onPress={() => {
                if (typeof window !== 'undefined') {
                  localStorage.setItem('WAKE_DEBUG', 'true');
                  window.location.reload();
                }
              }}
            >
              <Text style={styles.retryButtonText}>Enable Debug Mode & Reload</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1a1a1a',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#cccccc',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  debugContainer: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    width: '100%',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff6b6b',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: '#cccccc',
    fontFamily: 'monospace',
  },
  retryButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.72)',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ErrorBoundary;
