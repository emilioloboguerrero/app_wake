import { Router } from "express";
import * as webpush from "web-push";
import { defineSecret } from "firebase-functions/params";
import { db, FieldValue, Timestamp } from "../firestore.js";
import { validateAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { WakeApiServerError } from "../errors.js";

const router = Router();

const vapidPublicKey = defineSecret("VAPID_PUBLIC_KEY");
const vapidPrivateKey = defineSecret("VAPID_PRIVATE_KEY");

function getVapid() {
  const pub = vapidPublicKey.value().trim().replace(/=+$/, "");
  const priv = vapidPrivateKey.value().trim().replace(/=+$/, "");
  if (!pub || !priv) {
    throw new WakeApiServerError(
      "INTERNAL_ERROR",
      500,
      "VAPID keys no configuradas"
    );
  }
  return { publicKey: pub, privateKey: priv };
}

// POST /notifications/subscribe — store push subscription
router.post("/notifications/subscribe", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{
      endpoint: string;
      keys: Record<string, unknown>;
      userAgent?: string;
    }>(
      {
        endpoint: "string",
        keys: "object",
        userAgent: "optional_string",
      },
      req.body
    );

    const keys = body.keys;
    if (
      typeof keys.p256dh !== "string" || !keys.p256dh ||
      typeof keys.auth !== "string" || !keys.auth
    ) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR",
        400,
        "keys debe contener p256dh y auth",
        "keys"
      );
    }

    const subRef = db
      .collection("users")
      .doc(auth.userId)
      .collection("web_push_subscriptions")
      .doc();

    await subRef.set({
      endpoint: body.endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      userAgent: body.userAgent || null,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({ data: { id: subRef.id } });
  } catch (err) {
    next(err);
  }
});

// POST /notifications/test — send test push to all active subscriptions
router.post("/notifications/test", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const vapid = getVapid();

    webpush.setVapidDetails(
      "mailto:soporte@wakelab.co",
      vapid.publicKey,
      vapid.privateKey
    );

    const subsSnap = await db
      .collection("users")
      .doc(auth.userId)
      .collection("web_push_subscriptions")
      .where("isActive", "==", true)
      .get();

    if (subsSnap.empty) {
      throw new WakeApiServerError(
        "NOT_FOUND",
        404,
        "No hay suscripciones activas"
      );
    }

    const payload = JSON.stringify({
      title: "Wake — Notificación de prueba",
      body: "Las notificaciones push están funcionando correctamente.",
    });

    let sent = 0;
    const deactivateIds: string[] = [];

    await Promise.all(
      subsSnap.docs.map(async (doc) => {
        const sub = doc.data();
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            payload
          );
          sent++;
        } catch (err: unknown) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 410 || status === 404) {
            deactivateIds.push(doc.id);
          }
        }
      })
    );

    if (deactivateIds.length > 0) {
      const batch = db.batch();
      for (const id of deactivateIds) {
        batch.update(
          db
            .collection("users")
            .doc(auth.userId)
            .collection("web_push_subscriptions")
            .doc(id),
          { isActive: false }
        );
      }
      await batch.commit();
    }

    res.status(200).json({ data: { sent, deactivated: deactivateIds.length } });
  } catch (err) {
    next(err);
  }
});

// POST /notifications/schedule-timer — create a workout_timer doc
router.post("/notifications/schedule-timer", async (req, res, next) => {
  try {
    const auth = await validateAuth(req);
    const body = validateBody<{
      endAtIso: string;
      metadata?: Record<string, unknown>;
    }>(
      {
        endAtIso: "string",
        metadata: "optional_object",
      },
      req.body
    );

    const endAt = new Date(body.endAtIso);
    if (isNaN(endAt.getTime())) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR",
        400,
        "endAtIso debe ser una fecha ISO válida",
        "endAtIso"
      );
    }

    const timerRef = db.collection("workout_timers").doc();
    await timerRef.set({
      userId: auth.userId,
      type: "rest_timer",
      metadata: body.metadata || {},
      endAt: Timestamp.fromDate(endAt),
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({ data: { id: timerRef.id } });
  } catch (err) {
    next(err);
  }
});

export default router;
