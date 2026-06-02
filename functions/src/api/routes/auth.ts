import {Router} from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {Resend} from "resend";
import {validateBody} from "../middleware/validate.js";
import {checkRateLimit, checkIpRateLimit} from "../middleware/rateLimit.js";
import {WakeApiServerError} from "../errors.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same shape used by EmailLinkSignInScreen's getValidatedNext so server and
// client agree on what's safe to round-trip through the email-link URL.
// Path-only, same-origin: no scheme, no query string, no backslash tricks.
const SAFE_NEXT_RE = /^\/[A-Za-z0-9/_.-]{0,256}$/;

// Resolve the app's base URL for the email-link continueUrl per environment.
// Staging buyers' magic-links must point at staging (different Auth project /
// oobCode signer); a hardcoded prod URL silently invalidates every staging
// magic-link. Pattern mirrors resolveWebhookUrl in payments.ts.
function resolveAppLinkBase(): string {
  const project = process.env.GCLOUD_PROJECT;
  if (project === "wake-staging") return "https://wake-staging.web.app/app";
  return "https://wakelab.co/app";
}

// Allowlist the post-signin destination. Anything that doesn't pass the strict
// regex (or that smuggles a protocol-relative URL via "//evil") falls back to
// the library so a bad caller can't turn this endpoint into an open redirector.
function sanitizeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/library";
  if (raw.startsWith("//") || raw.includes("\\")) return "/library";
  return SAFE_NEXT_RE.test(raw) ? raw : "/library";
}

// POST /auth/request-magic-link — passwordless sign-in via email.
//
// Generates a Firebase Auth email-link, sends via Resend. The link signs the
// user in (creating the auth user if none exists for this email) and redirects
// to /app/library. Always returns success to prevent email enumeration.
router.post("/auth/request-magic-link", async (req, res) => {
  // IP rate limit comes BEFORE body parse so an attacker iterating emails
  // can't bypass it by varying the body. 20 req/min/IP is generous for
  // honest users (a person retrying through "Pedir otro" couldn't realistically
  // exceed it) but kneecaps a script trying to enumerate or spam-create
  // Firebase Auth users via this endpoint. Per-email cap below still applies.
  await checkIpRateLimit(req, 20);

  const {email, next: rawNext} = validateBody<{ email: string; next?: string }>(
    {email: "string", next: "optional_string"},
    req.body
  );

  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Email inválido", "email");
  }

  // Caller (UnauthAccessGate, /acceso form, future surfaces) can pass a
  // post-signin destination so the email-link round-trip lands the buyer
  // back on the screen they were trying to reach. sanitizeNext defends
  // against open-redirect via this endpoint.
  const next = sanitizeNext(rawNext);

  // Per-email rate limit — 5 requests / minute. Cheap defense against abuse;
  // the harder cap is Resend's daily budget reservation.
  await checkRateLimit(`magic-link:${trimmed}`, 5, "rate_limit_first_party");

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new WakeApiServerError("SERVICE_UNAVAILABLE", 503, "Email service not configured");
  }

  // Check whether the user exists in Firebase Auth — but DON'T pre-create.
  // signInWithEmailLink creates the user on consumption, and pre-creating
  // here pollutes Firebase Auth with throwaway records when the endpoint is
  // probed (the per-IP rate limit is generous enough to allow 20 per minute).
  // We DO need to know whether the user exists for two reasons:
  //   1. To embed &email= in the continueUrl so the destination page can
  //      pre-fill the form without consulting localStorage.
  //   2. To branch on generation errors: "user not found" is silent-success
  //      (enumeration safety); other errors are transient and should surface
  //      so the client retries deliberately instead of silently giving up.
  let userExists = true;
  try {
    await admin.auth().getUserByEmail(trimmed);
  } catch (err) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      userExists = false;
    }
  }

  // The destination page MUST call signInWithEmailLink to actually consume
  // the oobCode — Firebase's default action handler only covers password
  // reset / email verification, not passwordless sign-in. handleCodeInApp:
  // true tells Firebase to redirect straight to this URL with the oobCode
  // embedded; the PWA's /email-link screen finishes the sign-in. The
  // &email= param lets EmailLinkSignInScreen skip its "type your email"
  // prompt on a fresh device — without it, a buyer on a different browser
  // than the one they requested the link from gets stuck.
  const continueUrl =
    `${resolveAppLinkBase()}/email-link?next=${encodeURIComponent(next)}` +
    `&email=${encodeURIComponent(trimmed)}`;

  let link: string;
  try {
    link = await admin.auth().generateSignInWithEmailLink(trimmed, {
      url: continueUrl,
      handleCodeInApp: true,
    });
  } catch (err) {
    if (!userExists) {
      // Enumeration safety: lie about success for accounts that don't exist
      // so attackers can't probe membership through this endpoint.
      functions.logger.info("generateSignInWithEmailLink: unknown email (silent success)", {
        email: trimmed.replace(/(.{2}).+(@.+)/, "$1***$2"),
      });
      res.json({data: {success: true}});
      return;
    }
    // Known user + generation failure = transient backend / Identity
    // Toolkit blip. Surfacing 503 lets the client retry deliberately
    // instead of pretending we sent an email that never went out and
    // pushing the buyer into a rate-limit dead-end.
    functions.logger.error("generateSignInWithEmailLink failed for known user", err);
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503,
      "No pudimos enviar el enlace. Intentá de nuevo en un momento.",
    );
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
