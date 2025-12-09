import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import SvgChevronLeft from './icons/vectors_fig/Arrow/ChevronLeft';
const BackButton = ({ onPress, size = 28, top = 0, left = 24, zIndex = 1000 }) => {
  return (
    <TouchableOpacity 
      style={[
        styles.backButton,
        {
          top: top,
          left: left,
          zIndex: zIndex,
        }
      ]}
      onPress={onPress}
    >
      <SvgChevronLeft width={size} height={size} stroke="#ffffff" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8, // Slightly rounded corners
  },
});

export default BackButton;







