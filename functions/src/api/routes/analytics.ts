import { Router } from "express";
import * as admin from "firebase-admin";
import { validateAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { validateDateFormat } from "../middleware/validate.js";
import { WakeApiServerError } from "../errors.js";

const router = Router();
const db = admin.firestore();

// GET /analytics/weekly-volume
router.get("/analytics/weekly-volume", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!startDate || !endDate) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "startDate y endDate son requeridos"
    );
  }

  // Validate date format
  validateDateFormat(startDate, "startDate");
  validateDateFormat(endDate, "endDate");

  // Validate max 12 weeks — check for invalid dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Fechas inválidas"
    );
  }
  const diffWeeks = (end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000);
  if (diffWeeks > 12 || diffWeeks < 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Rango máximo de 12 semanas"
    );
  }

  const snapshot = await db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .orderBy("date", "asc")
    .get();

  // Aggregate volume by week with muscle group breakdown
  interface WeekData {
    totalSessions: number;
    totalSets: number;
    muscleVolumes: Record<string, number>;
    weekStartDate: string;
    weekEndDate: string;
  }
  const weeks: Record<string, WeekData> = {};

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const date = new Date(data.date);
    // Week starts Monday (ISO standard)
    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // ISO week number calculation
    const jan4 = new Date(weekStart.getFullYear(), 0, 4);
    const dayOfYear = Math.floor((weekStart.getTime() - jan4.getTime()) / 86400000);
    const weekNum = Math.ceil((dayOfYear + jan4.getDay() + 1) / 7);
    const weekKey = `${weekStart.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;

    if (!weeks[weekKey]) {
      weeks[weekKey] = {
        totalSessions: 0,
        totalSets: 0,
        muscleVolumes: {},
        weekStartDate: weekStart.toISOString().slice(0, 10),
        weekEndDate: weekEnd.toISOString().slice(0, 10),
      };
    }
    weeks[weekKey].totalSessions++;

    const exercises = (data.exercises ?? []) as Array<{
      primaryMuscles?: string[];
      muscleGroups?: string[];
      sets?: Array<{ reps?: number; weight?: number }>;
    }>;

    for (const exercise of exercises) {
      const muscles = exercise.primaryMuscles ?? exercise.muscleGroups ?? [];
      const setCount = (exercise.sets ?? []).length;
      weeks[weekKey].totalSets += setCount;

      for (const muscle of muscles) {
        weeks[weekKey].muscleVolumes[muscle] = (weeks[weekKey].muscleVolumes[muscle] ?? 0) + setCount;
      }
    }
  }

  const result = Object.entries(weeks).map(([weekKey, w]) => ({
    weekKey,
    ...w,
  }));

  res.json({ data: result });
});

// GET /analytics/muscle-breakdown
router.get("/analytics/muscle-breakdown", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  if (!startDate || !endDate) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "startDate y endDate son requeridos"
    );
  }

  // Validate date format
  validateDateFormat(startDate, "startDate");
  validateDateFormat(endDate, "endDate");

  // Validate max 90 days — check for invalid dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Fechas inválidas"
    );
  }
  const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (diffDays > 90 || diffDays < 0) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "Rango máximo de 90 días"
    );
  }

  const snapshot = await db
    .collection("users")
    .doc(auth.userId)
    .collection("sessionHistory")
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .get();

  const muscles: Record<string, number> = {};
  let totalSessions = 0;
  let totalSets = 0;

  for (const doc of snapshot.docs) {
    totalSessions++;
    const exercises = (doc.data().exercises ?? []) as Array<{
      primaryMuscles?: string[];
      muscleGroups?: string[];
      sets?: Array<Record<string, unknown>>;
    }>;

    for (const exercise of exercises) {
      const muscleList = exercise.primaryMuscles ?? exercise.muscleGroups ?? [];
      const setCount = (exercise.sets ?? []).length;
      totalSets += setCount;

      for (const muscle of muscleList) {
        muscles[muscle] = (muscles[muscle] ?? 0) + setCount;
      }
    }
  }

  res.json({
    data: {
      period: { startDate, endDate },
      muscles,
      totalSessions,
      totalSets,
    },
  });
});

// ─── Creator Analytics ────────────────────────────────────────────────────

const WAKE_CUT_PERCENT = 15;

function requireCreator(auth: { role: string }): void {
  if (auth.role !== "creator" && auth.role !== "admin") {
    throw new WakeApiServerError("FORBIDDEN", 403, "Acceso restringido a creadores");
  }
}

async function verifyCreatorOwnsClient(
  creatorId: string,
  clientId: string
): Promise<void> {
  const snap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", creatorId)
    .where("userId", "==", clientId)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este cliente");
  }
}

// GET /analytics/revenue
router.get("/analytics/revenue", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const paymentsSnap = await db
    .collection("processed_payments")
    .where("creatorId", "==", auth.userId)
    .get();

  let salesCount = 0;
  let grossRevenue = 0;

  for (const doc of paymentsSnap.docs) {
    const data = doc.data();
    if (data.status === "approved" || data.status === "completed") {
      salesCount++;
      grossRevenue += data.amount ?? 0;
    }
  }

  const netRevenue = Math.round(grossRevenue * (1 - WAKE_CUT_PERCENT / 100));

  const clientsSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .get();

  const callsSnap = await db
    .collection("call_bookings")
    .where("creatorId", "==", auth.userId)
    .get();

  res.json({
    data: {
      lowTicket: { salesCount, grossRevenue, netRevenue },
      oneOnOne: { clientCount: clientsSnap.size, callCount: callsSnap.size },
    },
  });
});

// GET /analytics/adherence
router.get("/analytics/adherence", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const programsSnap = await db
    .collection("courses")
    .where("creatorId", "==", auth.userId)
    .get();

  const clientsSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .get();

  const clientUserIds = clientsSnap.docs.map((d) => d.data().userId as string);

  interface ProgramAdherence {
    programId: string;
    title: string;
    completedSessions: number;
    totalSessions: number;
    adherence: number;
  }

  const byProgram: ProgramAdherence[] = [];
  let totalCompleted = 0;
  let totalExpected = 0;

  for (const programDoc of programsSnap.docs) {
    const programData = programDoc.data();

    const sessionsSnap = await db
      .collectionGroup("sessions")
      .where("courseId", "==", programDoc.id)
      .get();
    const programSessionCount = sessionsSnap.size;

    let programCompleted = 0;
    for (const clientUserId of clientUserIds) {
      const historySnap = await db
        .collection("users")
        .doc(clientUserId)
        .collection("sessionHistory")
        .where("courseId", "==", programDoc.id)
        .get();
      programCompleted += historySnap.size;
    }

    const expectedTotal = programSessionCount * clientUserIds.length;
    const adherence = expectedTotal > 0
      ? Math.round((programCompleted / expectedTotal) * 100)
      : 0;

    totalCompleted += programCompleted;
    totalExpected += expectedTotal;

    byProgram.push({
      programId: programDoc.id,
      title: programData.title ?? "",
      completedSessions: programCompleted,
      totalSessions: expectedTotal,
      adherence,
    });
  }

  const overallAdherence = totalExpected > 0
    ? Math.round((totalCompleted / totalExpected) * 100)
    : 0;

  res.json({
    data: { overallAdherence, byProgram },
  });
});

// GET /analytics/client/:clientId/lab
router.get("/analytics/client/:clientId/lab", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const clientId = req.params.clientId;
  await verifyCreatorOwnsClient(auth.userId, clientId);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
  const nowStr = now.toISOString().slice(0, 10);

  const [sessionsSnap, bodyLogSnap, readinessSnap, assignmentsSnap, diarySnap] =
    await Promise.all([
      db.collection("users").doc(clientId).collection("sessionHistory")
        .where("date", ">=", thirtyDaysAgoStr).orderBy("date", "desc").get(),
      db.collection("users").doc(clientId).collection("bodyLog")
        .where("date", ">=", thirtyDaysAgoStr).orderBy("date", "desc").get(),
      db.collection("users").doc(clientId).collection("readiness")
        .where("date", ">=", sevenDaysAgoStr).orderBy("date", "desc").get(),
      db.collection("nutrition_assignments")
        .where("userId", "==", clientId)
        .where("creatorId", "==", auth.userId)
        .where("status", "==", "active").limit(1).get(),
      db.collection("users").doc(clientId).collection("diary")
        .where("date", ">=", sevenDaysAgoStr).where("date", "<=", nowStr).get(),
    ]);

  // Weekly volume (last 8 weeks)
  const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);
  const weekMap: Record<string, { sessions: number; totalSets: number }> = {};

  for (const doc of sessionsSnap.docs) {
    const data = doc.data();
    const date = new Date(data.date);
    if (date < eightWeeksAgo) continue;

    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() + mondayOffset);
    const weekKey = weekStart.toISOString().slice(0, 10);

    if (!weekMap[weekKey]) weekMap[weekKey] = { sessions: 0, totalSets: 0 };
    weekMap[weekKey].sessions++;

    const exercises = (data.exercises ?? []) as Array<{ sets?: unknown[] }>;
    for (const ex of exercises) {
      weekMap[weekKey].totalSets += (ex.sets ?? []).length;
    }
  }

  const weeklyVolume = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, val]) => ({ week, ...val }));

  const bodyProgress = bodyLogSnap.docs.map((d) => {
    const data = d.data();
    return { date: data.date, weight: data.weight ?? null };
  });

  // Readiness average (last 7 days)
  let readinessSum = 0;
  let readinessCount = 0;
  for (const doc of readinessSnap.docs) {
    const score = doc.data().score ?? doc.data().overallScore;
    if (typeof score === "number") {
      readinessSum += score;
      readinessCount++;
    }
  }
  const readinessAvg = readinessCount > 0
    ? Math.round((readinessSum / readinessCount) * 10) / 10
    : null;

  // Nutrition: daily average from diary vs target from active plan
  let actual = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const seenDays = new Set<string>();

  for (const doc of diarySnap.docs) {
    const data = doc.data();
    seenDays.add(data.date);
    actual.calories += data.calories ?? 0;
    actual.protein += data.protein ?? 0;
    actual.carbs += data.carbs ?? 0;
    actual.fat += data.fat ?? 0;
  }

  const diaryDayCount = seenDays.size;
  if (diaryDayCount > 0) {
    actual = {
      calories: Math.round(actual.calories / diaryDayCount),
      protein: Math.round(actual.protein / diaryDayCount),
      carbs: Math.round(actual.carbs / diaryDayCount),
      fat: Math.round(actual.fat / diaryDayCount),
    };
  }

  let target = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  if (!assignmentsSnap.empty) {
    const contentDoc = await db
      .collection("client_nutrition_plan_content")
      .doc(assignmentsSnap.docs[0].id)
      .get();
    if (contentDoc.exists) {
      const c = contentDoc.data()!;
      target = {
        calories: c.dailyCalories ?? 0,
        protein: c.dailyProteinG ?? 0,
        carbs: c.dailyCarbsG ?? 0,
        fat: c.dailyFatG ?? 0,
      };
    }
  }

  res.json({
    data: {
      completionRate: sessionsSnap.size,
      trends: { weeklyVolume, bodyProgress, readinessAvg },
      nutritionComparison: { actual, target },
    },
  });
});

export default router;
