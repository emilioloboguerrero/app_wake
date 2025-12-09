import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowLeftLg = (props) => (
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
      d="m3 12 5 5m-5-5 5-5m-5 5h18"
    />
  </Svg>
);
export default SvgArrowLeftLg;
