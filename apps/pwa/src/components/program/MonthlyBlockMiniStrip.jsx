// MonthlyBlockMiniStrip — pre-purchase mini calendar for cadenced courses
// (see docs/BRIEF_BLOCK_UX.md). Renders a horizontal strip of month tiles
// above the price/CTA in CourseDetail. The first tile is the live block
// (small dot grid, no week labels); the rest show only month name + block
// title + unlock date. The shape itself is the "monthly drops" explanation
// — no copy is added.
//
// Read-only and non-interactive. Uses the same /blocks-overview +
// /current-block payloads the Contenido calendar already consumes.
import React, { useMemo } from 'react';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const MONTH_NAMES_FULL = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];
const MONTH_NAMES_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function labelFor(iso, fallbackOffset = 0) {
  let d;
  if (iso) {
    const t = Date.parse(iso);
    d = Number.isFinite(t) ? new Date(t) : new Date();
  } else {
    d = new Date();
    d.setMonth(d.getMonth() + fallbackOffset);
  }
  const m = d.getMonth();
  return {
    full: MONTH_NAMES_FULL[m],
    short: `${d.getDate()} ${MONTH_NAMES_SHORT[m]}`,
  };
}

const styles = {
  wrap: {
    width: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
    paddingBottom: 8,
    marginBottom: 16,
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
  },
  row: {
    display: 'flex',
    gap: 12,
    minWidth: 'min-content',
  },
  tile: {
    flex: '0 0 auto',
    width: 160,
    minHeight: 150,
    padding: '16px 16px 14px',
    boxSizing: 'border-box',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    transition: `opacity 400ms ${SPRING}, transform 400ms ${SPRING}`,
  },
  tileMuted: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  monthLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2.2,
    color: 'rgba(255,255,255,0.92)',
    margin: 0,
  },
  monthLabelMuted: {
    color: 'rgba(255,255,255,0.32)',
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: -0.2,
    color: 'rgba(255,255,255,0.95)',
    margin: '6px 0 0',
    lineHeight: 1.2,
  },
  blockTitleMuted: {
    color: 'rgba(255,255,255,0.45)',
  },
  unlockChip: {
    marginTop: 'auto',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 0.3,
    color: 'rgba(255,255,255,0.55)',
    alignSelf: 'flex-end',
  },
  dotGrid: {
    marginTop: 'auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    rowGap: 6,
    columnGap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
};

export default function MonthlyBlockMiniStrip({ blocks, currentBlock, maxBlocks = 3 }) {
  const tiles = useMemo(() => {
    const ordered = [...(blocks || [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter((b) => !b.isPast)
      .slice(0, maxBlocks);
    return ordered;
  }, [blocks, maxBlocks]);

  if (!tiles.length) return null;

  const currentSessionCount = currentBlock?.sessions?.length ?? 0;
  // Display ~3 weeks of dots to suggest cadence without overwhelming the
  // pre-purchase tile. Falls back to 5×3 if session count is unknown.
  const dotCount = Math.min(15, Math.max(5, currentSessionCount * 3));

  return (
    <div style={styles.wrap}>
      <div style={styles.row}>
        {tiles.map((b) => {
          const muted = !b.isCurrent;
          const label = labelFor(b.unlocks_at ?? (b.isCurrent ? currentBlock?.started_at : null), b.order ?? 0);
          return (
            <div
              key={b.moduleId}
              style={{ ...styles.tile, ...(muted ? styles.tileMuted : null) }}
            >
              <p style={{ ...styles.monthLabel, ...(muted ? styles.monthLabelMuted : null) }}>{label.full}</p>
              {b.title ? (
                <h4 style={{ ...styles.blockTitle, ...(muted ? styles.blockTitleMuted : null) }}>{b.title}</h4>
              ) : null}
              {b.isCurrent ? (
                <div style={styles.dotGrid}>
                  {Array.from({ length: dotCount }).map((_, i) => (
                    <span key={i} style={styles.dot} />
                  ))}
                </div>
              ) : (
                <span style={styles.unlockChip}>{label.short}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
