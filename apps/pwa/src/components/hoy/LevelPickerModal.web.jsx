// Level-picker modal — shown once when a user's enrollment entry has no level
// set for a level-gated course (shouldAskLevel returns true). One tap to choose;
// not dismissible without picking because the workout walker cannot load content
// without a level.
//
// Props:
//   course       — enriched course object with course.levels.options / .default
//   courseEntry  — enrollment entry from users.courses[courseId] (may be null)
//   visible      — boolean driving show/hide (controlled by shouldAskLevel in Hoy)
//   onClose      — called after a successful save so Hoy can re-evaluate shouldAskLevel
import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import courseLevelService from '../../services/courseLevelService';
import logger from '../../utils/logger';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EXIT_MS = 240;

const LEVEL_LABELS = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

const LEVEL_DESCRIPTIONS = {
  principiante: 'Ideal si llevas menos de un año entrenando de forma estructurada.',
  intermedio: 'Para quienes ya manejan los patrones básicos y quieren progresar con más volumen.',
  avanzado: 'Volumen e intensidad altos. Experiencia sólida requerida.',
};

function getOrCreateRoot() {
  if (typeof document === 'undefined') return null;
  const ROOT_ID = 'wake-level-picker-root';
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(root);
  }
  return root;
}

if (typeof document !== 'undefined') getOrCreateRoot();

const LevelPickerModal = ({ course, courseEntry, visible, onClose }) => {
  const queryClient = useQueryClient();
  const [isClosing, setIsClosing] = useState(false);
  const wasVisibleRef = useRef(false);
  const [entered, setEntered] = useState(false);

  const courseId = course?.courseId || course?.id;
  const options = course?.levels?.options;

  const mutation = useMutation({
    mutationFn: (level) => courseLevelService.setLevel(courseId, level),
    onSuccess: (_data, level) => {
      // Invalidate the user profile (which carries the courses map with entry.level)
      // so shouldAskLevel re-evaluates to false after the refetch.
      queryClient.invalidateQueries({ queryKey: ['user'] });
      // Invalidate daily-workout queries for this course so the card reloads
      // the level-specific session content.
      queryClient.invalidateQueries({ queryKey: ['preview', 'todaySession'] });
      queryClient.invalidateQueries({ queryKey: ['preview', 'courseDetail', courseId] });
      logger.log('Nivel guardado:', level);
      onClose();
    },
    onError: (err) => {
      logger.error('Error al guardar el nivel:', err);
    },
  });

  // Animate in when visible becomes true.
  useEffect(() => {
    if (visible) {
      wasVisibleRef.current = true;
      setIsClosing(false);
      // Defer so the element is mounted before the transition starts.
      const t = setTimeout(() => setEntered(true), 16);
      return () => clearTimeout(t);
    } else if (wasVisibleRef.current) {
      setIsClosing(true);
      setEntered(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!isClosing) return;
    const t = setTimeout(() => {
      wasVisibleRef.current = false;
      setIsClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [isClosing]);

  const showOverlay = visible || isClosing;

  if (!showOverlay || typeof document === 'undefined') return null;
  if (!Array.isArray(options) || options.length === 0) return null;

  const modalRoot = getOrCreateRoot();
  if (!modalRoot) return null;

  // Keep the root pointer-events in sync.
  modalRoot.style.pointerEvents = showOverlay ? 'auto' : 'none';

  const backdropOpacity = entered && !isClosing ? 1 : 0;
  const sheetTranslate = entered && !isClosing ? 0 : 40;
  const sheetOpacity = entered && !isClosing ? 1 : 0;

  const overlay = (
    <div style={{ position: 'fixed', inset: 0 }}>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          opacity: backdropOpacity,
          transition: `opacity ${EXIT_MS}ms ${SPRING}`,
          zIndex: 1,
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          // Not dismissible on backdrop click — user must choose.
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            backgroundColor: '#1a1a1a',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '32px 24px 40px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            transform: `translateY(${sheetTranslate}px)`,
            opacity: sheetOpacity,
            transition: `transform ${EXIT_MS}ms ${SPRING}, opacity ${EXIT_MS}ms ${SPRING}`,
            pointerEvents: 'auto',
          }}
        >
          {/* Handle */}
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignSelf: 'center',
              marginBottom: 4,
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.45)',
              }}
            >
              {course?.title || 'Programa'}
            </span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#fff',
                letterSpacing: -0.3,
                lineHeight: 1.2,
              }}
            >
              ¿A qué nivel quieres entrenar?
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {options.map((opt) => {
              const label = LEVEL_LABELS[opt] || opt;
              const desc = LEVEL_DESCRIPTIONS[opt] || null;
              const isLoading = mutation.isPending && mutation.variables === opt;
              const anyLoading = mutation.isPending;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={anyLoading}
                  onClick={() => mutation.mutate(opt)}
                  style={{
                    width: '100%',
                    padding: '18px 20px',
                    borderRadius: 16,
                    backgroundColor: isLoading
                      ? 'rgba(255,255,255,0.12)'
                      : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    cursor: anyLoading ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    transition: `background-color 180ms ${SPRING}`,
                    outline: 'none',
                    fontFamily: 'inherit',
                    opacity: anyLoading && !isLoading ? 0.5 : 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#fff',
                      letterSpacing: -0.1,
                    }}
                  >
                    {isLoading ? 'Guardando...' : label}
                  </span>
                  {desc && !isLoading ? (
                    <span
                      style={{
                        fontSize: 13,
                        color: 'rgba(255,255,255,0.5)',
                        lineHeight: 1.4,
                        fontWeight: 400,
                      }}
                    >
                      {desc}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {mutation.isError ? (
            <span
              style={{
                fontSize: 13,
                color: 'rgba(255,100,100,0.9)',
                textAlign: 'center',
              }}
            >
              No se pudo guardar el nivel. Intenta de nuevo.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, modalRoot);
};

export default LevelPickerModal;
