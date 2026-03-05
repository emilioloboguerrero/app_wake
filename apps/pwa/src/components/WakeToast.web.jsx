// WakeToast — Portal-based toast notification (web only).
// Portals to document.body so it floats above all screen content.
// Props:
//   toasts: Array<{ id, message, type, actionLabel, onAction }>
//   removeToast: (id) => void
//
// Usage pattern — in each screen:
//   const [toasts, setToasts] = useState([]);
//   const showToast = (message, type = 'success', opts = {}) => {
//     const id = Date.now();
//     setToasts(prev => [...prev, { id, message, type, ...opts }]);
//   };
//   const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));
//   <WakeToast toasts={toasts} removeToast={removeToast} />

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ICONS = {
  success: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" stroke="rgba(76,175,80,0.8)" />
      <path d="M4 7l2 2 4-4" stroke="rgba(76,175,80,1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  info: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" stroke="rgba(255,255,255,0.8)" />
      <path d="M7 6v4M7 4.5v.5" stroke="rgba(255,255,255,1)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  pr: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1l1.5 3.5L12 5l-2.5 2.5.6 3.5L7 9.5l-3.1 1.5.6-3.5L2 5l3.5-.5L7 1z" fill="rgba(255,255,255,0.9)" stroke="rgba(255,255,255,1)" strokeWidth="0.5" />
    </svg>
  ),
};

function ToastItem({ id, message, type = 'success', icon, actionLabel, onAction, removeToast, duration = 3500 }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);

  const dismiss = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => removeToast(id), 220);
  };

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, duration);
    return () => clearTimeout(timerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = () => {
    clearTimeout(timerRef.current);
    onAction?.();
    dismiss();
  };

  return (
    <div className={`wake-toast ${type}${exiting ? ' exiting' : ''}`} onClick={dismiss}>
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>{icon || ICONS[type] || ICONS.info}</span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{message}</span>
      {actionLabel && onAction && (
        <button
          className="wake-toast-action"
          onClick={e => { e.stopPropagation(); handleAction(); }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function WakeToast({ toasts = [], removeToast }) {
  if (!toasts.length) return null;
  return createPortal(
    <div className="wake-toast-root">
      {toasts.map(t => (
        <ToastItem
          key={t.id}
          {...t}
          removeToast={removeToast}
        />
      ))}
    </div>,
    document.body
  );
}

export default WakeToast;

// ── Convenience hook ──────────────────────────────────────────────────────
// Import and call inside any functional component:
//   const { toasts, removeToast, showToast } = useWakeToast();
//   showToast('¡Guardado!');              // default: success, 3.5s
//   showToast('¡Nuevo récord!', 'pr');
//   showToast('Eliminado', 'info', { actionLabel: 'Deshacer', onAction: undo, duration: 5000 });
export function useWakeToast() {
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'success', opts = {}) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, ...opts }]);
  };

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  return { toasts, removeToast, showToast };
}
