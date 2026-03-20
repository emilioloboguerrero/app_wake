import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../utils/apiClient';
import profilePictureService from '../services/profilePictureService';
import { GlowingEffect } from '../components/ui';
import './CreatorOnboardingScreen.css';

// ─── Constants ──────────────────────────────────────────────────
const TOTAL_STEPS = 7;

const DISCIPLINE_OPTIONS = [
  {
    value: 'training',
    label: 'Entrenamiento',
    sub: 'Programas de ejercicio, rutinas, fuerza, cardio',
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
    sub: 'Planes alimenticios, recetas, hábitos',
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
    sub: 'Transformación completa, cuerpo y mente',
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
    label: 'Grupos',
    sub: 'Cursos y programas que múltiples clientes acceden',
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
    sub: 'Acompañamiento personalizado a cada cliente',
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
    sub: 'Una combinación de los dos modelos',
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
  const [stepKey,     setStepKey]     = useState(0);

  // Collected data
  const [collected, setCollected] = useState({
    creatorDiscipline:   null,
    creatorDeliveryType: null,
    creatorClientRange:  null,
    howTheyFoundUs:      '',
  });

  // Profile picture
  const [picPreview,  setPicPreview]  = useState(null);
  const [picFile,     setPicFile]     = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPct,   setUploadPct]   = useState(0);

  // Submission
  const [isCompleting, setIsCompleting] = useState(false);
  const [error,        setError]        = useState(null);

  const fileInputRef = useRef(null);
  const textareaRef  = useRef(null);
  const animTimerRef = useRef(null);

  useEffect(() => {
    return () => { if (animTimerRef.current) clearTimeout(animTimerRef.current); };
  }, []);

  // ── Navigation ────────────────────────────────────────────────
  const goToStep = useCallback((next, dir) => {
    if (isAnimating) return;
    setDirection(dir);
    setIsAnimating(true);
    setError(null);
    animTimerRef.current = setTimeout(() => {
      setStep(next);
      setStepKey(k => k + 1);
      setIsAnimating(false);
    }, 380);
  }, [isAnimating]);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) goToStep(step + 1, 'forward');
  }, [step, goToStep]);

  const goBack = useCallback(() => {
    if (step > 0) goToStep(step - 1, 'back');
  }, [step, goToStep]);

  // ── Profile picture ──────────────────────────────────────────
  const readFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setPicFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPicPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    readFile(e.dataTransfer?.files?.[0]);
  };

  const handleProfileNext = async () => {
    if (!picFile) { goNext(); return; }
    setIsUploading(true);
    setUploadPct(0);
    setError(null);
    try {
      await profilePictureService.uploadProfilePicture(user.uid, picFile, p => setUploadPct(p));
      goNext();
    } catch {
      setError('No pudimos subir la foto. Puedes continuar sin ella.');
    } finally {
      setIsUploading(false);
      setUploadPct(0);
    }
  };

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
  const showBack = step >= 1 && step <= 5;

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
            src="https://storage.googleapis.com/wolf-20b8b.appspot.com/app_resources/wake-logo-new.png"
            alt="Wake"
            className="ob-welcome-logo-img"
          />
        </div>
        <h1 className="ob-welcome-title">Tu negocio de fitness,<br />sin fricción.</h1>
        <p className="ob-welcome-sub">Configura tu espacio en menos de 2 minutos.</p>
        <button className="ob-cta ob-cta--primary" onClick={goNext}>
          Empecemos →
        </button>
      </div>
    </div>
  );

  // ── Step 1: Foto de perfil ───────────────────────────────────
  const StepProfilePic = () => (
    <div className="ob-step ob-step--center">
      <h2 className="ob-step-title">Tu foto de perfil</h2>
      <p className="ob-step-sub">Tu cara conecta con tus clientes. No es obligatoria.</p>

      <div className="ob-avatar-card">
        <GlowingEffect spread={28} borderWidth={1} />
        <div
          className={`ob-avatar-zone${picPreview ? ' ob-avatar-zone--filled' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Subir foto de perfil"
          onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
        >
          {picPreview ? (
            <img src={picPreview} alt="Tu foto de perfil" className="ob-avatar-img" />
          ) : (
            <div className="ob-avatar-placeholder" aria-hidden>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z"
                  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Haz clic o arrastra aquí</span>
            </div>
          )}
          {isUploading && (
            <div className="ob-avatar-progress" aria-hidden>
              <div className="ob-avatar-progress-bar" style={{ width: `${uploadPct}%` }} />
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={e => readFile(e.target.files?.[0])}
        style={{ display: 'none' }}
      />

      <button
        className={`ob-cta ob-cta--primary${isUploading ? ' ob-cta--loading' : ''}`}
        onClick={handleProfileNext}
        disabled={isUploading}
      >
        {isUploading
          ? <><span className="ob-spinner" aria-hidden /> Subiendo {Math.round(uploadPct)}%</>
          : 'Continuar →'}
      </button>
      <button className="ob-skip-link" onClick={goNext}>Agrégala después →</button>
    </div>
  );

  // ── Steps 2–3: Choice cards ──────────────────────────────────
  const StepChoiceCards = ({ title, sub, options, field }) => {
    const selected = collected[field];
    return (
      <div className="ob-step ob-step--center">
        <h2 className="ob-step-title">{title}</h2>
        {sub && <p className="ob-step-sub">{sub}</p>}
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
                <span className="ob-choice-text">
                  <span className="ob-choice-label">{opt.label}</span>
                  <span className="ob-choice-sub">{opt.sub}</span>
                </span>
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
        <p className="ob-step-sub">Un número aproximado está perfecto.</p>
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
      <p className="ob-step-sub">Es opcional. Nos ayuda a crecer como tú.</p>
      <textarea
        ref={textareaRef}
        className="ob-textarea"
        placeholder="Puedes ser breve — una frase está bien 😊"
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
      case 0: return <StepWelcome />;
      case 1: return <StepProfilePic />;
      case 2: return (
        <StepChoiceCards
          title="¿En qué te especializas?"
          sub="Esto define cómo organizamos tu espacio."
          options={DISCIPLINE_OPTIONS}
          field="creatorDiscipline"
        />
      );
      case 3: return (
        <StepChoiceCards
          title="¿Cómo trabajas con tus clientes?"
          sub="Puedes cambiar esto más adelante."
          options={DELIVERY_OPTIONS}
          field="creatorDeliveryType"
        />
      );
      case 4: return <StepClientRange />;
      case 5: return <StepHowFound />;
      case 6: return <StepFounderNote />;
      default: return null;
    }
  };

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="ob-root">
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
      <div className={stepPanelClass} key={stepKey}>
        {renderStep()}
      </div>

      {/* Global error toast (non-founder steps) */}
      {error && step !== 6 && (
        <div className="ob-error" role="alert">{error}</div>
      )}
    </div>
  );
};

export default CreatorOnboardingScreen;
