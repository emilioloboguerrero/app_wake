import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgAlarm = (props) => (
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
      d="M12 7v5h5m4.004-7.429L17.939 2M6.064 2 3 4.571M12 20a8 8 0 1 1 0-16 8 8 0 0 1 0 16"
    />
  </Svg>
);
export default SvgAlarm;
