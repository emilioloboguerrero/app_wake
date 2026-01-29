import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

const SvgStopwatch = ({ width = 24, height = 24, color = '#ffffff', ...props }) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Top button */}
      <Circle cx="12" cy="4" r="1.5" stroke={color} strokeWidth="2" fill="none" />
      {/* Stem */}
      <Path d="M12 5.5V8" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Face */}
      <Circle cx="12" cy="14" r="7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Hand */}
      <Path d="M12 14v-3.5l2.5 2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export default SvgStopwatch;
