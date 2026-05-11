import {Router} from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {Resend} from "resend";
import {validateBody} from "../middleware/validate.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {WakeApiServerError} from "../errors.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /auth/request-magic-link — passwordless sign-in via email.
//
// Generates a Firebase Auth email-link, sends via Resend. The link signs the
// user in (creating the auth user if none exists for this email) and redirects
// to /app/library. Always returns success to prevent email enumeration.
router.post("/auth/request-magic-link", async (req, res) => {
  const {email} = validateBody<{ email: string }>(
    {email: "string"},
    req.body
  );

  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Email inválido", "email");
  }

  // Per-email rate limit — 5 requests / minute. Cheap defense against abuse;
  // the harder cap is Resend's daily budget reservation.
  await checkRateLimit(`magic-link:${trimmed}`, 5, "rate_limit_first_party");

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new WakeApiServerError("SERVICE_UNAVAILABLE", 503, "Email service not configured");
  }

  // Make sure a Firebase Auth user exists for this email. generateSignInWithEmailLink
  // doesn't auto-create — signInWithEmailLink does that on the client when the
  // user actually clicks the link. We pre-create here so subsequent reads of
  // user.courses[…] from webhook flow can attach to the same uid.
  try {
    await admin.auth().getUserByEmail(trimmed);
  } catch (err) {
    const code = (err as {code?: string})?.code;
    if (code === "auth/user-not-found") {
      try {
        await admin.auth().createUser({email: trimmed, emailVerified: false});
      } catch (createErr) {
        functions.logger.warn("createUser failed during magic-link request", {
          email: trimmed.replace(/(.{2}).+(@.+)/, "$1***$2"),
          error: (createErr as Error).message,
        });
        // Silent fail — return success to prevent enumeration. The link
        // generation below will fail too and we just won't send an email.
      }
    }
  }

  let link: string;
  try {
    link = await admin.auth().generateSignInWithEmailLink(trimmed, {
      url: "https://wakelab.co/app/library",
    });
  } catch (err) {
    functions.logger.error("generateSignInWithEmailLink failed", err);
    // Always return success to prevent enumeration.
    res.json({data: {success: true}});
    return;
  }

  // Send via Resend. Fire-and-forget — if email fails the user can re-request.
  try {
    const resend = new Resend(apiKey);
    const {error: resendError} = await resend.emails.send({
      from: "Wake <hola@wakelab.co>",
      to: trimmed,
      subject: "Tu acceso a Wake",
      html: buildMagicLinkHtml(link),
    });
    if (resendError) {
      functions.logger.error("magic link Resend error", {error: resendError});
    }
  } catch (err) {
    functions.logger.error("magic link Resend exception", err);
  }

  res.json({data: {success: true}});
});

function buildMagicLinkHtml(link: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Tu acceso a Wake</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a1a; color: #fff; padding: 24px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto;">
    <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 16px;">Tu acceso a Wake</h1>
    <p style="font-size: 15px; line-height: 1.5; color: rgba(255,255,255,0.85); margin: 0 0 24px;">
      Hacé click en el botón para entrar a tu cuenta. El enlace funciona en cualquier dispositivo.
    </p>
    <a href="${link}" style="display: inline-block; background: #fff; color: #1a1a1a; padding: 14px 24px; border-radius: 12px; font-weight: 600; font-size: 15px; text-decoration: none;">Abrir Wake</a>
    <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 28px 0 0; line-height: 1.5;">
      Si no pediste este enlace, ignorá este correo. Si el botón no funciona, copiá y pegá esta dirección:<br>
      <span style="word-break: break-all; color: rgba(255,255,255,0.7);">${link}</span>
    </p>
    <p style="font-size: 12px; color: rgba(255,255,255,0.4); margin: 32px 0 0;">
      Si perdés este enlace, podés pedir uno nuevo en
      <a href="https://wakelab.co/acceso" style="color: rgba(255,255,255,0.6);">wakelab.co/acceso</a>.
    </p>
  </div>
</body>
</html>`;
}

export default router;
