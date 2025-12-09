import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgShuffle = (props) => (
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
      d="m18 20 3-3m0 0-3-3m3 3h-4a5 5 0 0 1-5-5 5 5 0 0 0-5-5H3m15-3 3 3m0 0-3 3m3-3h-4a4.98 4.98 0 0 0-3 1M3 17h4a4.98 4.98 0 0 0 3-1"
    />
  </Svg>
);
export default SvgShuffle;
