import { Router } from "express";
import { checkIpRateLimit } from "../middleware/rateLimit.js";
import { WakeApiServerError } from "../errors.js";
import { db, FieldValue } from "../firestore.js";

const router = Router();

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

// PUT /app-resources/landing (admin only — manages landing page assets)
router.put("/app-resources/landing", async (req, res, next) => {
  try {
    if (!req.auth || req.auth.role !== "admin") {
      throw new WakeApiServerError("FORBIDDEN", 403, "Solo administradores pueden modificar recursos");
    }

    const { mainHeroLanding, cards, dosFormas } = req.body;

    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

    if (mainHeroLanding !== undefined) {
      if (!Array.isArray(mainHeroLanding) || mainHeroLanding.some((u: unknown) => typeof u !== "string")) {
        throw new WakeApiServerError("VALIDATION_ERROR", 400, "mainHeroLanding debe ser un array de URLs", "mainHeroLanding");
      }
      update.mainHeroLanding = mainHeroLanding;
    }

    if (cards !== undefined) {
      if (!Array.isArray(cards) || cards.some((u: unknown) => typeof u !== "string")) {
        throw new WakeApiServerError("VALIDATION_ERROR", 400, "cards debe ser un array de URLs", "cards");
      }
      update.cards = cards;
    }

    if (dosFormas !== undefined) {
      if (typeof dosFormas !== "string" && dosFormas !== null) {
        throw new WakeApiServerError("VALIDATION_ERROR", 400, "dosFormas debe ser una URL o null", "dosFormas");
      }
      update.dosFormas = dosFormas;
    }

    await db.collection("app_resources").doc("landing").set(update, { merge: true });

    // Bust cache so the public GET picks up changes immediately
    cachedResources = null;

    const doc = await db.collection("app_resources").doc("landing").get();
    res.json({ data: { id: "landing", ...doc.data() } });
  } catch (err) {
    next(err);
  }
});

export default router;
