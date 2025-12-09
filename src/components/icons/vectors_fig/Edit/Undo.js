import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgUndo = (props) => (
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
      d="M10 8H5V3m.291 13.357a8 8 0 1 0 .188-8.991"
    />
  </Svg>
);
export default SvgUndo;
