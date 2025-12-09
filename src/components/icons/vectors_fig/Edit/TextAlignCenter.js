import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgTextAlignCenter = (props) => (
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
      d="M17 18H7m13-4H4m13-4H7m13-4H4"
    />
  </Svg>
);
export default SvgTextAlignCenter;
