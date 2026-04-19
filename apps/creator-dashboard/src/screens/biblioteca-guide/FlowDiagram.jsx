import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';

const ease = [0.22, 1, 0.36, 1];

// ── Icons ───────────────────────────────────────────────────────────

function DumbbellIcon({ size = 16, color = 'rgba(255,255,255,0.4)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M6.5 6.5h11M4 9V5h2v8H4V9zm14 0V5h2v8h-2V9zM2 8v2h2V8H2zm18 0v2h2V8h-2z"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LayersIcon({ size = 16, color = 'rgba(255,255,255,0.4)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon({ size = 16, color = 'rgba(255,255,255,0.4)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M4 8h16M8 2v4m8-4v4M4 4h16a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UtensilsIcon({ size = 16, color = 'rgba(255,255,255,0.4)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon({ size = 20, color = 'rgba(255,255,255,0.4)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon({ size = 20, color = 'rgba(255,255,255,0.4)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BookIcon({ size = 16, color = 'rgba(255,255,255,0.4)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 014 17V5a2 2 0 012-2h14v14H6.5A2.5 2.5 0 004 19.5z"
        stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Step 1: Library ─────────────────────────────────────────────────

function LibItem({ icon, label, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 18px', borderRadius: 13,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {icon}
      <span style={{
        color: 'rgba(255,255,255,0.55)', fontSize: 13,
        fontFamily: "'Inter', sans-serif", fontWeight: 500,
      }}>
        {label}
      </span>
    </motion.div>
  );
}

function Step1Diagram() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease }}
      style={{ display: 'flex', justifyContent: 'center', width: '100%' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease }}
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20, padding: 26,
          display: 'flex', flexDirection: 'column', gap: 8,
          minWidth: 300,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 6, paddingBottom: 14,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{
            color: 'rgba(255,255,255,0.7)', fontSize: 15,
            fontFamily: "'Inter', sans-serif", fontWeight: 600,
            letterSpacing: '0.02em',
          }}>
            Tu Biblioteca
          </span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            transition={{ duration: 0.4, delay: 0.4, ease }}
            style={{
              color: 'rgba(255,255,255,0.3)', fontSize: 10,
              fontFamily: "'Inter', sans-serif", fontWeight: 500,
            }}
          >
            versión original
          </motion.span>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.45 }}
          transition={{ duration: 0.3, delay: 0.08, ease }}
          style={{
            fontSize: 9, fontFamily: "'Inter', sans-serif",
            fontWeight: 600, color: 'rgba(255,255,255,0.3)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            paddingLeft: 2, marginTop: 4,
          }}
        >
          Entrenamiento
        </motion.div>
        <LibItem icon={<DumbbellIcon />} label="Ejercicios" delay={0.12} />
        <LibItem icon={<LayersIcon />} label="Sesiones" delay={0.18} />
        <LibItem icon={<CalendarIcon />} label="Planes semanales" delay={0.24} />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.3, ease }}
          style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 0' }}
        />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.45 }}
          transition={{ duration: 0.3, delay: 0.32, ease }}
          style={{
            fontSize: 9, fontFamily: "'Inter', sans-serif",
            fontWeight: 600, color: 'rgba(255,255,255,0.3)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            paddingLeft: 2,
          }}
        >
          Nutrición
        </motion.div>
        <LibItem icon={<UtensilsIcon />} label="Comidas" delay={0.38} />
        <LibItem icon={<CalendarIcon />} label="Planes nutricionales" delay={0.44} />
      </motion.div>
    </motion.div>
  );
}

// ── Step 2: Build + Assign (two parallel flows) ─────────────────────

function SmallPill({ icon, label, visible = true, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.92 }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 10, scale: visible ? 1 : 0.92 }}
      transition={{ duration: 0.35, delay: visible ? delay : 0, ease }}
      style={{
        padding: '8px 14px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 7,
      }}
    >
      {icon}
      <span style={{
        fontSize: 11, color: 'rgba(255,255,255,0.5)',
        fontFamily: "'Inter', sans-serif", fontWeight: 500,
      }}>
        {label}
      </span>
    </motion.div>
  );
}

function MedCard({ icon, label, visible = true, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.93 }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 12, scale: visible ? 1 : 0.93 }}
      transition={{ duration: 0.35, delay: visible ? delay : 0, ease }}
      style={{
        padding: '10px 18px', borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 9,
      }}
    >
      {icon}
      <span style={{
        fontSize: 12, color: 'rgba(255,255,255,0.55)',
        fontFamily: "'Inter', sans-serif", fontWeight: 500,
      }}>
        {label}
      </span>
    </motion.div>
  );
}

function LgCard({ icon, label, visible = true, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.93 }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 14, scale: visible ? 1 : 0.93 }}
      transition={{ duration: 0.4, delay: visible ? delay : 0, ease }}
      style={{
        padding: '12px 22px', borderRadius: 13,
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.09)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      {icon}
      <span style={{
        fontSize: 13, color: 'rgba(255,255,255,0.6)',
        fontFamily: "'Inter', sans-serif", fontWeight: 600,
      }}>
        {label}
      </span>
    </motion.div>
  );
}

function DestCard({ icon, label, visible = true, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 12 }}
      transition={{ duration: 0.35, delay: visible ? delay : 0, ease }}
      style={{
        padding: '12px 20px', borderRadius: 13,
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 9,
      }}
    >
      {icon}
      <span style={{
        fontSize: 12, color: 'rgba(255,255,255,0.6)',
        fontFamily: "'Inter', sans-serif", fontWeight: 500,
      }}>
        {label}
      </span>
    </motion.div>
  );
}

function VArrow({ visible, delay = 0 }) {
  return (
    <motion.div
      animate={{ opacity: visible ? 0.3 : 0 }}
      transition={{ duration: 0.3, delay: visible ? delay : 0, ease }}
      style={{ display: 'flex', justifyContent: 'center', height: 24, margin: '2px 0' }}
    >
      <svg width="14" height="24" viewBox="0 0 14 24">
        <path d="M7 0v17M3 14l4 4 4-4" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </motion.div>
  );
}

function MergeFork({ visible, delay = 0 }) {
  return (
    <motion.div
      animate={{ opacity: visible ? 0.3 : 0 }}
      transition={{ duration: 0.35, delay: visible ? delay : 0, ease }}
      style={{ display: 'flex', justifyContent: 'center', height: 32, margin: '6px 0' }}
    >
      <svg width="180" height="32" viewBox="0 0 180 32">
        <path d="M90 0 V12" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"
          strokeLinecap="round" fill="none" />
        <path d="M90 12 L52 30" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"
          strokeLinecap="round" fill="none" />
        <path d="M90 12 L128 30" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"
          strokeLinecap="round" fill="none" />
      </svg>
    </motion.div>
  );
}

function ColLabel({ text, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.4 }}
      transition={{ duration: 0.3, delay, ease }}
      style={{
        fontSize: 9, fontFamily: "'Inter', sans-serif",
        fontWeight: 600, color: 'rgba(255,255,255,0.3)',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        marginBottom: 8,
      }}
    >
      {text}
    </motion.div>
  );
}

function Step2Diagram() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 1600),
      setTimeout(() => setPhase(3), 2400),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease }}
      style={{ display: 'flex', justifyContent: 'center', width: '100%' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Two parallel build columns */}
        <div style={{ display: 'flex', gap: 48, alignItems: 'flex-end', marginBottom: 2 }}>

          {/* Training column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ColLabel text="Entrenamiento" delay={0.05} />
            <div style={{ display: 'flex', gap: 8 }}>
              <SmallPill icon={<DumbbellIcon size={13} />} label="Sentadilla" delay={0.05} />
              <SmallPill icon={<DumbbellIcon size={13} />} label="Press" delay={0.12} />
              <SmallPill icon={<DumbbellIcon size={13} />} label="Remo" delay={0.19} />
            </div>
            <VArrow visible={phase >= 1} />
            <div style={{ display: 'flex', gap: 8 }}>
              <MedCard icon={<LayersIcon size={14} />} label="Tren superior" visible={phase >= 1} delay={0.05} />
              <MedCard icon={<LayersIcon size={14} />} label="Tren inferior" visible={phase >= 1} delay={0.12} />
            </div>
            <VArrow visible={phase >= 2} />
            <LgCard icon={<CalendarIcon size={16} />} label="Plan Semanal" visible={phase >= 2} delay={0.05} />
          </div>

          {/* Nutrition column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <ColLabel text="Nutrición" delay={0.08} />
            <div style={{ display: 'flex', gap: 8 }}>
              <SmallPill icon={<UtensilsIcon size={13} />} label="Desayuno" delay={0.08} />
              <SmallPill icon={<UtensilsIcon size={13} />} label="Almuerzo" delay={0.16} />
            </div>
            <VArrow visible={phase >= 1} />
            <LgCard icon={<CalendarIcon size={16} />} label="Plan Nutriciónal" visible={phase >= 1} delay={0.08} />
          </div>
        </div>

        {/* Merge to shared destinations */}
        <MergeFork visible={phase >= 3} />
        <div style={{ display: 'flex', gap: 28 }}>
          <DestCard icon={<UsersIcon size={18} color="rgba(255,255,255,0.45)" />} label="Programa" visible={phase >= 3} delay={0.05} />
          <DestCard icon={<UserIcon size={18} color="rgba(255,255,255,0.45)" />} label="Cliente" visible={phase >= 3} delay={0.12} />
        </div>
      </div>
    </motion.div>
  );
}

// ── Step 3: Local edit vs Propagation ───────────────────────────────

const MINI_STYLES = {
  default: {
    opacity: 1,
    bg: 'rgba(255,255,255,0.025)',
    border: 'rgba(255,255,255,0.07)',
    text: 'rgba(255,255,255,0.5)',
    pulse: null,
  },
  dim: {
    opacity: 0.4,
    bg: 'rgba(255,255,255,0.015)',
    border: 'rgba(255,255,255,0.05)',
    text: 'rgba(255,255,255,0.4)',
    pulse: null,
  },
  editBlue: {
    opacity: 1,
    bg: 'rgba(130,200,255,0.06)',
    border: 'rgba(130,200,255,0.3)',
    text: 'rgba(255,255,255,0.85)',
    pulse: 'rgba(130,200,255,0.08)',
  },
  editPink: {
    opacity: 1,
    bg: 'rgba(255,87,168,0.06)',
    border: 'rgba(255,87,168,0.3)',
    text: 'rgba(255,255,255,0.85)',
    pulse: 'rgba(255,87,168,0.08)',
  },
};

function MiniNode({ icon, label, state = 'default' }) {
  const s = MINI_STYLES[state];
  return (
    <motion.div
      animate={{
        opacity: s.opacity,
        borderColor: s.border,
        backgroundColor: s.bg,
      }}
      transition={{ duration: 0.4, ease }}
      style={{
        padding: '10px 16px', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 8,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {s.pulse && (
        <motion.div
          key={state}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: 0, borderRadius: 12,
            background: s.pulse,
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>{icon}</div>
      <motion.span
        animate={{ color: s.text }}
        transition={{ duration: 0.4, ease }}
        style={{
          fontSize: 12, fontFamily: "'Inter', sans-serif",
          fontWeight: 500, position: 'relative', zIndex: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </motion.span>
    </motion.div>
  );
}

function SmallFork({ highlight = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', height: 28, margin: '2px 0' }}>
      <svg width="110" height="28" viewBox="0 0 110 28">
        <motion.path
          d="M55 0 V10 M55 10 L28 26 M55 10 L82 26"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          animate={{ stroke: highlight ? 'rgba(255,87,168,0.35)' : 'rgba(255,255,255,0.15)' }}
          transition={{ duration: 0.4, ease }}
        />
      </svg>
    </div>
  );
}

function PanelBadge({ text, color, visible }) {
  const colors = {
    blue: { text: 'rgba(130,200,255,0.7)', bg: 'rgba(130,200,255,0.06)', border: 'rgba(130,200,255,0.18)' },
    pink: { text: 'rgba(255,87,168,0.8)', bg: 'rgba(255,87,168,0.06)', border: 'rgba(255,87,168,0.2)' },
  };
  const c = colors[color] || colors.blue;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35, ease }}
          style={{
            padding: '6px 16px', borderRadius: 9,
            background: c.bg, border: `1px solid ${c.border}`,
            marginTop: 4,
          }}
        >
          <span style={{
            fontSize: 11, color: c.text,
            fontFamily: "'Inter', sans-serif", fontWeight: 500,
          }}>
            {text}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ScenarioPanel({ title, libState, progState, cliState, arrowHighlight, badge, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 14, padding: '0 20px', maxWidth: 300,
      }}
    >
      <span style={{
        fontSize: 11, color: 'rgba(255,255,255,0.3)',
        fontFamily: "'Inter', sans-serif", fontWeight: 500,
        letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>
        {title}
      </span>

      <MiniNode icon={<BookIcon size={14} />} label="Biblioteca" state={libState} />
      <SmallFork highlight={arrowHighlight} />
      <div style={{ display: 'flex', gap: 12 }}>
        <MiniNode icon={<UsersIcon size={14} color="rgba(255,255,255,0.35)" />} label="Programa" state={progState} />
        <MiniNode icon={<UserIcon size={14} color="rgba(255,255,255,0.35)" />} label="Cliente" state={cliState} />
      </div>

      {badge && <PanelBadge text={badge.text} color={badge.color} visible />}
    </motion.div>
  );
}

function Step3Diagram() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease }}
      style={{
        display: 'flex', justifyContent: 'center',
        width: '100%',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 0,
        justifyContent: 'center',
      }}>
        <ScenarioPanel
          title="Editar una copia"
          libState="dim"
          progState="dim"
          cliState={phase >= 1 ? 'editBlue' : 'default'}
          arrowHighlight={false}
          badge={phase >= 1 ? { text: 'Solo cambia ahí', color: 'blue' } : null}
          delay={0.1}
        />

        <motion.div
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: 0.4, delay: 0.15, ease }}
          style={{
            width: 1, height: 220, flexShrink: 0,
            background: 'rgba(255,255,255,0.06)',
            alignSelf: 'center',
            transformOrigin: 'center',
          }}
        />

        <ScenarioPanel
          title="Propagar desde la biblioteca"
          libState={phase >= 2 ? 'editPink' : 'default'}
          progState={phase >= 2 ? 'editPink' : 'default'}
          cliState={phase >= 2 ? 'editPink' : 'default'}
          arrowHighlight={phase >= 2}
          badge={phase >= 2 ? { text: 'Todos se actualizan', color: 'pink' } : null}
          delay={0.2}
        />
      </div>
    </motion.div>
  );
}

// ── Main export ─────────────────────────────────────────────────────

export default function FlowDiagram({ step }) {
  if (step === 1) return <Step1Diagram key="s1" />;
  if (step === 2) return <Step2Diagram key="s2" />;
  if (step === 3) return <Step3Diagram key="s3" />;
  return null;
}
