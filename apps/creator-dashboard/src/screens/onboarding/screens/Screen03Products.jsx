import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';
import GlowCard from '../components/GlowCard';

const ease = [0.22, 1, 0.36, 1];

function ProductCard({ title, subtitle, delay, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease, delay }}
      style={{ borderRadius: 16 }}
    >
    <GlowCard style={{ borderRadius: 16 }}>
    <div style={{
        width: 260, borderRadius: 16,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{
        width: '100%', aspectRatio: '16/10', borderRadius: '16px 16px 0 0',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.04) 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {children}
      </div>
      <div style={{ padding: 16 }}>
        <p style={{
          color: 'rgba(255,255,255,0.95)', fontSize: 15,
          fontFamily: "'Inter'", fontWeight: 600, margin: 0,
        }}>{title}</p>
        <p style={{
          color: 'rgba(255,255,255,0.35)', fontSize: 12,
          fontFamily: "'Inter'", fontWeight: 500, margin: '6px 0 0 0',
        }}>{subtitle}</p>
      </div>
    </div>
    </GlowCard>
    </motion.div>
  );
}

function ClientChip({ count, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease, delay }}
      style={{
        padding: '3px 9px', borderRadius: 999,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontFamily: "'Inter'", fontWeight: 600, textTransform: 'uppercase' }}>
        {count}
      </span>
    </motion.div>
  );
}

function AvatarDot({ size = 28, delay, initials }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 15, stiffness: 150, delay }}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {initials && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: size * 0.35, fontFamily: "'Inter'", fontWeight: 600 }}>{initials}</span>}
    </motion.div>
  );
}

export default function Screen03Products() {
  return (
    <ScreenWrapper>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.1 }}>
        <Title>Ofreces <Bold>programas grupales</Bold> o <Bold>asesorias personalizadas</Bold></Title>
      </motion.div>

      <Visual>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <ProductCard title="Programa de Fuerza" subtitle="48 clientes inscritos" delay={0.25}>
            <div style={{ display: 'flex', gap: -6, position: 'absolute', bottom: 10, left: 12 }}>
              {['AM', 'JC', 'LP', 'MR'].map((init, i) => (
                <AvatarDot key={init} size={24} delay={0.6 + i * 0.08} initials={init} />
              ))}
              <ClientChip count="+44" delay={0.95} />
            </div>
          </ProductCard>

          <ProductCard title="Asesoria - Maria Lopez" subtitle="Plan personalizado" delay={0.4}>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease, delay: 0.7 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              <AvatarDot size={40} delay={0.75} initials="ML" />
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.95 }}
                style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: "'Inter'", fontWeight: 500 }}
              >
                contenido unico
              </motion.span>
            </motion.div>
          </ProductCard>
        </div>
      </Visual>
    </ScreenWrapper>
  );
}
