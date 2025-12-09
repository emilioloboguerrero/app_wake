import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgLeaf = (props) => (
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
      d="M6.83 17.08c7.07 4.243 12.727-1.414 12.02-12.02C8.244 4.353 2.587 10.01 6.83 17.08m0 0q0 0 0 0m0 0L5 18.91m1.83-1.828 3.827-3.829"
    />
  </Svg>
);
export default SvgLeaf;
