import React from 'react';
import { motion } from 'motion/react';
import { Nav, LandingFooter } from './ShowcaseLandingScreen';
import './CreadoresLandingScreen.css';

const SPRING = [0.22, 1, 0.36, 1];

/* ═══════════════════════════════════════════
   WINDOW FRAME — shared chrome
   ═══════════════════════════════════════════ */
const WindowFrame = React.forwardRef(function WindowFrame({ label, children, className = '' }, ref) {
  return (
    <div ref={ref} className={`cl-window ${className}`}>
      <div className="cl-window-chrome">
        <div className="cl-window-dots" aria-hidden="true">
          <span /><span /><span />
        </div>
        <span className="cl-window-label">{label}</span>
      </div>
      <div className="cl-window-body">{children}</div>
    </div>
  );
});

/* ═══════════════════════════════════════════
   SHARED SNAPSHOT BLOCKS
   ═══════════════════════════════════════════ */
function SearchInput({ placeholder }) {
  return (
    <div className="cl-snap-search">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span>{placeholder}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SECTION 1 — EXERCISE EDITOR (Biblioteca · Ejercicios)
   ═══════════════════════════════════════════ */
const EXERCISE_LIST = [
  'Press de banca',
  'Hip thrust con sandbag',
  'Sentadilla búlgara',
  'Peso muerto rumano',
  'Remo con mancuerna',
  'Dominadas pronas',
  'Press militar',
  'Curl martillo',
  'Face pulls',
];

const EXERCISE_MUSCLES = [
  { name: 'Pectoral mayor', pct: 80 },
  { name: 'Tríceps', pct: 55 },
  { name: 'Deltoides anterior', pct: 35 },
];

function ExerciseEditorWindow() {
  return (
    <WindowFrame label="Biblioteca · Ejercicios">
      <div className="cl-snap">
        <aside className="cl-snap-side">
          <SearchInput placeholder="Buscar ejercicio" />
          <button type="button" className="cl-snap-add">+ Nuevo ejercicio</button>
          <div className="cl-snap-list">
            {EXERCISE_LIST.map((name, i) => (
              <div key={name} className={`cl-snap-item ${i === 0 ? 'cl-snap-item-active' : ''}`}>
                <span className="cl-snap-item-dot" />
                <span className="cl-snap-item-label">{name}</span>
              </div>
            ))}
          </div>
        </aside>
        <div className="cl-snap-main">
          <div className="cl-ex-title-row">
            <h3 className="cl-ex-title">Press de banca</h3>
            <span className="cl-ex-status">Guardado</span>
          </div>

          <div className="cl-ex-grid">
            <div className="cl-ex-video">
              <div className="cl-ex-video-thumb">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              </div>
              <div className="cl-ex-video-meta">
                <span className="cl-ex-video-name">press-banca-demo.mp4</span>
                <span className="cl-ex-video-size">00:38 · 9.2 MB</span>
              </div>
            </div>

            <div className="cl-ex-card">
              <div className="cl-ex-card-title">Activación muscular</div>
              <div className="cl-ex-muscles">
                {EXERCISE_MUSCLES.map((m) => (
                  <div key={m.name} className="cl-ex-muscle">
                    <span className="cl-ex-muscle-name">{m.name}</span>
                    <div className="cl-ex-muscle-track">
                      <div className="cl-ex-muscle-fill" style={{ width: `${m.pct}%` }} />
                    </div>
                    <span className="cl-ex-muscle-pct">{m.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="cl-ex-card">
            <div className="cl-ex-card-title">Implementos</div>
            <div className="cl-ex-chips">
              <span className="cl-ex-chip">Barra olímpica</span>
              <span className="cl-ex-chip">Banco plano</span>
              <span className="cl-ex-chip">Discos 20kg</span>
              <span className="cl-ex-chip cl-ex-chip-add">+ Agregar</span>
            </div>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

/* ═══════════════════════════════════════════
   SECTION 2 — PROGRAM BUILDER (Plan · Semanas)
   ═══════════════════════════════════════════ */
const PB_WEEKS = [
  { label: 'Semana 1', sub: 'Adaptación' },
  { label: 'Semana 2', sub: 'Volumen base' },
  { label: 'Semana 3', sub: 'Volumen base' },
  { label: 'Semana 4', sub: 'Intensidad' },
  { label: 'Semana 5', sub: 'Intensidad' },
  { label: 'Semana 6', sub: 'Descarga' },
];

const PB_DAYS = [
  { day: 'Lun', name: 'Empuje', muscle: 'Pecho · Tríceps' },
  { day: 'Mar', name: 'Pierna', muscle: 'Cuádriceps · Glúteo' },
  { day: 'Mié', rest: true },
  { day: 'Jue', name: 'Jalón', muscle: 'Espalda · Bíceps' },
  { day: 'Vie', name: 'Pierna', muscle: 'Femoral · Glúteo' },
  { day: 'Sáb', name: 'Full body', muscle: 'Accesorios' },
  { day: 'Dom', rest: true },
];

function ProgramBuilderWindow() {
  return (
    <WindowFrame label="Programas · Fuerza total · 6 semanas">
      <div className="cl-snap">
        <aside className="cl-snap-side">
          <div className="cl-snap-side-title">Semanas</div>
          <div className="cl-snap-list">
            {PB_WEEKS.map((w, i) => (
              <div key={w.label} className={`cl-snap-item cl-pb-week ${i === 0 ? 'cl-snap-item-active' : ''}`}>
                <span className="cl-snap-item-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="cl-snap-item-meta">
                  <span className="cl-snap-item-label">{w.label}</span>
                  <span className="cl-snap-item-sub">{w.sub}</span>
                </span>
              </div>
            ))}
          </div>
          <button type="button" className="cl-snap-add">+ Añadir semana</button>
        </aside>
        <div className="cl-snap-main">
          <div className="cl-pb-head">
            <h3 className="cl-pb-title">Semana 1 · Adaptación</h3>
            <span className="cl-pb-tag">5 sesiones · 4h 20min</span>
          </div>

          <div className="cl-pb-week-grid">
            {PB_DAYS.map((d) => (
              <div key={d.day} className={`cl-pb-day ${d.rest ? 'cl-pb-day-rest' : ''}`}>
                <span className="cl-pb-day-label">{d.day}</span>
                {d.rest ? (
                  <span className="cl-pb-day-rest-label">Descanso</span>
                ) : (
                  <>
                    <span className="cl-pb-day-name">{d.name}</span>
                    <span className="cl-pb-day-muscle">{d.muscle}</span>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="cl-pb-section-title">Lunes · Empuje</div>
          <div className="cl-pb-exercises">
            {[
              { name: 'Press de banca', scheme: '4 × 8 @ 80%' },
              { name: 'Press inclinado mancuernas', scheme: '3 × 10 @ 70%' },
              { name: 'Fondos en paralelas', scheme: '3 × AMRAP' },
              { name: 'Face pulls', scheme: '3 × 15' },
            ].map((ex) => (
              <div key={ex.name} className="cl-pb-ex">
                <span className="cl-pb-ex-handle" aria-hidden="true">≡</span>
                <span className="cl-pb-ex-name">{ex.name}</span>
                <span className="cl-pb-ex-scheme">{ex.scheme}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

/* ═══════════════════════════════════════════
   SECTION 3 — NUTRITION PLAN (Nutrición · Planes)
   ═══════════════════════════════════════════ */
const NP_PLANS = [
  { name: 'Definición', kcal: 2000 },
  { name: 'Volumen limpio', kcal: 3200 },
  { name: 'Mantenimiento', kcal: 2500 },
  { name: 'Recomposición', kcal: 2200 },
  { name: 'Cutting agresivo', kcal: 1700 },
];

const NP_MEALS = [
  {
    name: 'Desayuno',
    kcal: 480,
    foods: [
      { food: 'Huevos enteros', qty: '3 unid · 210 kcal' },
      { food: 'Avena en hojuelas', qty: '60g · 220 kcal' },
      { food: 'Frutos rojos', qty: '80g · 50 kcal' },
    ],
  },
  {
    name: 'Almuerzo',
    kcal: 720,
    foods: [
      { food: 'Pechuga de pollo', qty: '180g · 280 kcal' },
      { food: 'Arroz integral', qty: '120g · 140 kcal' },
      { food: 'Aguacate', qty: '½ · 160 kcal' },
      { food: 'Vegetales mixtos', qty: '200g · 80 kcal' },
    ],
  },
  {
    name: 'Cena',
    kcal: 560,
    foods: [
      { food: 'Salmón al horno', qty: '160g · 320 kcal' },
      { food: 'Quinoa cocida', qty: '90g · 110 kcal' },
      { food: 'Espinaca salteada', qty: '150g · 70 kcal' },
    ],
  },
];

function NutritionPlanWindow() {
  return (
    <WindowFrame label="Nutrición · Planes">
      <div className="cl-snap">
        <aside className="cl-snap-side">
          <div className="cl-snap-tabs">
            <span className="cl-snap-tab cl-snap-tab-active">Planes</span>
            <span className="cl-snap-tab">Recetas</span>
          </div>
          <SearchInput placeholder="Buscar plan" />
          <div className="cl-snap-list">
            {NP_PLANS.map((p, i) => (
              <div key={p.name} className={`cl-snap-item cl-np-plan ${i === 0 ? 'cl-snap-item-active' : ''}`}>
                <span className="cl-snap-item-meta">
                  <span className="cl-snap-item-label">{p.name}</span>
                  <span className="cl-snap-item-sub">{p.kcal.toLocaleString()} kcal · día</span>
                </span>
              </div>
            ))}
          </div>
        </aside>
        <div className="cl-snap-main">
          <div className="cl-np-head">
            <div>
              <h3 className="cl-np-title">Plan Definición</h3>
              <p className="cl-np-sub">Déficit moderado · 5 comidas · 7 días</p>
            </div>
            <div className="cl-np-kcal">
              <span className="cl-np-kcal-num">2.000</span>
              <span className="cl-np-kcal-label">kcal / día</span>
            </div>
          </div>

          <div className="cl-np-macros">
            <div className="cl-np-macro">
              <span className="cl-np-macro-dot" style={{ background: 'rgba(135, 230, 175, 0.85)' }} />
              <span className="cl-np-macro-label">Proteína</span>
              <span className="cl-np-macro-value">160g</span>
            </div>
            <div className="cl-np-macro">
              <span className="cl-np-macro-dot" style={{ background: 'rgba(135, 180, 255, 0.85)' }} />
              <span className="cl-np-macro-label">Carbohidratos</span>
              <span className="cl-np-macro-value">200g</span>
            </div>
            <div className="cl-np-macro">
              <span className="cl-np-macro-dot" style={{ background: 'rgba(255, 190, 130, 0.85)' }} />
              <span className="cl-np-macro-label">Grasa</span>
              <span className="cl-np-macro-value">67g</span>
            </div>
          </div>

          <div className="cl-np-meals">
            {NP_MEALS.map((meal) => (
              <div key={meal.name} className="cl-np-meal">
                <div className="cl-np-meal-head">
                  <span className="cl-np-meal-name">{meal.name}</span>
                  <span className="cl-np-meal-kcal">{meal.kcal} kcal</span>
                </div>
                <div className="cl-np-meal-foods">
                  {meal.foods.map((f) => (
                    <div key={f.food} className="cl-np-food">
                      <span className="cl-np-food-name">{f.food}</span>
                      <span className="cl-np-food-qty">{f.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

/* ═══════════════════════════════════════════
   SECTION 4 — DUAL MODE (Programas y clientes)
   ═══════════════════════════════════════════ */
const DM_CLIENTS = [
  { name: 'Juan Pérez', plan: 'Hipertrofia', status: 'active' },
  { name: 'María Restrepo', plan: 'Pérdida de grasa', status: 'active' },
  { name: 'Carlos Vélez', plan: 'Powerlifting', status: 'active' },
  { name: 'Ana Lozano', plan: 'Recomposición', status: 'idle' },
  { name: 'Luis Marín', plan: 'Acondicionamiento', status: 'idle' },
  { name: 'Diana Cárdenas', plan: 'Hipertrofia', status: 'active' },
];

function DualModeWindow() {
  return (
    <WindowFrame label="Programas · Clientes">
      <div className="cl-snap">
        <aside className="cl-snap-side">
          <div className="cl-snap-side-title">Clientes <span className="cl-snap-side-count">{DM_CLIENTS.length}</span></div>
          <SearchInput placeholder="Buscar cliente" />
          <div className="cl-snap-list">
            {DM_CLIENTS.map((c, i) => (
              <div key={c.name} className={`cl-snap-item cl-dm-client ${i === 0 ? 'cl-snap-item-active' : ''}`}>
                <span className="cl-dm-avatar">{c.name.charAt(0)}</span>
                <span className="cl-snap-item-meta">
                  <span className="cl-snap-item-label">{c.name}</span>
                  <span className="cl-snap-item-sub">{c.plan}</span>
                </span>
                <span className={`cl-dm-dot ${c.status === 'active' ? 'cl-dm-dot-active' : ''}`} />
              </div>
            ))}
          </div>
        </aside>
        <div className="cl-snap-main">
          <div className="cl-dm-client-head">
            <div className="cl-dm-client-id">
              <span className="cl-dm-avatar cl-dm-avatar-lg">J</span>
              <div>
                <h3 className="cl-dm-client-name">Juan Pérez</h3>
                <span className="cl-dm-client-meta">Hipertrofia · Semana 4 de 8</span>
              </div>
            </div>
            <span className="cl-dm-status">Activo</span>
          </div>

          <div className="cl-dm-actions">
            <span className="cl-dm-action">Asignar sesión</span>
            <span className="cl-dm-action">Agendar llamada</span>
            <span className="cl-dm-action">Ver programa</span>
          </div>

          <div className="cl-dm-tabs">
            <span className="cl-dm-tab cl-dm-tab-active">Planificación</span>
            <span className="cl-dm-tab">Nutrición</span>
            <span className="cl-dm-tab">Lab</span>
            <span className="cl-dm-tab">Llamadas</span>
          </div>

          <div className="cl-dm-week">
            {[
              { d: 'L', name: 'Empuje', tone: 'on' },
              { d: 'M', name: 'Pierna', tone: 'on' },
              { d: 'M', name: '—', tone: 'off' },
              { d: 'J', name: 'Jalón', tone: 'on' },
              { d: 'V', name: 'Pierna', tone: 'on' },
              { d: 'S', name: 'Full', tone: 'on' },
              { d: 'D', name: '—', tone: 'off' },
            ].map((d, i) => (
              <div key={i} className={`cl-dm-day cl-dm-day-${d.tone}`}>
                <span className="cl-dm-day-letter">{d.d}</span>
                <span className="cl-dm-day-session">{d.name}</span>
              </div>
            ))}
          </div>

          <div className="cl-dm-stats">
            <div className="cl-dm-stat">
              <span className="cl-dm-stat-num">86%</span>
              <span className="cl-dm-stat-label">Adherencia 30d</span>
            </div>
            <div className="cl-dm-stat">
              <span className="cl-dm-stat-num">+4.2 kg</span>
              <span className="cl-dm-stat-label">Press de banca</span>
            </div>
            <div className="cl-dm-stat">
              <span className="cl-dm-stat-num">3</span>
              <span className="cl-dm-stat-label">Llamadas próximas</span>
            </div>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

/* ═══════════════════════════════════════════
   SECTION ROW — heading + body + window
   ═══════════════════════════════════════════ */
function SectionRow({ heading, body, children, reverse = false }) {
  return (
    <section className={`cl-section ${reverse ? 'cl-section-reverse' : ''}`}>
      <div className="cl-section-inner">
        <div className="cl-section-copy">
          <motion.h2
            className="cl-section-heading"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 0.6, ease: SPRING }}
          >
            {heading}
          </motion.h2>
          <motion.p
            className="cl-section-body"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ duration: 0.6, delay: 0.1, ease: SPRING }}
          >
            {body}
          </motion.p>
        </div>
        <motion.div
          className="cl-section-window"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={{ duration: 0.7, ease: SPRING }}
        >
          {children}
        </motion.div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════ */
function Hero() {
  return (
    <section className="cl-hero">
      <div className="cl-hero-aurora" aria-hidden="true" />
      <div className="cl-hero-inner">
        <motion.h1
          className="cl-hero-title"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: SPRING }}
        >
          La plataforma del rendimiento.
        </motion.h1>
        <motion.p
          className="cl-hero-sub"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: SPRING }}
        >
          Construye y vende tus programas de entrenamiento.
        </motion.p>
        <motion.a
          href="/creators"
          className="cl-hero-cta"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: SPRING }}
        >
          Empieza a construir
        </motion.a>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   CLOSE
   ═══════════════════════════════════════════ */
function Close() {
  return (
    <section className="cl-close">
      <div className="cl-close-aurora" aria-hidden="true" />
      <motion.a
        href="/creators"
        className="cl-close-cta"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: '-20%' }}
        transition={{ duration: 0.7, ease: SPRING }}
      >
        Bienvenido al parche
      </motion.a>
    </section>
  );
}

/* ═══════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════ */
export default function CreadoresLandingScreen() {
  return (
    <div className="cl">
      <Nav />
      <Hero />
      <SectionRow
        heading="Diseña cada ejercicio a tu manera."
        body="Define la activación muscular, los implementos y la técnica de cada uno."
      >
        <ExerciseEditorWindow />
      </SectionRow>
      <SectionRow
        heading="Construye el programa, semana por semana."
        body="Arma las sesiones, los ejercicios y las series de cada semana."
        reverse
      >
        <ProgramBuilderWindow />
      </SectionRow>
      <SectionRow
        heading="Diseña cómo comen tus clientes."
        body="Ajusta los macros, los alimentos y las porciones de cada comida."
      >
        <NutritionPlanWindow />
      </SectionRow>
      <SectionRow
        heading="Vende a muchos o entrena uno-a-uno."
        body="Programa general para tu audiencia, o uno-a-uno con cada cliente."
        reverse
      >
        <DualModeWindow />
      </SectionRow>
      <Close />
      <LandingFooter />
    </div>
  );
}
