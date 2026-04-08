import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import GlowingEffect from '../ui/GlowingEffect';
import NumberTicker from '../ui/NumberTicker';
import apiClient from '../../utils/apiClient';
import './DemographicsCard.css';

function formatMonth(str) {
  if (!str) return '';
  try {
    const [y, m] = str.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('es-CO', { month: 'short' });
  } catch {
    return str;
  }
}

function formatCOP(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function RevenueTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 3,
      padding: '8px 12px',
      background: 'rgba(22,22,22,0.96)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      fontSize: 12,
      color: 'rgba(255,255,255,0.6)',
      backdropFilter: 'blur(8px)',
      pointerEvents: 'none',
    }}>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{formatMonth(d.month)}</span>
      <strong style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>{formatCOP(d.net)}</strong>
      <span style={{ fontSize: 11 }}>{d.sales} {d.sales === 1 ? 'venta' : 'ventas'}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="demo-card__skeleton">
      {[100, 75, 55, 40].map((w, i) => (
        <div key={i} className="demo-card__skeleton-bar" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export default function ProgramRevenueCard({ programId, accentRgb }) {
  const [r, g, b] = accentRgb ?? [255, 255, 255];

  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'revenue-trend', programId],
    queryFn: () =>
      apiClient.get(`/analytics/revenue-trend?courseId=${programId}`).then((res) => res.data),
    enabled: !!programId,
    staleTime: 5 * 60 * 1000,
  });

  const trend = data?.trend ?? [];
  const totalNet = trend.reduce((sum, m) => sum + m.net, 0);
  const totalSales = trend.reduce((sum, m) => sum + m.sales, 0);

  const accentColor = `rgba(${r},${g},${b},0.7)`;
  const accentFill = `rgba(${r},${g},${b},0.15)`;

  return (
    <div
      className="demo-card"
      style={{
        '--gp-accent-r': r,
        '--gp-accent-g': g,
        '--gp-accent-b': b,
      }}
    >
      <GlowingEffect spread={24} proximity={60} />

      <div style={{ padding: '16px 16px 0', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Ingresos
        </p>
      </div>

      {isLoading ? (
        <Skeleton />
      ) : isError ? (
        <div className="demo-card__empty">
          <p className="demo-card__empty-text">No se pudieron cargar los ingresos.</p>
        </div>
      ) : trend.length === 0 ? (
        <div className="demo-card__empty">
          <svg className="demo-card__empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" strokeLinecap="round" />
          </svg>
          <p className="demo-card__empty-text">Sin ventas registradas aun.</p>
        </div>
      ) : (
        <div className="demo-card__body">
          <div style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.92)', lineHeight: 1, letterSpacing: '-0.02em' }}>
              <NumberTicker value={totalNet} prefix="$" decimals={0} />
            </span>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
              ingresos netos &middot; {totalSales} {totalSales === 1 ? 'venta' : 'ventas'}
            </p>
          </div>

          <div style={{ flex: 1, minHeight: 0, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%" minHeight={80}>
              <AreaChart data={trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`rev-grad-${programId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentColor} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonth}
                  tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)', fontFamily: 'inherit' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <Tooltip content={<RevenueTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="net"
                  stroke={accentColor}
                  strokeWidth={2}
                  fill={`url(#rev-grad-${programId})`}
                  animationDuration={1000}
                  animationEasing="ease-out"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            {trend.slice(-3).map((m) => (
              <div key={m.month} style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{formatMonth(m.month)}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: accentColor }}>
                  {formatCOP(m.net)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
