// Public passwordless sign-in. Asks the backend to email the requester a
// Firebase Auth email-link. Backend always returns success (prevents
// enumeration). Caller should show a generic "if the email is registered,
// you'll receive a link" message regardless of outcome.

const REQUEST_TIMEOUT_MS = 15_000;

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
    return { success: true };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError') {
      return { success: false, error: 'La solicitud tardó demasiado. Intentalo de nuevo.' };
    }
    return { success: false, error: 'Error de red. Intentalo de nuevo.' };
  }
}
