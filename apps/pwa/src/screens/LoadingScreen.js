import React from 'react';
import { View, StyleSheet } from 'react-native';
import WakeLoader from '../components/WakeLoader';

const LoadingScreen = () => {
  return (
    <View style={styles.container}>
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
  },
});

export default LoadingScreen;
