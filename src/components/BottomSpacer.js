import React from 'react';
import { View, StyleSheet } from 'react-native';

// Bottom spacer so content isn't hidden behind the fixed tab bar (same on native, web, PWA)
const BottomSpacer = () => {
  const totalHeight = 0;
  return <View style={[styles.fixedBottomSpacer, { height: totalHeight }]} />;
};

const styles = StyleSheet.create({
  fixedBottomSpacer: {
    width: '100%',
    backgroundColor: 'transparent',
  },
});

export default BottomSpacer;
