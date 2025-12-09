import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgSkipBack = (props) => (
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
      d="M7 5v14m11-8.429v2.858c0 1.827 0 2.74-.384 3.267a2 2 0 0 1-1.413.811c-.648.066-1.437-.394-3.015-1.315L10.73 14.76c-1.551-.905-2.328-1.358-2.59-1.949a2 2 0 0 1 0-1.62c.263-.591 1.041-1.045 2.598-1.954l2.45-1.428.002-.002c1.576-.92 2.365-1.38 3.013-1.313a2 2 0 0 1 1.413.812C18 7.83 18 8.745 18 10.57"
    />
  </Svg>
);
export default SvgSkipBack;
