import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgDragHorizontal = (props) => (
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
      d="M18 14a1 1 0 1 0 0 2 1 1 0 0 0 0-2M12 14a1 1 0 1 0 0 2 1 1 0 0 0 0-2M6 14a1 1 0 1 0 0 2 1 1 0 0 0 0-2M18 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2M12 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2M6 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2"
    />
  </Svg>
);
export default SvgDragHorizontal;
