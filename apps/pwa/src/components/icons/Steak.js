import * as React from 'react';
import Svg, { Path, Ellipse } from 'react-native-svg';
// Steak icon: oval (meat) + short line (bone)
const Steak = (props) => (
  <Svg
    xmlns="http://www.w3.org/2000/svg"
    width={24}
    height={24}
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <Ellipse
      cx={12}
      cy={12}
      rx={7}
      ry={5}
      stroke={props.stroke || '#fff'}
      strokeWidth={props.strokeWidth ?? 2}
      fill="none"
    />
    <Path
      stroke={props.stroke || '#fff'}
      strokeLinecap="round"
      strokeWidth={props.strokeWidth ?? 2}
      d="M12 9v6"
    />
  </Svg>
);
export default Steak;
