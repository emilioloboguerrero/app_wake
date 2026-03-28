import React from 'react';
import { motion } from 'motion/react';
import Modal from './Modal';
import { AnimatedList } from './ui';
import './PropagateChangesModal.css';

const SPRING_EASE = [0.22, 1, 0.36, 1];

const PropagateChangesModal = ({
  isOpen,
  onClose,
  type = 'library_session',
  itemName = '',
  affectedCount = 0,
  affectedUsers = [],
  affectedPrograms = [],
  programCount = 0,
  isPropagating = false,
  onPropagate,
}) => {
  if (!isOpen) return null;

  const isNutritionPlan = type === 'nutrition_plan';
  const isSession = type === 'library_session';
  const itemLabel = isNutritionPlan ? 'Este plan de nutrición' : (isSession ? 'Esta sesión' : 'Este plan');
  const hasReferences = programCount > 0 || affectedCount > 0;

  const handlePropagateAll = async () => {
    if (onPropagate) await onPropagate('all');
    onClose();
  };

  const handleForwardOnly = async () => {
    if (onPropagate) await onPropagate('forward_only');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="¿Propagar cambios?" containerClassName="propagate-modal-container" contentClassName="propagate-modal-content-wrapper">
      <div className="propagate-modal-content">
        {hasReferences ? (
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
                    <h3 className="propagate-option-title">Propagar cambios</h3>
                    <p className="propagate-option-desc">Los cambios se aplican a <strong>todos los programas</strong> que usen esta sesion. Las personalizaciones se sobreescriben.</p>
                  </div>
                  <div className="propagate-option-divider" />
                  <div className="propagate-option">
                    <div className="propagate-option-icon propagate-option-icon--keep">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                    </div>
                    <h3 className="propagate-option-title">Solo nuevas asignaciones</h3>
                    <p className="propagate-option-desc">Las copias existentes <strong>no se modifican</strong>. Solo las nuevas asignaciones usan la version actualizada.</p>
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
                  <span className="propagate-modal-users-label">Programas</span>
                  <span className="propagate-modal-users-count">{programCount}</span>
                </div>
                {affectedPrograms.length > 0 && (
                  <div className="propagate-modal-users-list">
                    <AnimatedList stagger={40}>
                      {affectedPrograms.map((p) => (
                        <div key={p.id} className="propagate-modal-user-row">
                          <span className="propagate-modal-user-avatar" style={{ fontSize: 11 }}>
                            {p.type === 'plan' ? 'P' : 'C'}
                          </span>
                          <span className="propagate-modal-user-name">{p.title}</span>
                        </div>
                      ))}
                    </AnimatedList>
                  </div>
                )}
                {affectedCount > 0 && (
                  <>
                    <div className="propagate-modal-users-header" style={{ marginTop: 12 }}>
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
                  </>
                )}
                {affectedCount === 0 && (
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 8 }}>
                    Ningún usuario tiene esta sesión asignada actualmente.
                  </p>
                )}
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
                onClick={handleForwardOnly}
                disabled={isPropagating}
              >
                Solo nuevas asignaciones
              </button>
              <button
                type="button"
                className="propagate-modal-btn propagate-modal-btn-propagate"
                onClick={handlePropagateAll}
                disabled={isPropagating}
              >
                {isPropagating ? (
                  <><span className="propagate-modal-spinner" />Propagando...</>
                ) : (
                  'Actualizar a todos'
                )}
              </button>
            </motion.div>
          </>
        ) : (
          <>
            <div className="propagate-modal-intro-wrap">
              <p className="propagate-modal-intro">
                {itemLabel} no está en ningún programa.
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

export default PropagateChangesModal;
