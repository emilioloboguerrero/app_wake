import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import './PropagateChangesModal.css';
import './AssignProgramModal.css';

/**
 * Modal for assigning a program to a found user (step 2 of add client flow).
 * Uses same styling as PropagateChangesModal / PropagateNavigateModal.
 */
const AssignProgramModal = ({
  isOpen,
  onClose,
  user,
  onAssign,
  programs = [],
  isLoadingPrograms = false,
  isAssigning = false,
  error = null,
  onCreateProgram,
}) => {
  const [selectedProgramId, setSelectedProgramId] = useState('');

  useEffect(() => {
    if (isOpen && programs.length > 0 && !selectedProgramId) {
      setSelectedProgramId(programs[0].id);
    }
  }, [isOpen, programs, selectedProgramId]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedProgramId('');
    }
  }, [isOpen]);

  const handleClose = () => {
    setSelectedProgramId('');
    onClose();
  };

  const handleAssign = async () => {
    if (!selectedProgramId || !user?.userId) return;
    await onAssign(user.userId, selectedProgramId);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Asignar programa"
      containerClassName="propagate-modal-container"
      contentClassName="propagate-modal-content-wrapper"
    >
      <div className="propagate-modal-content">
        <div className="propagate-modal-layout assign-program-modal-layout">
          {/* Left card: Cliente (same structure as Propagate left) */}
          <div className="propagate-modal-card propagate-modal-left">
            <div className="propagate-modal-users-header">
              <span className="propagate-modal-users-label">Cliente</span>
            </div>
            <div className="assign-program-user-block">
              <p className="assign-program-user-name">
                {user?.displayName || user?.username || 'Sin nombre'}
              </p>
              {user?.email && (
                <p className="assign-program-user-email">{user.email}</p>
              )}
              <dl className="assign-program-user-details">
                {user?.age != null && user?.age !== '' && (
                  <div className="assign-program-user-row">
                    <dt>Edad</dt>
                    <dd>{user.age} años</dd>
                  </div>
                )}
                {user?.gender && (
                  <div className="assign-program-user-row">
                    <dt>Género</dt>
                    <dd>{user.gender}</dd>
                  </div>
                )}
                {user?.city && (
                  <div className="assign-program-user-row">
                    <dt>Ciudad</dt>
                    <dd>{user.city}</dd>
                  </div>
                )}
                {user?.country && (
                  <div className="assign-program-user-row">
                    <dt>País</dt>
                    <dd>{user.country}</dd>
                  </div>
                )}
                {(user?.height != null && user?.height !== '') && (
                  <div className="assign-program-user-row">
                    <dt>Altura</dt>
                    <dd>{user.height} cm</dd>
                  </div>
                )}
                {(user?.weight != null && user?.weight !== '') && (
                  <div className="assign-program-user-row">
                    <dt>Peso</dt>
                    <dd>{user.weight} kg</dd>
                  </div>
                )}
                {!(user?.age != null && user?.age !== '') &&
                  !user?.gender &&
                  !user?.city &&
                  !user?.country &&
                  (user?.height == null || user?.height === '') &&
                  (user?.weight == null || user?.weight === '') && (
                    <p className="assign-program-user-no-data">
                      No hay datos de perfil adicionales. El usuario puede completarlos en la app.
                    </p>
                  )}
              </dl>
            </div>
          </div>

          {/* Right card: Programa a asignar (same structure as Propagate right - header + list) */}
          <div className="propagate-modal-card propagate-modal-right assign-program-right">
            <div className="propagate-modal-users-header">
              <span className="propagate-modal-users-label">Programa a asignar</span>
              <span className="propagate-modal-users-count">{programs.length}</span>
            </div>
            {isLoadingPrograms ? (
              <div className="assign-program-loading">Cargando programas…</div>
            ) : (
              <ul className="propagate-modal-users-list assign-program-list">
                {onCreateProgram && (
                  <li className="assign-program-item-new">
                    <button
                      type="button"
                      className="assign-program-item-new-btn"
                      onClick={() => {
                        handleClose();
                        onCreateProgram();
                      }}
                    >
                      <span className="assign-program-item-new-icon">+</span>
                      <span className="assign-program-item-new-label">Crear nuevo programa</span>
                    </button>
                  </li>
                )}
                {programs.map((program) => (
                  <li key={program.id} className="assign-program-item">
                    <button
                      type="button"
                      className={`assign-program-item-btn ${selectedProgramId === program.id ? 'assign-program-item-btn-selected' : ''}`}
                      onClick={() => setSelectedProgramId(program.id)}
                    >
                      {program.image_url ? (
                        <span className="assign-program-item-thumb">
                          <img src={program.image_url} alt="" />
                        </span>
                      ) : (
                        <span className="assign-program-item-placeholder">
                          {program.title?.charAt(0) || 'P'}
                        </span>
                      )}
                      <span className="assign-program-item-info">
                        <span className="assign-program-item-title">
                          {program.title || `Programa ${program.id?.slice(0, 8) || ''}`}
                        </span>
                        {program.discipline && (
                          <span className="assign-program-item-discipline">{program.discipline}</span>
                        )}
                      </span>
                      {selectedProgramId === program.id && (
                        <span className="assign-program-item-check">✓</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!isLoadingPrograms && programs.length === 0 && !onCreateProgram && (
              <p className="assign-program-empty">
                No tienes programas 1-on-1. Crea uno en Productos → 1-on-1.
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="assign-program-error">
            <p>{error}</p>
          </div>
        )}

        <div className="propagate-modal-footer">
          <button
            type="button"
            className="propagate-modal-btn propagate-modal-btn-dont"
            onClick={handleClose}
            disabled={isAssigning}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="propagate-modal-btn propagate-modal-btn-propagate"
            onClick={handleAssign}
            disabled={!selectedProgramId || programs.length === 0 || isAssigning}
          >
            {isAssigning ? 'Asignando…' : 'Asignar'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AssignProgramModal;
