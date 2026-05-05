// Nutrition card.
//
// Front — modeled after the creator app's right-panel macros block:
//   • big centered calorie value with "kcal" suffix and a faint "de TARGET" line
//   • three macro rings (protein/carbs/fat) stacked, each with grams
//   • the session/coach image sits behind everything at low opacity, and the card's
//     accent color (extracted from that image) drives ring fills.
//
// Back — "Hace 7 días" review:
//   • one prominent adherence chart (overall %) tinted with the accent
//   • compact line graphs for calories and each macro vs. target
//   • "Registrar comida" CTA at the bottom
//
// 3D flip on tap (not on the CTA). Both faces share the accent CSS vars.

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getDiaryEntriesInRange } from '../services/nutritionFirestoreService';
import { useAccentFromImage } from '../hooks/hoy/useAccentFromImage';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const TRACK = 'rgba(255,255,255,0.08)';

const PROTEIN_COLOR = 'rgba(100,200,150,0.85)';
const CARBS_COLOR = 'rgba(100,160,240,0.85)';
const FAT_COLOR = 'rgba(240,160,80,0.85)';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const styles = {
  outer: {
    width: '100%',
    height: '100%',
    perspective: 2400,
    cursor: 'pointer',
  },
  inner: {
    position: 'relative',
    width: '100%',
    height: '100%',
    transformStyle: 'preserve-3d',
    transition: `transform 700ms ${SPRING}`,
  },
  face: {
    position: 'absolute',
    inset: 0,
    borderRadius: 24,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  back: {
    transform: 'rotateY(180deg)',
    border: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    flexDirection: 'column',
  },

  // Backdrop image (front only)
  image: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: 0,
    pointerEvents: 'none',
    transition: `opacity 600ms ${SPRING}`,
  },
  imageLoaded: { opacity: 0.32 },
  imageOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(26,26,26,0.55) 0%, rgba(26,26,26,0.85) 100%)',
    pointerEvents: 'none',
  },

  // Front layout
  frontBody: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: 28,
    color: '#fff',
    gap: 24,
  },
  kicker: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },

  caloriesBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
  },
  caloriesRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
  },
  caloriesValue: {
    fontSize: 56,
    fontWeight: 800,
    letterSpacing: -1.5,
    lineHeight: 1,
    color: '#fff',
    fontVariantNumeric: 'tabular-nums',
  },
  caloriesUnit: {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.4,
  },
  caloriesTarget: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.2,
    fontVariantNumeric: 'tabular-nums',
  },

  ringsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    flex: 1,
    justifyContent: 'center',
  },
  ringRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  ringInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  ringLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  ringGrams: {
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
    fontVariantNumeric: 'tabular-nums',
  },
  ringTarget: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontVariantNumeric: 'tabular-nums',
  },

  expiredBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: '6px 12px',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    border: '1px solid rgba(255,255,255,0.15)',
    zIndex: 2,
  },

  // Back layout
  backBody: {
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    color: '#fff',
    gap: 18,
    minHeight: 0,
  },
  backHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  backTitle: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: -0.3,
    color: '#fff',
  },
  chartsBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    flex: 1,
    minHeight: 0,
  },
  chart: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  chartHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  chartLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.3,
  },
  chartScore: {
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: -0.2,
  },
  chartScoreEmpty: {
    color: 'rgba(255,255,255,0.35)',
    fontWeight: 600,
    fontSize: 12,
  },
  chartPlot: {
    width: '100%',
    display: 'block',
  },
  miniRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
  },
  miniChart: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  miniLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },

  beginButton: {
    height: 56,
    width: '100%',
    borderRadius: 14,
    backgroundColor: '#fff',
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0.3,
    border: 'none',
    cursor: 'pointer',
  },
};

const formatNumber = (n) => Math.round(Number(n || 0)).toLocaleString('es-CO');
const clampPct = (n, t) => (t > 0 ? Math.min(1, Math.max(0, n / t)) : 0);

// ── Macro ring ────────────────────────────────────────────────────────────
const MacroRing = ({ size = 60, stroke = 5, value, target, color }) => {
  const center = size / 2;
  const r = center - stroke / 2;
  const c = 2 * Math.PI * r;
  const pct = clampPct(value, target);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={center} cy={center} r={r} stroke={TRACK} strokeWidth={stroke} fill="none" />
      <circle
        cx={center}
        cy={center}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: `stroke-dashoffset 700ms ${SPRING}` }}
      />
    </svg>
  );
};

const MacroRow = ({ label, value, target, color }) => (
  <div style={styles.ringRow}>
    <MacroRing size={60} stroke={5} value={value} target={target} color={color} />
    <div style={styles.ringInfo}>
      <span style={styles.ringLabel}>{label}</span>
      <span style={styles.ringGrams}>{formatNumber(value)} g</span>
      <span style={styles.ringTarget}>de {formatNumber(target)} g</span>
    </div>
  </div>
);

// Fritsch–Carlson monotone cubic interpolation → smooth SVG path through points,
// matching the creator dashboard's recharts `type="monotone"` curve.
const buildMonotonePath = (pts) => {
  const n = pts.length;
  if (n < 2) return '';
  if (n === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
  const dx = new Array(n - 1);
  const m = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    m[i] = (pts[i + 1].y - pts[i].y) / (dx[i] || 1);
  }
  const t = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (t[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
};

// ── Line graph (matches WeekCoachCard's visual language) ─────────────────
const LineGraph = ({ points, height = 40, accent = true }) => {
  const W = 100;
  const H = height;
  const PAD_X = 3;
  const PAD_Y = 4;
  const n = points.length;
  if (n === 0) return null;
  const xFor = (i) => (n <= 1 ? W / 2 : PAD_X + (i / (n - 1)) * (W - 2 * PAD_X));
  const yFor = (v) => PAD_Y + (1 - v) * (H - 2 * PAD_Y);

  const segments = [];
  let current = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push({ x: xFor(i), y: yFor(p.value), i });
  });
  if (current.length > 0) segments.push(current);

  const stroke = accent ? 'var(--accent, rgba(255,255,255,0.9))' : 'rgba(255,255,255,0.85)';
  const areaFill = accent ? 'var(--accent, rgba(255,255,255,0.85))' : 'rgba(255,255,255,0.85)';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ ...styles.chartPlot, height }} aria-hidden>
      <line
        x1={0}
        y1={H - PAD_Y}
        x2={W}
        y2={H - PAD_Y}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={0.4}
        vectorEffect="non-scaling-stroke"
      />
      {segments.map((seg, idx) => {
        if (seg.length < 2) return null;
        const linePath = buildMonotonePath(seg);
        const first = seg[0];
        const last = seg[seg.length - 1];
        const areaPath = `${linePath} L ${last.x},${H - PAD_Y} L ${first.x},${H - PAD_Y} Z`;
        return <path key={`a-${idx}`} d={areaPath} fill={areaFill} fillOpacity={0.18} />;
      })}
      {segments.map((seg, idx) => {
        if (seg.length < 2) return null;
        return (
          <path
            key={`l-${idx}`}
            d={buildMonotonePath(seg)}
            fill="none"
            stroke={stroke}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
};

const AdherenceLineChart = ({ label, score, points, height = 56 }) => {
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  return (
    <div style={styles.chart}>
      <div style={styles.chartHeader}>
        <span style={styles.chartLabel}>{label}</span>
        {hasScore ? (
          <span style={styles.chartScore}>{Math.max(0, Math.min(100, score))}%</span>
        ) : (
          <span style={styles.chartScoreEmpty}>—</span>
        )}
      </div>
      <LineGraph points={points} height={height} accent />
    </div>
  );
};

const MiniLineChart = ({ label, points, color }) => (
  <div style={styles.miniChart}>
    <span style={styles.miniLabel}>{label}</span>
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" style={{ width: '100%', height: 24 }} aria-hidden>
      {(() => {
        const pts = points.map((p, i) => ({
          x: 3 + (i / Math.max(1, points.length - 1)) * 94,
          y: p.value == null ? null : 4 + (1 - p.value) * 16,
        }));
        const segments = [];
        let cur = [];
        pts.forEach((p) => {
          if (p.y == null) { if (cur.length) segments.push(cur); cur = []; }
          else cur.push(p);
        });
        if (cur.length) segments.push(cur);
        return (
          <>
            {segments.map((seg, i) => {
              if (seg.length < 2) return null;
              return (
                <path
                  key={i}
                  d={buildMonotonePath(seg)}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </>
        );
      })()}
    </svg>
  </div>
);

// ── Date helpers ──────────────────────────────────────────────────────────
const toYYYYMMDD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// ── Component ─────────────────────────────────────────────────────────────
const TodayNutritionCard = ({
  imageUrl,
  nutritionPlanName,
  caloriesConsumed = 0,
  caloriesTarget = 2100,
  proteinConsumed = 0,
  proteinTarget = 150,
  carbsConsumed = 0,
  carbsTarget = 250,
  fatConsumed = 0,
  fatTarget = 70,
  isExpired = false,
  onLogMeal,
}) => {
  const { user } = useAuth();
  const [flipped, setFlipped] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const accent = useAccentFromImage(imageUrl);
  const accentVarsStyle = accent
    ? {
        '--accent': accent.accent,
        '--accent-r': accent.accentR,
        '--accent-g': accent.accentG,
        '--accent-b': accent.accentB,
        '--accent-text': accent.accentText,
      }
    : {};

  const handleFlip = (e) => { e?.stopPropagation?.(); setFlipped((f) => !f); };
  const handleLogMeal = (e) => { e?.stopPropagation?.(); onLogMeal?.(); };

  // Last 7 days ending today.
  const { weekDays, startYmd, endYmd, todayIndex } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - 6 + i);
      return d;
    });
    return {
      weekDays: days,
      startYmd: toYYYYMMDD(days[0]),
      endYmd: toYYYYMMDD(days[6]),
      todayIndex: 6,
    };
  }, []);

  const enabledForWeek = !!user?.uid && flipped; // only fetch when the back face is shown
  const { data: weekEntries } = useQuery({
    queryKey: ['hoy', 'nutritionWeek', user?.uid, startYmd, endYmd],
    queryFn: () => getDiaryEntriesInRange(user.uid, startYmd, endYmd),
    enabled: enabledForWeek,
    staleTime: 60 * 1000,
  });

  const { adherencePoints, caloriesPoints, proteinPoints, carbsPoints, fatPoints, adherenceScore } = useMemo(() => {
    const byDay = new Map();
    (weekEntries || []).forEach((e) => {
      const ymd = String(e.date || '').slice(0, 10);
      if (!ymd) return;
      const acc = byDay.get(ymd) || { calories: 0, protein: 0, carbs: 0, fat: 0 };
      acc.calories += Number(e.calories) || 0;
      acc.protein += Number(e.protein) || 0;
      acc.carbs += Number(e.carbs) || 0;
      acc.fat += Number(e.fat) || 0;
      byDay.set(ymd, acc);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ad = [];
    const cal = [];
    const prot = [];
    const carb = [];
    const fat = [];

    weekDays.forEach((d, i) => {
      const ymd = toYYYYMMDD(d);
      const totals = byDay.get(ymd) || { calories: 0, protein: 0, carbs: 0, fat: 0 };
      const isToday = isSameDay(d, today);
      const label = DAY_LABELS[(d.getDay() + 6) % 7];
      // Per-day adherence is the avg of capped ratios across the four targets we have.
      const ratios = [];
      if (caloriesTarget > 0) ratios.push(clampPct(totals.calories, caloriesTarget));
      if (proteinTarget > 0) ratios.push(clampPct(totals.protein, proteinTarget));
      if (carbsTarget > 0) ratios.push(clampPct(totals.carbs, carbsTarget));
      if (fatTarget > 0) ratios.push(clampPct(totals.fat, fatTarget));
      const adherence = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
      ad.push({ label, value: adherence, isToday });
      cal.push({ label, value: caloriesTarget > 0 ? clampPct(totals.calories, caloriesTarget) : null, isToday });
      prot.push({ label, value: proteinTarget > 0 ? clampPct(totals.protein, proteinTarget) : null, isToday });
      carb.push({ label, value: carbsTarget > 0 ? clampPct(totals.carbs, carbsTarget) : null, isToday });
      fat.push({ label, value: fatTarget > 0 ? clampPct(totals.fat, fatTarget) : null, isToday });
    });

    const validAdherence = ad.slice(0, todayIndex + 1).filter((p) => p.value != null);
    const score = validAdherence.length
      ? Math.round((validAdherence.reduce((a, b) => a + b.value, 0) / validAdherence.length) * 100)
      : null;

    return {
      adherencePoints: ad,
      caloriesPoints: cal,
      proteinPoints: prot,
      carbsPoints: carb,
      fatPoints: fat,
      adherenceScore: score,
    };
  }, [weekEntries, weekDays, caloriesTarget, proteinTarget, carbsTarget, fatTarget, todayIndex]);

  return (
    <div style={{ ...styles.outer, ...accentVarsStyle }} role="button" tabIndex={0}>
      <div style={{ ...styles.inner, transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
        {/* FRONT */}
        <div style={styles.face} onClick={handleFlip}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              style={imageLoaded ? { ...styles.image, ...styles.imageLoaded } : styles.image}
              onLoad={() => setImageLoaded(true)}
            />
          ) : null}
          <div style={styles.imageOverlay} />
          <div style={styles.frontBody}>
            {nutritionPlanName ? <span style={styles.kicker}>{nutritionPlanName}</span> : null}

            <div style={styles.caloriesBlock}>
              <div style={styles.caloriesRow}>
                <span style={styles.caloriesValue}>{formatNumber(caloriesConsumed)}</span>
                <span style={styles.caloriesUnit}>kcal</span>
              </div>
              <span style={styles.caloriesTarget}>de {formatNumber(caloriesTarget)} kcal</span>
            </div>

            <div style={styles.ringsList}>
              <MacroRow label="Proteína" value={proteinConsumed} target={proteinTarget} color={PROTEIN_COLOR} />
              <MacroRow label="Carbohidratos" value={carbsConsumed} target={carbsTarget} color={CARBS_COLOR} />
              <MacroRow label="Grasa" value={fatConsumed} target={fatTarget} color={FAT_COLOR} />
            </div>
          </div>
          {isExpired ? <div style={styles.expiredBadge}>Expirado</div> : null}
        </div>

        {/* BACK */}
        <div style={{ ...styles.face, ...styles.back }} onClick={handleFlip}>
          <div style={styles.backBody}>
            <div style={styles.backHeader}>
              {nutritionPlanName ? <span style={styles.kicker}>{nutritionPlanName}</span> : null}
              <span style={styles.backTitle}>Hace 7 días</span>
            </div>

            <div style={styles.chartsBlock}>
              <AdherenceLineChart label="Adherencia" score={adherenceScore} points={adherencePoints} height={56} />
              <AdherenceLineChart
                label="Calorías"
                score={
                  caloriesTarget > 0 && caloriesPoints.length
                    ? Math.round(
                        (caloriesPoints.slice(0, todayIndex + 1)
                          .filter((p) => p.value != null)
                          .reduce((a, b) => a + b.value, 0) /
                          Math.max(1, caloriesPoints.slice(0, todayIndex + 1).filter((p) => p.value != null).length)) *
                          100,
                      )
                    : null
                }
                points={caloriesPoints}
                height={48}
              />
              <div style={styles.miniRow}>
                <MiniLineChart label="Proteína" points={proteinPoints} color={PROTEIN_COLOR} />
                <MiniLineChart label="Carbs" points={carbsPoints} color={CARBS_COLOR} />
                <MiniLineChart label="Grasa" points={fatPoints} color={FAT_COLOR} />
              </div>
            </div>

            <button style={styles.beginButton} onClick={handleLogMeal}>
              Registrar comida
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodayNutritionCard;
