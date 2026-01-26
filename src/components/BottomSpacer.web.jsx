// Web version of BottomSpacer - same formula as BottomTabBar.web so reserved space matches bar
import React from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BottomSpacer = () => {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const tabBarHeight = Math.max(50, Math.min(72, screenHeight * 0.08));
  const topPad = 12;
  const bottomPadding = insets.bottom || 0;
  // Match BottomTabBar.web exactly: bar is at bottom: 0 with height = tabBarHeight + 12 + bottomPadding
  const totalHeight = tabBarHeight + topPad + bottomPadding;

  return <div style={{ height: totalHeight, width: '100%' }} />;
};

export default BottomSpacer;

