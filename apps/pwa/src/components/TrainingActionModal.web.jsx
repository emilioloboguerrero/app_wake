import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const MODAL_ROOT_ID = 'wake-training-action-modal-root';
const MODAL_Z_INDEX = 2147483646;
const CARD_MAX_WIDTH = 320;

function getOrCreateModalRoot() {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(MODAL_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = MODAL_ROOT_ID;
    root.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;z-index:${MODAL_Z_INDEX};pointer-events:none;`;
    document.body.appendChild(root);
  }
  return root;
}

function ensureModalRootLastChild(root) {
  if (typeof document === 'undefined' || !root?.parentNode) return;
  if (document.body.lastChild !== root) document.body.appendChild(root);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: 'rgba(0,0,0,0.6)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 4,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonWrap: {
    alignItems: 'center',
  },
  button: {
    backgroundColor: 'transparent',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

const COPY = {
  no_session_today: {
    message: 'No tienes una sesión para hoy, pero puedes ver el programa.',
    button: 'Ver programa',
  },
  already_completed: {
    message: 'Ya completaste la sesión de hoy. Puedes ver el programa para cambiar de día o sesión.',
    button: 'Ver programa',
  },
};

export function TrainingActionModal({ visible, onClose, variant = 'no_session_today', courseId, onVerPrograma }) {
  if (!visible || typeof document === 'undefined') {
    return null;
  }

  const { message, button } = COPY[variant] || COPY.no_session_today;

  const handleVerPrograma = () => {
    onClose();
    if (onVerPrograma && courseId) onVerPrograma(courseId);
  };

  const modalRoot = getOrCreateModalRoot();
  useEffect(() => {
    if (visible && modalRoot) ensureModalRootLastChild(modalRoot);
  }, [visible, modalRoot]);
  const fullCover = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 };
  const overlay = (
    <div style={{ pointerEvents: 'auto', ...fullCover }}>
      <div
        style={{
          ...fullCover,
          backgroundColor: 'rgba(0,0,0,0.62)',
          zIndex: 1,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2,
          width: 'calc(100vw - 32px)',
          maxWidth: CARD_MAX_WIDTH,
        }}
        onClick={onClose}
      >
        <View style={styles.card}>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttonWrap}>
            <div onClick={(e) => e.stopPropagation()} style={{ display: 'inline-block' }}>
              <TouchableOpacity style={styles.button} onPress={handleVerPrograma} activeOpacity={0.8}>
                <Text style={styles.buttonText}>{button}</Text>
              </TouchableOpacity>
            </div>
          </View>
        </View>
      </div>
    </div>
  );

  return modalRoot ? createPortal(overlay, modalRoot) : null;
}

export default TrainingActionModal;
