import {Router} from "express";
import * as functions from "firebase-functions";
import {db, FieldValue} from "../firestore.js";
import type {Query} from "../firestore.js";
import {validateAuth} from "../middleware/auth.js";
import {validateBody, validateDateFormat} from "../middleware/validate.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {WakeApiServerError} from "../errors.js";
import {updateStreak} from "../streak.js";

const router = Router();

// Max guards for unbounded reads
const MAX_MODULES_PER_COURSE = 20;
const MAX_SESSIONS_PER_MODULE = 50;

// ─── 1RM helpers ─────────────────────────────────────────────────────────────
function parseReportedIntensity(val: string | null | undefined): number | null {
  if (!val) return null;
  const n = parseFloat(val);
  return n >= 1 && n <= 10 ? n : null;
}

function parsePlannedIntensity(val: string | null | undefined): number | null {
  if (!val) return null;
  const match = String(val).trim().match(/^(\d+(?:\.\d+)?)(?:\/10)?$/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  return n >= 1 && n <= 10 ? n : null;
}

// intensity=null → pure Epley (same as intensity=10)
function calculate1RM(weight: number, reps: number, intensity: number | null): number {
  const numerator = weight * (1 + 0.0333 * reps);
  if (intensity === null) return numerator;
  const denominator = 1 - 0.025 * (10 - intensity);
  return numerator / denominator;
}

// ─── Week helpers (must match creator.ts and client-side getMondayWeek) ──────
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

function planContentDocId(clientId: string, programId: string, weekKey: string): string {
  return `${clientId}_${programId}_${weekKey}`;
}

function toLocalDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// GET /workout/daily
router.get("/workout/daily", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.query.courseId as string;
  const requestedSessionId = req.query.sessionId as string | undefined;

  if (!courseId) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400, "courseId es requerido", "courseId"
    );
  }

  // Parallel: verify user access + load course structure
  const [userDoc, courseDoc] = await Promise.all([
    db.collection("users").doc(auth.userId).get(),
    db.collection("courses").doc(courseId).get(),
  ]);

  const courses = userDoc.data()?.courses ?? {};
  const courseAccess = courses[courseId];
  if (!courseAccess || courseAccess.status !== "active") {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este programa");
  }
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
  let sessionCollection = "courses";
  let sessionCollectionId: string = courseId;
  // Hoisted so we can include it in the response
  let resolvedAllSessions: Array<{ sessionId: string; title: string; moduleId: string; moduleTitle: string; order: number; image_url: string | null; plannedDate?: string | null }> = [];

  if (deliveryType === "one_on_one") {
    // One-on-one: two parallel content systems
    // Path A: plan-based weeks — planAssignments on user doc → client_plan_content/{id}/sessions
    // Path B: date-based individual sessions — client_sessions → client_session_content
    const requestedDate = (req.query.date as string) ?? null;
    const targetDate = requestedDate ?? new Date().toISOString().slice(0, 10);

    // Read planAssignments from user doc (already fetched above)
    const planAssignments = (courses[courseId]?.planAssignments ?? {}) as Record<string, { planId: string; moduleId: string }>;

    // Parallel: date-based sessions + completed history
    const [clientSessionsSnap, completedSnap] = await Promise.all([
      db.collection("client_sessions")
        .where("client_id", "==", auth.userId)
        .where("program_id", "==", courseId)
        .orderBy("date", "asc").limit(200).get(),
      db.collection("users").doc(auth.userId)
        .collection("sessionHistory")
        .where("courseId", "==", courseId).limit(500).get(),
    ]);
    completedSessionIds = new Set(completedSnap.docs.map((d) => d.data().sessionId));

    // ── Build allSessions from BOTH systems ──

    // A) Plan-based week sessions (from client_plan_content or plan template)
    const planWeekKeys = Object.keys(planAssignments).filter((k) => planAssignments[k]?.planId).sort();

    // Also check for client_plan_content docs WITHOUT planAssignments (direct library drops)
    // Scan 8 weeks around the target date (4 before, 4 after)
    const scanWeekKeys: string[] = [];
    const scanBase = new Date(targetDate + "T12:00:00");
    for (let w = -4; w <= 4; w++) {
      const d = new Date(scanBase);
      d.setDate(d.getDate() + w * 7);
      const wk = getMondayWeek(d);
      if (!planWeekKeys.includes(wk)) scanWeekKeys.push(wk);
    }
    // Batch-check existence of unplanned client_plan_content docs
    const unplannedDocRefs = scanWeekKeys.map((wk) =>
      db.collection("client_plan_content").doc(planContentDocId(auth.userId, courseId, wk))
    );
    const unplannedDocs = unplannedDocRefs.length > 0 ?
      await db.getAll(...unplannedDocRefs) :
      [];
    const unplannedWeekKeys = scanWeekKeys.filter((_, i) => unplannedDocs[i].exists);

    const allWeekKeys = [...planWeekKeys, ...unplannedWeekKeys].sort();

    const planSessions: Array<{
      sessionId: string; title: string; moduleId: string; moduleTitle: string;
      order: number; image_url: string | null; plannedDate: string | null;
      contentPath: { collection: string; docId: string; moduleId: string; sessionId: string };
    }> = [];

    for (const weekKey of allWeekKeys) {
      const assignment = planAssignments[weekKey] ?? null;
      const docId = planContentDocId(auth.userId, courseId, weekKey);
      const docRef = db.collection("client_plan_content").doc(docId);
      // For unplanned weeks we already fetched the doc; for planned weeks fetch now
      const docSnap = unplannedWeekKeys.includes(weekKey) ?
        unplannedDocs[scanWeekKeys.indexOf(weekKey)] :
        await docRef.get();

      const {start: weekStart} = getWeekDates(weekKey);

      if (docSnap.exists) {
        // Personalized copy or direct content exists
        const sessionsSnap = await docRef.collection("sessions").orderBy("order", "asc").limit(MAX_SESSIONS_PER_MODULE).get();
        for (const sDoc of sessionsSnap.docs) {
          const sData = sDoc.data();
          const dayIdx = typeof sData.dayIndex === "number" ? sData.dayIndex : null;
          const sessionDate = dayIdx !== null ? toLocalDateISO(new Date(weekStart.getTime() + dayIdx * 86400000)) : null;
          planSessions.push({
            sessionId: sDoc.id,
            title: (sData.title as string) ?? "",
            moduleId: docId,
            moduleTitle: (docSnap.data()?.title as string) ?? weekKey,
            order: sData.order ?? 0,
            image_url: (sData.image_url as string) ?? null,
            plannedDate: sessionDate,
            contentPath: {collection: "client_plan_content", docId, moduleId: "__direct__", sessionId: sDoc.id},
          });
        }
      } else if (assignment) {
        // Read from plan template
        const modRef = db.collection("plans").doc(assignment.planId).collection("modules").doc(assignment.moduleId);
        const [modDoc, sessionsSnap] = await Promise.all([
          modRef.get(),
          modRef.collection("sessions").orderBy("order", "asc").limit(MAX_SESSIONS_PER_MODULE).get(),
        ]);
        const modTitle = modDoc.exists ? ((modDoc.data()?.title as string) ?? weekKey) : weekKey;
        for (const sDoc of sessionsSnap.docs) {
          const sData = sDoc.data();
          const dayIdx = typeof sData.dayIndex === "number" ? sData.dayIndex : null;
          const sessionDate = dayIdx !== null ? toLocalDateISO(new Date(weekStart.getTime() + dayIdx * 86400000)) : null;
          planSessions.push({
            sessionId: sDoc.id,
            title: (sData.title as string) ?? "",
            moduleId: assignment.moduleId,
            moduleTitle: modTitle,
            order: sData.order ?? 0,
            image_url: (sData.image_url as string) ?? null,
            plannedDate: sessionDate,
            contentPath: {collection: "plans", docId: assignment.planId, moduleId: assignment.moduleId, sessionId: sDoc.id},
          });
        }
      }
    }

    // B) Date-based sessions from client_sessions
    const dateSessions = clientSessionsSnap.docs.map((d, idx) => {
      const data = d.data();
      return {
        clientSessionId: d.id,
        sessionId: d.id,
        date: (data.date as string) ?? null,
        session_id: (data.session_id as string) ?? null,
        module_id: (data.module_id as string) ?? null,
        plan_id: (data.plan_id as string) ?? null,
        title: (data.session_name as string) ?? (data.title as string) ?? "",
        image_url: (data.image_url as string) ?? null,
        order: 1000 + idx, // After plan sessions in ordering
      };
    });

    // Enrich titles for date sessions missing session_name by reading plan session docs
    // Build a unique set of plan session references to batch-fetch
    const sessionsNeedingTitle = dateSessions.filter((s) => !s.title && s.plan_id && s.module_id && s.session_id);
    if (sessionsNeedingTitle.length > 0) {
      const uniqueRefs = new Map<string, { plan_id: string; module_id: string; session_id: string }>();
      for (const s of sessionsNeedingTitle) {
        const key = `${s.plan_id}|${s.module_id}|${s.session_id}`;
        if (!uniqueRefs.has(key)) uniqueRefs.set(key, {plan_id: s.plan_id!, module_id: s.module_id!, session_id: s.session_id!});
      }
      const refEntries = [...uniqueRefs.entries()];
      const titleDocs = await db.getAll(
        ...refEntries.map(([, ref]) =>
          db.collection("plans").doc(ref.plan_id).collection("modules").doc(ref.module_id).collection("sessions").doc(ref.session_id)
        )
      );
      const titleMap = new Map<string, { title: string; image_url: string | null }>();
      for (let i = 0; i < refEntries.length; i++) {
        if (titleDocs[i].exists) {
          const data = titleDocs[i].data()!;
          titleMap.set(refEntries[i][0], {
            title: (data.title as string) ?? "",
            image_url: (data.image_url as string) ?? null,
          });
        }
      }
      // Apply resolved titles
      for (const s of dateSessions) {
        if (!s.title && s.plan_id && s.module_id && s.session_id) {
          const key = `${s.plan_id}|${s.module_id}|${s.session_id}`;
          const resolved = titleMap.get(key);
          if (resolved) {
            s.title = resolved.title;
            if (!s.image_url && resolved.image_url) s.image_url = resolved.image_url;
          }
        }
      }
    }

    // Merge: plan sessions + date sessions, sorted by plannedDate/date
    type MergedSession = {
      sessionId: string; title: string; moduleId: string; moduleTitle: string;
      order: number; image_url: string | null; plannedDate: string | null;
      source: "plan" | "date";
      contentPath?: { collection: string; docId: string; moduleId: string; sessionId: string };
      clientSessionId?: string; session_id?: string; plan_id?: string;
    };

    const merged: MergedSession[] = [
      ...planSessions.map((s) => ({...s, source: "plan" as const})),
      ...dateSessions.map((s) => ({
        sessionId: s.sessionId,
        title: s.title,
        moduleId: s.module_id ?? "",
        moduleTitle: "",
        order: s.order,
        image_url: s.image_url,
        plannedDate: s.date,
        source: "date" as const,
        clientSessionId: s.clientSessionId,
        session_id: s.session_id,
        plan_id: s.plan_id,
      })),
    ];
    merged.sort((a, b) => (a.plannedDate ?? "9999").localeCompare(b.plannedDate ?? "9999") || a.order - b.order);

    resolvedAllSessions = merged.map((s) => ({
      sessionId: s.sessionId,
      title: s.title,
      moduleId: s.moduleId,
      moduleTitle: s.moduleTitle,
      order: s.order,
      image_url: s.image_url,
      plannedDate: s.plannedDate,
    }));

    if (merged.length === 0) {
      res.json({
        data: {
          hasSession: false, isRestDay: false, emptyReason: "no_planning_this_week",
          session: null, progress: {completed: 0, total: null}, allSessions: [],
        },
      });
      return;
    }

    // Find target session
    let target: MergedSession | undefined;
    if (requestedSessionId) {
      target = merged.find((s) => s.sessionId === requestedSessionId);
    } else if (requestedDate) {
      // Date-based sessions take priority for exact date match
      target = merged.find((s) => s.source === "date" && s.plannedDate === requestedDate) ??
        merged.find((s) => s.plannedDate === requestedDate);
    } else {
      // Default: first incomplete session from today onwards
      target = merged.find((s) => !completedSessionIds!.has(s.sessionId) && s.plannedDate && s.plannedDate >= targetDate) ??
        merged.find((s) => s.plannedDate === targetDate);
    }

    if (!target) {
      res.json({
        data: {
          hasSession: false, isRestDay: false,
          emptyReason: requestedDate ? "no_session_today" : "no_planning_this_week",
          session: null,
          progress: {completed: completedSessionIds.size, total: merged.length},
          allSessions: resolvedAllSessions,
        },
      });
      return;
    }

    // Resolve content path for the target session
    if (target.source === "plan" && target.contentPath) {
      const cp = target.contentPath;
      sessionCollection = cp.collection;
      sessionCollectionId = cp.docId;
      targetModuleId = cp.moduleId;
      targetSessionId = cp.sessionId;
    } else if (target.source === "date") {
      // Check client_session_content first
      const cscDocRef = db.collection("client_session_content").doc(target.clientSessionId!);
      const cscDoc = await cscDocRef.get();
      if (cscDoc.exists) {
        sessionCollection = "client_session_content";
        sessionCollectionId = target.clientSessionId!;
        targetModuleId = "__content_root__";
        targetSessionId = target.clientSessionId!;
      } else if (target.plan_id && target.moduleId && target.session_id) {
        sessionCollection = "plans";
        sessionCollectionId = target.plan_id;
        targetModuleId = target.moduleId;
        targetSessionId = target.session_id;
      } else if (target.session_id) {
        // Library session reference — try to find in creator's library
        const courseCreator = course.creatorId ?? course.creator_id ?? null;
        if (courseCreator) {
          sessionCollection = "creator_libraries";
          sessionCollectionId = courseCreator as string;
          targetModuleId = "__library__";
          targetSessionId = target.session_id;
        }
      }
    }
  } else {
    // Low-ticket: check for plan-based content first, fall back to legacy course modules
    const planAssignments = (course.planAssignments ?? {}) as Record<string, { planId: string; moduleId: string }>;
    const planAssignmentKeys = Object.keys(planAssignments).filter((k) => planAssignments[k]?.planId);

    if (planAssignmentKeys.length > 0) {
      // ── Plan-based low-ticket program ──────────────────────────
      // Sort week keys to determine module order
      planAssignmentKeys.sort();

      // Parallel: gather all week sessions + fetch sessionHistory simultaneously
      const [weekResults, completedSnap] = await Promise.all([
        Promise.all(
          planAssignmentKeys.map(async (weekKey, weekIdx) => {
            const assignment = planAssignments[weekKey];
            const docId = `program_${courseId}_${weekKey}`;
            const contentDoc = await db.collection("client_plan_content").doc(docId).get();

            let sessionsSnap: FirebaseFirestore.QuerySnapshot;
            let modTitle = "";
            if (contentDoc.exists) {
              sessionsSnap = await contentDoc.ref.collection("sessions")
                .orderBy("order", "asc").limit(MAX_SESSIONS_PER_MODULE).get();
              modTitle = (contentDoc.data()?.title as string) ?? "";
            } else {
              const modDoc = await db.collection("plans").doc(assignment.planId)
                .collection("modules").doc(assignment.moduleId).get();
              modTitle = modDoc.exists ? ((modDoc.data()?.title as string) ?? "") : "";
              sessionsSnap = await db.collection("plans").doc(assignment.planId)
                .collection("modules").doc(assignment.moduleId)
                .collection("sessions").orderBy("order", "asc").limit(MAX_SESSIONS_PER_MODULE).get();
            }

            return sessionsSnap.docs.map((sess) => ({
              moduleId: contentDoc.exists ? docId : assignment.moduleId,
              sessionId: sess.id,
              order: sess.data().order ?? 0,
              moduleOrder: weekIdx,
              weekKey,
              title: (sess.data().title as string) ?? "",
              moduleTitle: modTitle,
              image_url: (sess.data().image_url as string) ?? null,
            }));
          })
        ),
        db.collection("users").doc(auth.userId)
          .collection("sessionHistory").where("courseId", "==", courseId).get(),
      ]);
      const allSessions = weekResults.flat();
      completedSessionIds = new Set(completedSnap.docs.map((d) => d.data().sessionId));

      allSessions.sort((a, b) => a.moduleOrder - b.moduleOrder || a.order - b.order);
      resolvedAllSessions = allSessions.map((s) => ({sessionId: s.sessionId, title: s.title, moduleId: s.moduleId, moduleTitle: s.moduleTitle, order: s.order, image_url: s.image_url}));

      if (allSessions.length === 0) {
        res.json({
          data: {hasSession: false, isRestDay: false, emptyReason: "no_planning_this_week", session: null, progress: {completed: 0, total: null}, allSessions: []},
        });
        return;
      }

      const nextSession = requestedSessionId ?
        allSessions.find((s) => s.sessionId === requestedSessionId) :
        allSessions.find((s) => !completedSessionIds!.has(s.sessionId));
      if (!nextSession) {
        res.json({
          data: {hasSession: false, isRestDay: false, emptyReason: "all_sessions_completed", session: null, progress: {completed: completedSessionIds.size, total: allSessions.length}, allSessions: resolvedAllSessions},
        });
        return;
      }

      // Resolve reading path: program content copy or plan template
      const nDocId = `program_${courseId}_${nextSession.weekKey}`;
      const nContentDoc = await db.collection("client_plan_content").doc(nDocId).get();
      if (nContentDoc.exists) {
        sessionCollection = "client_plan_content";
        sessionCollectionId = nDocId;
        // For client_plan_content, sessions are a direct subcollection (no modules level)
        // We need to read session directly, so override targetModuleId to signal this path
        targetModuleId = "__direct__";
        targetSessionId = nextSession.sessionId;
      } else {
        const assignment = planAssignments[nextSession.weekKey];
        sessionCollection = "plans";
        sessionCollectionId = assignment.planId;
        targetModuleId = assignment.moduleId;
        targetSessionId = nextSession.sessionId;
      }
    } else {
      // ── Legacy low-ticket: resolve from course modules structure ──
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
            progress: {completed: 0, total: null},
            allSessions: [],
          },
        });
        return;
      }

      // Parallel: fetch sessions for all modules + sessionHistory simultaneously
      const [moduleResults, legacyCompletedSnap] = await Promise.all([
        Promise.all(
          modulesSnap.docs.map(async (mod) => {
            const modTitle = (mod.data().title as string) ?? "";
            const sessionsSnap = await db
              .collection("courses").doc(courseId)
              .collection("modules").doc(mod.id)
              .collection("sessions").orderBy("order", "asc")
              .limit(MAX_SESSIONS_PER_MODULE).get();

            return sessionsSnap.docs.map((sess) => ({
              moduleId: mod.id,
              sessionId: sess.id,
              order: sess.data().order ?? 0,
              moduleOrder: mod.data().order ?? 0,
              title: (sess.data().title as string) ?? "",
              moduleTitle: modTitle,
              image_url: (sess.data().image_url as string) ?? null,
            }));
          })
        ),
        db.collection("users").doc(auth.userId)
          .collection("sessionHistory").where("courseId", "==", courseId).get(),
      ]);
      const allSessions = moduleResults.flat();
      completedSessionIds = new Set(legacyCompletedSnap.docs.map((d) => d.data().sessionId));

      allSessions.sort((a, b) => a.moduleOrder - b.moduleOrder || a.order - b.order);
      resolvedAllSessions = allSessions.map((s) => ({sessionId: s.sessionId, title: s.title, moduleId: s.moduleId, moduleTitle: s.moduleTitle, order: s.order, image_url: s.image_url}));

      if (allSessions.length === 0) {
        res.json({
          data: {
            hasSession: false,
            isRestDay: false,
            emptyReason: "no_planning_this_week",
            session: null,
            progress: {completed: 0, total: null},
            allSessions: [],
          },
        });
        return;
      }

      const nextSession = requestedSessionId ?
        allSessions.find((s) => s.sessionId === requestedSessionId) :
        allSessions.find((s) => !completedSessionIds!.has(s.sessionId));

      if (!nextSession) {
        res.json({
          data: {
            hasSession: false,
            isRestDay: false,
            emptyReason: "all_sessions_completed",
            session: null,
            progress: {completed: completedSessionIds.size, total: allSessions.length},
            allSessions: resolvedAllSessions,
          },
        });
        return;
      }

      targetModuleId = nextSession.moduleId;
      targetSessionId = nextSession.sessionId;
    }
  }

  if (!targetModuleId || !targetSessionId) {
    res.json({
      data: {
        hasSession: false,
        isRestDay: false,
        emptyReason: "no_planning_this_week",
        session: null,
        progress: {completed: 0, total: null},
        allSessions: resolvedAllSessions,
      },
    });
    return;
  }

  // Read the full session tree: session → exercises → sets
  // Possible paths:
  // 1. __content_root__: client_session_content/{id} — exercises are direct subcollection
  // 2. __direct__: .../sessions/{sessionId} — sessions are direct subcollection (no modules)
  // 3. __library__: creator_libraries/{creatorId}/sessions/{sessionId}
  // 4. Standard: collection/{id}/modules/{moduleId}/sessions/{sessionId}
  const isContentRoot = targetModuleId === "__content_root__";
  const isDirect = targetModuleId === "__direct__";
  const isLibrary = targetModuleId === "__library__";
  let sessionDocRef: FirebaseFirestore.DocumentReference;
  if (isContentRoot) {
    sessionDocRef = db.collection(sessionCollection).doc(sessionCollectionId);
  } else if (isDirect) {
    sessionDocRef = db.collection(sessionCollection).doc(sessionCollectionId)
      .collection("sessions").doc(targetSessionId);
  } else if (isLibrary) {
    sessionDocRef = db.collection(sessionCollection).doc(sessionCollectionId)
      .collection("sessions").doc(targetSessionId);
  } else {
    sessionDocRef = db.collection(sessionCollection).doc(sessionCollectionId)
      .collection("modules").doc(targetModuleId)
      .collection("sessions").doc(targetSessionId);
  }

  const sessionDoc = await sessionDocRef.get();

  if (!sessionDoc.exists) {
    res.json({
      data: {
        hasSession: false,
        isRestDay: false,
        emptyReason: "no_planning_this_week",
        session: null,
        progress: {completed: 0, total: null},
        allSessions: resolvedAllSessions,
      },
    });
    return;
  }

  const sessionInfo = sessionDoc.data()!;
  // Load exercises
  let exercisesSnap = await sessionDocRef.collection("exercises")
    .orderBy("order", "asc")
    .get();

  // Fallback: if session doc has no inline exercises but references a library session,
  // read exercises from the creator's library instead
  const libSessionRef = (sessionInfo.source_library_session_id ?? sessionInfo.librarySessionRef) as string | undefined;
  if (exercisesSnap.empty && libSessionRef) {
    const courseCreator = (course.creator_id ?? course.creatorId) as string | undefined;
    if (courseCreator) {
      const libSessionDocRef = db.collection("creator_libraries").doc(courseCreator)
        .collection("sessions").doc(libSessionRef);
      const libSessionDoc = await libSessionDocRef.get();
      if (libSessionDoc.exists) {
        // Use library session metadata if session doc fields are missing
        const libData = libSessionDoc.data()!;
        if (!sessionInfo.title && libData.title) sessionInfo.title = libData.title;
        if (!sessionInfo.image_url && libData.image_url) sessionInfo.image_url = libData.image_url;
      }
      exercisesSnap = await libSessionDocRef.collection("exercises")
        .orderBy("order", "asc").get();
    }
  }

  // Load sets for each exercise in parallel
  const exercisesWithSets = await Promise.all(
    exercisesSnap.docs.map(async (exDoc) => {
      const exData = exDoc.data();
      const setsSnap = await exDoc.ref
        .collection("sets")
        .orderBy("order", "asc")
        .get();

      // Derive libraryId and name from primary map when not stored directly
      const primaryMap = exData.primary as Record<string, string> | undefined;
      const primaryLibraryId = primaryMap ? Object.keys(primaryMap)[0] : null;
      const resolvedLibraryId = exData.libraryId ?? primaryLibraryId ?? null;
      const resolvedName = exData.name || (primaryLibraryId ? primaryMap![primaryLibraryId] : "");

      return {
        exerciseId: exDoc.id,
        libraryId: resolvedLibraryId,
        name: resolvedName,
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
        exerciseKey: resolvedLibraryId && resolvedName ?
          `${resolvedLibraryId}_${resolvedName}` :
          exDoc.id,
      };
    })
  );

  // Batch-fetch library metadata and lastPerformance in parallel
  const exerciseKeys = exercisesWithSets
    .map((ex) => ex.exerciseKey)
    .filter(Boolean);

  // Unique library IDs to fetch exercise metadata (video_url, muscle_activation, implements)
  const uniqueLibraryIds = [
    ...new Set(exercisesWithSets.map((ex) => ex.libraryId).filter(Boolean)),
  ] as string[];

  const [lastPerfDocs, libraryDocs] = await Promise.all([
    // Fetch lastPerformance docs
    exerciseKeys.length > 0 ?
      Promise.all(
        exerciseKeys.map((key) =>
          db.collection("users").doc(auth.userId)
            .collection("exerciseLastPerformance").doc(key).get()
        )
      ) :
      Promise.resolve([]),
    // Fetch exercise library docs (each doc contains all exercises as fields)
    uniqueLibraryIds.length > 0 ?
      Promise.all(
        uniqueLibraryIds.map((libId) =>
          db.collection("exercises_library").doc(libId).get()
        )
      ) :
      Promise.resolve([]),
  ]);

  const lastPerfMap: Record<string, Record<string, unknown>> = {};
  for (const doc of lastPerfDocs) {
    if (doc.exists) {
      lastPerfMap[doc.id] = doc.data()!;
    }
  }

  // Build library lookup: libraryId -> { exerciseName -> { video_url, muscle_activation, implements, ... } }
  const libraryMap: Record<string, Record<string, unknown>> = {};
  for (const doc of libraryDocs) {
    if (doc.exists) {
      libraryMap[doc.id] = doc.data()!;
    }
  }

  // Assemble exercises with lastPerformance and library metadata
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
            return {weight: w, reps: r};
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

    // Enrich from exercise library when session doc has no metadata
    const libData = ex.libraryId ? (libraryMap[ex.libraryId] ?? {}) : {};
    const libExercise = (libData[ex.name] ?? {}) as Record<string, unknown>;

    return {
      exerciseId: ex.exerciseId,
      libraryId: ex.libraryId,
      name: ex.name,
      description: ex.description || (libExercise.description as string) || null,
      video_url: ex.video_url || (libExercise.video_url as string) || null,
      muscle_activation: ex.muscle_activation || (libExercise.muscle_activation as Record<string, unknown>) || null,
      implements: (ex.implements?.length ? ex.implements : (libExercise.implements as string[])) ?? [],
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
  const completedCount = completedSessionIds ?
    completedSessionIds.size :
    (await db
      .collection("users")
      .doc(auth.userId)
      .collection("sessionHistory")
      .where("courseId", "==", courseId)
      .count()
      .get()).data().count;

  // Read module title for context
  let moduleTitle = "";
  if (isContentRoot || isLibrary) {
    // For client_session_content or library, use session doc title
    moduleTitle = (sessionInfo.title as string) ?? (sessionInfo.session_title as string) ?? "";
  } else if (isDirect) {
    // For plan-based programs, the "module" is the client_plan_content doc itself
    const contentDocForTitle = await db.collection(sessionCollection).doc(sessionCollectionId).get();
    moduleTitle = contentDocForTitle.exists ? (contentDocForTitle.data()!.title ?? "") : "";
  } else {
    const moduleDoc = await db
      .collection(sessionCollection)
      .doc(sessionCollectionId)
      .collection("modules")
      .doc(targetModuleId!)
      .get();
    moduleTitle = moduleDoc.exists ? (moduleDoc.data()!.title ?? "") : "";
  }

  res.json({
    data: {
      hasSession: true,
      isRestDay: false,
      emptyReason: null,
      session: {
        sessionId: targetSessionId,
        moduleId: targetModuleId,
        moduleTitle,
        title: sessionInfo.title ?? sessionInfo.session_title ?? "",
        image_url: sessionInfo.image_url ?? null,
        order: sessionInfo.order ?? 0,
        plannedDate: sessionInfo.plannedDate ?? null,
        deliveryType,
        exercises,
      },
      progress: {
        completed: completedCount,
        total: resolvedAllSessions.length || null,
      },
      allSessions: resolvedAllSessions,
      availableLibraries: Array.isArray(course.availableLibraries) ? course.availableLibraries : [],
    },
  });
});

// GET /workout/session-exercises — lightweight endpoint for session switching
// Only fetches a single session's exercises/sets/lastPerformance.
// Skips allSessions computation entirely (~4s savings vs /workout/daily).
router.get("/workout/session-exercises", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseId = req.query.courseId as string;
  const sessionId = req.query.sessionId as string;
  const moduleId = req.query.moduleId as string | undefined;

  if (!courseId || !sessionId) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId y sessionId son requeridos", "courseId");
  }

  // Parallel: verify access + load course structure
  const [userDoc, courseDoc] = await Promise.all([
    db.collection("users").doc(auth.userId).get(),
    db.collection("courses").doc(courseId).get(),
  ]);

  const courses = userDoc.data()?.courses ?? {};
  const courseAccess = courses[courseId] as Record<string, unknown> | undefined;
  if (!courseAccess || courseAccess.status !== "active") {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este programa");
  }
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  const course = courseDoc.data()!;
  const deliveryType = course.deliveryType ?? "low_ticket";

  // Resolve session doc reference based on delivery type and moduleId
  let sessionDocRef: FirebaseFirestore.DocumentReference;
  let moduleTitle = "";

  if (deliveryType === "one_on_one") {
    const plansSnap = await db.collection("plans")
      .where("courseId", "==", courseId)
      .where("userId", "==", auth.userId)
      .where("status", "==", "active")
      .limit(1).get();
    if (plansSnap.empty) {
      throw new WakeApiServerError("NOT_FOUND", 404, "Plan no encontrado");
    }
    sessionDocRef = db.collection("plans").doc(plansSnap.docs[0].id)
      .collection("modules").doc(moduleId!)
      .collection("sessions").doc(sessionId);
    const modDoc = await db.collection("plans").doc(plansSnap.docs[0].id)
      .collection("modules").doc(moduleId!).get();
    moduleTitle = modDoc.exists ? ((modDoc.data()!.title as string) ?? "") : "";
  } else {
    const planAssignments = (course.planAssignments ?? {}) as Record<string, { planId: string; moduleId: string }>;
    const hasPlanAssignments = Object.keys(planAssignments).some((k) => planAssignments[k]?.planId);

    if (hasPlanAssignments && moduleId) {
      // Plan-based: moduleId is either a client_plan_content doc ID or a plan module ID
      const contentDoc = await db.collection("client_plan_content").doc(moduleId).get();
      if (contentDoc.exists) {
        sessionDocRef = contentDoc.ref.collection("sessions").doc(sessionId);
        moduleTitle = (contentDoc.data()!.title as string) ?? "";
      } else {
        const matchingWeek = Object.keys(planAssignments).find((k) => planAssignments[k].moduleId === moduleId);
        if (!matchingWeek) {
          throw new WakeApiServerError("NOT_FOUND", 404, "Sesion no encontrada en el plan");
        }
        const planId = planAssignments[matchingWeek].planId;
        sessionDocRef = db.collection("plans").doc(planId)
          .collection("modules").doc(moduleId)
          .collection("sessions").doc(sessionId);
        const modDoc = await db.collection("plans").doc(planId)
          .collection("modules").doc(moduleId).get();
        moduleTitle = modDoc.exists ? ((modDoc.data()!.title as string) ?? "") : "";
      }
    } else if (hasPlanAssignments && !moduleId) {
      // Plan-based but no moduleId — search client_plan_content for the session
      let found = false;
      for (const weekKey of Object.keys(planAssignments)) {
        const docId = `program_${courseId}_${weekKey}`;
        const sessionDoc = await db.collection("client_plan_content").doc(docId)
          .collection("sessions").doc(sessionId).get();
        if (sessionDoc.exists) {
          sessionDocRef = sessionDoc.ref;
          const contentDoc = await db.collection("client_plan_content").doc(docId).get();
          moduleTitle = contentDoc.exists ? ((contentDoc.data()!.title as string) ?? "") : "";
          found = true;
          break;
        }
      }
      if (!found) {
        throw new WakeApiServerError("NOT_FOUND", 404, "Sesion no encontrada");
      }
    } else {
      if (!moduleId) {
        throw new WakeApiServerError("VALIDATION_ERROR", 400, "moduleId es requerido");
      }
      sessionDocRef = db.collection("courses").doc(courseId)
        .collection("modules").doc(moduleId)
        .collection("sessions").doc(sessionId);
      const modDoc = await db.collection("courses").doc(courseId)
        .collection("modules").doc(moduleId).get();
      moduleTitle = modDoc.exists ? ((modDoc.data()!.title as string) ?? "") : "";
    }
  }

  const sessionDoc = await sessionDocRef!.get();
  if (!sessionDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Sesion no encontrada");
  }
  const sessionInfo = sessionDoc.data()!;

  // Load exercises + sets in parallel
  const exercisesSnap = await sessionDocRef!.collection("exercises").orderBy("order", "asc").get();
  const exercisesWithSets = await Promise.all(
    exercisesSnap.docs.map(async (exDoc) => {
      const exData = exDoc.data();
      const setsSnap = await exDoc.ref.collection("sets").orderBy("order", "asc").get();

      // Derive libraryId and name from primary map when not stored directly
      const primaryMap = exData.primary as Record<string, string> | undefined;
      const primaryLibraryId = primaryMap ? Object.keys(primaryMap)[0] : null;
      const resolvedLibraryId = exData.libraryId ?? primaryLibraryId ?? null;
      const resolvedName = exData.name || (primaryLibraryId ? primaryMap![primaryLibraryId] : "");

      return {
        exerciseId: exDoc.id,
        libraryId: resolvedLibraryId,
        name: resolvedName,
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
          return {setId: setDoc.id, reps: setData.reps ?? null, weight: setData.weight ?? null, intensity: setData.intensity ?? null, rir: setData.rir ?? null, title: setData.title ?? null, order: setData.order ?? 0};
        }),
        exerciseKey: resolvedLibraryId && resolvedName ?
          `${resolvedLibraryId}_${resolvedName}` :
          exDoc.id,
      };
    })
  );

  // Batch-fetch lastPerformance and library metadata in parallel
  const exerciseKeys = exercisesWithSets.map((ex) => ex.exerciseKey).filter(Boolean);
  const uniqueLibIds = [...new Set(exercisesWithSets.map((ex) => ex.libraryId).filter(Boolean))] as string[];

  const [lastPerfDocs2, libraryDocs2] = await Promise.all([
    exerciseKeys.length > 0 ?
      Promise.all(exerciseKeys.map((key) =>
        db.collection("users").doc(auth.userId).collection("exerciseLastPerformance").doc(key).get())) :
      Promise.resolve([]),
    uniqueLibIds.length > 0 ?
      Promise.all(uniqueLibIds.map((libId) =>
        db.collection("exercises_library").doc(libId).get())) :
      Promise.resolve([]),
  ]);

  const lastPerfMap2: Record<string, Record<string, unknown>> = {};
  for (const doc of lastPerfDocs2) {
    if (doc.exists) lastPerfMap2[doc.id] = doc.data()!;
  }
  const libraryMap2: Record<string, Record<string, unknown>> = {};
  for (const doc of libraryDocs2) {
    if (doc.exists) libraryMap2[doc.id] = doc.data()!;
  }

  const exercises = exercisesWithSets.map((ex) => {
    const lastPerf = lastPerfMap2[ex.exerciseKey] ?? null;
    let lastPerformance: Record<string, unknown> | null = null;
    if (lastPerf) {
      const sets = (lastPerf.sets ?? []) as Array<{ weight?: number; reps?: number }>;
      const bestSet = sets.reduce(
        (best: { weight: number; reps: number } | null, s) => {
          const w = s.weight ?? 0; const r = s.reps ?? 0;
          if (!best || w > best.weight || (w === best.weight && r > best.reps)) return {weight: w, reps: r};
          return best;
        }, null);
      lastPerformance = {sessionId: lastPerf.completionId ?? null, date: lastPerf.date ?? null, sets, bestSet};
    }

    // Enrich from exercise library when session doc has no metadata
    const libData2 = ex.libraryId ? (libraryMap2[ex.libraryId] ?? {}) : {};
    const libEx = (libData2[ex.name] ?? {}) as Record<string, unknown>;

    return {
      exerciseId: ex.exerciseId, libraryId: ex.libraryId, name: ex.name,
      description: ex.description || (libEx.description as string) || null,
      video_url: ex.video_url || (libEx.video_url as string) || null,
      muscle_activation: ex.muscle_activation || (libEx.muscle_activation as Record<string, unknown>) || null,
      implements: (ex.implements?.length ? ex.implements : (libEx.implements as string[])) ?? [],
      primary: ex.primary, alternatives: ex.alternatives, objectives: ex.objectives, measures: ex.measures,
      customMeasureLabels: ex.customMeasureLabels, customObjectiveLabels: ex.customObjectiveLabels,
      order: ex.order, primaryMuscles: ex.primaryMuscles, sets: ex.sets, lastPerformance,
    };
  });

  res.json({
    data: {
      session: {
        sessionId, moduleId: moduleId ?? null, moduleTitle,
        title: sessionInfo.title ?? "", image_url: sessionInfo.image_url ?? null,
        order: sessionInfo.order ?? 0, deliveryType, exercises,
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

  res.json({data: coursesList});
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

  res.json({data: {...courseDoc.data(), id: courseDoc.id}});
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
    {maxArrayLength: 50}
  );

  // Extract date from completedAt
  const completionDate = body.completedAt.slice(0, 10);

  // Unique completion ID — allows the same session to be completed multiple times per day
  const completionId = `${auth.userId}_${body.sessionId}_${completionDate}_${Date.now()}`;

  const exercises = body.exercises as Array<{
    exerciseKey?: string;
    exerciseId?: string;
    libraryId?: string;
    exerciseName?: string;
    primaryMuscles?: string[];
    sets?: Array<{ reps?: number; weight?: number; intensity?: string | null; plannedIntensity?: string | null; rir?: number | null }>;
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
        existingPrMap[doc.id] = {estimate1RM: data.estimate1RM ?? 0};
      }
    }
  }

  // Read user doc for weekly volume + streak
  const userDoc = await db.collection("users").doc(auth.userId).get();
  const userData = userDoc.data() ?? {};

  // Update streak via shared function (full read already done, pass lastKnown to avoid re-read)
  const storedLastActivity = userData.activityStreak?.lastActivityDate ?? userData.lastSessionDate ?? null;
  const streakResult = await updateStreak(auth.userId, completionDate, storedLastActivity);

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
    ...(body.courseName ? {courseName: body.courseName} : {}),
    ...(body.sessionName ? {sessionName: body.sessionName} : {}),
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

      const intensity =
        parseReportedIntensity(set.intensity) ??
        parsePlannedIntensity(set.plannedIntensity) ??
        null;
      const estimate = calculate1RM(weight, reps, intensity);

      if (estimate > bestEstimate1RM) {
        bestEstimate1RM = estimate;
        bestSet = {weight, reps, intensity: set.intensity ?? null};
      }
    }

    const existingPr = existingPrMap[exerciseKey];
    const existingEstimate = existingPr?.estimate1RM ?? 0;

    // Only count as PR if there's a previous record to beat (not first-time exercises)
    if (existingPr && bestEstimate1RM > existingEstimate && bestSet) {
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
      {merge: true}
    );

    const lastPerfRef = db
      .collection("users")
      .doc(auth.userId)
      .collection("exerciseLastPerformance")
      .doc(exerciseKey);

    // Production format: exerciseId, exerciseName, libraryId, lastSessionId, lastPerformedAt, totalSets, bestSet
    const exerciseSets = exercise.sets ?? [];
    const prodBestSet = exerciseSets.length > 0 ?
      exerciseSets.reduce((best: Record<string, unknown>, s: Record<string, unknown>) => {
        const bw = parseFloat(String(best.weight ?? 0));
        const sw = parseFloat(String(s.weight ?? 0));
        return sw > bw ? s : best;
      }, exerciseSets[0]) :
      null;

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

  // 3b. Compute week key for weeklyMuscleVolume persistence
  // Must match client-side getMondayWeek() in apps/pwa/src/utils/weekCalculation.js
  const completionDateObj = new Date(completionDate);
  completionDateObj.setHours(0, 0, 0, 0);
  const dayOfWeek = completionDateObj.getDay();
  const mondayOffset = completionDateObj.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(completionDateObj);
  monday.setDate(mondayOffset);
  const year = monday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  const daysToFirstMonday = jan1Day === 0 ? 1 : 8 - jan1Day;
  const firstMonday = new Date(jan1.getTime());
  firstMonday.setDate(jan1.getDate() + daysToFirstMonday);
  const daysDiff = Math.floor((monday.getTime() - firstMonday.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.floor(daysDiff / 7) + 1;
  const weekKey = `${year}-W${String(weekNumber).padStart(2, "0")}`;

  // Merge session volumes into existing weekly volumes (additive)
  const weeklyVolumeUpdate: Record<string, unknown> = {};
  const existingWeeklyVolume = userData.weeklyMuscleVolume?.[weekKey] ?? {};
  for (const [muscle, sets] of Object.entries(muscleVolumes)) {
    const existing = (existingWeeklyVolume as Record<string, number>)[muscle] ?? 0;
    weeklyVolumeUpdate[`weeklyMuscleVolume.${weekKey}.${muscle}`] = existing + sets;
  }

  // 4. Update user last session + weekly volume (streak already updated by updateStreak above)
  const userRef = db.collection("users").doc(auth.userId);
  batch.update(userRef, {
    lastSessionDate: completionDate,
    ...weeklyVolumeUpdate,
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
      streakUpdated: streakResult.updated,
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
  const rawLimit = parseInt(req.query.limit as string, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

  let query: Query = db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .orderBy("completedAt", "desc")
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
    data: docs.map((d) => ({...d.data(), id: d.id})),
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

  res.json({data: {...doc.data(), id: doc.id}});
});

// PATCH /workout/sessions/:completionId/notes
router.patch("/workout/sessions/:completionId/notes", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 100, "rate_limit_first_party");

  const body = validateBody<{ userNotes: string }>(
    {userNotes: "string"},
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

  await docRef.update({userNotes: body.userNotes});

  res.json({data: {updated: true}});
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
    res.json({data: {sessions: []}});
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

  res.json({data: {saved: true}});
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
    res.json({data: {checkpoint: null}});
    return;
  }

  const checkpoint = doc.data()!;

  // 24h staleness check — record abandonment then discard
  const savedAt = checkpoint.savedAt as string | undefined;
  if (savedAt) {
    const ageMs = Date.now() - new Date(savedAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      const completedSetsCount = checkpoint.completedSets ?
        Object.values(checkpoint.completedSets as Record<string, Record<string, unknown>>).filter(
          (s) => s && typeof s === "object" && Object.values(s).some((v) => v !== "" && v !== null && v !== undefined)
        ).length :
        0;
      db.collection("users")
        .doc(auth.userId)
        .collection("abandonedSessions")
        .doc((checkpoint.sessionId as string) || "unknown")
        .set({
          sessionId: (checkpoint.sessionId as string) || null,
          courseId: (checkpoint.courseId as string) || null,
          sessionName: (checkpoint.sessionName as string) || null,
          startedAt: (checkpoint.startedAt as string) || null,
          elapsedSeconds: (checkpoint.elapsedSeconds as number) || 0,
          completedSetsCount,
          completionPct: null,
          userId: auth.userId,
          abandonedAt: new Date().toISOString(),
          detectedBy: "stale_check",
          created_at: FieldValue.serverTimestamp(),
        }, {merge: true})
        .catch((err) => functions.logger.warn("workout:stale-abandoned-record-failed", err));
      doc.ref.delete()
        .catch((err) => functions.logger.warn("workout:stale-session-cleanup-failed", err));
      res.json({data: {checkpoint: null}});
      return;
    }
  }

  res.json({data: {checkpoint}});
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
    res.json({data: {deleted: true}});
  } else {
    res.json({data: {deleted: false}});
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

  res.json({data: prs});
});

// POST /workout/session/abandon — record a user-discarded or stale session
router.post("/workout/session/abandon", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 50, "rate_limit_first_party");

  const body = validateBody<{
    sessionId: string;
    courseId: string;
    sessionName: string;
    startedAt: string;
    elapsedSeconds: number;
    completedSetsCount: number;
    totalSetsCount?: number;
    lastExerciseKey?: string;
  }>(
    {
      sessionId: "string",
      courseId: "string",
      sessionName: "string",
      startedAt: "string",
      elapsedSeconds: "number",
      completedSetsCount: "number",
      totalSetsCount: "optional_number",
      lastExerciseKey: "optional_string",
    },
    req.body
  );

  const completionPct =
    body.totalSetsCount && body.totalSetsCount > 0 ?
      Math.round((body.completedSetsCount / body.totalSetsCount) * 100) :
      null;

  const batch = db.batch();

  batch.set(
    db
      .collection("users")
      .doc(auth.userId)
      .collection("abandonedSessions")
      .doc(body.sessionId),
    {
      ...body,
      userId: auth.userId,
      abandonedAt: new Date().toISOString(),
      completionPct,
      detectedBy: "user_discard",
      created_at: FieldValue.serverTimestamp(),
    }
  );

  batch.delete(
    db
      .collection("users")
      .doc(auth.userId)
      .collection("activeSession")
      .doc("current")
  );

  await batch.commit();

  res.json({data: {recorded: true}});
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

  res.json({data: {saved: true}});
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
    res.json({data: {checkpoint: null}});
    return;
  }

  const checkpoint = doc.data()!;

  // 24h staleness check — record abandonment then discard
  const savedAt = checkpoint.savedAt as string | undefined;
  if (savedAt) {
    const ageMs = Date.now() - new Date(savedAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      const completedSetsCount = checkpoint.completedSets ?
        Object.values(checkpoint.completedSets as Record<string, Record<string, unknown>>).filter(
          (s) => s && typeof s === "object" && Object.values(s).some((v) => v !== "" && v !== null && v !== undefined)
        ).length :
        0;
      db.collection("users")
        .doc(auth.userId)
        .collection("abandonedSessions")
        .doc((checkpoint.sessionId as string) || "unknown")
        .set({
          sessionId: (checkpoint.sessionId as string) || null,
          courseId: (checkpoint.courseId as string) || null,
          sessionName: (checkpoint.sessionName as string) || null,
          startedAt: (checkpoint.startedAt as string) || null,
          elapsedSeconds: (checkpoint.elapsedSeconds as number) || 0,
          completedSetsCount,
          completionPct: null,
          userId: auth.userId,
          abandonedAt: new Date().toISOString(),
          detectedBy: "stale_check",
          created_at: FieldValue.serverTimestamp(),
        }, {merge: true})
        .catch((err) => functions.logger.warn("workout:stale-abandoned-record-failed", err));
      doc.ref.delete()
        .catch((err) => functions.logger.warn("workout:stale-session-cleanup-failed", err));
      res.json({data: {checkpoint: null}});
      return;
    }
  }

  res.json({data: {checkpoint}});
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
    res.json({data: {deleted: true}});
  } else {
    res.json({data: {deleted: false}});
  }
});

// POST /workout/prs/batch-history — fetch multiple exercise histories in one call
router.post("/workout/prs/batch-history", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {keys} = req.body;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 20) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "keys debe ser un array de 1 a 20 exercise keys", "keys"
    );
  }

  const docs = await Promise.all(
    keys.map((key: string) =>
      db
        .collection("users")
        .doc(auth.userId)
        .collection("exerciseHistory")
        .doc(key)
        .get()
    )
  );

  const results: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const doc = docs[i];
    results[keys[i]] = doc.exists ? doc.data() : {sessions: []};
  }

  res.json({data: results});
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
    res.json({data: {sessions: []}});
    return;
  }

  res.json({data: doc.data()});
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

  res.json({data: progress});
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

  await docRef.set(updates, {merge: true});

  const updated = await docRef.get();
  res.json({data: {courseId, ...updated.data()}});
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
    {sessionId: "string", sessionData: "optional_object"},
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
    {merge: true}
  );

  const updated = await docRef.get();
  res.json({data: {courseId, ...updated.data()}});
});

// Aliases: /workout/programs/:courseId → /workout/courses/:courseId
// PWA apiService.js and purchaseService.js call /workout/programs/ paths
// Any authenticated user can read course metadata (needed for purchase flow).
// Actual workout content is in subcollections, gated separately.
router.get("/workout/programs/:courseId", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const courseDoc = await db.collection("courses").doc(req.params.courseId).get();
  if (!courseDoc.exists) {
    throw new WakeApiServerError("NOT_FOUND", 404, "Programa no encontrado");
  }

  res.json({data: {...courseDoc.data(), id: courseDoc.id}});
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

  const courseData_ = courseDoc.data()!;
  const isCreator = courseData_.creator_id === auth.userId;
  const isAdmin = auth.role === "admin";
  const isPublished = courseData_.status === "published" || courseData_.status === "publicado";
  if (!hasAccess && !isCreator && !isAdmin && !isPublished) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este programa");
  }

  // Check for plan-based programs first
  const courseData = courseDoc.data()!;
  const planAssignments = (courseData.planAssignments ?? {}) as Record<string, { planId: string; moduleId: string; moduleIndex?: number }>;
  const planWeekKeys = Object.keys(planAssignments).filter((k) => planAssignments[k]?.planId);

  const includeSessions = req.query.include === "sessions";

  if (planWeekKeys.length > 0) {
    // Plan-based: return virtual modules from planAssignments, sorted by week key
    planWeekKeys.sort();
    const modules = [];
    for (let i = 0; i < planWeekKeys.length; i++) {
      const weekKey = planWeekKeys[i];
      const assignment = planAssignments[weekKey];
      const docId = `program_${req.params.courseId}_${weekKey}`;

      // Try content copy first, fall back to plan module title
      const contentDoc = await db.collection("client_plan_content").doc(docId).get();
      let title = `Semana ${i + 1}`;
      if (contentDoc.exists) {
        title = (contentDoc.data()?.title as string) ?? title;
      } else {
        try {
          const moduleDoc = await db.collection("plans").doc(assignment.planId)
            .collection("modules").doc(assignment.moduleId).get();
          if (moduleDoc.exists) title = (moduleDoc.data()?.title as string) ?? title;
        } catch {/* best-effort */}
      }

      const moduleEntry: Record<string, unknown> = {
        id: assignment.moduleId,
        title,
        order: i,
        weekKey,
        planId: assignment.planId,
      };

      if (includeSessions) {
        const moduleRef = db.collection("plans").doc(assignment.planId)
          .collection("modules").doc(assignment.moduleId);
        const sessionsSnap = await moduleRef
          .collection("sessions").orderBy("order", "asc").limit(MAX_SESSIONS_PER_MODULE).get();
        moduleEntry.sessions = await Promise.all(
          sessionsSnap.docs.map(async (sDoc) => {
            const exercises = await loadExerciseTree(sDoc.ref);
            return {...sDoc.data(), id: sDoc.id, exercises};
          })
        );
      }

      modules.push(moduleEntry);
    }
    res.json({data: modules});
    return;
  }

  // Legacy: read from courses subcollection
  const modulesSnap = await db
    .collection("courses")
    .doc(req.params.courseId)
    .collection("modules")
    .orderBy("order", "asc")
    .limit(MAX_MODULES_PER_COURSE)
    .get();

  if (!includeSessions) {
    const modules = modulesSnap.docs.map((doc) => ({...doc.data(), id: doc.id}));
    res.json({data: modules});
    return;
  }

  // Full tree: modules -> sessions -> exercises -> sets
  const modules = await Promise.all(
    modulesSnap.docs.map(async (mDoc) => {
      const sessionsSnap = await mDoc.ref
        .collection("sessions")
        .orderBy("order", "asc")
        .limit(MAX_SESSIONS_PER_MODULE)
        .get();
      const sessions = await Promise.all(
        sessionsSnap.docs.map(async (sDoc) => {
          const exercises = await loadExerciseTree(sDoc.ref);
          return {...sDoc.data(), id: sDoc.id, exercises};
        })
      );
      return {...mDoc.data(), id: mDoc.id, sessions};
    })
  );
  res.json({data: modules});
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
        res.json({data: {...overrideDoc.data(), id: overrideDoc.id}});
        return;
      }
    }

    res.json({data: null});
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
        res.json({data: {...overrideDoc.data(), id: overrideDoc.id}});
        return;
      }
    }

    res.json({data: null});
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
        res.json({data: {...overrideDoc.data(), id: overrideDoc.id}});
        return;
      }
    }

    res.json({data: null});
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

  res.json({data: results});
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

  res.json({data: {...doc.data(), id: doc.id}});
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

  await docRef.set(writeData, {merge: true});

  res.json({data: {id: docId}});
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

  res.json({data: {updated: true}});
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
    res.json({data: null});
    return;
  }

  const doc = snap.docs[0];
  res.json({data: {...doc.data(), id: doc.id}});
});

// GET /workout/calendar/planned — planned session dates in range
// Merges: plan-based week sessions (from planAssignments + client_plan_content) + date-based client_sessions
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

  // Parallel: date-based sessions + user doc for planAssignments
  const [clientSessionsSnap, userDoc] = await Promise.all([
    db.collection("client_sessions")
      .where("client_id", "==", auth.userId)
      .where("program_id", "==", courseId)
      .where("date", ">=", startDate)
      .where("date", "<=", endDate)
      .orderBy("date", "asc").limit(100).get(),
    db.collection("users").doc(auth.userId).get(),
  ]);

  // Date-based session dates
  const dateDates = clientSessionsSnap.docs.map((d) => d.data().date as string);

  // Plan-based session dates (from planAssignments + unplanned client_plan_content)
  const courseEntry = userDoc.data()?.courses?.[courseId] as Record<string, unknown> | undefined;
  const planAssignments = (courseEntry?.planAssignments ?? {}) as Record<string, { planId: string; moduleId: string }>;
  const planWeekKeys = Object.keys(planAssignments).filter((k) => planAssignments[k]?.planId);

  // Also check for client_plan_content docs WITHOUT planAssignments
  // Compute all week keys that overlap the date range
  const rangeStart = new Date(startDate + "T12:00:00");
  const rangeEnd = new Date(endDate + "T12:00:00");
  const scanWeeks: string[] = [];
  const cursor = new Date(rangeStart);
  cursor.setDate(cursor.getDate() - 7); // extend 1 week before
  while (cursor <= rangeEnd) {
    const wk = getMondayWeek(cursor);
    if (!planWeekKeys.includes(wk) && !scanWeeks.includes(wk)) scanWeeks.push(wk);
    cursor.setDate(cursor.getDate() + 7);
  }
  // Batch check
  const unplannedRefs = scanWeeks.map((wk) =>
    db.collection("client_plan_content").doc(planContentDocId(auth.userId, courseId, wk))
  );
  const unplannedSnapshots = unplannedRefs.length > 0 ? await db.getAll(...unplannedRefs) : [];
  const unplannedFound = scanWeeks.filter((_, i) => unplannedSnapshots[i].exists);

  const allWeekKeys = [...planWeekKeys, ...unplannedFound].sort();

  const planDates: string[] = [];
  for (const weekKey of allWeekKeys) {
    const assignment = planAssignments[weekKey] ?? null;
    const {start: weekStart, end: weekEnd} = getWeekDates(weekKey);
    const weekStartStr = toLocalDateISO(weekStart);
    const weekEndStr = toLocalDateISO(weekEnd);
    if (weekEndStr < startDate || weekStartStr > endDate) continue;

    const docId = planContentDocId(auth.userId, courseId, weekKey);
    const docRef = db.collection("client_plan_content").doc(docId);
    // Reuse already-fetched snapshot for unplanned weeks
    const docSnap = unplannedFound.includes(weekKey) ?
      unplannedSnapshots[scanWeeks.indexOf(weekKey)] :
      await docRef.get();

    let sessions: FirebaseFirestore.QueryDocumentSnapshot[];
    if (docSnap.exists) {
      const snap = await docRef.collection("sessions").orderBy("order", "asc").get();
      sessions = snap.docs;
    } else if (assignment) {
      const snap = await db.collection("plans").doc(assignment.planId)
        .collection("modules").doc(assignment.moduleId)
        .collection("sessions").orderBy("order", "asc").get();
      sessions = snap.docs;
    } else {
      continue;
    }

    for (const sDoc of sessions) {
      const dayIdx = sDoc.data().dayIndex;
      if (typeof dayIdx === "number") {
        const sessionDate = toLocalDateISO(new Date(weekStart.getTime() + dayIdx * 86400000));
        if (sessionDate >= startDate && sessionDate <= endDate) {
          planDates.push(sessionDate);
        }
      }
    }
  }

  const allDates = [...new Set([...dateDates, ...planDates])].sort();
  res.json({data: allDates});
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

  // Fetch all sessionHistory for this course, then filter date range in memory
  // (avoids needing a composite index on courseId + date)
  const snap = await db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .where("courseId", "==", courseId)
    .limit(500)
    .get();

  const allDates = snap.docs.map((d) => {
    const data = d.data();
    let dateStr: string | null = data.date ?? null;
    if (!dateStr && data.completedAt) {
      if (typeof data.completedAt === "string") {
        dateStr = data.completedAt.slice(0, 10);
      } else if (data.completedAt.toDate) {
        dateStr = data.completedAt.toDate().toISOString().slice(0, 10);
      }
    }
    if (!dateStr) {
      const idParts = d.id.split("_");
      const lastPart = idParts[idParts.length - 1];
      if (/^\d{4}-\d{2}-\d{2}$/.test(lastPart)) dateStr = lastPart;
    }
    return dateStr;
  });

  const dates = [...new Set(
    allDates.filter((date): date is string => !!date && date >= startDate && date <= endDate)
  )];

  res.json({data: dates});
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
    .limit(500)
    .get();

  const allDates = snap.docs.map((d) => {
    const data = d.data();
    // Derive date: prefer explicit `date` field, fall back to extracting from `completedAt`
    let dateStr: string | null = data.date ?? null;
    if (!dateStr && data.completedAt) {
      if (typeof data.completedAt === "string") {
        dateStr = data.completedAt.slice(0, 10);
      } else if (data.completedAt.toDate) {
        dateStr = data.completedAt.toDate().toISOString().slice(0, 10);
      }
    }
    // Last resort: extract from doc ID (format: userId_sessionId_YYYY-MM-DD)
    if (!dateStr) {
      const idParts = d.id.split("_");
      const lastPart = idParts[idParts.length - 1];
      if (/^\d{4}-\d{2}-\d{2}$/.test(lastPart)) dateStr = lastPart;
    }
    return dateStr;
  });
  const dates = [...new Set(
    allDates.filter((date): date is string => !!date && date >= startDate && date <= endDate)
  )];
  res.json({data: dates});
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
        sets: setsSnap.docs.map((s) => ({...s.data(), id: s.id})),
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
    res.json({data: null});
    return;
  }

  const exercises = await loadExerciseTree(docRef);
  res.json({data: {...doc.data(), id: doc.id, exercises}});
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
    res.json({data: null});
    return;
  }

  const docData = doc.data()!;

  // Load sessions → exercises → sets tree
  const sessionsSnap = await docRef.collection("sessions").orderBy("order", "asc").get();
  const sessions = await Promise.all(
    sessionsSnap.docs.map(async (sDoc) => {
      const exercises = await loadExerciseTree(sDoc.ref);
      return {...sDoc.data(), id: sDoc.id, exercises};
    })
  );

  res.json({data: {id: doc.id, ...docData, sessions}});
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
  res.json({data: {...sessionDoc.data(), id: sessionDoc.id, exercises}});
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
  res.json({data: {...doc.data(), id: doc.id, exercises}});
});

export default router;
