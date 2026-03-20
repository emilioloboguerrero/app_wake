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
What it does: A pill-shaped navigation bar with a glowing "tubelight" indicator that slides between tabs with a spring animation. Supports horizontal and vertical orientation.

**Important: This component uses an `activeId`/`onSelect` callback pattern — NOT React Router `<Link>` elements.** The parent controls which tab is active and handles navigation. Items are `<button>` elements, not links.

Files to create
src/components/ui/TubelightNavBar.jsx

import { useState } from 'react';
import { motion } from 'motion/react';
import './TubelightNavBar.css';

export default function TubelightNavBar({ items, activeId, onSelect, orientation = 'horizontal' }) {
  const [hovered, setHovered] = useState(null);

  return (
    <nav
      className={`tubelight-nav tubelight-nav--${orientation}`}
      onMouseLeave={() => setHovered(null)}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        const isHovered = item.id === hovered;

        return (
          <button
            key={item.id}
            className={`tubelight-item ${isActive ? 'tubelight-item--active' : ''}`}
            onClick={() => onSelect(item.id)}
            onMouseEnter={() => setHovered(item.id)}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.icon && (
              <span className="tubelight-item-icon">{item.icon}</span>
            )}
            <span className="tubelight-item-label">{item.label}</span>

            {isActive && (
              <motion.div
                layoutId="tubelight-indicator"
                className="tubelight-indicator"
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              />
            )}

            {(isHovered || isActive) && (
              <motion.div
                layoutId="tubelight-glow"
                className="tubelight-glow"
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
src/components/ui/TubelightNavBar.css — see the actual file for full CSS (tubelight-nav, tubelight-item, tubelight-indicator, tubelight-glow classes).

How to use

import TubelightNavBar from '../components/ui/TubelightNavBar';
import { Home, Users, Calendar, BarChart2 } from 'lucide-react';

const [activeTab, setActiveTab] = useState('inicio');

const navItems = [
  { id: 'inicio',     label: 'Inicio',     icon: <Home size={18} /> },
  { id: 'clientes',   label: 'Clientes',   icon: <Users size={18} /> },
  { id: 'agenda',     label: 'Agenda',     icon: <Calendar size={18} /> },
  { id: 'resultados', label: 'Resultados', icon: <BarChart2 size={18} /> },
];

<TubelightNavBar
  items={navItems}
  activeId={activeTab}
  onSelect={(id) => { setActiveTab(id); navigate(`/creators/${id}`); }}
  orientation="horizontal"
/>
Props:
  items — array of { id, label, icon } objects
  activeId — the id of the currently active tab (controlled by parent)
  onSelect — callback fired with item.id when a tab is clicked (parent handles navigation)
  orientation — 'horizontal' (default) or 'vertical'

Each item needs:
  id — unique string identifier for the tab
  label — text label shown in the tab
  icon — React node (e.g. lucide-react icon rendered inline)

Important: This does NOT use React Router Links — it uses buttons with an onSelect callback. The parent component is responsible for navigation. The motion import uses motion/react (needed for layoutId spring animations).

4. BentoGrid
What it does: A CSS grid layout where cards span different columns/rows to create an asymmetric "bento box" look.

**Important: The actual implementation uses a `span` prop (e.g. `'1x1'`, `'2x1'`, `'1x2'`) for card sizing, NOT named grid-area placement classes.** Cards render `children` directly — they do NOT have built-in `name`, `description`, `icon`, `href`, or `cta` props.

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
  children,
  className = '',
  span = '1x1',
  onClick,
}) {
  return (
    <div
      className={`bento-card bento-card--${span} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {children}
    </div>
  );
}

export default BentoGrid;
src/components/ui/BentoGrid.css — see the actual file for full CSS (bento-grid, bento-card, bento-card--{span} classes).

How to use

import { BentoGrid, BentoCard } from '../components/ui/BentoGrid';

<BentoGrid>
  <BentoCard span="2x1" onClick={() => navigate('/files')}>
    <h3>Guarda tus archivos</h3>
    <p>Guardamos automáticamente mientras escribes.</p>
  </BentoCard>
  <BentoCard span="1x1">
    <h3>Búsqueda completa</h3>
    <p>Busca en todos tus archivos desde un solo lugar.</p>
  </BentoCard>
  <BentoCard span="1x2" onClick={() => navigate('/stats')}>
    <h3>Estadísticas</h3>
    <p>Ve tus resultados en tiempo real.</p>
  </BentoCard>
</BentoGrid>

Props (BentoCard):
  children — card content (render whatever you want inside)
  span — grid sizing: '1x1' (default), '2x1' (wide), '1x2' (tall), '2x2' (large). Maps to CSS class `bento-card--{span}`
  onClick — optional click handler (adds button role + keyboard support when present)
  className — additional CSS classes

Grid placement is controlled by the `span` prop, NOT by named grid-area classes. The CSS maps each span value to the appropriate `grid-column`/`grid-row` spans.
Summary
Component	File	Dependency	Pattern
GlowingEffect	components/ui/GlowingEffect.jsx + .css	motion (plain)	Wrap any card with position:relative
DisplayCards	components/ui/DisplayCards.jsx + .css	None	className-based card stacking
TubelightNavBar	components/ui/TubelightNavBar.jsx + .css	motion/react	activeId/onSelect callback (NOT React Router Links)
BentoGrid	components/ui/BentoGrid.jsx + .css	None	span prop ('1x1', '2x1', etc.) for sizing

# One install covers both GlowingEffect and TubelightNavBar
npm install motion --prefix apps/creator-dashboard