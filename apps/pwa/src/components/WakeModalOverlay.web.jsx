/**
 * Simple modal overlay for web: full-screen backdrop, click-outside to close.
 * Enter/exit animations: backdrop fades, content slides up from bottom (same as plus-button menu).
 * Used by BottomTabBar (+ menu), NutritionScreen, TutorialOverlay.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ROOT_ID = 'wake-modal-overlay-root';
const Z_INDEX = 2147483646;
const EXIT_DURATION_MS = 250;

function getOrCreateRoot() {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.cssText =
      'position:fixed;inset:0;z-index:' + Z_INDEX + ';pointer-events:none;';
    document.body.appendChild(root);
  }
  return root;
}

// Pre-create the modal root when this module is loaded on web
// so the first visible modal doesn't pay this cost on click.
if (typeof document !== 'undefined') {
  getOrCreateRoot();
}

export function WakeModalOverlay({
  visible,
  onClose,
  children,
  contentAnimation = 'slideUp',
  contentPlacement = 'center',
  closeOnBackdropClick = true,
}) {
  const rootRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (visible) {
      wasVisibleRef.current = true;
      setIsClosing(false);
    } else if (wasVisibleRef.current) {
      setIsClosing(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!isClosing) return;
    const t = setTimeout(() => {
      wasVisibleRef.current = false;
      setIsClosing(false);
    }, EXIT_DURATION_MS);
    return () => clearTimeout(t);
  }, [isClosing]);

  const showOverlay = visible || isClosing;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.style.pointerEvents = showOverlay ? 'auto' : 'none';
    return () => {
      root.style.pointerEvents = 'none';
    };
  }, [showOverlay]);

  useEffect(() => {
    if (!visible && !isClosing) return;
    const onKey = (e) => e.key === 'Escape' && !isClosing && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, isClosing, onClose]);

  if (!showOverlay || typeof document === 'undefined') {
    return null;
  }

  const modalRoot = getOrCreateRoot();
  rootRef.current = modalRoot;
  if (document.body.lastChild !== modalRoot) {
    document.body.appendChild(modalRoot);
  }

  const isFull = contentPlacement === 'full';
  const useSlideUp = contentAnimation === 'slideUp';

  const backdropClass = isClosing
    ? 'wake-modal-backdrop-exit'
    : 'wake-modal-backdrop-enter';

  const contentClass = useSlideUp
    ? (isClosing ? 'wake-modal-content-exit' : 'wake-modal-content-enter')
    : (isClosing ? 'wake-modal-backdrop-exit' : 'wake-modal-backdrop-enter');

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
    pointerEvents: isClosing ? 'none' : 'auto',
    display: isFull ? 'flex' : 'flex',
    alignItems: isFull ? 'flex-end' : 'center',
    justifyContent: isFull ? 'flex-end' : 'center',
  };

  const handleBackdropClick = (e) => {
    if (isClosing) return;
    if (e.target === e.currentTarget) onClose();
  };

  const overlay = (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div
        className={backdropClass}
        style={backdropStyle}
        onClick={onClose}
        role="button"
        aria-label="Cerrar"
      />
      <div
        style={contentLayerStyle}
        onClick={handleBackdropClick}
      >
        <div
          className={useSlideUp ? contentClass : undefined}
          onClick={(e) => e.stopPropagation()}
          style={{
            pointerEvents: 'auto',
            display: isFull ? 'block' : 'contents',
            height: isFull && !closeOnBackdropClick ? '100%' : undefined,
            width: isFull ? '100%' : undefined,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );

  return modalRoot ? createPortal(overlay, modalRoot) : null;
}

export default WakeModalOverlay;
