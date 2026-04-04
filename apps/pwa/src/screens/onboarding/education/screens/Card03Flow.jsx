import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';

const ease = [0.22, 1, 0.36, 1];

function FlowDiagram() {
  return (
    <svg width="280" height="240" viewBox="0 0 280 240" fill="none">
      {/* Program card at top (from previous screen, compressed) */}
      <motion.g
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.3, scale: 1 }}
        transition={{ duration: 0.6, ease }}
      >
        <rect x="105" y="5" width="70" height="35" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
        <rect x="115" y="15" width="30" height="3" rx="1.5" fill="rgba(255,255,255,0.1)" />
        <rect x="115" y="22" width="20" height="2" rx="1" fill="rgba(255,255,255,0.05)" />
      </motion.g>

      {/* Arrow splitting from program down to training and nutrition */}
      <motion.path
        d="M140 40 L140 65"
        stroke="rgba(255,87,168,0.2)"
        strokeWidth="1.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease, delay: 0.3 }}
      />
      <motion.path
        d="M140 65 L80 90"
        stroke="rgba(255,87,168,0.2)"
        strokeWidth="1.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease, delay: 0.5 }}
      />
      <motion.path
        d="M140 65 L200 90"
        stroke="rgba(255,87,168,0.2)"
        strokeWidth="1.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease, delay: 0.5 }}
      />

      {/* Training node */}
      <motion.g
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.7 }}
      >
        <rect x="30" y="90" width="100" height="50" rx="10" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        {/* Dumbbell icon */}
        <circle cx="58" cy="110" r="3" fill="rgba(255,255,255,0.15)" />
        <rect x="61" y="108" width="14" height="4" rx="2" fill="rgba(255,255,255,0.1)" />
        <circle cx="78" cy="110" r="3" fill="rgba(255,255,255,0.15)" />
        <text x="80" y="130" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="Montserrat" fontWeight="500">
          Entrenamiento
        </text>
      </motion.g>

      {/* Nutrition node */}
      <motion.g
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.9 }}
      >
        <rect x="150" y="90" width="100" height="50" rx="10" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        {/* Fork/knife icon simplified */}
        <line x1="192" y1="102" x2="192" y2="120" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="200" y1="102" x2="200" y2="120" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M196 102 Q196 98 192 98" stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none" />
        <text x="200" y="130" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="Montserrat" fontWeight="500">
          Nutrición
        </text>
      </motion.g>

      {/* Both arrows converging down to Lab */}
      <motion.path
        d="M80 140 L120 165"
        stroke="rgba(255,87,168,0.15)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease, delay: 1.2 }}
      />
      <motion.path
        d="M200 140 L160 165"
        stroke="rgba(255,87,168,0.15)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease, delay: 1.2 }}
      />

      {/* Lab node - larger, more prominent */}
      <motion.g
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease, delay: 1.4 }}
      >
        <rect x="75" y="165" width="130" height="55" rx="12" fill="rgba(255,87,168,0.06)" stroke="rgba(255,87,168,0.18)" strokeWidth="1" />
        <text x="140" y="182" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="Montserrat" fontWeight="600">
          Lab
        </text>
        {/* Mini chart below Lab text */}
        <motion.polyline
          points="95,208 105,201 115,205 125,198 135,202 145,195 155,199 165,192 175,196 185,189"
          stroke="rgba(255,87,168,0.35)"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease, delay: 1.8 }}
        />
      </motion.g>

      {/* Data flow particles */}
      {[0, 1, 2].map((i) => (
        <motion.circle
          key={`particle-l-${i}`}
          r="2"
          fill="rgba(255,87,168,0.3)"
          initial={{ offsetDistance: '0%', opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay: 2 + i * 0.6, ease: 'easeInOut' }}
        >
          <animateMotion
            dur="2s"
            repeatCount="indefinite"
            begin={`${2 + i * 0.6}s`}
            path="M80 140 L120 165"
          />
        </motion.circle>
      ))}
    </svg>
  );
}

export default function Card03Flow() {
  return (
    <ScreenWrapper>
      <Visual>
        <FlowDiagram />
      </Visual>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.8 }}
      >
        <Title>Entrenas, registras tu <Bold>nutrición</Bold> y todo llega al <Bold>Lab</Bold></Title>
      </motion.div>
    </ScreenWrapper>
  );
}
