import React from 'react';
import DOMPurify from 'dompurify';

const CSS_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\)|[a-zA-Z]+)$/;

const SvgIcon = ({ svgString, width = 32, height = 32, color = '#ffffff', className = '' }) => {
  const safeColor = CSS_COLOR_RE.test(color) ? color : '#ffffff';

  let svgWithColor = DOMPurify.sanitize(svgString, { USE_PROFILES: { svg: true, svgFilters: true } });
  svgWithColor = svgWithColor.replace(/stroke="currentColor"/g, `stroke="${safeColor}"`);
  svgWithColor = svgWithColor.replace(/fill="currentColor"/g, `fill="${safeColor}"`);
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
        color: safeColor
      }}
      dangerouslySetInnerHTML={{ __html: svgWithColor }}
    />
  );
};

export default SvgIcon;

