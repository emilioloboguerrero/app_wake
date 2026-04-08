import { memo } from 'react';
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
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

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="ds-chart-tooltip">
      <span>{formatMonth(d.month)}</span>
      <strong>{d.programsSold} vendidos</strong>
    </div>
  );
}

function ProgramsSoldWidget({ isLoading, isError, trendData }) {
  const salesTrend = trendData?.salesTrend ?? [];
  const totalOneOnOne = trendData?.totalOneOnOne ?? 0;
  const totalProgramsSold = trendData?.totalProgramsSold ?? 0;

  return (
    <div className="ds-widget-inner">
      <p className="ds-widget-title">Programas vendidos</p>
      {isLoading ? (
        <SkeletonCard />
      ) : isError ? (
        <InlineError message="No pudimos cargar las ventas." field="programs-sold" />
      ) : totalProgramsSold === 0 && totalOneOnOne === 0 ? (
        <p className="ds-widget-empty">Aqui veras cuantos programas has vendido y clientes 1:1 tienes.</p>
      ) : (
        <>
          <div className="ds-programs-stats">
            <div className="ds-programs-stat">
              <span className="ds-programs-stat__num"><NumberTicker value={totalProgramsSold} /></span>
              <span className="ds-programs-stat__label">ventas</span>
            </div>
            <span className="ds-programs-stat__divider" />
            <div className="ds-programs-stat">
              <span className="ds-programs-stat__num"><NumberTicker value={totalOneOnOne} /></span>
              <span className="ds-programs-stat__label">1:1</span>
            </div>
          </div>
          {salesTrend.length > 0 && (
            <div className="ds-widget-chart">
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={salesTrend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="month" hide />
                  <Tooltip content={<CustomTooltip />} cursor={false} />
                  <Bar
                    dataKey="programsSold"
                    fill="rgba(255, 255, 255, 0.25)"
                    radius={[4, 4, 0, 0]}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default memo(ProgramsSoldWidget);
