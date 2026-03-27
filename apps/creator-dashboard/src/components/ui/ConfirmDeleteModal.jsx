import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import './ConfirmDeleteModal.css';

const TrashIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  itemName = '',
  title = '¿Eliminar este elemento?',
  description = 'Esta acción no se puede deshacer.',
  confirmLabel = 'Eliminar',
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
          className="cdm-backdrop"
          onClick={handleBackdropClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="cdm-container"
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          >
            <motion.div
              className="cdm-icon-wrap"
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 14, stiffness: 300, delay: 0.08 }}
            >
              <TrashIcon />
            </motion.div>

            <div className="cdm-body">
              <h3 className="cdm-title">
                {itemName ? (
                  <>¿Eliminar "<span className="cdm-item-name">{itemName}</span>"?</>
                ) : (
                  title
                )}
              </h3>
              <p className="cdm-description">{description}</p>
            </div>

            <div className="cdm-actions">
              <button
                type="button"
                className="cdm-btn cdm-btn--cancel"
                onClick={onClose}
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="cdm-btn cdm-btn--delete"
                onClick={onConfirm}
                disabled={isDeleting}
              >
                {isDeleting && <span className="cdm-spinner" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
