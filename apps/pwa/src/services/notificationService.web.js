import apiClient from '../utils/apiClient';
import logger from '../utils/logger';

// VAPID public key — set this after generating keys with `npx web-push generate-vapid-keys`
// and storing the private key in Firebase Secret Manager.
// This is the public key only (safe to embed client-side).
const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    logger.warn('[notifications] Navegador no soporta notificaciones');
    return 'unsupported';
  }

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  const result = await Notification.requestPermission();
  return result;
}

export async function subscribeToPush(userId) {
  if (!VAPID_PUBLIC_KEY) {
    logger.warn('[notifications] VAPID_PUBLIC_KEY no configurada');
    return null;
  }

  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const subJson = subscription.toJSON();

  try {
    await apiClient.post('/notifications/subscribe', {
      endpoint: subJson.endpoint,
      keys: subJson.keys,
      userAgent: navigator.userAgent,
    });
    logger.debug('[notifications] Suscripción registrada');
  } catch (err) {
    logger.error('[notifications] Error registrando suscripción:', err);
  }

  return subscription;
}

export async function sendTestNotification() {
  return apiClient.post('/notifications/test', {});
}

export async function scheduleRestTimerNotification({ endAtIso, metadata }) {
  try {
    await apiClient.post('/notifications/schedule-timer', {
      endAtIso,
      metadata,
    });
  } catch (err) {
    logger.error('[notifications] Error programando notificación de descanso:', err);
  }
}

export async function initializeNotifications(userId) {
  try {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      logger.debug('[notifications] Permiso no otorgado:', permission);
      return;
    }
    await subscribeToPush(userId);
  } catch (err) {
    logger.error('[notifications] Error inicializando notificaciones:', err);
  }
}
