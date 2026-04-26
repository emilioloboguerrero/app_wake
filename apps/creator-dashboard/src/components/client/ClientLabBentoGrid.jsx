import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';
import {
  Target, Trophy, Scale, Flame, Image as ImageIcon, X,
} from 'lucide-react';
import {
  BentoGrid, BentoCard, NumberTicker, GlowingEffect,
} from '../ui';
import MuscleSilhouetteSVG from '../MuscleSilhouetteSVG';
import './ClientLabBentoGrid.css';

const AXIS = { fill: 'rgba(255,255,255,0.25)', fontSize: 10 };
const GRID = { stroke: 'rgba(255,255,255,0.05)' };

const MUSCLE_LABELS = {
  pecs: 'Pectorales', front_delts: 'Del. Frontal', side_delts: 'Del. Lateral',
  rear_delts: 'Del. Posterior', triceps: 'Tríceps', traps: 'Trapecios',
  abs: 'Abdominales', lats: 'Dorsales', rhomboids: 'Romboides',
  biceps: 'Bíceps', forearms: 'Antebrazos', quads: 'Cuádriceps',
  glutes: 'Glúteos', hamstrings: 'Isquios', calves: 'Gemelos',
  hip_flexors: 'Flexores', obliques: 'Oblicuos', lower_back: 'Lumbar',
  neck: 'Cuello',
};

function muscleLabel(key) {
  return MUSCLE_LABELS[key] || key;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="clbg-tooltip">
      {label && <p className="clbg-tooltip-label">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="clbg-tooltip-value" style={{ color: p.stroke || p.fill }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </p>
      ))}
    </div>
  );
}

function TrendArrow({ value, suffix = '%' }) {
  if (value == null) return null;
  const cls = value > 0 ? 'clbg-trend--up' : value < 0 ? 'clbg-trend--down' : 'clbg-trend--neutral';
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';
  return (
    <span className={`clbg-trend ${cls}`}>{arrow} {Math.abs(value)}{suffix}</span>
  );
}

export default function ClientLabBentoGrid({ data, isLoading, accentRgb }) {
  // Always-call hooks first (must be unconditional for React rules-of-hooks).

  const volumeByMuscle = data?.volumeByMuscle || [];
  const volumeComparison = data?.volumeByMuscleComparison || [];
  const rpeAverage = data?.rpeAverage ?? null;
  const workoutAdherence = data?.workoutAdherence ?? data?.adherenceRate ?? null;
  const adherenceMode = data?.adherenceMode || null;
  const nutritionAdherence = data?.nutritionAdherence ?? null;
  const adherenceHeatmap = data?.adherenceHeatmap || [];
  const recentPRs = data?.recentPRs || [];
  const bodyWeight = data?.bodyWeight ?? null;
  const bodyProgress = data?.bodyProgress || [];
  const bodyPhotos = data?.bodyPhotos || [];
  const nutritionComparison = data?.nutritionComparison || {};
  const caloriesTrend = data?.caloriesTrend || [];

  // ── Volumen: SVG intensity from current-week sets ────────────
  // Falls back to whole-range totals when the comparison field isn't present.
  const muscleVolumes = useMemo(() => {
    const source = volumeComparison.length
      ? volumeComparison.map((m) => ({ muscle: m.muscle, sets: m.current }))
      : volumeByMuscle;
    if (!source.length) return null;
    const max = Math.max(...source.map((m) => m.sets || 0)) || 1;
    const map = {};
    for (const m of source) {
      map[m.muscle] = (m.sets || 0) / max;
    }
    return map;
  }, [volumeComparison, volumeByMuscle]);

  // Top rows for the legend — prefer the week-vs-prior comparison when we have it.
  const topMuscles = useMemo(() => {
    if (volumeComparison.length) {
      return [...volumeComparison]
        .sort((a, b) => (b.current || 0) - (a.current || 0))
        .slice(0, 6);
    }
    return [...volumeByMuscle]
      .sort((a, b) => (b.sets || 0) - (a.sets || 0))
      .slice(0, 6)
      .map((m) => ({ muscle: m.muscle, current: m.sets, prevAvg: 0, delta: null }));
  }, [volumeComparison, volumeByMuscle]);

  const maxCurrent = useMemo(() => {
    return Math.max(1, ...topMuscles.map((m) => m.current || 0));
  }, [topMuscles]);

  // ── Accent colors (recharts needs literal color strings) ─────
  const a = accentRgb || [255, 255, 255];
  const accentLine = `rgba(${a[0]},${a[1]},${a[2]},0.7)`;
  const accentFillStrong = `rgba(${a[0]},${a[1]},${a[2]},0.3)`;
  const accentFillSoft = `rgba(${a[0]},${a[1]},${a[2]},0.05)`;
  const accentDim = `rgba(${a[0]},${a[1]},${a[2]},0.25)`;

  // ── Adherencia: weekly trend + delta ────────────────────────
  const adherenceTrend = useMemo(() => {
    return adherenceHeatmap.map((w) => {
      const trained = (w.days || []).filter(Boolean).length;
      return { week: (w.weekStart || '').slice(5), pct: Math.round((trained / 7) * 100) };
    });
  }, [adherenceHeatmap]);

  const adherenceDelta = useMemo(() => {
    if (adherenceTrend.length < 2) return null;
    const half = Math.floor(adherenceTrend.length / 2);
    const first = adherenceTrend.slice(0, half);
    const last = adherenceTrend.slice(half);
    if (!first.length || !last.length) return null;
    const avg = (arr) => arr.reduce((s, x) => s + x.pct, 0) / arr.length;
    return Math.round(avg(last) - avg(first));
  }, [adherenceTrend]);

  const latestWeekDots = useMemo(() => {
    return adherenceHeatmap.length ? adherenceHeatmap[adherenceHeatmap.length - 1]?.days : null;
  }, [adherenceHeatmap]);

  // ── Peso: delta + photo lookup by date ──────────────────────
  const weightDelta = useMemo(() => {
    if (bodyProgress.length < 2) return null;
    const first = bodyProgress[0]?.weight;
    const last = bodyProgress[bodyProgress.length - 1]?.weight;
    if (first == null || last == null) return null;
    return Math.round((last - first) * 10) / 10;
  }, [bodyProgress]);

  // Accept three shapes from the API:
  //   1. urls: string[]
  //   2. urls: [{ url, photoId, storagePath, ... }]      (current write shape)
  //   3. urls: mixed
  // The analytics endpoint normalizes to (1) post-deploy; this client-side
  // normalization keeps things working without waiting on a function deploy.
  const photosByDate = useMemo(() => {
    const map = {};
    for (const p of bodyPhotos) {
      if (!p?.date) continue;
      const urls = (p.urls || [])
        .map((u) => {
          if (typeof u === 'string') return u;
          if (u && typeof u === 'object' && typeof u.url === 'string') return u.url;
          return null;
        })
        .filter(Boolean);
      if (urls.length > 0) map[p.date] = urls;
    }
    return map;
  }, [bodyPhotos]);

  const [showPhotos, setShowPhotos] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { date, urls }

  // ── Loading: per-card skeletons that mirror each card's shape ──
  if (isLoading) {
    return (
      <BentoGrid layout="client-lab" className="clbg-grid">
        <BentoCard area="VOL" className="clbg-card clbg-card--skeleton">
          <VolumenSkeleton />
        </BentoCard>
        <BentoCard area="ADH" className="clbg-card clbg-card--skeleton">
          <AdherenciaSkeleton />
        </BentoCard>
        <BentoCard area="PESO" className="clbg-card clbg-card--skeleton">
          <PesoSkeleton />
        </BentoCard>
        <BentoCard area="PRS" className="clbg-card clbg-card--skeleton">
          <PrsSkeleton />
        </BentoCard>
        <BentoCard area="NUT" className="clbg-card clbg-card--skeleton">
          <NutricionSkeleton />
        </BentoCard>
      </BentoGrid>
    );
  }

  return (
    <>
      <BentoGrid layout="client-lab" className="clbg-grid">
        {/* ── VOL: Volumen (full height, left) ─────────────────── */}
        <BentoCard area="VOL" className="clbg-card clbg-card--vol clbg-card--enter" style={{ animationDelay: '0ms' }}>
          <GlowingEffect spread={40} proximity={120} borderWidth={1} />
          <div className="clbg-card-inner clbg-vol-inner">
            <div className="clbg-card-header">
              <span className="clbg-card-label">Volumen</span>
              {rpeAverage != null && (
                <span className="clbg-vol-rpe">RPE prom {rpeAverage.toFixed(1)}</span>
              )}
            </div>

            {muscleVolumes ? (
              <>
                <div className="clbg-vol-svg">
                  <MuscleSilhouetteSVG
                    muscleVolumes={muscleVolumes}
                    accentRgb={accentRgb}
                  />
                </div>
                <div className="clbg-vol-sub">Esta semana vs últimas 3 semanas</div>
                <div className="clbg-vol-legend">
                  {topMuscles.map((m) => (
                    <div key={m.muscle} className="clbg-vol-row">
                      <span className="clbg-vol-row-name">{muscleLabel(m.muscle)}</span>
                      <div className="clbg-vol-row-bar">
                        <div
                          className="clbg-vol-row-fill"
                          style={{ width: `${((m.current || 0) / maxCurrent) * 100}%` }}
                        />
                      </div>
                      <span className="clbg-vol-row-val">{m.current ?? 0}</span>
                      <span className="clbg-vol-row-delta">
                        {m.delta != null ? <TrendArrow value={m.delta} /> : <span className="clbg-vol-row-new">nuevo</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="clbg-empty">Sin volumen registrado</div>
            )}
          </div>
        </BentoCard>

        {/* ── ADH: Adherencia ──────────────────────────────────── */}
        <BentoCard area="ADH" className="clbg-card clbg-card--enter" style={{ animationDelay: '60ms' }}>
          <GlowingEffect spread={30} proximity={100} borderWidth={1} />
          <div className="clbg-card-inner">
            <div className="clbg-card-header">
              <Target size={14} className="clbg-card-icon" />
              <span className="clbg-card-label">Adherencia</span>
            </div>

            <div className="clbg-card-hero">
              {workoutAdherence != null ? (
                <NumberTicker value={Math.round(workoutAdherence)} suffix="%" />
              ) : (
                <span className="clbg-empty-inline">—</span>
              )}
              <TrendArrow value={adherenceDelta} />
            </div>
            {adherenceMode === 'frequency' && workoutAdherence != null && (
              <div className="clbg-adh-mode">vs 4 días / semana</div>
            )}

            <div className="clbg-card-chart">
              {adherenceTrend.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={adherenceTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="adh-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={accentFillStrong} />
                        <stop offset="100%" stopColor={accentFillSoft} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} vertical={false} />
                    <XAxis dataKey="week" tick={AXIS} axisLine={false} tickLine={false} />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <Area
                      type="monotone"
                      dataKey="pct"
                      name="Adherencia"
                      stroke={accentLine}
                      strokeWidth={2}
                      fill="url(#adh-grad)"
                      animationDuration={900}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="clbg-empty-inline">Sin tendencia aún</div>
              )}
            </div>

            <div className="clbg-adh-foot">
              <div className="clbg-adh-nut">
                <span className="clbg-adh-nut-label">Nutrición</span>
                <div className="clbg-adh-nut-bar">
                  <div
                    className="clbg-adh-nut-fill"
                    style={{ width: `${nutritionAdherence ?? 0}%` }}
                  />
                </div>
                <span className="clbg-adh-nut-val">
                  {nutritionAdherence != null ? `${Math.round(nutritionAdherence)}%` : '—'}
                </span>
              </div>
              {latestWeekDots && (
                <div className="clbg-week-dots">
                  {latestWeekDots.map((on, i) => (
                    <div key={i} className={`clbg-week-dot ${on ? 'clbg-week-dot--on' : ''}`} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </BentoCard>

        {/* ── PESO: Peso + photo toggle ────────────────────────── */}
        <BentoCard area="PESO" className="clbg-card clbg-card--enter" style={{ animationDelay: '120ms' }}>
          <GlowingEffect spread={30} proximity={100} borderWidth={1} />
          <div className="clbg-card-inner">
            <div className="clbg-card-header">
              <Scale size={14} className="clbg-card-icon" />
              <span className="clbg-card-label">Peso</span>
              {bodyPhotos.length > 0 && (
                <button
                  type="button"
                  className={`clbg-photo-toggle ${showPhotos ? 'clbg-photo-toggle--on' : ''}`}
                  onClick={() => setShowPhotos((v) => !v)}
                >
                  <ImageIcon size={12} />
                  Fotos
                </button>
              )}
            </div>

            <div className="clbg-card-hero">
              {bodyWeight != null ? (
                <NumberTicker value={bodyWeight} suffix=" kg" decimals={1} />
              ) : (
                <span className="clbg-empty-inline">—</span>
              )}
              {weightDelta != null && weightDelta !== 0 && (
                <span className={`clbg-trend ${weightDelta < 0 ? 'clbg-trend--down' : 'clbg-trend--up'}`}>
                  {weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(1)} kg
                </span>
              )}
            </div>

            <div className="clbg-card-chart clbg-card-chart--tall">
              {bodyProgress.length >= 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bodyProgress} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID} vertical={false} />
                    <XAxis dataKey="date" tick={AXIS} axisLine={false} tickLine={false} hide />
                    <YAxis
                      domain={['dataMin - 1', 'dataMax + 1']}
                      tick={AXIS}
                      axisLine={false}
                      tickLine={false}
                      width={24}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      name="Peso"
                      stroke={accentLine}
                      strokeWidth={2}
                      dot={
                        showPhotos
                          ? (props) => (
                              <PhotoDot
                                {...props}
                                photos={photosByDate[props.payload?.date]}
                                onOpen={() =>
                                  setLightbox({
                                    date: props.payload?.date,
                                    urls: photosByDate[props.payload?.date] || [],
                                  })
                                }
                                accentLine={accentLine}
                              />
                            )
                          : { r: 2, fill: accentDim }
                      }
                      // When the Fotos toggle is on, disable the hover activeDot
                      // entirely — recharts paints it above the regular dot and
                      // swallows clicks. Without it, our dot's onClick fires.
                      activeDot={showPhotos ? false : { r: 4, fill: accentLine }}
                      animationDuration={1000}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="clbg-empty-inline">Sin registros aún</div>
              )}
            </div>
          </div>
        </BentoCard>

        {/* ── PRS: PRs Recientes ───────────────────────────────── */}
        <BentoCard area="PRS" className="clbg-card clbg-card--enter" style={{ animationDelay: '180ms' }}>
          <GlowingEffect spread={30} proximity={100} borderWidth={1} />
          <div className="clbg-card-inner">
            <div className="clbg-card-header">
              <Trophy size={14} className="clbg-card-icon" />
              <span className="clbg-card-label">PRs recientes</span>
            </div>

            {recentPRs.length > 0 ? (
              <div className="clbg-prs">
                {recentPRs.slice(0, 5).map((pr, i) => (
                  <div key={i} className={`clbg-pr ${i === 0 ? 'clbg-pr--lead' : ''}`}>
                    <div className="clbg-pr-name">{pr.exercise || pr.name}</div>
                    <div className="clbg-pr-meta">
                      <span className="clbg-pr-value">
                        {(pr.value ?? pr.weight)}kg
                        {pr.reps ? ` × ${pr.reps}` : ''}
                      </span>
                      {pr.percentChange != null && (
                        <TrendArrow value={Math.round(pr.percentChange * 10) / 10} suffix="%" />
                      )}
                      {pr.date && (
                        <span className="clbg-pr-date">{formatRelativeDate(pr.date)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="clbg-empty">Sin PRs en este período</div>
            )}
          </div>
        </BentoCard>

        {/* ── NUT: Nutrición ───────────────────────────────────── */}
        <BentoCard area="NUT" className="clbg-card clbg-card--enter" style={{ animationDelay: '240ms' }}>
          <GlowingEffect spread={30} proximity={100} borderWidth={1} />
          <div className="clbg-card-inner">
            <div className="clbg-card-header">
              <Flame size={14} className="clbg-card-icon" />
              <span className="clbg-card-label">Nutrición</span>
            </div>

            <div className="clbg-card-hero">
              {nutritionComparison.actualCalories != null ? (
                <>
                  <NumberTicker value={Math.round(nutritionComparison.actualCalories)} />
                  <span className="clbg-nut-target">
                    / {Math.round(nutritionComparison.targetCalories || 0)} kcal
                  </span>
                </>
              ) : (
                <span className="clbg-empty-inline">—</span>
              )}
            </div>

            <div className="clbg-nut-macros">
              <MacroBar
                label="P"
                actual={nutritionComparison.actualProtein}
                target={nutritionComparison.targetProtein}
                color="rgba(129,140,248,0.6)"
              />
              <MacroBar
                label="C"
                actual={nutritionComparison.actualCarbs}
                target={nutritionComparison.targetCarbs}
                color="rgba(251,191,36,0.6)"
              />
              <MacroBar
                label="G"
                actual={nutritionComparison.actualFat}
                target={nutritionComparison.targetFat}
                color="rgba(248,113,113,0.6)"
              />
            </div>

            <div className="clbg-card-chart clbg-card-chart--short">
              {caloriesTrend.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={caloriesTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <Line
                      type="monotone"
                      dataKey="actual"
                      stroke={accentLine}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive
                      animationDuration={900}
                    />
                    <Line
                      type="monotone"
                      dataKey="target"
                      stroke="rgba(255,255,255,0.18)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      dot={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="clbg-empty-inline">Sin tendencia</div>
              )}
            </div>
          </div>
        </BentoCard>
      </BentoGrid>

      {lightbox && (
        <PhotoLightbox lightbox={lightbox} onClose={() => setLightbox(null)} />
      )}
    </>
  );
}

// ── Macro bar ─────────────────────────────────────────────────
function MacroBar({ label, actual, target, color }) {
  if (actual == null && target == null) return null;
  const pct = target ? Math.min((actual / target) * 100, 110) : 0;
  return (
    <div className="clbg-macro">
      <span className="clbg-macro-label">{label}</span>
      <div className="clbg-macro-track">
        <div
          className="clbg-macro-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="clbg-macro-val">
        {actual != null ? Math.round(actual) : '—'}
        {target ? `/${Math.round(target)}` : ''}g
      </span>
    </div>
  );
}

// ── Photo dot for the weight chart ────────────────────────────
function PhotoDot({ cx, cy, photos, onOpen, accentLine }) {
  if (cx == null || cy == null) return null;
  const has = photos && photos.length > 0;
  if (!has) {
    return <circle cx={cx} cy={cy} r={2} fill="rgba(255,255,255,0.4)" />;
  }
  // Outer transparent disc gives a 16-px hit area that captures clicks even
  // where the visual ring is hollow. SVG ignores clicks on stroke-only and
  // fill="none" shapes by default, so we paint a fully-transparent fill on
  // a separate hit circle and force pointer-events:all on the group.
  return (
    <g
      style={{ cursor: 'pointer', pointerEvents: 'all' }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      role="button"
    >
      <circle cx={cx} cy={cy} r={16} fill="rgba(0,0,0,0)" />
      <circle cx={cx} cy={cy} r={11} fill="none" stroke={accentLine || 'rgba(255,255,255,0.5)'} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={6} fill={accentLine || 'rgba(255,255,255,0.9)'} />
    </g>
  );
}

// ── Lightbox ──────────────────────────────────────────────────
function PhotoLightbox({ lightbox, onClose }) {
  return (
    <div className="clbg-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button className="clbg-lightbox-close" onClick={onClose} aria-label="Cerrar">
        <X size={20} />
      </button>
      <div className="clbg-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <div className="clbg-lightbox-date">{lightbox.date}</div>
        <div className="clbg-lightbox-grid">
          {(lightbox.urls || []).map((url, i) => (
            <img key={i} src={url} alt={`Progreso ${lightbox.date}`} className="clbg-lightbox-img" />
          ))}
          {(!lightbox.urls || lightbox.urls.length === 0) && (
            <div className="clbg-empty">Sin fotos en este día</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Per-card skeletons ────────────────────────────────────────
// Each mirrors the shape of its rendered card so the layout doesn't
// shift when real data arrives. Uses the shared shimmer keyframe.

function CardHeaderSkel({ width = 90 }) {
  return (
    <div className="clbg-card-header">
      <span className="clbg-skel clbg-skel--icon" />
      <span className="clbg-skel clbg-skel--label" style={{ width }} />
    </div>
  );
}

function VolumenSkeleton() {
  return (
    <div className="clbg-card-inner clbg-vol-inner">
      <div className="clbg-card-header" style={{ justifyContent: 'space-between' }}>
        <span className="clbg-skel clbg-skel--label" style={{ width: 80 }} />
        <span className="clbg-skel clbg-skel--label" style={{ width: 90 }} />
      </div>
      <div className="clbg-vol-svg clbg-skel clbg-skel--silhouette" />
      <div className="clbg-skel clbg-skel--sub" />
      <div className="clbg-vol-legend">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="clbg-vol-row">
            <span className="clbg-skel clbg-skel--text" />
            <span className="clbg-skel clbg-skel--bar" />
            <span className="clbg-skel clbg-skel--num" />
            <span className="clbg-skel clbg-skel--chip" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AdherenciaSkeleton() {
  return (
    <div className="clbg-card-inner">
      <CardHeaderSkel width={80} />
      <div className="clbg-card-hero">
        <span className="clbg-skel clbg-skel--hero" />
        <span className="clbg-skel clbg-skel--chip" />
      </div>
      <div className="clbg-card-chart clbg-skel clbg-skel--chart" />
      <div className="clbg-adh-foot">
        <div className="clbg-adh-nut">
          <span className="clbg-skel clbg-skel--text" style={{ width: 60 }} />
          <span className="clbg-skel clbg-skel--bar" />
          <span className="clbg-skel clbg-skel--num" />
        </div>
        <div className="clbg-week-dots">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className="clbg-skel clbg-skel--dot" />
          ))}
        </div>
      </div>
    </div>
  );
}

function PesoSkeleton() {
  return (
    <div className="clbg-card-inner">
      <CardHeaderSkel width={50} />
      <div className="clbg-card-hero">
        <span className="clbg-skel clbg-skel--hero" />
        <span className="clbg-skel clbg-skel--chip" />
      </div>
      <div className="clbg-card-chart clbg-card-chart--tall clbg-skel clbg-skel--chart" />
    </div>
  );
}

function PrsSkeleton() {
  return (
    <div className="clbg-card-inner">
      <CardHeaderSkel width={110} />
      <div className="clbg-prs">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`clbg-pr ${i === 0 ? 'clbg-pr--lead' : ''}`}
          >
            <span className="clbg-skel clbg-skel--text" style={{ width: i === 0 ? '70%' : '60%' }} />
            <div className="clbg-pr-meta">
              <span className="clbg-skel clbg-skel--num" />
              <span className="clbg-skel clbg-skel--chip" />
              <span className="clbg-skel clbg-skel--text" style={{ width: 60, marginLeft: 'auto' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NutricionSkeleton() {
  return (
    <div className="clbg-card-inner">
      <CardHeaderSkel width={75} />
      <div className="clbg-card-hero">
        <span className="clbg-skel clbg-skel--hero" />
        <span className="clbg-skel clbg-skel--text" style={{ width: 70 }} />
      </div>
      <div className="clbg-nut-macros">
        {[0, 1, 2].map((i) => (
          <div key={i} className="clbg-macro">
            <span className="clbg-skel clbg-skel--num" style={{ width: 14 }} />
            <span className="clbg-skel clbg-skel--bar" />
            <span className="clbg-skel clbg-skel--num" style={{ width: 56 }} />
          </div>
        ))}
      </div>
      <div className="clbg-card-chart clbg-card-chart--short clbg-skel clbg-skel--chart" />
    </div>
  );
}

// ── Date helpers ──────────────────────────────────────────────
function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days}d`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'hace 1 sem' : `hace ${weeks} sem`;
  }
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
}
