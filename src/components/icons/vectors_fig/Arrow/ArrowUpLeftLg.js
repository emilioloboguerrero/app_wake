import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowUpLeftLg = (props) => (
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
      d="M5.636 5.636v7.07m0-7.07h7.07m-7.07 0 12.728 12.728"
    />
  </Svg>
);
export default SvgArrowUpLeftLg;
