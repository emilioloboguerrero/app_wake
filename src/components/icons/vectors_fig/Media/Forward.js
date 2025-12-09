import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgForward = (props) => (
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
      d="M12 12V7l9 5-9 5zm0 0-9 5V7z"
    />
  </Svg>
);
export default SvgForward;
