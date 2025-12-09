import * as React from "react";
import Svg, { Path } from "react-native-svg";

const SvgUsers = (props) => {
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
        d="M21 20c0-1.742-1.67-3.223-4-3.773M15 20c0-2.21-2.686-4-6-4s-6 1.79-6 4m12-7a4 4 0 0 0 0-8m-6 8a4 4 0 1 1 0-8 4 4 0 0 1 0 8"
      />
    </Svg>
  );
};

export default SvgUsers;
