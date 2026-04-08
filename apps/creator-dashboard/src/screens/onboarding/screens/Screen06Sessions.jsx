import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';
import GlowCard from '../components/GlowCard';

const ease = [0.22, 1, 0.36, 1];
const spring = { type: 'spring', damping: 20, stiffness: 90 };

const exercises = [
  { name: 'Sentadilla', sets: '4x8-10', rpe: 'RPE 7' },
  { name: 'Press banca', sets: '3x10-12', rpe: 'RPE 8' },
  { name: 'Peso muerto', sets: '3x6-8', rpe: 'RPE 8' },
  { name: 'Hip thrust', sets: '3x12-15', rpe: 'RPE 7' },
];

export default function Screen06Sessions() {
  return (
    <ScreenWrapper>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.1 }}>
        <Title>Con ellos armas <Bold>sesiones de entrenamiento</Bold></Title>
      </motion.div>

      <Visual>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', right: '100%', marginRight: 40, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 6, width: 120 }}>
            {exercises.map((ex, i) => (
              <motion.div
                key={ex.name}
                initial={{ opacity: 0.6, x: 0 }}
                animate={{ opacity: 0, x: 60, scale: 0.8 }}
                transition={{ duration: 0.8, ease, delay: 0.8 + i * 0.12 }}
                style={{
                  padding: '7px 10px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: "'Montserrat'", fontWeight: 500 }}>{ex.name}</span>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, ease, delay: 0.3 }}
            style={{ borderRadius: 16 }}
          >
          <GlowCard style={{ borderRadius: 16 }}>
            <div style={{
              width: 360, borderRadius: 16,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
              padding: 18, display: 'flex', flexDirection: 'column', gap: 6,
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 15, fontFamily: "'Montserrat'", fontWeight: 600 }}>Full Body A</span>
              <span style={{
                color: 'rgba(255,255,255,0.45)', fontSize: 10, fontFamily: "'Montserrat'", fontWeight: 600,
                padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', textTransform: 'uppercase',
              }}>4 ejercicios</span>
            </div>
            {exercises.map((ex, i) => (
              <motion.div
                key={ex.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring, delay: 0.55 + i * 0.1 }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontFamily: "'Montserrat'", fontWeight: 500 }}>{ex.name}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: "'Montserrat'" }}>{ex.sets}</span>
                  <span style={{
                    color: 'rgba(255,255,255,0.25)', fontSize: 9, fontFamily: "'Montserrat'", fontWeight: 500,
                    padding: '2px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.03)',
                  }}>{ex.rpe}</span>
                </div>
              </motion.div>
            ))}
            </div>
          </GlowCard>
          </motion.div>
        </div>
      </Visual>
    </ScreenWrapper>
  );
}
