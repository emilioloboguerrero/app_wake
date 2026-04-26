import { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { Battery, Moon, Flame } from 'lucide-react';
import { GlowingEffect } from '../ui';
import './ClientWellnessBand.css';

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

const STAT_KEYS = [
  { key: 'energy', label: 'Energía', icon: Battery, suffix: '/10' },
  { key: 'sleep', label: 'Sueño', icon: Moon, suffix: 'h' },
  { key: 'soreness', label: 'Dolor', icon: Flame, suffix: '/10' },
];

export default function ClientWellnessBand({ data, isLoading, range = '30d', accentRgb }) {
  const breakdown = data?.readinessBreakdown || [];
  const days = RANGE_DAYS[range] || 30;

  const stats = useMemo(() => {
    return STAT_KEYS.map((s) => {
      const series = breakdown
        .map((d) => ({ date: d.date, value: d[s.key] }))
        .filter((d) => typeof d.value === 'number');
      const avg = series.length
        ? series.reduce((sum, d) => sum + d.value, 0) / series.length
        : null;
      return { ...s, series, avg };
    });
  }, [breakdown]);

  const a = accentRgb || [255, 255, 255];
  const accentLine = `rgba(${a[0]},${a[1]},${a[2]},0.6)`;

  if (isLoading) {
    return (
      <section className="cwb-band">
        <header className="cwb-head">
          <span className="cwb-skel cwb-skel--title" />
          <span className="cwb-skel cwb-skel--range" />
        </header>
        <div className="cwb-stats-row">
          {STAT_KEYS.map((s) => (
            <div key={s.key} className="cwb-stat">
              <div className="cwb-stat-head">
                <span className="cwb-skel cwb-skel--icon" />
                <span className="cwb-skel cwb-skel--label" />
              </div>
              <div className="cwb-stat-value">
                <span className="cwb-skel cwb-skel--num" />
              </div>
              <div className="cwb-stat-spark cwb-skel cwb-skel--spark" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!breakdown.length) {
    return (
      <section className="cwb-band">
        <GlowingEffect spread={40} proximity={120} borderWidth={1} />
        <header className="cwb-head">
          <h3 className="cwb-title">Bienestar</h3>
          <span className="cwb-range">últimos {days} días</span>
        </header>
        <div className="cwb-empty">
          <p>Tu cliente aún no registra entradas de bienestar en este período.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="cwb-band">
      <GlowingEffect spread={40} proximity={120} borderWidth={1} />
      <header className="cwb-head">
        <h3 className="cwb-title">Bienestar</h3>
        <span className="cwb-range">últimos {days} días · {breakdown.length} registros</span>
      </header>

      <div className="cwb-stats-row">
        {stats.map((s) => (
          <StatCard key={s.key} stat={s} accentLine={accentLine} />
        ))}
      </div>
    </section>
  );
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ stat, accentLine }) {
  const Icon = stat.icon;
  return (
    <div className="cwb-stat">
      <div className="cwb-stat-head">
        <Icon size={12} className="cwb-stat-icon" />
        <span className="cwb-stat-label">{stat.label}</span>
      </div>
      <div className="cwb-stat-value">
        {stat.avg != null ? (
          <>
            <span className="cwb-stat-num">{stat.avg.toFixed(1)}</span>
            <span className="cwb-stat-suffix">{stat.suffix}</span>
          </>
        ) : (
          <span className="cwb-stat-empty">—</span>
        )}
      </div>
      <div className="cwb-stat-spark">
        {stat.series.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stat.series}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={accentLine}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive
                animationDuration={900}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}
