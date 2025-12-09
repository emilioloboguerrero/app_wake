import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowUpLg = (props) => (
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
      d="M12 3 7 8m5-5 5 5m-5-5v18"
    />
  </Svg>
);
export default SvgArrowUpLg;
