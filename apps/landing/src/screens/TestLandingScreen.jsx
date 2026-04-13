import React, { useState, useEffect, useRef } from 'react';
import { getMainHeroLandingImages } from '../services/heroImagesService';
import wakeIcon from '../assets/hero-logo.svg';
import wakeLogo from '../assets/Logotipo-WAKE-positivo.svg';
import wakeLogotype from '../assets/wake-logotype.svg';
import './TestLandingScreen.css';

const SLIDE_INTERVAL = 1500;
const FALLBACK_IMAGES = [
  '/fallback/hero/IMG_2321.jpeg',
  '/fallback/hero/IMG_3247.jpg',
  '/fallback/hero/IMG_3248.jpg',
  '/fallback/hero/IMG_3249.jpg',
  '/fallback/hero/IMG_3250.jpg',
  '/fallback/hero/IMG_3251.jpg',
  '/fallback/hero/IMG_3252.jpg',
  '/fallback/hero/IMG_3253.jpg',
  '/fallback/hero/IMG_3255.jpg',
  '/fallback/hero/IMG_3256.jpg',
  '/fallback/hero/IMG_3257.jpg',
  '/fallback/hero/IMG_3258.jpg',
  '/fallback/hero/IMG_3259.jpg',
  '/fallback/hero/IMG_3260.jpg',
  '/fallback/hero/IMG_3261.jpg',
  '/fallback/hero/IMG_9387.jpg',
  '/fallback/hero/IMG_9388.jpg',
  '/fallback/hero/IMG_9390.jpg',
  '/fallback/hero/IMG_9391.jpg',
  '/fallback/hero/IMG_9392.jpg',
  '/fallback/hero/IMG_9393.jpg',
  '/fallback/hero/IMG_9394.jpg',
  '/fallback/hero/IMG_9396.jpg',
  '/fallback/hero/IMG_9401.jpg',
  '/fallback/hero/IMG_9402.jpg',
  '/fallback/hero/img.JPG',
];


/* ═══════════════════════════════════════════
   BELIEF SECTION — the turn
   Background uses actual onboarding visual elements:
   phone mockups, flow diagram, network nodes
   ═══════════════════════════════════════════ */

/* ── Aurora background (from creator onboarding) ── */
function AuroraCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame;
    let time = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
    };
    resize();
    window.addEventListener('resize', resize);

    const blobs = [
      { x: 0.3, y: 0.4, r: 0.35, speed: 0.0003, phase: 0, color: [255, 87, 168] },
      { x: 0.7, y: 0.6, r: 0.3, speed: 0.0004, phase: 2, color: [255, 87, 168] },
      { x: 0.5, y: 0.3, r: 0.25, speed: 0.0005, phase: 4, color: [255, 87, 168] },
    ];

    const draw = () => {
      time += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      blobs.forEach((blob) => {
        const x = canvas.width * (blob.x + Math.sin(time * blob.speed + blob.phase) * 0.1);
        const y = canvas.height * (blob.y + Math.cos(time * blob.speed * 0.7 + blob.phase) * 0.08);
        const r = Math.min(canvas.width, canvas.height) * blob.r;

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        const [cr, cg, cb] = blob.color;
        gradient.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.06)`);
        gradient.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, 0.02)`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });

      frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="tl-belief-aurora" />;
}

/* ── Belief visual — Animated stack showcase ── */

const STACK_ITEMS = [
  { label: 'Atletas', detail: '2,400 activos', accent: true },
  { label: 'Programas', detail: '12 semanas · Fuerza' },
  { label: 'Asesorías', detail: '1:1 · Coach Bejarano' },
  { label: 'Eventos', detail: 'Sexy Pace Run · ABR 19' },
  { label: 'Parches', detail: 'Cocina Bejarano · 23/25' },
  { label: 'Entrenamiento', detail: 'Tren superior · 4 ejercicios' },
  { label: 'Nutrición', detail: '2,420 kcal · 165g P' },
  { label: 'Progreso', detail: '+12.5 kg press banca' },
  { label: 'Sesiones', detail: 'Fuerza · ~50 min' },
  { label: 'Diario', detail: 'Avena con whey · 480 kcal' },
  { label: 'Macros', detail: '165g P · 280g C · 72g G' },
  { label: 'Check-in', detail: 'Peso · 74.2 kg' },
];

function StackShowcase({ visible }) {
  const doubled = [...STACK_ITEMS, ...STACK_ITEMS];
  const maskRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const mask = maskRef.current;
    if (!mask) return;

    let frame;
    const update = () => {
      const maskRect = mask.getBoundingClientRect();
      const maskCenter = maskRect.height / 2;
      const layers = mask.querySelectorAll('.tl-bv-layer');

      layers.forEach((layer) => {
        const layerRect = layer.getBoundingClientRect();
        const layerCenter = layerRect.top - maskRect.top + layerRect.height / 2;
        const dist = Math.abs(layerCenter - maskCenter) / maskCenter;
        const widthPercent = 100 - dist * 35;
        layer.style.width = `${Math.max(55, Math.min(100, widthPercent))}%`;
      });

      frame = requestAnimationFrame(update);
    };
    update();

    return () => cancelAnimationFrame(frame);
  }, [visible]);

  return (
    <div className={`tl-bv-stack ${visible ? 'tl-bv-stack-visible' : ''}`}>
      <div className="tl-bv-stack-mask" ref={maskRef}>
        <div className="tl-bv-stack-track">
          {doubled.map((item, i) => (
            <div key={i} className="tl-bv-layer">
              <span className={`tl-bv-layer-label ${item.accent ? 'tl-bv-layer-accent' : ''}`}>
                {item.label}
              </span>
              <span className="tl-bv-layer-detail">{item.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BeliefSection() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="tl-belief" ref={ref}>
      <AuroraCanvas />
      <div className="tl-belief-left">
        <h2 className="tl-belief-line1">Wake es la plataforma</h2>
        <h2 className="tl-belief-line2">detrás del rendimiento.</h2>
      </div>
      <div className="tl-belief-right">
        <StackShowcase visible={visible} />
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════
   REVEAL SECTION — "Eso es Wake."
   ═══════════════════════════════════════════ */
function RevealSection() {
  const ref = useRef(null);
  const canvasRef = useRef(null);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setTriggered(true); },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Aurora with pulse on reveal
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame;
    let time = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      time += 1;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const intensity = triggered ? 1.8 : 0.5;

      const blobs = [
        { x: 0.5, y: 0.5, r: 0.45, speed: 0.0002, phase: 0 },
        { x: 0.35, y: 0.45, r: 0.3, speed: 0.0003, phase: 1.5 },
        { x: 0.65, y: 0.55, r: 0.3, speed: 0.00035, phase: 3 },
      ];

      blobs.forEach((blob) => {
        const x = w * (blob.x + Math.sin(time * blob.speed + blob.phase) * 0.08);
        const y = h * (blob.y + Math.cos(time * blob.speed * 0.7 + blob.phase) * 0.06);
        const r = Math.min(w, h) * blob.r;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(255, 87, 168, ${0.07 * intensity})`);
        grad.addColorStop(0.4, `rgba(255, 87, 168, ${0.03 * intensity})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });

      frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [triggered]);

  return (
    <section className="tl-reveal" ref={ref}>
      <canvas ref={canvasRef} className="tl-reveal-aurora" />

      {/* Pulse ring on reveal */}
      <div className={`tl-reveal-pulse ${triggered ? 'tl-reveal-pulse-go' : ''}`} />
      <div className={`tl-reveal-pulse tl-reveal-pulse-2 ${triggered ? 'tl-reveal-pulse-go' : ''}`} />

      <div className={`tl-reveal-content ${triggered ? 'tl-reveal-triggered' : ''}`}>
        <span className="tl-reveal-eso">Solo en</span>
        <img src={wakeLogo} alt="Wake" className="tl-reveal-logo" />
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   SCROLL FLOW SECTION — Flora-style
   ═══════════════════════════════════════════ */

// Background media per category
const FLOW_BG = [
  '/fallback/flow/programas.jpg',
  '/fallback/flow/entrenamiento.jpg',
  '/fallback/flow/parches.jpg',
];

const FLOW_CATEGORIES = [
  {
    id: 'programas',
    tab: 'Programas',
    body: 'Generales para seguir a tu ritmo o personalizados con tu coach.',
  },
  {
    id: 'entrenamiento-nutricion',
    tab: 'Entrenamiento y nutrición',
    body: 'Tu sesión y tus comidas del día, listas cuando abres la app.',
  },
  {
    id: 'parches',
    tab: 'Parches',
    body: 'Encuentros, talleres y competencias. Te registras y llegas.',
  },
];

/* ── Programas visual: General vs One on One ── */
function ProgramasVisual() {
  return (
    <div className="tl-mock-programas">
      {/* General program */}
      <div className="tl-mock-program">
        <div className="tl-mock-program-header">
          <span className="tl-mock-program-name">Fuerza Funcional</span>
          <div className="tl-mock-program-badge">General</div>
        </div>
        <span className="tl-mock-program-coach">Coach Martínez</span>
        <span className="tl-mock-program-meta">12 semanas</span>
        <div className="tl-mock-program-avatars">
          <div className="tl-mock-avatar" />
          <div className="tl-mock-avatar" />
          <div className="tl-mock-avatar" />
          <div className="tl-mock-avatar" />
          <span className="tl-mock-avatar-count">+340</span>
        </div>
      </div>
      {/* Personalizado */}
      <div className="tl-mock-program">
        <div className="tl-mock-program-header">
          <span className="tl-mock-program-name">Plan personalizado</span>
          <div className="tl-mock-program-badge">Personalizado</div>
        </div>
        <span className="tl-mock-program-coach">Coach Bejarano</span>
        <span className="tl-mock-program-meta">Semana 3 de 8</span>
      </div>
    </div>
  );
}

/* ── Entrenamiento y nutrición visual: session + nutrition side by side ── */
function EntrenamientoVisual() {
  return (
    <div className="tl-mock-entrena">
      {/* Training session */}
      <div className="tl-mock-session">
        <div className="tl-mock-session-header">
          <span className="tl-mock-session-title">Fuerza · Tren superior</span>
          <span className="tl-mock-session-tag">Hoy</span>
        </div>
        <div className="tl-mock-exercises">
          <div className="tl-mock-exercise">
            <div className="tl-mock-exercise-check tl-mock-checked" />
            <span>Press banca</span>
            <span className="tl-mock-exercise-sets">4x8 · 60kg</span>
          </div>
          <div className="tl-mock-exercise">
            <div className="tl-mock-exercise-check tl-mock-checked" />
            <span>Press inclinado</span>
            <span className="tl-mock-exercise-sets">3x10 · 22kg</span>
          </div>
          <div className="tl-mock-exercise">
            <div className="tl-mock-exercise-check" />
            <span>Fondos</span>
            <span className="tl-mock-exercise-sets">3x12</span>
          </div>
          <div className="tl-mock-exercise">
            <div className="tl-mock-exercise-check" />
            <span>Aperturas cable</span>
            <span className="tl-mock-exercise-sets">3x15</span>
          </div>
        </div>
      </div>
      {/* Nutrition plan */}
      <div className="tl-mock-nutrition">
        <div className="tl-mock-nutrition-header">
          <span className="tl-mock-session-title">Nutrición · Martes</span>
        </div>
        <div className="tl-mock-macros">
          <div className="tl-mock-macro tl-mock-macro-p">165g P</div>
          <div className="tl-mock-macro tl-mock-macro-c">280g C</div>
          <div className="tl-mock-macro tl-mock-macro-g">72g G</div>
        </div>
        <div className="tl-mock-meals">
          <div className="tl-mock-meal">
            <span>Avena con whey</span>
            <span className="tl-mock-meal-cal">480 kcal</span>
          </div>
          <div className="tl-mock-meal">
            <span>Arroz, pollo, ensalada</span>
            <span className="tl-mock-meal-cal">620 kcal</span>
          </div>
          <div className="tl-mock-meal">
            <span>Yogurt con frutos secos</span>
            <span className="tl-mock-meal-cal">340 kcal</span>
          </div>
        </div>
        <div className="tl-mock-nutrition-total">2,420 kcal</div>
      </div>
    </div>
  );
}

/* ── Parches visual: event cards ── */
function ParchesVisual() {
  return (
    <div className="tl-mock-parches">
      <div className="tl-mock-event">
        <div className="tl-mock-event-date">
          <span className="tl-mock-event-month">ABR</span>
          <span className="tl-mock-event-day">19</span>
        </div>
        <div className="tl-mock-event-info">
          <span className="tl-mock-event-name">Sexy Pace Run</span>
          <span className="tl-mock-event-location">Parque Simón Bolívar, Bogotá</span>
          <div className="tl-mock-event-spots">
            <div className="tl-mock-event-bar"><div className="tl-mock-event-fill" style={{ width: '78%' }} /></div>
            <span>156 / 200</span>
          </div>
        </div>
      </div>
      <div className="tl-mock-event">
        <div className="tl-mock-event-date">
          <span className="tl-mock-event-month">MAY</span>
          <span className="tl-mock-event-day">03</span>
        </div>
        <div className="tl-mock-event-info">
          <span className="tl-mock-event-name">Untitled Project</span>
          <span className="tl-mock-event-location">Centro de convenciones, Medellín</span>
          <div className="tl-mock-event-spots">
            <div className="tl-mock-event-bar"><div className="tl-mock-event-fill" style={{ width: '45%' }} /></div>
            <span>90 / 200</span>
          </div>
        </div>
      </div>
      <div className="tl-mock-event">
        <div className="tl-mock-event-date">
          <span className="tl-mock-event-month">MAY</span>
          <span className="tl-mock-event-day">17</span>
        </div>
        <div className="tl-mock-event-info">
          <span className="tl-mock-event-name">Cocina Bejarano</span>
          <span className="tl-mock-event-location">Estudio Wake, Bogotá</span>
          <div className="tl-mock-event-spots">
            <div className="tl-mock-event-bar"><div className="tl-mock-event-fill" style={{ width: '92%' }} /></div>
            <span>23 / 25</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowCard({ cat }) {
  return (
    <div className="tl-sf-card">
      <div className="tl-sf-card-visual">
        {cat.id === 'programas' && <ProgramasVisual />}
        {cat.id === 'entrenamiento-nutricion' && <EntrenamientoVisual />}
        {cat.id === 'parches' && <ParchesVisual />}
      </div>
      <div className="tl-sf-card-meta">
        <p className="tl-sf-card-body">{cat.body}</p>
      </div>
    </div>
  );
}

function ScrollFlowSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionRef = useRef(null);

  useEffect(() => {
    let ticking = false;
    const count = FLOW_CATEGORIES.length;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const section = sectionRef.current;
        if (!section) { ticking = false; return; }
        const rect = section.getBoundingClientRect();
        const sectionHeight = section.offsetHeight;
        const scrolled = -rect.top;
        const progress = Math.max(0, Math.min(scrolled / (sectionHeight - window.innerHeight), 1));
        const idx = Math.min(Math.floor(progress * count), count - 1);
        setActiveIndex(idx);
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <section className="tl-sf" ref={sectionRef}>
      {/* Full-bleed background that crossfades per category */}
      <div className="tl-sf-bg" aria-hidden="true">
        {FLOW_BG.map((url, i) => (
          <div
            key={i}
            className={`tl-sf-bg-layer ${activeIndex === i ? 'tl-sf-bg-active' : ''}`}
            style={{ backgroundImage: `url(${url})` }}
          />
        ))}
        <div className="tl-sf-bg-overlay" />
      </div>

      {/* Desktop: sticky scroll */}
      <div className="tl-sf-desktop">
        <div className="tl-sf-sticky">
          <div className="tl-sf-left">
            <div className="tl-sf-categories">
              {FLOW_CATEGORIES.map((cat, i) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`tl-sf-cat ${activeIndex === i ? 'tl-sf-cat-active' : ''}`}
                  onClick={() => {
                    const section = sectionRef.current;
                    if (!section) return;
                    const sectionTop = section.offsetTop;
                    const sectionHeight = section.offsetHeight;
                    const scrollable = sectionHeight - window.innerHeight;
                    const target = sectionTop + (scrollable * i) / FLOW_CATEGORIES.length;
                    window.scrollTo({ top: target, behavior: 'smooth' });
                  }}
                >
                  {cat.tab}
                </button>
              ))}
            </div>
          </div>
          <div className="tl-sf-right">
            {FLOW_CATEGORIES.map((cat, i) => (
              <div
                key={cat.id}
                className={`tl-sf-panel ${activeIndex === i ? 'tl-sf-panel-active' : ''}`}
              >
                <FlowCard cat={cat} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: vertical cards with background */}
      <div className="tl-sf-mobile">
        {FLOW_CATEGORIES.map((cat, i) => (
          <div key={cat.id} className="tl-sf-mcard">
            <div
              className="tl-sf-mcard-bg"
              style={{ backgroundImage: `url(${FLOW_BG[i]})` }}
            />
            <div className="tl-sf-mcard-overlay" />
            <div className="tl-sf-mcard-content">
              <h3 className="tl-sf-mcard-cat">{cat.tab}</h3>
              <div className="tl-sf-mcard-visual">
                {cat.id === 'programas' && <ProgramasVisual />}
                {cat.id === 'entrenamiento-nutricion' && <EntrenamientoVisual />}
                {cat.id === 'parches' && <ParchesVisual />}
              </div>
              <div className="tl-sf-mcard-meta">
                <p className="tl-sf-card-body">{cat.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   ATHLETES PARALLAX GALLERY
   Vertical scroll → horizontal parallax drift
   ═══════════════════════════════════════════ */

const HERO_PATHS = [
  '/fallback/hero/IMG_2321.jpeg',
  '/fallback/hero/IMG_3247.jpg',
  '/fallback/hero/IMG_3248.jpg',
  '/fallback/hero/IMG_3249.jpg',
  '/fallback/hero/IMG_3250.jpg',
  '/fallback/hero/IMG_3251.jpg',
  '/fallback/hero/IMG_3252.jpg',
  '/fallback/hero/IMG_3253.jpg',
  '/fallback/hero/IMG_3255.jpg',
  '/fallback/hero/IMG_3256.jpg',
  '/fallback/hero/IMG_3257.jpg',
  '/fallback/hero/IMG_3258.jpg',
  '/fallback/hero/IMG_3259.jpg',
  '/fallback/hero/IMG_3260.jpg',
  '/fallback/hero/IMG_3261.jpg',
  '/fallback/hero/IMG_9387.jpg',
  '/fallback/hero/IMG_9388.jpg',
  '/fallback/hero/IMG_9390.jpg',
  '/fallback/hero/IMG_9391.jpg',
  '/fallback/hero/IMG_9392.jpg',
  '/fallback/hero/IMG_9393.jpg',
  '/fallback/hero/IMG_9394.jpg',
  '/fallback/hero/IMG_9396.jpg',
  '/fallback/hero/IMG_9401.jpg',
  '/fallback/hero/IMG_9402.jpg',
  '/fallback/hero/img.JPG',
];
const hp = (i) => HERO_PATHS[i % HERO_PATHS.length];

const ATHLETE_IMAGES = [
  // layer 0 — massive (near-viewport, very slow)
  { src: hp(0), layer: 0, top: '-5%', left: '2vw' },
  { src: hp(1), layer: 0, top: '10%', left: '120vw' },
  { src: hp(2), layer: 0, top: '-8%', left: '250vw' },
  { src: hp(3), layer: 0, top: '5%', left: '380vw' },
  { src: hp(4), layer: 0, top: '-3%', left: '510vw' },
  { src: hp(5), layer: 0, top: '8%', left: '650vw' },
  // layer 1 — large
  { src: hp(6), layer: 1, top: '5%', left: '40vw' },
  { src: hp(7), layer: 1, top: '42%', left: '150vw' },
  { src: hp(8), layer: 1, top: '8%', left: '230vw' },
  { src: hp(9), layer: 1, top: '50%', left: '320vw' },
  { src: hp(10), layer: 1, top: '15%', left: '420vw' },
  { src: hp(11), layer: 1, top: '45%', left: '530vw' },
  { src: hp(12), layer: 1, top: '6%', left: '620vw' },
  { src: hp(13), layer: 1, top: '52%', left: '710vw' },
  // layer 2 — medium
  { src: hp(14), layer: 2, top: '55%', left: '10vw' },
  { src: hp(15), layer: 2, top: '3%', left: '90vw' },
  { src: hp(16), layer: 2, top: '48%', left: '180vw' },
  { src: hp(17), layer: 2, top: '10%', left: '280vw' },
  { src: hp(18), layer: 2, top: '58%', left: '370vw' },
  { src: hp(19), layer: 2, top: '20%', left: '460vw' },
  { src: hp(20), layer: 2, top: '52%', left: '550vw' },
  { src: hp(21), layer: 2, top: '5%', left: '640vw' },
  { src: hp(22), layer: 2, top: '60%', left: '720vw' },
  // layer 3 — small, fast
  { src: hp(23), layer: 3, top: '65%', left: '25vw' },
  { src: hp(24), layer: 3, top: '8%', left: '115vw' },
  { src: hp(25), layer: 3, top: '70%', left: '200vw' },
  { src: hp(0), layer: 3, top: '15%', left: '340vw' },
  { src: hp(1), layer: 3, top: '60%', left: '440vw' },
  { src: hp(2), layer: 3, top: '30%', left: '500vw' },
  { src: hp(3), layer: 3, top: '72%', left: '580vw' },
  { src: hp(4), layer: 3, top: '12%', left: '660vw' },
  { src: hp(5), layer: 3, top: '55%', left: '730vw' },
];

// Speed multiplier per layer: back=slowest, front=fastest
const LAYER_SPEED = [0.2, 0.4, 0.65, 1.0];
const LAYER_CLASS = ['tl-ag-img-xl', 'tl-ag-img-lg', 'tl-ag-img-md', 'tl-ag-img-sm'];

function AthletesGallery() {
  const sectionRef = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const section = sectionRef.current;
        const track = trackRef.current;
        if (!section || !track) { ticking = false; return; }

        const rect = section.getBoundingClientRect();
        const sectionH = section.offsetHeight;
        const vh = window.innerHeight;
        const scrolled = -rect.top;

        const fadeStart = vh * 0.2;
        const fadeEnd = vh * 0.7;
        const moveStart = fadeEnd;

        // Start at 0.06 so images are always barely visible as a hint
        const rawFade = scrolled <= fadeStart ? 0
          : scrolled >= fadeEnd ? 1
          : (scrolled - fadeStart) / (fadeEnd - fadeStart);
        const fadeOpacity = 0.06 + rawFade * 0.94;

        track.style.opacity = fadeOpacity;

        if (hintRef.current) {
          hintRef.current.style.opacity = Math.max(0, 1 - rawFade * 3);
        }

        const moveProgress = scrolled <= moveStart ? 0
          : Math.min((scrolled - moveStart) / (sectionH - vh - moveStart), 1);

        const totalTravel = track.scrollWidth - vh;

        const images = track.querySelectorAll('.tl-ag-img');
        images.forEach((img) => {
          const speed = parseFloat(img.dataset.speed);
          const x = -moveProgress * totalTravel * speed;
          img.style.transform = `translate3d(${x}px, 0, 0)`;
        });

        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const hintRef = useRef(null);

  return (
    <section className="tl-ag" ref={sectionRef}>
      <div className="tl-ag-sticky">
        <div className="tl-ag-track" ref={trackRef}>
          {ATHLETE_IMAGES.map((img, i) => (
            <div
              key={i}
              className={`tl-ag-img ${LAYER_CLASS[img.layer]}`}
              data-speed={LAYER_SPEED[img.layer]}
              style={{ top: img.top, left: img.left }}
            >
              <img src={img.src} alt="" loading="lazy" />
            </div>
          ))}
        </div>
        <div className="tl-ag-overlay" />
        <p className="tl-ag-quote">
          En busca de la grandeza<br />
          que admiro en otros.
        </p>
        <div className="tl-ag-scroll-hint" ref={hintRef}>
          <div className="tl-ag-scroll-line" />
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   NAV
   ═══════════════════════════════════════════ */
const NAV_LINKS = [
  { label: 'Creadores', href: '/creators' },
  { label: 'Devs', href: '/developers' },
];

function Nav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <nav className="tl-nav">
      <a href="/" className="tl-nav-logo">
        <img src={wakeLogotype} alt="Wake" />
      </a>

      {/* Desktop links */}
      <div className="tl-nav-links">
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className="tl-nav-link">{link.label}</a>
        ))}
        <a href="/app" className="tl-nav-cta">Ir a la app</a>
      </div>

      {/* Mobile: CTA + hamburger */}
      <div className="tl-nav-mobile-right">
        <a href="/app" className="tl-nav-mobile-cta">Ir a la app</a>
        <button
          type="button"
          className="tl-nav-burger"
          onClick={() => setOpen(true)}
          aria-label="Menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="tl-nav-overlay" onClick={() => setOpen(false)} />
          <div className="tl-nav-drawer">
            <button
              type="button"
              className="tl-nav-close"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="tl-nav-drawer-links">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} className="tl-nav-drawer-link">{link.label}</a>
              ))}
              <a href="/app" className="tl-nav-drawer-cta">Ir a la app</a>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}

/* ═══════════════════════════════════════════
   CTA SECTION
   ═══════════════════════════════════════════ */
function CtaSection() {
  return (
    <section className="tl-cta">
      <a href="/app" className="tl-cta-button">Empieza a entrenar</a>
    </section>
  );
}

/* ═══════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════ */
function LandingFooter() {
  return (
    <footer className="tl-footer">
      <div className="tl-footer-top">
        <div className="tl-footer-brand">
          <img src={wakeLogo} alt="Wake" className="tl-footer-logo" />
        </div>
        <div className="tl-footer-links">
          <a href="/app" className="tl-footer-link">App</a>
          <a href="/creators" className="tl-footer-link">Creadores</a>
          <a href="/support" className="tl-footer-link">Soporte</a>
          <a href="/legal" className="tl-footer-link">Legal</a>
        </div>
      </div>
      <div className="tl-footer-bottom">
        <span className="tl-footer-copy">&copy; {new Date().getFullYear()} Wake. Todos los derechos reservados.</span>
        <a href="mailto:emilioloboguerrero@gmail.com" className="tl-footer-email">emilioloboguerrero@gmail.com</a>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════ */
export default function TestLandingScreen() {
  const [images, setImages] = useState(FALLBACK_IMAGES);
  const [current, setCurrent] = useState(0);
  const [heroOpacity, setHeroOpacity] = useState(1);

  useEffect(() => {
    getMainHeroLandingImages().then((imgs) => {
      if (imgs.length > 0) setImages(imgs);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => {
      setCurrent((i) => (i + 1) % images.length);
    }, SLIDE_INTERVAL);
    return () => clearInterval(id);
  }, [images.length]);

  // Fade hero on scroll
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const vh = window.innerHeight;
        const y = window.scrollY || window.pageYOffset;
        const fadeStart = vh * 0.3;
        const fadeEnd = vh * 0.85;
        const p = Math.min(Math.max((y - fadeStart) / (fadeEnd - fadeStart), 0), 1);
        setHeroOpacity(1 - p);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="test-landing">
      <Nav />
      <section className="tl-hero">
        <div
          className="tl-slideshow"
          style={{ opacity: heroOpacity }}
        >
          {images.map((url, i) => (
            <div
              key={url}
              className={`tl-slide ${i === current ? 'tl-slide-active' : ''}`}
            >
              <img src={url} alt="" />
            </div>
          ))}
          <div className="tl-slideshow-overlay" />
        </div>
        <img
          src={wakeIcon}
          alt=""
          className="tl-hero-icon"
          aria-hidden="true"
          style={{ opacity: 0.22 * heroOpacity }}
        />
        <h1
          className="tl-hero-statement"
          style={{ opacity: heroOpacity }}
        >
          Sé lo que admiras.
        </h1>
      </section>

      <div className="tl-transition" />
      <BeliefSection />
      <ScrollFlowSection />
      <AthletesGallery />
      <RevealSection />
      <CtaSection />
      <LandingFooter />
    </div>
  );
}
