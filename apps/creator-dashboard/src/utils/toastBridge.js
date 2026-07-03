// Imperative bridge so non-React code (the module-level queryClient's
// MutationCache) can surface a toast. ToastProvider registers its showToast on
// mount; emitToast no-ops until then.
let handler = null;

export function registerToastHandler(fn) {
  handler = fn;
}

export function emitToast(message, type = 'error') {
  if (typeof handler === 'function') handler(message, type);
}
