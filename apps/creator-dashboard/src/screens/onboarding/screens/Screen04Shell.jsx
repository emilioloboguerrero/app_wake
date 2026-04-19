import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';
import GlowCard from '../components/GlowCard';

const ease = [0.22, 1, 0.36, 1];
const spring = { type: 'spring', damping: 22, stiffness: 100 };

export default function Screen04Shell() {
  return (
    <ScreenWrapper>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.1 }}>
        <Title>Creas contenido en la biblioteca. <Bold>Lo asignas a generales o asesorias.</Bold></Title>
      </motion.div>

      <Visual>
        <div style={{ position: 'relative' }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            style={{ borderRadius: 16 }}
          >
          <GlowCard style={{ borderRadius: 16 }}>
            <div style={{ position: 'relative', width: 500, height: 340 }}>
            <svg width="500" height="340" viewBox="0 0 500 340" style={{ position: 'absolute', inset: 0 }}>
              <motion.rect
                x="1" y="1" width="498" height="338" rx="16"
                fill="rgba(255,255,255,0.015)"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="2"
                strokeDasharray="8 6"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, ease, delay: 0.4 }}
              />
            </svg>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)' }}
            >
              <span style={{
                color: 'rgba(255,255,255,0.25)', fontSize: 10,
                fontFamily: "'Inter'", fontWeight: 600,
                letterSpacing: '0.12em', textTransform: 'uppercase',
              }}>Programa</span>
            </motion.div>

            <div style={{ position: 'absolute', top: 50, left: 0, right: 0, bottom: 0, display: 'flex', padding: '0 24px', gap: 16 }}>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 1 }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 12 }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: "'Inter'", fontWeight: 600 }}>JC</span>
                </div>
                <motion.div
                  initial={{ opacity: 0, x: -40, rotate: -5 }}
                  animate={{ opacity: 1, x: 0, rotate: 0 }}
                  transition={{ ...spring, delay: 1.3 }}
                  style={{
                    width: '100%', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)', padding: 10,
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: "'Inter'", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entreno</span>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {['Full Body A', 'Upper B'].map((s, i) => (
                      <div key={i} style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: "'Inter'" }}>{s}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -40, rotate: -5 }}
                  animate={{ opacity: 1, x: 0, rotate: 0 }}
                  transition={{ ...spring, delay: 1.5 }}
                  style={{
                    width: '100%', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)', padding: 10,
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: "'Inter'", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nutricion</span>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: "'Inter'" }}>2,200 kcal</span>
                  </div>
                </motion.div>
              </motion.div>

              <div style={{ width: 1, background: 'rgba(255,255,255,0.04)', margin: '12px 0' }} />

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 1.15 }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 12 }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: "'Inter'", fontWeight: 600 }}>ML</span>
                </div>
                <motion.div
                  initial={{ opacity: 0, x: 40, rotate: 5 }}
                  animate={{ opacity: 1, x: 0, rotate: 0 }}
                  transition={{ ...spring, delay: 1.4 }}
                  style={{
                    width: '100%', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)', padding: 10,
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: "'Inter'", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Entreno</span>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {['Push Pull', 'Lower C'].map((s, i) => (
                      <div key={i} style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: "'Inter'" }}>{s}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 40, rotate: 5 }}
                  animate={{ opacity: 1, x: 0, rotate: 0 }}
                  transition={{ ...spring, delay: 1.6 }}
                  style={{
                    width: '100%', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)', padding: 10,
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, fontFamily: "'Inter'", fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nutricion</span>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: "'Inter'" }}>1,800 kcal</span>
                  </div>
                </motion.div>
              </motion.div>
            </div>
            </div>
          </GlowCard>
          </motion.div>
        </div>
      </Visual>
    </ScreenWrapper>
  );
}
