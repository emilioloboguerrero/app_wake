import { useState, useMemo, useCallback, useRef } from 'react';
import MuscleSilhouetteSVG from '../MuscleSilhouetteSVG';
import ImplementsPills from './ImplementsPills';
import MenuDropdown from '../ui/MenuDropdown';
import { EXERCISE_PRESETS, MUSCLE_DISPLAY_NAMES } from '../../constants/exerciseConstants';

function MuscleActivationList({ muscleActivation, sortOrder, onChange }) {
  const handleRemove = useCallback((muscle) => {
    const next = { ...muscleActivation };
    delete next[muscle];
    onChange(next);
  }, [muscleActivation, onChange]);

  // Use sortOrder for display, but filter to only muscles that exist in current activation
  const displayList = useMemo(() => {
    const activeSet = new Set(
      Object.entries(muscleActivation).filter(([, v]) => v > 0).map(([m]) => m)
    );
    // Show muscles in sortOrder first, then any new ones not yet in sortOrder
    const ordered = sortOrder.filter(m => activeSet.has(m));
    const remaining = [...activeSet].filter(m => !sortOrder.includes(m));
    return [...ordered, ...remaining];
  }, [muscleActivation, sortOrder]);

  if (displayList.length === 0) {
    return (
      <div className="lex-muscle-list-empty">
        <p>Haz clic en un músculo para activarlo</p>
      </div>
    );
  }

  return (
    <div className="lex-muscle-list">
      {displayList.map((muscle) => {
        const value = muscleActivation[muscle];
        const effectiveSets = (value / 100).toFixed(1);
        return (
          <div key={muscle} className="lex-muscle-list-row">
            <span className="lex-muscle-list-name">
              {MUSCLE_DISPLAY_NAMES[muscle] || muscle}
            </span>
            <div className="lex-muscle-list-stepper">
              <button
                className="lex-muscle-list-step-btn lex-muscle-list-step-btn--dec"
                onClick={() => {
                  const next = Math.max(0, value - 10);
                  onChange({ ...muscleActivation, [muscle]: next });
                }}
                disabled={value <= 0}
                tabIndex={-1}
              >
                −
              </button>
              <input
                type="number"
                className="lex-muscle-list-input"
                value={effectiveSets}
                min="0"
                max="1"
                step="0.1"
                onChange={(e) => {
                  const raw = parseFloat(e.target.value);
                  if (!isNaN(raw) && raw >= 0 && raw <= 1) {
                    onChange({ ...muscleActivation, [muscle]: Math.round(raw * 100) });
                  }
                }}
              />
              <button
                className="lex-muscle-list-step-btn lex-muscle-list-step-btn--inc"
                onClick={() => {
                  const next = Math.min(100, value + 10);
                  onChange({ ...muscleActivation, [muscle]: next });
                }}
                disabled={value >= 100}
                tabIndex={-1}
              >
                +
              </button>
            </div>
            <button
              className="lex-muscle-list-remove"
              onClick={() => handleRemove(muscle)}
              title="Quitar"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function InteractiveMusclePanel({
  muscleActivation = {},
  muscleSortOrder = [],
  onChange,
  isSaving,
  implements: selectedImplements = [],
  allCustomImplements = [],
  onImplementsChange,
  isSavingImplements,
}) {
  const containerRef = useRef(null);

  const muscleVolumes = useMemo(() => {
    const vols = {};
    for (const [m, val] of Object.entries(muscleActivation)) {
      vols[m] = typeof val === 'number' ? val / 100 : 0;
    }
    return vols;
  }, [muscleActivation]);

  // Click on SVG muscle: toggle on (at 50) or off
  const handleMuscleClick = useCallback((muscleId) => {
    if (muscleActivation[muscleId] !== undefined) {
      const next = { ...muscleActivation };
      delete next[muscleId];
      onChange(next);
    } else {
      onChange({ ...muscleActivation, [muscleId]: 50 });
    }
  }, [muscleActivation, onChange]);

  const handlePresetSelect = useCallback((presetKey) => {
    const preset = EXERCISE_PRESETS[presetKey];
    if (!preset) return;
    onChange({ ...preset.muscles });
  }, [onChange]);

  return (
    <div className="lex-muscle-panel" ref={containerRef}>
      {/* Muscles card */}
      <div className="lex-muscle-card">
        <div className="lex-muscle-left">
          <div className="lex-muscle-svg-container">
            <MuscleSilhouetteSVG
              muscleVolumes={muscleVolumes}
              onMuscleClick={handleMuscleClick}
            />
          </div>
        </div>

        <div className="lex-muscle-right">
          <div className="lex-muscle-right-header">
            <label className="lex-section-label">Series efectivas</label>
            <MenuDropdown
              trigger={
                <button className="lex-preset-menu-btn">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Preset
                </button>
              }
              items={Object.entries(EXERCISE_PRESETS).map(([key, preset]) => ({
                label: preset.name,
                onClick: () => handlePresetSelect(key),
              }))}
            />
          </div>
          <MuscleActivationList
            muscleActivation={muscleActivation}
            sortOrder={muscleSortOrder}
            onChange={onChange}
          />
        </div>
      </div>

      {/* Implements card */}
      {onImplementsChange && (
        <ImplementsPills
          selected={selectedImplements}
          allCustom={allCustomImplements}
          onChange={onImplementsChange}
        />
      )}

    </div>
  );
}
