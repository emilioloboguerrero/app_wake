import { useEffect, useRef } from 'react';
import './SlidePanel.css';

export default function SlidePanel({ open, onClose, title, badge, width = 450, children }) {
  const panelRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`sp-backdrop ${open ? 'sp-backdrop--open' : ''}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`sp-panel ${open ? 'sp-panel--open' : ''}`}
        style={{ width }}
      >
        {/* Header */}
        <div className="sp-header">
          <div className="sp-header-left">
            {title && <h3 className="sp-title">{title}</h3>}
            {badge && <span className="sp-badge">{badge}</span>}
          </div>
          <button className="sp-close" onClick={onClose} aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="sp-content">
          {open && children}
        </div>
      </div>
    </>
  );
}
