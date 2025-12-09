import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgListOrdered = (props) => (
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
      d="M10 17h10M4 15.685V15.5A1.5 1.5 0 0 1 5.5 14h.04c.807 0 1.46.653 1.46 1.46 0 .35-.114.692-.324.973L4 20h3m3-8h10M10 7h10M4 5l2-1v6"
    />
  </Svg>
);
export default SvgListOrdered;
