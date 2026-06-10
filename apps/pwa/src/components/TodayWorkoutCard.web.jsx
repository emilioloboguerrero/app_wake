// Workout card — front: full-bleed image with text overlay (program kicker + session title).
// Back: muscle activation silhouette (tinted with the image accent) + Begin button. For
// one-on-one programs, a camera button sits at the top-right of the back face and opens
// the video-exchange history.
//
// Tap front -> flip to back. Tap back (not on action) -> flip to front.
// Tap Begin -> /warmup. Tap on an expired card -> renew flow (onRenew handler).
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import sessionService from '../services/sessionService';
import courseLevelService from '../services/courseLevelService';
import MuscleSilhouetteSVG from './MuscleSilhouetteSVG';
import { useAccentFromImage } from '../hooks/hoy/useAccentFromImage';
import WakeLoader from './WakeLoader.web.jsx';
import { effectiveLevel } from '../utils/levelGate';
import { queryKeys } from '../config/queryClient';
import logger from '../utils/logger';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const LEVEL_LABELS = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDateChip = (ymd) => {
  if (!ymd) return '';
  const d = new Date(`${ymd}T12:00:00`);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
};

const styles = {
  outer: {
    width: '100%',
    height: '100%',
    perspective: 2400,
    cursor: 'pointer',
  },
  inner: {
    position: 'relative',
    width: '100%',
    height: '100%',
    transformStyle: 'preserve-3d',
    transition: `transform 700ms ${SPRING}`,
  },
  face: {
    position: 'absolute',
    inset: 0,
    borderRadius: 24,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    backgroundColor: '#0a0a0a',
  },
  back: {
    transform: 'rotateY(180deg)',
    backgroundColor: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    flexDirection: 'column',
  },
  imageBackdrop: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
  },
  image: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
    opacity: 0,
    transition: `opacity 600ms ${SPRING}`,
  },
  imageLoaded: {
    opacity: 1,
  },
  imagePlaceholder: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  overlayText: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    mixBlendMode: 'difference',
    color: '#fff',
    pointerEvents: 'none',
  },
  kicker: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    opacity: 0.85,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: -0.3,
    lineHeight: 1.15,
  },
  expiredBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: '6px 12px',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    border: '1px solid rgba(255,255,255,0.15)',
    zIndex: 2,
  },
  trialBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: '6px 12px',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: '#fff',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: 700,
    border: '1px solid rgba(255,255,255,0.28)',
    zIndex: 2,
  },
  manageLink: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    padding: '8px 14px',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: 500,
    border: '1px solid rgba(255,255,255,0.18)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    zIndex: 3,
  },
  dateChip: {
    position: 'absolute',
    top: 16,
    left: 16,
    padding: '6px 12px',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: '#fff',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: 700,
    border: '1px solid rgba(255,255,255,0.18)',
    zIndex: 2,
  },
  statusPill: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    padding: '6px 12px',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    border: '1px solid rgba(255,255,255,0.18)',
    zIndex: 2,
  },
  statusPillFailed: {
    backgroundColor: 'rgba(224,84,84,0.6)',
    borderColor: 'rgba(255,255,255,0.25)',
    color: '#fff',
  },

  // Level switcher (back face)
  levelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
  },
  levelSelect: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '4px 8px',
    cursor: 'pointer',
    outline: 'none',
    fontFamily: 'inherit',
    appearance: 'none',
    WebkitAppearance: 'none',
    paddingRight: 20,
  },
  levelSelectDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  levelError: {
    fontSize: 11,
    color: 'rgba(255,100,100,0.85)',
    marginTop: 2,
  },

  // Back face
  backHeader: {
    padding: '24px 24px 0 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    color: '#fff',
    paddingRight: 72, // leave room for the floating camera button
  },
  backKicker: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  backTitle: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.3,
    lineHeight: 1.15,
    color: '#fff',
  },
  backScrollWrap: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    display: 'flex',
  },
  backScrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    overscrollBehavior: 'contain',
    scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch',
    display: 'flex',
    flexDirection: 'column',
  },
  scrollTrack: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    right: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    pointerEvents: 'none',
    transition: `opacity 220ms ${SPRING}`,
  },
  scrollThumb: {
    position: 'absolute',
    left: 0,
    width: '100%',
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  sectionBlock: {
    flexShrink: 0,
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  sectionBlockDivided: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionKicker: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.35)',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 0.2,
  },
  muscleWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  exerciseList: {
    display: 'flex',
    flexDirection: 'column',
  },
  exerciseRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '10px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    minHeight: 0,
  },
  exerciseRowLast: {
    borderBottom: 'none',
  },
  exerciseName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: -0.1,
    lineHeight: 1.25,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  exerciseMeta: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.42)',
    letterSpacing: 0.4,
    fontVariantNumeric: 'tabular-nums',
  },
  beginRow: {
    padding: '0 20px 20px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  beginButton: {
    width: '100%',
    height: 56,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0.3,
    border: 'none',
    cursor: 'pointer',
    transition: `transform 200ms ${SPRING}, background-color 200ms ${SPRING}`,
  },
  beginDisabled: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.4)',
    cursor: 'not-allowed',
  },
  beginSecondary: {
    backgroundColor: 'transparent',
    color: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(255,255,255,0.18)',
  },
  loaderOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,10,0.45)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    zIndex: 4,
    pointerEvents: 'none',
    borderRadius: 24,
  },
};

const TodayWorkoutCard = ({ course, isExpired = false, downloadStatus = null, selectedDate, onBegin, onRenew }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const courseId = course?.courseId || course?.id;
  const programTitle = course?.title || '';
  const isTrial = course?.is_trial === true;
  const trialDaysLeft = useMemo(() => {
    if (!isTrial || !course?.expires_at) return null;
    const t = new Date(course.expires_at).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000)));
  }, [isTrial, course?.expires_at]);

  // Level-gating — only active for courses with course.levels.options.
  // effectiveLevel returns null for non-leveled courses so the switcher is hidden.
  const courseEntry = useMemo(() => ({ level: course?.level ?? null }), [course?.level]);
  const activeLevel = effectiveLevel(course, courseEntry);
  const levelOptions = course?.levels?.options;

  const levelMutation = useMutation({
    mutationFn: (level) => courseLevelService.setLevel(courseId, level),
    onSuccess: (_data, level) => {
      // Refresh the user profile (carries entry.level) and the daily session cache
      // so the card immediately reflects the newly chosen level's content.
      queryClient.invalidateQueries({ queryKey: queryKeys.user.detail(user?.uid) });
      queryClient.invalidateQueries({ queryKey: ['preview', 'todaySession', user?.uid, courseId] });
      queryClient.invalidateQueries({ queryKey: ['preview', 'courseDetail', courseId] });
      logger.log('Nivel cambiado:', level);
    },
    onError: (err) => {
      logger.error('Error al cambiar el nivel:', err);
    },
  });

  const [flipped, setFlipped] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const [scrollState, setScrollState] = useState({ scrollable: false, thumbTop: 0, thumbHeight: 0 });
  const backScrollRef = useRef(null);

  // selectedDate drives which session the card resolves. Today shares the cache key
  // ['preview','todaySession',uid,courseId] with HoyScreen and the prefetch hook;
  // other dates use a date-suffixed key so today's data isn't clobbered.
  const isToday = !selectedDate || selectedDate === todayYmd();
  const dateLabel = !isToday ? formatDateChip(selectedDate) : '';
  const todaySessionKey = ['preview', 'todaySession', user?.uid, courseId];
  const dateSessionKey = ['preview', 'todaySession', user?.uid, courseId, selectedDate];

  const { data: sessionState, isLoading: sessionQueryLoading } = useQuery({
    queryKey: isToday ? todaySessionKey : dateSessionKey,
    queryFn: () => sessionService.getCurrentSession(user.uid, courseId, isToday ? {} : { targetDate: selectedDate }),
    enabled: !!user?.uid && !!courseId && !isExpired,
    // 60s window covers carousel swipes and quick re-mounts without a round-trip.
    // Explicit invalidation on completion (sessionService.completeSession) and
    // program updates (HoyScreen.handleApplyProgramUpdate) keeps the card fresh.
    staleTime: 60 * 1000,
  });
  const sessionLoading = sessionQueryLoading || (!sessionState && !!user?.uid && !!courseId && !isExpired);

  const sessionImageUrl = sessionState?.session?.image_url;
  const programImageUrl = course?.image_url;
  const imageUrl = sessionImageUrl || programImageUrl;
  const accent = useAccentFromImage(imageUrl);
  const accentVarsStyle = accent
    ? {
        '--accent': accent.accent,
        '--accent-r': accent.accentR,
        '--accent-g': accent.accentG,
        '--accent-b': accent.accentB,
        '--accent-text': accent.accentText,
      }
    : {};
  const accentRgb = accent ? [accent.accentR, accent.accentG, accent.accentB] : null;

  const sessionTitle = sessionState?.session?.title;
  const isCompleted = !!sessionState?.todaySessionAlreadyCompleted;
  const isRestDay = !sessionState?.session && sessionState?.emptyReason === 'no_session_today';
  const noPlanningThisWeek = sessionState?.emptyReason === 'no_planning_this_week';

  let headlineTitle;
  if (isExpired) headlineTitle = 'Acceso expirado';
  else if (sessionLoading) headlineTitle = programTitle;
  else if (isCompleted) headlineTitle = 'Sesión completada';
  else if (isRestDay) headlineTitle = 'Día de descanso';
  else if (noPlanningThisWeek) headlineTitle = 'Sin sesiones esta semana';
  else headlineTitle = sessionTitle || programTitle;

  const muscleVolumes = useMemo(() => {
    const exercises = sessionState?.workout?.exercises;
    if (!Array.isArray(exercises)) return {};
    const acc = {};
    exercises.forEach((ex) => {
      const map = ex?.muscle_activation;
      if (!map || typeof map !== 'object') return;
      Object.entries(map).forEach(([muscle, value]) => {
        const v = Number(value) || 0;
        acc[muscle] = (acc[muscle] || 0) + v;
      });
    });
    return acc;
  }, [sessionState?.workout?.exercises]);

  const exerciseSummary = useMemo(() => {
    const exercises = sessionState?.workout?.exercises;
    if (!Array.isArray(exercises)) return [];
    return exercises
      .filter((ex) => ex?.name)
      .map((ex) => ({
        id: ex.id,
        name: ex.name,
        setCount: Array.isArray(ex.sets) ? ex.sets.length : 0,
      }));
  }, [sessionState?.workout?.exercises]);

  const hasMuscleData = Object.keys(muscleVolumes).length > 0;

  // Drive the side scroll indicator: thumb height = visible / total, thumb top
  // = scrollTop / total. Hidden when content fits. rAF-coalesces scroll updates
  // so React state never lags behind the scroll position on fast scrolls.
  useEffect(() => {
    if (!flipped) return undefined;
    const el = backScrollRef.current;
    if (!el) return undefined;
    let frame = 0;
    const recompute = () => {
      frame = 0;
      const { scrollHeight, clientHeight, scrollTop } = el;
      const scrollable = scrollHeight > clientHeight + 4;
      if (!scrollable) {
        setScrollState({ scrollable: false, thumbTop: 0, thumbHeight: 0 });
        return;
      }
      const ratio = clientHeight / scrollHeight;
      const thumbHeightPct = Math.max(ratio * 100, 12);
      const denom = scrollHeight - clientHeight;
      const thumbTopPct = denom > 0 ? (scrollTop / denom) * (100 - thumbHeightPct) : 0;
      setScrollState({ scrollable: true, thumbTop: thumbTopPct, thumbHeight: thumbHeightPct });
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(recompute);
    };
    recompute();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null;
    if (ro) {
      ro.observe(el);
      Array.from(el.children).forEach((c) => ro.observe(c));
    }
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      if (ro) ro.disconnect();
    };
  }, [flipped, sessionLoading, exerciseSummary.length, hasMuscleData]);

  const canBegin = !!sessionState?.workout && !isExpired && !isCompleted;
  const beginLabel = isExpired
    ? 'Renovar acceso'
    : sessionLoading
      ? 'Cargando…'
      : isCompleted
        ? 'Completada'
        : isRestDay
          ? 'Día de descanso'
          : noPlanningThisWeek
            ? 'Sin sesión'
            : isToday
              ? 'Empezar'
              : `Empezar el ${dateLabel}`;

  const handleFlip = (e) => {
    e?.stopPropagation?.();
    if (isExpired) {
      onRenew?.(course);
      return;
    }
    setFlipped((f) => !f);
  };

  const handleBegin = (e, mode = 'new') => {
    e?.stopPropagation?.();
    if (isExpired) {
      onRenew?.(course);
      return;
    }
    // Completed sessions offer both modes; otherwise require the normal begin gate.
    if (!sessionState?.workout || !onBegin) return;
    if (!isCompleted && !canBegin) return;
    onBegin({
      course,
      workout: sessionState?.workout,
      sessionId: sessionState?.session?.sessionId,
      mode,
    });
  };

  const beginAccentStyle = accent && (canBegin || isExpired || isCompleted)
    ? { backgroundColor: accent.accent, color: accent.accentText }
    : null;
  const beginStyle = canBegin
    ? { ...styles.beginButton, ...(beginAccentStyle || {}) }
    : { ...styles.beginButton, ...styles.beginDisabled };

  return (
    <>
      <div style={{ ...styles.outer, ...accentVarsStyle }} role="button" tabIndex={0}>
        <div style={{ ...styles.inner, transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
          {/* FRONT */}
          <div style={styles.face} onClick={handleFlip}>
            <div style={styles.imageBackdrop} />
            {imageUrl && !imageBroken ? (
              <img
                src={imageUrl}
                alt={programTitle}
                style={imageLoaded ? { ...styles.image, ...styles.imageLoaded } : styles.image}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageBroken(true)}
              />
            ) : (
              <div style={styles.imagePlaceholder}>imagen del programa</div>
            )}
            <div style={styles.overlayText}>
              {programTitle ? <span style={styles.kicker}>{programTitle}</span> : null}
              <span style={styles.title}>{headlineTitle}</span>
            </div>
            {isExpired ? <div style={styles.expiredBadge}>Expirado</div> : null}
            {!isToday ? (
              <div style={styles.dateChip}>{dateLabel}</div>
            ) : isTrial ? (
              <div style={styles.trialBadge}>
                {trialDaysLeft != null
                  ? `Prueba · ${trialDaysLeft} ${trialDaysLeft === 1 ? 'día' : 'días'}`
                  : 'Prueba'}
              </div>
            ) : null}
            {isTrial && !isExpired && courseId ? (
              <button
                type="button"
                style={styles.manageLink}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/library/manage/${courseId}`);
                }}
              >
                Gestionar suscripción
              </button>
            ) : null}
            {downloadStatus === 'updating' ? (
              <div style={styles.statusPill}>Actualizando</div>
            ) : downloadStatus === 'failed' ? (
              <div style={{ ...styles.statusPill, ...styles.statusPillFailed }}>Error</div>
            ) : null}
            {sessionLoading && !isExpired ? (
              <div style={styles.loaderOverlay}>
                <WakeLoader size={56} />
              </div>
            ) : null}
          </div>

          {/* BACK */}
          <div style={{ ...styles.face, ...styles.back }} onClick={handleFlip}>
            <div style={styles.backHeader}>
              {programTitle ? (
                <span style={styles.backKicker}>
                  {programTitle}{!isToday && dateLabel ? ` · ${dateLabel}` : ''}
                </span>
              ) : !isToday && dateLabel ? (
                <span style={styles.backKicker}>{dateLabel}</span>
              ) : null}
              <span style={styles.backTitle}>{headlineTitle}</span>

              {/* Level switcher — only for leveled courses */}
              {activeLevel && Array.isArray(levelOptions) && levelOptions.length > 1 ? (
                <div
                  style={styles.levelRow}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span style={styles.levelLabel}>Nivel</span>
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <select
                      value={levelMutation.isPending ? (levelMutation.variables ?? activeLevel) : activeLevel}
                      disabled={levelMutation.isPending}
                      onChange={(e) => {
                        const newLevel = e.target.value;
                        if (newLevel !== activeLevel) levelMutation.mutate(newLevel);
                      }}
                      style={levelMutation.isPending
                        ? { ...styles.levelSelect, ...styles.levelSelectDisabled }
                        : styles.levelSelect}
                    >
                      {levelOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {LEVEL_LABELS[opt] || opt}
                        </option>
                      ))}
                    </select>
                    <span
                      style={{
                        position: 'absolute',
                        right: 6,
                        pointerEvents: 'none',
                        color: 'rgba(255,255,255,0.5)',
                        fontSize: 9,
                      }}
                    >
                      v
                    </span>
                  </div>
                  {levelMutation.isError ? (
                    <span style={styles.levelError}>Error al cambiar</span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div style={styles.backScrollWrap}>
            <div
              ref={backScrollRef}
              style={styles.backScrollArea}
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <div style={styles.sectionBlock}>
                <div style={styles.sectionHeader}>
                  <span style={styles.sectionKicker}>Activación muscular</span>
                  {hasMuscleData ? (
                    <span style={styles.sectionCount}>
                      {Object.keys(muscleVolumes).length}{' '}
                      {Object.keys(muscleVolumes).length === 1 ? 'grupo' : 'grupos'}
                    </span>
                  ) : null}
                </div>
                <div style={styles.muscleWrap}>
                  {sessionLoading ? (
                    <WakeLoader size={64} />
                  ) : hasMuscleData ? (
                    <MuscleSilhouetteSVG
                      muscleVolumes={muscleVolumes}
                      accentRgb={accentRgb}
                      height={300}
                    />
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                      {isRestDay ? 'Recupera para entrenar mejor' : 'Sin datos de activación'}
                    </span>
                  )}
                </div>
              </div>

              {exerciseSummary.length > 0 ? (
                <div style={{ ...styles.sectionBlock, ...styles.sectionBlockDivided }}>
                  <div style={styles.sectionHeader}>
                    <span style={styles.sectionKicker}>Ejercicios</span>
                    <span style={styles.sectionCount}>
                      {exerciseSummary.length} {exerciseSummary.length === 1 ? 'ejercicio' : 'ejercicios'}
                    </span>
                  </div>
                  <div style={styles.exerciseList}>
                    {exerciseSummary.map((ex, idx) => (
                      <div
                        key={ex.id || `${idx}-${ex.name}`}
                        style={idx === exerciseSummary.length - 1
                          ? { ...styles.exerciseRow, ...styles.exerciseRowLast }
                          : styles.exerciseRow}
                      >
                        <span style={styles.exerciseName}>{ex.name}</span>
                        {ex.setCount > 0 ? (
                          <span style={styles.exerciseMeta}>
                            {ex.setCount}× {ex.setCount === 1 ? 'serie' : 'series'}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
              <div
                style={{ ...styles.scrollTrack, opacity: scrollState.scrollable ? 1 : 0 }}
                aria-hidden
              >
                <div
                  style={{
                    ...styles.scrollThumb,
                    top: `${scrollState.thumbTop}%`,
                    height: `${scrollState.thumbHeight}%`,
                  }}
                />
              </div>
            </div>

            <div style={styles.beginRow}>
              {isCompleted && !isExpired ? (
                <>
                  <button
                    style={{ ...styles.beginButton, ...(beginAccentStyle || {}) }}
                    onClick={(e) => handleBegin(e, 'reopen')}
                    disabled={sessionLoading || !sessionState?.workout}
                  >
                    Continuar sesión
                  </button>
                  <button
                    style={{ ...styles.beginButton, ...styles.beginSecondary }}
                    onClick={(e) => handleBegin(e, 'new')}
                    disabled={sessionLoading || !sessionState?.workout}
                  >
                    Empezar de nuevo
                  </button>
                </>
              ) : (
                <button
                  style={canBegin || isExpired
                    ? { ...styles.beginButton, ...(beginAccentStyle || {}) }
                    : beginStyle}
                  onClick={(e) => handleBegin(e, 'new')}
                  disabled={(!canBegin && !isExpired) || sessionLoading}
                >
                  {beginLabel}
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default TodayWorkoutCard;
