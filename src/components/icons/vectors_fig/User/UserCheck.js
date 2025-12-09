import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgUserCheck = (props) => (
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
      d="M15 19c0-2.21-2.686-4-6-4s-6 1.79-6 4m18-9-4 4-2-2m-6 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8"
    />
  </Svg>
);
export default SvgUserCheck;
