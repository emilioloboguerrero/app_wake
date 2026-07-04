import React from 'react';
import { useNavigate } from 'react-router-dom';

const PaymentCancelledScreen = () => {
  const navigate = useNavigate();

  // MercadoPago can redirect back in the SAME tab, so "cierra esta ventana"
  // left the buyer stranded with no way back into the app. Navigate to the
  // library within the app; fall back to a hard redirect if the router isn't
  // mounted for some reason.
  const goBackToApp = () => {
    try {
      navigate('/library');
    } catch {
      window.location.replace('/app/library');
    }
  };

  return (
    <div style={styles.container}>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
            <circle cx="36" cy="36" r="35" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
            <circle cx="36" cy="36" r="26" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" />
            <line x1="27" y1="27" x2="45" y2="45" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="45" y1="27" x2="27" y2="45" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        <h1 style={styles.title}>Pago cancelado</h1>
        <p style={styles.subtitle}>No se realizó ningún cobro.</p>
        <button type="button" style={styles.button} onClick={goBackToApp}>
          Volver a la app
        </button>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    background: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    maxWidth: '360px',
    width: '100%',
    animation: 'fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both',
  },
  iconWrap: {
    marginBottom: '8px',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    margin: 0,
    fontSize: '15px',
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: '1.5',
  },
  button: {
    marginTop: '8px',
    padding: '13px 28px',
    borderRadius: '12px',
    border: 'none',
    background: '#fff',
    color: '#111',
    fontWeight: 600,
    fontSize: '15px',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
};

export default PaymentCancelledScreen;
