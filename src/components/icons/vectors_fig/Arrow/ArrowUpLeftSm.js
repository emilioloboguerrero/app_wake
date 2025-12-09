import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowUpLeftSm = (props) => (
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
      d="M16 16 8 8m0 0v6m0-6h6"
    />
  </Svg>
);
export default SvgArrowUpLeftSm;
