import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgHeadingH5 = (props) => (
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
      d="M21 9h-4l-1.25 5.016a3 3 0 0 1 3.555-.717 3 3 0 1 1-3.555 4.685M3 5v7m0 0v7m0-7h8m0-7v7m0 0v7"
    />
  </Svg>
);
export default SvgHeadingH5;
