import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';

const ease = [0.22, 1, 0.36, 1];

function CoachSilhouette() {
  return (
    <svg width="200" height="240" viewBox="0 0 200 240" fill="none">
      {/* Coach figure */}
      <motion.circle
        cx="100" cy="60" r="28"
        fill="rgba(255,87,168,0.12)"
        stroke="rgba(255,87,168,0.3)"
        strokeWidth="1.5"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease, delay: 0.3 }}
      />
      {/* Head inner */}
      <motion.circle
        cx="100" cy="60" r="16"
        fill="rgba(255,255,255,0.08)"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.6, ease, delay: 0.5 }}
      />
      {/* Body */}
      <motion.path
        d="M60 130 Q60 100 100 95 Q140 100 140 130 L140 180 Q140 195 125 195 L75 195 Q60 195 60 180 Z"
        fill="rgba(255,87,168,0.08)"
        stroke="rgba(255,87,168,0.2)"
        strokeWidth="1"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease, delay: 0.6 }}
      />
      {/* Arms extended - welcoming gesture */}
      <motion.path
        d="M60 130 Q40 125 30 140"
        stroke="rgba(255,87,168,0.2)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease, delay: 0.9 }}
      />
      <motion.path
        d="M140 130 Q160 125 170 140"
        stroke="rgba(255,87,168,0.2)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease, delay: 0.9 }}
      />
      {/* Pulse rings around coach */}
      <motion.circle
        cx="100" cy="130" r="70"
        fill="none"
        stroke="rgba(255,87,168,0.08)"
        strokeWidth="1"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 1.2], opacity: [0.3, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 1.2 }}
      />
      <motion.circle
        cx="100" cy="130" r="70"
        fill="none"
        stroke="rgba(255,87,168,0.06)"
        strokeWidth="1"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 1.4], opacity: [0.2, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 1.8 }}
      />
    </svg>
  );
}

export default function Card01Welcome() {
  return (
    <ScreenWrapper>
      <Visual>
        <CoachSilhouette />
      </Visual>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.4 }}
      >
        <Title>Acá <Bold>entrenas con los mejores coaches y atletas</Bold></Title>
      </motion.div>
    </ScreenWrapper>
  );
}
