import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgHamburgerLg = (props) => (
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
      d="M3 17h18M3 12h18M3 7h18"
    />
  </Svg>
);
export default SvgHamburgerLg;
