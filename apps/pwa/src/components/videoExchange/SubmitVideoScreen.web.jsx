import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useVideoUpload } from '../../contexts/VideoUploadContext';

const MAX_DURATION_SEC = 120;
const MAX_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * Client-initiated video submission, anchored to a specific exercise.
 * Uses native file pickers (camera + gallery) — no custom recording UI.
 * Upload is queued to VideoUploadContext and runs in the background;
 * this screen closes the moment the user hits Enviar.
 */
export default function SubmitVideoScreen({
  userId,
  oneOnOneClientId,
  exerciseKey,
  exerciseName,
  onCancel,
  onSubmitted,
}) {
  const { enqueueUpload } = useVideoUpload();

  const [note, setNote] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [durationSec, setDurationSec] = useState(null);
  const [error, setError] = useState(null);
  const [validating, setValidating] = useState(false);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const clearVideo = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setDurationSec(null);
    setError(null);
  }, [videoUrl]);

  const handleFileSelected = useCallback(async (file) => {
    if (!file) return;
    setError(null);

    if (!file.type || !file.type.startsWith('video/')) {
      setError('El archivo seleccionado no es un video');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`El video es muy grande. Máximo ${Math.round(MAX_SIZE_BYTES / (1024 * 1024))} MB.`);
      return;
    }

    setValidating(true);
    const duration = await readDuration(file);
    setValidating(false);

    if (!duration || duration <= 0) {
      setError('No pudimos leer este video. Intenta con otro archivo.');
      return;
    }
    if (duration > MAX_DURATION_SEC + 1) {
      setError(`El video dura ${Math.round(duration)}s. Máximo ${MAX_DURATION_SEC}s.`);
      return;
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setDurationSec(Math.round(duration));
  }, [videoUrl]);

  const handleCameraChange = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    handleFileSelected(file);
  }, [handleFileSelected]);

  const handleGalleryChange = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    handleFileSelected(file);
  }, [handleFileSelected]);

  const handleSubmit = useCallback(() => {
    if (!videoFile) return;
    enqueueUpload({
      videoBlob: videoFile,
      note,
      exerciseKey,
      exerciseName,
      userId,
      oneOnOneClientId,
    });
    onSubmitted?.();
  }, [videoFile, note, exerciseKey, exerciseName, userId, oneOnOneClientId, enqueueUpload, onSubmitted]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onCancel} aria-label="Cerrar">←</button>
        <span style={styles.headerTitle}>Enviar video al coach</span>
      </div>

      <div style={styles.body}>
        <div style={styles.exerciseTag}>
          <span style={styles.exerciseTagLabel}>Ejercicio</span>
          <span style={styles.exerciseTagName}>{exerciseName}</span>
        </div>

        {!videoFile ? (
          <SourcePicker
            onRecord={() => cameraInputRef.current?.click()}
            onGallery={() => galleryInputRef.current?.click()}
            validating={validating}
          />
        ) : (
          <div style={styles.previewBlock}>
            <video style={styles.preview} src={videoUrl} controls playsInline preload="metadata" />
            <div style={styles.previewMeta}>
              <span style={styles.previewMetaText}>
                {durationSec}s · {formatSize(videoFile.size)}
              </span>
              <button style={styles.linkBtn} onClick={clearVideo}>Cambiar</button>
            </div>
          </div>
        )}

        <textarea
          style={styles.textarea}
          placeholder="Nota para el coach (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
        />

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{
            ...styles.primaryBtn,
            ...(videoFile ? null : styles.primaryBtnDisabled),
          }}
          onClick={handleSubmit}
          disabled={!videoFile}
        >
          Guardar
        </button>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={handleCameraChange}
        style={styles.hiddenInput}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="video/*"
        onChange={handleGalleryChange}
        style={styles.hiddenInput}
      />
    </div>
  );
}

function SourcePicker({ onRecord, onGallery, validating }) {
  return (
    <div style={styles.sourceGrid}>
      <SourceButton
        label="Grabar"
        onClick={onRecord}
        disabled={validating}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="2.5" y="6.5" width="13" height="11" rx="2.5" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6" />
            <path d="M16 10L21 7.5V16.5L16 14" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        }
      />
      <SourceButton
        label="Galería"
        onClick={onGallery}
        disabled={validating}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6" />
            <path d="M3 15L8 10L13 14L17 10L21 14" stroke="rgba(255,255,255,0.9)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="8" cy="9" r="1.3" fill="rgba(255,255,255,0.9)" />
          </svg>
        }
      />
    </div>
  );
}

function SourceButton({ label, onClick, disabled, icon }) {
  return (
    <button
      type="button"
      style={{ ...styles.sourceBtn, ...(disabled ? styles.sourceBtnDisabled : null) }}
      onClick={onClick}
      disabled={disabled}
    >
      <span style={styles.sourceIcon}>{icon}</span>
      <span style={styles.sourceLabel}>{label}</span>
    </button>
  );
}

function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const d = video.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', minHeight: 400 },
  header: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 28, height: 28, borderRadius: 8, border: 'none',
    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer', fontSize: 16, display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  headerTitle: { fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' },
  body: { display: 'flex', flexDirection: 'column', padding: 16, gap: 12 },
  exerciseTag: {
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: '12px 14px', borderRadius: 10,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  exerciseTagLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)',
  },
  exerciseTagName: {
    fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.95)',
  },
  sourceGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4,
  },
  sourceBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 10,
    padding: '24px 14px', borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.10)',
    color: 'rgba(255,255,255,0.9)',
    cursor: 'pointer', textAlign: 'center',
    transition: 'background 0.15s ease, border-color 0.15s ease',
  },
  sourceBtnDisabled: { opacity: 0.5, cursor: 'wait' },
  sourceIcon: {
    width: 40, height: 40, borderRadius: 10,
    background: 'rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  sourceLabel: {
    fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.95)',
  },
  previewBlock: {
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  preview: {
    width: '100%', borderRadius: 10, display: 'block',
    background: '#000', maxHeight: 360, objectFit: 'contain',
  },
  previewMeta: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  previewMetaText: {
    fontSize: 12, color: 'rgba(255,255,255,0.5)',
  },
  linkBtn: {
    padding: '4px 8px', borderRadius: 6, border: 'none',
    background: 'transparent', color: 'rgba(255,255,255,0.85)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    textDecoration: 'underline', textUnderlineOffset: 3,
  },
  textarea: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical',
    fontFamily: 'inherit',
  },
  primaryBtn: {
    marginTop: 4, padding: '13px 20px', borderRadius: 10, border: 'none',
    background: 'rgba(255,255,255,0.95)', color: '#1a1a1a',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  },
  primaryBtnDisabled: {
    opacity: 0.35, cursor: 'not-allowed',
  },
  error: {
    fontSize: 12, color: '#ef4444', margin: '0',
    padding: '8px 10px', borderRadius: 6,
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.22)',
  },
  hiddenInput: { display: 'none' },
};
