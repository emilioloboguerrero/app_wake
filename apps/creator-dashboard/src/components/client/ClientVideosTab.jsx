import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Video } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import VideoExchangeThread from './VideoExchangeThread';
import './ClientVideosTab.css';

const RETENTION_DAYS = 30;

/**
 * Dedicated per-client video-exchange surface. Replaces the old "Revisar"
 * global inbox and the Lab-tab card. Filters by the client's user uid so it
 * survives one_on_one_clients re-enrollments.
 */
export default function ClientVideosTab({ creatorId, clientUserId }) {
  const [selectedId, setSelectedId] = useState(null);

  const { data: allThreads = [], isLoading } = useQuery({
    queryKey: [...queryKeys.videoExchanges.byCreator(creatorId)],
    queryFn: async () => {
      const res = await apiClient.get('/video-exchanges');
      return res.data || res;
    },
    enabled: !!creatorId,
    ...cacheConfig.videoExchanges,
  });

  const threads = useMemo(
    () => (clientUserId ? allThreads.filter((t) => t.clientId === clientUserId) : []),
    [allThreads, clientUserId]
  );

  const { pendientes, completados } = useMemo(() => splitThreads(threads), [threads]);

  if (selectedId) {
    return (
      <div className="cvt-root">
        <VideoExchangeThread
          exchangeId={selectedId}
          creatorId={creatorId}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  }

  return (
    <div className="cvt-root">
      <header className="cvt-header">
        <div className="cvt-title-wrap">
          <h1 className="cvt-title">Videos</h1>
          <span className="cvt-retention">Últimos {RETENTION_DAYS} días</span>
        </div>
        <CountChip label="Pendientes" value={pendientes.length} emphasis={pendientes.length > 0} />
      </header>

      {isLoading ? (
        <LoadingState />
      ) : threads.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="cvt-sections">
          {pendientes.length > 0 && (
            <ThreadGroup
              label="Pendientes"
              subtitle="Tu cliente está esperando tu respuesta"
              threads={pendientes}
              onSelect={setSelectedId}
              emphasis
            />
          )}
          {completados.length > 0 && (
            <ThreadGroup
              label="Completados"
              subtitle={null}
              threads={completados}
              onSelect={setSelectedId}
            />
          )}
          <p className="cvt-footnote">Los videos se guardan por {RETENTION_DAYS} días.</p>
        </div>
      )}
    </div>
  );
}

function ThreadGroup({ label, subtitle, threads, onSelect, emphasis }) {
  return (
    <section className={`cvt-group ${emphasis ? 'cvt-group--emphasis' : ''}`}>
      <div className="cvt-group-head">
        <span className="cvt-group-label">{label}</span>
        <span className="cvt-group-count">{threads.length}</span>
      </div>
      {subtitle && <p className="cvt-group-sub">{subtitle}</p>}
      <div className="cvt-thread-list">
        {threads.map((t) => (
          <ThreadCard
            key={t.id}
            thread={t}
            onClick={() => onSelect(t.id)}
            emphasis={emphasis}
          />
        ))}
      </div>
    </section>
  );
}

function ThreadCard({ thread, onClick, emphasis }) {
  const unread = thread.unreadByCreator || 0;
  return (
    <button
      className={`cvt-card ${emphasis ? 'cvt-card--emphasis' : ''}`}
      onClick={onClick}
    >
      <div className="cvt-card-icon">
        <Video size={16} />
      </div>
      <div className="cvt-card-main">
        <span className="cvt-card-title">{thread.exerciseName || 'Video'}</span>
        <span className="cvt-card-meta">
          {formatTimeAgo(thread.lastMessageAt)}
          {statusSuffix(thread)}
        </span>
      </div>
      {unread > 0 && <span className="cvt-card-dot" aria-label={`${unread} sin leer`} />}
      <ChevronRight size={16} className="cvt-card-chev" />
    </button>
  );
}

function CountChip({ label, value, emphasis }) {
  return (
    <span className={`cvt-chip ${emphasis ? 'cvt-chip--emphasis' : ''}`}>
      <span className="cvt-chip-label">{label}</span>
      <span className="cvt-chip-value">{value}</span>
    </span>
  );
}

function EmptyState() {
  return (
    <div className="cvt-empty">
      <div className="cvt-empty-icon" aria-hidden>
        <Video size={22} />
      </div>
      <p className="cvt-empty-title">Sin videos todavía</p>
      <p className="cvt-empty-desc">
        Cuando este cliente te envíe un video desde su app, aparecerá acá.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="cvt-loading">
      <div className="cvt-loading-card" />
      <div className="cvt-loading-card" />
    </div>
  );
}

function splitThreads(list) {
  // "Pendiente" follows the badge in the lab header: unread only. Once the
  // coach opens a thread the markRead PATCH zeroes unreadByCreator and the
  // thread shifts to Completados even before they reply.
  const pendientes = [];
  const completados = [];
  const sorted = [...list].sort((a, b) => msOf(b.lastMessageAt) - msOf(a.lastMessageAt));
  for (const t of sorted) {
    const isUnread = (t.unreadByCreator || 0) > 0;
    if (isUnread && t.status !== 'closed') {
      pendientes.push(t);
    } else {
      completados.push(t);
    }
  }
  return { pendientes, completados };
}

function statusSuffix(thread) {
  if ((thread.unreadByCreator || 0) > 0) return ' · Nuevo';
  if (thread.status === 'closed') return ' · Completado';
  if (thread.lastMessageBy === 'client') return ' · Esperando tu respuesta';
  if (thread.lastMessageBy === 'creator') return ' · Respondido';
  return '';
}

function msOf(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') return timestamp;
  if (typeof timestamp === 'string') {
    const n = new Date(timestamp).getTime();
    return Number.isFinite(n) ? n : 0;
  }
  const secs = timestamp.seconds ?? timestamp._seconds;
  return typeof secs === 'number' ? secs * 1000 : 0;
}

function formatTimeAgo(timestamp) {
  const ms = msOf(timestamp);
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}
