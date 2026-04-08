import { Router } from "express";
import * as admin from "firebase-admin";
import { checkIpRateLimit } from "../middleware/rateLimit.js";

const router = Router();
const db = admin.firestore();

// In-memory cache for app resources (5 min TTL, bounded size)
let cachedResources: { data: unknown; expiresAt: number; sizeBytes: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE_BYTES = 1_000_000; // 1MB max cache

// GET /app-resources (no auth, cached 5 min, IP rate limited)
router.get("/app-resources", async (req, res) => {
  // IP-based rate limiting for public endpoint
  await checkIpRateLimit(req, 60);

  const now = Date.now();

  res.setHeader("Cache-Control", "public, max-age=300");

  if (cachedResources && now < cachedResources.expiresAt) {
    res.json({ data: cachedResources.data });
    return;
  }

  const snapshot = await db.collection("app_resources").get();
  const resources = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Only cache if within size bounds
  const jsonStr = JSON.stringify(resources);
  if (jsonStr.length <= MAX_CACHE_SIZE_BYTES) {
    cachedResources = { data: resources, expiresAt: now + CACHE_TTL_MS, sizeBytes: jsonStr.length };
  } else {
    cachedResources = null;
  }

  res.json({ data: resources });
});

export default router;
