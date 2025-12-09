import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowLeftRight = (props) => (
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
      d="m16 13 3 3m0 0-3 3m3-3H5m3-5L5 8m0 0 3-3M5 8h14"
    />
  </Svg>
);
export default SvgArrowLeftRight;
