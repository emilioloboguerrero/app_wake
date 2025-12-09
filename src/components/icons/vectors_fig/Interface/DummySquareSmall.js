import * as React from "react";
import Svg, { Path } from "react-native-svg";
const SvgDummySquareSmall = (props) => (
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
      d="M8 11.2v1.6c0 1.12 0 1.68.218 2.108a2 2 0 0 0 .874.874c.427.218.987.218 2.105.218h1.606c1.118 0 1.677 0 2.104-.218.377-.191.684-.498.875-.874.218-.428.218-.986.218-2.104v-1.607c0-1.118 0-1.678-.218-2.105a2 2 0 0 0-.875-.874C14.48 8 13.92 8 12.8 8h-1.6c-1.12 0-1.68 0-2.108.218a2 2 0 0 0-.874.874C8 9.52 8 10.08 8 11.2"
    />
  </Svg>
);
export default SvgDummySquareSmall;
