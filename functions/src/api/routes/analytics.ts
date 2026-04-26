import {Router} from "express";
import * as admin from "firebase-admin";
import {validateAuthAndRateLimit} from "../middleware/auth.js";
import {validateDateFormat} from "../middleware/validate.js";
import {WakeApiServerError} from "../errors.js";

const router = Router();
const db = admin.firestore();

// GET /analytics/weekly-volume
router.get("/analytics/weekly-volume", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

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

  res.json({data: result});
});

// GET /analytics/muscle-breakdown
router.get("/analytics/muscle-breakdown", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);

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
      period: {startDate, endDate},
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

function pickNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && !Number.isNaN(v)) return v;
  }
  return null;
}

// Module-scoped signed-URL cache. Persists across requests on a warm function
// instance, so repeated client-lab calls within ~50min skip Storage round
// trips entirely. Keyed by storagePath.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_CACHE_TTL_MS = 50 * 60 * 1000;

async function getCachedSignedUrl(
  bucket: ReturnType<typeof admin.storage>["bucket"] extends () => infer B ? B : never,
  storagePath: string
): Promise<string | null> {
  const now = Date.now();
  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.expiresAt > now + 60_000) return cached.url;
  try {
    const [url] = await bucket.file(storagePath).getSignedUrl({
      version: "v4",
      action: "read",
      expires: now + 60 * 60 * 1000, // 1h actual TTL on the URL
    });
    signedUrlCache.set(storagePath, {url, expiresAt: now + SIGNED_URL_CACHE_TTL_MS});
    return url;
  } catch {
    return null;
  }
}

async function verifyCreatorOwnsClient(
  creatorId: string,
  clientId: string
): Promise<void> {
  const snap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", creatorId)
    .where("clientUserId", "==", clientId)
    .limit(1)
    .get();
  if (snap.empty) {
    throw new WakeApiServerError("FORBIDDEN", 403, "No tienes acceso a este cliente");
  }
}

// ─── Shared data helpers with 30s in-memory cache ─────────────────────────
// Avoids duplicate Firestore queries when multiple analytics endpoints
// (or the batch /analytics/dashboard) run within the same request window.

type CachedSnap = { snap: FirebaseFirestore.QuerySnapshot; expiresAt: number };
type CachedDocs = { docs: FirebaseFirestore.QueryDocumentSnapshot[]; expiresAt: number };

const coursesCache = new Map<string, CachedSnap>();
const clientsCache = new Map<string, CachedSnap>();
const paymentsCache = new Map<string, CachedDocs>();

async function getCreatorCourses(creatorId: string): Promise<FirebaseFirestore.QuerySnapshot> {
  const cached = coursesCache.get(creatorId);
  if (cached && Date.now() < cached.expiresAt) return cached.snap;

  const snap = await db
    .collection("courses")
    .where("creator_id", "==", creatorId)
    .get();

  coursesCache.set(creatorId, {snap, expiresAt: Date.now() + 30_000});
  return snap;
}

async function getCreatorClients(creatorId: string): Promise<FirebaseFirestore.QuerySnapshot> {
  const cached = clientsCache.get(creatorId);
  if (cached && Date.now() < cached.expiresAt) return cached.snap;

  const snap = await db
    .collection("one_on_one_clients")
    .where("creatorId", "==", creatorId)
    .get();

  clientsCache.set(creatorId, {snap, expiresAt: Date.now() + 30_000});
  return snap;
}

async function getCreatorPayments(creatorId: string) {
  const cached = paymentsCache.get(creatorId);
  if (cached && Date.now() < cached.expiresAt) return cached.docs;

  const coursesSnap = await getCreatorCourses(creatorId);
  const courseIds = coursesSnap.docs.map((d) => d.id);
  if (courseIds.length === 0) return [];

  // Firestore 'in' supports max 30 values; batch if needed
  const allDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let i = 0; i < courseIds.length; i += 30) {
    const batch = courseIds.slice(i, i + 30);
    const snap = await db
      .collection("processed_payments")
      .where("courseId", "in", batch)
      .get();
    allDocs.push(...snap.docs);
  }

  paymentsCache.set(creatorId, {docs: allDocs, expiresAt: Date.now() + 30_000});
  return allDocs;
}

// ─── Computation functions (used by individual endpoints + batch) ──────────

function computeRevenue(
  paymentDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  clientsSnap: FirebaseFirestore.QuerySnapshot,
  callsSnap: FirebaseFirestore.QuerySnapshot,
) {
  let salesCount = 0;
  let grossRevenue = 0;

  for (const doc of paymentDocs) {
    const data = doc.data();
    if (data.status === "approved" || data.status === "completed") {
      salesCount++;
      grossRevenue += data.amount ?? 0;
    }
  }

  const netRevenue = Math.round(grossRevenue * (1 - WAKE_CUT_PERCENT / 100));

  return {
    lowTicket: {salesCount, grossRevenue, netRevenue},
    oneOnOne: {clientCount: clientsSnap.size, callCount: callsSnap.size},
  };
}

function computeRevenueTrend(paymentDocs: FirebaseFirestore.QueryDocumentSnapshot[], courseId?: string) {
  const months: Record<string, { gross: number; count: number }> = {};

  for (const doc of paymentDocs) {
    const data = doc.data();
    if (data.status !== "approved" && data.status !== "completed") continue;
    if (courseId && data.courseId !== courseId) continue;

    const createdAt = data.processed_at ?? data.created_at ?? data.createdAt ?? data.paidAt;
    let monthStr: string;
    if (createdAt && typeof createdAt.toDate === "function") {
      monthStr = createdAt.toDate().toISOString().slice(0, 7);
    } else if (typeof createdAt === "string") {
      monthStr = createdAt.slice(0, 7);
    } else {
      continue;
    }

    if (!months[monthStr]) months[monthStr] = {gross: 0, count: 0};
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

  return {trend};
}

function computeClientTrend(
  clientsSnap: FirebaseFirestore.QuerySnapshot,
  paymentDocs: FirebaseFirestore.QueryDocumentSnapshot[],
) {
  const months: Record<string, number> = {};
  let cumulative = 0;

  const entries = clientsSnap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.processed_at ?? data.created_at ?? data.createdAt ?? data.enrolledAt;
    let dateStr: string;
    if (createdAt && typeof createdAt.toDate === "function") {
      dateStr = createdAt.toDate().toISOString().slice(0, 7);
    } else if (typeof createdAt === "string") {
      dateStr = createdAt.slice(0, 7);
    } else {
      dateStr = "unknown";
    }
    return dateStr;
  }).filter((d) => d !== "unknown").sort();

  for (const month of entries) {
    months[month] = (months[month] ?? 0) + 1;
  }

  const clientTrend = Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => {
      cumulative += count;
      return {month, newClients: count, totalClients: cumulative};
    });

  const programSales: Record<string, number> = {};
  for (const doc of paymentDocs) {
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
    .map(([month, count]) => ({month, programsSold: count}));

  return {clientTrend, salesTrend, totalOneOnOne: clientsSnap.size, totalProgramsSold: paymentDocs.length};
}

async function computeClientActivity(clientsSnap: FirebaseFirestore.QuerySnapshot) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  interface ClientActivity {
    userId: string;
    displayName: string;
    lastSessionDate: string | null;
    sessionsThisWeek: number;
    status: "active" | "inactive" | "ghost";
  }

  const clientResults = await Promise.all(
    clientsSnap.docs.map(async (doc): Promise<ClientActivity | null> => {
      const data = doc.data();
      const userId = data.userId as string;
      if (!userId) return null;
      const displayName = (data.clientName ?? data.displayName ?? "Cliente") as string;

      const historySnap = await db
        .collection("users").doc(userId)
        .collection("sessionHistory")
        .where("date", ">=", sevenDaysAgoStr)
        .where("date", "<=", todayStr)
        .get();

      const sessionsThisWeek = historySnap.size;
      let lastSessionDate: string | null = null;

      if (sessionsThisWeek > 0) {
        const dates = historySnap.docs.map((d) => d.data().date as string).sort().reverse();
        lastSessionDate = dates[0];
      } else {
        const recentSnap = await db
          .collection("users").doc(userId)
          .collection("sessionHistory")
          .where("date", ">=", thirtyDaysAgoStr)
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
        const daysSince = (now.getTime() - new Date(lastSessionDate).getTime()) / (24 * 60 * 60 * 1000);
        status = daysSince <= 14 ? "inactive" : "ghost";
      }

      return {userId, displayName, lastSessionDate, sessionsThisWeek, status};
    })
  );
  const clients = clientResults.filter((c): c is ClientActivity => c !== null);

  const order = {active: 0, inactive: 1, ghost: 2};
  clients.sort((a, b) => order[a.status] - order[b.status] || b.sessionsThisWeek - a.sessionsThisWeek);

  const activeCount = clients.filter((c) => c.status === "active").length;
  const inactiveCount = clients.filter((c) => c.status === "inactive").length;
  const ghostCount = clients.filter((c) => c.status === "ghost").length;

  return {clients, summary: {activeCount, inactiveCount, ghostCount, total: clients.length}};
}

async function computeAdherence(
  coursesSnap: FirebaseFirestore.QuerySnapshot,
  clientsSnap: FirebaseFirestore.QuerySnapshot,
  programIdFilter?: string,
) {
  const programDocs = programIdFilter ?
    coursesSnap.docs.filter((d) => d.id === programIdFilter) :
    coursesSnap.docs;

  const clientUserIds = clientsSnap.docs.map((d) => (d.data().clientUserId ?? d.data().userId) as string);

  interface WeeklyPoint { week: string; workoutAdherence: number; nutritionAdherence: number | null }
  interface ProgramAdherence {
    programId: string; title: string;
    completedSessions: number; totalSessions: number;
    workoutAdherence: number; nutritionAdherence: number | null;
    weeklyHistory: WeeklyPoint[];
  }

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

  const byProgram: ProgramAdherence[] = await Promise.all(
    programDocs.map(async (programDoc) => {
      const programData = programDoc.data()!;
      const modulesSnap = await db.collection("courses").doc(programDoc.id).collection("modules").get();
      const sessionCounts = await Promise.all(
        modulesSnap.docs.map((moduleDoc) =>
          db.collection("courses").doc(programDoc.id)
            .collection("modules").doc(moduleDoc.id)
            .collection("sessions").get()
            .then((s) => s.size)
        )
      );
      const programSessionCount = sessionCounts.reduce((a, b) => a + b, 0);
      const moduleCount = Math.max(1, modulesSnap.size);
      const sessionsPerWeek = Math.max(1, Math.round(programSessionCount / moduleCount));

      const weekBuckets: Record<string, number> = {};
      for (const ws of weekStarts) weekBuckets[ws] = 0;

      const historyResults = await Promise.all(
        clientUserIds.map((uid) =>
          db.collection("users").doc(uid)
            .collection("sessionHistory")
            .where("courseId", "==", programDoc.id)
            .get()
        )
      );

      let programCompleted = 0;
      for (const historySnap of historyResults) {
        programCompleted += historySnap.size;
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

      const expectedPerWeek = sessionsPerWeek * Math.max(1, clientUserIds.length);

      const expectedTotal = programSessionCount * clientUserIds.length;
      const workoutAdh = expectedTotal > 0 ?
        Math.min(100, Math.round((programCompleted / expectedTotal) * 100)) : 0;

      // ── Nutrition adherence per program ──
      // Check each client's nutrition targets + diary for this period
      let nutrDaysWithin = 0;
      let nutrDaysTotal = 0;
      let hasAnyNutritionPlan = false;

      await Promise.all(clientUserIds.map(async (uid) => {
        // Find active nutrition assignment from this creator
        const assignSnap = await db.collection("nutrition_assignments")
          .where("userId", "==", uid)
          .where("status", "==", "active")
          .limit(1).get();
        if (assignSnap.empty) return;

        const assignDoc = assignSnap.docs[0];
        const contentDoc = await db.collection("client_nutrition_plan_content").doc(assignDoc.id).get();
        if (!contentDoc.exists) return;

        const c = contentDoc.data()!;
        const tCalories = (c.daily_calories ?? 0) as number;
        const tProtein = (c.daily_protein_g ?? 0) as number;
        if (tCalories <= 0 && tProtein <= 0) return;

        hasAnyNutritionPlan = true;

        const diarySnap = await db.collection("users").doc(uid).collection("diary")
          .where("date", ">=", eightWeeksAgoStr).get();

        const dailyTotals: Record<string, { calories: number; protein: number }> = {};
        for (const dd of diarySnap.docs) {
          const d = dd.data();
          if (!dailyTotals[d.date]) dailyTotals[d.date] = {calories: 0, protein: 0};
          dailyTotals[d.date].calories += d.calories ?? 0;
          dailyTotals[d.date].protein += d.protein ?? 0;
        }

        for (const n of Object.values(dailyTotals)) {
          nutrDaysTotal++;
          const calOk = tCalories <= 0 || (n.calories / tCalories >= 0.8 && n.calories / tCalories <= 1.2);
          const proOk = tProtein <= 0 || (n.protein / tProtein >= 0.8 && n.protein / tProtein <= 1.2);
          if (calOk && proOk) nutrDaysWithin++;
        }
      }));

      const programNutrAdherence = hasAnyNutritionPlan && nutrDaysTotal > 0 ?
        Math.round((nutrDaysWithin / nutrDaysTotal) * 100) :
        null;

      // Weekly workout adherence
      const weeklyHistory: WeeklyPoint[] = weekStarts.map((ws) => ({
        week: ws,
        workoutAdherence: Math.min(100, Math.round(((weekBuckets[ws] ?? 0) / expectedPerWeek) * 100)),
        nutritionAdherence: programNutrAdherence,
      }));

      return {
        programId: programDoc.id,
        title: (programData.title as string) ?? "",
        completedSessions: programCompleted,
        totalSessions: expectedTotal,
        workoutAdherence: workoutAdh,
        nutritionAdherence: programNutrAdherence,
        weeklyHistory,
      };
    })
  );

  let totalCompleted = 0;
  let totalExpected = 0;
  let nutrSum = 0;
  let nutrCount = 0;
  for (const p of byProgram) {
    totalCompleted += p.completedSessions;
    totalExpected += p.totalSessions;
    if (p.nutritionAdherence != null) {
      nutrSum += p.nutritionAdherence;
      nutrCount++;
    }
  }
  const overallWorkoutAdherence = totalExpected > 0 ?
    Math.round((totalCompleted / totalExpected) * 100) : 0;
  const overallNutritionAdherence = nutrCount > 0 ? Math.round(nutrSum / nutrCount) : null;

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

  const enrollmentByWeek: Array<{ week: string; clients: number }> = [];
  for (const ws of weekStarts) {
    const weekEnd = new Date(ws);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const count = clientCreatedDates.filter((d) => d <= weekEndStr).length;
    enrollmentByWeek.push({week: ws, clients: count});
  }

  return {overallWorkoutAdherence, overallNutritionAdherence, byProgram, enrollmentHistory: enrollmentByWeek};
}

async function computeExpiringAccess(
  coursesSnap: FirebaseFirestore.QuerySnapshot,
  clientsSnap: FirebaseFirestore.QuerySnapshot,
) {
  const courseIds = new Set(coursesSnap.docs.map((d) => d.id));
  if (courseIds.size === 0) return {expiring: [], count: 0};

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const clientUserIds = clientsSnap.docs.map((d) => (d.data().clientUserId ?? d.data().userId) as string);

  interface ExpiringAccess {
    userId: string; displayName: string; courseId: string;
    courseTitle: string; expiresAt: string; daysLeft: number;
  }
  const expiring: ExpiringAccess[] = [];

  const batchSize = 30;
  for (let i = 0; i < clientUserIds.length; i += batchSize) {
    const batch = clientUserIds.slice(i, i + batchSize);
    const userDocs = await Promise.all(
      batch.map((uid) => db.collection("users").doc(uid).get())
    );

    for (const userDoc of userDocs) {
      if (!userDoc.exists) continue;
      const userData = userDoc.data()!;
      const courses = userData.courses as Record<string, {
        status?: string; expires_at?: string; title?: string;
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
  return {expiring, count: expiring.length};
}

async function computeCalendarPreview(creatorId: string) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const dayAfterTomorrow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const todayStart = `${todayStr}T00:00:00.000Z`;
  const dayAfterTomorrowStart = `${dayAfterTomorrow.toISOString().slice(0, 10)}T00:00:00.000Z`;

  const bookingsSnap = await db
    .collection("call_bookings")
    .where("creatorId", "==", creatorId)
    .where("slotStartUtc", ">=", todayStart)
    .where("slotStartUtc", "<", dayAfterTomorrowStart)
    .orderBy("slotStartUtc", "asc")
    .get();

  const events = bookingsSnap.docs.map((doc) => {
    const data = doc.data();
    const slotDate = (data.slotStartUtc as string).slice(0, 10);
    return {
      id: doc.id,
      clientName: (data.clientDisplayName ?? data.clientName ?? "Cliente") as string,
      date: slotDate,
      startTime: (data.slotStartUtc ?? "") as string,
      endTime: (data.slotEndUtc ?? "") as string,
      status: (data.status ?? "scheduled") as string,
      isToday: slotDate === todayStr,
    };
  });

  return {
    today: events.filter((e) => e.isToday),
    tomorrow: events.filter((e) => !e.isToday),
  };
}

// ─── Individual endpoints (now delegating to compute functions) ───────────

// GET /analytics/revenue
router.get("/analytics/revenue", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const [paymentDocs, clientsSnap, callsSnap] = await Promise.all([
    getCreatorPayments(auth.userId),
    getCreatorClients(auth.userId),
    db.collection("call_bookings").where("creatorId", "==", auth.userId).get(),
  ]);

  res.json({data: computeRevenue(paymentDocs, clientsSnap, callsSnap)});
});

// GET /analytics/adherence
router.get("/analytics/adherence", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const programIdFilter = req.query.programId as string | undefined;

  const [coursesSnap, clientsSnap] = await Promise.all([
    programIdFilter ?
      db.collection("courses").doc(programIdFilter).get().then((doc) => {
        if (!doc.exists || doc.data()?.creator_id !== auth.userId) {
          return {docs: [] as FirebaseFirestore.QueryDocumentSnapshot[]} as unknown as FirebaseFirestore.QuerySnapshot;
        }
        return {docs: [doc]} as unknown as FirebaseFirestore.QuerySnapshot;
      }) :
      getCreatorCourses(auth.userId),
    getCreatorClients(auth.userId),
  ]);

  res.json({data: await computeAdherence(coursesSnap, clientsSnap, programIdFilter)});
});

// GET /analytics/client/:clientId/lab
router.get("/analytics/client/:clientId/lab", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const clientId = req.params.clientId;
  await verifyCreatorOwnsClient(auth.userId, clientId);

  // Parse range parameter (7d, 30d, 90d)
  const rangeParam = (req.query.range as string) || "30d";
  const rangeDays = rangeParam === "7d" ? 7 : rangeParam === "90d" ? 90 : 30;
  const isSummary = req.query.fields === "summary";

  const now = new Date();
  const rangeAgo = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  const rangeAgoStr = rangeAgo.toISOString().slice(0, 10);
  const nowStr = now.toISOString().slice(0, 10);

  // Core queries (always needed)
  const coreQueries = [
    db.collection("users").doc(clientId).collection("sessionHistory")
      .where("date", ">=", rangeAgoStr).orderBy("date", "desc").get(),
    // Body log: two parallel reads merged in memory.
    //   1. Recent dated entries via `orderBy("date","desc").limit(60)` —
    //      cheap and indexed (single-field on `date`, auto-maintained).
    //   2. Up to 60 docs without filter to catch photo-only entries that
    //      historically didn't write a `date` field — `orderBy("date")`
    //      silently filters those out.
    // Hard ceiling: ~120 reads regardless of how long the client has been
    // logging. Was unbounded.
    db.collection("users").doc(clientId).collection("bodyLog")
      .orderBy("date", "desc").limit(60).get(),
    db.collection("users").doc(clientId).collection("bodyLog")
      .limit(60).get(),
    db.collection("users").doc(clientId).collection("readiness")
      .where("date", ">=", rangeAgoStr).orderBy("date", "desc").get(),
    db.collection("nutrition_assignments")
      .where("userId", "==", clientId)
      .where("assignedBy", "==", auth.userId)
      .limit(5).get(),
  ];

  // Expensive queries (skipped in summary mode)
  const expensiveQueries = isSummary ?
    [Promise.resolve(null), Promise.resolve(null), Promise.resolve(null)] :
    [
      db.collection("users").doc(clientId).collection("diary")
        .where("date", ">=", rangeAgoStr).where("date", "<=", nowStr).limit(300).get(),
      db.collection("users").doc(clientId).collection("exerciseHistory")
        .limit(50).get(),
      // Name lookup: history docs only carry { sessions, updated_at } —
      // exerciseName lives on exerciseLastPerformance, keyed by the same id.
      db.collection("users").doc(clientId).collection("exerciseLastPerformance")
        .limit(50).get(),
    ];

  const [
    sessionsSnap, bodyLogDatedSnap, bodyLogUnsortedSnap,
    readinessSnap, assignmentsSnap,
    diarySnapOrNull, exerciseHistSnapOrNull, lastPerfSnapOrNull,
  ] = await Promise.all([...coreQueries, ...expensiveQueries]) as [
    FirebaseFirestore.QuerySnapshot, FirebaseFirestore.QuerySnapshot, FirebaseFirestore.QuerySnapshot,
    FirebaseFirestore.QuerySnapshot, FirebaseFirestore.QuerySnapshot,
    FirebaseFirestore.QuerySnapshot | null, FirebaseFirestore.QuerySnapshot | null,
    FirebaseFirestore.QuerySnapshot | null,
  ];

  // Merge the two body-log reads, dedupe by doc id.
  const bodyLogDocsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of bodyLogDatedSnap.docs) bodyLogDocsById.set(d.id, d);
  for (const d of bodyLogUnsortedSnap.docs) {
    if (!bodyLogDocsById.has(d.id)) bodyLogDocsById.set(d.id, d);
  }
  const bodyLogDocs = Array.from(bodyLogDocsById.values());
  const diarySnap = diarySnapOrNull;
  const exerciseHistSnap = exerciseHistSnapOrNull;
  const lastPerfSnap = lastPerfSnapOrNull;

  // ── Weekly volume (last 8 weeks) ─────────────────────────────
  const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000);
  const weekMap: Record<string, { sessions: number; totalSets: number; daysTrained: Set<string> }> = {};

  // ── RPE accumulator ──────────────────────────────────────────
  let rpeSum = 0;
  let rpeCount = 0;
  const rpeTrend: Array<{ date: string; value: number }> = [];

  // ── Volume by muscle group ───────────────────────────────────
  const muscleVolume: Record<string, number> = {};
  const muscleVolumeByWeek: Record<string, Record<string, number>> = {};

  // First pass: collect every libraryId referenced by the session exercises
  // and by the lastPerformance docs, so we can hydrate muscle_activation +
  // displayName from `exercises_library`. Without this, post-migration sessions
  // that only carry `{exerciseId, libraryId}` produce zero volume and PR cards
  // show "Ejercicio" because the legacy code looked at inline `primaryMuscles`.
  const libIdsNeeded = new Set<string>();
  for (const doc of sessionsSnap.docs) {
    const exs = (doc.data()?.exercises ?? []) as Array<{ libraryId?: string }>;
    for (const ex of exs) {
      if (typeof ex?.libraryId === "string" && ex.libraryId) libIdsNeeded.add(ex.libraryId);
    }
  }
  for (const doc of (lastPerfSnap?.docs ?? [])) {
    const lib = doc.data()?.libraryId;
    if (typeof lib === "string" && lib) libIdsNeeded.add(lib);
  }
  const libIdsArr = Array.from(libIdsNeeded).slice(0, 30);
  // db.getAll() batches all reads into a single Firestore RPC, vs. one round
  // trip per doc with Promise.all(...get()).
  const libDocs = libIdsArr.length > 0 ?
    await db.getAll(...libIdsArr.map((id) => db.collection("exercises_library").doc(id))) :
    [];
  const libMap: Record<string, Record<string, unknown>> = {};
  for (const d of libDocs) {
    if (d.exists) libMap[d.id] = d.data() ?? {};
  }

  // Helper: resolve { displayName, muscle_activation } for an exercise from the
  // library map. Supports both the post-migration (`exercises.{id}`) and the
  // legacy (top-level keyed by name) library shapes.
  const resolveExerciseMeta = (
    libraryId?: string,
    exerciseId?: string,
    name?: string
  ): { displayName: string | null; muscle_activation: Record<string, number> | null } => {
    if (!libraryId || !libMap[libraryId]) return {displayName: null, muscle_activation: null};
    const lib = libMap[libraryId];
    const exercisesMap = (lib.exercises as Record<string, Record<string, unknown>> | undefined) ?? {};
    const fromId = exerciseId ? exercisesMap[exerciseId] : undefined;
    const fromName = name ? (exercisesMap[name] ?? (lib[name] as Record<string, unknown> | undefined)) : undefined;
    const meta = fromId ?? fromName;
    if (!meta) return {displayName: null, muscle_activation: null};
    const displayName = (meta.displayName as string | undefined) ??
      (meta.name as string | undefined) ??
      null;
    const rawAct = meta.muscle_activation as Record<string, unknown> | undefined;
    let activation: Record<string, number> | null = null;
    if (rawAct && typeof rawAct === "object") {
      activation = {};
      for (const [k, v] of Object.entries(rawAct)) {
        const n = typeof v === "number" ? v : parseFloat(String(v));
        if (Number.isFinite(n) && n > 0) activation[k.toLowerCase()] = n;
      }
    }
    return {displayName, muscle_activation: activation};
  };

  for (const doc of sessionsSnap.docs) {
    const data = doc.data();
    const date = new Date(data.date);

    // RPE
    const sessionRpe = data.rpe ?? data.averageRpe;
    if (typeof sessionRpe === "number" && sessionRpe > 0) {
      rpeSum += sessionRpe;
      rpeCount++;
      rpeTrend.push({date: data.date, value: sessionRpe});
    }

    // Weekly volume
    if (date >= eightWeeksAgo) {
      const day = date.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() + mondayOffset);
      const weekKey = weekStart.toISOString().slice(0, 10);

      if (!weekMap[weekKey]) weekMap[weekKey] = {sessions: 0, totalSets: 0, daysTrained: new Set()};
      weekMap[weekKey].sessions++;
      weekMap[weekKey].daysTrained.add(data.date);

      const exercises = (data.exercises ?? []) as Array<{
        sets?: unknown[];
        primaryMuscles?: string[];
        muscleGroup?: string;
        muscle_activation?: Record<string, number | string>;
        name?: string;
        exerciseName?: string;
        exerciseId?: string;
        libraryId?: string;
      }>;
      for (const ex of exercises) {
        const setCount = (ex.sets ?? []).length;
        weekMap[weekKey].totalSets += setCount;

        // Resolve activation: inline first, library fallback.
        let activation: Record<string, number> | null = null;
        if (ex.muscle_activation && typeof ex.muscle_activation === "object") {
          activation = {};
          for (const [k, v] of Object.entries(ex.muscle_activation)) {
            const n = typeof v === "number" ? v : parseFloat(String(v));
            if (Number.isFinite(n) && n > 0) activation[k.toLowerCase()] = n;
          }
          if (Object.keys(activation).length === 0) activation = null;
        }
        if (!activation) {
          const meta = resolveExerciseMeta(ex.libraryId, ex.exerciseId, ex.exerciseName ?? ex.name);
          activation = meta.muscle_activation;
        }

        if (activation) {
          // Activation map: distribute set count by muscle %.
          for (const [muscle, pct] of Object.entries(activation)) {
            const contribution = setCount * (pct / 100);
            muscleVolume[muscle] = (muscleVolume[muscle] ?? 0) + contribution;
            if (!muscleVolumeByWeek[weekKey]) muscleVolumeByWeek[weekKey] = {};
            muscleVolumeByWeek[weekKey][muscle] =
              (muscleVolumeByWeek[weekKey][muscle] ?? 0) + contribution;
          }
        } else {
          // Legacy fallback: flat primaryMuscles list, full set count per muscle.
          const muscles = ex.primaryMuscles ?? (ex.muscleGroup ? [ex.muscleGroup] : []);
          for (const m of muscles) {
            const normalized = m.toLowerCase();
            muscleVolume[normalized] = (muscleVolume[normalized] ?? 0) + setCount;
            if (!muscleVolumeByWeek[weekKey]) muscleVolumeByWeek[weekKey] = {};
            muscleVolumeByWeek[weekKey][normalized] =
              (muscleVolumeByWeek[weekKey][normalized] ?? 0) + setCount;
          }
        }
      }
    }
  }

  const weeklyVolume = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, val]) => ({week, sessions: val.sessions, totalSets: val.totalSets}));

  // ── Adherence heatmap (days trained per week) ────────────────
  const adherenceHeatmap = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, val]) => {
      const ws = new Date(weekStart);
      const days: boolean[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        days.push(val.daysTrained.has(d.toISOString().slice(0, 10)));
      }
      return {weekStart, days};
    });

  // ── Workout adherence ────────────────────────────────────────
  // Frequency-based metric: % of a 4-day/week target. We dropped the planned-
  // vs-completed walk over courses/modules/sessions — it cost up to ~80
  // sequential reads per request and rarely produced a usable number for
  // clients on plans/one-on-one programs anyway. If you ever want a planned
  // schedule again, denormalize `weekly` onto the course doc at publish time
  // and read it as a single field rather than counting modules at runtime.
  const weeksInRange = Math.max(1, rangeDays / 7);
  const totalDaysTrained = Object.values(weekMap)
    .reduce((s, w) => s + w.daysTrained.size, 0);
  const avgDaysPerWeek = totalDaysTrained / weeksInRange;
  const TARGET_DAYS_PER_WEEK = 4;
  const workoutAdherence = Math.min(
    100,
    Math.round((avgDaysPerWeek / TARGET_DAYS_PER_WEEK) * 100)
  );
  const adherenceMode: "frequency" = "frequency";

  // ── Volume by muscle group (sorted) ──────────────────────────
  const volumeByMuscle = Object.entries(muscleVolume)
    .sort((a, b) => b[1] - a[1])
    .map(([muscle, sets]) => ({muscle, sets: Math.round(sets * 10) / 10}));

  // ── Volume by muscle group: current week vs past 3 weeks ─────
  // The current week is the most recent week with any logged volume.
  // `prevAvg` is the average per-week volume across the **3 weeks
  // immediately preceding the current week**. `delta` is the % change.
  const sortedWeekKeys = Object.keys(muscleVolumeByWeek).sort();
  const currentWeekKey = sortedWeekKeys[sortedWeekKeys.length - 1] ?? null;
  const PREV_WINDOW = 3;
  const priorWeekKeys = currentWeekKey ?
    sortedWeekKeys.slice(-1 - PREV_WINDOW, -1) :
    [];
  const muscleKeys = new Set<string>();
  for (const w of sortedWeekKeys) {
    for (const m of Object.keys(muscleVolumeByWeek[w])) muscleKeys.add(m);
  }
  const volumeByMuscleComparison = Array.from(muscleKeys)
    .map((muscle) => {
      const current = currentWeekKey ? (muscleVolumeByWeek[currentWeekKey]?.[muscle] ?? 0) : 0;
      const priorTotal = priorWeekKeys.reduce(
        (s, w) => s + (muscleVolumeByWeek[w]?.[muscle] ?? 0),
        0
      );
      const prevAvg = priorWeekKeys.length > 0 ? priorTotal / priorWeekKeys.length : 0;
      const delta = prevAvg > 0 ? Math.round(((current - prevAvg) / prevAvg) * 100) : null;
      return {
        muscle,
        current: Math.round(current * 10) / 10,
        prevAvg: Math.round(prevAvg * 10) / 10,
        delta,
        priorWeeks: priorWeekKeys.length,
      };
    })
    .filter((m) => m.current > 0 || m.prevAvg > 0)
    .sort((a, b) => b.current - a.current);

  // ── RPE average ──────────────────────────────────────────────
  const rpeAverage = rpeCount > 0 ? Math.round((rpeSum / rpeCount) * 10) / 10 : null;
  rpeTrend.sort((a, b) => a.date.localeCompare(b.date));

  // ── Body progress ────────────────────────────────────────────
  // Merge of the dated and unsorted body-log reads. Sort by effective date
  // (data.date when present, else doc.id which IS the YYYY-MM-DD key) and
  // keep the most recent 30 for the chart + photos.
  const bodyDateOf = (doc: FirebaseFirestore.QueryDocumentSnapshot) =>
    (doc.data().date as string | undefined) ?? doc.id;
  const sortedBodyDocs = [...bodyLogDocs]
    .sort((a, b) => bodyDateOf(b).localeCompare(bodyDateOf(a))) // desc
    .slice(0, 30);

  const bodyProgress = sortedBodyDocs
    .map((d) => {
      const data = d.data();
      const weightNum = pickNumber(data.weight, parseFloat(String(data.weight ?? "")));
      return {date: data.date ?? d.id, weight: weightNum};
    })
    .filter((e) => e.weight != null)
    .reverse(); // chart wants ascending
  const bodyWeight: number | null = bodyProgress.length > 0 ?
    bodyProgress[bodyProgress.length - 1].weight :
    null;

  // ── Body photos ──────────────────────────────────────────────
  // Stored as `photos: [{ photoId, url, storagePath, uploaded_at }]` per
  // /progress/body-log/:date/photos/confirm. Older entries used a flat string
  // array (`photoUrls`); legacy `photos` was a string array too.
  //
  // The stored `url` is `https://firebasestorage.googleapis.com/.../o/{path}?alt=media`
  // *without* a download token, so storage rules apply when the browser
  // fetches it. Body-log reads are restricted to the owner — a creator
  // viewing a client's photos gets blocked. We regenerate v4 signed read
  // URLs here (admin SDK bypasses rules) so the creator UI can load them.
  const bodyPhotos: Array<{ date: string; urls: string[] }> = [];
  const bucket = admin.storage().bucket();

  // Photo objects come in several shapes across PWA versions:
  //   { storageUrl, storagePath, id, angle }     ← current PWA (token in URL, public)
  //   { url, storagePath, photoId, uploaded_at } ← /photos/confirm endpoint (no token)
  //   "https://…?alt=media&token=…"              ← legacy bare-string entries
  // For tokenized URLs (`?alt=…&token=…`) we use them as-is — they bypass
  // storage rules. For untokenized URLs / objects with only a `storagePath`,
  // we generate a v4 signed read URL via the admin SDK so the creator can
  // load them despite the per-owner storage rule.
  const looksTokenized = (u: string) =>
    typeof u === "string" && u.includes("token=");

  const extractDirectUrl = (raw: unknown): string | null => {
    if (typeof raw === "string" && looksTokenized(raw)) return raw;
    if (raw && typeof raw === "object") {
      const r = raw as { storageUrl?: unknown; url?: unknown };
      if (typeof r.storageUrl === "string" && looksTokenized(r.storageUrl)) return r.storageUrl;
      if (typeof r.url === "string" && looksTokenized(r.url)) return r.url;
    }
    return null;
  };

  const extractStoragePath = (raw: unknown): string | null => {
    if (raw && typeof raw === "object") {
      const r = raw as { storagePath?: unknown; storageUrl?: unknown; url?: unknown };
      if (typeof r.storagePath === "string" && r.storagePath) return r.storagePath;
      const candidateUrl = typeof r.storageUrl === "string" ?
        r.storageUrl :
        typeof r.url === "string" ? r.url : null;
      if (candidateUrl) {
        const match = candidateUrl.match(/\/o\/([^?]+)/);
        if (match) {
          try {
            return decodeURIComponent(match[1]);
          } catch {
            return match[1];
          }
        }
      }
      return null;
    }
    if (typeof raw === "string" && raw) {
      const match = raw.match(/\/o\/([^?]+)/);
      if (match) {
        try {
          return decodeURIComponent(match[1]);
        } catch {
          return match[1];
        }
      }
    }
    return null;
  };

  for (const doc of sortedBodyDocs) {
    const data = doc.data();
    const raw = data.photos ?? data.photoUrls ?? [];
    if (!Array.isArray(raw) || raw.length === 0) continue;

    const resolved = await Promise.all(
      raw.map(async (p) => {
        // Prefer the tokenized URL when it's already there.
        const direct = extractDirectUrl(p);
        if (direct) return direct;

        // Otherwise sign the storage path (cached at module scope so warm
        // instances reuse signed URLs across requests).
        const storagePath = extractStoragePath(p);
        if (!storagePath) return null;
        return getCachedSignedUrl(bucket, storagePath);
      })
    );
    const urls = resolved.filter((u): u is string => typeof u === "string" && u.length > 0);
    if (urls.length > 0) bodyPhotos.push({date: data.date ?? doc.id, urls});
  }

  // ── Readiness: average + breakdown ───────────────────────────
  // Computes `overall` (0-10) as the mean of inverted-stress, inverted-soreness,
  // energy, and mood — the higher-is-better wellbeing signals. Sleep is
  // surfaced separately as hours.
  let readinessSum = 0;
  let readinessCount = 0;
  const readinessBreakdown: Array<{
    date: string;
    overall: number | null;
    sleep: number | null;
    stress: number | null;
    energy: number | null;
    soreness: number | null;
    mood: number | null;
  }> = [];

  for (const doc of readinessSnap.docs) {
    const data = doc.data();
    const energy = pickNumber(data.energy, data.energyLevel);
    const stress = pickNumber(data.stress, data.stressLevel);
    const soreness = pickNumber(data.soreness);
    const mood = pickNumber(data.mood);
    const sleep = pickNumber(data.sleep, data.sleep_hours, data.sleepHours);

    const positives: number[] = [];
    if (energy != null) positives.push(energy);
    if (stress != null) positives.push(10 - stress);
    if (soreness != null) positives.push(10 - soreness);
    if (mood != null) positives.push(mood);

    const stored = pickNumber(data.score, data.overallScore);
    const overall = stored != null ?
      stored :
      (positives.length > 0 ?
        Math.round((positives.reduce((s, n) => s + n, 0) / positives.length) * 10) / 10 :
        null);

    if (overall != null || energy != null || sleep != null || stress != null || soreness != null) {
      if (overall != null) {
        readinessSum += overall;
        readinessCount++;
      }
      readinessBreakdown.push({
        date: data.date,
        overall,
        sleep,
        stress,
        energy,
        soreness,
        mood,
      });
    }
  }
  readinessBreakdown.sort((a, b) => a.date.localeCompare(b.date));
  const readinessAvg = readinessCount > 0 ?
    Math.round((readinessSum / readinessCount) * 10) / 10 :
    null;

  // ── PRs: recent from exerciseHistory ─────────────────────────
  // Production exerciseHistory shape: `{ sessions: [{ date, sessionId, sets: [{weight, reps, ...}] }] }`.
  // Walks each exercise's sessions in chronological order, tracks the
  // running max set-weight, and records a PR event whenever a session's
  // best set strictly exceeds the running max. Falls back to legacy
  // `records[]` shape so older docs still render.
  interface PREntry {
    exercise: string;
    value: number;
    reps: number | null;
    date: string;
    percentChange: number | null;
  }
  const recentPRs: PREntry[] = [];
  const stalledExercises: Array<{ exercise: string; lastPR: string; weeksSinceLastPR: number }> = [];

  // Build name lookup. Resolution order, per doc id:
  //   1. exerciseLastPerformance.exerciseName (when populated)
  //   2. exercises_library lookup via libraryId + exerciseId on the lastPerf doc
  //   3. exerciseHistory.exerciseName (newer history docs carry it)
  //   4. "Ejercicio" placeholder
  const nameById = new Map<string, string>();
  for (const doc of (lastPerfSnap?.docs ?? [])) {
    const d = doc.data() ?? {};
    const direct = d.exerciseName;
    if (typeof direct === "string" && direct.length > 0) {
      nameById.set(doc.id, direct);
      continue;
    }
    const meta = resolveExerciseMeta(
      d.libraryId as string | undefined,
      d.exerciseId as string | undefined,
      d.exerciseName as string | undefined
    );
    if (meta.displayName) nameById.set(doc.id, meta.displayName);
  }

  for (const doc of (exerciseHistSnap?.docs ?? [])) {
    const data = doc.data();
    // doc.id post-migration is `${libraryId}_${exerciseId}`. exerciseHistory docs
    // typically don't carry exerciseName themselves — pull it from lastPerformance.
    const exerciseName = nameById.get(doc.id) ??
      (data.exerciseName as string | undefined) ??
      (data.name as string | undefined) ??
      "Ejercicio";

    // Per-session best — supports both new `sessions[].sets[]` and legacy `records[]`.
    type Best = { date: string; weight: number; reps: number | null };
    const perSession: Best[] = [];

    const sessions = (data.sessions ?? []) as Array<{
      date?: string;
      sets?: Array<{ weight?: number | string; reps?: number | string }>;
    }>;
    for (const s of sessions) {
      if (!s.date || !Array.isArray(s.sets) || !s.sets.length) continue;
      let bestW = -Infinity;
      let bestReps: number | null = null;
      for (const set of s.sets) {
        const w = parseFloat(String(set.weight ?? 0));
        if (Number.isFinite(w) && w > bestW) {
          bestW = w;
          const r = parseFloat(String(set.reps ?? 0));
          bestReps = Number.isFinite(r) && r > 0 ? r : null;
        }
      }
      if (bestW > 0) perSession.push({date: s.date, weight: bestW, reps: bestReps});
    }

    // Legacy fallback
    const legacy = (data.records ?? data.history ?? []) as Array<{
      value?: number; weight?: number; date?: string; reps?: number;
    }>;
    for (const r of legacy) {
      if (!r.date) continue;
      const w = r.value ?? r.weight;
      if (typeof w === "number" && w > 0) {
        perSession.push({date: r.date, weight: w, reps: typeof r.reps === "number" ? r.reps : null});
      }
    }

    if (perSession.length === 0) continue;
    perSession.sort((a, b) => a.date.localeCompare(b.date));

    let runningMax = -Infinity;
    let prevMax = -Infinity;
    let latestPR: PREntry | null = null;
    for (const sess of perSession) {
      if (sess.weight > runningMax) {
        prevMax = runningMax === -Infinity ? 0 : runningMax;
        runningMax = sess.weight;
        const pct = prevMax > 0 ?
          Math.round(((sess.weight - prevMax) / prevMax) * 1000) / 10 :
          null;
        latestPR = {
          exercise: exerciseName,
          value: sess.weight,
          reps: sess.reps,
          date: sess.date,
          percentChange: pct,
        };
      }
    }

    if (latestPR) {
      recentPRs.push(latestPR);
      const prDate = new Date(latestPR.date);
      const weeksSince = Math.floor((now.getTime() - prDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weeksSince >= 3) {
        stalledExercises.push({
          exercise: exerciseName,
          lastPR: latestPR.date,
          weeksSinceLastPR: weeksSince,
        });
      }
    }
  }

  // Sort PRs by date (most recent first), take top 5
  recentPRs.sort((a, b) => b.date.localeCompare(a.date));
  const topPRs = recentPRs.slice(0, 5);
  stalledExercises.sort((a, b) => b.weeksSinceLastPR - a.weeksSinceLastPR);

  // ── Nutrition: daily averages + trends + adherence ───────────
  let actual = {calories: 0, protein: 0, carbs: 0, fat: 0};
  const seenDays = new Set<string>();
  const dailyNutrition: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {};

  for (const doc of (diarySnap?.docs ?? [])) {
    const data = doc.data();
    seenDays.add(data.date);
    actual.calories += data.calories ?? 0;
    actual.protein += data.protein ?? 0;
    actual.carbs += data.carbs ?? 0;
    actual.fat += data.fat ?? 0;

    if (!dailyNutrition[data.date]) {
      dailyNutrition[data.date] = {calories: 0, protein: 0, carbs: 0, fat: 0};
    }
    dailyNutrition[data.date].calories += data.calories ?? 0;
    dailyNutrition[data.date].protein += data.protein ?? 0;
    dailyNutrition[data.date].carbs += data.carbs ?? 0;
    dailyNutrition[data.date].fat += data.fat ?? 0;
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

  let target = {calories: 0, protein: 0, carbs: 0, fat: 0};
  const activeAssignment = assignmentsSnap.docs.find((d) => {
    const s = d.data().status;
    return !s || s === "active";
  });
  if (activeAssignment) {
    const contentDoc = await db
      .collection("client_nutrition_plan_content")
      .doc(activeAssignment.id)
      .get();
    if (contentDoc.exists) {
      const c = contentDoc.data()!;
      target = {
        calories: c.daily_calories ?? 0,
        protein: c.daily_protein_g ?? 0,
        carbs: c.daily_carbs_g ?? 0,
        fat: c.daily_fat_g ?? 0,
      };
    }
  }

  // Calorie trend (daily actual vs target)
  const caloriesTrend = Object.entries(dailyNutrition)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, n]) => ({
      date,
      actual: Math.round(n.calories),
      target: target.calories,
    }));

  // Macro trends (daily)
  const macrosTrend = Object.entries(dailyNutrition)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, n]) => ({
      date,
      protein: Math.round(n.protein),
      carbs: Math.round(n.carbs),
      fat: Math.round(n.fat),
      proteinTarget: target.protein,
      carbsTarget: target.carbs,
      fatTarget: target.fat,
    }));

  // Nutrition adherence: days within ±20% of calorie AND protein targets
  let daysWithinTarget = 0;
  const hasNutritionTargets = target.calories > 0 || target.protein > 0;
  if (hasNutritionTargets) {
    for (const n of Object.values(dailyNutrition)) {
      const calOk = target.calories <= 0 || (n.calories / target.calories >= 0.8 && n.calories / target.calories <= 1.2);
      const proOk = target.protein <= 0 || (n.protein / target.protein >= 0.8 && n.protein / target.protein <= 1.2);
      if (calOk && proOk) daysWithinTarget++;
    }
  }
  const nutritionAdherence = hasNutritionTargets && diaryDayCount > 0 ?
    Math.round((daysWithinTarget / diaryDayCount) * 100) :
    null;

  res.json({
    data: {
      // Backward-compatible fields
      completionRate: sessionsSnap.size,
      // New flat fields for bento cards
      workoutAdherence,
      adherenceMode,
      bodyWeight,
      readinessAvg,
      rpeAverage,
      // Detailed data
      recentPRs: topPRs,
      stalledExercises,
      volumeByMuscle,
      volumeByMuscleComparison,
      rpeTrend,
      readinessBreakdown,
      adherenceHeatmap,
      bodyProgress,
      bodyPhotos,
      weeklyVolume,
      // Nutrition
      nutritionComparison: {
        actualCalories: actual.calories,
        actualProtein: actual.protein,
        actualCarbs: actual.carbs,
        actualFat: actual.fat,
        targetCalories: target.calories,
        targetProtein: target.protein,
        targetCarbs: target.carbs,
        targetFat: target.fat,
      },
      caloriesTrend,
      macrosTrend,
      nutritionAdherence,
    },
  });
});

// GET /analytics/client-activity
router.get("/analytics/client-activity", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  const clientsSnap = await getCreatorClients(auth.userId);
  res.json({data: await computeClientActivity(clientsSnap)});
});

// GET /analytics/client-trend
router.get("/analytics/client-trend", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  const [clientsSnap, paymentDocs] = await Promise.all([
    getCreatorClients(auth.userId),
    getCreatorPayments(auth.userId),
  ]);
  res.json({data: computeClientTrend(clientsSnap, paymentDocs)});
});

// GET /analytics/revenue-trend
router.get("/analytics/revenue-trend", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
  const paymentDocs = await getCreatorPayments(auth.userId);
  res.json({data: computeRevenueTrend(paymentDocs, courseId)});
});

// GET /analytics/expiring-access
router.get("/analytics/expiring-access", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  const [coursesSnap, clientsSnap] = await Promise.all([
    getCreatorCourses(auth.userId),
    getCreatorClients(auth.userId),
  ]);
  res.json({data: await computeExpiringAccess(coursesSnap, clientsSnap)});
});

// GET /analytics/calendar-preview
router.get("/analytics/calendar-preview", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);
  res.json({data: await computeCalendarPreview(auth.userId)});
});

// ─── Batch dashboard endpoint ─────────────────────────────────────────────
// Combines all 7 creator analytics sections into a single response.
// Shared Firestore data (courses, clients, payments) is fetched once.

// ─── Dashboard v2 helpers ──────────────────────────────────────────────────

async function computeOneOnOneView(
  clientsSnap: FirebaseFirestore.QuerySnapshot,
  ooCourseDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  dates: string[],
  thirtyDaysAgoStr: string,
  creatorId: string,
  now: Date,
) {
  const fortyEightHoursLater = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const prevPeriodStart = new Date(new Date(thirtyDaysAgoStr).getTime() - 30 * 24 * 60 * 60 * 1000);
  const prevPeriodStartStr = prevPeriodStart.toISOString().slice(0, 10);

  const clientDocs = clientsSnap.docs;
  const clientUserIds = clientDocs
    .map((d) => (d.data().clientUserId ?? d.data().userId) as string)
    .filter(Boolean);

  const ooIds = ooCourseDocs.map((d) => d.id);

  // Parallel: calls + video exchanges + session history
  const [callsSnap, videoSnap, sessionsByUser] = await Promise.all([
    db.collection("call_bookings")
      .where("creatorId", "==", creatorId)
      .where("slotStartUtc", ">=", now.toISOString())
      .where("slotStartUtc", "<=", fortyEightHoursLater.toISOString())
      .orderBy("slotStartUtc", "asc")
      .get(),
    db.collection("video_exchanges")
      .where("creatorId", "==", creatorId)
      .get(),
    Promise.all(
      clientUserIds.map((uid) =>
        db.collection("users").doc(uid).collection("sessionHistory")
          .where("date", ">=", thirtyDaysAgoStr)
          .get()
          .then((snap) => ({uid, docs: snap.docs}))
      )
    ),
  ]);

  const upcomingCalls = callsSnap.docs.map((d) => {
    const data = d.data();
    const slotStart = data.slotStartUtc as string;
    return {
      id: d.id,
      clientName: (data.clientDisplayName ?? data.clientName ?? "Cliente") as string,
      slotStartUtc: slotStart,
      slotEndUtc: (data.slotEndUtc ?? "") as string,
      isToday: slotStart?.slice(0, 10) === now.toISOString().slice(0, 10),
    };
  });

  const unreadVideoExchanges = videoSnap.docs.filter((d) => {
    const ub = d.data().unreadByCreator;
    return typeof ub === "number" && ub > 0;
  }).length;

  // Build session maps per course
  const clientsByCourse: Record<string, Set<string>> = {};
  const trainedByCourseDate: Record<string, Record<string, Set<string>>> = {};
  for (const id of ooIds) {
    clientsByCourse[id] = new Set();
    trainedByCourseDate[id] = {};
    for (const date of dates) trainedByCourseDate[id][date] = new Set();
  }

  for (const {uid, docs} of sessionsByUser) {
    for (const doc of docs) {
      const data = doc.data();
      const courseId = data.courseId as string | undefined;
      const date = data.date as string | undefined;
      if (!courseId || !ooIds.includes(courseId) || !date) continue;
      clientsByCourse[courseId].add(uid);
      if (date in trainedByCourseDate[courseId]) {
        trainedByCourseDate[courseId][date].add(uid);
      }
    }
  }

  // Plans metadata
  const getClientDate = (d: FirebaseFirestore.DocumentData): string | null => {
    if (d.created_at?.toDate) return (d.created_at.toDate() as Date).toISOString().slice(0, 10);
    if (typeof d.created_at === "string") return d.created_at.slice(0, 10);
    return null;
  };

  const plans = ooCourseDocs.map((doc) => {
    const data = doc.data();
    // Prefer clients explicitly linked by courseId, fall back to session-derived count
    const linkedDocs = clientDocs.filter((cd) =>
      (cd.data().courseId ?? cd.data().planId) === doc.id
    );
    const totalClients = Math.max(linkedDocs.length, clientsByCourse[doc.id].size);
    const newLast30d = linkedDocs.filter((cd) => {
      const dt = getClientDate(cd.data());
      return dt && dt >= thirtyDaysAgoStr;
    }).length;
    const prevPeriod = linkedDocs.filter((cd) => {
      const dt = getClientDate(cd.data());
      return dt && dt >= prevPeriodStartStr && dt < thirtyDaysAgoStr;
    }).length;
    const pctChange = prevPeriod > 0 ?
      Math.round(((newLast30d - prevPeriod) / prevPeriod) * 100) :
      newLast30d > 0 ? 100 : 0;
    return {
      courseId: doc.id,
      title: (data.title as string) ?? "",
      imageUrl: (data.image_url as string) ?? null,
      totalClients,
      newLast30d,
      pctChange,
    };
  });

  // Client count series (cumulative per course per day)
  const clientCountSeries = dates.map((date) => {
    const byCourse: Record<string, number> = {};
    for (const doc of ooCourseDocs) {
      const linked = clientDocs.filter((cd) => {
        const d = cd.data();
        if ((d.courseId ?? d.planId) !== doc.id) return false;
        const dt = getClientDate(d);
        return dt ? dt <= date : false;
      });
      byCourse[doc.id] = linked.length;
    }
    return {date, byCourse};
  });

  // Adherence series (% of clients per course who trained each day)
  const adherenceSeries = dates.map((date) => {
    const byCourse: Record<string, number> = {};
    for (const id of ooIds) {
      const total = clientsByCourse[id].size;
      if (total === 0) {
        byCourse[id] = 0; continue;
      }
      const trained = trainedByCourseDate[id][date]?.size ?? 0;
      byCourse[id] = Math.round((trained / total) * 100);
    }
    return {date, byCourse};
  });

  return {upcomingCalls, unreadVideoExchanges, plans, adherenceSeries, clientCountSeries};
}

async function computeProgramsView(
  ltCourseDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  paymentDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  dates: string[],
  thirtyDaysAgoStr: string,
  now: Date,
) {
  const ltIds = ltCourseDocs.map((d) => d.id);
  const courseMap = Object.fromEntries(ltCourseDocs.map((d) => [d.id, d.data()]));

  const weekAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgoIso = new Date(thirtyDaysAgoStr + "T00:00:00Z").toISOString();
  const prevMonthStartIso = new Date(new Date(thirtyDaysAgoStr).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const thisMonthStr = now.toISOString().slice(0, 7);
  const lastMonthStr = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);

  const approvedDocs = paymentDocs.filter((d) => {
    const s = d.data().status;
    return s === "approved" || s === "completed";
  });

  const getPayDate = (doc: FirebaseFirestore.QueryDocumentSnapshot): string => {
    const data = doc.data();
    const ts = data.processed_at ?? data.created_at ?? data.createdAt ?? data.paidAt;
    if (ts?.toDate) return (ts.toDate() as Date).toISOString();
    if (typeof ts === "string") return ts;
    return "";
  };

  const getUserId = (data: FirebaseFirestore.DocumentData): string | null => {
    if (data.userId) return data.userId as string;
    const extRef = data.external_reference as string | undefined;
    if (!extRef) return null;
    const parts = extRef.split("|");
    return parts.length >= 3 ? parts[1] : null;
  };

  // Revenue
  const {trend: revenueTrend} = computeRevenueTrend(paymentDocs);
  const thisMonthGross = approvedDocs
    .filter((d) => getPayDate(d).startsWith(thisMonthStr))
    .reduce((s, d) => s + (d.data().amount ?? 0), 0);
  const lastMonthGross = approvedDocs
    .filter((d) => getPayDate(d).startsWith(lastMonthStr))
    .reduce((s, d) => s + (d.data().amount ?? 0), 0);
  const netThisMonth = Math.round(thisMonthGross * (1 - WAKE_CUT_PERCENT / 100));
  const netLastMonth = Math.round(lastMonthGross * (1 - WAKE_CUT_PERCENT / 100));
  const revenuePctChange = netLastMonth > 0 ?
    Math.round(((netThisMonth - netLastMonth) / netLastMonth) * 100) :
    netThisMonth > 0 ? 100 : 0;

  // Enrollment per course
  const enrollment = ltIds.map((courseId) => {
    const pays = approvedDocs.filter((d) => d.data().courseId === courseId);
    return {
      courseId,
      title: (courseMap[courseId]?.title as string) ?? "",
      imageUrl: (courseMap[courseId]?.image_url as string) ?? null,
      totalEnrolled: pays.length,
      newThisWeek: pays.filter((d) => getPayDate(d) >= weekAgoIso).length,
      newThisMonth: pays.filter((d) => getPayDate(d) >= thirtyDaysAgoIso).length,
      prevMonth: pays.filter((d) => {
        const dt = getPayDate(d);
        return dt >= prevMonthStartIso && dt < thirtyDaysAgoIso;
      }).length,
    };
  }).map((e) => ({
    ...e,
    pctChange: e.prevMonth > 0 ?
      Math.round(((e.newThisMonth - e.prevMonth) / e.prevMonth) * 100) :
      e.newThisMonth > 0 ? 100 : 0,
  }));

  // Adherence series — derive enrolled userIds from payments (cap at 30 per course)
  const enrolledByCourse: Record<string, string[]> = {};
  for (const courseId of ltIds) {
    const pays = approvedDocs.filter((d) => d.data().courseId === courseId);
    const uids = [...new Set(
      pays.map((d) => getUserId(d.data())).filter((id): id is string => !!id)
    )];
    enrolledByCourse[courseId] = uids.slice(0, 30);
  }

  const allUserIds = [...new Set(Object.values(enrolledByCourse).flat())];
  const sessionsByUser = allUserIds.length > 0 ?
    await Promise.all(
      allUserIds.map((uid) =>
        db.collection("users").doc(uid).collection("sessionHistory")
          .where("date", ">=", thirtyDaysAgoStr)
          .get()
          .then((snap) => ({uid, docs: snap.docs}))
      )
    ) :
    [];

  const trainedByCourseDate: Record<string, Record<string, Set<string>>> = {};
  for (const id of ltIds) {
    trainedByCourseDate[id] = {};
    for (const date of dates) trainedByCourseDate[id][date] = new Set();
  }
  for (const {uid, docs} of sessionsByUser) {
    for (const doc of docs) {
      const data = doc.data();
      const courseId = data.courseId as string | undefined;
      const date = data.date as string | undefined;
      if (!courseId || !ltIds.includes(courseId) || !date) continue;
      if (date in trainedByCourseDate[courseId]) trainedByCourseDate[courseId][date].add(uid);
    }
  }

  const adherenceSeries = dates.map((date) => {
    const byCourse: Record<string, number> = {};
    for (const id of ltIds) {
      const total = enrolledByCourse[id].length;
      if (total === 0) {
        byCourse[id] = 0; continue;
      }
      const trained = trainedByCourseDate[id][date]?.size ?? 0;
      byCourse[id] = Math.round((trained / total) * 100);
    }
    return {date, byCourse};
  });

  // Cumulative enrollment per program per day (sparkline data)
  const enrollmentSeries = dates.map((date) => {
    const byCourse: Record<string, number> = {};
    for (const courseId of ltIds) {
      const pays = approvedDocs.filter((d) => d.data().courseId === courseId);
      byCourse[courseId] = pays.filter((d) => getPayDate(d).slice(0, 10) <= date).length;
    }
    return {date, byCourse};
  });

  return {
    revenue: {netThisMonth, pctChange: revenuePctChange, trend: revenueTrend.slice(-6)},
    enrollment,
    enrollmentSeries,
    adherenceSeries,
  };
}

// ─── GET /analytics/dashboard ──────────────────────────────────────────────

router.get("/analytics/dashboard", async (req, res) => {
  const auth = await validateAuthAndRateLimit(req);
  requireCreator(auth);

  const creatorId = auth.userId;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  // Build 30-day date array
  const dates: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().slice(0, 10));
  }

  const [paymentDocs, clientsSnap, coursesSnap] = await Promise.all([
    getCreatorPayments(creatorId),
    getCreatorClients(creatorId),
    getCreatorCourses(creatorId),
  ]);

  const ooCourseDocs = coursesSnap.docs.filter((d) => {
    const dt = d.data().deliveryType ?? d.data().delivery_type;
    return dt === "one_on_one";
  });
  const ltCourseDocs = coursesSnap.docs.filter((d) => {
    const dt = d.data().deliveryType ?? d.data().delivery_type;
    return dt === "low_ticket" || dt === "general";
  });

  const hasOneOnOne = ooCourseDocs.length > 0 || clientsSnap.size > 0;
  const hasPrograms = ltCourseDocs.length > 0;

  const [oResult, pResult] = await Promise.allSettled([
    hasOneOnOne ?
      computeOneOnOneView(clientsSnap, ooCourseDocs, dates, thirtyDaysAgoStr, creatorId, now) :
      Promise.resolve(null),
    hasPrograms ?
      computeProgramsView(ltCourseDocs, paymentDocs, dates, thirtyDaysAgoStr, now) :
      Promise.resolve(null),
  ]);

  const errors: Record<string, string> = {};
  if (oResult.status === "rejected") errors.oneOnOne = String(oResult.reason);
  if (pResult.status === "rejected") errors.programs = String(pResult.reason);

  res.json({
    data: {
      hasOneOnOne,
      hasPrograms,
      oneOnOne: oResult.status === "fulfilled" ? oResult.value : null,
      programs: pResult.status === "fulfilled" ? pResult.value : null,
      ...(Object.keys(errors).length > 0 ? {errors} : {}),
    },
  });
});

export default router;
