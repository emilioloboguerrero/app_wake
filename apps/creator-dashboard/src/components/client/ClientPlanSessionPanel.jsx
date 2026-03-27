import { useState, useCallback, useRef, useEffect } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import clientPlanContentService from '../../services/clientPlanContentService';
import './ClientPlanSessionPanel.css';

// Debounced auto-save hook
function useAutoSave(saveFn, delay = 800) {
  const timerRef = useRef(null);
  const save = useCallback((...args) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveFn(...args), delay);
  }, [saveFn, delay]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return save;
}

function SetRow({ set, setIndex, onChange, onDelete }) {
  return (
    <div className="cpsp-set-row">
      <span className="cpsp-set-num">{setIndex + 1}</span>
      <input
        type="text"
        className="cpsp-set-input"
        value={set.reps ?? ''}
        onChange={(e) => onChange(setIndex, 'reps', e.target.value)}
        placeholder="Reps"
      />
      <input
        type="text"
        className="cpsp-set-input"
        value={set.intensity ?? ''}
        onChange={(e) => onChange(setIndex, 'intensity', e.target.value)}
        placeholder="Intensidad"
      />
      <button className="cpsp-set-delete" onClick={() => onDelete(setIndex)} aria-label="Eliminar serie">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function ExerciseCard({ exercise, exerciseIndex, onUpdateSet, onAddSet, onDeleteSet }) {
  const sets = exercise.sets || [];

  return (
    <div className="cpsp-exercise">
      <div className="cpsp-exercise-header">
        <GripVertical size={12} className="cpsp-exercise-grip" />
        <span className="cpsp-exercise-name">{exercise.name || exercise.title || 'Ejercicio'}</span>
      </div>

      {exercise.notes && (
        <p className="cpsp-exercise-notes">{exercise.notes}</p>
      )}

      {/* Sets table */}
      {sets.length > 0 && (
        <div className="cpsp-sets">
          <div className="cpsp-sets-header">
            <span>#</span>
            <span>Reps</span>
            <span>Intensidad</span>
            <span></span>
          </div>
          {sets.map((set, si) => (
            <SetRow
              key={set.id || si}
              set={set}
              setIndex={si}
              onChange={(setIdx, field, value) => onUpdateSet(exerciseIndex, setIdx, field, value)}
              onDelete={(setIdx) => onDeleteSet(exerciseIndex, setIdx)}
            />
          ))}
        </div>
      )}

      <button
        className="cpsp-add-set"
        onClick={() => onAddSet(exerciseIndex)}
      >
        <Plus size={12} />
        <span>Serie</span>
      </button>
    </div>
  );
}

export default function ClientPlanSessionPanel({
  session, planId, moduleId, clientId, programId, weekKey,
  clientName, onClose, onSaved,
}) {
  const [exercises, setExercises] = useState(() => {
    return (session.exercises || []).map(ex => ({
      ...ex,
      sets: (ex.sets || []).map(s => ({ ...s })),
    }));
  });
  const [saveStatus, setSaveStatus] = useState(null); // 'saving' | 'saved' | 'error'

  // Persist exercises to client_plan_content via the API
  const handleSave = useCallback(async (updatedExercises) => {
    if (!clientId || !programId || !weekKey || !session?.id) return;
    setSaveStatus('saving');
    try {
      // Update the entire exercise list for this session in the client copy
      const exerciseById = new Map(updatedExercises.map((ex, i) => [ex.id || `idx-${i}`, ex]));
      for (const [, ex] of exerciseById) {
        if (ex.id) {
          await clientPlanContentService.updateExercise(
            clientId, programId, weekKey, session.id, ex.id,
            { sets: ex.sets, title: ex.title, name: ex.name }
          );
        }
      }
      setSaveStatus('saved');
      if (onSaved) onSaved();
      setTimeout(() => setSaveStatus(null), 1500);
    } catch (err) {
      console.error('Auto-save failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [clientId, programId, weekKey, session?.id, onSaved]);

  const autoSave = useAutoSave(handleSave);

  const handleUpdateSet = useCallback((exerciseIndex, setIndex, field, value) => {
    setExercises(prev => {
      const next = [...prev];
      const ex = { ...next[exerciseIndex] };
      const sets = [...(ex.sets || [])];
      sets[setIndex] = { ...sets[setIndex], [field]: value === '' ? null : value };
      ex.sets = sets;
      next[exerciseIndex] = ex;
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  const handleAddSet = useCallback((exerciseIndex) => {
    setExercises(prev => {
      const next = [...prev];
      const ex = { ...next[exerciseIndex] };
      const sets = [...(ex.sets || [])];
      const lastSet = sets[sets.length - 1];
      sets.push({
        id: `new-${Date.now()}`,
        reps: lastSet?.reps ?? '12',
        intensity: lastSet?.intensity ?? null,
      });
      ex.sets = sets;
      next[exerciseIndex] = ex;
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  const handleDeleteSet = useCallback((exerciseIndex, setIndex) => {
    setExercises(prev => {
      const next = [...prev];
      const ex = { ...next[exerciseIndex] };
      const sets = [...(ex.sets || [])];
      sets.splice(setIndex, 1);
      ex.sets = sets;
      next[exerciseIndex] = ex;
      autoSave(next);
      return next;
    });
  }, [autoSave]);

  return (
    <div className="cpsp-container">
      {/* Client copy banner */}
      <div className="cpsp-banner">
        Solo para {clientName}
        {saveStatus === 'saving' && <span className="cpsp-save-status"> Guardando...</span>}
        {saveStatus === 'saved' && <span className="cpsp-save-status cpsp-save-ok"> Guardado</span>}
        {saveStatus === 'error' && <span className="cpsp-save-status cpsp-save-err"> Error al guardar</span>}
      </div>

      {/* Exercise list */}
      <div className="cpsp-exercises">
        {exercises.length > 0 ? (
          exercises.map((ex, i) => (
            <ExerciseCard
              key={ex.id || i}
              exercise={ex}
              exerciseIndex={i}
              onUpdateSet={handleUpdateSet}
              onAddSet={handleAddSet}
              onDeleteSet={handleDeleteSet}
            />
          ))
        ) : (
          <p className="cpsp-empty">Esta sesion no tiene ejercicios</p>
        )}
      </div>
    </div>
  );
}
