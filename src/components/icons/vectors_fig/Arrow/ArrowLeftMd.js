import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowLeftMd = (props) => (
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
      d="M19 12H5m0 0 6 6m-6-6 6-6"
    />
  </Svg>
);
export default SvgArrowLeftMd;
