import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import WakeLoader from './WakeLoader';

const LoadingSpinner = ({ 
  size = 'large', 
  text = null, 
  containerStyle = null, 
  textStyle = null 
}) => {
  const getLoaderSize = (value) => {
    if (typeof value === 'number') return value;
    if (value === 'small') return 40;
    return 80; // default for 'large' and any other string
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <WakeLoader size={getLoaderSize(size)} />
      {text && (
        <Text style={[styles.text, textStyle]}>{text}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#cccccc',
    fontSize: 16,
    marginTop: 15,
  },
});

export default LoadingSpinner;
