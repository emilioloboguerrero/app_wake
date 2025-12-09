import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowDownRightMd = (props) => (
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
      d="m7 7 10 10m0 0V9m0 8H9"
    />
  </Svg>
);
export default SvgArrowDownRightMd;
