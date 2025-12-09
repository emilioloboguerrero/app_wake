import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgAddColumn = (props) => (
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
      d="M5 17h3m0 0h3m-3 0v-3m0 3v3m6 1h1a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v6"
    />
  </Svg>
);
export default SvgAddColumn;
