import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowUpRightLg = (props) => (
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
      d="M18.365 5.636h-7.071m7.07 0v7.071m0-7.07L5.638 18.363"
    />
  </Svg>
);
export default SvgArrowUpRightLg;
