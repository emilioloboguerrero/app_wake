import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgUserClose = (props) => (
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
      d="M15 19c0-2.21-2.686-4-6-4s-6 1.79-6 4m14-5 2-2m0 0 2-2m-2 2-2-2m2 2 2 2M9 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8"
    />
  </Svg>
);
export default SvgUserClose;
