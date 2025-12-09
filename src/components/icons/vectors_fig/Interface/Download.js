import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgDownload = (props) => (
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
      d="M6 21h12M12 3v14m0 0 5-5m-5 5-5-5"
    />
  </Svg>
);
export default SvgDownload;
