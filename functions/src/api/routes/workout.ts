import { Router } from "express";
import * as functions from "firebase-functions";
import { db, FieldValue } from "../firestore.js";
import type { Query } from "../firestore.js";
import { validateAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { WakeApiServerError } from "../errors.js";

const router = Router();

// Max guards for unbounded reads
const MAX_MODULES_PER_COURSE = 20;
const MAX_SESSIONS_PER_MODULE = 50;

// GET /workout/daily
router.get("/workout/daily", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.query.courseId as string;

  if (!courseId) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "courseId es requerido", "courseId"
    );
  }

  // Verify user owns the course
  const userDoc = await db.collection("users").doc(auth.userId).get();
  const courses = userDoc.data()?.courses ?? {};
  const courseAccess = courses[courseId];

  if (!courseAccess || courseAccess.status !== "active") {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este programa");
  }

  // Load course to determine delivery type and structure
  const courseDoc = await db.collection("courses").doc(courseId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const course = courseDoc.data()!;
  const deliveryType = course.deliveryType ?? "low_ticket";

  // Resolve the target session based on delivery type
  let targetModuleId: string | null = null;
  let targetSessionId: string | null = null;
  let completedSessionIds: Set<string> | null = null;

  if (deliveryType === "one_on_one") {
    // One-on-one: check plans assigned to this user for the current week
    const plansSnap = await db
      .collection("plans")
      .where("courseId", "==", courseId)
      .where("userId", "==", auth.userId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (plansSnap.empty) {
      res.json({
        data: {
          hasSession: false,
          isRestDay: false,
          emptyReason: "no_planning_this_week",
          session: null,
          progress: { completed: 0, total: null },
        },
      });
      return;
    }

    const planData = plansSnap.docs[0].data();
    targetModuleId = planData.currentModuleId ?? null;
    targetSessionId = planData.currentSessionId ?? null;
  } else {
    // Low-ticket: resolve from course modules structure
    // Guard: max modules
    const modulesSnap = await db
      .collection("courses")
      .doc(courseId)
      .collection("modules")
      .orderBy("order", "asc")
      .limit(MAX_MODULES_PER_COURSE)
      .get();

    if (modulesSnap.empty) {
      res.json({
        data: {
          hasSession: false,
          isRestDay: false,
          emptyReason: "no_planning_this_week",
          session: null,
          progress: { completed: 0, total: null },
        },
      });
      return;
    }

    // Gather all sessions across modules — guard: max sessions per module
    const allSessions: Array<{ moduleId: string; sessionId: string; order: number; moduleOrder: number }> = [];
    for (const mod of modulesSnap.docs) {
      const sessionsSnap = await db
        .collection("courses")
        .doc(courseId)
        .collection("modules")
        .doc(mod.id)
        .collection("sessions")
        .orderBy("order", "asc")
        .limit(MAX_SESSIONS_PER_MODULE)
        .get();

      for (const sess of sessionsSnap.docs) {
        allSessions.push({
          moduleId: mod.id,
          sessionId: sess.id,
          order: sess.data().order ?? 0,
          moduleOrder: mod.data().order ?? 0,
        });
      }
    }

    allSessions.sort((a, b) => a.moduleOrder - b.moduleOrder || a.order - b.order);

    if (allSessions.length === 0) {
      res.json({
        data: {
          hasSession: false,
          isRestDay: false,
          emptyReason: "no_planning_this_week",
          session: null,
          progress: { completed: 0, total: null },
        },
      });
      return;
    }

    // Check completed sessions for this course
    const completedSnap = await db
      .collection("users")
      .doc(auth.userId)
      .collection("sessionHistory")
      .where("courseId", "==", courseId)
      .get();

    completedSessionIds = new Set(completedSnap.docs.map((d) => d.data().sessionId));

    // Find the next uncompleted session
    const nextSession = allSessions.find((s) => !completedSessionIds!.has(s.sessionId));

    if (!nextSession) {
      res.json({
        data: {
          hasSession: false,
          isRestDay: false,
          emptyReason: "all_sessions_completed",
          session: null,
          progress: { completed: completedSessionIds.size, total: allSessions.length },
        },
      });
      return;
    }

    targetModuleId = nextSession.moduleId;
    targetSessionId = nextSession.sessionId;
  }

  if (!targetModuleId || !targetSessionId) {
    res.json({
      data: {
        hasSession: false,
        isRestDay: false,
        emptyReason: "no_planning_this_week",
        session: null,
        progress: { completed: 0, total: null },
      },
    });
    return;
  }

  // Read the full session tree: session → exercises → sets
  const sessionDoc = await db
    .collection("courses")
    .doc(courseId)
    .collection("modules")
    .doc(targetModuleId)
    .collection("sessions")
    .doc(targetSessionId)
    .get();

  if (!sessionDoc.exists) {
    res.json({
      data: {
        hasSession: false,
        isRestDay: false,
        emptyReason: "no_planning_this_week",
        session: null,
        progress: { completed: 0, total: null },
      },
    });
    return;
  }

  const sessionInfo = sessionDoc.data()!;

  // Load exercises
  const exercisesSnap = await db
    .collection("courses")
    .doc(courseId)
    .collection("modules")
    .doc(targetModuleId)
    .collection("sessions")
    .doc(targetSessionId)
    .collection("exercises")
    .orderBy("order", "asc")
    .get();

  // Load sets for each exercise in parallel
  const exercisesWithSets = await Promise.all(
    exercisesSnap.docs.map(async (exDoc) => {
      const exData = exDoc.data();
      const setsSnap = await db
        .collection("courses")
        .doc(courseId)
        .collection("modules")
        .doc(targetModuleId!)
        .collection("sessions")
        .doc(targetSessionId!)
        .collection("exercises")
        .doc(exDoc.id)
        .collection("sets")
        .orderBy("order", "asc")
        .get();

      return {
        exerciseId: exDoc.id,
        libraryId: exData.libraryId ?? null,
        name: exData.name ?? "",
        order: exData.order ?? 0,
        primaryMuscles: exData.primaryMuscles ?? [],
        sets: setsSnap.docs.map((setDoc) => {
          const setData = setDoc.data();
          return {
            setId: setDoc.id,
            reps: setData.reps ?? null,
            weight: setData.weight ?? null,
            intensity: setData.intensity ?? null,
            rir: setData.rir ?? null,
          };
        }),
        exerciseKey: exData.libraryId
          ? `${exData.libraryId}_${exData.name}`
          : exDoc.id,
      };
    })
  );

  // Batch-fetch lastPerformance for all exercises
  const exerciseKeys = exercisesWithSets
    .map((ex) => ex.exerciseKey)
    .filter(Boolean);

  const lastPerfMap: Record<string, Record<string, unknown>> = {};
  if (exerciseKeys.length > 0) {
    const lastPerfPromises = exerciseKeys.map((key) =>
      db
        .collection("users")
        .doc(auth.userId)
        .collection("exerciseLastPerformance")
        .doc(key)
        .get()
    );
    const lastPerfDocs = await Promise.all(lastPerfPromises);
    for (const doc of lastPerfDocs) {
      if (doc.exists) {
        lastPerfMap[doc.id] = doc.data()!;
      }
    }
  }

  // Assemble exercises with lastPerformance
  const exercises = exercisesWithSets.map((ex) => {
    const lastPerf = lastPerfMap[ex.exerciseKey] ?? null;
    let lastPerformance: Record<string, unknown> | null = null;

    if (lastPerf) {
      const sets = (lastPerf.sets ?? []) as Array<{ weight?: number; reps?: number }>;
      const bestSet = sets.reduce(
        (best: { weight: number; reps: number } | null, s) => {
          const w = s.weight ?? 0;
          const r = s.reps ?? 0;
          if (!best || w > best.weight || (w === best.weight && r > best.reps)) {
            return { weight: w, reps: r };
          }
          return best;
        },
        null
      );

      lastPerformance = {
        sessionId: lastPerf.completionId ?? null,
        date: lastPerf.date ?? null,
        sets,
        bestSet,
      };
    }

    return {
      exerciseId: ex.exerciseId,
      libraryId: ex.libraryId,
      name: ex.name,
      order: ex.order,
      primaryMuscles: ex.primaryMuscles,
      sets: ex.sets,
      lastPerformance,
    };
  });

  // Reuse completedSessionIds if already fetched (low_ticket path), otherwise fetch
  const completedCount = completedSessionIds
    ? completedSessionIds.size
    : (await db
        .collection("users")
        .doc(auth.userId)
        .collection("sessionHistory")
        .where("courseId", "==", courseId)
        .count()
        .get()).data().count;

  res.json({
    data: {
      hasSession: true,
      isRestDay: false,
      emptyReason: null,
      session: {
        sessionId: targetSessionId,
        title: sessionInfo.title ?? "",
        order: sessionInfo.order ?? 0,
        deliveryType,
        exercises,
      },
      progress: {
        completed: completedCount,
        total: null,
      },
    },
  });
});

// GET /workout/courses
router.get("/workout/courses", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const userDoc = await db.collection("users").doc(auth.userId).get();
  const coursesMap = userDoc.data()?.courses ?? {};

  const coursesList = Object.entries(coursesMap as Record<string, Record<string, unknown>>).map(
    ([courseId, entry]) => ({
      courseId,
      title: entry.title ?? null,
      imageUrl: entry.image_url ?? null,
      deliveryType: entry.deliveryType ?? "low_ticket",
      status: entry.status ?? "active",
      expiresAt: entry.expires_at ?? null,
      purchasedAt: entry.purchased_at ?? null,
    })
  );

  res.json({ data: coursesList });
});

// GET /workout/courses/:courseId
router.get("/workout/courses/:courseId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  // Access control: verify user has the course or is the creator
  const userDoc = await db.collection("users").doc(auth.userId).get();
  const courses = userDoc.data()?.courses ?? {};
  const hasAccess = courses[req.params.courseId];

  const courseDoc = await db.collection("courses").doc(req.params.courseId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const isCreator = courseDoc.data()?.creator_id === auth.userId;

  if (!hasAccess && !isCreator) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este programa");
  }

  res.json({ data: { id: courseDoc.id, ...courseDoc.data() } });
});

// POST /workout/complete — atomic session completion
router.post("/workout/complete", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{
    courseId: string;
    sessionId: string;
    completedAt: string;
    durationMs: number;
    exercises: unknown[];
    userNotes?: string;
    plannedSnapshot?: unknown;
  }>(
    {
      courseId: "string",
      sessionId: "string",
      completedAt: "string",
      durationMs: "number",
      exercises: "array",
      userNotes: "optional_string",
      plannedSnapshot: "optional_object",
    },
    req.body,
    { maxArrayLength: 50 }
  );

  // Extract date from completedAt for idempotency key
  const completionDate = body.completedAt.slice(0, 10);

  // Idempotency check
  const completionId = `${auth.userId}_${body.sessionId}_${completionDate}`;
  const existingCompletion = await db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .doc(completionId)
    .get();

  if (existingCompletion.exists) {
    throw new WakeApiServerError("CONFLICT", 409, "Esta sesión ya fue completada hoy");
  }

  const exercises = body.exercises as Array<{
    exerciseKey?: string;
    exerciseId?: string;
    libraryId?: string;
    exerciseName?: string;
    primaryMuscles?: string[];
    sets?: Array<{ reps?: number; weight?: number; intensity?: string | null; rir?: number | null }>;
    [key: string]: unknown;
  }>;

  // Cap exercises at 50, sets per exercise at 20
  if (exercises.length > 50) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "Máximo 50 ejercicios por sesión", "exercises");
  }
  for (const ex of exercises) {
    if (ex.sets && ex.sets.length > 20) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "Máximo 20 sets por ejercicio", "exercises");
    }
  }

  // Pre-fetch existing PRs for all exercises to compare
  const exerciseKeys = exercises
    .map((ex) => {
      if (ex.exerciseKey) return ex.exerciseKey;
      if (ex.libraryId && ex.exerciseName) return `${ex.libraryId}_${ex.exerciseName}`;
      return ex.exerciseId ?? null;
    })
    .filter(Boolean) as string[];

  const existingPrMap: Record<string, { estimate1RM: number }> = {};
  if (exerciseKeys.length > 0) {
    const prDocs = await Promise.all(
      exerciseKeys.map((key) =>
        db
          .collection("users")
          .doc(auth.userId)
          .collection("exerciseLastPerformance")
          .doc(key)
          .get()
      )
    );
    for (const doc of prDocs) {
      if (doc.exists) {
        const data = doc.data()!;
        existingPrMap[doc.id] = { estimate1RM: data.estimate1RM ?? 0 };
      }
    }
  }

  // Read user doc for streak computation
  const userDoc = await db.collection("users").doc(auth.userId).get();
  const userData = userDoc.data() ?? {};
  const activityStreak = userData.activityStreak ?? {};
  const previousStreak = activityStreak.currentStreak ?? 0;
  const previousLongest = activityStreak.longestStreak ?? 0;
  const lastSessionDate = activityStreak.lastActivityDate ?? userData.lastSessionDate ?? null;

  // Compute streak
  let newStreak = 1;
  if (lastSessionDate) {
    const lastDate = new Date(lastSessionDate);
    const currentDate = new Date(completionDate);
    const diffMs = currentDate.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      newStreak = previousStreak + 1;
    } else if (diffDays === 0) {
      newStreak = previousStreak;
    } else {
      newStreak = 1;
    }
  }

  const newLongest = Math.max(newStreak, previousLongest);

  let flameLevel = 0;
  if (newStreak >= 14) flameLevel = 3;
  else if (newStreak >= 7) flameLevel = 2;
  else if (newStreak >= 3) flameLevel = 1;

  // Compute 1RM per exercise and detect PRs
  const personalRecords: Array<{
    exerciseKey: string;
    exerciseName: string;
    newEstimate1RM: number;
    achievedWith: { weight: number; reps: number; intensity: string | null };
  }> = [];

  const batch = db.batch();

  // 1. Session history
  const sessionHistoryRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .doc(completionId);

  batch.set(sessionHistoryRef, {
    courseId: body.courseId,
    sessionId: body.sessionId,
    exercises: body.exercises,
    durationMs: body.durationMs,
    date: completionDate,
    completedAt: body.completedAt,
    userNotes: body.userNotes ?? null,
    plannedSnapshot: body.plannedSnapshot ?? null,
    completed_at: FieldValue.serverTimestamp(),
  });

  // 2. Exercise history + last performance + 1RM per exercise
  for (let i = 0; i < exercises.length; i++) {
    const exercise = exercises[i];
    const exerciseKey = exerciseKeys[i];
    if (!exerciseKey) continue;

    let bestEstimate1RM = 0;
    let bestSet: { weight: number; reps: number; intensity: string | null } | null = null;

    for (const set of exercise.sets ?? []) {
      const weight = set.weight ?? 0;
      const reps = set.reps ?? 0;
      if (weight <= 0 || reps <= 0) continue;

      const estimate = weight * (1 + 0.0333 * reps);

      if (estimate > bestEstimate1RM) {
        bestEstimate1RM = estimate;
        bestSet = { weight, reps, intensity: set.intensity ?? null };
      }
    }

    const existingPr = existingPrMap[exerciseKey];
    const existingEstimate = existingPr?.estimate1RM ?? 0;

    if (bestEstimate1RM > existingEstimate && bestSet) {
      personalRecords.push({
        exerciseKey,
        exerciseName: exercise.exerciseName ?? exercise.exerciseKey ?? exerciseKey,
        newEstimate1RM: Math.round(bestEstimate1RM * 100) / 100,
        achievedWith: bestSet,
      });
    }

    const historyRef = db
      .collection("users")
      .doc(auth.userId)
      .collection("exerciseHistory")
      .doc(exerciseKey);

    batch.set(
      historyRef,
      {
        entries: FieldValue.arrayUnion({
          date: completionDate,
          sets: exercise.sets ?? [],
          completionId,
        }),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const lastPerfRef = db
      .collection("users")
      .doc(auth.userId)
      .collection("exerciseLastPerformance")
      .doc(exerciseKey);

    batch.set(lastPerfRef, {
      date: completionDate,
      sets: exercise.sets ?? [],
      completionId,
      estimate1RM: bestEstimate1RM > 0 ? Math.round(bestEstimate1RM * 100) / 100 : existingEstimate,
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  // 3. Compute muscle volumes from exercises
  const muscleVolumes: Record<string, number> = {};
  for (const exercise of exercises) {
    const muscles = exercise.primaryMuscles ?? [];
    const setCount = (exercise.sets ?? []).length;
    for (const muscle of muscles) {
      muscleVolumes[muscle] = (muscleVolumes[muscle] ?? 0) + setCount;
    }
  }

  // 4. Update user streak + last session
  const userRef = db.collection("users").doc(auth.userId);
  batch.update(userRef, {
    lastSessionDate: completionDate,
    activityStreak: {
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActivityDate: completionDate,
      flameLevel,
    },
    updated_at: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // Delete checkpoint if exists (non-blocking, log errors)
  db.collection("users")
    .doc(auth.userId)
    .collection("activeSession")
    .doc("current")
    .delete()
    .catch((err) => {
      functions.logger.error("Failed to delete checkpoint after completion", err);
    });

  res.json({
    data: {
      completionId,
      personalRecords,
      streak: {
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastActivityDate: completionDate,
        flameLevel,
      },
      muscleVolumes,
    },
  });
});

// GET /workout/sessions — paginated session history
router.get("/workout/sessions", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.query.courseId as string | undefined;
  const pageToken = req.query.pageToken as string | undefined;
  const limit = 20;

  let query: Query = db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .orderBy("completed_at", "desc")
    .limit(limit + 1);

  if (courseId) {
    query = query.where("courseId", "==", courseId);
  }

  if (pageToken) {
    const cursorDoc = await db
      .collection("users")
      .doc(auth.userId)
      .collection("sessionHistory")
      .doc(pageToken)
      .get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, limit);
  const hasMore = snapshot.docs.length > limit;

  res.json({
    data: docs.map((d) => ({ id: d.id, ...d.data() })),
    nextPageToken: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
  });
});

// GET /workout/sessions/:completionId
router.get("/workout/sessions/:completionId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .doc(req.params.completionId)
    .get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  res.json({ data: { id: doc.id, ...doc.data() } });
});

// PATCH /workout/sessions/:completionId/notes
router.patch("/workout/sessions/:completionId/notes", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 100, "rate_limit_first_party");

  const body = validateBody<{ userNotes: string }>(
    { userNotes: "string" },
    req.body
  );

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .doc(req.params.completionId);

  const doc = await docRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  await docRef.update({ userNotes: body.userNotes });

  res.json({ data: { updated: true } });
});

// GET /workout/exercises/:exerciseKey/history
router.get("/workout/exercises/:exerciseKey/history", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db
    .collection("users")
    .doc(auth.userId)
    .collection("exerciseHistory")
    .doc(req.params.exerciseKey)
    .get();

  if (!doc.exists) {
    res.json({ data: { entries: [] } });
    return;
  }

  const data = doc.data()!;
  const entries = (data.entries ?? []) as unknown[];

  // Paginate in-memory (entries stored as array)
  const rawPageToken = req.query.pageToken as string | undefined;
  let pageToken = 0;
  if (rawPageToken) {
    const parsed = parseInt(rawPageToken, 10);
    if (isNaN(parsed) || parsed < 0) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "pageToken inválido", "pageToken");
    }
    pageToken = parsed;
  }
  const limit = 50;
  const slice = entries.slice(pageToken, pageToken + limit);

  res.json({
    data: slice,
    nextPageToken: pageToken + limit < entries.length ? String(pageToken + limit) : null,
    hasMore: pageToken + limit < entries.length,
  });
});

// GET /workout/streak
router.get("/workout/streak", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const userDoc = await db.collection("users").doc(auth.userId).get();
  const data = userDoc.data() ?? {};
  const streak = data.activityStreak ?? {};

  res.json({
    data: {
      currentStreak: streak.currentStreak ?? 0,
      longestStreak: streak.longestStreak ?? 0,
      lastActivityDate: streak.lastActivityDate ?? data.lastSessionDate ?? null,
      flameLevel: streak.flameLevel ?? 0,
    },
  });
});

// POST /workout/session/checkpoint
router.post("/workout/session/checkpoint", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const body = validateBody<{
    courseId: string;
    sessionId: string;
    sessionName: string;
    startedAt: string;
    currentExerciseIndex: number;
    currentSetIndex: number;
    exercises: unknown[];
    completedSets: Record<string, unknown>;
    userNotes?: string;
    elapsedSeconds: number;
  }>(
    {
      courseId: "string",
      sessionId: "string",
      sessionName: "string",
      startedAt: "string",
      currentExerciseIndex: "number",
      currentSetIndex: "number",
      exercises: "array",
      completedSets: "object",
      userNotes: "optional_string",
      elapsedSeconds: "number",
    },
    req.body
  );

  await db
    .collection("users")
    .doc(auth.userId)
    .collection("activeSession")
    .doc("current")
    .set({
      ...body,
      userId: auth.userId,
      savedAt: new Date().toISOString(),
      updated_at: FieldValue.serverTimestamp(),
    });

  res.json({ data: { saved: true } });
});

// GET /workout/session/active
router.get("/workout/session/active", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db
    .collection("users")
    .doc(auth.userId)
    .collection("activeSession")
    .doc("current")
    .get();

  if (!doc.exists) {
    res.json({ data: { checkpoint: null } });
    return;
  }

  const checkpoint = doc.data()!;

  // 24h staleness check — discard old checkpoints
  const savedAt = checkpoint.savedAt as string | undefined;
  if (savedAt) {
    const ageMs = Date.now() - new Date(savedAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      doc.ref.delete().catch(() => {});
      res.json({ data: { checkpoint: null } });
      return;
    }
  }

  res.json({ data: { checkpoint } });
});

// DELETE /workout/session/active
router.delete("/workout/session/active", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("activeSession")
    .doc("current");

  const doc = await docRef.get();
  if (doc.exists) {
    await docRef.delete();
    res.json({ data: { deleted: true } });
  } else {
    res.json({ data: { deleted: false } });
  }
});

// GET /workout/prs
router.get("/workout/prs", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const snapshot = await db
    .collection("users")
    .doc(auth.userId)
    .collection("exerciseLastPerformance")
    .get();

  const prs = snapshot.docs.map((doc) => ({
    exerciseKey: doc.id,
    ...doc.data(),
  }));

  res.json({ data: prs });
});

// GET /workout/prs/:exerciseKey/history
router.get("/workout/prs/:exerciseKey/history", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db
    .collection("users")
    .doc(auth.userId)
    .collection("exerciseHistory")
    .doc(req.params.exerciseKey)
    .get();

  if (!doc.exists) {
    res.json({ data: { entries: [] } });
    return;
  }

  res.json({ data: doc.data() });
});

export default router;
