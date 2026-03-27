import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import './Modal.css';

const SPRING_EASE = [0.22, 1, 0.36, 1];

const Modal = ({ isOpen, onClose, title, children, wide = false, extraWide = false, containerClassName: extraClass = '', contentClassName: contentClass = '' }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const containerClassName = `modal-container ${wide ? 'modal-container-wide' : ''} ${extraWide ? 'modal-container-extra-wide' : ''} ${extraClass}`.trim();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className={containerClassName}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.4, ease: SPRING_EASE }}
          >
            <div className="modal-header">
              <h2 className="modal-title">{title}</h2>
              <motion.button
                className="modal-close-button"
                onClick={onClose}
                aria-label="Cerrar"
                whileHover={{ scale: 1.08, backgroundColor: 'rgba(255,255,255,0.08)' }}
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.15 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </motion.button>
            </div>
            <motion.div
              className={`modal-content ${contentClass}`.trim()}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: SPRING_EASE, delay: 0.08 }}
            >
              {children}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
