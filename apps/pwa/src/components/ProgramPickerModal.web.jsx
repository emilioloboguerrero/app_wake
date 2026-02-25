import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

const MODAL_ROOT_ID = 'wake-program-picker-modal-root';
const MODAL_Z_INDEX = 2147483646;
const CARD_MAX_WIDTH = 340;

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
    maxHeight: '70vh',
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
  list: {
    maxHeight: 280,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 10,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
});

export function ProgramPickerModal({
  visible,
  onClose,
  variant = 'training',
  title,
  options,
  onSelect,
}) {
  if (!visible || typeof document === 'undefined') {
    return null;
  }

  const defaultTitle = variant === 'training'
    ? '¿Con qué programa quieres entrenar?'
    : '¿Con qué plan de alimentación quieres registrar?';
  const displayTitle = title || defaultTitle;

  const handleSelect = (item) => {
    onClose();
    if (onSelect) onSelect(item);
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
          <Text style={styles.title}>{displayTitle}</Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={true}>
            {(options || []).map((item) => (
              <TouchableOpacity
                key={item.id || item.courseId || item.assignmentId}
                style={styles.option}
                onPress={() => handleSelect(item)}
                activeOpacity={0.8}
              >
                <Text style={styles.optionText} numberOfLines={2}>
                  {item.title || item.planName || item.name || 'Sin nombre'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </div>
    </div>
  );

  return modalRoot ? createPortal(overlay, modalRoot) : null;
}

export default ProgramPickerModal;
