import { forwardRef } from 'react';
import './BentoGrid.css';

/**
 * BentoGrid with fixed asymmetric layout templates.
 * @param {'5-panel'|'7-panel'} layout - which grid template to use
 */
export function BentoGrid({ children, className = '', layout = '5-panel' }) {
  return (
    <div className={`bento-grid bento-grid--${layout} ${className}`}>
      {children}
    </div>
  );
}

export const BentoCard = forwardRef(function BentoCard(
  { children, className = '', area, span, onClick, style },
  ref
) {
  const spanClass = span ? `bento-card--${span}` : '';
  const areaStyle = area ? { gridArea: area, ...style } : style;

  return (
    <div
      ref={ref}
      className={`bento-card ${spanClass} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      style={areaStyle}
    >
      {children}
    </div>
  );
});

export default BentoGrid;
