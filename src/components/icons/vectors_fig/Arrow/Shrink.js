import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgShrink = (props) => (
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
      d="M5 14h5v5m9-9h-5V5"
    />
  </Svg>
);
export default SvgShrink;
