import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import apiClient from '../utils/apiClient';
import heroLogoSrc from '../assets/hero-logo.svg';
import wakeLogotypeSrc from '../assets/Logotipo-WAKE-positivo.svg';
import './EventSignupScreen.css';

// ─── Wake Loader ──────────────────────────────────────────────────
const LOADER_DURATION = 2700;
const LOADER_KEY_TIME = 0.72;
let _loaderUid = 0;

function WakeLoader({ size = 64 }) {
  const uid = useRef(++_loaderUid).current;
  const gradId = `wl-g-${uid}`;
  const maskId = `wl-m-${uid}`;
  const svgRef = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const grad = svg.querySelector(`#${gradId}`);
    if (!grad) return;
    let raf;
    const start = performance.now();
    const tick = () => {
      const t = ((performance.now() - start) % LOADER_DURATION) / LOADER_DURATION;
      const x = t <= LOADER_KEY_TIME ? -30 + (140 * t) / LOADER_KEY_TIME : -30;
      grad.setAttribute('gradientTransform', `translate(${x}, 0)`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gradId]);

  return (
    <svg ref={svgRef} width={size} height={size} viewBox="0 0 80 80">
      <defs>
        <mask id={maskId}>
          <image href={heroLogoSrc} x="0" y="0" width="80" height="80" />
        </mask>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="-20" y1="0" x2="20" y2="0" gradientTransform="translate(-30, 0)">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="50%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <image href={heroLogoSrc} x="0" y="0" width="80" height="80" opacity="0.18" />
      <rect x="0" y="0" width="80" height="80" fill={`url(#${gradId})`} mask={`url(#${maskId})`} />
    </svg>
  );
}

// ─── Curved progress line (same as PWA onboarding) ────────────────
const PROGRESS_PATH = 'M 70,0 C 70,85 295,110 265,215 C 235,320 38,355 60,455 C 82,555 305,585 272,680 C 239,775 42,810 68,875 C 82,920 185,910 185,910';

function ProgressLine({ step, totalSteps }) {
  const pathRef = useRef(null);
  const [pathLen, setPathLen] = useState(0);
  const tipAnimRef = useRef({ x: 70, y: 0, rafId: null });
  const [tip, setTip] = useState({ x: 70, y: 0 });
  const prevStepRef = useRef(step);

  useEffect(() => {
    if (!pathRef.current) return;
    const len = pathRef.current.getTotalLength();
    setPathLen(len);
    const frac = Math.min((step + 1) / totalSteps, 1);
    const p = pathRef.current.getPointAtLength(len * frac);
    tipAnimRef.current.x = p.x;
    tipAnimRef.current.y = p.y;
    setTip({ x: p.x, y: p.y });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pathRef.current || pathLen === 0) return;
    const anim = tipAnimRef.current;
    const fromX = anim.x;
    const fromY = anim.y;
    const toFrac = Math.min((step + 1) / totalSteps, 1);
    const toP = pathRef.current.getPointAtLength(pathLen * toFrac);
    prevStepRef.current = step;

    if (anim.rafId) cancelAnimationFrame(anim.rafId);
    const DURATION = 700;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / DURATION, 1);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const x = fromX + (toP.x - fromX) * e;
      const y = fromY + (toP.y - fromY) * e;
      anim.x = x; anim.y = y;
      setTip({ x, y });
      if (t < 1) anim.rafId = requestAnimationFrame(tick);
    };
    anim.rafId = requestAnimationFrame(tick);
    return () => { if (anim.rafId) cancelAnimationFrame(anim.rafId); };
  }, [step, pathLen, totalSteps]);

  const frac = Math.min((step + 1) / totalSteps, 1);
  const dashOffset = pathLen > 0 ? pathLen * (1 - frac) : 0;

  return (
    <svg className="es-progress-line" viewBox="0 0 390 900" preserveAspectRatio="none">
      {/* Track */}
      <path d={PROGRESS_PATH} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Active fill */}
      <path
        ref={pathRef}
        d={PROGRESS_PATH}
        fill="none"
        stroke="rgba(255,255,255,0.32)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={pathLen || 1}
        strokeDashoffset={pathLen > 0 ? dashOffset : pathLen || 1}
        style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1)' }}
      />
      {/* Glowing tip */}
      {pathLen > 0 && (
        <>
          <circle cx={tip.x} cy={tip.y} r="10" fill="rgba(255,255,255,0.06)" />
          <circle cx={tip.x} cy={tip.y} r="5" fill="rgba(255,255,255,0.12)" />
          <circle cx={tip.x} cy={tip.y} r="2.8" fill="rgba(255,255,255,0.72)" />
        </>
      )}
    </svg>
  );
}

// ─── Ambient orbs ─────────────────────────────────────────────────
function AmbientOrbs() {
  return (
    <div className="es-orbs" aria-hidden="true">
      <div className="es-orb es-orb-1" />
      <div className="es-orb es-orb-2" />
      <div className="es-orb es-orb-3" />
    </div>
  );
}

// ─── Step icons ───────────────────────────────────────────────────
const STEP_ICONS = [
  // nombre – person
  <svg key="p" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.866 3.582-7 8-7s8 3.134 8 7" />
  </svg>,
  // email – envelope
  <svg key="e" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 4 10 9 10-9" />
  </svg>,
  // telefono – phone
  <svg key="t" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
  </svg>,
  // edad – cake/star
  <svg key="a" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="10" width="20" height="12" rx="2" /><path d="M7 10V7a5 5 0 0110 0v3" /><path d="M12 2v3" /><circle cx="12" cy="5" r="1" />
  </svg>,
  // genero – sparkle
  <svg key="g" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.636 5.636l2.121 2.121M16.243 16.243l2.121 2.121M5.636 18.364l2.121-2.121M16.243 7.757l2.121-2.121" />
  </svg>,
];

// ─── V1 hard-coded steps (fallback when event has no fields) ──────
const V1_STEPS = [
  { field: 'nombre',   question: '¿Cómo te llamas?',               type: 'text',   placeholder: 'Tu nombre completo', autoComplete: 'name' },
  { field: 'email',    question: '¿Cuál es tu email?',              type: 'email',  placeholder: 'nombre@email.com',   autoComplete: 'email' },
  { field: 'telefono', question: '¿Cuál es tu teléfono?',           type: 'tel',    placeholder: '+57 300 000 0000',   autoComplete: 'tel' },
  { field: 'edad',     question: '¿Cuántos años tienes?',           type: 'number', placeholder: '25',                 autoComplete: 'off' },
  { field: 'genero',   question: '¿Con qué género te identificas?', type: 'choice', options: ['Masculino', 'Femenino', 'Prefiero no decir'] },
];
const V1_INITIAL_FORM = { nombre: '', email: '', telefono: '', edad: '', genero: '' };

// Build steps from V2 event.fields array
const DEFAULT_PLACEHOLDERS = {
  f_nombre:   'Tu nombre completo',
  f_email:    'correo@ejemplo.com',
  f_telefono: '+57 300 000 0000',
  f_edad:     '25',
};

function buildStepsFromFields(fields) {
  return fields.map(f => ({
    field: f.fieldId ?? f.id,
    question: f.fieldName ?? f.label,
    type: (f.type === 'select' || f.type === 'radio') ? 'choice'
        : f.type === 'multiselect' ? 'multiselect'
        : f.type,
    placeholder: f.placeholder || DEFAULT_PLACEHOLDERS[f.fieldId ?? f.id] || '',
    autoComplete: 'off',
    required: Boolean(f.required),
    options: f.options || [],
  }));
}

function buildInitialForm(steps) {
  const form = {};
  steps.forEach(s => { form[s.field] = s.type === 'multiselect' ? [] : ''; });
  return form;
}

function relativeLuminance(r, g, b) {
  return [r, g, b]
    .map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
}

function formatEventDateLong(ts) {
  if (!ts) return null;
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Flier Card ───────────────────────────────────────────────────
function FlierCard({ event, flipped, onFlip, hasImage }) {
  const dateStr = formatEventDateLong(event?.date);
  const hasDetails = Boolean(dateStr || event?.location || event?.description);
  const canFlip = hasDetails;

  return (
    <div
      className={`es-flier-card${!canFlip ? ' es-flier-card--no-flip' : ''}${flipped ? ' es-flier-card--flipped' : ''}`}
      onClick={canFlip ? onFlip : undefined}
      role={canFlip ? 'button' : undefined}
      aria-label={canFlip ? (flipped ? 'Ver imagen' : 'Ver detalles del evento') : undefined}
    >
      <div className="es-flier-card-inner">

        {/* ── Front ── */}
        <div className="es-flier-card-front">
          {hasImage ? (
            <>
              <img src={event.imageUrl} alt={event.title} className="es-flier-card-img" />
              <div className="es-flier-card-front-overlay" />
              {canFlip && (
                <button
                  className="es-flier-card-flip-btn"
                  onClick={e => { e.stopPropagation(); onFlip(); }}
                  aria-label="Ver detalles"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8" />
                    <path d="M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16" />
                  </svg>
                </button>
              )}
            </>
          ) : (
            <div className="es-flier-card-no-img">
              {canFlip && (
                <button
                  className="es-flier-card-flip-btn"
                  onClick={e => { e.stopPropagation(); onFlip(); }}
                  aria-label="Ver detalles"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8" />
                    <path d="M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16" />
                  </svg>
                </button>
              )}
              <div className="es-flier-card-no-img-lines" aria-hidden="true">
                <div /><div /><div />
              </div>
              <h2 className="es-flier-card-no-img-title">{event?.title}</h2>
            </div>
          )}
        </div>

        {/* ── Back ── */}
        {hasDetails && (
          <div className="es-flier-card-back">
            <button
              className="es-flier-card-flip-btn"
              onClick={e => { e.stopPropagation(); onFlip(); }}
              aria-label="Volver"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8" />
                <path d="M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16" />
              </svg>
            </button>
            <div className="es-flier-card-back-content">
              <h2 className="es-flier-card-back-title">{event?.title}</h2>
              {dateStr && (
                <div className="es-flier-card-detail">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>{dateStr}</span>
                </div>
              )}
              {event?.location && (
                <div className="es-flier-card-detail">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>{event.location}</span>
                </div>
              )}
              {event?.description && (
                <p className="es-flier-card-desc">{event.description}</p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────
export default function EventSignupScreen() {
  const { eventId } = useParams();
  // phase: loading | gate | hero | form | submitting | success | not_found | closed | full | waitlist | waitlist_success
  const [phase, setPhase] = useState('loading');
  const [event, setEvent] = useState(null);
  const [steps, setSteps] = useState(V1_STEPS);
  const [isV2, setIsV2] = useState(false);
  const [form, setForm] = useState(V1_INITIAL_FORM);
  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const [direction, setDirection] = useState('forward');
  const [error, setError] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [accentRgb, setAccentRgb] = useState([255, 255, 255]);
  const [accentIsDark, setAccentIsDark] = useState(true);
  const [copied, setCopied] = useState(false);
  const [checkInToken, setCheckInToken] = useState(null);
  const [waitlistContact, setWaitlistContact] = useState('');
  const [waitlistError, setWaitlistError] = useState(null);
  const [cardFlipped, setCardFlipped] = useState(false);
  const inputRef = useRef(null);

  const accentCss = `rgb(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]})`;
  const accentTextCss = accentIsDark ? '#111111' : '#ffffff';
  const cssVars = {
    '--accent': accentCss,
    '--accent-r': accentRgb[0],
    '--accent-g': accentRgb[1],
    '--accent-b': accentRgb[2],
    '--accent-text': accentTextCss,
  };

  // Auth state — needed for wakeUsersOnly gating
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setAuthUser(u); setAuthReady(true); });
    return unsub;
  }, []);

  // Auto-advance from gate once auth resolves and user is signed in
  useEffect(() => {
    if (phase === 'gate' && authReady && authUser) setPhase('hero');
  }, [phase, authReady, authUser]);

  // Load event
  useEffect(() => {
    apiClient.get(`/events/${eventId}`)
      .then(({ data }) => {
        if (data.status === 'closed') { setEvent(data); setPhase('closed'); return; }
        if (data.maxRegistrations != null && data.spotsRemaining === 0) {
          setEvent(data); setPhase('full'); return;
        }
        if (data.fields && data.fields.length > 0) {
          const dynSteps = buildStepsFromFields(data.fields);
          setSteps(dynSteps);
          setForm(buildInitialForm(dynSteps));
          setIsV2(true);
        }
        setEvent(data);
        setTimeout(() => setPhase(data.wakeUsersOnly ? 'gate' : 'hero'), 1400);
      })
      .catch(() => setPhase('not_found'));
  }, [eventId]);

  // Color extraction — canvas-based, no library needed
  useEffect(() => {
    if (!event?.imageUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let bestR = 255, bestG = 255, bestB = 255, bestScore = -1;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (max < 40 || max > 245) continue;
          const sat = max === 0 ? 0 : (max - min) / max;
          const score = sat * (max / 255);
          if (score > bestScore) { bestScore = score; bestR = r; bestG = g; bestB = b; }
        }
        const lum = relativeLuminance(bestR, bestG, bestB);
        setAccentRgb([bestR, bestG, bestB]);
        setAccentIsDark(lum > 0.35);
      } catch (e) {
        console.error('[EventSignup] color extraction failed', e);
      }
    };
    img.src = event.imageUrl;
  }, [event?.imageUrl]);

  // Focus input on step change or waitlist
  useEffect(() => {
    if (phase !== 'form' && phase !== 'waitlist') return;
    const t = setTimeout(() => inputRef.current?.focus(), 420);
    return () => clearTimeout(t);
  }, [phase, step]);

  // ── Navigation ──────────────────────────────────────────────────
  function startForm() {
    setStep(0); setStepKey(0); setDirection('forward'); setError(null);
    setCardFlipped(false);
    setPhase('form');
  }

  function goBack() {
    if (step === 0) { setPhase('hero'); return; }
    setDirection('back'); setError(null);
    setStep(s => s - 1); setStepKey(k => k + 1);
  }

  // ── Validation ──────────────────────────────────────────────────
  function validateCurrent() {
    const s = steps[step];
    const val = form[s.field];
    if (s.type === 'multiselect') {
      if (s.required && (!Array.isArray(val) || val.length === 0)) {
        setError('Selecciona al menos una opción'); return false;
      }
      return true;
    }
    const str = String(val ?? '').trim();
    if (s.required !== false && !str) { setError('Este campo es obligatorio'); return false; }
    if (s.type === 'email' && str && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
      setError('Ingresa un email válido'); return false;
    }
    if (s.type === 'number' && str && (Number(str) < 1 || Number(str) > 99)) {
      setError('Ingresa una edad válida'); return false;
    }
    return true;
  }

  function advance() {
    if (!validateCurrent()) return;
    if (step < steps.length - 1) {
      setDirection('forward'); setError(null);
      setStep(s => s + 1); setStepKey(k => k + 1);
    } else {
      submitForm(form);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); advance(); }
  }

  function selectChoice(val) {
    const s = steps[step];
    const next = { ...form, [s.field]: val };
    setForm(next);
    if (step < steps.length - 1) {
      setDirection('forward'); setError(null);
      setTimeout(() => { setStep(st => st + 1); setStepKey(k => k + 1); }, 240);
    } else {
      setTimeout(() => submitForm(next), 240);
    }
  }

  function toggleMultiselect(val) {
    const s = steps[step];
    setForm(prev => {
      const cur = Array.isArray(prev[s.field]) ? prev[s.field] : [];
      return { ...prev, [s.field]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] };
    });
    setError(null);
  }

  // ── Submit ───────────────────────────────────────────────────────
  async function submitForm(finalForm) {
    setPhase('submitting'); setError(null);
    try {
      const emailStep = steps.find(s => s.type === 'email' || s.field.toLowerCase().includes('email'));
      const email = emailStep ? (finalForm[emailStep.field] || '').trim() : '';
      const nameStep = steps.find(s => s.field === 'nombre' || s.question.toLowerCase().includes('nombre') || s.question.toLowerCase().includes('name'));
      const displayName = nameStep ? (finalForm[nameStep.field] || null) : null;

      const body = { email, displayName };
      if (isV2) {
        body.fieldValues = finalForm;
      } else {
        body.fieldValues = {
          nombre: finalForm.nombre,
          email: finalForm.email,
          telefono: finalForm.telefono,
          edad: finalForm.edad,
          genero: finalForm.genero,
        };
      }

      const { data } = await apiClient.post(`/events/${eventId}/register`, body);

      if (data.status === 'waitlisted') {
        setPhase('waitlist_success');
        setWaitlistContact(email);
        return;
      }

      setCheckInToken(data.checkInToken);
      setPhase('success');
    } catch (err) {
      if (err.code === 'FORBIDDEN' || err.status === 403) { setPhase('full'); return; }
      setPhase('form'); setStep(0); setStepKey(k => k + 1);
      setError('Ocurrió un error. Intenta de nuevo.');
    }
  }

  // ── Waitlist ─────────────────────────────────────────────────────
  async function submitWaitlist() {
    const contact = waitlistContact.trim();
    if (!contact) { setWaitlistError('Ingresa un email o teléfono'); return; }
    try {
      await apiClient.post(`/events/${eventId}/waitlist`, { contact });
      setPhase('waitlist_success');
    } catch (err) {
      console.error('[EventSignup] waitlist failed', err);
      setWaitlistError('Ocurrió un error. Intenta de nuevo.');
    }
  }

  // ── Share ────────────────────────────────────────────────────────
  async function handleShare() {
    await navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const hasImage = Boolean(event?.imageUrl);
  const currentStep = steps[step];
  const spotsLeft = event?.maxRegistrations != null ? event.spotsRemaining : null;
  const filledPct = event?.maxRegistrations != null
    ? (event.maxRegistrations - (event.spotsRemaining ?? event.maxRegistrations)) / event.maxRegistrations
    : null;

  // ── GATE (wakeUsersOnly + not signed in) ─────────────────────────
  if (phase === 'gate') {
    if (!authReady) {
      return (
        <div className="es-page es-page--loading" style={cssVars}>
          <AmbientOrbs />
          <WakeLoader size={68} />
        </div>
      );
    }
    if (authUser) {
      return (
        <div className="es-page es-page--loading" style={cssVars}>
          <AmbientOrbs />
          <WakeLoader size={68} />
        </div>
      );
    }
    return (
      <div className="es-page es-fade-in" style={cssVars}>
        {hasImage && <div className="es-bg es-bg--blurred" style={{ backgroundImage: `url(${event.imageUrl})` }} />}
        <div className="es-overlay es-overlay--dark" />
        <AmbientOrbs />
        <a href="/" className="es-logo-link" aria-label="Wake">
          <img src={wakeLogotypeSrc} alt="Wake" className="es-logo" />
        </a>
        <div className="es-gate es-fade-in">
          {hasImage && <img src={event.imageUrl} alt={event.title} className="es-gate-poster" />}
          <h2 className="es-gate-title">{event?.title}</h2>
          <p className="es-gate-sub">Este evento es exclusivo para usuarios de Wake.</p>
          <a href="/app" className="es-cta">Abrir la app Wake</a>
        </div>
      </div>
    );
  }

  // ── LOADING ──────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="es-page es-page--loading" style={cssVars}>
        <AmbientOrbs />
        <WakeLoader size={68} />
      </div>
    );
  }

  // ── NOT FOUND ────────────────────────────────────────────────────
  if (phase === 'not_found') {
    return (
      <div className="es-page es-fade-in" style={cssVars}>
        <p className="es-msg">Este evento no existe.</p>
      </div>
    );
  }

  // ── FULL ─────────────────────────────────────────────────────────
  if (phase === 'full') {
    return (
      <div className="es-page es-fade-in" style={cssVars}>
        {hasImage && <div className="es-bg es-bg--blurred" style={{ backgroundImage: `url(${event.imageUrl})` }} />}
        <div className="es-overlay es-overlay--dark" />
        <AmbientOrbs />
        <a href="/" className="es-logo-link" aria-label="Wake">
          <img src={wakeLogotypeSrc} alt="Wake" className="es-logo" />
        </a>
        <div className="es-full-content es-fade-in">
          {hasImage && (
            <div className="es-full-poster-wrap">
              <img src={event.imageUrl} alt={event.title} className="es-full-poster" />
              <div className="es-full-badge">LLENO</div>
            </div>
          )}
          <h2 className="es-full-title">{event?.title}</h2>
          {event?.maxRegistrations != null && (
            <div className="es-capacity-wrap es-capacity-wrap--centered">
              <div className="es-capacity-meta">
                <span>{event.maxRegistrations} cupos</span>
                <span>100%</span>
              </div>
              <div className="es-capacity-bar-outer">
                <div className="es-capacity-bar-fill es-capacity-bar-fill--full" />
              </div>
            </div>
          )}
          <p className="es-full-sub">Este evento está lleno.</p>
          <button className="es-cta es-cta--secondary" onClick={() => setPhase('waitlist')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8, opacity: 0.7 }}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
            Unirme a la lista de espera
          </button>
        </div>
      </div>
    );
  }

  // ── WAITLIST ──────────────────────────────────────────────────────
  if (phase === 'waitlist') {
    return (
      <div className="es-page es-fade-in" style={cssVars}>
        {hasImage && <div className="es-bg es-bg--blurred" style={{ backgroundImage: `url(${event.imageUrl})` }} />}
        <div className="es-overlay es-overlay--dark" />
        <AmbientOrbs />
        <a href="/" className="es-logo-link" aria-label="Wake">
          <img src={wakeLogotypeSrc} alt="Wake" className="es-logo" />
        </a>
        <div className="es-form-shell es-fade-in">
          <button className="es-back" onClick={() => setPhase('full')} aria-label="Volver">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="es-step es-step--enter-up">
            <div className="es-step-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <h2 className="es-question">¿Cómo te avisamos si se libera un cupo?</h2>
            <div className="es-input-wrap">
              <input
                ref={inputRef}
                className="es-input"
                type="text"
                placeholder="Email o teléfono"
                value={waitlistContact}
                onChange={e => { setWaitlistContact(e.target.value); setWaitlistError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') submitWaitlist(); }}
              />
              {waitlistError && <p className="es-error">{waitlistError}</p>}
              <button className="es-cta" onClick={submitWaitlist}>Confirmar</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── WAITLIST SUCCESS ──────────────────────────────────────────────
  if (phase === 'waitlist_success') {
    return (
      <div className="es-page es-fade-in" style={cssVars}>
        {hasImage && <div className="es-bg es-bg--blurred" style={{ backgroundImage: `url(${event.imageUrl})` }} />}
        <div className="es-overlay es-overlay--dark" />
        <AmbientOrbs />
        <a href="/" className="es-logo-link" aria-label="Wake">
          <img src={wakeLogotypeSrc} alt="Wake" className="es-logo" />
        </a>
        <div className="es-success es-fade-in">
          <div className="es-success-body">
            <div className="es-rings-wrap">
              <div className="es-ring es-ring-1" />
              <div className="es-ring es-ring-2" />
              <div className="es-ring es-ring-3" />
              <svg className="es-check" viewBox="0 0 52 52">
                <circle className="es-check-circle" cx="26" cy="26" r="23" />
                <polyline className="es-check-tick" points="14,26 22,34 38,18" />
              </svg>
            </div>
            <h1 className="es-success-title">¡En la lista!</h1>
            <p className="es-success-sub">
              Te avisamos en <strong style={{ color: '#fff' }}>{waitlistContact}</strong> si se libera un cupo.
            </p>
            {event?.title && <p className="es-success-event">{event.title}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ── CLOSED ───────────────────────────────────────────────────────
  if (phase === 'closed') {
    return (
      <div className="es-page es-fade-in" style={cssVars}>
        {hasImage && <div className="es-bg es-bg--blurred" style={{ backgroundImage: `url(${event.imageUrl})` }} />}
        <div className="es-overlay es-overlay--dark" />
        <div className="es-closed es-fade-in">
          <h2 className="es-closed-title">{event.title}</h2>
          <p className="es-msg">Registros cerrados.</p>
        </div>
      </div>
    );
  }

  // ── Shared layout (hero / form / submitting / success) ──────────
  const bgClass = (phase === 'hero' || phase === 'success') ? 'es-bg--vivid' : 'es-bg--blurred';
  const overlayClass = phase === 'hero' ? 'es-overlay--hero'
    : phase === 'success' ? 'es-overlay--success'
    : 'es-overlay--dark';

  return (
    <div className="es-page" style={cssVars}>
      {hasImage && phase !== 'hero'
        ? <div className={`es-bg ${bgClass}`} style={{ backgroundImage: `url(${event.imageUrl})` }} />
        : <div
            className="es-bg es-bg--solid"
            style={hasImage ? {
              background: `radial-gradient(ellipse at 50% 55%, rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.28) 0%, #1a1a1a 65%)`
            } : undefined}
          />
      }
      <div className={`es-overlay ${overlayClass}`} />

      <AmbientOrbs />

      <a href="/" className="es-logo-link" aria-label="Wake">
        <img src={wakeLogotypeSrc} alt="Wake" className="es-logo" />
      </a>

      {phase === 'form' && (
        <div className="es-progress-line-wrap">
          <ProgressLine step={step} totalSteps={steps.length} />
        </div>
      )}

      {/* ── HERO ── */}
      {phase === 'hero' && (
        <div className="es-hero es-fade-in">
          <div className="es-hero-body">
            <div className="es-flier-card-wrap">
              <FlierCard
                event={event}
                flipped={cardFlipped}
                onFlip={() => setCardFlipped(f => !f)}
                hasImage={hasImage}
              />
            </div>
          </div>
          <div className="es-hero-footer">
            {filledPct !== null && filledPct >= 0.6 && (
              <div className="es-capacity-wrap">
                <div className="es-capacity-bar-outer">
                  <div className="es-capacity-bar-fill" style={{ width: `${Math.min(filledPct * 100, 100)}%` }} />
                </div>
                <span className="es-capacity-label">
                  {spotsLeft <= 1 ? '¡Solo queda 1 cupo!' : `Quedan ${spotsLeft} cupos`}
                </span>
              </div>
            )}
            <button className="es-cta es-cta--pulse" onClick={startForm}>
              Registrarme
            </button>
          </div>
        </div>
      )}

      {/* ── FORM ── */}
      {phase === 'form' && (
        <div className="es-form-shell es-fade-in">
          <div className="es-topbar">
            <div className="es-topbar-fill" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
          <button className="es-back" onClick={goBack} aria-label="Volver">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div
            key={stepKey}
            className={`es-step ${direction === 'forward' ? 'es-step--enter-up' : 'es-step--enter-down'}`}
          >
            <div className="es-step-icon">
              {STEP_ICONS[step] ?? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="8" />
                </svg>
              )}
            </div>
            <span className="es-step-count">{step + 1} / {steps.length}</span>
            <h2 className="es-question">{currentStep.question}</h2>

            {currentStep.type === 'choice' ? (
              <div className="es-choices">
                {currentStep.options.map(opt => (
                  <button
                    key={opt}
                    className={`es-choice ${form[currentStep.field] === opt ? 'es-choice--selected' : ''}`}
                    onClick={() => selectChoice(opt)}
                  >
                    {opt}
                  </button>
                ))}
                {error && <p className="es-error">{error}</p>}
              </div>
            ) : currentStep.type === 'multiselect' ? (
              <div className="es-choices">
                {currentStep.options.map(opt => (
                  <button
                    key={opt}
                    className={`es-choice ${Array.isArray(form[currentStep.field]) && form[currentStep.field].includes(opt) ? 'es-choice--selected' : ''}`}
                    onClick={() => toggleMultiselect(opt)}
                  >
                    {opt}
                  </button>
                ))}
                {error && <p className="es-error">{error}</p>}
                <button className="es-cta" onClick={advance}>
                  {step === steps.length - 1 ? 'Registrarme' : 'Continuar'}
                </button>
              </div>
            ) : currentStep.type === 'textarea' ? (
              <div className="es-input-wrap">
                <textarea
                  ref={inputRef}
                  className="es-input es-input--textarea"
                  placeholder={currentStep.placeholder}
                  value={form[currentStep.field]}
                  onChange={e => { setForm(prev => ({ ...prev, [currentStep.field]: e.target.value })); setError(null); }}
                  rows={4}
                />
                {error && <p className="es-error">{error}</p>}
                <button className="es-cta" onClick={advance}>
                  {step === steps.length - 1 ? 'Registrarme' : 'Continuar'}
                </button>
              </div>
            ) : (
              <div className="es-input-wrap">
                <input
                  ref={inputRef}
                  className="es-input"
                  type={currentStep.type === 'number' ? 'number' : currentStep.type === 'date' ? 'date' : currentStep.type}
                  placeholder={currentStep.placeholder}
                  autoComplete={currentStep.autoComplete}
                  inputMode={currentStep.type === 'number' ? 'numeric' : undefined}
                  min={currentStep.type === 'number' ? 1 : undefined}
                  max={currentStep.type === 'number' ? 99 : undefined}
                  value={form[currentStep.field]}
                  onChange={e => {
                    setForm(prev => ({ ...prev, [currentStep.field]: e.target.value }));
                    setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                />
                {error && <p className="es-error">{error}</p>}
                <button className="es-cta" onClick={advance}>
                  {step === steps.length - 1 ? 'Registrarme' : 'Continuar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SUBMITTING ── */}
      {phase === 'submitting' && (
        <div className="es-center es-fade-in">
          <WakeLoader size={56} />
        </div>
      )}

      {/* ── SUCCESS ── */}
      {phase === 'success' && (() => {
        const firstName = (() => {
          if (form.nombre) return form.nombre.split(' ')[0];
          const nameStep = steps.find(s => s.question.toLowerCase().includes('nombre') || s.question.toLowerCase().includes('name') || s.field.toLowerCase().includes('nombre'));
          if (nameStep) { const v = form[nameStep.field]; if (v && typeof v === 'string') return v.split(' ')[0]; }
          return null;
        })();
        const confirmMsg = event?.settings?.confirmationMessage ?? event?.settings?.confirmation_message;
        const toEmail = (() => {
          if (form.email) return form.email;
          const emailStep = steps.find(s => s.type === 'email' || s.field.toLowerCase().includes('email'));
          if (emailStep) return form[emailStep.field] || null;
          return null;
        })();
        const qrUrl = checkInToken
          ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(JSON.stringify({ eventId, token: checkInToken }))}&bgcolor=1a1a1a&color=ffffff&qzone=1`
          : null;
        return (
        <div className="es-success es-fade-in">
          <div className="es-success-body">
            <div className="es-rings-wrap">
              <div className="es-ring es-ring-1" />
              <div className="es-ring es-ring-2" />
              <div className="es-ring es-ring-3" />
              <svg className="es-check" viewBox="0 0 52 52">
                <circle className="es-check-circle" cx="26" cy="26" r="23" />
                <polyline className="es-check-tick" points="14,26 22,34 38,18" />
              </svg>
            </div>
            <h1 className="es-success-title">
              {firstName ? `¡${firstName}, estás dentro!` : '¡Estás dentro!'}
            </h1>
            <p className="es-success-sub">{confirmMsg || 'Nos vemos en el evento.'}</p>

            {(event?.date || event?.location) && (
              <div className="es-success-event-details">
                {event.date && (
                  <div className="es-success-event-detail">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>{formatEventDateLong(event.date)}</span>
                  </div>
                )}
                {event.location && (
                  <div className="es-success-event-detail">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>{event.location}</span>
                  </div>
                )}
              </div>
            )}

            {qrUrl && (
              <div className="es-success-qr">
                <img src={qrUrl} alt="QR Check-in" width={160} height={160} className="es-success-qr-img" />
                <p className="es-success-qr-hint">
                  Muestra este QR en la entrada
                  {toEmail && <><br /><span>También enviado a {toEmail}</span></>}
                </p>
              </div>
            )}
          </div>
          <div className="es-success-footer">
            <button className={`es-cta es-cta--share${copied ? ' es-cta--copied' : ''}`} onClick={handleShare}>
              {copied ? '✓ Link copiado' : 'Invitar a un amigo'}
            </button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
