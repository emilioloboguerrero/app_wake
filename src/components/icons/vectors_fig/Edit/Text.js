import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgText = (props) => (
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
      d="M10 19h2m0 0h2m-2 0V5m0 0H6v1m6-1h6v1"
    />
  </Svg>
);
export default SvgText;
