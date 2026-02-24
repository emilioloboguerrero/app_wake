/**
 * Shared modal layer for web: single root (z 99999), full-viewport backdrop,
 * open/close animation (backdrop fade + content slide), click-outside to close.
 * Use for NutritionScreen, MainScreen (TutorialOverlay), and other overlay modals.
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const ROOT_ID = 'wake-modal-overlay-root';
const Z_INDEX = 99999;
const ANIMATION_MS = 200;

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

export function WakeModalOverlay({
  visible,
  onClose,
  children,
  contentAnimation = 'slideUp',
  contentPlacement = 'center',
}) {
  const [closing, setClosing] = useState(false);

  const handleBackdropClick = () => {
    setClosing(true);
  };

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => {
      setClosing(false);
      onClose();
    }, ANIMATION_MS);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  useEffect(() => {
    if (!visible) setClosing(false);
  }, [visible]);

  if (!visible || typeof document === 'undefined') {
    return null;
  }

  const isClosing = closing;
  const backdropAnim =
    isClosing ? 'wakeModalBackdropOut 0.2s ease forwards' : 'wakeModalBackdropIn 0.2s ease forwards';
  const contentAnim =
    isClosing ? 'wakeModalContentOut 0.2s ease forwards' : 'wakeModalContentIn 0.2s ease forwards';

  const keyframes =
    contentAnimation === 'slideUp'
      ? `
    @keyframes wakeModalBackdropIn  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes wakeModalBackdropOut { from { opacity: 1; } to { opacity: 0; } }
    @keyframes wakeModalContentIn  { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes wakeModalContentOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(12px); } }
  `
      : `
    @keyframes wakeModalBackdropIn  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes wakeModalBackdropOut { from { opacity: 1; } to { opacity: 0; } }
    @keyframes wakeModalContentIn  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes wakeModalContentOut { from { opacity: 1; } to { opacity: 0; } }
  `;

  const isFull = contentPlacement === 'full';
  const contentWrapperStyle = isFull
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
      }
    : {
        position: 'fixed',
        inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      };

  const innerStyle = isFull
    ? {
        pointerEvents: 'auto',
        position: 'fixed',
        inset: 0,
        overflow: 'auto',
        animation: contentAnim,
      }
    : {
        pointerEvents: 'auto',
        maxHeight: '100%',
        overflow: 'auto',
        animation: contentAnim,
      };

  const root = getOrCreateRoot();
  const overlay = (
    <div style={{ pointerEvents: 'auto', position: 'fixed', inset: 0 }}>
      <style>{keyframes}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.62)',
          zIndex: 1,
          animation: backdropAnim,
        }}
        onClick={handleBackdropClick}
        role="button"
        aria-label="Cerrar"
      />
      <div style={contentWrapperStyle}>
        <div style={innerStyle} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </div>
  );

  return root ? createPortal(overlay, root) : null;
}

export default WakeModalOverlay;
