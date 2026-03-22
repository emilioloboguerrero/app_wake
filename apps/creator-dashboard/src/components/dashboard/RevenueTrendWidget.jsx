import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { NumberTicker, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

function formatMonth(str) {
  if (!str) return '';
  try {
    const [y, m] = str.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('es-CO', { month: 'short' });
  } catch {
    return str;
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="ds-chart-tooltip">
      <span>{formatMonth(d.month)}</span>
      <strong>{formatCurrency(d.net)}</strong>
      <span className="ds-chart-tooltip__sub">{d.sales} ventas</span>
    </div>
  );
}

export default function RevenueTrendWidget({ revenueTrendQuery }) {
  const trend = revenueTrendQuery?.data?.data?.trend ?? [];
  const totalNet = trend.reduce((sum, m) => sum + m.net, 0);

  return (
    <div className="ds-widget-inner">
      <p className="ds-widget-title">Tendencia de ingresos</p>
      {revenueTrendQuery?.isLoading ? (
        <SkeletonCard />
      ) : revenueTrendQuery?.isError ? (
        <InlineError message="No pudimos cargar la tendencia." field="revenue-trend" />
      ) : trend.length === 0 ? (
        <p className="ds-widget-empty">Cuando tengas tu primera venta, aquí verás la evolución de tus ingresos.</p>
      ) : (
        <>
          <p className="ds-widget-number ds-widget-number--revenue">
            <NumberTicker value={totalNet} prefix="$" decimals={0} />
          </p>
          <p className="ds-widget-label">ingresos netos totales</p>
          <div className="ds-widget-chart">
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(74, 222, 128, 0.7)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="rgba(74, 222, 128, 0.7)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" hide />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Area
                  type="monotone"
                  dataKey="net"
                  stroke="rgba(74, 222, 128, 0.7)"
                  strokeWidth={2}
                  fill="url(#revenueGrad)"
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
