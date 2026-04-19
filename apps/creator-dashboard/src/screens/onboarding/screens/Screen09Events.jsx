import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';
import GlowCard from '../components/GlowCard';

const ease = [0.22, 1, 0.36, 1];
const events = [
  { name: 'Taller de Movilidad', date: '15 Mar', spots: '12/20', status: 'Activo' },
  { name: 'Reto 30 Dias', date: '1 Abr', spots: '45/50', status: 'Activo' },
  { name: 'Workshop Nutricion', date: '10 Abr', spots: '8/15', status: 'Borrador' },
];

export default function Screen09Events() {
  return (
    <ScreenWrapper>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.1 }}>
        <Title>Tambien tienes una plataforma de <Bold>registro de eventos</Bold></Title>
      </motion.div>

      <Visual>
        <div style={{ display: 'flex', gap: 16 }}>
          {events.map((ev, i) => (
            <motion.div
              key={ev.name}
              initial={{ opacity: 0, y: 35, rotate: i === 0 ? -2 : i === 2 ? 2 : 0 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 0.6, ease, delay: 0.3 + i * 0.12 }}
              style={{ borderRadius: 16 }}
            >
            <GlowCard style={{ borderRadius: 16 }}>
              <div style={{
                width: 200, borderRadius: 16, overflow: 'hidden',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', flexDirection: 'column',
              }}>
              <div style={{
                width: '100%', height: 90,
                background: 'rgba(255,255,255,0.06)', position: 'relative',
              }}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.55 + i * 0.12 }}
                  style={{
                    position: 'absolute', top: 8, left: 8,
                    padding: '3px 9px', borderRadius: 999,
                    background: ev.status === 'Activo' ? 'rgba(255,87,168,0.12)' : 'rgba(255,87,168,0.08)',
                    border: `1px solid ${ev.status === 'Activo' ? 'rgba(255,87,168,0.2)' : 'rgba(255,87,168,0.15)'}`,
                  }}
                >
                  <span style={{
                    color: ev.status === 'Activo' ? 'rgba(255,87,168,0.85)' : 'rgba(255,87,168,0.7)',
                    fontSize: 9, fontFamily: "'Inter'", fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                  }}>{ev.status}</span>
                </motion.div>
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, fontFamily: "'Inter'", fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{ev.name}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: "'Inter'" }}>{ev.date}</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>-</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: "'Inter'" }}>{ev.spots} cupos</span>
                </div>
              </div>
              </div>
            </GlowCard>
            </motion.div>
          ))}
        </div>
      </Visual>
    </ScreenWrapper>
  );
}
