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
    .where("creator_id", "==", auth.userId)
    .get();

  const clientsSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .get();

  const clientUserIds = clientsSnap.docs.map((d) => d.data().userId as string);

  interface WeeklyPoint {
    week: string;
    adherence: number;
  }

  interface ProgramAdherence {
    programId: string;
    title: string;
    completedSessions: number;
    totalSessions: number;
    adherence: number;
    weeklyHistory: WeeklyPoint[];
  }

  const byProgram: ProgramAdherence[] = [];
  let totalCompleted = 0;
  let totalExpected = 0;

  // Compute the last 8 week start dates (Monday-based)
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

  for (const programDoc of programsSnap.docs) {
    const programData = programDoc.data();

    // Count sessions by traversing the program's modules subcollections
    const modulesSnap = await db
      .collection("courses")
      .doc(programDoc.id)
      .collection("modules")
      .get();
    let programSessionCount = 0;
    for (const moduleDoc of modulesSnap.docs) {
      const sessionsSnap = await db
        .collection("courses")
        .doc(programDoc.id)
        .collection("modules")
        .doc(moduleDoc.id)
        .collection("sessions")
        .get();
      programSessionCount += sessionsSnap.size;
    }

    // Estimate sessions per week (sessions / modules, min 1)
    const moduleCount = Math.max(1, modulesSnap.size);
    const sessionsPerWeek = Math.max(1, Math.round(programSessionCount / moduleCount));

    let programCompleted = 0;
    // Weekly buckets: count completed sessions per week across all clients
    const weekBuckets: Record<string, number> = {};
    for (const ws of weekStarts) weekBuckets[ws] = 0;

    for (const clientUserId of clientUserIds) {
      const historySnap = await db
        .collection("users")
        .doc(clientUserId)
        .collection("sessionHistory")
        .where("courseId", "==", programDoc.id)
        .get();
      programCompleted += historySnap.size;

      // Bucket recent sessions by week
      for (const histDoc of historySnap.docs) {
        const dateStr = histDoc.data().date as string | undefined;
        if (!dateStr || dateStr < eightWeeksAgoStr) continue;
        const date = new Date(dateStr);
        const dayOfWeek = date.getDay();
        const mondayOff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const weekDate = new Date(date);
        weekDate.setDate(date.getDate() + mondayOff);
        const weekKey = weekDate.toISOString().slice(0, 10);
        if (weekBuckets[weekKey] !== undefined) {
          weekBuckets[weekKey]++;
        }
      }
    }

    // Compute weekly adherence %
    const expectedPerWeek = sessionsPerWeek * Math.max(1, clientUserIds.length);
    const weeklyHistory: WeeklyPoint[] = weekStarts.map((ws) => ({
      week: ws,
      adherence: Math.min(100, Math.round(((weekBuckets[ws] ?? 0) / expectedPerWeek) * 100)),
    }));

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
      weeklyHistory,
    });
  }

  const overallAdherence = totalExpected > 0
    ? Math.round((totalCompleted / totalExpected) * 100)
    : 0;

  // Compute enrollment history: running total of clients by week (last 8 weeks)
  const enrollmentByWeek: Array<{ week: string; clients: number }> = [];
  const clientCreatedDates: string[] = [];
  for (const doc of clientsSnap.docs) {
    const data = doc.data();
    let createdStr: string | null = null;
    if (data.created_at?.toDate) {
      createdStr = data.created_at.toDate().toISOString().slice(0, 10);
    } else if (typeof data.created_at === "string") {
      createdStr = data.created_at.slice(0, 10);
    }
    if (createdStr) clientCreatedDates.push(createdStr);
  }
  clientCreatedDates.sort();

  for (const ws of weekStarts) {
    // Count clients created on or before end of this week (ws + 6 days)
    const weekEnd = new Date(ws);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const count = clientCreatedDates.filter((d) => d <= weekEndStr).length;
    enrollmentByWeek.push({ week: ws, clients: count });
  }

  res.json({
    data: { overallAdherence, byProgram, enrollmentHistory: enrollmentByWeek },
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

// GET /analytics/client-activity
router.get("/analytics/client-activity", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const clientsSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .get();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  interface ClientActivity {
    userId: string;
    displayName: string;
    lastSessionDate: string | null;
    sessionsThisWeek: number;
    status: "active" | "inactive" | "ghost";
  }

  const clients: ClientActivity[] = [];

  for (const doc of clientsSnap.docs) {
    const data = doc.data();
    const userId = data.userId as string;
    const displayName = (data.clientName ?? data.displayName ?? "Cliente") as string;

    const historySnap = await db
      .collection("users")
      .doc(userId)
      .collection("sessionHistory")
      .where("date", ">=", sevenDaysAgoStr)
      .where("date", "<=", todayStr)
      .get();

    const sessionsThisWeek = historySnap.size;
    let lastSessionDate: string | null = null;

    if (sessionsThisWeek > 0) {
      const dates = historySnap.docs.map(d => d.data().date as string).sort().reverse();
      lastSessionDate = dates[0];
    } else {
      // Check last 30 days for ghost detection
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const recentSnap = await db
        .collection("users")
        .doc(userId)
        .collection("sessionHistory")
        .where("date", ">=", thirtyDaysAgo.toISOString().slice(0, 10))
        .orderBy("date", "desc")
        .limit(1)
        .get();
      if (!recentSnap.empty) {
        lastSessionDate = recentSnap.docs[0].data().date as string;
      }
    }

    let status: "active" | "inactive" | "ghost" = "ghost";
    if (sessionsThisWeek > 0) {
      status = "active";
    } else if (lastSessionDate) {
      const lastDate = new Date(lastSessionDate);
      const daysSince = (now.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000);
      status = daysSince <= 14 ? "inactive" : "ghost";
    }

    clients.push({ userId, displayName, lastSessionDate, sessionsThisWeek, status });
  }

  // Sort: active first, then inactive, then ghost
  const order = { active: 0, inactive: 1, ghost: 2 };
  clients.sort((a, b) => order[a.status] - order[b.status] || b.sessionsThisWeek - a.sessionsThisWeek);

  const activeCount = clients.filter(c => c.status === "active").length;
  const inactiveCount = clients.filter(c => c.status === "inactive").length;
  const ghostCount = clients.filter(c => c.status === "ghost").length;

  res.json({
    data: { clients, summary: { activeCount, inactiveCount, ghostCount, total: clients.length } },
  });
});

// GET /analytics/client-trend
router.get("/analytics/client-trend", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const clientsSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .get();

  // Group by month of enrollment
  const months: Record<string, number> = {};
  let cumulative = 0;

  const entries = clientsSnap.docs.map(d => {
    const data = d.data();
    const createdAt = data.created_at ?? data.createdAt ?? data.enrolledAt;
    let dateStr: string;
    if (createdAt && typeof createdAt.toDate === "function") {
      dateStr = createdAt.toDate().toISOString().slice(0, 7);
    } else if (typeof createdAt === "string") {
      dateStr = createdAt.slice(0, 7);
    } else {
      dateStr = "unknown";
    }
    return dateStr;
  }).filter(d => d !== "unknown").sort();

  for (const month of entries) {
    months[month] = (months[month] ?? 0) + 1;
  }

  const trend = Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => {
      cumulative += count;
      return { month, newClients: count, totalClients: cumulative };
    });

  // Programs sold: low_ticket courses
  const paymentsSnap = await db
    .collection("processed_payments")
    .where("creatorId", "==", auth.userId)
    .get();

  const programSales: Record<string, number> = {};
  let totalOneOnOne = clientsSnap.size;

  for (const doc of paymentsSnap.docs) {
    const data = doc.data();
    if (data.status !== "approved" && data.status !== "completed") continue;
    const createdAt = data.created_at ?? data.createdAt ?? data.paidAt;
    let monthStr: string;
    if (createdAt && typeof createdAt.toDate === "function") {
      monthStr = createdAt.toDate().toISOString().slice(0, 7);
    } else if (typeof createdAt === "string") {
      monthStr = createdAt.slice(0, 7);
    } else {
      continue;
    }
    programSales[monthStr] = (programSales[monthStr] ?? 0) + 1;
  }

  const salesTrend = Object.entries(programSales)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, programsSold: count }));

  res.json({
    data: { clientTrend: trend, salesTrend, totalOneOnOne, totalProgramsSold: paymentsSnap.size },
  });
});

// GET /analytics/revenue-trend
router.get("/analytics/revenue-trend", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const paymentsSnap = await db
    .collection("processed_payments")
    .where("creatorId", "==", auth.userId)
    .get();

  const months: Record<string, { gross: number; count: number }> = {};

  for (const doc of paymentsSnap.docs) {
    const data = doc.data();
    if (data.status !== "approved" && data.status !== "completed") continue;

    const createdAt = data.created_at ?? data.createdAt ?? data.paidAt;
    let monthStr: string;
    if (createdAt && typeof createdAt.toDate === "function") {
      monthStr = createdAt.toDate().toISOString().slice(0, 7);
    } else if (typeof createdAt === "string") {
      monthStr = createdAt.slice(0, 7);
    } else {
      continue;
    }

    if (!months[monthStr]) months[monthStr] = { gross: 0, count: 0 };
    months[monthStr].gross += data.amount ?? 0;
    months[monthStr].count++;
  }

  const trend = Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, val]) => ({
      month,
      gross: val.gross,
      net: Math.round(val.gross * (1 - WAKE_CUT_PERCENT / 100)),
      sales: val.count,
    }));

  res.json({ data: { trend } });
});

// GET /analytics/expiring-access
router.get("/analytics/expiring-access", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const coursesSnap = await db
    .collection("courses")
    .where("creator_id", "==", auth.userId)
    .get();

  const courseIds = new Set(coursesSnap.docs.map(d => d.id));
  if (courseIds.size === 0) {
    res.json({ data: { expiring: [], count: 0 } });
    return;
  }

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Get all users who have these courses
  // We need to check users.courses map for expiring entries
  // Since we can't query inside maps efficiently, get clients first
  const clientsSnap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", auth.userId)
    .get();

  const clientUserIds = clientsSnap.docs.map(d => d.data().userId as string);

  interface ExpiringAccess {
    userId: string;
    displayName: string;
    courseId: string;
    courseTitle: string;
    expiresAt: string;
    daysLeft: number;
  }

  const expiring: ExpiringAccess[] = [];

  // Batch check users (Firestore in limits of 30)
  const batchSize = 30;
  for (let i = 0; i < clientUserIds.length; i += batchSize) {
    const batch = clientUserIds.slice(i, i + batchSize);
    const userDocs = await Promise.all(
      batch.map(uid => db.collection("users").doc(uid).get())
    );

    for (const userDoc of userDocs) {
      if (!userDoc.exists) continue;
      const userData = userDoc.data()!;
      const courses = userData.courses as Record<string, {
        status?: string;
        expires_at?: string;
        title?: string;
      }> | undefined;

      if (!courses) continue;

      for (const [courseId, courseData] of Object.entries(courses)) {
        if (!courseIds.has(courseId)) continue;
        if (courseData.status !== "active") continue;
        if (!courseData.expires_at) continue;

        const expiresAt = new Date(courseData.expires_at);
        if (expiresAt <= thirtyDaysFromNow && expiresAt > now) {
          const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          expiring.push({
            userId: userDoc.id,
            displayName: userData.displayName ?? userData.email ?? "Cliente",
            courseId,
            courseTitle: courseData.title ?? "",
            expiresAt: courseData.expires_at,
            daysLeft,
          });
        }
      }
    }
  }

  expiring.sort((a, b) => a.daysLeft - b.daysLeft);

  res.json({ data: { expiring, count: expiring.length } });
});

// GET /analytics/calendar-preview
router.get("/analytics/calendar-preview", async (req, res) => {
  const auth = await validateAuth(req);
  requireCreator(auth);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

  // Get today's and tomorrow's bookings
  const bookingsSnap = await db
    .collection("call_bookings")
    .where("creatorId", "==", auth.userId)
    .where("date", ">=", todayStr)
    .where("date", "<=", tomorrowStr)
    .orderBy("date", "asc")
    .get();

  interface CalendarEvent {
    id: string;
    clientName: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    isToday: boolean;
  }

  const events: CalendarEvent[] = bookingsSnap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      clientName: (data.clientName ?? data.displayName ?? "Cliente") as string,
      date: data.date as string,
      startTime: (data.startTime ?? data.slotStart ?? "") as string,
      endTime: (data.endTime ?? data.slotEnd ?? "") as string,
      status: (data.status ?? "confirmed") as string,
      isToday: data.date === todayStr,
    };
  });

  // Sort by time within each day
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  res.json({
    data: {
      today: events.filter(e => e.isToday),
      tomorrow: events.filter(e => !e.isToday),
    },
  });
});

export default router;
