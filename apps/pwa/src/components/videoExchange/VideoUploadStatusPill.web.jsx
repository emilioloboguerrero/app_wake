import React from 'react';
import { useVideoUpload } from '../../contexts/VideoUploadContext';

export default function VideoUploadStatusPill() {
  const { uploads, retryUpload, dismissUpload } = useVideoUpload();

  if (uploads.length === 0) return null;

  return (
    <div style={styles.container} role="status" aria-live="polite">
      {uploads.map((u) => (
        <UploadPill
          key={u.id}
          upload={u}
          onRetry={() => retryUpload(u.id)}
          onDismiss={() => dismissUpload(u.id)}
        />
      ))}
    </div>
  );
}

function UploadPill({ upload, onRetry, onDismiss }) {
  const { status, progress, metadata, error } = upload;
  const exerciseName = metadata?.exerciseName;

  const label = (() => {
    if (status === 'pending') return 'Preparando envío…';
    if (status === 'uploading') return `Enviando video${exerciseName ? ` · ${exerciseName}` : ''}`;
    if (status === 'success') return 'Video enviado al coach';
    if (status === 'error') return error || 'No se pudo enviar el video';
    return '';
  })();

  const pct = Math.max(0, Math.min(1, progress || 0));

  return (
    <div style={{ ...styles.pill, ...(status === 'error' ? styles.pillError : null) }}>
      <div style={styles.row}>
        <StatusIcon status={status} />
        <span style={styles.label}>{label}</span>
        {status === 'error' && (
          <>
            <button style={styles.actionBtn} onClick={onRetry}>Reintentar</button>
            <button style={styles.dismissBtn} onClick={onDismiss} aria-label="Descartar">×</button>
          </>
        )}
        {status === 'success' && (
          <button style={styles.dismissBtn} onClick={onDismiss} aria-label="Cerrar">×</button>
        )}
      </div>
      {(status === 'pending' || status === 'uploading') && (
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressBar,
              width: status === 'pending' ? '8%' : `${Math.round(pct * 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }) {
  if (status === 'success') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M3 8.5L6.5 12L13 5" stroke="rgba(255,255,255,0.95)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'error') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 5V9M8 11.5V11.51" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="8" r="6.5" stroke="#ef4444" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <span style={styles.spinner} aria-hidden />
  );
}

const styles = {
  container: {
    position: 'fixed',
    bottom: 16,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    pointerEvents: 'none',
    zIndex: 10000,
    padding: '0 16px',
  },
  pill: {
    pointerEvents: 'auto',
    width: '100%',
    maxWidth: 420,
    background: 'rgba(26,26,26,0.92)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    padding: '10px 12px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    animation: 'wake-vup-rise 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
  },
  pillError: {
    border: '1px solid rgba(239,68,68,0.35)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.9)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  actionBtn: {
    padding: '6px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'rgba(255,255,255,0.95)',
    color: '#1a1a1a',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  dismissBtn: {
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    lineHeight: 1,
    cursor: 'pointer',
  },
  progressTrack: {
    position: 'relative',
    height: 3,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: 'rgba(255,255,255,0.85)',
    transition: 'width 0.3s ease',
  },
  spinner: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.18)',
    borderTopColor: 'rgba(255,255,255,0.9)',
    animation: 'wake-vup-spin 0.8s linear infinite',
    display: 'inline-block',
  },
};

if (typeof document !== 'undefined' && !document.getElementById('wake-vup-keyframes')) {
  const style = document.createElement('style');
  style.id = 'wake-vup-keyframes';
  style.textContent = `
    @keyframes wake-vup-rise {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes wake-vup-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}
