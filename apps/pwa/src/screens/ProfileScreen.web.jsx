// Web /profile screen.
// Two-zone layout: top = "Lo tuyo" (your programs, subscriptions, account),
// bottom = "Descubre" (library + discovery — formerly the carousel-tail library card).
import React from 'react';
import { useNavigate } from 'react-router-dom';

const styles = {
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    overflowY: 'auto',
    paddingBottom: 120,
  },
  header: {
    padding: '32px 24px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  greeting: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  title: {
    fontSize: 30,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  zone: {
    padding: '24px 16px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  zoneLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
    paddingLeft: 8,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    padding: '16px 18px',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    cursor: 'pointer',
  },
  rowText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
  },
  rowSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },
  chevron: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.4)',
  },
  settingsLink: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    padding: '10px 18px',
    cursor: 'pointer',
    alignSelf: 'flex-end',
  },
};

const Row = ({ title, subtitle, onClick }) => (
  <div style={styles.row} onClick={onClick} role="button" tabIndex={0}>
    <div style={styles.rowText}>
      <span style={styles.rowTitle}>{title}</span>
      {subtitle ? <span style={styles.rowSubtitle}>{subtitle}</span> : null}
    </div>
    <span style={styles.chevron}>›</span>
  </div>
);

const ProfileScreen = () => {
  const navigate = useNavigate();
  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.greeting}>Perfil</span>
        <span style={styles.title}>Tu cuenta</span>
      </div>

      <div style={styles.zone}>
        <span style={styles.zoneLabel}>Lo tuyo</span>
        <div style={styles.list}>
          <Row
            title="Mis programas"
            subtitle="Cursos activos e historial"
            onClick={() => navigate('/courses')}
          />
          <Row
            title="Mis sesiones"
            subtitle="Registro de entrenamientos"
            onClick={() => navigate('/sessions')}
          />
          <Row
            title="Records personales"
            subtitle="PRs por ejercicio"
            onClick={() => navigate('/prs')}
          />
          <Row
            title="Volumen semanal"
            subtitle="Tendencia de carga"
            onClick={() => navigate('/volume')}
          />
          <Row
            title="Suscripciones"
            subtitle="Pagos y renovaciones"
            onClick={() => navigate('/subscriptions')}
          />
        </div>
      </div>

      <div style={styles.zone}>
        <span style={styles.zoneLabel}>Descubre</span>
        <div style={styles.list}>
          <Row
            title="Explorar programas"
            subtitle="Encuentra coaches y rutinas"
            onClick={() => navigate('/library')}
          />
          <Row
            title="Lab"
            subtitle="Tu data de entrenamiento"
            onClick={() => navigate('/progress')}
          />
        </div>
      </div>
    </div>
  );
};

export default ProfileScreen;
