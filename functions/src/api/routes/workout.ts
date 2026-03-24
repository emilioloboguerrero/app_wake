import { Router } from "express";
import * as functions from "firebase-functions";
import { db, FieldValue } from "../firestore.js";
import type { Query } from "../firestore.js";
import { validateAuth } from "../middleware/auth.js";
import { validateBody, validateDateFormat } from "../middleware/validate.js";
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
  // For one-on-one, exercises live in plans/ subcollections, not courses/
  let sessionCollection: string = "courses";
  let sessionCollectionId: string = courseId;

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
    sessionCollection = "plans";
    sessionCollectionId = plansSnap.docs[0].id;
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
  // For one-on-one, read from plans/{planId}/...; for low_ticket, from courses/{courseId}/...
  const sessionDoc = await db
    .collection(sessionCollection)
    .doc(sessionCollectionId)
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
    .collection(sessionCollection)
    .doc(sessionCollectionId)
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
        .collection(sessionCollection)
        .doc(sessionCollectionId)
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
        description: exData.description ?? null,
        video_url: exData.video_url ?? null,
        muscle_activation: exData.muscle_activation ?? null,
        implements: exData.implements ?? [],
        primary: exData.primary ?? exData.primaryMuscles ?? [],
        alternatives: exData.alternatives ?? {},
        objectives: exData.objectives ?? [],
        measures: exData.measures ?? [],
        customMeasureLabels: exData.customMeasureLabels ?? {},
        customObjectiveLabels: exData.customObjectiveLabels ?? {},
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
            title: setData.title ?? null,
            order: setData.order ?? 0,
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
      description: ex.description,
      video_url: ex.video_url,
      muscle_activation: ex.muscle_activation,
      implements: ex.implements,
      primary: ex.primary,
      alternatives: ex.alternatives,
      objectives: ex.objectives,
      measures: ex.measures,
      customMeasureLabels: ex.customMeasureLabels,
      customObjectiveLabels: ex.customObjectiveLabels,
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

  // Read module title for context
  const moduleDoc = await db
    .collection(sessionCollection)
    .doc(sessionCollectionId)
    .collection("modules")
    .doc(targetModuleId!)
    .get();
  const moduleTitle = moduleDoc.exists ? (moduleDoc.data()!.title ?? "") : "";

  res.json({
    data: {
      hasSession: true,
      isRestDay: false,
      emptyReason: null,
      session: {
        sessionId: targetSessionId,
        moduleId: targetModuleId,
        moduleTitle,
        title: sessionInfo.title ?? "",
        image_url: sessionInfo.image_url ?? null,
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

  // Accept both legacy (duration, planned, courseName, sessionName) and new field names
  const raw = req.body ?? {};
  if (raw.duration !== undefined && raw.durationMs === undefined) {
    raw.durationMs = raw.duration;
  }
  if (raw.planned !== undefined && raw.plannedSnapshot === undefined) {
    raw.plannedSnapshot = raw.planned;
  }

  const body = validateBody<{
    courseId: string;
    sessionId: string;
    completedAt: string;
    durationMs: number;
    exercises: unknown[];
    userNotes?: string;
    plannedSnapshot?: unknown;
    courseName?: string;
    sessionName?: string;
  }>(
    {
      courseId: "string",
      sessionId: "string",
      completedAt: "string",
      durationMs: "number",
      exercises: "array",
      userNotes: "optional_string",
      plannedSnapshot: "optional_object",
      courseName: "optional_string",
      sessionName: "optional_string",
    },
    raw,
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
  const previousStreak = activityStreak.currentStreak ?? activityStreak.longestStreak ?? 0;
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
    ...(body.courseName ? { courseName: body.courseName } : {}),
    ...(body.sessionName ? { sessionName: body.sessionName } : {}),
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
        sessions: FieldValue.arrayUnion({
          date: completionDate,
          sessionId: completionId,
          sets: exercise.sets ?? [],
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

    // Production format: exerciseId, exerciseName, libraryId, lastSessionId, lastPerformedAt, totalSets, bestSet
    const exerciseSets = exercise.sets ?? [];
    const prodBestSet = exerciseSets.length > 0
      ? exerciseSets.reduce((best: Record<string, unknown>, s: Record<string, unknown>) => {
          const bw = parseFloat(String(best.weight ?? 0));
          const sw = parseFloat(String(s.weight ?? 0));
          return sw > bw ? s : best;
        }, exerciseSets[0])
      : null;

    batch.set(lastPerfRef, {
      exerciseId: exercise.exerciseId ?? null,
      exerciseName: exercise.exerciseName ?? exercise.exerciseKey ?? exerciseKey,
      libraryId: exercise.libraryId ?? null,
      lastSessionId: completionId,
      lastPerformedAt: completionDate,
      totalSets: exerciseSets.length,
      bestSet: prodBestSet,
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

  // 4. Update user streak + last session (dot notation preserves existing fields like streakStartDate)
  const streakStartDate = newStreak === 1 ? completionDate : (activityStreak.streakStartDate ?? completionDate);
  const userRef = db.collection("users").doc(auth.userId);
  batch.update(userRef, {
    lastSessionDate: completionDate,
    "activityStreak.currentStreak": newStreak,
    "activityStreak.longestStreak": newLongest,
    "activityStreak.lastActivityDate": completionDate,
    "activityStreak.flameLevel": flameLevel,
    "activityStreak.streakStartDate": streakStartDate,
    ...(newLongest > previousLongest
      ? {
          "activityStreak.longestStreakStartDate": streakStartDate,
          "activityStreak.longestStreakEndDate": completionDate,
        }
      : {}),
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
    res.json({ data: { sessions: [] } });
    return;
  }

  const data = doc.data()!;
  const sessions = (data.sessions ?? data.entries ?? []) as unknown[];

  // Paginate in-memory (sessions stored as array)
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
  const slice = sessions.slice(pageToken, pageToken + limit);

  res.json({
    data: slice,
    nextPageToken: pageToken + limit < sessions.length ? String(pageToken + limit) : null,
    hasMore: pageToken + limit < sessions.length,
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
      currentStreak: streak.currentStreak ?? streak.longestStreak ?? 0,
      longestStreak: streak.longestStreak ?? 0,
      lastActivityDate: streak.lastActivityDate ?? data.lastSessionDate ?? null,
      flameLevel: streak.flameLevel ?? 0,
      streakStartDate: streak.streakStartDate ?? null,
      longestStreakStartDate: streak.longestStreakStartDate ?? null,
      longestStreakEndDate: streak.longestStreakEndDate ?? null,
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

// Aliases: /workout/checkpoint → /workout/session/checkpoint|active
// sessionManager.js and sessionRecoveryService.js call these paths
router.put("/workout/checkpoint", async (req, res) => {
  // Forward to POST /workout/session/checkpoint handler logic
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

router.get("/workout/checkpoint", async (req, res) => {
  // Forward to GET /workout/session/active handler logic
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

router.delete("/workout/checkpoint", async (req, res) => {
  // Forward to DELETE /workout/session/active handler logic
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
    res.json({ data: { sessions: [] } });
    return;
  }

  res.json({ data: doc.data() });
});

// ─── Exercise Library ────────────────────────────────────────────────────

// GET /exercises/:libraryId — full library document
router.get("/exercises/:libraryId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("exercises_library").doc(req.params.libraryId).get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca de ejercicios no encontrada");
  }

  const data = doc.data()!;
  const metaKeys = new Set(["creator_id", "creator_name", "created_at", "updated_at", "title"]);
  const exercises: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (!metaKeys.has(key) && typeof val === "object" && val !== null) {
      exercises[key] = val;
    }
  }

  res.json({
    data: {
      id: doc.id,
      creator_name: data.creator_name ?? null,
      title: data.title ?? null,
      exercises,
    },
  });
});

// GET /exercises/:libraryId/:exerciseName — single exercise detail
router.get("/exercises/:libraryId/:exerciseName", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const doc = await db.collection("exercises_library").doc(req.params.libraryId).get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Biblioteca de ejercicios no encontrada");
  }

  const exerciseName = decodeURIComponent(req.params.exerciseName);
  const data = doc.data()!;
  const exercise = data[exerciseName];

  if (!exercise || typeof exercise !== "object") {
    throw new WakeApiServerError("NOT_FOUND", 404, "Ejercicio no encontrado");
  }

  res.json({
    data: {
      name: exerciseName,
      description: (exercise as Record<string, unknown>).description ?? null,
      video_url: (exercise as Record<string, unknown>).video_url ?? null,
      muscle_activation: (exercise as Record<string, unknown>).muscle_activation ?? null,
      implements: (exercise as Record<string, unknown>).implements ?? [],
    },
  });
});

// ─── Course Progress ─────────────────────────────────────────────────────

// GET /workout/progress — all course progress for user
router.get("/workout/progress", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const userDoc = await db.collection("users").doc(auth.userId).get();
  const courses = (userDoc.data()?.courses ?? {}) as Record<string, Record<string, unknown>>;

  const courseIds = Object.keys(courses).filter((id) => courses[id].status === "active");

  const progress: Record<string, { completed: number; lastSessionDate: string | null }> = {};
  for (const courseId of courseIds) {
    const histSnap = await db
      .collection("users")
      .doc(auth.userId)
      .collection("sessionHistory")
      .where("courseId", "==", courseId)
      .orderBy("date", "desc")
      .limit(1)
      .get();

    const countSnap = await db
      .collection("users")
      .doc(auth.userId)
      .collection("sessionHistory")
      .where("courseId", "==", courseId)
      .count()
      .get();

    progress[courseId] = {
      completed: countSnap.data().count,
      lastSessionDate: histSnap.empty ? null : (histSnap.docs[0].data().date ?? null),
    };
  }

  res.json({ data: progress });
});

// GET /workout/courses/:courseId/progress — single course progress
router.get("/workout/courses/:courseId/progress", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.params.courseId;

  const [countSnap, recentSnap] = await Promise.all([
    db
      .collection("users")
      .doc(auth.userId)
      .collection("sessionHistory")
      .where("courseId", "==", courseId)
      .count()
      .get(),
    db
      .collection("users")
      .doc(auth.userId)
      .collection("sessionHistory")
      .where("courseId", "==", courseId)
      .orderBy("date", "desc")
      .limit(1)
      .get(),
  ]);

  res.json({
    data: {
      courseId,
      completed: countSnap.data().count,
      lastSessionDate: recentSnap.empty ? null : (recentSnap.docs[0].data().date ?? null),
    },
  });
});

// PATCH /workout/courses/:courseId/progress — update course progress data
router.patch("/workout/courses/:courseId/progress", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.params.courseId;

  // Allowlist progress fields
  const allowedFields = [
    "currentModuleId", "currentSessionId", "currentModuleIndex",
    "currentSessionIndex", "completedSessions", "lastSessionDate",
    "lastSessionPerformed",
  ];
  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "No se proporcionaron campos para actualizar"
    );
  }

  updates.updated_at = FieldValue.serverTimestamp();

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("courseProgress")
    .doc(courseId);

  await docRef.set(updates, { merge: true });

  const updated = await docRef.get();
  res.json({ data: { courseId, ...updated.data() } });
});

// POST /workout/courses/:courseId/progress/last-session — update last session performed
router.post("/workout/courses/:courseId/progress/last-session", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.params.courseId;
  const body = validateBody<{
    sessionId: string;
    sessionData?: Record<string, unknown>;
  }>(
    { sessionId: "string", sessionData: "optional_object" },
    req.body
  );

  const docRef = db
    .collection("users")
    .doc(auth.userId)
    .collection("courseProgress")
    .doc(courseId);

  await docRef.set(
    {
      lastSessionPerformed: {
        sessionId: body.sessionId,
        ...(body.sessionData ?? {}),
        performedAt: new Date().toISOString(),
      },
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const updated = await docRef.get();
  res.json({ data: { courseId, ...updated.data() } });
});

// Aliases: /workout/programs/:courseId → /workout/courses/:courseId
// PWA apiService.js and purchaseService.js call /workout/programs/ paths
router.get("/workout/programs/:courseId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

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

// GET /workout/programs/:courseId/modules — list modules for a course
router.get("/workout/programs/:courseId/modules", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

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

  const modulesSnap = await db
    .collection("courses")
    .doc(req.params.courseId)
    .collection("modules")
    .orderBy("order", "asc")
    .limit(MAX_MODULES_PER_COURSE)
    .get();

  const modules = modulesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  res.json({ data: modules });
});

// GET /workout/programs/:courseId/modules/:moduleId/sessions/:sessionId/overrides
router.get(
  "/workout/programs/:courseId/modules/:moduleId/sessions/:sessionId/overrides",
  async (req, res) => {
    const auth = await validateAuth(req);
    await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

    // Check for one-on-one overrides in plans collection
    const userDoc = await db.collection("users").doc(auth.userId).get();
    const courseAccess = userDoc.data()?.courses?.[req.params.courseId];

    if (!courseAccess) {
      throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este programa");
    }

    // For one-on-one delivery, look for plan overrides
    if (courseAccess.deliveryType === "one_on_one" && courseAccess.content_plan_id) {
      const overrideDoc = await db
        .collection("plans")
        .doc(courseAccess.content_plan_id)
        .collection("modules")
        .doc(req.params.moduleId)
        .collection("sessions")
        .doc(req.params.sessionId)
        .get();

      if (overrideDoc.exists) {
        res.json({ data: { id: overrideDoc.id, ...overrideDoc.data() } });
        return;
      }
    }

    res.json({ data: null });
  }
);

// GET /workout/programs/:courseId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/overrides
router.get(
  "/workout/programs/:courseId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/overrides",
  async (req, res) => {
    const auth = await validateAuth(req);
    await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

    const userDoc = await db.collection("users").doc(auth.userId).get();
    const courseAccess = userDoc.data()?.courses?.[req.params.courseId];

    if (!courseAccess) {
      throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este programa");
    }

    if (courseAccess.deliveryType === "one_on_one" && courseAccess.content_plan_id) {
      const overrideDoc = await db
        .collection("plans")
        .doc(courseAccess.content_plan_id)
        .collection("modules")
        .doc(req.params.moduleId)
        .collection("sessions")
        .doc(req.params.sessionId)
        .collection("exercises")
        .doc(req.params.exerciseId)
        .get();

      if (overrideDoc.exists) {
        res.json({ data: { id: overrideDoc.id, ...overrideDoc.data() } });
        return;
      }
    }

    res.json({ data: null });
  }
);

// GET /workout/programs/:courseId/modules/:mid/sessions/:sid/exercises/:eid/sets/:setId/overrides
router.get(
  "/workout/programs/:courseId/modules/:moduleId/sessions/:sessionId/exercises/:exerciseId/sets/:setId/overrides",
  async (req, res) => {
    const auth = await validateAuth(req);
    await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

    const userDoc = await db.collection("users").doc(auth.userId).get();
    const courseAccess = userDoc.data()?.courses?.[req.params.courseId];

    if (!courseAccess) {
      throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este programa");
    }

    if (courseAccess.deliveryType === "one_on_one" && courseAccess.content_plan_id) {
      const overrideDoc = await db
        .collection("plans")
        .doc(courseAccess.content_plan_id)
        .collection("modules")
        .doc(req.params.moduleId)
        .collection("sessions")
        .doc(req.params.sessionId)
        .collection("exercises")
        .doc(req.params.exerciseId)
        .collection("sets")
        .doc(req.params.setId)
        .get();

      if (overrideDoc.exists) {
        res.json({ data: { id: overrideDoc.id, ...overrideDoc.data() } });
        return;
      }
    }

    res.json({ data: null });
  }
);

// ─── Client Programs (PWA-facing, one-on-one) ────────────────────────────

// GET /workout/client-programs — list client programs, optionally orphaned only
router.get("/workout/client-programs", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const orphaned = req.query.orphaned === "true";

  const [cpSnap, userDoc] = await Promise.all([
    db.collection("client_programs").where("user_id", "==", auth.userId).get(),
    db.collection("users").doc(auth.userId).get(),
  ]);

  const coursesMap = (userDoc.data()?.courses ?? {}) as Record<string, Record<string, unknown>>;

  const results: Array<{ courseId: string; courseData: Record<string, unknown>; purchasedAt: string | null }> = [];
  for (const doc of cpSnap.docs) {
    const data = doc.data();
    const programId = data.program_id as string;
    const courseEntry = coursesMap[programId];
    const isOrphaned = !courseEntry;

    if (orphaned && !isOrphaned) continue;

    results.push({
      courseId: programId,
      courseData: courseEntry ?? {},
      purchasedAt: courseEntry?.purchased_at as string ?? null,
    });
  }

  res.json({ data: results });
});

// GET /workout/client-programs/:programId
router.get("/workout/client-programs/:programId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docId = `${auth.userId}_${req.params.programId}`;
  const doc = await db.collection("client_programs").doc(docId).get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa de cliente no encontrado");
  }

  res.json({ data: { id: doc.id, ...doc.data() } });
});

// POST /workout/client-programs/:programId
router.post("/workout/client-programs/:programId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docId = `${auth.userId}_${req.params.programId}`;
  const docRef = db.collection("client_programs").doc(docId);
  const existing = await docRef.get();

  const writeData: Record<string, unknown> = {
    ...(req.body ?? {}),
    user_id: auth.userId,
    program_id: req.params.programId,
    updated_at: FieldValue.serverTimestamp(),
  };

  if (!existing.exists) {
    writeData.created_at = FieldValue.serverTimestamp();
  }

  await docRef.set(writeData, { merge: true });

  res.json({ data: { id: docId } });
});

// PATCH /workout/client-programs/:programId/overrides
router.patch("/workout/client-programs/:programId/overrides", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const raw = req.body ?? {};
  const path = raw.path;
  const value = raw.value;

  if (typeof path !== "string" || path.length === 0 || path.length > 500) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "path debe ser un string no vacío", "path");
  }
  if (value === undefined) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "value es requerido", "value");
  }

  // Block dangerous keys
  const dangerousKeys = ["__proto__", "constructor", "prototype"];
  const pathParts = path.split(".");
  for (const part of pathParts) {
    if (dangerousKeys.includes(part)) {
      throw new WakeApiServerError("VALIDATION_ERROR", 400, "path contiene claves no permitidas", "path");
    }
  }

  const docId = `${auth.userId}_${req.params.programId}`;
  const docRef = db.collection("client_programs").doc(docId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa de cliente no encontrado");
  }

  await docRef.update({
    [path]: value,
    updated_at: FieldValue.serverTimestamp(),
  });

  res.json({ data: { updated: true } });
});

// DELETE /workout/client-programs/:programId
router.delete("/workout/client-programs/:programId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docId = `${auth.userId}_${req.params.programId}`;
  const docRef = db.collection("client_programs").doc(docId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa de cliente no encontrado");
  }

  await docRef.delete();
  res.status(204).send();
});

// ─── Client Sessions (PWA-facing, one-on-one) ────────────────────────────

// GET /workout/planned-session — single planned session by courseId + date
router.get("/workout/planned-session", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.query.courseId as string;
  const date = req.query.date as string;

  if (!courseId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId es requerido", "courseId");
  }
  if (!date) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "date es requerido", "date");
  }
  validateDateFormat(date, "date");

  const snap = await db
    .collection("client_sessions")
    .where("client_id", "==", auth.userId)
    .where("program_id", "==", courseId)
    .where("date", "==", date)
    .limit(1)
    .get();

  if (snap.empty) {
    res.json({ data: null });
    return;
  }

  const doc = snap.docs[0];
  res.json({ data: { id: doc.id, ...doc.data() } });
});

// GET /workout/calendar/planned — planned session dates in range
router.get("/workout/calendar/planned", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.query.courseId as string;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!courseId || !startDate || !endDate) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId, startDate, endDate son requeridos");
  }
  validateDateFormat(startDate, "startDate");
  validateDateFormat(endDate, "endDate");

  const snap = await db
    .collection("client_sessions")
    .where("client_id", "==", auth.userId)
    .where("program_id", "==", courseId)
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .orderBy("date", "asc")
    .limit(100)
    .get();

  res.json({ data: snap.docs.map((d) => d.data().date as string) });
});

// GET /workout/calendar/completed — completed session dates in range
router.get("/workout/calendar/completed", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.query.courseId as string;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!courseId || !startDate || !endDate) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId, startDate, endDate son requeridos");
  }
  validateDateFormat(startDate, "startDate");
  validateDateFormat(endDate, "endDate");

  // Cross-reference with sessionHistory for completed dates
  const snap = await db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .where("courseId", "==", courseId)
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .get();

  const dates = [...new Set(snap.docs.map((d) => d.data().date as string))];
  res.json({ data: dates });
});

// GET /workout/calendar — low-ticket completed session dates from sessionHistory
router.get("/workout/calendar", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.query.courseId as string;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!courseId || !startDate || !endDate) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId, startDate, endDate son requeridos");
  }
  validateDateFormat(startDate, "startDate");
  validateDateFormat(endDate, "endDate");

  const snap = await db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .where("courseId", "==", courseId)
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .limit(200)
    .get();

  const dates = [...new Set(snap.docs.map((d) => d.data().date as string))];
  res.json({ data: dates });
});

// ─── Content Tree Reads (PWA-facing) ─────────────────────────────────────

// Helper: load exercises → sets tree from a parent doc ref
async function loadExerciseTree(parentRef: FirebaseFirestore.DocumentReference) {
  const exercisesSnap = await parentRef.collection("exercises").orderBy("order", "asc").get();
  return Promise.all(
    exercisesSnap.docs.map(async (eDoc) => {
      const setsSnap = await eDoc.ref.collection("sets").orderBy("order", "asc").get();
      return {
        id: eDoc.id,
        ...eDoc.data(),
        sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })),
      };
    })
  );
}

// GET /workout/client-session-content/:clientSessionId
router.get("/workout/client-session-content/:clientSessionId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const docRef = db.collection("client_session_content").doc(req.params.clientSessionId);
  const doc = await docRef.get();

  if (!doc.exists) {
    res.json({ data: null });
    return;
  }

  const exercises = await loadExerciseTree(docRef);
  res.json({ data: { id: doc.id, ...doc.data(), exercises } });
});

// GET /workout/client-plan-content/:userId/:programId/:weekKey
router.get("/workout/client-plan-content/:userId/:programId/:weekKey", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  // Use auth.userId for security regardless of URL param
  const docId = `${auth.userId}_${req.params.programId}_${req.params.weekKey}`;
  const docRef = db.collection("client_plan_content").doc(docId);
  const doc = await docRef.get();

  if (!doc.exists) {
    res.json({ data: null });
    return;
  }

  const docData = doc.data()!;

  // Load sessions → exercises → sets tree
  const sessionsSnap = await docRef.collection("sessions").orderBy("order", "asc").get();
  const sessions = await Promise.all(
    sessionsSnap.docs.map(async (sDoc) => {
      const exercises = await loadExerciseTree(sDoc.ref);
      return { id: sDoc.id, ...sDoc.data(), exercises };
    })
  );

  res.json({ data: { id: doc.id, ...docData, sessions } });
});

// GET /workout/plans/:planId/modules/:moduleId/sessions/:sessionId/full
router.get("/workout/plans/:planId/modules/:moduleId/sessions/:sessionId/full", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const sessionRef = db
    .collection("plans")
    .doc(req.params.planId)
    .collection("modules")
    .doc(req.params.moduleId)
    .collection("sessions")
    .doc(req.params.sessionId);

  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  const exercises = await loadExerciseTree(sessionRef);
  res.json({ data: { id: sessionDoc.id, ...sessionDoc.data(), exercises } });
});

// GET /library/sessions/:sessionId — library session with full exercise tree
router.get("/library/sessions/:sessionId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const creatorId = req.query.creatorId as string;
  if (!creatorId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "creatorId es requerido", "creatorId");
  }

  const sessionRef = db
    .collection("creator_libraries")
    .doc(creatorId)
    .collection("sessions")
    .doc(req.params.sessionId);

  const doc = await sessionRef.get();
  if (!doc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesión no encontrada");
  }

  const exercises = await loadExerciseTree(sessionRef);
  res.json({ data: { id: doc.id, ...doc.data(), exercises } });
});

export default router;
