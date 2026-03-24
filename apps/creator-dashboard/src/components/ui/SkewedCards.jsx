import './SkewedCards.css';

function SkewedCard({
  className = '',
  icon,
  title = '',
  description = '',
  date = '',
  iconClassName = '',
  titleClassName = '',
  onClick,
}) {
  return (
    <div
      className={`skewed-card ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <div className="skewed-card-overlay" />
      <div className="skewed-card-row">
        {icon && (
          <span className={`skewed-card-icon ${iconClassName}`}>{icon}</span>
        )}
        <p className={`skewed-card-title ${titleClassName}`}>{title}</p>
      </div>
      <p className="skewed-card-description">{description}</p>
      {date && <p className="skewed-card-date">{date}</p>}
    </div>
  );
}

export default function SkewedCards({ cards = [] }) {
  return (
    <div className="skewed-cards-grid">
      {cards.map(({ key, ...cardProps }, index) => (
        <SkewedCard key={key || index} {...cardProps} />
      ))}
    </div>
  );
}

export { SkewedCard };
