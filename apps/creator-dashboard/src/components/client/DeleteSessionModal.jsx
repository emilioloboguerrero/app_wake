import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import './DeleteSessionModal.css';

const TrashIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export default function DeleteSessionModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Eliminar esta sesion del plan?',
  sessionName = '',
  description = '',
  confirmLabel = 'Eliminar',
  confirmingLabel = 'Eliminando...',
  isDeleting = false,
}) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && !isDeleting) onClose();
  }, [onClose, isDeleting]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isDeleting) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="dsm-backdrop"
          onClick={handleBackdropClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="dsm-container"
            role="alertdialog"
            aria-modal="true"
            aria-label="Eliminar sesion"
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            {/* Icon with ping ring */}
            <motion.div
              className="dsm-icon-area"
              initial={{ opacity: 0, scale: 0, rotate: -15 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 12, stiffness: 280, delay: 0.06 }}
            >
              <div className="dsm-icon-ring">
                <span className="dsm-icon-ping" />
                <TrashIcon />
              </div>
            </motion.div>

            {/* Body */}
            <motion.div
              className="dsm-body"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            >
              <h3 className="dsm-title">
                {title}
              </h3>

              {sessionName && (
                <motion.div
                  className="dsm-session-name"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.16 }}
                >
                  {sessionName}
                </motion.div>
              )}

              <motion.p
                className="dsm-description"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                {description || 'El cliente ya no vera esta sesion en su semana.'}
              </motion.p>
            </motion.div>

            {/* Actions */}
            <motion.div
              className="dsm-actions"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
            >
              <motion.button
                type="button"
                className="dsm-btn dsm-btn--cancel"
                onClick={onClose}
                disabled={isDeleting}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                Cancelar
              </motion.button>
              <motion.button
                type="button"
                className="dsm-btn dsm-btn--delete"
                onClick={onConfirm}
                disabled={isDeleting}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                {isDeleting && <span className="dsm-spinner" />}
                {isDeleting ? confirmingLabel : confirmLabel}
              </motion.button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
