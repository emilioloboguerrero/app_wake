import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowUndoUpLeft = (props) => (
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
      d="M7 13 3 9m0 0 4-4M3 9h13a5 5 0 0 1 0 10h-5"
    />
  </Svg>
);
export default SvgArrowUndoUpLeft;
