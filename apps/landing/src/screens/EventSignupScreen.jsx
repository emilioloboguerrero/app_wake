import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, serverTimestamp, runTransaction, increment } from 'firebase/firestore';
import { firestore } from '../config/firebase';
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

// ─── Steps definition ─────────────────────────────────────────────
const STEPS = [
  { field: 'nombre',   question: '¿Cómo te llamas?',               type: 'text',   placeholder: 'Tu nombre completo', autoComplete: 'name' },
  { field: 'email',    question: '¿Cuál es tu email?',              type: 'email',  placeholder: 'nombre@email.com',   autoComplete: 'email' },
  { field: 'telefono', question: '¿Cuál es tu teléfono?',           type: 'tel',    placeholder: '+57 300 000 0000',   autoComplete: 'tel' },
  { field: 'edad',     question: '¿Cuántos años tienes?',           type: 'number', placeholder: '25',                 autoComplete: 'off' },
  { field: 'genero',   question: '¿Con qué género te identificas?', type: 'choice', options: ['Masculino', 'Femenino', 'Prefiero no decir'] },
];
const TOTAL_STEPS = STEPS.length;
const INITIAL_FORM = { nombre: '', email: '', telefono: '', edad: '', genero: '' };

function relativeLuminance(r, g, b) {
  return [r, g, b]
    .map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
}

// ─── Main screen ──────────────────────────────────────────────────
export default function EventSignupScreen() {
  const { eventId } = useParams();
  // phase: loading | hero | form | submitting | success | not_found | closed | full | waitlist | waitlist_success
  const [phase, setPhase] = useState('loading');
  const [event, setEvent] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const [direction, setDirection] = useState('forward');
  const [error, setError] = useState(null);
  // Default: white (PWA onboarding palette), not gold
  const [accentRgb, setAccentRgb] = useState([255, 255, 255]);
  const [accentIsDark, setAccentIsDark] = useState(true); // white = needs dark text
  const [copied, setCopied] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  const [waitlistContact, setWaitlistContact] = useState('');
  const [waitlistError, setWaitlistError] = useState(null);
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

  // Load event
  useEffect(() => {
    console.log('[EventSignup] loading event', eventId);
    getDoc(doc(firestore, 'events', eventId))
      .then(snap => {
        if (!snap.exists()) {
          console.warn('[EventSignup] event not found', eventId);
          setPhase('not_found');
          return;
        }
        const data = snap.data();
        if (data.status === 'closed') {
          console.log('[EventSignup] event closed', eventId);
          setEvent(data);
          setPhase('closed');
          return;
        }
        if (data.max_registrations != null && (data.registration_count ?? 0) >= data.max_registrations) {
          console.log('[EventSignup] event full', eventId);
          setEvent(data);
          setPhase('full');
          return;
        }
        console.log('[EventSignup] event loaded', { eventId, title: data.title });
        setEvent(data);
        setTimeout(() => setPhase('hero'), 1400);
      })
      .catch(err => {
        console.error('[EventSignup] failed to load event', eventId, err);
        setPhase('not_found');
      });
  }, [eventId]);

  // Color extraction — canvas-based, no library needed
  useEffect(() => {
    if (!event?.image_url) return;
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
        // Pick the most vivid pixel: score = saturation × brightness, ignore near-black/near-white
        let bestR = 255, bestG = 255, bestB = 255, bestScore = -1;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (max < 40 || max > 245) continue; // skip near-black and near-white
          const sat = max === 0 ? 0 : (max - min) / max;
          const score = sat * (max / 255);
          if (score > bestScore) { bestScore = score; bestR = r; bestG = g; bestB = b; }
        }
        const lum = relativeLuminance(bestR, bestG, bestB);
        console.log('[EventSignup] accent extracted', { r: bestR, g: bestG, b: bestB, lum });
        setAccentRgb([bestR, bestG, bestB]);
        setAccentIsDark(lum > 0.35);
      } catch (e) {
        console.warn('[EventSignup] color extraction failed', e);
      }
    };
    img.src = event.image_url;
  }, [event?.image_url]);

  // Focus input on step change or waitlist
  useEffect(() => {
    if (phase !== 'form' && phase !== 'waitlist') return;
    const t = setTimeout(() => inputRef.current?.focus(), 420);
    return () => clearTimeout(t);
  }, [phase, step]);

  // ── Navigation ──────────────────────────────────────────────────
  function startForm() {
    setStep(0); setStepKey(0); setDirection('forward'); setError(null);
    setPhase('form');
  }

  function goBack() {
    if (step === 0) { setPhase('hero'); return; }
    setDirection('back'); setError(null);
    setStep(s => s - 1); setStepKey(k => k + 1);
  }

  // ── Validation ──────────────────────────────────────────────────
  function validateCurrent() {
    const s = STEPS[step];
    const val = String(form[s.field] ?? '').trim();
    if (!val) { setError('Este campo es obligatorio'); return false; }
    if (s.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setError('Ingresa un email válido'); return false;
    }
    if (s.type === 'number' && (Number(val) < 1 || Number(val) > 99)) {
      setError('Ingresa una edad válida'); return false;
    }
    return true;
  }

  function advance() {
    if (!validateCurrent()) return;
    if (step < TOTAL_STEPS - 1) {
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
    const next = { ...form, genero: val };
    setForm(next);
    setTimeout(() => submitForm(next), 240);
  }

  // ── Submit ───────────────────────────────────────────────────────
  async function submitForm(finalForm) {
    setPhase('submitting'); setError(null);
    try {
      const eventRef = doc(firestore, 'events', eventId);
      const regRef = doc(collection(firestore, 'event_signups', eventId, 'registrations'));
      console.log('[EventSignup] submitting', { eventId, email: finalForm.email });
      await runTransaction(firestore, async tx => {
        const eventSnap = await tx.get(eventRef);
        const d = eventSnap.data();
        const count = d.registration_count ?? 0;
        if (d.max_registrations != null && count >= d.max_registrations) {
          throw new Error('full');
        }
        tx.set(regRef, {
          nombre: finalForm.nombre, email: finalForm.email,
          telefono: finalForm.telefono, edad: Number(finalForm.edad),
          genero: finalForm.genero, check_in_token: crypto.randomUUID(),
          checked_in: false, checked_in_at: null, created_at: serverTimestamp(),
        });
        if (d.max_registrations != null) {
          tx.update(eventRef, { registration_count: increment(1) });
        }
      });
      console.log('[EventSignup] registration created', regRef.id);
      setEvent(prev => ({ ...prev, registration_count: (prev.registration_count ?? 0) + 1 }));
      setPhase('success');
    } catch (err) {
      if (err.message === 'full') {
        setPhase('full');
        return;
      }
      console.error('[EventSignup] submission failed', err);
      setPhase('form'); setStep(0); setStepKey(k => k + 1);
      setError('Ocurrió un error. Intenta de nuevo.');
    }
  }

  // ── Waitlist ─────────────────────────────────────────────────────
  async function submitWaitlist() {
    const contact = waitlistContact.trim();
    if (!contact) { setWaitlistError('Ingresa un email o teléfono'); return; }
    try {
      await addDoc(collection(firestore, 'event_signups', eventId, 'waitlist'), {
        contact, created_at: serverTimestamp(),
      });
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

  const hasImage = Boolean(event?.image_url);
  const currentStep = STEPS[step];
  const spotsLeft = event?.max_registrations != null
    ? event.max_registrations - (event.registration_count ?? 0)
    : null;
  const filledPct = event?.max_registrations != null
    ? (event.registration_count ?? 0) / event.max_registrations
    : null;

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
        {hasImage && <div className="es-bg es-bg--blurred" style={{ backgroundImage: `url(${event.image_url})` }} />}
        <div className="es-overlay es-overlay--dark" />
        <AmbientOrbs />
        <a href="/" className="es-logo-link" aria-label="Wake">
          <img src={wakeLogotypeSrc} alt="Wake" className="es-logo" />
        </a>
        <div className="es-full-content es-fade-in">
          {hasImage && (
            <div className="es-full-poster-wrap">
              <img src={event.image_url} alt={event.title} className="es-full-poster" />
              <div className="es-full-badge">LLENO</div>
            </div>
          )}
          <h2 className="es-full-title">{event?.title}</h2>
          {event?.max_registrations != null && (
            <div className="es-capacity-wrap es-capacity-wrap--centered">
              <div className="es-capacity-meta">
                <span>{event.max_registrations} cupos</span>
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
        {hasImage && <div className="es-bg es-bg--blurred" style={{ backgroundImage: `url(${event.image_url})` }} />}
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
        {hasImage && <div className="es-bg es-bg--blurred" style={{ backgroundImage: `url(${event.image_url})` }} />}
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
        {hasImage && <div className="es-bg es-bg--blurred" style={{ backgroundImage: `url(${event.image_url})` }} />}
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
      {/* Background image — hero uses accent color gradient; other phases use blurred image */}
      {hasImage && phase !== 'hero'
        ? <div className={`es-bg ${bgClass}`} style={{ backgroundImage: `url(${event.image_url})` }} />
        : <div
            className="es-bg es-bg--solid"
            style={hasImage ? {
              background: `radial-gradient(ellipse at 50% 55%, rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.28) 0%, #1a1a1a 65%)`
            } : undefined}
          />
      }
      <div className={`es-overlay ${overlayClass}`} />

      {/* Ambient orbs — always above overlay */}
      <AmbientOrbs />

      {/* Wake logo — top center, links to home */}
      <a href="/" className="es-logo-link" aria-label="Wake">
        <img src={wakeLogotypeSrc} alt="Wake" className="es-logo" />
      </a>

      {/* Curved progress line — form only */}
      {phase === 'form' && (
        <div className="es-progress-line-wrap">
          <ProgressLine step={step} totalSteps={TOTAL_STEPS} />
        </div>
      )}

      {/* ── HERO ── */}
      {phase === 'hero' && (
        <div className="es-hero es-fade-in">
          <div className="es-hero-body">
            {hasImage ? (
              <div className="es-poster-wrap">
                <div className="es-poster-glow" />
                <img
                  src={event.image_url}
                  alt={event.title}
                  className={`es-poster${posterLoaded ? ' es-poster--loaded' : ''}`}
                  onLoad={() => setPosterLoaded(true)}
                />
              </div>
            ) : (
              <div className="es-hero-no-image">
                <h1 className="es-hero-title">{event.title}</h1>
              </div>
            )}
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
          {/* Top thin progress bar */}
          <div className="es-topbar">
            <div className="es-topbar-fill" style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} />
          </div>
          {/* Back */}
          <button className="es-back" onClick={goBack} aria-label="Volver">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* Step */}
          <div
            key={stepKey}
            className={`es-step ${direction === 'forward' ? 'es-step--enter-up' : 'es-step--enter-down'}`}
          >
            {/* Icon */}
            <div className="es-step-icon">{STEP_ICONS[step]}</div>
            <span className="es-step-count">{step + 1} / {TOTAL_STEPS}</span>
            <h2 className="es-question">{currentStep.question}</h2>

            {currentStep.type === 'choice' ? (
              <div className="es-choices">
                {currentStep.options.map(opt => (
                  <button
                    key={opt}
                    className={`es-choice ${form.genero === opt ? 'es-choice--selected' : ''}`}
                    onClick={() => selectChoice(opt)}
                  >
                    {opt}
                  </button>
                ))}
                {error && <p className="es-error">{error}</p>}
              </div>
            ) : (
              <div className="es-input-wrap">
                <input
                  ref={inputRef}
                  className="es-input"
                  type={currentStep.type}
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
                  {step === TOTAL_STEPS - 1 ? 'Registrarme' : 'Continuar'}
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
      {phase === 'success' && (
        <div className="es-success es-fade-in">
          <div className="es-success-body">
            {/* Expanding rings */}
            <div className="es-rings-wrap">
              <div className="es-ring es-ring-1" />
              <div className="es-ring es-ring-2" />
              <div className="es-ring es-ring-3" />
              {/* Checkmark */}
              <svg className="es-check" viewBox="0 0 52 52">
                <circle className="es-check-circle" cx="26" cy="26" r="23" />
                <polyline className="es-check-tick" points="14,26 22,34 38,18" />
              </svg>
            </div>
            <h1 className="es-success-title">
              {form.nombre ? `¡${form.nombre.split(' ')[0]}, estás dentro!` : '¡Estás dentro!'}
            </h1>
            <p className="es-success-sub">Nos vemos en el evento.</p>
            {event?.title && <p className="es-success-event">{event.title}</p>}
          </div>
          <div className="es-success-footer">
            <button className={`es-cta es-cta--share${copied ? ' es-cta--copied' : ''}`} onClick={handleShare}>
              {copied ? '✓ Link copiado' : 'Invitar a un amigo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
