import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgLinkHorizontalOff = (props) => (
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
      d="M8 12h4m0 0L8 8m4 4 8 8M15 8h2a4 4 0 0 1 2.645 7M9 16H7a4 4 0 0 1 0-8h1m0 0L4 4"
    />
  </Svg>
);
export default SvgLinkHorizontalOff;
