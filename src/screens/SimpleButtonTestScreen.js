import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import logger from '../utils/logger';

const SimpleButtonTestScreen = () => {
  const [buttonPressCount, setButtonPressCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  logger.debug('[SIMPLE_TEST] Component rendering, buttonPressCount:', buttonPressCount);

  const handleButtonPress = () => {
    logger.debug('[SIMPLE_TEST] 🟢 BUTTON PRESSED! Button is responsive!');
    setIsLoading(true);
    
    // Simulate some async work
    setTimeout(() => {
      setButtonPressCount(prev => prev + 1);
      setIsLoading(false);
      logger.debug('[SIMPLE_TEST] ✅ Button press handled, count updated');
      alert(`Button pressed! Count: ${buttonPressCount + 1}`);
    }, 100);
  };

  const handleButtonPressIn = () => {
    logger.debug('[SIMPLE_TEST] 🟡 BUTTON PRESS IN - Button receiving events');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Simple Button Test Screen</Text>
        <Text style={styles.subtitle}>Testing if React Native Web buttons work</Text>
        
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            Button Pressed: {buttonPressCount} times
          </Text>
          <Text style={styles.infoText}>
            Loading: {isLoading ? 'Yes' : 'No'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleButtonPress}
          onPressIn={handleButtonPressIn}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Loading...' : 'TEST BUTTON - Click Me!'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.instruction}>
          If this button works, React Native Web is functioning correctly.
          {'\n'}If this button doesn't work, there's a platform-wide issue.
        </Text>
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 40,
    textAlign: 'center',
  },
  infoContainer: {
    marginBottom: 30,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#BFA84D',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 12,
    minWidth: 250,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#666666',
    opacity: 0.6,
  },
  buttonText: {
    color: '#1a1a1a',
    fontSize: 18,
    fontWeight: '600',
  },
  instruction: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 40,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

export default SimpleButtonTestScreen;
