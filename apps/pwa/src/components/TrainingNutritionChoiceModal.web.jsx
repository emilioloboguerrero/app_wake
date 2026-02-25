import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const MODAL_ROOT_ID = 'wake-training-nutrition-choice-modal-root';
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
    marginBottom: 20,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
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
    minWidth: 140,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export function TrainingNutritionChoiceModal({
  visible,
  onClose,
  programTitle,
  creatorName,
  onChooseTraining,
  onChooseNutrition,
}) {
  if (!visible || typeof document === 'undefined') {
    return null;
  }

  const firstName = creatorName?.trim() ? creatorName.trim().split(/\s+/)[0] : null;
  const titleText = firstName
    ? `¿Qué quieres del plan que te hizo ${firstName}?`
    : programTitle
      ? `¿Qué quieres hacer en ${programTitle}?`
      : '¿Qué quieres hacer?';

  const handleTraining = () => {
    onClose();
    if (onChooseTraining) onChooseTraining();
  };

  const handleNutrition = () => {
    onClose();
    if (onChooseNutrition) onChooseNutrition();
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
          <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
            {titleText}
          </Text>
          <View style={styles.buttonsRow}>
            <div onClick={(e) => e.stopPropagation()} style={{ display: 'inline-block' }}>
              <TouchableOpacity style={styles.button} onPress={handleTraining} activeOpacity={0.8}>
                <Text style={styles.buttonText}>Entrenar</Text>
              </TouchableOpacity>
            </div>
            <div onClick={(e) => e.stopPropagation()} style={{ display: 'inline-block' }}>
              <TouchableOpacity style={styles.button} onPress={handleNutrition} activeOpacity={0.8}>
                <Text style={styles.buttonText}>Comer</Text>
              </TouchableOpacity>
            </div>
          </View>
        </View>
      </div>
    </div>
  );

  return modalRoot ? createPortal(overlay, modalRoot) : null;
}

export default TrainingNutritionChoiceModal;
