import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgDummyCircle = (props) => (
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
      d="M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12"
    />
  </Svg>
);
export default SvgDummyCircle;
