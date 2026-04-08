import { motion } from 'motion/react';

const accent = '255,87,168';
const colors = {
  wake:       { bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.18)', text: 'rgba(255,255,255,0.85)' },
  mobile:     { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', text: 'rgba(255,255,255,0.6)' },
  creator:    { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', text: 'rgba(255,255,255,0.6)' },
  asesorias:  { bg: `rgba(${accent},0.1)`, border: `rgba(${accent},0.25)`, text: `rgba(${accent},0.85)` },
  generales:  { bg: `rgba(${accent},0.1)`, border: `rgba(${accent},0.25)`, text: `rgba(${accent},0.85)` },
  biblioteca: { bg: `rgba(${accent},0.12)`, border: `rgba(${accent},0.3)`, text: `rgba(${accent},0.9)` },
  eventos:    { bg: `rgba(${accent},0.08)`, border: `rgba(${accent},0.2)`, text: `rgba(${accent},0.75)` },
  ejercicios: { bg: `rgba(${accent},0.08)`, border: `rgba(${accent},0.2)`, text: `rgba(${accent},0.75)` },
  sesiones:   { bg: `rgba(${accent},0.08)`, border: `rgba(${accent},0.2)`, text: `rgba(${accent},0.75)` },
  planes:     { bg: `rgba(${accent},0.08)`, border: `rgba(${accent},0.2)`, text: `rgba(${accent},0.75)` },
  nutricion:  { bg: `rgba(${accent},0.08)`, border: `rgba(${accent},0.2)`, text: `rgba(${accent},0.75)` },
};

const inactiveStyle = { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.2)' };

const nodes = {
  wake:       { x: 160, y: 24,  label: 'Wake' },
  mobile:     { x: 70,  y: 80,  label: 'App Movil' },
  creator:    { x: 260, y: 80,  label: 'Creador' },
  asesorias:  { x: 100, y: 150, label: 'Asesorias' },
  generales:  { x: 240, y: 150, label: 'Generales' },
  biblioteca: { x: 380, y: 150, label: 'Biblioteca' },
  eventos:    { x: 500, y: 150, label: 'Eventos' },
  ejercicios: { x: 310, y: 225, label: 'Ejercicios' },
  sesiones:   { x: 400, y: 295, label: 'Sesiones' },
  planes:     { x: 310, y: 365, label: 'Planes' },
  nutricion:  { x: 490, y: 225, label: 'Nutricion' },
};

const steps = {
  1: {
    nodes: ['wake', 'mobile', 'creator'],
    active: ['wake', 'mobile', 'creator'],
    conns: [['wake', 'mobile'], ['wake', 'creator']],
    flows: [],
  },
  2: {
    nodes: ['wake', 'mobile', 'creator', 'asesorias', 'generales', 'biblioteca', 'eventos'],
    active: ['creator', 'asesorias', 'generales', 'biblioteca', 'eventos'],
    conns: [
      ['wake', 'mobile'], ['wake', 'creator'],
      ['creator', 'asesorias'], ['creator', 'generales'],
      ['creator', 'biblioteca'], ['creator', 'eventos'],
    ],
    flows: [],
  },
  3: {
    nodes: ['wake', 'mobile', 'creator', 'asesorias', 'generales', 'biblioteca', 'eventos'],
    active: ['asesorias', 'generales'],
    conns: [
      ['wake', 'mobile'], ['wake', 'creator'],
      ['creator', 'asesorias'], ['creator', 'generales'],
      ['creator', 'biblioteca'], ['creator', 'eventos'],
    ],
    flows: [],
  },
  4: {
    nodes: ['wake', 'mobile', 'creator', 'asesorias', 'generales', 'biblioteca', 'eventos'],
    active: ['asesorias', 'generales', 'biblioteca'],
    conns: [
      ['wake', 'mobile'], ['wake', 'creator'],
      ['creator', 'asesorias'], ['creator', 'generales'],
      ['creator', 'biblioteca'], ['creator', 'eventos'],
    ],
    flows: [
      { from: 'biblioteca', to: 'asesorias' },
      { from: 'biblioteca', to: 'generales' },
    ],
  },
  5: {
    nodes: ['wake', 'mobile', 'creator', 'asesorias', 'generales', 'biblioteca', 'eventos', 'ejercicios'],
    active: ['biblioteca', 'ejercicios'],
    conns: [
      ['wake', 'mobile'], ['wake', 'creator'],
      ['creator', 'asesorias'], ['creator', 'generales'],
      ['creator', 'biblioteca'], ['creator', 'eventos'],
      ['biblioteca', 'ejercicios'],
    ],
    flows: [
      { from: 'biblioteca', to: 'asesorias' },
      { from: 'biblioteca', to: 'generales' },
    ],
  },
  6: {
    nodes: ['wake', 'mobile', 'creator', 'asesorias', 'generales', 'biblioteca', 'eventos', 'ejercicios', 'sesiones'],
    active: ['ejercicios', 'sesiones'],
    conns: [
      ['wake', 'mobile'], ['wake', 'creator'],
      ['creator', 'asesorias'], ['creator', 'generales'],
      ['creator', 'biblioteca'], ['creator', 'eventos'],
      ['biblioteca', 'ejercicios'], ['ejercicios', 'sesiones'],
    ],
    flows: [
      { from: 'biblioteca', to: 'asesorias' },
      { from: 'biblioteca', to: 'generales' },
    ],
  },
  7: {
    nodes: ['wake', 'mobile', 'creator', 'asesorias', 'generales', 'biblioteca', 'eventos', 'ejercicios', 'sesiones', 'planes'],
    active: ['sesiones', 'planes'],
    conns: [
      ['wake', 'mobile'], ['wake', 'creator'],
      ['creator', 'asesorias'], ['creator', 'generales'],
      ['creator', 'biblioteca'], ['creator', 'eventos'],
      ['biblioteca', 'ejercicios'], ['ejercicios', 'sesiones'], ['sesiones', 'planes'],
    ],
    flows: [
      { from: 'biblioteca', to: 'asesorias' },
      { from: 'biblioteca', to: 'generales' },
    ],
  },
  8: {
    nodes: ['wake', 'mobile', 'creator', 'asesorias', 'generales', 'biblioteca', 'eventos', 'ejercicios', 'sesiones', 'planes', 'nutricion'],
    active: ['biblioteca', 'nutricion'],
    conns: [
      ['wake', 'mobile'], ['wake', 'creator'],
      ['creator', 'asesorias'], ['creator', 'generales'],
      ['creator', 'biblioteca'], ['creator', 'eventos'],
      ['biblioteca', 'ejercicios'], ['ejercicios', 'sesiones'], ['sesiones', 'planes'],
      ['biblioteca', 'nutricion'],
    ],
    flows: [
      { from: 'biblioteca', to: 'asesorias' },
      { from: 'biblioteca', to: 'generales' },
    ],
  },
  9: {
    nodes: ['wake', 'mobile', 'creator', 'asesorias', 'generales', 'biblioteca', 'eventos', 'ejercicios', 'sesiones', 'planes', 'nutricion'],
    active: ['eventos'],
    conns: [
      ['wake', 'mobile'], ['wake', 'creator'],
      ['creator', 'asesorias'], ['creator', 'generales'],
      ['creator', 'biblioteca'], ['creator', 'eventos'],
      ['biblioteca', 'ejercicios'], ['ejercicios', 'sesiones'], ['sesiones', 'planes'],
      ['biblioteca', 'nutricion'],
    ],
    flows: [
      { from: 'biblioteca', to: 'asesorias' },
      { from: 'biblioteca', to: 'generales' },
    ],
  },
  10: {
    nodes: Object.keys(nodes),
    active: Object.keys(nodes),
    conns: [
      ['wake', 'mobile'], ['wake', 'creator'],
      ['creator', 'asesorias'], ['creator', 'generales'],
      ['creator', 'biblioteca'], ['creator', 'eventos'],
      ['biblioteca', 'ejercicios'], ['ejercicios', 'sesiones'], ['sesiones', 'planes'],
      ['biblioteca', 'nutricion'],
    ],
    flows: [
      { from: 'biblioteca', to: 'asesorias' },
      { from: 'biblioteca', to: 'generales' },
    ],
  },
};

function Pill({ id, active, isNew }) {
  const n = nodes[id];
  const pillW = 82;
  const pillH = 28;
  const radius = 8;
  const fontSize = 10;

  const c = active ? colors[id] : inactiveStyle;

  return (
    <motion.g
      initial={isNew ? { opacity: 0, scale: 0.5 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 20, stiffness: 150, delay: isNew ? 0.25 : 0 }}
    >
      {active && isNew && (
        <motion.ellipse
          cx={n.x} cy={n.y}
          rx={pillW * 0.65} ry={pillH * 1}
          fill={`${c.border.replace(/[\d.]+\)$/, '0.06)')}`}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
        />
      )}
      <rect
        x={n.x - pillW / 2}
        y={n.y - pillH / 2}
        width={pillW}
        height={pillH}
        rx={radius}
        fill={c.bg}
        stroke={c.border}
        strokeWidth={0.8}
      />
      <text
        x={n.x}
        y={n.y + fontSize * 0.35}
        textAnchor="middle"
        fontSize={fontSize}
        fill={c.text}
        fontFamily="'Montserrat', system-ui, sans-serif"
        fontWeight={active ? 600 : 400}
      >
        {n.label}
      </text>
    </motion.g>
  );
}

function Connection({ from, to, isNew, active }) {
  const a = nodes[from];
  const b = nodes[to];
  const midY = (a.y + b.y) / 2;
  const d = `M ${a.x} ${a.y + 14} C ${a.x} ${midY + 8}, ${b.x} ${midY - 8}, ${b.x} ${b.y - 14}`;

  return (
    <motion.path
      d={d}
      fill="none"
      stroke={active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}
      strokeWidth={1}
      initial={isNew ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.8, delay: isNew ? 0.15 : 0, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

function FlowConnection({ from, to, isNew }) {
  const a = nodes[from];
  const b = nodes[to];
  const midX = (a.x + b.x) / 2;
  const midY = Math.min(a.y, b.y) - 25;
  const d = `M ${a.x} ${a.y - 14} Q ${midX} ${midY}, ${b.x} ${b.y - 14}`;

  return (
    <motion.path
      d={d}
      fill="none"
      stroke="rgba(255,255,255,0.12)"
      strokeWidth={1}
      strokeDasharray="4 3"
      initial={isNew ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 1, delay: isNew ? 0.4 : 0, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}

export default function PlatformTree({ step = 1, prevStep = 0 }) {
  const config = steps[step];
  const prev = steps[prevStep] || { nodes: [], conns: [], flows: [] };
  if (!config) return null;

  const prevNodes = new Set(prev.nodes || []);
  const prevConns = new Set((prev.conns || []).map(c => c.join('-')));
  const prevFlows = new Set((prev.flows || []).map(f => `${f.from}-${f.to}`));

  const centered = step === 10;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: centered ? 1 : 0.8, delay: centered ? 0.2 : 0.5 }}
      style={{
        position: 'absolute',
        top: 0, right: 0,
        width: centered ? '100%' : '38%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: centered ? 2 : 5,
        pointerEvents: 'none',
        transition: 'width 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 580 400"
        preserveAspectRatio="xMidYMid meet"
        style={{ maxWidth: centered ? 800 : '100%', maxHeight: centered ? 520 : '100%' }}
      >
        {config.conns.map(([from, to]) => {
          const key = `${from}-${to}`;
          const isActive = config.active.includes(from) || config.active.includes(to);
          return (
            <Connection key={key} from={from} to={to} isNew={!prevConns.has(key)} active={isActive} />
          );
        })}
        {(config.flows || []).map((flow) => {
          const key = `flow-${flow.from}-${flow.to}`;
          return (
            <FlowConnection key={key} from={flow.from} to={flow.to} isNew={!prevFlows.has(`${flow.from}-${flow.to}`)} />
          );
        })}
        {config.nodes.map((id) => (
          <Pill key={id} id={id} active={config.active.includes(id)} isNew={!prevNodes.has(id)} />
        ))}
      </svg>
    </motion.div>
  );
}
