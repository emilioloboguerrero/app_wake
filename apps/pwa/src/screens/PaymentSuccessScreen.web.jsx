import React from 'react';

const PaymentSuccessScreen = () => {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
            <circle cx="36" cy="36" r="35" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            <circle cx="36" cy="36" r="26" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" fill="none" />
            <polyline
              points="25,36 33,44 48,28"
              stroke="rgba(255,255,255,0.95)"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 style={styles.title}>Pago completado</h1>
        <p style={styles.subtitle}>Tu acceso al programa está siendo activado.</p>
        <p style={styles.close}>Cierra esta ventana y regresa a la app.</p>
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
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    margin: 0,
    fontSize: '15px',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: '1.5',
  },
  close: {
    margin: 0,
    fontSize: '14px',
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
  },
};

export default PaymentSuccessScreen;
