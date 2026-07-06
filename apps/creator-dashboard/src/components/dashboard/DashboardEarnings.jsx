import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../utils/apiClient';
import { cacheConfig } from '../../config/queryClient';
import { GlowingEffect, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';
import './DashboardEarnings.css';

// ── Formatting ──────────────────────────────────────────────────────────────

const CURRENCY_ORDER = ['COP', 'USD'];
const CUR_COLOR = { COP: 'rgba(100,225,150,0.90)', USD: 'rgba(100,180,255,0.90)' };
const REVENUE_COLOR = 'rgba(100,225,150,0.9)';
const MRR_COLOR = 'rgba(100,180,255,0.9)';
const ACTIVE_COLOR = 'rgba(210,120,255,0.9)';
const MONTHLY_COLOR = 'rgba(255,190,90,0.9)';

function fmtMoney(n, cur) {
  return new Intl.NumberFormat(cur === 'USD' ? 'en-US' : 'es-CO', {
    style: 'currency',
    currency: cur || 'COP',
    minimumFractionDigits: cur === 'USD' ? 2 : 0,
    maximumFractionDigits: cur === 'USD' ? 2 : 0,
  }).format(n ?? 0);
}

function fmtDay(str) {
  if (!str) return '';
  try {
    const [y, m, d] = str.split('-');
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  } catch { return str; }
}

function orderCurrencies(list) {
  const set = list || [];
  return [
    ...CURRENCY_ORDER.filter((c) => set.includes(c)),
    ...set.filter((c) => !CURRENCY_ORDER.includes(c)),
  ];
}

// ── Primitives ──────────────────────────────────────────────────────────────

function Card({ children, className = '' }) {
  return (
    <div className={`earn-card ${className}`}>
      <GlowingEffect spread={40} proximity={140} borderWidth={1} />
      <div className="earn-card__inner">{children}</div>
    </div>
  );
}

function Sparkline({ id, values, color }) {
  const data = useMemo(() => (values || []).map((v, i) => ({ i, v })), [values]);
  if (data.length < 2) return null;
  return (
    <div className="earn-spark">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function MoneyTile({ label, totals, currencies, field, spark, sparkColor, sparkId }) {
  const curs = orderCurrencies(currencies);
  const nonEmpty = curs.filter((c) => (totals[c]?.[field] ?? 0) !== 0);
  const show = nonEmpty.length ? nonEmpty : curs.slice(0, 1);
  return (
    <Card className="earn-tile">
      <p className="earn-label">{label}</p>
      {show.length === 0 ? (
        <div className="earn-empty"><span>Sin datos</span></div>
      ) : (
        <div className="earn-money-list">
          {show.map((c) => (
            <div key={c} className="earn-money-row">
              <span className="earn-money-value">{fmtMoney(Math.max(0, totals[c]?.[field] ?? 0), c)}</span>
              <span className="earn-cur-tag" style={{ color: CUR_COLOR[c] }}>{c}</span>
            </div>
          ))}
        </div>
      )}
      {spark && <Sparkline id={sparkId} values={spark} color={sparkColor} />}
    </Card>
  );
}

function CountTile({ label, value, churn = 0, spark, sparkColor, sparkId }) {
  return (
    <Card className="earn-tile">
      <p className="earn-label">{label}</p>
      <div className="earn-count">
        <span className="earn-count__value">{value}</span>
        {churn > 0 && <span className="earn-count__churn">{churn} de baja</span>}
      </div>
      {spark && <Sparkline id={sparkId} values={spark} color={sparkColor} />}
    </Card>
  );
}

function DailyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="earn-tooltip">
      <span className="earn-tooltip__label">{fmtDay(label)}</span>
      {payload.filter((e) => e.value).map((e) => (
        <span key={e.name} style={{ color: e.color }}>{e.name}: {fmtMoney(e.value, e.name)}</span>
      ))}
    </div>
  );
}

function ProgramRow({ program }) {
  const curs = orderCurrencies(Object.keys(program.currencies || {}));
  const active = curs.reduce((s, c) => s + (program.currencies[c]?.activeSubscriptions ?? 0), 0);
  const monthly = program.monthlyActive || [];
  const spark = monthly.length >= 2 ? monthly.map((m) => m.active) : null;
  const peak = monthly.reduce((mx, m) => Math.max(mx, m.active), active);
  const churned = Math.max(0, peak - active);
  return (
    <Card className="earn-program">
      <p className="earn-program__title">{program.title}</p>
      <div className="earn-money-list">
        {curs.map((c) => (
          <div key={c} className="earn-money-row">
            <span className="earn-money-value earn-money-value--sm">{fmtMoney(Math.max(0, program.currencies[c]?.revenue ?? 0), c)}</span>
            <span className="earn-cur-tag" style={{ color: CUR_COLOR[c] }}>{c}</span>
          </div>
        ))}
      </div>
      <div className="earn-program__meta">
        <span>{active} activas</span>
        {churned > 0 && <><span>·</span><span className="earn-program__churn">{churned} de baja</span></>}
      </div>
      {spark && <Sparkline id={`spk-prog-${program.courseId}`} values={spark} color={MONTHLY_COLOR} />}
    </Card>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

function DashboardEarnings({ programId = null }) {
  const { user } = useAuth();
  const { data: res, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'earnings', user?.uid],
    queryFn: () => apiClient.get('/analytics/earnings'),
    enabled: !!user?.uid,
    ...cacheConfig.analytics,
  });
  const data = res?.data;

  const scoped = useMemo(() => {
    if (!data) return null;
    if (!programId) {
      return {
        totals: data.totals || {},
        currencies: data.currencies || [],
        programs: data.programs || [],
        daily: data.daily || [],
        monthlyActive: data.monthlyActive || [],
      };
    }
    const p = (data.programs || []).find((x) => x.courseId === programId);
    const totals = p?.currencies || {};
    return {
      totals,
      currencies: Object.keys(totals),
      programs: [],
      daily: [],
    };
  }, [data, programId]);

  const sparks = useMemo(() => {
    const d = scoped?.daily || [];
    if (d.length < 2) return null;
    let cop = 0;
    return {
      revenue: d.map((p) => (cop += p.COP || 0)),
      mrr: d.map((p) => p.mrrCum || 0),
      active: d.map((p) => p.activeCum || 0),
    };
  }, [scoped]);

  if (isLoading) {
    return <div className="earn-wrap"><div className="earn-kpis">{[0, 1, 2].map((i) => <SkeletonCard key={i} />)}</div></div>;
  }
  if (isError) {
    return <div className="earn-wrap"><InlineError message="No se pudo cargar los ingresos." field="earnings" /></div>;
  }
  if (!scoped) return null;

  const { totals, currencies, programs, daily } = scoped;
  const totalActive = currencies.reduce((s, c) => s + (totals[c]?.activeSubscriptions ?? 0), 0);
  const chartCurrencies = orderCurrencies(currencies).filter((c) => daily.some((p) => (p[c] ?? 0) !== 0));
  const aggMonthly = scoped.monthlyActive || [];
  const activeSpark = aggMonthly.length >= 2 ? aggMonthly.map((m) => m.active) : sparks?.active;
  const totalChurned = programs.reduce((sum, p) => {
    const pActive = orderCurrencies(Object.keys(p.currencies || {}))
      .reduce((s, c) => s + (p.currencies[c]?.activeSubscriptions ?? 0), 0);
    const pPeak = (p.monthlyActive || []).reduce((mx, m) => Math.max(mx, m.active), pActive);
    return sum + Math.max(0, pPeak - pActive);
  }, 0);

  return (
    <div className="earn-wrap">
      <div className="earn-kpis">
        <MoneyTile label="Revenue" totals={totals} currencies={currencies} field="revenue"
          spark={sparks?.revenue} sparkColor={REVENUE_COLOR} sparkId="spk-rev" />
        <MoneyTile label="MRR" totals={totals} currencies={currencies} field="mrr"
          spark={sparks?.mrr} sparkColor={MRR_COLOR} sparkId="spk-mrr" />
        <CountTile label="Suscripciones activas" value={totalActive} churn={totalChurned}
          spark={activeSpark} sparkColor={ACTIVE_COLOR} sparkId="spk-act" />
      </div>

      {!programId && chartCurrencies.length > 0 && (
        <Card className="earn-chart-card">
          <p className="earn-label">Ingresos · últimos 30 días</p>
          <div className="earn-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
                <defs>
                  {chartCurrencies.map((c) => (
                    <linearGradient key={c} id={`earnGrad-${c}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CUR_COLOR[c] || 'rgba(255,255,255,0.5)'} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={CUR_COLOR[c] || 'rgba(255,255,255,0.5)'} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} interval={6} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} tickFormatter={fmtDay} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} width={48} />
                <Tooltip content={<DailyTooltip />} />
                {chartCurrencies.map((c) => (
                  <Area key={c} type="monotone" dataKey={c} name={c} stroke={CUR_COLOR[c] || 'rgba(255,255,255,0.8)'} strokeWidth={1.5} fill={`url(#earnGrad-${c})`} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} isAnimationActive={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {!programId && programs.length > 0 && (
        <div className="earn-section">
          <p className="earn-section-title">Por programa</p>
          <div className="earn-programs">{programs.map((p) => <ProgramRow key={p.courseId} program={p} />)}</div>
        </div>
      )}
    </div>
  );
}

export default DashboardEarnings;
