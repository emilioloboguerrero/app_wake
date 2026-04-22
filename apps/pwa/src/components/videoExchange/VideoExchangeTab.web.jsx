import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, getFirestore } from 'firebase/firestore';
import videoExchangeService from '../../services/videoExchangeService';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import SubmitVideoScreen from './SubmitVideoScreen.web';
import VideoExchangeThreadView from './VideoExchangeThreadView.web';

const db = getFirestore();

export default function VideoExchangeTab({ userId, creatorId }) {
  const [mode, setMode] = useState('list'); // list | submit | detail
  const [selectedId, setSelectedId] = useState(null);

  const { data: oneOnOneClientId } = useQuery({
    queryKey: ['oneOnOneClient', userId, creatorId],
    queryFn: async () => {
      const q = query(
        collection(db, 'one_on_one_clients'),
        where('clientUserId', '==', userId),
        where('creatorId', '==', creatorId)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return snap.docs[0].id;
    },
    enabled: !!userId && !!creatorId,
    staleTime: 30 * 60 * 1000,
  });

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: queryKeys.videoExchanges.byClient(userId),
    queryFn: () => videoExchangeService.getThreads({}),
    enabled: !!userId,
    ...cacheConfig.videoExchanges,
  });

  if (!oneOnOneClientId) {
    return <div style={styles.placeholder}>Cargando…</div>;
  }

  if (mode === 'submit') {
    return (
      <SubmitVideoScreen
        userId={userId}
        oneOnOneClientId={oneOnOneClientId}
        onCancel={() => setMode('list')}
        onSubmitted={(exchangeId) => {
          setSelectedId(exchangeId);
          setMode('detail');
        }}
      />
    );
  }

  if (mode === 'detail' && selectedId) {
    return (
      <VideoExchangeThreadView
        exchangeId={selectedId}
        userId={userId}
        onBack={() => {
          setSelectedId(null);
          setMode('list');
        }}
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
      <button style={styles.primaryCta} onClick={() => setMode('submit')}>
        Enviar video al coach
      </button>

      <div style={styles.listHeader}>
        <span style={styles.listTitle}>Tus videos</span>
      </div>

      {isLoading ? (
        <div style={styles.placeholder}>Cargando…</div>
      ) : sorted.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>Aún no has enviado videos</p>
          <p style={styles.emptyDesc}>Graba un clip de cualquier ejercicio y tu coach lo revisará.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {sorted.map((submission) => {
            const status = getStatus(submission);
            return (
              <button
                key={submission.id}
                style={styles.card}
                onClick={() => { setSelectedId(submission.id); setMode('detail'); }}
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
  container: { padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 },
  primaryCta: {
    margin: '0 16px', padding: '14px 20px', borderRadius: 10, border: 'none',
    background: 'rgba(255,255,255,0.95)', color: '#1a1a1a',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  listHeader: { padding: '0 16px' },
  listTitle: {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
  },
  placeholder: { padding: '40px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  empty: { padding: '20px 16px', textAlign: 'center' },
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
