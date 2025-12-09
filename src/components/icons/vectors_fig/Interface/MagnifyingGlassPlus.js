import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgMagnifyingGlassPlus = (props) => (
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
      d="M7 10h3m0 0h3m-3 0V7m0 3v3m5 2 6 6m-11-4a7 7 0 1 1 0-14 7 7 0 0 1 0 14"
    />
  </Svg>
);
export default SvgMagnifyingGlassPlus;
