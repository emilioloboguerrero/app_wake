import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, getFirestore } from 'firebase/firestore';
import SubmitVideoScreen from './SubmitVideoScreen.web';
import VideoHistoryView from './VideoHistoryView.web';

const db = getFirestore();

/**
 * Full-screen modal overlay for video-exchange flows in the PWA workout flow.
 *
 * Modes:
 * - `submit` — renders SubmitVideoScreen, requires `exerciseKey` + `exerciseName`
 * - `history` — renders VideoHistoryView (read-only list + detail)
 *
 * Resolves `oneOnOneClientId` internally from (userId, creatorId).
 */
export default function VideoExchangeOverlay({
  open,
  mode,
  userId,
  creatorId,
  exerciseKey,
  exerciseName,
  onClose,
}) {
  const { data: oneOnOneClientId } = useQuery({
    queryKey: ['oneOnOneClient', userId, creatorId],
    queryFn: async () => {
      const q = query(
        collection(db, 'one_on_one_clients'),
        where('clientUserId', '==', userId),
        where('creatorId', '==', creatorId)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return snap.docs[0].id;
    },
    enabled: open && !!userId && !!creatorId,
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        {mode === 'submit' && oneOnOneClientId ? (
          <SubmitVideoScreen
            userId={userId}
            oneOnOneClientId={oneOnOneClientId}
            exerciseKey={exerciseKey}
            exerciseName={exerciseName}
            onCancel={onClose}
            onSubmitted={onClose}
          />
        ) : mode === 'history' ? (
          <VideoHistoryView userId={userId} onClose={onClose} />
        ) : (
          <div style={styles.placeholder}>Cargando…</div>
        )}
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 9999,
    animation: 'wake-vxo-fade-in 0.2s ease-out',
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92vh',
    overflowY: 'auto',
    background: '#1a1a1a',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    animation: 'wake-vxo-rise 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
  },
  placeholder: {
    padding: '60px 24px',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
  },
};

// Inject animation keyframes once
if (typeof document !== 'undefined' && !document.getElementById('wake-vxo-keyframes')) {
  const style = document.createElement('style');
  style.id = 'wake-vxo-keyframes';
  style.textContent = `
    @keyframes wake-vxo-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes wake-vxo-rise {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}
