import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowUndoDownLeft = (props) => (
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
      d="m7 11-4 4m0 0 4 4m-4-4h13a5 5 0 0 0 0-10h-5"
    />
  </Svg>
);
export default SvgArrowUndoDownLeft;
