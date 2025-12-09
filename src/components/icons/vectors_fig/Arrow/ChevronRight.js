import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgChevronRight = (props) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.width || 24}
    height={props.height || 24}
    viewBox="0 0 24 24"
    fill="none"
    {...props}
  >
    <Path
      stroke={props.stroke || "#fff"}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={props.strokeWidth || 2}
      d="m9 5 7 7-7 7"
    />
  </Svg>
);
export default SvgChevronRight;
