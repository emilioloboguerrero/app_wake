import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';
import GlowCard from '../components/GlowCard';

const ease = [0.22, 1, 0.36, 1];
const macros = [
  { label: 'Calorias', value: '2,200', unit: 'kcal' },
  { label: 'Proteina', value: '165', unit: 'g' },
  { label: 'Carbos', value: '250', unit: 'g' },
  { label: 'Grasa', value: '72', unit: 'g' },
];
const meals = [
  { name: 'Desayuno', opts: ['Avena con frutas', 'Huevos revueltos'] },
  { name: 'Almuerzo', opts: ['Pollo con arroz', 'Salmon con quinoa'] },
  { name: 'Cena', opts: ['Carne con verduras', 'Pasta con atun'] },
];

export default function Screen08Nutrition() {
  return (
    <ScreenWrapper>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.1 }}>
        <Title>Tambien creas <Bold>planes de nutricion</Bold> con macros y comidas</Title>
      </motion.div>

      <Visual>
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.25 }}
          style={{ borderRadius: 16 }}
        >
        <GlowCard style={{ borderRadius: 16 }}>
          <div style={{
            width: 480, borderRadius: 16, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
          }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {macros.map((m, i) => (
              <motion.div key={m.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease, delay: 0.4 + i * 0.07 }}
                style={{ flex: 1, padding: '12px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 17, fontFamily: "'Inter'", fontWeight: 700, margin: 0 }}>
                  {m.value}<span style={{ fontSize: 9, fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}> {m.unit}</span>
                </p>
                <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, fontFamily: "'Inter'", fontWeight: 500, margin: '3px 0 0 0' }}>{m.label}</p>
              </motion.div>
            ))}
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.04)' }} />
          {meals.map((meal, i) => (
            <motion.div key={meal.name} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease, delay: 0.65 + i * 0.08 }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: "'Inter'", fontWeight: 600, width: 70, flexShrink: 0 }}>{meal.name}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {meal.opts.map((opt, j) => (
                  <span key={j} style={{
                    color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: "'Inter'", fontWeight: 500,
                    padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>{opt}</span>
                ))}
              </div>
            </motion.div>
          ))}
          </div>
        </GlowCard>
        </motion.div>
      </Visual>
    </ScreenWrapper>
  );
}
