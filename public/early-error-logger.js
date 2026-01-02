// EARLY ERROR LOGGER - Runs as early as possible
// This file should be loaded in a <script> tag in the HTML before anything else

(function() {
  'use strict';
  
  // Use only basic JavaScript - no modern features
  if (typeof window === 'undefined') return;
  
  // Skip error logging on login route to prevent freezes
  if (window.location.pathname === '/login') {
    console.log('[WAKE EARLY] Error logging disabled for login route');
    return; // Exit early, don't set up error logging
  }
  
  var ERROR_LOG_KEY = 'WAKE_ERROR_LOG';
  var MAX_LOG_ENTRIES = 100;
  var initTime = Date.now();
  
  // Simple test - save immediately when script loads
  try {
    localStorage.setItem('WAKE_EARLY_SCRIPT_LOADED', initTime.toString());
    console.log('[WAKE EARLY] Script loaded at:', new Date(initTime).toISOString());
  } catch (e) {
    console.error('[WAKE EARLY] Failed to write to localStorage:', e);
  }
  
  // Initialize error log storage (basic version)
  function initErrorLog() {
    try {
      var existing = localStorage.getItem(ERROR_LOG_KEY);
      if (!existing) {
        localStorage.setItem(ERROR_LOG_KEY, JSON.stringify([]));
      }
      localStorage.setItem('WAKE_ERROR_LOG_READY', 'true');
      localStorage.setItem('WAKE_ERROR_LOG_INIT_TIME', initTime.toString());
      
      // Log that we initialized
      console.log('[WAKE EARLY] Error log initialized');
    } catch (e) {
      console.error('[WAKE EARLY] Init failed:', e);
      try {
        localStorage.setItem('WAKE_ERROR_LOG_INIT_FAILED', String(e));
      } catch (e2) {}
    }
  }
  
  // Save error log (basic version, no spread operator)
  function saveErrorLog(entry) {
    try {
      var existing = localStorage.getItem(ERROR_LOG_KEY);
      var logs = existing ? JSON.parse(existing) : [];
      
      // Create entry object manually (no spread)
      var logEntry = {
        type: entry.type || 'unknown',
        message: entry.message || '',
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      };
      
      // Add optional fields
      if (entry.source) logEntry.source = entry.source;
      if (entry.lineno) logEntry.lineno = entry.lineno;
      if (entry.colno) logEntry.colno = entry.colno;
      if (entry.stack) logEntry.stack = entry.stack;
      if (entry.errorName) logEntry.errorName = entry.errorName;
      if (entry.suppressed !== undefined) logEntry.suppressed = entry.suppressed;
      
      logs.push(logEntry);
      
      if (logs.length > MAX_LOG_ENTRIES) {
        logs.splice(0, logs.length - MAX_LOG_ENTRIES);
      }
      
      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(logs));
      
      // Update last save time
      localStorage.setItem('WAKE_ERROR_LOG_LAST_SAVE', Date.now().toString());
    } catch (e) {
      // If logging fails, try to save at least a simple message
      try {
        var simpleMsg = String(entry.message || entry.type || 'Unknown error');
        localStorage.setItem(ERROR_LOG_KEY + '_LAST', simpleMsg + ' | ' + Date.now());
      } catch (e2) {}
    }
  }
  
  // Initialize immediately
  initErrorLog();
  
  // Log initialization
  saveErrorLog({
    type: 'system',
    message: 'Early error logging system initialized'
  });
  
  // Catch errors immediately
  window.addEventListener('error', function(event) {
    try {
      var message = String(event.message || '');
      var source = String(event.filename || event.target ? (event.target.src || '') : '');
      
      // Suppress extension errors but still log them
      if (message.indexOf('chrome-extension://') !== -1 ||
          source.indexOf('chrome-extension://') !== -1 ||
          message.indexOf('ERR_FILE_NOT_FOUND') !== -1 ||
          message.indexOf('pejdijmoenmkgeppbflobdenhhabjlaj') !== -1) {
        saveErrorLog({
          type: 'extension_error',
          message: message,
          source: source,
          suppressed: true
        });
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
      
      // Log real errors
      var error = event.error;
      saveErrorLog({
        type: 'global_error',
        message: message,
        source: source,
        lineno: event.lineno,
        colno: event.colno,
        stack: error ? error.stack : '',
        errorName: error ? error.name : ''
      });
    } catch (e) {
      try {
        localStorage.setItem('WAKE_CRITICAL_ERROR', Date.now().toString());
      } catch (e2) {}
    }
  }, true);
  
  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    try {
      var reason = event.reason;
      var reasonStr = reason ? String(reason) : '';
      
      if (reasonStr.indexOf('chrome-extension://') !== -1 ||
          reasonStr.indexOf('ERR_FILE_NOT_FOUND') !== -1 ||
          reasonStr.indexOf('pejdijmoenmkgeppbflobdenhhabjlaj') !== -1) {
        saveErrorLog({
          type: 'extension_rejection',
          reason: reasonStr,
          suppressed: true
        });
        event.preventDefault();
        return false;
      }
      
      saveErrorLog({
        type: 'unhandled_rejection',
        reason: reasonStr,
        stack: reason && reason.stack ? reason.stack : '',
        errorName: reason && reason.name ? reason.name : ''
      });
    } catch (e) {
      try {
        localStorage.setItem('WAKE_CRITICAL_REJECTION', Date.now().toString());
      } catch (e2) {}
    }
  }, true);
  
  // Override console.error
  var originalError = console.error;
  console.error = function() {
    try {
      var args = Array.prototype.slice.call(arguments);
      var message = args.map(function(a) { return String(a); }).join(' ');
      
      if (message.indexOf('chrome-extension://') !== -1 ||
          message.indexOf('ERR_FILE_NOT_FOUND') !== -1 ||
          message.indexOf('pejdijmoenmkgeppbflobdenhhabjlaj') !== -1) {
        saveErrorLog({
          type: 'extension_error',
          message: message,
          suppressed: true
        });
        return; // Suppress from console
      }
      
      // Find stack in arguments
      var stack = '';
      for (var i = 0; i < args.length; i++) {
        if (args[i] && args[i].stack) {
          stack = args[i].stack;
          break;
        }
      }
      
      saveErrorLog({
        type: 'console_error',
        message: message,
        stack: stack
      });
    } catch (e) {
      // If logging fails, still show original error
    }
    
    originalError.apply(console, arguments);
  };
  
  // Expose functions
  window.getWakeErrorLog = function() {
    try {
      var logs = localStorage.getItem(ERROR_LOG_KEY);
      return logs ? JSON.parse(logs) : [];
    } catch (e) {
      return [];
    }
  };
  
  console.log('[WAKE EARLY] Error logging system ready');
})();

