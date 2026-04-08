import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Video, Plus, MessageCircle, Clock, ChevronRight } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { cacheConfig, queryKeys } from '../../config/queryClient';
import VideoExchangeThread from './VideoExchangeThread';
import './VideoExchangeSection.css';

export default function VideoExchangeSection({ clientId, clientUserId, creatorId, oneOnOneClientId }) {
  const queryClient = useQueryClient();
  const [selectedThread, setSelectedThread] = useState(null);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadName, setNewThreadName] = useState('');

  const { data: threads = [], isLoading } = useQuery({
    queryKey: queryKeys.videoExchanges.byCreator(creatorId),
    queryFn: async () => {
      const res = await apiClient.get('/video-exchanges', {
        params: { oneOnOneClientId, status: 'open' },
      });
      return res.data || res;
    },
    enabled: !!creatorId && !!oneOnOneClientId,
    ...cacheConfig.videoExchanges,
  });

  const createThread = useMutation({
    mutationFn: async (name) => {
      const res = await apiClient.post('/video-exchanges', {
        clientId: clientUserId,
        oneOnOneClientId,
        exerciseName: name || null,
      });
      return res.data || res;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.byCreator(creatorId) });
      setSelectedThread(data.exchangeId || data.id);
      setShowNewThread(false);
      setNewThreadName('');
    },
  });

  const handleCreate = () => {
    if (createThread.isPending) return;
    createThread.mutate(newThreadName.trim());
  };

  if (selectedThread) {
    return (
      <VideoExchangeThread
        exchangeId={selectedThread}
        creatorId={creatorId}
        onBack={() => setSelectedThread(null)}
      />
    );
  }

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
    <div className="ves-container">
      <div className="ves-header">
        <div className="ves-header__left">
          <Video size={18} />
          <h3 className="ves-title">Intercambios de video</h3>
        </div>
        <button
          className="ves-new-btn"
          onClick={() => setShowNewThread(true)}
        >
          <Plus size={14} />
          Nueva conversacion
        </button>
      </div>

      {showNewThread && (
        <div className="ves-new-form">
          <input
            className="ves-new-input"
            placeholder="Nombre del ejercicio (opcional)"
            value={newThreadName}
            onChange={(e) => setNewThreadName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <div className="ves-new-actions">
            <button className="ves-new-cancel" onClick={() => { setShowNewThread(false); setNewThreadName(''); }}>
              Cancelar
            </button>
            <button
              className="ves-new-submit"
              onClick={handleCreate}
              disabled={createThread.isPending}
            >
              {createThread.isPending ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="ves-loading">
          {[1, 2].map((i) => (
            <div key={i} className="ves-skeleton" />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="ves-empty">
          <MessageCircle size={32} strokeWidth={1.5} />
          <p>No hay conversaciones de video</p>
          <span>Inicia una para revisar la tecnica de tu cliente</span>
        </div>
      ) : (
        <div className="ves-list">
          {threads.map((thread) => (
            <button
              key={thread.id}
              className="ves-thread-card"
              onClick={() => setSelectedThread(thread.id)}
            >
              <div className="ves-thread-info">
                <span className="ves-thread-name">
                  {thread.exerciseName || 'General'}
                </span>
                <span className="ves-thread-meta">
                  <Clock size={12} />
                  {formatTimeAgo(thread.lastMessageAt)}
                  {thread.lastMessageBy && ` - ${thread.lastMessageBy === 'creator' ? 'Tu' : 'Cliente'}`}
                </span>
              </div>
              <div className="ves-thread-right">
                {thread.unreadByCreator > 0 && (
                  <span className="ves-unread-badge">{thread.unreadByCreator}</span>
                )}
                <ChevronRight size={16} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
