import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgTimerAdd = (props) => (
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
      d="M12 16v-3m0 0v-3m0 3H9m3 0h3m6-7-2-2m-9-2h4m-2 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16"
    />
  </Svg>
);
export default SvgTimerAdd;
