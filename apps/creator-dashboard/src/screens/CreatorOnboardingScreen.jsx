import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../utils/apiClient';
import { GlowingEffect } from '../components/ui';
import { ASSET_BASE } from '../config/assets';
import './CreatorOnboardingScreen.css';

// ─── Constants ──────────────────────────────────────────────────
const TOTAL_STEPS = 6;

// Horizontal winding path for the background progress line
const PATH_D =
  'M 0,450 C 120,450 180,250 330,250 C 480,250 540,550 690,550 C 840,550 900,300 1050,300 C 1200,300 1260,500 1400,500';

const easeStandard = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const DISCIPLINE_OPTIONS = [
  {
    value: 'training',
    label: 'Entrenamiento',

    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    value: 'nutrition',
    label: 'Nutrición',

    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10M12 2c2.5 0 5 5 5 10s-2.5 10-5 10M12 2C9.5 2 7 7 7 12s2.5 10 5 10M2 12h20"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    value: 'both',
    label: 'Ambos',

    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const DELIVERY_OPTIONS = [
  {
    value: 'groups',
    label: 'Programas generales',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    value: 'one_on_one',
    label: 'Uno a uno',

    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    value: 'both',
    label: 'Ambos',

    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const CLIENT_RANGE_OPTIONS = [
  { value: '0',    label: '0' },
  { value: '1-5',  label: '1–5' },
  { value: '6-20', label: '6–20' },
  { value: '20+',  label: '20+' },
];

// ─── Component ──────────────────────────────────────────────────
const CreatorOnboardingScreen = () => {
  const navigate = useNavigate();
  const { user, refreshUserData } = useAuth();

  // Step / transition
  const [step,        setStep]        = useState(0);
  const [direction,   setDirection]   = useState('forward');
  const [isAnimating, setIsAnimating] = useState(false);

  // Collected data
  const [collected, setCollected] = useState({
    creatorDiscipline:   null,
    creatorDeliveryType: null,
    creatorClientRange:  null,
    howTheyFoundUs:      '',
  });

  // Submission
  const [isCompleting, setIsCompleting] = useState(false);
  const [error,        setError]        = useState(null);

  // SVG progress path
  const progressPathRef = useRef(null);
  const [pathLength, setPathLength] = useState(0);
  const [tipPoint, setTipPoint] = useState({ x: 0, y: 450 });
  const animTipRef = useRef(null);

  const textareaRef  = useRef(null);
  const animTimerRef = useRef(null);

  // Measure SVG path on mount
  useEffect(() => {
    if (progressPathRef.current) {
      const len = progressPathRef.current.getTotalLength();
      setPathLength(len);
    }
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      if (animTipRef.current) cancelAnimationFrame(animTipRef.current);
    };
  }, []);

  // ── Tip animation ────────────────────────────────────────────
  const animateTip = useCallback((fromStep, toStep) => {
    if (animTipRef.current) cancelAnimationFrame(animTipRef.current);
    if (!progressPathRef.current || !pathLength) return;
    const startTime = performance.now();
    const duration = 700;
    const tick = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = easeStandard(t);
      const currentStep = fromStep + (toStep - fromStep) * eased;
      const drawn = pathLength * (currentStep / TOTAL_STEPS);
      try {
        const pt = progressPathRef.current.getPointAtLength(drawn);
        setTipPoint({ x: pt.x, y: pt.y });
      } catch (_) { /* path not ready */ }
      if (t < 1) animTipRef.current = requestAnimationFrame(tick);
    };
    animTipRef.current = requestAnimationFrame(tick);
  }, [pathLength]);

  // ── Navigation ────────────────────────────────────────────────
  const goToStep = useCallback((next, dir) => {
    if (isAnimating) return;
    setDirection(dir);
    setIsAnimating(true);
    setError(null);
    animateTip(step, next);
    animTimerRef.current = setTimeout(() => {
      setStep(next);
      setIsAnimating(false);
    }, 380);
  }, [isAnimating, step, animateTip]);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) goToStep(step + 1, 'forward');
  }, [step, goToStep]);

  const goBack = useCallback(() => {
    if (step > 0) goToStep(step - 1, 'back');
  }, [step, goToStep]);

  // ── Complete ─────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!user || isCompleting) return;
    setIsCompleting(true);
    setError(null);
    try {
      await apiClient.patch('/users/me', {
        ...collected,
        creatorOnboardingData: { ...collected, completedAt: new Date().toISOString() },
        webOnboardingCompleted: true,
      });
      await refreshUserData();
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Algo salió mal. Intenta de nuevo.');
      setIsCompleting(false);
    }
  };

  // ── Textarea auto-resize ─────────────────────────────────────
  const handleTextareaInput = (e) => {
    setCollected(c => ({ ...c, howTheyFoundUs: e.target.value }));
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  // ── Derived ──────────────────────────────────────────────────
  const showBack = step >= 1 && step <= 4;

  const stepPanelClass = `ob-step-panel ${isAnimating
    ? `ob-step-panel--exit-${direction}`
    : `ob-step-panel--enter-${direction}`}`;

  // ── Step 0: Bienvenida ───────────────────────────────────────
  const StepWelcome = () => (
    <div className="ob-step ob-step--welcome">
      <div className="ob-welcome-orbs" aria-hidden>
        <div className="ob-orb ob-orb--1" />
        <div className="ob-orb ob-orb--2" />
        <div className="ob-orb ob-orb--3" />
      </div>
      <div className="ob-welcome-inner">
        <div className="ob-welcome-logo">
          <img
            src={`${ASSET_BASE}wake-logo-new.png`}
            alt="Wake"
            className="ob-welcome-logo-img"
          />
        </div>
        <h1 className="ob-welcome-title">Qué bacano tenerte acá.</h1>
        <button className="ob-cta ob-cta--primary" onClick={goNext}>
          Empecemos →
        </button>
      </div>
    </div>
  );

  // ── Steps 1–2: Choice cards ──────────────────────────────────
  const StepChoiceCards = ({ title, options, field }) => {
    const selected = collected[field];
    return (
      <div className="ob-step ob-step--center">
        <h2 className="ob-step-title">{title}</h2>
        <div className="ob-choice-grid">
          {options.map((opt, i) => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                className={`ob-choice-card${isSelected ? ' ob-choice-card--selected' : ''}`}
                onClick={() => setCollected(c => ({ ...c, [field]: opt.value }))}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <GlowingEffect disabled={!isSelected} spread={24} borderWidth={1} />
                <span className="ob-choice-icon">{opt.icon}</span>
                <span className="ob-choice-label">{opt.label}</span>
                {isSelected && (
                  <span className="ob-choice-check" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.8"
                        strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          className={`ob-cta ob-cta--primary${!selected ? ' ob-cta--disabled' : ''}`}
          onClick={goNext}
          disabled={!selected}
        >
          Continuar →
        </button>
      </div>
    );
  };

  // ── Step 4: Client range chips ───────────────────────────────
  const StepClientRange = () => {
    const selected = collected.creatorClientRange;
    return (
      <div className="ob-step ob-step--center">
        <h2 className="ob-step-title">¿Cuántos clientes tienes ahora?</h2>
        <div className="ob-chip-row">
          {CLIENT_RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`ob-chip${selected === opt.value ? ' ob-chip--selected' : ''}`}
              onClick={() => setCollected(c => ({ ...c, creatorClientRange: opt.value }))}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          className={`ob-cta ob-cta--primary${!selected ? ' ob-cta--disabled' : ''}`}
          onClick={goNext}
          disabled={!selected}
        >
          Continuar →
        </button>
      </div>
    );
  };

  // ── Step 5: How they found us ────────────────────────────────
  const StepHowFound = () => (
    <div className="ob-step ob-step--center">
      <h2 className="ob-step-title">¿Cómo llegaste a Wake?</h2>
      <textarea
        ref={textareaRef}
        className="ob-textarea"
        placeholder="Puedes ser breve — una frase está bien"
        value={collected.howTheyFoundUs}
        onInput={handleTextareaInput}
        onChange={handleTextareaInput}
        rows={3}
        maxLength={500}
      />
      <button className="ob-cta ob-cta--primary" onClick={goNext}>
        Continuar →
      </button>
    </div>
  );

  // ── Step 6: Founder note ─────────────────────────────────────
  const StepFounderNote = () => (
    <div className="ob-step ob-step--center ob-step--founder">
      <div className="ob-founder-card">
        <GlowingEffect spread={30} borderWidth={1} />
        <p className="ob-founder-quote">
          "Hola. Construí Wake porque los mejores entrenadores merecen herramientas que estén a su altura. Gracias por estar aquí."
        </p>
        <div className="ob-founder-sig">
          {/* TODO: Replace with actual handwritten signature image */}
          <span className="ob-founder-name">Emilio</span>
          <a href="mailto:hola@wake.co" className="ob-founder-email">hola@wake.co</a>
        </div>
      </div>
      <button
        className={`ob-cta ob-cta--primary${isCompleting ? ' ob-cta--loading' : ''}`}
        onClick={handleComplete}
        disabled={isCompleting}
      >
        {isCompleting
          ? <><span className="ob-spinner" aria-hidden /> Un momento…</>
          : 'Entrar al dashboard →'}
      </button>
      {error && <p className="ob-inline-error">{error}</p>}
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 0: return StepWelcome();
      case 1: return StepChoiceCards({
        title: '¿En qué te especializas?',
        options: DISCIPLINE_OPTIONS,
        field: 'creatorDiscipline',
      });
      case 2: return StepChoiceCards({
        title: '¿Cómo trabajas con tus clientes?',
        options: DELIVERY_OPTIONS,
        field: 'creatorDeliveryType',
      });
      case 3: return StepClientRange();
      case 4: return StepHowFound();
      case 5: return StepFounderNote();
      default: return null;
    }
  };

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="ob-root">
      {/* SVG winding progress line */}
      <svg
        className="ob-svg-track"
        viewBox="0 0 1400 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <path d={PATH_D} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" strokeLinecap="round" />
        <path
          ref={progressPathRef}
          d={PATH_D}
          fill="none"
          stroke={step >= TOTAL_STEPS - 1 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.25)'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={pathLength}
          strokeDashoffset={pathLength > 0 ? pathLength - pathLength * (step / TOTAL_STEPS) : pathLength}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1), stroke 600ms ease' }}
        />
        {step > 0 && pathLength > 0 && (
          <>
            <circle cx={tipPoint.x} cy={tipPoint.y} r="8" fill="rgba(255,255,255,0.08)" />
            <circle cx={tipPoint.x} cy={tipPoint.y} r="3" fill="rgba(255,255,255,0.6)" />
          </>
        )}
      </svg>

      {/* Top bar: back + progress dots */}
      <div className="ob-topbar">
        {showBack && (
          <button className="ob-back" onClick={goBack} aria-label="Volver">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M19 12H5M12 5l-7 7 7 7"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}

        <div className="ob-dots" role="progressbar" aria-valuenow={step} aria-valuemin={0} aria-valuemax={6}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => {
            const isCurrent   = step === i;
            const isCompleted = step > i;
            return (
              <span
                key={i}
                className={`ob-dot${isCompleted ? ' ob-dot--done' : ''}${isCurrent ? ' ob-dot--current' : ''}`}
              />
            );
          })}
        </div>
      </div>

      {/* Step panel — absolutely positioned for slide transitions */}
      <div className={stepPanelClass} key={step}>
        {renderStep()}
      </div>

      {/* Global error toast (non-founder steps) */}
      {error && step !== 6 && step !== 1 && (
        <div className="ob-error" role="alert">{error}</div>
      )}
    </div>
  );
};

export default CreatorOnboardingScreen;
