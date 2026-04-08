import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GlowingEffect } from '../ui';
import './SessionDataCard.css';

const spring = { duration: 0.42, ease: [0.22, 1, 0.36, 1] };
const fast = { duration: 0.25, ease: [0.22, 1, 0.36, 1] };

const STRENGTH_PRESET = {
  measures: ['reps', 'weight', 'intensity'],
  objectives: ['reps', 'intensity', 'previous'],
};

const SessionDataCard = ({
  sessionDefaultTemplate,
  onSaveTemplate,
  onOpenEditor,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const hasData = Boolean(sessionDefaultTemplate);

  const measures = sessionDefaultTemplate?.measures || [];
  const objectives = (sessionDefaultTemplate?.objectives || []).filter(o => o !== 'previous');
  const customMeasureLabels = sessionDefaultTemplate?.customMeasureLabels || {};
  const customObjectiveLabels = sessionDefaultTemplate?.customObjectiveLabels || {};

  const getLabel = (key) => {
    if (customMeasureLabels[key]) return customMeasureLabels[key];
    if (customObjectiveLabels[key]) return customObjectiveLabels[key];
    const map = { reps: 'Repeticiones', weight: 'Peso', intensity: 'RPE' };
    return map[key] || key;
  };

  const getExample = (key) => {
    const map = { reps: '12', weight: '60kg', intensity: '8' };
    return map[key] || '--';
  };

  const handleSelectPreset = () => {
    onSaveTemplate({
      measures: STRENGTH_PRESET.measures,
      objectives: STRENGTH_PRESET.objectives,
    });
  };

  return (
    <div className="sdc-glow-wrap">
      <GlowingEffect spread={40} proximity={100} borderWidth={1} />
    <div
      className="sdc"
      onMouseEnter={() => !hasData && setIsRevealed(true)}
      onMouseLeave={() => setIsRevealed(false)}
      onClick={() => !hasData && !isRevealed && setIsRevealed(true)}
    >
      <AnimatePresence mode="wait">
        {hasData ? (
          /* ─── Configured ─── */
          <motion.div
            key="active"
            className="sdc-active"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring}
          >
            <div className="sdc-mockup">
              <div className="sdc-mockup-header">
                <span className="sdc-mockup-title">Asi se ve cada serie</span>
              </div>
              <div className="sdc-mockup-row">
                <span className="sdc-mockup-num">1</span>
                <div className="sdc-mockup-fields">
                  {measures.map(m => (
                    <div key={m} className="sdc-mockup-field">
                      <span className="sdc-mockup-field-label">{getLabel(m)}</span>
                      <span className="sdc-mockup-field-val">{getExample(m)}</span>
                    </div>
                  ))}
                  {objectives.map(o => (
                    <div key={o} className="sdc-mockup-field sdc-mockup-field--target">
                      <span className="sdc-mockup-field-label">{getLabel(o)}</span>
                      <span className="sdc-mockup-field-val">{getExample(o)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="sdc-mockup-row sdc-mockup-row--dim">
                <span className="sdc-mockup-num">2</span>
                <div className="sdc-mockup-fields">
                  {measures.map(k => (
                    <div key={`m-${k}`} className="sdc-mockup-field">
                      <span className="sdc-mockup-field-label">{getLabel(k)}</span>
                      <span className="sdc-mockup-field-val">--</span>
                    </div>
                  ))}
                  {objectives.map(k => (
                    <div key={`o-${k}`} className="sdc-mockup-field">
                      <span className="sdc-mockup-field-label">{getLabel(k)}</span>
                      <span className="sdc-mockup-field-val">--</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button type="button" className="sdc-change" onClick={onOpenEditor}>
              Cambiar formato
            </button>
          </motion.div>

        ) : isRevealed ? (
          /* ─── Options revealed ─── */
          <motion.div
            key="pick"
            className="sdc-pick"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={fast}
          >
            <div className="sdc-cards">
              <motion.button
                type="button"
                className="sdc-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring}
                onClick={handleSelectPreset}
              >
                <div className="sdc-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6.5 6.5h-2a1 1 0 00-1 1v9a1 1 0 001 1h2m0-11v11m0-11h2v11h-2m11-11h2a1 1 0 011 1v9a1 1 0 01-1 1h-2m0-11v11m0-11h-2v11h2M8.5 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span className="sdc-card-name">Fuerza / Hipertrofia</span>
                <span className="sdc-card-desc">Repeticiones, peso e intensidad. Lo mas usado para entrenamiento con pesas.</span>
                <div className="sdc-card-tags">
                  <span className="sdc-card-tag">Reps</span>
                  <span className="sdc-card-tag">Peso</span>
                  <span className="sdc-card-tag sdc-card-tag--accent">RPE</span>
                </div>
              </motion.button>

              <motion.button
                type="button"
                className="sdc-card sdc-card--alt"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.06 }}
                onClick={onOpenEditor}
              >
                <div className="sdc-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span className="sdc-card-name">Personalizado</span>
                <span className="sdc-card-desc">Tiempo, distancia, campos propios. Arma tu formato desde cero.</span>
              </motion.button>
            </div>
          </motion.div>

        ) : (
          /* ─── Idle ─── */
          <motion.div
            key="idle"
            className="sdc-idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -14 }}
            transition={fast}
          >
            <h3 className="sdc-idle-title">Formato de serie</h3>
            <p className="sdc-idle-desc">Define que ve tu alumno en cada serie</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
};

export default SessionDataCard;
