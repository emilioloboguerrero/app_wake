import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Platform } from 'react-native';

function WakeLoaderPulse({ size = 80, style }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 850, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 850, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.3, duration: 850, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.8, duration: 850, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <View style={[styles.container, style]}>
      <Animated.Image
        source={require('../../assets/Isotipo WAKE (negativo).png')}
        style={[{ width: size, height: size }, { opacity, transform: [{ scale }] }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function WakeLoader(props) {
  if (Platform.OS === 'web') {
    const WakeLoaderWeb = require('./WakeLoader.web.jsx').default;
    return <WakeLoaderWeb {...props} />;
  }
  return <WakeLoaderPulse {...props} />;
}
