import React from 'react';
import Svg, { Path } from 'react-native-svg';

const SvgMinus = ({ width = 24, height = 24, color = '#ffffff', ...props }) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <Path
        d="M6 12h12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export default SvgMinus;
