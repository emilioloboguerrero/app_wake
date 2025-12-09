import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowRightMd = (props) => (
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
      d="M5 12h14m0 0-6-6m6 6-6 6"
    />
  </Svg>
);
export default SvgArrowRightMd;
