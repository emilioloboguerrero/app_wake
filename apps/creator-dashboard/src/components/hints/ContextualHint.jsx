import useContextualHint from '../../hooks/useContextualHint';
import { X, Lightbulb } from 'lucide-react';
import './ContextualHint.css';

export default function ContextualHint({ screenKey }) {
  const { hint, visible, dismiss } = useContextualHint(screenKey);

  if (!hint || !visible) return null;

  return (
    <div className="ch-card" role="status">
      <div className="ch-card__icon">
        <Lightbulb size={13} />
      </div>
      <div className="ch-card__content">
        <p className="ch-card__title">{hint.title}</p>
        <p className="ch-card__body">{hint.body}</p>
      </div>
      <button className="ch-card__close" onClick={dismiss} aria-label="Cerrar">
        <X size={12} />
      </button>
    </div>
  );
}
