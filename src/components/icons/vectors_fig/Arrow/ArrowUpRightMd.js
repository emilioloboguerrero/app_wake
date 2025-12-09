import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowUpRightMd = (props) => (
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
      d="M7 17 17 7m0 0H9m8 0v8"
    />
  </Svg>
);
export default SvgArrowUpRightMd;
