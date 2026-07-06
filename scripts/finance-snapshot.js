/**
 * finance-snapshot.js — READ-ONLY complete-picture report for Wake payments/ops.
 *
 * Pulls the live financial + operational state from prod Firestore (and,
 * optionally, the Polar API) and prints one consolidated snapshot:
 *   1. Monthly-drop state per course (did the cron advance? next block queued?)
 *   2. Active subscribers per course (server access-gate mirror)
 *   3. Sales in a window (MP + Polar), gross/net, by provider & currency
 *   4. Pending / abandoned checkouts (never-paid preapprovals)
 *   5. Polar product inventory (flags orphans not referenced by any course)
 *
 * NEVER writes. Safe to run anytime.
 *
 * Usage:
 *   NODE_PATH=functions/node_modules GOOGLE_CLOUD_PROJECT=wolf-20b8b \
 *     node scripts/finance-snapshot.js [--days=7]
 *   # optional Polar product audit:
 *   POLAR_ACCESS_TOKEN=$(gcloud secrets versions access latest \
 *     --secret=POLAR_ACCESS_TOKEN --project=wolf-20b8b) node scripts/finance-snapshot.js
 *
 * Auth: Application Default Credentials (gcloud auth application-default login).
 */
const https = require("https");
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "wolf-20b8b" });
const db = admin.firestore();

// Server access-gate mirror — keep in sync with functions workout.ts
const ACCESS_EXPIRY_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const PAID_SUB_STATUS = new Set(["active", "authorized", "approved"]);

const daysArg = Number((process.argv.find((a) => a.startsWith("--days=")) || "").split("=")[1]);
const WINDOW_DAYS = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : 7;

function toMs(raw) {
  if (typeof raw === "string") { const ms = Date.parse(raw); return Number.isFinite(ms) ? ms : null; }
  if (raw && typeof raw.toMillis === "function") return raw.toMillis();
  if (raw && typeof raw._seconds === "number") return raw._seconds * 1000;
  return null;
}
const iso = (r) => { const ms = toMs(r); return ms ? new Date(ms).toISOString().slice(0, 16) + "Z" : "—"; };

function courseAccessIsActive(entry) {
  if (!entry) return false;
  const ms = toMs(entry.expires_at);
  if (ms === null) return false;
  if (ms + ACCESS_EXPIRY_GRACE_MS < Date.now()) return false;
  return entry.status === "active" || entry.is_trial === true;
}

function polarGet(path) {
  const tok = process.env.POLAR_ACCESS_TOKEN;
  return new Promise((resolve) => {
    https.request({ hostname: "api.polar.sh", path, method: "GET",
      headers: { Authorization: "Bearer " + tok, Accept: "application/json" } },
    (r) => { let d = ""; r.on("data", (c) => d += c); r.on("end", () => resolve(JSON.parse(d || "{}"))); })
      .on("error", () => resolve(null)).end();
  });
}

(async () => {
  const now = Date.now();
  const since = now - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  console.log(`\n=== WAKE FINANCE SNAPSHOT — ${new Date(now).toISOString()} (window: ${WINDOW_DAYS}d) ===`);

  // Course catalog: name + canonical Polar product ids.
  const courseSnap = await db.collection("courses").get();
  const courses = {};
  const canonicalPolarIds = new Set();
  courseSnap.forEach((d) => {
    const c = d.data();
    const p = c.polar || {};
    courses[d.id] = { name: c.title || d.id, polar: p, status: c.status };
    if (p.subscription_product_id) canonicalPolarIds.add(p.subscription_product_id);
    if (p.onetime_product_id) canonicalPolarIds.add(p.onetime_product_id);
  });

  // 1. Monthly-drop state
  console.log("\n1) MONTHLY-DROP STATE");
  const stateSnap = await db.collection("program_state").get();
  if (stateSnap.empty) console.log("   (no program_state docs)");
  stateSnap.forEach((d) => {
    const s = d.data();
    const label = (courses[d.id] && courses[d.id].name) || d.id;
    console.log(`   ${label}: block ${s.current_block_index} ("${s.current_block_id}") since ${iso(s.current_block_started_at)} | next queued: ${s.next_block_index ?? "NONE"}`);
  });

  // Scan every subscription once (low volume).
  const subs = [];
  (await db.collectionGroup("subscriptions").get()).forEach((d) => subs.push(d.data()));

  // 2. Active subscribers per course (access-gate mirror)
  console.log("\n2) ACTIVE SUBSCRIBERS (pass the access gate)");
  const byCourseUids = {};
  subs.forEach((s) => { if (!s.course_id) return; (byCourseUids[s.course_id] ||= new Set()).add(s.user_id); });
  for (const [cid, uids] of Object.entries(byCourseUids)) {
    let active = 0;
    for (const uid of uids) {
      const u = (await db.collection("users").doc(uid).get()).data() || {};
      if (courseAccessIsActive((u.courses || {})[cid])) active++;
    }
    console.log(`   ${(courses[cid] && courses[cid].name) || cid}: ${active} activos / ${uids.size} uids con sub`);
  }

  // 3. New sales in window + 4. abandoned checkouts.
  // Filter by created_at ONLY: the daily reconcileSubscriptions cron touches
  // updated_at on old subs, so an updated_at filter overcounts (re-reconciled
  // old sales look "new"). created_at = when the subscription was actually sold.
  const paid = subs.filter((s) => PAID_SUB_STATUS.has(s.status) && toMs(s.created_at) >= since);
  const pending = subs.filter((s) => s.status === "pending" && toMs(s.created_at) >= since);
  console.log(`\n3) NEW PAID SUBSCRIPTIONS (last ${WINDOW_DAYS}d): ${paid.length}`);
  const totals = {};
  paid.forEach((s) => {
    const cur = s.currency_id || "COP";
    totals[cur] = (totals[cur] || 0) + (Number(s.transaction_amount) || 0);
    console.log(`   ${iso(s.created_at)} ${(courses[s.course_id] && courses[s.course_id].name) || s.course_id} ${s.transaction_amount} ${cur} via ${s.provider || "mp"} [${s.status}]`);
  });
  console.log(`   GROSS by currency: ${JSON.stringify(totals)}`);
  console.log(`\n4) ABANDONED CHECKOUTS (pending, never paid, last ${WINDOW_DAYS}d): ${pending.length}`);
  pending.forEach((s) => console.log(`   ${iso(s.created_at)} ${s.payer_email || "?"} ${s.transaction_amount} ${s.currency_id} via ${s.provider || "mp"}`));

  // 5. Polar product inventory (optional; needs POLAR_ACCESS_TOKEN)
  console.log("\n5) POLAR PRODUCT INVENTORY");
  if (!process.env.POLAR_ACCESS_TOKEN) {
    console.log("   (skipped — set POLAR_ACCESS_TOKEN to audit for orphan products)");
  } else {
    const j = await polarGet("/v1/products/?limit=100");
    (j && j.items || []).forEach((p) => {
      const canonical = canonicalPolarIds.has(p.id);
      const price = (p.prices || []).map((x) => x.amount_type === "fixed" ? `$${(x.price_amount / 100).toFixed(2)}` : x.amount_type).join(",");
      const flag = p.is_archived ? "[archived]" : canonical ? "[canonical]" : "[ORPHAN — not referenced by any course]";
      console.log(`   ${flag} ${p.name} ${price} (${p.id.slice(0, 8)})`);
    });
  }
  console.log("\n=== end snapshot (read-only) ===\n");
  process.exit(0);
})().catch((e) => { console.error("snapshot error:", e); process.exit(1); });
