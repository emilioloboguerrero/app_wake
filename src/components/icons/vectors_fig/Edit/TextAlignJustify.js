import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgTextAlignJustify = (props) => (
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
      d="M20 18H4m16-4H4m16-4H4m16-4H4"
    />
  </Svg>
);
export default SvgTextAlignJustify;
