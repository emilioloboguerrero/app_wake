import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgArrowSubDownLeft = (props) => (
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
      d="m11 11-5 5m0 0 5 5m-5-5h7.803c1.118 0 1.677 0 2.105-.218.376-.191.682-.498.874-.874.218-.428.218-.987.218-2.105V3"
    />
  </Svg>
);
export default SvgArrowSubDownLeft;
