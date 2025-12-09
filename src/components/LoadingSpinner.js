import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';

const LoadingSpinner = ({ 
  size = 'large', 
  text = null, 
  containerStyle = null, 
  textStyle = null 
}) => {
  return (
    <View style={[styles.container, containerStyle]}>
      <ActivityIndicator size={size} color="#ffffff" />
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
