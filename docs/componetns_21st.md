Complete Component Guide
Setup — install one dependency

npm install motion --prefix apps/creator-dashboard
This covers both GlowingEffect and the NavBar. All 4 components use it or nothing at all.

1. GlowingEffect
What it does: A colorful border glow that follows your mouse cursor around any card. The arc sweeps around the border edge tracking cursor angle.

Files to create
src/components/ui/GlowingEffect.jsx

import { memo, useCallback, useEffect, useRef } from 'react';
import { animate } from 'motion';
import './GlowingEffect.css';

const GlowingEffect = memo(({
  spread = 20,
  proximity = 0,
  inactiveZone = 0.7,
  movementDuration = 2,
  borderWidth = 1,
  disabled = false,
}) => {
  const containerRef = useRef(null);
  const lastPosition = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef(0);

  const handleMove = useCallback((e) => {
    if (!containerRef.current) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;

      const { left, top, width, height } = el.getBoundingClientRect();
      const mouseX = e?.x ?? lastPosition.current.x;
      const mouseY = e?.y ?? lastPosition.current.y;

      if (e) lastPosition.current = { x: mouseX, y: mouseY };

      const centerX = left + width * 0.5;
      const centerY = top + height * 0.5;
      const distFromCenter = Math.hypot(mouseX - centerX, mouseY - centerY);
      const inactiveRadius = 0.5 * Math.min(width, height) * inactiveZone;

      if (distFromCenter < inactiveRadius) {
        el.style.setProperty('--active', '0');
        return;
      }

      const isActive =
        mouseX > left - proximity &&
        mouseX < left + width + proximity &&
        mouseY > top - proximity &&
        mouseY < top + height + proximity;

      el.style.setProperty('--active', isActive ? '1' : '0');
      if (!isActive) return;

      const currentAngle = parseFloat(el.style.getPropertyValue('--start')) || 0;
      let targetAngle =
        (180 * Math.atan2(mouseY - centerY, mouseX - centerX)) / Math.PI + 90;

      const angleDiff = ((targetAngle - currentAngle + 180) % 360) - 180;
      const newAngle = currentAngle + angleDiff;

      animate(currentAngle, newAngle, {
        duration: movementDuration,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (value) => {
          el.style.setProperty('--start', String(value));
        },
      });
    });
  }, [inactiveZone, proximity, movementDuration]);

  useEffect(() => {
    if (disabled) return;

    const onScroll = () => handleMove();
    const onPointerMove = (e) => handleMove(e);

    window.addEventListener('scroll', onScroll, { passive: true });
    document.body.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener('scroll', onScroll);
      document.body.removeEventListener('pointermove', onPointerMove);
    };
  }, [handleMove, disabled]);

  if (disabled) return null;

  return (
    <div
      ref={containerRef}
      className="glowing-effect-wrapper"
      style={{
        '--spread': spread,
        '--border-width': `${borderWidth}px`,
      }}
    >
      <div className="glowing-effect-glow" />
    </div>
  );
});

GlowingEffect.displayName = 'GlowingEffect';
export default GlowingEffect;
src/components/ui/GlowingEffect.css

.glowing-effect-wrapper {
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: inherit;
}

.glowing-effect-glow {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 1;
  transition: opacity 300ms;
}

.glowing-effect-glow::after {
  content: '';
  position: absolute;
  border-radius: inherit;
  inset: calc(-1 * var(--border-width, 1px));
  border: var(--border-width, 1px) solid transparent;

  background:
    radial-gradient(circle, #dd7bbb 10%, transparent 20%),
    radial-gradient(circle at 40% 40%, #d79f1e 5%, transparent 15%),
    radial-gradient(circle at 60% 60%, #5a922c 10%, transparent 20%),
    radial-gradient(circle at 40% 60%, #4c7894 10%, transparent 20%),
    repeating-conic-gradient(
      from 236.84deg at 50% 50%,
      #dd7bbb 0%,
      #d79f1e calc(25% / 5),
      #5a922c calc(50% / 5),
      #4c7894 calc(75% / 5),
      #dd7bbb calc(100% / 5)
    );
  background-attachment: fixed;

  opacity: var(--active, 0);
  transition: opacity 300ms;

  -webkit-mask-clip: padding-box, border-box;
  mask-clip: padding-box, border-box;
  -webkit-mask-composite: intersect;
  mask-composite: intersect;
  -webkit-mask-image:
    linear-gradient(transparent, transparent),
    conic-gradient(
      from calc((var(--start, 0) - var(--spread, 20)) * 1deg),
      transparent 0deg,
      white,
      transparent calc(var(--spread, 20) * 2deg)
    );
  mask-image:
    linear-gradient(transparent, transparent),
    conic-gradient(
      from calc((var(--start, 0) - var(--spread, 20)) * 1deg),
      transparent 0deg,
      white,
      transparent calc(var(--spread, 20) * 2deg)
    );
}
How to use

import GlowingEffect from '../components/ui/GlowingEffect';

// Wrap any card — the card needs position:relative and a border
<div style={{
  position: 'relative',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.08)',
  padding: 24,
  background: 'rgba(255,255,255,0.03)',
}}>
  <GlowingEffect spread={40} proximity={64} inactiveZone={0.01} />
  <h3>Your card content here</h3>
</div>
Props
Prop	Default	Effect
spread	20	Arc width in degrees. 40 = wide sweep
proximity	0	px outside the card edge that still activates glow
inactiveZone	0.7	Dead zone at card center. 0.01 = almost none
movementDuration	2	Seconds for angle animation to catch up to mouse
borderWidth	1	Glow border thickness in px
disabled	false	Turn off entirely
2. DisplayCards
What it does: A fanned-out stack of cards. Back cards are grayscale and muted. Hovering any card brings it to full color and lifts it.

Files to create
src/components/ui/DisplayCards.jsx

import './DisplayCards.css';

function DisplayCard({
  className = '',
  icon,
  title = 'Featured',
  description = 'Discover amazing content',
  date = 'Just now',
}) {
  return (
    <div className={`display-card ${className}`}>
      <div className="display-card-header">
        <span className="display-card-icon-wrap">
          {icon}
        </span>
        <p className="display-card-title">{title}</p>
      </div>
      <p className="display-card-description">{description}</p>
      <p className="display-card-date">{date}</p>
    </div>
  );
}

export default function DisplayCards({ cards }) {
  const defaultCards = [
    { className: 'display-card--back-2' },
    { className: 'display-card--back-1' },
    { className: 'display-card--front' },
  ];

  const displayCards = cards || defaultCards;

  return (
    <div className="display-cards-grid">
      {displayCards.map((cardProps, index) => (
        <DisplayCard key={index} {...cardProps} />
      ))}
    </div>
  );
}
src/components/ui/DisplayCards.css

.display-cards-grid {
  display: grid;
  grid-template-areas: 'stack';
  place-items: center;
  animation: fadeIn 700ms ease forwards;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.display-card {
  grid-area: stack;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 22rem;
  height: 9rem;
  border-radius: 12px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(8px);
  padding: 12px 16px;
  transform: skewY(-8deg);
  transition: all 700ms ease;
  cursor: default;
  user-select: none;
}

/* The right-edge fade — blends card into background */
.display-card::after {
  content: '';
  position: absolute;
  right: -4px;
  top: -5%;
  height: 110%;
  width: 8rem;
  background: linear-gradient(to left, #1a1a1a, transparent);
  pointer-events: none;
}

/* Grayscale overlay for back cards */
.display-card--back-2::before,
.display-card--back-1::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(26, 26, 26, 0.5);
  transition: opacity 700ms ease;
  z-index: 1;
  pointer-events: none;
}

.display-card--back-2 {
  filter: grayscale(100%);
  transform: skewY(-8deg) translateX(48px) translateY(40px);
}

.display-card--back-1 {
  filter: grayscale(100%);
  transform: skewY(-8deg) translateX(96px) translateY(80px);
}

.display-card--back-2:hover {
  filter: grayscale(0%);
  transform: skewY(-8deg) translateX(48px) translateY(36px);
}

.display-card--back-2:hover::before {
  opacity: 0;
}

.display-card--back-1:hover {
  filter: grayscale(0%);
  transform: skewY(-8deg) translateX(96px) translateY(72px);
}

.display-card--back-1:hover::before {
  opacity: 0;
}

.display-card--front:hover {
  transform: skewY(-8deg) translateY(-10px);
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.07);
}

/* Card internals */
.display-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.display-card-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(100, 149, 200, 0.2);
  color: #4c7894;
}

.display-card-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
}

.display-card-description {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
  white-space: nowrap;
}

.display-card-date {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.35);
  margin: 0;
}
How to use

import DisplayCards from '../components/ui/DisplayCards';

// Default — just render it, 3 stacked blank cards
<DisplayCards />

// Custom cards
<DisplayCards cards={[
  {
    className: 'display-card--back-2',
    title: 'Entrenos',
    description: 'Completa tu rutina de hoy',
    date: 'Hace 2 días',
    icon: <YourIcon />,
  },
  {
    className: 'display-card--back-1',
    title: 'Nutrición',
    description: 'Registra tus comidas',
    date: 'Ayer',
    icon: <YourIcon />,
  },
  {
    className: 'display-card--front',
    title: 'Progreso',
    description: 'Ve tus resultados',
    date: 'Hoy',
    icon: <YourIcon />,
  },
]} />
Rules for className on each card:

First card (furthest back): display-card--back-2
Second card (middle): display-card--back-1
Third card (front, no offset): display-card--front
3. NavBar (Tubelight)
What it does: A floating pill navigation bar — fixed to the bottom on mobile, top on desktop. The active tab has a glowing "lamp" drip above it that slides between tabs with a spring animation.

Files to create
src/components/ui/TubelightNavBar.jsx

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useLocation } from 'react-router-dom';
import './TubelightNavBar.css';

export default function TubelightNavBar({ items, className = '' }) {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(items[0].name);
  const [isMobile, setIsMobile] = useState(false);

  // Sync active tab to current route
  useEffect(() => {
    const match = items.find(item => location.pathname.startsWith(item.url));
    if (match) setActiveTab(match.name);
  }, [location.pathname, items]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={`tubelight-nav-wrapper ${className}`}>
      <nav className="tubelight-nav">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.name;

          return (
            <Link
              key={item.name}
              to={item.url}
              onClick={() => setActiveTab(item.name)}
              className={`tubelight-nav-item ${isActive ? 'tubelight-nav-item--active' : ''}`}
            >
              {isMobile ? (
                <Icon size={18} strokeWidth={2.5} />
              ) : (
                <span>{item.name}</span>
              )}

              {isActive && (
                <motion.div
                  layoutId="tubelight-lamp"
                  className="tubelight-lamp"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <div className="tubelight-lamp-bar">
                    <div className="tubelight-lamp-glow tubelight-lamp-glow--wide" />
                    <div className="tubelight-lamp-glow tubelight-lamp-glow--mid" />
                    <div className="tubelight-lamp-glow tubelight-lamp-glow--tight" />
                  </div>
                </motion.div>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
src/components/ui/TubelightNavBar.css

.tubelight-nav-wrapper {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  padding-bottom: 24px;
}

@media (min-width: 768px) {
  .tubelight-nav-wrapper {
    bottom: auto;
    top: 0;
    padding-bottom: 0;
    padding-top: 24px;
  }
}

.tubelight-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  padding: 4px;
  border-radius: 9999px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.tubelight-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 24px;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-decoration: none;
  cursor: pointer;
  transition: color 200ms ease;
  white-space: nowrap;
}

.tubelight-nav-item:hover {
  color: rgba(255, 255, 255, 0.9);
}

.tubelight-nav-item--active {
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.06);
}

/* The lamp container — slides between tabs via layoutId */
.tubelight-lamp {
  position: absolute;
  inset: 0;
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 9999px;
  z-index: -1;
}

/* The bar sitting on top edge of the active tab */
.tubelight-lamp-bar {
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 32px;
  height: 4px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 9999px 9999px 0 0;
}

/* Three blurred glow layers bleeding upward */
.tubelight-lamp-glow {
  position: absolute;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 9999px;
}

.tubelight-lamp-glow--wide {
  width: 48px;
  height: 24px;
  top: -8px;
  left: -8px;
  filter: blur(8px);
}

.tubelight-lamp-glow--mid {
  width: 32px;
  height: 24px;
  top: -4px;
  left: 0;
  filter: blur(6px);
}

.tubelight-lamp-glow--tight {
  width: 16px;
  height: 16px;
  top: 0;
  left: 8px;
  filter: blur(4px);
}
How to use

import TubelightNavBar from '../components/ui/TubelightNavBar';
import { Home, Users, Calendar, BarChart2 } from 'lucide-react';

const navItems = [
  { name: 'Inicio',    url: '/creators',          icon: Home },
  { name: 'Clientes',  url: '/creators/clients',  icon: Users },
  { name: 'Agenda',    url: '/creators/calendar', icon: Calendar },
  { name: 'Resultados',url: '/creators/results',  icon: BarChart2 },
];

// Drop inside your layout, outside any scroll containers
<TubelightNavBar items={navItems} />
Each item needs:

name — label shown on desktop, used for active tracking
url — React Router path; auto-activates based on current route
icon — any lucide-react icon component (shown on mobile)
Important: The motion import uses motion/react here — that's the subpackage for React components (needed for layoutId). This is different from the plain motion import used in GlowingEffect.

4. BentoGrid
What it does: A CSS grid layout where cards span different columns/rows to create an asymmetric "bento box" look. On hover, card content slides up and a CTA link appears from below.

Files to create
src/components/ui/BentoGrid.jsx

import './BentoGrid.css';

export function BentoGrid({ children, className = '' }) {
  return (
    <div className={`bento-grid ${className}`}>
      {children}
    </div>
  );
}

export function BentoCard({
  name,
  className = '',
  background,
  icon: Icon,
  description,
  href,
  cta,
}) {
  return (
    <div className={`bento-card ${className}`}>
      {background && (
        <div className="bento-card-bg">{background}</div>
      )}

      <div className="bento-card-content">
        {Icon && <Icon className="bento-card-icon" size={48} strokeWidth={1.2} />}
        <h3 className="bento-card-name">{name}</h3>
        <p className="bento-card-description">{description}</p>
      </div>

      {href && cta && (
        <div className="bento-card-cta">
          <a href={href} className="bento-card-cta-link">
            {cta}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginLeft: 6 }}>
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      )}

      <div className="bento-card-hover-overlay" />
    </div>
  );
}
src/components/ui/BentoGrid.css

.bento-grid {
  display: grid;
  width: 100%;
  grid-auto-rows: 22rem;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.bento-card {
  position: relative;
  grid-column: span 3;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  box-shadow: 0 -20px 80px -20px rgba(255, 255, 255, 0.06) inset;
  cursor: default;
}

/* Background slot — for images, gradients, decorative elements */
.bento-card-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.bento-card-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.4;
}

/* Content block — slides up on hover to reveal CTA */
.bento-card-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 24px;
  transform: translateY(0);
  transition: transform 300ms ease;
  pointer-events: none;
}

.bento-card:hover .bento-card-content {
  transform: translateY(-40px);
}

.bento-card-icon {
  color: rgba(255, 255, 255, 0.5);
  transform-origin: left center;
  transition: transform 300ms ease, color 300ms ease;
  margin-bottom: 4px;
}

.bento-card:hover .bento-card-icon {
  transform: scale(0.75);
  color: rgba(255, 255, 255, 0.7);
}

.bento-card-name {
  font-size: 1.25rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  margin: 0;
}

.bento-card-description {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
  max-width: 36ch;
}

/* CTA — hidden below card, slides up on hover */
.bento-card-cta {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 2;
  padding: 16px 24px;
  transform: translateY(40px);
  opacity: 0;
  transition: transform 300ms ease, opacity 300ms ease;
}

.bento-card:hover .bento-card-cta {
  transform: translateY(0);
  opacity: 1;
}

.bento-card-cta-link {
  display: inline-flex;
  align-items: center;
  font-size: 0.85rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  transition: color 200ms, background 200ms;
}

.bento-card-cta-link:hover {
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.08);
}

/* Subtle dark wash on hover */
.bento-card-hover-overlay {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: transparent;
  transition: background 300ms ease;
  pointer-events: none;
}

.bento-card:hover .bento-card-hover-overlay {
  background: rgba(255, 255, 255, 0.02);
}
How to use

import { BentoGrid, BentoCard } from '../components/ui/BentoGrid';
import { FileText, Search, Globe, Calendar, Bell } from 'lucide-react';

<BentoGrid style={{ gridTemplateRows: 'repeat(3, 22rem)' }}>
  <BentoCard
    name="Guarda tus archivos"
    description="Guardamos automáticamente mientras escribes."
    icon={FileText}
    href="/files"
    cta="Ver más"
    className="bento-span-tall-center"   // see grid placement below
  />
  <BentoCard
    name="Búsqueda completa"
    description="Busca en todos tus archivos desde un solo lugar."
    icon={Search}
    href="/search"
    cta="Explorar"
    className="bento-span-left"
  />
  {/* etc */}
</BentoGrid>
Grid placement classes
Add these to your CSS to control which cells each card occupies (matching the original bento layout):


/* Add to BentoGrid.css */

@media (min-width: 1024px) {
  /* Tall center column */
  .bento-span-tall-center {
    grid-area: 1 / 2 / 4 / 3;
  }
  /* Left column, top two rows */
  .bento-span-left {
    grid-area: 1 / 1 / 3 / 2;
  }
  /* Left column, bottom row */
  .bento-span-left-bottom {
    grid-area: 3 / 1 / 4 / 2;
  }
  /* Right column, top row */
  .bento-span-right-top {
    grid-area: 1 / 3 / 2 / 4;
  }
  /* Right column, bottom two rows */
  .bento-span-right-tall {
    grid-area: 2 / 3 / 4 / 4;
  }
}
Summary
Component	File	Dependency
GlowingEffect	components/ui/GlowingEffect.jsx + .css	motion (plain)
DisplayCards	components/ui/DisplayCards.jsx + .css	None
TubelightNavBar	components/ui/TubelightNavBar.jsx + .css	motion/react
BentoGrid	components/ui/BentoGrid.jsx + .css	None

# One install covers both GlowingEffect and TubelightNavBar
npm install motion --prefix apps/creator-dashboard