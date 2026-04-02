import { useEffect } from 'react';
import { useRevealContext } from '../../contexts/ProgressiveRevealContext';
import AnnotationCard from './AnnotationCard';
import './Revealable.css';

export default function Revealable({ step, children }) {
  const ctx = useRevealContext();

  // If no context (not inside a provider), render children as-is
  if (!ctx) return children;

  const { getStepState, registerStep, unregisterStep, currentStepConfig, advance, skip, currentStep, totalSteps } = ctx;

  // Register/unregister on mount
  useEffect(() => {
    registerStep(step);
    return () => unregisterStep(step);
  }, [step, registerStep, unregisterStep]);

  const state = getStepState(step);

  if (state === 'inactive') return children;

  const isFocused = state === 'focused';
  const className = [
    'revealable',
    state === 'focused' && 'revealable--focused',
    state === 'revealed' && 'revealable--revealed',
  ].filter(Boolean).join(' ');

  return (
    <div className={className}>
      {children}
      {isFocused && currentStepConfig && (
        <AnnotationCard
          stepNumber={currentStep + 1}
          totalSteps={totalSteps}
          title={currentStepConfig.title}
          body={currentStepConfig.body}
          placement={currentStepConfig.placement}
          isLast={currentStep + 1 >= totalSteps}
          onAdvance={advance}
          onSkip={skip}
        />
      )}
    </div>
  );
}
