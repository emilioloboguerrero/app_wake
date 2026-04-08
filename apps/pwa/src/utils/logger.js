const noop = () => {};

const logger = {
  log: noop,
  warn: noop,
  debug: noop,
  info: noop,
  prod: noop,
  error: (...args) => {
    console.error('[WAKE]', ...args);
  },
};

export default logger;
