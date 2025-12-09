import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgMoon = (props) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={24}
    height={24}
    fill="none"
    {...props}
  >
    <Path
      stroke="#fff"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 6a9 9 0 0 0 9 9c.91 0 1.787-.134 2.614-.385A9 9 0 0 1 12 21 9 9 0 0 1 9.386 3.386 9 9 0 0 0 9 6"
    />
  </Svg>
);
export default SvgMoon;
