const OFFLINE_ERROR_EVENT = 'wake:offline-error';

export function showOfflineError() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OFFLINE_ERROR_EVENT, {
      detail: { message: 'Sin conexión. Conéctate a internet para continuar.' },
    })
  );
}

export { OFFLINE_ERROR_EVENT };
