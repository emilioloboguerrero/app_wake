import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './config/queryClient';
import wakeDebug from './utils/wakeDebug';
import { apiClient } from './utils/apiClient';
import { installGlobalHooks as installClientErrorHooks } from './utils/errorReporter';
import App from './App';
import './index.css';

// Global boot timer — tracks time from JS execution to first meaningful render
window.__WAKE_BOOT = performance.now();

installClientErrorHooks();

// Initialize debug instrumentation (no-op when WAKE_DEBUG !== '1')
wakeDebug.patchApiClient(apiClient);
wakeDebug.patchQueryClient(queryClient);
wakeDebug.startMemoryTracking();

// Only use StrictMode in development to avoid double renders in production
const AppWrapper = import.meta.env.DEV ? (
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
) : (
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);

ReactDOM.createRoot(document.getElementById('root')).render(AppWrapper);

