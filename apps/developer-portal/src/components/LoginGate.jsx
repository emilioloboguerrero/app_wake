import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginGate({ children }) {
  const { user, loading, canAccess, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div style={styles.center}>
        <span style={styles.loadingText}>Cargando...</span>
      </div>
    );
  }

  if (!user) {
    const handleSubmit = async (e) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);
      try {
        await login(email, password);
      } catch {
        setError('Credenciales inválidas. Intenta de nuevo.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div style={styles.center}>
        <div style={styles.loginCard}>
          <h1 style={styles.loginTitle}>Wake Developer Portal</h1>
          <p style={styles.loginSubtitle}>Inicia sesión con tu cuenta de creador</p>
          <form onSubmit={handleSubmit} style={styles.form}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              required
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              required
            />
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" disabled={submitting} style={styles.submitBtn}>
              {submitting ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div style={styles.center}>
        <div style={styles.loginCard}>
          <h2 style={styles.loginTitle}>Acceso restringido</h2>
          <p style={styles.loginSubtitle}>
            El portal de desarrolladores está disponible solo para creadores.
            Tu cuenta actual tiene rol de usuario regular.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

const styles = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1a1a1a',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
  loginCard: {
    background: '#222',
    borderRadius: 12,
    padding: '40px 32px',
    maxWidth: 380,
    width: '100%',
    margin: '0 16px',
  },
  loginTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
    textAlign: 'center',
  },
  loginSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 24,
  },
  input: {
    background: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
  },
  error: {
    color: '#e53935',
    fontSize: 13,
    margin: 0,
    textAlign: 'center',
  },
  submitBtn: {
    background: '#fff',
    color: '#111',
    border: 'none',
    borderRadius: 8,
    padding: '10px 0',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 4,
  },
};
