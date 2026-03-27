import React from 'react';
import { motion } from 'motion/react';
import Modal from './Modal';
import { AnimatedList } from './ui';
import './PropagateChangesModal.css';

const SPRING_EASE = [0.22, 1, 0.36, 1];

const PropagateNavigateModal = ({
  isOpen,
  onClose,
  type = 'library_session',
  itemName = '',
  affectedCount = 0,
  affectedUsers = [],
  isPropagating = false,
  onPropagate,
  onLeaveWithoutPropagate
}) => {
  if (!isOpen) return null;

  const isNutritionPlan = type === 'nutrition_plan';
  const isSession = type === 'library_session';
  const itemLabel = isNutritionPlan ? 'Este plan de nutrición' : (isSession ? 'Esta sesión' : 'Este plan');

  const handlePropagate = async () => {
    if (onPropagate) await onPropagate();
    onClose();
  };

  const handleLeaveWithoutPropagate = () => {
    if (onLeaveWithoutPropagate) onLeaveWithoutPropagate();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="¿Salir sin propagar?" containerClassName="propagate-modal-container" contentClassName="propagate-modal-content-wrapper">
      <div className="propagate-modal-content">
        {affectedCount > 0 ? (
          <>
            <div className="propagate-modal-layout">
              <motion.div
                className="propagate-modal-card propagate-modal-left"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: SPRING_EASE }}
              >
                <div className="propagate-modal-options">
                  <div className="propagate-option">
                    <div className="propagate-option-icon propagate-option-icon--propagate">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 1L21 5L17 9M3 11V16a2 2 0 002 2h11M21 5H9a4 4 0 00-4 4v12"/>
                      </svg>
                    </div>
                    <h3 className="propagate-option-title">Propagar y salir</h3>
                    <p className="propagate-option-desc"><strong>Todos</strong> verán esta versión actualizada. Se pierden las personalizaciones.</p>
                  </div>
                  <div className="propagate-option-divider" />
                  <div className="propagate-option">
                    <div className="propagate-option-icon propagate-option-icon--keep">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                      </svg>
                    </div>
                    <h3 className="propagate-option-title">Salir sin propagar</h3>
                    <p className="propagate-option-desc">Cada usuario <strong>conserva su versión</strong>. Los cambios quedan guardados pero no propagados.</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                className="propagate-modal-card propagate-modal-right"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: SPRING_EASE, delay: 0.1 }}
              >
                <div className="propagate-modal-users-header">
                  <span className="propagate-modal-users-label">Usuarios afectados</span>
                  <span className="propagate-modal-users-count">{affectedCount}</span>
                </div>
                <div className="propagate-modal-users-list">
                  <AnimatedList stagger={40}>
                    {affectedUsers.map((u) => (
                      <div key={u.userId} className="propagate-modal-user-row">
                        <span className="propagate-modal-user-avatar">
                          {(u.displayName || '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="propagate-modal-user-name">{u.displayName}</span>
                      </div>
                    ))}
                  </AnimatedList>
                </div>
              </motion.div>
            </div>

            <motion.div
              className="propagate-modal-footer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: SPRING_EASE, delay: 0.2 }}
            >
              <button
                type="button"
                className="propagate-modal-btn propagate-modal-btn-dont"
                onClick={onClose}
                disabled={isPropagating}
              >
                Quedarse
              </button>
              <button
                type="button"
                className="propagate-modal-btn propagate-modal-btn-warning"
                onClick={handleLeaveWithoutPropagate}
                disabled={isPropagating}
              >
                Salir sin propagar
              </button>
              <button
                type="button"
                className="propagate-modal-btn propagate-modal-btn-propagate"
                onClick={handlePropagate}
                disabled={isPropagating}
              >
                {isPropagating ? (
                  <><span className="propagate-modal-spinner" />Propagando…</>
                ) : (
                  'Propagar y salir'
                )}
              </button>
            </motion.div>
          </>
        ) : (
          <>
            <div className="propagate-modal-intro-wrap">
              <p className="propagate-modal-intro">
                {itemLabel} no está asignado a ningún usuario.
              </p>
            </div>
            <div className="propagate-modal-footer">
              <button type="button" className="propagate-modal-btn propagate-modal-btn-dont" onClick={onClose}>
                Entendido
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default PropagateNavigateModal;
