import * as admin from "firebase-admin";
import { FieldValue, FieldPath, Timestamp } from "firebase-admin/firestore";
import type { Query, DocumentSnapshot } from "firebase-admin/firestore";

export const db = admin.firestore();
export { FieldValue, FieldPath, Timestamp };
export type { Query, DocumentSnapshot };
