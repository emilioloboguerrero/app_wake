import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';

const ease = [0.22, 1, 0.36, 1];

function ClosingVisual() {
  return (
    <svg width="260" height="240" viewBox="0 0 260 240" fill="none">
      {/* Central user silhouette - standing tall */}
      <motion.g
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease, delay: 0.3 }}
      >
        {/* Head */}
        <circle cx="130" cy="70" r="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        {/* Body */}
        <path
          d="M100 120 Q100 98 130 92 Q160 98 160 120 L160 165 Q160 175 150 175 L110 175 Q100 175 100 165 Z"
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />
      </motion.g>

      {/* Data traces orbiting the user */}
      {/* Strength trace */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.8 }}
      >
        <motion.polyline
          points="30,100 40,95 50,90 60,85"
          stroke="rgba(255,87,168,0.25)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease, delay: 1 }}
        />
        <motion.circle
          cx="60" cy="85" r="2.5"
          fill="rgba(255,87,168,0.4)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
        />
      </motion.g>

      {/* Nutrition trace */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1 }}
      >
        <motion.path
          d="M200 90 A 18 18 0 1 1 200 89.99"
          stroke="rgba(255,87,168,0.2)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 0.75 }}
          transition={{ duration: 1, ease, delay: 1.2 }}
        />
      </motion.g>

      {/* Consistency dots */}
      {[
        { x: 45, y: 140 }, { x: 55, y: 140 }, { x: 65, y: 140 },
        { x: 45, y: 150 }, { x: 55, y: 150 }, { x: 65, y: 150 },
      ].map((dot, i) => (
        <motion.rect
          key={i}
          x={dot.x} y={dot.y} width="7" height="7" rx="1.5"
          fill={i < 5 ? 'rgba(255,87,168,0.2)' : 'rgba(255,255,255,0.04)'}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, delay: 1.4 + i * 0.08 }}
        />
      ))}

      {/* Weight line */}
      <motion.polyline
        points="195,140 205,138 215,135 225,132"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease, delay: 1.4 }}
      />

      {/* Arrows flowing from data traces toward user */}
      <motion.path
        d="M70 92 Q85 95 95 100"
        stroke="rgba(255,87,168,0.1)"
        strokeWidth="1"
        strokeDasharray="3 2"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 1.8 }}
      />
      <motion.path
        d="M190 95 Q175 100 165 105"
        stroke="rgba(255,87,168,0.1)"
        strokeWidth="1"
        strokeDasharray="3 2"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 1.8 }}
      />

      {/* Target/goal marker above the user - like a destination */}
      <motion.g
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease, delay: 2 }}
      >
        <motion.circle
          cx="130" cy="30" r="12"
          fill="none"
          stroke="rgba(255,87,168,0.2)"
          strokeWidth="1.5"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, ease, delay: 2.2 }}
        />
        <motion.circle
          cx="130" cy="30" r="5"
          fill="rgba(255,87,168,0.15)"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, ease, delay: 2.4 }}
        />
        <motion.circle
          cx="130" cy="30" r="2"
          fill="rgba(255,87,168,0.4)"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3, ease, delay: 2.6 }}
        />
      </motion.g>

      {/* Arrow from user up to goal */}
      <motion.path
        d="M130 52 L130 44"
        stroke="rgba(255,87,168,0.25)"
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, delay: 2 }}
      />

      {/* Glow pulse around user */}
      <motion.circle
        cx="130" cy="120" r="55"
        fill="none"
        stroke="rgba(255,87,168,0.06)"
        strokeWidth="1"
        initial={{ opacity: 0 }}
        animate={{ scale: [1, 1.15, 1], opacity: [0, 0.3, 0] }}
        transition={{ duration: 3, repeat: Infinity, delay: 2.5, ease: 'easeInOut' }}
      />
    </svg>
  );
}

export default function Card07Closing({ onFinish }) {
  return (
    <ScreenWrapper>
      <Visual>
        <ClosingVisual />
      </Visual>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.5 }}
      >
        <Title>Cada registro te acerca a tus <Bold>objetivos</Bold></Title>
      </motion.div>

      {/* Start button */}
      <motion.button
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 1.5 }}
        onClick={onFinish}
        style={{
          padding: '14px 48px',
          background: 'rgba(255,87,168,0.12)',
          border: '1px solid rgba(255,87,168,0.3)',
          borderRadius: 12,
          color: 'rgba(255,255,255,0.85)',
          fontSize: 15,
          fontWeight: 500,
          fontFamily: "'Inter', sans-serif",
          letterSpacing: '0.04em',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          flexShrink: 0,
        }}
      >
        Comenzar
      </motion.button>
    </ScreenWrapper>
  );
}
