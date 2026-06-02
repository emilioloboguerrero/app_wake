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

export async function requestMagicLink(email, next) {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed) return { success: false, error: 'Ingresa tu correo' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // `next` is optional. When provided, the server allowlist-validates it
    // and embeds it into the email-link continueUrl so the buyer lands on
    // the screen they were trying to reach. Server defaults to /library.
    const body = next ? { email: trimmed, next } : { email: trimmed };
    const res = await fetch('/api/v1/auth/request-magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (res.status === 400) {
        return { success: false, error: body?.error?.message || 'Email inválido' };
      }
      if (res.status === 429) {
        // Surface server's Retry-After hint so the caller can show a
        // countdown and disable resubmits instead of letting the buyer
        // tap "submit" against a still-active cap.
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : null;
        return {
          success: false,
          error: 'Esperá un momento antes de pedir otro enlace.',
          retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60,
        };
      }
      if (res.status === 503) {
        return { success: false, error: 'No pudimos enviar el enlace. Intentá de nuevo en un momento.' };
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
