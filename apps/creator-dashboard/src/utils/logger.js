// Logger utility for Wake Creator Dashboard
// Logs in development and when WAKE_DEBUG is enabled; suppresses in production otherwise

const isDev = import.meta.env.DEV;
const isDebug = () => isDev || localStorage.getItem('WAKE_DEBUG') === 'true';

const logger = {
  log: (...args) => {
    if (isDebug()) console.log('[WAKE]', ...args);
  },
  error: (...args) => {
    // Always surface errors — they indicate real failures
    console.error('[WAKE ERROR]', ...args);
  },
  warn: (...args) => {
    if (isDebug()) console.warn('[WAKE WARN]', ...args);
  },
  debug: (...args) => {
    if (isDebug()) console.debug('[WAKE DEBUG]', ...args);
  },
};

export default logger;
