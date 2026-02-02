import React from 'react';
import ErrorBoundary from '../components/ErrorBoundary';

/**
 * Higher-Order Component that wraps a screen component with ErrorBoundary
 * @param {React.Component} Component - The screen component to wrap
 * @param {string} screenName - Optional name for better error reporting
 * @returns {React.Component} - Wrapped component with ErrorBoundary
 */
export const withErrorBoundary = (Component, screenName = 'Screen') => {
  const WrappedComponent = (props) => {
    return (
      <ErrorBoundary>
        <Component {...props} />
      </ErrorBoundary>
    );
  };

  // Preserve display name for debugging
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || screenName})`;

  return WrappedComponent;
};

export default withErrorBoundary;
