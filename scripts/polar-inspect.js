#!/usr/bin/env node
/**
 * Read-only Polar prod inspector. Never prints the token.
 *   POLAR_ACCESS_TOKEN=... POLAR_SERVER=production node scripts/polar-inspect.js <what>
 * where <what> = webhooks | sub <subscriptionId>
 */
'use strict';

const TOKEN = process.env.POLAR_ACCESS_TOKEN;
if (!TOKEN) { console.error('POLAR_ACCESS_TOKEN required'); process.exit(1); }
const BASE = process.env.POLAR_SERVER === 'sandbox' ? 'https://sandbox-api.polar.sh' : 'https://api.polar.sh';

async function api(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function main() {
  const what = process.argv[2];
  if (what === 'webhooks') {
    const r = await api('/v1/webhooks/endpoints?limit=50');
    if (r.status !== 200) { console.log('status', r.status, JSON.stringify(r.json).slice(0, 400)); return; }
    for (const ep of r.json.items || []) {
      console.log('---');
      console.log('id:', ep.id);
      console.log('url:', ep.url);
      console.log('events:', JSON.stringify(ep.events));
    }
    return;
  }
  if (what === 'sub') {
    const id = process.argv[3];
    const r = await api(`/v1/subscriptions/${id}`);
    if (r.status !== 200) { console.log('status', r.status, JSON.stringify(r.json).slice(0, 400)); return; }
    const s = r.json;
    console.log('id:', s.id);
    console.log('status:', s.status);
    console.log('cancelAtPeriodEnd:', s.cancelAtPeriodEnd);
    console.log('amount:', s.amount, s.currency);
    console.log('currentPeriodEnd:', s.currentPeriodEnd);
    console.log('customerId:', s.customerId);
    console.log('productId:', s.productId);
    console.log('metadata:', JSON.stringify(s.metadata));
    return;
  }
  console.error('usage: webhooks | sub <id>');
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
