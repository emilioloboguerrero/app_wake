import { useState, useCallback, useEffect, useRef } from 'react';
import { GlowingEffect } from '../ui';

export default function SimpleCreateOverlay({
  isOpen,
  onClose,
  title,
  description,
  placeholder,
  ctaLabel,
  creatingText,
  successTitle,
  successDesc,
  onSubmit,
  isPending,
  isSuccess,
}) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);
  const step = isSuccess ? 'success' : isPending ? 'creating' : 'name';

  useEffect(() => {
    if (isOpen) {
      setName('');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || step !== 'name') return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, step, onClose]);

  const handleSubmit = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }, [name, onSubmit]);

  if (!isOpen) return null;

  return (
    <div className="cfo-overlay" onClick={step === 'name' ? onClose : undefined}>
      <div className="cfo-card" onClick={(e) => e.stopPropagation()}>
        <GlowingEffect spread={40} borderWidth={1} />
        <div className="cfo-topbar">
          <div />
          {step === 'name' && (
            <button type="button" className="cfo-close" onClick={onClose} aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <div className="cfo-body">
          {step === 'name' && (
            <div className="cfo-step">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">{title}</h1>
                <p className="cfo-step__desc">{description}</p>
              </div>
              <div className="cfo-step__content">
                <input
                  ref={inputRef}
                  className="cfo-name-input"
                  type="text"
                  placeholder={placeholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) handleSubmit(); }}
                  maxLength={80}
                />
              </div>
              <div className="cfo-footer" style={{ justifyContent: 'center' }}>
                <button type="button" className="cfo-next-btn" onClick={handleSubmit} disabled={!name.trim()}>
                  {ctaLabel}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          )}
          {step === 'creating' && (
            <div className="cfo-step cfo-step--center">
              <div className="cfo-spinner" />
              <p className="cfo-status-text">{creatingText}</p>
            </div>
          )}
          {step === 'success' && (
            <div className="cfo-step cfo-step--center">
              <div className="cfo-check-wrap">
                <svg className="cfo-check-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle className="cfo-check-circle" cx="24" cy="24" r="22" stroke="rgba(74,222,128,0.8)" strokeWidth="2.5" />
                  <path className="cfo-check-path" d="M14 25l7 7 13-14" stroke="rgba(74,222,128,0.9)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="cfo-success-title">{successTitle}</h2>
              <p className="cfo-success-desc">{successDesc}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
