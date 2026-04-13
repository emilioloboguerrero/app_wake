/**
 * LandingDesignScreen — Wake landing (Flora-inspired structure).
 *
 * Sections:
 *   Nav        — minimal, single CTA
 *   Hero       — pill, headline, sub, CTA, hero video
 *   Process    — 3 steps (Planea / Entrena / Progresa)
 *   Workflows  — category showcase with media
 *   AllInOne   — "Una suscripción para todo" feature grid
 *   Cases      — athlete case studies
 *   Press      — media mentions
 *   FinalCTA   — closing line + CTAs
 *   Footer     — link grid + ghost wordmark
 */
import { useEffect } from 'react';
import './LandingDesignScreen.css';
import wakeLogo from '../assets/Logotipo-WAKE-positivo.svg';
import ScrollFlowSection from '../components/ScrollFlowSection';

const COPY = {
  brand: 'WAKE',
  nav: [
    { label: 'Atletas',   href: '#workflows' },
    { label: 'Funciones', href: '#allinone' },
    { label: 'Casos',     href: '#cases' },
    { label: 'Prensa',    href: '#press' },
  ],
  navCta: 'Empezar gratis',

  hero: {
    pill: { tag: 'Nuevo', text: 'Conoce a tu coach inteligente', cta: 'Probar' },
    line1: 'Tu',
    line2Em: 'entorno',
    line3: 'de entreno.',
    sub: 'Da vida a tu disciplina más rápido que nunca. Cada herramienta de entrenamiento, un solo proceso.',
    cta: 'Empezar gratis',
    chips: ['Programas a medida', 'Nutrición diaria', 'Análisis semanal'],
  },

  process: {
    eyebrow: '[ CÓMO FUNCIONA ]',
    headline: 'Tres pasos.',
    headlineEm: 'Cero fricción.',
    steps: [
      { num: '01', name: 'Planea',   body: 'Explora cientos de rutinas con atletas reales y modelos adaptados a tu nivel.' },
      { num: '02', name: 'Entrena',  body: 'Itera en tiempo real con tu coach. Cada serie, cada repetición, registrada.' },
      { num: '03', name: 'Progresa', body: 'Convierte cada sesión en datos accionables y récords históricos.' },
    ],
  },

  workflows: {
    eyebrow: '[ FLUJOS ]',
    headline: 'Flujos de entrenamiento',
    headlineEm: 'que escalan.',
    sub: 'Atletas desde Bogotá hasta Buenos Aires usan Wake para llevar su disciplina al siguiente nivel.',
    cta: 'Empezar gratis',
    secondary: 'Ver todos los flujos',
    categories: [
      {
        id: 'fuerza',
        tab: 'Fuerza',
        title: 'Periodización por bloques.',
        body: 'Planifica ciclos completos, ajusta RPE y autorregula cada sesión sin perder el hilo.',
        flow: {
          nodes: [
            { label: 'Programa' },
            { label: 'Semana 1-4' },
            { label: 'Semana 5-8' },
            { label: 'Deload' },
          ],
          positions: [
            { x: -140, y: -40 },
            { x: 20, y: -80 },
            { x: 20, y: 40 },
            { x: 160, y: -20 },
          ],
          edges: [{ from: 1, to: 2 }, { from: 1, to: 3 }, { from: 2, to: 4 }, { from: 3, to: 4 }],
        },
      },
      {
        id: 'hipertrofia',
        tab: 'Hipertrofia',
        title: 'Volumen MEV a MRV.',
        body: 'Controla el volumen semanal por grupo muscular y progresa sin estancarte.',
        flow: {
          nodes: [
            { label: 'Atleta' },
            { label: 'Push' },
            { label: 'Pull' },
            { label: 'Legs' },
          ],
          positions: [
            { x: -140, y: -10 },
            { x: 40, y: -80 },
            { x: 40, y: 0 },
            { x: 40, y: 80 },
          ],
          edges: [{ from: 1, to: 2 }, { from: 1, to: 3 }, { from: 1, to: 4 }],
        },
      },
      {
        id: 'resistencia',
        tab: 'Resistencia',
        title: 'Zonas y polarizado.',
        body: 'Estructura tu base aeróbica con sesiones por sistema energético y métricas reales.',
        flow: {
          nodes: [
            { label: 'Z2 Base' },
            { label: 'Z3-Z4' },
            { label: 'Z5 VO2' },
            { label: 'Long run' },
          ],
          positions: [
            { x: -130, y: -60 },
            { x: -130, y: 50 },
            { x: 70, y: -60 },
            { x: 70, y: 50 },
          ],
          edges: [{ from: 1, to: 3 }, { from: 2, to: 4 }, { from: 1, to: 4 }, { from: 2, to: 3 }],
        },
      },
      {
        id: 'movilidad',
        tab: 'Movilidad',
        title: 'Mantenimiento articular.',
        body: 'Rangos diarios, recuperación activa y trabajo correctivo en cinco minutos.',
        flow: {
          nodes: [
            { label: 'Evaluación' },
            { label: 'Cadera' },
            { label: 'T-spine' },
            { label: 'Hombro' },
          ],
          positions: [
            { x: -140, y: -10 },
            { x: 40, y: -80 },
            { x: 40, y: 0 },
            { x: 40, y: 80 },
          ],
          edges: [{ from: 1, to: 2 }, { from: 1, to: 3 }, { from: 1, to: 4 }],
        },
      },
      {
        id: 'nutricion',
        tab: 'Nutrición',
        title: 'Macros y timing.',
        body: 'Ajusta calorías, distribuye proteína y construye comidas que sí entiendes.',
        flow: {
          nodes: [
            { label: 'Objetivo' },
            { label: 'Plan' },
            { label: 'Comida' },
            { label: 'Diario' },
          ],
          positions: [
            { x: -140, y: -10 },
            { x: -20, y: -70 },
            { x: -20, y: 50 },
            { x: 140, y: -10 },
          ],
          edges: [{ from: 1, to: 2 }, { from: 1, to: 3 }, { from: 2, to: 4 }, { from: 3, to: 4 }],
        },
      },
      {
        id: 'competicion',
        tab: 'Competición',
        title: 'Picos de forma.',
        body: 'Carga, descarga y peaking calibrados al día exacto de tu evento.',
        flow: {
          nodes: [
            { label: 'Base' },
            { label: 'Carga' },
            { label: 'Peak' },
            { label: 'Meet day' },
          ],
          positions: [
            { x: -160, y: 0 },
            { x: -50, y: -50 },
            { x: 50, y: 30 },
            { x: 160, y: -10 },
          ],
          edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }],
        },
      },
    ],
  },

  allinone: {
    eyebrow: '[ TODO EN UNO ]',
    headline: 'Una suscripción',
    headlineEm: 'para todo.',
    sub: 'Un plan. Cada herramienta. Sin cinco apps, sin hojas de cálculo, sin excusas.',
    primaryCta: 'Empezar gratis',
    secondaryCta: 'Hablar con ventas',
    features: [
      { title: 'Programas',     body: 'De atletas reales que entrenan así.' },
      { title: 'Nutrición',     body: 'Macros, comidas y ajustes diarios.' },
      { title: 'Registro',      body: 'Cada serie, cada repetición, cada peso.' },
      { title: 'Récords',       body: '1RM, volumen y PRs históricos.' },
      { title: 'Análisis',      body: 'Insights semanales que sí entiendes.' },
      { title: 'Comunidad',     body: 'Atletas como tú, no influencers.' },
      { title: 'Movilidad',     body: 'Rutinas diarias de mantenimiento.' },
      { title: 'Recuperación',  body: 'Sueño, descanso y readiness.' },
      { title: 'Coach AI',      body: 'Ajustes personalizados en tiempo real.' },
      { title: 'Reservas',      body: 'Llamadas con tu atleta favorito.' },
      { title: 'Eventos',       body: 'Retos y meets de la comunidad.' },
      { title: 'Pagos',         body: 'Una suscripción, todo incluido.' },
    ],
  },

  cases: {
    eyebrow: '[ CASOS DE ESTUDIO ]',
    headline: 'Casos de equipos',
    headlineEm: 'que entrenan en serio.',
    sub: 'Atletas profesionales y entrenadores que reemplazaron cinco apps por una.',
    cta: 'Hablar con ventas',
    items: [
      { tag: 'Powerlifting',  org: 'Equipo Vélez',     title: 'Cómo Marco lleva 200 atletas desde un solo lugar.' },
      { tag: 'IFBB Pro',      org: 'Studio Ramírez',   title: 'Periodización de competición sin perder el detalle.' },
      { tag: 'Triatlón',      org: 'Soto Endurance',   title: 'Volumen, zonas y recuperación en la misma vista.' },
    ],
  },

  press: {
    eyebrow: '[ PRENSA ]',
    headline: 'Hablan',
    headlineEm: 'de nosotros.',
    sub: 'Cobertura de los medios más relevantes del fitness y la tecnología.',
    items: [
      { source: 'TechCrunch', title: 'Wake redefine el entrenamiento personal en LATAM.' },
      { source: 'Forbes',     title: '10 startups que están cambiando el fitness en 2026.' },
      { source: 'Wired',      title: 'La nueva generación de coaches digitales.' },
      { source: 'GQ',         title: 'Por qué los atletas profesionales están dejando Instagram.' },
      { source: 'Men\u2019s Health', title: 'La app que entrena como un coach de élite.' },
      { source: 'Semana',     title: 'Wake: la apuesta colombiana por el fitness serio.' },
    ],
  },

  finalCta: {
    pre: 'Una nueva',
    em: 'disciplina',
    post: 'merece un nuevo entorno.',
    primary: 'Empezar gratis',
    secondary: 'Hablar con ventas',
  },

  footer: {
    cols: [
      { title: 'Producto',  links: ['Funciones', 'Precios', 'Cambios', 'Equipos'] },
      { title: 'Compañía',  links: ['Manifesto', 'Carreras', 'Blog', 'Contacto'] },
      { title: 'Recursos',  links: ['Artículos', 'Soporte', 'Estado', 'Marca'] },
      { title: 'Legal',     links: ['Privacidad', 'Términos'] },
    ],
    line: '© Wake 2026',
    place: 'Hecho en Colombia',
  },
};

/* ─────────────────────────────────────────────────────────────────── */
export default function LandingDesignScreen() {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('lds-vis'); obs.unobserve(e.target); }
      }),
      { threshold: 0.15 }
    );
    document.querySelectorAll('.lds-eu').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="lds">
      {/* ── NAV ── */}
      <header className="lds-nav">
        <a href="/" className="lds-nav-brand"><img src={wakeLogo} alt="Wake" /></a>
        <nav className="lds-nav-links">
          {COPY.nav.map((l) => <a key={l.label} href={l.href}>{l.label}</a>)}
        </nav>
        <a href="/app" className="lds-nav-cta">{COPY.navCta}</a>
      </header>

      {/* ── HERO ── */}
      <section className="lds-hero">
        <div className="lds-hero-inner">
          <a href="/app" className="lds-pill lds-eu">
            <span className="lds-pill-tag">{COPY.hero.pill.tag}</span>
            <span className="lds-pill-text">{COPY.hero.pill.text}</span>
            <span className="lds-pill-cta">{COPY.hero.pill.cta}</span>
          </a>

          <h1 className="lds-hero-headline">
            <span className="lds-eu" style={{ animationDelay: '0.05s' }}>{COPY.hero.line1}</span>
            <em className="lds-eu lds-shimmer" style={{ animationDelay: '0.12s' }} data-text={COPY.hero.line2Em}>{COPY.hero.line2Em}</em>
            <span className="lds-eu" style={{ animationDelay: '0.19s' }}>{COPY.hero.line3}</span>
          </h1>

          <p className="lds-hero-sub lds-eu" style={{ animationDelay: '0.28s' }}>{COPY.hero.sub}</p>

          <div className="lds-hero-actions lds-eu" style={{ animationDelay: '0.34s' }}>
            <a href="/app" className="lds-cta-primary">{COPY.hero.cta}</a>
          </div>

          <div className="lds-hero-chips lds-eu" style={{ animationDelay: '0.4s' }}>
            {COPY.hero.chips.map((c) => <span key={c} className="lds-chip">{c}</span>)}
          </div>

          {/* Hero media placeholder */}
          <div className="lds-hero-media lds-eu" style={{ animationDelay: '0.46s' }}>
            <video
              className="lds-hero-video"
              autoPlay
              loop
              muted
              playsInline
              poster=""
              src=""
            />
            <div className="lds-media-placeholder">[ HERO VIDEO ]</div>
          </div>
        </div>
      </section>

      {/* ── PROCESS ── */}
      <section className="lds-process">
        <div className="lds-process-head lds-eu">
          <span className="lds-eyebrow">{COPY.process.eyebrow}</span>
          <h2 className="lds-h2">
            {COPY.process.headline} <em>{COPY.process.headlineEm}</em>
          </h2>
        </div>
        <div className="lds-process-grid">
          {COPY.process.steps.map((s, i) => (
            <div key={s.num} className="lds-process-card lds-eu" style={{ animationDelay: `${i * 0.08}s` }}>
              <span className="lds-process-num">{s.num}</span>
              <h3>{s.name}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── WORKFLOWS SHOWCASE (Flora-style scroll) ── */}
      <ScrollFlowSection
        eyebrow={COPY.workflows.eyebrow}
        headline={COPY.workflows.headline}
        headlineEm={COPY.workflows.headlineEm}
        sub={COPY.workflows.sub}
        cta={COPY.workflows.cta}
        secondary={COPY.workflows.secondary}
        categories={COPY.workflows.categories}
      />

      {/* ── ALL IN ONE ── */}
      <section className="lds-allinone" id="allinone">
        <div className="lds-ai-head lds-eu">
          <span className="lds-eyebrow">{COPY.allinone.eyebrow}</span>
          <h2 className="lds-h2">
            {COPY.allinone.headline} <em>{COPY.allinone.headlineEm}</em>
          </h2>
          <p className="lds-sub">{COPY.allinone.sub}</p>
          <div className="lds-wf-actions">
            <a href="/app" className="lds-cta-primary">{COPY.allinone.primaryCta}</a>
            <a href="#" className="lds-cta-ghost">{COPY.allinone.secondaryCta} →</a>
          </div>
        </div>
        <div className="lds-ai-grid">
          {COPY.allinone.features.map((f, i) => (
            <div key={f.title} className="lds-ai-card lds-eu" style={{ animationDelay: `${(i % 6) * 0.04}s` }}>
              <div className="lds-ai-icon">[ ICON ]</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CASES ── */}
      <section className="lds-cases" id="cases">
        <div className="lds-cases-head lds-eu">
          <span className="lds-eyebrow">{COPY.cases.eyebrow}</span>
          <h2 className="lds-h2">
            {COPY.cases.headline} <em>{COPY.cases.headlineEm}</em>
          </h2>
          <p className="lds-sub">{COPY.cases.sub}</p>
          <a href="#" className="lds-cta-ghost">{COPY.cases.cta} →</a>
        </div>
        <div className="lds-cases-grid">
          {COPY.cases.items.map((c, i) => (
            <article key={c.title} className="lds-case-card lds-eu" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="lds-case-media">
                <div className="lds-media-placeholder">[ MEDIA ]</div>
              </div>
              <div className="lds-case-meta">
                <span className="lds-case-tag">{c.tag}</span>
                <span className="lds-case-org">{c.org}</span>
              </div>
              <h3 className="lds-case-title">{c.title}</h3>
            </article>
          ))}
        </div>
      </section>

      {/* ── PRESS ── */}
      <section className="lds-press" id="press">
        <div className="lds-press-head lds-eu">
          <span className="lds-eyebrow">{COPY.press.eyebrow}</span>
          <h2 className="lds-h2">
            {COPY.press.headline} <em>{COPY.press.headlineEm}</em>
          </h2>
          <p className="lds-sub">{COPY.press.sub}</p>
        </div>
        <ul className="lds-press-list">
          {COPY.press.items.map((p, i) => (
            <li key={p.title} className="lds-press-item lds-eu" style={{ animationDelay: `${i * 0.04}s` }}>
              <span className="lds-press-source">{p.source}</span>
              <span className="lds-press-title">{p.title}</span>
              <span className="lds-press-arrow">→</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="lds-final">
        <h2 className="lds-final-line lds-eu">
          {COPY.finalCta.pre} <em>{COPY.finalCta.em}</em> {COPY.finalCta.post}
          <span className="lds-dot" aria-hidden="true" />
        </h2>
        <div className="lds-final-actions lds-eu" style={{ animationDelay: '0.15s' }}>
          <a href="/app" className="lds-cta-primary">{COPY.finalCta.primary}</a>
          <a href="#" className="lds-cta-ghost">{COPY.finalCta.secondary} →</a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lds-footer">
        <div className="lds-footer-grid">
          <div className="lds-footer-brand">
            <img src={wakeLogo} alt="Wake" />
            <p>{COPY.footer.line}</p>
            <p className="lds-footer-place">{COPY.footer.place}</p>
          </div>
          {COPY.footer.cols.map((col) => (
            <div key={col.title} className="lds-footer-col">
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((l) => <li key={l}><a href="#">{l}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="lds-footer-ghost" aria-hidden="true">{COPY.brand}</div>
      </footer>
    </div>
  );
}
