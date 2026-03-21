import { forwardRef } from 'react';
import './BentoGrid.css';

export function BentoGrid({ children, className = '' }) {
  return (
    <div className={`bento-grid ${className}`}>
      {children}
    </div>
  );
}

export const BentoCard = forwardRef(function BentoCard(
  { children, className = '', span = '1x1', onClick, style },
  ref
) {
  return (
    <div
      ref={ref}
      className={`bento-card bento-card--${span} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      style={style}
    >
      {children}
    </div>
  );
});

export default BentoGrid;
