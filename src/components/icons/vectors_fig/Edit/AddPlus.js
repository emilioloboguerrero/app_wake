import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgAddPlus = (props) => (
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
      d="M6 12h6m0 0h6m-6 0v6m0-6V6"
    />
  </Svg>
);
export default SvgAddPlus;
