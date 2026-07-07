#!/usr/bin/env node
/**
 * email-bejarano-reprice.js — short note to each affected Bejarano subscriber:
 * we lowered the price, moved you to it, and refunded the difference. Sends via
 * Resend (same sender as the purchase emails: Wake <hola@wakelab.co>).
 *
 * DEFAULTS TO DRY-RUN (prints the emails). Flags:
 *   --send                 actually send
 *   --only=<email>         restrict to one recipient
 *   --to-override=<email>  send every email to this address instead (preview)
 *
 * Usage (from repo root):
 *   RESEND_API_KEY="$(gcloud secrets versions access latest \
 *     --secret=RESEND_API_KEY --project=wolf-20b8b)" \
 *   NODE_PATH=functions/node_modules \
 *     node scripts/email-bejarano-reprice.js --manifest=/path/manifest.json \
 *       --to-override=emilioloboguerrero@gmail.com --send   # preview to yourself
 */
'use strict';

const fs = require('fs');
const { Resend } = require('resend');

const SEND = process.argv.includes('--send');
const arg = (n) => { const p = process.argv.find((a) => a.startsWith(`--${n}=`)); return p ? p.split('=').slice(1).join('=') : null; };
const MANIFEST = arg('manifest');
const ONLY = arg('only');
const TO_OVERRIDE = arg('to-override');

const FROM = 'Felipe Bejarano <hola@wakelab.co>';
const SUPPORT = 'soporte@wakelab.co';
const APP_URL = 'https://wakelab.co/app';

if (!MANIFEST) { console.error('ERROR: --manifest=<path> required'); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

function money(amount, currency) {
  if (currency === 'USD') return `$${amount} USD`;
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
}

function buildEmail(row) {
  const isUsd = row.currency === 'USD';
  const oldPrice = money(isUsd ? 25 : 79000, row.currency);
  const newPrice = money(isUsd ? manifest.new_usd : manifest.new_cop, row.currency);
  // Polar refund is the $19 subtotal difference (script overrides the tax-inclusive manifest value).
  const refund = money(isUsd ? 19 : row.refund_amount, row.currency);
  const medio = isUsd ? 'tu tarjeta' : 'tu medio de pago';
  const subject = `Bajamos ${row.course_title} a ${newPrice} y te devolvimos la diferencia`;
  const intro =
    `Tenemos una gran noticia: bajamos el precio de ${row.course_title} de ${oldPrice} a ${newPrice} al mes.`;
  const transparency =
    `Tú ya te habías suscrito al precio anterior, así que hicimos dos cosas por ti, sin que tuvieras que pedir nada:`;
  const bullets = [
    `Te dejamos en <strong style="color:#fff;">${newPrice} al mes</strong> para todos tus próximos cobros.`,
    `Te devolvimos <strong style="color:#fff;">${refund}</strong> — la diferencia exacta de lo que ya pagaste. El reembolso llega a ${medio} en los próximos días.`,
  ];
  const closing = `Gracias por entrar desde el principio. Nos vemos en el entrenamiento.`;
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1a1a;color:#fff;padding:24px;margin:0;">
  <div style="max-width:480px;margin:0 auto;">
    <div style="font-size:13px;letter-spacing:1px;color:rgba(255,255,255,0.5);text-transform:uppercase;margin-bottom:32px;">Wake</div>
    <h1 style="font-size:25px;font-weight:600;margin:0 0 16px;letter-spacing:-0.3px;">Bajamos el precio, y te devolvimos plata</h1>
    <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,0.85);margin:0 0 20px;">${intro}</p>
    <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,0.8);margin:0 0 12px;">${transparency}</p>
    <ul style="font-size:15px;line-height:1.55;color:rgba(255,255,255,0.8);margin:0 0 24px;padding-left:20px;">
      <li style="margin-bottom:10px;">${bullets[0]}</li>
      <li>${bullets[1]}</li>
    </ul>
    <a href="${APP_URL}" style="display:inline-block;background:#fff;color:#1a1a1a;padding:14px 28px;border-radius:12px;font-weight:600;font-size:15px;text-decoration:none;">Abrir Wake</a>
    <p style="font-size:15px;line-height:1.55;color:rgba(255,255,255,0.8);margin:28px 0 0;">${closing}</p>
    <p style="font-size:14px;color:rgba(255,255,255,0.8);margin:20px 0 0;">Felipe Bejarano</p>
    <p style="font-size:12px;color:rgba(255,255,255,0.35);margin:24px 0 0;line-height:1.5;">
      ¿Alguna duda? Escríbenos a <a href="mailto:${SUPPORT}" style="color:rgba(255,255,255,0.6);">${SUPPORT}</a>.
    </p>
  </div>
</body></html>`;
  return { subject, html };
}

async function main() {
  console.log(`\n=== BEJARANO REPRICE EMAIL — ${SEND ? 'SEND' : 'DRY-RUN'} ===`);
  if (TO_OVERRIDE) console.log(`to-override: every email -> ${TO_OVERRIDE}`);
  console.log('');

  const apiKey = process.env.RESEND_API_KEY;
  const resend = SEND ? new Resend(apiKey) : null;
  if (SEND && !apiKey) { console.error('ERROR: RESEND_API_KEY required for --send'); process.exit(1); }

  let sent = 0;
  for (const row of manifest.subscribers) {
    if (ONLY && row.email !== ONLY) continue;
    if (!row.email) { console.log(`  SKIP ${row.uid} — no email`); continue; }
    const to = TO_OVERRIDE || row.email;
    const { subject, html } = buildEmail(row);
    console.log(`  ${SEND ? 'SEND' : 'WOULD SEND'} -> ${to}  |  ${subject}  (${row.course_title}/${row.provider})`);
    if (!SEND) continue;
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) console.error(`    Resend error: ${JSON.stringify(error)}`);
    else { sent++; console.log('    sent'); }
  }
  console.log(`\n${SEND ? `Sent ${sent}` : 'DRY-RUN — nothing sent'}.\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('email error:', e); process.exit(1); });
