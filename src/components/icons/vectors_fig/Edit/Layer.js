import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgLayer = (props) => (
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
      d="m21 14-9 6-9-6m18-4-9 6-9-6 9-6z"
    />
  </Svg>
);
export default SvgLayer;
