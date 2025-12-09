import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgWifiMedium = (props) => (
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
      d="M8.344 14.59a5 5 0 0 1 7.289-.025m-9.484-3.021a8 8 0 0 1 11.664-.042M12 19a1 1 0 1 1 0-2 1 1 0 0 1 0 2"
    />
  </Svg>
);
export default SvgWifiMedium;
