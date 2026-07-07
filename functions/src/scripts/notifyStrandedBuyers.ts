// One-off outreach: email buyers of a program who paid but never entered the
// app, telling them exactly how to install the PWA and sign in with their
// purchase email. The email CTA is a magic link that auto-signs them in.
//
// SAFE BY DEFAULT: dry-run unless you pass --send. Dry-run prints the exact
// recipient list so you can eyeball it before anything goes out. Each send is
// recorded on the user's course entry (onboarding_email_sent_at) so a re-run
// never double-emails the same buyer.
//
// Usage (from functions/ after `npm run build`):
//   GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json RESEND_API_KEY=... \
//     node lib/scripts/notifyStrandedBuyers.js --course="<courseId or title>" [--send] [--limit=N]
//
// "Stranded" = has the course in users.courses with status "active" AND the
// Firebase Auth account has never signed in (metadata.lastSignInTime empty).
// Guest checkout pre-creates an Auth user that never signs in, so this cleanly
// targets people who paid but never opened the app.

import * as admin from "firebase-admin";
import {sendAccessHowToEmail} from "../api/services/purchaseEmails.js";

interface Args {
  course: string;
  send: boolean;
  limit: number | null;
}

interface Buyer {
  uid: string;
  email: string;
}

function parseArgs(argv: string[]): Args {
  let course = "";
  let send = false;
  let limit: number | null = null;
  for (const raw of argv.slice(2)) {
    if (raw === "--send") {
      send = true;
    } else if (raw.startsWith("--course=")) {
      course = raw.slice("--course=".length).trim();
    } else if (raw.startsWith("--limit=")) {
      const n = parseInt(raw.slice("--limit=".length), 10);
      if (!Number.isNaN(n) && n > 0) limit = n;
    }
  }
  return {course, send, limit};
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Resolve the target course by exact document id first, then by a
// case-insensitive title match. Refuses to guess when a title is ambiguous.
async function resolveCourse(
  db: admin.firestore.Firestore,
  arg: string,
): Promise<{courseId: string; title: string}> {
  const byId = await db.collection("courses").doc(arg).get();
  if (byId.exists) {
    const title = (byId.data()?.title as string) || arg;
    return {courseId: byId.id, title};
  }
  const needle = arg.toLowerCase();
  const snap = await db.collection("courses").get();
  const matches = snap.docs.filter((d) => {
    const title = (d.data()?.title as string) || "";
    return title.toLowerCase().includes(needle);
  });
  if (matches.length === 0) {
    throw new Error(`No course found matching id or title "${arg}".`);
  }
  if (matches.length > 1) {
    const list = matches.map((d) => `  ${d.id} — ${(d.data()?.title as string) || "(sin título)"}`).join("\n");
    throw new Error(`Ambiguous course "${arg}". Matches:\n${list}\nRe-run with --course=<exact courseId>.`);
  }
  const doc = matches[0];
  return {courseId: doc.id, title: (doc.data()?.title as string) || doc.id};
}

// Scan users for anyone holding this course with an active status. Paginated by
// document id so it works regardless of collection size. A one-off admin scan —
// not something we'd ever do in a request path.
async function findBuyers(
  db: admin.firestore.Firestore,
  courseId: string,
): Promise<Buyer[]> {
  const buyers: Buyer[] = [];
  const pageSize = 500;
  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  for (;;) {
    let q = db.collection("users").orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (last) q = q.startAfter(last.id);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const courses = doc.data()?.courses as Record<string, {status?: string}> | undefined;
      const entry = courses?.[courseId];
      if (!entry || entry.status !== "active") continue;
      const email = (doc.data()?.email as string) || "";
      buyers.push({uid: doc.id, email: email.trim().toLowerCase()});
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }
  return buyers;
}

// True when this buyer never signed in — the "paid but never entered" signal.
// Also resolves the freshest email from the Auth record when the Firestore doc
// lacks one (guest purchases sometimes land the email only on the Auth user).
async function resolveStranded(buyer: Buyer): Promise<{stranded: boolean; email: string}> {
  let email = buyer.email;
  let stranded = false;
  try {
    const rec = await admin.auth().getUser(buyer.uid);
    if (!rec.metadata.lastSignInTime) stranded = true;
    if (!EMAIL_RE.test(email) && rec.email) email = rec.email.trim().toLowerCase();
  } catch {
    // No Auth user at all → certainly never signed in.
    stranded = true;
  }
  return {stranded, email};
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.course) {
    throw new Error("Missing --course=<courseId or title>.");
  }
  if (!process.env.RESEND_API_KEY && args.send) {
    throw new Error("RESEND_API_KEY is required to actually send. Omit --send for a dry-run.");
  }

  admin.initializeApp();
  const db = admin.firestore();

  const {courseId, title} = await resolveCourse(db, args.course);
  console.log(`Course: ${title} (${courseId})`);

  const buyers = await findBuyers(db, courseId);
  console.log(`Active buyers of this course: ${buyers.length}`);

  const recipients: Buyer[] = [];
  for (const buyer of buyers) {
    const courses = (await db.collection("users").doc(buyer.uid).get()).data()?.courses as
      Record<string, {onboarding_email_sent_at?: string}> | undefined;
    if (courses?.[courseId]?.onboarding_email_sent_at) continue; // already contacted
    const {stranded, email} = await resolveStranded(buyer);
    if (!stranded) continue;
    if (!EMAIL_RE.test(email)) {
      console.warn(`  skip ${buyer.uid}: no usable email`);
      continue;
    }
    recipients.push({uid: buyer.uid, email});
  }

  const capped = args.limit ? recipients.slice(0, args.limit) : recipients;
  console.log(`Stranded (never entered, not yet contacted): ${recipients.length}` +
    (args.limit ? `, sending to first ${capped.length}` : ""));
  for (const r of capped) console.log(`  ${r.email}  (${r.uid})`);

  if (!args.send) {
    console.log("\nDRY-RUN. No emails sent. Re-run with --send to send.");
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const r of capped) {
    const ok = await sendAccessHowToEmail({to: r.email, programTitle: title, courseId});
    if (ok) {
      sent += 1;
      await db.collection("users").doc(r.uid).update({
        [`courses.${courseId}.onboarding_email_sent_at`]: new Date().toISOString(),
      }).catch((e) => console.warn(`  could not mark ${r.uid}: ${String(e)}`));
    } else {
      failed += 1;
      console.warn(`  send FAILED for ${r.email}`);
    }
    await new Promise((res) => setTimeout(res, 600)); // stay under Resend rate limits
  }
  console.log(`\nDone. Sent: ${sent}, failed: ${failed}.`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
