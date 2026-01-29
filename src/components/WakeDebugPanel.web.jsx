// On-screen debug panel for production. Only visible when ?wake_debug=1 or localStorage WAKE_DEBUG=true.
// Helps debug Safari loading / auth without opening dev tools.

import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isSafariWeb } from '../utils/platform';
import { isProductionDebug } from '../config/environment';

const styles = {
  panel: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '40vh',
    overflow: 'auto',
    backgroundColor: 'rgba(0,0,0,0.92)',
    color: '#eee',
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '8px 10px',
    borderTop: '1px solid #444',
    zIndex: 99999,
    lineHeight: 1.4,
  },
  row: { marginBottom: 2 },
  label: { color: '#888' },
  value: { color: '#bfa84d' },
  section: { marginTop: 6, marginBottom: 2, color: '#888', fontWeight: 'bold' },
};

function useAuthCurrentUser() {
  try {
    const { auth } = require('../config/firebase');
    return auth.currentUser;
  } catch {
    return null;
  }
}

export default function WakeDebugPanel() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const firebaseCurrentUser = useAuthCurrentUser();
  const safari = isSafariWeb();

  if (!isProductionDebug() || typeof window === 'undefined') return null;

  return (
    <div style={styles.panel}>
      <div style={styles.section}>WAKE DEBUG (production)</div>
      <div style={styles.row}><span style={styles.label}>Safari: </span><span style={styles.value}>{safari ? 'YES' : 'no'}</span></div>
      <div style={styles.row}><span style={styles.label}>pathname: </span><span style={styles.value}>{location.pathname}</span></div>
      <div style={styles.section}>Auth</div>
      <div style={styles.row}><span style={styles.label}>loading: </span><span style={styles.value}>{String(loading)}</span></div>
      <div style={styles.row}><span style={styles.label}>user (context): </span><span style={styles.value}>{user ? user.uid : 'null'}</span></div>
      <div style={styles.row}><span style={styles.label}>auth.currentUser: </span><span style={styles.value}>{firebaseCurrentUser ? firebaseCurrentUser.uid : 'null'}</span></div>
      <div style={styles.row}><span style={styles.label}>userAgent: </span><span style={styles.value}>{(navigator.userAgent || '').slice(0, 50)}…</span></div>
      <div style={styles.section}>Console: filter by [WAKE PROD] for auth/layout logs</div>
    </div>
  );
}
