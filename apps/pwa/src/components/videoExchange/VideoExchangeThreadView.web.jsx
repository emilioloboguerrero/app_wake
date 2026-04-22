import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import videoExchangeService from '../../services/videoExchangeService';
import { queryKeys, cacheConfig } from '../../config/queryClient';

/**
 * Read-only view of a single video submission:
 * client's original video + optional note, and the coach's response if any.
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
        <button style={styles.backBtn} onClick={onBack}>←</button>
        <span style={styles.headerTitle}>{exchange?.exerciseName || 'Video'}</span>
      </div>

      <div style={styles.body}>
        {isLoading && <div style={styles.placeholder}>Cargando…</div>}

        {clientMsg && (
          <Card title="Tu video" timestamp={clientMsg.createdAt}>
            {clientMsg.videoPath && (
              <video
                style={styles.video}
                src={buildVideoUrl(clientMsg.videoPath)}
                controls
                playsInline
                preload="metadata"
                poster={clientMsg.thumbnailPath ? buildVideoUrl(clientMsg.thumbnailPath) : undefined}
              />
            )}
            {clientMsg.note && <p style={styles.note}>{clientMsg.note}</p>}
          </Card>
        )}

        {coachMsg ? (
          <Card title="Respuesta del coach" timestamp={coachMsg.createdAt} emphasis>
            {coachMsg.videoPath && (
              <video
                style={styles.video}
                src={buildVideoUrl(coachMsg.videoPath)}
                controls
                playsInline
                preload="metadata"
                poster={coachMsg.thumbnailPath ? buildVideoUrl(coachMsg.thumbnailPath) : undefined}
              />
            )}
            {coachMsg.note && <p style={styles.note}>{coachMsg.note}</p>}
          </Card>
        ) : !isLoading ? (
          <div style={styles.waiting}>
            <p style={styles.waitingTitle}>Esperando respuesta</p>
            <p style={styles.waitingDesc}>Tu coach te avisará cuando responda.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Card({ title, timestamp, emphasis, children }) {
  return (
    <div style={{ ...styles.card, ...(emphasis ? styles.cardEmphasis : null) }}>
      <div style={styles.cardHeader}>
        <span style={styles.cardTitle}>{title}</span>
        <span style={styles.cardTime}>{formatTime(timestamp)}</span>
      </div>
      {children}
    </div>
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
  const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  return date.toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', minHeight: 400 },
  header: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  backBtn: {
    padding: '4px 8px', borderRadius: 6, border: 'none',
    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer', fontSize: 14,
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.9)' },
  body: { padding: 16, display: 'flex', flexDirection: 'column', gap: 16 },
  placeholder: { padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  card: {
    display: 'flex', flexDirection: 'column', gap: 10, padding: 12,
    borderRadius: 12, background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  cardEmphasis: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
  },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.6)' },
  cardTime: { fontSize: 10, color: 'rgba(255,255,255,0.3)' },
  video: { width: '100%', borderRadius: 8, display: 'block', background: '#000' },
  note: { margin: 0, fontSize: 14, lineHeight: 1.45, color: 'rgba(255,255,255,0.85)' },
  waiting: {
    padding: 20, textAlign: 'center',
    borderRadius: 12, background: 'rgba(255,255,255,0.03)',
    border: '1px dashed rgba(255,255,255,0.08)',
  },
  waitingTitle: { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', margin: '0 0 4px' },
  waitingDesc: { fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 },
};
