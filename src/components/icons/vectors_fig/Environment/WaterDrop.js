import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgWaterDrop = (props) => (
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
      d="M16 13.385a4.68 4.68 0 0 1-1.318 3.263c-.479.492-1.055.861-1.682 1.088m6-4.044C19 7.115 12 2 12 2S5 7.115 5 13.692c0 1.938.737 3.797 2.05 5.168S10.144 21 12 21s3.637-.77 4.95-2.14S19 15.63 19 13.691"
    />
  </Svg>
);
export default SvgWaterDrop;
