import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgLineXl = (props) => (
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
      d="M12 21V3"
    />
  </Svg>
);
export default SvgLineXl;
