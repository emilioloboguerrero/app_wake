import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgTimerClose = (props) => (
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
      d="m10 15 2-2m0 0 2-2m-2 2-2-2m2 2 2 2m7-9-2-2m-9-2h4m-2 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16"
    />
  </Svg>
);
export default SvgTimerClose;
