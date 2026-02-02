import React from 'react';
import Svg, { Path } from 'react-native-svg';

const SvgChampion = ({ width = 24, height = 24, color = '#163300', ...props }) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 119 119"
      fill="none"
      {...props}
    >
      <Path
        d="M59.3334 84.4722C51.1048 84.4722 43.9428 90.6918 40.2452 99.8673C38.4791 104.25 41.0133 109.056 44.3807 109.056H74.2859C77.6534 109.056 80.1874 104.25 78.4213 99.8673C74.724 90.6918 67.5619 84.4722 59.3334 84.4722Z"
        stroke={color}
        strokeWidth="8.5"
        strokeLinecap="round"
      />
      <Path
        d="M91.2917 25.4722H97.2025C103.107 25.4722 106.059 25.4722 107.599 27.3276C109.139 29.1829 108.499 31.9678 107.218 37.5375L105.297 45.8915C102.408 58.4562 91.837 67.7988 79 69.7222"
        stroke={color}
        strokeWidth="8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M27.375 25.4722H21.4642C15.5599 25.4722 12.6078 25.4722 11.0676 27.3276C9.5275 29.1829 10.1679 31.9678 11.4487 37.5375L13.3698 45.8915C16.2592 58.4562 26.8299 67.7988 39.6667 69.7222"
        stroke={color}
        strokeWidth="8.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M59.3334 84.4722C74.1856 84.4722 86.6946 61.5502 90.4544 30.3441C91.4943 21.7138 92.0145 17.3987 89.2601 14.0604C86.5063 10.7222 82.0597 10.7222 73.1659 10.7222H45.5007C36.6073 10.7222 32.1606 10.7222 29.4065 14.0604C26.6523 17.3987 27.1722 21.7138 28.2121 30.3441C31.9721 61.5502 44.4813 84.4722 59.3334 84.4722Z"
        stroke={color}
        strokeWidth="8.5"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export default SvgChampion;

