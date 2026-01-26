import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Bottom spacer so content isn't hidden behind the fixed tab bar (same on native, web, PWA)
const BottomSpacer = () => {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  
  const tabBarHeight = Math.max(50, Math.min(72, screenHeight * 0.08));
  const topPad = 12; // Match BottomTabBar paddingTop
  const bottomOffset = 24; // Match tab bar bottom offset
  const totalHeight = tabBarHeight + topPad + (insets.bottom || 0) + bottomOffset;
  
  return <View style={[styles.fixedBottomSpacer, { height: totalHeight }]} />;
};

const styles = StyleSheet.create({
  fixedBottomSpacer: {
    width: '100%',
    backgroundColor: 'transparent',
  },
});

export default BottomSpacer;
