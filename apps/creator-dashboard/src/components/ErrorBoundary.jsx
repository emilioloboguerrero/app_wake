import React from 'react';
import { reportError as reportClientError } from '../utils/errorReporter';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
    try {
      reportClientError({
        message: error?.message ? String(error.message) : String(error),
        stack: error?.stack ? String(error.stack) : null,
        url:
          (typeof location !== 'undefined' ? location.pathname : '') +
          (info?.componentStack ?
            ` [react:${info.componentStack.trim().split('\n')[0]?.trim()}]` :
            ''),
      });
    } catch (_) {}
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary, #999)' }}>
          <p style={{ marginBottom: '1rem' }}>Algo salió mal.</p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onReset?.();
            }}
            style={{
              padding: '0.5rem 1.25rem',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
