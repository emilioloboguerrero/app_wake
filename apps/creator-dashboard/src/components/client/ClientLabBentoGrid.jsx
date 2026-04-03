import { useMemo } from 'react';
import { BentoGrid, BentoCard } from '../ui';
import { NumberTicker, ProgressRing } from '../ui';
import { GlowingEffect } from '../ui';
import {
  Target, Trophy, Scale, BarChart3, Flame, Activity, Heart,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import { ShimmerSkeleton } from '../ui';
import './ClientLabBentoGrid.css';

// ── Sparkline: tiny inline chart ──────────────────────────────
function Sparkline({ data, dataKey = 'value', color = 'rgba(255,255,255,0.4)', height = 32 }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={true}
          animationDuration={1200}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Trend indicator ───────────────────────────────────────────
function TrendBadge({ value, suffix = '%' }) {
  if (value == null) return null;
  const isUp = value > 0;
  const isDown = value < 0;
  const cls = isUp ? 'clbg-trend--up' : isDown ? 'clbg-trend--down' : 'clbg-trend--neutral';
  const arrow = isUp ? '↑' : isDown ? '↓' : '→';
  return (
    <span className={`clbg-trend ${cls}`}>
      {arrow} {Math.abs(value)}{suffix}
    </span>
  );
}

// ── Mini adherence heatmap (7 dots) ───────────────────────────
function WeekDots({ days }) {
  if (!days?.length) return null;
  return (
    <div className="clbg-week-dots">
      {days.map((active, i) => (
        <div
          key={i}
          className={`clbg-week-dot ${active ? 'clbg-week-dot--active' : ''}`}
        />
      ))}
    </div>
  );
}

// ── Skeleton card for loading state ───────────────────────────
function BentoSkeleton({ area }) {
  return (
    <BentoCard area={area} className="clbg-card clbg-card--skeleton">
      <div className="clbg-card-inner">
        <ShimmerSkeleton width={60} height={12} />
        <ShimmerSkeleton width={80} height={28} style={{ marginTop: 8 }} />
        <ShimmerSkeleton width="100%" height={32} style={{ marginTop: 12 }} />
      </div>
    </BentoCard>
  );
}

export default function ClientLabBentoGrid({ data, isLoading, range }) {
  // ── Derived values ────────────────────────────────────────────
  const workoutAdherence = data?.workoutAdherence ?? data?.adherenceRate ?? data?.completionRate ?? null;
  const nutritionAdherence = data?.nutritionAdherence ?? null;
  const recentPRs = data?.recentPRs || [];
  const latestPR = recentPRs[0] || data?.latestPR || null;
  const bodyWeight = data?.bodyWeight ?? null;
  const weightTrend = data?.bodyProgress || [];
  const volumeByMuscle = data?.volumeByMuscle || [];
  const nutritionComparison = data?.nutritionComparison || {};
  const rpeAverage = data?.rpeAverage ?? null;
  const rpeTrend = data?.rpeTrend || [];
  const readinessAvg = data?.readinessAvg ?? null;
  const readinessBreakdown = data?.readinessBreakdown || [];
  const adherenceHeatmap = data?.adherenceHeatmap || [];
  const weeklyVolume = data?.weeklyVolume || [];

  // Latest week dots for adherence
  const latestWeekDots = useMemo(() => {
    if (adherenceHeatmap.length) return adherenceHeatmap[adherenceHeatmap.length - 1]?.days;
    return null;
  }, [adherenceHeatmap]);

  // Radar data for muscle volume
  const radarData = useMemo(() => {
    if (!volumeByMuscle.length) return [];
    return volumeByMuscle.map(m => ({
      muscle: m.muscle,
      sets: m.sets,
    }));
  }, [volumeByMuscle]);

  // Avg macros
  const avgCalories = nutritionComparison?.actualCalories ?? null;
  const targetCalories = nutritionComparison?.targetCalories ?? null;
  const macros = nutritionComparison;

  if (isLoading) {
    return (
      <BentoGrid layout="7-panel" className="clbg-grid">
        {['A','B','C','D','E','F','G'].map(area => (
          <BentoSkeleton key={area} area={area} />
        ))}
      </BentoGrid>
    );
  }

  return (
    <BentoGrid layout="7-panel" className="clbg-grid">
      {/* A — Adherencia */}
      <BentoCard area="A" className="clbg-card clbg-card--enter" style={{ animationDelay: '0ms' }}>
        <GlowingEffect spread={30} proximity={100} borderWidth={1} />
        <div className="clbg-card-inner">
          <div className="clbg-card-header">
            <Target size={14} className="clbg-card-icon" />
            <span className="clbg-card-label">Adherencia</span>
          </div>
          <div className="clbg-card-value">
            {workoutAdherence != null ? (
              <NumberTicker value={Math.round(workoutAdherence)} suffix="%" />
            ) : (
              <span className="clbg-card-no-data">--</span>
            )}
          </div>
          {nutritionAdherence != null && (
            <div className="clbg-card-secondary" style={{ color: 'rgba(129,140,248,0.85)', fontSize: '0.75rem', marginTop: 2 }}>
              Nutricion: {Math.round(nutritionAdherence)}%
            </div>
          )}
          <WeekDots days={latestWeekDots} />
        </div>
      </BentoCard>

      {/* B — PRs Recientes (spans 2 cols) */}
      <BentoCard area="B" className="clbg-card clbg-card--enter" style={{ animationDelay: '50ms' }}>
        <GlowingEffect spread={30} proximity={100} borderWidth={1} />
        <div className="clbg-card-inner">
          <div className="clbg-card-header">
            <Trophy size={14} className="clbg-card-icon" />
            <span className="clbg-card-label">PRs Recientes</span>
          </div>
          {latestPR ? (
            <div className="clbg-prs">
              <div className="clbg-pr-main">
                <span className="clbg-pr-name">{latestPR.exercise || latestPR.name}</span>
                <span className="clbg-pr-value">
                  <NumberTicker value={latestPR.value || latestPR.weight} suffix="kg" />
                </span>
                {latestPR.percentChange != null && (
                  <TrendBadge value={latestPR.percentChange} />
                )}
              </div>
              {recentPRs.slice(1, 3).map((pr, i) => (
                <div key={i} className="clbg-pr-secondary">
                  <span>{pr.exercise || pr.name}</span>
                  <span>{pr.value || pr.weight}kg</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="clbg-card-no-data">Sin PRs recientes</span>
          )}
        </div>
      </BentoCard>

      {/* C — Volumen por Músculo */}
      <BentoCard area="C" className="clbg-card clbg-card--enter" style={{ animationDelay: '100ms' }}>
        <GlowingEffect spread={30} proximity={100} borderWidth={1} />
        <div className="clbg-card-inner">
          <div className="clbg-card-header">
            <BarChart3 size={14} className="clbg-card-icon" />
            <span className="clbg-card-label">Volumen</span>
          </div>
          {radarData.length > 0 ? (
            <div className="clbg-radar-wrap">
              <ResponsiveContainer width="100%" height={110}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis
                    dataKey="muscle"
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9 }}
                  />
                  <Radar
                    dataKey="sets"
                    stroke="rgba(255,255,255,0.5)"
                    fill="rgba(255,255,255,0.12)"
                    fillOpacity={1}
                    isAnimationActive={true}
                    animationDuration={1000}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Sparkline data={weeklyVolume} dataKey="sets" />
          )}
        </div>
      </BentoCard>

      {/* D — Peso (spans 2 rows) */}
      <BentoCard area="D" className="clbg-card clbg-card--enter" style={{ animationDelay: '150ms' }}>
        <GlowingEffect spread={30} proximity={100} borderWidth={1} />
        <div className="clbg-card-inner">
          <div className="clbg-card-header">
            <Scale size={14} className="clbg-card-icon" />
            <span className="clbg-card-label">Peso</span>
          </div>
          <div className="clbg-card-value">
            {bodyWeight != null ? (
              <NumberTicker value={bodyWeight} suffix="kg" decimals={1} />
            ) : (
              <span className="clbg-card-no-data">—</span>
            )}
          </div>
          <Sparkline data={weightTrend} dataKey="weight" height={60} />
        </div>
      </BentoCard>

      {/* E — Macros */}
      <BentoCard area="E" className="clbg-card clbg-card--enter" style={{ animationDelay: '200ms' }}>
        <GlowingEffect spread={30} proximity={100} borderWidth={1} />
        <div className="clbg-card-inner">
          <div className="clbg-card-header">
            <Flame size={14} className="clbg-card-icon" />
            <span className="clbg-card-label">Macros</span>
          </div>
          {avgCalories != null ? (
            <div className="clbg-macros">
              <div className="clbg-macro-cal">
                <NumberTicker value={Math.round(avgCalories)} suffix=" kcal" />
                {targetCalories && (
                  <span className="clbg-macro-target">/ {Math.round(targetCalories)}</span>
                )}
              </div>
              <div className="clbg-macro-bars">
                <MacroBar label="P" actual={macros.actualProtein} target={macros.targetProtein} />
                <MacroBar label="C" actual={macros.actualCarbs} target={macros.targetCarbs} />
                <MacroBar label="F" actual={macros.actualFat} target={macros.targetFat} />
              </div>
            </div>
          ) : (
            <span className="clbg-card-no-data">Sin datos</span>
          )}
        </div>
      </BentoCard>

      {/* F — Intensidad (RPE) */}
      <BentoCard area="F" className="clbg-card clbg-card--enter" style={{ animationDelay: '250ms' }}>
        <GlowingEffect spread={30} proximity={100} borderWidth={1} />
        <div className="clbg-card-inner">
          <div className="clbg-card-header">
            <Activity size={14} className="clbg-card-icon" />
            <span className="clbg-card-label">Intensidad</span>
          </div>
          <div className="clbg-card-value">
            {rpeAverage != null ? (
              <>
                <span className="clbg-rpe-label">RPE </span>
                <NumberTicker value={rpeAverage} decimals={1} />
              </>
            ) : (
              <span className="clbg-card-no-data">—</span>
            )}
          </div>
          <Sparkline data={rpeTrend} height={28} />
        </div>
      </BentoCard>

      {/* G — Readiness */}
      <BentoCard area="G" className="clbg-card clbg-card--enter" style={{ animationDelay: '300ms' }}>
        <GlowingEffect spread={30} proximity={100} borderWidth={1} />
        <div className="clbg-card-inner">
          <div className="clbg-card-header">
            <Heart size={14} className="clbg-card-icon" />
            <span className="clbg-card-label">Bienestar</span>
          </div>
          <div className="clbg-readiness-row">
            {readinessAvg != null ? (
              <ProgressRing percent={readinessAvg * 10} size={40} strokeWidth={3} label={readinessAvg.toFixed(1)} />
            ) : (
              <span className="clbg-card-no-data">—</span>
            )}
            {readinessBreakdown.length > 0 && (
              <div className="clbg-readiness-metrics">
                <ReadinessMetric label="Sueño" value={readinessBreakdown[readinessBreakdown.length - 1]?.sleep} suffix="h" />
                <ReadinessMetric label="Estrés" value={readinessBreakdown[readinessBreakdown.length - 1]?.stress} />
                <ReadinessMetric label="Energía" value={readinessBreakdown[readinessBreakdown.length - 1]?.energy} />
              </div>
            )}
          </div>
        </div>
      </BentoCard>
    </BentoGrid>
  );
}

// ── Macro bar sub-component ───────────────────────────────────
function MacroBar({ label, actual, target }) {
  if (actual == null) return null;
  const pct = target ? Math.min((actual / target) * 100, 100) : 50;
  return (
    <div className="clbg-macro-bar">
      <span className="clbg-macro-bar-label">{label}</span>
      <div className="clbg-macro-bar-track">
        <div className="clbg-macro-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="clbg-macro-bar-val">{Math.round(actual)}g</span>
    </div>
  );
}

// ── Readiness metric sub-component ────────────────────────────
function ReadinessMetric({ label, value, suffix = '' }) {
  if (value == null) return null;
  return (
    <div className="clbg-readiness-metric">
      <span className="clbg-readiness-metric-label">{label}</span>
      <span className="clbg-readiness-metric-value">{value}{suffix}</span>
    </div>
  );
}
