import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import FlowDiagram from './FlowDiagram';
import './BibliotecaGuide.css';

const ease = [0.22, 1, 0.36, 1];

const STEPS = [
  'La biblioteca es tu versión original, acá creas todo.',
  'Creas el contenido, lo asignas a clientes y programas.',
  'Edita por cliente o actualiza todos desde la biblioteca.',
];

const BOLD_WORDS = [
  ['versión original'],
  ['contenido', 'asignas'],
  ['el cliente', 'todos', 'biblioteca'],
];

function renderPhrase(text, bolds) {
  const parts = [];
  let remaining = text;
  for (const bold of bolds) {
    const idx = remaining.toLowerCase().indexOf(bold.toLowerCase());
    if (idx === -1) continue;
    if (idx > 0) parts.push({ text: remaining.slice(0, idx), bold: false });
    parts.push({ text: remaining.slice(idx, idx + bold.length), bold: true });
    remaining = remaining.slice(idx + bold.length);
  }
  if (remaining) parts.push({ text: remaining, bold: false });
  if (parts.length === 0) return text;
  return parts.map((p, i) =>
    p.bold ? <span key={i} className="bg-phrase-bold">{p.text}</span> : p.text
  );
}

const transitions = [
  {
    enter: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1, x: 0 },
    exit: { opacity: 0, y: -20, filter: 'blur(4px)' },
    transition: { duration: 0.8, ease },
  },
  {
    enter: { opacity: 0, scale: 0.96, filter: 'blur(6px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)', y: 0, x: 0 },
    exit: { opacity: 0, scale: 1.02, filter: 'blur(6px)' },
    transition: { duration: 0.9, ease },
  },
  {
    enter: { opacity: 0, x: 60 },
    animate: { opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, x: -40 },
    transition: { duration: 0.8, ease },
  },
];

export default function BibliotecaGuide({ onComplete }) {
  const [phase, setPhase] = useState('intro');
  const [current, setCurrent] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);

  const startFlow = useCallback(() => setPhase('steps'), []);

  const goNext = useCallback(() => {
    if (current < STEPS.length - 1) {
      setCurrent(c => c + 1);
      if (hintVisible) setHintVisible(false);
    } else {
      setPhase('complete');
    }
  }, [current, hintVisible]);

  const goPrev = useCallback(() => {
    if (current > 0) setCurrent(c => c - 1);
  }, [current]);

  useEffect(() => {
    if (phase !== 'steps') return;
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, goNext, goPrev]);

  const t = transitions[current] || transitions[0];
  const isLast = current === STEPS.length - 1;

  return (
    <div className="bg-root">
      <div className="bg-grid" />

      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <motion.div
            key="intro"
            className="bg-intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95, filter: 'blur(8px)' }}
            transition={{ duration: 0.7, ease }}
          >
            <motion.h1
              className="bg-intro-title"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease, delay: 0.2 }}
            >
              Tu{' '}
              <span className="bg-intro-bold">biblioteca</span>{' '}
              en 3 pasos.
            </motion.h1>
            <motion.p
              className="bg-intro-sub"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease, delay: 0.6 }}
            >
              Esto toma menos de un minuto.
            </motion.p>
            <motion.button
              className="bg-intro-cta"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.7, ease, delay: 1.0 }}
              onClick={startFlow}
            >
              Comenzar
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === 'steps' && (
        <>
          <div className="bg-content-area">
            <div className="bg-title-area">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current}
                  className="bg-title-inner"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3, ease }}
                >
                  <h1 className="bg-title">
                    {renderPhrase(STEPS[current], BOLD_WORDS[current])}
                  </h1>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="bg-visual-area">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current}
                  className="bg-visual-inner"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease }}
                >
                  <FlowDiagram step={current + 1} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="bg-bottom">
            <div className="bg-nav">
              <motion.button
                className="bg-nav-btn"
                onClick={goPrev}
                animate={{ opacity: current > 0 ? 1 : 0.25 }}
                whileHover={current > 0 ? { scale: 1.08 } : {}}
                whileTap={current > 0 ? { scale: 0.95 } : {}}
                disabled={current === 0}
              >
                <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                  <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.button>

              <span className="bg-nav-count">{current + 1} / {STEPS.length}</span>

              <motion.button
                className={`bg-nav-btn ${isLast ? 'bg-nav-btn--finish' : ''}`}
                onClick={goNext}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isLast ? (
                  <span className="bg-nav-finish-text">Entendido</span>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                    <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </motion.button>
            </div>
          </div>

          <div className="bg-progress-track">
            <motion.div
              className="bg-progress-fill"
              animate={{ width: `${((current + 1) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.7, ease }}
            />
          </div>

          <AnimatePresence>
            {hintVisible && current === 0 && (
              <motion.p
                className="bg-hint"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ delay: 3, duration: 0.7, ease }}
              >
                Usa las flechas o el teclado para navegar
              </motion.p>
            )}
          </AnimatePresence>
        </>
      )}

      <AnimatePresence>
        {phase === 'complete' && (
          <motion.div
            key="complete"
            className="bg-complete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease }}
          >
            <motion.h1
              className="bg-complete-title"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease, delay: 0.2 }}
            >
              Más fácil que{' '}
              <span className="bg-complete-bold">saltarse el cardio.</span>
            </motion.h1>
            <motion.button
              className="bg-complete-cta"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.7, ease, delay: 0.8 }}
              onClick={onComplete}
            >
              Empezar
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
