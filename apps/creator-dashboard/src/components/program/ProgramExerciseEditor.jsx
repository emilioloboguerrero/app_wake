import { useState, useCallback } from 'react';
import Modal from '../Modal';
import Button from '../Button';
import Input from '../Input';

export default function ProgramExerciseEditor({
  isOpen,
  onClose,
  exercise,
  exerciseDraft,
  onDraftChange,
  programId,
  moduleId,
  sessionId,
  user,
  showToast,
  sets,
  onSetsChange,
  onSave,
  onDelete,
}) {
  const [activeTab, setActiveTab] = useState('general');

  if (!isOpen) return null;

  const draft = exerciseDraft || exercise;
  if (!draft) return null;

  // Get exercise title from primary field
  const getExerciseTitle = () => {
    if (draft.primary && typeof draft.primary === 'object') {
      const vals = Object.values(draft.primary);
      if (vals.length > 0 && vals[0]) return vals[0];
    }
    return draft.name || draft.title || 'Ejercicio';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getExerciseTitle()}>
      <div className="exercise-editor">
        <div className="exercise-editor-tabs">
          <button
            type="button"
            className={`exercise-editor-tab ${activeTab === 'general' ? 'exercise-editor-tab--active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            type="button"
            className={`exercise-editor-tab ${activeTab === 'series' ? 'exercise-editor-tab--active' : ''}`}
            onClick={() => setActiveTab('series')}
          >
            Series
          </button>
        </div>

        {activeTab === 'general' && (
          <div className="exercise-editor-general">
            {/* Primary exercise reference */}
            <div className="exercise-editor-section">
              <h3 className="exercise-editor-section-title">Ejercicio principal</h3>
              {draft.primary && typeof draft.primary === 'object' ? (
                <div className="exercise-editor-primary">
                  {Object.entries(draft.primary).map(([libId, name]) => (
                    <div key={libId} className="exercise-editor-ref-chip">
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="exercise-editor-empty">Sin ejercicio principal asignado</p>
              )}
            </div>

            {/* Alternatives */}
            <div className="exercise-editor-section">
              <h3 className="exercise-editor-section-title">Alternativas</h3>
              {draft.alternatives && typeof draft.alternatives === 'object' && !Array.isArray(draft.alternatives) ? (
                Object.entries(draft.alternatives).map(([libId, values]) => (
                  Array.isArray(values) && values.map((val, idx) => (
                    <div key={`${libId}-${idx}`} className="exercise-editor-ref-chip">
                      <span>{typeof val === 'string' ? val : val?.name || 'Alternativa'}</span>
                    </div>
                  ))
                ))
              ) : (
                <p className="exercise-editor-empty">Sin alternativas</p>
              )}
            </div>

            {/* Measures & Objectives */}
            <div className="exercise-editor-section">
              <h3 className="exercise-editor-section-title">Medidas y objetivos</h3>
              {Array.isArray(draft.measures) && draft.measures.length > 0 ? (
                <div className="exercise-editor-tags">
                  {draft.measures.map((m) => (
                    <span key={m} className="exercise-editor-tag">{m}</span>
                  ))}
                </div>
              ) : (
                <p className="exercise-editor-empty">Sin medidas configuradas</p>
              )}
              {Array.isArray(draft.objectives) && draft.objectives.length > 0 && (
                <div className="exercise-editor-tags" style={{ marginTop: 8 }}>
                  {draft.objectives.filter(o => o !== 'previous').map((o) => (
                    <span key={o} className="exercise-editor-tag">{draft.customObjectiveLabels?.[o] || o}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'series' && (
          <div className="exercise-editor-series">
            {sets && sets.length > 0 ? (
              <div className="exercise-editor-sets-list">
                {sets.map((set, idx) => (
                  <div key={set.id || idx} className="exercise-editor-set-item">
                    <span className="exercise-editor-set-number">Serie {idx + 1}</span>
                    <div className="exercise-editor-set-fields">
                      {(draft.objectives || []).filter(o => o !== 'previous').map((obj) => (
                        <div key={obj} className="exercise-editor-set-field">
                          <label>{draft.customObjectiveLabels?.[obj] || obj}</label>
                          <span>{set[obj] !== undefined && set[obj] !== null ? String(set[obj]) : '--'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="exercise-editor-empty">Sin series configuradas</p>
            )}
          </div>
        )}

        <div className="exercise-editor-footer">
          {onDelete && (
            <Button
              title="Eliminar"
              onClick={onDelete}
              style={{ background: 'rgba(224,84,84,0.2)', color: 'rgba(224,84,84,0.9)' }}
            />
          )}
          <Button title="Guardar" onClick={onSave} />
        </div>
      </div>
    </Modal>
  );
}
