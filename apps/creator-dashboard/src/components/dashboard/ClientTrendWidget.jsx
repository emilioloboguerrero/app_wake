import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { NumberTicker, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

const CHART_COLOR = 'rgba(255, 255, 255, 0.7)';

function formatMonth(str) {
  if (!str) return '';
  try {
    const [y, m] = str.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('es-CO', { month: 'short' });
  } catch {
    return str;
  }
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="ds-chart-tooltip">
      <span>{formatMonth(d.month)}</span>
      <strong>{d.totalClients} clientes</strong>
      {d.newClients > 0 && <span className="ds-chart-tooltip__new">+{d.newClients} nuevos</span>}
    </div>
  );
}

export default function ClientTrendWidget({ trendQuery }) {
  const data = trendQuery?.data?.data;
  const trend = data?.clientTrend ?? [];
  const current = trend.length > 0 ? trend[trend.length - 1].totalClients : 0;

  return (
    <div className="ds-widget-inner">
      <p className="ds-widget-title">Tendencia de clientes</p>
      {trendQuery?.isLoading ? (
        <SkeletonCard />
      ) : trendQuery?.isError ? (
        <InlineError message="No pudimos cargar la tendencia." field="client-trend" />
      ) : trend.length === 0 ? (
        <p className="ds-widget-empty">El gráfico aparecerá cuando tengas tu primer cliente.</p>
      ) : (
        <>
          <p className="ds-widget-number">
            <NumberTicker value={current} />
          </p>
          <p className="ds-widget-label">clientes totales</p>
          <div className="ds-widget-chart">
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="clientGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLOR} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" hide />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Area
                  type="monotone"
                  dataKey="totalClients"
                  stroke={CHART_COLOR}
                  strokeWidth={2}
                  fill="url(#clientGrad)"
                  animationDuration={1200}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
