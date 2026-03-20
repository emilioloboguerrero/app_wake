import { Router } from "express";
import * as admin from "firebase-admin";
import { validateAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
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

  // Validate max 12 weeks
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffWeeks = (end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000);
  if (diffWeeks > 12) {
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
    const weekKey = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getTime() - new Date(weekStart.getFullYear(), 0, 1).getTime()) / (7 * 86400000))).padStart(2, "0")}`;

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

  // Validate max 90 days
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (diffDays > 90) {
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

export default router;
