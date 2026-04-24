import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import videoExchangeService from '../../services/videoExchangeService';
import { queryKeys, cacheConfig } from '../../config/queryClient';

/**
 * Single-thread view. Coach response is the hero; the client's own video
 * collapses into a secondary reference block since that's not what the
 * user came here to see.
 */
export default function VideoExchangeThreadView({ exchangeId, userId, onBack }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.videoExchanges.detail(exchangeId),
    queryFn: () => videoExchangeService.getThread(exchangeId),
    ...cacheConfig.videoExchanges,
  });

  const exchange = data?.exchange;
  const messages = data?.messages || [];
  const clientMsg = messages.find((m) => m.senderRole === 'client');
  const coachMsg = messages.find((m) => m.senderRole === 'creator');

  useEffect(() => {
    if (exchange && exchange.unreadByClient > 0) {
      videoExchangeService.markRead(exchangeId).then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.byClient(userId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.unreadCount(userId) });
      });
    }
  }, [exchange, exchangeId, userId, queryClient]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack} aria-label="Atrás">←</button>
        <div style={styles.headerText}>
          <span style={styles.headerTitle}>{exchange?.exerciseName || 'Video'}</span>
          <span style={styles.headerSubtitle}>
            {coachMsg ? 'Respuesta del coach' : 'En espera del coach'}
          </span>
        </div>
      </div>

      <div style={styles.body}>
        {isLoading && <div style={styles.placeholder}>Cargando…</div>}

        {coachMsg ? (
          <CoachReply msg={coachMsg} />
        ) : !isLoading ? (
          <WaitingState />
        ) : null}

        {clientMsg && <ClientReference msg={clientMsg} />}
      </div>
    </div>
  );
}

function CoachReply({ msg }) {
  return (
    <section style={styles.coachSection}>
      <div style={styles.sectionLabelRow}>
        <span style={styles.sectionLabel}>Tu coach</span>
        <span style={styles.sectionTime}>{formatTime(msg.createdAt)}</span>
      </div>
      {msg.videoPath && (
        <VideoPlayer
          path={msg.videoPath}
          thumbnail={msg.thumbnailPath}
          style={styles.coachVideo}
        />
      )}
      {msg.note && <p style={styles.coachNote}>{msg.note}</p>}
    </section>
  );
}

function WaitingState() {
  return (
    <div style={styles.waiting}>
      <div style={styles.waitingIcon} aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
          <path d="M12 7V12L15 14.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p style={styles.waitingTitle}>En espera del coach</p>
      <p style={styles.waitingDesc}>Te avisaremos cuando responda.</p>
    </div>
  );
}

function ClientReference({ msg }) {
  return (
    <section style={styles.clientSection}>
      <div style={styles.sectionLabelRow}>
        <span style={styles.sectionLabel}>Tu envío</span>
        <span style={styles.sectionTime}>{formatTime(msg.createdAt)}</span>
      </div>
      {msg.videoPath && (
        <VideoPlayer
          path={msg.videoPath}
          thumbnail={msg.thumbnailPath}
          style={styles.clientVideo}
          compact
        />
      )}
      {msg.note && <p style={styles.clientNote}>{msg.note}</p>}
    </section>
  );
}

function VideoPlayer({ path, thumbnail, style, compact }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div style={{ ...styles.unavailable, ...(compact ? styles.unavailableCompact : null) }}>
        <span style={styles.unavailableText}>Este video ya no está disponible</span>
      </div>
    );
  }
  return (
    <video
      style={style}
      src={buildVideoUrl(path)}
      controls
      playsInline
      preload="metadata"
      poster={thumbnail ? buildVideoUrl(thumbnail) : undefined}
      onError={() => setFailed(true)}
    />
  );
}

function buildVideoUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const bucket = 'wolf-20b8b.firebasestorage.app';
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  let ms = 0;
  if (typeof timestamp === 'number') ms = timestamp;
  else if (typeof timestamp === 'string') ms = new Date(timestamp).getTime();
  else {
    const secs = timestamp.seconds ?? timestamp._seconds;
    if (typeof secs === 'number') ms = secs * 1000;
  }
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return new Date(ms).toLocaleString('es-CO', {
    hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
  });
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', minHeight: 400 },
  header: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 28, height: 28, borderRadius: 8, border: 'none',
    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer', fontSize: 16, display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  headerText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  headerTitle: {
    fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.95)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  headerSubtitle: {
    fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
  },
  body: { padding: 16, display: 'flex', flexDirection: 'column', gap: 16 },
  placeholder: {
    padding: '40px 0', textAlign: 'center',
    color: 'rgba(255,255,255,0.3)', fontSize: 13,
  },
  sectionLabelRow: {
    display: 'flex', alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase', letterSpacing: '0.1em',
  },
  sectionTime: {
    fontSize: 10, color: 'rgba(255,255,255,0.3)',
  },
  coachSection: {
    display: 'flex', flexDirection: 'column', gap: 10,
    padding: 12, borderRadius: 12,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
  },
  coachVideo: {
    width: '100%', borderRadius: 10, display: 'block', background: '#000',
  },
  coachNote: {
    margin: 0, fontSize: 14, lineHeight: 1.5,
    color: 'rgba(255,255,255,0.92)',
  },
  clientSection: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: 10, borderRadius: 10,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  clientVideo: {
    width: '100%', borderRadius: 8, display: 'block',
    background: '#000', opacity: 0.9, maxHeight: 240, objectFit: 'contain',
  },
  clientNote: {
    margin: 0, fontSize: 12, lineHeight: 1.45,
    color: 'rgba(255,255,255,0.55)',
  },
  waiting: {
    padding: '32px 24px', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    borderRadius: 12, background: 'rgba(255,255,255,0.03)',
    border: '1px dashed rgba(255,255,255,0.08)',
  },
  waitingIcon: {
    width: 44, height: 44, borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  waitingTitle: {
    fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.75)',
    margin: 0,
  },
  waitingDesc: {
    fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0,
  },
  unavailable: {
    width: '100%', aspectRatio: '16 / 9',
    borderRadius: 10, background: 'rgba(255,255,255,0.03)',
    border: '1px dashed rgba(255,255,255,0.10)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 12,
  },
  unavailableCompact: {
    aspectRatio: '16 / 9', maxHeight: 180,
  },
  unavailableText: {
    fontSize: 12, color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
};
