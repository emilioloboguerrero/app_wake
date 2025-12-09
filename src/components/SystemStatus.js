// System Status Component - For debugging the workout progress system
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import workoutProgressService from '../data-management/workoutProgressService';
import { useAuth } from '../contexts/AuthContext';

import logger from '../utils/logger.js';
const SystemStatus = () => {
  const { user } = useAuth();
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const checkSystemStatus = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const status = await workoutProgressService.getSystemStatus();
      setSystemStatus(status);
      logger.log('📊 System Status:', status);
    } catch (error) {
      logger.error('❌ Failed to get system status:', error);
      Alert.alert('Error', 'Failed to get system status');
    } finally {
      setLoading(false);
    }
  };

  const testCourseDownload = async () => {
    if (!user) return;
    
    Alert.alert(
      'Test Course Download',
      'This will attempt to download your purchased courses. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Download', 
          onPress: async () => {
            setLoading(true);
            try {
              // Get user's courses and try to download them
              await workoutProgressService.onUserCourseStatusChange(user.uid);
              Alert.alert('Success', 'Course download test completed');
            } catch (error) {
              logger.error('❌ Download test failed:', error);
              Alert.alert('Error', 'Download test failed: ' + error.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const performMaintenance = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const results = await workoutProgressService.performMaintenance();
      Alert.alert('Maintenance Complete', `Storage optimized: ${results[0]} items cleaned`);
    } catch (error) {
      logger.error('❌ Maintenance failed:', error);
      Alert.alert('Error', 'Maintenance failed');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>System Status</Text>
        <Text style={styles.subtitle}>Please log in to view system status</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>System Status</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={checkSystemStatus}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Check System Status</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={testCourseDownload}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test Course Download</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={performMaintenance}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Run Maintenance</Text>
        </TouchableOpacity>
      </View>

      {systemStatus && (
        <View style={styles.statusContainer}>
          <Text style={styles.statusTitle}>Status Report:</Text>
          <Text style={styles.statusText}>
            Storage: {systemStatus.storage?.total_size_mb || 0}MB
          </Text>
          <Text style={styles.statusText}>
            Upload Queue: {systemStatus.uploadQueue?.totalSessions || 0} sessions
          </Text>
          <Text style={styles.statusText}>
            Pending Uploads: {systemStatus.uploadQueue?.pendingSessions || 0}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    margin: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#B0B0B0',
    textAlign: 'center',
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#555555',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  statusContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 12,
    color: '#B0B0B0',
    marginBottom: 4,
  },
});

export default SystemStatus;
