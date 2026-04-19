import React, { useState } from 'react';
import { motion } from 'motion/react';
import { LandingFooter } from './ShowcaseLandingScreen';
import MuscleSilhouetteSVG from '../components/MuscleSilhouetteSVG';
import CascadeText from '../components/CascadeText';
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
   SECTION 1 — EXERCISE EDITOR
   Replica: LibraryExercisesScreen
   ═══════════════════════════════════════════ */
const EXERCISES = [
  {
    name: 'Press de banca',
    implements: ['Barra olímpica', 'Banco plano', 'Discos 20kg'],
    muscles: { pecs: 0.95, front_delts: 0.65, triceps: 0.6, side_delts: 0.2, abs: 0.15 },
  },
  {
    name: 'Sentadilla trasera',
    implements: ['Barra olímpica', 'Rack de sentadilla', 'Discos 25kg'],
    muscles: { quads: 0.95, glutes: 0.75, hamstrings: 0.4, abs: 0.3, lower_back: 0.35, calves: 0.25 },
  },
  {
    name: 'Peso muerto convencional',
    implements: ['Barra olímpica', 'Discos 25kg', 'Straps'],
    muscles: { hamstrings: 0.9, glutes: 0.85, lower_back: 0.8, traps: 0.5, lats: 0.4, forearms: 0.55, quads: 0.3 },
  },
  {
    name: 'Dominadas prona',
    implements: ['Barra de dominadas'],
    muscles: { lats: 0.95, biceps: 0.7, rear_delts: 0.45, rhomboids: 0.55, forearms: 0.5, traps: 0.35 },
  },
  {
    name: 'Press militar de pie',
    implements: ['Barra olímpica', 'Discos 10kg', 'Cinturón'],
    muscles: { front_delts: 0.9, side_delts: 0.6, triceps: 0.55, traps: 0.45, abs: 0.35 },
  },
];

function ExerciseEditorWindow() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const exercise = EXERCISES[selectedIndex];

  return (
    <WindowFrame label="Biblioteca · Fuerza">
      <div className="cl-lex">
        {/* Sidebar */}
        <aside className="cl-lex-sidebar">
          <div className="cl-lex-sidebar-head">
            <span className="cl-lex-sidebar-title">Ejercicios</span>
            <span className="cl-lex-sidebar-add">+</span>
          </div>
          <div className="cl-lex-sidebar-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <span>Buscar</span>
          </div>
          <div className="cl-lex-sidebar-list">
            {EXERCISES.map((ex, i) => (
              <button
                type="button"
                key={ex.name}
                className={`cl-lex-sidebar-item ${i === selectedIndex ? 'cl-lex-sidebar-item-active' : ''}`}
                onClick={() => setSelectedIndex(i)}
              >
                <span className="cl-lex-sidebar-item-name">{ex.name}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Workspace */}
        <div className="cl-lex-workspace">
          <div className="cl-lex-workspace-head">
            <h3 className="cl-lex-workspace-title">{exercise.name}</h3>
          </div>
          <div className="cl-lex-workspace-columns">
            {/* Video panel */}
            <div className="cl-lex-video">
              <div className="cl-lex-video-thumb">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              </div>
              <span className="cl-lex-video-source">YOUTUBE</span>
              <div className="cl-lex-video-actions">
                <span className="cl-lex-video-action">Cambiar</span>
                <span className="cl-lex-video-action">Eliminar</span>
              </div>
            </div>

            {/* Muscle panel */}
            <div className="cl-lex-muscle-card">
              <div className="cl-lex-muscle-left">
                <MuscleSilhouetteSVG muscleVolumes={exercise.muscles} />
              </div>
            </div>
          </div>

          <div className="cl-lex-implements">
            <span className="cl-lex-implements-title">Implementos</span>
            <div className="cl-lex-implements-pills">
              {exercise.implements.map((imp) => (
                <span key={imp} className="cl-lex-pill">{imp}</span>
              ))}
              <span className="cl-lex-pill-add">+</span>
            </div>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

/* ═══════════════════════════════════════════
   SECTION 2 — PROGRAM BUILDER
   Replica: PlanWeeksGrid
   ═══════════════════════════════════════════ */
const PB_WEEK_1 = [
  { title: 'Empuje A', linked: true },
  { title: 'Pierna fuerza', linked: true },
  null,
  { title: 'Jalón A', linked: true },
  { title: 'Pierna hipertrofia', linked: false },
  { title: 'Full body', linked: true },
  null,
];
const PB_WEEK_2 = [
  { title: 'Empuje B', linked: true },
  { title: 'Pierna potencia', linked: true },
  { title: 'Accesorios', linked: false },
  { title: 'Jalón B', linked: true },
  null,
  { title: 'Full body', linked: true },
  null,
];

function ProgramBuilderWindow() {
  const renderSessionCard = (s, key) => {
    if (!s) {
      return (
        <div key={key} className="cl-pb-cell cl-pb-cell-empty">
          <span>Arrastra o crea</span>
        </div>
      );
    }
    return (
      <div key={key} className={`cl-pb-cell cl-pb-cell-session ${s.linked ? 'cl-pb-cell-linked' : 'cl-pb-cell-local'}`}>
        <span className="cl-pb-session-icon" aria-hidden="true">
          {s.linked ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </span>
        <span className="cl-pb-session-title">{s.title}</span>
        <span className="cl-pb-session-dots" aria-hidden="true">⋮</span>
      </div>
    );
  };

  return (
    <WindowFrame label="Plan · Hipertrofia 8 semanas">
      <div className="cl-pb">
        <div className="cl-pb-head">
          <span className="cl-pb-volume">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 3v9h9" /><path d="M18 18.5L12 12" />
            </svg>
            Volumen
          </span>
          <span className="cl-pb-add">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Añadir semana
          </span>
        </div>

        <div className="cl-pb-days-header">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <div key={d} className="cl-pb-days-cell">Día {d}</div>
          ))}
        </div>

        {[{ title: 'Semana 1', week: PB_WEEK_1 }, { title: 'Semana 2', week: PB_WEEK_2 }].map((block) => (
          <div key={block.title} className="cl-pb-week">
            <div className="cl-pb-week-head">
              <span className="cl-pb-week-title">{block.title}</span>
              <span className="cl-pb-week-dots" aria-hidden="true">⋮</span>
            </div>
            <div className="cl-pb-week-days">
              {block.week.map((s, i) => renderSessionCard(s, i))}
            </div>
          </div>
        ))}
      </div>
    </WindowFrame>
  );
}

/* ═══════════════════════════════════════════
   SECTION 3 — NUTRITION PLAN
   Replica: NutritionScreen
   ═══════════════════════════════════════════ */
const NP_LIST = [
  { name: 'Plan definición', kcal: 2000, meta: 'Déficit moderado' },
  { name: 'Volumen limpio', kcal: 3200, meta: 'Superávit controlado' },
  { name: 'Recomposición', kcal: 2400, meta: 'Isocalórico' },
  { name: 'Cutting agresivo', kcal: 1700, meta: 'Déficit profundo' },
  { name: 'Mantenimiento', kcal: 2500, meta: 'Estable' },
];

const NP_CATEGORIES = [
  { label: 'Desayuno', count: 3 },
  { label: 'Media mañana', count: 2 },
  { label: 'Almuerzo', count: 4 },
  { label: 'Merienda', count: 2 },
  { label: 'Cena', count: 3 },
];

function MacroRing({ percent, color, size = 56 }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (percent / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="cl-np-ring-svg" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function NutritionPlanWindow() {
  return (
    <WindowFrame label="Nutrición">
      <div className="cl-np">
        {/* Top bar */}
        <div className="cl-np-topbar">
          <div className="cl-np-tabs">
            <span className="cl-np-tab">Recetas</span>
            <span className="cl-np-tab cl-np-tab-active">Planes</span>
          </div>
          <span className="cl-np-create">
            <span className="cl-np-create-plus">+</span>
            Crear plan
          </span>
        </div>

        {/* 3-panel layout */}
        <div className="cl-np-panels">
          {/* Left */}
          <aside className="cl-np-left">
            <div className="cl-np-search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              <span>Buscar planes…</span>
            </div>
            <div className="cl-np-list">
              {NP_LIST.map((p, i) => (
                <div key={p.name} className={`cl-np-list-card ${i === 0 ? 'cl-np-list-card-active' : ''}`}>
                  <span className="cl-np-list-name">{p.name}</span>
                  <span className="cl-np-list-kcal">{p.kcal.toLocaleString()} kcal</span>
                  <span className="cl-np-list-meta">{p.meta}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* Center */}
          <section className="cl-np-center">
            <div className="cl-np-detail-header">
              <h3 className="cl-np-detail-title">Plan definición</h3>
              <p className="cl-np-detail-desc">Déficit moderado · 5 comidas al día · distribución flexible</p>
              <span className="cl-np-edit">Editar</span>
            </div>

            <div className="cl-np-categories">
              {NP_CATEGORIES.map((c) => (
                <div key={c.label} className="cl-np-category">
                  <span className="cl-np-category-label">{c.label}</span>
                  <span className="cl-np-category-count">{c.count} opciones</span>
                </div>
              ))}
            </div>
          </section>

          {/* Right */}
          <aside className="cl-np-right">
            <div className="cl-np-macros-panel">
              <div className="cl-np-calories">
                <span className="cl-np-calories-val">2.000</span>
                <span className="cl-np-calories-unit">kcal</span>
              </div>
              <div className="cl-np-rings">
                <div className="cl-np-ring-row">
                  <MacroRing percent={72} color="rgba(100,200,150,0.85)" />
                  <div className="cl-np-ring-info">
                    <span className="cl-np-ring-label">Prot</span>
                    <span className="cl-np-ring-val">160 g</span>
                  </div>
                </div>
                <div className="cl-np-ring-row">
                  <MacroRing percent={55} color="rgba(100,160,240,0.85)" />
                  <div className="cl-np-ring-info">
                    <span className="cl-np-ring-label">Carbs</span>
                    <span className="cl-np-ring-val">200 g</span>
                  </div>
                </div>
                <div className="cl-np-ring-row">
                  <MacroRing percent={40} color="rgba(240,160,80,0.85)" />
                  <div className="cl-np-ring-info">
                    <span className="cl-np-ring-label">Grasa</span>
                    <span className="cl-np-ring-val">67 g</span>
                  </div>
                </div>
              </div>
              <div className="cl-np-totals">
                <div className="cl-np-total-row">
                  <span className="cl-np-total-dot" style={{ background: 'rgba(100,200,150,0.85)' }} />
                  <span className="cl-np-total-name">Proteína</span>
                  <span className="cl-np-total-val">160 g</span>
                </div>
                <div className="cl-np-total-row">
                  <span className="cl-np-total-dot" style={{ background: 'rgba(100,160,240,0.85)' }} />
                  <span className="cl-np-total-name">Carbohidratos</span>
                  <span className="cl-np-total-val">200 g</span>
                </div>
                <div className="cl-np-total-row">
                  <span className="cl-np-total-dot" style={{ background: 'rgba(240,160,80,0.85)' }} />
                  <span className="cl-np-total-name">Grasa</span>
                  <span className="cl-np-total-val">67 g</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </WindowFrame>
  );
}

/* ═══════════════════════════════════════════
   SECTION 4 — PROGRAMS & CLIENTS
   Replica: ProgramsAndClientsScreen
   ═══════════════════════════════════════════ */
const DM_CLIENTS = [
  { name: 'Juan Pérez', active: true },
  { name: 'María Restrepo', active: true },
  { name: 'Carlos Vélez', active: true },
  { name: 'Ana Lozano', active: true },
  { name: 'Diana Cárdenas', active: true },
  { name: 'Luis Marín', active: false },
  { name: 'Pablo Henao', active: true },
  { name: 'Sofía Arango', active: false },
];

const DM_WEEK = [
  { day: 'Lun', session: 'Empuje A' },
  { day: 'Mar', session: 'Pierna fuerza' },
  { day: 'Mié', session: null },
  { day: 'Jue', session: 'Jalón A' },
  { day: 'Vie', session: 'Pierna hipertrofia' },
  { day: 'Sáb', session: 'Full body' },
  { day: 'Dom', session: null },
];

function ConsistencyRing({ percent }) {
  const size = 44;
  const r = 18;
  const c = 2 * Math.PI * r;
  const dash = c * (percent / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.75)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="9" fontWeight="700">
        {percent}%
      </text>
    </svg>
  );
}

function DualModeWindow() {
  return (
    <WindowFrame label="Clientes">
      <div className="cl-dm">
        {/* Roster */}
        <aside className="cl-dm-roster">
          <div className="cl-dm-roster-head">
            <div className="cl-dm-roster-search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              <span>Buscar cliente…</span>
            </div>
            <div className="cl-dm-roster-meta">
              <span className="cl-dm-roster-count">8 clientes</span>
              <span className="cl-dm-roster-add">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Agregar
              </span>
            </div>
          </div>
          <div className="cl-dm-roster-list">
            {DM_CLIENTS.map((c, i) => (
              <div key={c.name} className={`cl-dm-roster-row ${i === 0 ? 'cl-dm-roster-row-active' : ''}`}>
                {i === 0 && <span className="cl-dm-roster-accent" />}
                <span className="cl-dm-avatar">{c.name.charAt(0)}</span>
                <span className="cl-dm-roster-name">{c.name}</span>
                <span className={`cl-dm-status-dot ${c.active ? 'cl-dm-status-dot-on' : ''}`} />
              </div>
            ))}
          </div>
        </aside>

        {/* Profile */}
        <main className="cl-dm-profile">
          <div className="cl-dm-profile-top">
            <div className="cl-dm-identity">
              <span className="cl-dm-avatar cl-dm-avatar-lg">J</span>
              <div className="cl-dm-identity-info">
                <h3 className="cl-dm-identity-name">Juan Pérez</h3>
                <div className="cl-dm-identity-meta">
                  <span className="cl-dm-program-badge">Hipertrofia 8 semanas</span>
                  <span className="cl-dm-status-dot cl-dm-status-dot-on" />
                  <span className="cl-dm-status-label">Activo</span>
                </div>
              </div>
            </div>

            <div className="cl-dm-highlight">
              <div className="cl-dm-highlight-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="cl-dm-highlight-label">Último PR</span>
                <span className="cl-dm-highlight-value">Press 92.5 kg</span>
                <span className="cl-dm-highlight-sub">Hace 3 días</span>
              </div>
              <div className="cl-dm-highlight-item">
                <ConsistencyRing percent={86} />
                <span className="cl-dm-highlight-label">Consistencia</span>
                <span className="cl-dm-highlight-value">86%</span>
                <span className="cl-dm-highlight-sub">Esta semana</span>
              </div>
              <div className="cl-dm-highlight-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M18 8H19C20.06 8 21.08 8.42 21.83 9.17C22.58 9.92 23 10.94 23 12C23 13.06 22.58 14.08 21.83 14.83C21.08 15.58 20.06 16 19 16H18M18 8H2V17H18V8Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="cl-dm-highlight-label">Nutrición</span>
                <span className="cl-dm-highlight-value">92%</span>
                <span className="cl-dm-highlight-sub">Adherencia</span>
              </div>
            </div>

            <div className="cl-dm-actions">
              <span className="cl-dm-action">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Asignar sesión
              </span>
              <span className="cl-dm-action">Agendar llamada</span>
              <span className="cl-dm-action">Ver programa</span>
            </div>
          </div>

          <div className="cl-dm-tabs">
            <span className="cl-dm-tab cl-dm-tab-active">Planificación</span>
            <span className="cl-dm-tab">Nutrición</span>
            <span className="cl-dm-tab">Lab</span>
            <span className="cl-dm-tab">Llamadas</span>
          </div>

          <div className="cl-dm-week">
            {DM_WEEK.map((d) => (
              <div key={d.day} className="cl-dm-week-col">
                <span className="cl-dm-week-day">{d.day}</span>
                <div className="cl-dm-week-sessions">
                  {d.session ? (
                    <span className="cl-dm-week-chip">{d.session}</span>
                  ) : (
                    <span className="cl-dm-week-rest">Descanso</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </WindowFrame>
  );
}

/* ═══════════════════════════════════════════
   SECTION ROW — two-panel card
   ═══════════════════════════════════════════ */
function SectionRow({ heading, body, children, reverse = false }) {
  return (
    <section className="cl-section">
      <motion.div
        className={`cl-section-card ${reverse ? 'cl-section-card-reverse' : ''}`}
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.7, ease: SPRING }}
      >
        <div className="cl-section-copy">
          <h2 className="cl-section-heading">{heading}</h2>
          <CascadeText as="p" className="cl-section-body">{body}</CascadeText>
        </div>
        <div className="cl-section-window">{children}</div>
      </motion.div>
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
        <CascadeText as="h1" className="cl-hero-title">
          La plataforma del rendimiento.
        </CascadeText>
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
      <Hero />
      <SectionRow
        heading="Diseña cada ejercicio a tu manera."
        body="Define la activación muscular, los implementos y la técnica de cada uno."
      >
        <ExerciseEditorWindow />
      </SectionRow>
      <SectionRow
        heading="Construye el programa, semana por semana."
        body="Arma las sesiones y los días de cada semana, arrastra desde tu biblioteca."
        reverse
      >
        <ProgramBuilderWindow />
      </SectionRow>
      <SectionRow
        heading="Diseña cómo comen tus clientes."
        body="Ajusta los macros, las recetas y las categorías de cada plan de nutrición."
      >
        <NutritionPlanWindow />
      </SectionRow>
      <SectionRow
        heading="Vende a muchos o entrena uno-a-uno."
        body="Programa general para tu audiencia, o acompaña a cada cliente desde su perfil."
        reverse
      >
        <DualModeWindow />
      </SectionRow>
      <Close />
      <LandingFooter />
    </div>
  );
}
