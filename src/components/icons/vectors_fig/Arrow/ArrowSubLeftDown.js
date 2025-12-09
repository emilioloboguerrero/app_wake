import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowSubLeftDown = (props) => (
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
      d="m13.5 12.5-5 5m0 0-5-5m5 5V9.7c0-1.12 0-1.68.218-2.108.192-.377.497-.682.874-.874.428-.218.988-.218 2.108-.218h9.8"
    />
  </Svg>
);
export default SvgArrowSubLeftDown;
