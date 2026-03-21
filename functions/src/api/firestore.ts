import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Query, DocumentSnapshot } from "firebase-admin/firestore";

export const db = admin.firestore();
export { FieldValue, Timestamp };
export type { Query, DocumentSnapshot };
