import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowSubRightUp = (props) => (
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
      d="m11 11 5-5m0 0 5 5m-5-5v7.803c0 1.118 0 1.677-.218 2.105a2 2 0 0 1-.874.874C14.48 17 13.92 17 12.803 17H3"
    />
  </Svg>
);
export default SvgArrowSubRightUp;
