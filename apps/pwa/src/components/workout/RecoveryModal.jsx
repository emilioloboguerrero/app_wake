import React, { useMemo } from 'react';

function getTimeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} minuto${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} hora${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days === 1 ? '' : 's'}`;
}

export default function RecoveryModal({ checkpoint, onResume, onDiscard }) {
  const completedCount = useMemo(
    () => (checkpoint?.completedSets ? Object.keys(checkpoint.completedSets).length : 0),
    [checkpoint]
  );

  const timeAgo = useMemo(
    () => getTimeAgo(checkpoint?.startedAt || checkpoint?.savedAt),
    [checkpoint]
  );

  return (
    <div style={styles.overlay}>
      <style>{`@keyframes wakeRecoveryEnter { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={styles.card}>
        <p style={styles.label}>SESIÓN INCOMPLETA</p>
        <h2 style={styles.title}>{checkpoint?.sessionName || 'Sesión'}</h2>
        <p style={styles.subtitle}>
          Iniciada {timeAgo}
        </p>
        <p style={styles.progress}>
          {completedCount} serie{completedCount !== 1 ? 's' : ''} completada{completedCount !== 1 ? 's' : ''}
        </p>
        <div style={styles.actions}>
          <button style={styles.discardBtn} onClick={onDiscard}>
            Descartar
          </button>
          <button style={styles.resumeBtn} onClick={onResume}>
            Continuar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  },
  card: {
    width: '90%',
    maxWidth: 380,
    backgroundColor: '#1a1a1a',
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,0.15)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    padding: '32px 28px 28px',
    textAlign: 'center',
    animation: 'wakeRecoveryEnter 0.42s cubic-bezier(0.22,1,0.36,1) both',
  },
  label: {
    margin: '0 0 12px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
  },
  title: {
    margin: '0 0 6px',
    fontSize: 20,
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1.3,
  },
  subtitle: {
    margin: '0 0 4px',
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
  progress: {
    margin: '0 0 28px',
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
  actions: {
    display: 'flex',
    gap: 12,
  },
  discardBtn: {
    flex: 1,
    padding: '12px 0',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    backgroundColor: 'transparent',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  resumeBtn: {
    flex: 1,
    padding: '12px 0',
    border: 'none',
    borderRadius: 12,
    backgroundColor: '#fff',
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
