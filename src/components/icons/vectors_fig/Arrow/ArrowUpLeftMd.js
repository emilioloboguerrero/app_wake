import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowUpLeftMd = (props) => (
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
      d="M17 17 7 7m0 0v8m0-8h8"
    />
  </Svg>
);
export default SvgArrowUpLeftMd;
