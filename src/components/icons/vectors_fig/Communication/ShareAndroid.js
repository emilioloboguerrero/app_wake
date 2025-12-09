import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgShareAndroid = (props) => (
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
      d="m9 13.5 6 3m0-9-6 3M18 21a3 3 0 1 1 0-6 3 3 0 0 1 0 6M6 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6m12-6a3 3 0 1 1 0-6 3 3 0 0 1 0 6"
    />
  </Svg>
);
export default SvgShareAndroid;
