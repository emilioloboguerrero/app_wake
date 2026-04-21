// Fingerprint → GitHub issue mapping, persisted in Firestore.
//
// Shape matches docs/WAKE_OPS.md § "Fingerprint → GitHub issue mapping".
// Doc ID = fingerprint (natural key, one active issue per fingerprint).

import * as admin from "firebase-admin";

const COLLECTION = "ops_issues";

export type OpsIssueSource =
  | "logs"
  | "payments"
  | "pwa_errors"
  | "creator_errors"
  | "quota";

export type OpsIssueState = "open" | "resolved_pending_close" | "closed";

export interface OpsIssue {
  fingerprint: string;
  issueNumber: number;
  issueUrl: string;
  source: OpsIssueSource;
  firstOpened: admin.firestore.Timestamp;
  lastOccurrence: admin.firestore.Timestamp;
  occurrenceCount: number;
  state: OpsIssueState;
  resolutionNoteAddedAt?: admin.firestore.Timestamp;
  resolutionCommitSha?: string;
}

export async function getOpsIssue(
  fingerprint: string
): Promise<OpsIssue | null> {
  const db = admin.firestore();
  const snap = await db.collection(COLLECTION).doc(fingerprint).get();
  return snap.exists ? (snap.data() as OpsIssue) : null;
}

export async function createOpsIssue(input: {
  fingerprint: string;
  issueNumber: number;
  issueUrl: string;
  source: OpsIssueSource;
  occurrenceCount: number;
}): Promise<OpsIssue> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const doc: OpsIssue = {
    fingerprint: input.fingerprint,
    issueNumber: input.issueNumber,
    issueUrl: input.issueUrl,
    source: input.source,
    firstOpened: now,
    lastOccurrence: now,
    occurrenceCount: input.occurrenceCount,
    state: "open",
  };
  await db.collection(COLLECTION).doc(input.fingerprint).set(doc);
  return doc;
}

export async function updateOpsIssue(
  fingerprint: string,
  patch: Partial<OpsIssue>
): Promise<void> {
  const db = admin.firestore();
  await db.collection(COLLECTION).doc(fingerprint).set(patch, {merge: true});
}

export async function listOpenOpsIssues(): Promise<OpsIssue[]> {
  const db = admin.firestore();
  const snap = await db
    .collection(COLLECTION)
    .where("state", "==", "open")
    .get();
  return snap.docs.map((d) => d.data() as OpsIssue);
}
