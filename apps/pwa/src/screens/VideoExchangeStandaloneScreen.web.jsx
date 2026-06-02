// Standalone landing for a single video-exchange thread, reached from the
// coach-reply confirmation email. The same thread view is rendered as an
// overlay inside the workout flow; this wrapper just gives it a route of
// its own so the email CTA `/app/video-exchange/:exchangeId` has somewhere
// to land. Wrapped in UnauthAccessGate at the route level, so by the time
// this component renders we always have a Firebase session.

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import VideoExchangeThreadView from '../components/videoExchange/VideoExchangeThreadView.web';

export default function VideoExchangeStandaloneScreen() {
  const { exchangeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!exchangeId) {
    return (
      <div style={styles.root}>
        <div style={styles.card}>
          <p style={styles.body}>No encontramos el video.</p>
          <button style={styles.button} onClick={() => navigate('/', { replace: true })}>
            Volver a Wake
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <VideoExchangeThreadView
          exchangeId={exchangeId}
          userId={user?.uid}
          onBack={() => navigate('/', { replace: true })}
        />
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    background: '#1a1a1a',
    color: '#fff',
    padding: 16,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    maxWidth: 480,
    margin: '0 auto',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  body: {
    margin: 0,
    padding: 24,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
  },
  button: {
    display: 'block',
    margin: '0 auto 24px',
    padding: '10px 18px',
    borderRadius: 10,
    border: 'none',
    background: '#fff',
    color: '#1a1a1a',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
};
