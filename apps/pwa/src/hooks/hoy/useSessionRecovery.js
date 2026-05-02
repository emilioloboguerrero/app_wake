// Detects an in-progress workout so Hoy can surface a "Continuar" banner.
// Two sources, in priority order:
//   1) localStorage (`wake_session_checkpoint`) — instant, same key DailyWorkoutScreen writes
//   2) Server (`/workout/session/active`) — cross-device fallback for users who left their
//      workout running on a different device
import { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';

const CHECKPOINT_KEY = 'wake_session_checkpoint';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const isFreshFor = (cp, userId) => {
  if (!cp) return false;
  if (cp.userId && cp.userId !== userId) return false;
  if (cp.savedAt && Date.now() - new Date(cp.savedAt).getTime() > MAX_AGE_MS) return false;
  return true;
};

export function useSessionRecovery(userId) {
  const [checkpoint, setCheckpoint] = useState(null);

  useEffect(() => {
    if (!userId) { setCheckpoint(null); return; }
    let cancelled = false;

    // 1) localStorage
    let local = null;
    try {
      const raw = localStorage.getItem(CHECKPOINT_KEY);
      if (raw) local = JSON.parse(raw);
    } catch {
      local = null;
    }
    if (isFreshFor(local, userId)) {
      setCheckpoint(local);
      return;
    }

    // 2) Server check (cross-device)
    apiClient.get('/workout/session/active')
      .then((res) => {
        if (cancelled) return;
        const server = res?.data?.checkpoint;
        if (isFreshFor(server, userId)) setCheckpoint(server);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [userId]);

  const dismiss = () => {
    try { localStorage.removeItem(CHECKPOINT_KEY); } catch {}
    setCheckpoint(null);
  };

  return { checkpoint, dismiss };
}
