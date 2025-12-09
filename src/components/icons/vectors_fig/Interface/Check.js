import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgCheck = (props) => (
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
      d="m6 12 4.243 4.243 8.484-8.486"
    />
  </Svg>
);
export default SvgCheck;
