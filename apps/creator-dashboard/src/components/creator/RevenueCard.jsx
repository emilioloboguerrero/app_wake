import { useState, useMemo, useCallback } from 'react';
import { BentoCard } from '../ui/BentoGrid';
import NumberTicker from '../ui/NumberTicker';
import './RevenueCard.css';

const DATE_RANGE_OPTIONS = [
  { value: '7d', label: 'Ultimos 7 dias' },
  { value: '30d', label: 'Ultimos 30 dias' },
  { value: '90d', label: 'Ultimos 90 dias' },
  { value: 'year', label: 'Este ano' },
  { value: 'all', label: 'Todo' },
];

const WAKE_FEE = 0.15;

function InfoIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
      <path
        d="M8 7v4M8 5.5v-.01"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

export default function RevenueCard({
  programs = [],
  revenueData = {},
  dateRange = '30d',
  onDateRangeChange,
}) {
  const [expanded, setExpanded] = useState(false);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);

  const lowTicketPrograms = useMemo(
    () => programs.filter((p) => p.deliveryType === 'low_ticket'),
    [programs]
  );

  const oneOnOnePrograms = useMemo(
    () => programs.filter((p) => p.deliveryType === 'one_on_one'),
    [programs]
  );

  const hasLowTicket = lowTicketPrograms.length > 0;
  const hasOneOnOne = oneOnOnePrograms.length > 0;

  const grossRevenue = revenueData.gross ?? 0;
  const netRevenue = useMemo(() => grossRevenue * (1 - WAKE_FEE), [grossRevenue]);
  const wakeFeeAmount = useMemo(() => grossRevenue * WAKE_FEE, [grossRevenue]);

  const perProgramRevenue = useMemo(() => {
    if (!revenueData.byProgram) return [];
    return revenueData.byProgram.map((entry) => ({
      ...entry,
      net: (entry.gross ?? 0) * (1 - WAKE_FEE),
    }));
  }, [revenueData.byProgram]);

  const clientCount = revenueData.clientCount ?? 0;
  const callCount = revenueData.callCount ?? 0;

  const toggleExpanded = useCallback(() => setExpanded((prev) => !prev), []);

  const handleDateSelect = useCallback(
    (value) => {
      onDateRangeChange?.(value);
      setDateDropdownOpen(false);
    },
    [onDateRangeChange]
  );

  const currentDateLabel = useMemo(
    () => DATE_RANGE_OPTIONS.find((o) => o.value === dateRange)?.label ?? dateRange,
    [dateRange]
  );

  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);

  return (
    <BentoCard span="2x1" className="revenue-card" onClick={toggleExpanded}>
      <div className="revenue-card__inner">
        {/* Header row */}
        <div className="revenue-card__header">
          <span className="revenue-card__label">
            {hasLowTicket ? 'Ingresos netos' : 'Clientes activos'}
          </span>
          <div className="revenue-card__actions">
            {/* Date range selector */}
            <div className="revenue-date-selector">
              <button
                className="revenue-date-selector__trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  setDateDropdownOpen((prev) => !prev);
                }}
                type="button"
              >
                {currentDateLabel}
                <ChevronIcon open={dateDropdownOpen} />
              </button>
              {dateDropdownOpen && (
                <div className="revenue-date-selector__dropdown">
                  {DATE_RANGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`revenue-date-selector__option ${
                        opt.value === dateRange ? 'revenue-date-selector__option--active' : ''
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDateSelect(opt.value);
                      }}
                      type="button"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="revenue-card__info-icon">
              <InfoIcon />
            </span>
          </div>
        </div>

        {/* Main number */}
        <div className="revenue-card__value">
          {hasLowTicket ? (
            <NumberTicker value={netRevenue} prefix="$" suffix="" decimals={0} />
          ) : (
            <div className="revenue-card__one-on-one-stats">
              <span className="revenue-card__stat">
                <NumberTicker value={clientCount} decimals={0} />
                <span className="revenue-card__stat-label">
                  {clientCount === 1 ? 'cliente' : 'clientes'}
                </span>
              </span>
              <span className="revenue-card__stat-divider" />
              <span className="revenue-card__stat">
                <NumberTicker value={callCount} decimals={0} />
                <span className="revenue-card__stat-label">
                  {callCount === 1 ? 'llamada' : 'llamadas'}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* One-on-one summary when both types exist */}
        {hasLowTicket && hasOneOnOne && (
          <div className="revenue-card__secondary">
            {clientCount} {clientCount === 1 ? 'cliente' : 'clientes'} 1:1
            {callCount > 0 && ` · ${callCount} ${callCount === 1 ? 'llamada' : 'llamadas'}`}
          </div>
        )}

        {/* Expanded breakdown */}
        {expanded && hasLowTicket && (
          <div className="revenue-card__breakdown">
            <div className="revenue-card__breakdown-row">
              <span className="revenue-card__breakdown-label">Ingresos brutos</span>
              <span className="revenue-card__breakdown-value">
                {formatCurrency(grossRevenue)}
              </span>
            </div>
            <div className="revenue-card__breakdown-row revenue-card__breakdown-row--fee">
              <span className="revenue-card__breakdown-label">Tarifa (15%)</span>
              <span className="revenue-card__breakdown-value">
                -{formatCurrency(wakeFeeAmount)}
              </span>
            </div>
            <div className="revenue-card__breakdown-divider" />
            <div className="revenue-card__breakdown-row revenue-card__breakdown-row--net">
              <span className="revenue-card__breakdown-label">Ingresos netos</span>
              <span className="revenue-card__breakdown-value">
                {formatCurrency(netRevenue)}
              </span>
            </div>

            {/* Per-program breakdown */}
            {perProgramRevenue.length > 1 && (
              <div className="revenue-card__programs">
                <span className="revenue-card__programs-title">Por programa</span>
                {perProgramRevenue.map((prog) => (
                  <div key={prog.programId} className="revenue-card__program-row">
                    <span className="revenue-card__program-name">{prog.title}</span>
                    <span className="revenue-card__program-value">
                      {formatCurrency(prog.net)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </BentoCard>
  );
}
