import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgSearchMagnifyingGlass = (props) => {
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
        d="m15 15 6 6m-11-4a7 7 0 1 1 0-14 7 7 0 0 1 0 14"
      />
    </Svg>
  );
};
export default SvgSearchMagnifyingGlass;
