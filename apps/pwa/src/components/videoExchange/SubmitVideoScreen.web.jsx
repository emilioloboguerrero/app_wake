import React, { useState, useCallback } from 'react';
import VideoRecorderPWA from './VideoRecorderPWA.web';
import useSubmitVideo from '../../hooks/useSubmitVideo';

/**
 * Client-initiated video submission, anchored to a specific exercise.
 * Required props: `exerciseKey`, `exerciseName`. This screen only opens
 * from inside the workout flow — there is no way to submit without context.
 */
export default function SubmitVideoScreen({
  userId,
  oneOnOneClientId,
  exerciseKey,
  exerciseName,
  onCancel,
  onSubmitted,
}) {
  const [note, setNote] = useState('');
  const [showRecorder, setShowRecorder] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  const { submit, isUploading, progress, error, reset } =
    useSubmitVideo({ userId, oneOnOneClientId });

  const isBusy = isUploading;

  const handleRecordComplete = useCallback((blob) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoBlob(blob);
    setVideoUrl(URL.createObjectURL(blob));
    setShowRecorder(false);
  }, [videoUrl]);

  const handleRetake = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoBlob(null);
    setVideoUrl(null);
    reset();
    setShowRecorder(true);
  }, [videoUrl, reset]);

  const handleSubmit = useCallback(async () => {
    if (!videoBlob || isBusy) return;
    const result = await submit({ videoBlob, exerciseKey, exerciseName, note });
    if (result) {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoBlob(null);
      setVideoUrl(null);
      onSubmitted?.(result.exchangeId);
    }
  }, [videoBlob, isBusy, submit, exerciseKey, exerciseName, note, videoUrl, onSubmitted]);

  if (showRecorder) {
    return (
      <div style={styles.container}>
        <div style={styles.recorderHeader}>
          <button style={styles.backBtn} onClick={() => setShowRecorder(false)}>← Volver</button>
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
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onCancel} disabled={isBusy}>←</button>
        <span style={styles.headerTitle}>Enviar video al coach</span>
      </div>

      <div style={styles.body}>
        <div style={styles.exerciseTag}>
          <span style={styles.exerciseTagLabel}>Ejercicio</span>
          <span style={styles.exerciseTagName}>{exerciseName}</span>
        </div>

        <label style={styles.label}>Nota para el coach</label>
        <textarea
          style={styles.textarea}
          placeholder="Cuéntale a tu coach qué quieres que revise…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isBusy}
          maxLength={500}
          rows={3}
        />

        {!videoUrl ? (
          <button style={styles.primaryBtn} onClick={() => setShowRecorder(true)} disabled={isBusy}>
            Grabar video
          </button>
        ) : (
          <>
            <video style={styles.preview} src={videoUrl} controls playsInline />
            <div style={styles.previewActions}>
              <button style={styles.secondaryBtn} onClick={handleRetake} disabled={isBusy}>Repetir</button>
              <button style={styles.primaryBtn} onClick={handleSubmit} disabled={isBusy}>
                {isUploading ? `Subiendo ${Math.round(progress * 100)}%` : 'Enviar'}
              </button>
            </div>
            {isBusy && (
              <div style={styles.progressContainer}>
                <div style={{ ...styles.progressBar, width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
            {error && <p style={styles.error}>{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', minHeight: 400 },
  header: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  recorderHeader: { padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  backBtn: {
    padding: '4px 8px', borderRadius: 6, border: 'none',
    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer', fontSize: 14,
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.9)' },
  body: { display: 'flex', flexDirection: 'column', padding: 16, gap: 10 },
  exerciseTag: {
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: '12px 14px', borderRadius: 10,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  exerciseTagLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)',
  },
  exerciseTagName: {
    fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.95)',
  },
  label: {
    fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8,
  },
  textarea: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical',
    fontFamily: 'inherit',
  },
  primaryBtn: {
    marginTop: 12, padding: '12px 20px', borderRadius: 8, border: 'none',
    background: 'rgba(255,255,255,0.95)', color: '#1a1a1a',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '12px 20px', borderRadius: 8, border: 'none',
    background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  preview: {
    width: '100%', maxWidth: 480, borderRadius: 8, marginTop: 12,
    display: 'block', background: '#000',
  },
  previewActions: { display: 'flex', gap: 8, marginTop: 12 },
  progressContainer: {
    position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)',
    borderRadius: 999, overflow: 'hidden', marginTop: 12,
  },
  progressBar: {
    height: '100%', background: 'rgba(255,255,255,0.35)',
    transition: 'width 0.3s ease',
  },
  error: { fontSize: 12, color: '#ef4444', margin: '8px 0 0' },
};
