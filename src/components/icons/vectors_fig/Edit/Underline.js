import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgUnderline = (props) => (
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
      d="M6 19h12M8 5v6a4 4 0 0 0 8 0V5"
    />
  </Svg>
);
export default SvgUnderline;
