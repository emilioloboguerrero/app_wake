import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgUserCircle = (props) => (
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
      d="M17.217 19.332A6.98 6.98 0 0 0 12 17c-2.073 0-3.935.9-5.217 2.332M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18m0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6"
    />
  </Svg>
);
export default SvgUserCircle;
