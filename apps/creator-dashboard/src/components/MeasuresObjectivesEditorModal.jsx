import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Modal from './Modal';
import '../screens/ProgramDetailScreen.css';

const getMeasureDisplayNameDefault = (measure, customMeasureLabels = {}) => {
  if (customMeasureLabels[measure]) return customMeasureLabels[measure];
  if (measure === 'reps') return 'Repeticiones';
  if (measure === 'weight') return 'Peso';
  return measure;
};

const getObjectiveDisplayNameDefault = (objective, customObjectiveLabels = {}) => {
  if (customObjectiveLabels[objective]) return customObjectiveLabels[objective];
  if (objective === 'reps') return 'Repeticiones';
  if (objective === 'intensity') return 'Intensidad';
  if (objective === 'previous') return 'Anterior';
  return objective;
};

const generateCustomId = () => 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

const BUILTIN_MEASURES = [{ id: 'reps', label: 'Repeticiones' }, { id: 'weight', label: 'Peso' }];
// 'previous' (Anterior) is always included when saving; hidden from UI
const BUILTIN_OBJECTIVES = [
  { id: 'reps', label: 'Repeticiones' },
  { id: 'intensity', label: 'Intensidad' },
];
const OBJECTIVE_PREVIOUS = 'previous';

const ensureObjectivesWithPrevious = (arr) =>
  Array.isArray(arr) && arr.includes(OBJECTIVE_PREVIOUS) ? arr : [...(arr || []), OBJECTIVE_PREVIOUS];

function SortableItem({ id, label, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="data-editor-sortable-item">
      <div className="data-editor-sortable-drag" {...attributes} {...listeners}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="5" r="1.5" fill="currentColor" />
          <circle cx="15" cy="5" r="1.5" fill="currentColor" />
          <circle cx="9" cy="12" r="1.5" fill="currentColor" />
          <circle cx="15" cy="12" r="1.5" fill="currentColor" />
          <circle cx="9" cy="19" r="1.5" fill="currentColor" />
          <circle cx="15" cy="19" r="1.5" fill="currentColor" />
        </svg>
      </div>
      <span className="data-editor-sortable-label">{label}</span>
      <button type="button" className="data-editor-sortable-delete" onClick={onDelete} aria-label="Eliminar">
        −
      </button>
    </div>
  );
}

function MeasuresObjectivesEditorModal({
  isOpen,
  onClose,
  initialValues = {},
  onSave,
  onChange,
  mode = 'exercise',
  initialPresetName = '',
}) {
  const [measures, setMeasures] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [customMeasureLabels, setCustomMeasureLabels] = useState({});
  const [customObjectiveLabels, setCustomObjectiveLabels] = useState({});
  const [presetName, setPresetName] = useState('');
  const [customMeasureInput, setCustomMeasureInput] = useState('');
  const [customObjectiveInput, setCustomObjectiveInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMeasures(Array.isArray(initialValues.measures) ? [...initialValues.measures] : []);
      setObjectives((Array.isArray(initialValues.objectives) ? initialValues.objectives : []).filter((o) => o !== OBJECTIVE_PREVIOUS));
      setCustomMeasureLabels(initialValues.customMeasureLabels && typeof initialValues.customMeasureLabels === 'object' ? { ...initialValues.customMeasureLabels } : {});
      setCustomObjectiveLabels(initialValues.customObjectiveLabels && typeof initialValues.customObjectiveLabels === 'object' ? { ...initialValues.customObjectiveLabels } : {});
      setPresetName(initialPresetName || '');
    }
  }, [isOpen, initialValues.measures, initialValues.objectives, initialValues.customMeasureLabels, initialValues.customObjectiveLabels, initialPresetName]);

  const emit = useCallback(
    (m, o, cML, cOL) => {
      const objectivesOut = ensureObjectivesWithPrevious(o ?? objectives);
      const data = {
        measures: m ?? measures,
        objectives: objectivesOut,
        customMeasureLabels: cML ?? customMeasureLabels,
        customObjectiveLabels: cOL ?? customObjectiveLabels,
      };
      if (mode === 'exercise' && onChange) onChange(data);
    },
    [mode, onChange, measures, objectives, customMeasureLabels, customObjectiveLabels]
  );

  const getMeasureDisplayName = (m) => getMeasureDisplayNameDefault(m, customMeasureLabels);
  const getObjectiveDisplayName = (o) => getObjectiveDisplayNameDefault(o, customObjectiveLabels);

  const addMeasure = (idOrCustomLabel) => {
    if (typeof idOrCustomLabel === 'string' && idOrCustomLabel.startsWith('custom:')) {
      const label = idOrCustomLabel.slice(7).trim();
      if (!label) return;
      const id = generateCustomId();
      const nextMeasures = [...measures, id];
      const nextLabels = { ...customMeasureLabels, [id]: label };
      setMeasures(nextMeasures);
      setCustomMeasureLabels(nextLabels);
      setCustomMeasureInput('');
      emit(nextMeasures, null, nextLabels, null);
      return;
    }
    if (measures.includes(idOrCustomLabel)) return;
    const next = [...measures, idOrCustomLabel];
    setMeasures(next);
    emit(next, null, null, null);
  };

  const addObjective = (idOrCustomLabel) => {
    if (typeof idOrCustomLabel === 'string' && idOrCustomLabel.startsWith('custom:')) {
      const label = idOrCustomLabel.slice(7).trim();
      if (!label) return;
      const id = generateCustomId();
      const nextObjectives = [...objectives, id];
      const nextLabels = { ...customObjectiveLabels, [id]: label };
      setObjectives(nextObjectives);
      setCustomObjectiveLabels(nextLabels);
      setCustomObjectiveInput('');
      emit(null, nextObjectives, null, nextLabels);
      return;
    }
    if (objectives.includes(idOrCustomLabel)) return;
    const next = [...objectives, idOrCustomLabel];
    setObjectives(next);
    emit(null, next, null, null);
  };

  const removeMeasure = (index) => {
    const key = measures[index];
    const nextMeasures = measures.filter((_, i) => i !== index);
    let nextLabels = customMeasureLabels;
    if (key && String(key).startsWith('custom_')) {
      nextLabels = { ...customMeasureLabels };
      delete nextLabels[key];
    }
    setMeasures(nextMeasures);
    setCustomMeasureLabels(nextLabels);
    emit(nextMeasures, null, nextLabels, null);
  };

  const removeObjective = (index) => {
    const key = objectives[index];
    const nextObjectives = objectives.filter((_, i) => i !== index);
    let nextLabels = customObjectiveLabels;
    if (key && String(key).startsWith('custom_')) {
      nextLabels = { ...customObjectiveLabels };
      delete nextLabels[key];
    }
    setObjectives(nextObjectives);
    setCustomObjectiveLabels(nextLabels);
    emit(null, nextObjectives, null, nextLabels);
  };

  const handleDragEndMeasures = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = measures.indexOf(active.id);
    const newIndex = measures.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(measures, oldIndex, newIndex);
    setMeasures(next);
    emit(next, null, null, null);
  };

  const handleDragEndObjectives = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = objectives.indexOf(active.id);
    const newIndex = objectives.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(objectives, oldIndex, newIndex);
    setObjectives(next);
    emit(null, next, null, null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: () => ({ x: 0, y: 0 }) })
  );

  const handleClose = () => {
    const isPreset = mode === 'create_preset' || mode === 'edit_preset';
    if (isPreset && (presetName || '').trim()) {
      onSave({
        measures,
        objectives: ensureObjectivesWithPrevious(objectives),
        customMeasureLabels,
        customObjectiveLabels,
        name: (presetName || '').trim(),
      });
    }
    onClose();
  };

  const title = mode === 'create_preset' ? 'Nueva plantilla' : mode === 'edit_preset' ? 'Editar plantilla' : 'Data';
  const inputStyle = {
    flex: 1,
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '13px',
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} wide>
      <div className="data-editor-modal-content">
        {(mode === 'create_preset' || mode === 'edit_preset') && (
          <div className="data-editor-preset-name">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Nombre de la plantilla"
              style={{ ...inputStyle, marginBottom: 16 }}
            />
          </div>
        )}

        <div className="data-editor-columns">
          {/* Datos que registra el usuario */}
          <div className="data-editor-column">
            <h4 className="data-editor-column-title">Datos que registra el usuario</h4>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndMeasures}>
              <SortableContext items={measures} strategy={verticalListSortingStrategy}>
                <div className="data-editor-list">
                  {measures.map((measureId, index) => (
                    <SortableItem
                      key={`${measureId}-${index}`}
                      id={measureId}
                      label={getMeasureDisplayName(measureId)}
                      onDelete={() => removeMeasure(index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <div className="data-editor-add">
              {BUILTIN_MEASURES.filter((m) => !measures.includes(m.id)).map((m) => (
                <button key={m.id} type="button" className="data-editor-add-pill" onClick={() => addMeasure(m.id)}>
                  + {m.label}
                </button>
              ))}
              {Object.entries(customMeasureLabels).map(([id, label]) => {
                if (measures.includes(id)) return null;
                return (
                  <button key={id} type="button" className="data-editor-add-pill" onClick={() => addMeasure(id)}>
                    + {label}
                  </button>
                );
              })}
              <div className="data-editor-add-custom">
                <input
                  type="text"
                  value={customMeasureInput}
                  onChange={(e) => setCustomMeasureInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMeasure('custom:' + customMeasureInput)}
                  placeholder="Otra medida..."
                  style={inputStyle}
                />
                <button
                  type="button"
                  className="data-editor-add-pill"
                  onClick={() => addMeasure('custom:' + customMeasureInput)}
                  disabled={!customMeasureInput.trim()}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Pautas para las series */}
          <div className="data-editor-column">
            <h4 className="data-editor-column-title">Pautas para las series</h4>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndObjectives}>
              <SortableContext items={objectives} strategy={verticalListSortingStrategy}>
                <div className="data-editor-list">
                  {objectives.map((objectiveId, index) => (
                    <SortableItem
                      key={`${objectiveId}-${index}`}
                      id={objectiveId}
                      label={getObjectiveDisplayName(objectiveId)}
                      onDelete={() => removeObjective(index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <div className="data-editor-add">
              {BUILTIN_OBJECTIVES.filter((o) => !objectives.includes(o.id)).map((o) => (
                <button key={o.id} type="button" className="data-editor-add-pill" onClick={() => addObjective(o.id)}>
                  + {o.label}
                </button>
              ))}
              {Object.entries(customObjectiveLabels).map(([id, label]) => {
                if (objectives.includes(id)) return null;
                return (
                  <button key={id} type="button" className="data-editor-add-pill" onClick={() => addObjective(id)}>
                    + {label}
                  </button>
                );
              })}
              <div className="data-editor-add-custom">
                <input
                  type="text"
                  value={customObjectiveInput}
                  onChange={(e) => setCustomObjectiveInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addObjective('custom:' + customObjectiveInput)}
                  placeholder="Otro objetivo..."
                  style={inputStyle}
                />
                <button
                  type="button"
                  className="data-editor-add-pill"
                  onClick={() => addObjective('custom:' + customObjectiveInput)}
                  disabled={!customObjectiveInput.trim()}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="data-editor-footer">
          <button type="button" className="data-editor-done" onClick={handleClose}>
            Listo
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default MeasuresObjectivesEditorModal;
