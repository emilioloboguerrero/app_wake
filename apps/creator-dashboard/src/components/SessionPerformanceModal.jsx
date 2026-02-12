import React, { useState, useEffect, useMemo } from 'react';
import clientProgramService from '../services/clientProgramService';
import libraryService from '../services/libraryService';
import './SessionPerformanceModal.css';

const STATUS = {
  completed: 'completed',
  deleted: 'deleted',
  not_completed: 'not_completed',
  extra: 'extra',
};

// PWA stores session history exercise keys as libraryId_exerciseName where libraryId
// is from exercise.primary (exercises_library doc id), not the library session id.
function getHistoryKeyForPlannedExercise(ex, fallbackSessionId) {
  const primary = ex.primary && typeof ex.primary === 'object' ? ex.primary : null;
  const keys = primary ? Object.keys(primary) : [];
  if (keys.length > 0) {
    const libId = keys[0];
    const exerciseName = primary[libId];
    if (libId && exerciseName) {
      return `${libId}_${String(exerciseName).trim()}`;
    }
  }
  const name = ex.title || ex.name || '';
  return fallbackSessionId ? `${fallbackSessionId}_${String(name).trim()}` : null;
}

function getPlannedExerciseDisplayName(ex) {
  const primary = ex.primary && typeof ex.primary === 'object' ? ex.primary : null;
  if (primary) {
    const val = Object.values(primary)[0];
    if (val && String(val).trim()) return String(val).trim();
  }
  const t = ex.title || ex.name || '';
  return String(t).trim() || 'Sin nombre';
}

function getPerformedExerciseDisplayName(data, key) {
  if (data?.exerciseName && String(data.exerciseName).trim()) return String(data.exerciseName).trim();
  if (key && key.includes('_')) return key.replace(/^[^_]+_/, '').trim();
  return key || 'Ejercicio';
}

export default function SessionPerformanceModal({
  isOpen,
  onClose,
  clientUserId,
  creatorId,
  programId,
  session = null,
  dateStr = null,
  /** When provided, show only performed data (history-only mode, e.g. from Historial tab after plan deletion) */
  historyOnlyData = null,
}) {
  const [historyDoc, setHistoryDoc] = useState(null);
  const [plannedExercises, setPlannedExercises] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const sessionIdsToTry = useMemo(() => {
    if (!session) return [];
    const ids = [
      session.librarySessionRef,
      session.session_id,
      session.id,
    ].filter(Boolean);
    return [...new Set(ids)];
  }, [session]);

  useEffect(() => {
    if (!isOpen || !clientUserId || !programId) {
      setHistoryDoc(null);
      setPlannedExercises([]);
      setError(null);
      return;
    }

    if (historyOnlyData) {
      setHistoryDoc(historyOnlyData);
      // Use planned snapshot if available (history is self-contained)
      const plannedFromSnapshot = historyOnlyData.planned?.exercises;
      setPlannedExercises(Array.isArray(plannedFromSnapshot) ? plannedFromSnapshot : []);
      setLoading(false);
      setError(null);
      return;
    }

    if (!session || sessionIdsToTry.length === 0) {
      setHistoryDoc(null);
      setPlannedExercises([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        let doc = null;
        for (const sid of sessionIdsToTry) {
          doc = await clientProgramService.getSessionHistoryDoc(clientUserId, sid);
          if (doc) break;
        }

        if (cancelled) return;
        setHistoryDoc(doc || null);

        // Prefer planned snapshot from history (self-contained, immune to plan changes)
        const plannedFromSnapshot = doc?.planned?.exercises;
        if (Array.isArray(plannedFromSnapshot) && plannedFromSnapshot.length > 0) {
          if (!cancelled) setPlannedExercises(plannedFromSnapshot);
        } else {
          // Fallback: load from library (subject to plan/library changes)
          const librarySessionId = session.librarySessionRef || sessionIdsToTry[0];
          let planned = [];
          if (librarySessionId && creatorId) {
            try {
              planned = await libraryService.getLibrarySessionExercises(creatorId, librarySessionId);
            } catch (e) {
              console.warn('SessionPerformanceModal: could not load planned exercises', e?.message);
            }
          }
          if (!cancelled) setPlannedExercises(Array.isArray(planned) ? planned : []);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Error al cargar el desempeño');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [isOpen, clientUserId, creatorId, programId, session, sessionIdsToTry, historyOnlyData]);

  const comparison = useMemo(() => {
    // History-only mode: show only performed when we have no planned (from snapshot or library)
    const hasNoPlanned = !plannedExercises?.length;
    if (historyOnlyData && hasNoPlanned) {
      const performed = historyOnlyData.exercises ? { ...historyOnlyData.exercises } : {};
      return Object.entries(performed).map(([key, data], index) => ({
        id: `history-only-${key}-${index}`,
        type: STATUS.extra,
        displayName: getPerformedExerciseDisplayName(data, key),
        plannedSets: [],
        performedSets: data?.sets || [],
        planned: null,
        performed: data,
      }));
    }
    const performed = historyDoc?.exercises ? { ...historyDoc.exercises } : {};
    const fallbackSessionId = session?.librarySessionRef || sessionIdsToTry[0];
    const items = [];

    const matchedPerformedKeys = new Set();

    plannedExercises.forEach((ex, index) => {
      const displayName = getPlannedExerciseDisplayName(ex);
      const key = getHistoryKeyForPlannedExercise(ex, fallbackSessionId);
      if (!key) {
        items.push({
          id: `planned-${ex.id}-${index}`,
          type: STATUS.deleted,
          displayName,
          plannedSets: ex.sets || [],
          performedSets: [],
          planned: ex,
          performed: null,
        });
        return;
      }
      const performedData = performed[key];
      delete performed[key];
      matchedPerformedKeys.add(key);

      const plannedSets = ex.sets || [];
      const performedSets = performedData?.sets || [];

      if (performedData && performedSets.length > 0) {
        const allPlannedDone = plannedSets.length <= performedSets.length;
        items.push({
          id: `planned-${ex.id}-${index}`,
          type: allPlannedDone ? STATUS.completed : STATUS.not_completed,
          displayName,
          plannedSets,
          performedSets,
          planned: ex,
          performed: performedData,
        });
      } else if (performedData && performedSets.length === 0) {
        items.push({
          id: `planned-${ex.id}-${index}`,
          type: STATUS.not_completed,
          displayName,
          plannedSets,
          performedSets: [],
          planned: ex,
          performed: performedData,
        });
      } else {
        items.push({
          id: `planned-${ex.id}-${index}`,
          type: STATUS.deleted,
          displayName,
          plannedSets,
          performedSets: [],
          planned: ex,
          performed: null,
        });
      }
    });

    Object.entries(performed).forEach(([key, data], index) => {
      const displayName = getPerformedExerciseDisplayName(data, key);
      items.push({
        id: `extra-${key}-${index}`,
        type: STATUS.extra,
        displayName,
        plannedSets: [],
        performedSets: data?.sets || [],
        planned: null,
        performed: data,
      });
    });

    return items;
  }, [historyDoc, plannedExercises, session?.librarySessionRef, sessionIdsToTry, historyOnlyData]);

  const stats = useMemo(() => {
    let completed = 0, not_completed = 0, extra = 0;
    comparison.forEach((item) => {
      if (item.type === STATUS.completed) completed++;
      else if (item.type === STATUS.deleted || item.type === STATUS.not_completed) not_completed++;
      else if (item.type === STATUS.extra) extra++;
    });
    return { completed, not_completed, extra };
  }, [comparison]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const displayHistoryDoc = historyOnlyData || historyDoc;
  const sessionName = historyOnlyData?.sessionName || session?.title || session?.session_name || session?.name || 'Sesión';
  const completedAt = displayHistoryDoc?.completedAt
    ? new Date(displayHistoryDoc.completedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
    : null;
  const duration = displayHistoryDoc?.duration != null ? Number(displayHistoryDoc.duration) : null;
  const isHistoryOnly = !!historyOnlyData && !plannedExercises?.length;

  return (
    <div className="session-performance-backdrop" onClick={handleBackdropClick}>
      <div className="session-performance-modal" onClick={(e) => e.stopPropagation()}>
        <div className="session-performance-header">
          <div>
            <h2 className="session-performance-title">Desempeño de la sesión</h2>
            <p className="session-performance-subtitle">
              {isHistoryOnly ? 'Lo que hizo tu cliente en esta sesión' : 'Compara lo planificado con lo que hizo tu cliente'}
            </p>
          </div>
          <button type="button" className="session-performance-close" onClick={onClose}>×</button>
        </div>
        <div className="session-performance-content">
          {loading && (
            <div className="session-performance-loading">Cargando...</div>
          )}
          {error && (
            <div className="session-performance-error">{error}</div>
          )}
          {!loading && !error && (
            <>
              <div className="session-performance-meta">
                <div className="session-performance-meta-row">
                  <span className="session-performance-session-name">{sessionName}</span>
                  {dateStr && <span className="session-performance-date">{dateStr}</span>}
                </div>
                {completedAt && (
                  <div className="session-performance-completed-at">
                    Completada: {completedAt}
                    {duration != null && !Number.isNaN(duration) && (
                      <span className="session-performance-duration"> · {Math.round(duration)} min</span>
                    )}
                  </div>
                )}
              </div>

              <div className="session-performance-stats">
                {stats.completed > 0 && (
                  <div className="session-performance-stat session-performance-stat-completed">
                    <span className="session-performance-stat-value">{stats.completed}</span>
                    <span className="session-performance-stat-label">Completados</span>
                  </div>
                )}
                {stats.not_completed > 0 && (
                  <div className="session-performance-stat session-performance-stat-not-completed">
                    <span className="session-performance-stat-value">{stats.not_completed}</span>
                    <span className="session-performance-stat-label">No completados</span>
                  </div>
                )}
                {stats.extra > 0 && (
                  <div className="session-performance-stat session-performance-stat-extra">
                    <span className="session-performance-stat-value">{stats.extra}</span>
                    <span className="session-performance-stat-label">Añadidos / reemplazos</span>
                  </div>
                )}
                {stats.completed === 0 && stats.not_completed === 0 && stats.extra === 0 && (
                  <div className="session-performance-stat session-performance-stat-empty">
                    Sin ejercicios registrados
                  </div>
                )}
              </div>

              <h3 className="session-performance-section-title">
                {isHistoryOnly ? 'Ejercicios realizados' : 'Planificado vs realizado'}
              </h3>

              {!isHistoryOnly && (
                <div className="session-performance-compare-header">
                  <div className="session-performance-compare-col session-performance-compare-col--planned">
                    <span className="session-performance-compare-col-title">Planificado</span>
                    <span className="session-performance-compare-col-sub">Lo que tenías programado</span>
                  </div>
                  <div className="session-performance-compare-col session-performance-compare-col--performed">
                    <span className="session-performance-compare-col-title">Realizado</span>
                    <span className="session-performance-compare-col-sub">Lo que hizo el cliente</span>
                  </div>
                </div>
              )}

              <div className="session-performance-exercises">
                {comparison.map((item) => (
                  <div
                    key={item.id}
                    className={`session-performance-card session-performance-card--${item.type}`}
                  >
                    <button
                      type="button"
                      className="session-performance-card-head"
                      aria-expanded={expandedId === item.id}
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    >
                      <span className="session-performance-card-name">{item.displayName}</span>
                      <span className={`session-performance-card-badge session-performance-card-badge--${item.type}`}>
                        {item.type === STATUS.completed && 'Completado'}
                        {(item.type === STATUS.deleted || item.type === STATUS.not_completed) && 'No completado'}
                        {item.type === STATUS.extra && 'Añadido / reemplazo'}
                      </span>
                      <span className="session-performance-card-chevron">
                        {expandedId === item.id ? '▼' : '▶'}
                      </span>
                    </button>
                    {expandedId === item.id && (
                      <div className="session-performance-card-body">
                        <div className={`session-performance-compare-row ${isHistoryOnly ? 'session-performance-compare-row--history-only' : ''}`}>
                          {!isHistoryOnly && (
                          <div className="session-performance-compare-col session-performance-compare-col--planned">
                            {item.plannedSets.length > 0 ? (
                              <ul className="session-performance-set-list">
                                {item.plannedSets.map((set, i) => (
                                  <li key={set.id || i} className="session-performance-set-item">
                                    <span className="session-performance-set-num">{i + 1}.</span>
                                    <span className="session-performance-set-values">
                                      {set.reps != null && set.reps !== '' ? `${set.reps} rep` : '—'}
                                      {(set.weight != null && set.weight !== '') && ` · ${set.weight} kg`}
                                      {(set.intensity != null && set.intensity !== '') && ` · ${set.intensity}`}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="session-performance-empty-col">—</p>
                            )}
                          </div>
                          )}
                          <div className="session-performance-compare-col session-performance-compare-col--performed">
                            {item.performedSets.length > 0 ? (
                              <ul className="session-performance-set-list session-performance-set-list--performed">
                                {item.performedSets.map((set, i) => (
                                  <li key={i} className="session-performance-set-item">
                                    <span className="session-performance-set-num">{i + 1}.</span>
                                    <span className="session-performance-set-values">
                                      {set.reps != null && set.reps !== '' ? `${set.reps} rep` : '—'}
                                      {(set.weight != null && set.weight !== '') && ` · ${set.weight} kg`}
                                      {(set.intensity != null && set.intensity !== '') && ` · ${set.intensity}`}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="session-performance-empty-col">No realizado</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
