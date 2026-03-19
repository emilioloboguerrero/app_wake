import { useState } from 'react';
import './DisplayCards.css';

function DisplayCard({
  className = '',
  icon,
  title = 'Featured',
  description = 'Discover amazing content',
  date = 'Just now',
}) {
  return (
    <div className={`display-card ${className}`}>
      <div className="display-card-header">
        <span className="display-card-icon-wrap">
          {icon}
        </span>
        <p className="display-card-title">{title}</p>
      </div>
      <p className="display-card-description">{description}</p>
      <p className="display-card-date">{date}</p>
    </div>
  );
}

export default function DisplayCards({ cards }) {
  const defaultCards = [
    { className: 'display-card--back-2' },
    { className: 'display-card--back-1' },
    { className: 'display-card--front' },
  ];

  const displayCards = cards || defaultCards;

  return (
    <div className="display-cards-grid">
      {displayCards.map((cardProps, index) => (
        <DisplayCard key={index} {...cardProps} />
      ))}
    </div>
  );
}

export function ScrollableDisplayCards({ items, renderCard }) {
  const [offset, setOffset] = useState(0);
  const canPrev = offset > 0;
  const canNext = offset + 3 < items.length;
  const visible = items.slice(offset, offset + 3);

  const classNames = ['display-card--back-2', 'display-card--back-1', 'display-card--front'];

  const cards = visible.map((item, i) => ({
    ...renderCard(item),
    className: classNames[i],
  }));

  return (
    <div className="scrollable-display-cards">
      <button
        className="sdc-arrow sdc-arrow--prev"
        onClick={() => setOffset(o => o - 1)}
        disabled={!canPrev}
        aria-label="Anterior"
      >‹</button>
      <DisplayCards cards={cards} />
      <button
        className="sdc-arrow sdc-arrow--next"
        onClick={() => setOffset(o => o + 1)}
        disabled={!canNext}
        aria-label="Siguiente"
      >›</button>
      <p className="sdc-counter">{offset + Math.min(3, visible.length)} de {items.length}</p>
    </div>
  );
}
