// Cadence helpers for `block_cadence: 'monthly_first_monday'` programs.
// The cron evaluates the first Monday in America/Bogota; we mirror that on
// the client so the editor's "Próximo drop · X" labels match what the cron
// will actually do — no client/server timezone drift.

const MONTH_NAMES_FULL = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];
const MONTH_NAMES_SHORT_LOWER = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

// L M X J V S D — Spanish single-letter weekday labels, Monday-first.
export const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const DAYS_PER_WEEK = 7;

// Bogota-local YMD parts for a Date. Mirrors the cron's bogotaDateParts in
// functions/src/index.ts so block calendar math matches the cron's frame.
function bogotaParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday] ?? -1,
  };
}

// Next first-Monday-of-month at or after `from`, in America/Bogota.
// Returns a Date positioned at 00:00-05:00 (Bogota midnight).
export function nextFirstMondayBogota(from = new Date()) {
  const d = new Date(from);
  for (let i = 0; i < 60; i++) {
    const { year, month, day, weekday } = bogotaParts(d);
    if (weekday === 1 && day <= 7) {
      return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00-05:00`);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

// "MAYO 2026" for a Date or ISO string. Falls back to current month + offset
// when input is null/invalid — used to label future blocks before the coach
// sets unlocks_at.
export function monthLabelFull(input, fallbackOffsetMonths = 0) {
  let d;
  if (input) {
    const t = typeof input === 'string' ? Date.parse(input) : input?.getTime?.();
    d = Number.isFinite(t) ? new Date(t) : new Date();
  } else {
    d = new Date();
    d.setMonth(d.getMonth() + fallbackOffsetMonths);
  }
  return `${MONTH_NAMES_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

// "1 jun" — short form for unlock-date chips.
export function shortUnlockLabel(input) {
  if (!input) return '';
  const t = typeof input === 'string' ? Date.parse(input) : input?.getTime?.();
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getDate()} ${MONTH_NAMES_SHORT_LOWER[d.getMonth()]}`;
}

// HTML <input type="date"> wants YYYY-MM-DD in local time. Used to seed the
// unlock-date picker from a stored ISO timestamp.
export function isoToYMD(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Round to the next first-Monday-Bogota at or after the picked date so the
// stored value can never miss the cron's gate. Returns ISO. Pass an empty
// string to clear.
export function ymdToMondayIso(ymd) {
  if (!ymd) return null;
  // Parse as Bogota local midnight (cron's frame). Without the offset, JS
  // would interpret the YMD in the coach's local tz and could shift a day.
  const picked = new Date(`${ymd}T00:00:00-05:00`);
  if (!Number.isFinite(picked.getTime())) return null;
  const monday = nextFirstMondayBogota(picked);
  return monday ? monday.toISOString() : picked.toISOString();
}
