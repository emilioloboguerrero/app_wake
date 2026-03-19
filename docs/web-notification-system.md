# Web Notification System for Wake PWA

This document describes the **web-only** notification system for the PWA (`/app`), based on **Web Push + service worker + Cloud Functions**, and how to plug it into the **rest timer** in WorkoutExecutionScreen.

---

## 1. Goals and Scope

- **Scope (this doc):** Only **web** (PWA) behavior. No native / Expo Notifications logic yet.
- **Goals:**
  - Have a central **NotificationService** on web that requests permission, creates a Push subscription, sends it to the backend (linked to the current Firebase user), and exposes a simple API for features (including timers).
  - Extend the **service worker** (`sw.js`) to receive push events and show OS-level notifications, and handle notification clicks (deep-link into `/app`).
  - Add **Cloud Functions** to store web push subscriptions in Firestore, send ad-hoc web push notifications to a user (building block for features), and provide the base for **scheduled timer alerts** (described in detail at the end).

---

## 2. Data Model (Firestore)

Store web push subscriptions as a **subcollection under each user**:

- **Collection:** `users/{userId}/web_push_subscriptions/{subscriptionId}`

Each document:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/....",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  },
  "userAgent": "Mozilla/5.0 (...)",
  "createdAt": "<Firestore Timestamp>",
  "lastUsedAt": "<Firestore Timestamp>",
  "isActive": true
}
```

- `subscriptionId` can be a hash or `encodeURIComponent(subscription.endpoint)` so it’s stable.
- Keep `isActive` to soft-deactivate subscriptions when the push service returns 410/404.

For **timer alerts**, use a simple collection to track pending timers:

- **Collection:** `workout_timers/{timerId}`

Document shape:

```json
{
  "userId": "<uid>",
  "type": "rest_timer",
  "metadata": {
    "workoutId": "...",
    "exerciseName": "Sentadillas",
    "durationMs": 60000
  },
  "endAt": "<Firestore Timestamp>",
  "createdAt": "<Firestore Timestamp>",
  "status": "pending"
}
```

`status`: `"pending"` | `"sent"` | `"cancelled"`.

---

## 3. Service Worker (`apps/pwa/public/sw.js`)

Extend the existing minimal `sw.js` to handle **push** and **notificationclick** events.

```js
// apps/pwa/public/sw.js

// Keep existing minimal behavior
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ─────────────────────────────────────────────────────────────
// Push handling: show OS-level notifications for incoming pushes
// ─────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'Notificación', body: event.data.text() };
  }

  const {
    title = 'Wake',
    body = '',
    icon = '/app/icon-192.png',
    badge = '/app/badge-72.png',
    data = {},
    tag,
    actions,
    renotify,
    requireInteraction
  } = payload;

  const options = {
    body,
    icon,
    badge,
    data,
    tag,
    renotify,
    actions,
    requireInteraction
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─────────────────────────────────────────────────────────────
// Notification click: focus or open the PWA on the target URL
// ─────────────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/app';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      for (const client of allClients) {
        const url = new URL(client.url);
        if (url.pathname.startsWith('/app')) {
          if (url.pathname === targetUrl) {
            await client.focus();
            return;
          }
          client.postMessage({
            type: 'WAKE_NAVIGATE',
            url: targetUrl
          });
          await client.focus();
          return;
        }
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});

self.addEventListener('message', (event) => {
  // Placeholder for future usage (e.g. timers UI sync)
});
```

---

## 4. Web Client NotificationService (`apps/pwa/src/services/notificationService.web.js`)

Create a **web-only** notification service that:

- Requests browser notification permission.
- Ensures the service worker is registered.
- Creates a push subscription via `PushManager`.
- Sends the subscription to a Cloud Function for storage.
- Exposes convenience methods.

```js
// apps/pwa/src/services/notificationService.web.js

import { auth } from '../config/firebase';
import logger from '../utils/logger';

const VAPID_PUBLIC_KEY = '<YOUR_VAPID_PUBLIC_KEY_BASE64URL>';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = globalThis.atob ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

class NotificationService {
  constructor() {
    this.initialized = false;
    this.currentUserId = null;
    this.currentSubscription = null;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      logger.debug('🔕 Notifications not supported in this environment');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      logger.debug('🔕 Notification permission not granted:', permission);
      return;
    }

    if (!('serviceWorker' in navigator)) {
      logger.debug('🔕 Service workers not supported');
      return;
    }

    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      } catch (err) {
        logger.error('❌ Error creating push subscription:', err);
        return;
      }
    }

    this.currentSubscription = subscription;
    this.initialized = true;

    const user = auth.currentUser;
    if (user?.uid) {
      await this.setUserId(user.uid);
    }
  }

  async setUserId(userId) {
    this.currentUserId = userId;

    if (!this.initialized || !this.currentSubscription) {
      logger.debug('🔔 setUserId called before initialize, initializing now...');
      await this.initialize();
      if (!this.currentSubscription) return;
    }

    try {
      const token = await auth.currentUser?.getIdToken?.();
      if (!token) {
        logger.warn('⚠️ No ID token available when registering push subscription');
        return;
      }

      await fetch('https://us-central1-wolf-20b8b.cloudfunctions.net/registerWebPushSubscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription: this.currentSubscription,
        }),
      });

      logger.debug('✅ Web push subscription registered for user', userId);
    } catch (err) {
      logger.error('❌ Error registering web push subscription:', err);
    }
  }

  async getStoredToken() {
    if (!this.currentSubscription) {
      return null;
    }
    return this.currentSubscription.endpoint;
  }

  async sendTestNotification() {
    try {
      const token = await auth.currentUser?.getIdToken?.();
      if (!token) return;

      await fetch('https://us-central1-wolf-20b8b.cloudfunctions.net/sendTestWebPush', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      logger.debug('📨 Test web push request sent');
    } catch (err) {
      logger.error('❌ Error sending test web push:', err);
    }
  }

  async scheduleRestTimerNotification({ endAtIso, metadata }) {
    try {
      const token = await auth.currentUser?.getIdToken?.();
      if (!token) return;

      await fetch('https://us-central1-wolf-20b8b.cloudfunctions.net/scheduleRestTimerNotification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          endAtIso,
          metadata,
        }),
      });

      logger.debug('⏰ Rest timer notification scheduled at', endAtIso);
    } catch (err) {
      logger.error('❌ Error scheduling rest timer notification:', err);
    }
  }
}

export default new NotificationService();
```

**Note:** Ensure the PWA resolves `notificationService` to `notificationService.web.js` on web (e.g. Metro/Expo resolver or a small `notificationService.js` that re-exports the web module when on web).

---

## 5. Hooking Up `notificationUtils.js` and Auth

You already have `notificationUtils.js` that imports `NotificationService`. Wire it into auth:

- In your **AuthContext** (or wherever you react to login/logout), call:

```js
import { useEffect } from 'react';
import { initializeNotifications, setNotificationUserId } from '../utils/notificationUtils';

// Inside your auth provider, when user is set:
useEffect(() => {
  if (user?.uid) {
    initializeNotifications();
    setNotificationUserId(user.uid);
  }
}, [user?.uid]);
```

This ensures on first login we ask permission, create subscription, and register it with the backend; on subsequent sessions we reuse the existing subscription.

---

## 6. Cloud Functions (TypeScript, `functions/src/index.ts`)

- Add **`web-push`** as a dependency in `functions/package.json`.
- Configure **VAPID keys** via Firebase Secret Manager or environment (e.g. `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`).

### 6.1 Setup

```ts
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import webpush from 'web-push';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const VAPID_PUBLIC_KEY = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:soporte@wake.fit',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  functions.logger.warn('Web push VAPID keys not configured.');
}

async function getUserIdFromRequest(req: functions.https.Request): Promise<string> {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    throw new functions.https.HttpsError('unauthenticated', 'Missing Authorization header');
  }
  const decoded = await admin.auth().verifyIdToken(match[1]);
  return decoded.uid;
}

async function sendWebPushToSubscription(
  subscription: webpush.PushSubscription,
  payload: unknown
) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err: unknown) {
    const anyErr = err as { statusCode?: number };
    if (anyErr?.statusCode === 404 || anyErr?.statusCode === 410) {
      functions.logger.warn('Removing invalid subscription:', subscription.endpoint);
    } else {
      functions.logger.error('Error sending web push:', err);
    }
  }
}
```

### 6.2 `registerWebPushSubscription`

```ts
export const registerWebPushSubscription = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const uid = await getUserIdFromRequest(req);
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
      res.status(400).json({ error: 'Invalid subscription' });
      return;
    }

    const endpoint: string = subscription.endpoint;
    const subscriptionId = encodeURIComponent(endpoint);

    const docRef = db
      .collection('users')
      .doc(uid)
      .collection('web_push_subscriptions')
      .doc(subscriptionId);

    await docRef.set(
      {
        ...subscription,
        userId: uid,
        isActive: true,
        userAgent: req.headers['user-agent'] || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    res.status(200).json({ success: true });
  } catch (err) {
    functions.logger.error('Error registering web push subscription:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
```

### 6.3 `sendTestWebPush`

```ts
export const sendTestWebPush = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const uid = await getUserIdFromRequest(req);

    const subsSnap = await db
      .collection('users')
      .doc(uid)
      .collection('web_push_subscriptions')
      .where('isActive', '==', true)
      .get();

    if (subsSnap.empty) {
      res.status(200).json({ success: false, message: 'No active subscriptions' });
      return;
    }

    const payload = {
      title: 'Wake',
      body: 'Notificación de prueba ✔️',
      data: { url: '/app' },
    };

    const promises: Promise<void>[] = [];
    subsSnap.forEach((doc) => {
      const subData = doc.data() as webpush.PushSubscription;
      promises.push(sendWebPushToSubscription(subData, payload));
    });

    await Promise.all(promises);
    res.status(200).json({ success: true });
  } catch (err) {
    functions.logger.error('Error sending test web push:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
```

---

## 7. Timer Alerts System (Web Only)

### 7.1 Frontend: `endTime` + Scheduling a Backend Notification

When the user starts a rest timer (e.g. 60 seconds):

1. **Compute and store an `endTime`** on the client:
   - `const endTime = Date.now() + durationMs;`
   - Store in React state and optionally in `localStorage` / AsyncStorage.
2. **Display the countdown** in the modal from `endTime - Date.now()`.
3. **Call the backend** to schedule a web push at that time via `NotificationService.scheduleRestTimerNotification`.

Example (in your workout screen):

```js
import NotificationService from '../services/notificationService';

function startRestTimer(durationMs, metadata) {
  const endTime = Date.now() + durationMs;
  const endAtIso = new Date(endTime).toISOString();

  setRestTimerState({
    active: true,
    endTime,
    durationMs,
    metadata,
  });

  window.localStorage.setItem('wake_rest_timer', JSON.stringify({
    endTime,
    durationMs,
    metadata,
  }));

  NotificationService.scheduleRestTimerNotification({
    endAtIso,
    metadata,
  });
}
```

`metadata` example: `{ workoutId, exerciseName, durationMs }`.

### 7.2 Backend: `scheduleRestTimerNotification`

```ts
export const scheduleRestTimerNotification = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const uid = await getUserIdFromRequest(req);
    const { endAtIso, metadata } = req.body;

    if (!endAtIso) {
      res.status(400).json({ error: 'endAtIso is required' });
      return;
    }

    const endAt = new Date(endAtIso);
    if (Number.isNaN(endAt.getTime())) {
      res.status(400).json({ error: 'Invalid endAtIso' });
      return;
    }

    const docRef = db.collection('workout_timers').doc();
    await docRef.set({
      userId: uid,
      type: 'rest_timer',
      metadata: metadata || {},
      endAt: admin.firestore.Timestamp.fromDate(endAt),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
    });

    res.status(200).json({ success: true, timerId: docRef.id });
  } catch (err) {
    functions.logger.error('Error scheduling rest timer notification:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
```

### 7.3 Backend: `processRestTimerNotifications` (Scheduled Cron)

Pub/Sub scheduled function (e.g. every 1 minute) that:

- Queries `workout_timers` where `status === 'pending'` and `endAt <= now + 30s`.
- For each timer: load user’s web push subscriptions, send push, mark `status: 'sent'`.

```ts
export const processRestTimerNotifications = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const thirtySecondsFromNow = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 30_000
    );

    const timersSnap = await db
      .collection('workout_timers')
      .where('status', '==', 'pending')
      .where('endAt', '<=', thirtySecondsFromNow)
      .get();

    if (timersSnap.empty) {
      return null;
    }

    const batch = db.batch();
    const sendPromises: Promise<void>[] = [];

    timersSnap.forEach((doc) => {
      const timerId = doc.id;
      const data = doc.data() as {
        userId: string;
        metadata?: { workoutId?: string; exerciseName?: string; durationMs?: number };
      };

      const { userId, metadata = {} } = data;

      const payload = {
        title: 'Descanso terminado',
        body: metadata.exerciseName
          ? `Vuelve a ${metadata.exerciseName}`
          : 'Es hora de seguir entrenando 💪',
        data: {
          url: '/app',
          type: 'rest_timer',
          workoutId: metadata.workoutId || null,
          timerId,
        },
      };

      sendPromises.push(
        (async () => {
          const subsSnap = await db
            .collection('users')
            .doc(userId)
            .collection('web_push_subscriptions')
            .where('isActive', '==', true)
            .get();

          if (subsSnap.empty) return;

          const sendEach: Promise<void>[] = [];
          subsSnap.forEach((subDoc) => {
            const subData = subDoc.data() as webpush.PushSubscription;
            sendEach.push(sendWebPushToSubscription(subData, payload));
          });
          await Promise.all(sendEach);
        })()
      );

      batch.update(doc.ref, {
        status: 'sent',
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await Promise.all(sendPromises);
    await batch.commit();

    return null;
  });
```

### 7.4 Firestore Index

Add a composite index for the scheduled query:

- Collection: `workout_timers`
- Fields: `status` (Ascending), `endAt` (Ascending)

Create via Firebase Console or `firestore.indexes.json`.

### 7.5 User Experience Summary

- **In the workout screen:** User starts rest; sees live countdown in the modal; timer end time is persisted locally and sent to backend.
- **If user leaves the PWA:** The scheduled function runs every minute and, when the rest is due, sends a web push.
- **On the phone:** System notification: “Descanso terminado”, “Vuelve a Sentadillas”, etc. Tapping opens/focuses `/app`; the React app can read stored `endTime` and show “rest finished” state.

---

## 8. Summary

- **Core web notification system:** Service worker handles push + notificationclick; `NotificationService.web.js` manages permission + subscription + Cloud Function calls; Firestore stores `web_push_subscriptions` per user; Cloud Functions register subscriptions and send pushes.
- **Timer alerts:** Frontend uses `endTime`-based timer and calls `scheduleRestTimerNotification`; backend stores timers in `workout_timers` and a scheduled function sends web push near `endAt`; users get OS-level “rest finished” notifications even when the PWA is closed.

**Next steps:**

1. Generate VAPID keys (`npx web-push generate-vapid-keys`) and store them in Firebase Secret Manager.
2. Add `web-push` to `functions/package.json` and implement the functions in `functions/src/index.ts`.
3. Create `notificationService.web.js` and ensure the PWA resolves it on web.
4. Update `sw.js` with push and notificationclick handlers.
5. Wire `initializeNotifications` and `setNotificationUserId` in AuthContext.
6. Add the composite index for `workout_timers` and document the new functions in `CLAUDE.md`.
