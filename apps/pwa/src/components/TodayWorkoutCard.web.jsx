// Workout card — front: full-bleed image with text overlay (program kicker + session title).
// Back: muscle activation silhouette + Begin button + video history (one-on-one only).
//
// Tap front -> flip to back. Tap back (not on action) -> flip to front.
// Tap Begin -> /warmup. Tap on an expired card -> renew flow (onRenew handler).
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import sessionService from '../services/sessionService';
import MuscleSilhouetteSVG from './MuscleSilhouetteSVG';
import VideoExchangeOverlay from './videoExchange/VideoExchangeOverlay.web';

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const styles = {
  outer: {
    width: '100%',
    height: '100%',
    perspective: 1200,
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
  buttonRow: {
    display: 'flex',
    gap: 8,
  },
  beginButton: {
    flex: 1,
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
  videoButton: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 22,
    cursor: 'pointer',
    flexShrink: 0,
  },
  flipHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
};

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
  const fallbackImageUrl = course?.image_url;
  const imageUrl = sessionImageUrl || fallbackImageUrl;

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
      <div style={styles.outer} role="button" tabIndex={0}>
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
                  useWorkoutExecutionColors={true}
                  height={300}
                />
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                  {isRestDay ? 'Recupera para entrenar mejor' : 'Sin datos de activación'}
                </span>
              )}
            </div>

            <div style={styles.beginRow}>
              <div style={styles.buttonRow}>
                <button
                  style={canBegin || isExpired ? styles.beginButton : beginStyle}
                  onClick={handleBegin}
                  disabled={!canBegin && !isExpired}
                >
                  {beginLabel}
                </button>
                {canAccessVideoHistory ? (
                  <button
                    style={styles.videoButton}
                    onClick={handleVideoHistory}
                    aria-label="Historial de videos"
                    title="Historial de videos"
                  >
                    {'▶'}
                  </button>
                ) : null}
              </div>
              <span style={styles.flipHint}>Toca la tarjeta para volver</span>
            </div>
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
