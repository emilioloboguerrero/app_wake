import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgCloseLg = (props) => (
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
      d="m21 21-9-9m0 0L3 3m9 9 9-9m-9 9-9 9"
    />
  </Svg>
);
export default SvgCloseLg;
