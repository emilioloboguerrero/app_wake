/**
 * Simple modal overlay for web: full-screen backdrop, click-outside to close.
 * Used by BottomTabBar (+ menu), NutritionScreen, TutorialOverlay.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const ROOT_ID = 'wake-modal-overlay-root';
const Z_INDEX = 2147483646;

function getOrCreateRoot() {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.cssText =
      'position:fixed;inset:0;z-index:' + Z_INDEX + ';pointer-events:auto;';
    document.body.appendChild(root);
  }
  return root;
}

export function WakeModalOverlay({
  visible,
  onClose,
  children,
  contentAnimation = 'slideUp',
  contentPlacement = 'center',
}) {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.style.pointerEvents = visible ? 'auto' : 'none';
    return () => {
      root.style.pointerEvents = 'none';
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible || typeof document === 'undefined') {
    return null;
  }

  const modalRoot = getOrCreateRoot();
  rootRef.current = modalRoot;
  if (document.body.lastChild !== modalRoot) {
    document.body.appendChild(modalRoot);
  }

  const isFull = contentPlacement === 'full';

  const backdropStyle = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 1,
  };

  const contentLayerStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 2,
    pointerEvents: isFull ? 'none' : 'auto',
    display: isFull ? 'block' : 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const overlay = (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div
        style={backdropStyle}
        onClick={onClose}
        role="button"
        aria-label="Cerrar"
      />
      <div
        style={contentLayerStyle}
        onClick={isFull ? undefined : handleBackdropClick}
      >
        {isFull ? (
          children
        ) : (
          <div onClick={(e) => e.stopPropagation()} style={{ pointerEvents: 'auto' }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );

  return modalRoot ? createPortal(overlay, modalRoot) : null;
}

export default WakeModalOverlay;
