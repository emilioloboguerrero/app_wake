// Wake-branded purchase emails sent from webhook handlers.
// All templates Spanish, dark-theme, single CTA. Idempotency is enforced by
// the caller — these are pure send functions that don't dedupe.

import * as functions from "firebase-functions";
import {Resend} from "resend";

const APP_BASE = "https://wakelab.co/app";
const SUPPORT_EMAIL = "soporte@wakelab.co";
const FROM = "Wake <hola@wakelab.co>";

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
    const {error} = await resend.emails.send({from: FROM, to, subject, html});
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
  return email.replace(/(.{2}).+(@.+)/, "$1***$2");
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

function wrapTemplate(args: {
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>${args.heading}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1a1a;color:#fff;padding:24px;margin:0;">
  <div style="max-width:480px;margin:0 auto;">
    <div style="font-size:13px;letter-spacing:1px;color:rgba(255,255,255,0.5);text-transform:uppercase;margin-bottom:32px;">Wake</div>
    <h1 style="font-size:24px;font-weight:600;margin:0 0 16px;letter-spacing:-0.3px;">${args.heading}</h1>
    <div style="font-size:15px;line-height:1.55;color:rgba(255,255,255,0.8);margin:0 0 28px;">${args.body}</div>
    <a href="${args.ctaUrl}" style="display:inline-block;background:#fff;color:#1a1a1a;padding:14px 28px;border-radius:12px;font-weight:600;font-size:15px;text-decoration:none;">${args.ctaLabel}</a>
    ${args.footer ? `<p style="font-size:12px;color:rgba(255,255,255,0.45);margin:32px 0 0;line-height:1.5;">${args.footer}</p>` : ""}
    <p style="font-size:12px;color:rgba(255,255,255,0.35);margin:32px 0 0;line-height:1.5;">
      ¿Necesitás ayuda? Escribinos a <a href="mailto:${SUPPORT_EMAIL}" style="color:rgba(255,255,255,0.6);">${SUPPORT_EMAIL}</a>.
      Si perdés el acceso, podés recuperarlo en <a href="https://wakelab.co/acceso" style="color:rgba(255,255,255,0.6);">wakelab.co/acceso</a>.
    </p>
  </div>
</body></html>`;
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
  const cta = `${APP_BASE}/library/manage/${args.courseId}`;
  const body = `
    <p style="margin:0 0 12px;">Empezó tu prueba gratuita de <strong>${args.programTitle}</strong>.</p>
    <p style="margin:0 0 12px;">Tenés acceso completo hasta el <strong>${formatDate(args.trialEndDate)}</strong>.
    Después se cobrarán <strong>${formatCOP(args.transactionAmount)} ${args.currencyId}/mes</strong> a tu tarjeta — podés cancelar antes desde la app sin costo.</p>
  `;
  return sendEmail({
    to: args.to,
    subject: "Empezó tu prueba gratuita en Wake",
    html: wrapTemplate({heading: "Tu prueba empezó", body, ctaLabel: "Abrir Wake", ctaUrl: cta}),
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
  const cta = `${APP_BASE}/library/manage/${args.courseId}`;
  const body = `
    <p style="margin:0 0 12px;">Tu suscripción a <strong>${args.programTitle}</strong> está activa.</p>
    <p style="margin:0 0 12px;">El próximo cobro será el <strong>${formatDate(args.nextBillingDate)}</strong> por <strong>${formatCOP(args.transactionAmount)} ${args.currencyId}</strong>.</p>
  `;
  return sendEmail({
    to: args.to,
    subject: `Bienvenido a ${args.programTitle}`,
    html: wrapTemplate({heading: "Tu suscripción está activa", body, ctaLabel: "Abrir Wake", ctaUrl: cta}),
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
  const cta = `${APP_BASE}/library/manage/${args.courseId}`;
  const nextLine = args.nextBillingDate ?
    `<p style="margin:0 0 12px;">El próximo cobro será el <strong>${formatDate(args.nextBillingDate)}</strong>.</p>` :
    "";
  const body = `
    <p style="margin:0 0 12px;">Cobramos <strong>${formatCOP(args.amount)} ${args.currencyId}</strong> por tu suscripción a <strong>${args.programTitle}</strong> el ${formatDate(args.chargeDate)}.</p>
    ${nextLine}
  `;
  return sendEmail({
    to: args.to,
    subject: `Recibo de pago — ${args.programTitle}`,
    html: wrapTemplate({heading: "Recibo de pago", body, ctaLabel: "Ver detalles", ctaUrl: cta}),
  });
}

export async function sendCancellationEmail(args: {
  to: string;
  programTitle: string;
  courseId: string;
  accessUntil: string; // ISO
}): Promise<boolean> {
  const cta = `${APP_BASE}/library/manage/${args.courseId}`;
  const body = `
    <p style="margin:0 0 12px;">Cancelaste tu suscripción a <strong>${args.programTitle}</strong>. No habrá más cobros.</p>
    <p style="margin:0 0 12px;">Vas a tener acceso al programa hasta el <strong>${formatDate(args.accessUntil)}</strong>.</p>
  `;
  return sendEmail({
    to: args.to,
    subject: `Cancelaste ${args.programTitle}`,
    html: wrapTemplate({heading: "Suscripción cancelada", body, ctaLabel: "Volver al programa", ctaUrl: cta}),
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
  const cta = `${APP_BASE}/library`;
  const body = `
    <p style="margin:0 0 12px;">Tienes acceso a <strong>${args.programTitle}</strong>.</p>
    <p style="margin:0 0 12px;">Pagaste <strong>${formatCOP(args.amount)} ${args.currencyId}</strong>. Acceso válido hasta el <strong>${formatDate(args.accessUntil)}</strong>.</p>
  `;
  return sendEmail({
    to: args.to,
    subject: `Tu acceso a ${args.programTitle}`,
    html: wrapTemplate({heading: "Tu programa está listo", body, ctaLabel: "Abrir Wake", ctaUrl: cta}),
  });
}
