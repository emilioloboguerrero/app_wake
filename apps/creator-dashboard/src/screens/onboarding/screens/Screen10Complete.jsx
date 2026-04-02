import { motion } from 'motion/react';

const ease = [0.22, 1, 0.36, 1];

export default function Screen10Complete({ onFinish }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', width: '100%', height: '100%',
      padding: 60, position: 'relative', zIndex: 3,
    }}>
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.15 }}
        style={{
          color: 'rgba(255,255,255,0.9)', fontSize: 'clamp(40px, 5.5vw, 72px)',
          fontWeight: 300, fontFamily: "'Montserrat', sans-serif",
          textAlign: 'center', letterSpacing: '-0.03em', margin: 0, lineHeight: 1.3,
          position: 'absolute', top: '8vh',
        }}
      >
        Listo. <span style={{ fontWeight: 700 }}>Esto es Wake</span>
      </motion.h1>

      <motion.button
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease, delay: 0.5 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={onFinish}
        style={{
          position: 'absolute', bottom: '14vh',
          padding: '16px 48px', borderRadius: 999,
          background: 'rgba(255,255,255,0.95)',
          border: 'none',
          color: '#1a1a1a', fontSize: 15,
          fontFamily: "'Montserrat', sans-serif", fontWeight: 600,
          cursor: 'pointer', letterSpacing: '0.01em',
        }}
      >
        Empezar
      </motion.button>
    </div>
  );
}
