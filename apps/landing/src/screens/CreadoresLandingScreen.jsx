import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { LandingFooter } from './ShowcaseLandingScreen';
import MuscleSilhouetteSVG from '../components/MuscleSilhouetteSVG';
import CascadeText from '../components/CascadeText';
import { getCreatorHeroClips } from '../services/creatorHeroClipsService';
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
   Replica: PlanningLibrarySidebar + PlanWeeksGrid
   ═══════════════════════════════════════════ */
const PB_LIBRARY_SESSIONS = [
  { id: 'lib-1', title: 'Empuje A', image: '/fallback/hero/IMG_3247.webp' },
  { id: 'lib-2', title: 'Empuje B', image: '/fallback/hero/IMG_3250.webp' },
  { id: 'lib-3', title: 'Pierna fuerza', image: '/fallback/hero/IMG_3257.webp' },
  { id: 'lib-4', title: 'Pierna hipertrofia', image: '/fallback/hero/IMG_9394.webp' },
  { id: 'lib-5', title: 'Pierna potencia', image: '/fallback/hero/IMG_9401.webp' },
  { id: 'lib-6', title: 'Jalón A', image: '/fallback/hero/IMG_9402.webp' },
  { id: 'lib-7', title: 'Jalón B', image: '/fallback/hero/IMG_3248.webp' },
  { id: 'lib-8', title: 'Full body', image: '/fallback/hero/IMG_3251.webp' },
  { id: 'lib-9', title: 'Accesorios', image: '/fallback/hero/IMG_3255.webp' },
  { id: 'lib-10', title: 'Core intensivo', image: '/fallback/hero/IMG_9391.webp' },
];

const PB_SESSION_IMAGE_BY_TITLE = PB_LIBRARY_SESSIONS.reduce((acc, s) => {
  acc[s.title] = s.image;
  return acc;
}, {});

const PB_LIBRARY_PLANS = [
  { id: 'plan-1', title: 'Hipertrofia 8 semanas' },
  { id: 'plan-2', title: 'Fuerza base 6 semanas' },
  { id: 'plan-3', title: 'Recomposición 12 semanas' },
  { id: 'plan-4', title: 'Potencia avanzada' },
];

const PB_INITIAL_WEEKS = [
  {
    id: 'w1',
    cells: [
      { title: 'Empuje A', linked: true },
      { title: 'Pierna fuerza', linked: true },
      null,
      { title: 'Jalón A', linked: true },
      { title: 'Pierna hipertrofia', linked: false },
      { title: 'Full body', linked: true },
      null,
    ],
  },
  {
    id: 'w2',
    cells: [
      { title: 'Empuje B', linked: true },
      { title: 'Pierna potencia', linked: true },
      { title: 'Accesorios', linked: false },
      { title: 'Jalón B', linked: true },
      null,
      { title: 'Full body', linked: true },
      null,
    ],
  },
];

function SessionCard({ session }) {
  const linked = !!session.linked;
  const image = session.image || PB_SESSION_IMAGE_BY_TITLE[session.title];
  const style = image
    ? {
        backgroundImage: `linear-gradient(to bottom, rgba(21,21,21,0.35) 0%, rgba(21,21,21,0.85) 100%), url(${image})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined;
  return (
    <div
      className={`cl-pb-cell cl-pb-cell-session ${linked ? 'cl-pb-cell-linked' : 'cl-pb-cell-local'} ${image ? 'cl-pb-cell-session-image' : ''}`}
      style={style}
    >
      <span className="cl-pb-session-icon" aria-hidden="true">
        {linked ? (
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
      <span className="cl-pb-session-title">{session.title}</span>
    </div>
  );
}

function ProgramBuilderWindow() {
  const [activeTab, setActiveTab] = useState('sessions');
  const [weeks, setWeeks] = useState(PB_INITIAL_WEEKS);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [dropPulseKey, setDropPulseKey] = useState(null);

  const handleLibraryDragStart = (e, item, kind) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify({ kind, ...item }));
    e.currentTarget.classList.add('cl-pb-lib-item-dragging');
  };
  const handleLibraryDragEnd = (e) => {
    e.currentTarget.classList.remove('cl-pb-lib-item-dragging');
  };

  const handleCellDragOver = (e, key) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverKey(key);
  };
  const handleCellDragLeave = () => setDragOverKey(null);

  const handleDropOnCell = (e, weekIdx, dayIdx) => {
    e.preventDefault();
    setDragOverKey(null);
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    if (!payload || payload.kind !== 'session') return;

    const key = `${weekIdx}:${dayIdx}`;
    setWeeks((prev) => prev.map((w, i) => {
      if (i !== weekIdx) return w;
      const cells = [...w.cells];
      cells[dayIdx] = { title: payload.title, linked: true, image: payload.image };
      return { ...w, cells };
    }));
    setDropPulseKey(key);
    setTimeout(() => setDropPulseKey((k) => (k === key ? null : k)), 600);
  };

  const activeList = activeTab === 'sessions' ? PB_LIBRARY_SESSIONS : PB_LIBRARY_PLANS;
  const dragHint = activeTab === 'sessions' ? 'Arrastra a un día' : 'Arrastra a una semana';

  return (
    <WindowFrame label="Plan · Hipertrofia 8 semanas">
      <div className="cl-pb-layout">
        {/* ── LEFT: LIBRARY SIDEBAR ─────────────────────────── */}
        <aside className="cl-pb-lib">
          <div className="cl-pb-lib-tabs">
            <button
              type="button"
              className={`cl-pb-lib-tab ${activeTab === 'sessions' ? 'cl-pb-lib-tab-active' : ''}`}
              onClick={() => setActiveTab('sessions')}
            >
              Sesiones
            </button>
            <button
              type="button"
              className={`cl-pb-lib-tab ${activeTab === 'plans' ? 'cl-pb-lib-tab-active' : ''}`}
              onClick={() => setActiveTab('plans')}
            >
              Planes
            </button>
          </div>

          <div className="cl-pb-lib-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <span>{activeTab === 'sessions' ? 'Buscar sesiones…' : 'Buscar planes…'}</span>
          </div>

          <div className="cl-pb-lib-hint">{dragHint}</div>

          <div className="cl-pb-lib-list">
            {activeList.map((item) => (
              <div
                key={item.id}
                className="cl-pb-lib-item"
                draggable
                onDragStart={(e) => handleLibraryDragStart(e, item, activeTab === 'sessions' ? 'session' : 'plan')}
                onDragEnd={handleLibraryDragEnd}
              >
                {item.image ? (
                  <img src={item.image} alt="" className="cl-pb-lib-item-thumb" />
                ) : (
                  <div className="cl-pb-lib-item-avatar">{item.title.charAt(0)}</div>
                )}
                <span className="cl-pb-lib-item-name">{item.title}</span>
                <span className="cl-pb-lib-item-grip" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M9 5h6M9 12h6M9 19h6" />
                  </svg>
                </span>
              </div>
            ))}
          </div>
        </aside>

        {/* ── RIGHT: WEEK GRID ──────────────────────────────── */}
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

          {weeks.map((week, weekIdx) => (
            <div key={week.id} className="cl-pb-week">
              <div className="cl-pb-week-head">
                <span className="cl-pb-week-title">Semana {weekIdx + 1}</span>
                <span className="cl-pb-week-dots" aria-hidden="true">⋮</span>
              </div>
              <div className="cl-pb-week-days">
                {week.cells.map((cell, dayIdx) => {
                  const key = `${weekIdx}:${dayIdx}`;
                  const isDragOver = dragOverKey === key;
                  const isPulsing = dropPulseKey === key;
                  if (!cell) {
                    return (
                      <div
                        key={dayIdx}
                        className={`cl-pb-cell cl-pb-cell-empty ${isDragOver ? 'cl-pb-cell-drag-over' : ''}`}
                        onDragOver={(e) => handleCellDragOver(e, key)}
                        onDragLeave={handleCellDragLeave}
                        onDrop={(e) => handleDropOnCell(e, weekIdx, dayIdx)}
                      >
                        <span>Arrastra o crea</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={dayIdx}
                      className={`cl-pb-cell-wrap ${isPulsing ? 'cl-pb-cell-wrap-pulse' : ''}`}
                      onDragOver={(e) => handleCellDragOver(e, key)}
                      onDragLeave={handleCellDragLeave}
                      onDrop={(e) => handleDropOnCell(e, weekIdx, dayIdx)}
                    >
                      <SessionCard session={cell} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </WindowFrame>
  );
}

/* ═══════════════════════════════════════════
   SECTION 3 — NUTRITION PLAN EDITOR
   Replica: PlanEditorScreen
   ═══════════════════════════════════════════ */
const NP_ALIMENTOS = [
  { id: 'a1', name: 'Pechuga de pollo', portion: '100 g', kcal: 165, p: 31, c: 0, f: 3.6 },
  { id: 'a2', name: 'Arroz blanco', portion: '100 g', kcal: 130, p: 2.7, c: 28, f: 0.3 },
  { id: 'a3', name: 'Huevo entero', portion: '1 u', kcal: 72, p: 6.3, c: 0.4, f: 4.8 },
  { id: 'a4', name: 'Avena', portion: '40 g', kcal: 150, p: 5, c: 27, f: 3 },
  { id: 'a5', name: 'Plátano', portion: '1 u', kcal: 105, p: 1.3, c: 27, f: 0.3 },
  { id: 'a6', name: 'Aguacate', portion: '½ u', kcal: 160, p: 2, c: 8, f: 15 },
  { id: 'a7', name: 'Almendras', portion: '30 g', kcal: 170, p: 6, c: 6, f: 15 },
  { id: 'a8', name: 'Yogur griego', portion: '200 g', kcal: 130, p: 20, c: 8, f: 2 },
  { id: 'a9', name: 'Atún en agua', portion: '100 g', kcal: 116, p: 26, c: 0, f: 1 },
  { id: 'a10', name: 'Brócoli', portion: '100 g', kcal: 35, p: 2.8, c: 7, f: 0.4 },
];

const NP_RECETAS = [
  { id: 'r1', name: 'Bowl de quinoa', count: 6, kcal: 520, p: 28, c: 72, f: 14 },
  { id: 'r2', name: 'Pollo con arroz', count: 4, kcal: 610, p: 55, c: 68, f: 10 },
  { id: 'r3', name: 'Smoothie verde', count: 5, kcal: 280, p: 22, c: 38, f: 5 },
  { id: 'r4', name: 'Ensalada ligera', count: 7, kcal: 340, p: 18, c: 22, f: 20 },
  { id: 'r5', name: 'Overnight oats', count: 5, kcal: 430, p: 24, c: 58, f: 12 },
  { id: 'r6', name: 'Wrap de atún', count: 6, kcal: 490, p: 32, c: 45, f: 18 },
];

const NP_INITIAL = [
  { id: 'c1', label: 'Desayuno', selected: 0, options: [
    { id: 'o1', label: 'Opc 1', items: [
      { name: 'Huevos', portion: '3 u', kcal: 216, p: 18.9, c: 1.2, f: 14.4 },
      { name: 'Avena', portion: '60 g', kcal: 225, p: 7.5, c: 40, f: 4.5 },
      { name: 'Plátano', portion: '1 u', kcal: 105, p: 1.3, c: 27, f: 0.3 },
    ] },
    { id: 'o2', label: 'Opc 2', items: [] },
  ] },
  { id: 'c2', label: 'Almuerzo', selected: 0, options: [
    { id: 'o1', label: 'Opc 1', items: [
      { name: 'Pechuga de pollo', portion: '200 g', kcal: 330, p: 62, c: 0, f: 7.2 },
      { name: 'Arroz blanco', portion: '150 g', kcal: 195, p: 4, c: 42, f: 0.5 },
      { name: 'Brócoli', portion: '100 g', kcal: 35, p: 2.8, c: 7, f: 0.4 },
    ] },
    { id: 'o2', label: 'Opc 2', items: [] },
  ] },
  { id: 'c3', label: 'Merienda', selected: 0, options: [
    { id: 'o1', label: 'Opc 1', items: [
      { name: 'Yogur griego', portion: '200 g', kcal: 130, p: 20, c: 8, f: 2 },
      { name: 'Almendras', portion: '30 g', kcal: 170, p: 6, c: 6, f: 15 },
    ] },
  ] },
  { id: 'c4', label: 'Cena', selected: 0, options: [
    { id: 'o1', label: 'Opc 1', items: [
      { name: 'Salmón', portion: '180 g', kcal: 378, p: 36, c: 0, f: 24 },
      { name: 'Batata', portion: '150 g', kcal: 130, p: 2.3, c: 30, f: 0.2 },
      { name: 'Espinaca', portion: '80 g', kcal: 18, p: 2, c: 3, f: 0.3 },
    ] },
  ] },
];

const NP_GAUGE_ARC = 263.9;

function NutritionPlanWindow() {
  const [leftTab, setLeftTab] = useState('alimentos');
  const [categories, setCategories] = useState(NP_INITIAL);
  const [dragOverId, setDragOverId] = useState(null);
  const [pulseId, setPulseId] = useState(null);

  const target = { kcal: 2000, p: 160, c: 200, f: 67 };

  const totals = categories.reduce((acc, cat) => {
    const items = cat.options[cat.selected]?.items || [];
    items.forEach((i) => {
      acc.kcal += i.kcal || 0;
      acc.p += i.p || 0;
      acc.c += i.c || 0;
      acc.f += i.f || 0;
    });
    return acc;
  }, { kcal: 0, p: 0, c: 0, f: 0 });

  const gaugeOffset = NP_GAUGE_ARC - NP_GAUGE_ARC * Math.min(1, totals.kcal / target.kcal);

  const handleDragStart = (e, item, type) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify({ type, ...item }));
    e.currentTarget.classList.add('cl-np-item-dragging');
  };
  const handleDragEnd = (e) => e.currentTarget.classList.remove('cl-np-item-dragging');

  const handleDrop = (e, categoryId) => {
    e.preventDefault();
    setDragOverId(null);
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    if (!payload) return;

    setCategories((prev) => prev.map((cat) => {
      if (cat.id !== categoryId) return cat;
      const opts = [...cat.options];
      const sel = cat.selected;
      const newItem = payload.type === 'recipe'
        ? { name: payload.name, portion: `${payload.count} alim.`, kcal: payload.kcal, p: payload.p, c: payload.c, f: payload.f, recipe: true }
        : { name: payload.name, portion: payload.portion, kcal: payload.kcal, p: payload.p, c: payload.c, f: payload.f };
      opts[sel] = { ...opts[sel], items: [...(opts[sel].items || []), newItem] };
      return { ...cat, options: opts };
    }));
    setPulseId(categoryId);
    setTimeout(() => setPulseId((p) => (p === categoryId ? null : p)), 600);
  };

  const selectOption = (catId, optIdx) => {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, selected: optIdx } : c)));
  };

  const removeItem = (catId, optIdx, itemIdx) => {
    setCategories((prev) => prev.map((c) => {
      if (c.id !== catId) return c;
      const opts = [...c.options];
      opts[optIdx] = { ...opts[optIdx], items: opts[optIdx].items.filter((_, i) => i !== itemIdx) };
      return { ...c, options: opts };
    }));
  };

  const list = leftTab === 'alimentos' ? NP_ALIMENTOS : NP_RECETAS;

  return (
    <WindowFrame label="Plan · Definición">
      <div className="cl-np">
        {/* ── LEFT: Food / Recipe library ───────────── */}
        <aside className="cl-np-left">
          <div className="cl-np-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <span>{leftTab === 'alimentos' ? 'Buscar alimento…' : 'Buscar receta…'}</span>
            {leftTab === 'alimentos' && <span className="cl-np-search-plus">+</span>}
          </div>
          <div className="cl-np-tabs">
            <button
              type="button"
              className={`cl-np-tab ${leftTab === 'alimentos' ? 'cl-np-tab-active' : ''}`}
              onClick={() => setLeftTab('alimentos')}
            >
              Alimentos
            </button>
            <button
              type="button"
              className={`cl-np-tab ${leftTab === 'recetas' ? 'cl-np-tab-active' : ''}`}
              onClick={() => setLeftTab('recetas')}
            >
              Recetas
            </button>
          </div>
          <div className="cl-np-list">
            {list.map((item) => (
              <div
                key={item.id}
                className="cl-np-item"
                draggable
                onDragStart={(e) => handleDragStart(e, item, leftTab === 'alimentos' ? 'food' : 'recipe')}
                onDragEnd={handleDragEnd}
              >
                <span className="cl-np-item-name">{item.name}</span>
                <div className="cl-np-item-meta">
                  <span>{item.kcal} kcal</span>
                  {leftTab === 'alimentos' ? (
                    <>
                      <span>P {item.p}g</span>
                      <span>C {item.c}g</span>
                      <span>G {item.f}g</span>
                    </>
                  ) : (
                    <span>{item.count} alim.</span>
                  )}
                </div>
              </div>
            ))}
            <p className="cl-np-drag-hint">Arrastra al centro para agregar</p>
          </div>
        </aside>

        {/* ── CENTER: Meals (categories + options) ───── */}
        <section className="cl-np-center">
          <div className="cl-np-center-head">
            <h3 className="cl-np-center-title">Comidas</h3>
            <span className="cl-np-add-comida">+ Comida</span>
          </div>
          <div className="cl-np-categories">
            {categories.map((cat) => {
              const opt = cat.options[cat.selected];
              const isDragOver = dragOverId === cat.id;
              const isPulse = pulseId === cat.id;
              return (
                <div
                  key={cat.id}
                  className={`cl-np-cat ${isDragOver ? 'cl-np-cat-over' : ''} ${isPulse ? 'cl-np-cat-pulse' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOverId(cat.id); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(null); }}
                  onDrop={(e) => handleDrop(e, cat.id)}
                >
                  <div className="cl-np-cat-head">
                    <span className="cl-np-cat-name">{cat.label}</span>
                    <div className="cl-np-opt-tabs">
                      {cat.options.map((o, oi) => (
                        <button
                          type="button"
                          key={o.id}
                          className={`cl-np-opt-tab ${cat.selected === oi ? 'cl-np-opt-tab-active' : ''}`}
                          onClick={() => selectOption(cat.id, oi)}
                        >
                          {o.label}
                        </button>
                      ))}
                      <button type="button" className="cl-np-opt-tab-add" aria-label="Añadir opción">+</button>
                    </div>
                  </div>
                  {opt?.items?.length ? (
                    <div className="cl-np-cat-items">
                      {opt.items.map((it, ii) => (
                        <div key={ii} className="cl-np-cat-item">
                          <span className="cl-np-cat-item-name">{it.name}</span>
                          {it.recipe && <span className="cl-np-cat-item-tag">receta</span>}
                          <span className="cl-np-cat-item-portion">{it.portion}</span>
                          <span className="cl-np-cat-item-kcal">{it.kcal} kcal</span>
                          <button
                            type="button"
                            className="cl-np-cat-item-x"
                            onClick={() => removeItem(cat.id, cat.selected, ii)}
                            aria-label="Quitar"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="cl-np-cat-empty">Arrastra alimentos o recetas aquí</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── RIGHT: Gauge + targets + macro bars ────── */}
        <aside className="cl-np-right">
          <div className="cl-np-gauge-wrap">
            <svg viewBox="0 0 200 108" className="cl-np-gauge" aria-hidden="true">
              <path
                d="M 16 100 A 84 84 0 0 1 184 100"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 16 100 A 84 84 0 0 1 184 100"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={NP_GAUGE_ARC}
                strokeDashoffset={gaugeOffset}
                style={{ transition: 'stroke-dashoffset 450ms cubic-bezier(0.22,1,0.36,1)' }}
              />
            </svg>
            <div className="cl-np-gauge-label">
              <span className="cl-np-gauge-val">{Math.round(totals.kcal).toLocaleString()}</span>
              <span className="cl-np-gauge-unit">kcal</span>
            </div>
          </div>

          <div className="cl-np-controls">
            <div className="cl-np-ctrl">
              <span className="cl-np-ctrl-lbl">Objetivo</span>
              <span className="cl-np-ctrl-val">{target.kcal.toLocaleString()}</span>
              <span className="cl-np-ctrl-unit">kcal</span>
            </div>
          </div>

          <div className="cl-np-macros">
            {[
              { key: 'p', name: 'Proteína', cur: totals.p, tgt: target.p, color: 'rgba(100,200,150,0.85)' },
              { key: 'c', name: 'Carbohidratos', cur: totals.c, tgt: target.c, color: 'rgba(100,160,240,0.85)' },
              { key: 'f', name: 'Grasa', cur: totals.f, tgt: target.f, color: 'rgba(240,160,80,0.85)' },
            ].map((m) => (
              <div key={m.key} className="cl-np-macro">
                <div className="cl-np-macro-head">
                  <span className="cl-np-macro-name">{m.name}</span>
                  <div className="cl-np-macro-nums">
                    <span className="cl-np-macro-cur">{m.cur.toFixed(0)}</span>
                    <span className="cl-np-macro-slash">/</span>
                    <span className="cl-np-macro-tgt">{m.tgt}</span>
                    <span className="cl-np-macro-unit">g</span>
                  </div>
                </div>
                <div className="cl-np-macro-bar">
                  <div
                    className="cl-np-macro-bar-fill"
                    style={{
                      width: `${Math.min(100, (m.cur / m.tgt) * 100)}%`,
                      background: m.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </WindowFrame>
  );
}

/* ═══════════════════════════════════════════
   SECTION 4 — PROGRAMS & CLIENTS
   Replica: ProgramsAndClientsScreen
   ═══════════════════════════════════════════ */
const FANOUT_TARGETS = [140, 200, 260].flatMap((y) =>
  [50, 100, 150, 200, 250, 300, 350].map((x) => ({ x, y }))
);

const CREATOR_HUB_IMG = '/fallback/hero/IMG_9387.webp';
const CREATOR_PAIR_IMG = '/fallback/hero/IMG_3247.webp';

function AvatarPattern({ id, href }) {
  return (
    <pattern id={id} patternContentUnits="objectBoundingBox" width="1" height="1">
      <image href={href} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
    </pattern>
  );
}

function DualModeWindow() {
  return (
    <WindowFrame label="Dos caminos">
      <div className="cl-dm">
        {/* LEFT — one to many */}
        <section className="cl-dm-half">
          <div className="cl-dm-diagram" aria-hidden="true">
            <svg viewBox="0 0 400 300" className="cl-dm-svg" preserveAspectRatio="xMidYMid meet">
              <defs>
                <AvatarPattern id="p-hub" href={CREATOR_HUB_IMG} />
              </defs>

              {FANOUT_TARGETS.map((t, i) => (
                <line
                  key={`l-${i}`}
                  x1="200"
                  y1="54"
                  x2={t.x}
                  y2={t.y}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
              ))}

              <circle cx="200" cy="54" r="30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <circle cx="200" cy="54" r="24" fill="url(#p-hub)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />

              {FANOUT_TARGETS.map((t, i) => (
                <circle
                  key={`t-${i}`}
                  cx={t.x}
                  cy={t.y}
                  r="7"
                  fill="rgba(255,255,255,0.28)"
                  stroke="rgba(255,255,255,0.18)"
                  strokeWidth="1"
                />
              ))}
            </svg>
          </div>
          <div className="cl-dm-caption">
            <p className="cl-dm-caption-title">Un programa, miles de alumnos.</p>
          </div>
        </section>

        {/* RIGHT — one to one */}
        <section className="cl-dm-half">
          <div className="cl-dm-diagram" aria-hidden="true">
            <svg viewBox="0 0 400 300" className="cl-dm-svg" preserveAspectRatio="xMidYMid meet">
              <defs>
                <AvatarPattern id="p-creator" href={CREATOR_PAIR_IMG} />
              </defs>

              <line x1="162" y1="150" x2="238" y2="150" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />

              <circle cx="140" cy="150" r="30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <circle cx="140" cy="150" r="24" fill="url(#p-creator)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />

              <circle cx="260" cy="150" r="30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              <circle cx="260" cy="150" r="24" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
            </svg>
          </div>
          <div className="cl-dm-caption">
            <p className="cl-dm-caption-title">Un cliente, un plan.</p>
          </div>
        </section>
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
   Split left/right. Copy left, rotating athlete
   spotlight right. 9:16 portrait frame, one clip
   at a time, 8s per clip, 1.2s cinematic dissolve.
   ═══════════════════════════════════════════ */

function Hero() {
  const [clips, setClips] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const videoRefs = useRef([]);
  const clipCount = clips.length;

  useEffect(() => {
    let cancelled = false;
    getCreatorHeroClips().then((urls) => {
      if (!cancelled) setClips(urls);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (clipCount < 2) return undefined;
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % clipCount);
    }, 8000);
    return () => clearInterval(id);
  }, [clipCount]);

  useEffect(() => {
    if (clipCount === 0) return;
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === activeIndex) {
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [activeIndex, clipCount]);

  return (
    <section className="cl-hero">
      <div className="cl-hero-grid" aria-hidden="true" />
      <div className="cl-hero-inner">
        <div className="cl-hero-copy">
          <CascadeText
            as="h1"
            className="cl-hero-title"
            chunks={[
              { text: 'Tu forma de entrenar ', bold: true },
              { text: 'merece una plataforma.', bold: false },
            ]}
          />
        </div>
        <motion.div
          className="cl-hero-reel"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: SPRING }}
        >
          <div className="cl-hero-frame">
            {clipCount === 0 ? (
              <div className="cl-hero-frame-empty" aria-hidden="true" />
            ) : (
              clips.map((src, i) => {
                const isActive = i === activeIndex;
                const isNext = i === (activeIndex + 1) % clipCount;
                return (
                  <video
                    key={src}
                    ref={(el) => { videoRefs.current[i] = el; }}
                    className={`cl-hero-video ${isActive ? 'is-active' : ''}`}
                    src={src}
                    autoPlay={isActive}
                    muted
                    loop
                    playsInline
                    preload={isActive || isNext ? 'auto' : 'metadata'}
                  />
                );
              })
            )}
          </div>
        </motion.div>
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
        href="/creators/"
        className="cl-close-cta"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: '-20%' }}
        transition={{ duration: 0.7, ease: SPRING }}
      >
        Publica tu método
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
