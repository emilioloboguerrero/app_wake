import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import videoExchangeService from '../../services/videoExchangeService';
import useVideoExchangeUpload from '../../hooks/useVideoExchangeUpload';
import VideoRecorderPWA from './VideoRecorderPWA.web';
import { queryKeys, cacheConfig } from '../../config/queryClient';

export default function VideoExchangeThreadView({ exchangeId, userId, onBack }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [showRecorder, setShowRecorder] = useState(false);
  const [pendingBlob, setPendingBlob] = useState(null);
  const messagesEndRef = useRef(null);

  const { upload, isCompressing, isUploading, progress, error: uploadError, reset: resetUpload } = useVideoExchangeUpload(exchangeId);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.videoExchanges.detail(exchangeId),
    queryFn: () => videoExchangeService.getThread(exchangeId),
    ...cacheConfig.videoExchanges,
  });

  const exchange = data?.exchange;
  const messages = data?.messages || [];

  // Mark as read
  useEffect(() => {
    if (exchange && exchange.unreadByClient > 0) {
      videoExchangeService.markRead(exchangeId).then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.byClient(userId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.unreadCount(userId) });
      });
    }
  }, [exchange, exchangeId, userId, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendTextMessage = useMutation({
    mutationFn: (text) => videoExchangeService.sendMessage(exchangeId, { note: text }),
    onSuccess: () => {
      setNote('');
      queryClient.invalidateQueries({ queryKey: queryKeys.videoExchanges.detail(exchangeId) });
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

  if (showRecorder) {
    return (
      <div style={styles.container}>
        <div style={styles.recorderHeader}>
          <button style={styles.backBtn} onClick={() => setShowRecorder(false)}>
            ← Volver
          </button>
        </div>
        <VideoRecorderPWA
          onComplete={handleRecordComplete}
          onCancel={() => setShowRecorder(false)}
          maxDuration={120}
        />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>←</button>
        <div style={styles.headerInfo}>
          <span style={styles.headerTitle}>{exchange?.exerciseName || 'General'}</span>
        </div>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {isLoading ? (
          <div style={styles.loading}>Cargando...</div>
        ) : messages.length === 0 ? (
          <div style={styles.emptyMsg}>
            <p>No hay mensajes. Graba un video para enviar a tu coach.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                ...styles.message,
                alignSelf: msg.senderRole === 'client' ? 'flex-end' : 'flex-start',
                alignItems: msg.senderRole === 'client' ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{
                ...styles.bubble,
                background: msg.senderRole === 'client' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
              }}>
                {msg.videoPath && (
                  <video
                    style={styles.video}
                    src={buildVideoUrl(msg.videoPath)}
                    controls
                    playsInline
                    preload="metadata"
                    poster={msg.thumbnailPath ? buildVideoUrl(msg.thumbnailPath) : undefined}
                  />
                )}
                {msg.note && <p style={styles.noteText}>{msg.note}</p>}
                <span style={styles.time}>{formatTime(msg.createdAt)}</span>
              </div>
              <span style={styles.sender}>
                {msg.senderRole === 'client' ? 'Tu' : 'Coach'}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending video */}
      {pendingBlob && (
        <div style={styles.pending}>
          <video style={styles.pendingVideo} src={URL.createObjectURL(pendingBlob)} controls playsInline />
          {(isCompressing || isUploading) && (
            <div style={styles.progressContainer}>
              <div style={{ ...styles.progressBar, width: `${Math.round(progress * 100)}%` }} />
              <span style={styles.progressLabel}>
                {isCompressing ? 'Comprimiendo...' : `Subiendo ${Math.round(progress * 100)}%`}
              </span>
            </div>
          )}
          {uploadError && <p style={styles.error}>{uploadError}</p>}
          <div style={styles.pendingActions}>
            <button style={styles.cancelBtn} onClick={() => { setPendingBlob(null); resetUpload(); }} disabled={isCompressing || isUploading}>
              Cancelar
            </button>
            <button style={styles.sendVideoBtn} onClick={handleSendVideo} disabled={isCompressing || isUploading}>
              Enviar video
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      {exchange?.status === 'open' && !pendingBlob && (
        <div style={styles.inputArea}>
          <button style={styles.recordBtn} onClick={() => setShowRecorder(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
          </button>
          <input
            style={styles.textInput}
            placeholder="Escribe una nota..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendText()}
          />
          <button style={styles.sendBtn} onClick={handleSendText} disabled={!note.trim()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', minHeight: 400 },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  recorderHeader: { padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  backBtn: { padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14 },
  headerInfo: { display: 'flex', flexDirection: 'column' },
  headerTitle: { fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.9)' },
  messages: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  loading: { padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  emptyMsg: { textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 },
  message: { display: 'flex', flexDirection: 'column', maxWidth: '80%' },
  bubble: { borderRadius: 12, overflow: 'hidden' },
  video: { width: '100%', maxWidth: 320, display: 'block', borderRadius: 8, background: '#000' },
  noteText: { padding: '8px 12px', margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 },
  time: { display: 'block', padding: '4px 12px 8px', fontSize: 10, color: 'rgba(255,255,255,0.25)' },
  sender: { fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 },
  pending: { padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' },
  pendingVideo: { width: '100%', maxWidth: 280, borderRadius: 8, display: 'block', marginBottom: 8 },
  progressContainer: { position: 'relative', height: 24, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressBar: { height: '100%', background: 'rgba(255,255,255,0.15)', transition: 'width 0.3s ease' },
  progressLabel: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)' },
  error: { fontSize: 12, color: '#ef4444', margin: '4px 0' },
  pendingActions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  cancelBtn: { padding: '6px 14px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' },
  sendVideoBtn: { padding: '6px 14px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.9)', color: '#1a1a1a', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  inputArea: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' },
  recordBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
    borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', flexShrink: 0,
  },
  textInput: {
    flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)', fontSize: 14, outline: 'none',
  },
  sendBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
    borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', flexShrink: 0,
  },
};
