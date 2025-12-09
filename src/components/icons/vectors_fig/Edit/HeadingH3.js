import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgHeadingH3 = (props) => (
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
      d="M15 9h6l-4 4h1a3 3 0 1 1-2.83 3.999M3 5v7m0 0v7m0-7h8m0-7v7m0 0v7"
    />
  </Svg>
);
export default SvgHeadingH3;
