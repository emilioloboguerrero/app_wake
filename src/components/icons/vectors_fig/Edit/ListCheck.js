import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgListCheck = (props) => (
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
      d="M4 17h7m9-3-4 4-2-2M4 12h11M4 7h11"
    />
  </Svg>
);
export default SvgListCheck;
