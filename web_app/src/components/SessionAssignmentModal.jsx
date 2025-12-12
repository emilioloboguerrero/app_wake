import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import './SessionAssignmentModal.css';

const SessionAssignmentModal = ({ 
  isOpen, 
  onClose, 
  selectedDate, 
  onSessionCreated,
  onSessionAdded,
  onSaveToLibrary 
}) => {
  const [mode, setMode] = useState('choose'); // 'choose', 'create', 'add'

  const handleClose = () => {
    setMode('choose');
    onClose();
  };

  const handleCreateSession = () => {
    if (onSessionCreated) {
      onSessionCreated(selectedDate);
    }
  };

  const handleAddFromLibrary = () => {
    // TODO: Implement library selection
    console.log('Add from library');
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

  if (!isOpen) return null;

  // Choose mode: Create or Add existing
  if (mode === 'choose') {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Agregar Entrenamiento"
      >
        <div className="session-assignment-modal-content">
          <div className="session-assignment-date">
            {formatDate(selectedDate)}
          </div>
          
          <div className="session-assignment-options">
            <button
              type="button"
              className="session-assignment-option-card"
              onClick={() => {
                if (onSessionCreated) {
                  onSessionCreated(selectedDate);
                }
                handleClose();
              }}
            >
              <div className="session-assignment-option-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="session-assignment-option-content">
                <h3 className="session-assignment-option-title">Crear Nueva Sesión</h3>
                <p className="session-assignment-option-description">Crear una sesión nueva desde cero</p>
              </div>
            </button>
            <button
              type="button"
              className="session-assignment-option-card"
              onClick={() => setMode('add')}
            >
              <div className="session-assignment-option-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 19.5V4.5C4 3.67157 4.67157 3 5.5 3H19.5C20.3284 3 21 3.67157 21 4.5V19.5C21 20.3284 20.3284 21 19.5 21H5.5C4.67157 21 4 20.3284 4 19.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 9L15 15M15 9L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="session-assignment-option-content">
                <h3 className="session-assignment-option-title">Agregar Sesión Existente</h3>
                <p className="session-assignment-option-description">Usar una sesión de tu biblioteca</p>
              </div>
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Add from library mode
  if (mode === 'add') {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Agregar Sesión de la Biblioteca"
      >
        <div className="session-assignment-modal-content">
          <div className="session-assignment-date">
            {formatDate(selectedDate)}
          </div>

          <div className="session-assignment-library">
            <p className="session-assignment-library-placeholder">
              Biblioteca de sesiones (próximamente)
            </p>
            {/* TODO: Show list of library sessions here */}
          </div>

          <div className="session-assignment-actions">
            <Button
              title="Cancelar"
              onClick={handleClose}
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
            />
          </div>
        </div>
      </Modal>
    );
  }

  return null;
};

export default SessionAssignmentModal;

