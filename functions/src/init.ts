import * as admin from "firebase-admin";

// Initialize Firebase Admin before any other module calls admin.firestore() etc.
// This file is imported via side-effect import in index.ts, which runs before
// the app.ts import chain that triggers route-level admin.firestore() calls.
if (!admin.apps.length) {
  const projectId = process.env.GCLOUD_PROJECT || "wolf-20b8b";
  admin.initializeApp({
    storageBucket: `${projectId}.firebasestorage.app`,
  });
}
