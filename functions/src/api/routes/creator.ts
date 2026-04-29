import {Router} from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as crypto from "node:crypto";
import {Resend} from "resend";
import {db, FieldValue, FieldPath} from "../firestore.js";
import type {Query} from "../firestore.js";
import {validateAuthAndRateLimit} from "../middleware/auth.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {validateBody, pickFields, validateStoragePath} from "../middleware/validate.js";
import {
  assertTextLength,
  loadCreatorOwnedCourseIds,
  maskEmail,
  TEXT_CAP_DESCRIPTION,
  TEXT_CAP_NOTE,
  TEXT_CAP_TITLE,
  validateDeletionPath,
} from "../middleware/securityHelpers.js";
import {WakeApiServerError} from "../errors.js";
import {escapeHtml} from "../services/emailHelpers.js";

const router = Router();

function requireCreator(auth: { role: string }): void {
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Acceso restringido a creadores");
  }
}

// Security (audit C-05): nutrition assignment content body validator with
// per-field caps that hold total payload under the 1 MiB Firestore doc limit
// without rejecting legitimate rich plans (multiple meals per category, each
// with ingredients/notes/photoURL routinely run 1-2 KB → a category easily
// reaches 10 KB). The original 5 KB-per-category cap was too tight and
// rejected real-world setFromLibrary payloads; the new caps preserve the
// audit's anti-DoS intent while accommodating production data.
const NUTRITION_CONTENT_NAME_MAX = 200;
const NUTRITION_CONTENT_DESC_MAX = 5000;
const NUTRITION_CONTENT_CATEGORIES_MAX = 50;
const NUTRITION_CONTENT_CATEGORY_JSON_MAX = 100_000; // 100 KB per category
const NUTRITION_CONTENT_CATEGORIES_TOTAL_JSON_MAX = 800_000; // 800 KB combined (Firestore doc cap is 1 MiB)

interface NutritionContentBody {
  source_plan_id?: string | null;
  name?: string;
  description?: string;
  daily_calories?: number | null;
  daily_protein_g?: number | null;
  daily_carbs_g?: number | null;
  daily_fat_g?: number | null;
  categories?: unknown[];
}

function validateNutritionContentBody(body: unknown): NutritionContentBody {
  const validated = validateBody<NutritionContentBody>({
    source_plan_id: "optional_string",
    name: "optional_string",
    description: "optional_string",
    daily_calories: "optional_number",
    daily_protein_g: "optional_number",
    daily_carbs_g: "optional_number",
    daily_fat_g: "optional_number",
    categories: "optional_array",
  }, body, {maxStringLength: NUTRITION_CONTENT_DESC_MAX, maxArrayLength: NUTRITION_CONTENT_CATEGORIES_MAX});

  if (validated.name && validated.name.length > NUTRITION_CONTENT_NAME_MAX) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      `name excede el máximo de ${NUTRITION_CONTENT_NAME_MAX} caracteres`,
      "name"
    );
  }
  if (Array.isArray(validated.categories)) {
    let totalSize = 0;
    for (const cat of validated.categories) {
      const size = JSON.stringify(cat ?? null).length;
      if (size > NUTRITION_CONTENT_CATEGORY_JSON_MAX) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR", 400,
          "categories[*] excede el tamaño máximo permitido",
          "categories"
        );
      }
      totalSize += size;
    }
    if (totalSize > NUTRITION_CONTENT_CATEGORIES_TOTAL_JSON_MAX) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        "categories en conjunto exceden el tamaño máximo permitido",
        "categories"
      );
    }
  }
  return validated;
}

/**
 * Ensure every exercise has a top-level `name` and `title`. The session-exercise
 * shape stores its identity in `primary: { [libraryId]: idOrDisplayName }`, NOT in
 * `primary.name`/`primary.title` (those keys never existed). Pre-migration the value
 * was a displayName; post-migration it's a stable exerciseId. Either way, falling
 * back to that string keeps `name` non-empty so clients can resolve via library data
 * (the dashboard's libraryExerciseNames map handles id→displayName resolution).
 */
function normalizeExerciseName(exercise: Record<string, unknown>): Record<string, unknown> {
  if (!exercise.name && !exercise.title) {
    const primary = exercise.primary as Record<string, unknown> | undefined;
    if (primary && typeof primary === "object" && !Array.isArray(primary)) {
      const firstValue = Object.values(primary)[0];
      if (typeof firstValue === "string" && firstValue) {
        exercise.name = firstValue;
        exercise.title = firstValue;
      }
    }
  } else if (exercise.name && !exercise.title) {
    exercise.title = exercise.name;
  } else if (exercise.title && !exercise.name) {
    exercise.name = exercise.title;
  }
  return exercise;
}

/**
 * Resolve `name`/`title` on a list of session-exercises through the exercises_library
 * collection so post-migration exerciseIds in primary[libId] map back to the human
 * displayName. Falls back to `normalizeExerciseName` for legacy/unmigrated shapes.
 *
 * Mutates the exercises in place and returns them.
 */
async function hydrateExercisesWithLibraryNames(
  exercises: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const libIds = new Set<string>();
  for (const ex of exercises) {
    const primary = ex.primary as Record<string, string> | undefined;
    if (primary && typeof primary === "object" && !Array.isArray(primary)) {
      for (const libId of Object.keys(primary)) {
        if (typeof libId === "string" && libId) libIds.add(libId);
      }
    }
    const altMap = ex.alternatives as Record<string, unknown> | undefined;
    if (altMap && typeof altMap === "object" && !Array.isArray(altMap)) {
      for (const libId of Object.keys(altMap)) {
        if (typeof libId === "string" && libId) libIds.add(libId);
      }
    }
  }

  if (libIds.size === 0) {
    exercises.forEach((e) => normalizeExerciseName(e));
    return exercises;
  }

  const libDocs = await Promise.all(
    Array.from(libIds).map((libId) =>
      db.collection("exercises_library").doc(libId).get()
    )
  );
  const libraryMap: Record<string, Record<string, unknown>> = {};
  for (const doc of libDocs) {
    if (doc.exists) libraryMap[doc.id] = doc.data()!;
  }

  const resolveDisplayName = (libId: string, value: string): string => {
    const libData = libraryMap[libId];
    if (!libData) return value;
    const libExMap = (libData.exercises as Record<string, Record<string, unknown>> | undefined) ?? {};
    const fromMap = libExMap[value]?.displayName;
    if (typeof fromMap === "string" && fromMap.trim()) return fromMap;
    // Legacy: top-level entry where the key IS the displayName.
    const fromTop = libData[value];
    if (fromTop && typeof fromTop === "object" && !Array.isArray(fromTop)) return value;
    return value;
  };

  for (const ex of exercises) {
    const primary = ex.primary as Record<string, string> | undefined;
    if (primary && typeof primary === "object" && !Array.isArray(primary)) {
      const [libId, val] = Object.entries(primary)[0] ?? [];
      if (libId && typeof val === "string" && val) {
        const resolved = resolveDisplayName(libId, val);
        // Overwrite name/title with the resolved displayName so reads always show
        // current name even after a coach rename. If the entry doesn't resolve
        // (unmigrated library or stale id), keep the existing name/title.
        if (resolved && resolved !== val) {
          ex.name = resolved;
          ex.title = resolved;
        } else {
          normalizeExerciseName(ex);
        }
      } else {
        normalizeExerciseName(ex);
      }
    } else {
      normalizeExerciseName(ex);
    }
  }
  return exercises;
}

/**
 * Build a libId → libDoc map for a list of exercise docs (or doc snapshots),
 * deduping libIds across primary maps. Used by backfill paths to resolve
 * displayName before persisting copied exercises.
 */
async function buildLibraryMapForExerciseDocs(
  docs: Array<FirebaseFirestore.QueryDocumentSnapshot | Record<string, unknown>>
): Promise<Record<string, Record<string, unknown>>> {
  const libIds = new Set<string>();
  for (const d of docs) {
    const data = (typeof (d as FirebaseFirestore.QueryDocumentSnapshot).data === "function" ?
      (d as FirebaseFirestore.QueryDocumentSnapshot).data() :
      d) as Record<string, unknown>;
    const primary = data.primary as Record<string, unknown> | undefined;
    if (primary && typeof primary === "object" && !Array.isArray(primary)) {
      for (const id of Object.keys(primary)) if (id) libIds.add(id);
    }
  }
  if (libIds.size === 0) return {};
  const libDocs = await Promise.all(
    Array.from(libIds).map((id) => db.collection("exercises_library").doc(id).get())
  );
  const map: Record<string, Record<string, unknown>> = {};
  for (const ld of libDocs) if (ld.exists) map[ld.id] = ld.data()!;
  return map;
}

/**
 * Resolve `primary[libId]` to a current displayName via libraryMap. Returns null
 * when no resolution is possible (caller should leave existing name as-is).
 */
function resolveDisplayNameForBackfill(
  exData: Record<string, unknown>,
  libraryMap: Record<string, Record<string, unknown>>
): string | null {
  const primary = exData.primary as Record<string, string> | undefined;
  if (!primary || typeof primary !== "object") return null;
  const [libId, val] = Object.entries(primary)[0] ?? [];
  if (!libId || typeof val !== "string" || !val) return null;
  const libData = libraryMap[libId];
  if (!libData) return null;
  const exMap = (libData.exercises as Record<string, Record<string, unknown>> | undefined) ?? {};
  const fromMap = exMap[val]?.displayName;
  if (typeof fromMap === "string" && fromMap.trim()) return fromMap;
  const fromTop = libData[val];
  if (fromTop && typeof fromTop === "object" && !Array.isArray(fromTop)) return val;
  return null;
}

// GET /creator/clients — paginated 50/page, optional ?programId=X filter, ?status=active|inactive|all
router.get("/creator/clients", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const programId = req.query.programId as string | undefined;
  const pageToken = req.query.pageToken as string | undefined;
  const statusFilter = (req.query.status as string | undefined) ?? "active";

  // status filter helper (active is default; inactive docs get filtered unless asked)
  const matchesStatus = (data: Record<string, unknown>): boolean => {
    if (statusFilter === "all") return true;
    const s = (data.status as string | undefined) ?? "active";
    if (statusFilter === "inactive") return s === "inactive";
    return s !== "inactive";
  };

  if (programId) {
    // Server-side filtering: fetch all clients, batch-lookup users, filter by enrollment.
    const snapshot = await db
      .collection("one_on_one_clients")
      .where("creatorId", "==", auth.userId)
      .orderBy("createdAt", "desc")
      .get();

    const clientDocs = snapshot.docs
      .map((d) => ({...d.data(), id: d.id}))
      .filter((c) => matchesStatus(c as Record<string, unknown>));
    const userIds = [...new Set(
      clientDocs.map((c) => (c as Record<string, unknown>).clientUserId as string).filter(Boolean)
    )];

    // Batch fetch user docs (same pattern as non-programId branch)
    const userDocsMap: Record<string, Record<string, unknown>> = {};
    if (userIds.length > 0) {
      const batchSize = 10;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const userDocs = await db.getAll(...batch.map((uid) => db.collection("users").doc(uid)));
        for (const uDoc of userDocs) {
          if (uDoc.exists) userDocsMap[uDoc.id] = uDoc.data() as Record<string, unknown>;
        }
      }
    }

    const results: Record<string, unknown>[] = [];
    for (const client of clientDocs) {
      const uid = (client as Record<string, unknown>).clientUserId as string;
      const userData = userDocsMap[uid];
      if (!userData) continue;
      const courses = (userData.courses ?? {}) as Record<string, Record<string, unknown>>;
      const enrollment = courses[programId];
      if (enrollment && enrollment.deliveryType === "one_on_one") {
        results.push({
          ...client,
          clientName: userData.displayName ?? userData.name ?? null,
          clientEmail: userData.email ?? null,
          avatarUrl: userData.profilePictureUrl ?? userData.photoURL ?? null,
          enrolledProgram: {courseId: programId, ...enrollment},
        });
      }
    }

    res.json({data: results});
    return;
  }

  // Default: paginated list with enrolled programs enrichment
  const limit = 50;

  let query: Query = db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .orderBy("createdAt", "desc")
    .limit(limit + 1);

  if (pageToken) {
    const cursor = await db.collection("one_on_one_clients").doc(pageToken).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  const filteredDocs = snapshot.docs.filter((d) => matchesStatus(d.data() as Record<string, unknown>));
  const docs = filteredDocs.slice(0, limit);
  const hasMore = filteredDocs.length > limit;

  // Enrich each client with their one_on_one enrolled programs
  const clientDocs = docs.map((d) => ({...d.data(), id: d.id}));
  const userIds = [...new Set(clientDocs.map((c) => (c as Record<string, unknown>).clientUserId as string).filter(Boolean))];

  const userDocsMap: Record<string, Record<string, unknown>> = {};
  if (userIds.length > 0) {
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const userDocs = await db.getAll(...batch.map((uid) => db.collection("users").doc(uid)));
      for (const uDoc of userDocs) {
        if (uDoc.exists) {
          userDocsMap[uDoc.id] = uDoc.data() as Record<string, unknown>;
        }
      }
    }
  }

  // Batch-fetch creator-wide data in parallel (one query each, not per-client)
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekStartIso = weekStart.toISOString().slice(0, 10);

  const [nutritionSnap, bookingsSnap, creatorCoursesSnap] = await Promise.all([
    db.collection("nutrition_assignments")
      .where("assignedBy", "==", auth.userId)
      .where("status", "==", "active")
      .get(),
    db.collection("call_bookings")
      .where("creatorId", "==", auth.userId)
      .where("status", "==", "confirmed")
      .get(),
    db.collection("courses")
      .where("creator_id", "==", auth.userId)
      .select()
      .get(),
  ]);

  const creatorCourseIds = new Set(creatorCoursesSnap.docs.map((d) => d.id));

  // Group nutrition assignments by client userId
  const nutritionByClient: Record<string, { planName: string; assignmentId: string }> = {};
  for (const nDoc of nutritionSnap.docs) {
    const nd = nDoc.data();
    const clientId = (nd.userId ?? nd.client_id) as string;
    if (clientId) {
      nutritionByClient[clientId] = {planName: nd.planName ?? nd.plan_name ?? "", assignmentId: nDoc.id};
    }
  }

  // Group upcoming bookings by client userId
  const callsByClient: Record<string, { bookingId: string; slotStartUtc: unknown }[]> = {};
  for (const bDoc of bookingsSnap.docs) {
    const bd = bDoc.data();
    const slotStart = bd.slotStartUtc ?? bd.startAt ?? bd.date;
    const clientId = (bd.clientUserId ?? bd.client_id) as string;
    if (clientId) {
      if (!callsByClient[clientId]) callsByClient[clientId] = [];
      callsByClient[clientId].push({bookingId: bDoc.id, slotStartUtc: slotStart});
    }
  }

  // Per-client enrichment: session stats, weekly consistency, latest PR
  type ClientStats = {
    sessionsCompleted: number;
    lastSessionDate: string | null;
    weeklyConsistency: number;
    latestPR: { exercise: string; value: unknown; date: string | null } | null;
  };
  const statsMap: Record<string, ClientStats> = {};

  await Promise.all(userIds.map(async (uid) => {
    const [histSnap, countSnap, weekSnap, prSnap] = await Promise.all([
      db.collection("users").doc(uid).collection("sessionHistory")
        .orderBy("date", "desc").limit(1).get(),
      db.collection("users").doc(uid).collection("sessionHistory")
        .count().get(),
      db.collection("users").doc(uid).collection("sessionHistory")
        .where("date", ">=", weekStartIso).count().get(),
      db.collection("users").doc(uid).collection("exerciseLastPerformance")
        .orderBy("date", "desc").limit(1).get(),
    ]);

    let latestPR: ClientStats["latestPR"] = null;
    if (!prSnap.empty) {
      const prData = prSnap.docs[0].data();
      latestPR = {
        exercise: prData.exerciseName ?? prData.exercise_name ?? prSnap.docs[0].id,
        value: prData.weight ?? prData.value ?? null,
        date: prData.date ?? null,
      };
    }

    statsMap[uid] = {
      sessionsCompleted: countSnap.data().count,
      lastSessionDate: histSnap.empty ? null : (histSnap.docs[0].data().date ?? null),
      weeklyConsistency: weekSnap.data().count,
      latestPR,
    };
  }));

  const enriched = clientDocs.map((client) => {
    const clientRow = client as Record<string, unknown>;
    const userId = clientRow.clientUserId as string;
    const userData = userDocsMap[userId];
    const isPending = clientRow.status === "pending";

    // C-10 v2: pending rows return only minimal info (relationship-doc
    // fields + the pending program reference). No body data, no avatar, no
    // session stats — the creator hasn't been authorized to see those yet.
    if (isPending) {
      return {
        id: clientRow.id,
        clientUserId: userId,
        creatorId: clientRow.creatorId,
        clientName: (clientRow.clientName as string | null) ?? null,
        clientEmail: (clientRow.clientEmail as string | null) ?? null,
        status: "pending",
        invitedAt: clientRow.invitedAt ?? null,
        createdAt: clientRow.createdAt ?? null,
        pendingProgramAssignment: clientRow.pendingProgramAssignment ?? null,
        enrolledPrograms: [],
      };
    }

    const courses = (userData?.courses ?? {}) as Record<string, Record<string, unknown>>;
    const enrolledPrograms = Object.entries(courses)
      .filter(([courseId, v]) => v.deliveryType === "one_on_one" && creatorCourseIds.has(courseId))
      .map(([courseId, v]) => ({courseId, title: v.title, status: v.status}));

    // accessEndsAt: earliest expires_at among active one_on_one enrollments for THIS creator
    let accessEndsAt: string | null = null;
    for (const [courseId, entry] of Object.entries(courses)) {
      if (entry.deliveryType === "one_on_one" && entry.status === "active" && entry.expires_at && creatorCourseIds.has(courseId)) {
        const ea = entry.expires_at as string;
        if (!accessEndsAt || ea < accessEndsAt) accessEndsAt = ea;
      }
    }

    const stats = statsMap[userId] ?? {sessionsCompleted: 0, lastSessionDate: null, weeklyConsistency: 0, latestPR: null};

    return {
      ...client,
      clientName: userData?.displayName ?? userData?.name ?? clientRow.clientName ?? null,
      clientEmail: userData?.email ?? clientRow.clientEmail ?? null,
      avatarUrl: userData?.profilePictureUrl ?? userData?.photoURL ?? null,
      enrolledPrograms,
      sessionsCompleted: stats.sessionsCompleted,
      lastSessionDate: stats.lastSessionDate,
      weeklyConsistency: stats.weeklyConsistency,
      latestPR: stats.latestPR,
      nutritionPlan: nutritionByClient[userId] ?? null,
      calls: callsByClient[userId] ?? [],
      accessEndsAt,
    };
  });

  res.json({
    data: enriched,
    nextPageToken: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
  });
});

// GET /creator/clients-overview — combined clients + programs + adherence in one call
// Eliminates duplicate reads across the three individual endpoints
router.get("/creator/clients-overview", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const [clientsSnap, coursesSnap] = await Promise.all([
    db.collection("one_on_one_clients")
      .where("creatorId", "==", auth.userId)
      .orderBy("createdAt", "desc")
      .get(),
    db.collection("courses")
      .where("creator_id", "==", auth.userId)
      .get(),
  ]);

  const creatorCourseIds = new Set(coursesSnap.docs.map((d) => d.id));

  const clientDocs = clientsSnap.docs.map((d) => ({...d.data(), id: d.id}));
  const clientUserIds = [...new Set(
    clientDocs.map((c) => (c as Record<string, unknown>).clientUserId as string).filter(Boolean)
  )];

  // ── 2. Batch fetch user docs (N reads) ──
  const userDocsMap: Record<string, Record<string, unknown>> = {};
  if (clientUserIds.length > 0) {
    const batchSize = 10;
    for (let i = 0; i < clientUserIds.length; i += batchSize) {
      const batch = clientUserIds.slice(i, i + batchSize);
      const userDocs = await db.getAll(...batch.map((uid) => db.collection("users").doc(uid)));
      for (const uDoc of userDocs) {
        if (uDoc.exists) {
          userDocsMap[uDoc.id] = uDoc.data() as Record<string, unknown>;
        }
      }
    }
  }


  // ── 3. Compute enrollment counts from user docs (0 reads) ──
  const enrollmentCounts: Record<string, number> = {};
  for (const userData of Object.values(userDocsMap)) {
    const courses = (userData.courses ?? {}) as Record<string, Record<string, unknown>>;
    for (const [courseId, entry] of Object.entries(courses)) {
      if (entry.status === "active") {
        enrollmentCounts[courseId] = (enrollmentCounts[courseId] ?? 0) + 1;
      }
    }
  }

  // ── 4. Build clients (no per-client stats — they're not shown on the listing) ──
  const clients = clientDocs.map((client) => {
    const userId = (client as Record<string, unknown>).clientUserId as string;
    const userData = userDocsMap[userId];
    const courses = (userData?.courses ?? {}) as Record<string, Record<string, unknown>>;
    const enrolledPrograms = Object.entries(courses)
      .filter(([courseId, v]) => v.deliveryType === "one_on_one" && creatorCourseIds.has(courseId))
      .map(([courseId, v]) => ({courseId, title: v.title, status: v.status}));

    let accessEndsAt: string | null = null;
    for (const [courseId, entry] of Object.entries(courses)) {
      if (entry.deliveryType === "one_on_one" && entry.status === "active" && entry.expires_at && creatorCourseIds.has(courseId)) {
        const ea = entry.expires_at as string;
        if (!accessEndsAt || ea < accessEndsAt) accessEndsAt = ea;
      }
    }

    return {
      ...client,
      clientName: userData?.displayName ?? userData?.name ?? (client as Record<string, unknown>).clientName ?? null,
      clientEmail: userData?.email ?? (client as Record<string, unknown>).clientEmail ?? null,
      avatarUrl: userData?.profilePictureUrl ?? userData?.photoURL ?? null,
      enrolledPrograms,
      accessEndsAt,
    };
  });

  // ── 5. Build programs list ──
  const programs = coursesSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      imageUrl: data.image_url ?? null,
      enrollmentCount: enrollmentCounts[d.id] ?? 0,
    };
  });


  // ── 6. Compute adherence (only when requested — saves 19 reads) ──
  const includeAdherence = req.query.includeAdherence === "true";

  let adherencePayload: Record<string, unknown> | null = null;

  if (includeAdherence) {
    const now = new Date();
    const weekStarts: string[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - (i * 7));
      const day = d.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + mondayOffset);
      weekStarts.push(d.toISOString().slice(0, 10));
    }
    const eightWeeksAgoStr = weekStarts[0];

    // Fetch modules + sessions per program (P + P*M reads)
    interface ProgramMeta { id: string; title: string; sessionCount: number; moduleCount: number }
    const programMetas: ProgramMeta[] = [];
    await Promise.all(coursesSnap.docs.map(async (programDoc) => {
      const modulesSnap = await db.collection("courses").doc(programDoc.id).collection("modules").get();
      let sessionCount = 0;
      await Promise.all(modulesSnap.docs.map(async (moduleDoc) => {
        const sessionsSnap = await db.collection("courses").doc(programDoc.id)
          .collection("modules").doc(moduleDoc.id).collection("sessions").get();
        sessionCount += sessionsSnap.size;
      }));
      programMetas.push({
        id: programDoc.id,
        title: (programDoc.data().title as string) ?? "",
        sessionCount,
        moduleCount: Math.max(1, modulesSnap.size),
      });
    }));

    // Fetch recent sessionHistory per client, bucket by courseId (N reads instead of P*N)
    const historyByProgram: Record<string, { total: number; weekBuckets: Record<string, number> }> = {};
    for (const pm of programMetas) {
      const buckets: Record<string, number> = {};
      for (const ws of weekStarts) buckets[ws] = 0;
      historyByProgram[pm.id] = {total: 0, weekBuckets: buckets};
    }

    await Promise.all(clientUserIds.map(async (uid) => {
      const histSnap = await db.collection("users").doc(uid)
        .collection("sessionHistory")
        .where("date", ">=", eightWeeksAgoStr)
        .get();

      for (const histDoc of histSnap.docs) {
        const data = histDoc.data();
        const courseId = data.courseId as string | undefined;
        const dateStr = data.date as string | undefined;
        if (!courseId || !dateStr || !historyByProgram[courseId]) continue;

        historyByProgram[courseId].total++;

        const date = new Date(dateStr);
        const dayOfWeek = date.getDay();
        const mondayOff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekDate = new Date(date);
        weekDate.setDate(date.getDate() + mondayOff);
        const weekKey = weekDate.toISOString().slice(0, 10);
        if (historyByProgram[courseId].weekBuckets[weekKey] !== undefined) {
          historyByProgram[courseId].weekBuckets[weekKey]++;
        }
      }
    }));

    // Compute per-program adherence
    let totalCompleted = 0;
    let totalExpected = 0;

    interface WeeklyPoint { week: string; workoutAdherence: number; nutritionAdherence: number | null }
    interface ProgramAdherence {
      programId: string; title: string;
      completedSessions: number; totalSessions: number;
      workoutAdherence: number; nutritionAdherence: number | null;
      weeklyHistory: WeeklyPoint[];
    }
    const byProgram: ProgramAdherence[] = [];

    // Fetch nutrition data for all clients (once, shared across programs)
    const clientNutritionData: Record<string, {
      target: { calories: number; protein: number };
      dailyTotals: Record<string, { calories: number; protein: number }>;
    }> = {};
    await Promise.all(clientUserIds.map(async (uid) => {
      const assignSnap = await db.collection("nutrition_assignments")
        .where("userId", "==", uid)
        .where("status", "==", "active")
        .limit(1).get();
      if (assignSnap.empty) return;
      const contentDoc = await db.collection("client_nutrition_plan_content").doc(assignSnap.docs[0].id).get();
      if (!contentDoc.exists) return;
      const c = contentDoc.data()!;
      const tCal = (c.daily_calories ?? 0) as number;
      const tPro = (c.daily_protein_g ?? 0) as number;
      if (tCal <= 0 && tPro <= 0) return;

      const diarySnap = await db.collection("users").doc(uid).collection("diary")
        .where("date", ">=", eightWeeksAgoStr).get();
      const dailyTotals: Record<string, { calories: number; protein: number }> = {};
      for (const dd of diarySnap.docs) {
        const d = dd.data();
        if (!dailyTotals[d.date]) dailyTotals[d.date] = {calories: 0, protein: 0};
        dailyTotals[d.date].calories += d.calories ?? 0;
        dailyTotals[d.date].protein += d.protein ?? 0;
      }
      clientNutritionData[uid] = {target: {calories: tCal, protein: tPro}, dailyTotals};
    }));

    const hasAnyNutritionPlan = Object.keys(clientNutritionData).length > 0;

    // Compute nutrition adherence across all clients
    let globalNutrDaysWithin = 0;
    let globalNutrDaysTotal = 0;
    for (const nd of Object.values(clientNutritionData)) {
      for (const n of Object.values(nd.dailyTotals)) {
        globalNutrDaysTotal++;
        const calOk = nd.target.calories <= 0 || (n.calories / nd.target.calories >= 0.8 && n.calories / nd.target.calories <= 1.2);
        const proOk = nd.target.protein <= 0 || (n.protein / nd.target.protein >= 0.8 && n.protein / nd.target.protein <= 1.2);
        if (calOk && proOk) globalNutrDaysWithin++;
      }
    }
    const globalNutrAdherence = hasAnyNutritionPlan && globalNutrDaysTotal > 0 ?
      Math.round((globalNutrDaysWithin / globalNutrDaysTotal) * 100) : null;

    for (const pm of programMetas) {
      const hist = historyByProgram[pm.id];
      const sessionsPerWeek = Math.max(1, Math.round(pm.sessionCount / pm.moduleCount));
      const expectedPerWeek = sessionsPerWeek * Math.max(1, clientUserIds.length);
      const expectedTotal = pm.sessionCount * clientUserIds.length;

      const weeklyHistory: WeeklyPoint[] = weekStarts.map((ws) => ({
        week: ws,
        workoutAdherence: Math.min(100, Math.round(((hist.weekBuckets[ws] ?? 0) / expectedPerWeek) * 100)),
        nutritionAdherence: globalNutrAdherence,
      }));

      const workoutAdh = expectedTotal > 0 ? Math.round((hist.total / expectedTotal) * 100) : 0;
      totalCompleted += hist.total;
      totalExpected += expectedTotal;

      byProgram.push({
        programId: pm.id,
        title: pm.title,
        completedSessions: hist.total,
        totalSessions: expectedTotal,
        workoutAdherence: workoutAdh,
        nutritionAdherence: globalNutrAdherence,
        weeklyHistory,
      });
    }

    const overallWorkoutAdherence = totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;
    const overallNutritionAdherence = globalNutrAdherence;

    // Enrollment history (weekly running total from clientsSnap)
    const clientCreatedDates: string[] = [];
    for (const doc of clientsSnap.docs) {
      const data = doc.data();
      let createdStr: string | null = null;
      if (data.created_at?.toDate) {
        createdStr = data.created_at.toDate().toISOString().slice(0, 10);
      } else if (data.createdAt?.toDate) {
        createdStr = data.createdAt.toDate().toISOString().slice(0, 10);
      } else if (typeof data.created_at === "string") {
        createdStr = data.created_at.slice(0, 10);
      } else if (typeof data.createdAt === "string") {
        createdStr = (data.createdAt as string).slice(0, 10);
      }
      if (createdStr) clientCreatedDates.push(createdStr);
    }
    clientCreatedDates.sort();

    const enrollmentHistory: Array<{ week: string; clients: number }> = [];
    for (const ws of weekStarts) {
      const weekEnd = new Date(ws);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().slice(0, 10);
      const count = clientCreatedDates.filter((d) => d <= weekEndStr).length;
      enrollmentHistory.push({week: ws, clients: count});
    }

    adherencePayload = {overallWorkoutAdherence, overallNutritionAdherence, byProgram, enrollmentHistory};
  }

  res.json({
    data: {
      clients,
      programs,
      adherence: adherencePayload,
    },
  });
});

// POST /creator/clients/lookup
// Audit M-45: tighter rate limit (was 200 RPM via the default), matched
// response shape on hit/miss, masked email, drop photoURL. Combined with
// C-10's pending-status default these reduce the directory-harvesting +
// impose-as-coach chain to a slow per-creator probe.
router.post("/creator/clients/lookup", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 30, "rate_limit_first_party");

  // M-12: schema-validate body (was raw req.body read).
  const body = validateBody<{ emailOrUsername: string }>(
    {emailOrUsername: "string"},
    req.body
  );
  if (body.emailOrUsername.length > 256) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Consulta demasiado larga", "emailOrUsername");
  }

  const query = body.emailOrUsername.trim().toLowerCase();

  // Search by email first
  let userSnap = await db.collection("users")
    .where("email", "==", query)
    .limit(1)
    .get();

  // If not found, try by username
  if (userSnap.empty) {
    userSnap = await db.collection("users")
      .where("username", "==", query)
      .limit(1)
      .get();
  }

  if (userSnap.empty) {
    res.json({data: {found: false}});
    return;
  }

  const userDoc = userSnap.docs[0];
  const userData = userDoc.data();

  res.json({
    data: {
      found: true,
      userId: userDoc.id,
      displayName: userData.displayName ?? null,
      username: userData.username ?? null,
      emailMasked: maskEmail(userData.email),
    },
  });
});

// POST /creator/clients/invite — lookup by email + create client in one step
router.post("/creator/clients/invite", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  // M-12: schema-validate body (was raw req.body read).
  const body = validateBody<{ email: string }>(
    {email: "string"},
    req.body
  );
  if (body.email.length > 256) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Email demasiado largo", "email");
  }

  const query = body.email.trim().toLowerCase();

  // Look up user by email
  let userSnap = await db.collection("users")
    .where("email", "==", query)
    .limit(1)
    .get();

  // Try by username as fallback
  if (userSnap.empty) {
    userSnap = await db.collection("users")
      .where("username", "==", query)
      .limit(1)
      .get();
  }

  if (userSnap.empty) {
    throw new WakeApiServerError("NOT_FOUND", 404, "No se encontró ningún usuario con ese email");
  }

  const userDoc = userSnap.docs[0];
  const userId = userDoc.id;

  // Check if already a client
  const existing = await db.collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .where("clientUserId", "==", userId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const existingDoc = existing.docs[0];
    res.status(200).json({
      data: {
        clientId: existingDoc.id,
        userId,
        alreadyExisted: true,
      },
    });
    return;
  }

  // Security (audit C-10): new invites land in `pending` status. The user
  // must explicitly accept via POST /users/me/client-relationships/:id/accept
  // before the creator gains operational privileges (verifyClientAccess gates
  // on status === 'active' OR field absent — back-compat for legacy rows).
  const invitedUserData = userDoc.data();
  const docRef = await db.collection("one_on_one_clients").add({
    creatorId: auth.userId,
    clientUserId: userId,
    clientName: invitedUserData?.displayName ?? invitedUserData?.name ?? null,
    clientEmail: invitedUserData?.email ?? null,
    courseId: [],
    status: "pending",
    invitedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  res.status(201).json({
    data: {
      clientId: docRef.id,
      userId,
      status: "pending",
    },
  });
});

// POST /creator/clients
router.post("/creator/clients", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const body = validateBody<{ userId: string }>(
    {userId: "string"},
    req.body
  );

  // Verify target user exists
  const userDoc = await db.collection("users").doc(body.userId).get();
  if (!userDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Usuario no encontrado");
  }

  // Idempotent: return existing active record if client already linked to this creator.
  // If only an inactive (prior-leave) record exists, create a new active record and
  // surface previousEnrollmentEndedAt so the dashboard can show the "regresó" pill.
  const existing = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .where("clientUserId", "==", body.userId)
    .orderBy("createdAt", "desc")
    .get();

  const activeExisting = existing.docs.find((d) => {
    const s = (d.data() as Record<string, unknown>).status as string | undefined;
    return !s || s === "active";
  });

  if (activeExisting) {
    res.status(200).json({data: {id: activeExisting.id, clientId: activeExisting.id}});
    return;
  }

  const mostRecentInactive = existing.docs.find((d) => {
    const s = (d.data() as Record<string, unknown>).status as string | undefined;
    return s === "inactive";
  });
  const previousEnrollmentEndedAt = mostRecentInactive ?
    ((mostRecentInactive.data() as Record<string, unknown>).endedAt ?? null) :
    null;

  // Security (audit C-10): pending until target user accepts.
  const targetUserData = userDoc.data();
  const docRef = await db.collection("one_on_one_clients").add({
    creatorId: auth.userId,
    clientUserId: body.userId,
    clientName: targetUserData?.displayName ?? targetUserData?.name ?? null,
    clientEmail: targetUserData?.email ?? null,
    courseId: [],
    status: "pending",
    invitedAt: FieldValue.serverTimestamp(),
    previousEnrollmentEndedAt,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  res.status(201).json({data: {id: docRef.id, clientId: docRef.id, status: "pending"}});
});

// GET /creator/leaves/summary — aggregated counts of clients who left this creator's programs.
// Returns counts by reason category; never returns free text or per-user satisfaction.
router.get("/creator/leaves/summary", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const monthParam = req.query.month as string | undefined;
  const now = new Date();
  let startIso: string;
  let endIso: string;

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [yearStr, monthStr] = monthParam.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    startIso = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    endIso = new Date(Date.UTC(year, month, 1)).toISOString();
  } else {
    startIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    endIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  }

  const snap = await db.collection("program_leave_feedback")
    .where("creatorId", "==", auth.userId)
    .where("leftAt", ">=", new Date(startIso))
    .where("leftAt", "<", new Date(endIso))
    .get();

  const byReason: Record<string, number> = {};
  for (const d of snap.docs) {
    const reason = (d.data().reason as string | undefined) ?? "other";
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  }

  res.json({
    data: {
      total: snap.size,
      byReason,
      periodStart: startIso,
      periodEnd: endIso,
    },
  });
});

// GET /creator/clients/:clientId — single client detail
router.get("/creator/clients/:clientId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const hintUserId = req.query.userId as string | undefined;

  let doc: FirebaseFirestore.DocumentSnapshot;
  let userDoc: FirebaseFirestore.DocumentSnapshot;
  let creatorPrograms: FirebaseFirestore.QuerySnapshot;
  let notesSnap: FirebaseFirestore.QuerySnapshot;

  if (hintUserId) {
    [doc, userDoc, creatorPrograms, notesSnap] = await Promise.all([
      db.collection("one_on_one_clients").doc(req.params.clientId).get(),
      db.collection("users").doc(hintUserId).get(),
      db.collection("courses")
        .where("creator_id", "==", auth.userId)
        .where("deliveryType", "==", "one_on_one")
        .get(),
      db.collection("one_on_one_clients").doc(req.params.clientId)
        .collection("notes").orderBy("createdAt", "desc").limit(50).get(),
    ]);
  } else {
    [doc, creatorPrograms, notesSnap] = await Promise.all([
      db.collection("one_on_one_clients").doc(req.params.clientId).get(),
      db.collection("courses")
        .where("creator_id", "==", auth.userId)
        .where("deliveryType", "==", "one_on_one")
        .get(),
      db.collection("one_on_one_clients").doc(req.params.clientId)
        .collection("notes").orderBy("createdAt", "desc").limit(50).get(),
    ]);
    if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Cliente no encontrado");
    }
    const resolvedUserId = doc.data()!.clientUserId ?? doc.data()!.userId;
    userDoc = await db.collection("users").doc(resolvedUserId).get();
  }
  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Cliente no encontrado");
  }

  const clientData = doc.data()!;

  // C-10 v2: deny full-profile reads while the relationship is pending.
  // Backend gate on every creator-side mutation already blocks state changes
  // via verifyClientAccess; this closes the read path so the creator can't
  // fetch body data, sessions, onboarding answers, etc. for someone who
  // hasn't accepted the invite.
  if (clientData.status === "pending") {
    throw new WakeApiServerError(
      "FORBIDDEN",
      403,
      "El cliente aún no ha aceptado la invitación"
    );
  }

  const userData = userDoc.exists ? userDoc.data()! : {};
  const courses = (userData.courses ?? {}) as Record<string, Record<string, unknown>>;
  const creatorCourseMap = new Map(creatorPrograms.docs.map((d) => [d.id, d.data()]));
  const creatorCourseIds = new Set(creatorPrograms.docs.map((d) => d.id));

  const enrolledPrograms = Object.entries(courses)
    .filter(([courseId]) => creatorCourseIds.has(courseId))
    .map(([courseId, v]) => ({
      courseId,
      title: v.title ?? null,
      status: v.status ?? "active",
      image_url: v.image_url ?? null,
      expires_at: v.expires_at ?? null,
      access_duration: v.access_duration ?? null,
      content_plan_id: creatorCourseMap.get(courseId)?.content_plan_id ?? null,
      planAssignments: v.planAssignments ?? null,
    }));

  const notes = notesSnap.docs.map((d) => ({...d.data(), id: d.id}));

  res.json({
    data: {
      id: doc.id,
      clientId: doc.id,
      ...clientData,
      clientName: userData.displayName ?? userData.name ?? clientData.clientName ?? null,
      clientEmail: userData.email ?? clientData.clientEmail ?? null,
      avatarUrl: userData.profilePictureUrl ?? userData.photoURL ?? null,
      profilePictureUrl: userData.profilePictureUrl ?? userData.photoURL ?? null,
      enrolledPrograms,
      onboardingData: userData.onboardingData ?? null,
      country: userData.country ?? null,
      city: userData.city ?? null,
      gender: userData.gender ?? null,
      email: userData.email ?? clientData.clientEmail ?? null,
      notes,
    },
  });
});

// POST /creator/clients/:clientId/notes — add a note
router.post("/creator/clients/:clientId/notes", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const docRef = db.collection("one_on_one_clients").doc(req.params.clientId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Cliente no encontrado");
  }

  // M-10 + M-39: validateBody enforces string type + non-empty trim;
  // assertTextLength enforces the per-field 2000-char cap.
  const noteBody = validateBody<{ text: string }>(
    {text: "string"},
    req.body
  );
  assertTextLength(noteBody.text, "text", TEXT_CAP_NOTE);
  const text = noteBody.text.trim();

  const noteRef = await docRef.collection("notes").add({
    text,
    createdAt: new Date().toISOString(),
    creatorId: auth.userId,
  });

  res.status(201).json({data: {id: noteRef.id, text, createdAt: new Date().toISOString()}});
});

// DELETE /creator/clients/:clientId/notes/:noteId
router.delete("/creator/clients/:clientId/notes/:noteId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const clientRef = db.collection("one_on_one_clients").doc(req.params.clientId);
  const clientDoc = await clientRef.get();
  if (!clientDoc.exists || clientDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Cliente no encontrado");
  }

  await clientRef.collection("notes").doc(req.params.noteId).delete();
  res.json({data: {deleted: true}});
});

// DELETE /creator/clients/:clientId — remove client
router.delete("/creator/clients/:clientId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const docRef = db.collection("one_on_one_clients").doc(req.params.clientId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Cliente no encontrado");
  }

  await docRef.delete();
  res.status(204).send();
});

// GET /creator/courses — alias for /creator/programs (PWA apiService.getCoursesByCreatorId)
router.get("/creator/courses", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const snapshot = await db
    .collection("courses")
    .where("creator_id", "==", auth.userId)
    .orderBy("created_at", "desc")
    .limit(100)
    .get();

  res.json({
    data: snapshot.docs.map((d) => ({...d.data(), id: d.id})),
  });
});

// GET /creator/programs — paginated
router.get("/creator/programs", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const pageToken = req.query.pageToken as string | undefined;
  const deliveryType = req.query.deliveryType as string | undefined;
  const skipEnrollmentCounts = req.query.skipEnrollmentCounts === "true";
  const limit = 100;

  let query: Query = db
    .collection("courses")
    .where("creator_id", "==", auth.userId)
    .orderBy("created_at", "desc")
    .limit(limit + 1);

  if (deliveryType) {
    query = query.where("deliveryType", "==", deliveryType);
  }

  if (pageToken) {
    const cursor = await db.collection("courses").doc(pageToken).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }

  const enrollmentCounts: Record<string, number> = {};

  if (!skipEnrollmentCounts) {
    // Parallelize courses query and clients query
    const [snapshot, clientsSnap] = await Promise.all([
      query.get(),
      db.collection("one_on_one_clients")
        .where("creatorId", "==", auth.userId)
        .get(),
    ]);
    const docs = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;

    const clientUserIds = clientsSnap.docs.map((d) => (d.data().clientUserId ?? d.data().userId) as string).filter(Boolean);

    // Batch-fetch user docs for course maps (parallel batches)
    const batchSize = 10;
    const batches: string[][] = [];
    for (let i = 0; i < clientUserIds.length; i += batchSize) {
      batches.push(clientUserIds.slice(i, i + batchSize));
    }
    const allBatchResults = await Promise.all(
      batches.map((batch) => db.getAll(...batch.map((uid) => db.collection("users").doc(uid))))
    );
    for (const userDocs of allBatchResults) {
      for (const uDoc of userDocs) {
        if (!uDoc.exists) continue;
        const courses = (uDoc.data()!.courses ?? {}) as Record<string, Record<string, unknown>>;
        for (const [courseId, entry] of Object.entries(courses)) {
          if (entry.status === "active") {
            enrollmentCounts[courseId] = (enrollmentCounts[courseId] ?? 0) + 1;
          }
        }
      }
    }

    const programs = docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        imageUrl: data.image_url ?? null,
        bundleOnly: data.visibility === "bundle-only",
        enrollmentCount: enrollmentCounts[d.id] ?? 0,
      };
    });

    res.json({
      data: programs,
      nextPageToken: hasMore ? docs[docs.length - 1].id : null,
      hasMore,
    });
    return;
  }

  // skipEnrollmentCounts path — just fetch courses
  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  const programs = docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      imageUrl: data.image_url ?? null,
      bundleOnly: data.visibility === "bundle-only",
      enrollmentCount: 0,
    };
  });

  res.json({
    data: programs,
    nextPageToken: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
  });
});

// GET /creator/programs/:programId
router.get("/creator/programs/:programId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const doc = await db.collection("courses").doc(req.params.programId).get();

  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const programData = doc.data()!;
  res.json({data: {
    id: doc.id,
    ...programData,
    imageUrl: programData.image_url ?? null,
    bundleOnly: programData.visibility === "bundle-only",
  }});
});

// POST /creator/programs
router.post("/creator/programs", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  // Only destructure validated fields. availableLibraries / free_trial are
  // declared in the schema so stripUnknown drops anything else, then the
  // shape of each is validated below before being written to Firestore (M-08).
  const body = validateBody<{
    title: string;
    deliveryType: string;
    description?: string;
    weekly?: boolean;
    price?: number;
    access_duration?: string;
    discipline?: string;
    weight_suggestions?: boolean;
    duration?: string;
    visibility?: string;
    availableLibraries?: unknown[];
    free_trial?: Record<string, unknown>;
  }>(
    {
      title: "string",
      deliveryType: "string",
      description: "optional_string",
      weekly: "optional_boolean",
      price: "optional_number",
      access_duration: "optional_string",
      discipline: "optional_string",
      weight_suggestions: "optional_boolean",
      duration: "optional_string",
      visibility: "optional_string",
      availableLibraries: "optional_array",
      free_trial: "optional_object",
    },
    req.body
  );

  if (body.visibility !== undefined && !["standalone", "bundle-only", "both"].includes(body.visibility)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "visibility debe ser standalone, bundle-only o both",
      "visibility"
    );
  }

  // M-24: price (one-time) must be a positive integer (COP, no subunits).
  // Validated here on creator-side write so MP webhooks downstream can trust
  // the field. Skip when undefined — handlers default to free.
  if (body.price !== undefined &&
      (!Number.isInteger(body.price) || body.price < 0)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "price debe ser un entero mayor o igual a 0 (COP, sin decimales)",
      "price"
    );
  }

  // M-08: availableLibraries shape — optional array of non-empty strings.
  const availableLibraries: string[] = Array.isArray(body.availableLibraries) ?
    body.availableLibraries.filter(
      (id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128
    ) :
    [];

  // M-08: free_trial shape — { active: boolean, duration_days: integer 0-365 }.
  let freeTrial: { active: boolean; duration_days: number } = {active: false, duration_days: 0};
  if (body.free_trial !== undefined) {
    const ft = body.free_trial as Record<string, unknown>;
    const active = ft.active === true;
    const rawDays = ft.duration_days;
    let days = 0;
    if (typeof rawDays === "number" && Number.isFinite(rawDays)) {
      days = Math.floor(rawDays);
    } else if (typeof rawDays === "string") {
      const parsed = parseInt(rawDays, 10);
      if (Number.isFinite(parsed)) days = parsed;
    }
    if (days < 0 || days > 365) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        "free_trial.duration_days debe ser un entero entre 0 y 365",
        "free_trial.duration_days"
      );
    }
    freeTrial = {active, duration_days: days};
  }

  const userDoc = await db.collection("users").doc(auth.userId).get();
  const creatorName = userDoc.data()?.displayName || userDoc.data()?.name || "";

  const versionStr = `${new Date().getFullYear()}-01`;
  const docRef = await db.collection("courses").add({
    title: body.title,
    deliveryType: body.deliveryType,
    visibility: body.visibility ?? "both",
    ...(body.description !== undefined && {description: body.description}),
    ...(body.weekly !== undefined && {weekly: body.weekly}),
    ...(body.price !== undefined && {price: body.price}),
    ...(body.access_duration !== undefined && {access_duration: body.access_duration}),
    ...(body.discipline !== undefined && {discipline: body.discipline}),
    ...(body.weight_suggestions !== undefined && {weight_suggestions: body.weight_suggestions}),
    ...(body.duration !== undefined && {duration: body.duration}),
    availableLibraries,
    creator_id: auth.userId,
    creatorName,
    status: "draft",
    image_url: null,
    image_path: null,
    video_intro_url: null,
    content_plan_id: null,
    tutorials: {
      dailyWorkout: [],
      workoutCompletion: [],
      workoutExecution: [],
    },
    free_trial: freeTrial,
    version: versionStr,
    published_version: versionStr,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    last_update: FieldValue.serverTimestamp(),
  });

  res.status(201).json({data: {id: docRef.id}});
});

// PATCH /creator/programs/:programId
router.patch("/creator/programs/:programId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const docRef = db.collection("courses").doc(req.params.programId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  // Allowlist fields — never allow creator_id, status overwrite
  const allowedFields = [
    "title", "description", "deliveryType", "weekly", "price", "subscription_price",
    "access_duration", "discipline", "image_url", "image_path",
    "creatorName", "weight_suggestions", "free_trial", "duration",
    "video_intro_url", "tutorials", "availableLibraries", "content_plan_id",
    "compare_at_price", "visibility", "bundleOnly",
  ];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  // Normalize bundleOnly → visibility for storage.
  if (updates.bundleOnly !== undefined) {
    if (typeof updates.bundleOnly !== "boolean") {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400, "bundleOnly debe ser boolean", "bundleOnly",
      );
    }
    updates.visibility = updates.bundleOnly ? "bundle-only" : "both";
    delete updates.bundleOnly;
  }

  if (updates.visibility !== undefined &&
      !["standalone", "bundle-only", "both"].includes(updates.visibility as string)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "visibility debe ser standalone, bundle-only o both",
      "visibility"
    );
  }

  // M-24: currency fields must be non-negative integers (COP, no subunits).
  for (const priceField of ["price", "subscription_price", "compare_at_price"] as const) {
    const v = updates[priceField];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `${priceField} debe ser un entero mayor o igual a 0 (COP, sin decimales)`,
        priceField
      );
    }
  }

  await docRef.update({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
    last_update: FieldValue.serverTimestamp(),
  });

  // Sync updated fields to enrolled users' course entries
  const syncFields: Record<string, string> = {image_url: "image_url", title: "title"};
  const userUpdates: Record<string, unknown> = {};
  for (const [field, courseField] of Object.entries(syncFields)) {
    if (updates[field] !== undefined) {
      userUpdates[`courses.${req.params.programId}.${courseField}`] = updates[field];
    }
  }
  if (Object.keys(userUpdates).length > 0) {
    const enrolledUsers = await db
      .collection("users")
      .where(`courses.${req.params.programId}.status`, "==", "active")
      .limit(200)
      .get();
    const batch = db.batch();
    for (const userDoc of enrolledUsers.docs) {
      batch.update(userDoc.ref, userUpdates);
    }
    if (!enrolledUsers.empty) {
      await batch.commit();
    }
  }

  res.json({data: {updated: true}});
});

// PATCH /creator/programs/:programId/status
router.patch("/creator/programs/:programId/status", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const {status} = validateBody<{ status: string }>(
    {status: "string"},
    req.body
  );

  // Validate status against allowlist
  const allowedStatuses = ["draft", "published", "active", "archived"];
  if (!allowedStatuses.includes(status)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      `Estado inválido. Valores permitidos: ${allowedStatuses.join(", ")}`,
      "status"
    );
  }

  const docRef = db.collection("courses").doc(req.params.programId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  await docRef.update({
    status,
    updated_at: FieldValue.serverTimestamp(),
    last_update: FieldValue.serverTimestamp(),
  });

  res.json({data: {status}});
});

// DELETE /creator/programs/:programId
router.delete("/creator/programs/:programId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const docRef = db.collection("courses").doc(req.params.programId);
  const doc = await docRef.get();

  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  // Cascade delete: breadth-first parallel reads, then batch delete
  const modulesSnap = await docRef.collection("modules").get();
  const sessionSnaps = await Promise.all(
    modulesSnap.docs.map((m) => m.ref.collection("sessions").get())
  );
  const allSessions = sessionSnaps.flatMap((s) => s.docs);
  const exerciseSnaps = await Promise.all(
    allSessions.map((s) => s.ref.collection("exercises").get())
  );
  const allExercises = exerciseSnaps.flatMap((e) => e.docs);
  const setSnaps = await Promise.all(
    allExercises.map((e) => e.ref.collection("sets").get())
  );
  const allSets = setSnaps.flatMap((s) => s.docs);

  let batch = db.batch();
  let count = 0;
  for (const d of [...allSets, ...allExercises, ...allSessions, ...modulesSnap.docs]) {
    batch.delete(d.ref);
    count++;
    if (count >= 450) {
      await batch.commit(); batch = db.batch(); count = 0;
    }
  }
  batch.delete(docRef);
  await batch.commit();
  res.status(204).send();
});

// POST /creator/programs/:programId/duplicate
router.post("/creator/programs/:programId/duplicate", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const sourceDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!sourceDoc.exists || sourceDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const sourceData = sourceDoc.data()!;
  const newDoc = await db.collection("courses").add({
    ...sourceData,
    title: `${sourceData.title} (copia)`,
    status: "draft",
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  // Deep copy subcollections: modules → sessions → exercises → sets
  const sourceRef = db.collection("courses").doc(req.params.programId);
  const newRef = db.collection("courses").doc(newDoc.id);
  const modulesSnap = await sourceRef.collection("modules").get();
  let batch = db.batch();
  let count = 0;

  for (const mDoc of modulesSnap.docs) {
    const newModRef = newRef.collection("modules").doc();
    batch.set(newModRef, {...mDoc.data(), id: newModRef.id, created_at: FieldValue.serverTimestamp()});
    count++;
    if (count >= 450) {
      await batch.commit(); batch = db.batch(); count = 0;
    }

    const sessionsSnap = await mDoc.ref.collection("sessions").get();
    for (const sDoc of sessionsSnap.docs) {
      const newSessRef = newModRef.collection("sessions").doc();
      batch.set(newSessRef, {...sDoc.data(), id: newSessRef.id, created_at: FieldValue.serverTimestamp()});
      count++;
      if (count >= 450) {
        await batch.commit(); batch = db.batch(); count = 0;
      }

      const exSnap = await sDoc.ref.collection("exercises").get();
      for (const eDoc of exSnap.docs) {
        const newExRef = newSessRef.collection("exercises").doc();
        batch.set(newExRef, {...eDoc.data(), id: newExRef.id, created_at: FieldValue.serverTimestamp()});
        count++;
        if (count >= 450) {
          await batch.commit(); batch = db.batch(); count = 0;
        }

        const setsSnap = await eDoc.ref.collection("sets").get();
        for (const setDoc of setsSnap.docs) {
          const newSetRef = newExRef.collection("sets").doc();
          batch.set(newSetRef, {...setDoc.data(), id: newSetRef.id, created_at: FieldValue.serverTimestamp()});
          count++;
          if (count >= 450) {
            await batch.commit(); batch = db.batch(); count = 0;
          }
        }
      }
    }
  }
  if (count > 0) await batch.commit();

  res.status(201).json({data: {id: newDoc.id}});
});

// POST /creator/programs/:programId/image/upload-url
router.post("/creator/programs/:programId/image/upload-url", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const {contentType} = validateBody<{ contentType: string }>(
    {contentType: "string"},
    req.body
  );

  // L-15: contentType allowlist matches sibling upload endpoints (creator
  // bookings cover image, profile picture). Without this, a creator could
  // upload an arbitrary mime type into the courses/ namespace.
  const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedImageTypes.includes(contentType)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Tipo de archivo no soportado",
      "contentType"
    );
  }

  const storagePath = `courses/${req.params.programId}/image.${contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1]}`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  res.json({data: {uploadUrl: url, storagePath}});
});

// POST /creator/programs/:programId/image/confirm
router.post("/creator/programs/:programId/image/confirm", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const {storagePath} = validateBody<{ storagePath: string }>(
    {storagePath: "string"},
    req.body
  );

  // CRITICAL: Validate storage path prefix to prevent path traversal
  validateStoragePath(storagePath, `courses/${req.params.programId}/`);

  const bucket = admin.storage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado");
  }

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

  await db.collection("courses").doc(req.params.programId).update({
    image_url: publicUrl,
    image_path: storagePath,
    updated_at: FieldValue.serverTimestamp(),
  });

  // Sync image_url to all enrolled users' course entries
  const enrolledUsers = await db
    .collection("users")
    .where(`courses.${req.params.programId}.status`, "==", "active")
    .limit(200)
    .get();

  const batch = db.batch();
  for (const userDoc of enrolledUsers.docs) {
    batch.update(userDoc.ref, {
      [`courses.${req.params.programId}.image_url`]: publicUrl,
    });
  }
  if (!enrolledUsers.empty) {
    await batch.commit();
  }

  res.json({data: {image_url: publicUrl, image_path: storagePath}});
});

// GET /creator/clients/:clientId/sessions
router.get("/creator/clients/:clientId/sessions", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  // Optional ?sessionId=X filter — used by SessionPerformanceModal to find a single
  // history doc matching a planned slot.
  const sessionIdFilter = req.query.sessionId as string | undefined;
  const courseIdFilter = req.query.courseId as string | undefined;

  // Audit M-44: a shared client (enrolled with multiple creators) accumulates
  // sessionHistory across all programs. Restrict the result set to programs
  // owned by this caller so creator A can't read creator B's workout data.
  const ownedCourseIds = await loadCreatorOwnedCourseIds(db, auth.userId);
  if (courseIdFilter && !ownedCourseIds.has(courseIdFilter)) {
    res.json({data: []});
    return;
  }

  let q: Query = db
    .collection("users")
    .doc(req.params.clientId)
    .collection("sessionHistory");

  if (sessionIdFilter) {
    q = q.where("sessionId", "==", sessionIdFilter);
  }
  if (courseIdFilter) {
    q = q.where("courseId", "==", courseIdFilter);
  }
  q = q.orderBy("completed_at", "desc").limit(50);

  const snapshot = await q.get();
  const filtered = snapshot.docs
    .filter((d) => {
      const cid = d.data().courseId;
      // Drop sessions whose courseId is missing or owned by another creator.
      return typeof cid === "string" && ownedCourseIds.has(cid);
    })
    .slice(0, 20);

  res.json({
    data: filtered.map((d) => ({...d.data(), id: d.id})),
  });
});

// GET /creator/clients/:clientId/activity
router.get("/creator/clients/:clientId/activity", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const clientDoc = await db.collection("one_on_one_clients").doc(req.params.clientId).get();
  if (!clientDoc.exists || clientDoc.data()?.creatorId !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Cliente no encontrado");
  }

  const clientUserId = clientDoc.data()!.clientUserId ?? clientDoc.data()!.userId;
  const userDoc = await db.collection("users").doc(clientUserId).get();
  const userData = userDoc.data() ?? {};

  res.json({
    data: {
      lastSessionDate: userData.lastSessionDate ?? null,
      currentStreak: userData.currentStreak ?? 0,
      courses: userData.courses ?? {},
    },
  });
});

// ─── Instagram Feed (Behold.so) ───────────────────────────────────────────

const instagramCache: Record<string, { data: unknown; expiresAt: number }> = {};
const INSTAGRAM_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// GET /creator/instagram-feed
router.get("/creator/instagram-feed", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const beholdFeedId = auth.userData?.beholdFeedId as string | undefined;

  if (!beholdFeedId || typeof beholdFeedId !== "string") {
    throw new WakeApiServerError(
      "NOT_FOUND", 404, "No se encontró un feed de Instagram configurado"
    );
  }

  // Check in-memory cache
  const cached = instagramCache[auth.userId];
  if (cached && cached.expiresAt > Date.now()) {
    res.json({data: cached.data});
    return;
  }

  const feedUrl = `https://feeds.behold.so/${encodeURIComponent(beholdFeedId)}`;
  const response = await fetch(feedUrl);

  if (!response.ok) {
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503, "No se pudo obtener el feed de Instagram"
    );
  }

  const feedData = await response.json();

  instagramCache[auth.userId] = {
    data: feedData,
    expiresAt: Date.now() + INSTAGRAM_CACHE_TTL,
  };

  res.json({data: feedData});
});

// ─── Creator Nutrition Library ─────────────────────────────────────────────

/** Builds a client_nutrition_plan_content document from library plan data. */
function buildNutritionContentDoc(
  planData: Record<string, unknown>,
  assignmentId: string,
  sourcePlanId: string,
  isRefresh: boolean
): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    source_plan_id: sourcePlanId,
    assignment_id: assignmentId,
    name: planData.name ?? "",
    description: planData.description ?? "",
    daily_calories: planData.daily_calories ?? null,
    daily_protein_g: planData.daily_protein_g ?? null,
    daily_carbs_g: planData.daily_carbs_g ?? null,
    daily_fat_g: planData.daily_fat_g ?? null,
    categories: planData.categories ?? [],
  };
  if (isRefresh) {
    doc.refreshed_at = FieldValue.serverTimestamp();
  } else {
    doc.snapshot_at = FieldValue.serverTimestamp();
  }
  return doc;
}

/** Returns true if assignment status is active or missing (production compat). */
function isActiveAssignment(data: Record<string, unknown>): boolean {
  const s = data.status;
  return !s || s === "active";
}

// GET /creator/nutrition/meals
router.get("/creator/nutrition/meals", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const snapshot = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("meals")
    .orderBy("created_at", "desc")
    .get();

  res.json({
    data: snapshot.docs.map((d) => ({id: d.id, mealId: d.id, ...d.data()})),
  });
});

// GET /creator/nutrition/meals/:mealId
router.get("/creator/nutrition/meals/:mealId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const doc = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("meals")
    .doc(req.params.mealId)
    .get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Comida no encontrada");
  }

  res.json({data: {id: doc.id, mealId: doc.id, ...doc.data()}});
});

// POST /creator/nutrition/meals
router.post("/creator/nutrition/meals", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  // Validate and allowlist meal fields
  const body = validateBody<{
    name: string;
    description?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    items?: unknown[];
    category?: string;
    video_url?: string;
    video_source?: string;
  }>(
    {
      name: "string",
      description: "optional_string",
      calories: "optional_number",
      protein: "optional_number",
      carbs: "optional_number",
      fat: "optional_number",
      items: "optional_array",
      category: "optional_string",
      video_url: "optional_string",
      video_source: "optional_string",
    },
    req.body
  );

  const docRef = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("meals")
    .add({
      ...body,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({data: {id: docRef.id, mealId: docRef.id}});
});

// PATCH /creator/nutrition/meals/:mealId
router.patch("/creator/nutrition/meals/:mealId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const docRef = db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("meals")
    .doc(req.params.mealId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Comida no encontrada");
  }

  // Allowlist meal fields
  const allowedFields = ["name", "description", "calories", "protein", "carbs", "fat", "items", "category", "video_url", "video_source"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await docRef.update({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {updated: true}});
});

// DELETE /creator/nutrition/meals/:mealId
router.delete("/creator/nutrition/meals/:mealId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const docRef = db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("meals")
    .doc(req.params.mealId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Comida no encontrada");
  }

  await docRef.delete();
  res.status(204).send();
});

// GET /creator/nutrition/plans
router.get("/creator/nutrition/plans", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const snapshot = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .get();

  const plans = snapshot.docs.map((d) => ({id: d.id, planId: d.id, ...d.data()}));
  plans.sort((a, b) => {
    const tA = (a as Record<string, unknown>).created_at ?? (a as Record<string, unknown>).createdAt;
    const tB = (b as Record<string, unknown>).created_at ?? (b as Record<string, unknown>).createdAt;
    const msA = tA && typeof (tA as { toMillis?: () => number }).toMillis === "function" ? (tA as { toMillis: () => number }).toMillis() : 0;
    const msB = tB && typeof (tB as { toMillis?: () => number }).toMillis === "function" ? (tB as { toMillis: () => number }).toMillis() : 0;
    return msB - msA;
  });

  res.json({data: plans});
});

// POST /creator/nutrition/plans
router.post("/creator/nutrition/plans", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  // Validate and allowlist plan fields (snake_case to match Firestore schema)
  const body = validateBody<{
    name: string;
    description?: string;
    daily_calories?: number;
    daily_protein_g?: number;
    daily_carbs_g?: number;
    daily_fat_g?: number;
    categories?: unknown[];
  }>(
    {
      name: "string",
      description: "optional_string",
      daily_calories: "optional_number",
      daily_protein_g: "optional_number",
      daily_carbs_g: "optional_number",
      daily_fat_g: "optional_number",
      categories: "optional_array",
    },
    req.body
  );

  const docRef = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .add({
      ...body,
      creatorId: auth.userId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({data: {id: docRef.id, planId: docRef.id}});
});

// GET /creator/nutrition/plans/:planId
router.get("/creator/nutrition/plans/:planId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const doc = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(req.params.planId)
    .get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  res.json({data: {id: doc.id, planId: doc.id, ...doc.data()}});
});

// PATCH /creator/nutrition/plans/:planId
router.patch("/creator/nutrition/plans/:planId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const docRef = db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(req.params.planId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const allowedFields = ["name", "description", "daily_calories", "daily_protein_g", "daily_carbs_g", "daily_fat_g", "categories"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await docRef.update({
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {updated: true}});
});

// DELETE /creator/nutrition/plans/:planId
router.delete("/creator/nutrition/plans/:planId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const docRef = db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(req.params.planId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  // Block deletion if active assignments exist
  const assignSnap = await db
    .collection("nutrition_assignments")
    .where("planId", "==", req.params.planId)
    .where("assignedBy", "==", auth.userId)
    .limit(50)
    .get();

  const hasActive = assignSnap.docs.some((d) => isActiveAssignment(d.data()));
  if (hasActive) {
    throw new WakeApiServerError(
      "CONFLICT", 409,
      "No puedes eliminar un plan con asignaciones activas. Desasigna los clientes primero."
    );
  }

  // Clean up orphaned content docs from inactive assignments
  if (!assignSnap.empty) {
    const cleanBatch = db.batch();
    for (const assignDoc of assignSnap.docs) {
      cleanBatch.delete(db.collection("client_nutrition_plan_content").doc(assignDoc.id));
    }
    await cleanBatch.commit();
  }

  await docRef.delete();
  res.status(204).send();
});

// POST /creator/nutrition/plans/:planId/propagate
router.post("/creator/nutrition/plans/:planId/propagate", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(req.params.planId)
    .get();

  if (!planDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const planData = planDoc.data()!;
  const assignmentsSnap = await db
    .collection("nutrition_assignments")
    .where("planId", "==", req.params.planId)
    .where("assignedBy", "==", auth.userId)
    .get();

  // Filter to active-or-no-status (production docs may lack status field)
  const activeDocs = assignmentsSnap.docs.filter((d) => isActiveAssignment(d.data()));
  const skippedInactive = assignmentsSnap.size - activeDocs.length;

  // 2 ops per assignment: content set + assignment update
  const batchSize = 225;
  let clientsAffected = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const assignDoc of activeDocs) {
    const contentRef = db.collection("client_nutrition_plan_content").doc(assignDoc.id);
    batch.set(contentRef, clientNutritionPlanContentPayload(
      {creator_id: auth.userId, client_id: (assignDoc.data().userId as string | undefined) ?? null},
      buildNutritionContentDoc(planData, assignDoc.id, req.params.planId, true)
    ));

    // Keep assignment's embedded snapshot and planName in sync
    batch.update(assignDoc.ref, {
      planName: planData.name ?? "",
      plan: planData,
      updatedAt: FieldValue.serverTimestamp(),
    });

    clientsAffected++;
    batchCount++;
    if (batchCount >= batchSize) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();

  res.json({data: {clientsAffected, skippedInactive}});
});

// ─── Client Nutrition Assignments ─────────────────────────────────────────

// Helper to verify creator-client relationship.
// Security (audit C-10): only treats relationships with status `active` (or
// missing — back-compat for legacy rows) as authorizing access. Pending
// relationships exist but do not grant the creator privileges over the user.
async function verifyClientAccess(
  creatorId: string,
  clientId: string
): Promise<string> {
  const snap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", creatorId)
    .where("clientUserId", "==", clientId)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este cliente");
  }
  const status = snap.docs[0].data().status;
  if (status && status !== "active") {
    throw new WakeApiServerError(
      "FORBIDDEN",
      403,
      "El cliente aún no ha aceptado la invitación"
    );
  }
  return clientId;
}

// All writes to `client_sessions` must go through this helper. The required
// creator_id / client_id parameters make it impossible to forget the
// ownership fields the rules + API checks depend on. (See the 2026-04-28
// incident: 151 legacy docs with creator_id=undefined caused every DELETE
// from creators to 404.)
async function writeClientSession(
  clientSessionId: string,
  fields: {
    creator_id: string;
    client_id: string;
    [key: string]: unknown;
  }
): Promise<void> {
  if (!fields.creator_id) throw new Error("writeClientSession: creator_id is required");
  if (!fields.client_id) throw new Error("writeClientSession: client_id is required");
  await db.collection("client_sessions").doc(clientSessionId).set({
    ...fields,
    updated_at: FieldValue.serverTimestamp(),
  });
}

// Ownership-field payload builders for the other collections that bit us in
// the 2026-04-29 audit (76 client_plan_content, 13 nutrition_assignments,
// 12 client_nutrition_plan_content docs missing ownership fields). Same
// motivation as writeClientSession above: every API handler that mutates
// these collections gates on creator_id (sometimes plus client_id /
// clientUserId), so a `.set()` without those fields strands the doc as a
// "creator can't touch this" zombie.
//
// These build the payload (instead of doing the write themselves) because
// the call sites need to dispatch through tx/batch as well as direct
// `.set()`. The required `ownership` parameter is what makes it impossible
// for a future write path to omit the fields.
//
// The ownership types use `string | null` for the client side because the
// same collections legitimately hold program-scoped templates (id starts
// with "program_") that have no specific client. Pass `null` explicitly to
// document the intent at every call site.

type ClientPlanContentOwnership = {
  creator_id: string;
  client_id: string | null; // null only for program-scoped templates
};

function clientPlanContentPayload(
  ownership: ClientPlanContentOwnership,
  fields: Record<string, unknown>
): Record<string, unknown> {
  if (!ownership.creator_id) throw new Error("clientPlanContentPayload: creator_id is required");
  return {
    ...fields,
    creator_id: ownership.creator_id,
    client_id: ownership.client_id,
  };
}

type NutritionAssignmentOwnership = {
  creator_id: string;
  clientUserId: string | null; // null only for program-scoped templates
};

function nutritionAssignmentPayload(
  ownership: NutritionAssignmentOwnership,
  fields: Record<string, unknown>
): Record<string, unknown> {
  if (!ownership.creator_id) throw new Error("nutritionAssignmentPayload: creator_id is required");
  return {
    ...fields,
    creator_id: ownership.creator_id,
    clientUserId: ownership.clientUserId,
  };
}

type ClientNutritionPlanContentOwnership = {
  creator_id: string;
  client_id: string | null; // null only for program-scoped templates
};

function clientNutritionPlanContentPayload(
  ownership: ClientNutritionPlanContentOwnership,
  fields: Record<string, unknown>
): Record<string, unknown> {
  if (!ownership.creator_id) throw new Error("clientNutritionPlanContentPayload: creator_id is required");
  return {
    ...fields,
    creator_id: ownership.creator_id,
    client_id: ownership.client_id,
  };
}

// Security (audit C-02 / H-12 / H-13): verify a client_session doc belongs
// to the calling creator. Protects content endpoints whose URL key is the
// session id (same id used for client_session_content).
async function verifyClientSessionOwnership(
  creatorId: string,
  clientSessionId: string,
  options: {requireExists?: boolean} = {requireExists: true}
): Promise<void> {
  const sessionDoc = await db.collection("client_sessions").doc(clientSessionId).get();
  if (!sessionDoc.exists) {
    if (options.requireExists) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
    }
    return;
  }
  if (sessionDoc.data()?.creator_id !== creatorId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a esta sesión");
  }
}

// GET /creator/clients/:clientId/nutrition/assignments
router.get("/creator/clients/:clientId/nutrition/assignments", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  // Parallelize access check and assignments query (independent)
  const [, snap] = await Promise.all([
    verifyClientAccess(auth.userId, req.params.clientId),
    db.collection("nutrition_assignments")
      .where("userId", "==", req.params.clientId)
      .where("assignedBy", "==", auth.userId)
      .orderBy("createdAt", "desc")
      .get(),
  ]);

  res.json({data: snap.docs.map((d) => ({id: d.id, assignmentId: d.id, ...d.data()}))});
});

// POST /creator/clients/:clientId/nutrition/assignments
router.post("/creator/clients/:clientId/nutrition/assignments", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const body = validateBody<{ planId: string; startDate?: string; endDate?: string }>(
    {planId: "string", startDate: "optional_string", endDate: "optional_string"},
    req.body
  );

  const planDoc = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(body.planId)
    .get();

  if (!planDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const planData = planDoc.data()!;

  // Use transaction for atomicity: assignment + content snapshot + optional pin
  const assignmentId = await db.runTransaction(async (tx) => {
    // All reads first (Firestore requirement)
    const userRef = db.collection("users").doc(req.params.clientId);
    const userDoc = await tx.get(userRef);

    const assignmentRef = db.collection("nutrition_assignments").doc();
    tx.set(assignmentRef, nutritionAssignmentPayload(
      {creator_id: auth.userId, clientUserId: req.params.clientId},
      {
        userId: req.params.clientId,
        assignedBy: auth.userId,
        planId: body.planId,
        planName: planData.name ?? "",
        plan: planData,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
      }
    ));

    // Snapshot plan content
    tx.set(
      db.collection("client_nutrition_plan_content").doc(assignmentRef.id),
      clientNutritionPlanContentPayload(
        {creator_id: auth.userId, client_id: req.params.clientId},
        buildNutritionContentDoc(planData, assignmentRef.id, body.planId, false)
      )
    );

    // Pin on user if no existing pinned assignment
    if (!userDoc.data()?.pinnedNutritionAssignmentId) {
      tx.update(userRef, {pinnedNutritionAssignmentId: assignmentRef.id});
    }

    return assignmentRef.id;
  });

  res.status(201).json({data: {assignmentId}});
});

// PATCH /creator/clients/:clientId/nutrition/assignments/:assignmentId
router.patch("/creator/clients/:clientId/nutrition/assignments/:assignmentId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const assignRef = db.collection("nutrition_assignments").doc(req.params.assignmentId);
  const assignDoc = await assignRef.get();
  if (!assignDoc.exists || assignDoc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignación no encontrada");
  }

  const allowedFields = ["status", "startDate", "endDate", "planId", "planName"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  // If status is provided, validate it
  if (updates.status !== undefined) {
    const allowedStatuses = ["active", "paused", "completed"];
    if (!allowedStatuses.includes(updates.status as string)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `Estado inválido. Valores permitidos: ${allowedStatuses.join(", ")}`,
        "status"
      );
    }
  }

  // If planId is changing, re-snapshot the new plan into client_nutrition_plan_content
  const currentPlanId = assignDoc.data()?.planId;
  if (updates.planId && updates.planId !== currentPlanId) {
    const newPlanDoc = await db
      .collection("creator_nutrition_library")
      .doc(auth.userId)
      .collection("plans")
      .doc(updates.planId as string)
      .get();

    if (!newPlanDoc.exists) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
    }

    const newPlanData = newPlanDoc.data()!;
    const batch = db.batch();
    batch.update(assignRef, {
      ...updates,
      planName: newPlanData.name ?? "",
      plan: newPlanData,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(
      db.collection("client_nutrition_plan_content").doc(req.params.assignmentId),
      clientNutritionPlanContentPayload(
        {creator_id: auth.userId, client_id: req.params.clientId},
        buildNutritionContentDoc(newPlanData, req.params.assignmentId, updates.planId as string, false)
      )
    );
    await batch.commit();
  } else {
    await assignRef.update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  res.json({data: {updated: true}});
});

// DELETE /creator/clients/:clientId/nutrition/assignments/:assignmentId
router.delete("/creator/clients/:clientId/nutrition/assignments/:assignmentId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const assignRef = db.collection("nutrition_assignments").doc(req.params.assignmentId);
  const assignDoc = await assignRef.get();
  if (!assignDoc.exists || assignDoc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignación no encontrada");
  }

  const batch = db.batch();
  batch.delete(assignRef);
  batch.delete(db.collection("client_nutrition_plan_content").doc(req.params.assignmentId));
  await batch.commit();

  res.status(204).send();
});

// GET /creator/clients/:clientId/nutrition/assignments/:assignmentId/content
router.get("/creator/clients/:clientId/nutrition/assignments/:assignmentId/content", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const assignDoc = await db.collection("nutrition_assignments").doc(req.params.assignmentId).get();
  if (!assignDoc.exists || assignDoc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignación no encontrada");
  }

  const contentDoc = await db.collection("client_nutrition_plan_content").doc(req.params.assignmentId).get();
  if (!contentDoc.exists) {
    res.json({data: null});
    return;
  }

  res.json({data: contentDoc.data()});
});

// PUT /creator/clients/:clientId/nutrition/assignments/:assignmentId/content
router.put("/creator/clients/:clientId/nutrition/assignments/:assignmentId/content", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const assignDoc = await db.collection("nutrition_assignments").doc(req.params.assignmentId).get();
  if (!assignDoc.exists || assignDoc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignación no encontrada");
  }

  // Security (audit C-05): explicit schema with tight caps. Previously read
  // raw body with no validateBody, allowing 1MB blob writes per assignment.
  const body = validateNutritionContentBody(req.body);
  const macros = {
    daily_calories: body.daily_calories ?? null,
    daily_protein_g: body.daily_protein_g ?? null,
    daily_carbs_g: body.daily_carbs_g ?? null,
    daily_fat_g: body.daily_fat_g ?? null,
  };

  const batch = db.batch();
  batch.set(
    db.collection("client_nutrition_plan_content").doc(req.params.assignmentId),
    clientNutritionPlanContentPayload(
      {creator_id: auth.userId, client_id: req.params.clientId},
      {
        source_plan_id: body.source_plan_id ?? null,
        assignment_id: req.params.assignmentId,
        name: body.name ?? "",
        description: body.description ?? "",
        ...macros,
        categories: body.categories ?? [],
        updated_at: FieldValue.serverTimestamp(),
      }
    )
  );
  batch.update(db.collection("nutrition_assignments").doc(req.params.assignmentId), {
    ...macros,
    "plan.daily_calories": macros.daily_calories,
    "plan.daily_protein_g": macros.daily_protein_g,
    "plan.daily_carbs_g": macros.daily_carbs_g,
    "plan.daily_fat_g": macros.daily_fat_g,
    "planName": body.name ?? assignDoc.data()?.planName ?? "",
    "updated_at": FieldValue.serverTimestamp(),
  });
  await batch.commit();

  res.json({data: {updated: true}});
});

// PUT /creator/nutrition/assignments/:assignmentId/content — update without clientId (for program assignments)
router.put("/creator/nutrition/assignments/:assignmentId/content", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const assignDoc = await db.collection("nutrition_assignments").doc(req.params.assignmentId).get();
  if (!assignDoc.exists || assignDoc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignacion no encontrada");
  }

  // Security (audit C-05): same schema enforcement as the clients-side variant.
  const body = validateNutritionContentBody(req.body);
  const macros2 = {
    daily_calories: body.daily_calories ?? null,
    daily_protein_g: body.daily_protein_g ?? null,
    daily_carbs_g: body.daily_carbs_g ?? null,
    daily_fat_g: body.daily_fat_g ?? null,
  };

  const batch2 = db.batch();
  // Program-scoped variant: no clientId in URL — pass client_id: null explicitly.
  batch2.set(
    db.collection("client_nutrition_plan_content").doc(req.params.assignmentId),
    clientNutritionPlanContentPayload(
      {creator_id: auth.userId, client_id: null},
      {
        source_plan_id: body.source_plan_id ?? null,
        assignment_id: req.params.assignmentId,
        name: body.name ?? "",
        description: body.description ?? "",
        ...macros2,
        categories: body.categories ?? [],
        updated_at: FieldValue.serverTimestamp(),
      }
    )
  );
  batch2.update(db.collection("nutrition_assignments").doc(req.params.assignmentId), {
    ...macros2,
    "plan.daily_calories": macros2.daily_calories,
    "plan.daily_protein_g": macros2.daily_protein_g,
    "plan.daily_carbs_g": macros2.daily_carbs_g,
    "plan.daily_fat_g": macros2.daily_fat_g,
    "planName": body.name ?? assignDoc.data()?.planName ?? "",
    "updated_at": FieldValue.serverTimestamp(),
  });
  await batch2.commit();

  res.json({data: {updated: true}});
});

// GET /creator/nutrition/assignments/:assignmentId/content — read without clientId (for program assignments)
router.get("/creator/nutrition/assignments/:assignmentId/content", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const assignDoc = await db.collection("nutrition_assignments").doc(req.params.assignmentId).get();
  if (!assignDoc.exists || assignDoc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignacion no encontrada");
  }

  const contentDoc = await db.collection("client_nutrition_plan_content").doc(req.params.assignmentId).get();
  if (!contentDoc.exists) {
    res.json({data: null});
    return;
  }

  res.json({data: contentDoc.data()});
});

// GET /creator/nutrition/assignments — list all assignments for this creator
router.get("/creator/nutrition/assignments", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const snap = await db
    .collection("nutrition_assignments")
    .where("assignedBy", "==", auth.userId)
    .orderBy("createdAt", "desc")
    .get();

  const assignments = snap.docs.map((d) => ({
    id: d.id,
    assignmentId: d.id,
    ...d.data(),
  }));

  res.json({data: assignments});
});

// GET /creator/nutrition/assignments/:assignmentId
router.get("/creator/nutrition/assignments/:assignmentId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const doc = await db.collection("nutrition_assignments").doc(req.params.assignmentId).get();
  if (!doc.exists || doc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignación no encontrada");
  }

  res.json({data: {id: doc.id, assignmentId: doc.id, ...doc.data()}});
});

// GET /creator/nutrition/assignments-by-plan?sourcePlanId=...
router.get("/creator/nutrition/assignments-by-plan", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const sourcePlanId = req.query.sourcePlanId as string;
  if (!sourcePlanId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "sourcePlanId es requerido", "sourcePlanId");
  }

  const snap = await db
    .collection("nutrition_assignments")
    .where("planId", "==", sourcePlanId)
    .where("assignedBy", "==", auth.userId)
    .get();

  res.json({data: snap.docs.map((d) => ({id: d.id, assignmentId: d.id, ...d.data()}))});
});

// ─── Creator Feedback ─────────────────────────────────────────────────────

// POST /creator/feedback/upload-url
router.post("/creator/feedback/upload-url", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req, 10);
  requireCreator(auth);

  const {filename, contentType} = validateBody<{ filename: string; contentType: string }>(
    {filename: "string", contentType: "string"},
    req.body
  );

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(contentType)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Tipo de archivo no soportado", "contentType");
  }

  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const storagePath = `creator_feedback/${auth.userId}/${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}.${ext}`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  res.json({data: {uploadUrl: url, storagePath}});
});

// POST /creator/feedback
router.post("/creator/feedback", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req, 20);
  requireCreator(auth);

  const body = validateBody<{
    type: string;
    text: string;
    storagePath?: string;
    creatorEmail?: string;
    creatorDisplayName?: string;
  }>(
    {
      type: "string",
      text: "string",
      storagePath: "optional_string",
      creatorEmail: "optional_string",
      creatorDisplayName: "optional_string",
    },
    req.body
  );

  // Audit M-13: type allowlist + text length cap.
  const ALLOWED_FEEDBACK_TYPES = new Set(["bug", "suggestion", "praise", "other"]);
  if (!ALLOWED_FEEDBACK_TYPES.has(body.type)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      `type debe ser uno de: ${[...ALLOWED_FEEDBACK_TYPES].join(", ")}`,
      "type"
    );
  }
  assertTextLength(body.text, "text", TEXT_CAP_DESCRIPTION);

  const docRef = await db.collection("creator_feedback").add({
    creatorId: auth.userId,
    type: body.type,
    text: body.text,
    storagePath: body.storagePath ?? null,
    creatorEmail: body.creatorEmail ?? null,
    creatorDisplayName: body.creatorDisplayName ?? null,
    created_at: FieldValue.serverTimestamp(),
  });

  res.status(201).json({data: {feedbackId: docRef.id}});
});

// GET /creator/clients/:clientId/nutrition/diary
router.get("/creator/clients/:clientId/nutrition/diary", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const {date, startDate, endDate} = req.query as Record<string, string>;
  let query: Query = db
    .collection("users")
    .doc(req.params.clientId)
    .collection("diary");

  if (date) {
    query = query.where("date", "==", date);
  } else if (startDate && endDate) {
    query = query.where("date", ">=", startDate).where("date", "<=", endDate);
  }

  query = query.orderBy("date", "desc").limit(30);
  const snapshot = await query.get();
  res.json({data: snapshot.docs.map((d) => ({...d.data(), id: d.id}))});
});

// ─── Week Key Utilities (ported from apps/creator-dashboard/src/utils/weekCalculation.js) ──

function getMondayWeek(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const year = monday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  const daysToFirstMonday = jan1Day === 0 ? 1 : 8 - jan1Day;
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + daysToFirstMonday);
  const daysDiff = Math.floor((monday.getTime() - firstMonday.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.floor(daysDiff / 7) + 1;
  return `${year}-W${String(weekNumber).padStart(2, "0")}`;
}

function getWeekDates(weekKey: string): { start: Date; end: Date } {
  const [yearStr, weekWithW] = weekKey.split("-");
  const week = parseInt(weekWithW.replace("W", ""), 10);
  const year = parseInt(yearStr, 10);
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  const daysToFirstMonday = jan1Day === 0 ? 1 : 8 - jan1Day;
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + daysToFirstMonday);
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return {start: weekStart, end: weekEnd};
}

function getWeeksBetween(startDate: Date, endDate: Date): string[] {
  const weeks: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    weeks.push(getMondayWeek(current));
    current.setDate(current.getDate() + 7);
  }
  return [...new Set(weeks)];
}

function getConsecutiveWeekKeys(startWeekKey: string, count: number): string[] {
  if (count < 1) return [];
  if (count === 1) return [startWeekKey];
  const {start} = getWeekDates(startWeekKey);
  const endDate = new Date(start);
  endDate.setDate(start.getDate() + 7 * count - 1);
  return getWeeksBetween(start, endDate);
}

function getCalendarMonthRange(month: string): { start: Date; end: Date; weekKeys: string[] } {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10) - 1;
  const firstOfMonth = new Date(year, m, 1);
  const lastOfMonth = new Date(year, m + 1, 0);
  const daysInMonth = lastOfMonth.getDate();
  const startingDayOfWeek = (firstOfMonth.getDay() + 6) % 7;
  const totalCells = Math.ceil((startingDayOfWeek + daysInMonth) / 7) * 7;
  const trailingCount = Math.max(0, totalCells - startingDayOfWeek - daysInMonth);
  const start = new Date(year, m, 1 - startingDayOfWeek);
  const end = new Date(year, m, daysInMonth + trailingCount);
  return {start, end, weekKeys: getWeeksBetween(start, end)};
}

function toLocalDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Client Plan Content (one-on-one scheduling/content chain) ────────────

function planContentDocId(clientId: string, programId: string, weekKey: string): string {
  return `${clientId}_${programId}_${weekKey}`;
}

// Read full session tree (sessions → exercises → sets) from a Firestore collection ref
async function readSessionTree(
  sessionsParent: FirebaseFirestore.CollectionReference
): Promise<Array<Record<string, unknown>>> {
  const sessionsSnap = await sessionsParent.orderBy("order", "asc").get();
  return Promise.all(
    sessionsSnap.docs.map(async (sDoc) => {
      const exSnap = await sDoc.ref.collection("exercises").orderBy("order", "asc").get();
      const exercises = await Promise.all(
        exSnap.docs.map(async (eDoc) => {
          const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
          return {...eDoc.data(), id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id}))};
        })
      );
      return {...sDoc.data(), id: sDoc.id, exercises};
    })
  );
}

// Ensure a client_plan_content copy exists for a week. Creates from plan if needed.
async function ensureClientCopy(
  clientId: string,
  programId: string,
  weekKey: string,
  creatorId: string
): Promise<{ docId: string; alreadyExisted: boolean }> {
  const docId = planContentDocId(clientId, programId, weekKey);
  const docRef = db.collection("client_plan_content").doc(docId);
  const docSnap = await docRef.get();
  // If the doc exists, the week has been personalized — respect it even if empty.
  // An empty personalized week means the user intentionally deleted all sessions.
  if (docSnap.exists) {
    return {docId, alreadyExisted: true};
  }

  // Read planAssignments from user's courses entry
  const userDoc = await db.collection("users").doc(clientId).get();
  const courseEntry = userDoc.data()?.courses?.[programId] as Record<string, unknown> | undefined;
  const planAssignments = (courseEntry?.planAssignments ?? {}) as Record<string, { planId: string; moduleId: string }>;
  const assignment = planAssignments[weekKey];
  if (!assignment?.planId || !assignment?.moduleId) {
    // No plan assigned — create an empty client_plan_content doc so sessions can be added directly
    await docRef.set(clientPlanContentPayload(
      {creator_id: creatorId, client_id: clientId},
      {
        title: weekKey,
        order: 0,
        source_plan_id: null,
        source_module_id: null,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      }
    ));
    return {docId, alreadyExisted: false};
  }

  // Read plan module sessions with exercises and sets
  const planSessionsRef = db
    .collection("plans").doc(assignment.planId)
    .collection("modules").doc(assignment.moduleId)
    .collection("sessions");
  const planSessionsSnap = await planSessionsRef.orderBy("order", "asc").get();

  const sessions: Array<Record<string, unknown>> = [];
  for (const sDoc of planSessionsSnap.docs) {
    const sData = sDoc.data();
    // Determine source library session ID (new field or legacy field)
    const sourceLibId = sData.source_library_session_id ?? sData.librarySessionRef ?? null;
    const sessionData: Record<string, unknown> = {
      ...sData,
      id: sDoc.id,
      source_plan_session_id: sDoc.id,
      source_library_session_id: sourceLibId,
    };
    // Remove legacy fields from copy
    delete sessionData.librarySessionRef;
    delete sessionData.useLocalContent;

    // Read exercises from plan session
    const exSnap = await sDoc.ref.collection("exercises").orderBy("order", "asc").get();
    let exercises: Array<Record<string, unknown>> = [];

    if (exSnap.empty && sourceLibId && creatorId) {
      // Legacy: plan session has no local exercises, resolve from library
      try {
        const libRef = db.collection("creator_libraries").doc(creatorId).collection("sessions").doc(sourceLibId);
        const libDoc = await libRef.get();
        if (libDoc.exists) {
          const libData = libDoc.data()!;
          sessionData.title = sData.title ?? libData.title ?? null;
          sessionData.image_url = sData.image_url ?? libData.image_url ?? null;
          const libExSnap = await libRef.collection("exercises").orderBy("order", "asc").get();
          exercises = await Promise.all(
            libExSnap.docs.map(async (eDoc) => {
              const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
              return {...eDoc.data(), id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id}))};
            })
          );
        }
      } catch {/* best-effort library resolution */}
    } else {
      exercises = await Promise.all(
        exSnap.docs.map(async (eDoc) => {
          const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
          return {...eDoc.data(), id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id}))};
        })
      );
      // Resolve library session metadata if needed
      if (sourceLibId && creatorId) {
        try {
          const libDoc = await db.collection("creator_libraries").doc(creatorId)
            .collection("sessions").doc(sourceLibId).get();
          if (libDoc.exists) {
            const libData = libDoc.data()!;
            sessionData.title = sData.title ?? libData.title ?? null;
            sessionData.image_url = sData.image_url ?? libData.image_url ?? null;
          }
        } catch {/* best-effort */}
      }
    }

    sessions.push({...sessionData, exercises});
  }

  // Write to client_plan_content using batches
  const moduleDoc = await db.collection("plans").doc(assignment.planId)
    .collection("modules").doc(assignment.moduleId).get();
  const moduleTitle = moduleDoc.exists ? (moduleDoc.data()?.title ?? weekKey) : weekKey;

  let batch = db.batch();
  let batchCount = 0;

  batch.set(docRef, clientPlanContentPayload(
    {creator_id: creatorId, client_id: clientId},
    {
      title: moduleTitle,
      order: 0,
      source_plan_id: assignment.planId,
      source_module_id: assignment.moduleId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }
  ));
  batchCount++;

  for (const session of sessions) {
    const sessionId = (session.id as string) ?? db.collection("_").doc().id;
    const sessionRef = docRef.collection("sessions").doc(sessionId);
    const {exercises: exArr, ...sessionFields} = session;
    batch.set(sessionRef, {...sessionFields, id: sessionId, created_at: FieldValue.serverTimestamp()});
    batchCount++;

    if (Array.isArray(exArr)) {
      for (const exercise of exArr as Array<Record<string, unknown>>) {
        const exId = (exercise.id as string) ?? db.collection("_").doc().id;
        const exRef = sessionRef.collection("exercises").doc(exId);
        const {sets: setsArr, ...exFields} = exercise;
        batch.set(exRef, {...exFields, id: exId, created_at: FieldValue.serverTimestamp()});
        batchCount++;

        if (Array.isArray(setsArr)) {
          for (const set of setsArr as Array<Record<string, unknown>>) {
            const setId = (set.id as string) ?? db.collection("_").doc().id;
            batch.set(exRef.collection("sets").doc(setId), {...set, id: setId, created_at: FieldValue.serverTimestamp()});
            batchCount++;
          }
        }

        if (batchCount >= 450) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }
  }

  if (batchCount > 0) await batch.commit();
  return {docId, alreadyExisted: false};
}

// Delete all subcollections under a client_plan_content doc
async function deleteClientPlanContentDoc(docId: string): Promise<void> {
  const docRef = db.collection("client_plan_content").doc(docId);
  const sessionsSnap = await docRef.collection("sessions").get();
  if (sessionsSnap.empty) {
    await docRef.delete()
      .catch((err) => functions.logger.warn("creator:plan-content-delete-failed", err));
    return;
  }
  let batch = db.batch();
  let count = 0;
  for (const sDoc of sessionsSnap.docs) {
    const exSnap = await sDoc.ref.collection("exercises").get();
    for (const eDoc of exSnap.docs) {
      const setsSnap = await eDoc.ref.collection("sets").get();
      for (const setDoc of setsSnap.docs) {
        batch.delete(setDoc.ref);
        count++;
        if (count >= 450) {
          await batch.commit(); batch = db.batch(); count = 0;
        }
      }
      batch.delete(eDoc.ref);
      count++;
    }
    batch.delete(sDoc.ref);
    count++;
  }
  batch.delete(docRef);
  count++;
  if (count > 0) await batch.commit();
}

// GET /creator/clients/:clientId/plan-content/:weekKey?programId=X
router.get("/creator/clients/:clientId/plan-content/:weekKey", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const programId = req.query.programId as string;
  if (!programId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "programId es requerido", "programId");
  }

  let docId = planContentDocId(req.params.clientId, programId, req.params.weekKey);
  let doc = await db.collection("client_plan_content").doc(docId).get();

  if (!doc.exists) {
    // Auto-create copy from plan template if a plan is assigned to this week
    try {
      const result = await ensureClientCopy(req.params.clientId, programId, req.params.weekKey, auth.userId);
      docId = result.docId;
      doc = await db.collection("client_plan_content").doc(docId).get();
    } catch {
      // No plan assigned to this week — return null
      res.json({data: null});
      return;
    }
    if (!doc.exists) {
      res.json({data: null});
      return;
    }
  }

  const docData = doc.data()!;

  // Load sessions subcollection
  const sessionsSnap = await doc.ref.collection("sessions").orderBy("order", "asc").get();

  const sessions = await Promise.all(
    sessionsSnap.docs.map(async (sDoc) => {
      const sData = sDoc.data();
      const exSnap = await sDoc.ref.collection("exercises").orderBy("order", "asc").get();
      let exercises = await Promise.all(
        exSnap.docs.map(async (eDoc) => {
          const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
          return {
            ...eDoc.data(),
            id: eDoc.id,
            sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id})),
          };
        })
      );

      // Backfill: if exercises subcollection is empty but session has a library ref,
      // deep-copy exercises from the library session
      if (exercises.length === 0) {
        const sourceLibId = sData.source_library_session_id ?? sData.librarySessionRef ?? null;
        if (sourceLibId && auth.userId) {
          const libSessionRef = db.collection("creator_libraries").doc(auth.userId)
            .collection("sessions").doc(sourceLibId as string);
          const libDoc = await libSessionRef.get();
          if (libDoc.exists) {
            const libExSnap = await libSessionRef.collection("exercises").orderBy("order", "asc").get();
            if (!libExSnap.empty) {
              let batch = db.batch();
              let batchCount = 0;
              const backfilled: typeof exercises = [];
              // Resolve current displayNames from exercises_library before persisting
              // so backfilled docs don't bake in a stale name from the source session.
              const libraryMap = await buildLibraryMapForExerciseDocs(libExSnap.docs);

              for (const eDoc of libExSnap.docs) {
                const exRef = sDoc.ref.collection("exercises").doc();
                const exData = eDoc.data();
                const resolvedName = resolveDisplayNameForBackfill(exData, libraryMap);
                const exDataPersist = resolvedName ?
                  {...exData, name: resolvedName, title: resolvedName} :
                  exData;
                batch.set(exRef, {...exDataPersist, id: exRef.id, created_at: FieldValue.serverTimestamp()});
                batchCount++;

                const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
                const sets: Array<{ id: string; [key: string]: unknown }> = [];
                for (const setDoc of setsSnap.docs) {
                  const setRef = exRef.collection("sets").doc();
                  batch.set(setRef, {...setDoc.data(), id: setRef.id, created_at: FieldValue.serverTimestamp()});
                  batchCount++;
                  sets.push({...setDoc.data(), id: setRef.id});
                }
                if (batchCount >= 450) {
                  await batch.commit(); batch = db.batch(); batchCount = 0;
                }

                backfilled.push({id: exRef.id, ...exDataPersist, sets});
              }
              if (batchCount > 0) await batch.commit();

              if (sData.librarySessionRef && !sData.source_library_session_id) {
                await sDoc.ref.update({source_library_session_id: sData.librarySessionRef});
              }

              exercises = backfilled;
            }
          }
        }
      }

      await hydrateExercisesWithLibraryNames(exercises as Array<Record<string, unknown>>);
      return {id: sDoc.id, ...sData, exercises};
    })
  );

  res.json({data: {...docData, programId, sessions}});
});

// PUT /creator/clients/:clientId/plan-content/:weekKey
router.put("/creator/clients/:clientId/plan-content/:weekKey", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const body = req.body ?? {};
  const programId = body.programId as string;
  if (!programId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "programId es requerido", "programId");
  }

  const docId = planContentDocId(req.params.clientId, programId, req.params.weekKey);
  const docRef = db.collection("client_plan_content").doc(docId);

  const sessions = Array.isArray(body.sessions) ? body.sessions : [];
  const deletions = Array.isArray(body.deletions) ? body.deletions as string[] : [];

  await docRef.set(clientPlanContentPayload(
    {creator_id: auth.userId, client_id: req.params.clientId},
    {
      title: body.title ?? req.params.weekKey,
      order: body.order ?? 0,
      source_plan_id: body.source_plan_id ?? null,
      source_module_id: body.source_module_id ?? null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }
  ));

  const batch = db.batch();
  let batchCount = 0;

  // Security (audit C-03): validate each deletion path strictly before walking.
  // Each path must be of the form "sessions/<id>" / "sessions/<id>/exercises/<id>"
  // / "sessions/<id>/exercises/<id>/sets/<id>". Anything else is rejected.
  for (const delPath of deletions) {
    const segments = validateDeletionPath(delPath);
    let ref: FirebaseFirestore.DocumentReference = docRef;
    for (let i = 0; i < segments.length; i += 2) {
      ref = ref.collection(segments[i]).doc(segments[i + 1]);
    }
    batch.delete(ref);
    batchCount++;
  }

  // Write incoming sessions/exercises/sets
  for (const session of sessions) {
    if (!session || typeof session !== "object") continue;
    const sessionId = session.id ?? session.sessionId ?? db.collection("_").doc().id;
    const sessionRef = docRef.collection("sessions").doc(sessionId);
    const {exercises: exArr, ...sessionFields} = session as Record<string, unknown>;
    batch.set(sessionRef, {
      ...sessionFields,
      id: sessionId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    batchCount++;

    if (Array.isArray(exArr)) {
      for (const exercise of exArr) {
        if (!exercise || typeof exercise !== "object") continue;
        const exId = (exercise as Record<string, unknown>).id ?? db.collection("_").doc().id;
        const exRef = sessionRef.collection("exercises").doc(exId as string);
        const {sets: setsArr, ...exFields} = exercise as Record<string, unknown>;
        batch.set(exRef, {...exFields, id: exId, created_at: FieldValue.serverTimestamp()});
        batchCount++;

        if (Array.isArray(setsArr)) {
          for (const set of setsArr) {
            if (!set || typeof set !== "object") continue;
            const setId = (set as Record<string, unknown>).id ?? db.collection("_").doc().id;
            const setRef = exRef.collection("sets").doc(setId as string);
            batch.set(setRef, {...set, id: setId, created_at: FieldValue.serverTimestamp()});
            batchCount++;
          }
        }

        if (batchCount >= 450) {
          await batch.commit(); batchCount = 0;
        }
      }
    }
  }

  if (batchCount > 0) await batch.commit();

  res.json({data: {docId, weekKey: req.params.weekKey, sessionsWritten: sessions.length}});
});

// PATCH /creator/clients/:clientId/plan-content/:weekKey/sessions/:sessionId
router.patch("/creator/clients/:clientId/plan-content/:weekKey/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const programId = req.query.programId as string;
  if (!programId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "programId es requerido", "programId");
  }

  const docId = planContentDocId(req.params.clientId, programId, req.params.weekKey);
  const sessionRef = db
    .collection("client_plan_content")
    .doc(docId)
    .collection("sessions")
    .doc(req.params.sessionId);

  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  const allowedFields = ["title", "order", "dayIndex", "isRestDay", "image_url", "source_library_session_id", "defaultDataTemplate"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await sessionRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {sessionId: req.params.sessionId, updated: true}});
});

// ─── Client Sessions (one-on-one scheduled sessions) ─────────────────────

// GET /creator/clients/:clientId/client-sessions
router.get("/creator/clients/:clientId/client-sessions", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const {startDate, endDate} = req.query as Record<string, string | undefined>;
  // creator_id filter omitted — verifyClientAccess already confirmed ownership
  // This allows using the existing (client_id, date) composite index
  let query: Query = db
    .collection("client_sessions")
    .where("client_id", "==", req.params.clientId);

  if (startDate && endDate) {
    query = query.where("date", ">=", startDate).where("date", "<=", endDate);
  }

  query = query.orderBy("date", "asc").limit(100);
  const snap = await query.get();

  res.json({data: snap.docs.map((d) => ({...d.data(), id: d.id}))});
});

// PUT /creator/clients/:clientId/client-sessions/:clientSessionId
// Security (audit C-02): verify the doc, if it exists, belongs to this
// creator+client pair; replace `...body` spread with pickFields allowlist.
// Previously any creator could clobber another creator's client_sessions doc
// by combining their own clientId with another creator's sessionId in the URL.
router.put("/creator/clients/:clientId/client-sessions/:clientSessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const docRef = db.collection("client_sessions").doc(req.params.clientSessionId);
  const existing = await docRef.get();
  if (existing.exists) {
    const data = existing.data()!;
    if (data.creator_id !== auth.userId || data.client_id !== req.params.clientId) {
      throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a esta sesión");
    }
  }

  const allowedFields = [
    "date", "date_timestamp", "session_id", "module_id", "plan_id",
    "program_id", "status", "notes", "title", "image_url", "source_session_id",
  ];
  const updates = pickFields(req.body, allowedFields);

  await writeClientSession(req.params.clientSessionId, {
    ...updates,
    client_id: req.params.clientId,
    creator_id: auth.userId,
  });

  res.json({data: {id: req.params.clientSessionId}});
});

// GET /creator/clients/:clientId/client-sessions/:clientSessionId
router.get("/creator/clients/:clientId/client-sessions/:clientSessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  // Audit M-33: align with sibling endpoints by gating on the creator/client
  // relationship. The previous creator_id-only check fails open if a legacy
  // doc lacks the field.
  await verifyClientAccess(auth.userId, req.params.clientId);

  const doc = await db.collection("client_sessions").doc(req.params.clientSessionId).get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  const data = doc.data()!;
  if (data.creator_id !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso");
  }

  res.json({data: {id: doc.id, ...data}});
});

// PATCH /creator/clients/:clientId/client-sessions/:clientSessionId
router.patch("/creator/clients/:clientId/client-sessions/:clientSessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  // Audit M-33: see GET sibling above.
  await verifyClientAccess(auth.userId, req.params.clientId);

  const docRef = db.collection("client_sessions").doc(req.params.clientSessionId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  const allowedFields = ["date", "date_timestamp", "session_id", "module_id", "plan_id", "program_id", "status", "notes"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await docRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {id: doc.id, updated: true}});
});

// DELETE /creator/clients/:clientId/client-sessions/:clientSessionId
router.delete("/creator/clients/:clientId/client-sessions/:clientSessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const docRef = db.collection("client_sessions").doc(req.params.clientSessionId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  await docRef.delete();
  res.status(204).send();
});

// ─── Client Session Content (exercises/sets tree) ─────────────────────────

// GET /creator/clients/:clientId/client-sessions/:clientSessionId/content
router.get("/creator/clients/:clientId/client-sessions/:clientSessionId/content", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const docRef = db.collection("client_session_content").doc(req.params.clientSessionId);
  const doc = await docRef.get();

  if (!doc.exists) {
    res.json({data: null});
    return;
  }

  // Load exercises → sets tree
  const exercisesSnap = await docRef.collection("exercises").orderBy("order", "asc").get();
  const exercises = await Promise.all(
    exercisesSnap.docs.map(async (eDoc) => {
      const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
      return {
        ...eDoc.data(),
        id: eDoc.id,
        sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id})),
      };
    })
  );

  res.json({data: {...doc.data(), id: doc.id, exercises}});
});

// PUT /creator/clients/:clientId/client-sessions/:clientSessionId/content
// Security (audit H-13): verify the parent client_sessions doc belongs to
// this creator AND apply pickFields to the doc-level shape. Previously
// `verifyClientAccess` confirmed creator/client relationship but anyone with
// one client could write to ANY client_session_content doc by passing that id.
router.put("/creator/clients/:clientId/client-sessions/:clientSessionId/content", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);
  await verifyClientSessionOwnership(auth.userId, req.params.clientSessionId);

  const body = req.body ?? {};
  const {exercises: exercisesArr, ...rawDocFields} = body as {
    exercises?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };

  const docFields = pickFields(rawDocFields, [
    "title", "notes", "date", "session_id", "session_name", "module_id",
    "module_name", "plan_id", "program_id", "status", "duration_seconds",
    "started_at", "ended_at", "image_url", "source_session_id", "type",
    "tags", "discipline", "warmup", "cooldown", "metadata",
  ]);

  const docRef = db.collection("client_session_content").doc(req.params.clientSessionId);

  // Delete existing exercises/sets subcollections before rewriting
  const existingExercises = await docRef.collection("exercises").get();
  if (!existingExercises.empty) {
    let delBatch = db.batch();
    let delCount = 0;
    for (const eDoc of existingExercises.docs) {
      const setsSnap = await eDoc.ref.collection("sets").get();
      for (const sDoc of setsSnap.docs) {
        delBatch.delete(sDoc.ref);
        delCount++;
        if (delCount >= 450) {
          await delBatch.commit(); delBatch = db.batch(); delCount = 0;
        }
      }
      delBatch.delete(eDoc.ref);
      delCount++;
      if (delCount >= 450) {
        await delBatch.commit(); delBatch = db.batch(); delCount = 0;
      }
    }
    if (delCount > 0) await delBatch.commit();
  }

  // Write doc + exercises/sets tree
  let batch = db.batch();
  let batchCount = 0;

  batch.set(docRef, {
    ...docFields,
    client_id: req.params.clientId,
    creator_id: auth.userId,
    updated_at: FieldValue.serverTimestamp(),
  });
  batchCount++;

  if (Array.isArray(exercisesArr)) {
    for (const exercise of exercisesArr) {
      const exId = (exercise.id as string) ?? db.collection("_").doc().id;
      const exRef = docRef.collection("exercises").doc(exId);
      const {sets: setsArr, ...exFields} = exercise;
      batch.set(exRef, {...exFields, id: exId, created_at: FieldValue.serverTimestamp()});
      batchCount++;

      if (Array.isArray(setsArr)) {
        for (const set of setsArr as Array<Record<string, unknown>>) {
          const setId = (set.id as string) ?? db.collection("_").doc().id;
          batch.set(exRef.collection("sets").doc(setId), {...set, id: setId, created_at: FieldValue.serverTimestamp()});
          batchCount++;
        }
      }

      if (batchCount >= 450) {
        await batch.commit(); batch = db.batch(); batchCount = 0;
      }
    }
  }

  if (batchCount > 0) await batch.commit();
  res.json({data: {id: req.params.clientSessionId}});
});

// PATCH /creator/clients/:clientId/client-sessions/:clientSessionId/content
// Updates doc-level fields only — does NOT touch exercises/sets subcollections
// Security (audit H-13): verify parent ownership + pickFields allowlist.
router.patch("/creator/clients/:clientId/client-sessions/:clientSessionId/content", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);
  await verifyClientSessionOwnership(auth.userId, req.params.clientSessionId);

  const docRef = db.collection("client_session_content").doc(req.params.clientSessionId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Contenido de sesión no encontrado");
  }
  if (doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este contenido");
  }

  const {exercises: _ignored, ...rawUpdates} = req.body ?? {};
  const updates = pickFields(rawUpdates, [
    "title", "notes", "date", "session_id", "session_name", "module_id",
    "module_name", "plan_id", "program_id", "status", "duration_seconds",
    "started_at", "ended_at", "image_url", "source_session_id", "type",
    "tags", "discipline", "warmup", "cooldown", "metadata",
  ]);
  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }
  await docRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {id: req.params.clientSessionId, updated: true}});
});

// PATCH /creator/clients/:clientId/client-sessions/:clientSessionId/content/exercises/:exerciseId
// Security (audit H-12): verify parent client_sessions doc belongs to this
// creator AND apply pickFields. Previously verifyClientAccess alone allowed
// any creator with any client to mutate exercises under any sessionId.
router.patch("/creator/clients/:clientId/client-sessions/:clientSessionId/content/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);
  await verifyClientSessionOwnership(auth.userId, req.params.clientSessionId);

  const exRef = db.collection("client_session_content")
    .doc(req.params.clientSessionId)
    .collection("exercises")
    .doc(req.params.exerciseId);

  const exDoc = await exRef.get();
  if (!exDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  const updates = pickFields(req.body, [
    "displayName", "name", "title", "order", "type", "discipline",
    "library_id", "exercise_id", "image_url", "video_url", "notes",
    "tempo", "rest_seconds", "rest", "metadata", "tags",
  ]);
  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }
  await exRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {id: req.params.exerciseId, updated: true}});
});

// ─── Creator Plans Hierarchy (modules/sessions/exercises/sets) ────────────

// POST /creator/plans
router.post("/creator/plans", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  // M-11: validateBody covers all written fields; stripUnknown drops anything
  // else from req.body so Firestore writes are bounded to the declared shape.
  const body = validateBody<{
    title: string;
    description?: string;
    discipline?: string;
  }>(
    {
      title: "string",
      description: "optional_string",
      discipline: "optional_string",
    },
    req.body
  );
  assertTextLength(body.title, "title", TEXT_CAP_TITLE);
  if (body.description !== undefined) {
    assertTextLength(body.description, "description", TEXT_CAP_DESCRIPTION, {allowEmpty: true});
  }
  if (body.discipline !== undefined) {
    assertTextLength(body.discipline, "discipline", TEXT_CAP_TITLE, {allowEmpty: true});
  }

  // Look up creator's displayName
  const creatorDoc = await db.collection("users").doc(auth.userId).get();
  const creatorName = creatorDoc.data()?.displayName ?? "";

  const planData: Record<string, unknown> = {
    title: body.title,
    description: body.description || "",
    creator_id: auth.userId,
    creatorName,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
  if (body.discipline) planData.discipline = body.discipline;

  const planRef = await db.collection("plans").add(planData);

  // Auto-create first module
  const moduleRef = await db
    .collection("plans")
    .doc(planRef.id)
    .collection("modules")
    .add({
      title: "Semana 1",
      order: 0,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({data: {id: planRef.id, firstModuleId: moduleRef.id}});
});

// GET /creator/plans
router.get("/creator/plans", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const [snap, coursesSnap] = await Promise.all([
    db.collection("plans")
      .where("creator_id", "==", auth.userId)
      .orderBy("created_at", "desc")
      .get(),
    db.collection("courses")
      .where("creator_id", "==", auth.userId)
      .get(),
  ]);

  // Build map: planId → count of courses that reference this plan
  const planClientCounts: Record<string, number> = {};
  for (const cDoc of coursesSnap.docs) {
    const cpId = cDoc.data().content_plan_id as string | undefined;
    if (cpId) {
      planClientCounts[cpId] = (planClientCounts[cpId] ?? 0) + 1;
    }
  }

  // Fetch module titles per plan in parallel (select only needed fields)
  const plans = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      const modulesSnap = await db
        .collection("plans")
        .doc(d.id)
        .collection("modules")
        .orderBy("order", "asc")
        .select("title", "order")
        .get();

      return {
        id: d.id,
        ...data,
        weekCount: modulesSnap.size,
        clientCount: planClientCounts[d.id] ?? 0,
        weeks: modulesSnap.docs.map((m) => ({
          moduleId: m.id,
          title: m.data().title ?? null,
        })),
      };
    })
  );

  res.json({data: plans});
});

// GET /creator/plans/:planId
router.get("/creator/plans/:planId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  // Parallelize plan doc + modules query (modules path is independent)
  const [planDoc, modulesSnap] = await Promise.all([
    db.collection("plans").doc(req.params.planId).get(),
    db.collection("plans").doc(req.params.planId)
      .collection("modules").orderBy("order", "asc").get(),
  ]);

  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const modules = await Promise.all(
    modulesSnap.docs.map(async (mDoc) => {
      const sessionsSnap = await db
        .collection("plans")
        .doc(req.params.planId)
        .collection("modules")
        .doc(mDoc.id)
        .collection("sessions")
        .orderBy("order", "asc")
        .get();

      return {
        moduleId: mDoc.id,
        ...mDoc.data(),
        sessions: sessionsSnap.docs.map((s) => ({
          sessionId: s.id,
          ...s.data(),
        })),
      };
    })
  );

  res.json({data: {...planDoc.data(), id: planDoc.id, modules}});
});

// PATCH /creator/plans/:planId
router.patch("/creator/plans/:planId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const docRef = db.collection("plans").doc(req.params.planId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  // Allowlist fields
  const allowedFields = ["title", "description", "discipline", "status"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await docRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {planId: doc.id, updated: true}});
});

// DELETE /creator/plans/:planId
router.delete("/creator/plans/:planId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const docRef = db.collection("plans").doc(req.params.planId);
  const doc = await docRef.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  // Cascading delete in batches
  const modulesSnap = await docRef.collection("modules").get();
  let batch = db.batch();
  let count = 0;
  for (const mDoc of modulesSnap.docs) {
    const sessionsSnap = await mDoc.ref.collection("sessions").get();
    for (const sDoc of sessionsSnap.docs) {
      const exSnap = await sDoc.ref.collection("exercises").get();
      for (const eDoc of exSnap.docs) {
        const setsSnap = await eDoc.ref.collection("sets").get();
        for (const setDoc of setsSnap.docs) {
          batch.delete(setDoc.ref);
          count++;
          if (count >= 450) {
            await batch.commit(); batch = db.batch(); count = 0;
          }
        }
        batch.delete(eDoc.ref);
        count++;
        if (count >= 450) {
          await batch.commit(); batch = db.batch(); count = 0;
        }
      }
      batch.delete(sDoc.ref);
      count++;
      if (count >= 450) {
        await batch.commit(); batch = db.batch(); count = 0;
      }
    }
    batch.delete(mDoc.ref);
    count++;
    if (count >= 450) {
      await batch.commit(); batch = db.batch(); count = 0;
    }
  }
  batch.delete(docRef);
  count++;
  await batch.commit();

  res.status(204).send();
});

// POST /creator/plans/:planId/modules
router.post("/creator/plans/:planId/modules", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const body = validateBody<{ title: string; order: number }>(
    {title: "string", order: "number"},
    req.body
  );

  const ref = await db.collection("plans").doc(req.params.planId).collection("modules").add({
    title: body.title,
    order: body.order,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  res.status(201).json({data: {moduleId: ref.id}});
});

// PATCH /creator/plans/:planId/modules/:moduleId
router.patch("/creator/plans/:planId/modules/:moduleId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = db.collection("plans").doc(req.params.planId).collection("modules").doc(req.params.moduleId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");

  // Allowlist: title, order
  const allowedFields = ["title", "order"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {moduleId: doc.id, updated: true}});
});

// DELETE /creator/plans/:planId/modules/:moduleId
router.delete("/creator/plans/:planId/modules/:moduleId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const moduleRef = db.collection("plans").doc(req.params.planId).collection("modules").doc(req.params.moduleId);
  const sessionsSnap = await moduleRef.collection("sessions").get();

  // Read all exercises for all sessions in parallel
  const exercisesBySession = await Promise.all(
    sessionsSnap.docs.map((sDoc) => sDoc.ref.collection("exercises").get())
  );

  // Read all sets for all exercises in parallel
  const allExerciseDocs = exercisesBySession.flatMap((snap) => snap.docs);
  const setsByExercise = await Promise.all(
    allExerciseDocs.map((eDoc) => eDoc.ref.collection("sets").get())
  );

  // Batch-delete everything
  let batch = db.batch();
  let count = 0;
  for (const setsSnap of setsByExercise) {
    for (const setDoc of setsSnap.docs) {
      batch.delete(setDoc.ref);
      count++;
      if (count >= 450) {
        await batch.commit(); batch = db.batch(); count = 0;
      }
    }
  }
  for (const eDoc of allExerciseDocs) {
    batch.delete(eDoc.ref);
    count++;
    if (count >= 450) {
      await batch.commit(); batch = db.batch(); count = 0;
    }
  }
  for (const sDoc of sessionsSnap.docs) {
    batch.delete(sDoc.ref);
    count++;
    if (count >= 450) {
      await batch.commit(); batch = db.batch(); count = 0;
    }
  }
  batch.delete(moduleRef);
  count++;
  await batch.commit();
  res.status(204).send();
});

// POST /creator/plans/:planId/modules/:moduleId/duplicate
router.post("/creator/plans/:planId/modules/:moduleId/duplicate", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planRef = db.collection("plans").doc(req.params.planId);
  const planDoc = await planRef.get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const sourceModRef = planRef.collection("modules").doc(req.params.moduleId);
  const sourceModDoc = await sourceModRef.get();
  if (!sourceModDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");
  }

  // Determine order + read sessions in parallel
  const [allModulesSnap, modulesCountSnap, sessionsSnap] = await Promise.all([
    planRef.collection("modules").orderBy("order", "desc").limit(1).get(),
    planRef.collection("modules").count().get(),
    sourceModRef.collection("sessions").get(),
  ]);
  const maxOrder = allModulesSnap.empty ? -1 : (allModulesSnap.docs[0].data().order ?? 0);
  const modulesCount = modulesCountSnap.data().count;

  // Read all exercises for all sessions in parallel
  const exercisesBySession = await Promise.all(
    sessionsSnap.docs.map((sDoc) => sDoc.ref.collection("exercises").get())
  );

  // Read all sets for all exercises in parallel
  const allExerciseDocs = exercisesBySession.flatMap((snap) => snap.docs);
  const setsByExercise = await Promise.all(
    allExerciseDocs.map((eDoc) => eDoc.ref.collection("sets").get())
  );

  // Build a lookup: exerciseDocId → sets snapshot
  const setsMap = new Map<string, FirebaseFirestore.QuerySnapshot>();
  allExerciseDocs.forEach((eDoc, i) => setsMap.set(eDoc.ref.path, setsByExercise[i]));

  // Now batch-write everything
  const sourceModData = sourceModDoc.data()!;
  const newModRef = planRef.collection("modules").doc();
  let batch = db.batch();
  let count = 0;

  batch.set(newModRef, {
    ...sourceModData,
    id: newModRef.id,
    title: `Semana ${modulesCount + 1}`,
    order: maxOrder + 1,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  count++;

  for (let si = 0; si < sessionsSnap.docs.length; si++) {
    const sDoc = sessionsSnap.docs[si];
    const newSessRef = newModRef.collection("sessions").doc();
    batch.set(newSessRef, {...sDoc.data(), id: newSessRef.id, created_at: FieldValue.serverTimestamp()});
    count++;
    if (count >= 450) {
      await batch.commit(); batch = db.batch(); count = 0;
    }

    const exSnap = exercisesBySession[si];
    for (const eDoc of exSnap.docs) {
      const newExRef = newSessRef.collection("exercises").doc();
      batch.set(newExRef, {...eDoc.data(), id: newExRef.id, created_at: FieldValue.serverTimestamp()});
      count++;
      if (count >= 450) {
        await batch.commit(); batch = db.batch(); count = 0;
      }

      const sSnap = setsMap.get(eDoc.ref.path);
      if (sSnap) {
        for (const setDoc of sSnap.docs) {
          const newSetRef = newExRef.collection("sets").doc();
          batch.set(newSetRef, {...setDoc.data(), id: newSetRef.id, created_at: FieldValue.serverTimestamp()});
          count++;
          if (count >= 450) {
            await batch.commit(); batch = db.batch(); count = 0;
          }
        }
      }
    }
  }
  if (count > 0) await batch.commit();

  res.status(201).json({data: {moduleId: newModRef.id}});
});

// POST /creator/plans/:planId/modules/:moduleId/sessions
router.post("/creator/plans/:planId/modules/:moduleId/sessions", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const body = validateBody<{
    title: string; order: number; isRestDay?: boolean;
    source_library_session_id?: string; dayIndex?: number; image_url?: string;
  }>(
    {
      title: "string",
      order: "number",
      isRestDay: "optional_boolean",
      source_library_session_id: "optional_string",
      dayIndex: "optional_number",
      image_url: "optional_string",
    },
    req.body
  );

  // Support legacy field name from old clients
  const sourceLibSessionId = body.source_library_session_id ?? (req.body.librarySessionRef as string | undefined) ?? null;

  const sessionData: Record<string, unknown> = {
    title: body.title,
    order: body.order,
    ...(body.isRestDay !== undefined && {isRestDay: body.isRestDay}),
    ...(sourceLibSessionId && {source_library_session_id: sourceLibSessionId}),
    ...(body.dayIndex !== undefined && {dayIndex: body.dayIndex}),
    ...(body.image_url !== undefined && {image_url: body.image_url}),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  const sessionsCol = db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions");

  const ref = await sessionsCol.add(sessionData);

  // If source_library_session_id provided, deep copy exercises+sets from library
  if (sourceLibSessionId) {
    const libSessionRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(sourceLibSessionId);
    const libDoc = await libSessionRef.get();
    if (libDoc.exists) {
      const libData = libDoc.data()!;
      // Update session with library metadata if not provided
      const metaUpdate: Record<string, unknown> = {};
      if (!body.image_url && libData.image_url) metaUpdate.image_url = libData.image_url;
      if (Object.keys(metaUpdate).length > 0) await ref.update(metaUpdate);

      // Deep copy exercises and sets
      const libExSnap = await libSessionRef.collection("exercises").orderBy("order", "asc").get();
      let batch = db.batch();
      let batchCount = 0;
      for (const eDoc of libExSnap.docs) {
        const exRef = ref.collection("exercises").doc();
        const {...exData} = eDoc.data();
        batch.set(exRef, {...exData, id: exRef.id, created_at: FieldValue.serverTimestamp()});
        batchCount++;
        const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
        for (const sDoc of setsSnap.docs) {
          const setRef = exRef.collection("sets").doc();
          batch.set(setRef, {...sDoc.data(), id: setRef.id, created_at: FieldValue.serverTimestamp()});
          batchCount++;
        }
        if (batchCount >= 450) {
          await batch.commit(); batch = db.batch(); batchCount = 0;
        }
      }
      if (batchCount > 0) await batch.commit();
    }
  }

  res.status(201).json({data: {sessionId: ref.id}});
});

// GET /creator/plans/:planId/modules/:moduleId/sessions/:sessionId
router.get("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const sessionRef = db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId);

  // Parallel: auth check + session doc + exercises
  const [planDoc, sessionDoc, exercisesSnap] = await Promise.all([
    db.collection("plans").doc(req.params.planId).get(),
    sessionRef.get(),
    sessionRef.collection("exercises").orderBy("order", "asc").get(),
  ]);

  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }
  if (!sessionDoc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  // Parallel: all sets for all exercises at once
  let exercises = await Promise.all(
    exercisesSnap.docs.map(async (eDoc) => {
      const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
      return {
        ...eDoc.data(),
        exerciseId: eDoc.id,
        id: eDoc.id,
        sets: setsSnap.docs.map((s) => ({...s.data(), setId: s.id, id: s.id})),
      };
    })
  );

  // Backfill: if exercises subcollection is empty but session has a library ref,
  // deep-copy exercises from the library session and return them
  if (exercises.length === 0) {
    const sessionData = sessionDoc.data()!;
    const sourceLibId = sessionData.source_library_session_id ?? sessionData.librarySessionRef ?? null;
    if (sourceLibId) {
      const libSessionRef = db.collection("creator_libraries").doc(auth.userId)
        .collection("sessions").doc(sourceLibId as string);
      const libDoc = await libSessionRef.get();
      if (libDoc.exists) {
        const libExSnap = await libSessionRef.collection("exercises").orderBy("order", "asc").get();
        if (!libExSnap.empty) {
          // Deep-copy exercises+sets into the plan session (self-healing backfill).
          // Resolve current displayNames from exercises_library before persisting so
          // backfilled docs don't bake in a stale name from the source session.
          let batch = db.batch();
          let batchCount = 0;
          const backfilledExercises: typeof exercises = [];
          const libraryMap = await buildLibraryMapForExerciseDocs(libExSnap.docs);

          for (const eDoc of libExSnap.docs) {
            const exRef = sessionRef.collection("exercises").doc();
            const exData = eDoc.data();
            const resolvedName = resolveDisplayNameForBackfill(exData, libraryMap);
            const exDataPersist = resolvedName ?
              {...exData, name: resolvedName, title: resolvedName} :
              exData;
            batch.set(exRef, {...exDataPersist, id: exRef.id, created_at: FieldValue.serverTimestamp()});
            batchCount++;

            const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
            const sets: Array<{ setId: string; id: string; [key: string]: unknown }> = [];
            for (const sDoc of setsSnap.docs) {
              const setRef = exRef.collection("sets").doc();
              batch.set(setRef, {...sDoc.data(), id: setRef.id, created_at: FieldValue.serverTimestamp()});
              batchCount++;
              sets.push({...sDoc.data(), setId: setRef.id, id: setRef.id});
            }
            if (batchCount >= 450) {
              await batch.commit(); batch = db.batch(); batchCount = 0;
            }

            backfilledExercises.push({
              exerciseId: exRef.id,
              id: exRef.id,
              ...exDataPersist,
              sets,
            });
          }
          if (batchCount > 0) await batch.commit();

          // Also normalize the field name from librarySessionRef to source_library_session_id
          if (sessionData.librarySessionRef && !sessionData.source_library_session_id) {
            await sessionRef.update({
              source_library_session_id: sessionData.librarySessionRef,
            });
          }

          exercises = backfilledExercises;
        }
      }
    }
  }

  await hydrateExercisesWithLibraryNames(exercises as Array<Record<string, unknown>>);
  res.json({data: {...sessionDoc.data(), sessionId: sessionDoc.id, id: sessionDoc.id, exercises}});
});

// PATCH /creator/plans/:planId/modules/:moduleId/sessions/:sessionId
router.patch("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId);

  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  const allowedFields = ["title", "order", "isRestDay", "source_library_session_id", "dayIndex", "image_url", "defaultDataTemplate"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {sessionId: doc.id, updated: true}});
});

// DELETE /creator/plans/:planId/modules/:moduleId/sessions/:sessionId
router.delete("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const sessionRef = db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId);

  const exSnap = await sessionRef.collection("exercises").get();
  let batch = db.batch();
  let count = 0;
  for (const eDoc of exSnap.docs) {
    const setsSnap = await eDoc.ref.collection("sets").get();
    for (const sDoc of setsSnap.docs) {
      batch.delete(sDoc.ref);
      count++;
      if (count >= 450) {
        await batch.commit(); batch = db.batch(); count = 0;
      }
    }
    batch.delete(eDoc.ref);
    count++;
    if (count >= 450) {
      await batch.commit(); batch = db.batch(); count = 0;
    }
  }
  batch.delete(sessionRef);
  await batch.commit();
  res.status(204).send();
});

// POST exercises for plan sessions — with validateBody
router.post("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const allowedExFields = [
    "name", "order", "title", "libraryId", "primaryMuscles", "notes",
    "programSettings", "defaultSetValues",
    "primary", "alternatives", "objectives", "measures",
    "description", "video_url", "video_source", "muscle_activation", "implements",
    "customMeasureLabels", "customObjectiveLabels",
  ];
  const exData = pickFields(req.body, allowedExFields);
  exData.created_at = FieldValue.serverTimestamp();
  exData.updated_at = FieldValue.serverTimestamp();

  const ref = await db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .add(exData);

  res.status(201).json({data: {exerciseId: ref.id, id: ref.id}});
});

router.patch("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId);

  // Allowlist exercise fields
  const allowedFields = [
    "name", "order", "title", "libraryId", "primaryMuscles", "notes",
    "videoUrl", "thumbnailUrl", "programSettings", "defaultSetValues",
    "primary", "alternatives", "objectives", "measures",
    "description", "video_url", "video_source", "muscle_activation", "implements",
    "customMeasureLabels", "customObjectiveLabels",
  ];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {exerciseId: req.params.exerciseId, updated: true}});
});

router.delete("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const exRef = db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId);

  const setsSnap = await exRef.collection("sets").get();
  const batch = db.batch();
  for (const s of setsSnap.docs) batch.delete(s.ref);
  batch.delete(exRef);
  await batch.commit();
  res.status(204).send();
});

// POST sets — with validateBody
router.post("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const body = validateBody<{
    order: number;
    title?: string;
    reps?: string | number;
    weight?: number;
    intensity?: string;
    rir?: number;
    restSeconds?: number;
    type?: string;
    duration?: number;
    rep_sequence?: number[];
  }>(
    {
      order: "number",
      title: "optional_string",
      reps: "optional_string_or_number",
      weight: "optional_number",
      intensity: "optional_string",
      rir: "optional_number",
      restSeconds: "optional_number",
      type: "optional_string",
      duration: "optional_number",
      rep_sequence: "optional_array",
    },
    req.body
  );

  // rep_sequence: enforce number[] at route level (validateBody only checks top-level array type)
  if (body.rep_sequence && !body.rep_sequence.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "rep_sequence debe ser un array de números positivos", "rep_sequence");
  }

  // Allow custom_* fields from body on creation
  const customFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
    if (key.startsWith("custom_") && (typeof value === "string" || typeof value === "number" || value === null)) {
      customFields[key] = value;
    }
  }

  const ref = await db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets")
    .add({...body, ...customFields, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()});

  res.status(201).json({data: {setId: ref.id, id: ref.id}});
});

router.patch("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const ref = db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets").doc(req.params.setId);

  // Allowlist set fields
  const allowedFields = ["order", "title", "reps", "weight", "intensity", "rir", "restSeconds", "type", "duration", "rep_sequence"];
  const updates = pickFields(req.body, allowedFields);

  // rep_sequence: enforce number[] if present
  if (updates.rep_sequence !== undefined) {
    const seq = updates.rep_sequence;
    if (seq !== null && (!Array.isArray(seq) || !seq.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0))) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "rep_sequence debe ser un array de números positivos", "rep_sequence");
    }
  }

  // Allow custom objective/measure fields (custom_*)
  for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
    if (key.startsWith("custom_") && (typeof value === "string" || typeof value === "number" || value === null)) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {setId: req.params.setId, updated: true}});
});

router.delete("/creator/plans/:planId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  await db
    .collection("plans").doc(req.params.planId)
    .collection("modules").doc(req.params.moduleId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets").doc(req.params.setId)
    .delete();

  res.status(204).send();
});

// ─── Library Sessions CRUD ──────────────────────────────────────────────

// GET /creator/library/exercises — deduplicated exercises from creator_libraries sessions + exercises_library
router.get("/creator/library/exercises", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const seen = new Map<string, Record<string, unknown>>();

  // 1. Exercises from creator_libraries sessions
  const sessionsSnap = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions")
    .get();

  await Promise.all(
    sessionsSnap.docs.map(async (sessionDoc) => {
      const exercisesSnap = await sessionDoc.ref
        .collection("exercises")
        .orderBy("order", "asc")
        .get();

      for (const eDoc of exercisesSnap.docs) {
        const data = eDoc.data();
        const key = data.name || eDoc.id;
        if (key && !seen.has(key)) {
          seen.set(key, {
            id: eDoc.id,
            name: data.name || "",
            primaryMuscles: data.primaryMuscles || [],
            video_url: data.videoUrl || data.video_url || null,
            muscle_activation: data.muscle_activation || null,
            implements: data.implements || null,
          });
        }
      }
    })
  );

  // 2. Exercises from exercises_library (flat docs where each exercise is a field)
  const libSnap = await db
    .collection("exercises_library")
    .where("creator_id", "==", auth.userId)
    .get();

  // Exclude 'exercises' (post-migration sub-map) and 'icon' from the legacy iteration —
  // they're not exercise entries.
  const metaKeys = new Set(["creator_id", "creator_name", "title", "created_at", "updated_at", "icon", "exercises"]);

  for (const libDoc of libSnap.docs) {
    const libData = libDoc.data();

    // Pass 1: post-migration sub-map (id-keyed entries, displayName field)
    const exMap = libData.exercises as Record<string, Record<string, unknown>> | undefined;
    if (exMap && typeof exMap === "object" && !Array.isArray(exMap)) {
      for (const [exerciseId, exData] of Object.entries(exMap)) {
        if (!exData || typeof exData !== "object") continue;
        const displayName = (exData.displayName as string | undefined) || exerciseId;
        // Dedupe by libraryId+displayName — covers both new id-keyed and legacy name-keyed entries.
        const dedupeKey = `${libDoc.id}::${displayName}`;
        if (seen.has(dedupeKey)) continue;
        const ma = (exData.muscle_activation || {}) as Record<string, number>;
        const primaryMuscles = Object.entries(ma)
          .sort((a, b) => b[1] - a[1])
          .map(([m]) => m);
        seen.set(dedupeKey, {
          id: exerciseId,
          libraryExerciseId: exerciseId,
          name: displayName,
          displayName,
          primaryMuscles,
          video_url: (exData.video_url as string) || null,
          muscle_activation: exData.muscle_activation || null,
          implements: exData.implements || null,
          libraryId: libDoc.id,
        });
      }
    }

    // Pass 2: legacy top-level entries (display-name keyed). Only adds entries
    // not already covered by the new sub-map (handles unmigrated libraries).
    for (const [fieldName, fieldVal] of Object.entries(libData)) {
      if (metaKeys.has(fieldName) || typeof fieldVal !== "object" || fieldVal === null || Array.isArray(fieldVal)) continue;
      const dedupeKey = `${libDoc.id}::${fieldName}`;
      if (seen.has(dedupeKey)) continue;
      const exData = fieldVal as Record<string, unknown>;
      const ma = (exData.muscle_activation || {}) as Record<string, number>;
      const primaryMuscles = Object.entries(ma)
        .sort((a, b) => b[1] - a[1])
        .map(([m]) => m);
      // For unmigrated libraries the canonical primary[libId] value is the displayName
      // itself (top-level field key). Emitting `${libId}_${fieldName}` here would later
      // be written verbatim into primary, breaking history keys and lookups. Use the
      // bare fieldName so dual-shape readers resolve via the legacy top-level path.
      seen.set(dedupeKey, {
        id: fieldName,
        libraryExerciseId: null,
        name: fieldName,
        displayName: fieldName,
        primaryMuscles,
        video_url: (exData.video_url as string) || null,
        muscle_activation: exData.muscle_activation || null,
        implements: exData.implements || null,
        libraryId: libDoc.id,
      });
    }
  }

  res.json({data: Array.from(seen.values())});
});

// GET /creator/library/sessions
router.get("/creator/library/sessions", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const sessionsCol = db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions");

  const slim = req.query.slim === "true";
  const snap = await sessionsCol.orderBy("created_at", "desc").get();

  if (slim) {
    const data = snap.docs.map((d) => ({
      sessionId: d.id,
      id: d.id,
      title: (d.data().title as string) ?? "",
      image_url: (d.data().image_url as string) ?? null,
    }));
    res.json({data});
    return;
  }

  const fields = req.query.fields as string | undefined;
  if (fields === "exercises") {
    // Return sessions with exercises (for muscle heatmap) but skip sets — saves ~180 reads
    const sessionsWithExercises = await Promise.all(
      snap.docs.map(async (d) => {
        const exSnap = await d.ref.collection("exercises").orderBy("order", "asc").get();
        return {doc: d, exercises: exSnap.docs};
      })
    );

    // Collect unique library IDs from exercise primary references
    const libraryIdsSet = new Set<string>();
    for (const {exercises} of sessionsWithExercises) {
      for (const eDoc of exercises) {
        const primary = eDoc.data().primary;
        if (primary && typeof primary === "object") {
          for (const libId of Object.keys(primary)) {
            if (libId) libraryIdsSet.add(libId);
          }
        }
      }
    }

    // Batch-fetch all referenced exercise libraries (deduped)
    const libraryCache: Record<string, FirebaseFirestore.DocumentData | null> = {};
    const libIds = Array.from(libraryIdsSet);
    if (libIds.length > 0) {
      const libDocs = await Promise.all(
        libIds.map((id) => db.collection("exercises_library").doc(id).get())
      );
      libDocs.forEach((ld) => {
        if (ld.exists) libraryCache[ld.id] = ld.data() ?? null;
      });
    }

    // Assemble response with resolved muscle_activation
    const data = sessionsWithExercises.map(({doc, exercises}) => {
      const sessionData = doc.data();
      return {
        sessionId: doc.id,
        id: doc.id,
        title: sessionData.title ?? "",
        image_url: sessionData.image_url ?? null,
        created_at: sessionData.created_at ?? null,
        order: sessionData.order ?? null,
        exercises: exercises.map((eDoc) => {
          const exData = eDoc.data();
          // primary[libId] is a stable exerciseId (post-migration) or a display name (legacy).
          // resolveLibraryExercise handles both shapes.
          let resolvedMuscleActivation: Record<string, number> | null = null;
          let resolvedDisplayName: string = exData.name ?? "";
          if (exData.primary && typeof exData.primary === "object") {
            const entries = Object.entries(exData.primary);
            if (entries.length > 0) {
              const [libraryId, idOrName] = entries[0];
              const libData = libraryCache[libraryId as string] as Record<string, unknown> | null;
              if (libData) {
                const resolved = resolveLibraryExercise(libData, idOrName as string);
                const entry = resolved?.data;
                if (entry?.muscle_activation && typeof entry.muscle_activation === "object") {
                  resolvedMuscleActivation = entry.muscle_activation as Record<string, number>;
                }
                if (!resolvedDisplayName) {
                  resolvedDisplayName = resolved?.displayName ?? (idOrName as string);
                }
              }
            }
          }
          return {
            exerciseId: eDoc.id,
            id: eDoc.id,
            name: resolvedDisplayName,
            primary: exData.primary ?? null,
            primaryMuscles: exData.primaryMuscles ?? [],
            muscle_activation: resolvedMuscleActivation,
            order: exData.order ?? 0,
          };
        }),
      };
    });

    res.json({data});
    return;
  }

  const data = await Promise.all(
    snap.docs.map(async (d) => {
      const exSnap = await d.ref.collection("exercises").orderBy("order", "asc").get();
      const exercises = await Promise.all(
        exSnap.docs.map(async (eDoc) => {
          const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
          return {...eDoc.data(), exerciseId: eDoc.id, id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), setId: s.id, id: s.id}))};
        })
      );
      return {...d.data(), sessionId: d.id, id: d.id, exercises};
    })
  );

  res.json({data});
});

// POST /creator/library/sessions
router.post("/creator/library/sessions", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const body = validateBody<{ title: string; image_url?: string }>(
    {title: "string", image_url: "optional_string"},
    req.body
  );
  const sessionData: Record<string, unknown> = {
    title: body.title,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };
  if (body.image_url) sessionData.image_url = body.image_url;

  // Auto-seed defaultDataTemplate from creator's first objective preset (or sensible default)
  const DEFAULT_TEMPLATE = {
    measures: ["reps", "weight", "intensity"],
    objectives: ["reps", "intensity", "previous"],
    customMeasureLabels: {},
    customObjectiveLabels: {},
  };
  const presetsSnap = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("objective_presets")
    .orderBy("created_at", "desc")
    .limit(1)
    .get();
  if (!presetsSnap.empty) {
    const preset = presetsSnap.docs[0].data();
    const objectives = Array.isArray(preset.objectives) && preset.objectives.includes("previous") ?
      preset.objectives :
      [...(Array.isArray(preset.objectives) ? preset.objectives : []), "previous"];
    sessionData.defaultDataTemplate = {
      measures: Array.isArray(preset.measures) && preset.measures.length > 0 ? preset.measures : DEFAULT_TEMPLATE.measures,
      objectives: objectives.length > 0 ? objectives : DEFAULT_TEMPLATE.objectives,
      customMeasureLabels: preset.customMeasureLabels || {},
      customObjectiveLabels: preset.customObjectiveLabels || {},
    };
  } else {
    sessionData.defaultDataTemplate = DEFAULT_TEMPLATE;
  }

  const ref = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions")
    .add(sessionData);

  res.status(201).json({data: {sessionId: ref.id, id: ref.id}});
});

// PATCH /creator/library/sessions/reorder
router.patch("/creator/library/sessions/reorder", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const {order} = req.body;
  if (!Array.isArray(order) || order.length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "order must be a non-empty array of session IDs");
  }

  const sessionsCol = db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions");

  const batch = db.batch();
  order.forEach((sessionId: string, index: number) => {
    batch.update(sessionsCol.doc(sessionId), {order: index, updated_at: FieldValue.serverTimestamp()});
  });
  await batch.commit();

  res.json({success: true});
});

// GET /creator/library/sessions/:sessionId
router.get("/creator/library/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const sessionRef = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  const doc = await sessionRef.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Esta sesión no existe o fue eliminada");

  const exercisesSnap = await sessionRef.collection("exercises").orderBy("order", "asc").get();

  const exercisesRaw = await Promise.all(
    exercisesSnap.docs.map(async (eDoc) => {
      const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
      return {...eDoc.data(), exerciseId: eDoc.id, id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), setId: s.id, id: s.id}))};
    })
  );

  // Hydrate `name` per exercise from the library doc so clients render display names
  // even when primary[libId] is a stable id (post-migration shape).
  const libIds = new Set<string>();
  for (const ex of exercisesRaw) {
    const primary = (ex as Record<string, unknown>).primary as Record<string, string> | undefined;
    if (primary && typeof primary === "object") {
      Object.keys(primary).forEach((k) => libIds.add(k));
    }
  }
  const libCache: Record<string, Record<string, unknown> | null> = {};
  if (libIds.size > 0) {
    const libDocs = await Promise.all(
      Array.from(libIds).map((id) => db.collection("exercises_library").doc(id).get())
    );
    libDocs.forEach((ld) => {
      libCache[ld.id] = ld.exists ? (ld.data() as Record<string, unknown>) : null;
    });
  }
  const exercises = exercisesRaw.map((ex) => {
    const primary = (ex as Record<string, unknown>).primary as Record<string, string> | undefined;
    if (!primary || typeof primary !== "object") return ex;
    const entries = Object.entries(primary);
    if (entries.length === 0) return ex;
    const [libId, idOrName] = entries[0];
    const libData = libCache[libId];
    if (!libData) return ex;
    const resolved = resolveLibraryExercise(libData, idOrName);
    if (!resolved) return ex;
    return {...ex, name: resolved.displayName};
  });

  res.json({data: {...doc.data(), sessionId: doc.id, id: doc.id, exercises}});
});

// PATCH /creator/library/sessions/:sessionId
router.patch("/creator/library/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  const allowedFields = ["title", "order", "isRestDay", "image_url", "defaultDataTemplate"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {updated: true}});
});

// POST /creator/library/sessions/:sessionId/image/upload-url
router.post("/creator/library/sessions/:sessionId/image/upload-url", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const sessionRef = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  const doc = await sessionRef.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  const {contentType} = validateBody<{ contentType: string }>({contentType: "string"}, req.body);

  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const storagePath = `creator_libraries/${auth.userId}/sessions/${req.params.sessionId}/image.${ext}`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  res.json({data: {uploadUrl: url, storagePath}});
});

// POST /creator/library/sessions/:sessionId/image/confirm
router.post("/creator/library/sessions/:sessionId/image/confirm", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const {storagePath} = validateBody<{ storagePath: string }>({storagePath: "string"}, req.body);

  validateStoragePath(storagePath, `creator_libraries/${auth.userId}/sessions/${req.params.sessionId}/`);

  const bucket = admin.storage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado");

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

  const sessionRef = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  await sessionRef.update({
    image_url: publicUrl,
    image_path: storagePath,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({data: {image_url: publicUrl, image_path: storagePath}});
});

// DELETE /creator/library/sessions/:sessionId
router.delete("/creator/library/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(req.params.sessionId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");

  // Cascade delete: exercises → sets
  const exSnap = await ref.collection("exercises").get();
  let batch = db.batch();
  let count = 0;
  for (const eDoc of exSnap.docs) {
    const setsSnap = await eDoc.ref.collection("sets").get();
    for (const sDoc of setsSnap.docs) {
      batch.delete(sDoc.ref);
      count++;
      if (count >= 450) {
        await batch.commit(); batch = db.batch(); count = 0;
      }
    }
    batch.delete(eDoc.ref);
    count++;
    if (count >= 450) {
      await batch.commit(); batch = db.batch(); count = 0;
    }
  }
  batch.delete(ref);
  await batch.commit();
  res.status(204).send();
});

// Library session exercise/set CRUD — with allowlisted fields
router.post("/creator/library/sessions/:sessionId/exercises", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const allowedExFields = [
    "name", "order", "libraryId", "primaryMuscles", "notes",
    "primary", "alternatives", "objectives", "measures",
    "customMeasureLabels", "customObjectiveLabels", "defaultSetValues",
  ];
  const exData = pickFields(req.body, allowedExFields);
  exData.created_at = FieldValue.serverTimestamp();
  exData.updated_at = FieldValue.serverTimestamp();

  const ref = await db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises")
    .add(exData);

  res.status(201).json({data: {exerciseId: ref.id, id: ref.id}});
});

router.patch("/creator/library/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId);

  const allowedFields = [
    "name", "order", "libraryId", "primaryMuscles", "notes", "videoUrl", "thumbnailUrl",
    "primary", "alternatives", "objectives", "measures",
    "customMeasureLabels", "customObjectiveLabels", "defaultSetValues", "video_source",
  ];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {exerciseId: req.params.exerciseId, updated: true}});
});

router.delete("/creator/library/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const exRef = db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId);

  const setsSnap = await exRef.collection("sets").get();
  const batch = db.batch();
  for (const s of setsSnap.docs) batch.delete(s.ref);
  batch.delete(exRef);
  await batch.commit();
  res.status(204).send();
});

router.post("/creator/library/sessions/:sessionId/exercises/:exerciseId/sets", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const body = validateBody<{
    order: number; title?: string; reps?: string | number;
    weight?: number; intensity?: string; rir?: number;
    restSeconds?: number; type?: string;
    duration?: number; rep_sequence?: number[];
  }>(
    {
      order: "number",
      title: "optional_string",
      reps: "optional_string_or_number",
      weight: "optional_number",
      intensity: "optional_string",
      rir: "optional_number",
      restSeconds: "optional_number",
      type: "optional_string",
      duration: "optional_number",
      rep_sequence: "optional_array",
    },
    req.body
  );

  if (body.rep_sequence && !body.rep_sequence.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "rep_sequence debe ser un array de números positivos", "rep_sequence");
  }

  const ref = await db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets")
    .add({...body, created_at: FieldValue.serverTimestamp()});

  res.status(201).json({data: {setId: ref.id, id: ref.id}});
});

router.patch("/creator/library/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets").doc(req.params.setId);

  const allowedFields = ["order", "title", "reps", "weight", "intensity", "rir", "restSeconds", "type", "duration", "rep_sequence"];
  const updates = pickFields(req.body, allowedFields);

  if (updates.rep_sequence !== undefined) {
    const seq = updates.rep_sequence;
    if (seq !== null && (!Array.isArray(seq) || !seq.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0))) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "rep_sequence debe ser un array de números positivos", "rep_sequence");
    }
  }

  // Allow custom objective/measure fields (custom_*)
  for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
    if (key.startsWith("custom_") && (typeof value === "string" || typeof value === "number" || value === null)) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {setId: req.params.setId, updated: true}});
});

router.delete("/creator/library/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  await db
    .collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(req.params.sessionId)
    .collection("exercises").doc(req.params.exerciseId)
    .collection("sets").doc(req.params.setId)
    .delete();

  res.status(204).send();
});

// ─── Library Modules CRUD ──────────────────────────────────────────────

router.get("/creator/library/modules", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const snap = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("modules")
    .orderBy("created_at", "desc")
    .get();

  res.json({data: snap.docs.map((d) => ({...d.data(), moduleId: d.id}))});
});

router.post("/creator/library/modules", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const body = validateBody<{ title: string }>({title: "string"}, req.body);
  const ref = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("modules")
    .add({title: body.title, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()});

  res.status(201).json({data: {moduleId: ref.id}});
});

router.get("/creator/library/modules/:moduleId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const doc = await db.collection("creator_libraries").doc(auth.userId).collection("modules").doc(req.params.moduleId).get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");

  res.json({data: {...doc.data(), moduleId: doc.id}});
});

router.patch("/creator/library/modules/:moduleId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db.collection("creator_libraries").doc(auth.userId).collection("modules").doc(req.params.moduleId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");

  const allowedFields = ["title", "order"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {updated: true}});
});

router.delete("/creator/library/modules/:moduleId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db.collection("creator_libraries").doc(auth.userId).collection("modules").doc(req.params.moduleId);
  const doc = await ref.get();
  if (!doc.exists) throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");

  // Module references sessions by sessionRefs — but the sessions live at creator_libraries/{id}/sessions/
  // not as subcollections of the module, so we only need to delete the module doc itself.
  // (Library sessions are standalone docs, not subcollections of modules.)
  await ref.delete();
  res.status(204).send();
});

// ─── Library Propagation ──────────────────────────────────────────────────

// GET /creator/library/sessions/:sessionId/affected
router.get("/creator/library/sessions/:sessionId/affected", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const sessionId = req.params.sessionId;
  const wantDetails = req.query.details === "true";

  let programCount = 0;
  const affectedPlanIds: string[] = [];
  const affectedCourseIds: string[] = [];
  const affectedUserIdSet = new Set<string>();

  // Phase 1: Check plans collection (one-on-one plans)
  const plansSnap = await db
    .collection("plans")
    .where("creator_id", "==", auth.userId)
    .limit(100)
    .get();

  for (const planDoc of plansSnap.docs) {
    const modulesSnap = await planDoc.ref.collection("modules").get();
    let planHasRef = false;
    for (const moduleDoc of modulesSnap.docs) {
      const newSnap = await moduleDoc.ref.collection("sessions")
        .where("source_library_session_id", "==", sessionId)
        .limit(1)
        .get();
      if (!newSnap.empty) {
        planHasRef = true; break;
      }
      const oldSnap = await moduleDoc.ref.collection("sessions")
        .where("librarySessionRef", "==", sessionId)
        .limit(1)
        .get();
      if (!oldSnap.empty) {
        planHasRef = true; break;
      }
    }
    if (planHasRef) {
      programCount++;
      affectedPlanIds.push(planDoc.id);
    }
  }

  // Phase 2: Check courses collection (group programs)
  const coursesSnap = await db
    .collection("courses")
    .where("creator_id", "==", auth.userId)
    .limit(100)
    .get();

  for (const courseDoc of coursesSnap.docs) {
    const modulesSnap = await courseDoc.ref.collection("modules").get();
    let courseHasRef = false;
    for (const moduleDoc of modulesSnap.docs) {
      const newSnap = await moduleDoc.ref.collection("sessions")
        .where("source_library_session_id", "==", sessionId)
        .limit(1)
        .get();
      if (!newSnap.empty) {
        courseHasRef = true; break;
      }
      const oldSnap = await moduleDoc.ref.collection("sessions")
        .where("librarySessionRef", "==", sessionId)
        .limit(1)
        .get();
      if (!oldSnap.empty) {
        courseHasRef = true; break;
      }
    }
    if (courseHasRef) {
      programCount++;
      affectedCourseIds.push(courseDoc.id);
    }
  }

  // Phase 3: Find affected users from plans (via planAssignments)
  if (affectedPlanIds.length > 0) {
    const affectedPlanIdSet = new Set(affectedPlanIds);
    const clientsSnap = await db
      .collection("one_on_one_clients")
      .where("creatorId", "==", auth.userId)
      .get();

    for (const clientDoc of clientsSnap.docs) {
      const clientUserId = clientDoc.data().clientUserId as string;
      const userDoc = await db.collection("users").doc(clientUserId).get();
      if (!userDoc.exists) continue;
      const courses = userDoc.data()?.courses ?? {};
      for (const courseData of Object.values(courses) as Array<Record<string, unknown>>) {
        const assignments = (courseData?.planAssignments ?? {}) as Record<string, { planId: string }>;
        for (const val of Object.values(assignments)) {
          if (affectedPlanIdSet.has(val.planId)) {
            affectedUserIdSet.add(clientUserId);
            break;
          }
        }
        if (affectedUserIdSet.has(clientUserId)) break;
      }
    }
  }

  // Phase 4: Find affected users from courses (via users.courses map)
  if (affectedCourseIds.length > 0) {
    const affectedCourseIdSet = new Set(affectedCourseIds);
    const clientsSnap = await db
      .collection("one_on_one_clients")
      .where("creatorId", "==", auth.userId)
      .get();

    const checkedUserIds = new Set<string>();
    for (const clientDoc of clientsSnap.docs) {
      const clientUserId = clientDoc.data().clientUserId as string;
      if (checkedUserIds.has(clientUserId)) continue;
      checkedUserIds.add(clientUserId);
      const userDoc = await db.collection("users").doc(clientUserId).get();
      if (!userDoc.exists) continue;
      const userCourses = userDoc.data()?.courses ?? {};
      for (const courseId of Object.keys(userCourses)) {
        if (affectedCourseIdSet.has(courseId)) {
          affectedUserIdSet.add(clientUserId);
          break;
        }
      }
    }

    for (const courseId of affectedCourseIds) {
      const usersWithCourse = await db
        .collection("users")
        .where(`courses.${courseId}.status`, "==", "active")
        .limit(200)
        .get();
      for (const userDoc of usersWithCourse.docs) {
        affectedUserIdSet.add(userDoc.id);
      }
    }
  }

  // Phase 5: Check client_sessions for direct assignments from this library session
  const [csSnapBySessionId, csSnapBySourceId] = await Promise.all([
    db.collection("client_sessions")
      .where("creator_id", "==", auth.userId)
      .where("session_id", "==", sessionId)
      .limit(200)
      .get(),
    db.collection("client_sessions")
      .where("creator_id", "==", auth.userId)
      .where("source_session_id", "==", sessionId)
      .limit(200)
      .get(),
  ]);

  const seenCsDocs = new Set<string>();
  for (const csDoc of [...csSnapBySessionId.docs, ...csSnapBySourceId.docs]) {
    if (seenCsDocs.has(csDoc.id)) continue;
    seenCsDocs.add(csDoc.id);
    const clientId = csDoc.data().client_id as string;
    if (clientId) affectedUserIdSet.add(clientId);
  }

  const affectedUserIds = Array.from(affectedUserIdSet);

  if (wantDetails) {
    // Fetch program/plan details
    const programs: Array<{ id: string; title: string; type: string }> = [];
    for (const planId of affectedPlanIds) {
      const pDoc = plansSnap.docs.find((d) => d.id === planId);
      programs.push({id: planId, title: (pDoc?.data()?.title as string) || planId, type: "plan"});
    }
    for (const courseId of affectedCourseIds) {
      const cDoc = coursesSnap.docs.find((d) => d.id === courseId);
      programs.push({id: courseId, title: (cDoc?.data()?.title as string) || courseId, type: "course"});
    }

    // Fetch user details
    let detailedUsers: Array<{ userId: string; displayName: string }> = [];
    if (affectedUserIds.length > 0) {
      const userDocs = await Promise.all(
        affectedUserIds.slice(0, 50).map((uid) => db.collection("users").doc(uid).get())
      );
      detailedUsers = userDocs
        .filter((d) => d.exists)
        .map((d) => ({
          userId: d.id,
          displayName: (d.data()?.displayName || d.data()?.email || d.id) as string,
        }));
    }

    res.json({data: {users: detailedUsers, programs, programCount}});
    return;
  }

  res.json({data: {affectedUserIds, programCount}});
});

// POST /creator/library/sessions/:sessionId/propagate
// Body: { mode: "all" | "forward_only" }
// "all" = overwrite all downstream copies (plans + clients lose personalization)
// "forward_only" = library is already updated; existing copies untouched, new assignments get latest
router.post("/creator/library/sessions/:sessionId/propagate", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const mode = (req.body?.mode as string) ?? "all";

  const libSessionRef = db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("sessions")
    .doc(req.params.sessionId);

  const libSessionDoc = await libSessionRef.get();
  if (!libSessionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesion de libreria no encontrada");
  }

  // "forward_only" mode: library session is already updated, no copies to change
  if (mode === "forward_only") {
    res.json({data: {updatedCount: 0, mode: "forward_only"}});
    return;
  }

  const libSessionData = libSessionDoc.data()!;

  // Fetch exercises + sets from the library session
  const exercisesSnap = await libSessionRef.collection("exercises").orderBy("order", "asc").get();
  const exercises = await Promise.all(
    exercisesSnap.docs.map(async (eDoc) => {
      const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
      return {
        data: eDoc.data(),
        sets: setsSnap.docs.map((s) => s.data()),
      };
    })
  );

  // Fetch all plans for this creator via cursor pagination (no silent truncation)
  const planDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  {
    const PAGE_SIZE = 100;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    for (;;) {
      let q = db.collection("plans")
        .where("creator_id", "==", auth.userId)
        .orderBy("__name__")
        .limit(PAGE_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      const page = await q.get();
      if (page.empty) break;
      planDocs.push(...page.docs);
      if (page.size < PAGE_SIZE) break;
      lastDoc = page.docs[page.docs.length - 1];
    }
  }

  let updatedCount = 0;
  const batchSize = 450;

  // Helper: commit writes in batches of 450
  const commitInBatches = async (ops: Array<{ type: "set" | "update" | "delete"; ref: FirebaseFirestore.DocumentReference; data?: Record<string, unknown> }>) => {
    for (let i = 0; i < ops.length; i += batchSize) {
      const chunk = ops.slice(i, i + batchSize);
      const batch = db.batch();
      for (const op of chunk) {
        if (op.type === "delete") batch.delete(op.ref);
        else if (op.type === "update") batch.update(op.ref, op.data!);
        else batch.set(op.ref, op.data!);
      }
      await batch.commit();
    }
  };

  // Helper: replace exercises/sets on a session doc with library content
  const replaceSessionContent = async (sessionRef: FirebaseFirestore.DocumentReference, extraFields?: Record<string, unknown>) => {
    const ops: Array<{ type: "set" | "update" | "delete"; ref: FirebaseFirestore.DocumentReference; data?: Record<string, unknown> }> = [];

    ops.push({
      type: "update",
      ref: sessionRef,
      data: {
        title: libSessionData.title,
        source_library_session_id: req.params.sessionId,
        updated_at: FieldValue.serverTimestamp(),
        ...(extraFields ?? {}),
      },
    });

    // Read existing exercises + their sets in parallel
    const existingExSnap = await sessionRef.collection("exercises").get();
    const allSetSnaps = await Promise.all(
      existingExSnap.docs.map((exDoc) => exDoc.ref.collection("sets").get())
    );

    // Queue deletes for all existing sets and exercises
    for (const setSnap of allSetSnaps) {
      for (const setDoc of setSnap.docs) {
        ops.push({type: "delete", ref: setDoc.ref});
      }
    }
    for (const exDoc of existingExSnap.docs) {
      ops.push({type: "delete", ref: exDoc.ref});
    }

    // Queue creates for library content
    for (const ex of exercises) {
      const newExRef = sessionRef.collection("exercises").doc();
      ops.push({type: "set", ref: newExRef, data: {...ex.data, id: newExRef.id, created_at: FieldValue.serverTimestamp()}});

      for (const setData of ex.sets) {
        const newSetRef = newExRef.collection("sets").doc();
        ops.push({type: "set", ref: newSetRef, data: {...setData, id: newSetRef.id, created_at: FieldValue.serverTimestamp()}});
      }
    }

    await commitInBatches(ops);
    updatedCount++;
  };

  // Helper: find sessions referencing this library session (supports both old and new field names)
  const findReferencingSessions = async (parentRef: FirebaseFirestore.CollectionReference) => {
    const [newSnap, oldSnap] = await Promise.all([
      parentRef.where("source_library_session_id", "==", req.params.sessionId).get(),
      parentRef.where("librarySessionRef", "==", req.params.sessionId).get(),
    ]);
    const seen = new Set<string>();
    const results: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    for (const doc of [...newSnap.docs, ...oldSnap.docs]) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        results.push(doc);
      }
    }
    return results;
  };

  // Phase 1: Update plan template sessions (parallelized per plan)
  await Promise.all(planDocs.map(async (planDoc) => {
    const modulesSnap = await planDoc.ref.collection("modules").get();
    await Promise.all(modulesSnap.docs.map(async (moduleDoc) => {
      const matchingSessions = await findReferencingSessions(moduleDoc.ref.collection("sessions"));
      for (const sessionDoc of matchingSessions) {
        await replaceSessionContent(sessionDoc.ref);
      }
    }));
  }));

  // Phase 2: Update client_plan_content snapshots (parallelized per client)
  const clientsSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .get();

  await Promise.all(clientsSnap.docs.map(async (clientDoc) => {
    const clientUserId = clientDoc.data().clientUserId as string;
    const userDoc = await db.collection("users").doc(clientUserId).get();
    if (!userDoc.exists) return;
    const courses = userDoc.data()?.courses ?? {};

    const weekTasks: Array<Promise<void>> = [];
    for (const [programId, courseData] of Object.entries(courses) as Array<[string, Record<string, unknown>]>) {
      const assignments = (courseData?.planAssignments ?? {}) as Record<string, { planId: string }>;

      for (const weekKey of Object.keys(assignments)) {
        weekTasks.push((async () => {
          const contentDocId = `${clientUserId}_${programId}_${weekKey}`;
          const contentDocRef = db.collection("client_plan_content").doc(contentDocId);
          const contentDoc = await contentDocRef.get();
          if (!contentDoc.exists) return;

          const matchingSessions = await findReferencingSessions(contentDocRef.collection("sessions"));
          for (const sessionDoc of matchingSessions) {
            await replaceSessionContent(sessionDoc.ref);
          }
        })());
      }
    }
    await Promise.all(weekTasks);
  }));

  // Phase 3: Update client_session_content (date-assigned sessions, parallelized)
  const dateSessionsSnap = await db
    .collection("client_session_content")
    .where("source_session_id", "==", req.params.sessionId)
    .where("creator_id", "==", auth.userId)
    .get();

  await Promise.all(dateSessionsSnap.docs.map(async (contentDoc) => {
    await replaceSessionContent(contentDoc.ref, {
      image_url: libSessionData.image_url ?? null,
    });
  }));

  res.json({data: {updatedCount, mode: "all"}});
});

// POST /creator/library/modules/:moduleId/propagate
router.post("/creator/library/modules/:moduleId/propagate", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const libModuleRef = db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("modules")
    .doc(req.params.moduleId);

  const libModuleDoc = await libModuleRef.get();
  if (!libModuleDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Módulo de librería no encontrado");
  }

  const libModuleData = libModuleDoc.data()!;

  const libSessionsSnap = await libModuleRef.collection("sessions").orderBy("order", "asc").get();
  const libSessions = await Promise.all(
    libSessionsSnap.docs.map(async (sDoc) => {
      const exSnap = await sDoc.ref.collection("exercises").orderBy("order", "asc").get();
      const exercises = await Promise.all(
        exSnap.docs.map(async (eDoc) => {
          const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
          return {data: eDoc.data(), sets: setsSnap.docs.map((s) => s.data())};
        })
      );
      return {data: sDoc.data(), exercises};
    })
  );

  // Fetch all plans for this creator via cursor pagination (no silent truncation)
  const planDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  {
    const PAGE_SIZE = 100;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    for (;;) {
      let q = db.collection("plans")
        .where("creator_id", "==", auth.userId)
        .orderBy("__name__")
        .limit(PAGE_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      const page = await q.get();
      if (page.empty) break;
      planDocs.push(...page.docs);
      if (page.size < PAGE_SIZE) break;
      lastDoc = page.docs[page.docs.length - 1];
    }
  }

  let updatedCount = 0;
  const batchSize = 450;
  let batch = db.batch();
  let batchCount = 0;

  for (const planDoc of planDocs) {
    // Check both field names for module references
    const modulesSnap1 = await planDoc.ref.collection("modules")
      .where("libraryRef", "==", req.params.moduleId)
      .get();
    const modulesSnap2 = await planDoc.ref.collection("modules")
      .where("libraryModuleRef", "==", req.params.moduleId)
      .get();
    const seenModIds = new Set(modulesSnap1.docs.map((d) => d.id));
    const modulesSnap = {docs: [...modulesSnap1.docs]};
    for (const d of modulesSnap2.docs) {
      if (!seenModIds.has(d.id)) modulesSnap.docs.push(d);
    }

    for (const moduleDoc of modulesSnap.docs) {
      batch.update(moduleDoc.ref, {
        title: libModuleData.title ?? moduleDoc.data().title,
        updated_at: FieldValue.serverTimestamp(),
      });
      batchCount++;
      if (batchCount >= batchSize) {
        await batch.commit(); batch = db.batch(); batchCount = 0;
      }

      const existingSessionsSnap = await moduleDoc.ref.collection("sessions").get();
      for (const sDoc of existingSessionsSnap.docs) {
        const exSnap = await sDoc.ref.collection("exercises").get();
        for (const eDoc of exSnap.docs) {
          const setsSnap = await eDoc.ref.collection("sets").get();
          for (const setDoc of setsSnap.docs) {
            batch.delete(setDoc.ref);
            batchCount++;
            if (batchCount >= batchSize) {
              await batch.commit(); batch = db.batch(); batchCount = 0;
            }
          }
          batch.delete(eDoc.ref);
          batchCount++;
          if (batchCount >= batchSize) {
            await batch.commit(); batch = db.batch(); batchCount = 0;
          }
        }
        batch.delete(sDoc.ref);
        batchCount++;
        if (batchCount >= batchSize) {
          await batch.commit(); batch = db.batch(); batchCount = 0;
        }
      }

      for (const libSession of libSessions) {
        const newSessionRef = moduleDoc.ref.collection("sessions").doc();
        batch.set(newSessionRef, {...libSession.data, created_at: FieldValue.serverTimestamp()});
        batchCount++;
        if (batchCount >= batchSize) {
          await batch.commit(); batch = db.batch(); batchCount = 0;
        }

        for (const ex of libSession.exercises) {
          const newExRef = newSessionRef.collection("exercises").doc();
          batch.set(newExRef, {...ex.data, created_at: FieldValue.serverTimestamp()});
          batchCount++;
          if (batchCount >= batchSize) {
            await batch.commit(); batch = db.batch(); batchCount = 0;
          }

          for (const setData of ex.sets) {
            const newSetRef = newExRef.collection("sets").doc();
            batch.set(newSetRef, {...setData, created_at: FieldValue.serverTimestamp()});
            batchCount++;
            if (batchCount >= batchSize) {
              await batch.commit(); batch = db.batch(); batchCount = 0;
            }
          }
        }
      }

      updatedCount++;
    }
  }

  if (batchCount > 0) await batch.commit();

  res.json({data: {updatedCount}});
});

// ─── Client Programs (One-on-One Scheduling) ──────────────────────────────

// GET /creator/clients/:clientId/programs
router.get("/creator/clients/:clientId/programs", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const userDoc = await db.collection("users").doc(req.params.clientId).get();
  const courses = userDoc.data()?.courses ?? {};

  const programs = Object.entries(courses)
    .filter(([, v]) => (v as Record<string, unknown>).deliveryType === "one_on_one")
    .map(([courseId, v]) => ({courseId, ...(v as Record<string, unknown>)}));

  res.json({data: programs});
});

// POST /creator/clients/:clientId/programs/:programId
router.post("/creator/clients/:clientId/programs/:programId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  // C-10 v2: support the "creator assigns a program to a not-yet-accepted
  // client" flow. Today verifyClientAccess fails closed on `pending`; instead,
  // when the relationship is pending, attach the program to the row so it
  // auto-grants on the user's accept. Active relationships keep the existing
  // immediate-assignment behavior.
  const relationshipSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .where("clientUserId", "==", req.params.clientId)
    .limit(1)
    .get();
  if (relationshipSnap.empty) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este cliente");
  }
  const relationshipDoc = relationshipSnap.docs[0];
  const relationshipStatus = (relationshipDoc.data().status as string | undefined) ?? "active";

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  // Audit M-09: validate creator-supplied accessDuration + expiresAt before
  // writing into user.courses[programId] OR pendingProgramAssignment.
  const ALLOWED_ACCESS_DURATIONS_LOCAL = new Set([
    "one_on_one", "monthly", "3-month", "6-month", "yearly", "lifetime",
  ]);
  let accessDurationInput = "one_on_one";
  if (req.body.accessDuration !== undefined) {
    if (typeof req.body.accessDuration !== "string" ||
        !ALLOWED_ACCESS_DURATIONS_LOCAL.has(req.body.accessDuration)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `accessDuration debe ser uno de: ${[...ALLOWED_ACCESS_DURATIONS_LOCAL].join(", ")}`,
        "accessDuration"
      );
    }
    accessDurationInput = req.body.accessDuration;
  }

  let expiresAtInput: string | null = null;
  if (req.body.expiresAt !== undefined && req.body.expiresAt !== null) {
    if (typeof req.body.expiresAt !== "string") {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400, "expiresAt debe ser ISO string", "expiresAt"
      );
    }
    const parsed = new Date(req.body.expiresAt);
    if (isNaN(parsed.getTime())) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400, "expiresAt debe ser una fecha válida", "expiresAt"
      );
    }
    const fiveYears = Date.now() + 5 * 365 * 24 * 60 * 60 * 1000;
    if (parsed.getTime() > fiveYears) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400, "expiresAt no puede exceder 5 años", "expiresAt"
      );
    }
    expiresAtInput = parsed.toISOString();
  }

  // Pending branch — stash the intent; user's accept will run the actual
  // assignment. Idempotent on the same program; overwrites a different one.
  if (relationshipStatus === "pending") {
    await relationshipDoc.ref.update({
      pendingProgramAssignment: {
        programId: req.params.programId,
        accessDuration: accessDurationInput,
        expiresAt: expiresAtInput,
        attachedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.status(202).json({data: {
      status: "pending",
      pending: true,
      message: "Invitación enviada. Se asignará el programa cuando el usuario acepte.",
    }});
    return;
  }

  const userRef = db.collection("users").doc(req.params.clientId);
  const userDoc = await userRef.get();
  const courses = userDoc.data()?.courses ?? {};

  // Idempotent: if already assigned, return success
  if (courses[req.params.programId]) {
    const existing = courses[req.params.programId];
    res.status(200).json({data: {
      status: "active",
      assignedAt: existing.assigned_at ?? existing.purchased_at ?? null,
    }});
    return;
  }

  const courseData = courseDoc.data()!;
  const now = new Date().toISOString();

  // accessDuration / expiresAt were already validated above, before the
  // pending branch — reuse them here.
  await userRef.update({
    [`courses.${req.params.programId}`]: {
      status: "active",
      deliveryType: "one_on_one",
      access_duration: accessDurationInput,
      title: courseData.title ?? "",
      image_url: courseData.image_url ?? null,
      discipline: courseData.discipline ?? "General",
      creatorName: courseData.creatorName ?? courseData.creator_name ?? "",
      completedTutorials: {
        dailyWorkout: [],
        warmup: [],
        workoutExecution: [],
        workoutCompletion: [],
      },
      assigned_by: auth.userId,
      assigned_at: now,
      purchased_at: now,
      expires_at: expiresAtInput,
    },
  });

  res.status(201).json({data: {status: "active", assignedAt: now}});
});

// DELETE /creator/clients/:clientId/programs/:programId
router.delete("/creator/clients/:clientId/programs/:programId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  await db.collection("users").doc(req.params.clientId).update({
    [`courses.${req.params.programId}`]: FieldValue.delete(),
  });

  res.status(204).send();
});

// PATCH /creator/clients/:clientId/programs/:programId — update access dates
router.patch("/creator/clients/:clientId/programs/:programId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const {expiresAt} = req.body;
  const update: Record<string, unknown> = {};

  // Audit M-09: validate expiresAt before writing.
  if (expiresAt === null) {
    update[`courses.${req.params.programId}.expires_at`] = FieldValue.delete();
  } else if (typeof expiresAt === "string") {
    const parsed = new Date(expiresAt);
    if (isNaN(parsed.getTime())) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400, "expiresAt debe ser una fecha válida", "expiresAt"
      );
    }
    const fiveYears = Date.now() + 5 * 365 * 24 * 60 * 60 * 1000;
    if (parsed.getTime() > fiveYears) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400, "expiresAt no puede exceder 5 años", "expiresAt"
      );
    }
    update[`courses.${req.params.programId}.expires_at`] = parsed.toISOString();
  }

  if (Object.keys(update).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No hay campos para actualizar");
  }

  await db.collection("users").doc(req.params.clientId).update(update);
  res.json({data: {updated: true}});
});

// PUT /creator/clients/:clientId/programs/:programId/schedule/:weekKey
router.put("/creator/clients/:clientId/programs/:programId/schedule/:weekKey", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const body = validateBody<{ planId: string; moduleId: string }>(
    {planId: "string", moduleId: "string"},
    req.body
  );

  // Store planAssignments per-client on users.courses (not on shared courses doc)
  await db.collection("users").doc(req.params.clientId).update({
    [`courses.${req.params.programId}.planAssignments.${req.params.weekKey}`]: {
      planId: body.planId,
      moduleId: body.moduleId,
      assignedAt: new Date().toISOString(),
    },
  });

  res.json({data: {weekKey: req.params.weekKey, assignedAt: new Date().toISOString()}});
});

// DELETE /creator/clients/:clientId/programs/:programId/schedule/:weekKey
router.delete("/creator/clients/:clientId/programs/:programId/schedule/:weekKey", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  await db.collection("users").doc(req.params.clientId).update({
    [`courses.${req.params.programId}.planAssignments.${req.params.weekKey}`]: FieldValue.delete(),
  });

  res.status(204).send();
});

// ─── New Simplified Endpoints (calendar, assign-plan, remove-plan, mutations) ──

// GET /creator/clients/:clientId/programs/:programId/calendar?month=YYYY-MM
router.get("/creator/clients/:clientId/programs/:programId/calendar", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const month = req.query.month as string;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "month debe ser YYYY-MM", "month");
  }

  const {clientId, programId} = req.params;
  const creatorId = auth.userId;

  const [, userDoc] = await Promise.all([
    verifyClientAccess(auth.userId, clientId),
    db.collection("users").doc(clientId).get(),
  ]);
  const courseEntry = userDoc.data()?.courses?.[programId] as Record<string, unknown> | undefined;
  if (!courseEntry) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Cliente no tiene este programa asignado");
  }
  const planAssignments = (courseEntry.planAssignments ?? {}) as Record<string, { planId: string; moduleId: string; assignedAt?: string }>;

  // 2. Compute visible week keys for the calendar month
  const {start: monthStart, end: monthEnd, weekKeys: visibleWeekKeys} = getCalendarMonthRange(month);
  const weekKeysWithPlans = visibleWeekKeys.filter((wk) => planAssignments[wk]?.planId);
  const startDateStr = toLocalDateISO(monthStart);
  const endDateStr = toLocalDateISO(monthEnd);

  // 3. Run week content, date sessions, and history queries in parallel
  const planModuleCache = new Map<string, Record<string, unknown>>();
  const weeks: Record<string, unknown> = {};

  // Light session read: only session-level docs (no exercises/sets — calendar only needs title/id/dayIndex)
  const readSessionList = async (sessionsCol: FirebaseFirestore.CollectionReference): Promise<Array<Record<string, unknown>>> => {
    const snap = await sessionsCol.orderBy("order", "asc").get();
    return snap.docs.map((d) => ({...d.data(), id: d.id}));
  };

  const [/* weeksDone */, dateSessionsSnap, historySnap] = await Promise.all([
    // 3a. Load week content in parallel
    Promise.all(
      weekKeysWithPlans.map(async (weekKey) => {
        const assignment = planAssignments[weekKey];
        const docId = planContentDocId(clientId, programId, weekKey);
        const docRef = db.collection("client_plan_content").doc(docId);

        // Try client copy first — if the doc exists the week has been personalized,
        // even when all sessions were deleted (empty copy = intentional empty week).
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const sessions = await readSessionList(docRef.collection("sessions"));
          weeks[weekKey] = {
            planId: assignment.planId,
            moduleId: assignment.moduleId,
            moduleTitle: docSnap.data()?.title ?? weekKey,
            isPersonalized: true,
            sessions,
          };
          return;
        }

        // Fallback: read from plan
        const cacheKey = `${assignment.planId}_${assignment.moduleId}`;
        if (!planModuleCache.has(cacheKey)) {
          try {
            const moduleRef = db.collection("plans").doc(assignment.planId)
              .collection("modules").doc(assignment.moduleId);
            const [moduleDoc, sessions] = await Promise.all([
              moduleRef.get(),
              readSessionList(moduleRef.collection("sessions")),
            ]);

            // Collect library refs for batch fetch after all weeks resolve
            const libRefs: Array<{ session: Record<string, unknown>; libRef: string }> = [];
            for (const session of sessions) {
              const libRef = (session.source_library_session_id ?? session.librarySessionRef) as string | undefined;
              if (libRef && creatorId) libRefs.push({session, libRef});
            }
            if (libRefs.length > 0) {
              try {
                const libDocs = await db.getAll(
                  ...libRefs.map(({libRef}) =>
                    db.collection("creator_libraries").doc(creatorId).collection("sessions").doc(libRef))
                );
                for (let li = 0; li < libRefs.length; li++) {
                  const libDoc = libDocs[li];
                  const session = libRefs[li].session;
                  if (libDoc.exists) {
                    const libData = libDoc.data()!;
                    if (!session.title) session.title = libData.title ?? null;
                    if (!session.image_url) session.image_url = libData.image_url ?? null;
                  }
                }
              } catch {/* best-effort */}
            }

            planModuleCache.set(cacheKey, {
              title: moduleDoc.exists ? (moduleDoc.data()?.title ?? weekKey) : weekKey,
              sessions,
            });
          } catch {
            planModuleCache.set(cacheKey, {title: weekKey, sessions: []});
          }
        }

        const cached = planModuleCache.get(cacheKey)!;
        weeks[weekKey] = {
          planId: assignment.planId,
          moduleId: assignment.moduleId,
          moduleTitle: cached.title,
          isPersonalized: false,
          sessions: cached.sessions,
        };
      })
    ).then(async () => {
      // Also check weeks WITHOUT plan assignments for direct client_plan_content docs
      const weekKeysWithoutPlans = visibleWeekKeys.filter((wk) => !planAssignments[wk]?.planId);
      if (weekKeysWithoutPlans.length > 0) {
        const docRefs = weekKeysWithoutPlans.map((wk) =>
          db.collection("client_plan_content").doc(planContentDocId(clientId, programId, wk))
        );
        const docs = await db.getAll(...docRefs);
        await Promise.all(
          docs.map(async (docSnap, i) => {
            if (!docSnap.exists) return;
            const weekKey = weekKeysWithoutPlans[i];
            const sessions = await readSessionList(docSnap.ref.collection("sessions"));
            if (sessions.length === 0) return; // skip empty unplanned weeks
            weeks[weekKey] = {
              planId: null,
              moduleId: null,
              moduleTitle: docSnap.data()?.title ?? weekKey,
              isPersonalized: true,
              sessions,
            };
          })
        );
      }
    }),

    // 3b. Date-assigned sessions for the month
    db.collection("client_sessions")
      .where("client_id", "==", clientId)
      .where("date", ">=", startDateStr)
      .where("date", "<=", endDateStr)
      .orderBy("date", "asc")
      .limit(100)
      .get(),

    // 3c. Completed session history filtered by month range
    db.collection("users").doc(clientId)
      .collection("sessionHistory")
      .where("completedAt", ">=", startDateStr)
      .where("completedAt", "<=", endDateStr + "T23:59:59")
      .orderBy("completedAt", "desc")
      .limit(100)
      .get(),
  ]);


  const dateSessions: Array<Record<string, unknown>> = dateSessionsSnap.docs.map((d) => ({...d.data(), id: d.id}));

  // Enrich date-assigned sessions with image_url from library sessions
  const libSessionRefs = dateSessions.filter(
    (s) => s.library_session_ref && s.session_id && !s.image_url
  );
  if (libSessionRefs.length > 0 && creatorId) {
    try {
      const libDocs = await db.getAll(
        ...libSessionRefs.map((s) =>
          db.collection("creator_libraries").doc(creatorId).collection("sessions").doc(s.session_id as string))
      );
      for (let i = 0; i < libSessionRefs.length; i++) {
        if (libDocs[i].exists) {
          const libData = libDocs[i].data()!;
          if (libData.image_url) libSessionRefs[i].image_url = libData.image_url;
          if (!libSessionRefs[i].session_name && libData.title) libSessionRefs[i].session_name = libData.title;
        }
      }
    } catch {/* best-effort — calendar still works without images */}
  }

  const completedByDate: Record<string, unknown[]> = {};
  for (const hDoc of historySnap.docs) {
    const hData = hDoc.data();
    const completedAt = hData.completedAt as string | undefined;
    if (!completedAt) continue;
    const dateStr = completedAt.slice(0, 10);
    if (!completedByDate[dateStr]) completedByDate[dateStr] = [];
    completedByDate[dateStr].push({id: hDoc.id, ...hData});
  }

  res.json({
    data: {
      planAssignments,
      weeks,
      dateSessions,
      completedByDate,
    },
  });
});

// POST /creator/clients/:clientId/programs/:programId/assign-plan
// Security (audit H-28): verify plan ownership before reading modules.
// Previously a creator could pass another creator's planId, snapshot the
// full plan tree into ensureClientCopy, and effectively read+republish
// any other creator's plan content.
router.post("/creator/clients/:clientId/programs/:programId/assign-plan", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const {clientId, programId} = req.params;
  const {planId, startWeekKey} = req.body;

  if (!planId || typeof planId !== "string") {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "planId es requerido", "planId");
  }
  if (!startWeekKey || typeof startWeekKey !== "string") {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "startWeekKey es requerido", "startWeekKey");
  }

  const planDoc = await db.collection("plans").doc(planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  // 1. Read plan modules
  const modulesSnap = await db.collection("plans").doc(planId)
    .collection("modules").orderBy("order", "asc").get();
  if (modulesSnap.empty) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Este plan no tiene semanas");
  }

  const modules = modulesSnap.docs.map((d) => ({...d.data(), id: d.id}));
  const weekKeys = getConsecutiveWeekKeys(startWeekKey, modules.length);

  // 2. Ensure client is enrolled
  const userRef = db.collection("users").doc(clientId);
  const userDoc = await userRef.get();
  const courses = userDoc.data()?.courses ?? {};

  if (!courses[programId]) {
    // Auto-enroll
    const courseDoc = await db.collection("courses").doc(programId).get();
    if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
    }
    const courseData = courseDoc.data()!;
    const now = new Date().toISOString();
    await userRef.update({
      [`courses.${programId}`]: {
        status: "active",
        deliveryType: "one_on_one",
        access_duration: "one_on_one",
        title: courseData.title ?? "",
        image_url: courseData.image_url ?? null,
        discipline: courseData.discipline ?? "General",
        creatorName: courseData.creatorName ?? courseData.creator_name ?? "",
        assigned_by: auth.userId,
        assigned_at: now,
        purchased_at: now,
        expires_at: null,
      },
    });
  }

  // 3. Write all planAssignments in one update
  const assignmentUpdate: Record<string, unknown> = {};
  for (let i = 0; i < weekKeys.length; i++) {
    assignmentUpdate[`courses.${programId}.planAssignments.${weekKeys[i]}`] = {
      planId,
      moduleId: modules[i].id,
      assignedAt: new Date().toISOString(),
    };
  }
  await userRef.update(assignmentUpdate);

  // 4. Read sessions for each module (pre-resolved response)
  const weeks: Record<string, unknown> = {};
  await Promise.all(
    weekKeys.map(async (wk, i) => {
      const mod = modules[i];
      const moduleRef = db.collection("plans").doc(planId).collection("modules").doc(mod.id);
      const sessions = await readSessionTree(moduleRef.collection("sessions"));
      weeks[wk] = {
        planId,
        moduleId: mod.id,
        moduleTitle: (mod as Record<string, unknown>).title ?? `Semana ${i + 1}`,
        isPersonalized: false,
        sessions,
      };
    })
  );

  res.json({data: {assignedWeekKeys: weekKeys, weeks}});
});

// DELETE /creator/clients/:clientId/programs/:programId/remove-plan/:planId
router.delete("/creator/clients/:clientId/programs/:programId/remove-plan/:planId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const {clientId, programId, planId} = req.params;

  // 1. Read planAssignments
  const userDoc = await db.collection("users").doc(clientId).get();
  const courseEntry = userDoc.data()?.courses?.[programId] as Record<string, unknown> | undefined;
  const planAssignments = (courseEntry?.planAssignments ?? {}) as Record<string, { planId: string }>;

  // 2. Find all week keys for this plan
  const weekKeysToRemove = Object.keys(planAssignments).filter(
    (wk) => planAssignments[wk]?.planId === planId
  );

  if (weekKeysToRemove.length === 0) {
    res.json({data: {removedWeekKeys: []}});
    return;
  }

  // 3. Remove all matching entries from planAssignments
  const deleteUpdate: Record<string, unknown> = {};
  for (const wk of weekKeysToRemove) {
    deleteUpdate[`courses.${programId}.planAssignments.${wk}`] = FieldValue.delete();
  }
  await db.collection("users").doc(clientId).update(deleteUpdate);

  // 4. Clean up client_plan_content documents
  await Promise.all(
    weekKeysToRemove.map((wk) => deleteClientPlanContentDoc(planContentDocId(clientId, programId, wk)))
  );

  res.json({data: {removedWeekKeys: weekKeysToRemove}});
});

// DELETE /creator/clients/:clientId/programs/:programId/weeks/:weekKey/sessions/:sessionId
router.delete("/creator/clients/:clientId/programs/:programId/weeks/:weekKey/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const {clientId, programId, weekKey, sessionId} = req.params;

  // Ensure client copy exists (copy-on-write)
  const {docId} = await ensureClientCopy(clientId, programId, weekKey, auth.userId);
  const docRef = db.collection("client_plan_content").doc(docId);
  const sessionRef = docRef.collection("sessions").doc(sessionId);

  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesion no encontrada en esta semana");
  }

  // Delete session and its subcollections
  const exSnap = await sessionRef.collection("exercises").get();
  let batch = db.batch();
  let count = 0;
  for (const eDoc of exSnap.docs) {
    const setsSnap = await eDoc.ref.collection("sets").get();
    for (const setDoc of setsSnap.docs) {
      batch.delete(setDoc.ref);
      count++;
      if (count >= 450) {
        await batch.commit(); batch = db.batch(); count = 0;
      }
    }
    batch.delete(eDoc.ref);
    count++;
  }
  batch.delete(sessionRef);
  count++;
  if (count > 0) await batch.commit();

  // Return remaining sessions
  const remainingSessions = await readSessionTree(docRef.collection("sessions"));
  res.json({data: {weekKey, isPersonalized: true, sessions: remainingSessions}});
});

// PATCH /creator/clients/:clientId/programs/:programId/weeks/:weekKey/sessions/:sessionId
router.patch("/creator/clients/:clientId/programs/:programId/weeks/:weekKey/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const {clientId, programId, weekKey, sessionId} = req.params;

  // Ensure client copy exists (copy-on-write)
  const {docId} = await ensureClientCopy(clientId, programId, weekKey, auth.userId);
  const sessionRef = db.collection("client_plan_content").doc(docId).collection("sessions").doc(sessionId);

  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesion no encontrada en esta semana");
  }

  const allowedFields = ["title", "order", "dayIndex", "isRestDay", "image_url", "source_library_session_id", "defaultDataTemplate"];
  const updates = pickFields(req.body, allowedFields);
  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await sessionRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {sessionId, weekKey, isPersonalized: true, updated: true}});
});

// POST /creator/clients/:clientId/programs/:programId/weeks/:weekKey/sessions
router.post("/creator/clients/:clientId/programs/:programId/weeks/:weekKey/sessions", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const {clientId, programId, weekKey} = req.params;
  const {librarySessionId, dayIndex} = req.body;

  if (!librarySessionId || typeof librarySessionId !== "string") {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "librarySessionId es requerido", "librarySessionId");
  }

  // Ensure client copy exists (copy-on-write)
  const {docId} = await ensureClientCopy(clientId, programId, weekKey, auth.userId);
  const docRef = db.collection("client_plan_content").doc(docId);

  // Fetch library session with exercises/sets
  const libSessionRef = db.collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(librarySessionId);
  const libDoc = await libSessionRef.get();
  if (!libDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesion de biblioteca no encontrada");
  }
  const libData = libDoc.data()!;

  // Read library exercises and sets
  const libExSnap = await libSessionRef.collection("exercises").orderBy("order", "asc").get();
  const exercises = await Promise.all(
    libExSnap.docs.map(async (eDoc) => {
      const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
      return {...eDoc.data(), id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id}))};
    })
  );

  // Write new session to client_plan_content
  const newSessionId = db.collection("_").doc().id;
  const sessionRef = docRef.collection("sessions").doc(newSessionId);
  const sessionData: Record<string, unknown> = {
    id: newSessionId,
    title: libData.title ?? libData.name ?? "Sesion",
    order: 99, // appended at end
    dayIndex: typeof dayIndex === "number" ? dayIndex : null,
    image_url: libData.image_url ?? null,
    source_library_session_id: librarySessionId,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  let batch = db.batch();
  let batchCount = 0;
  batch.set(sessionRef, sessionData);
  batchCount++;

  for (const ex of exercises) {
    const exId = (ex.id as string) ?? db.collection("_").doc().id;
    const exRef = sessionRef.collection("exercises").doc(exId);
    const {sets: setsArr, ...exFields} = ex;
    batch.set(exRef, {...exFields, id: exId, created_at: FieldValue.serverTimestamp()});
    batchCount++;
    if (Array.isArray(setsArr)) {
      for (const set of setsArr as Array<Record<string, unknown>>) {
        const setId = (set.id as string) ?? db.collection("_").doc().id;
        batch.set(exRef.collection("sets").doc(setId), {...set, id: setId, created_at: FieldValue.serverTimestamp()});
        batchCount++;
      }
    }
    if (batchCount >= 450) {
      await batch.commit(); batch = db.batch(); batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();

  res.status(201).json({
    data: {
      weekKey,
      isPersonalized: true,
      session: {...sessionData, exercises},
    },
  });
});

// POST /creator/clients/:clientId/programs/:programId/apply-to-all
// Body: { sourceWeekKey, sessionId, sourceLibrarySessionId }
// Copies a session's exercises/sets to all other weeks that reference the same library session
router.post("/creator/clients/:clientId/programs/:programId/apply-to-all", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyClientAccess(auth.userId, req.params.clientId);

  const {clientId, programId} = req.params;
  const {sourceWeekKey, sessionId, sourceLibrarySessionId} = req.body;

  if (!sourceWeekKey || !sessionId || !sourceLibrarySessionId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "sourceWeekKey, sessionId, y sourceLibrarySessionId son requeridos");
  }

  // 1. Read the source session's exercises + sets
  const sourceDocId = planContentDocId(clientId, programId, sourceWeekKey);
  const sourceSessionRef = db.collection("client_plan_content").doc(sourceDocId).collection("sessions").doc(sessionId);
  const sourceSessionDoc = await sourceSessionRef.get();
  if (!sourceSessionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesion fuente no encontrada");
  }

  const sourceExSnap = await sourceSessionRef.collection("exercises").orderBy("order", "asc").get();
  const sourceExercises = await Promise.all(
    sourceExSnap.docs.map(async (eDoc) => {
      const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
      return {data: eDoc.data(), sets: setsSnap.docs.map((s) => s.data())};
    })
  );

  // 2. Find all weeks with client_plan_content that have sessions referencing the same library session
  const userDoc = await db.collection("users").doc(clientId).get();
  const courseEntry = userDoc.data()?.courses?.[programId] as Record<string, unknown> | undefined;
  const planAssignments = (courseEntry?.planAssignments ?? {}) as Record<string, unknown>;
  const weekKeys = Object.keys(planAssignments).filter((wk) => wk !== sourceWeekKey);

  let updatedCount = 0;
  const batchSize = 450;
  let batch = db.batch();
  let batchCount = 0;

  for (const weekKey of weekKeys) {
    const contentDocId = planContentDocId(clientId, programId, weekKey);
    const contentDocRef = db.collection("client_plan_content").doc(contentDocId);
    const contentDoc = await contentDocRef.get();
    if (!contentDoc.exists) continue;

    // Find sessions with matching source_library_session_id or librarySessionRef
    const matchNew = await contentDocRef.collection("sessions")
      .where("source_library_session_id", "==", sourceLibrarySessionId).get();
    const matchOld = await contentDocRef.collection("sessions")
      .where("librarySessionRef", "==", sourceLibrarySessionId).get();

    const seen = new Set<string>();
    const matchingSessions = [...matchNew.docs, ...matchOld.docs].filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });

    for (const targetSessionDoc of matchingSessions) {
      const targetRef = targetSessionDoc.ref;

      // Update session metadata
      batch.update(targetRef, {
        title: sourceSessionDoc.data()!.title,
        source_library_session_id: sourceLibrarySessionId,
        updated_at: FieldValue.serverTimestamp(),
      });
      batchCount++;

      // Delete existing exercises + sets
      const exSnap = await targetRef.collection("exercises").get();
      for (const eDoc of exSnap.docs) {
        const setsSnap = await eDoc.ref.collection("sets").get();
        for (const setDoc of setsSnap.docs) {
          batch.delete(setDoc.ref);
          batchCount++;
          if (batchCount >= batchSize) {
            await batch.commit(); batch = db.batch(); batchCount = 0;
          }
        }
        batch.delete(eDoc.ref);
        batchCount++;
      }

      // Write source exercises + sets
      for (const ex of sourceExercises) {
        const newExRef = targetRef.collection("exercises").doc();
        batch.set(newExRef, {...ex.data, id: newExRef.id, created_at: FieldValue.serverTimestamp()});
        batchCount++;
        for (const setData of ex.sets) {
          const newSetRef = newExRef.collection("sets").doc();
          batch.set(newSetRef, {...setData, id: newSetRef.id, created_at: FieldValue.serverTimestamp()});
          batchCount++;
        }
        if (batchCount >= batchSize) {
          await batch.commit(); batch = db.batch(); batchCount = 0;
        }
      }

      updatedCount++;
    }
  }

  if (batchCount > 0) await batch.commit();
  res.json({data: {updatedCount}});
});

// GET /creator/username-check?username=... — check if username is available
router.get("/creator/username-check", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const raw = req.query.username as string | undefined;
  if (!raw || !raw.trim()) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "El parámetro username es requerido");
  }
  const normalized = raw.toLowerCase().trim();

  const snapshot = await db
    .collection("users")
    .where("username", "==", normalized)
    .limit(1)
    .get();

  const taken = snapshot.docs.some((doc) => doc.id !== auth.userId);

  res.json({data: {available: !taken}});
});

// ---------------------------------------------------------------------------
// Creator Media Folder
// ---------------------------------------------------------------------------

// GET /creator/media — list all media files for the authenticated creator
router.get("/creator/media", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const snapshot = await db
    .collection("creator_media")
    .doc(auth.userId)
    .collection("files")
    .orderBy("created_at", "desc")
    .limit(200)
    .get();

  const bucket = admin.storage().bucket();
  const data = snapshot.docs.map((d) => {
    const file = d.data();
    let publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.storagePath)}?alt=media`;
    if (file.downloadToken) {
      publicUrl += `&token=${file.downloadToken}`;
    }
    return {
      fileId: d.id,
      name: file.name,
      contentType: file.contentType,
      storagePath: file.storagePath,
      url: publicUrl,
      created_at: file.created_at,
    };
  });

  res.json({data});
});

// POST /creator/media/upload-url — generate upload target for direct Storage upload
router.post("/creator/media/upload-url", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const {filename, contentType} = validateBody<{
    filename: string;
    contentType: string;
  }>(
    {filename: "string", contentType: "string"},
    req.body
  );

  if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Solo se permiten imágenes y videos");
  }

  const ext = filename.split(".").pop() || "bin";
  const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `creator_media/${auth.userId}/${uniqueName}`;
  const downloadToken = crypto.randomUUID();

  const bucket = admin.storage().bucket();
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o?uploadType=media&name=${encodeURIComponent(storagePath)}`;

  res.json({
    data: {
      uploadUrl,
      storagePath,
      downloadToken,
      contentType,
    },
  });
});

// POST /creator/media/upload-url/confirm — confirm upload and save metadata
router.post("/creator/media/upload-url/confirm", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const {storagePath, filename, contentType, downloadToken} = validateBody<{
    storagePath: string;
    filename: string;
    contentType: string;
    downloadToken: string;
  }>(
    {storagePath: "string", filename: "string", contentType: "string", downloadToken: "string"},
    req.body
  );

  // Validate the path belongs to this creator
  const expectedPrefix = `creator_media/${auth.userId}/`;
  validateStoragePath(storagePath, expectedPrefix);

  // Verify the file exists in Storage and set download token
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "El archivo no se encontró en almacenamiento");
  }

  await file.setMetadata({
    metadata: {firebaseStorageDownloadTokens: downloadToken},
  });

  const docRef = await db
    .collection("creator_media")
    .doc(auth.userId)
    .collection("files")
    .add({
      name: filename,
      contentType,
      storagePath,
      downloadToken,
      created_at: FieldValue.serverTimestamp(),
    });

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

  res.status(201).json({
    data: {
      storagePath,
      fileId: docRef.id,
      url: publicUrl,
      name: filename,
      contentType,
    },
  });
});

// DELETE /creator/media/:fileId — delete a media file
router.delete("/creator/media/:fileId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const fileDoc = await db
    .collection("creator_media")
    .doc(auth.userId)
    .collection("files")
    .doc(req.params.fileId)
    .get();

  if (!fileDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado");
  }

  const fileData = fileDoc.data()!;

  // Delete from Storage
  const bucket = admin.storage().bucket();
  try {
    await bucket.file(fileData.storagePath).delete();
  } catch {
    // File may already be deleted from storage — continue
  }

  // Delete Firestore record
  await db
    .collection("creator_media")
    .doc(auth.userId)
    .collection("files")
    .doc(req.params.fileId)
    .delete();

  res.json({data: {deleted: true}});
});

// GET /creator/programs/:programId/demographics
router.get("/creator/programs/:programId/demographics", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const {programId} = req.params;

  // Verify creator owns this program
  const programDoc = await db.collection("courses").doc(programId).get();
  if (!programDoc.exists || programDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  // Find all users who purchased this program
  const usersSnap = await db
    .collection("users")
    .where("purchased_courses", "array-contains", programId)
    .get();

  const ageBuckets: Record<string, number> = {
    "18-24": 0, "25-34": 0, "35-44": 0, "45-54": 0, "55+": 0, "desconocido": 0,
  };
  const genderCounts: Record<string, number> = {};
  const cityCounts: Record<string, number> = {};
  const goalCounts: Record<string, number> = {};
  const experienceCounts: Record<string, number> = {};
  const equipmentCounts: Record<string, number> = {};
  let totalEnrolled = 0;
  let activeCount = 0;

  const now = new Date();

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    totalEnrolled++;

    // Check if still active
    const courseData = data.courses?.[programId];
    if (courseData?.status === "active") activeCount++;

    // Age from birthDate
    if (data.birthDate) {
      try {
        const birth = new Date(data.birthDate);
        let age = now.getFullYear() - birth.getFullYear();
        const monthDiff = now.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
        if (age >= 18 && age <= 24) ageBuckets["18-24"]++;
        else if (age >= 25 && age <= 34) ageBuckets["25-34"]++;
        else if (age >= 35 && age <= 44) ageBuckets["35-44"]++;
        else if (age >= 45 && age <= 54) ageBuckets["45-54"]++;
        else if (age >= 55) ageBuckets["55+"]++;
        else ageBuckets["desconocido"]++;
      } catch {
        ageBuckets["desconocido"]++;
      }
    } else {
      ageBuckets["desconocido"]++;
    }

    // Gender
    const gender = data.gender || "no_especificado";
    genderCounts[gender] = (genderCounts[gender] || 0) + 1;

    // City
    const city = data.city;
    if (city) cityCounts[city] = (cityCounts[city] || 0) + 1;

    // Onboarding data
    const onboarding = data.onboardingData;
    if (onboarding?.primaryGoal) {
      goalCounts[onboarding.primaryGoal] = (goalCounts[onboarding.primaryGoal] || 0) + 1;
    }
    if (onboarding?.trainingExperience) {
      experienceCounts[onboarding.trainingExperience] = (experienceCounts[onboarding.trainingExperience] || 0) + 1;
    }
    if (onboarding?.equipment) {
      equipmentCounts[onboarding.equipment] = (equipmentCounts[onboarding.equipment] || 0) + 1;
    }
  }

  // Sort cities by count descending, top 10
  const topCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([city, count]) => ({city, count}));

  res.json({
    data: {
      totalEnrolled,
      activeCount,
      age: ageBuckets,
      gender: genderCounts,
      cities: topCities,
      goals: goalCounts,
      experience: experienceCounts,
      equipment: equipmentCounts,
    },
  });
});

// GET /creator/bookings — list creator's call bookings
router.get("/creator/bookings", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const snap = await db
    .collection("call_bookings")
    .where("creatorId", "==", auth.userId)
    .orderBy("slotStartUtc", "desc")
    .limit(100)
    .get();

  const bookings = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      clientUserId: data.clientUserId ?? null,
      clientDisplayName: data.clientName ?? data.clientDisplayName ?? data.displayName ?? null,
      slotStartUtc: data.slotStartUtc ?? data.startAt ?? data.startTime ?? null,
      slotEndUtc: data.slotEndUtc ?? data.endAt ?? data.endTime ?? null,
      durationMinutes: data.durationMinutes ?? null,
      status: data.status ?? "confirmed",
      date: data.date ?? null,
      created_at: data.created_at ?? null,
    };
  });

  res.json({data: bookings});
});

// ─── Creator Availability ────────────────────────────────────────────────

// GET /creator/availability
router.get("/creator/availability", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const doc = await db.collection("creator_availability").doc(auth.userId).get();
  if (!doc.exists) {
    res.json({data: {timezone: null, days: {}, weeklyTemplate: null}});
    return;
  }

  const data = doc.data()!;
  res.json({
    data: {
      timezone: data.timezone ?? null,
      days: data.days ?? {},
      weeklyTemplate: data.weeklyTemplate ?? null,
      disabledDates: data.disabledDates ?? [],
      defaultSlotDuration: data.defaultSlotDuration ?? 45,
    },
  });
});

// PUT /creator/availability/template
// Strict validators (audit M-31): port of the previously-dead checks from
// bookings.ts. Enforces day-of-week keys, slot duration enum, and intra-day
// overlap detection so a creator can't write a malformed schedule that the
// reminder/booking pipeline can't safely render.
const AVAILABILITY_TIME_RE = /^\d{2}:\d{2}$/;
const AVAILABILITY_VALID_DURATIONS = new Set([15, 30, 45, 60]);

router.put("/creator/availability/template", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const body = validateBody<{
    weeklyTemplate: Record<string, unknown>;
    disabledDates?: unknown[];
    defaultSlotDuration?: number;
    timezone?: string;
  }>(
    {
      weeklyTemplate: "object",
      disabledDates: "optional_array",
      defaultSlotDuration: "optional_number",
      timezone: "optional_string",
    },
    req.body
  );

  if (body.defaultSlotDuration !== undefined &&
      !AVAILABILITY_VALID_DURATIONS.has(body.defaultSlotDuration)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Duración debe ser 15, 30, 45 o 60", "defaultSlotDuration"
    );
  }

  const validDays = new Set(["1", "2", "3", "4", "5", "6", "7"]);
  const cleanTemplate: Record<string, Array<{ startTime: string; durationMinutes: number }>> = {};

  for (const [dayKey, slots] of Object.entries(body.weeklyTemplate)) {
    if (!validDays.has(dayKey)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `Día inválido: ${dayKey}. Usa 1-7 (Lun-Dom)`, "weeklyTemplate"
      );
    }
    if (!Array.isArray(slots)) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400,
        `Los slots del día ${dayKey} deben ser un array`, "weeklyTemplate"
      );
    }
    if (slots.length > 20) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400, "Máximo 20 franjas por día", "weeklyTemplate"
      );
    }

    const daySlots: Array<{ startTime: string; durationMinutes: number }> = [];
    for (const slot of slots as unknown[]) {
      if (!slot || typeof slot !== "object") {
        throw new WakeApiServerError(
          "VALIDATION_ERROR", 400, "Formato de franja inválido", "weeklyTemplate"
        );
      }
      const s = slot as { startTime?: unknown; durationMinutes?: unknown };
      if (typeof s.startTime !== "string" || !AVAILABILITY_TIME_RE.test(s.startTime)) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR", 400,
          `startTime inválido: ${String(s.startTime)}`, "weeklyTemplate"
        );
      }
      if (typeof s.durationMinutes !== "number" ||
          !AVAILABILITY_VALID_DURATIONS.has(s.durationMinutes)) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR", 400,
          "Duración debe ser 15, 30, 45 o 60", "weeklyTemplate"
        );
      }
      daySlots.push({startTime: s.startTime, durationMinutes: s.durationMinutes});
    }

    const sorted = [...daySlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const [ph, pm] = prev.startTime.split(":").map(Number);
      const prevEnd = ph * 60 + pm + prev.durationMinutes;
      const [ch, cm] = curr.startTime.split(":").map(Number);
      const currStart = ch * 60 + cm;
      if (prevEnd > currStart) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR", 400,
          `Franjas se superponen en día ${dayKey}`, "weeklyTemplate"
        );
      }
    }

    if (daySlots.length > 0) cleanTemplate[dayKey] = daySlots;
  }

  let cleanDates: string[] | undefined;
  if (body.disabledDates !== undefined) {
    if (body.disabledDates.length > 90) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR", 400, "Máximo 90 fechas bloqueadas", "disabledDates"
      );
    }
    cleanDates = [];
    for (const d of body.disabledDates) {
      if (typeof d !== "string") continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR", 400, "Fecha inválida (YYYY-MM-DD)", "disabledDates"
        );
      }
      cleanDates.push(d);
    }
  }

  await db.collection("creator_availability").doc(auth.userId).set(
    {
      weeklyTemplate: cleanTemplate,
      ...(cleanDates !== undefined ? {disabledDates: cleanDates} : {}),
      ...(body.defaultSlotDuration !== undefined ? {defaultSlotDuration: body.defaultSlotDuration} : {}),
      ...(body.timezone ? {timezone: body.timezone} : {}),
      updated_at: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );

  res.json({data: {updated: true}});
});

// ─── Courses Subcollection CRUD (modules/sessions/exercises/sets) ─────────

// GET /creator/programs/:programId/modules
router.get("/creator/programs/:programId/modules", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const snap = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .orderBy("order", "asc")
    .get();

  res.json({data: snap.docs.map((d) => ({...d.data(), moduleId: d.id, id: d.id}))});
});

// POST /creator/programs/:programId/modules
router.post("/creator/programs/:programId/modules", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const body = validateBody<{ title: string; order?: number }>(
    {title: "string", order: "optional_number"},
    req.body
  );

  const ref = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .add({
      title: body.title,
      order: body.order ?? 0,
      created_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({data: {moduleId: ref.id, id: ref.id}});
});

// PATCH /creator/programs/:programId/modules/:moduleId
router.patch("/creator/programs/:programId/modules/:moduleId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const modRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId);

  const modDoc = await modRef.get();
  if (!modDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");
  }

  const updates = pickFields(req.body, ["title", "order"]);
  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await modRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {moduleId: req.params.moduleId, updated: true}});
});

// DELETE /creator/programs/:programId/modules/:moduleId
router.delete("/creator/programs/:programId/modules/:moduleId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const modRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId);

  if (!(await modRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Módulo no encontrado");
  }

  await modRef.delete();
  res.status(204).send();
});

// GET /creator/programs/:programId/modules/:moduleId/sessions
router.get("/creator/programs/:programId/modules/:moduleId/sessions", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const snap = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .orderBy("order", "asc")
    .get();

  res.json({data: snap.docs.map((d) => ({...d.data(), sessionId: d.id, id: d.id}))});
});

// POST /creator/programs/:programId/modules/:moduleId/sessions
router.post("/creator/programs/:programId/modules/:moduleId/sessions", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const body = validateBody<{ title: string; order?: number; librarySessionRef?: string; dayIndex?: number; image_url?: string }>(
    {title: "string", order: "optional_number", librarySessionRef: "optional_string", dayIndex: "optional_number", image_url: "optional_string"},
    req.body
  );

  const ref = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .add({
      title: body.title,
      order: body.order ?? 0,
      ...(body.librarySessionRef !== undefined && {librarySessionRef: body.librarySessionRef}),
      ...(body.dayIndex !== undefined && {dayIndex: body.dayIndex}),
      ...(body.image_url !== undefined && {image_url: body.image_url}),
      created_at: FieldValue.serverTimestamp(),
    });

  // Deep-copy exercises+sets from library session when librarySessionRef is provided
  if (body.librarySessionRef) {
    const libSessionRef = db.collection("creator_libraries").doc(auth.userId)
      .collection("sessions").doc(body.librarySessionRef);
    const libDoc = await libSessionRef.get();
    if (libDoc.exists) {
      const libData = libDoc.data()!;
      const metaUpdate: Record<string, unknown> = {};
      if (!body.image_url && libData.image_url) metaUpdate.image_url = libData.image_url;
      if (Object.keys(metaUpdate).length > 0) await ref.update(metaUpdate);

      const libExSnap = await libSessionRef.collection("exercises").orderBy("order", "asc").get();
      let batch = db.batch();
      let batchCount = 0;
      for (const eDoc of libExSnap.docs) {
        const exRef = ref.collection("exercises").doc();
        const {...exData} = eDoc.data();
        batch.set(exRef, {...exData, id: exRef.id, created_at: FieldValue.serverTimestamp()});
        batchCount++;
        const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
        for (const sDoc of setsSnap.docs) {
          const setRef = exRef.collection("sets").doc();
          batch.set(setRef, {...sDoc.data(), id: setRef.id, created_at: FieldValue.serverTimestamp()});
          batchCount++;
        }
        if (batchCount >= 450) {
          await batch.commit(); batch = db.batch(); batchCount = 0;
        }
      }
      if (batchCount > 0) await batch.commit();
    }
  }

  res.status(201).json({data: {sessionId: ref.id, id: ref.id}});
});

// PATCH /creator/programs/:programId/modules/:moduleId/sessions/:sessionId
router.patch("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const sessRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId);

  if (!(await sessRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  const updates = pickFields(req.body, ["title", "order", "image_url", "librarySessionRef", "dayIndex", "defaultDataTemplate"]);
  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await sessRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {sessionId: req.params.sessionId, updated: true}});
});

// DELETE /creator/programs/:programId/modules/:moduleId/sessions/:sessionId
router.delete("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const sessRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId);

  if (!(await sessRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  await sessRef.delete();
  res.status(204).send();
});

// GET /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises
router.get("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const snap = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .orderBy("order", "asc")
    .get();

  const exercises = await Promise.all(
    snap.docs.map(async (d) => {
      const setsSnap = await d.ref.collection("sets").orderBy("order", "asc").get();
      return {
        exerciseId: d.id,
        id: d.id,
        ...d.data(),
        sets: setsSnap.docs.map((s) => ({...s.data(), setId: s.id, id: s.id})),
      };
    })
  );

  res.json({data: exercises});
});

// POST /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises
router.post("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const allowedExFields = ["name", "order", "libraryId", "description", "video_url", "video_source",
    "muscle_activation", "implements", "primary", "primaryMuscles",
    "alternatives", "objectives", "measures", "customMeasureLabels", "customObjectiveLabels"];
  const exData = pickFields(req.body, allowedExFields);
  exData.created_at = FieldValue.serverTimestamp();

  const ref = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .add(exData);

  res.status(201).json({data: {exerciseId: ref.id, id: ref.id}});
});

// PATCH /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId
router.patch("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const exRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .doc(req.params.exerciseId);

  if (!(await exRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  const allowedFields = ["name", "order", "libraryId", "description", "video_url", "video_source",
    "muscle_activation", "implements", "primary", "primaryMuscles",
    "alternatives", "objectives", "measures", "customMeasureLabels", "customObjectiveLabels"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await exRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {exerciseId: req.params.exerciseId, updated: true}});
});

// DELETE /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId
router.delete("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const exRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .doc(req.params.exerciseId);

  if (!(await exRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  await exRef.delete();
  res.status(204).send();
});

// POST /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets
router.post("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const allowedSetFields = ["reps", "weight", "intensity", "rir", "order", "title", "duration", "rep_sequence"];
  const setData = pickFields(req.body, allowedSetFields);

  if (setData.rep_sequence !== undefined) {
    const seq = setData.rep_sequence;
    if (seq !== null && (!Array.isArray(seq) || !seq.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0))) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "rep_sequence debe ser un array de números positivos", "rep_sequence");
    }
  }

  setData.created_at = FieldValue.serverTimestamp();

  const ref = await db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .doc(req.params.exerciseId)
    .collection("sets")
    .add(setData);

  res.status(201).json({data: {setId: ref.id, id: ref.id}});
});

// PATCH /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId
router.patch("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const setRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .doc(req.params.exerciseId)
    .collection("sets")
    .doc(req.params.setId);

  if (!(await setRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Set no encontrado");
  }

  const allowedFields = ["reps", "weight", "intensity", "rir", "order", "title", "duration", "rep_sequence"];
  const updates = pickFields(req.body, allowedFields);

  if (updates.rep_sequence !== undefined) {
    const seq = updates.rep_sequence;
    if (seq !== null && (!Array.isArray(seq) || !seq.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0))) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "rep_sequence debe ser un array de números positivos", "rep_sequence");
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await setRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {setId: req.params.setId, updated: true}});
});

// DELETE /creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId
router.delete("/creator/programs/:programId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const courseDoc = await db.collection("courses").doc(req.params.programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const setRef = db
    .collection("courses")
    .doc(req.params.programId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId)
    .collection("exercises")
    .doc(req.params.exerciseId)
    .collection("sets")
    .doc(req.params.setId);

  if (!(await setRef.get()).exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Set no encontrado");
  }

  await setRef.delete();
  res.status(204).send();
});

// ─── Plan Propagation ────────────────────────────────────────────────────

// GET /creator/plans/:planId/affected
router.get("/creator/plans/:planId/affected", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const planId = req.params.planId;
  const wantDetails = req.query.details === "true";

  const affectedUserIdSet = new Set<string>();
  const affectedProgramIdSet = new Set<string>();

  // Find clients whose planAssignments reference this plan
  const clientsSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .get();

  for (const clientDoc of clientsSnap.docs) {
    const clientUserId = clientDoc.data().clientUserId as string;
    const userDoc = await db.collection("users").doc(clientUserId).get();
    if (!userDoc.exists) continue;
    const courses = userDoc.data()?.courses ?? {};

    for (const [programId, courseData] of Object.entries(courses) as Array<[string, Record<string, unknown>]>) {
      const assignments = (courseData?.planAssignments ?? {}) as Record<string, { planId: string }>;
      for (const val of Object.values(assignments)) {
        if (val.planId === planId) {
          affectedUserIdSet.add(clientUserId);
          affectedProgramIdSet.add(programId);
          break;
        }
      }
    }
  }

  const affectedUserIds = Array.from(affectedUserIdSet);

  if (wantDetails && affectedUserIds.length > 0) {
    const userDocs = await Promise.all(
      affectedUserIds.slice(0, 50).map((uid) => db.collection("users").doc(uid).get())
    );
    const users = userDocs
      .filter((d) => d.exists)
      .map((d) => ({
        userId: d.id,
        displayName: d.data()?.displayName || d.data()?.email || d.id,
      }));
    res.json({data: {users}});
    return;
  }

  res.json({data: {affectedUserIds, programCount: affectedProgramIdSet.size, programIds: Array.from(affectedProgramIdSet)}});
});

// POST /creator/plans/:planId/propagate
router.post("/creator/plans/:planId/propagate", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db.collection("plans").doc(req.params.planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const planId = req.params.planId;
  const mode = (req.body?.mode as string) ?? "all";

  if (mode === "forward_only") {
    res.json({data: {updatedCount: 0, mode: "forward_only"}});
    return;
  }

  // Find all client_plan_content docs created from this plan
  const contentSnap = await db
    .collection("client_plan_content")
    .where("source_plan_id", "==", planId)
    .get();

  if (contentSnap.empty) {
    res.json({data: {updatedCount: 0, mode: "all"}});
    return;
  }

  // Read all modules from the plan (keyed by moduleId for quick lookup)
  const modulesSnap = await db.collection("plans").doc(planId).collection("modules").get();
  const moduleContentCache: Record<string, { title: string; sessions: Array<Record<string, unknown>> }> = {};

  for (const mDoc of modulesSnap.docs) {
    const sessionsSnap = await mDoc.ref.collection("sessions").orderBy("order", "asc").get();
    const sessions: Array<Record<string, unknown>> = [];

    for (const sDoc of sessionsSnap.docs) {
      const sData = sDoc.data();
      const sourceLibId = sData.source_library_session_id ?? sData.librarySessionRef ?? null;
      const sessionData: Record<string, unknown> = {
        ...sData,
        id: sDoc.id,
        source_plan_session_id: sDoc.id,
        source_library_session_id: sourceLibId,
      };
      delete sessionData.librarySessionRef;
      delete sessionData.useLocalContent;

      const exSnap = await sDoc.ref.collection("exercises").orderBy("order", "asc").get();
      let exercises: Array<Record<string, unknown>> = [];

      if (exSnap.empty && sourceLibId) {
        try {
          const libRef = db.collection("creator_libraries").doc(auth.userId).collection("sessions").doc(sourceLibId);
          const libDoc = await libRef.get();
          if (libDoc.exists) {
            const libData = libDoc.data()!;
            sessionData.title = sData.title ?? libData.title ?? null;
            sessionData.image_url = sData.image_url ?? libData.image_url ?? null;
            const libExSnap = await libRef.collection("exercises").orderBy("order", "asc").get();
            exercises = await Promise.all(
              libExSnap.docs.map(async (eDoc) => {
                const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
                return {...eDoc.data(), id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id}))};
              })
            );
          }
        } catch {/* best-effort */}
      } else {
        exercises = await Promise.all(
          exSnap.docs.map(async (eDoc) => {
            const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
            return {...eDoc.data(), id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id}))};
          })
        );
        if (sourceLibId) {
          try {
            const libDoc = await db.collection("creator_libraries").doc(auth.userId)
              .collection("sessions").doc(sourceLibId).get();
            if (libDoc.exists) {
              const libData = libDoc.data()!;
              sessionData.title = sData.title ?? libData.title ?? null;
              sessionData.image_url = sData.image_url ?? libData.image_url ?? null;
            }
          } catch {/* best-effort */}
        }
      }

      sessions.push({...sessionData, exercises});
    }

    moduleContentCache[mDoc.id] = {title: mDoc.data()?.title ?? mDoc.id, sessions};
  }

  // Overwrite each client_plan_content doc (parallel, max 5 concurrent)
  const batchSize = 450;
  const docsToUpdate = contentSnap.docs.filter((d) => {
    const mid = d.data().source_module_id as string | undefined;
    return mid && moduleContentCache[mid];
  });

  const updateOneDoc = async (contentDoc: FirebaseFirestore.QueryDocumentSnapshot) => {
    const docData = contentDoc.data();
    const sourceModuleId = docData.source_module_id as string;
    const {title: moduleTitle, sessions} = moduleContentCache[sourceModuleId];
    const docRef = contentDoc.ref;

    // Collect all refs to delete in parallel
    const existingSessions = await docRef.collection("sessions").get();
    const deleteRefs: FirebaseFirestore.DocumentReference[] = [];
    await Promise.all(existingSessions.docs.map(async (sDoc) => {
      const exSnap = await sDoc.ref.collection("exercises").get();
      await Promise.all(exSnap.docs.map(async (eDoc) => {
        const setsSnap = await eDoc.ref.collection("sets").get();
        setsSnap.docs.forEach((setDoc) => deleteRefs.push(setDoc.ref));
        deleteRefs.push(eDoc.ref);
      }));
      deleteRefs.push(sDoc.ref);
    }));

    // Single batch: delete + write
    let batch = db.batch();
    let count = 0;
    for (const ref of deleteRefs) {
      batch.delete(ref);
      count++;
      if (count >= batchSize) {
        await batch.commit(); batch = db.batch(); count = 0;
      }
    }

    batch.update(docRef, {
      title: moduleTitle,
      source_plan_id: planId,
      source_module_id: sourceModuleId,
      updated_at: FieldValue.serverTimestamp(),
    });
    count++;

    for (const session of sessions) {
      const sessionId = (session.id as string) ?? db.collection("_").doc().id;
      const sessionRef = docRef.collection("sessions").doc(sessionId);
      const {exercises: exArr, ...sessionFields} = session;
      batch.set(sessionRef, {...sessionFields, id: sessionId, created_at: FieldValue.serverTimestamp()});
      count++;

      if (Array.isArray(exArr)) {
        for (const exercise of exArr as Array<Record<string, unknown>>) {
          const exId = (exercise.id as string) ?? db.collection("_").doc().id;
          const exRef = sessionRef.collection("exercises").doc(exId);
          const {sets: setsArr, ...exFields} = exercise;
          batch.set(exRef, {...exFields, id: exId, created_at: FieldValue.serverTimestamp()});
          count++;

          if (Array.isArray(setsArr)) {
            for (const set of setsArr as Array<Record<string, unknown>>) {
              const setId = (set.id as string) ?? db.collection("_").doc().id;
              batch.set(exRef.collection("sets").doc(setId), {...set, id: setId, created_at: FieldValue.serverTimestamp()});
              count++;
            }
          }
          if (count >= batchSize) {
            await batch.commit(); batch = db.batch(); count = 0;
          }
        }
      }
    }

    if (count > 0) await batch.commit();
  };

  // Process up to 5 client docs concurrently
  const CONCURRENCY = 5;
  for (let i = 0; i < docsToUpdate.length; i += CONCURRENCY) {
    await Promise.all(docsToUpdate.slice(i, i + CONCURRENCY).map(updateOneDoc));
  }

  res.json({data: {updatedCount: docsToUpdate.length, mode: "all"}});
});

// GET /creator/nutrition/plans/:planId/affected
router.get("/creator/nutrition/plans/:planId/affected", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const planDoc = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(req.params.planId)
    .get();

  if (!planDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan de nutrición no encontrado");
  }

  const wantDetails = req.query.details === "true";

  // Find all assignments for this plan
  const assignmentsSnap = await db
    .collection("nutrition_assignments")
    .where("planId", "==", req.params.planId)
    .where("assignedBy", "==", auth.userId)
    .get();

  const affectedUserIdSet = new Set<string>();
  for (const aDoc of assignmentsSnap.docs) {
    const userId = aDoc.data().userId as string | undefined;
    if (userId) affectedUserIdSet.add(userId);
  }

  const affectedUserIds = Array.from(affectedUserIdSet);

  if (wantDetails && affectedUserIds.length > 0) {
    const userDocs = await Promise.all(
      affectedUserIds.slice(0, 50).map((uid) => db.collection("users").doc(uid).get())
    );
    const users = userDocs
      .filter((d) => d.exists)
      .map((d) => ({
        userId: d.id,
        displayName: d.data()?.displayName || d.data()?.email || d.id,
      }));
    res.json({data: {users}});
    return;
  }

  res.json({data: {affectedUserIds, clientCount: affectedUserIds.length}});
});

// ─── Exercises Library CRUD ──────────────────────────────────────────────

// GET /creator/exercises/libraries — list all exercise libraries for the authenticated creator
router.get("/creator/exercises/libraries", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const snap = await db
    .collection("exercises_library")
    .where("creator_id", "==", auth.userId)
    .get();

  res.json({data: snap.docs.map((d) => ({...d.data(), id: d.id}))});
});

// GET /creator/exercises/libraries/:libraryId — single library by ID
router.get("/creator/exercises/libraries/:libraryId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const doc = await db.collection("exercises_library").doc(req.params.libraryId).get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  res.json({data: {...doc.data(), id: doc.id}});
});

// POST /creator/exercises/libraries — create new library
router.post("/creator/exercises/libraries", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const body = validateBody<{ title: string }>({title: "string"}, req.body);

  const userDoc = await db.collection("users").doc(auth.userId).get();
  const creatorName = userDoc.data()?.displayName || userDoc.data()?.name || "";

  const ref = await db.collection("exercises_library").add({
    creator_id: auth.userId,
    creator_name: creatorName,
    title: body.title,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  res.status(201).json({data: {id: ref.id}});
});

// DELETE /creator/exercises/libraries/:libraryId — delete a library
router.delete("/creator/exercises/libraries/:libraryId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  await ref.delete();
  res.status(204).send();
});

// ─── Library exercise resolver ────────────────────────────────────────────
// The :exerciseId URL segment may be either a stable exerciseId (post-migration
// shape under exercises.{id}) or a display-name (legacy top-level field key).
// Returns { id, displayName, data, hasNewShape } so downstream code can dual-write.
function resolveLibraryExercise(libData: Record<string, unknown>, idOrName: string): {
  id: string | null;
  displayName: string;
  data: Record<string, unknown>;
  hasNewShape: boolean;
} | null {
  const exMap = (libData.exercises as Record<string, Record<string, unknown>> | undefined) ?? null;
  // 1) Try as ID in new map
  if (exMap && exMap[idOrName] && typeof exMap[idOrName] === "object") {
    const entry = exMap[idOrName];
    return {
      id: idOrName,
      displayName: (entry.displayName as string | undefined) ?? idOrName,
      data: entry,
      hasNewShape: true,
    };
  }
  // 2) Try as legacy top-level name
  const top = libData[idOrName];
  if (top && typeof top === "object") {
    // If new map exists, look up the matching ID by displayName
    let foundId: string | null = null;
    if (exMap) {
      for (const [id, entry] of Object.entries(exMap)) {
        if ((entry as Record<string, unknown>).displayName === idOrName) {
          foundId = id;
          break;
        }
      }
    }
    return {
      id: foundId,
      displayName: idOrName,
      data: top as Record<string, unknown>,
      hasNewShape: !!foundId,
    };
  }
  return null;
}

// POST /creator/exercises/libraries/:libraryId/exercises — add exercise to library.
// Generates a stable exerciseId, dual-writes to exercises.{id} (new shape) and the
// legacy top-level field (kept for forward compat until Phase 4 cleanup).
router.post("/creator/exercises/libraries/:libraryId/exercises", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const body = validateBody<{ name: string }>({name: "string"}, req.body);

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const exerciseId = db.collection("_").doc().id;
  const now = FieldValue.serverTimestamp();
  const baseEntry = {muscle_activation: {}, implements: [], created_at: now, updated_at: now};

  await ref.update({
    [`exercises.${exerciseId}`]: {displayName: body.name, ...baseEntry},
    [body.name]: baseEntry,
    updated_at: now,
  });

  res.status(201).json({data: {id: exerciseId, name: body.name, displayName: body.name, created: true}});
});

// DELETE /creator/exercises/libraries/:libraryId/exercises/:exerciseId — remove exercise.
// :exerciseId param accepts either an ID or a display-name; resolver finds both shapes.
router.delete("/creator/exercises/libraries/:libraryId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const idOrName = decodeURIComponent(req.params.exerciseId);
  const resolved = resolveLibraryExercise(doc.data()!, idOrName);
  if (!resolved) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  const updates: Record<string, unknown> = {updated_at: FieldValue.serverTimestamp()};
  if (resolved.id) updates[`exercises.${resolved.id}`] = FieldValue.delete();
  // Always also strip the legacy top-level entry by displayName.
  await ref.update(updates);
  await ref.update(new FieldPath(resolved.displayName), FieldValue.delete());

  res.status(204).send();
});

// PATCH /creator/exercises/libraries/:libraryId/exercises/:exerciseId — update exercise data.
// Dual-writes to both shapes when the new map exists.
router.patch("/creator/exercises/libraries/:libraryId/exercises/:exerciseId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const idOrName = decodeURIComponent(req.params.exerciseId);
  const resolved = resolveLibraryExercise(doc.data()!, idOrName);
  if (!resolved) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  const body = req.body || {};
  const fields = ["muscle_activation", "implements", "video_url", "video_path", "video_source"] as const;
  const updates: Record<string, unknown> = {};

  for (const f of fields) {
    if (body[f] === undefined) continue;
    // Always update legacy top-level shape (still the dashboard's read source today).
    updates[`${resolved.displayName}.${f}`] = body[f];
    // Mirror into new shape when present so post-migration reads stay fresh.
    if (resolved.id) updates[`exercises.${resolved.id}.${f}`] = body[f];
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No hay campos para actualizar");
  }

  const now = FieldValue.serverTimestamp();
  updates[`${resolved.displayName}.updated_at`] = now;
  if (resolved.id) updates[`exercises.${resolved.id}.updated_at`] = now;
  updates["updated_at"] = now;

  await ref.update(updates);
  res.json({data: {id: resolved.id, displayName: resolved.displayName, updated: true}});
});

// PATCH /creator/exercises/libraries/:libraryId/exercises/:exerciseId/rename — rename
// without breaking refs. Updates exercises.{id}.displayName only; legacy top-level
// key is FROZEN at the original name for forward compat. Refs (primary/alternatives,
// history keys) point at the stable id, so the new displayName flows everywhere
// the next read happens. Phase 4 cleanup eventually drops the legacy top-level keys.
router.patch("/creator/exercises/libraries/:libraryId/exercises/:exerciseId/rename", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const body = validateBody<{ displayName: string }>({displayName: "string"}, req.body);
  const newName = body.displayName.trim();
  if (!newName) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "El nombre no puede estar vacío");
  }

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const exerciseId = decodeURIComponent(req.params.exerciseId);
  const exMap = (doc.data()!.exercises as Record<string, Record<string, unknown>> | undefined) ?? {};
  const entry = exMap[exerciseId];
  if (!entry || typeof entry !== "object") {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  // Reject collisions with another active displayName in the same library.
  for (const [id, e] of Object.entries(exMap)) {
    if (id !== exerciseId && (e as Record<string, unknown>).displayName === newName) {
      throw new WakeApiServerError("CONFLICT", 409, "Ya existe un ejercicio con ese nombre");
    }
  }

  const now = FieldValue.serverTimestamp();
  await ref.update({
    [`exercises.${exerciseId}.displayName`]: newName,
    [`exercises.${exerciseId}.updated_at`]: now,
    updated_at: now,
  });

  res.json({data: {id: exerciseId, displayName: newName, renamed: true}});
});

// POST /creator/exercises/libraries/:libraryId/exercises/:exerciseId/upload-url
router.post("/creator/exercises/libraries/:libraryId/exercises/:exerciseId/upload-url", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const {contentType} = validateBody<{ contentType: string }>(
    {contentType: "string"},
    req.body
  );

  if (!contentType.startsWith("video/")) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Solo se permiten archivos de video");
  }

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const idOrName = decodeURIComponent(req.params.exerciseId);
  const resolved = resolveLibraryExercise(doc.data()!, idOrName);
  if (!resolved) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  // Storage path: prefer ID (stable across renames). Fall back to sanitized name for legacy entries.
  const pathSegment = resolved.id ?? resolved.displayName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext = contentType.split("/")[1] === "quicktime" ? "mov" : (contentType.split("/")[1] || "mp4");
  const storagePath = `exercises_library/${req.params.libraryId}/${pathSegment}/video.${ext}`;

  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });

  res.json({data: {uploadUrl: url, storagePath, contentType}});
});

// POST /creator/exercises/libraries/:libraryId/exercises/:exerciseId/upload-url/confirm
router.post("/creator/exercises/libraries/:libraryId/exercises/:exerciseId/upload-url/confirm", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const {storagePath} = validateBody<{ storagePath: string }>(
    {storagePath: "string"},
    req.body
  );

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const idOrName = decodeURIComponent(req.params.exerciseId);
  const resolved = resolveLibraryExercise(doc.data()!, idOrName);
  if (!resolved) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  const pathSegment = resolved.id ?? resolved.displayName.replace(/[^a-zA-Z0-9_-]/g, "_");
  validateStoragePath(storagePath, `exercises_library/${req.params.libraryId}/${pathSegment}/`);

  const bucket = admin.storage().bucket();
  const [exists] = await bucket.file(storagePath).exists();
  if (!exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Archivo no encontrado en Storage");
  }

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;
  const now = FieldValue.serverTimestamp();
  const updates: Record<string, unknown> = {
    [`${resolved.displayName}.video_url`]: publicUrl,
    [`${resolved.displayName}.video_path`]: storagePath,
    [`${resolved.displayName}.video_source`]: "upload",
    [`${resolved.displayName}.updated_at`]: now,
    updated_at: now,
  };
  if (resolved.id) {
    updates[`exercises.${resolved.id}.video_url`] = publicUrl;
    updates[`exercises.${resolved.id}.video_path`] = storagePath;
    updates[`exercises.${resolved.id}.video_source`] = "upload";
    updates[`exercises.${resolved.id}.updated_at`] = now;
  }
  await ref.update(updates);

  res.json({data: {video_url: publicUrl, video_path: storagePath, video_source: "upload"}});
});

// DELETE /creator/exercises/libraries/:libraryId/exercises/:exerciseId/video
router.delete("/creator/exercises/libraries/:libraryId/exercises/:exerciseId/video", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const idOrName = decodeURIComponent(req.params.exerciseId);
  const resolved = resolveLibraryExercise(doc.data()!, idOrName);
  if (!resolved) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  const videoPath = resolved.data.video_path as string | undefined;
  if (videoPath) {
    try {
      const bucket = admin.storage().bucket();
      await bucket.file(videoPath).delete();
    } catch (_err) {
      // File may not exist, continue
    }
  }

  const now = FieldValue.serverTimestamp();
  const updates: Record<string, unknown> = {
    [`${resolved.displayName}.video_url`]: FieldValue.delete(),
    [`${resolved.displayName}.video_path`]: FieldValue.delete(),
    [`${resolved.displayName}.video_source`]: FieldValue.delete(),
    [`${resolved.displayName}.updated_at`]: now,
    updated_at: now,
  };
  if (resolved.id) {
    updates[`exercises.${resolved.id}.video_url`] = FieldValue.delete();
    updates[`exercises.${resolved.id}.video_path`] = FieldValue.delete();
    updates[`exercises.${resolved.id}.video_source`] = FieldValue.delete();
    updates[`exercises.${resolved.id}.updated_at`] = now;
  }
  await ref.update(updates);

  res.status(204).send();
});

// PATCH /creator/exercises/libraries/:libraryId — update library metadata
router.patch("/creator/exercises/libraries/:libraryId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db.collection("exercises_library").doc(req.params.libraryId);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca no encontrada");
  }

  const allowed = ["title", "icon"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No hay campos para actualizar");
  }

  updates.updated_at = FieldValue.serverTimestamp();
  await ref.update(updates);
  res.json({data: {updated: true}});
});

// ─── Objective Presets CRUD ──────────────────────────────────────────────

// GET /creator/library/objective-presets — list all presets
router.get("/creator/library/objective-presets", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const snap = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("objective_presets")
    .orderBy("created_at", "desc")
    .get();

  res.json({data: snap.docs.map((d) => ({...d.data(), id: d.id}))});
});

// POST /creator/library/objective-presets — create preset
router.post("/creator/library/objective-presets", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const body = validateBody<{
    name: string;
    measures: unknown[];
    objectives: unknown[];
    customMeasureLabels: Record<string, unknown>;
    customObjectiveLabels: Record<string, unknown>;
  }>({
    name: "string",
    measures: "optional_array",
    objectives: "optional_array",
    customMeasureLabels: "optional_object",
    customObjectiveLabels: "optional_object",
  }, req.body);

  const ref = await db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("objective_presets")
    .add({
      name: body.name,
      measures: body.measures || [],
      objectives: body.objectives || [],
      customMeasureLabels: body.customMeasureLabels || {},
      customObjectiveLabels: body.customObjectiveLabels || {},
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

  res.status(201).json({data: {id: ref.id}});
});

// PATCH /creator/library/objective-presets/:presetId — update preset
router.patch("/creator/library/objective-presets/:presetId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("objective_presets")
    .doc(req.params.presetId);

  const doc = await ref.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Preset no encontrado");
  }

  const allowedFields = ["name", "measures", "objectives", "customMeasureLabels", "customObjectiveLabels"];
  const updates = pickFields(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await ref.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {id: req.params.presetId, updated: true}});
});

// DELETE /creator/library/objective-presets/:presetId — delete preset
router.delete("/creator/library/objective-presets/:presetId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const ref = db
    .collection("creator_libraries")
    .doc(auth.userId)
    .collection("objective_presets")
    .doc(req.params.presetId);

  const doc = await ref.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Preset no encontrado");
  }

  await ref.delete();
  res.status(204).send();
});

// ─── Program Plan Content (general program as virtual client) ─────────────

function programContentDocId(courseId: string, weekKey: string): string {
  return `program_${courseId}_${weekKey}`;
}

async function verifyProgramOwnership(
  creatorId: string,
  programId: string
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const courseDoc = await db.collection("courses").doc(programId).get();
  if (!courseDoc.exists || courseDoc.data()?.creator_id !== creatorId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }
  return courseDoc;
}

async function ensureProgramCopy(
  courseId: string,
  weekKey: string,
  creatorId: string
): Promise<{ docId: string; alreadyExisted: boolean }> {
  const docId = programContentDocId(courseId, weekKey);
  const docRef = db.collection("client_plan_content").doc(docId);
  const docSnap = await docRef.get();
  if (docSnap.exists) {
    return {docId, alreadyExisted: true};
  }

  // Read planAssignments from course
  const courseDoc = await db.collection("courses").doc(courseId).get();
  const planAssignments = (courseDoc.data()?.planAssignments ?? {}) as Record<string, { planId: string; moduleId: string }>;
  const assignment = planAssignments[weekKey];
  if (!assignment?.planId || !assignment?.moduleId) {
    // No plan assigned — create an empty personalized content doc so sessions can be added directly.
    // Program-scoped template (id is `program_…`): no client.
    await docRef.set(clientPlanContentPayload(
      {creator_id: creatorId, client_id: null},
      {
        courseId,
        weekKey,
        title: weekKey,
        isPersonalized: true,
        created_at: FieldValue.serverTimestamp(),
      }
    ));
    return {docId, alreadyExisted: false};
  }

  // Read plan module sessions with exercises and sets
  const planSessionsRef = db
    .collection("plans").doc(assignment.planId)
    .collection("modules").doc(assignment.moduleId)
    .collection("sessions");
  const planSessionsSnap = await planSessionsRef.orderBy("order", "asc").get();

  const sessions: Array<Record<string, unknown>> = [];
  for (const sDoc of planSessionsSnap.docs) {
    const sData = sDoc.data();
    const sourceLibId = sData.source_library_session_id ?? sData.librarySessionRef ?? null;
    const sessionData: Record<string, unknown> = {
      ...sData,
      id: sDoc.id,
      source_plan_session_id: sDoc.id,
      source_library_session_id: sourceLibId,
    };
    delete sessionData.librarySessionRef;
    delete sessionData.useLocalContent;

    const exSnap = await sDoc.ref.collection("exercises").orderBy("order", "asc").get();
    let exercises: Array<Record<string, unknown>> = [];

    if (exSnap.empty && sourceLibId && creatorId) {
      try {
        const libRef = db.collection("creator_libraries").doc(creatorId).collection("sessions").doc(sourceLibId);
        const libDoc = await libRef.get();
        if (libDoc.exists) {
          const libData = libDoc.data()!;
          sessionData.title = sData.title ?? libData.title ?? null;
          sessionData.image_url = sData.image_url ?? libData.image_url ?? null;
          const libExSnap = await libRef.collection("exercises").orderBy("order", "asc").get();
          exercises = await Promise.all(
            libExSnap.docs.map(async (eDoc) => {
              const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
              return {...eDoc.data(), id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id}))};
            })
          );
        }
      } catch {/* best-effort library resolution */}
    } else {
      exercises = await Promise.all(
        exSnap.docs.map(async (eDoc) => {
          const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
          return {...eDoc.data(), id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id}))};
        })
      );
      if (sourceLibId && creatorId) {
        try {
          const libDoc = await db.collection("creator_libraries").doc(creatorId)
            .collection("sessions").doc(sourceLibId).get();
          if (libDoc.exists) {
            const libData = libDoc.data()!;
            sessionData.title = sData.title ?? libData.title ?? null;
            sessionData.image_url = sData.image_url ?? libData.image_url ?? null;
          }
        } catch {/* best-effort */}
      }
    }

    sessions.push({...sessionData, exercises});
  }

  // Write to client_plan_content using batches
  const moduleDoc = await db.collection("plans").doc(assignment.planId)
    .collection("modules").doc(assignment.moduleId).get();
  const moduleTitle = moduleDoc.exists ? (moduleDoc.data()?.title ?? weekKey) : weekKey;

  let batch = db.batch();
  let batchCount = 0;

  // Program-scoped template (id is `program_…`): no specific client.
  batch.set(docRef, clientPlanContentPayload(
    {creator_id: creatorId, client_id: null},
    {
      title: moduleTitle,
      order: 0,
      source_plan_id: assignment.planId,
      source_module_id: assignment.moduleId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }
  ));
  batchCount++;

  for (const session of sessions) {
    const sessionId = (session.id as string) ?? db.collection("_").doc().id;
    const sessionRef = docRef.collection("sessions").doc(sessionId);
    const {exercises: exArr, ...sessionFields} = session;
    batch.set(sessionRef, {
      ...sessionFields,
      id: sessionId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    batchCount++;

    if (Array.isArray(exArr)) {
      for (const exercise of exArr as Array<Record<string, unknown>>) {
        const exId = (exercise.id as string) ?? db.collection("_").doc().id;
        const exRef = sessionRef.collection("exercises").doc(exId);
        const {sets: setsArr, ...exFields} = exercise;
        batch.set(exRef, {...exFields, id: exId, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()});
        batchCount++;

        if (Array.isArray(setsArr)) {
          for (const set of setsArr as Array<Record<string, unknown>>) {
            const setId = (set.id as string) ?? db.collection("_").doc().id;
            batch.set(exRef.collection("sets").doc(setId), {...set, id: setId, created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()});
            batchCount++;
          }
        }

        if (batchCount >= 450) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }
  }

  if (batchCount > 0) await batch.commit();
  return {docId, alreadyExisted: false};
}

// GET /creator/programs/:programId/calendar?month=YYYY-MM
router.get("/creator/programs/:programId/calendar", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const month = req.query.month as string;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "month debe ser YYYY-MM", "month");
  }

  const {programId} = req.params;
  const courseDoc = await verifyProgramOwnership(auth.userId, programId);
  const creatorId = auth.userId;
  const planAssignments = (courseDoc.data()?.planAssignments ?? {}) as Record<
    string,
    { planId: string; moduleId: string; assignedAt?: string }
  >;

  const {weekKeys: visibleWeekKeys} = getCalendarMonthRange(month);
  const weekKeysWithPlans = visibleWeekKeys.filter((wk) => planAssignments[wk]?.planId);

  const planModuleCache = new Map<string, Record<string, unknown>>();
  const weeks: Record<string, unknown> = {};

  const readSessionList = async (sessionsCol: FirebaseFirestore.CollectionReference): Promise<Array<Record<string, unknown>>> => {
    const snap = await sessionsCol.orderBy("order", "asc").get();
    return snap.docs.map((d) => ({...d.data(), id: d.id}));
  };

  await Promise.all(
    weekKeysWithPlans.map(async (weekKey) => {
      const assignment = planAssignments[weekKey];
      const docId = programContentDocId(programId, weekKey);
      const docRef = db.collection("client_plan_content").doc(docId);

      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const sessions = await readSessionList(docRef.collection("sessions"));
        weeks[weekKey] = {
          planId: assignment.planId,
          moduleId: assignment.moduleId,
          moduleTitle: docSnap.data()?.title ?? weekKey,
          isPersonalized: true,
          sessions,
        };
        return;
      }

      const cacheKey = `${assignment.planId}_${assignment.moduleId}`;
      if (!planModuleCache.has(cacheKey)) {
        try {
          const moduleRef = db.collection("plans").doc(assignment.planId)
            .collection("modules").doc(assignment.moduleId);
          const [moduleDoc, sessions] = await Promise.all([
            moduleRef.get(),
            readSessionList(moduleRef.collection("sessions")),
          ]);

          const libPromises = sessions.map(async (session) => {
            const libRef = (session.source_library_session_id ?? session.librarySessionRef) as string | undefined;
            if (!libRef || !creatorId) return;
            try {
              const libDoc = await db.collection("creator_libraries").doc(creatorId)
                .collection("sessions").doc(libRef).get();
              if (libDoc.exists) {
                const libData = libDoc.data()!;
                if (!session.title) session.title = libData.title ?? null;
                if (!session.image_url) session.image_url = libData.image_url ?? null;
              }
            } catch {/* best-effort */}
          });
          await Promise.all(libPromises);

          planModuleCache.set(cacheKey, {
            moduleTitle: moduleDoc.exists ? (moduleDoc.data()?.title ?? weekKey) : weekKey,
            sessions,
          });
        } catch {
          planModuleCache.set(cacheKey, {moduleTitle: weekKey, sessions: []});
        }
      }

      const cached = planModuleCache.get(cacheKey)!;
      weeks[weekKey] = {
        planId: assignment.planId,
        moduleId: assignment.moduleId,
        moduleTitle: cached.moduleTitle,
        isPersonalized: false,
        sessions: cached.sessions,
      };
    })
  );

  // Also check for personalized content in weeks without plan assignments
  const weekKeysWithoutPlans = visibleWeekKeys.filter((wk) => !planAssignments[wk]?.planId);
  await Promise.all(
    weekKeysWithoutPlans.map(async (weekKey) => {
      const docId = programContentDocId(programId, weekKey);
      const docRef = db.collection("client_plan_content").doc(docId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) return;
      const sessions = await readSessionList(docRef.collection("sessions"));
      if (sessions.length === 0) return;
      weeks[weekKey] = {
        planId: null,
        moduleId: null,
        moduleTitle: weekKey,
        isPersonalized: true,
        sessions,
      };
    })
  );

  res.json({
    data: {
      planAssignments,
      weeks,
    },
  });
});

// POST /creator/programs/:programId/assign-plan
// Security (audit H-28): verify plan ownership before reading modules.
router.post("/creator/programs/:programId/assign-plan", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyProgramOwnership(auth.userId, req.params.programId);

  const {programId} = req.params;
  const {planId, startWeekKey} = req.body;

  if (!planId || typeof planId !== "string") {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "planId es requerido", "planId");
  }
  if (!startWeekKey || typeof startWeekKey !== "string") {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "startWeekKey es requerido", "startWeekKey");
  }

  const planDoc = await db.collection("plans").doc(planId).get();
  if (!planDoc.exists || planDoc.data()?.creator_id !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  // 1. Read plan modules
  const modulesSnap = await db.collection("plans").doc(planId)
    .collection("modules").orderBy("order", "asc").get();
  if (modulesSnap.empty) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Este plan no tiene semanas");
  }

  const modules = modulesSnap.docs.map((d) => ({...d.data(), id: d.id}));
  const weekKeys = getConsecutiveWeekKeys(startWeekKey, modules.length);

  // 2. Write planAssignments to the course document
  const courseRef = db.collection("courses").doc(programId);
  const assignmentUpdate: Record<string, unknown> = {};
  for (let i = 0; i < weekKeys.length; i++) {
    assignmentUpdate[`planAssignments.${weekKeys[i]}`] = {
      planId,
      moduleIndex: i,
      moduleId: modules[i].id,
      assignedAt: new Date().toISOString(),
    };
  }
  await courseRef.update(assignmentUpdate);

  // 3. Read sessions for each module (pre-resolved response)
  const weeks: Record<string, unknown> = {};
  await Promise.all(
    weekKeys.map(async (wk, i) => {
      const mod = modules[i];
      const moduleRef = db.collection("plans").doc(planId).collection("modules").doc(mod.id);
      const sessions = await readSessionTree(moduleRef.collection("sessions"));
      weeks[wk] = {
        planId,
        moduleId: mod.id,
        moduleTitle: (mod as Record<string, unknown>).title ?? `Semana ${i + 1}`,
        isPersonalized: false,
        sessions,
      };
    })
  );

  res.json({data: {assignedWeekKeys: weekKeys, weeks}});
});

// DELETE /creator/programs/:programId/remove-plan/:planId
router.delete("/creator/programs/:programId/remove-plan/:planId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const {programId, planId} = req.params;
  const courseDoc = await verifyProgramOwnership(auth.userId, programId);
  const planAssignments = (courseDoc.data()?.planAssignments ?? {}) as Record<string, { planId: string }>;

  const weekKeysToRemove = Object.keys(planAssignments).filter(
    (wk) => planAssignments[wk]?.planId === planId
  );

  if (weekKeysToRemove.length === 0) {
    res.json({data: {removedWeekKeys: []}});
    return;
  }

  const deleteUpdate: Record<string, unknown> = {};
  for (const wk of weekKeysToRemove) {
    deleteUpdate[`planAssignments.${wk}`] = FieldValue.delete();
  }
  await db.collection("courses").doc(programId).update(deleteUpdate);

  // Clean up client_plan_content documents
  await Promise.all(
    weekKeysToRemove.map((wk) => deleteClientPlanContentDoc(programContentDocId(programId, wk)))
  );

  res.json({data: {removedWeekKeys: weekKeysToRemove}});
});

// GET /creator/programs/:programId/plan-content/:weekKey
router.get("/creator/programs/:programId/plan-content/:weekKey", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyProgramOwnership(auth.userId, req.params.programId);

  const {programId, weekKey} = req.params;

  let docId = programContentDocId(programId, weekKey);
  let doc = await db.collection("client_plan_content").doc(docId).get();

  if (!doc.exists) {
    try {
      const result = await ensureProgramCopy(programId, weekKey, auth.userId);
      docId = result.docId;
      doc = await db.collection("client_plan_content").doc(docId).get();
    } catch {
      res.json({data: null});
      return;
    }
    if (!doc.exists) {
      res.json({data: null});
      return;
    }
  }

  const docData = doc.data()!;

  const sessionsSnap = await doc.ref.collection("sessions").orderBy("order", "asc").get();

  const sessions = await Promise.all(
    sessionsSnap.docs.map(async (sDoc) => {
      const sData = sDoc.data();
      const exSnap = await sDoc.ref.collection("exercises").orderBy("order", "asc").get();

      let exercises = await Promise.all(
        exSnap.docs.map(async (eDoc) => {
          const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
          return {...eDoc.data(), id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id}))};
        })
      );

      // Backfill: if exercises subcollection is empty but session has a library ref,
      // deep-copy exercises from the library session
      if (exercises.length === 0) {
        const sourceLibId = sData.source_library_session_id ?? sData.librarySessionRef ?? null;
        if (sourceLibId && auth.userId) {
          const libSessionRef = db.collection("creator_libraries").doc(auth.userId)
            .collection("sessions").doc(sourceLibId as string);
          const libDoc = await libSessionRef.get();
          if (libDoc.exists) {
            const libExSnap = await libSessionRef.collection("exercises").orderBy("order", "asc").get();
            if (!libExSnap.empty) {
              let batch = db.batch();
              let batchCount = 0;
              const backfilled: Array<Record<string, unknown>> = [];
              // Resolve current displayNames before persisting (avoids baking in
              // a stale name from the source library session).
              const libraryMap = await buildLibraryMapForExerciseDocs(libExSnap.docs);

              for (const eDoc of libExSnap.docs) {
                const exRef = sDoc.ref.collection("exercises").doc();
                const exData = eDoc.data();
                const resolvedName = resolveDisplayNameForBackfill(exData, libraryMap);
                const exDataPersist = resolvedName ?
                  {...exData, name: resolvedName, title: resolvedName} :
                  exData;
                batch.set(exRef, {...exDataPersist, id: exRef.id, created_at: FieldValue.serverTimestamp()});
                batchCount++;

                const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
                const sets: Array<Record<string, unknown>> = [];
                for (const setDoc of setsSnap.docs) {
                  const setRef = exRef.collection("sets").doc();
                  batch.set(setRef, {...setDoc.data(), id: setRef.id, created_at: FieldValue.serverTimestamp()});
                  batchCount++;
                  sets.push({...setDoc.data(), id: setRef.id});
                }
                if (batchCount >= 450) {
                  await batch.commit(); batch = db.batch(); batchCount = 0;
                }

                backfilled.push({id: exRef.id, ...exDataPersist, sets});
              }
              if (batchCount > 0) await batch.commit();

              if (sData.librarySessionRef && !sData.source_library_session_id) {
                await sDoc.ref.update({source_library_session_id: sData.librarySessionRef});
              }

              exercises = backfilled as typeof exercises;
            }
          }
        }
      }

      await hydrateExercisesWithLibraryNames(exercises as Array<Record<string, unknown>>);
      return {id: sDoc.id, ...sData, exercises};
    })
  );

  res.json({data: {...docData, programId, sessions}});
});

// PUT /creator/programs/:programId/plan-content/:weekKey
router.put("/creator/programs/:programId/plan-content/:weekKey", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyProgramOwnership(auth.userId, req.params.programId);

  const {programId, weekKey} = req.params;
  const body = req.body ?? {};
  const docId = programContentDocId(programId, weekKey);
  const docRef = db.collection("client_plan_content").doc(docId);

  const sessions = Array.isArray(body.sessions) ? body.sessions : [];
  const deletions = Array.isArray(body.deletions) ? body.deletions as string[] : [];

  // Program-scoped template (id is `program_…`): no specific client.
  await docRef.set(clientPlanContentPayload(
    {creator_id: auth.userId, client_id: null},
    {
      title: body.title ?? weekKey,
      order: body.order ?? 0,
      source_plan_id: body.source_plan_id ?? null,
      source_module_id: body.source_module_id ?? null,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    }
  ));

  const batch = db.batch();
  let batchCount = 0;

  // Security (audit C-04): same strict path validation as the clients-side
  // sibling endpoint above (audit C-03).
  for (const delPath of deletions) {
    const segments = validateDeletionPath(delPath);
    let ref: FirebaseFirestore.DocumentReference = docRef;
    for (let i = 0; i < segments.length; i += 2) {
      ref = ref.collection(segments[i]).doc(segments[i + 1]);
    }
    batch.delete(ref);
    batchCount++;
  }

  // Write incoming sessions/exercises/sets
  for (const session of sessions) {
    if (!session || typeof session !== "object") continue;
    const sessionId = session.id ?? session.sessionId ?? db.collection("_").doc().id;
    const sessionRef = docRef.collection("sessions").doc(sessionId);
    const {exercises: exArr, ...sessionFields} = session as Record<string, unknown>;
    batch.set(sessionRef, {
      ...sessionFields,
      id: sessionId,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    batchCount++;

    if (Array.isArray(exArr)) {
      for (const exercise of exArr) {
        if (!exercise || typeof exercise !== "object") continue;
        const exId = (exercise as Record<string, unknown>).id ?? db.collection("_").doc().id;
        const exRef = sessionRef.collection("exercises").doc(exId as string);
        const {sets: setsArr, ...exFields} = exercise as Record<string, unknown>;
        batch.set(exRef, {...exFields, id: exId, created_at: FieldValue.serverTimestamp()});
        batchCount++;

        if (Array.isArray(setsArr)) {
          for (const set of setsArr) {
            if (!set || typeof set !== "object") continue;
            const setId = (set as Record<string, unknown>).id ?? db.collection("_").doc().id;
            batch.set(exRef.collection("sets").doc(setId as string), {...set, id: setId, created_at: FieldValue.serverTimestamp()});
            batchCount++;
          }
        }

        if (batchCount >= 450) {
          await batch.commit(); batchCount = 0;
        }
      }
    }
  }

  if (batchCount > 0) await batch.commit();
  res.json({data: {docId, weekKey, sessionsWritten: sessions.length}});
});

// DELETE /creator/programs/:programId/weeks/:weekKey/sessions/:sessionId
router.delete("/creator/programs/:programId/weeks/:weekKey/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyProgramOwnership(auth.userId, req.params.programId);

  const {programId, weekKey, sessionId} = req.params;
  const {docId} = await ensureProgramCopy(programId, weekKey, auth.userId);
  const docRef = db.collection("client_plan_content").doc(docId);
  const sessionRef = docRef.collection("sessions").doc(sessionId);

  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesion no encontrada en esta semana");
  }

  const exSnap = await sessionRef.collection("exercises").get();
  let batch = db.batch();
  let count = 0;
  for (const eDoc of exSnap.docs) {
    const setsSnap = await eDoc.ref.collection("sets").get();
    for (const setDoc of setsSnap.docs) {
      batch.delete(setDoc.ref);
      count++;
      if (count >= 450) {
        await batch.commit(); batch = db.batch(); count = 0;
      }
    }
    batch.delete(eDoc.ref);
    count++;
  }
  batch.delete(sessionRef);
  count++;
  if (count > 0) await batch.commit();

  const remainingSessions = await readSessionTree(docRef.collection("sessions"));
  res.json({data: {weekKey, isPersonalized: true, sessions: remainingSessions}});
});

// PATCH /creator/programs/:programId/weeks/:weekKey/sessions/:sessionId
router.patch("/creator/programs/:programId/weeks/:weekKey/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyProgramOwnership(auth.userId, req.params.programId);

  const {programId, weekKey, sessionId} = req.params;
  const {docId} = await ensureProgramCopy(programId, weekKey, auth.userId);
  const sessionRef = db.collection("client_plan_content").doc(docId).collection("sessions").doc(sessionId);

  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesion no encontrada en esta semana");
  }

  const allowedFields = ["title", "order", "dayIndex", "isRestDay", "image_url", "source_library_session_id", "defaultDataTemplate"];
  const updates = pickFields(req.body, allowedFields);
  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar");
  }

  await sessionRef.update({...updates, updated_at: FieldValue.serverTimestamp()});
  res.json({data: {sessionId, weekKey, isPersonalized: true, updated: true}});
});

// POST /creator/programs/:programId/weeks/:weekKey/sessions
router.post("/creator/programs/:programId/weeks/:weekKey/sessions", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyProgramOwnership(auth.userId, req.params.programId);

  const {programId, weekKey} = req.params;
  const {librarySessionId, dayIndex} = req.body;

  if (!librarySessionId || typeof librarySessionId !== "string") {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "librarySessionId es requerido", "librarySessionId");
  }

  const {docId} = await ensureProgramCopy(programId, weekKey, auth.userId);
  const docRef = db.collection("client_plan_content").doc(docId);

  const libSessionRef = db.collection("creator_libraries").doc(auth.userId)
    .collection("sessions").doc(librarySessionId);
  const libDoc = await libSessionRef.get();
  if (!libDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesion de biblioteca no encontrada");
  }
  const libData = libDoc.data()!;

  const libExSnap = await libSessionRef.collection("exercises").orderBy("order", "asc").get();
  const exercises = await Promise.all(
    libExSnap.docs.map(async (eDoc) => {
      const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
      return {...eDoc.data(), id: eDoc.id, sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id}))};
    })
  );

  const newSessionId = db.collection("_").doc().id;
  const sessionRef = docRef.collection("sessions").doc(newSessionId);
  const sessionData: Record<string, unknown> = {
    id: newSessionId,
    title: libData.title ?? libData.name ?? "Sesion",
    order: 99,
    dayIndex: typeof dayIndex === "number" ? dayIndex : null,
    image_url: libData.image_url ?? null,
    source_library_session_id: librarySessionId,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  let batch = db.batch();
  let batchCount = 0;
  batch.set(sessionRef, sessionData);
  batchCount++;

  for (const ex of exercises) {
    const exId = (ex.id as string) ?? db.collection("_").doc().id;
    const exRef = sessionRef.collection("exercises").doc(exId);
    const {sets: setsArr, ...exFields} = ex;
    batch.set(exRef, {...exFields, id: exId, created_at: FieldValue.serverTimestamp()});
    batchCount++;
    if (Array.isArray(setsArr)) {
      for (const set of setsArr as Array<Record<string, unknown>>) {
        const setId = (set.id as string) ?? db.collection("_").doc().id;
        batch.set(exRef.collection("sets").doc(setId), {...set, id: setId, created_at: FieldValue.serverTimestamp()});
        batchCount++;
      }
    }
    if (batchCount >= 450) {
      await batch.commit(); batch = db.batch(); batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();

  res.status(201).json({
    data: {weekKey, isPersonalized: true, session: {...sessionData, exercises}},
  });
});

// ─── Program Nutrition Assignments ────────────────────────────────────────

// GET /creator/programs/:programId/nutrition/assignments
router.get("/creator/programs/:programId/nutrition/assignments", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyProgramOwnership(auth.userId, req.params.programId);

  const snap = await db.collection("nutrition_assignments")
    .where("programId", "==", req.params.programId)
    .where("source", "==", "program")
    .get();

  const assignments = snap.docs.map((d) => ({
    assignmentId: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() ?? null,
    updatedAt: d.data().updatedAt?.toDate?.()?.toISOString?.() ?? null,
  }));

  res.json({data: assignments});
});

// POST /creator/programs/:programId/nutrition/assignments
router.post("/creator/programs/:programId/nutrition/assignments", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyProgramOwnership(auth.userId, req.params.programId);

  const body = validateBody<{ planId: string }>(
    {planId: "string"},
    req.body
  );

  const planDoc = await db
    .collection("creator_nutrition_library")
    .doc(auth.userId)
    .collection("plans")
    .doc(body.planId)
    .get();

  if (!planDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
  }

  const planData = planDoc.data()!;

  const assignmentRef = db.collection("nutrition_assignments").doc();
  const batch = db.batch();

  // Program-scoped assignment template — no specific client.
  batch.set(assignmentRef, nutritionAssignmentPayload(
    {creator_id: auth.userId, clientUserId: null},
    {
      userId: null,
      programId: req.params.programId,
      source: "program",
      assignedBy: auth.userId,
      planId: body.planId,
      planName: planData.name ?? "",
      plan: planData,
      startDate: null,
      endDate: null,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }
  ));

  batch.set(
    db.collection("client_nutrition_plan_content").doc(assignmentRef.id),
    clientNutritionPlanContentPayload(
      {creator_id: auth.userId, client_id: null},
      buildNutritionContentDoc(planData, assignmentRef.id, body.planId, false)
    )
  );

  await batch.commit();
  res.status(201).json({data: {assignmentId: assignmentRef.id}});
});

// DELETE /creator/programs/:programId/nutrition/assignments/:assignmentId
router.delete("/creator/programs/:programId/nutrition/assignments/:assignmentId", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  await verifyProgramOwnership(auth.userId, req.params.programId);

  const assignRef = db.collection("nutrition_assignments").doc(req.params.assignmentId);
  const assignDoc = await assignRef.get();
  if (!assignDoc.exists || assignDoc.data()?.assignedBy !== auth.userId) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Asignacion no encontrada");
  }

  const batch = db.batch();
  batch.delete(assignRef);
  batch.delete(db.collection("client_nutrition_plan_content").doc(req.params.assignmentId));
  await batch.commit();

  res.status(204).send();
});

// POST /creator/request-api-access — send email requesting API access
router.post("/creator/request-api-access", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const userDoc = await db.collection("users").doc(auth.userId).get();
  const userData = userDoc.data() || {};
  const creatorName = userData.displayName || userData.name || auth.userId;
  const creatorEmail = userData.email || "sin email";

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[request-api-access] RESEND_API_KEY not available");
    throw new WakeApiServerError("INTERNAL_ERROR", 500, "Servicio de email no disponible");
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: "Wake Platform <platform@wakelab.co>",
    to: "emilioloboguerrero@gmail.com",
    subject: `Solicitud de acceso API - ${creatorName}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#1a1a1a;color:#fff;border-radius:12px;">
        <h2 style="margin:0 0 16px;font-size:18px;color:#fff;">Solicitud de acceso a API</h2>
        <p style="margin:0 0 8px;color:rgba(255,255,255,0.7);font-size:14px;">
          <strong style="color:#fff;">${escapeHtml(String(creatorName))}</strong> esta solicitando acceso a las integraciones de API.
        </p>
        <p style="margin:0 0 24px;color:rgba(255,255,255,0.5);font-size:13px;">
          Email: ${escapeHtml(String(creatorEmail))}<br/>
          User ID: ${escapeHtml(auth.userId)}
        </p>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:16px 0;"/>
        <p style="margin:0;color:rgba(255,255,255,0.3);font-size:12px;">Wake Platform</p>
      </div>
    `,
  });

  res.status(200).json({data: {sent: true}});
});

// GET /creator/check-username/:username — check username availability
// L-27: any authenticated user can call this (intentional for the pre-creator
// signup flow). Rate-limit to deter username enumeration. requireCreator is
// not used because callers haven't been promoted yet.
router.get("/creator/check-username/:username", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  await checkRateLimit(auth.userId, 30, "rate_limit_first_party");

  const username = req.params.username?.toLowerCase();
  if (!username || !/^[a-z0-9_-]+$/.test(username)) {
    res.json({data: {available: false}});
    return;
  }

  const existing = await db.collection("users")
    .where("username", "==", username)
    .limit(1)
    .get();

  res.json({data: {available: existing.empty}});
});

// POST /creator/register — bootstrap a new creator account
//
// Security (audit H-24): require verified email + write audit log entry.
// Previously any authenticated user could self-elevate to creator role
// (which unlocks course creation, email broadcasts, API keys, etc.) with no
// friction beyond the 200rpm rate limit. This is the monetization-bypass
// surface that combines worst with H-26 (creator email broadcasts use Wake's
// brand From address).
router.post("/creator/register", async (req, res) => {
  // Lower per-user rate limit to discourage brute attempts even before role check
  const auth = await validateAuthAndRateLimit(req, 10);

  const userRef = db.collection("users").doc(auth.userId);
  const userDoc = await userRef.get();
  const currentRole = userDoc.exists ? userDoc.data()?.role : null;

  if (currentRole === "creator" || currentRole === "admin") {
    res.json({data: {userId: auth.userId, alreadyCreator: true}});
    return;
  }

  // Require email-verified Firebase Auth status to prevent throwaway
  // unverified accounts from elevating themselves.
  let authRecord;
  try {
    authRecord = await admin.auth().getUser(auth.userId);
  } catch {
    throw new WakeApiServerError(
      "UNAUTHENTICATED", 401, "Cuenta de autenticación no encontrada"
    );
  }
  if (!authRecord.emailVerified) {
    throw new WakeApiServerError(
      "FORBIDDEN",
      403,
      "Verifica tu correo electrónico antes de crear una cuenta de creador"
    );
  }
  if (!authRecord.email) {
    throw new WakeApiServerError(
      "FORBIDDEN",
      403,
      "Tu cuenta debe tener un correo electrónico para registrarse como creador"
    );
  }

  const body = validateBody<{
    displayName: string;
    username: string;
    birthDate: string;
    gender: string;
    country: string;
    city: string;
  }>({
    displayName: "string",
    username: "string",
    birthDate: "string",
    gender: "string",
    country: "string",
    city: "string",
  }, req.body);

  if (!body.displayName || body.displayName.length > 100) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Nombre es requerido (max 100 caracteres)", "displayName");
  }
  if (!body.username || body.username.length > 50) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Username es requerido (max 50 caracteres)", "username");
  }
  if (!/^[a-z0-9_-]+$/.test(body.username)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Username solo puede contener letras, numeros, guiones y guiones bajos", "username");
  }
  if (!body.birthDate) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Fecha de nacimiento es requerida", "birthDate");
  }
  if (!["male", "female", "other"].includes(body.gender)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Genero debe ser male, female u other", "gender");
  }
  if (!body.country || body.country.length > 10) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Pais es requerido", "country");
  }
  if (!body.city || body.city.length > 100) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Ciudad es requerida", "city");
  }

  const existingUser = await db.collection("users")
    .where("username", "==", body.username.toLowerCase())
    .limit(1)
    .get();

  if (!existingUser.empty && existingUser.docs[0].id !== auth.userId) {
    throw new WakeApiServerError("CONFLICT", 409, "Este username ya esta en uso", "username");
  }

  await userRef.set({
    role: "creator",
    displayName: body.displayName,
    username: body.username.toLowerCase(),
    birthDate: body.birthDate,
    gender: body.gender,
    country: body.country,
    city: body.city,
    webOnboardingCompleted: false,
    profileCompleted: true,
    updated_at: FieldValue.serverTimestamp(),
  }, {merge: true});

  // Audit log — every role elevation persisted for forensics
  await db.collection("audit_log_role_elevation").add({
    userId: auth.userId,
    email: authRecord.email,
    fromRole: currentRole ?? "user",
    toRole: "creator",
    via: "self_register",
    ip: req.ip ?? null,
    userAgent: req.header("user-agent") ?? null,
    at: FieldValue.serverTimestamp(),
  });

  // L-05: stamp role onto the Firebase ID token via a custom claim so
  // firestore.rules can read request.auth.token.role directly. The PWA forces
  // a token refresh after this call so the new claim takes effect immediately.
  try {
    await admin.auth().setCustomUserClaims(auth.userId, {role: "creator"});
  } catch (err) {
    functions.logger.warn("creator-register: setCustomUserClaims failed", {
      uid: auth.userId,
      error: String(err),
    });
  }

  res.status(201).json({data: {userId: auth.userId, role: "creator"}});
});

export default router;
