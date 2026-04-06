import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import useExerciseSets, { parseIntensityForDisplay, getObjectiveFields } from '../../hooks/useExerciseSets';
import { GlowingEffect } from '../ui';
import ExercisePicker from './ExercisePicker';
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

/* ── Scope prompt — "apply to all exercises or just this one?" ── */
const ScopePrompt = ({ onConfirm, onCancel }) => (
  <div className="exc-card-scope-prompt">
    <span className="exc-card-scope-prompt-label">¿Aplicar a todos los ejercicios?</span>
    <div className="exc-card-scope-prompt-actions">
      <button type="button" className="exc-card-scope-btn exc-card-scope-btn--all" onClick={() => onConfirm(true)}>Todos</button>
      <button type="button" className="exc-card-scope-btn" onClick={() => onConfirm(false)}>Solo este</button>
      <button type="button" className="exc-card-scope-btn exc-card-scope-btn--cancel" onClick={onCancel}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
      </button>
    </div>
  </div>
);

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
  pickerLibraries,
  pickerIsLoadingLibraries,
  onPickerSelectLibrary,
  pickerExercises,
  pickerIsLoadingExercises,
  pickerSelectedLibraryId,
  onPickerSelect,
  pickerIsSaving,
  onAddObjective,
  onRemoveObjective,
  onAddMeasure,
  onRemoveMeasure,
  isEditMode,
  onDelete,
  isIncomplete,
  isMissingLibraryDetails,
  showToast,
  accentRgb,
  onSetsChanged,
  registerFlush,
  globalActivityRef,
  isLibraryMode,
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

  // Exercise picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState(null); // 'primary' | 'add-alternative'

  const handleOpenPicker = (mode) => {
    setPickerMode(mode);
    setPickerOpen(true);
    // Trigger parent to load libraries
    if (mode === 'primary') onEditPrimary?.(exercise, true); // true = just load, don't open modal
    else onAddAlternative?.(exercise, true);
  };

  const handlePickerSelect = (exerciseName) => {
    onPickerSelect?.(exercise, exerciseName, pickerMode);
    setPickerOpen(false);
    setPickerMode(null);
  };

  // Inline add states
  const [addingObjective, setAddingObjective] = useState(false);
  const [newObjectiveName, setNewObjectiveName] = useState('');
  const [addingMeasure, setAddingMeasure] = useState(false);
  const [newMeasureName, setNewMeasureName] = useState('');
  const objectiveInputRef = useRef(null);
  const measureInputRef = useRef(null);

  // Scope prompt state: { action: 'add-objective'|'remove-objective'|'add-measure'|'remove-measure', key, label }
  const [scopePrompt, setScopePrompt] = useState(null);

  useEffect(() => {
    if (addingObjective && objectiveInputRef.current) objectiveInputRef.current.focus();
  }, [addingObjective]);

  useEffect(() => {
    if (addingMeasure && measureInputRef.current) measureInputRef.current.focus();
  }, [addingMeasure]);

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
    initialSets: exercise.sets || [],
    isLibraryMode,
    globalActivityRef,
  });

  // Register flush callback so parent can flush pending set saves before navigation
  useEffect(() => {
    registerFlush?.(exercise.id, setsHook.flushPendingSaves);
    return () => registerFlush?.(exercise.id, null);
  }, [exercise.id, registerFlush, setsHook.flushPendingSaves]);

  const exerciseName = getExerciseDisplayName(exercise);
  const primaryName = getExercisePrimaryName(exercise);
  const fields = getObjectiveFields(effectiveObjectives);

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

  const alternativesList = useMemo(() => {
    if (!exercise.alternatives || typeof exercise.alternatives !== 'object') return [];
    const list = [];
    Object.entries(exercise.alternatives).forEach(([libId, names]) => {
      if (!Array.isArray(names)) return;
      names.forEach((name, idx) => {
        const displayName = typeof name === 'string' ? name : name?.name || name?.title || '';
        if (displayName) list.push({ libraryId: libId, index: idx, name: displayName });
      });
    });
    return list;
  }, [exercise.alternatives]);

  const alternativeCount = alternativesList.length;

  const handleHeaderClick = (e) => {
    e.stopPropagation();
    onToggleExpand(exercise.id);
  };

  const handleSeriesChange = useCallback((delta) => {
    const current = setsHook.setsCount > 0 ? setsHook.setsCount : (lastKnownSetsCount || 0);
    setsHook.syncSetsCount(current + delta);
    triggerBounce();
  }, [setsHook, lastKnownSetsCount, triggerBounce]);

  // ── Objective inline add ──
  const handleObjectiveSubmit = () => {
    const name = newObjectiveName.trim();
    if (!name) return;
    // Create a key from the name (lowercase, no spaces)
    const key = name.toLowerCase().replace(/\s+/g, '_');
    if (fields.includes(key)) {
      setAddingObjective(false);
      setNewObjectiveName('');
      return;
    }
    setScopePrompt({ action: 'add-objective', key, label: name });
    setAddingObjective(false);
  };

  const handleObjectiveRemove = (field) => {
    setScopePrompt({ action: 'remove-objective', key: field });
  };

  // ── Measure inline add ──
  const handleMeasureSubmit = () => {
    const name = newMeasureName.trim();
    if (!name) return;
    const key = name.toLowerCase().replace(/\s+/g, '_');
    if (effectiveMeasures.includes(key)) {
      setAddingMeasure(false);
      setNewMeasureName('');
      return;
    }
    setScopePrompt({ action: 'add-measure', key, label: name });
    setAddingMeasure(false);
  };

  const handleMeasureRemove = (key) => {
    setScopePrompt({ action: 'remove-measure', key });
  };

  // ── Scope confirm ──
  const handleScopeConfirm = (applyToAll) => {
    if (!scopePrompt) return;
    const { action, key, label } = scopePrompt;
    if (action === 'add-objective') onAddObjective?.(exercise, key, label, applyToAll);
    if (action === 'remove-objective') onRemoveObjective?.(exercise, key, applyToAll);
    if (action === 'add-measure') onAddMeasure?.(exercise, key, label, applyToAll);
    if (action === 'remove-measure') onRemoveMeasure?.(exercise, key, applyToAll);
    setScopePrompt(null);
    setNewObjectiveName('');
    setNewMeasureName('');
  };

  const handleScopeCancel = () => {
    setScopePrompt(null);
    setNewObjectiveName('');
    setNewMeasureName('');
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`exc-card ${isDragging ? 'exc-card--dragging' : ''} ${isExpanded ? 'exc-card--expanded' : ''}`}
      {...attributes}
    >
      <GlowingEffect spread={40} proximity={100} borderWidth={1} disabled={isDragging} />
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
            {isMissingLibraryDetails && <span className="exc-card-missing-details-tag">Sin detalles</span>}
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

              {/* Scope prompt overlay */}
              {scopePrompt && (
                <ScopePrompt onConfirm={handleScopeConfirm} onCancel={handleScopeCancel} />
              )}

              {/* Loading skeleton */}
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
                          <span className="exc-card-section-title exc-card-section-title--small">Datos que registra el usuario</span>
                        </div>
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

                {/* Left column: Ejercicio on top, Measures below */}
                <div className="exc-card-left-col">
                  {/* Card 1: Alternatives + Sustituir */}
                  <div className="exc-card-section exc-card-section--identity">
                    <GlowingEffect spread={30} proximity={80} borderWidth={1} />
                    <div className="exc-card-section-header">
                      <span className="exc-card-section-title">Alternativas</span>
                      <button type="button" className="exc-card-icon-btn" onClick={() => handleOpenPicker('add-alternative')} title="Agregar alternativa">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      </button>
                    </div>

                    {alternativesList.length > 0 ? (
                      <div className="exc-card-alt-list">
                        {alternativesList.map((alt) => (
                          <div key={`${alt.libraryId}-${alt.index}`} className="exc-card-alt-item">
                            <span className="exc-card-alt-name">{alt.name}</span>
                            <button
                              type="button"
                              className="exc-card-alt-remove"
                              onClick={() => onDeleteAlternative?.(alt.libraryId, alt.index)}
                              title="Quitar"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="exc-card-alt-empty">Sin alternativas</span>
                    )}

                    <div className="exc-card-divider" />

                    <button type="button" className="exc-card-sustituir-btn" onClick={() => handleOpenPicker('primary')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 12H2L12 2L22 12H20M4 12V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H9M4 12H9M20 12V20C20 20.5304 19.7893 21.0391 19.4142 21.4142C19.0391 21.7893 18.5304 22 18 22H15M20 12H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Sustituir ejercicio principal
                    </button>
                  </div>

                  {/* Card 2: Measures — what the user logs */}
                  <div className="exc-card-section exc-card-section--data">
                    <GlowingEffect spread={30} proximity={80} borderWidth={1} />
                    <div className="exc-card-section-header">
                      <span className="exc-card-section-title exc-card-section-title--small">Datos que registra el usuario</span>
                      <button type="button" className="exc-card-icon-btn" onClick={() => setAddingMeasure(true)} title="Agregar medida">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      </button>
                    </div>

                    <div className="exc-card-measures-list">
                      {addingMeasure && (
                        <div className="exc-card-inline-add exc-card-inline-add--full">
                          <input
                            ref={measureInputRef}
                            type="text"
                            className="exc-card-inline-input"
                            placeholder="Nombre de la medida..."
                            value={newMeasureName}
                            onChange={(e) => setNewMeasureName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleMeasureSubmit();
                              if (e.key === 'Escape') { setAddingMeasure(false); setNewMeasureName(''); }
                            }}
                            onBlur={() => { if (!newMeasureName.trim()) { setAddingMeasure(false); setNewMeasureName(''); } }}
                          />
                        </div>
                      )}
                      {effectiveMeasures.length > 0 && (
                        <div className="exc-card-data-pills">
                          {effectiveMeasures.map(m => (
                            <span key={m} className="exc-card-pill exc-card-pill--removable">
                              {getMeasureLabel(m, customMeasureLabels)}
                              <button
                                type="button"
                                className="exc-card-pill-remove"
                                onClick={() => handleMeasureRemove(m)}
                              >
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card 3: Sets & Objectives */}
                {effectiveMeasures.length > 0 && (
                  <div className="exc-card-section exc-card-section--sets">
                    <GlowingEffect spread={30} proximity={80} borderWidth={1} />
                    <div className="exc-card-section-header">
                      <span className="exc-card-section-title">Series</span>
                      <div className="exc-card-stepper exc-card-stepper--header">
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
                          <div className="exc-card-field-label-row">
                            <span className="exc-card-field-label">{getObjectiveLabel(field, customObjectiveLabels)}</span>
                            {field !== 'previous' && (
                              <button
                                type="button"
                                className="exc-card-remove-objective-btn"
                                onClick={() => handleObjectiveRemove(field)}
                                title="Quitar objetivo"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                              </button>
                            )}
                          </div>
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

                      {/* Inline add objective */}
                      {addingObjective ? (
                        <div className="exc-card-default-field exc-card-default-field--adding">
                          <input
                            ref={objectiveInputRef}
                            type="text"
                            className="exc-card-inline-input"
                            placeholder="Nombre del objetivo..."
                            value={newObjectiveName}
                            onChange={(e) => setNewObjectiveName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleObjectiveSubmit();
                              if (e.key === 'Escape') { setAddingObjective(false); setNewObjectiveName(''); }
                            }}
                            onBlur={() => { if (!newObjectiveName.trim()) { setAddingObjective(false); setNewObjectiveName(''); } }}
                          />
                        </div>
                      ) : (
                        <button type="button" className="exc-card-add-objective-btn" onClick={() => setAddingObjective(true)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                          Objetivo
                        </button>
                      )}
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

              {/* Inline exercise picker */}
              {pickerOpen && (
                <ExercisePicker
                  isOpen={pickerOpen}
                  mode={pickerMode}
                  libraries={pickerLibraries}
                  isLoadingLibraries={pickerIsLoadingLibraries}
                  onSelectLibrary={onPickerSelectLibrary}
                  exercises={pickerExercises}
                  isLoadingExercises={pickerIsLoadingExercises}
                  selectedLibraryId={pickerSelectedLibraryId}
                  onSelect={handlePickerSelect}
                  onClose={() => { setPickerOpen(false); setPickerMode(null); }}
                  isSaving={pickerIsSaving}
                />
              )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ExpandableExerciseCard);
