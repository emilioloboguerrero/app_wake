import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgItalic = (props) => (
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
      d="M8 19h2m0 0h2m-2 0 4-14m-2 0h2m0 0h2"
    />
  </Svg>
);
export default SvgItalic;
