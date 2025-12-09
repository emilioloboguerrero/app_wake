import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowLeftSm = (props) => (
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
      d="M17 12H7m0 0 4 4m-4-4 4-4"
    />
  </Svg>
);
export default SvgArrowLeftSm;
