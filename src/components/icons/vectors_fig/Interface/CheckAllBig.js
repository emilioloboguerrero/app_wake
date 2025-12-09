import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgCheckAllBig = (props) => (
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
      d="m7 12 4.95 4.95L22.557 6.343M2.05 12.05 7 17M17.606 6.394l-5.303 5.303"
    />
  </Svg>
);
export default SvgCheckAllBig;
