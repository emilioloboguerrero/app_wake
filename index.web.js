// MINIMAL WEB ENTRY - Enhanced logging for login route
console.log('[INDEX] ========================================');
console.log('[INDEX] index.web.js LOADING');
console.log('[INDEX] Path:', typeof window !== 'undefined' ? window.location.pathname : 'server');
console.log('[INDEX] Time:', new Date().toISOString());
console.log('[INDEX] ========================================');

// Skip error logging on login to prevent freezes
if (typeof window !== 'undefined' && window.location.pathname === '/login') {
  console.log('[INDEX] ✅ Login route detected - skipping error logging');
  console.log('[INDEX] Will load LoginScreen directly');
} else {
  // Only run error logging for non-login routes
  (function() {
    'use strict';
    if (typeof window === 'undefined') return;
    
    var ERROR_LOG_KEY = 'WAKE_ERROR_LOG';
    var initTime = Date.now();
    
    try {
      localStorage.setItem('WAKE_INDEX_WEB_LOADED', initTime.toString());
      console.log('[WAKE INDEX] index.web.js loaded at:', new Date(initTime).toISOString());
    } catch (e) {
      console.error('[WAKE INDEX] localStorage failed:', e);
    }
    
    function initErrorLog() {
      try {
        if (!localStorage.getItem(ERROR_LOG_KEY)) {
          localStorage.setItem(ERROR_LOG_KEY, JSON.stringify([]));
        }
        localStorage.setItem('WAKE_ERROR_LOG_READY', 'true');
        console.log('[WAKE INDEX] Error log initialized');
      } catch (e) {
        console.error('[WAKE INDEX] Init failed:', e);
      }
    }
    
    function saveErrorLog(entry) {
      try {
        var existing = localStorage.getItem(ERROR_LOG_KEY);
        var logs = existing ? JSON.parse(existing) : [];
        
        var logEntry = {
          type: entry.type || 'unknown',
          message: entry.message || '',
          timestamp: new Date().toISOString(),
          url: window.location.href
        };
        if (entry.source) logEntry.source = entry.source;
        if (entry.stack) logEntry.stack = entry.stack;
        
        logs.push(logEntry);
        if (logs.length > 100) logs.splice(0, logs.length - 100);
        localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(logs));
      } catch (e) {
        // Fail silently
      }
    }
    
    initErrorLog();
    saveErrorLog({ type: 'system', message: 'Error logging initialized' });
    
    window.addEventListener('error', function(event) {
      try {
        var message = String(event.message || '');
        var source = String(event.filename || '');
        
        if (message.indexOf('chrome-extension://') !== -1 ||
            source.indexOf('chrome-extension://') !== -1) {
          event.preventDefault();
          return false;
        }
        
        var error = event.error;
        saveErrorLog({
          type: 'global_error',
          message: message,
          source: source,
          stack: error ? error.stack : ''
        });
      } catch (e) {}
    }, true);
    
    window.addEventListener('unhandledrejection', function(event) {
      try {
        var reason = event.reason;
        var reasonStr = reason ? String(reason) : '';
        
        if (reasonStr.indexOf('chrome-extension://') !== -1) {
          event.preventDefault();
          return false;
        }
        
        saveErrorLog({
          type: 'unhandled_rejection',
          reason: reasonStr,
          stack: reason && reason.stack ? reason.stack : ''
        });
      } catch (e) {}
    }, true);
    
    console.log('[WAKE INDEX] Error logging ready');
  })();
}

// Web entry point
console.log('[INDEX] About to import registerRootComponent');
import { registerRootComponent } from 'expo';
console.log('[INDEX] ✅ registerRootComponent imported');

console.log('[INDEX] About to import App from ./src/App.web');
import App from './src/App.web';
console.log('[INDEX] ✅ App imported');

console.log('[INDEX] About to register root component');
registerRootComponent(App);
console.log('[INDEX] ✅ Root component registered');
