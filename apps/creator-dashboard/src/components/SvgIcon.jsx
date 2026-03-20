import React from 'react';

const sanitizeSvg = (svg) => {
  // Strip script tags and event handlers to prevent XSS
  let clean = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
  clean = clean.replace(/\bon\w+\s*=\s*\{[^}]*\}/gi, '');
  clean = clean.replace(/javascript\s*:/gi, '');
  return clean;
};

const SvgIcon = ({ svgString, width = 32, height = 32, color = '#ffffff', className = '' }) => {
  let svgWithColor = sanitizeSvg(svgString);
  svgWithColor = svgWithColor.replace(/stroke="currentColor"/g, `stroke="${color}"`);
  svgWithColor = svgWithColor.replace(/fill="currentColor"/g, `fill="${color}"`);
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
        color: color
      }}
      dangerouslySetInnerHTML={{ __html: svgWithColor }}
    />
  );
};

export default SvgIcon;

