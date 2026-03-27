import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { GlowingEffect } from '../ui';
import plansService from '../../services/plansService';
import './CreatePlanOverlay.css';

// ─── Icons ───────────────────────────────────────────────────────────────────

const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
);

// ─── Component ───────────────────────────────────────────────────────────────

export default function CreatePlanOverlay({ isOpen, onClose, onCreated }) {
  const { user } = useAuth();
  const inputRef = useRef(null);

  const [step, setStep] = useState('name');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showDesc, setShowDesc] = useState(false);

  const canClose = step === 'name';

  // Reset state when overlay opens
  useEffect(() => {
    if (isOpen) {
      setStep('name');
      setTitle('');
      setDescription('');
      setShowDesc(false);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape' && canClose) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, canClose, onClose]);

  // ─── Creation logic ───────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async () => {
      const plan = await plansService.createPlan(user?.uid, null, {
        title: title.trim(),
        description: description.trim(),
      });
      const planId = plan?.id;
      if (!planId) throw new Error('No plan ID returned');
      return { id: planId };
    },
    onSuccess: (data) => {
      setStep('success');
      setTimeout(() => {
        if (onCreated && data?.id) onCreated(data);
      }, 1500);
    },
    onError: () => {
      setStep('name');
    },
  });

  const handleCreate = useCallback(() => {
    if (!title.trim()) return;
    setStep('creating');
    createMutation.mutate();
  }, [title, createMutation]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && title.trim()) {
      e.preventDefault();
      handleCreate();
    }
  }, [title, handleCreate]);

  if (!isOpen) return null;

  return createPortal(
    <div className="cpo-overlay" onClick={canClose ? onClose : undefined}>
      <div className="cpo-card" onClick={(e) => e.stopPropagation()}>
        <GlowingEffect spread={40} borderWidth={1} />

        {/* Top bar */}
        <div className="cpo-topbar">
          <div />
          {canClose && (
            <button type="button" className="cpo-close" onClick={onClose} aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {/* Steps */}
        <div className="cpo-body">

          {/* ── Name ──────────────────────────────────── */}
          {step === 'name' && (
            <div className="cpo-step" key="name">
              <div className="cpo-step__header">
                <h1 className="cpo-step__title">Nuevo plan</h1>
                <p className="cpo-step__desc">Dale un nombre claro — tus clientes lo veran.</p>
              </div>
              <div className="cpo-step__content">
                <input
                  ref={inputRef}
                  className="cpo-name-input"
                  type="text"
                  placeholder="Ej: Plan fuerza 12 semanas"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={80}
                />
                {title.trim().length > 0 && !showDesc && (
                  <button type="button" className="cpo-link-btn" onClick={() => setShowDesc(true)}>
                    + Agregar descripcion
                  </button>
                )}
                {showDesc && (
                  <textarea
                    className="cpo-desc-input"
                    placeholder="Para que tipo de cliente es este plan..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                )}
              </div>
              <div className="cpo-footer">
                <div />
                <button type="button" className="cpo-next-btn cpo-next-btn--create" onClick={handleCreate} disabled={!title.trim()}>
                  Crear plan <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* ── Creating ──────────────────────────────── */}
          {step === 'creating' && (
            <div className="cpo-step cpo-step--center" key="creating">
              <div className="cpo-spinner" />
              <p className="cpo-status-text">Creando plan</p>
            </div>
          )}

          {/* ── Success ───────────────────────────────── */}
          {step === 'success' && (
            <div className="cpo-step cpo-step--center" key="success">
              <div className="cpo-success-rings">
                <div className="cpo-ring" />
                <div className="cpo-ring" />
                <div className="cpo-ring" />
                <div className="cpo-check-wrap">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <circle className="cpo-check-circle" cx="24" cy="24" r="22" stroke="rgba(74,222,128,0.8)" strokeWidth="2.5" />
                    <path className="cpo-check-tick" d="M14 25l7 7 13-14" stroke="rgba(74,222,128,0.9)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              <h2 className="cpo-success-title">Plan creado</h2>
              <p className="cpo-success-desc">Agrega semanas, sesiones y ejercicios.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
