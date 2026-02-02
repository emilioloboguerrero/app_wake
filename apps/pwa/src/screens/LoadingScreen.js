import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import LoadingSpinner from '../components/LoadingSpinner';

const LoadingScreen = () => {
  return (
    <View style={styles.container}>
      <Image 
        source={require('../../assets/wake-logo-new.png')} 
        style={styles.logo}
        resizeMode="contain"
      />
      <View style={styles.spinnerContainer}>
        <LoadingSpinner size="large" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 40,
  },
  spinnerContainer: {
    marginTop: 20,
  },
});

export default LoadingScreen;






