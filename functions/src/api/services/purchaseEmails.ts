// Wake-branded purchase emails sent from webhook handlers.
// All templates Spanish, dark-theme, single CTA. Idempotency is enforced by
// the caller — these are pure send functions that don't dedupe.

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {Resend} from "resend";

const APP_BASE = "https://wakelab.co/app";
const SUPPORT_EMAIL = "soporte@wakelab.co";
// WhatsApp is the fastest support channel. Kept in sync with the landing
// app's single source of truth (apps/landing/src/config/support.js, +57 317
// 8751956). Functions can't import from the app, so the number lives here too.
const SUPPORT_WHATSAPP_URL =
  "https://wa.me/573178751956?text=" + encodeURIComponent("Hola, necesito ayuda con Wake.");
const FROM = "Wake <hola@wakelab.co>";
// wakelab.co has no MX record (it can't receive mail), so replies to FROM would
// bounce. Route replies to a monitored inbox until inbound forwarding
// (hola@/soporte@ -> this inbox) is set up at the DNS host.
const REPLY_TO = "emilioloboguerrero@gmail.com";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail({to, subject, html}: SendArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    functions.logger.warn("RESEND_API_KEY missing; purchase email skipped", {to: redact(to), subject});
    return false;
  }
  try {
    const resend = new Resend(apiKey);
    const {error} = await resend.emails.send({from: FROM, replyTo: REPLY_TO, to, subject, html});
    if (error) {
      functions.logger.error("purchase email Resend error", {error, to: redact(to), subject});
      return false;
    }
    return true;
  } catch (err) {
    functions.logger.error("purchase email exception", err);
    return false;
  }
}

function redact(email: string): string {
  // Mask the local-part for any address shape — including short locals
  // (a@b.c) that the prior regex skipped, leaking full emails to logs.
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}

// Defense against CRLF header injection via creator-authored titles. Resend
// likely sanitizes its own headers, but program titles flow into the email
// subject and we shouldn't trust the upstream to drop control characters.
function sanitizeSubject(value: string): string {
  // Drop CR/LF and other low-ASCII control characters; collapse whitespace
  // runs. Keep printable characters (space, dash, accents) so we never
  // mangle legitimate program titles like "Pierna - Empuje".
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]/g, "").replace(/\s+/g, " ").trim();
}

// Bake a Firebase email-link into the CTA so the buyer is auto-signed-in on
// click AND deep-linked to `nextPath`. Without this the bare deep-link drops
// users on a screen that demands a login they don't have a session for —
// which is exactly the bug that motivated this helper. Falls back to the
// bare deep-link when link generation fails (e.g. user not yet provisioned
// in Firebase Auth), so the email still goes out.
//
// Pre-creates the Auth user when missing — generateSignInWithEmailLink
// requires an existing identity. Without the pre-create, dashboard-only or
// API-only users (whose Firestore doc exists but whose Auth entry doesn't)
// silently fall back to the bare URL, which then dumps them at the install
// screen. Embeds &email= in the continueUrl so the receiving page can
// pre-fill the form on a fresh device, avoiding the wrong-email-burns-the-
// link trap.
export async function buildSignInUrl(to: string, nextPath: string): Promise<string> {
  const safeNext = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  const normalizedEmail = to.trim().toLowerCase();
  // ?next= deep-link target + &email= so EmailLinkSignInScreen knows the
  // email without consulting localStorage (which is per-browser-context and
  // empty when the user clicks the link in their email-client's browser).
  const continueUrl =
    `${getAppBaseUrl()}/email-link?next=${encodeURIComponent(safeNext)}` +
    `&email=${encodeURIComponent(normalizedEmail)}`;

  // Ensure the Auth user exists. Skip the lookup cost when generation fails
  // for a reason unrelated to user existence (caught below).
  try {
    await admin.auth().getUserByEmail(normalizedEmail);
  } catch (err) {
    const code = (err as {code?: string})?.code;
    if (code === "auth/user-not-found") {
      try {
        await admin.auth().createUser({email: normalizedEmail, emailVerified: false});
      } catch (createErr) {
        functions.logger.warn("buildSignInUrl pre-create failed", {
          to: redact(normalizedEmail), error: String(createErr),
        });
      }
    }
  }

  try {
    return await admin.auth().generateSignInWithEmailLink(normalizedEmail, {
      url: continueUrl,
      handleCodeInApp: true,
    });
  } catch (err) {
    functions.logger.warn("buildSignInUrl fallback to bare deep-link", {
      to: redact(normalizedEmail), nextPath, error: String(err),
    });
    return `${getAppBaseUrl()}${safeNext}`;
  }
}

// Resolve the app's base URL per environment. Staging buyers' magic-links
// must point at staging's Auth project (different oobCode signer); a
// hardcoded prod URL silently invalidates every staging link. Pattern
// mirrors resolveWebhookUrl in payments.ts.
function getAppBaseUrl(): string {
  const project = process.env.GCLOUD_PROJECT;
  if (project === "wake-staging") return "https://wake-staging.web.app/app";
  return APP_BASE;
}

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric", month: "long", year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// Reusable "how to get in" block appended to every access-granting email.
// The #1 support problem is buyers not knowing that Wake content lives inside
// the installed PWA and that they must sign in with the SAME email they paid
// with. Spell both out, right above the sign-in CTA, on every purchase email.
// `email` is the buyer's address so we can name the exact inbox they must use.
function accessInstructionsBlock(email: string): string {
  const safeEmail = escapeHtml(email);
  return `
    <div style="border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:16px 18px;margin:0 0 24px;">
      <p style="font-size:13px;letter-spacing:0.5px;color:rgba(255,255,255,0.5);text-transform:uppercase;margin:0 0 12px;">Cómo entrar a tu programa</p>
      <p style="font-size:14px;line-height:1.55;color:rgba(255,255,255,0.8);margin:0 0 10px;">
        <strong style="color:#fff;">1.</strong> Instala la app de Wake en tu teléfono.
        En <strong>iPhone</strong>: abre <a href="${APP_BASE}" style="color:rgba(255,255,255,0.85);">wakelab.co/app</a> en Safari, toca <strong>Compartir</strong> y luego <strong>«Añadir a inicio»</strong>.
        En <strong>Android</strong>: ábrela en Chrome y toca <strong>«Instalar app»</strong>.
      </p>
      <p style="font-size:14px;line-height:1.55;color:rgba(255,255,255,0.8);margin:0;">
        <strong style="color:#fff;">2.</strong> Abre Wake e <strong>inicia sesión con el mismo correo con el que pagaste</strong>: <strong style="color:#fff;">${safeEmail}</strong>.
        Todo tu contenido se ve desde la app.
      </p>
    </div>`;
}

// Minimal HTML-escape for values interpolated into email markup (buyer email).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapTemplate(args: {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  secondaryLinks?: {label: string; url: string}[];
  footer?: string;
}): string {
  // Secondary links (manage subscription, WhatsApp support, ...) render as a
  // row of text links under the primary button so every buyer always has the
  // three doors — open Wake, manage subscription, get help — in one place.
  const secondary = (args.secondaryLinks || []).length ?
    `<p style="font-size:14px;line-height:1.8;color:rgba(255,255,255,0.7);margin:20px 0 0;">${
      (args.secondaryLinks || [])
        .map((l) => `<a href="${l.url}" style="color:#fff;font-weight:600;text-decoration:none;">${l.label}</a>`)
        .join("&nbsp;&nbsp;·&nbsp;&nbsp;")
    }</p>` :
    "";
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>${args.heading}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1a1a;color:#fff;padding:24px;margin:0;">
  <div style="max-width:480px;margin:0 auto;">
    <div style="font-size:13px;letter-spacing:1px;color:rgba(255,255,255,0.5);text-transform:uppercase;margin-bottom:32px;">Wake</div>
    <h1 style="font-size:24px;font-weight:600;margin:0 0 16px;letter-spacing:-0.3px;">${args.heading}</h1>
    <div style="font-size:15px;line-height:1.55;color:rgba(255,255,255,0.8);margin:0 0 28px;">${args.body}</div>
    <a href="${args.ctaUrl}" style="display:inline-block;background:#fff;color:#1a1a1a;padding:14px 28px;border-radius:12px;font-weight:600;font-size:15px;text-decoration:none;">${args.ctaLabel}</a>
    ${secondary}
    ${args.footer ? `<p style="font-size:12px;color:rgba(255,255,255,0.45);margin:32px 0 0;line-height:1.5;">${args.footer}</p>` : ""}
    <p style="font-size:12px;color:rgba(255,255,255,0.35);margin:32px 0 0;line-height:1.5;">
      Este enlace te firma automáticamente en tu cuenta. Es de un solo uso —
      si lo perdés, pedí uno nuevo en <a href="https://wakelab.co/acceso" style="color:rgba(255,255,255,0.6);">wakelab.co/acceso</a>.
      ¿Necesitás ayuda? Escribinos a <a href="mailto:${SUPPORT_EMAIL}" style="color:rgba(255,255,255,0.6);">${SUPPORT_EMAIL}</a>.
    </p>
  </div>
</body></html>`;
}

// The secondary doors every post-purchase email carries alongside the primary
// "Abrir Wake" CTA: manage the subscription (magic link) and reach support
// (WhatsApp). One tap each, from any device.
async function manageAndSupportLinks(
  to: string,
  courseId: string,
): Promise<{label: string; url: string}[]> {
  const manageUrl = await buildSignInUrl(to, `/library/manage/${courseId}`);
  return [
    {label: "Gestionar mi suscripción", url: manageUrl},
    {label: "Ayuda por WhatsApp", url: SUPPORT_WHATSAPP_URL},
  ];
}

// ─── Templates ────────────────────────────────────────────────────────────

export async function sendTrialActivatedEmail(args: {
  to: string;
  programTitle: string;
  courseId: string;
  trialDays: number;
  trialEndDate: string; // ISO
  transactionAmount: number;
  currencyId: string;
}): Promise<boolean> {
  const cta = await buildSignInUrl(args.to, `/course/${args.courseId}`);
  const body = `
    <p style="margin:0 0 12px;">Empezó tu prueba gratuita de <strong>${args.programTitle}</strong>.</p>
    <p style="margin:0 0 12px;">Tenés acceso completo hasta el <strong>${formatDate(args.trialEndDate)}</strong>.
    Después se cobrarán <strong>${formatCOP(args.transactionAmount)} ${args.currencyId}/mes</strong> a tu tarjeta — podés cancelar antes desde la app sin costo.</p>
    ${accessInstructionsBlock(args.to)}
  `;
  return sendEmail({
    to: args.to,
    subject: sanitizeSubject("Empezó tu prueba gratuita en Wake"),
    html: wrapTemplate({
      heading: "Tu prueba empezó", body, ctaLabel: "Abrir Wake", ctaUrl: cta,
      secondaryLinks: await manageAndSupportLinks(args.to, args.courseId),
    }),
  });
}

export async function sendSubscriptionStartedEmail(args: {
  to: string;
  programTitle: string;
  courseId: string;
  nextBillingDate: string; // ISO
  transactionAmount: number;
  currencyId: string;
}): Promise<boolean> {
  const cta = await buildSignInUrl(args.to, `/course/${args.courseId}`);
  const body = `
    <p style="margin:0 0 12px;">Tu suscripción a <strong>${args.programTitle}</strong> está activa.</p>
    <p style="margin:0 0 12px;">El próximo cobro será el <strong>${formatDate(args.nextBillingDate)}</strong> por <strong>${formatCOP(args.transactionAmount)} ${args.currencyId}</strong>.</p>
    ${accessInstructionsBlock(args.to)}
  `;
  return sendEmail({
    to: args.to,
    subject: sanitizeSubject(`Bienvenido a ${args.programTitle}`),
    html: wrapTemplate({
      heading: "Tu suscripción está activa", body, ctaLabel: "Abrir Wake", ctaUrl: cta,
      secondaryLinks: await manageAndSupportLinks(args.to, args.courseId),
    }),
  });
}

export async function sendChargeReceiptEmail(args: {
  to: string;
  programTitle: string;
  courseId: string;
  amount: number;
  currencyId: string;
  chargeDate: string; // ISO
  nextBillingDate?: string | null; // ISO
}): Promise<boolean> {
  const cta = await buildSignInUrl(args.to, `/library/manage/${args.courseId}`);
  const nextLine = args.nextBillingDate ?
    `<p style="margin:0 0 12px;">El próximo cobro será el <strong>${formatDate(args.nextBillingDate)}</strong>.</p>` :
    "";
  const body = `
    <p style="margin:0 0 12px;">Cobramos <strong>${formatCOP(args.amount)} ${args.currencyId}</strong> por tu suscripción a <strong>${args.programTitle}</strong> el ${formatDate(args.chargeDate)}.</p>
    ${nextLine}
    ${accessInstructionsBlock(args.to)}
  `;
  return sendEmail({
    to: args.to,
    subject: sanitizeSubject(`Recibo de pago — ${args.programTitle}`),
    html: wrapTemplate({
      heading: "Recibo de pago", body, ctaLabel: "Ver mi suscripción", ctaUrl: cta,
      secondaryLinks: [{label: "Ayuda por WhatsApp", url: SUPPORT_WHATSAPP_URL}],
    }),
  });
}

export async function sendCancellationEmail(args: {
  to: string;
  programTitle: string;
  courseId: string;
  accessUntil: string | null; // ISO, or null when access end isn't known
}): Promise<boolean> {
  const cta = await buildSignInUrl(args.to, `/library/manage/${args.courseId}`);
  // When accessUntil is unknown (cancel mid-trial before a charge), drop
  // the date line rather than lying about a deadline.
  const accessLine = args.accessUntil ?
    `<p style="margin:0 0 12px;">Vas a tener acceso al programa hasta el <strong>${formatDate(args.accessUntil)}</strong>.</p>` :
    "";
  const body = `
    <p style="margin:0 0 12px;">Cancelaste tu suscripción a <strong>${args.programTitle}</strong>. No habrá más cobros.</p>
    ${accessLine}
  `;
  return sendEmail({
    to: args.to,
    subject: sanitizeSubject(`Cancelaste ${args.programTitle}`),
    html: wrapTemplate({
      heading: "Suscripción cancelada", body, ctaLabel: "Ver mi suscripción", ctaUrl: cta,
      secondaryLinks: [{label: "Ayuda por WhatsApp", url: SUPPORT_WHATSAPP_URL}],
    }),
  });
}

// Outreach email for buyers who already paid but never entered the app. The
// CTA is a Firebase magic link (buildSignInUrl) so a single tap auto-signs
// them in and deep-links to their course — combined with the install +
// same-email instructions, this is the full "how do I actually get in" answer.
// Used by the notifyStrandedBuyers script, not by any webhook.
export async function sendAccessHowToEmail(args: {
  to: string;
  programTitle: string;
  courseId: string;
}): Promise<boolean> {
  const cta = await buildSignInUrl(args.to, `/course/${args.courseId}`);
  const title = escapeHtml(args.programTitle);
  const body = `
    <p style="margin:0 0 12px;">Ya tienes acceso a <strong>${title}</strong>, pero vimos que todavía no has entrado a la app — queremos ayudarte a empezar.</p>
    <p style="margin:0 0 12px;">Todo tu contenido vive dentro de la app de Wake. Sigue estos dos pasos y en un minuto estás adentro:</p>
    ${accessInstructionsBlock(args.to)}
    <p style="margin:0 0 12px;">El botón de abajo te lleva directo y te firma automáticamente en tu cuenta. Ábrelo desde tu teléfono.</p>
  `;
  return sendEmail({
    to: args.to,
    subject: sanitizeSubject(`Cómo entrar a ${args.programTitle} en Wake`),
    html: wrapTemplate({
      heading: "Así entras a tu programa", body, ctaLabel: "Abrir Wake", ctaUrl: cta,
      secondaryLinks: await manageAndSupportLinks(args.to, args.courseId),
    }),
  });
}

export async function sendOneTimePurchaseEmail(args: {
  to: string;
  programTitle: string;
  courseId: string;
  amount: number;
  currencyId: string;
  accessUntil: string; // ISO
}): Promise<boolean> {
  const cta = await buildSignInUrl(args.to, `/course/${args.courseId}`);
  const body = `
    <p style="margin:0 0 12px;">Tienes acceso a <strong>${args.programTitle}</strong>.</p>
    <p style="margin:0 0 12px;">Pagaste <strong>${formatCOP(args.amount)} ${args.currencyId}</strong>. Acceso válido hasta el <strong>${formatDate(args.accessUntil)}</strong>.</p>
    ${accessInstructionsBlock(args.to)}
  `;
  return sendEmail({
    to: args.to,
    subject: sanitizeSubject(`Tu acceso a ${args.programTitle}`),
    html: wrapTemplate({
      heading: "Tu programa está listo", body, ctaLabel: "Abrir mi programa", ctaUrl: cta,
      secondaryLinks: [{label: "Ayuda por WhatsApp", url: SUPPORT_WHATSAPP_URL}],
    }),
  });
}

// ─── Creator sale notification ──────────────────────────────────────────────
// Sent to the program's CREATOR (coach) whenever one of their programs sells or
// a subscription renews. Purely informational — no magic-link CTA (the coach
// already has a dashboard account), so it uses its own template rather than
// wrapTemplate. Fired from the same webhook sites as the buyer emails, so it
// inherits their processed_payments idempotency (no double-sends on retries).

const CREATOR_DASHBOARD_URL = "https://wakelab.co/creators";

type CreatorSaleType = "one_time" | "subscription" | "renewal";

const SALE_TYPE_LABEL: Record<CreatorSaleType, string> = {
  one_time: "Compra única",
  subscription: "Suscripción",
  renewal: "Renovación",
};

// COP has no minor units; USD (Polar) does. Format by the actual currency so a
// coach selling internationally sees "$6.00 USD", not "$6 COP".
function formatMoney(amount: number, currency: string): string {
  const cur = (currency || "COP").toUpperCase();
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency", currency: cur, minimumFractionDigits: cur === "COP" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${cur}`;
  }
}

function creatorInfoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:11px 0;font-size:13px;color:rgba(255,255,255,0.5);vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:11px 0;font-size:14px;color:#fff;text-align:right;vertical-align:top;">${value}</td>
    </tr>`;
}

export async function sendCreatorSaleNotification(args: {
  creatorId: string;
  buyerId?: string | null;
  programTitle: string;
  amount: number;
  currencyId: string;
  buyerEmail?: string | null;
  buyerName?: string | null;
  saleType: CreatorSaleType;
}): Promise<boolean> {
  // Don't ping a coach about their own test purchase.
  if (args.buyerId && args.buyerId === args.creatorId) return false;

  let creatorEmail: string | undefined;
  let creatorName = "";
  try {
    const snap = await admin.firestore().collection("users").doc(args.creatorId).get();
    const data = snap.data() ?? {};
    creatorEmail = typeof data.email === "string" ? data.email : undefined;
    creatorName =
      (typeof data.displayName === "string" && data.displayName) ||
      (typeof data.name === "string" && data.name) || "";
  } catch (err) {
    functions.logger.warn("creator sale notification: creator lookup failed", {
      creatorId: args.creatorId, error: String(err),
    });
    return false;
  }
  if (!creatorEmail) {
    functions.logger.warn("creator sale notification: creator has no email", {creatorId: args.creatorId});
    return false;
  }

  const title = escapeHtml(args.programTitle || "tu programa");
  const buyerShort = args.buyerName ?
    escapeHtml(args.buyerName) :
    escapeHtml(args.buyerEmail || "Un cliente");
  const buyerFull = args.buyerName && args.buyerEmail ?
    `${escapeHtml(args.buyerName)} · ${escapeHtml(args.buyerEmail)}` :
    escapeHtml(args.buyerName || args.buyerEmail || "—");

  const isRenewal = args.saleType === "renewal";
  const heading = isRenewal ? "Se renovó una suscripción" : "Nueva venta";
  const intro = isRenewal ?
    `Se renovó la suscripción de <strong>${buyerShort}</strong> a <strong>${title}</strong>.` :
    args.saleType === "subscription" ?
      `<strong>${buyerShort}</strong> se suscribió a <strong>${title}</strong>.` :
      `<strong>${buyerShort}</strong> compró <strong>${title}</strong>.`;

  const rows =
    creatorInfoRow("Programa", title) +
    creatorInfoRow("Monto", `<strong>${formatMoney(args.amount, args.currencyId)}</strong>`) +
    creatorInfoRow("Tipo", SALE_TYPE_LABEL[args.saleType]) +
    creatorInfoRow("Comprador", buyerFull) +
    creatorInfoRow("Fecha", formatDate(new Date().toISOString()));

  const greeting = creatorName ? `Hola ${escapeHtml(creatorName)}. ` : "";
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>${heading}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1a1a;color:#fff;padding:24px;margin:0;">
  <div style="max-width:480px;margin:0 auto;">
    <div style="font-size:13px;letter-spacing:1px;color:rgba(255,255,255,0.5);text-transform:uppercase;margin-bottom:32px;">Wake</div>
    <h1 style="font-size:24px;font-weight:600;margin:0 0 16px;letter-spacing:-0.3px;">${heading}</h1>
    <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,0.8);margin:0 0 24px;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.12);border-bottom:1px solid rgba(255,255,255,0.12);margin:0 0 28px;">
      ${rows}
    </table>
    <a href="${CREATOR_DASHBOARD_URL}" style="display:inline-block;background:#fff;color:#1a1a1a;padding:14px 28px;border-radius:12px;font-weight:600;font-size:15px;text-decoration:none;">Ver en tu panel</a>
    <p style="font-size:12px;color:rgba(255,255,255,0.35);margin:32px 0 0;line-height:1.5;">
      ${greeting}Recibís este correo porque sos el creador de este programa en Wake.
      ¿Necesitás ayuda? Escribinos a <a href="mailto:${SUPPORT_EMAIL}" style="color:rgba(255,255,255,0.6);">${SUPPORT_EMAIL}</a>.
    </p>
  </div>
</body></html>`;

  return sendEmail({
    to: creatorEmail,
    subject: sanitizeSubject(`${isRenewal ? "Renovación" : "Nueva venta"} — ${args.programTitle}`),
    html,
  });
}
