import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, Video, Bookmark, BookmarkCheck, MonitorPlay } from 'lucide-react';
import ScreenReactionRecorder from './reaction/ScreenReactionRecorder';
import apiClient from '../../utils/apiClient';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import { auth } from '../../config/firebase';
import useVideoExchangeUpload from '../../hooks/useVideoExchangeUpload';
import VideoRecorder from './VideoRecorder';
import './VideoExchangeThread.css';

export default function VideoExchangeThread({ exchangeId, creatorId, onBack }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [showRecorder, setShowRecorder] = useState(false);
  const [showReaction, setShowReaction] = useState(null); // videoSrc for reaction
  const [pendingBlob, setPendingBlob] = useState(null);
  const messagesEndRef = useRef(null);

  const { upload, isCompressing, isUploading, progress, error: uploadError, reset: resetUpload } = useVideoExchangeUpload(exchangeId);

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

  // Mark as read on mount
  useEffect(() => {
    if (exchange && exchange.unreadByCreator > 0) {
      apiClient.patch(`/video-exchanges/${exchangeId}`, { markRead: true }).then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.unreadCount(creatorId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.byCreator(creatorId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.inbox(creatorId) });
      });
    }
  }, [exchange, exchangeId, creatorId, queryClient]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.inbox(creatorId) });
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

  const handleCancelVideo = useCallback(() => {
    setPendingBlob(null);
    resetUpload();
  }, [resetUpload]);

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  };

  const buildVideoUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const bucket = 'wolf-20b8b.firebasestorage.app';
    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
  };

  if (showReaction) {
    return (
      <div className="vet-container" style={{ maxHeight: 'none' }}>
        <div className="vet-recorder-header">
          <button className="vet-back" onClick={() => setShowReaction(null)}>
            <ArrowLeft size={18} />
            Volver
          </button>
        </div>
        <ScreenReactionRecorder
          videoSrc={showReaction}
          onComplete={(blob) => {
            setPendingBlob(blob);
            setShowReaction(null);
          }}
          onCancel={() => setShowReaction(null)}
        />
      </div>
    );
  }

  if (showRecorder) {
    return (
      <div className="vet-container">
        <div className="vet-recorder-header">
          <button className="vet-back" onClick={() => setShowRecorder(false)}>
            <ArrowLeft size={18} />
            Volver
          </button>
        </div>
        <VideoRecorder
          onComplete={handleRecordComplete}
          onCancel={() => setShowRecorder(false)}
          maxDuration={300}
        />
      </div>
    );
  }

  return (
    <div className="vet-container">
      {/* Header */}
      <div className="vet-header">
        <button className="vet-back" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <div className="vet-header-info">
          <span className="vet-header-title">{exchange?.exerciseName || 'General'}</span>
          <span className="vet-header-status">{exchange?.status === 'open' ? 'Activa' : 'Cerrada'}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="vet-messages">
        {isLoading ? (
          <div className="vet-loading">Cargando mensajes...</div>
        ) : messages.length === 0 ? (
          <div className="vet-empty-messages">
            <p>No hay mensajes aun. Graba un video o envia una nota.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`vet-message ${msg.senderRole === 'creator' ? 'vet-message--creator' : 'vet-message--client'}`}
            >
              <div className="vet-message-bubble">
                {msg.videoPath && (
                  <video
                    className="vet-message-video"
                    src={buildVideoUrl(msg.videoPath)}
                    controls
                    playsInline
                    preload="metadata"
                    poster={msg.thumbnailPath ? buildVideoUrl(msg.thumbnailPath) : undefined}
                  />
                )}
                {msg.note && <p className="vet-message-note">{msg.note}</p>}
                <div className="vet-message-meta">
                  <span className="vet-message-time">{formatTime(msg.createdAt)}</span>
                  <div className="vet-message-actions">
                    {msg.senderRole === 'client' && msg.videoPath && (
                      <button
                        className="vet-react-btn"
                        onClick={() => setShowReaction(buildVideoUrl(msg.videoPath))}
                        title="Reaccionar al video"
                      >
                        <MonitorPlay size={14} />
                      </button>
                    )}
                    <button
                      className={`vet-save-btn ${msg.savedByCreator ? 'vet-save-btn--active' : ''}`}
                      onClick={() => toggleSaved.mutate({ messageId: msg.id, saved: !msg.savedByCreator })}
                      title={msg.savedByCreator ? 'Guardado (no se borra automaticamente)' : 'Guardar (evitar borrado automatico)'}
                    >
                      {msg.savedByCreator ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                    </button>
                  </div>
                </div>
              </div>
              <span className="vet-message-sender">
                {msg.senderRole === 'creator' ? 'Tu' : 'Cliente'}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending video preview */}
      {pendingBlob && (
        <div className="vet-pending">
          <video
            className="vet-pending-video"
            src={URL.createObjectURL(pendingBlob)}
            controls
            playsInline
          />
          {(isCompressing || isUploading) && (
            <div className="vet-progress">
              <div className="vet-progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
              <span className="vet-progress-label">
                {isCompressing ? 'Comprimiendo...' : `Subiendo ${Math.round(progress * 100)}%`}
              </span>
            </div>
          )}
          {uploadError && <p className="vet-error">{uploadError}</p>}
          <div className="vet-pending-actions">
            <button className="vet-pending-cancel" onClick={handleCancelVideo} disabled={isCompressing || isUploading}>
              Cancelar
            </button>
            <button className="vet-pending-send" onClick={handleSendVideo} disabled={isCompressing || isUploading}>
              Enviar video
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      {exchange?.status === 'open' && !pendingBlob && (
        <div className="vet-input-area">
          <button className="vet-record-btn" onClick={() => setShowRecorder(true)}>
            <Video size={18} />
          </button>
          <input
            className="vet-text-input"
            placeholder="Escribe una nota..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendText()}
          />
          <button
            className="vet-send-btn"
            onClick={handleSendText}
            disabled={!note.trim() || sendTextMessage.isPending}
          >
            <Send size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
