// Restore-purchase modal — shown from the Hoy empty state ("¿Ya compraste y no
// ves tu programa?"). The #1 cross-email fragmentation case: the buyer paid with
// email X but is signed in with a different email Y, so their account is empty.
// This modal spells out that the purchase lives on the email they PAID with
// (MercadoPago or Polar), shows the email of the account they're currently in so
// they can compare, and gives them the two doors out: sign out to re-enter with
// the right email, or contact support.
//
// Props:
//   visible       — boolean driving show/hide
//   onClose       — dismiss the modal
//   accountEmail  — email of the currently signed-in account (from useAuth)
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import authService from '../../services/authService';
import { whatsappUrl, SUPPORT_EMAIL } from '../../config/support';
import logger from '../../utils/logger';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EXIT_MS = 240;

function getOrCreateRoot() {
  if (typeof document === 'undefined') return null;
  const ROOT_ID = 'wake-restore-purchase-root';
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(root);
  }
  return root;
}

if (typeof document !== 'undefined') getOrCreateRoot();

const RestorePurchaseModal = ({ visible, onClose, accountEmail }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (visible) {
      wasVisibleRef.current = true;
      setIsClosing(false);
      const t = setTimeout(() => setEntered(true), 16);
      return () => clearTimeout(t);
    } else if (wasVisibleRef.current) {
      setIsClosing(true);
      setEntered(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!isClosing) return;
    const t = setTimeout(() => {
      wasVisibleRef.current = false;
      setIsClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [isClosing]);

  const showOverlay = visible || isClosing;
  if (!showOverlay || typeof document === 'undefined') return null;

  const modalRoot = getOrCreateRoot();
  if (!modalRoot) return null;
  modalRoot.style.pointerEvents = showOverlay ? 'auto' : 'none';

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // AuthContext flips to signed-out and the router lands on /login.
      await authService.signOutUser();
    } catch (err) {
      logger.error('[RestorePurchase] signOut error:', err);
      setSigningOut(false);
    }
  };

  const backdropOpacity = entered && !isClosing ? 1 : 0;
  const sheetTranslate = entered && !isClosing ? 0 : 40;
  const sheetOpacity = entered && !isClosing ? 1 : 0;

  const overlay = (
    <div style={{ position: 'fixed', inset: 0 }}>
      {/* Backdrop — dismissible */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          opacity: backdropOpacity,
          transition: `opacity ${EXIT_MS}ms ${SPRING}`,
          zIndex: 1,
        }}
      />

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            backgroundColor: '#1a1a1a',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '32px 24px 40px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            transform: `translateY(${sheetTranslate}px)`,
            opacity: sheetOpacity,
            transition: `transform ${EXIT_MS}ms ${SPRING}, opacity ${EXIT_MS}ms ${SPRING}`,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignSelf: 'center',
            }}
          />

          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: -0.3,
              lineHeight: 1.2,
            }}
          >
            ¿No ves tu programa?
          </span>

          <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55 }}>
            Tu compra quedó asociada al correo con el que pagaste (en Mercado Pago o Polar).
            Revisa cuál fue ese correo.
          </span>

          {accountEmail ? (
            <div
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.45)',
                }}
              >
                Estás en
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#fff', wordBreak: 'break-all' }}>
                {accountEmail}
              </span>
            </div>
          ) : null}

          <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55 }}>
            Si pagaste con otro correo, cierra sesión y entra con ese.
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              style={{
                width: '100%',
                padding: '16px 20px',
                borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.95)',
                color: '#1a1a1a',
                border: 'none',
                fontSize: 15,
                fontWeight: 700,
                cursor: signingOut ? 'default' : 'pointer',
                fontFamily: 'inherit',
                opacity: signingOut ? 0.6 : 1,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {signingOut ? 'Cerrando sesión…' : 'Salir y entrar con otro correo'}
            </button>

            <a
              href={whatsappUrl('Hola, compré en Wake y no veo mi programa. ¿Me ayudas a encontrar mi cuenta?')}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '16px 20px',
                borderRadius: 14,
                backgroundColor: '#25d366',
                color: '#0b1f14',
                textDecoration: 'none',
                fontSize: 15,
                fontWeight: 700,
                textAlign: 'center',
                fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Soporte por WhatsApp
            </a>
          </div>

          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
            O escríbenos a {SUPPORT_EMAIL}
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, modalRoot);
};

export default RestorePurchaseModal;
