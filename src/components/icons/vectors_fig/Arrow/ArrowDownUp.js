import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowDownUp = (props) => (
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
      d="m11 16-3 3m0 0-3-3m3 3V5m5 3 3-3m0 0 3 3m-3-3v14"
    />
  </Svg>
);
export default SvgArrowDownUp;
