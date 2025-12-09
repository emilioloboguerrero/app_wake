import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgListRemove = (props) => (
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
      d="M3 17h7m5-1h6M3 12h11M3 7h11"
    />
  </Svg>
);
export default SvgListRemove;
