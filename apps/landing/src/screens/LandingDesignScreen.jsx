/**
 * LandingDesignScreen — Wake landing.
 *
 * Sections:
 *   Nav
 *   Hero        — small headline + sub, no CTA
 *   Demo        — large product screen frame
 *   Trusted     — marquee of creator avatars
 *   Workflows   — scroll-pinned, sticky right column with active workflow visual
 *   Bento       — "una suscripción para todo" feature grid
 *   Cases       — case studies cards
 *   Blog        — read about us
 *   Footer
 */
import { useEffect, useRef, useState } from 'react';
import './LandingDesignScreen.css';
import wakeLogo from '../assets/Logotipo-WAKE-positivo.svg';

/* ── IMAGES ───────────────────────────────────────────────────────── */
const IMG = {
  demo:    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1400&q=70&fit=crop',
  flow1:   'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=900&q=70&fit=crop',
  flow2:   'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=900&q=70&fit=crop',
  flow3:   'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=900&q=70&fit=crop',
  flow4:   'https://images.unsplash.com/photo-1576678927484-cc907957088c?w=900&q=70&fit=crop',
  flow5:   'https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?w=900&q=70&fit=crop',
  case1:   'https://images.unsplash.com/photo-1550259979-ed79b48d2a30?w=700&q=70&fit=crop',
  case2:   'https://images.unsplash.com/photo-1541534741688-6078c738800b?w=700&q=70&fit=crop',
  case3:   'https://images.unsplash.com/photo-1583500178690-f7fd39c44dba?w=700&q=70&fit=crop',
  blog:    'https://images.unsplash.com/photo-1517438476312-10d79c077509?w=1100&q=70&fit=crop',
  avatars: [
    'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=160&q=70&fit=crop',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=160&q=70&fit=crop',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&q=70&fit=crop',
    'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=160&q=70&fit=crop',
    'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=160&q=70&fit=crop',
    'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=160&q=70&fit=crop',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=160&q=70&fit=crop',
    'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=160&q=70&fit=crop',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=160&q=70&fit=crop',
    'https://images.unsplash.com/photo-1463453091185-61582044d556?w=160&q=70&fit=crop',
  ],
};

/* ── COPY ─────────────────────────────────────────────────────────── */
const COPY = {
  brand: 'WAKE',
  nav: [
    { label: 'Atletas',   href: '/creators' },
    { label: 'Programas', href: '#workflows' },
    { label: 'Precios',   href: '#bento' },
    { label: 'Manifesto', href: '#blog' },
  ],
  navSecondary: 'Iniciar sesión',
  navCta: 'Empezar gratis',

  hero: {
    pill: { tag: 'Nuevo', text: 'Conoce a Wake AI, tu coach inteligente', cta: 'Probar' },
    headlinePre: 'Tu',
    headlineItalic: 'entorno',
    headlinePost: 'de entrenamiento.',
    sub: 'Convierte tu disciplina en resultados, más rápido que nunca. Cada herramienta de entrenamiento, en un solo proceso unificado.',
    cta: 'Empezar gratis',
  },

  trusted: 'Entrenado por los mejores atletas del mundo',

  workflows: {
    eyebrow: 'CADA RUTINA',
    headline: 'Cada flujo, hecho para ti.',
    items: [
      { id: 'fuerza',     name: 'Fuerza',         body: 'Periodización por bloques, RPE y autorregulación.', img: IMG.flow1 },
      { id: 'hipertrofia',name: 'Hipertrofia',    body: 'Volumen semanal, MEV/MRV y progresión por grupo.',  img: IMG.flow2 },
      { id: 'resistencia',name: 'Resistencia',    body: 'Zonas, polarizado y sesiones por sistema.',         img: IMG.flow3 },
      { id: 'movilidad',  name: 'Movilidad',      body: 'Rangos diarios y mantenimiento articular.',         img: IMG.flow4 },
      { id: 'nutricion',  name: 'Nutrición',      body: 'Macros, timing y ajustes a tu déficit.',            img: IMG.flow5 },
    ],
  },

  bento: {
    eyebrow: 'UNA SUSCRIPCIÓN',
    headline: 'Todo lo que necesitas, en un solo lugar.',
    sub: 'Programas, nutrición, registro y progreso. Sin apps extras.',
    cards: [
      { title: 'Programas',     body: 'De atletas reales.' },
      { title: 'Nutrición',     body: 'Macros y comidas.' },
      { title: 'Registro',      body: 'Cada serie y rep.' },
      { title: 'Récords',       body: '1RM, volumen, PRs.' },
      { title: 'Análisis',      body: 'Insights semanales.' },
      { title: 'Comunidad',     body: 'Atletas como tú.' },
    ],
  },

  cases: {
    eyebrow: 'CASOS DE ESTUDIO',
    headline: 'Equipos creativos haciéndolo real.',
    cards: [
      { tag: 'Powerlifting · Bogotá', name: 'Marco Vélez',   body: 'Cómo Marco lleva 200 atletas en un solo lugar.', img: IMG.case1 },
      { tag: 'IFBB · Medellín',       name: 'Lucía Ramírez', body: 'Periodización para sus clientes de competición.', img: IMG.case2 },
      { tag: 'Triatlón · Cali',       name: 'Diego Soto',    body: 'Volumen, zonas y recuperación, todo junto.',     img: IMG.case3 },
    ],
  },

  blog: {
    eyebrow: 'LEE SOBRE NOSOTROS',
    headline: 'Por qué construimos Wake.',
    body: 'La industria fitness se rompió en mil apps. Nosotros la reunimos en una.',
    cta: 'Leer el manifesto',
  },

  footer: {
    cols: [
      { title: 'Producto',  links: ['Atletas', 'Programas', 'Precios', 'Cambios'] },
      { title: 'Compañía',  links: ['Manifesto', 'Carreras', 'Contacto'] },
      { title: 'Recursos',  links: ['Blog', 'Soporte', 'Términos', 'Privacidad'] },
    ],
    line: '© Wake 2026 · Hecho en Colombia',
  },
};

/* ─────────────────────────────────────────────────────────────────── */
export default function LandingDesignScreen() {
  // reveal on scroll
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('lds-vis'); obs.unobserve(e.target); } }),
      { threshold: 0.15 }
    );
    document.querySelectorAll('.lds-eu').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // workflow scroll tracking
  const [activeFlow, setActiveFlow] = useState(0);
  const flowRefs = useRef([]);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = Number(e.target.getAttribute('data-flow-i'));
            setActiveFlow(i);
          }
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );
    flowRefs.current.forEach((el) => el && obs.observe(el));
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
        <div className="lds-nav-actions">
          <a href="/app" className="lds-nav-secondary">{COPY.navSecondary}</a>
          <a href="/app" className="lds-nav-cta">{COPY.navCta}</a>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="lds-hero">
        <div className="lds-hero-dots" />
        <div className="lds-hero-inner">
          <h1 className="lds-hero-headline lds-eu" style={{ animationDelay: '0.06s' }}>
            {COPY.hero.headlinePre}{' '}
            <em>{COPY.hero.headlineItalic}</em>{' '}
            {COPY.hero.headlinePost}
          </h1>
          <p className="lds-hero-sub lds-eu" style={{ animationDelay: '0.14s' }}>{COPY.hero.sub}</p>
        </div>
      </section>

      {/* ── DEMO ── */}
      <section className="lds-demo">
        <div className="lds-demo-frame lds-eu">
          <div className="lds-demo-bar">
            <span /><span /><span />
          </div>
          <img src={IMG.demo} alt="Wake product" loading="lazy" decoding="async" />
        </div>
      </section>

      {/* ── TRUSTED MARQUEE ── */}
      <section className="lds-trusted">
        <p className="lds-trusted-label">{COPY.trusted}</p>
        <div className="lds-trusted-track">
          <div className="lds-trusted-row">
            {[...IMG.avatars, ...IMG.avatars, ...IMG.avatars].map((src, i) => (
              <div key={i} className="lds-avatar"><img src={src} alt="" loading="lazy" decoding="async" /></div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WORKFLOWS (one viewport, scroll-driven highlight) ── */}
      <section
        className="lds-workflows"
        id="workflows"
        style={{ height: `${COPY.workflows.items.length * 100}vh` }}
      >
        <div className="lds-wf-pin">
          <div className="lds-wf-head">
            <span className="lds-eyebrow">{COPY.workflows.eyebrow}</span>
            <h2 className="lds-h2">{COPY.workflows.headline}</h2>
          </div>
          <div className="lds-wf-grid">
            <ul className="lds-wf-list">
              {COPY.workflows.items.map((it, i) => (
                <li key={it.id} className={`lds-wf-item ${activeFlow === i ? 'is-active' : ''}`}>
                  <h3>{it.name}</h3>
                </li>
              ))}
            </ul>
            <div className="lds-wf-card">
              {COPY.workflows.items.map((it, i) => (
                <img
                  key={it.id}
                  src={it.img}
                  alt={it.name}
                  className={activeFlow === i ? 'is-active' : ''}
                />
              ))}
            </div>
          </div>
        </div>
        {/* invisible scroll triggers — drive activeFlow */}
        {COPY.workflows.items.map((_, i) => (
          <div
            key={i}
            ref={(el) => (flowRefs.current[i] = el)}
            data-flow-i={i}
            className="lds-wf-step"
            style={{ top: `${i * 100}vh` }}
          />
        ))}
      </section>

      {/* ── BENTO ── */}
      <section className="lds-bento" id="bento">
        <div className="lds-bento-head lds-eu">
          <span className="lds-eyebrow">{COPY.bento.eyebrow}</span>
          <h2 className="lds-h2">{COPY.bento.headline}</h2>
          <p className="lds-sub">{COPY.bento.sub}</p>
        </div>
        <div className="lds-bento-grid">
          {COPY.bento.cards.map((c, i) => (
            <div key={c.title} className={`lds-bento-card lds-bento-${i} lds-eu`} style={{ animationDelay: `${i * 0.05}s` }}>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CASES ── */}
      <section className="lds-cases">
        <div className="lds-cases-head lds-eu">
          <span className="lds-eyebrow">{COPY.cases.eyebrow}</span>
          <h2 className="lds-h2">{COPY.cases.headline}</h2>
        </div>
        <div className="lds-cases-grid">
          {COPY.cases.cards.map((c, i) => (
            <a key={c.name} href="/creators" className="lds-case-card lds-eu" style={{ animationDelay: `${i * 0.08}s` }}>
              <img src={c.img} alt="" loading="lazy" decoding="async" />
              <div className="lds-case-overlay" />
              <div className="lds-case-content">
                <span className="lds-case-tag">{c.tag}</span>
                <h3>{c.name}</h3>
                <p>{c.body}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── BLOG ── */}
      <section className="lds-blog" id="blog">
        <a href="#" className="lds-blog-card lds-eu">
          <div className="lds-blog-image"><img src={IMG.blog} alt="" loading="lazy" decoding="async" /></div>
          <div className="lds-blog-text">
            <span className="lds-eyebrow">{COPY.blog.eyebrow}</span>
            <h2 className="lds-h2">{COPY.blog.headline}</h2>
            <p className="lds-sub">{COPY.blog.body}</p>
            <span className="lds-blog-cta">{COPY.blog.cta} →</span>
          </div>
        </a>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lds-footer">
        <div className="lds-footer-grid">
          <div className="lds-footer-brand">
            <span className="lds-nav-brand">{COPY.brand}</span>
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
        <div className="lds-footer-line">{COPY.footer.line}</div>
      </footer>
    </div>
  );
}
