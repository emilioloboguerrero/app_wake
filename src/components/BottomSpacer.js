import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: screenHeight } = Dimensions.get('window');

// Fixed bottom spacer to prevent tab bar from covering content
const BottomSpacer = () => {
  const insets = useSafeAreaInsets();
  
  // Responsive spacer height
  const tabBarHeight = Math.max(60, screenHeight * 0.1); // 8% of screen height, min 60
  const bottomPadding = 0; // No bottom padding - flush with bottom
  const totalHeight = tabBarHeight + bottomPadding + 20; // Extra 20px for safety
  
  return <View style={[styles.fixedBottomSpacer, { height: totalHeight }]} />;
};

const styles = StyleSheet.create({
  fixedBottomSpacer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a', // Same as app background
    zIndex: 999, // Above content, below header
  },
});

export default BottomSpacer;
