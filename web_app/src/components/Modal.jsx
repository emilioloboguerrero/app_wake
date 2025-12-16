import React from 'react';
import './Modal.css';

const Modal = ({ isOpen, onClose, title, children, wide = false, extraWide = false }) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const containerClassName = `modal-container ${wide ? 'modal-container-wide' : ''} ${extraWide ? 'modal-container-extra-wide' : ''}`;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className={containerClassName}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;

