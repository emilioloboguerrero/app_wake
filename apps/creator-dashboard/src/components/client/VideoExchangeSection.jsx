import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Video, MessageCircle, Clock, ChevronRight } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { cacheConfig, queryKeys } from '../../config/queryClient';
import VideoExchangeThread from './VideoExchangeThread';
import './VideoExchangeSection.css';

/**
 * Per-client history of video submissions. Read-only — new submissions
 * are initiated by the client from the PWA. Coach responds from the
 * global "Revisar" inbox; this section is for context while viewing
 * a specific client.
 */
export default function VideoExchangeSection({ creatorId, oneOnOneClientId }) {
  const [selectedThread, setSelectedThread] = useState(null);

  const { data: threads = [], isLoading } = useQuery({
    queryKey: [...queryKeys.videoExchanges.byCreator(creatorId), 'history', oneOnOneClientId],
    queryFn: async () => {
      const res = await apiClient.get('/video-exchanges', {
        params: { oneOnOneClientId },
      });
      return res.data || res;
    },
    enabled: !!creatorId && !!oneOnOneClientId,
    ...cacheConfig.videoExchanges,
  });

  if (selectedThread) {
    return (
      <VideoExchangeThread
        exchangeId={selectedThread}
        creatorId={creatorId}
        onBack={() => setSelectedThread(null)}
      />
    );
  }

  return (
    <div className="ves-container">
      <div className="ves-header">
        <div className="ves-header__left">
          <Video size={18} />
          <h3 className="ves-title">Historial de videos</h3>
        </div>
      </div>

      {isLoading ? (
        <div className="ves-loading">
          {[1, 2].map((i) => <div key={i} className="ves-skeleton" />)}
        </div>
      ) : threads.length === 0 ? (
        <div className="ves-empty">
          <MessageCircle size={32} strokeWidth={1.5} />
          <p>Sin videos aún</p>
          <span>Tu cliente verá la opción de enviarte un video desde su app.</span>
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
                  {thread.exerciseName || 'Video'}
                </span>
                <span className="ves-thread-meta">
                  <Clock size={12} />
                  {formatTimeAgo(thread.lastMessageAt)}
                  {thread.status === 'closed' ? ' · Respondido' : thread.lastMessageBy === 'client' ? ' · Esperando respuesta' : ''}
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
