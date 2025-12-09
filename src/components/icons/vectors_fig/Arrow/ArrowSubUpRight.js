import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowSubUpRight = (props) => (
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
      d="m13 13 5-5m0 0-5-5m5 5h-7.8c-1.12 0-1.68 0-2.108.218a2 2 0 0 0-.874.874C7 9.52 7 10.08 7 11.2V21"
    />
  </Svg>
);
export default SvgArrowSubUpRight;
