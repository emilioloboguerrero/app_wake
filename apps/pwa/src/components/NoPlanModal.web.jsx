import React from 'react';
import { createPortal } from 'react-dom';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const MODAL_ROOT_ID = 'wake-no-plan-modal-root';
const MODAL_Z_INDEX = 1005;
const CARD_MAX_WIDTH = 320;

function getOrCreateModalRoot() {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(MODAL_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = MODAL_ROOT_ID;
    root.style.cssText = `position:fixed;inset:0;z-index:${MODAL_Z_INDEX};pointer-events:none;`;
    document.body.appendChild(root);
  }
  return root;
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

export function NoPlanModal({ visible, onClose, variant = 'training', onGoToLibrary }) {
  if (!visible || typeof document === 'undefined') {
    return null;
  }

  const planType = variant === 'training' ? 'entrenamiento' : 'alimentación';
  const title = `Busquemos tu plan de ${planType}`;

  const handleLibrary = () => {
    onClose();
    if (onGoToLibrary) onGoToLibrary();
  };

  const modalRoot = getOrCreateModalRoot();
  const overlay = (
    <div style={{ pointerEvents: 'auto', position: 'fixed', inset: 0 }}>
      <div
        style={{
          position: 'fixed',
          inset: 0,
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
      >
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.buttonWrap}>
            <TouchableOpacity style={styles.button} onPress={handleLibrary} activeOpacity={0.8}>
              <Text style={styles.buttonText}>Explorar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </div>
    </div>
  );

  return modalRoot ? createPortal(overlay, modalRoot) : null;
}

export default NoPlanModal;
