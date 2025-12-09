import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgRadioFill = (props) => (
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
      d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16"
    />
    <Path
      stroke="#fff"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6"
    />
  </Svg>
);
export default SvgRadioFill;
