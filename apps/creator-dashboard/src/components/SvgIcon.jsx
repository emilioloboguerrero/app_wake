import React from 'react';

const SvgIcon = ({ svgString, width = 32, height = 32, color = '#ffffff', className = '' }) => {
  // Parse the SVG string and inject the color
  // Replace stroke="currentColor" with the actual color
  let svgWithColor = svgString.replace(/stroke="currentColor"/g, `stroke="${color}"`);
  // Replace fill="currentColor" with the actual color (for yoga icon)
  svgWithColor = svgWithColor.replace(/fill="currentColor"/g, `fill="${color}"`);
  // Also handle stroke-width vs strokeWidth
  svgWithColor = svgWithColor.replace(/stroke-width=/g, 'strokeWidth=');
  
  return (
    <div 
      className={className}
      style={{ 
        width: `${width}px`, 
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: color // Set color for any remaining currentColor references
      }}
      dangerouslySetInnerHTML={{ __html: svgWithColor }}
    />
  );
};

export default SvgIcon;

