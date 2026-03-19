import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../utils/apiClient';
import profilePictureService from '../services/profilePictureService';
import { ASSET_BASE } from '../config/assets';
import './CreatorOnboardingScreen.css';

// ─── Step definitions ────────────────────────────────────────────
const STEPS = [
  'welcome',
  'profilePic',
  'discipline',
  'deliveryType',
  'clientRange',
  'howFound',
  'founderNote',
];

const TOTAL = STEPS.length;

// ─── Choice data ─────────────────────────────────────────────────
const DISCIPLINE_OPTIONS = [
  {
    value: 'training',
    label: 'Entrenamiento',
    sub: 'Programas de ejercicio, rutinas, fuerza, cardio',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M6 4v16M18 4v16M3 8h3M18 8h3M3 16h3M18 16h3M6 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    value: 'nutrition',
    label: 'Nutrición',
    sub: 'Planes alimenticios, recetas, hábitos',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10M12 2c2.5 0 5 5 5 10s-2.5 10-5 10M12 2C9.5 2 7 7 7 12s2.5 10 5 10M2 12h20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    value: 'both',
    label: 'Los dos',
    sub: 'Transformación completa, cuerpo y mente',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const DELIVERY_OPTIONS = [
  {
    value: 'low_ticket',
    label: 'Programas',
    sub: 'Cursos y programas grabados que los clientes compran',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    value: 'one_on_one',
    label: 'Uno a uno',
    sub: 'Acompañamiento personalizado a cada cliente',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    value: 'both',
    label: 'Los dos',
    sub: 'Una combinación de ambos modelos',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const CLIENT_RANGE_OPTIONS = [
  { value: 'none', label: 'Todavía no', sub: 'Estoy empezando' },
  { value: '1-5',  label: '1 – 5',     sub: 'Pequeño, muy personalizado' },
  { value: '6-15', label: '6 – 15',    sub: 'Equipo mediano' },
  { value: '16-30',label: '16 – 30',   sub: 'Operación sólida' },
  { value: '30+',  label: '30+',       sub: 'Gran escala' },
];

// ─── Component ───────────────────────────────────────────────────
const CreatorOnboardingScreen = () => {
  const navigate = useNavigate();
  const { user, refreshUserData } = useAuth();

  const [step, setStep]           = useState(0);
  const [animDir, setAnimDir]     = useState('forward');
  const [isAnimating, setIsAnimating] = useState(false);

  // Form data
  const [profilePic, setProfilePic]       = useState(null);
  const [profilePicPreview, setProfilePicPreview] = useState(null);
  const [isUploading, setIsUploading]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [discipline, setDiscipline]       = useState(null);
  const [deliveryType, setDeliveryType]   = useState(null);
  const [clientRange, setClientRange]     = useState(null);
  const [howFound, setHowFound]           = useState('');
  const [isCompleting, setIsCompleting]   = useState(false);
  const [error, setError]                 = useState(null);

  const fileInputRef = useRef(null);
  const contentRef   = useRef(null);

  // Derived
  const firstName = user?.displayName?.split(' ')[0] || null;

  // ── Navigation ────────────────────────────────────────────────
  const goToStep = useCallback((next, direction = 'forward') => {
    if (isAnimating) return;
    setAnimDir(direction);
    setIsAnimating(true);
    setError(null);
    // The CSS animation on the exiting element ends → then we swap step
    // We use a short timeout matching the exit anim duration (220ms)
    setTimeout(() => {
      setStep(next);
      setIsAnimating(false);
    }, 220);
  }, [isAnimating]);

  const next = useCallback(() => {
    if (step < TOTAL - 1) goToStep(step + 1, 'forward');
  }, [step, goToStep]);

  const back = useCallback(() => {
    if (step > 0) goToStep(step - 1, 'backward');
  }, [step, goToStep]);

  // ── Profile picture ───────────────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfilePic(file);
    const reader = new FileReader();
    reader.onloadend = () => setProfilePicPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setProfilePic(file);
    const reader = new FileReader();
    reader.onloadend = () => setProfilePicPreview(reader.result);
    reader.readAsDataURL(file);
  };

  // ── Advance from profile pic step ────────────────────────────
  const handleProfilePicNext = async () => {
    if (!profilePic) { next(); return; } // skip is fine
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      await profilePictureService.uploadProfilePicture(
        user.uid,
        profilePic,
        (p) => setUploadProgress(p),
      );
      next();
    } catch (err) {
      setError('No pudimos subir la foto. Puedes continuar sin ella por ahora.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // ── Complete onboarding ───────────────────────────────────────
  const handleComplete = async () => {
    if (!user) return;
    setIsCompleting(true);
    setError(null);
    try {
      await apiClient.patch('/users/me', {
        webOnboardingCompleted: true,
        creatorDiscipline:  discipline,
        creatorDeliveryType: deliveryType,
        creatorClientRange: clientRange,
        webOnboardingData: {
          completedAt:   new Date().toISOString(),
          howTheyFoundUs: howFound.trim() || null,
        },
      });
      await refreshUserData();
      navigate('/lab', { replace: true });
    } catch (err) {
      setError('Algo salió mal. Intenta de nuevo.');
      setIsCompleting(false);
    }
  };

  // ── Per-step CTA config ───────────────────────────────────────
  const getCTA = () => {
    const s = STEPS[step];
    switch (s) {
      case 'welcome':      return { label: 'Empezar',            disabled: false, onClick: next };
      case 'profilePic':   return { label: profilePic ? 'Subir y continuar' : 'Omitir por ahora', disabled: isUploading, onClick: handleProfilePicNext };
      case 'discipline':   return { label: 'Continuar',          disabled: !discipline, onClick: next };
      case 'deliveryType': return { label: 'Continuar',          disabled: !deliveryType, onClick: next };
      case 'clientRange':  return { label: 'Continuar',          disabled: !clientRange, onClick: next };
      case 'howFound':     return { label: 'Continuar',          disabled: false, onClick: next };
      case 'founderNote':  return { label: 'Entrar al dashboard', disabled: isCompleting, onClick: handleComplete };
      default:             return { label: 'Continuar', disabled: false, onClick: next };
    }
  };

  const cta = getCTA();
  const showBack = step > 0 && step < TOTAL - 1;
  const showProgress = step > 0 && step < TOTAL - 1;

  // ─── Render ───────────────────────────────────────────────────
  const renderStep = () => {
    const s = STEPS[step];

    if (s === 'welcome') {
      return (
        <div className="ob-step ob-step--welcome">
          <div className="ob-welcome-logo">
            <img
              src={`${ASSET_BASE}wake-logo-new.png`}
              alt="Wake"
              className="ob-welcome-logo-img"
              onError={(e) => { e.target.src = '/app_icon.png'; }}
            />
          </div>
          <div className="ob-welcome-text">
            <h1 className="ob-welcome-title">
              {firstName ? `Hola, ${firstName}.` : 'Bienvenido.'}
            </h1>
            <p className="ob-welcome-sub">
              Wake es tu espacio para gestionar tu negocio,<br/>
              crecer con tus clientes y enfocarte en lo que te importa.
            </p>
          </div>
        </div>
      );
    }

    if (s === 'profilePic') {
      return (
        <div className="ob-step ob-step--center">
          <div className="ob-step-label">Paso 1 de 5</div>
          <h2 className="ob-step-title">¿Tienes una foto que usas?</h2>
          <p className="ob-step-sub">Tu cara conecta con tus clientes. No es obligatoria.</p>

          <div
            className={`ob-avatar-zone ${profilePicPreview ? 'ob-avatar-zone--filled' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            aria-label="Subir foto de perfil"
          >
            {profilePicPreview ? (
              <img src={profilePicPreview} alt="Tu foto" className="ob-avatar-img" />
            ) : (
              <div className="ob-avatar-placeholder">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Haz clic o arrastra aquí</span>
              </div>
            )}
            {isUploading && (
              <div className="ob-avatar-progress">
                <div className="ob-avatar-progress-bar" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
        </div>
      );
    }

    if (s === 'discipline') {
      return (
        <div className="ob-step ob-step--choices">
          <div className="ob-step-label">Paso 2 de 5</div>
          <h2 className="ob-step-title">¿En qué eres experto?</h2>
          <p className="ob-step-sub">Esto define cómo organizamos tu espacio.</p>
          <div className="ob-choice-grid">
            {DISCIPLINE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`ob-choice-card ${discipline === opt.value ? 'ob-choice-card--selected' : ''}`}
                onClick={() => setDiscipline(opt.value)}
              >
                <span className="ob-choice-icon">{opt.icon}</span>
                <span className="ob-choice-label">{opt.label}</span>
                <span className="ob-choice-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (s === 'deliveryType') {
      return (
        <div className="ob-step ob-step--choices">
          <div className="ob-step-label">Paso 3 de 5</div>
          <h2 className="ob-step-title">¿Cómo llegas a tus clientes?</h2>
          <p className="ob-step-sub">Puedes cambiar esto más adelante.</p>
          <div className="ob-choice-grid">
            {DELIVERY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`ob-choice-card ${deliveryType === opt.value ? 'ob-choice-card--selected' : ''}`}
                onClick={() => setDeliveryType(opt.value)}
              >
                <span className="ob-choice-icon">{opt.icon}</span>
                <span className="ob-choice-label">{opt.label}</span>
                <span className="ob-choice-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (s === 'clientRange') {
      return (
        <div className="ob-step ob-step--range">
          <div className="ob-step-label">Paso 4 de 5</div>
          <h2 className="ob-step-title">¿Con cuántos clientes trabajas?</h2>
          <p className="ob-step-sub">Un número aproximado está bien.</p>
          <div className="ob-range-list">
            {CLIENT_RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`ob-range-item ${clientRange === opt.value ? 'ob-range-item--selected' : ''}`}
                onClick={() => setClientRange(opt.value)}
              >
                <span className="ob-range-label">{opt.label}</span>
                <span className="ob-range-sub">{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (s === 'howFound') {
      return (
        <div className="ob-step ob-step--center">
          <div className="ob-step-label">Paso 5 de 5</div>
          <h2 className="ob-step-title">¿Cómo nos encontraste?</h2>
          <p className="ob-step-sub">Nos ayuda a crecer como tú. Es opcional.</p>
          <textarea
            className="ob-textarea"
            placeholder="Instagram, un amigo, una búsqueda en Google..."
            value={howFound}
            onChange={(e) => setHowFound(e.target.value)}
            rows={4}
            maxLength={500}
          />
        </div>
      );
    }

    if (s === 'founderNote') {
      return (
        <div className="ob-step ob-step--founder">
          <div className="ob-founder-card">
            <p className="ob-founder-saludo">
              {firstName ? `${firstName},` : 'Hola,'}
            </p>
            <p className="ob-founder-body">
              Gracias por confiar en Wake.
            </p>
            <p className="ob-founder-body">
              Construimos esto porque vimos cómo coaches talentosos perdían horas en
              herramientas que no los entendían. Queremos que puedas enfocarte en tus clientes
              y en lo que te apasiona — el resto lo manejamos nosotros.
            </p>
            <p className="ob-founder-body">
              Si tienes algo que decirme, escríbeme directo. Leo todo.
            </p>
            <p className="ob-founder-firma">— Emilio</p>
            <a href="mailto:emilio@wake.fit" className="ob-founder-email">emilio@wake.fit</a>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="ob-root">
      {/* Background texture */}
      <div className="ob-bg" aria-hidden />

      {/* Back button */}
      {showBack && (
        <button className="ob-back" onClick={back} aria-label="Volver">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Progress bar */}
      {showProgress && (
        <div className="ob-progress-wrap" aria-label={`Paso ${step} de ${TOTAL - 2}`}>
          <div
            className="ob-progress-fill"
            style={{ width: `${((step) / (TOTAL - 2)) * 100}%` }}
          />
        </div>
      )}

      {/* Main content */}
      <div
        ref={contentRef}
        className={`ob-content ob-content--${isAnimating ? 'exit-' + animDir : 'enter-' + animDir}`}
        key={step}
      >
        {renderStep()}
      </div>

      {/* Error */}
      {error && (
        <div className="ob-error" role="alert">{error}</div>
      )}

      {/* CTA */}
      <div className="ob-actions">
        <button
          className={`ob-cta ${cta.disabled ? 'ob-cta--disabled' : ''}`}
          onClick={cta.onClick}
          disabled={cta.disabled}
        >
          {isUploading ? (
            <span className="ob-cta-uploading">
              <span className="ob-cta-dot" />
              Subiendo {Math.round(uploadProgress)}%
            </span>
          ) : isCompleting ? (
            <span className="ob-cta-uploading">
              <span className="ob-cta-dot" />
              Un momento…
            </span>
          ) : (
            cta.label
          )}
        </button>
      </div>
    </div>
  );
};

export default CreatorOnboardingScreen;
