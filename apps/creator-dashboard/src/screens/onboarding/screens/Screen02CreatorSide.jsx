import { motion } from 'motion/react';
import { MacBookFrame } from '../components/DeviceFrame';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';
import GlowCard from '../components/GlowCard';

const ease = [0.22, 1, 0.36, 1];

const branches = [
  { label: 'Asesorias', count: 'Clientes 1:1', delay: 0.6 },
  { label: 'Generales', count: 'Programas grupales', delay: 0.72 },
  { label: 'Biblioteca', count: 'Tu contenido', delay: 0.84 },
  { label: 'Eventos', count: 'Presenciales y virtuales', delay: 0.96 },
];

function DashboardContent() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#1a1a1a', display: 'flex' }}>
      <div style={{
        width: '20%', height: '100%', background: 'rgba(255,255,255,0.025)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        padding: '8% 4%', display: 'flex', flexDirection: 'column', gap: '6%',
      }}>
        {[0.6, 0.8, 0.5, 0.7].map((w, i) => (
          <div key={i} style={{
            width: `${w * 100}%`, height: 4, borderRadius: 2,
            background: i === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
          }} />
        ))}
      </div>
      <div style={{ flex: 1, padding: '3% 4%', display: 'flex', flexDirection: 'column', gap: '3%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '30%', height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        </div>
        <div style={{ display: 'flex', gap: '2%' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ flex: 1, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
          ))}
        </div>
        <div style={{ flex: 1, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
      </div>
    </div>
  );
}

export default function Screen02CreatorSide() {
  return (
    <ScreenWrapper>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.1 }}>
        <Title>Tu panel tiene <Bold>cuatro secciones</Bold></Title>
      </motion.div>

      <Visual>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, ease, delay: 0.2 }}
          >
            <MacBookFrame delay={0.2} width={320}><DashboardContent /></MacBookFrame>
          </motion.div>

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
                      <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontFamily: "'Montserrat'", fontWeight: 600, margin: 0 }}>{b.label}</p>
                      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: "'Montserrat'", fontWeight: 500, margin: '2px 0 0 0' }}>{b.count}</p>
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
