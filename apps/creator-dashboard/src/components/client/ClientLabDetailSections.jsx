import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  BarChart, Bar, AreaChart, Area, CartesianGrid, ScatterChart, Scatter,
} from 'recharts';
import { Dumbbell, Utensils, Activity, Heart } from 'lucide-react';
import { ShimmerSkeleton, GlowingEffect } from '../ui';
import './ClientLabDetailSections.css';

// ── Chart tooltip ─────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="clds-tooltip">
      <p className="clds-tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="clds-tooltip-value" style={{ color: p.stroke || p.fill }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </p>
      ))}
    </div>
  );
}

// ── Shared axis styling ───────────────────────────────────────
const axisStyle = { fill: 'rgba(255,255,255,0.25)', fontSize: 10 };
const gridStyle = { stroke: 'rgba(255,255,255,0.05)' };

// ── Section wrapper ───────────────────────────────────────────
function Section({ title, icon, children, isEmpty }) {
  return (
    <div className="clds-section">
      <GlowingEffect spread={40} proximity={120} borderWidth={1} />
      <div className="clds-section-header">
        <h3 className="clds-section-title">{icon} {title}</h3>
      </div>
      {isEmpty ? (
        <div className="clds-section-empty">
          <p>Sin datos suficientes para este período</p>
        </div>
      ) : (
        <div className="clds-section-body">{children}</div>
      )}
    </div>
  );
}

export default function ClientLabDetailSections({ data, isLoading, clientName, range }) {
  if (isLoading) {
    return (
      <div className="clds-container">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="clds-section clds-section--skeleton">
            <ShimmerSkeleton width={120} height={16} />
            <ShimmerSkeleton width="100%" height={180} style={{ marginTop: 16 }} />
          </div>
        ))}
      </div>
    );
  }

  const recentPRs = data?.recentPRs || [];
  const rpeTrend = data?.rpeTrend || [];
  const volumeByMuscle = data?.volumeByMuscle || [];
  const stalledExercises = data?.stalledExercises || [];
  const caloriesTrend = data?.caloriesTrend || [];
  const macrosTrend = data?.macrosTrend || [];
  const nutritionAdherence = data?.nutritionAdherence;
  const bodyProgress = data?.bodyProgress || [];
  const bodyPhotos = data?.bodyPhotos || [];
  const readinessBreakdown = data?.readinessBreakdown || [];
  const adherenceHeatmap = data?.adherenceHeatmap || [];

  return (
    <div className="clds-container">
      {/* ── Section 1: Entrenamiento ─────────────────────────── */}
      <Section title="Entrenamiento" icon={<Dumbbell size={14} />} isEmpty={!recentPRs.length && !rpeTrend.length}>
        <div className="clds-charts-row">
          {/* PR Timeline */}
          {recentPRs.length > 0 && (
            <div className="clds-chart-card">
              <p className="clds-chart-label">PRs recientes</p>
              <div className="clds-pr-list">
                {recentPRs.slice(0, 8).map((pr, i) => (
                  <div key={i} className="clds-pr-item">
                    <span className="clds-pr-item-name">{pr.exercise || pr.name}</span>
                    <span className="clds-pr-item-value">{pr.value || pr.weight}kg</span>
                    {pr.percentChange != null && (
                      <span className={`clds-pr-item-change ${pr.percentChange > 0 ? 'clds-pr-item-change--up' : ''}`}>
                        {pr.percentChange > 0 ? '+' : ''}{pr.percentChange.toFixed(1)}%
                      </span>
                    )}
                    {pr.date && <span className="clds-pr-item-date">{pr.date}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Volume per Muscle Group */}
          {volumeByMuscle.length > 0 && (
            <div className="clds-chart-card">
              <p className="clds-chart-label">Volumen por grupo muscular</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={volumeByMuscle} layout="vertical">
                  <CartesianGrid {...gridStyle} horizontal={false} />
                  <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="muscle" tick={axisStyle} axisLine={false} tickLine={false} width={60} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="sets" fill="rgba(255,255,255,0.25)" radius={[0, 4, 4, 0]} animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* RPE Trend */}
          {rpeTrend.length > 0 && (
            <div className="clds-chart-card">
              <p className="clds-chart-label">Tendencia RPE</p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={rpeTrend}>
                  <CartesianGrid {...gridStyle} />
                  <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="value" stroke="rgba(255,255,255,0.5)" strokeWidth={2} dot={false} animationDuration={1200} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Stalled Exercises */}
        {stalledExercises.length > 0 && (
          <div className="clds-stalled">
            <p className="clds-chart-label">Ejercicios estancados</p>
            <div className="clds-stalled-list">
              {stalledExercises.map((ex, i) => (
                <div key={i} className="clds-stalled-item">
                  <span className="clds-stalled-name">{ex.exercise}</span>
                  <span className="clds-stalled-weeks">{ex.weeksSinceLastPR} sem sin PR</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ── Section 2: Nutrición ─────────────────────────────── */}
      <Section title="Nutrición" icon={<Utensils size={14} />} isEmpty={!caloriesTrend.length && !macrosTrend.length}>
        <div className="clds-charts-row">
          {/* Calorie Trend */}
          {caloriesTrend.length > 0 && (
            <div className="clds-chart-card clds-chart-card--wide">
              <p className="clds-chart-label">Calorías: real vs objetivo</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={caloriesTrend}>
                  <CartesianGrid {...gridStyle} />
                  <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="actual" name="Real" stroke="rgba(255,255,255,0.6)" strokeWidth={2} dot={false} animationDuration={1200} />
                  <Line type="monotone" dataKey="target" name="Objetivo" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Macro Trends */}
          {macrosTrend.length > 0 && (
            <div className="clds-chart-card clds-chart-card--wide">
              <p className="clds-chart-label">Macros</p>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={macrosTrend}>
                  <CartesianGrid {...gridStyle} />
                  <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="protein" name="Proteína" stackId="1" fill="rgba(129,140,248,0.2)" stroke="rgba(129,140,248,0.5)" animationDuration={1200} />
                  <Area type="monotone" dataKey="carbs" name="Carbos" stackId="1" fill="rgba(251,191,36,0.15)" stroke="rgba(251,191,36,0.4)" animationDuration={1200} />
                  <Area type="monotone" dataKey="fat" name="Grasas" stackId="1" fill="rgba(248,113,113,0.15)" stroke="rgba(248,113,113,0.4)" animationDuration={1200} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {nutritionAdherence != null && (
            <div className="clds-nutrition-adherence">
              <span className="clds-nutrition-adherence-value">{Math.round(nutritionAdherence)}%</span>
              <span className="clds-nutrition-adherence-label">de los dias dentro del +/-20% del objetivo calorico y proteico</span>
            </div>
          )}
        </div>
      </Section>

      {/* ── Section 3: Cuerpo ────────────────────────────────── */}
      <Section title="Cuerpo" icon={<Activity size={14} />} isEmpty={!bodyProgress.length}>
        <div className="clds-charts-row">
          {bodyProgress.length > 0 && (
            <div className="clds-chart-card clds-chart-card--wide">
              <p className="clds-chart-label">Peso corporal</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={bodyProgress}>
                  <CartesianGrid {...gridStyle} />
                  <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="weight" name="Peso" stroke="rgba(255,255,255,0.6)" strokeWidth={2} dot={{ r: 2, fill: 'rgba(255,255,255,0.4)' }} animationDuration={1200} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Body photos timeline */}
          {bodyPhotos.length > 0 && (
            <div className="clds-photos">
              <p className="clds-chart-label">Fotos de progreso</p>
              <div className="clds-photos-scroll">
                {bodyPhotos.map((entry, i) => (
                  <div key={i} className="clds-photo-item">
                    {entry.urls?.map((url, j) => (
                      <img key={j} src={url} alt={`Progreso ${entry.date}`} className="clds-photo-img" />
                    ))}
                    <span className="clds-photo-date">{entry.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── Section 4: Bienestar ─────────────────────────────── */}
      <Section title="Bienestar" icon={<Heart size={14} />} isEmpty={!readinessBreakdown.length}>
        <div className="clds-charts-row">
          {readinessBreakdown.length > 0 && (
            <div className="clds-chart-card clds-chart-card--wide">
              <p className="clds-chart-label">Tendencia de bienestar</p>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={readinessBreakdown}>
                  <CartesianGrid {...gridStyle} />
                  <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={axisStyle} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="overall" name="General" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.5)" strokeWidth={2} animationDuration={1200} />
                  <Line type="monotone" dataKey="sleep" name="Sueño" stroke="rgba(129,140,248,0.4)" strokeWidth={1} dot={false} />
                  <Line type="monotone" dataKey="energy" name="Energía" stroke="rgba(74,222,128,0.4)" strokeWidth={1} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Adherence Heatmap */}
          {adherenceHeatmap.length > 0 && (
            <div className="clds-heatmap">
              <p className="clds-chart-label">Adherencia semanal</p>
              <div className="clds-heatmap-grid">
                <div className="clds-heatmap-labels">
                  {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                    <span key={d} className="clds-heatmap-day-label">{d}</span>
                  ))}
                </div>
                {adherenceHeatmap.map((week, wi) => (
                  <div key={wi} className="clds-heatmap-week">
                    {week.days?.map((active, di) => (
                      <div
                        key={di}
                        className={`clds-heatmap-cell ${active ? 'clds-heatmap-cell--active' : ''}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
