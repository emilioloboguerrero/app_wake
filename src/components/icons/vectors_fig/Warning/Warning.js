import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgWarning = (props) => (
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
      d="M12 6v8m.05 4v.1h-.1V18z"
    />
  </Svg>
);
export default SvgWarning;
