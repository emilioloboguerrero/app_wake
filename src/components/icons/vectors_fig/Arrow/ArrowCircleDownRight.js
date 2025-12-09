import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowCircleDownRight = (props) => (
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
      d="M11 15h4m0 0v-4m0 4L9 9m12 3a9 9 0 1 0-18 0 9 9 0 0 0 18 0"
    />
  </Svg>
);
export default SvgArrowCircleDownRight;
