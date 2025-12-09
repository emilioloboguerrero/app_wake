import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgCheckAll = (props) => (
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
      d="m8 12.485 4.243 4.243 8.484-8.485M3 12.485l4.243 4.243m8.485-8.485L12.5 11.5"
    />
  </Svg>
);
export default SvgCheckAll;
