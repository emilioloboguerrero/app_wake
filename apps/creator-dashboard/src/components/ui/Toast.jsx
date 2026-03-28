import React, { useState, useEffect } from 'react';
import './Toast.css';

const ICONS = {
  success: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  error: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 5l4 4M9 5l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  info: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 6.5v3M7 4.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
};

const Toast = ({ id, message, type, duration, onRemove, action }) => {
  const [phase, setPhase] = useState('enter');

  useEffect(() => {
    const exitTimer = setTimeout(() => setPhase('exit'), duration);
    return () => clearTimeout(exitTimer);
  }, [duration]);

  const handleAnimEnd = (e) => {
    if (phase === 'exit' && e.animationName === 'toast-out') onRemove(id);
  };

  return (
    <div
      className={`toast toast-${type} toast-${phase}`}
      onAnimationEnd={handleAnimEnd}
      onClick={action ? undefined : () => setPhase('exit')}
      role="status"
      aria-live="polite"
    >
      <span className={`toast-icon toast-icon-${type}`}>{ICONS[type]}</span>
      <span className="toast-message">{message}</span>
      {action && (
        <button
          type="button"
          className="toast-action"
          onClick={(e) => { e.stopPropagation(); onRemove(id); action.onClick(); }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export const ToastContainer = ({ toasts, onRemove }) => {
  if (!toasts.length) return null;
  return (
    <div className="toast-container" aria-label="Notificaciones">
      {toasts.map(t => (
        <Toast key={t.id} {...t} onRemove={onRemove} />
      ))}
    </div>
  );
};

export default Toast;
