import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TestScreen = () => {
  const [timer, setTimer] = useState(0);
  const intervalRef = useRef(null);
  const renderCountRef = useRef(0);
  
  renderCountRef.current += 1;
  console.log(`[TEST_SCREEN] Render #${renderCountRef.current}`);

  useEffect(() => {
    console.log('[TEST_SCREEN] Component mounted');
    
    // Start timer
    intervalRef.current = setInterval(() => {
      setTimer(prev => {
        const newTimer = prev + 1;
        console.log(`[TEST_SCREEN] Timer: ${newTimer}`);
        return newTimer;
      });
    }, 1000);

    // Log after commit phase
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        console.log('[TEST_SCREEN] ✅ React commit phase complete');
      }, { timeout: 1000 });
    } else {
      setTimeout(() => {
        console.log('[TEST_SCREEN] ✅ React commit phase complete (fallback)');
      }, 100);
    }

    return () => {
      console.log('[TEST_SCREEN] Component unmounting');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Test Screen</Text>
        <Text style={styles.version}>Version: 1.0.0</Text>
        <Text style={styles.timer}>Timer: {timer}s</Text>
        <Text style={styles.renderCount}>Renders: {renderCountRef.current}</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 20,
  },
  version: {
    fontSize: 18,
    color: 'rgba(191, 168, 77, 1)',
    marginBottom: 10,
  },
  timer: {
    fontSize: 24,
    color: '#ffffff',
    marginTop: 20,
    marginBottom: 10,
  },
  renderCount: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 10,
  },
});

export default TestScreen;
