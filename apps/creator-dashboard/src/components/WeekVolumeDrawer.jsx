import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import MuscleSilhouetteSVG from './MuscleSilhouetteSVG';
import { getMuscleDisplayName } from '../utils/plannedVolumeUtils';
import { getWeekDates, getMondayWeek, isDateInWeek } from '../utils/weekCalculation';
import './WeekVolumeDrawer.css';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MINI_DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Slide-out drawer showing planned volume per muscle for a selected week.
 * Week selector is rendered in the drawer header (slot or built-in select).
 * Button to open the drawer and week selection UX are the parent's responsibility;
 * see WEEK_VOLUME_BUTTON_AND_SELECTOR_PLACEMENT.md for placement recommendations.
 */
const WeekVolumeDrawer = ({
  isOpen,
  onClose,
  title = 'Volumen de la semana',
  subtitle = 'Series efectivas por músculo (intensidad ≥7) para esta semana.',
  /** Optional. If provided, drawer shows a week selector in the header. */
  weekOptions = [],
  selectedWeekValue = '',
  onWeekChange,
  loading = false,
  /** { [muscleKey]: effectiveSets } - same shape as session volume */
  plannedMuscleVolumes = {},
  emptyMessage = 'Selecciona una semana con sesiones para ver el volumen por músculo.',
  /** When set and selectedWeekValue is empty, show this instead of emptyMessage (e.g. "Haz clic en una semana del calendario"). */
  promptWhenNoWeek = '',
  /** 'full' = full-height drawer (plan design). 'card' = session-card style, does not go all the way up (planificación). */
  variant = 'full',
  /** First day of the month to show in the mini calendar (optional; defaults to first week in weekOptions). */
  displayMonth,
  /** 'calendar' = date-based mini calendar (planificación). 'list' = list of plan weeks only (plan library). */
  weekSelectorStyle = 'calendar',
}) => {
  const volumeCardsRowRef = useRef(null);
  const [volumeCanScrollLeft, setVolumeCanScrollLeft] = useState(false);
  const [volumeCanScrollRight, setVolumeCanScrollRight] = useState(false);

  const initialDisplayMonth = useMemo(() => {
    if (weekSelectorStyle === 'list') return new Date();
    if (displayMonth) return new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
    if (!weekOptions.length) return new Date();
    try {
      const { start } = getWeekDates(weekOptions[0].value);
      return new Date(start.getFullYear(), start.getMonth(), 1);
    } catch (_) {
      return new Date();
    }
  }, [displayMonth, weekOptions, weekSelectorStyle]);

  const [miniCalendarMonth, setMiniCalendarMonth] = useState(initialDisplayMonth);
  useEffect(() => {
    setMiniCalendarMonth(initialDisplayMonth);
  }, [initialDisplayMonth]);

  const updateVolumeChevronState = useCallback(() => {
    const el = volumeCardsRowRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const threshold = 4;
    setVolumeCanScrollLeft(scrollLeft > threshold);
    setVolumeCanScrollRight(scrollLeft < scrollWidth - clientWidth - threshold);
  }, []);

  const top3PlannedVolumes = React.useMemo(
    () =>
      Object.entries(plannedMuscleVolumes)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3),
    [plannedMuscleVolumes]
  );

  useEffect(() => {
    if (!isOpen || Object.keys(plannedMuscleVolumes).length === 0) return;
    const el = volumeCardsRowRef.current;
    if (!el) return;
    const t = setTimeout(updateVolumeChevronState, 50);
    return () => clearTimeout(t);
  }, [isOpen, plannedMuscleVolumes, updateVolumeChevronState]);

  useEffect(() => {
    const el = volumeCardsRowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateVolumeChevronState);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateVolumeChevronState]);

  const weekKeysSet = useMemo(() => new Set(weekOptions.map((o) => o.value)), [weekOptions]);

  const [hoveredWeekKey, setHoveredWeekKey] = useState(null);

  const miniCalendarDays = useMemo(() => {
    const year = miniCalendarMonth.getFullYear();
    const month = miniCalendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const startDow = (first.getDay() + 6) % 7;
    const startDate = new Date(first);
    startDate.setDate(first.getDate() - startDow);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const inMonth = d.getMonth() === month;
      cells.push({
        date: d,
        day: d.getDate(),
        inMonth,
        weekKey: getMondayWeek(d),
      });
    }
    return cells;
  }, [miniCalendarMonth]);

  const handleMiniDayClick = useCallback(
    (cell) => {
      if (weekKeysSet.has(cell.weekKey)) onWeekChange?.(cell.weekKey);
    },
    [weekKeysSet, onWeekChange]
  );

  const handleMiniDayEnter = useCallback((cell) => {
    setHoveredWeekKey(cell.weekKey);
  }, []);

  const handleMiniDayLeave = useCallback(() => {
    setHoveredWeekKey(null);
  }, []);

  const prevMiniMonth = useCallback(() => {
    setMiniCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, []);

  const nextMiniMonth = useCallback(() => {
    setMiniCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }, []);

  if (!isOpen) return null;

  const hasVolume = Object.keys(plannedMuscleVolumes).length > 0;
  const showWeekReplica = weekOptions.length > 0;
  const useWeekList = weekSelectorStyle === 'list';

  return (
    <>
      <div
        className="week-volume-drawer-backdrop"
        onClick={onClose}
        role="button"
        tabIndex={-1}
        aria-label="Cerrar"
      />
      <div className={`week-volume-drawer ${variant === 'card' ? 'week-volume-drawer--card' : ''}`} role="dialog" aria-label={title}>
        <div className={`week-volume-drawer-panel ${variant === 'card' ? 'week-volume-drawer-panel--card' : ''}`}>
          <header className="week-volume-drawer-header">
            <div className="week-volume-drawer-header-top">
              <h2 className="week-volume-drawer-title">{title}</h2>
              <button
                type="button"
                className="week-volume-drawer-close"
                onClick={onClose}
                aria-label="Cerrar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            {weekOptions.length > 0 && !promptWhenNoWeek && (
              <div className="week-volume-drawer-week-selector">
                <label htmlFor="week-volume-week-select" className="week-volume-drawer-week-label">
                  Semana
                </label>
                <select
                  id="week-volume-week-select"
                  className="week-volume-drawer-week-select"
                  value={selectedWeekValue}
                  onChange={(e) => onWeekChange?.(e.target.value)}
                  aria-label="Seleccionar semana"
                >
                  {weekOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="week-volume-drawer-subtitle">{subtitle}</p>
          </header>
          <div className="week-volume-drawer-content">
            {promptWhenNoWeek && !selectedWeekValue ? (
              <div className="week-volume-drawer-empty">{promptWhenNoWeek}</div>
            ) : loading ? (
              <div className="week-volume-drawer-loading">Cargando volumen...</div>
            ) : !hasVolume ? (
              <div className="week-volume-drawer-empty">{emptyMessage}</div>
            ) : (
              <>
                <div className="week-volume-drawer-svg-wrap">
                  <MuscleSilhouetteSVG muscleVolumes={plannedMuscleVolumes} />
                </div>
                <div className="week-volume-drawer-cards-wrapper">
                  <div
                    ref={volumeCardsRowRef}
                    className="week-volume-drawer-cards-row"
                    onScroll={updateVolumeChevronState}
                  >
                    <div className="week-volume-drawer-card week-volume-drawer-pie-card">
                      <div className="week-volume-drawer-pie-chart-wrap">
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart className="week-volume-drawer-pie-chart">
                            <defs>
                              {[...Array(3)].map((_, i) => {
                                const top = 0.22 + (i * 0.06);
                                const mid = 0.12 + (i * 0.04);
                                const bottom = 0.05 + (i * 0.03);
                                return (
                                  <linearGradient key={i} id={`week-volume-pie-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={`rgba(255,255,255,${top})`} />
                                    <stop offset="50%" stopColor={`rgba(255,255,255,${mid})`} />
                                    <stop offset="100%" stopColor={`rgba(255,255,255,${bottom})`} />
                                  </linearGradient>
                                );
                              })}
                            </defs>
                            <Pie
                              data={top3PlannedVolumes.map(([muscle, sets]) => ({
                                name: getMuscleDisplayName(muscle),
                                value: sets,
                              }))}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={64}
                              paddingAngle={2}
                              dataKey="value"
                              label={false}
                            >
                              {top3PlannedVolumes.map((_, i) => (
                                <Cell key={i} fill={`url(#week-volume-pie-grad-${i})`} />
                              ))}
                            </Pie>
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const { name, value } = payload[0].payload;
                                return (
                                  <div className="week-volume-drawer-pie-tooltip">
                                    <span className="week-volume-drawer-pie-tooltip-name">{name}</span>
                                    <span className="week-volume-drawer-pie-tooltip-sets">{Number(value).toFixed(1)} sets</span>
                                  </div>
                                );
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      {top3PlannedVolumes.length > 0 && (
                        <div className="week-volume-drawer-pie-legend">
                          {top3PlannedVolumes.map(([muscle, sets], i) => (
                            <div key={muscle} className="week-volume-drawer-pie-legend-item">
                              <span className="week-volume-drawer-pie-legend-dot" style={{ background: `rgba(255,255,255,${0.12 + i * 0.08})` }} />
                              <span className="week-volume-drawer-pie-legend-name">{getMuscleDisplayName(muscle)}</span>
                              <span className="week-volume-drawer-pie-legend-sets">{Number(sets).toFixed(1)} sets</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="week-volume-drawer-card week-volume-drawer-sets-card">
                      <div className="week-volume-drawer-sets-card-scroll">
                        {Object.entries(plannedMuscleVolumes)
                          .sort(([, a], [, b]) => b - a)
                          .map(([muscle, sets]) => (
                            <div key={muscle} className="week-volume-drawer-muscle-row">
                              <span className="week-volume-drawer-muscle-name">{getMuscleDisplayName(muscle)}</span>
                              <span className="week-volume-drawer-muscle-sets">{Number(sets).toFixed(1)} sets</span>
                            </div>
                          ))}
                      </div>
                      <div className="week-volume-drawer-desliza">Desliza para ver más</div>
                    </div>
                  </div>
                </div>
                <div className="week-volume-drawer-desliza-lateral">Desliza para ver</div>
              </>
            )}
            {showWeekReplica && (
              <div className="week-volume-drawer-replica">
                <p className="week-volume-drawer-replica-title">Selecciona una semana</p>
                {useWeekList ? (
                  <div className="week-volume-drawer-replica-weeks-list">
                    {weekOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`week-volume-drawer-replica-week-btn ${selectedWeekValue === opt.value ? 'week-volume-drawer-replica-week-btn--selected' : ''}`}
                        onClick={() => onWeekChange?.(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : (
                <div
                  className="week-volume-drawer-mini-calendar"
                  onMouseLeave={handleMiniDayLeave}
                >
                  <div className="week-volume-drawer-mini-calendar-header">
                    <button
                      type="button"
                      className="week-volume-drawer-mini-calendar-nav"
                      onClick={prevMiniMonth}
                      aria-label="Mes anterior"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <span className="week-volume-drawer-mini-calendar-month">
                      {MONTH_NAMES[miniCalendarMonth.getMonth()]} {miniCalendarMonth.getFullYear()}
                    </span>
                    <button
                      type="button"
                      className="week-volume-drawer-mini-calendar-nav"
                      onClick={nextMiniMonth}
                      aria-label="Mes siguiente"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                  <div className="week-volume-drawer-mini-calendar-weekdays">
                    {MINI_DAY_NAMES.map((name) => (
                      <div key={name} className="week-volume-drawer-mini-calendar-weekday">
                        {name}
                      </div>
                    ))}
                  </div>
                  <div className="week-volume-drawer-mini-calendar-grid">
                    {miniCalendarDays.map((cell, i) => {
                      const col = i % 7;
                      const isSelectable = weekKeysSet.has(cell.weekKey);
                      const isSelected = selectedWeekValue && isDateInWeek(cell.date, selectedWeekValue);
                      const isHovered = hoveredWeekKey === cell.weekKey;
                      return (
                        <button
                          key={i}
                          type="button"
                          className={`week-volume-drawer-mini-calendar-day ${!cell.inMonth ? 'week-volume-drawer-mini-calendar-day--other' : ''} ${isSelected ? 'week-volume-drawer-mini-calendar-day--selected' : ''} ${isHovered ? 'week-volume-drawer-mini-calendar-day--hovered-week' : ''} ${isSelectable ? 'week-volume-drawer-mini-calendar-day--selectable' : ''} ${col === 0 ? 'week-volume-drawer-mini-calendar-day--week-start' : ''} ${col === 6 ? 'week-volume-drawer-mini-calendar-day--week-end' : ''}`}
                          onClick={() => isSelectable && handleMiniDayClick(cell)}
                          onMouseEnter={() => handleMiniDayEnter(cell)}
                          disabled={!isSelectable}
                          title={isSelectable ? `Semana del ${cell.date.getDate()}` : undefined}
                        >
                          {cell.day}
                        </button>
                      );
                    })}
                  </div>
                </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default WeekVolumeDrawer;
