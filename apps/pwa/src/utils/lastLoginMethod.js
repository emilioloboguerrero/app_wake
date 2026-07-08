// Remembers the last sign-in method (and email) for THIS device so the login
// screen can nudge the buyer toward the door they already used — cutting the
// duplicate-account / wrong-provider mistake that strands buyers.
//
// On web the keys live in plain localStorage so the buy flow (landing app,
// same wakelab.co origin) can seed them at purchase time and the PWA reads the
// same value. On native we fall back to AsyncStorage. All calls are
// best-effort and never throw into the UI.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LAST_METHOD_KEY = 'wake_last_login_method'; // 'email' | 'google' | 'apple'
export const LAST_EMAIL_KEY = 'wake_last_login_email';

const isWeb = Platform.OS === 'web';

export async function recordLoginMethod(method, email) {
  if (!method) return;
  try {
    if (isWeb) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LAST_METHOD_KEY, method);
        if (email) window.localStorage.setItem(LAST_EMAIL_KEY, String(email).toLowerCase());
      }
      return;
    }
    await AsyncStorage.setItem(LAST_METHOD_KEY, method);
    if (email) await AsyncStorage.setItem(LAST_EMAIL_KEY, String(email).toLowerCase());
  } catch {
    /* best-effort */
  }
}

export async function getLastLoginMethod() {
  try {
    if (isWeb) {
      if (typeof window !== 'undefined' && window.localStorage) {
        return {
          method: window.localStorage.getItem(LAST_METHOD_KEY) || null,
          email: window.localStorage.getItem(LAST_EMAIL_KEY) || null,
        };
      }
      return { method: null, email: null };
    }
    const [method, email] = await Promise.all([
      AsyncStorage.getItem(LAST_METHOD_KEY),
      AsyncStorage.getItem(LAST_EMAIL_KEY),
    ]);
    return { method: method || null, email: email || null };
  } catch {
    return { method: null, email: null };
  }
}
