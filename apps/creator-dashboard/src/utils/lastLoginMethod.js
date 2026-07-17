// Remembers the last sign-in method (and email) for THIS device so the creator
// login screen can nudge toward the door already used — cutting the
// duplicate-account / wrong-provider mistake. Plain localStorage, shared across
// the wakelab.co origin. Best-effort; never throws into the UI.
export const LAST_METHOD_KEY = 'wake_last_login_method'; // 'email' | 'google'
export const LAST_EMAIL_KEY = 'wake_last_login_email';

export function recordLoginMethod(method, email) {
  if (!method) return;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LAST_METHOD_KEY, method);
      if (email) window.localStorage.setItem(LAST_EMAIL_KEY, String(email).toLowerCase());
    }
  } catch {
    /* best-effort */
  }
}

export function getLastLoginMethod() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return {
        method: window.localStorage.getItem(LAST_METHOD_KEY) || null,
        email: window.localStorage.getItem(LAST_EMAIL_KEY) || null,
      };
    }
  } catch {
    /* best-effort */
  }
  return { method: null, email: null };
}
