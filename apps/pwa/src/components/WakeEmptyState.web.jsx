// Reusable empty-state component (web only).
// Renders icon → title → optional CTA with a staggered fade-up entrance.
// Per the Wake design language: dark canvas, white tones (no accent without an
// image), no explanatory subtext — the title carries the message. The `subtitle`
// prop is kept for backward compatibility but should be left unset.
import React from 'react';

if (typeof document !== 'undefined') {
  const ID = 'wake-empty-css';
  if (!document.getElementById(ID)) {
    const s = document.createElement('style');
    s.id = ID;
    s.textContent = `
      @keyframes wakeEmptyUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      .wake-empty-state__anim { animation: wakeEmptyUp 0.5s cubic-bezier(0.22,1,0.36,1) both; }
    `;
    document.head.appendChild(s);
  }
}

const WakeEmptyState = ({ icon, title, subtitle, ctaLabel, onCta, style }) => (
  <div
    className="wake-empty-state"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      padding: '48px 24px',
      textAlign: 'center',
      ...style,
    }}
  >
    {icon && (
      <div
        className="wake-empty-icon wake-empty-state__icon wake-empty-state__anim"
        style={{ lineHeight: 1, opacity: 0.9 }}
      >
        {icon}
      </div>
    )}
    {title && (
      <p
        className="wake-empty-title wake-empty-state__title wake-empty-state__anim"
        style={{
          margin: 0,
          color: '#ffffff',
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: -0.2,
          fontFamily: 'Inter, sans-serif',
          animationDelay: '0.06s',
        }}
      >
        {title}
      </p>
    )}
    {subtitle && (
      <p
        className="wake-empty-sub wake-empty-state__subtitle wake-empty-state__anim"
        style={{
          margin: 0,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 13,
          fontFamily: 'Inter, sans-serif',
          lineHeight: 1.5,
          maxWidth: 260,
          animationDelay: '0.1s',
        }}
      >
        {subtitle}
      </p>
    )}
    {ctaLabel && onCta && (
      <button
        className="wake-empty-cta wake-empty-state__cta wake-btn-primary wake-empty-state__anim"
        onClick={onCta}
        style={{
          marginTop: 6,
          padding: '14px 28px',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.92)',
          border: 'none',
          color: '#1a1a1a',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
          letterSpacing: '0.02em',
          WebkitTapHighlightColor: 'transparent',
          animationDelay: '0.12s',
        }}
      >
        {ctaLabel}
      </button>
    )}
  </div>
);

export default WakeEmptyState;
