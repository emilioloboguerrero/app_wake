import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgSlider01 = (props) => (
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
      d="M14 15h7M3 15h2m0 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0m15-6h1M3 9h7m6.5 2.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5"
    />
  </Svg>
);
export default SvgSlider01;
