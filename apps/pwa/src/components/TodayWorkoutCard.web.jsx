// Workout card — front: full-bleed image with text overlay (program kicker + session title).
// Back: muscle activation silhouette (tinted with the image accent) + Begin button. For
// one-on-one programs, a camera button sits at the top-right of the back face and opens
// the video-exchange history.
//
// Tap front -> flip to back. Tap back (not on action) -> flip to front.
// Tap Begin -> /warmup. Tap on an expired card -> renew flow (onRenew handler).
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import sessionService from '../services/sessionService';
import MuscleSilhouetteSVG from './MuscleSilhouetteSVG';
import VideoExchangeOverlay from './videoExchange/VideoExchangeOverlay.web';
import { useAccentFromImage } from '../hooks/hoy/useAccentFromImage';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

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
  muscleWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 12px',
    minHeight: 0,
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
  cameraButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    zIndex: 3,
    transition: `background-color 200ms ${SPRING}`,
  },
};

const CameraIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

const TodayWorkoutCard = ({ course, isExpired = false, downloadStatus = null, onBegin, onRenew }) => {
  const { user } = useAuth();
  const courseId = course?.courseId || course?.id;
  const programTitle = course?.title || '';
  const courseCreatorId = course?.creator_id || null;
  const isOneOnOne = course?.deliveryType === 'one_on_one';
  const canAccessVideoHistory = !!(isOneOnOne && courseCreatorId && user?.uid);
  const isTrial = course?.is_trial === true;

  const [flipped, setFlipped] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [videoHistoryOpen, setVideoHistoryOpen] = useState(false);

  const { data: sessionState } = useQuery({
    queryKey: ['preview', 'todaySession', user?.uid, courseId],
    queryFn: () => sessionService.getCurrentSession(user.uid, courseId),
    enabled: !!user?.uid && !!courseId && !isExpired,
    staleTime: 0,
  });

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

  const canBegin = !!sessionState?.workout && !isExpired && !isCompleted;
  const beginLabel = isExpired
    ? 'Renovar acceso'
    : isCompleted
      ? 'Completada'
      : isRestDay
        ? 'Día de descanso'
        : noPlanningThisWeek
          ? 'Sin sesión'
          : 'Empezar';
  const hasMuscleData = Object.keys(muscleVolumes).length > 0;

  const handleFlip = (e) => {
    e?.stopPropagation?.();
    if (isExpired) {
      onRenew?.(course);
      return;
    }
    setFlipped((f) => !f);
  };

  const handleBegin = (e) => {
    e?.stopPropagation?.();
    if (isExpired) {
      onRenew?.(course);
      return;
    }
    if (!canBegin || !onBegin) return;
    onBegin({
      course,
      workout: sessionState?.workout,
      sessionId: sessionState?.session?.sessionId,
    });
  };

  const handleVideoHistory = (e) => {
    e?.stopPropagation?.();
    setVideoHistoryOpen(true);
  };

  const beginStyle = canBegin ? styles.beginButton : { ...styles.beginButton, ...styles.beginDisabled };

  return (
    <>
      <div style={{ ...styles.outer, ...accentVarsStyle }} role="button" tabIndex={0}>
        <div style={{ ...styles.inner, transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
          {/* FRONT */}
          <div style={styles.face} onClick={handleFlip}>
            <div style={styles.imageBackdrop} />
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={programTitle}
                style={imageLoaded ? { ...styles.image, ...styles.imageLoaded } : styles.image}
                onLoad={() => setImageLoaded(true)}
              />
            ) : (
              <div style={styles.imagePlaceholder}>imagen del programa</div>
            )}
            <div style={styles.overlayText}>
              {programTitle ? <span style={styles.kicker}>{programTitle}</span> : null}
              <span style={styles.title}>{headlineTitle}</span>
            </div>
            {isExpired ? <div style={styles.expiredBadge}>Expirado</div> : null}
            {isTrial ? <div style={styles.trialBadge}>Prueba</div> : null}
            {downloadStatus === 'updating' ? (
              <div style={styles.statusPill}>Actualizando</div>
            ) : downloadStatus === 'failed' ? (
              <div style={{ ...styles.statusPill, ...styles.statusPillFailed }}>Error</div>
            ) : null}
          </div>

          {/* BACK */}
          <div style={{ ...styles.face, ...styles.back }} onClick={handleFlip}>
            <div style={styles.backHeader}>
              {programTitle ? <span style={styles.backKicker}>{programTitle}</span> : null}
              <span style={styles.backTitle}>{headlineTitle}</span>
            </div>

            <div style={styles.muscleWrap}>
              {hasMuscleData ? (
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

            <div style={styles.beginRow}>
              <button
                style={canBegin || isExpired ? styles.beginButton : beginStyle}
                onClick={handleBegin}
                disabled={!canBegin && !isExpired}
              >
                {beginLabel}
              </button>
            </div>

            {canAccessVideoHistory ? (
              <button
                style={styles.cameraButton}
                onClick={handleVideoHistory}
                aria-label="Historial de videos"
                title="Historial de videos"
              >
                <CameraIcon />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {canAccessVideoHistory && VideoExchangeOverlay ? (
        <VideoExchangeOverlay
          open={videoHistoryOpen}
          mode="history"
          userId={user?.uid}
          creatorId={courseCreatorId}
          onClose={() => setVideoHistoryOpen(false)}
        />
      ) : null}
    </>
  );
};

export default TodayWorkoutCard;
