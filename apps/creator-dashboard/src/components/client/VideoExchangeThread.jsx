import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Send, Video, Bookmark, BookmarkCheck, MonitorPlay, X,
} from 'lucide-react';
import LoomRecorder from './reaction/LoomRecorder';
import apiClient from '../../utils/apiClient';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import useVideoExchangeUpload from '../../hooks/useVideoExchangeUpload';
import VideoRecorder from './VideoRecorder';
import AuthedVideo, { useResolvedStorageUrl } from './AuthedVideo';
import { useToast } from '../../contexts/ToastContext';
import './VideoExchangeThread.css';

export default function VideoExchangeThread({ exchangeId, creatorId, onBack }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [note, setNote] = useState('');
  const [showRecorder, setShowRecorder] = useState(false);
  const [reactionPath, setReactionPath] = useState(null);
  const [pendingBlob, setPendingBlob] = useState(null);
  const endRef = useRef(null);

  const {
    upload, isCompressing, isUploading, progress, error: uploadError, reset: resetUpload,
  } = useVideoExchangeUpload(exchangeId);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.videoExchanges.detail(exchangeId),
    queryFn: async () => {
      const res = await apiClient.get(`/video-exchanges/${exchangeId}`);
      return res.data || res;
    },
    ...cacheConfig.videoExchanges,
  });

  const exchange = data?.exchange;
  const messages = data?.messages || [];

  useEffect(() => {
    if (exchange && exchange.unreadByCreator > 0) {
      apiClient.patch(`/video-exchanges/${exchangeId}`, { markRead: true }).then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.unreadCount(creatorId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.byCreator(creatorId) });
      });
    }
  }, [exchange, exchangeId, creatorId, queryClient]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const toggleSaved = useMutation({
    mutationFn: async ({ messageId, saved }) => {
      await apiClient.patch(`/video-exchanges/${exchangeId}/messages/${messageId}`, {
        savedByCreator: saved,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.detail(exchangeId) });
    },
  });

  const sendTextMessage = useMutation({
    mutationFn: async (text) => {
      await apiClient.post(`/video-exchanges/${exchangeId}/messages`, { note: text });
    },
    onSuccess: () => {
      setNote('');
      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.detail(exchangeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.byCreator(creatorId) });
    },
  });

  const handleSendText = useCallback(() => {
    const trimmed = note.trim();
    if (!trimmed || sendTextMessage.isPending) return;
    sendTextMessage.mutate(trimmed);
  }, [note, sendTextMessage]);

  const handleRecordComplete = useCallback((blob) => {
    setPendingBlob(blob);
    setShowRecorder(false);
  }, []);

  const handleSendVideo = useCallback(async () => {
    if (!pendingBlob) return;
    const success = await upload(pendingBlob, note.trim());
    if (success) {
      setPendingBlob(null);
      setNote('');
      resetUpload();
    }
  }, [pendingBlob, note, upload, resetUpload]);

  const handleCancelPending = useCallback(() => {
    setPendingBlob(null);
    resetUpload();
  }, [resetUpload]);

  if (reactionPath) {
    return (
      <ReactionScreen
        path={reactionPath}
        onClose={() => setReactionPath(null)}
        onComplete={(blob, reactionNote) => {
          // Optimistic close — fire upload in the background, notify on done.
          setReactionPath(null);
          showToast('Enviando reacción…', 'info', 2400);
          upload(blob, reactionNote || '').then((ok) => {
            if (ok) {
              showToast('Reacción enviada', 'success');
            } else {
              showToast('No se pudo enviar la reacción. Intenta de nuevo.', 'error', 5000);
            }
            resetUpload();
          });
        }}
      />
    );
  }

  if (showRecorder) {
    return (
      <div className="vet-root">
        <div className="vet-inline-header">
          <button className="vet-iconbtn" onClick={() => setShowRecorder(false)} aria-label="Volver">
            <ArrowLeft size={18} />
          </button>
          <span className="vet-inline-title">Grabar video</span>
        </div>
        <VideoRecorder
          onComplete={handleRecordComplete}
          onCancel={() => setShowRecorder(false)}
          maxDuration={300}
        />
      </div>
    );
  }

  const inputDisabled = exchange?.status !== 'open' || !!pendingBlob;

  const showUploadPill = (isCompressing || isUploading || uploadError) && !pendingBlob;

  return (
    <div className="vet-root">
      {showUploadPill && (
        <UploadStatusPill
          isCompressing={isCompressing}
          isUploading={isUploading}
          progress={progress}
          error={uploadError}
          onDismiss={resetUpload}
        />
      )}
      <header className="vet-header">
        <button className="vet-iconbtn" onClick={onBack} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <div className="vet-header-info">
          <span className="vet-header-title">{exchange?.exerciseName || 'Video'}</span>
          <span className="vet-header-sub">
            {exchange?.status === 'open' ? 'Conversación activa' : 'Conversación cerrada'}
          </span>
        </div>
      </header>

      <div className="vet-stream">
        {isLoading ? (
          <ThreadSkeleton />
        ) : messages.length === 0 ? (
          <div className="vet-empty">No hay mensajes en esta conversación.</div>
        ) : (
          messages.map((msg) => (
            <MessageBlock
              key={msg.id}
              msg={msg}
              onReact={() => setReactionPath(msg.videoPath)}
              onToggleSaved={() => toggleSaved.mutate({ messageId: msg.id, saved: !msg.savedByCreator })}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      {pendingBlob && (
        <PendingVideoCard
          blob={pendingBlob}
          note={note}
          onNoteChange={setNote}
          onCancel={handleCancelPending}
          onSend={handleSendVideo}
          isBusy={isCompressing || isUploading}
          progress={progress}
          error={uploadError}
          isCompressing={isCompressing}
        />
      )}

      {!pendingBlob && exchange?.status === 'open' && (
        <footer className="vet-input">
          <button
            className="vet-input-record"
            onClick={() => setShowRecorder(true)}
            aria-label="Grabar video"
          >
            <Video size={16} />
            <span>Grabar</span>
          </button>
          <input
            className="vet-input-text"
            placeholder="Escribe un mensaje…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendText()}
            disabled={inputDisabled}
          />
          <button
            className="vet-input-send"
            onClick={handleSendText}
            disabled={!note.trim() || sendTextMessage.isPending}
            aria-label="Enviar"
          >
            <Send size={15} />
          </button>
        </footer>
      )}
    </div>
  );
}

function ThreadSkeleton() {
  // Mirrors the message-stream rhythm so the slide-panel keeps its height
  // while data resolves — avoids the "card collapses then expands" flicker.
  return (
    <div className="vet-skeleton" aria-hidden>
      <div className="vet-skeleton-msg vet-skeleton-msg--client">
        <div className="vet-skeleton-meta" />
        <div className="vet-skeleton-video" />
        <div className="vet-skeleton-actions">
          <div className="vet-skeleton-btn" />
          <div className="vet-skeleton-btn" />
        </div>
      </div>
      <div className="vet-skeleton-msg vet-skeleton-msg--creator">
        <div className="vet-skeleton-meta" />
        <div className="vet-skeleton-line" />
        <div className="vet-skeleton-line vet-skeleton-line--short" />
      </div>
      <div className="vet-skeleton-msg vet-skeleton-msg--client">
        <div className="vet-skeleton-meta" />
        <div className="vet-skeleton-video vet-skeleton-video--short" />
      </div>
    </div>
  );
}

function MessageBlock({ msg, onReact, onToggleSaved }) {
  const isCreator = msg.senderRole === 'creator';
  return (
    <article className={`vet-msg ${isCreator ? 'vet-msg--creator' : 'vet-msg--client'}`}>
      <div className="vet-msg-meta">
        <span className="vet-msg-author">{isCreator ? 'Tú' : 'Cliente'}</span>
        <span className="vet-msg-sep">·</span>
        <span className="vet-msg-time">{formatTime(msg.createdAt)}</span>
        {msg.savedByCreator && <span className="vet-msg-saved">Guardado</span>}
      </div>

      {msg.videoPath && (
        <div className="vet-msg-video">
          <AuthedVideo
            className="vet-msg-video-el"
            path={msg.videoPath}
            thumbnailPath={msg.thumbnailPath}
          />
        </div>
      )}

      {msg.note && <p className="vet-msg-note">{msg.note}</p>}

      {(msg.videoPath || !isCreator) && (
        <div className="vet-msg-actions">
          {!isCreator && msg.videoPath && (
            <button className="vet-msg-btn vet-msg-btn--primary" onClick={onReact}>
              <MonitorPlay size={13} />
              Reaccionar
            </button>
          )}
          <button className="vet-msg-btn" onClick={onToggleSaved}>
            {msg.savedByCreator ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
            {msg.savedByCreator ? 'Guardado' : 'Guardar'}
          </button>
        </div>
      )}
    </article>
  );
}

function PendingVideoCard({
  blob, note, onNoteChange, onCancel, onSend, isBusy, progress, error, isCompressing,
}) {
  const [url] = useState(() => URL.createObjectURL(blob));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="vet-pending">
      <div className="vet-pending-head">
        <span className="vet-pending-title">Video listo para enviar</span>
        <button className="vet-iconbtn" onClick={onCancel} disabled={isBusy} aria-label="Cancelar">
          <X size={16} />
        </button>
      </div>
      <video className="vet-pending-video" src={url} controls playsInline preload="metadata" />
      <textarea
        className="vet-pending-note"
        placeholder="Agrega una nota para tu cliente (opcional)"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        rows={2}
        disabled={isBusy}
      />
      {isBusy && (
        <div className="vet-progress">
          <div
            className="vet-progress-bar"
            style={{ width: isCompressing ? '20%' : `${Math.round(progress * 100)}%` }}
          />
          <span className="vet-progress-label">
            {isCompressing ? 'Comprimiendo…' : `Enviando ${Math.round(progress * 100)}%`}
          </span>
        </div>
      )}
      {error && <p className="vet-error">{error}</p>}
      <div className="vet-pending-actions">
        <button className="vet-btn vet-btn--ghost" onClick={onCancel} disabled={isBusy}>
          Descartar
        </button>
        <button className="vet-btn vet-btn--primary" onClick={onSend} disabled={isBusy}>
          Enviar
        </button>
      </div>
    </div>
  );
}

function UploadStatusPill({ isCompressing, isUploading, progress, error, onDismiss }) {
  const label = error
    ? (error || 'No se pudo enviar la reacción')
    : isCompressing
      ? 'Comprimiendo reacción…'
      : `Enviando reacción ${Math.round((progress || 0) * 100)}%`;
  return (
    <div className={`vet-uploadpill ${error ? 'vet-uploadpill--error' : ''}`}>
      <div className="vet-uploadpill-row">
        {!error && <span className="vet-uploadpill-spinner" aria-hidden />}
        <span className="vet-uploadpill-label">{label}</span>
        {error && (
          <button className="vet-uploadpill-dismiss" onClick={onDismiss} aria-label="Cerrar">×</button>
        )}
      </div>
      {!error && (
        <div className="vet-uploadpill-track">
          <div
            className="vet-uploadpill-bar"
            style={{ width: isCompressing ? '18%' : `${Math.round((progress || 0) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function ReactionScreen({ path, onClose, onComplete }) {
  const { url, status } = useResolvedStorageUrl(path);
  return (
    <div className="vet-root">
      <div className="vet-inline-header">
        <button className="vet-iconbtn" onClick={onClose} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>
        <span className="vet-inline-title">Reaccionar</span>
      </div>
      {status === 'ready' && url ? (
        <LoomRecorder
          videoSrc={url}
          onComplete={onComplete}
          onCancel={onClose}
        />
      ) : status === 'error' ? (
        <div className="vet-empty">No se pudo cargar el video para reaccionar.</div>
      ) : (
        <div className="vet-loading">Cargando video…</div>
      )}
    </div>
  );
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
