import { useRevealContext } from '../../contexts/ProgressiveRevealContext';
import './RevealProgressBar.css';

export default function RevealProgressBar() {
  const ctx = useRevealContext();
  if (!ctx || !ctx.isActive) return null;

  const { currentStep, totalSteps } = ctx;
  const pct = (currentStep / totalSteps) * 100;

  return (
    <div className="reveal-progress">
      <div
        className="reveal-progress__fill"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
