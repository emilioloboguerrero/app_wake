import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgHelp = (props) => (
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
      d="M8.195 8.765A4 4 0 1 1 12 14v1m.05 4v.1h-.1V19z"
    />
  </Svg>
);
export default SvgHelp;
