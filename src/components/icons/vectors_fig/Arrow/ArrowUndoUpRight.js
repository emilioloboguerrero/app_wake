import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowUndoUpRight = (props) => (
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
      d="m17 13 4-4m0 0-4-4m4 4H8a5 5 0 0 0 0 10h5"
    />
  </Svg>
);
export default SvgArrowUndoUpRight;
