import { useMemo, memo, useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { Video, CalendarX, Users, Activity } from 'lucide-react';
import { BentoCard, GlowingEffect } from '../ui';
import { SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';
import { extractAccentFromImage } from '../events/eventFieldComponents';

// ── Fallback palette ──────────────────────────────────────────────────────────

const PLAN_COLORS = [
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

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function fmtDateShort(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Hoy';
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return 'Mañana';
    return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ds-chart-tooltip">
      <span className="ds-chart-tooltip__date">{fmtDate(label)}</span>
      {payload.map((entry, i) => (
        <span key={i} style={{ color: entry.color }}>
          {entry.name}: {entry.value}{unit}
        </span>
      ))}
    </div>
  );
}

// ── X-axis tick — only render every 7th label ─────────────────────────────────

function XAxisTick({ x, y, payload, index, total }) {
  if (index % 7 !== 0 && index !== total - 1) return null;
  return (
    <text x={x} y={y + 12} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={10}>
      {fmtDate(payload?.value)}
    </text>
  );
}

// ── Card A: Upcoming calls + video exchanges ──────────────────────────────────

function CallsAndExchangesCard({ data, isLoading, isError }) {
  const { upcomingCalls = [], unreadVideoExchanges = 0 } = data ?? {};

  return (
    <BentoCard area="A" className="ds-widget-stagger" style={{ animationDelay: '0ms' }}>
      <GlowingEffect spread={40} proximity={140} borderWidth={1} />
      <div className="ds-card-inner">
        <div className="ds-card-header">
          <p className="ds-card-label">Próximas 48h</p>
          {unreadVideoExchanges > 0 && (
            <span className="ds-video-badge">
              <Video size={11} />
              {unreadVideoExchanges}
            </span>
          )}
        </div>

        {isLoading ? (
          <SkeletonCard />
        ) : isError ? (
          <InlineError message="No se pudo cargar la agenda." field="calls" />
        ) : upcomingCalls.length === 0 ? (
          <div className="ds-card-empty-state">
            <CalendarX size={22} strokeWidth={1.5} />
            <span>Sin llamadas</span>
          </div>
        ) : (
          <div className="ds-calls-list">
            {upcomingCalls.slice(0, 4).map((call, i) => (
              <div key={call.id ?? i} className="ds-call-row">
                <div className="ds-call-avatar">{(call.clientName ?? 'C').charAt(0).toUpperCase()}</div>
                <div className="ds-call-info">
                  <span className="ds-call-name">
                    {call.clientName}
                    {call.isToday && <span className="ds-today-badge">hoy</span>}
                  </span>
                  <span className="ds-call-time">
                    {fmtDateShort(call.slotStartUtc)} · {fmtTime(call.slotStartUtc)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BentoCard>
  );
}

// ── Card B: Client count per plan over 30 days ────────────────────────────────

function ClientCountCard({ data, isLoading, isError, getColor }) {
  const { plans = [], clientCountSeries = [] } = data ?? {};

  const chartData = useMemo(() => clientCountSeries.map((pt) => {
    const row = { date: pt.date };
    for (const plan of plans) row[plan.courseId] = pt.byCourse?.[plan.courseId] ?? 0;
    return row;
  }), [clientCountSeries, plans]);

  const hasData = plans.length > 0;

  return (
    <BentoCard area="B" className="ds-widget-stagger" style={{ animationDelay: '60ms' }}>
      <GlowingEffect spread={40} proximity={140} borderWidth={1} />
      <div className="ds-card-inner">
        <div className="ds-card-header">
          <p className="ds-card-label">Clientes</p>
          {hasData && (
            <div className="ds-legend-row">
              {plans.map((plan, i) => (
                <span key={plan.courseId} className="ds-legend-item">
                  <span className="ds-legend-dot" style={{ background: getColor(plan.courseId, i) }} />
                  <span className="ds-legend-name">{plan.title || 'Plan'}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <SkeletonCard />
        ) : isError ? (
          <InlineError message="No se pudo cargar la información de clientes." field="clients" />
        ) : !hasData ? (
          <div className="ds-card-empty-state">
            <Users size={22} strokeWidth={1.5} />
            <span>Sin clientes</span>
          </div>
        ) : (
          <>
            <div className="ds-plan-stats">
              {plans.map((plan, i) => (
                <div key={plan.courseId} className="ds-plan-stat">
                  <span
                    className="ds-plan-stat__num"
                    style={{ color: getColor(plan.courseId, i) }}
                  >
                    {plan.totalClients}
                  </span>
                  <span className="ds-plan-stat__label">{plan.title || 'Plan'}</span>
                  {plan.newLast30d > 0 && (
                    <span className={`ds-pct-badge ${plan.pctChange >= 0 ? 'ds-pct-badge--up' : 'ds-pct-badge--down'}`}>
                      {plan.pctChange >= 0 ? '+' : ''}{plan.pctChange}%
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="ds-chart-area">
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
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} />
                  <Tooltip content={<ChartTooltip unit=" clientes" />} />
                  {plans.map((plan, i) => (
                    <Line
                      key={plan.courseId}
                      type="monotone"
                      dataKey={plan.courseId}
                      name={plan.title || 'Plan'}
                      stroke={getColor(plan.courseId, i)}
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </BentoCard>
  );
}

// ── Card C: 30-day adherence per plan (full width) ────────────────────────────

function AdherenceChartCard({ data, isLoading, isError, getColor }) {
  const { plans = [], adherenceSeries = [] } = data ?? {};

  const chartData = useMemo(() => adherenceSeries.map((pt) => {
    const row = { date: pt.date };
    for (const plan of plans) row[plan.courseId] = pt.byCourse?.[plan.courseId] ?? 0;
    return row;
  }), [adherenceSeries, plans]);

  const hasData = plans.length > 0;

  return (
    <BentoCard area="C" className="ds-widget-stagger" style={{ animationDelay: '120ms' }}>
      <GlowingEffect spread={40} proximity={140} borderWidth={1} />
      <div className="ds-card-inner ds-card-inner--chart">
        <div className="ds-card-header">
          <div>
            <p className="ds-card-label">Adherencia</p>
            <p className="ds-card-sublabel">30 días · promedio por plan</p>
          </div>
          {hasData && (
            <div className="ds-legend-row">
              {plans.map((plan, i) => (
                <span key={plan.courseId} className="ds-legend-item">
                  <span className="ds-legend-dot" style={{ background: getColor(plan.courseId, i) }} />
                  <span className="ds-legend-name">{plan.title || 'Plan'}</span>
                </span>
              ))}
            </div>
          )}
        </div>

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
              <LineChart data={chartData} margin={{ top: 4, right: 12, left: -28, bottom: 0 }}>
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
                {plans.map((plan, i) => (
                  <Line
                    key={plan.courseId}
                    type="monotone"
                    dataKey={plan.courseId}
                    name={plan.title || 'Plan'}
                    stroke={getColor(plan.courseId, i)}
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

function DashboardOneOnOneView({ data, isLoading, isError }) {
  const plans = data?.plans ?? [];
  const imageColors = useImageColors(plans);
  const getColor = (courseId, index) => imageColors[courseId] ?? PLAN_COLORS[index % PLAN_COLORS.length];

  return (
    <div className="ds-bento-wrapper">
      <div className="bento-grid bento-grid--one-on-one">
        <CallsAndExchangesCard data={data} isLoading={isLoading} isError={isError} />
        <ClientCountCard data={data} isLoading={isLoading} isError={isError} getColor={getColor} />
        <AdherenceChartCard data={data} isLoading={isLoading} isError={isError} getColor={getColor} />
      </div>
    </div>
  );
}

export default memo(DashboardOneOnOneView);
