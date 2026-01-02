// Web version of BottomSpacer component
import React from 'react';

const BottomSpacer = () => {
  const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 667;
  
  // Responsive spacer height
  const tabBarHeight = Math.max(60, screenHeight * 0.1);
  const bottomPadding = 0;
  const totalHeight = tabBarHeight + bottomPadding + 20; // Extra 20px for safety
  
  return <div style={{ height: totalHeight, width: '100%' }} />;
};

export default BottomSpacer;

