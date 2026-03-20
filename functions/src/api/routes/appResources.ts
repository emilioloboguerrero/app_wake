import { Router } from "express";
import * as admin from "firebase-admin";

const router = Router();
const db = admin.firestore();

// In-memory cache for app resources (5 min TTL)
let cachedResources: { data: unknown; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// GET /app-resources (no auth, cached 5 min)
router.get("/app-resources", async (_req, res) => {
  const now = Date.now();

  res.setHeader("Cache-Control", "public, max-age=300");

  if (cachedResources && now < cachedResources.expiresAt) {
    res.json({ data: cachedResources.data });
    return;
  }

  const snapshot = await db.collection("app_resources").get();
  const resources = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  cachedResources = { data: resources, expiresAt: now + CACHE_TTL_MS };

  res.json({ data: resources });
});

export default router;
