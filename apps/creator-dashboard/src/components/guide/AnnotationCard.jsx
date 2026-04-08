import './AnnotationCard.css';

const PLACEMENT_STYLES = {
  bottom: { top: 'calc(100% + 12px)', left: '0' },
  top: { bottom: 'calc(100% + 12px)', left: '0' },
  right: { top: '0', left: 'calc(100% + 12px)' },
  left: { top: '0', right: 'calc(100% + 12px)' },
};

export default function AnnotationCard({
  stepNumber,
  totalSteps,
  title,
  body,
  placement = 'bottom',
  isLast,
  onAdvance,
  onSkip,
}) {
  const posStyle = PLACEMENT_STYLES[placement] || PLACEMENT_STYLES.bottom;

  return (
    <div className="ann" style={posStyle}>
      <div className="ann-badge">{stepNumber}</div>
      <div className="ann-card">
        <div className="ann-title">{title}</div>
        <div className="ann-body">{body}</div>
        <div className="ann-actions">
          <button className="ann-skip" onClick={onSkip}>
            Saltar
          </button>
          <div className="ann-right">
            <span className="ann-counter">{stepNumber} / {totalSteps}</span>
            <button className="ann-cta" onClick={onAdvance}>
              {isLast ? 'Listo' : 'Entendido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
