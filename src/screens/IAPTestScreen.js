import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import iapService from '../services/iapService';
import logger from '../utils/logger';

const IAPTestScreen = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [productId, setProductId] = useState('wake.monthly.subscription');
  const [logs, setLogs] = useState([]);

  // Override logger to capture logs
  const originalLog = logger.log;
  const originalWarn = logger.warn;
  const originalError = logger.error;

  React.useEffect(() => {
    logger.log = (...args) => {
      originalLog(...args);
      setLogs(prev => [...prev, { type: 'log', message: args.join(' '), timestamp: new Date().toISOString() }]);
    };
    logger.warn = (...args) => {
      originalWarn(...args);
      setLogs(prev => [...prev, { type: 'warn', message: args.join(' '), timestamp: new Date().toISOString() }]);
    };
    logger.error = (...args) => {
      originalError(...args);
      setLogs(prev => [...prev, { type: 'error', message: args.join(' '), timestamp: new Date().toISOString() }]);
    };

    return () => {
      logger.log = originalLog;
      logger.warn = originalWarn;
      logger.error = originalError;
    };
  }, []);

  const runTest = async () => {
    try {
      setLoading(true);
      setResults(null);
      setLogs([]);

      const productIds = productId.split(',').map(id => id.trim()).filter(id => id.length > 0);
      
      logger.log('🧪 Starting product fetching test...');
      const testResults = await iapService.testProductFetching(productIds);
      
      setResults(testResults);
      
      if (testResults.success) {
        Alert.alert('Success', `Found ${testResults.summary.found} product(s)!`);
      } else {
        Alert.alert('Test Complete', `No products found. Check logs for details.`);
      }
    } catch (error) {
      logger.error('Test error:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = () => {
    setLogs([]);
    setResults(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>IAP Product Testing</Text>
        <Text style={styles.subtitle}>Test product fetching from App Store Connect</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Product ID(s):</Text>
          <Text style={styles.hint}>Enter one or more product IDs separated by commas</Text>
          <TextInput
            style={styles.input}
            value={productId}
            onChangeText={setProductId}
            placeholder="wake.monthly.subscription"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={runTest}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Run Test</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={clearLogs}
        >
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Clear Logs</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#e74c3c' }]}
          onPress={() => {
            iapService.cancelPurchase();
            Alert.alert('Purchase Canceled', 'Purchase state has been reset. You can now try purchasing again.');
          }}
        >
          <Text style={styles.buttonText}>🛑 Cancel/Reset Purchase</Text>
        </TouchableOpacity>

        {results && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsTitle}>Test Results</Text>
            
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>Summary</Text>
              <Text style={styles.summaryText}>Total tested: {results.summary.totalTested}</Text>
              <Text style={[styles.summaryText, { color: '#2ecc71' }]}>Found: {results.summary.found}</Text>
              <Text style={[styles.summaryText, { color: '#e74c3c' }]}>Not found: {results.summary.notFound}</Text>
              <Text style={[styles.summaryText, { color: '#f39c12' }]}>Errors: {results.summary.errors}</Text>
            </View>

            {results.appInfo && (
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>App Info</Text>
                <Text style={styles.infoText}>Bundle ID: {results.appInfo.bundleId}</Text>
                <Text style={styles.infoText}>Version: {results.appInfo.version}</Text>
                <Text style={styles.infoText}>Build: {results.appInfo.buildNumber}</Text>
              </View>
            )}

            {results.connectionStatus && (
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Connection Status</Text>
                <Text style={styles.infoText}>
                  Connected: {results.connectionStatus.connected ? '✅ Yes' : '❌ No'}
                </Text>
              </View>
            )}

            {results.testResults && results.testResults.length > 0 && (
              <View style={styles.testResultsBox}>
                <Text style={styles.infoTitle}>Product Test Results</Text>
                {results.testResults.map((test, index) => (
                  <View key={index} style={styles.testResultItem}>
                    <Text style={styles.testProductId}>{test.productId}</Text>
                    <Text style={styles.testStatus}>
                      {test.productsFound > 0 ? '✅ Found' : '❌ Not Found'}
                    </Text>
                    {test.productDetails && (
                      <View style={styles.productDetails}>
                        <Text style={styles.productDetailText}>Title: {test.productDetails.title}</Text>
                        <Text style={styles.productDetailText}>Price: {test.productDetails.priceString}</Text>
                        {test.productDetails.subscriptionPeriod && (
                          <Text style={styles.productDetailText}>
                            Period: {test.productDetails.subscriptionPeriod}
                          </Text>
                        )}
                      </View>
                    )}
                    {test.error && (
                      <Text style={styles.errorText}>Error: {test.error}</Text>
                    )}
                    <Text style={styles.responseCodeText}>
                      Response: {test.responseCodeName} ({test.responseCode})
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {logs.length > 0 && (
          <View style={styles.logsContainer}>
            <Text style={styles.logsTitle}>Logs ({logs.length})</Text>
            <ScrollView style={styles.logsScroll} nestedScrollEnabled>
              {logs.map((log, index) => (
                <Text
                  key={index}
                  style={[
                    styles.logText,
                    log.type === 'error' && styles.logError,
                    log.type === 'warn' && styles.logWarn,
                  ]}
                >
                  {log.message}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonSecondary: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: '#fff',
  },
  resultsContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  summaryBox: {
    padding: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 4,
  },
  infoBox: {
    padding: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 4,
  },
  testResultsBox: {
    marginTop: 16,
  },
  testResultItem: {
    padding: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    marginBottom: 12,
  },
  testProductId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
  },
  testStatus: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  productDetails: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  productDetailText: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 14,
    color: '#e74c3c',
    marginTop: 8,
  },
  responseCodeText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  logsContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    maxHeight: 300,
  },
  logsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  logsScroll: {
    maxHeight: 250,
  },
  logText: {
    fontSize: 12,
    color: '#ccc',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  logError: {
    color: '#e74c3c',
  },
  logWarn: {
    color: '#f39c12',
  },
});

export default IAPTestScreen;
