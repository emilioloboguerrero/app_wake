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

// Returns YYYY-MM-DD in America/Bogota for `d`. Cron + cadence both pivot on
// BOG calendar, so we read days/weeks via Intl instead of host-local Date.
function bogotaParts(d: Date): {year: number; month: number; day: number; weekday: number} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  const wd: Record<string, number> = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6};
  return {year: Number(p.year), month: Number(p.month), day: Number(p.day), weekday: wd[p.weekday] ?? -1};
}

// Days between two dates, by BOG calendar day. Ignores time-of-day so a pulse
// fired at 18:00 BOG and a flip at 00:00 BOG show as the same number of days.
function bogotaDaysBetween(from: Date, to: Date): number {
  const a = bogotaParts(from);
  const b = bogotaParts(to);
  // UTC midnight of each BOG calendar day, just to subtract uniformly.
  const aMs = Date.UTC(a.year, a.month - 1, a.day);
  const bMs = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((bMs - aMs) / 86400000);
}

// First Monday of a given BOG year/month, returned as the UTC instant of
// 00:00 BOG (= 05:00 UTC). Only used for day-diffing against `now`, so
// callers should compare via bogotaDaysBetween, not raw getTime arithmetic.
function firstMondayOf(yearBog: number, monthBog: number): Date {
  // Probe first 7 days of the month and pick the first Monday in BOG.
  for (let day = 1; day <= 7; day++) {
    // Construct as 00:00 BOG → 05:00 UTC.
    const probe = new Date(Date.UTC(yearBog, monthBog - 1, day, 5, 0, 0));
    if (bogotaParts(probe).weekday === 1) return probe;
  }
  // Unreachable: every month has a Monday in days 1–7.
  return new Date(Date.UTC(yearBog, monthBog - 1, 1, 5, 0, 0));
}

// Next first-Monday-of-month on or after `from`, in America/Bogota.
function nextFirstMondayOfMonth(from: Date): Date {
  const {year, month} = bogotaParts(from);
  const thisMonth = firstMondayOf(year, month);
  if (bogotaDaysBetween(from, thisMonth) >= 0) return thisMonth;
  const nextMonth = month === 12 ? firstMondayOf(year + 1, 1) : firstMondayOf(year, month + 1);
  return nextMonth;
}

interface CoursePulseLine {
  courseId: string;
  title: string;
  currentBlockIndex: number | null;
  nextBlockIndex: number | null;
  nextPublished: boolean;
  hasAnyModules: boolean;
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
  const daysToFlip = Math.max(0, bogotaDaysBetween(now, flipDate));

  const lines: CoursePulseLine[] = [];
  for (const cDoc of coursesSnap.docs) {
    const courseId = cDoc.id;
    const data = cDoc.data() ?? {};
    const title = (data.title as string) ?? courseId;
    const currentBlockIndex = typeof data.current_block_index === "number" ?
      data.current_block_index :
      null;

    // Look ahead: next module by order. Cheap — one query per course.
    // Sentinel -1 matches the cron's "no block live yet" baseline so we pick
    // up order=0 instead of skipping it.
    let nextIndex: number | null = null;
    let nextPublished = false;
    let hasAnyModules = false;
    try {
      const ahead = await cDoc.ref
        .collection("modules")
        .where("order", ">", currentBlockIndex ?? -1)
        .orderBy("order", "asc")
        .limit(1)
        .get();
      if (!ahead.empty) {
        hasAnyModules = true;
        const next = ahead.docs[0].data();
        nextIndex = typeof next.order === "number" ? next.order : null;
        nextPublished = next.published_at !== null && next.published_at !== undefined;
      } else if (currentBlockIndex !== null) {
        // No module beyond current — does the course have any modules at all?
        const anySnap = await cDoc.ref.collection("modules").limit(1).get();
        hasAnyModules = !anySnap.empty;
      }
    } catch (err) {
      functions.logger.warn("monthlyDropsPulse: next-block lookup failed", {
        courseId, err: err instanceof Error ? err.message : String(err),
      });
    }

    // "Soon" = within a week of the flip AND we're not ready. Three failure
    // modes all flag: (a) next module exists but unpublished, (b) no next
    // module beyond the current one, (c) course has no modules at all.
    const needsPublishSoon = daysToFlip <= 7 &&
      (!nextPublished || nextIndex === null || !hasAnyModules);

    lines.push({
      courseId,
      title,
      currentBlockIndex,
      nextBlockIndex: nextIndex,
      nextPublished,
      hasAnyModules,
      daysToFlip,
      needsPublishSoon,
    });
  }

  // Format
  const header = `[monthly-drops] daily pulse · ${daysToFlip}d to next first-Monday`;
  const rows = lines.map((l) => {
    const curr = l.currentBlockIndex === null ? "(none)" : `${l.currentBlockIndex}`;
    let next: string;
    if (!l.hasAnyModules) next = "NO MODULES AUTHORED";
    else if (l.nextBlockIndex === null) next = "no next block";
    else next = `next=${l.nextBlockIndex} ${l.nextPublished ? "[published]" : "[draft]"}`;
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
