import './ErrorStates.css';

const AlertTriangleIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export function InlineError({ message, field }) {
  if (!message) return null;

  return (
    <p
      className="inline-error"
      role="alert"
      {...(field ? { id: `${field}-error` } : {})}
    >
      {message}
    </p>
  );
}

export function FullScreenError({ title = 'Algo salió mal', message, onRetry, icon }) {
  return (
    <div className="fullscreen-error">
      <div className="fullscreen-error-icon">
        {icon || <AlertTriangleIcon />}
      </div>
      <h2 className="fullscreen-error-title">{title}</h2>
      {message && <p className="fullscreen-error-message">{message}</p>}
      {onRetry && (
        <button className="fullscreen-error-retry" onClick={onRetry}>
          Intentar de nuevo
        </button>
      )}
    </div>
  );
}
