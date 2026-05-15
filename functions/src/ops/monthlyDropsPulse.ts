// Daily pulse for monthly-drop programs (see memory/project_monthly_drops.md).
//
// For every course with `block_cadence: 'monthly_first_monday'`, surfaces:
//   - the current live block
//   - the next queued block + whether its `published_at` is set
//   - days until the next first-Monday-of-month flip
//
// Posts a compact summary to the wake_ops signals topic. If a course is
// missing the next block within 7 days of the flip, the line gets a clear
// "needs publish" marker so we can chase the creator before users notice.
//
// Hooked into wakeDailyPulseCron alongside payments / logs / quota.

import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {sendTo, type TopicMap} from "./telegram.js";

interface PulseCtx {
  botToken: string;
  chatId: string;
  topics?: TopicMap;
  projectId?: string;
}

const TELEGRAM_MAX = 4000;

// Returns the next first-Monday-of-month after `from` (inclusive). Used to
// tell the creator how many days they have until the next drop.
function nextFirstMondayOfMonth(from: Date): Date {
  // Start from the first of the current month; if today is past it, jump to next month.
  const candidateMonth = new Date(from.getFullYear(), from.getMonth(), 1);
  for (let m = 0; m < 3; m++) {
    const month = new Date(candidateMonth.getFullYear(), candidateMonth.getMonth() + m, 1);
    // Find first Monday in `month`. JS getDay(): 0 Sun..6 Sat. Monday=1.
    const offset = (1 - month.getDay() + 7) % 7;
    const firstMonday = new Date(month.getFullYear(), month.getMonth(), 1 + offset);
    firstMonday.setHours(0, 0, 0, 0);
    if (firstMonday.getTime() >= from.getTime()) return firstMonday;
  }
  // Fallback: shouldn't reach, but stay defensive.
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

interface CoursePulseLine {
  courseId: string;
  title: string;
  currentBlockIndex: number | null;
  nextBlockIndex: number | null;
  nextPublished: boolean;
  daysToFlip: number;
  needsPublishSoon: boolean;
}

export async function runMonthlyDropsPulse(ctx: PulseCtx): Promise<void> {
  const db = admin.firestore();
  const coursesSnap = await db
    .collection("courses")
    .where("block_cadence", "==", "monthly_first_monday")
    .get();

  if (coursesSnap.empty) {
    // No cadenced courses — emit a one-liner so the daily pulse still acknowledges this.
    try {
      await sendTo(ctx, "signals", "[monthly-drops] no cadenced courses configured");
    } catch (err) {
      functions.logger.warn("monthlyDropsPulse: idle signal failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const now = new Date();
  const flipDate = nextFirstMondayOfMonth(now);
  const daysToFlip = Math.max(
    0,
    Math.ceil((flipDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  const lines: CoursePulseLine[] = [];
  for (const cDoc of coursesSnap.docs) {
    const courseId = cDoc.id;
    const data = cDoc.data() ?? {};
    const title = (data.title as string) ?? courseId;
    const currentBlockIndex = typeof data.current_block_index === "number" ?
      data.current_block_index :
      null;

    // Look ahead: next module by order. Cheap — one query per course.
    let nextIndex: number | null = null;
    let nextPublished = false;
    try {
      const ahead = await cDoc.ref
        .collection("modules")
        .where("order", ">", currentBlockIndex ?? -1)
        .orderBy("order", "asc")
        .limit(1)
        .get();
      if (!ahead.empty) {
        const next = ahead.docs[0].data();
        nextIndex = typeof next.order === "number" ? next.order : null;
        nextPublished = next.published_at !== null && next.published_at !== undefined;
      }
    } catch (err) {
      functions.logger.warn("monthlyDropsPulse: next-block lookup failed", {
        courseId, err: err instanceof Error ? err.message : String(err),
      });
    }

    // "Soon" = within a week of the flip and next module isn't published.
    const needsPublishSoon = daysToFlip <= 7 && !nextPublished && nextIndex !== null;

    lines.push({
      courseId,
      title,
      currentBlockIndex,
      nextBlockIndex: nextIndex,
      nextPublished,
      daysToFlip,
      needsPublishSoon,
    });
  }

  // Format
  const header = `[monthly-drops] daily pulse · ${daysToFlip}d to next first-Monday`;
  const rows = lines.map((l) => {
    const curr = l.currentBlockIndex === null ? "(none)" : `${l.currentBlockIndex}`;
    const next = l.nextBlockIndex === null ?
      "no next block" :
      `next=${l.nextBlockIndex} ${l.nextPublished ? "[published]" : "[draft]"}`;
    const flag = l.needsPublishSoon ? " — NEEDS PUBLISH" : "";
    return `- ${l.title} · curr=${curr} · ${next}${flag}`;
  });
  const body = [header, ...rows].join("\n");
  const text = body.length > TELEGRAM_MAX ? `${body.slice(0, TELEGRAM_MAX - 16)}\n…(truncated)` : body;

  try {
    await sendTo(ctx, "signals", text);
  } catch (err) {
    functions.logger.warn("monthlyDropsPulse: signal failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
