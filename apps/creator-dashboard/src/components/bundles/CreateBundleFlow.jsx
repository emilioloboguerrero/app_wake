import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../utils/apiClient';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import { useAuth } from '../../contexts/AuthContext';
import { useCreateBundle } from '../../hooks/useBundles';
import { useToast } from '../../contexts/ToastContext';
import { GlowingEffect } from '../ui';
import BundleCover from './BundleCover';
import '../CreateFlowOverlay.css';
import './CreateBundleFlow.css';

const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
);

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
);

const STEPS = ['name', 'courses', 'paymentType', 'price', 'creating', 'success'];
const QUESTION_COUNT = 4;

const formatCOP = (n) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return `$${n.toLocaleString('es-CO')} COP`;
};

export default function CreateBundleFlow({ isOpen, onClose, onCreated }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createMutation = useCreateBundle();

  const [step, setStep] = useState('name');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [showDesc, setShowDesc] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [paymentType, setPaymentType] = useState(null); // 'otp' | 'sub'
  const [priceInput, setPriceInput] = useState('');
  const nameInputRef = useRef(null);

  const { data: programs = [] } = useQuery({
    queryKey: user ? queryKeys.programs.byCreator(user.uid) : ['programs', 'none'],
    queryFn: () => apiClient.get('/creator/programs').then((r) => r.data),
    enabled: !!user?.uid && isOpen,
    ...cacheConfig.otherPrograms,
  });

  useEffect(() => {
    if (isOpen) {
      setStep('name');
      setTitle('');
      setDescription('');
      setShowDesc(false);
      setSelectedIds([]);
      setCourseSearch('');
      setPaymentType(null);
      setPriceInput('');
      setTimeout(() => nameInputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const stepIndex = STEPS.indexOf(step);
  const canClose = stepIndex < STEPS.indexOf('creating');

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape' && canClose) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, canClose, onClose]);

  const eligiblePrograms = useMemo(() => {
    return programs.filter((p) => p.deliveryType !== 'one_on_one');
  }, [programs]);

  const filteredPrograms = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    if (!q) return eligiblePrograms;
    return eligiblePrograms.filter((p) => (p.title || '').toLowerCase().includes(q));
  }, [eligiblePrograms, courseSearch]);

  const coverImages = useMemo(() => {
    return selectedIds
      .map((id) => programs.find((p) => p.id === id)?.imageUrl)
      .filter(Boolean);
  }, [selectedIds, programs]);

  const standaloneSum = useMemo(() => {
    return selectedIds.reduce((acc, id) => {
      const p = programs.find((x) => x.id === id);
      const price = Number(p?.price);
      return acc + (Number.isFinite(price) ? price : 0);
    }, 0);
  }, [selectedIds, programs]);

  const toggleCourse = useCallback((id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const parsePrice = (raw) => {
    if (raw === '' || raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const priceValue = parsePrice(priceInput);
  const hasValidPrice = priceValue !== null && paymentType !== null;

  const submit = useCallback(async () => {
    const pricing = {
      otp: paymentType === 'otp' ? priceValue : null,
      subscription: paymentType === 'sub' ? priceValue : null,
    };
    try {
      const created = await createMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        courseIds: selectedIds,
        pricing,
      });
      setStep('success');
      setTimeout(() => {
        onCreated?.(created.id);
        onClose();
        if (created?.id) navigate(`/bundles/${created.id}`);
      }, 1400);
    } catch (err) {
      showToast(err?.message || 'No pudimos crear el bundle.', 'error');
      setStep('price');
    }
  }, [paymentType, priceValue, title, description, selectedIds, createMutation, onCreated, onClose, navigate, showToast]);

  const goNext = useCallback(() => {
    if (step === 'name') {
      if (!title.trim()) return;
      setStep('courses');
    } else if (step === 'courses') {
      if (selectedIds.length < 2) return;
      setStep('paymentType');
    } else if (step === 'paymentType') {
      if (!paymentType) return;
      setStep('price');
    } else if (step === 'price') {
      if (!hasValidPrice) return;
      setStep('creating');
      submit();
    }
  }, [step, title, selectedIds, paymentType, hasValidPrice, submit]);

  const goBack = useCallback(() => {
    const i = STEPS.indexOf(step);
    if (i > 0 && STEPS[i - 1] !== 'creating') setStep(STEPS[i - 1]);
  }, [step]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && step === 'name' && title.trim()) {
      e.preventDefault();
      goNext();
    }
  }, [step, title, goNext]);

  if (!isOpen) return null;

  return (
    <div className="cfo-overlay" onClick={canClose ? onClose : undefined}>
      <div className="cfo-card" onClick={(e) => e.stopPropagation()}>
        <GlowingEffect spread={40} borderWidth={1} />

        <div className="cfo-topbar">
          {stepIndex >= 0 && stepIndex < QUESTION_COUNT ? (
            <div className="cfo-progress">
              <div className="cfo-progress__track">
                <div className="cfo-progress__fill" style={{ width: `${((stepIndex + 1) / QUESTION_COUNT) * 100}%` }} />
              </div>
              <span className="cfo-progress__label">{stepIndex + 1} / {QUESTION_COUNT}</span>
            </div>
          ) : <div />}
          {canClose && (
            <button type="button" className="cfo-close" onClick={onClose} aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <div className="cfo-body">
          {step === 'name' && (
            <div className="cfo-step" key="name">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">Nuevo bundle</h1>
                <p className="cfo-step__desc">Dale un nombre memorable.</p>
              </div>
              <div className="cfo-step__content">
                <input
                  ref={nameInputRef}
                  className="cfo-name-input"
                  type="text"
                  placeholder="Ej: Plan completo de fuerza"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={120}
                />
                {title.trim().length > 0 && !showDesc && (
                  <button type="button" className="cfo-link-btn" onClick={() => setShowDesc(true)}>
                    + Agregar descripcion
                  </button>
                )}
                {showDesc && (
                  <textarea
                    className="cfo-desc-input"
                    placeholder="Que incluye y para quien es..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    autoFocus
                  />
                )}
              </div>
              <div className="cfo-footer">
                <div />
                <button type="button" className="cfo-next-btn" onClick={goNext} disabled={!title.trim()}>
                  Siguiente <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {step === 'courses' && (
            <div className="cfo-step" key="courses">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">¿Qué programas incluye?</h1>
                <p className="cfo-step__desc">Elige al menos 2. La portada se arma sola con sus imágenes.</p>
              </div>
              <div className="cfo-step__content">
                {eligiblePrograms.length === 0 ? (
                  <div className="cbf-empty-cta">
                    <p>
                      Necesitas al menos un programa grupal antes de crear un bundle.
                    </p>
                    <button
                      type="button"
                      className="cfo-next-btn"
                      onClick={() => { onClose(); navigate('/programas'); }}
                    >
                      Ir a Programas <IconArrowRight />
                    </button>
                  </div>
                ) : (
                  <>
                    {selectedIds.length > 0 && (
                      <div className="cbf-preview">
                        <BundleCover imageUrls={coverImages} size="card" />
                        <span className="cbf-preview__count">
                          {selectedIds.length} {selectedIds.length === 1 ? 'programa' : 'programas'} seleccionados
                        </span>
                      </div>
                    )}
                    <input
                      type="text"
                      className="cfo-name-input cbf-search"
                      placeholder="Buscar por nombre"
                      value={courseSearch}
                      onChange={(e) => setCourseSearch(e.target.value)}
                    />
                    <div className="cbf-course-list">
                      {filteredPrograms.map((p) => {
                        const checked = selectedIds.includes(p.id);
                        const bundleOnly = p.bundleOnly ?? (p.visibility === 'bundle-only');
                        const isDraft = p.status !== 'published' && p.status !== 'publicado';
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className={`cbf-course-row ${checked ? 'is-selected' : ''}`}
                            onClick={() => toggleCourse(p.id)}
                          >
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt="" className="cbf-course-thumb" />
                            ) : (
                              <div className="cbf-course-thumb cbf-course-thumb--placeholder" />
                            )}
                            <div className="cbf-course-meta">
                              <span className="cbf-course-title">{p.title || 'Sin nombre'}</span>
                              <div className="cbf-course-chips">
                                {isDraft && !bundleOnly && (
                                  <span className="cbf-course-badge cbf-course-badge--draft">Borrador</span>
                                )}
                                {bundleOnly && (
                                  <span className="cbf-course-badge cbf-course-badge--bundle-only">Solo bundles</span>
                                )}
                              </div>
                            </div>
                            <span className={`cfo-check-toggle ${checked ? 'cfo-check-toggle--on' : ''}`}>
                              {checked && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                              )}
                            </span>
                          </button>
                        );
                      })}
                      {filteredPrograms.length === 0 && (
                        <p className="cbf-empty-note">Ningún programa coincide con "{courseSearch}".</p>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="cfo-footer">
                <button type="button" className="cfo-back-btn" onClick={goBack}><IconArrowLeft /></button>
                <button type="button" className="cfo-next-btn" onClick={goNext} disabled={selectedIds.length < 2}>
                  Siguiente <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {step === 'paymentType' && (
            <div className="cfo-step" key="paymentType">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">¿Cómo se cobra?</h1>
                <p className="cfo-step__desc">
                  Elige un tipo para empezar. Puedes añadir el otro más adelante desde la pantalla del bundle.
                </p>
              </div>
              <div className="cfo-step__content">
                <div className="cfo-choice">
                  <button
                    type="button"
                    className={`cfo-choice-card ${paymentType === 'otp' ? 'cfo-choice-card--active' : ''}`}
                    onClick={() => setPaymentType('otp')}
                  >
                    <span className="cfo-choice-card__icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                        <path d="M1 10h22" />
                      </svg>
                    </span>
                    <span className="cfo-choice-card__text">
                      <span className="cfo-choice-card__label">Pago único</span>
                      <span className="cfo-choice-card__desc">Un solo cobro · acceso por 1 año</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`cfo-choice-card ${paymentType === 'sub' ? 'cfo-choice-card--active' : ''}`}
                    onClick={() => setPaymentType('sub')}
                  >
                    <span className="cfo-choice-card__icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 1l4 4-4 4" />
                        <path d="M3 11V9a4 4 0 014-4h14" />
                        <path d="M7 23l-4-4 4-4" />
                        <path d="M21 13v2a4 4 0 01-4 4H3" />
                      </svg>
                    </span>
                    <span className="cfo-choice-card__text">
                      <span className="cfo-choice-card__label">Suscripción mensual</span>
                      <span className="cfo-choice-card__desc">Cobro recurrente cada mes</span>
                    </span>
                  </button>
                </div>
              </div>
              <div className="cfo-footer">
                <button type="button" className="cfo-back-btn" onClick={goBack}><IconArrowLeft /></button>
                <button type="button" className="cfo-next-btn" onClick={goNext} disabled={!paymentType}>
                  Siguiente <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {step === 'price' && (
            <div className="cfo-step" key="price">
              <div className="cfo-step__header">
                <h1 className="cfo-step__title">
                  {paymentType === 'otp' ? 'Precio del pago único' : 'Precio mensual'}
                </h1>
                <p className="cfo-step__desc">
                  {paymentType === 'otp' ?
                    'Un solo cobro. El comprador tendrá acceso durante 1 año.' :
                    'Cobro recurrente cada mes mientras la suscripción esté activa.'}
                </p>
              </div>
              <div className="cfo-step__content">
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="1000"
                  className="cfo-name-input"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && hasValidPrice) { e.preventDefault(); goNext(); }
                  }}
                  placeholder={paymentType === 'otp' ? 'Ej: 180000' : 'Ej: 30000'}
                />
                <span className="cbf-hint">
                  En pesos colombianos (COP){paymentType === 'sub' ? ' al mes' : ''}.
                </span>
                {paymentType === 'otp' && standaloneSum > 0 && (
                  <span className="cbf-hint">
                    Suma individual de los programas: {formatCOP(standaloneSum)}
                  </span>
                )}
              </div>
              <div className="cfo-footer">
                <button type="button" className="cfo-back-btn" onClick={goBack}><IconArrowLeft /></button>
                <button type="button" className="cfo-next-btn cfo-next-btn--final" onClick={goNext} disabled={!hasValidPrice}>
                  Crear bundle <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {step === 'creating' && (
            <div className="cfo-step cfo-step--center" key="creating">
              <div className="cfo-spinner" />
              <p className="cfo-status-text">Creando bundle</p>
            </div>
          )}

          {step === 'success' && (
            <div className="cfo-step cfo-step--center" key="success">
              <div className="cfo-check-wrap">
                <svg className="cfo-check-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle className="cfo-check-circle" cx="24" cy="24" r="22" stroke="rgba(74,222,128,0.8)" strokeWidth="2.5" />
                  <path className="cfo-check-path" d="M14 25l7 7 13-14" stroke="rgba(74,222,128,0.9)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="cfo-success-title">Bundle creado</h2>
              <p className="cfo-success-desc">Ajusta los detalles en la siguiente pantalla.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
