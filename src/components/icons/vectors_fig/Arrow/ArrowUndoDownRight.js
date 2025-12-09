import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowUndoDownRight = (props) => (
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
      d="m17 11 4 4m0 0-4 4m4-4H8A5 5 0 0 1 8 5h5"
    />
  </Svg>
);
export default SvgArrowUndoDownRight;
