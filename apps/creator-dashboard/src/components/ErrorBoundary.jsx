import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Could log to a service here
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
              background: 'var(--accent, #BFA84D)',
              color: '#111',
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
