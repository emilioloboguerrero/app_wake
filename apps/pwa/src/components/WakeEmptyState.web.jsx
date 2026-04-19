// Reusable empty-state component (web only).
// Renders icon → title → subtitle → optional CTA with staggered fade-up animation.
import React from 'react';

const WakeEmptyState = ({ icon, title, subtitle, ctaLabel, onCta, style }) => (
  <div
    className="wake-empty-state"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: '32px 24px',
      textAlign: 'center',
      ...style,
    }}
  >
    {icon && (
      <div className="wake-empty-icon wake-empty-state__icon" style={{ fontSize: 40, lineHeight: 1 }}>
        {icon}
      </div>
    )}
    {title && (
      <p
        className="wake-empty-title wake-empty-state__title"
        style={{
          margin: 0,
          color: '#ffffff',
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {title}
      </p>
    )}
    {subtitle && (
      <p
        className="wake-empty-sub wake-empty-state__subtitle"
        style={{
          margin: 0,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 13,
          fontFamily: 'Inter, sans-serif',
          lineHeight: 1.5,
          maxWidth: 260,
        }}
      >
        {subtitle}
      </p>
    )}
    {ctaLabel && onCta && (
      <button
        className="wake-empty-cta wake-empty-state__cta wake-btn-primary"
        onClick={onCta}
        style={{
          marginTop: 8,
          padding: '10px 24px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.85)',
          border: 'none',
          color: '#1a1a1a',
          fontSize: 13,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
          letterSpacing: '0.5px',
        }}
      >
        {ctaLabel}
      </button>
    )}
  </div>
);

export default WakeEmptyState;
