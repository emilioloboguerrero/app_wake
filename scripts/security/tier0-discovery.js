#!/usr/bin/env node
/**
 * Tier 0 production discovery script.
 *
 * READ ONLY. Surveys production data shapes that the Tier 0 patches affect,
 * so we know what edge cases the patches must handle gracefully BEFORE
 * deploying to production.
 *
 * USAGE
 *   # Set GOOGLE_APPLICATION_CREDENTIALS to a service account with read
 *   # access to the production project (wolf-20b8b).
 *   node scripts/security/tier0-discovery.js
 *
 *   # Or for staging first to sanity-check the script:
 *   FIREBASE_PROJECT=wake-staging node scripts/security/tier0-discovery.js
 *
 * OUTPUT
 *   Console summary + writes scripts/security/tier0-discovery-output.json
 *   with raw counts per check.
 *
 * SAFETY
 *   This script never writes. It only counts and samples.
 */

/* eslint-disable no-console */
const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ID = process.env.FIREBASE_PROJECT || "wolf-20b8b";

admin.initializeApp({projectId: PROJECT_ID});
const db = admin.firestore();

const ALLOWED_USER_COURSE_STATUSES = new Set(["active", "expired", "cancelled", "trial"]);
const MAX_TRIAL_DURATION_DAYS = 14;

const results = {
  project: PROJECT_ID,
  ranAt: new Date().toISOString(),
  checks: {},
};

async function checkUserCourseStatusEnum() {
  console.log("\n[H-25] Course status enum check…");
  const snap = await db.collection("users").get();
  const violations = [];
  let trialUsers = 0;
  let totalCourseEntries = 0;

  for (const doc of snap.docs) {
    const courses = (doc.data().courses || {});
    for (const [cid, entry] of Object.entries(courses)) {
      totalCourseEntries++;
      const status = entry?.status;
      if (status && !ALLOWED_USER_COURSE_STATUSES.has(status)) {
        violations.push({userId: doc.id, courseId: cid, status});
      }
      if (status === "trial") trialUsers++;
    }
  }

  results.checks.userCourseStatusEnum = {
    totalUsers: snap.size,
    totalCourseEntries,
    activeTrialEntries: trialUsers,
    enumViolations: violations.length,
    sample: violations.slice(0, 10),
  };
  console.log(`  ${snap.size} users, ${totalCourseEntries} course entries.`);
  console.log(`  ${trialUsers} active trial entries (will continue to work — patch only affects new writes).`);
  console.log(`  ${violations.length} status values OUTSIDE allowed enum.`);
  if (violations.length > 0) {
    console.log(`  ⚠ Sample: ${JSON.stringify(violations.slice(0, 5))}`);
  }
}

async function checkTrialDurations() {
  console.log("\n[C-06] Trial duration check…");
  const now = Date.now();
  const snap = await db.collection("users").get();
  const longTrials = [];
  let activeTrials = 0;

  for (const doc of snap.docs) {
    const courses = (doc.data().courses || {});
    for (const [cid, entry] of Object.entries(courses)) {
      if (entry?.status !== "trial") continue;
      activeTrials++;
      const purchasedAt = entry.purchased_at ? Date.parse(entry.purchased_at) : null;
      const expiresAt = entry.expires_at ? Date.parse(entry.expires_at) : null;
      if (purchasedAt && expiresAt) {
        const days = Math.round((expiresAt - purchasedAt) / 86400000);
        if (days > MAX_TRIAL_DURATION_DAYS) {
          longTrials.push({userId: doc.id, courseId: cid, days, expiresAt: entry.expires_at});
        }
      }
    }
  }

  results.checks.trialDurations = {
    activeTrials,
    longTrials: longTrials.length,
    sample: longTrials.slice(0, 10),
    note: "Existing long trials are NOT modified by the patch. Only new trial creations are clamped.",
    futureCleanup: "Consider truncating expires_at on existing long trials > 14 days as a one-time migration.",
  };
  console.log(`  ${activeTrials} active trials.`);
  console.log(`  ${longTrials.length} trials longer than ${MAX_TRIAL_DURATION_DAYS} days.`);
}

async function checkClientProgramsExistence() {
  console.log("\n[H-09] client_programs existence check (for backfill ownership)…");
  const sample = await db.collection("client_programs").limit(20).get();
  results.checks.clientPrograms = {
    sampleSize: sample.size,
    note: "Backfill patch requires client_programs/{userId}_{programId}. If this collection is sparse, the patch may unintentionally block legitimate users — investigate.",
  };
  console.log(`  ${sample.size} sample client_programs docs found.`);
}

async function checkPurchaseLogsHistory() {
  console.log("\n[H-10] purchase_logs analysis (potential bad data)…");
  const userSnap = await db.collection("users").limit(200).get();
  let usersWithPurchaseLogs = 0;
  let totalLogs = 0;
  for (const userDoc of userSnap.docs) {
    const logs = await userDoc.ref.collection("purchase_logs").limit(10).get();
    if (!logs.empty) {
      usersWithPurchaseLogs++;
      totalLogs += logs.size;
    }
  }
  results.checks.purchaseLogs = {
    usersChecked: userSnap.size,
    usersWithPurchaseLogs,
    totalLogsSampled: totalLogs,
    note: "Patch makes POST /purchases admin-only. Existing purchase_logs entries are untouched. If client code calls POST /purchases routinely, that path will start returning 403.",
  };
  console.log(`  ${usersWithPurchaseLogs}/${userSnap.size} sampled users have purchase_logs.`);
}

async function checkSubscriptionStateMachine() {
  console.log("\n[H-18] Subscription state inventory (for refund handling validation)…");
  const userSnap = await db.collection("users").limit(500).get();
  const stateCounts = {};
  let totalSubs = 0;
  for (const userDoc of userSnap.docs) {
    const subs = await userDoc.ref.collection("subscriptions").get();
    for (const subDoc of subs.docs) {
      totalSubs++;
      const status = subDoc.data().status || "unknown";
      stateCounts[status] = (stateCounts[status] || 0) + 1;
    }
  }
  results.checks.subscriptionStates = {
    usersChecked: userSnap.size,
    totalSubs,
    stateBreakdown: stateCounts,
  };
  console.log(`  ${totalSubs} subscriptions across ${userSnap.size} sampled users.`);
  console.log(`  Status breakdown: ${JSON.stringify(stateCounts)}`);
}

async function checkProcessedPaymentsRefunds() {
  console.log("\n[H-18] processed_payments refund history…");
  const refunded = await db.collection("processed_payments")
    .where("status", "==", "refunded")
    .limit(50)
    .get();
  const chargedBack = await db.collection("processed_payments")
    .where("status", "==", "charged_back")
    .limit(50)
    .get();
  results.checks.processedPaymentRefunds = {
    refunded: refunded.size,
    chargedBack: chargedBack.size,
    note: "Existing refunded/charged_back entries were silently logged but never revoked access. Consider a one-time backfill to revoke access on these.",
    refundedSample: refunded.docs.slice(0, 5).map((d) => ({id: d.id, ...d.data()})),
  };
  console.log(`  ${refunded.size} refunded + ${chargedBack.size} charged_back payment records found.`);
  if (refunded.size > 0 || chargedBack.size > 0) {
    console.log("  ⚠ These users still have active access. One-time backfill recommended.");
  }
}

async function checkOrphanedTrialsUsed() {
  console.log("\n[C-06 follow-up] users.trial_used field presence…");
  const sample = await db.collection("users").where("trial_used", "!=", null).limit(10).get();
  results.checks.trialUsedField = {
    docsFound: sample.size,
    note: "Patch writes trial_used.{courseId} on every new trial. Existing users have no trial_used field — they CAN start a trial after the patch. This is acceptable for first deploy; revisit if needed.",
  };
  console.log(`  ${sample.size} users currently have trial_used field (probably 0 — field is new).`);
}

async function checkStorageDownloadCallers() {
  console.log("\n[C-09] /storage/download-url usage analysis…");
  console.log("  This script cannot directly survey API call patterns.");
  console.log("  Manual check: search PWA + creator dashboard codebase for callers of");
  console.log("  /storage/download-url or downloadUrl(). Verify all callers stay within");
  console.log("  the new allowlist (progress_photos, body_log, profiles, users).");
  results.checks.storageDownloadUrl = {
    note: "Static analysis required — check apps/pwa/src and apps/creator-dashboard/src for callers.",
  };
}

async function checkCreatorRegisterUnverifiedEmails() {
  console.log("\n[H-24] Creator accounts with unverified emails…");
  const creators = await db.collection("users").where("role", "==", "creator").get();
  console.log(`  ${creators.size} total creators.`);
  let unverified = 0;
  const sample = [];
  for (const doc of creators.docs.slice(0, 100)) {
    try {
      const authRecord = await admin.auth().getUser(doc.id);
      if (!authRecord.emailVerified) {
        unverified++;
        if (sample.length < 10) {
          sample.push({userId: doc.id, email: authRecord.email});
        }
      }
    } catch {
      // user may not exist in Auth (rare)
    }
  }
  results.checks.unverifiedCreators = {
    sampleSize: Math.min(creators.size, 100),
    unverifiedInSample: unverified,
    sample,
    note: "Existing unverified creators retain access — patch only affects NEW /creator/register calls.",
  };
  console.log(`  ${unverified}/${Math.min(creators.size, 100)} sampled creators have UNVERIFIED emails.`);
}

async function main() {
  console.log(`\n=== Tier 0 Discovery — project: ${PROJECT_ID} ===\n`);
  console.log("This script READS production state to inform Tier 0 patch deployment.");
  console.log("It writes nothing.\n");

  try {
    await checkUserCourseStatusEnum();
    await checkTrialDurations();
    await checkClientProgramsExistence();
    await checkPurchaseLogsHistory();
    await checkSubscriptionStateMachine();
    await checkProcessedPaymentsRefunds();
    await checkOrphanedTrialsUsed();
    await checkStorageDownloadCallers();
    await checkCreatorRegisterUnverifiedEmails();
  } catch (err) {
    console.error("\n✗ Discovery failed:", err);
    process.exit(1);
  }

  const outPath = path.join(__dirname, "tier0-discovery-output.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n✓ Discovery complete. Raw output: ${outPath}\n`);
}

main();
