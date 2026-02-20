import React from 'react';
import Modal from './Modal';
import './PropagateChangesModal.css';

/**
 * Modal for propagating library/plan changes to assigned users.
 * Clear UI explaining what each option does.
 *
 * @param {boolean} isOpen - Whether modal is open
 * @param {function} onClose - Called when modal is closed
 * @param {string} type - 'library_session' | 'plan'
 * @param {string} itemName - Session or plan title
 * @param {number} affectedCount - Number of affected users
 * @param {{ userId: string, displayName: string }[]} affectedUsers - Optional list of affected users with display names
 * @param {boolean} isPropagating - Whether propagation is in progress
 * @param {function} onPropagate - Called when user confirms propagation
 * @param {function} onDontPropagate - Called when user chooses not to propagate (optional)
 */
const PropagateChangesModal = ({
  isOpen,
  onClose,
  type = 'library_session',
  itemName = '',
  affectedCount = 0,
  affectedUsers = [],
  isPropagating = false,
  onPropagate,
  onDontPropagate
}) => {
  if (!isOpen) return null;

  const isSession = type === 'library_session';
  const isNutritionPlan = type === 'nutrition_plan';
  const itemLabel = isNutritionPlan ? 'Este plan de nutrición' : (isSession ? 'Esta sesión' : 'Este plan');

  const handlePropagate = async () => {
    if (onPropagate) await onPropagate();
    onClose();
  };

  const handleDontPropagate = () => {
    if (onDontPropagate) onDontPropagate();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="¿Propagar cambios a los usuarios asignados?" containerClassName="propagate-modal-container" contentClassName="propagate-modal-content-wrapper">
      <div className="propagate-modal-content">
        {affectedCount > 0 ? (
          <>
            <div className="propagate-modal-layout">
              <div className="propagate-modal-card propagate-modal-left">
                <div className="propagate-modal-options">
                  <div className="propagate-option">
                    <h3 className="propagate-option-title">Propagar cambios</h3>
                    <p className="propagate-option-desc"><strong>Todos</strong> verán esta versión actualizada. Se pierden las personalizaciones.</p>
                  </div>
                  <div className="propagate-option">
                    <h3 className="propagate-option-title">No propagar</h3>
                    <p className="propagate-option-desc">Cada usuario <strong>conserva su versión</strong>. Solo las nuevas asignaciones usan la actualizada.</p>
                  </div>
                </div>
              </div>

              <div className="propagate-modal-card propagate-modal-right">
                <div className="propagate-modal-users-header">
                  <span className="propagate-modal-users-label">Usuarios afectados</span>
                  <span className="propagate-modal-users-count">{affectedCount}</span>
                </div>
                <ul className="propagate-modal-users-list">
                  {affectedUsers.map((u) => (
                    <li key={u.userId}>{u.displayName}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="propagate-modal-footer">
              <button
                type="button"
                className="propagate-modal-btn propagate-modal-btn-dont"
                onClick={handleDontPropagate}
                disabled={isPropagating}
              >
                No propagar
              </button>
              <button
                type="button"
                className="propagate-modal-btn propagate-modal-btn-propagate"
                onClick={handlePropagate}
                disabled={isPropagating}
              >
                {isPropagating ? 'Propagando…' : 'Propagar a todos'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="propagate-modal-intro-wrap">
              <p className="propagate-modal-intro">
                {itemLabel} no está asignado a ningún usuario.
              </p>
            </div>
            <div className="propagate-modal-footer">
              <button
                type="button"
                className="propagate-modal-btn propagate-modal-btn-dont"
                onClick={onClose}
              >
                Entendido
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default PropagateChangesModal;
