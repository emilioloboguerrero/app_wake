import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgSortAscending = (props) => (
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
      d="M4 17h6m-6-5h9m5-1v8m0 0 3-3m-3 3-3-3M4 7h12"
    />
  </Svg>
);
export default SvgSortAscending;
