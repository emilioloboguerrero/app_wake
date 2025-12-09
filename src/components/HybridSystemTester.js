// Hybrid System Test Component
// Add this to any screen to test the hybrid system
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import hybridDataService from '../services/hybridDataService';

const HybridSystemTester = ({ userId }) => {
  const [cacheStatus, setCacheStatus] = useState(null);
  const [testResults, setTestResults] = useState([]);

  const addTestResult = (message) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const checkCacheStatus = async () => {
    const status = await hybridDataService.getCacheStatus();
    setCacheStatus(status);
    addTestResult('Cache status checked');
  };

  const clearCache = async () => {
    await hybridDataService.clearCacheForTesting();
    addTestResult('Cache cleared - next loads will hit DB');
    await checkCacheStatus();
  };

  const testUserProfileLoad = async () => {
    addTestResult('Testing user profile load...');
    const start = Date.now();
    await hybridDataService.loadUserProfile(userId);
    const duration = Date.now() - start;
    addTestResult(`User profile loaded in ${duration}ms`);
  };

  const testCoursesLoad = async () => {
    addTestResult('Testing courses load...');
    const start = Date.now();
    await hybridDataService.loadCourses();
    const duration = Date.now() - start;
    addTestResult(`Courses loaded in ${duration}ms`);
  };

  const forceSync = async () => {
    addTestResult('Force syncing all data...');
    const start = Date.now();
    await hybridDataService.forceSyncAll(userId);
    const duration = Date.now() - start;
    addTestResult(`Force sync completed in ${duration}ms`);
    await checkCacheStatus();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔍 Hybrid System Tester</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={checkCacheStatus}>
          <Text style={styles.buttonText}>Check Cache Status</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={clearCache}>
          <Text style={styles.buttonText}>Clear Cache</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={testUserProfileLoad}>
          <Text style={styles.buttonText}>Test Profile Load</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={testCoursesLoad}>
          <Text style={styles.buttonText}>Test Courses Load</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={forceSync}>
          <Text style={styles.buttonText}>Force Sync All</Text>
        </TouchableOpacity>
      </View>

      {cacheStatus && (
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>📊 Cache Status:</Text>
          <Text style={styles.statusText}>
            User Profile: {cacheStatus.userProfile.exists ? '✅' : '❌'} 
            {cacheStatus.userProfile.isStale ? ' (Stale)' : ' (Fresh)'}
            {'\n'}Last Sync: {cacheStatus.userProfile.lastSync}
          </Text>
          <Text style={styles.statusText}>
            Courses: {cacheStatus.courses.exists ? '✅' : '❌'} 
            {cacheStatus.courses.isStale ? ' (Stale)' : ' (Fresh)'}
            {'\n'}Count: {cacheStatus.courses.count} | Last Sync: {cacheStatus.courses.lastSync}
          </Text>
          <Text style={styles.statusText}>
            Progress: {cacheStatus.progress.exists ? '✅' : '❌'} 
            {cacheStatus.progress.isStale ? ' (Stale)' : ' (Fresh)'}
            {'\n'}Last Sync: {cacheStatus.progress.lastSync}
          </Text>
        </View>
      )}

      <ScrollView style={styles.resultsContainer}>
        <Text style={styles.resultsTitle}>📝 Test Results:</Text>
        {testResults.map((result, index) => (
          <Text key={index} style={styles.resultText}>{result}</Text>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    minWidth: '45%',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  statusContainer: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  statusTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusText: {
    color: '#cccccc',
    fontSize: 12,
    marginBottom: 4,
  },
  resultsContainer: {
    maxHeight: 200,
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
  },
  resultsTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  resultText: {
    color: '#cccccc',
    fontSize: 11,
    marginBottom: 2,
  },
});

export default HybridSystemTester;
