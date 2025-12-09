import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowDownRightLg = (props) => (
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
      d="M18.364 18.364v-7.071m0 7.071h-7.071m7.07 0L5.637 5.636"
    />
  </Svg>
);
export default SvgArrowDownRightLg;
