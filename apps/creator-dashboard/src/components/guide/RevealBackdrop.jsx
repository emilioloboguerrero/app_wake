import { useRevealContext } from '../../contexts/ProgressiveRevealContext';
import './Revealable.css';

export default function RevealBackdrop({ children }) {
  const ctx = useRevealContext();

  if (!ctx || !ctx.isActive) return children;

  return (
    <div className="revealable">
      {children}
    </div>
  );
}
