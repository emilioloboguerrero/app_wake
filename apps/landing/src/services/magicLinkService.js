// Public passwordless sign-in. Asks the backend to email the requester a
// Firebase Auth email-link. Backend always returns success (prevents
// enumeration). Caller should show a generic "if the email is registered,
// you'll receive a link" message regardless of outcome.

const REQUEST_TIMEOUT_MS = 15_000;
// Firebase's signInWithEmailLink REQUIRES the email be passed back in to
// match the address the oobCode was generated for. We stash it here so the
// /email-link handler in the PWA can read it without re-prompting the user
// (or losing them to a "we don't know who you are" detour). Key is shared
// with apps/pwa/src/screens/EmailLinkSignInScreen.web.jsx — do not rename
// without updating both sides.
const STORAGE_KEY = 'wake_email_for_sign_in';

export async function requestMagicLink(email) {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed) return { success: false, error: 'Ingresa tu correo' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch('/api/v1/auth/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email: trimmed }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (res.status === 400) {
        return { success: false, error: body?.error?.message || 'Email inválido' };
      }
      if (res.status === 429) {
        return { success: false, error: 'Esperá un momento antes de pedir otro enlace.' };
      }
      return { success: false, error: 'No pudimos enviar el enlace. Intentalo de nuevo.' };
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // Private mode or quota issues — the /email-link screen will prompt
      // for the email instead. Not worth surfacing to the user here.
    }
    return { success: true };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      return { success: false, error: 'La solicitud tardó demasiado. Intentalo de nuevo.' };
    }
    return { success: false, error: 'Error de red. Intentalo de nuevo.' };
  }
}
