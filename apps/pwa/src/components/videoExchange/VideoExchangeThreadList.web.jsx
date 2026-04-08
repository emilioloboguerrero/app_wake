import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import videoExchangeService from '../../services/videoExchangeService';
import { queryKeys, cacheConfig } from '../../config/queryClient';

export default function VideoExchangeThreadList({ userId, oneOnOneClientId, creatorId, onSelectThread }) {
  const queryClient = useQueryClient();
  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadName, setNewThreadName] = useState('');

  const { data: threads = [], isLoading } = useQuery({
    queryKey: queryKeys.videoExchanges.byClient(userId),
    queryFn: () => videoExchangeService.getThreads({ status: 'open' }),
    enabled: !!userId,
    ...cacheConfig.videoExchanges,
  });

  const createThread = useMutation({
    mutationFn: (name) =>
      videoExchangeService.createThread({
        clientId: userId,
        oneOnOneClientId,
        exerciseName: name || undefined,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.byClient(userId) });
      const id = data.exchangeId || data.id;
      if (id) onSelectThread(id);
      setShowNewThread(false);
      setNewThreadName('');
    },
  });

  const handleCreate = () => {
    if (createThread.isPending) return;
    createThread.mutate(newThreadName.trim());
  };

  const openThreadCount = threads.filter((t) => t.status === 'open').length;

  const formatTimeAgo = (timestamp) => {
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
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Intercambios de video</h3>
        {openThreadCount < 3 && (
          <button style={styles.newBtn} onClick={() => setShowNewThread(true)}>
            + Nueva
          </button>
        )}
      </div>

      {showNewThread && (
        <div style={styles.newForm}>
          <input
            style={styles.input}
            placeholder="Nombre del ejercicio (opcional)"
            value={newThreadName}
            onChange={(e) => setNewThreadName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <div style={styles.formActions}>
            <button style={styles.cancelBtn} onClick={() => { setShowNewThread(false); setNewThreadName(''); }}>
              Cancelar
            </button>
            <button style={styles.submitBtn} onClick={handleCreate} disabled={createThread.isPending}>
              {createThread.isPending ? 'Creando...' : 'Crear'}
            </button>
          </div>
          {createThread.isError && (
            <p style={styles.error}>{createThread.error?.message || 'Error al crear conversacion'}</p>
          )}
        </div>
      )}

      {isLoading ? (
        <div style={styles.loading}>Cargando...</div>
      ) : threads.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyTitle}>No hay conversaciones</p>
          <p style={styles.emptyDesc}>Envia un video a tu coach para recibir feedback</p>
        </div>
      ) : (
        <div style={styles.list}>
          {threads.map((thread) => (
            <button
              key={thread.id}
              style={styles.threadCard}
              onClick={() => onSelectThread(thread.id)}
            >
              <div style={styles.threadInfo}>
                <span style={styles.threadName}>{thread.exerciseName || 'General'}</span>
                <span style={styles.threadMeta}>
                  {formatTimeAgo(thread.lastMessageAt)}
                  {thread.lastMessageBy && ` - ${thread.lastMessageBy === 'creator' ? 'Coach' : 'Tu'}`}
                </span>
              </div>
              {thread.unreadByClient > 0 && (
                <span style={styles.unreadBadge}>{thread.unreadByClient}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { padding: '16px 0' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '0 16px' },
  title: { fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.9)', margin: 0 },
  newBtn: {
    padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
  },
  newForm: { padding: '0 16px', marginBottom: 16 },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)', fontSize: 14, outline: 'none', marginBottom: 8, boxSizing: 'border-box',
  },
  formActions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  cancelBtn: { padding: '6px 12px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' },
  submitBtn: { padding: '6px 12px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.9)', color: '#1a1a1a', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  error: { fontSize: 12, color: '#ef4444', margin: '4px 0 0' },
  loading: { padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  empty: { padding: '40px 16px', textAlign: 'center' },
  emptyTitle: { fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' },
  emptyDesc: { fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 },
  list: { display: 'flex', flexDirection: 'column' },
  threadCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
    background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%',
  },
  threadInfo: { display: 'flex', flexDirection: 'column', gap: 4 },
  threadName: { fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)' },
  threadMeta: { fontSize: 11, color: 'rgba(255,255,255,0.35)' },
  unreadBadge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
    background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
  },
};
