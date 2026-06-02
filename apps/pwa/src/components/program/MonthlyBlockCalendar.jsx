// MonthlyBlockCalendar — Contenido layout for `block_cadence: 'monthly_first_monday'`
// courses. Renders one card per block: the current block as a 4-week dot grid
// (rows = week, columns = L M X J V), future blocks as a muted title + unlock date.
//
// Design rules locked by docs/BRIEF_BLOCK_UX.md:
//   - calendar shape is the affordance — no instructional copy
//   - white-only tones (no gold, no brand color); accent only when image exists
//   - spring easing cubic-bezier(0.22,1,0.36,1); fade + translateY(24px) entrance
//
// Only session dots inside the current block are interactive. Tapping a dot
// jumps into DailyWorkout with the session pre-selected (same nav payload the
// legacy structure list used).
//
// Web-only on purpose: native uses the legacy list view in CourseStructureScreen.
import React, { useMemo } from 'react';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';
// Full week: L M X J V S D. Programs that don't use every day (e.g. Bejarano's
// 5-day split) render empty cells on the unused days — no column hiding, so
// every course feels visually consistent.
const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DAYS_PER_WEEK = 7;
const MONTH_NAMES_FULL = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];
const MONTH_NAMES_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function monthLabelFor(isoOrNull, fallbackOffset = 0) {
  let d;
  if (isoOrNull) {
    const t = Date.parse(isoOrNull);
    d = Number.isFinite(t) ? new Date(t) : new Date();
  } else {
    d = new Date();
    d.setMonth(d.getMonth() + fallbackOffset);
  }
  const m = d.getMonth();
  const y = d.getFullYear();
  return {
    full: `${MONTH_NAMES_FULL[m]} ${y}`,
    short: `${d.getDate()} ${MONTH_NAMES_SHORT[m]}`,
    date: d,
  };
}

const styles = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    width: '100%',
    paddingBottom: 24,
  },
  card: {
    width: '100%',
    padding: '24px 24px 22px',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: '#fff',
    boxSizing: 'border-box',
    opacity: 0,
    transform: 'translateY(24px)',
    transition: `opacity 600ms ${SPRING}, transform 600ms ${SPRING}`,
  },
  cardIn: {
    opacity: 1,
    transform: 'translateY(0)',
  },
  cardMuted: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  monthLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2.4,
    color: 'rgba(255,255,255,0.92)',
    margin: 0,
  },
  monthLabelMuted: {
    color: 'rgba(255,255,255,0.32)',
  },
  blockTitle: {
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: -0.3,
    color: 'rgba(255,255,255,0.95)',
    margin: '8px 0 0',
    lineHeight: 1.2,
  },
  blockTitleMuted: {
    color: 'rgba(255,255,255,0.45)',
  },
  unlockRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 18,
  },
  unlockChip: {
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: 0.4,
    color: 'rgba(255,255,255,0.55)',
  },
  grid: {
    marginTop: 22,
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr) auto',
    columnGap: 8,
    rowGap: 14,
    alignItems: 'center',
  },
  dayHeader: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 1.6,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.45)',
    paddingBottom: 6,
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.32)',
    textAlign: 'left',
    paddingLeft: 12,
    whiteSpace: 'nowrap',
  },
  dotCell: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotButton: {
    width: 18,
    height: 18,
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.22)',
    background: 'transparent',
    padding: 0,
    cursor: 'pointer',
    transition: `transform 200ms ${SPRING}, background-color 200ms ${SPRING}, border-color 200ms ${SPRING}`,
  },
  dotDone: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.92)',
  },
  dotEmpty: {
    cursor: 'default',
    backgroundColor: 'transparent',
    border: '1px dashed rgba(255,255,255,0.12)',
  },
  emptyState: {
    marginTop: 18,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
};

function renderCard({ children, muted, index, entered, key }) {
  const cardStyle = {
    ...styles.card,
    ...(muted ? styles.cardMuted : null),
    ...(entered ? styles.cardIn : null),
    transitionDelay: `${index * 60}ms`,
  };
  return (
    <div key={key} style={cardStyle}>
      {children}
    </div>
  );
}

function CurrentBlockCard({ block, sessions, completionByKey, onPressSession, index, entered }) {
  const monthInfo = useMemo(
    () => monthLabelFor(block?.started_at || block?.unlocks_at, 0),
    [block?.started_at, block?.unlocks_at]
  );
  // Bucket sessions by dayIndex 1..7 (L M X J V S D). Programs that use fewer
  // days render dashed empty cells on unused columns — no column hiding, so the
  // shape stays uniform across courses.
  const sessionsByDay = useMemo(() => {
    const map = new Map();
    (sessions || []).forEach((s) => {
      const dayIndex = typeof s.dayIndex === 'number' ? s.dayIndex : null;
      if (dayIndex === null || dayIndex < 1 || dayIndex > DAYS_PER_WEEK) return;
      if (!map.has(dayIndex)) map.set(dayIndex, s);
    });
    return map;
  }, [sessions]);

  const hasAnySession = sessionsByDay.size > 0;
  const weeks = [0, 1, 2, 3];
  const days = Array.from({ length: DAYS_PER_WEEK }, (_, i) => i + 1);

  // A session is "done" in week W when sessionHistory has a completion of the
  // matching sessionId between blockStart + W*7d and blockStart + (W+1)*7d.
  // The completionByKey map is keyed `${sessionId}__${weekIndex}` (cheap to
  // compute once in the parent) so dot rendering stays a simple lookup.
  return renderCard({
    key: block.moduleId,
    muted: false,
    index,
    entered,
    children: (
      <>
        <p style={styles.monthLabel}>{monthInfo.full}</p>
        {block?.title ? <h3 style={styles.blockTitle}>{block.title}</h3> : null}
        {hasAnySession ? (
          <div style={styles.grid}>
            {days.map((d) => (
              <div key={`h-${d}`} style={styles.dayHeader}>{DAY_LABELS[d - 1]}</div>
            ))}
            <div />
            {weeks.map((w) => (
              <React.Fragment key={`w-${w}`}>
                {days.map((d) => {
                  const session = sessionsByDay.get(d);
                  if (!session) {
                    return <div key={`c-${w}-${d}`} style={styles.dotCell}>
                      <span style={{ ...styles.dotButton, ...styles.dotEmpty }} />
                    </div>;
                  }
                  const key = `${session.id || session.sessionId}__${w}`;
                  const done = !!completionByKey?.[key];
                  return (
                    <div key={`c-${w}-${d}`} style={styles.dotCell}>
                      <button
                        type="button"
                        aria-label={`Semana ${w + 1} · ${DAY_LABELS[d - 1]} · ${session.title}${done ? ' · completada' : ''}`}
                        style={{ ...styles.dotButton, ...(done ? styles.dotDone : null) }}
                        onClick={() => onPressSession?.(session)}
                      />
                    </div>
                  );
                })}
                <span style={styles.rowLabel}>semana {w + 1}</span>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div style={styles.emptyState}>Sin sesiones publicadas</div>
        )}
      </>
    ),
  });
}

function FutureBlockCard({ block, index, entered }) {
  const monthInfo = useMemo(
    () => monthLabelFor(block?.unlocks_at, index),
    [block?.unlocks_at, index]
  );
  return renderCard({
    key: block.moduleId,
    muted: true,
    index,
    entered,
    children: (
      <>
        <p style={{ ...styles.monthLabel, ...styles.monthLabelMuted }}>{monthInfo.full}</p>
        {block?.title ? (
          <h3 style={{ ...styles.blockTitle, ...styles.blockTitleMuted }}>{block.title}</h3>
        ) : null}
        <div style={styles.unlockRow}>
          <span style={styles.unlockChip}>{monthInfo.short}</span>
        </div>
      </>
    ),
  });
}

/**
 * MonthlyBlockCalendar
 *
 * Props:
 *   blocks: [{ moduleId, order, title, unlocks_at, isCurrent, isPast, isFuture }]
 *   currentBlock: { moduleId, started_at, sessions: [...] } | null
 *   completedSessions: [{ sessionId, completedAt }]
 *   onPressSession: (session) => void
 *   entered: boolean  // controls fade/translate entrance
 */
export default function MonthlyBlockCalendar({
  blocks,
  currentBlock,
  completedSessions,
  onPressSession,
  entered = true,
}) {
  // Pre-bucket completions: key by `${sessionId}__${weekIndex}` relative to the
  // current block's started_at. Only completions belonging to the current block
  // contribute — past blocks are rendered separately and don't show dots.
  const completionByKey = useMemo(() => {
    if (!currentBlock?.started_at || !currentBlock?.sessions?.length) return {};
    const startMs = Date.parse(currentBlock.started_at);
    if (!Number.isFinite(startMs)) return {};
    const sessionIds = new Set(currentBlock.sessions.map((s) => s.id || s.sessionId));
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const out = {};
    (completedSessions || []).forEach((c) => {
      const sid = c.sessionId || c.session_id;
      if (!sid || !sessionIds.has(sid)) return;
      const completedAt = c.completedAt || c.completed_at || c.date;
      const t = typeof completedAt === 'string' ? Date.parse(completedAt) :
        (completedAt?.toMillis?.() ?? NaN);
      if (!Number.isFinite(t)) return;
      const weekIndex = Math.floor((t - startMs) / WEEK_MS);
      if (weekIndex < 0 || weekIndex > 3) return;
      out[`${sid}__${weekIndex}`] = true;
    });
    return out;
  }, [currentBlock?.started_at, currentBlock?.sessions, completedSessions]);

  const ordered = useMemo(() => {
    return [...(blocks || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [blocks]);

  if (!ordered.length) return null;

  return (
    <div style={styles.list}>
      {ordered.map((b, i) => {
        if (b.isPast) return null; // past blocks are completed history; design hides them
        if (b.isCurrent) {
          return (
            <CurrentBlockCard
              key={b.moduleId}
              block={{
                ...b,
                started_at: currentBlock?.started_at ?? null,
              }}
              sessions={currentBlock?.sessions ?? []}
              completionByKey={completionByKey}
              onPressSession={onPressSession}
              index={i}
              entered={entered}
            />
          );
        }
        return (
          <FutureBlockCard
            key={b.moduleId}
            block={b}
            index={i}
            entered={entered}
          />
        );
      })}
    </div>
  );
}

export const MonthlyBlockCalendarTokens = { MONTH_NAMES_FULL, MONTH_NAMES_SHORT, DAY_LABELS };
