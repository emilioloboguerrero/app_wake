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

// ─── Calendar editor helpers ─────────────────────────────────────
// Used by ProgramCadenceCalendar to map calendar weeks → active drop module,
// applying carry-over semantics (months without a new drop inherit the
// previous one). Mirrors the cron contract: a module's "activation Monday"
// is the first-Monday-of-month implied by its unlocks_at, falling back to
// the program_state baseline + orderOffset months.

// Monday of the ISO week containing `date`, snapped to 00:00 local time.
export function mondayOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

// First Monday of the calendar month containing `date`.
export function firstMondayOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  for (let i = 0; i < 7; i++) {
    if (d.getDay() === 1) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// When does a module's content go live? `unlocks_at` wins. Otherwise we
// stagger from a baseline first-Monday by (module.order - baselineOrder)
// months. baseline comes from program_state.current_block_started_at —
// when absent the caller passes the next first-Monday-from-today.
export function moduleActivationMonday(mod, baselineFirstMonday, baselineOrder = 0) {
  if (mod?.unlocks_at) {
    const t = typeof mod.unlocks_at === 'string'
      ? Date.parse(mod.unlocks_at)
      : mod.unlocks_at?.toDate?.()?.getTime?.();
    if (Number.isFinite(t)) return firstMondayOfMonth(new Date(t));
  }
  const offset = (mod?.order ?? 0) - baselineOrder;
  const target = new Date(baselineFirstMonday);
  target.setMonth(target.getMonth() + offset);
  return firstMondayOfMonth(target);
}

// Returns the module that should drive content for `weekMonday`. Highest-
// order published module whose activation Monday is ≤ weekMonday. Returns
// null if no module is active yet (program hasn't started).
export function resolveActiveDropForWeek(modules, weekMonday, baselineFirstMonday, baselineOrder = 0) {
  if (!Array.isArray(modules) || modules.length === 0) return null;
  const candidates = modules
    .filter((m) => m?.published_at)
    .map((m) => ({ m, activates: moduleActivationMonday(m, baselineFirstMonday, baselineOrder) }))
    .filter(({ activates }) => activates.getTime() <= weekMonday.getTime())
    .sort((a, b) => (b.m.order ?? 0) - (a.m.order ?? 0));
  return candidates[0]?.m ?? null;
}

// Build [first-of-month-1, …, first-of-month-N] from a starting month for
// the multi-month stack.
export function monthsForward(fromDate, count) {
  const out = [];
  const base = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  for (let i = 0; i < count; i++) {
    out.push(new Date(base.getFullYear(), base.getMonth() + i, 1));
  }
  return out;
}

// Builds the 7-cell weekday rows that fill a calendar month grid.
// Returns an array of { weeks: [{ monday, days: [{ date, inMonth }] }] }.
// Leading days from prev month + trailing days from next month so the grid
// always renders complete L-D rows.
export function buildMonthGrid(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const startingDayOfWeek = (firstOfMonth.getDay() + 6) % 7; // Mon=0
  const totalCells = Math.ceil((startingDayOfWeek + lastOfMonth.getDate()) / 7) * 7;
  const weeks = [];
  let cursor = new Date(year, month, 1 - startingDayOfWeek);
  for (let w = 0; w < totalCells / 7; w++) {
    const monday = new Date(cursor);
    const days = [];
    for (let d = 0; d < 7; d++) {
      days.push({
        date: new Date(cursor),
        inMonth: cursor.getMonth() === month,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push({ monday, days });
  }
  return { monthDate, weeks };
}

// Short month label "Mayo" (sentence case, no year) — used in the carry-
// over headers ("Sin drop · sigue Mes 1 — Base").
export function monthShortSentence(date) {
  const names = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return names[date.getMonth()];
}
