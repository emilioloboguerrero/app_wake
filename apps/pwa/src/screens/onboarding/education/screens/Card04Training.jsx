import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';

const ease = [0.22, 1, 0.36, 1];

const sets = [
  { weight: '80 kg', reps: '10', delay: 0.8 },
  { weight: '85 kg', reps: '8', delay: 1.1 },
  { weight: '90 kg', reps: '6', delay: 1.4 },
  { weight: '90 kg', reps: '6', delay: 1.7 },
];

function WorkoutCard() {
  return (
    <svg width="260" height="260" viewBox="0 0 260 260" fill="none">
      {/* Workout card container */}
      <motion.rect
        x="20" y="15" width="220" height="230" rx="14"
        fill="rgba(255,255,255,0.03)"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease, delay: 0.2 }}
      />

      {/* Exercise title area */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease, delay: 0.4 }}
      >
        <text x="36" y="37" fill="rgba(255,255,255,0.6)" fontSize="11" fontFamily="Montserrat" fontWeight="600">
          Press de hombros
        </text>
        <text x="36" y="50" fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="Montserrat" fontWeight="400">
          4 series
        </text>
      </motion.g>

      {/* Column headers */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease, delay: 0.6 }}
      >
        <text x="50" y="70" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="Montserrat" fontWeight="500">SET</text>
        <text x="120" y="70" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="Montserrat" fontWeight="500">PESO</text>
        <text x="190" y="70" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="Montserrat" fontWeight="500">REPS</text>
      </motion.g>

      {/* Set rows animating in */}
      {sets.map((set, i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0, x: -15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease, delay: set.delay }}
        >
          {/* Row background */}
          <rect x="32" y={80 + i * 38} width="196" height="30" rx="6" fill="rgba(255,255,255,0.02)" />

          {/* Set number */}
          <text x="50" y={99 + i * 38} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="11" fontFamily="Montserrat" fontWeight="600">
            {i + 1}
          </text>

          {/* Weight */}
          <text x="120" y={99 + i * 38} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="11" fontFamily="Montserrat" fontWeight="500">
            {set.weight}
          </text>

          {/* Reps */}
          <text x="190" y={99 + i * 38} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="11" fontFamily="Montserrat" fontWeight="500">
            {set.reps}
          </text>

          {/* Checkmark that appears after row */}
          <motion.g
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease, delay: set.delay + 0.4 }}
          >
            <circle cx="222" cy={95 + i * 38} r="8" fill="rgba(255,87,168,0.12)" />
            <path
              d={`M218 ${95 + i * 38} L221 ${98 + i * 38} L227 ${91 + i * 38}`}
              stroke="rgba(255,87,168,0.5)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </motion.g>
        </motion.g>
      ))}

      {/* Subtle completion glow at the end */}
      <motion.rect
        x="20" y="15" width="220" height="230" rx="14"
        fill="none"
        stroke="rgba(255,87,168,0.15)"
        strokeWidth="1.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{ duration: 2, delay: 2.5, ease: 'easeInOut' }}
      />
    </svg>
  );
}

export default function Card04Training() {
  return (
    <ScreenWrapper>
      <Visual>
        <WorkoutCard />
      </Visual>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.5 }}
      >
        <Title>Cada día tu <Bold>sesión está lista</Bold> para ejecutar y registrar</Title>
      </motion.div>
    </ScreenWrapper>
  );
}
