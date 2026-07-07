import React from 'react';
import ReactDOM from 'react-dom/client';
import analyticsService from './services/analyticsService';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Analytics init dynamically imports posthog-js. Defer it to idle so it never
// competes with the first paint; track() calls before it lands are queued.
const bootAnalytics = () => analyticsService.init();
if ('requestIdleCallback' in window) {
  window.requestIdleCallback(bootAnalytics, { timeout: 2000 });
} else {
  window.setTimeout(bootAnalytics, 1200);
}
