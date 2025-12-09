import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgCircleWarning = (props) => (
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
      d="M12 8.45v4M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m.05-5.55v.1h-.1v-.1z"
    />
  </Svg>
);
export default SvgCircleWarning;
