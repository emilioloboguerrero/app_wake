import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgSortDescending = (props) => (
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
      d="M4 17h12M4 12h9M4 7h6m8 6V5m0 0 3 3m-3-3-3 3"
    />
  </Svg>
);
export default SvgSortDescending;
