import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import MuscleSilhouetteSVG from './MuscleSilhouetteSVG';
import { getMuscleDisplayName } from '../utils/plannedVolumeUtils';
import './WeekVolumeDrawer.css';

const SPRING_EASE = [0.22, 1, 0.36, 1];

const WeekVolumeDrawer = ({
  isOpen,
  onClose,
  title = 'Volumen semanal',
  subtitle,
  weekOptions = [],
  selectedWeekValue = '',
  onWeekChange,
  loading = false,
  plannedMuscleVolumes = {},
  emptyMessage = 'Añade sesiones con ejercicios para ver el volumen.',
  variant = 'full',
  // Comparison
  compareWeekValue = '',
  onCompareWeekChange,
  compareVolumes = {},
  compareLoading = false,
  // Unused but kept for API compat
  promptWhenNoWeek,
  displayMonth,
  weekSelectorStyle,
}) => {
  const hasVolume = Object.keys(plannedMuscleVolumes).length > 0;
  const hasCompare = compareWeekValue && Object.keys(compareVolumes).length > 0;
  const totalSets = useMemo(() => Object.values(plannedMuscleVolumes).reduce((s, v) => s + v, 0), [plannedMuscleVolumes]);

  const sortedMuscles = useMemo(() => {
    const allKeys = new Set([...Object.keys(plannedMuscleVolumes), ...Object.keys(compareVolumes)]);
    return [...allKeys]
      .map((m) => ({
        key: m,
        name: getMuscleDisplayName(m),
        sets: plannedMuscleVolumes[m] ?? 0,
        compareSets: compareVolumes[m] ?? 0,
      }))
      .sort((a, b) => b.sets - a.sets);
  }, [plannedMuscleVolumes, compareVolumes]);

  const maxSets = useMemo(() => Math.max(...sortedMuscles.map(m => Math.max(m.sets, m.compareSets)), 1), [sortedMuscles]);

  const selectedLabel = weekOptions.find(o => o.value === selectedWeekValue)?.label ?? '';
  const compareLabel = weekOptions.find(o => o.value === compareWeekValue)?.label ?? '';

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        className="wvd-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className={`wvd-panel ${variant === 'card' ? 'wvd-panel--card' : ''}`}
        role="dialog"
        aria-label={title}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.35, ease: SPRING_EASE }}
      >
        {/* ── Header ─────────────────────────────── */}
        <header className="wvd-header">
          <div className="wvd-header-top">
            <h2 className="wvd-title">{title}</h2>
            <button type="button" className="wvd-close" onClick={onClose} aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Week tabs */}
          {weekOptions.length > 0 && (
            <div className="wvd-week-tabs">
              {weekOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`wvd-week-tab ${selectedWeekValue === opt.value ? 'wvd-week-tab--active' : ''}`}
                  onClick={() => onWeekChange?.(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* ── Content ────────────────────────────── */}
        <div className="wvd-content">
          {loading ? (
            <div className="wvd-state">
              <div className="cfo-spinner" />
              <p className="wvd-state-text">Cargando volumen</p>
            </div>
          ) : !hasVolume ? (
            <div className="wvd-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}>
                <path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zM12 8v4M12 16h.01"/>
              </svg>
              <p className="wvd-state-text">{emptyMessage}</p>
            </div>
          ) : (
            <>
              {/* SVG + total overlay */}
              <div className="wvd-svg-section">
                <MuscleSilhouetteSVG muscleVolumes={plannedMuscleVolumes} />
                <div className="wvd-total">
                  <span className="wvd-total-number">{totalSets.toFixed(0)}</span>
                  <span className="wvd-total-label">series efectivas</span>
                </div>
              </div>

              {/* Comparison selector */}
              {onCompareWeekChange && weekOptions.length > 1 && (
                <div className="wvd-compare-selector">
                  <span className="wvd-compare-label">Comparar con</span>
                  <select
                    className="wvd-select"
                    value={compareWeekValue}
                    onChange={(e) => onCompareWeekChange(e.target.value)}
                  >
                    <option value="">—</option>
                    {weekOptions.filter(o => o.value !== selectedWeekValue).map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {compareLoading && (
                <div className="wvd-state" style={{ minHeight: 40 }}>
                  <div className="cfo-spinner" style={{ width: 20, height: 20 }} />
                </div>
              )}

              {/* Muscle list with bars */}
              <div className="wvd-muscle-list">
                {hasCompare && (
                  <div className="wvd-muscle-list-header">
                    <span>{selectedLabel}</span>
                    <span>{compareLabel}</span>
                  </div>
                )}
                {sortedMuscles.map(({ key, name, sets, compareSets }) => {
                  const delta = hasCompare ? compareSets - sets : 0;
                  return (
                    <div key={key} className="wvd-muscle-row">
                      <span className="wvd-muscle-name">{name}</span>
                      <div className="wvd-muscle-bars">
                        <div className="wvd-bar-track">
                          <div className="wvd-bar-fill" style={{ width: `${(sets / maxSets) * 100}%` }} />
                        </div>
                        <span className="wvd-muscle-val">{sets.toFixed(1)}</span>
                        {hasCompare && (
                          <>
                            <span className={`wvd-muscle-delta ${delta > 0 ? 'wvd-muscle-delta--up' : delta < 0 ? 'wvd-muscle-delta--down' : ''}`}>
                              {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'}{Math.abs(delta).toFixed(1)}
                            </span>
                            <span className="wvd-muscle-val">{compareSets.toFixed(1)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
};

export default WeekVolumeDrawer;
