import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import WakeLoader from '../components/WakeLoader';

const LoadingScreen = () => {
  return (
    <View style={styles.container}>
      {Platform.OS === 'web' && (
        <>
          <div className="w-orb w-orb-1" />
          <div className="w-orb w-orb-2" />
          <div className="w-orb w-orb-3" />
        </>
      )}
      <WakeLoader size={100} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    position: 'relative',
    overflow: 'hidden',
  },
});

export default LoadingScreen;
