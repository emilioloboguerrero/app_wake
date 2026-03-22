import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import apiClient from '../utils/apiClient';
import plansService from '../services/plansService';
import libraryService from '../services/libraryService';
import { useAuth } from '../contexts/AuthContext';
import { GlowingEffect } from './ui';
import './CreateFlowOverlay.css';

// ─── Icons ───────────────────────────────────────────────────────────────────

const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
);

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
);

const DisciplineIcon = ({ type }) => {
  const p = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (type) {
    case 'fuerza': return <svg {...p}><path d="M6.5 6.5L17.5 17.5M6.5 17.5L17.5 6.5" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /><circle cx="6.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="6.5" r="2.5" /></svg>;
    case 'funcional': return <svg {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>;
    case 'calistenia': return <svg {...p}><path d="M12 2v6M12 22v-6M2 12h6M22 12h-6" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'crossfit': return <svg {...p}><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-6" /></svg>;
    case 'cardio': return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" /></svg>;
    case 'yoga': return <svg {...p}><circle cx="12" cy="4" r="2" /><path d="M4 20l4-4 4 2 4-2 4 4" /><path d="M12 6v8" /></svg>;
    case 'nutricion': return <svg {...p}><path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /><path d="M6 1v3M10 1v3M14 1v3" /></svg>;
    case 'integral': return <svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
    default: return null;
  }
};

// ─── Constants ───────────────────────────────────────────────────────────────

const COPY_PROGRAM = {
  heading: 'Nuevo programa',
  subtitle: 'Dale un nombre memorable.',
  placeholder: 'Ej: Fuerza avanzada 12 semanas',
  descPlaceholder: 'Objetivo, nivel, que incluye...',
  creating: 'Creando programa',
  success: 'Programa creado',
  successSub: 'Agrega semanas, sesiones y ejercicios.',
};

const COPY_PLAN = {
  heading: 'Nuevo plan',
  subtitle: 'Un plan que asignaras a tus clientes 1:1.',
  placeholder: 'Ej: Plan base fuerza',
  descPlaceholder: 'Para que tipo de cliente...',
  creating: 'Creando plan',
  success: 'Plan creado',
  successSub: 'Agrega semanas y sesiones.',
};

const COPY_OO = {
  heading: 'Nuevo programa 1:1',
  subtitle: 'El nombre que veran tus clientes.',
  placeholder: 'Ej: Entrenamiento personalizado',
  descPlaceholder: 'Que incluye este programa...',
  creating: 'Preparando todo',
  success: 'Programa creado',
  successSub: 'Agrega clientes y asigna planes.',
};

const DISCIPLINE_OPTIONS = [
  { id: 'Fuerza - hipertrofia', label: 'Fuerza / Hipertrofia', icon: 'fuerza' },
  { id: 'Funcional', label: 'Funcional', icon: 'funcional' },
  { id: 'Calistenia', label: 'Calistenia', icon: 'calistenia' },
  { id: 'CrossFit', label: 'CrossFit', icon: 'crossfit' },
  { id: 'Cardio', label: 'Cardio', icon: 'cardio' },
  { id: 'Yoga / Movilidad', label: 'Yoga / Movilidad', icon: 'yoga' },
  { id: 'Nutricion', label: 'Nutricion', icon: 'nutricion' },
  { id: 'Integral', label: 'Integral', icon: 'integral' },
];

const OO_STEPS = ['name', 'discipline', 'library', 'weight', 'media', 'creating', 'success'];
const OO_QUESTION_COUNT = 5;

const LT_STEPS = ['name', 'discipline', 'access', 'price', 'trial', 'weight', 'media', 'creating', 'success'];
const LT_QUESTION_COUNT = 7;

const ACCESS_OPTIONS = [
  { id: 'monthly', label: 'Suscripcion mensual', desc: 'Cobro recurrente cada mes', icon: 'repeat' },
  { id: 'one_time', label: 'Pago unico', desc: 'Un solo pago, acceso por 1 año', icon: 'single' },
];

const AccessIcon = ({ type }) => {
  const p = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (type === 'repeat') return <svg {...p}><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>;
  if (type === 'single') return <svg {...p}><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><path d="M1 10h22" /></svg>;
  return null;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function CreateFlowOverlay({ isOpen, onClose, type = 'program', onCreated, defaultDeliveryType }) {
  const isOneOnOne = defaultDeliveryType === 'one_on_one';
  const { user } = useAuth();

  const [step, setStep] = useState('name');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showDesc, setShowDesc] = useState(false);
  const [createdId, setCreatedId] = useState(null);
  const inputRef = useRef(null);

  const [discipline, setDiscipline] = useState('');
  const [selectedLibraryIds, setSelectedLibraryIds] = useState(new Set());
  const [weightSuggestions, setWeightSuggestions] = useState(true);

  const [accessType, setAccessType] = useState('monthly');
  const [price, setPrice] = useState('');
  const [freeTrialActive, setFreeTrialActive] = useState(false);
  const [freeTrialDays, setFreeTrialDays] = useState('7');

  const isLowTicket = !isOneOnOne && type === 'program';

  const { data: libraries = [] } = useQuery({
    queryKey: ['library', 'creator-libs', user?.uid],
    queryFn: () => libraryService.getLibrariesByCreator(user?.uid),
    enabled: !!user?.uid && isOneOnOne && isOpen,
    staleTime: 5 * 60 * 1000,
  });

  // Auto-select all libraries when they load
  useEffect(() => {
    if (libraries.length > 0 && isOpen) {
      setSelectedLibraryIds(new Set(libraries.map((l) => l.id)));
    }
  }, [libraries, isOpen]);

  const toggleLibrary = useCallback((id) => {
    setSelectedLibraryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const copy = isOneOnOne ? COPY_OO : (type === 'plan' ? COPY_PLAN : COPY_PROGRAM);
  const isMultiStep = isOneOnOne || isLowTicket;
  const activeSteps = isOneOnOne ? OO_STEPS : (isLowTicket ? LT_STEPS : null);
  const activeQuestionCount = isOneOnOne ? OO_QUESTION_COUNT : (isLowTicket ? LT_QUESTION_COUNT : 0);
  const stepIndex = activeSteps ? activeSteps.indexOf(step) : -1;

  useEffect(() => {
    if (isOpen) {
      setStep('name');
      setTitle('');
      setDescription('');
      setShowDesc(false);
      setCreatedId(null);
      setDiscipline('');
      setSelectedLibraryIds(new Set());
      setWeightSuggestions(true);
      setAccessType('monthly');
      setPrice('');
      setFreeTrialActive(false);
      setFreeTrialDays('7');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closable = isMultiStep ? stepIndex < activeSteps.indexOf('creating') : step === 'name';
    const handler = (e) => { if (e.key === 'Escape' && closable) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, step, stepIndex, isMultiStep, activeSteps, onClose]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (type === 'plan') {
        return plansService.createPlan(null, null, { title: title.trim(), description: description.trim() || undefined });
      }
      const payload = { title: title.trim(), description: description.trim() || undefined, deliveryType: defaultDeliveryType || 'general' };
      if (isOneOnOne) {
        if (discipline) payload.discipline = discipline;
        payload.access_duration = 'monthly';
        payload.weight_suggestions = weightSuggestions;
        if (selectedLibraryIds.size > 0) {
          payload.availableLibraries = Array.from(selectedLibraryIds);
        }
      }
      if (isLowTicket) {
        if (discipline) payload.discipline = discipline;
        payload.access_duration = accessType === 'monthly' ? 'monthly' : 'yearly';
        payload.weight_suggestions = weightSuggestions;
        const numericPrice = price === '' ? null : parseInt(price, 10);
        if (numericPrice && numericPrice >= 2000) {
          payload.price = numericPrice;
        }
        payload.free_trial = {
          active: freeTrialActive,
          duration_days: freeTrialActive ? Math.max(1, parseInt(freeTrialDays, 10) || 7) : 0,
        };
      }
      const res = await apiClient.post('/creator/programs', payload);
      return res?.data;
    },
    onSuccess: (data) => {
      const id = data?.id;
      setCreatedId(id);
      setStep('success');
      setTimeout(() => { if (onCreated && id) onCreated({ id, type }); }, 1600);
    },
    onError: () => {
      if (isMultiStep) setStep('media');
      else setStep('name');
    },
  });

  const goNext = useCallback(() => {
    if (!isMultiStep) {
      if (!title.trim()) return;
      setStep('creating');
      createMutation.mutate();
      return;
    }
    const i = activeSteps.indexOf(step);
    const next = activeSteps[i + 1];
    if (next === 'creating') { setStep('creating'); createMutation.mutate(); }
    else setStep(next);
  }, [step, title, isMultiStep, activeSteps, createMutation]);

  const goBack = useCallback(() => {
    if (!isMultiStep) return;
    const i = activeSteps.indexOf(step);
    if (i > 0) setStep(activeSteps[i - 1]);
  }, [step, isMultiStep, activeSteps]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && step === 'name' && title.trim()) { e.preventDefault(); goNext(); }
  }, [step, title, goNext]);

  const canClose = isMultiStep ? stepIndex < activeSteps.indexOf('creating') : step === 'name';

  if (!isOpen) return null;

  return (
    <div className="cfo-overlay" onClick={canClose ? onClose : undefined}>
      <div className="cfo-card" onClick={(e) => e.stopPropagation()}>
        <GlowingEffect spread={40} borderWidth={1} />

        {/* Top bar: progress + close */}
        <div className="cfo-topbar">
          {isMultiStep && stepIndex >= 0 && stepIndex < activeQuestionCount ? (
            <div className="cfo-progress">
              <div className="cfo-progress__track">
                <div className="cfo-progress__fill" style={{ width: `${((stepIndex + 1) / activeQuestionCount) * 100}%` }} />
              </div>
              <span className="cfo-progress__label">{stepIndex + 1} / {activeQuestionCount}</span>
            </div>
          ) : <div />}
          {canClose && (
            <button type="button" className="cfo-close" onClick={onClose} aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {/* Step content */}
        <div className="cfo-body">

          {/* ── Name ──────────────────────────────────────────── */}
          {step === 'name' && (
            <div className="cfo-step" key="name">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">{copy.heading}</h1>
                <p className="cfo-step__desc">{copy.subtitle}</p>
              </div>
              <div className="cfo-step__content">
                <input
                  ref={inputRef}
                  className="cfo-name-input"
                  type="text"
                  placeholder={copy.placeholder}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={80}
                />
                {title.trim().length > 0 && !showDesc && (
                  <button type="button" className="cfo-link-btn" onClick={() => setShowDesc(true)}>+ Agregar descripcion</button>
                )}
                {showDesc && (
                  <textarea className="cfo-desc-input" placeholder={copy.descPlaceholder} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} autoFocus />
                )}
              </div>
              <div className="cfo-footer">
                <div />
                <button type="button" className="cfo-next-btn" onClick={goNext} disabled={!title.trim()}>
                  {isMultiStep ? 'Siguiente' : 'Crear'} <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* ── Discipline ────────────────────────────────────── */}
          {step === 'discipline' && (
            <div className="cfo-step" key="discipline">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">Tipo de entrenamiento</h1>
                <p className="cfo-step__desc">Selecciona la disciplina principal. Puedes cambiarla despues.</p>
              </div>
              <div className="cfo-step__content">
                <div className="cfo-grid">
                  {DISCIPLINE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`cfo-grid-item ${discipline === opt.id ? 'cfo-grid-item--active' : ''}`}
                      onClick={() => setDiscipline(discipline === opt.id ? '' : opt.id)}
                    >
                      <GlowingEffect spread={16} borderWidth={1} />
                      <span className="cfo-grid-item__icon"><DisciplineIcon type={opt.icon} /></span>
                      <span className="cfo-grid-item__label">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="cfo-footer">
                <button type="button" className="cfo-back-btn" onClick={goBack}><IconArrowLeft /></button>
                <button type="button" className="cfo-next-btn" onClick={goNext}>
                  {discipline ? 'Siguiente' : 'Saltar'} <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* ── Library ───────────────────────────────────────── */}
          {step === 'library' && (
            <div className="cfo-step" key="library">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">Bibliotecas de ejercicios</h1>
                <p className="cfo-step__desc">Selecciona las bibliotecas que tus clientes podran ver.</p>
              </div>
              <div className="cfo-step__content">
                {libraries.length === 0 ? (
                  <div className="cfo-lib-empty">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>
                    <p>No tienes bibliotecas creadas todavia. Puedes agregar una despues.</p>
                  </div>
                ) : (
                  <div className="cfo-choice">
                    {libraries.map((lib) => {
                      const isSelected = selectedLibraryIds.has(lib.id);
                      return (
                        <button
                          key={lib.id}
                          type="button"
                          className={`cfo-choice-card ${isSelected ? 'cfo-choice-card--active' : ''}`}
                          onClick={() => toggleLibrary(lib.id)}
                        >
                          <GlowingEffect spread={18} borderWidth={1} />
                          <span className="cfo-choice-card__icon">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                            </svg>
                          </span>
                          <span className="cfo-choice-card__text">
                            <span className="cfo-choice-card__label">{lib.title || 'Biblioteca'}</span>
                          </span>
                          <span className={`cfo-check-toggle ${isSelected ? 'cfo-check-toggle--on' : ''}`}>
                            {isSelected && (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="cfo-footer">
                <button type="button" className="cfo-back-btn" onClick={goBack}><IconArrowLeft /></button>
                <button type="button" className="cfo-next-btn" onClick={goNext}>
                  {selectedLibraryIds.size > 0 ? 'Siguiente' : 'Saltar'} <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* ── Weight ────────────────────────────────────────── */}
          {step === 'weight' && (
            <div className="cfo-step" key="weight">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">Sugerencias de peso</h1>
                <p className="cfo-step__desc">Wake calcula sugerencias basadas en el historial de cada cliente.</p>
              </div>
              <div className="cfo-step__content">
                <div className="cfo-choice">
                  <button type="button" className={`cfo-choice-card ${weightSuggestions ? 'cfo-choice-card--active' : ''}`} onClick={() => setWeightSuggestions(true)}>
                    <GlowingEffect spread={18} borderWidth={1} />
                    <span className="cfo-choice-card__icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
                    </span>
                    <span className="cfo-choice-card__text">
                      <span className="cfo-choice-card__label">Activar</span>
                      <span className="cfo-choice-card__desc">Recomendado para la mayoria</span>
                    </span>
                  </button>
                  <button type="button" className={`cfo-choice-card ${!weightSuggestions ? 'cfo-choice-card--active' : ''}`} onClick={() => setWeightSuggestions(false)}>
                    <GlowingEffect spread={18} borderWidth={1} />
                    <span className="cfo-choice-card__icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></svg>
                    </span>
                    <span className="cfo-choice-card__text">
                      <span className="cfo-choice-card__label">Desactivar</span>
                      <span className="cfo-choice-card__desc">Los clientes eligen su peso</span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="cfo-footer">
                <button type="button" className="cfo-back-btn" onClick={goBack}><IconArrowLeft /></button>
                <button type="button" className="cfo-next-btn" onClick={goNext}>
                  Siguiente <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* ── Access type (low-ticket) ──────────────────────── */}
          {step === 'access' && (
            <div className="cfo-step" key="access">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">Modelo de acceso</h1>
                <p className="cfo-step__desc">Como van a pagar tus clientes por este programa?</p>
              </div>
              <div className="cfo-step__content">
                <div className="cfo-choice">
                  {ACCESS_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`cfo-choice-card ${accessType === opt.id ? 'cfo-choice-card--active' : ''}`}
                      onClick={() => setAccessType(opt.id)}
                    >
                      <GlowingEffect spread={18} borderWidth={1} />
                      <span className="cfo-choice-card__icon"><AccessIcon type={opt.icon} /></span>
                      <span className="cfo-choice-card__text">
                        <span className="cfo-choice-card__label">{opt.label}</span>
                        <span className="cfo-choice-card__desc">{opt.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="cfo-footer">
                <button type="button" className="cfo-back-btn" onClick={goBack}><IconArrowLeft /></button>
                <button type="button" className="cfo-next-btn" onClick={goNext}>
                  Siguiente <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* ── Price (low-ticket) ─────────────────────────────── */}
          {step === 'price' && (
            <div className="cfo-step" key="price">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">Precio</h1>
                <p className="cfo-step__desc">Cuanto van a pagar tus clientes? Puedes cambiarlo despues.</p>
              </div>
              <div className="cfo-step__content">
                <div className="cfo-price-field">
                  <span className="cfo-price-field__currency">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="cfo-price-field__input"
                    placeholder="Ej: 300.000"
                    value={price ? Number(price).toLocaleString('es-CO', { maximumFractionDigits: 0 }) : ''}
                    onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                  />
                  <span className="cfo-price-field__hint">COP</span>
                </div>
                {(price === '' || parseInt(price, 10) < 2000) && (
                  <p className="cfo-price-warning">El precio minimo es $2,000 COP</p>
                )}
              </div>
              <div className="cfo-footer">
                <button type="button" className="cfo-back-btn" onClick={goBack}><IconArrowLeft /></button>
                <button
                  type="button"
                  className="cfo-next-btn"
                  onClick={goNext}
                  disabled={!price || parseInt(price, 10) < 2000}
                >
                  Siguiente <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* ── Free trial (low-ticket) ─────────────────────── */}
          {step === 'trial' && (
            <div className="cfo-step" key="trial">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">Prueba gratis</h1>
                <p className="cfo-step__desc">Ofrece unos dias de prueba para que tus clientes conozcan el programa antes de pagar.</p>
              </div>
              <div className="cfo-step__content">
                <div className="cfo-choice">
                  <button type="button" className={`cfo-choice-card ${freeTrialActive ? 'cfo-choice-card--active' : ''}`} onClick={() => setFreeTrialActive(true)}>
                    <GlowingEffect spread={18} borderWidth={1} />
                    <span className="cfo-choice-card__icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
                    </span>
                    <span className="cfo-choice-card__text">
                      <span className="cfo-choice-card__label">Si, ofrecer prueba gratis</span>
                      <span className="cfo-choice-card__desc">Los clientes prueban antes de pagar</span>
                    </span>
                  </button>
                  <button type="button" className={`cfo-choice-card ${!freeTrialActive ? 'cfo-choice-card--active' : ''}`} onClick={() => setFreeTrialActive(false)}>
                    <GlowingEffect spread={18} borderWidth={1} />
                    <span className="cfo-choice-card__icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></svg>
                    </span>
                    <span className="cfo-choice-card__text">
                      <span className="cfo-choice-card__label">No, sin prueba gratis</span>
                      <span className="cfo-choice-card__desc">Pago inmediato para acceder</span>
                    </span>
                  </button>
                </div>
                {freeTrialActive && (
                  <div className="cfo-duration-row">
                    <span className="cfo-duration-row__label">Dias de prueba</span>
                    <div className="cfo-duration-row__input-wrap">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        className="cfo-duration-row__input"
                        value={freeTrialDays}
                        onChange={(e) => setFreeTrialDays(e.target.value.replace(/\D/g, ''))}
                      />
                      <span className="cfo-duration-row__unit">dias</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="cfo-footer">
                <button type="button" className="cfo-back-btn" onClick={goBack}><IconArrowLeft /></button>
                <button type="button" className="cfo-next-btn" onClick={goNext}>
                  Siguiente <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* ── Media info ──────────────────────────────────── */}
          {step === 'media' && (
            <div className="cfo-step" key="media">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">Imagen y videos</h1>
                <p className="cfo-step__desc">Casi listo! Una vez creado el programa, podras agregar la imagen de portada, el video de introduccion y tutoriales desde la pantalla de Configuracion.</p>
              </div>
              <div className="cfo-step__content">
                <div className="cfo-media-hint">
                  <div className="cfo-media-hint__items">
                    <div className="cfo-media-hint__item">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                      <span>Imagen de portada</span>
                    </div>
                    <div className="cfo-media-hint__item">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l4.553-2.724A1 1 0 0121 8.132v7.736a1 1 0 01-1.447.894L15 14" /><rect x="3" y="6" width="12" height="12" rx="2" ry="2" /></svg>
                      <span>Video de introduccion</span>
                    </div>
                    <div className="cfo-media-hint__item">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
                      <span>Video mensajes</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="cfo-footer">
                <button type="button" className="cfo-back-btn" onClick={goBack}><IconArrowLeft /></button>
                <button type="button" className="cfo-next-btn cfo-next-btn--final" onClick={goNext}>
                  Crear programa <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* ── Creating ──────────────────────────────────────── */}
          {step === 'creating' && (
            <div className="cfo-step cfo-step--center" key="creating">
              <div className="cfo-spinner" />
              <p className="cfo-status-text">{copy.creating}</p>
            </div>
          )}

          {/* ── Success ───────────────────────────────────────── */}
          {step === 'success' && (
            <div className="cfo-step cfo-step--center" key="success">
              <div className="cfo-check-wrap">
                <svg className="cfo-check-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle className="cfo-check-circle" cx="24" cy="24" r="22" stroke="rgba(74,222,128,0.8)" strokeWidth="2.5" />
                  <path className="cfo-check-path" d="M14 25l7 7 13-14" stroke="rgba(74,222,128,0.9)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="cfo-success-title">{copy.success}</h2>
              <p className="cfo-success-desc">{copy.successSub}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
