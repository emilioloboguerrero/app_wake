import { useState, useMemo, useCallback } from 'react';
import { NumberTicker, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

const WAKE_FEE = 0.15;

function ChevronIcon({ open }) {
  return (
    <svg
      className={`revenue-chevron ${open ? 'revenue-chevron--open' : ''}`}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 5.5L7 8.5L10 5.5"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfoIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      <path d="M8 7v4M8 5.5v-.01" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function WidgetEmpty({ message }) {
  return <p className="ds-widget-empty">{message}</p>;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function RevenueWidget({ revenueQuery, lowTicket, oneOnOne, programs = [] }) {
  const [expanded, setExpanded] = useState(false);

  const revenueData = revenueQuery.data?.data ?? {};
  const grossRevenue = revenueData.gross ?? 0;
  const netRevenue = useMemo(() => grossRevenue * (1 - WAKE_FEE), [grossRevenue]);
  const wakeFeeAmount = useMemo(() => grossRevenue * WAKE_FEE, [grossRevenue]);

  const hasLowTicket = programs.some(p => p.deliveryType === 'low_ticket');
  const hasOneOnOne = programs.some(p => p.deliveryType === 'one_on_one');

  const perProgramRevenue = useMemo(() => {
    if (!revenueData.byProgram) return [];
    return revenueData.byProgram.map(entry => ({
      ...entry,
      net: (entry.gross ?? 0) * (1 - WAKE_FEE),
    }));
  }, [revenueData.byProgram]);

  const toggleExpanded = useCallback(() => setExpanded(prev => !prev), []);

  if (revenueQuery.isLoading) {
    return (
      <div className="ds-widget-inner">
        <p className="ds-widget-title">Ingresos netos</p>
        <SkeletonCard />
      </div>
    );
  }

  if (revenueQuery.isError) {
    return (
      <div className="ds-widget-inner">
        <p className="ds-widget-title">Ingresos netos</p>
        <InlineError
          message="No pudimos cargar tus ingresos. Toca para reintentar."
          field="revenue"
        />
      </div>
    );
  }

  if (lowTicket.netRevenue === 0 && lowTicket.salesCount === 0 && oneOnOne.clientCount === 0) {
    return (
      <div className="ds-widget-inner">
        <p className="ds-widget-title">Ingresos netos</p>
        <WidgetEmpty message="Cuando vendas tu primer programa, aqui vas a ver tus ingresos." />
      </div>
    );
  }

  return (
    <div className="revenue-card__inner" onClick={toggleExpanded} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && toggleExpanded()}>
      {/* Header row */}
      <div className="revenue-card__header">
        <span className="revenue-card__label">
          {hasLowTicket ? 'Ingresos netos' : 'Clientes activos'}
        </span>
        <span className="revenue-card__info-icon">
          <InfoIcon />
        </span>
      </div>

      {/* Main number */}
      <div className="revenue-card__value">
        {hasLowTicket ? (
          <NumberTicker value={netRevenue} prefix="$" suffix="" decimals={0} />
        ) : (
          <div className="revenue-card__one-on-one-stats">
            <span className="revenue-card__stat">
              <NumberTicker value={oneOnOne.clientCount} decimals={0} />
              <span className="revenue-card__stat-label">
                {oneOnOne.clientCount === 1 ? 'cliente' : 'clientes'}
              </span>
            </span>
            <span className="revenue-card__stat-divider" />
            <span className="revenue-card__stat">
              <NumberTicker value={oneOnOne.callCount} decimals={0} />
              <span className="revenue-card__stat-label">
                {oneOnOne.callCount === 1 ? 'llamada' : 'llamadas'}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* One-on-one summary when both types */}
      {hasLowTicket && hasOneOnOne && (
        <div className="revenue-card__secondary">
          {oneOnOne.clientCount} {oneOnOne.clientCount === 1 ? 'cliente' : 'clientes'} 1:1
          {oneOnOne.callCount > 0 && ` \u00B7 ${oneOnOne.callCount} ${oneOnOne.callCount === 1 ? 'llamada' : 'llamadas'}`}
        </div>
      )}

      {/* Expanded breakdown */}
      {expanded && hasLowTicket && (
        <div className="revenue-card__breakdown">
          <div className="revenue-card__breakdown-row">
            <span className="revenue-card__breakdown-label">Ingresos brutos</span>
            <span className="revenue-card__breakdown-value">{formatCurrency(grossRevenue)}</span>
          </div>
          <div className="revenue-card__breakdown-row revenue-card__breakdown-row--fee">
            <span className="revenue-card__breakdown-label">Tarifa (15%)</span>
            <span className="revenue-card__breakdown-value">-{formatCurrency(wakeFeeAmount)}</span>
          </div>
          <div className="revenue-card__breakdown-divider" />
          <div className="revenue-card__breakdown-row revenue-card__breakdown-row--net">
            <span className="revenue-card__breakdown-label">Ingresos netos</span>
            <span className="revenue-card__breakdown-value">{formatCurrency(netRevenue)}</span>
          </div>
          {perProgramRevenue.length > 1 && (
            <div className="revenue-card__programs">
              <span className="revenue-card__programs-title">Por programa</span>
              {perProgramRevenue.map(prog => (
                <div key={prog.programId} className="revenue-card__program-row">
                  <span className="revenue-card__program-name">{prog.title}</span>
                  <span className="revenue-card__program-value">{formatCurrency(prog.net)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
