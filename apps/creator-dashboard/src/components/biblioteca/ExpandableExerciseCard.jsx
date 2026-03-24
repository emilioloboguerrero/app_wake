import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import useExerciseSets, { parseIntensityForDisplay, getObjectiveFields } from '../../hooks/useExerciseSets';
import { GlowingEffect } from '../ui';
import './ExpandableExerciseCard.css';

const DEFAULT_MEASURE_LABELS = { reps: 'Repeticiones', weight: 'Peso' };
const DEFAULT_OBJECTIVE_LABELS = { reps: 'Repeticiones', intensity: 'Intensidad', previous: 'Anterior' };

const getMeasureLabel = (key, custom = {}) => custom[key] || DEFAULT_MEASURE_LABELS[key] || key;
const getObjectiveLabel = (key, custom = {}) => custom[key] || DEFAULT_OBJECTIVE_LABELS[key] || key;

const getExercisePrimaryName = (exercise) => {
  if (!exercise?.primary || typeof exercise.primary !== 'object') return null;
  const values = Object.values(exercise.primary);
  if (values.length === 0 || !values[0]) return null;
  const val = values[0];
  return typeof val === 'string' ? val : val?.name || val?.title || null;
};

const getExerciseDisplayName = (exercise) => {
  const nameOrTitle = exercise?.name || exercise?.title;
  const nameStr = (nameOrTitle && typeof nameOrTitle === 'string' && nameOrTitle.trim()) ? nameOrTitle.trim() : '';
  const primaryStr = getExercisePrimaryName(exercise) || '';
  if (nameStr && nameStr.toLowerCase() !== 'ejercicio') return nameStr;
  return primaryStr || nameStr || 'Ejercicio';
};

const ExpandableExerciseCard = ({
  exercise,
  sessionId,
  userId,
  contentApi,
  isExpanded,
  onToggleExpand,
  sessionDefaultTemplate,
  libraryTitles,
  libraryExerciseCompleteness,
  onExerciseUpdated,
  onEditPrimary,
  onAddAlternative,
  onDeleteAlternative,
  onOpenPresetSelector,
  onOpenMeasuresEditor,
  isEditMode,
  onDelete,
  isIncomplete,
  showToast,
  accentRgb,
  onSetsChanged,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: exercise.dragId || exercise.id,
    data: { exercise },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isBouncing, setIsBouncing] = useState(false);
  const [lastKnownSetsCount, setLastKnownSetsCount] = useState(null);
  const bounceTimeout = useRef(null);

  const triggerBounce = useCallback(() => {
    setIsBouncing(true);
    if (bounceTimeout.current) clearTimeout(bounceTimeout.current);
    bounceTimeout.current = setTimeout(() => setIsBouncing(false), 280);
  }, []);

  const effectiveMeasures = useMemo(() => {
    if (exercise.measures?.length > 0) return exercise.measures;
    return sessionDefaultTemplate?.measures || [];
  }, [exercise.measures, sessionDefaultTemplate?.measures]);

  const effectiveObjectives = useMemo(() => {
    if (exercise.objectives?.length > 0) return exercise.objectives;
    return sessionDefaultTemplate?.objectives || [];
  }, [exercise.objectives, sessionDefaultTemplate?.objectives]);

  const customMeasureLabels = exercise.customMeasureLabels || sessionDefaultTemplate?.customMeasureLabels || {};
  const customObjectiveLabels = exercise.customObjectiveLabels || sessionDefaultTemplate?.customObjectiveLabels || {};

  const setsHook = useExerciseSets({
    userId,
    sessionId,
    exerciseId: exercise.id,
    contentApi,
    objectives: effectiveObjectives,
    isExpanded,
    showToast,
    onSetsChanged,
    initialDefaults: exercise.defaultSetValues,
  });

  const exerciseName = getExerciseDisplayName(exercise);
  const primaryName = getExercisePrimaryName(exercise);
  const fields = getObjectiveFields(effectiveObjectives);

  // Keep sets count in sync across expand/collapse
  const liveSetsCount = setsHook.setsCount;
  useEffect(() => {
    if (liveSetsCount > 0) setLastKnownSetsCount(liveSetsCount);
  }, [liveSetsCount]);

  const effectiveSetsCount = liveSetsCount > 0 ? liveSetsCount : lastKnownSetsCount;

  const setsSummary = useMemo(() => {
    const count = effectiveSetsCount > 0 ? effectiveSetsCount : (exercise.sets?.length > 0 ? exercise.sets.length : (exercise.setsCount > 0 ? exercise.setsCount : 0));
    if (count <= 0) return null;
    return `${count} ${count === 1 ? 'serie' : 'series'}`;
  }, [effectiveSetsCount, exercise.sets, exercise.setsCount]);

  const alternativeCount = useMemo(() => {
    if (!exercise.alternatives || typeof exercise.alternatives !== 'object') return 0;
    return Object.values(exercise.alternatives).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
  }, [exercise.alternatives]);

  const handleHeaderClick = (e) => {
    e.stopPropagation();
    onToggleExpand(exercise.id);
  };

  const handleSeriesChange = useCallback((delta) => {
    const current = setsHook.setsCount > 0 ? setsHook.setsCount : (lastKnownSetsCount || 0);
    setsHook.syncSetsCount(current + delta);
    triggerBounce();
  }, [setsHook, lastKnownSetsCount, triggerBounce]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`exc-card ${isDragging ? 'exc-card--dragging' : ''} ${isExpanded ? 'exc-card--expanded' : ''}`}
      {...attributes}
    >
      <GlowingEffect spread={40} proximity={100} borderWidth={1} disabled={isDragging} />
      {/* Accent glow behind card */}
      {/* Header */}
      <div
        className="exc-card-header"
        onClick={handleHeaderClick}
        {...(isEditMode ? listeners : {})}
      >
        <div className="exc-card-header-left">
          {isEditMode && (
            <div className="exc-card-drag-handle" {...listeners}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M8 6H8.01M8 12H8.01M8 18H8.01M16 6H16.01M16 12H16.01M16 18H16.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
            </div>
          )}
          <div className="exc-card-info">
            <span className="exc-card-name">{exerciseName}</span>
            {isIncomplete && <span className="exc-card-incomplete-tag">Incompleto</span>}
          </div>
        </div>
        <div className="exc-card-header-right">
          {setsSummary && <span className="exc-card-sets-pill">{setsSummary}</span>}
          {isEditMode && onDelete && (
            <button
              className="exc-card-delete-btn"
              onClick={(e) => { e.stopPropagation(); onDelete(exercise); }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          )}
          {!isEditMode && (
            <svg className={`exc-card-chevron ${isExpanded ? 'exc-card-chevron--open' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
        </div>
      </div>

      {/* Expanded body — always rendered, CSS grid handles show/hide */}
      <div className="exc-card-expand">
        <div className="exc-card-expand-inner">
            <div className="exc-card-body">

              {/* Loading skeleton while sets are being fetched/created */}
              {isExpanded && !setsHook.isLoaded ? (
                <div className="exc-card-skeleton" aria-busy="true">
                  <div className="exc-card-sections-row">
                    <div className="exc-card-left-col">
                      <div className="exc-card-section exc-card-section--identity">
                        <div className="exc-card-section-header">
                          <span className="exc-card-section-title">Ejercicio</span>
                        </div>
                        <div className="exc-card-skel-line exc-card-skel-line--short" />
                        <div className="exc-card-divider" />
                        <div className="exc-card-skel-line exc-card-skel-line--short" />
                      </div>
                      <div className="exc-card-section exc-card-section--data">
                        <div className="exc-card-section-header">
                          <span className="exc-card-section-title">Datos</span>
                        </div>
                        <div className="exc-card-skel-line" />
                        <div className="exc-card-skel-pills">
                          <div className="exc-card-skel-pill" />
                          <div className="exc-card-skel-pill" />
                        </div>
                      </div>
                    </div>
                    <div className="exc-card-section exc-card-section--sets">
                      <div className="exc-card-section-header">
                        <span className="exc-card-section-title">Series</span>
                      </div>
                      <div className="exc-card-skel-line exc-card-skel-line--medium" />
                      <div className="exc-card-skel-line exc-card-skel-line--medium" />
                      <div className="exc-card-skel-line exc-card-skel-line--medium" />
                    </div>
                  </div>
                </div>
              ) : (
              /* ── Scrollable row: left column + series card ── */
              <div className="exc-card-sections-row">

                {/* Left column: Ejercicio on top, Datos below */}
                <div className="exc-card-left-col">
                  {/* Card 1: Primary & Alternatives */}
                  <div className="exc-card-section exc-card-section--identity">
                    <GlowingEffect spread={30} proximity={80} borderWidth={1} />
                    <div className="exc-card-section-header">
                      <span className="exc-card-section-title">Ejercicio</span>
                    </div>

                    <div className="exc-card-field">
                      <span className="exc-card-field-label">Principal</span>
                      <div className="exc-card-field-row">
                        <span className="exc-card-field-value">{primaryName || 'Sin ejercicio'}</span>
                        <button type="button" className="exc-card-icon-btn" onClick={() => onEditPrimary?.(exercise)} title="Cambiar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 8L4 16V20H8L16 12M12 8L14.87 5.13C15.26 4.73 15.46 4.54 15.69 4.46C15.89 4.4 16.11 4.4 16.31 4.46C16.54 4.54 16.73 4.73 17.13 5.13L18.87 6.87C19.26 7.26 19.46 7.46 19.54 7.69C19.6 7.89 19.6 8.11 19.54 8.31C19.46 8.54 19.27 8.74 18.87 9.13L16 12M12 8L16 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    </div>

                    <div className="exc-card-divider" />

                    <div className="exc-card-field">
                      <span className="exc-card-field-label">Alternativas</span>
                      <div className="exc-card-field-row">
                        <span className="exc-card-field-value exc-card-field-value--dim">
                          {alternativeCount > 0 ? `${alternativeCount} alternativa${alternativeCount > 1 ? 's' : ''}` : 'Ninguna'}
                        </span>
                        <button type="button" className="exc-card-icon-btn" onClick={() => onAddAlternative?.(exercise)} title="Agregar">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Data Template (under Ejercicio) */}
                  <div className="exc-card-section exc-card-section--data">
                    <GlowingEffect spread={30} proximity={80} borderWidth={1} />
                    <div className="exc-card-section-header">
                      <span className="exc-card-section-title">Datos</span>
                      <button type="button" className="exc-card-icon-btn" onClick={() => onOpenMeasuresEditor?.(exercise)} title="Editar">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 8L4 16V20H8L16 12M12 8L14.87 5.13C15.26 4.73 15.46 4.54 15.69 4.46C15.89 4.4 16.11 4.4 16.31 4.46C16.54 4.54 16.73 4.73 17.13 5.13L18.87 6.87C19.26 7.26 19.46 7.46 19.54 7.69C19.6 7.89 19.6 8.11 19.54 8.31C19.46 8.54 19.27 8.74 18.87 9.13L16 12M12 8L16 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </div>

                    {effectiveMeasures.length > 0 ? (
                      <div className="exc-card-data-content">
                        <div className="exc-card-data-group">
                          <span className="exc-card-field-label">Medidas</span>
                          <div className="exc-card-data-pills">
                            {effectiveMeasures.map(m => (
                              <span key={m} className="exc-card-pill">{getMeasureLabel(m, customMeasureLabels)}</span>
                            ))}
                          </div>
                        </div>
                        <div className="exc-card-data-group">
                          <span className="exc-card-field-label">Objetivos</span>
                          <div className="exc-card-data-pills">
                            {fields.map(o => (
                              <span key={o} className="exc-card-pill">{getObjectiveLabel(o, customObjectiveLabels)}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="exc-card-data-empty">
                        <span className="exc-card-data-empty-text">Sin plantilla configurada</span>
                        <div className="exc-card-data-empty-actions">
                          <button type="button" className="exc-card-data-empty-btn" onClick={() => onOpenPresetSelector?.(exercise)}>
                            Elegir plantilla
                          </button>
                          <button type="button" className="exc-card-data-empty-btn" onClick={() => onOpenMeasuresEditor?.(exercise)}>
                            Manual
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 2: Sets & Objectives */}
                {effectiveMeasures.length > 0 && (
                  <div className="exc-card-section exc-card-section--sets">
                    <GlowingEffect spread={30} proximity={80} borderWidth={1} />
                    <div className="exc-card-section-header">
                      <span className="exc-card-section-title">Series</span>
                    </div>

                    {/* Series stepper — hover-reveal +/- */}
                    <div className="exc-card-stepper-row">
                      <span className="exc-card-stepper-label">Cantidad</span>
                      <div className="exc-card-stepper">
                        <button
                          type="button"
                          className="exc-card-stepper-btn exc-card-stepper-btn--dec"
                          onClick={() => handleSeriesChange(-1)}
                          tabIndex={-1}
                        >−</button>
                        <span className={`exc-card-stepper-value ${isBouncing ? 'exc-card-stepper-value--bounce' : ''}`}>
                          {effectiveSetsCount || 0}
                        </span>
                        <button
                          type="button"
                          className="exc-card-stepper-btn exc-card-stepper-btn--inc"
                          onClick={() => handleSeriesChange(1)}
                          tabIndex={-1}
                        >+</button>
                      </div>
                    </div>

                    {/* Default values for objectives */}
                    <div className="exc-card-defaults">
                      {fields.map((field) => (
                        <div key={field} className="exc-card-default-field">
                          <span className="exc-card-field-label">{getObjectiveLabel(field, customObjectiveLabels)}</span>
                          {field === 'intensity' ? (
                            <div className="exc-card-intensity-wrap">
                              <input
                                type="text"
                                className="exc-card-input"
                                placeholder="8"
                                maxLength={2}
                                value={setsHook.defaultSetValues[field] != null && setsHook.defaultSetValues[field] !== '' ? String(setsHook.defaultSetValues[field]).replace(/\/10$/, '') : ''}
                                onChange={(e) => setsHook.updateDefaultValue(field, e.target.value)}
                              />
                              <span className="exc-card-intensity-suffix">/10</span>
                            </div>
                          ) : (
                            <input
                              type="text"
                              className="exc-card-input"
                              placeholder={field === 'reps' ? '8-12' : '--'}
                              value={setsHook.defaultSetValues[field] != null && setsHook.defaultSetValues[field] !== '' ? String(setsHook.defaultSetValues[field]) : ''}
                              onChange={(e) => setsHook.updateDefaultValue(field, e.target.value)}
                            />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Toggle per-set detail */}
                    {setsHook.sets.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="exc-card-toggle-detail-btn"
                          onClick={() => setsHook.setShowPerSetDetail(prev => !prev)}
                        >
                          {setsHook.showPerSetDetail ? 'Ocultar detalle' : 'Editar por serie'}
                        </button>

                        {/* Per-set table */}
                        {setsHook.showPerSetDetail && (
                          <div className="exc-card-sets-table-wrap">
                            <table className="exc-card-sets-table">
                              <thead>
                                <tr>
                                  <th className="exc-card-th exc-card-th-num">#</th>
                                  {fields.map(f => (
                                    <th key={f} className="exc-card-th">{getObjectiveLabel(f, customObjectiveLabels)}</th>
                                  ))}
                                  <th className="exc-card-th exc-card-th-actions" />
                                </tr>
                              </thead>
                              <tbody>
                                {setsHook.sets.map((set, idx) => {
                                  const setNum = (set.order != null) ? set.order + 1 : idx + 1;
                                  return (
                                    <tr key={set.id} className="exc-card-tr" style={{ '--row-index': idx }}>
                                      <td className="exc-card-td exc-card-td-num">{setNum}</td>
                                      {fields.map(f => (
                                        <td key={f} className="exc-card-td">
                                          {f === 'intensity' ? (
                                            <div className="exc-card-intensity-wrap">
                                              <input
                                                type="text"
                                                className="exc-card-input exc-card-table-input"
                                                placeholder="--"
                                                maxLength={2}
                                                value={parseIntensityForDisplay(set[f])}
                                                onChange={(e) => setsHook.updateSetValue(idx, f, e.target.value)}
                                              />
                                              <span className="exc-card-intensity-suffix">/10</span>
                                            </div>
                                          ) : (
                                            <input
                                              type="text"
                                              className="exc-card-input exc-card-table-input"
                                              placeholder="--"
                                              value={set[f] != null ? String(set[f]) : ''}
                                              onChange={(e) => setsHook.updateSetValue(idx, f, e.target.value)}
                                            />
                                          )}
                                        </td>
                                      ))}
                                      <td className="exc-card-td exc-card-td-actions">
                                        <button type="button" className="exc-card-action-btn" onClick={() => setsHook.duplicateSet(set)} title="Duplicar">⧉</button>
                                        <button type="button" className="exc-card-action-btn exc-card-action-delete" onClick={() => setsHook.deleteSet(set)} title="Eliminar">×</button>
                                      </td>
                                    </tr>
                                  );
                                })}
                                <tr className="exc-card-tr exc-card-tr--ghost">
                                  <td colSpan={fields.length + 2} className="exc-card-td">
                                    <button
                                      type="button"
                                      className="exc-card-add-set-btn"
                                      onClick={() => setsHook.syncSetsCount((effectiveSetsCount || 0) + 1)}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                      Agregar serie
                                    </button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

              </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default ExpandableExerciseCard;
