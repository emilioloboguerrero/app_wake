import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowDownLeftMd = (props) => (
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
      d="M17 7 7 17m0 0h8m-8 0V9"
    />
  </Svg>
);
export default SvgArrowDownLeftMd;
