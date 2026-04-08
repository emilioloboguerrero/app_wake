import { useMemo, memo, useState, useEffect } from 'react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

import { TrendingUp, LayoutGrid, BarChart2, Activity } from 'lucide-react';
import { BentoCard, GlowingEffect } from '../ui';
import { SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';
import { extractAccentFromImage } from '../events/eventFieldComponents';

// ── Fallback palette ──────────────────────────────────────────────────────────

const PROGRAM_COLORS = [
  'rgba(255,255,255,0.90)',
  'rgba(100,180,255,0.90)',
  'rgba(100,225,150,0.90)',
  'rgba(255,195,70,0.90)',
  'rgba(210,120,255,0.90)',
  'rgba(255,115,100,0.90)',
];

// ── Image-derived colors hook ─────────────────────────────────────────────────

function useImageColors(items) {
  const [colors, setColors] = useState({});
  useEffect(() => {
    if (!items?.length) return;
    const cleanups = items.map(({ courseId, imageUrl }) => {
      if (!imageUrl) return () => {};
      return extractAccentFromImage(imageUrl, ([r, g, b]) => {
        setColors((prev) => ({ ...prev, [courseId]: `rgba(${r},${g},${b},0.9)` }));
      });
    });
    return () => cleanups.forEach((fn) => fn?.());
  }, [items]);
  return colors;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtCOP = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(n ?? 0);

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

function fmtMonth(str) {
  if (!str) return '';
  try {
    const [y, m] = str.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
  } catch { return str; }
}

// ── Shared chart primitives ───────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, unit = '', isCOP = false }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ds-chart-tooltip">
      <span className="ds-chart-tooltip__date">{label?.length === 7 ? fmtMonth(label) : fmtDate(label)}</span>
      {payload.map((entry, i) => (
        <span key={i} style={{ color: entry.color }}>
          {entry.name}: {isCOP ? fmtCOP(entry.value) : `${entry.value}${unit}`}
        </span>
      ))}
    </div>
  );
}

function XAxisTick({ x, y, payload, index, total }) {
  if (index % 7 !== 0 && index !== total - 1) return null;
  return (
    <text x={x} y={y + 12} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={10}>
      {fmtDate(payload?.value)}
    </text>
  );
}

// ── Card A: Revenue hero ──────────────────────────────────────────────────────

function RevenueCard({ data, isLoading, isError }) {
  const { revenue } = data ?? {};
  const { netThisMonth = 0, pctChange = 0 } = revenue ?? {};
  const isUp = pctChange >= 0;

  return (
    <BentoCard area="A" className="ds-widget-stagger" style={{ animationDelay: '0ms' }}>
      <GlowingEffect spread={40} proximity={140} borderWidth={1} />
      <div className="ds-card-inner ds-card-inner--revenue">
        <p className="ds-card-label">Ingresos</p>
        <p className="ds-card-sublabel">Neto · 30 días</p>

        {isLoading ? (
          <SkeletonCard />
        ) : isError ? (
          <InlineError message="No se pudo cargar los ingresos." field="revenue" />
        ) : netThisMonth === 0 ? (
          <div className="ds-card-empty-state">
            <TrendingUp size={22} strokeWidth={1.5} />
            <span>Sin ventas</span>
          </div>
        ) : (
          <>
            <p className="ds-revenue-number">{fmtCOP(netThisMonth)}</p>
            <span className={`ds-pct-badge ${isUp ? 'ds-pct-badge--up' : 'ds-pct-badge--down'}`}>
              {isUp ? '+' : ''}{pctChange}% vs 30 días ant.
            </span>
          </>
        )}
      </div>
    </BentoCard>
  );
}

// ── Card B: Multi-area enrollment chart ──────────────────────────────────────

function EnrollmentCard({ data, isLoading, isError, getColor }) {
  const { enrollment = [], enrollmentSeries = [] } = data ?? {};
  const hasData = enrollment.length > 0;

  const chartData = useMemo(() =>
    enrollmentSeries.map((pt) => {
      const row = { date: pt.date };
      for (const p of enrollment) row[p.courseId] = pt.byCourse?.[p.courseId] ?? 0;
      return row;
    }),
  [enrollmentSeries, enrollment]);

  return (
    <BentoCard area="B" className="ds-widget-stagger" style={{ animationDelay: '60ms' }}>
      <GlowingEffect spread={40} proximity={140} borderWidth={1} />
      <div className="ds-card-inner ds-card-inner--chart">
        <div className="ds-card-header">
          <div>
            <p className="ds-card-label">Programas</p>
            <p className="ds-card-sublabel">Matriculados · 30 días</p>
          </div>
          {hasData && (
            <div className="ds-legend-row">
              {enrollment.map((p, i) => (
                <span key={p.courseId} className="ds-legend-item">
                  <span className="ds-legend-dot" style={{ background: getColor(p.courseId, i) }} />
                  <span className="ds-legend-name">{p.title || 'Programa'}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <SkeletonCard />
        ) : isError ? (
          <InlineError message="No se pudo cargar los programas." field="enrollment" />
        ) : !hasData ? (
          <div className="ds-card-empty-state">
            <LayoutGrid size={22} strokeWidth={1.5} />
            <span>Sin programas</span>
          </div>
        ) : (
          <div className="ds-chart-area ds-chart-area--tall">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -28, bottom: 0 }}>
                <defs>
                  {enrollment.map((p, i) => {
                    const color = getColor(p.courseId, i);
                    return (
                      <linearGradient key={p.courseId} id={`enrollGrad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={<XAxisTick total={chartData.length} />}
                  axisLine={false}
                  tickLine={false}
                  height={22}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip unit=" matriculados" />} />
                {enrollment.map((p, i) => (
                  <Area
                    key={p.courseId}
                    type="monotone"
                    dataKey={p.courseId}
                    name={p.title || 'Programa'}
                    stroke={getColor(p.courseId, i)}
                    strokeWidth={1.5}
                    fill={`url(#enrollGrad-${i})`}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </BentoCard>
  );
}

// ── Card C: Revenue trend (6 months) ─────────────────────────────────────────

function RevenueTrendCard({ data, isLoading, isError }) {
  const { revenue } = data ?? {};
  const trend = revenue?.trend ?? [];

  const chartData = useMemo(
    () => trend.map((pt) => ({ month: pt.month, net: pt.net, gross: pt.gross })),
    [trend]
  );

  return (
    <BentoCard area="C" className="ds-widget-stagger" style={{ animationDelay: '120ms' }}>
      <GlowingEffect spread={40} proximity={140} borderWidth={1} />
      <div className="ds-card-inner ds-card-inner--chart">
        <div className="ds-card-header">
          <div>
            <p className="ds-card-label">Tendencia</p>
            <p className="ds-card-sublabel">Ingresos netos · 6 meses</p>
          </div>
        </div>

        {isLoading ? (
          <SkeletonCard />
        ) : isError ? (
          <InlineError message="No se pudo cargar la tendencia." field="trend" />
        ) : chartData.length === 0 ? (
          <div className="ds-card-empty-state">
            <BarChart2 size={22} strokeWidth={1.5} />
            <span>Sin historial</span>
          </div>
        ) : (
          <div className="ds-chart-area ds-chart-area--tall">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="rgba(255,255,255,0.15)" stopOpacity={1} />
                    <stop offset="95%" stopColor="rgba(255,255,255,0)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                  tickFormatter={fmtMonth}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<ChartTooltip isCOP unit="" />} />
                <Area
                  type="monotone"
                  dataKey="net"
                  name="Neto"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={1.5}
                  fill="url(#revenueGrad)"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </BentoCard>
  );
}

// ── Card D: 30-day adherence per program ──────────────────────────────────────

function ProgramAdherenceCard({ data, isLoading, isError, getColor }) {
  const { enrollment = [], adherenceSeries = [] } = data ?? {};

  const chartData = useMemo(() => adherenceSeries.map((pt) => {
    const row = { date: pt.date };
    for (const p of enrollment) row[p.courseId] = pt.byCourse?.[p.courseId] ?? 0;
    return row;
  }), [adherenceSeries, enrollment]);

  const hasData = enrollment.length > 0;

  return (
    <BentoCard area="D" className="ds-widget-stagger" style={{ animationDelay: '180ms' }}>
      <GlowingEffect spread={40} proximity={140} borderWidth={1} />
      <div className="ds-card-inner ds-card-inner--chart">
        <div className="ds-card-header">
          <div>
            <p className="ds-card-label">Adherencia</p>
            <p className="ds-card-sublabel">Adherencia · 30 días</p>
          </div>
        </div>
        {hasData && (
          <div className="ds-legend-col">
            {enrollment.map((p, i) => (
              <span key={p.courseId} className="ds-legend-item">
                <span className="ds-legend-dot" style={{ background: getColor(p.courseId, i) }} />
                <span className="ds-legend-name">{p.title || 'Programa'}</span>
              </span>
            ))}
          </div>
        )}

        {isLoading ? (
          <SkeletonCard />
        ) : isError ? (
          <InlineError message="No se pudo cargar la adherencia." field="adherence" />
        ) : !hasData ? (
          <div className="ds-card-empty-state">
            <Activity size={22} strokeWidth={1.5} />
            <span>Sin datos</span>
          </div>
        ) : (
          <div className="ds-chart-area ds-chart-area--tall">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={<XAxisTick total={chartData.length} />}
                  axisLine={false}
                  tickLine={false}
                  height={22}
                />
                <YAxis
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<ChartTooltip unit="%" />} />
                {enrollment.map((p, i) => (
                  <Line
                    key={p.courseId}
                    type="monotone"
                    dataKey={p.courseId}
                    name={p.title || 'Programa'}
                    stroke={getColor(p.courseId, i)}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </BentoCard>
  );
}

// ── View ──────────────────────────────────────────────────────────────────────

function DashboardProgramsView({ data, isLoading, isError }) {
  const enrollment = data?.enrollment ?? [];
  const imageColors = useImageColors(enrollment);
  const getColor = (courseId, index) => imageColors[courseId] ?? PROGRAM_COLORS[index % PROGRAM_COLORS.length];

  return (
    <div className="ds-bento-wrapper">
      <div className="bento-grid bento-grid--programs">
        <RevenueCard data={data} isLoading={isLoading} isError={isError} />
        <EnrollmentCard data={data} isLoading={isLoading} isError={isError} getColor={getColor} />
        <RevenueTrendCard data={data} isLoading={isLoading} isError={isError} />
        <ProgramAdherenceCard data={data} isLoading={isLoading} isError={isError} getColor={getColor} />
      </div>
    </div>
  );
}

export default memo(DashboardProgramsView);
