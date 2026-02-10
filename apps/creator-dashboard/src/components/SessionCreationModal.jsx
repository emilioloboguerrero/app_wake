import React, { useState } from 'react';
import Modal from './Modal';
import MediaPickerModal from './MediaPickerModal';
import Input from './Input';
import Button from './Button';
import './SessionCreationModal.css';

const SessionCreationModal = ({
  isOpen,
  onClose,
  selectedDate,
  onSave,
  onSaveToLibrary,
  creatorId = null,
}) => {
  const [sessionName, setSessionName] = useState('');
  const [exercises, setExercises] = useState([]);
  const [isExerciseEditMode, setIsExerciseEditMode] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [sessionImagePreview, setSessionImagePreview] = useState(null);
  const [sessionImageUrlFromLibrary, setSessionImageUrlFromLibrary] = useState(null);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [isCreateExerciseModalOpen, setIsCreateExerciseModalOpen] = useState(false);

  const handleClose = () => {
    setSessionName('');
    setExercises([]);
    setIsExerciseEditMode(false);
    setSelectedExercise(null);
    setSaveToLibrary(false);
    setSessionImagePreview(null);
    setSessionImageUrlFromLibrary(null);
    onClose();
  };

  const handleMediaPickerSelect = (item) => {
    setSessionImagePreview(item.url);
    setSessionImageUrlFromLibrary(item.url);
    setIsMediaPickerOpen(false);
  };

  const handleAddExercise = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCreateExerciseModalOpen(true);
  };

  const handleExerciseCreated = (exercise) => {
    // Set order based on current exercises length
    exercise.order = exercises.length;
    setExercises(prev => [...prev, exercise]);
  };

  const handleExerciseClick = (exercise) => {
    if (isExerciseEditMode) return;
    // TODO: Open exercise modal (same as ProgramDetailScreen)
    setSelectedExercise(exercise);
    console.log('Exercise clicked:', exercise);
  };

  const handleDeleteExercise = (exerciseId) => {
    setExercises(prev => prev.filter(ex => ex.id !== exerciseId));
  };

  const handleSave = () => {
    if (!sessionName.trim()) return;
    
    if (onSave) {
      onSave({
        name: sessionName.trim(),
        exercises: exercises,
        saveToLibrary: saveToLibrary,
        image_url: sessionImageUrlFromLibrary || null,
      });
    }
    
    handleClose();
  };

  const formatDate = (date) => {
    if (!date) return '';
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${dayName}, ${day} de ${month} ${year}`;
  };

  const getExerciseTitle = (exercise) => {
    if (exercise.primary && typeof exercise.primary === 'object') {
      const primaryValues = Object.values(exercise.primary);
      if (primaryValues.length > 0 && primaryValues[0]) {
        return primaryValues[0];
      }
    }
    return exercise.name || exercise.title || `Ejercicio ${exercise.id?.slice(0, 8) || ''}`;
  };

  if (!isOpen) return null;

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Crear Nueva Sesión"
    >
      <div className="session-creation-modal-content">
        <div className="session-creation-form">
          {/* Session Name and Library Toggle */}
          <div className="session-creation-name-row">
            <div className="session-creation-name-input-wrapper">
              <Input
                placeholder="Nombre de la sesión"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                type="text"
                light={true}
              />
            </div>
            <div className="session-creation-library-toggle-wrapper">
              <label className="session-creation-library-toggle-label">
                <label className="elegant-toggle">
                  <input
                    type="checkbox"
                    checked={saveToLibrary}
                    onChange={(e) => setSaveToLibrary(e.target.checked)}
                  />
                  <span className="elegant-toggle-slider"></span>
                </label>
                <span className="session-creation-library-toggle-text">Recordar sesión</span>
              </label>
            </div>
          </div>

          {/* Image Section */}
          {creatorId && (
            <div className="session-creation-image-field">
              <label className="session-creation-image-label">
                Imagen de la sesión
                <span className="session-creation-recommended-tag">Altamente recomendado</span>
              </label>
              {sessionImagePreview ? (
                <div className="session-creation-image-preview-wrap">
                  <img src={sessionImagePreview} alt="Sesión" className="session-creation-image-preview" />
                  <div className="session-creation-image-actions">
                    <button type="button" className="session-creation-image-btn" onClick={() => setIsMediaPickerOpen(true)}>Cambiar</button>
                    <button type="button" className="session-creation-image-btn session-creation-image-btn--remove" onClick={() => { setSessionImagePreview(null); setSessionImageUrlFromLibrary(null); }}>Quitar</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="session-creation-image-upload-area" onClick={() => setIsMediaPickerOpen(true)}>
                  <span className="session-creation-image-upload-icon">+</span>
                  <span>Elegir imagen</span>
                </button>
              )}
            </div>
          )}

          {/* Exercises Section */}
          <div className="session-creation-exercises">
            <div className="session-creation-exercises-header">
              <h3 className="session-creation-exercises-title">Ejercicios</h3>
              <div className="session-creation-exercises-actions">
                <button
                  className={`session-creation-edit-button ${isExerciseEditMode ? 'session-creation-edit-button-active' : ''}`}
                  onClick={() => setIsExerciseEditMode(!isExerciseEditMode)}
                >
                  {isExerciseEditMode ? 'Guardar' : 'Editar'}
                </button>
                <button
                  type="button"
                  className="session-creation-add-exercise-button"
                  onClick={handleAddExercise}
                  disabled={isExerciseEditMode}
                >
                  <span className="session-creation-add-exercise-icon">+</span>
                </button>
              </div>
            </div>

            {/* Exercises List */}
            <div className="session-creation-exercises-list">
              {exercises.length === 0 ? (
                <div className="session-creation-exercises-empty">
                  <p>No hay ejercicios. Haz clic en + para agregar uno.</p>
                </div>
              ) : (
                exercises.map((exercise, index) => (
                  <div
                    key={exercise.id || index}
                    className={`session-creation-exercise-card ${isExerciseEditMode ? 'session-creation-exercise-card-edit-mode' : ''}`}
                    onClick={() => handleExerciseClick(exercise)}
                  >
                    {isExerciseEditMode && (
                      <>
                        <button
                          className="session-creation-exercise-delete-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteExercise(exercise.id || index);
                          }}
                        >
                          <span className="session-creation-exercise-delete-icon">−</span>
                        </button>
                      </>
                    )}
                    <div className="session-creation-exercise-number">
                      {index + 1}
                    </div>
                    <div className="session-creation-exercise-content">
                      <h4 className="session-creation-exercise-title">
                        {getExerciseTitle(exercise)}
                      </h4>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="session-creation-actions">
            <button
              className="session-creation-cancel-button"
              onClick={handleClose}
            >
              Cancelar
            </button>
            <Button
              title="Crear Sesión"
              onClick={handleSave}
              disabled={!sessionName.trim()}
            />
          </div>
        </div>
      </div>
    </Modal>
    {creatorId && (
      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelect={handleMediaPickerSelect}
        creatorId={creatorId}
        accept="image/*"
      />
    )}
    </>
  );
};

export default SessionCreationModal;

