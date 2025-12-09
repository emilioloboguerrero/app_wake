import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgSwichtRight = (props) => (
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
      d="M8 18h8a6 6 0 0 0 0-12H8a6 6 0 1 0 0 12"
    />
    <Path
      stroke="#fff"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6"
    />
  </Svg>
);
export default SvgSwichtRight;
