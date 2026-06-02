import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgBookOpen = (props) => {
  const { stroke = "#fff", strokeWidth = 2, width = 24, height = 24, ...svgProps } = props;
  return (
    <Svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      {...svgProps}
    >
      <Path
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M12 7v13M3 5h5a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H3zm18 0h-5a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h6z"
      />
    </Svg>
  );
};
export default SvgBookOpen;
