import React, { useRef, useState, useCallback, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import MuscleSilhouetteSVG from './MuscleSilhouetteSVG';
import './SessionVolumeDrawer.css';

const MUSCLE_DISPLAY_NAMES = {
  pecs: 'Pectorales', front_delts: 'Deltoides Frontales', side_delts: 'Deltoides Laterales',
  rear_delts: 'Deltoides Posteriores', triceps: 'Tríceps', traps: 'Trapecios',
  abs: 'Abdominales', lats: 'Dorsales', rhomboids: 'Romboides', biceps: 'Bíceps',
  forearms: 'Antebrazos', quads: 'Cuádriceps', glutes: 'Glúteos',
  hamstrings: 'Isquiotibiales', calves: 'Gemelos', hip_flexors: 'Flexores de Cadera',
  obliques: 'Oblicuos', lower_back: 'Lumbar', neck: 'Cuello',
};

const getMuscleDisplayName = (key) => MUSCLE_DISPLAY_NAMES[key] || key;

const SessionVolumeDrawer = ({ isOpen, onClose, plannedMuscleVolumes = {} }) => {
  const volumeCardsRowRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = volumeCardsRowRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(updateScrollState, 100);
      return () => clearTimeout(t);
    }
  }, [isOpen, plannedMuscleVolumes, updateScrollState]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const entries = Object.entries(plannedMuscleVolumes).sort(([, a], [, b]) => b - a);
  const top3 = entries.slice(0, 3);
  const isEmpty = entries.length === 0;

  return (
    <>
      <div className="svd-backdrop" onClick={onClose} />
      <div className="svd-drawer">
        <div className="svd-panel">
          <div className="svd-header">
            <div className="svd-header-top">
              <div>
                <h3 className="svd-title">Volumen planificado</h3>
                <p className="svd-subtitle">
                  Series efectivas por músculo (intensidad ≥7)
                </p>
              </div>
              <button type="button" className="svd-close" onClick={onClose}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>

          <div className="svd-content">
            {isEmpty ? (
              <div className="svd-empty">
                Añade ejercicios con series e intensidad para ver el volumen por músculo.
              </div>
            ) : (
              <>
                <div className="svd-silhouette-wrap">
                  <MuscleSilhouetteSVG muscleVolumes={plannedMuscleVolumes} />
                </div>

                <div className="svd-cards-wrapper">
                  <button
                    type="button"
                    className={`svd-chevron svd-chevron-left ${!canScrollLeft ? 'svd-chevron--inactive' : ''}`}
                    disabled={!canScrollLeft}
                    onClick={() => volumeCardsRowRef.current?.scrollBy({ left: -volumeCardsRowRef.current.clientWidth, behavior: 'smooth' })}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <button
                    type="button"
                    className={`svd-chevron svd-chevron-right ${!canScrollRight ? 'svd-chevron--inactive' : ''}`}
                    disabled={!canScrollRight}
                    onClick={() => volumeCardsRowRef.current?.scrollBy({ left: volumeCardsRowRef.current.clientWidth, behavior: 'smooth' })}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>

                  <div ref={volumeCardsRowRef} className="svd-cards-row" onScroll={updateScrollState}>
                    {/* Pie chart card */}
                    <div className="svd-card svd-pie-card">
                      <div className="svd-pie-wrap">
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <defs>
                              {[0, 1, 2].map(i => (
                                <linearGradient key={i} id={`svd-pie-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={`rgba(255,255,255,${0.22 + i * 0.06})`} />
                                  <stop offset="50%" stopColor={`rgba(255,255,255,${0.12 + i * 0.04})`} />
                                  <stop offset="100%" stopColor={`rgba(255,255,255,${0.05 + i * 0.03})`} />
                                </linearGradient>
                              ))}
                            </defs>
                            <Pie
                              data={top3.map(([muscle, sets]) => ({ name: getMuscleDisplayName(muscle), value: sets }))}
                              cx="50%" cy="50%" innerRadius={40} outerRadius={64}
                              paddingAngle={2} dataKey="value" label={false}
                            >
                              {top3.map((_, i) => <Cell key={i} fill={`url(#svd-pie-grad-${i})`} />)}
                            </Pie>
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const { name, value } = payload[0].payload;
                                return (
                                  <div className="svd-pie-tooltip">
                                    <span className="svd-pie-tooltip-name">{name}</span>
                                    <span className="svd-pie-tooltip-sets">{Number(value).toFixed(1)} sets</span>
                                  </div>
                                );
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      {top3.length > 0 && (
                        <div className="svd-pie-legend">
                          {top3.map(([muscle, sets], i) => (
                            <div key={muscle} className="svd-pie-legend-item">
                              <span className="svd-pie-legend-dot" style={{ background: `rgba(255,255,255,${0.12 + i * 0.08})` }} />
                              <span className="svd-pie-legend-name">{getMuscleDisplayName(muscle)}</span>
                              <span className="svd-pie-legend-sets">{Number(sets).toFixed(1)} sets</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sets list card */}
                    <div className="svd-card svd-sets-card">
                      <div className="svd-sets-scroll">
                        {entries.map(([muscle, sets]) => (
                          <div key={muscle} className="svd-muscle-row">
                            <span className="svd-muscle-name">{getMuscleDisplayName(muscle)}</span>
                            <div className="svd-muscle-bar-wrap">
                              <div className="svd-muscle-bar" style={{ width: `${Math.min(100, (sets / (entries[0]?.[1] || 1)) * 100)}%` }} />
                            </div>
                            <span className="svd-muscle-sets">{Number(sets).toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SessionVolumeDrawer;
