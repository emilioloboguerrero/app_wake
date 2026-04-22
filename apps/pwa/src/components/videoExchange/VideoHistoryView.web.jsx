import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import videoExchangeService from '../../services/videoExchangeService';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import VideoExchangeThreadView from './VideoExchangeThreadView.web';

/**
 * Read-only history of a client's video submissions and the coach's responses.
 * No submission CTA — submitting happens from the workout execution screen,
 * always anchored to a specific exercise.
 */
export default function VideoHistoryView({ userId, onClose }) {
  const [selectedId, setSelectedId] = useState(null);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: queryKeys.videoExchanges.byClient(userId),
    queryFn: () => videoExchangeService.getThreads({}),
    enabled: !!userId,
    ...cacheConfig.videoExchanges,
  });

  if (selectedId) {
    return (
      <VideoExchangeThreadView
        exchangeId={selectedId}
        userId={userId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const sorted = [...submissions].sort((a, b) => {
    const aMs = a.lastMessageAt?.seconds ? a.lastMessageAt.seconds * 1000 : new Date(a.lastMessageAt || 0).getTime();
    const bMs = b.lastMessageAt?.seconds ? b.lastMessageAt.seconds * 1000 : new Date(b.lastMessageAt || 0).getTime();
    return bMs - aMs;
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onClose}>←</button>
        <span style={styles.headerTitle}>Historial de videos</span>
      </div>

      {isLoading ? (
        <div style={styles.placeholder}>Cargando…</div>
      ) : sorted.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>Aún no has enviado videos</p>
          <p style={styles.emptyDesc}>Graba un clip desde cualquier ejercicio y aparecerá acá.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {sorted.map((submission) => {
            const status = getStatus(submission);
            return (
              <button
                key={submission.id}
                style={styles.card}
                onClick={() => setSelectedId(submission.id)}
              >
                <div style={styles.cardInfo}>
                  <span style={styles.cardTitle}>{submission.exerciseName || 'Video'}</span>
                  <span style={styles.cardMeta}>{formatTimeAgo(submission.lastMessageAt)}</span>
                </div>
                <span style={{ ...styles.chip, ...chipStyle(status) }}>{status.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getStatus(s) {
  if (s.status === 'closed') return { key: 'done', label: 'Respondido' };
  if (s.lastMessageBy === 'client') return { key: 'waiting', label: 'Esperando' };
  if (s.lastMessageBy === 'creator') return { key: 'replied', label: 'Nueva respuesta' };
  return { key: 'waiting', label: 'Enviado' };
}

function chipStyle(status) {
  if (status.key === 'done') {
    return { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' };
  }
  if (status.key === 'replied') {
    return { background: 'rgba(255,255,255,0.95)', color: '#1a1a1a' };
  }
  return { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.45)' };
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
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
  placeholder: { padding: '40px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  empty: { padding: '40px 16px', textAlign: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' },
  emptyDesc: { fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 },
  list: { display: 'flex', flexDirection: 'column' },
  card: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
    background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%',
  },
  cardInfo: { display: 'flex', flexDirection: 'column', gap: 4 },
  cardTitle: { fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)' },
  cardMeta: { fontSize: 11, color: 'rgba(255,255,255,0.35)' },
  chip: {
    padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
};
