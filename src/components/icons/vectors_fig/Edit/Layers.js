import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgLayers = (props) => (
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
      d="m21 12-9 6-9-6m18 4-9 6-9-6m18-8-9 6-9-6 9-6z"
    />
  </Svg>
);
export default SvgLayers;
