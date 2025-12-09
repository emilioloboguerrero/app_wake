import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgDragVertical = (props) => (
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
      d="M14 18a1 1 0 1 0 2 0 1 1 0 0 0-2 0M8 18a1 1 0 1 0 2 0 1 1 0 0 0-2 0M14 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0M8 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0M14 6a1 1 0 1 0 2 0 1 1 0 0 0-2 0M8 6a1 1 0 1 0 2 0 1 1 0 0 0-2 0"
    />
  </Svg>
);
export default SvgDragVertical;
