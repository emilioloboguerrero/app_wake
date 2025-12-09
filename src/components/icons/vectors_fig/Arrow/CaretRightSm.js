import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgCaretRightSm = (props) => (
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
      d="m11 9 3 3-3 3"
    />
  </Svg>
);
export default SvgCaretRightSm;
