import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';

const ease = [0.22, 1, 0.36, 1];

const macros = [
  { label: 'P', angle: 0, sweep: 120, color: 'rgba(255,87,168,0.5)', delay: 0.8 },
  { label: 'C', angle: 120, sweep: 140, color: 'rgba(255,255,255,0.2)', delay: 1.0 },
  { label: 'F', angle: 260, sweep: 100, color: 'rgba(255,255,255,0.1)', delay: 1.2 },
];

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startAngle, sweepAngle) {
  const end = startAngle + sweepAngle;
  const start = polarToCartesian(cx, cy, r, startAngle);
  const endPt = polarToCartesian(cx, cy, r, end);
  const largeArc = sweepAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`;
}

function NutritionVisual() {
  const cx = 140, cy = 100, r = 55;

  return (
    <svg width="280" height="240" viewBox="0 0 280 240" fill="none">
      {/* Macro ring background */}
      <motion.circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth="10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease, delay: 0.3 }}
      />

      {/* Macro ring segments */}
      {macros.map((macro, i) => (
        <motion.path
          key={i}
          d={arcPath(cx, cy, r, macro.angle, macro.sweep)}
          fill="none"
          stroke={macro.color}
          strokeWidth="10"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease, delay: macro.delay }}
        />
      ))}

      {/* Center calories text */}
      <motion.g
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease, delay: 1.4 }}
      >
        <text x={cx} y={cy - 4} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="16" fontFamily="Inter" fontWeight="600">
          2,150
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="Inter" fontWeight="400">
          kcal
        </text>
      </motion.g>

      {/* Barcode scan animation - left side */}
      <motion.g
        initial={{ opacity: 0, x: -15 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease, delay: 1.6 }}
      >
        <rect x="15" y="175" width="70" height="45" rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
        {/* Barcode lines */}
        {[0, 8, 14, 20, 28, 34, 38, 44, 50].map((x, i) => (
          <rect key={i} x={25 + x} y={185} width={i % 2 === 0 ? 3 : 2} height={18} rx="0.5" fill="rgba(255,255,255,0.12)" />
        ))}
        {/* Scan line */}
        <motion.line
          x1="22" y1="194" x2="78" y2="194"
          stroke="rgba(255,87,168,0.4)"
          strokeWidth="1.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.8, 0], y1: [185, 205, 185], y2: [185, 205, 185] }}
          transition={{ duration: 2, repeat: Infinity, delay: 2, ease: 'easeInOut' }}
        />
      </motion.g>

      {/* Food item card - right side */}
      <motion.g
        initial={{ opacity: 0, x: 15 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease, delay: 1.8 }}
      >
        <rect x="195" y="175" width="70" height="45" rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
        <text x="205" y="191" fill="rgba(255,255,255,0.5)" fontSize="8" fontFamily="Inter" fontWeight="500">
          Avena
        </text>
        <text x="205" y="203" fill="rgba(255,255,255,0.25)" fontSize="7" fontFamily="Inter" fontWeight="400">
          150 kcal
        </text>
        <text x="205" y="213" fill="rgba(255,255,255,0.15)" fontSize="6" fontFamily="Inter" fontWeight="400">
          P 5g · C 27g · F 3g
        </text>
      </motion.g>

      {/* Arrows from barcode and food list to ring */}
      <motion.path
        d="M85 195 Q110 180 115 155"
        stroke="rgba(255,87,168,0.12)"
        strokeWidth="1"
        strokeDasharray="3 2"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease, delay: 2 }}
      />
      <motion.path
        d="M195 195 Q170 180 165 155"
        stroke="rgba(255,87,168,0.12)"
        strokeWidth="1"
        strokeDasharray="3 2"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease, delay: 2 }}
      />
    </svg>
  );
}

export default function Card05Nutrition() {
  return (
    <ScreenWrapper>
      <Visual>
        <NutritionVisual />
      </Visual>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.6 }}
      >
        <Title>Registra lo que comes y ve cómo afecta tu <Bold>entrenamiento</Bold></Title>
      </motion.div>
    </ScreenWrapper>
  );
}
