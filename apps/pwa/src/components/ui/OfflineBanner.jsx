import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { processPendingQueue } from '../../utils/backgroundSync';
import { getAll } from '../../utils/offlineQueue';

function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [queueCount, setQueueCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  const refreshQueueCount = useCallback(() => {
    const queue = getAll();
    setQueueCount(queue.length);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOffline(false);
      refreshQueueCount();
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    refreshQueueCount();
    const interval = setInterval(refreshQueueCount, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [refreshQueueCount]);

  const handleRetry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await processPendingQueue();
    } finally {
      refreshQueueCount();
      setRetrying(false);
    }
  }, [retrying, refreshQueueCount]);

  if (!isOffline && queueCount === 0) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.content}>
        <Text style={styles.text}>
          {isOffline
            ? 'Sin conexi\u00f3n \u2014 trabajando sin internet'
            : `Sincronizando ${queueCount} cambio${queueCount !== 1 ? 's' : ''} pendiente${queueCount !== 1 ? 's' : ''}\u2026`}
        </Text>
        {queueCount > 0 && (
          <TouchableOpacity
            onPress={handleRetry}
            disabled={retrying}
            style={[styles.button, retrying && styles.buttonDisabled]}
            activeOpacity={0.7}
          >
            <Text style={[styles.buttonText, retrying && styles.buttonTextDisabled]}>
              {retrying ? 'Reintentando\u2026' : 'Reintentar'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.15)',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } : {}),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    flex: 1,
  },
  button: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  buttonTextDisabled: {
    color: 'rgba(255,255,255,0.4)',
  },
});

export default OfflineBanner;
