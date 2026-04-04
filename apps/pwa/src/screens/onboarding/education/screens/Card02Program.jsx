import { motion } from 'motion/react';
import ScreenWrapper, { Title, Bold, Visual } from '../components/ScreenWrapper';

const ease = [0.22, 1, 0.36, 1];

function ProgramCard({ imageGrad, avatarCount, isPersonalized }) {
  return (
    <div style={{
      borderRadius: 8, overflow: 'hidden',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${isPersonalized ? 'rgba(255,87,168,0.12)' : 'rgba(255,255,255,0.06)'}`,
      width: '100%',
    }}>
      {/* Image area */}
      <div style={{
        height: 65,
        background: imageGrad,
        position: 'relative',
        display: 'flex', alignItems: 'flex-end', padding: '6%',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, transparent 30%, rgba(26,26,26,0.7) 100%)',
        }} />
        <div style={{ position: 'relative', width: '55%', height: 3, borderRadius: 1.5, background: 'rgba(255,255,255,0.3)' }} />
      </div>
      {/* Content */}
      <div style={{ padding: '10% 10% 12%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ width: '75%', height: 3, borderRadius: 1.5, background: 'rgba(255,255,255,0.1)' }} />
        <div style={{ width: '50%', height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 2 }} />
        {/* User avatars */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {Array.from({ length: avatarCount }).map((_, i) => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: isPersonalized ? 'rgba(255,87,168,0.25)' : 'rgba(255,255,255,0.1)',
              border: '1.5px solid #1a1a1a',
              marginLeft: i > 0 ? -5 : 0,
            }} />
          ))}
          {avatarCount > 3 && (
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
              border: '1.5px solid #1a1a1a',
              marginLeft: -5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 5, color: 'rgba(255,255,255,0.3)', fontFamily: "'Montserrat'",
            }}>
              +
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PhoneScreenContent({ type }) {
  const isPersonalized = type === 'personalizado';

  return (
    <div style={{
      width: '100%', height: '100%', background: '#1a1a1a',
      padding: '20% 8% 8%', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8%' }}>
        <div style={{ width: '45%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
      </div>

      {/* Single program card */}
      <ProgramCard
        imageGrad={isPersonalized
          ? 'linear-gradient(135deg, rgba(255,87,168,0.2), rgba(255,87,168,0.05))'
          : 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))'
        }
        avatarCount={isPersonalized ? 1 : 5}
        isPersonalized={isPersonalized}
      />
    </div>
  );
}

function PhoneFrame({ children, delay = 0 }) {
  const width = 120;
  const height = width * 2.16;
  const borderRadius = width * 0.18;
  const bezelPadding = width * 0.04;
  const notchWidth = width * 0.35;
  const notchHeight = width * 0.07;

  return (
    <motion.div
      initial={{ opacity: 0, y: 25, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 25, stiffness: 120, delay }}
      style={{
        width,
        height,
        borderRadius,
        border: '2px solid rgba(255,255,255,0.15)',
        background: '#0a0a0a',
        position: 'relative',
        overflow: 'hidden',
        padding: bezelPadding,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: notchWidth,
        height: notchHeight,
        background: '#0a0a0a',
        borderRadius: `0 0 ${notchHeight * 0.6}px ${notchHeight * 0.6}px`,
        zIndex: 2,
      }} />
      <div style={{
        width: '100%',
        height: '100%',
        borderRadius: borderRadius - bezelPadding,
        overflow: 'hidden',
        background: '#1a1a1a',
      }}>
        {children}
      </div>
    </motion.div>
  );
}

export default function Card02Program() {
  return (
    <ScreenWrapper>
      <Visual>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <PhoneFrame delay={0.3}>
              <PhoneScreenContent type="general" />
            </PhoneFrame>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease, delay: 0.8 }}
              style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: "'Montserrat'", fontWeight: 500, margin: 0 }}
            >
              General
            </motion.p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <PhoneFrame delay={0.5}>
              <PhoneScreenContent type="personalizado" />
            </PhoneFrame>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease, delay: 1 }}
              style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: "'Montserrat'", fontWeight: 500, margin: 0 }}
            >
              Personalizado
            </motion.p>
          </div>
        </div>
      </Visual>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.6 }}
      >
        <Title>Ellos diseñan tu <Bold>programa general</Bold> o <Bold>personalizado</Bold></Title>
      </motion.div>
    </ScreenWrapper>
  );
}
