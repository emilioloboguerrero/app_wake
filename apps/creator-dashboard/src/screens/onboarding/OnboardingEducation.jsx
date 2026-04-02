import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../utils/apiClient';
import { ASSET_BASE } from '../../config/assets';
import AuroraBackground from './components/AuroraBackground';
import PlatformTree from './components/PlatformTree';
import Screen01TwoWorlds from './screens/Screen01TwoWorlds';
import Screen02CreatorSide from './screens/Screen02CreatorSide';
import Screen03Products from './screens/Screen03Products';
import Screen04Shell from './screens/Screen04Shell';
import Screen05Exercises from './screens/Screen05Exercises';
import Screen06Sessions from './screens/Screen06Sessions';
import Screen07Plans from './screens/Screen07Plans';
import Screen08Nutrition from './screens/Screen08Nutrition';
import Screen09Events from './screens/Screen09Events';
import Screen10Complete from './screens/Screen10Complete';
import './OnboardingEducation.css';

const screens = [
  Screen01TwoWorlds,
  Screen02CreatorSide,
  Screen03Products,
  Screen04Shell,
  Screen05Exercises,
  Screen06Sessions,
  Screen07Plans,
  Screen08Nutrition,
  Screen09Events,
  Screen10Complete,
];

const transitions = {
  0: {
    enter: { opacity: 0, y: 40 },
    animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', x: 0, rotateY: 0 },
    exit: { opacity: 0, scale: 0.85, filter: 'blur(8px)' },
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
  1: {
    enter: { opacity: 0, scale: 1.15, filter: 'blur(6px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)', y: 0, x: 0, rotateY: 0 },
    exit: { opacity: 0, scale: 0.8, filter: 'blur(10px)' },
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  },
  2: {
    enter: { opacity: 0, x: 100, scale: 0.95 },
    animate: { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)', y: 0, rotateY: 0 },
    exit: { opacity: 0, x: -100, scale: 0.95 },
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
  3: {
    enter: { opacity: 0, filter: 'blur(20px)', scale: 0.98 },
    animate: { opacity: 1, filter: 'blur(0px)', scale: 1, y: 0, x: 0, rotateY: 0 },
    exit: { opacity: 0, filter: 'blur(20px)', scale: 1.02 },
    transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
  },
  4: {
    enter: { opacity: 0, y: -60, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', x: 0, rotateY: 0 },
    exit: { opacity: 0, y: 80, scale: 0.96 },
    transition: { type: 'spring', damping: 20, stiffness: 100 },
  },
  5: {
    enter: { opacity: 0, x: 80, scale: 0.9 },
    animate: { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)', y: 0, rotateY: 0 },
    exit: { opacity: 0, x: -60, scale: 0.95 },
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] },
  },
  6: {
    enter: { opacity: 0, scale: 0.7 },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)', y: 0, x: 0, rotateY: 0 },
    exit: { opacity: 0, scale: 1.1, filter: 'blur(4px)' },
    transition: { type: 'spring', damping: 18, stiffness: 90 },
  },
  7: {
    enter: { opacity: 0, rotateY: 12, scale: 0.96 },
    animate: { opacity: 1, rotateY: 0, scale: 1, filter: 'blur(0px)', y: 0, x: 0 },
    exit: { opacity: 0, rotateY: -12, scale: 0.96 },
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  },
  8: {
    enter: { opacity: 0, scale: 0.5 },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)', y: 0, x: 0, rotateY: 0 },
    exit: { opacity: 0, scale: 0.7, filter: 'blur(6px)' },
    transition: { type: 'spring', damping: 14, stiffness: 100 },
  },
  9: {
    enter: { opacity: 0, scale: 1.05, filter: 'blur(4px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)', y: 0, x: 0, rotateY: 0 },
    exit: { opacity: 0, scale: 0.9, filter: 'blur(12px)' },
    transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] },
  },
};

const springEase = [0.22, 1, 0.36, 1];

function EdgeZone({ side, onClick, visible }) {
  const isRight = side === 'right';

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      whileHover={{ opacity: visible ? 1 : 0 }}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [isRight ? 'right' : 'left']: 0,
        width: 80,
        zIndex: 8,
        cursor: visible ? 'pointer' : 'default',
        pointerEvents: visible ? 'auto' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {visible && (
        <motion.div
          initial={{ opacity: 0.7 }}
          whileHover={{ opacity: 1, scale: 1.08, x: isRight ? 4 : -4 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.2 }}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(255,87,168,0.08)',
            border: '1px solid rgba(255,87,168,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 14 14" fill="none">
            <path
              d={isRight ? 'M5 3 L9 7 L5 11' : 'M9 3 L5 7 L9 11'}
              stroke="rgba(255,87,168,0.8)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'absolute',
          top: 0, bottom: 0,
          [isRight ? 'right' : 'left']: 0,
          width: 40,
          background: `linear-gradient(${isRight ? '270deg' : '90deg'}, rgba(255,87,168,0.06), transparent)`,
          pointerEvents: 'none',
        }}
      />
    </motion.div>
  );
}

export default function OnboardingEducation() {
  const navigate = useNavigate();
  const { refreshUserData } = useAuth();
  const [phase, setPhase] = useState('welcome');
  const [current, setCurrent] = useState(0);
  const prevRef = useRef(0);
  const [hintVisible, setHintVisible] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [titleVisible, setTitleVisible] = useState(true);

  const startTransition = useCallback(() => {
    if (phase !== 'welcome') return;
    setTitleVisible(false);
    setTimeout(() => setPhase('screens'), 1400);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'welcome') return;
    const timer = setTimeout(startTransition, 2000);
    return () => clearTimeout(timer);
  }, [phase, startTransition]);

  const Screen = screens[current];
  const t = transitions[current] || transitions[0];

  const goNext = () => {
    if (current < screens.length - 1) {
      prevRef.current = current;
      setCurrent(c => c + 1);
      if (hintVisible) setHintVisible(false);
    }
  };

  const goPrev = () => {
    if (current > 0) {
      prevRef.current = current;
      setCurrent(c => c - 1);
    }
  };

  useEffect(() => {
    if (phase !== 'screens') return;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') goNext();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current, phase]);

  const handleFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await apiClient.patch('/users/me', { webOnboardingCompleted: true });
      await refreshUserData();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('[OnboardingEducation] Error completing onboarding:', err);
      setFinishing(false);
    }
  };

  const isLastScreen = current === screens.length - 1;
  const isWelcome = phase === 'welcome' && titleVisible;
  const showIsotipo = phase === 'welcome' || (phase === 'screens' && current === 0);

  // Compute pixel sizes from viewport so motion can interpolate numbers
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const welcomeSize = Math.min(vh * 0.4, vw * 0.4);
  const watermarkSize = Math.min(vh * 0.8, vw * 0.8);

  return (
    <div className="ob-root">
      <AuroraBackground />
      <div className="ob-grid" />

      {/* Persistent isotipo — centered wrapper, motion only animates width/height/opacity */}
      <div className="ob-isotipo-anchor">
        <motion.img
          src={`${ASSET_BASE}wake-isotipo-negativo.png`}
          alt=""
          initial={{ opacity: 0, width: welcomeSize, height: welcomeSize }}
          animate={{
            opacity: showIsotipo ? (isWelcome ? 0.9 : 0.035) : 0,
            width: isWelcome ? welcomeSize : watermarkSize,
            height: isWelcome ? welcomeSize : watermarkSize,
          }}
          transition={{ duration: 1.2, ease: springEase }}
        />
      </div>

      {/* Welcome title */}
      <AnimatePresence>
        {phase === 'welcome' && titleVisible && (
          <motion.div
            className="ob-welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6, ease: springEase }}
            onClick={startTransition}
          >
            <div className="ob-welcome-spacer" />
            <motion.h1
              className="ob-welcome-title"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: springEase, delay: 0.3 }}
            >
              Esto es Wake
            </motion.h1>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screens phase */}
      {phase === 'screens' && (
        <>
          {!isLastScreen && <div className="ob-separator" />}
          <PlatformTree step={current + 1} prevStep={prevRef.current + 1} />

          <div className="ob-counter">
            {String(current + 1).padStart(2, '0')} / {String(screens.length).padStart(2, '0')}
          </div>

          {!isLastScreen && (
            <>
              <EdgeZone side="left" onClick={goPrev} visible={current > 0} />
              <EdgeZone side="right" onClick={goNext} visible={current < screens.length - 1} />
            </>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={t.enter}
              animate={t.animate}
              exit={t.exit}
              transition={t.transition}
              className="ob-screen-wrap"
            >
              <Screen onNext={goNext} onPrev={goPrev} onFinish={handleFinish} />
            </motion.div>
          </AnimatePresence>

          <AnimatePresence>
            {hintVisible && (
              <motion.div
                className="ob-hint"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10, transition: { duration: 0.3 } }}
                transition={{ delay: 2, duration: 0.8 }}
              >
                <span className="ob-hint-text">
                  Haz click en la flecha para continuar
                </span>
                <motion.div
                  animate={{ x: [0, 8, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                    <path d="M5 3 L9 7 L5 11" stroke="rgba(255,87,168,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="ob-progress-track" style={{ width: isLastScreen ? '100%' : '62%' }}>
            <motion.div
              animate={{ width: `${((current + 1) / screens.length) * 100}%` }}
              transition={{ duration: 0.6, ease: springEase }}
              className="ob-progress-fill"
            />
          </div>
        </>
      )}
    </div>
  );
}
