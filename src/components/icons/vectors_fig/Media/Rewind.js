import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgRewind = (props) => (
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
      d="m12 12 9 5V7zm0 0V7l-9 5 9 5z"
    />
  </Svg>
);
export default SvgRewind;
