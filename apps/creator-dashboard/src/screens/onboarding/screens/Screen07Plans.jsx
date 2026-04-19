import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';
import GlowCard from '../components/GlowCard';

const ease = [0.22, 1, 0.36, 1];
const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const weeks = [
  [{ name: 'Full Body A' }, null, { name: 'Upper' }, null, { name: 'Lower' }, null, null],
  [{ name: 'Full Body B' }, null, { name: 'Push' }, null, { name: 'Pull' }, null, null],
  [{ name: 'Full Body A' }, null, { name: 'Upper' }, null, { name: 'Lower' }, { name: 'Cardio' }, null],
];

export default function Screen07Plans() {
  return (
    <ScreenWrapper>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.1 }}>
        <Title>Organizas las sesiones en un <Bold>plan semanal</Bold></Title>
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
            borderRadius: 16, background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 15, fontFamily: "'Inter'", fontWeight: 600 }}>Plan de Fuerza</span>
            <span style={{
              color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: "'Inter'", fontWeight: 600,
              padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', textTransform: 'uppercase',
            }}>3 semanas</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, 72px)', gap: 5 }}>
            <div />
            {days.map((d, i) => (
              <motion.span key={d} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + i * 0.03 }}
                style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: "'Inter'", fontWeight: 500, textAlign: 'center' }}>{d}</motion.span>
            ))}
          </div>
          {weeks.map((week, wIdx) => (
            <div key={wIdx} style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, 72px)', gap: 5, alignItems: 'center' }}>
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + wIdx * 0.08 }}
                style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: "'Inter'", fontWeight: 500 }}>S{wIdx + 1}</motion.span>
              {week.map((session, dIdx) => (
                <motion.div
                  key={dIdx}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.35, ease, delay: 0.55 + wIdx * 0.1 + dIdx * 0.03 }}
                  style={{
                    height: 42, borderRadius: 8,
                    background: session ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)',
                    border: `1px solid ${session ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {session && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8.5, fontFamily: "'Inter'", fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>{session.name}</span>}
                </motion.div>
              ))}
            </div>
          ))}
          </div>
        </GlowCard>
        </motion.div>
      </Visual>
    </ScreenWrapper>
  );
}
