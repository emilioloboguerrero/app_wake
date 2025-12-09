import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowSubRightDown = (props) => (
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
      d="m11 13 5 5m0 0 5-5m-5 5v-7.803c0-1.118 0-1.678-.218-2.105a2 2 0 0 0-.874-.874C14.48 7 13.92 7 12.8 7H3"
    />
  </Svg>
);
export default SvgArrowSubRightDown;
