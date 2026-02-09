import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import libraryService from '../services/libraryService';
import './SessionAssignmentModal.css';

const SessionAssignmentModal = ({
  isOpen,
  onClose,
  selectedDate,
  creatorId = null,
  onSessionAssigned,
  onAddFromLibrary,
}) => {
  const [mode, setMode] = useState('choose'); // 'choose' | 'create'
  const [newSessionName, setNewSessionName] = useState('');
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const handleClose = () => {
    setMode('choose');
    setNewSessionName('');
    setSaveToLibrary(true);
    onClose();
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

  const handleCreateAndAssign = async () => {
    if (!newSessionName.trim() || !creatorId || !onSessionAssigned) return;
    try {
      setIsCreating(true);
      const libSession = await libraryService.createLibrarySession(creatorId, {
        title: newSessionName.trim(),
        image_url: null,
        showInLibrary: saveToLibrary,
      });
      onSessionAssigned({
        sessionId: libSession.id,
        date: selectedDate,
        library_session_ref: true,
      });
      handleClose();
    } catch (err) {
      console.error('Error creating session:', err);
      alert(err.message || 'Error al crear la sesión');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  // Choose: Crear nueva sesión | Añadir desde biblioteca
  if (mode === 'choose') {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Agregar entrenamiento">
        <div className="session-assignment-modal-content">
          <div className="session-assignment-date">{formatDate(selectedDate)}</div>
          <div className="session-assignment-options">
            <button
              type="button"
              className="session-assignment-option-card"
              onClick={() => setMode('create')}
            >
              <div className="session-assignment-option-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="session-assignment-option-content">
                <h3 className="session-assignment-option-title">Crear nueva sesión</h3>
                <p className="session-assignment-option-description">
                  Crear una sesión desde cero y asignarla a este día. Puedes guardarla en la biblioteca o solo para este cliente.
                </p>
              </div>
            </button>
            <button
              type="button"
              className="session-assignment-option-card"
              onClick={() => {
                handleClose();
                onAddFromLibrary?.();
              }}
            >
              <div className="session-assignment-option-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 7h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 11h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="session-assignment-option-content">
                <h3 className="session-assignment-option-title">Añadir desde biblioteca</h3>
                <p className="session-assignment-option-description">
                  Arrastra una sesión desde el panel de la izquierda a este día en el calendario.
                </p>
              </div>
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Create: name + save to library option (same as plan screen) + Crear y asignar
  if (mode === 'create') {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Crear nueva sesión">
        <div className="session-assignment-modal-content">
          <div className="session-assignment-date">{formatDate(selectedDate)}</div>
          <div className="session-assignment-form">
            <div className="session-assignment-create-field">
              <label className="session-assignment-create-label">Nombre de la sesión <span className="session-assignment-required">*</span></label>
              <Input
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                placeholder="Ej: Día 1 - Fuerza"
                light
              />
            </div>
            <div className="session-assignment-create-field">
              <label className="session-assignment-create-label">¿Dónde guardar?</label>
              <div className="session-assignment-save-options">
                <button
                  type="button"
                  className={`session-assignment-save-option ${saveToLibrary ? 'session-assignment-save-option--selected' : ''}`}
                  onClick={() => setSaveToLibrary(true)}
                >
                  <span className="session-assignment-save-option-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                      <path d="M8 7h8"/>
                      <path d="M8 11h8"/>
                    </svg>
                  </span>
                  <span className="session-assignment-save-option-title">Biblioteca</span>
                  <span className="session-assignment-save-option-desc">Reutilizable en otros planes y clientes</span>
                </button>
                <button
                  type="button"
                  className={`session-assignment-save-option ${!saveToLibrary ? 'session-assignment-save-option--selected' : ''}`}
                  onClick={() => setSaveToLibrary(false)}
                >
                  <span className="session-assignment-save-option-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2"/>
                      <path d="M3 10h18"/>
                      <path d="M10 3v7"/>
                    </svg>
                  </span>
                  <span className="session-assignment-save-option-title">Solo para este cliente</span>
                  <span className="session-assignment-save-option-desc">No aparecerá en la biblioteca</span>
                </button>
              </div>
            </div>
            <div className="session-assignment-actions">
              <Button title="Cancelar" onClick={handleClose} style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
              <Button
                title={isCreating ? 'Creando...' : 'Crear y asignar'}
                onClick={handleCreateAndAssign}
                disabled={!newSessionName.trim() || isCreating}
              />
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  return null;
};

export default SessionAssignmentModal;
