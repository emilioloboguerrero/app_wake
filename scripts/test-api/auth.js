'use strict';

/**
 * Authenticates against Firebase Auth REST API and returns an ID token.
 * Supports both real Firebase and the Auth emulator.
 */
async function getIdToken(email, password, apiKey, authUrl) {
  const base = authUrl || 'https://identitytoolkit.googleapis.com/v1';
  const url = `${base}/accounts:signInWithPassword?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  const data = await res.json();

  if (!res.ok || !data.idToken) {
    const msg = data?.error?.message || 'Unknown auth error';
    throw new Error(`Auth failed for ${email}: ${msg}`);
  }

  return { idToken: data.idToken, localId: data.localId };
}

module.exports = { getIdToken };
