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

// Normalize the three shapes `unlocks_at` can arrive in (ISO string, client-
// SDK Timestamp, serialized admin Timestamp) into an ISO string. Returns
// null for missing/invalid values. Reused by the date-picker and any other
// surface that needs the raw ISO from a fetched module.
export function unlocksAtToIso(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return Number.isFinite(Date.parse(raw)) ? raw : null;
  if (typeof raw?.toDate === 'function') return raw.toDate().toISOString();
  const seconds = raw.seconds ?? raw._seconds;
  const nanos = raw.nanoseconds ?? raw._nanoseconds ?? 0;
  if (Number.isFinite(seconds)) return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
  return null;
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
//
// `unlocks_at` arrives in three possible shapes:
//   - ISO string (when the client just PATCHed it and hasn't refetched)
//   - Firestore client-SDK Timestamp ({ toDate() })
//   - Serialized admin Timestamp from the REST API: { seconds, nanoseconds }
//     or { _seconds, _nanoseconds } depending on the firebase-admin version.
//     This is the common case for data round-tripping through Express.
export function moduleActivationMonday(mod, baselineFirstMonday, baselineOrder = 0) {
  const raw = mod?.unlocks_at;
  if (raw) {
    let t;
    if (typeof raw === 'string') {
      t = Date.parse(raw);
    } else if (typeof raw?.toDate === 'function') {
      t = raw.toDate().getTime();
    } else {
      const seconds = raw.seconds ?? raw._seconds;
      const nanos = raw.nanoseconds ?? raw._nanoseconds ?? 0;
      if (Number.isFinite(seconds)) t = seconds * 1000 + Math.floor(nanos / 1e6);
    }
    if (Number.isFinite(t)) return firstMondayOfMonth(new Date(t));
  }
  const offset = (mod?.order ?? 0) - baselineOrder;
  const target = new Date(baselineFirstMonday);
  target.setMonth(target.getMonth() + offset);
  return firstMondayOfMonth(target);
}

// Returns the module that should drive content for `weekMonday` in the
// creator's editor view. Most-recently-activated module whose activation
// Monday is ≤ weekMonday — including drafts, since the editor needs to
// show in-progress work the cron will refuse to ship. Sorting by
// activation (not order) so a coach who slots a drop into an empty month
// doesn't steamroll every later month's existing drop just because the
// new module was created last. Tie-break on order DESC for the edge case
// of two modules with the same activation Monday. The drop bar reflects
// borrador/publicado/en vivo state separately. The cron's own filter on
// `published_at` is server-side and unaffected by this helper.
export function resolveActiveDropForWeek(modules, weekMonday, baselineFirstMonday, baselineOrder = 0) {
  if (!Array.isArray(modules) || modules.length === 0) return null;
  const candidates = modules
    .map((m) => ({ m, activates: moduleActivationMonday(m, baselineFirstMonday, baselineOrder) }))
    .filter(({ activates }) => activates.getTime() <= weekMonday.getTime())
    .sort((a, b) => {
      const dt = b.activates.getTime() - a.activates.getTime();
      if (dt !== 0) return dt;
      return (b.m.order ?? 0) - (a.m.order ?? 0);
    });
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
