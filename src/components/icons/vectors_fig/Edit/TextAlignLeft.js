import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgTextAlignLeft = (props) => (
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
      d="M4 18h10M4 14h16M4 10h10M4 6h16"
    />
  </Svg>
);
export default SvgTextAlignLeft;
