import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgHeading = (props) => (
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
      d="M7 5v7m0 0v7m0-7h10m0-7v7m0 0v7"
    />
  </Svg>
);
export default SvgHeading;
