import { motion } from 'motion/react';
import { IPhoneFrame, MacBookFrame } from '../components/DeviceFrame';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';

const ease = [0.22, 1, 0.36, 1];

function PhoneScreenContent() {
  return (
    <div style={{
      width: '100%', height: '100%', background: '#1a1a1a',
      padding: '18% 7% 6%', display: 'flex', flexDirection: 'column',
      gap: '4%', overflow: 'hidden',
    }}>
      {/* Profile card */}
      <div style={{
        padding: '8%', borderRadius: 10,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: '8%',
      }}>
        {/* Avatar */}
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(255,87,168,0.3), rgba(255,255,255,0.08))',
          border: '1px solid rgba(255,255,255,0.1)',
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: '65%', height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.18)', marginBottom: 3 }} />
          <div style={{ width: '40%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.07)' }} />
        </div>
      </div>

      {/* 2x2 menu grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4%', flex: '0 0 auto' }}>
        {[
          { icon: 'clip', label: 0.7 },
          { icon: 'card', label: 0.85 },
          { icon: 'gear', label: 0.8 },
          { icon: 'doc', label: 0.55 },
        ].map((item, i) => (
          <div key={i} style={{
            aspectRatio: '1', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            <div style={{
              width: 12, height: 12, borderRadius: 3,
              background: 'rgba(255,255,255,0.08)',
            }} />
            <div style={{ width: `${item.label * 100}%`, maxWidth: '70%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardScreenContent() {
  const programs = [
    { titleW: '55%', count: '12', imgGrad: 'linear-gradient(135deg, rgba(255,87,168,0.15), rgba(255,255,255,0.03))' },
    { titleW: '70%', count: '48', imgGrad: 'linear-gradient(135deg, rgba(120,180,255,0.12), rgba(255,255,255,0.03))' },
    { titleW: '45%', count: '6', imgGrad: 'linear-gradient(135deg, rgba(74,222,128,0.12), rgba(255,255,255,0.03))' },
  ];

  return (
    <div style={{ width: '100%', height: '100%', background: '#1a1a1a', display: 'flex' }}>
      {/* Sidebar */}
      <div style={{
        width: '18%', height: '100%', background: 'rgba(255,255,255,0.02)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        padding: '6% 3%', display: 'flex', flexDirection: 'column', gap: '5%',
      }}>
        <div style={{ width: '55%', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: '8%' }} />
        {[0.75, 0.6, 0.8, 0.55, 0.65].map((w, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '12%',
            padding: '8% 10%', borderRadius: 5,
            background: i === 1 ? 'rgba(255,255,255,0.06)' : 'transparent',
          }}>
            <div style={{ width: 5, height: 5, borderRadius: 2, background: i === 1 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
            <div style={{ width: `${w * 100}%`, height: 3, borderRadius: 2, background: i === 1 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)' }} />
          </div>
        ))}
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: '3% 4%', display: 'flex', flexDirection: 'column', gap: '3%', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ width: 80, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.12)' }} />
          <div style={{
            padding: '2px 8px', borderRadius: 999, height: 14,
            background: 'rgba(255,255,255,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 28, height: 3, borderRadius: 2, background: 'rgba(0,0,0,0.5)' }} />
          </div>
        </div>

        {/* Program cards */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3%', overflow: 'hidden' }}>
          {programs.map((prog, i) => (
            <div key={i} style={{
              display: 'flex', borderRadius: 8,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden', flex: '0 0 30%',
            }}>
              {/* Image */}
              <div style={{
                width: '35%', flexShrink: 0,
                background: prog.imgGrad,
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, transparent 50%, rgba(26,26,26,0.6) 100%)',
                }} />
              </div>
              {/* Content */}
              <div style={{
                flex: 1, padding: '4% 5%',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
              }}>
                <div style={{ width: prog.titleW, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 7, fontFamily: "'Montserrat'", fontWeight: 700 }}>{prog.count}</span>
                  <div style={{ width: 22, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Screen01TwoWorlds() {
  return (
    <ScreenWrapper>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.1 }}>
        <Title>Tus clientes tienen una app. <Bold>Tu tienes otra.</Bold></Title>
      </motion.div>

      <Visual>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative' }}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2, delay: 0.8 }}
                style={{ position: 'absolute', inset: '-30%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.03) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <IPhoneFrame delay={0.3} width={150}><PhoneScreenContent /></IPhoneFrame>
            </div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 0.8 }}
              style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, fontFamily: "'Montserrat'", fontWeight: 500, margin: 0 }}>
              Ellos
            </motion.p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative' }}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 2, delay: 1 }}
                style={{ position: 'absolute', inset: '-20%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.02) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <MacBookFrame delay={0.5} width={420} layoutId="onboarding-macbook"><DashboardScreenContent /></MacBookFrame>
            </div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: 1 }}
              style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, fontFamily: "'Montserrat'", fontWeight: 500, margin: 0 }}>
              Tu
            </motion.p>
          </div>
        </div>
      </Visual>
    </ScreenWrapper>
  );
}
