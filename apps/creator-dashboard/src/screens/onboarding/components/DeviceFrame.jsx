import { motion } from 'motion/react';

const spring = {
  type: 'spring',
  damping: 25,
  stiffness: 120,
};

export function IPhoneFrame({ children, delay = 0, width = 200 }) {
  const height = width * 2.16;
  const borderRadius = width * 0.18;
  const bezelPadding = width * 0.04;
  const notchWidth = width * 0.35;
  const notchHeight = width * 0.07;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring, delay }}
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

export function MacBookFrame({ children, delay = 0, width = 480, layoutId }) {
  const screenHeight = width * 0.625;
  const baseHeight = width * 0.04;
  const borderRadius = width * 0.02;
  const bezelPadding = width * 0.015;

  return (
    <motion.div
      layoutId={layoutId}
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring, delay }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{
        width,
        height: screenHeight,
        borderRadius: `${borderRadius}px ${borderRadius}px 0 0`,
        border: '2px solid rgba(255,255,255,0.15)',
        borderBottom: 'none',
        background: '#0a0a0a',
        padding: bezelPadding,
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          top: bezelPadding * 0.4,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
        }} />
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: borderRadius * 0.5,
          overflow: 'hidden',
          background: '#1a1a1a',
        }}>
          {children}
        </div>
      </div>
      <div style={{
        width: width * 1.1,
        height: baseHeight,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)',
        borderRadius: `0 0 ${borderRadius}px ${borderRadius}px`,
        border: '1px solid rgba(255,255,255,0.1)',
        borderTop: '1px solid rgba(255,255,255,0.2)',
      }} />
    </motion.div>
  );
}
