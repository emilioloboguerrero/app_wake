import { useState, useEffect, useCallback, useRef } from 'react';
import './SpotlightTutorial.css';

const STORAGE_PREFIX = 'wake_tutorial_';

export default function SpotlightTutorial({ screenKey, steps }) {
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [cutout, setCutout] = useState(null);
  const tooltipRef = useRef(null);

  const storageKey = `${STORAGE_PREFIX}${screenKey}`;

  const openTutorial = useCallback(() => {
    setStepIndex(0);
    setVisible(true);
  }, []);

  const closeTutorial = useCallback(() => {
    setVisible(false);
    localStorage.setItem(storageKey, '1');
  }, [storageKey]);

  // Auto-show on first visit
  useEffect(() => {
    if (!localStorage.getItem(storageKey)) {
      const timer = setTimeout(openTutorial, 600);
      return () => clearTimeout(timer);
    }
  }, [storageKey, openTutorial]);

  // Update cutout when step changes
  useEffect(() => {
    if (!visible) return;
    const step = steps[stepIndex];
    if (!step?.selector) { setCutout(null); return; }

    const el = document.querySelector(step.selector);
    if (!el) { setCutout(null); return; }

    const rect = el.getBoundingClientRect();
    setCutout({ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 });
  }, [visible, stepIndex, steps]);

  const goNext = () => {
    if (stepIndex < steps.length - 1) setStepIndex(i => i + 1);
    else closeTutorial();
  };

  const goPrev = () => { if (stepIndex > 0) setStepIndex(i => i - 1); };

  if (!steps?.length) return null;

  const step = steps[stepIndex];

  return (
    <>
      {/* FAB */}
      <button className="spt-fab" onClick={openTutorial} aria-label="Ayuda">?</button>

      {/* Overlay */}
      {visible && (
        <div className="spt-overlay" onClick={goNext} role="dialog" aria-modal="true">
          {/* Cutout hole */}
          {cutout && (
            <div
              className="spt-cutout"
              style={{
                top: cutout.top,
                left: cutout.left,
                width: cutout.width,
                height: cutout.height,
              }}
            />
          )}

          {/* Tooltip */}
          <div
            ref={tooltipRef}
            className="spt-tooltip"
            onClick={(e) => e.stopPropagation()}
            style={cutout ? resolveTooltipPosition(cutout) : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
          >
            <p className="spt-step-counter">
              {stepIndex + 1} / {steps.length}
            </p>
            <h3 className="spt-title">{step.title}</h3>
            <p className="spt-body">{step.body}</p>
            <div className="spt-actions">
              {stepIndex > 0 && (
                <button className="spt-btn spt-btn--ghost" onClick={goPrev}>
                  Anterior
                </button>
              )}
              <button className="spt-btn spt-btn--primary" onClick={goNext}>
                {stepIndex < steps.length - 1 ? 'Siguiente' : 'Finalizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function resolveTooltipPosition(cutout) {
  const TOOLTIP_H = 160;
  const TOOLTIP_W = 280;
  const PAD = 12;
  const vp = { w: window.innerWidth, h: window.innerHeight };

  // Try below, then above, then right, then center
  const spaceBelow = vp.h - (cutout.top + cutout.height);
  const spaceAbove = cutout.top;

  if (spaceBelow >= TOOLTIP_H + PAD) {
    return {
      top: cutout.top + cutout.height + PAD,
      left: Math.min(Math.max(cutout.left, PAD), vp.w - TOOLTIP_W - PAD),
      transform: 'none',
    };
  }
  if (spaceAbove >= TOOLTIP_H + PAD) {
    return {
      top: cutout.top - TOOLTIP_H - PAD,
      left: Math.min(Math.max(cutout.left, PAD), vp.w - TOOLTIP_W - PAD),
      transform: 'none',
    };
  }
  return {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  };
}
