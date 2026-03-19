import './Tooltip.css';

export default function Tooltip({ label, placement = 'right', children }) {
  return (
    <div className="tooltip-wrapper">
      {children}
      <span className={`tooltip-bubble tooltip-bubble--${placement}`}>{label}</span>
    </div>
  );
}
