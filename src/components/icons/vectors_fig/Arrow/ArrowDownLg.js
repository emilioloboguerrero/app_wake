import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowDownLg = (props) => (
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
      d="m12 21 5-5m-5 5-5-5m5 5V3"
    />
  </Svg>
);
export default SvgArrowDownLg;
