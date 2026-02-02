import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import logger from '../utils/logger.js';
// You can import your SVG icons here or define them inline
const iconPaths = {
  // Example icon - replace with your Figma exports
  home: {
    viewBox: "0 0 24 24",
    paths: [
      "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
      "M9 22V12h6v10"
    ]
  },
  // Add more icons here as you export them from Figma
};

const Icon = ({ 
  name, 
  size = 24, 
  color = '#ffffff', 
  style,
  ...props 
}) => {
  const iconData = iconPaths[name];
  
  if (!iconData) {
    logger.warn(`Icon "${name}" not found`);
    return <View style={[{ width: size, height: size }, style]} />;
  }

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg
        width={size}
        height={size}
        viewBox={iconData.viewBox}
        fill="none"
        {...props}
      >
        {iconData.paths.map((path, index) => (
          <Path
            key={index}
            d={path}
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
};

export default Icon;






