import React from 'react';
import Modal from './Modal';
import './PlanningModal.css';

const PlanningModal = ({ isOpen, onClose, selectedDate, onWorkoutClick }) => {
  if (!selectedDate) return null;

  const formatDate = (date) => {
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

  const handleWorkoutClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('PlanningModal: handleWorkoutClick called', { selectedDate, onWorkoutClick: !!onWorkoutClick });
    if (onWorkoutClick) {
      onWorkoutClick(selectedDate);
    } else {
      console.warn('PlanningModal: onWorkoutClick prop is not provided');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Agregar Elemento"
    >
      <div className="planning-modal-content">
        <div className="planning-modal-date">
          {formatDate(selectedDate)}
        </div>
        
        <div className="planning-modal-options">
          <button
            type="button"
            className="planning-option-card"
            onClick={handleWorkoutClick}
          >
            <div className="planning-option-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 9L12 3L18 9M6 15L12 21L18 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 3V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="planning-option-content">
              <h3 className="planning-option-title">Entrenamiento</h3>
              <p className="planning-option-description">Agregar una sesión de entrenamiento</p>
            </div>
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PlanningModal;

