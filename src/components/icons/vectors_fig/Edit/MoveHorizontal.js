import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgMoveHorizontal = (props) => (
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
      d="M3 12h18M3 12l3 3m-3-3 3-3m15 3-3-3m3 3-3 3"
    />
  </Svg>
);
export default SvgMoveHorizontal;
