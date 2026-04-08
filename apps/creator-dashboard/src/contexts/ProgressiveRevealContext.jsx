import { createContext, useContext, useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { GUIDE_STEPS, GUIDE_STORAGE_PREFIX } from '../config/guideSteps';

const ProgressiveRevealContext = createContext(null);

export function ProgressiveRevealProvider({ screenKey, children }) {
  const steps = GUIDE_STEPS[screenKey] || [];
  const storageKey = `${GUIDE_STORAGE_PREFIX}${screenKey}`;
  const alreadySeen = useRef(!!localStorage.getItem(storageKey)).current;

  const [status, setStatus] = useState(alreadySeen ? 'complete' : 'idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [registeredSteps, setRegisteredSteps] = useState(new Set());

  // Start guide after delay on first visit
  useEffect(() => {
    if (alreadySeen || steps.length === 0) return;
    const timer = setTimeout(() => setStatus('active'), 800);
    return () => clearTimeout(timer);
  }, [alreadySeen, steps.length]);

  // Auto-skip optional steps whose element isn't mounted
  useEffect(() => {
    if (status !== 'active' || currentStep >= steps.length) return;
    const step = steps[currentStep];
    if (step.optional && !registeredSteps.has(step.key)) {
      // Skip to next step
      if (currentStep + 1 >= steps.length) {
        setStatus('complete');
        localStorage.setItem(storageKey, '1');
      } else {
        setCurrentStep((s) => s + 1);
      }
    }
  }, [status, currentStep, steps, registeredSteps, storageKey]);

  const advance = useCallback(() => {
    setCurrentStep((prev) => {
      const next = prev + 1;
      if (next >= steps.length) {
        setStatus('complete');
        localStorage.setItem(storageKey, '1');
        return prev;
      }
      return next;
    });
  }, [steps.length, storageKey]);

  const skip = useCallback(() => {
    setStatus('complete');
    localStorage.setItem(storageKey, '1');
  }, [storageKey]);

  const registerStep = useCallback((key) => {
    setRegisteredSteps((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const unregisterStep = useCallback((key) => {
    setRegisteredSteps((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const getStepState = useCallback((key) => {
    if (status !== 'active') return 'inactive';
    const idx = steps.findIndex((s) => s.key === key);
    if (idx < 0) return 'inactive';
    if (idx < currentStep) return 'revealed';
    if (idx === currentStep) return 'focused';
    return 'dimmed';
  }, [status, steps, currentStep]);

  const currentStepConfig = status === 'active' && currentStep < steps.length
    ? steps[currentStep]
    : null;

  const value = useMemo(() => ({
    status,
    currentStep,
    totalSteps: steps.length,
    isActive: status === 'active',
    currentStepConfig,
    advance,
    skip,
    getStepState,
    registerStep,
    unregisterStep,
  }), [status, currentStep, steps.length, currentStepConfig, advance, skip, getStepState, registerStep, unregisterStep]);

  return (
    <ProgressiveRevealContext.Provider value={value}>
      {children}
    </ProgressiveRevealContext.Provider>
  );
}

export function useRevealContext() {
  const ctx = useContext(ProgressiveRevealContext);
  if (!ctx) return null;
  return ctx;
}
