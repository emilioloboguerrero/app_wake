import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgCheckBig = (props) => (
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
      d="m4 12 4.95 4.95L19.557 6.343"
    />
  </Svg>
);
export default SvgCheckBig;
