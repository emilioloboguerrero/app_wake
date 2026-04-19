import { motion } from 'motion/react';
import { MacBookFrame } from '../components/DeviceFrame';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';
import GlowCard from '../components/GlowCard';
import { DashboardScreenContent } from './Screen01TwoWorlds';

const ease = [0.22, 1, 0.36, 1];

const branches = [
  { label: 'Asesorias', count: 'Clientes 1:1', delay: 0.6 },
  { label: 'Generales', count: 'Programas grupales', delay: 0.72 },
  { label: 'Biblioteca', count: 'Tu contenido', delay: 0.84 },
  { label: 'Eventos', count: 'Presenciales y virtuales', delay: 0.96 },
];

export default function Screen02CreatorSide() {
  return (
    <ScreenWrapper>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.1 }}>
        <Title>Tu panel tiene <Bold>cuatro secciones</Bold></Title>
      </motion.div>

      <Visual>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <MacBookFrame delay={0} width={320} layoutId="onboarding-macbook"><DashboardScreenContent /></MacBookFrame>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {branches.map((b) => (
              <motion.div
                key={b.label}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease, delay: b.delay }}
                style={{ borderRadius: 10 }}
              >
                <GlowCard style={{ borderRadius: 10 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 18px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                    minWidth: 180,
                  }}>
                    <div>
                      <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontFamily: "'Inter'", fontWeight: 600, margin: 0 }}>{b.label}</p>
                      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: "'Inter'", fontWeight: 500, margin: '2px 0 0 0' }}>{b.count}</p>
                    </div>
                  </div>
                </GlowCard>
              </motion.div>
            ))}
          </div>
        </div>
      </Visual>
    </ScreenWrapper>
  );
}
