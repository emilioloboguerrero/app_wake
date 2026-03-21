import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';

export default function RequestAccess() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [useCase, setUseCase] = useState('');
  const [scopes, setScopes] = useState(['write']);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const toggleScope = (scope) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (scopes.length === 0) {
      setError('Selecciona al menos un alcance.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(firestore, 'write_access_requests'), {
        name: name.trim(),
        email: email.trim(),
        useCase: useCase.trim(),
        requestedScopes: scopes,
        userId: user?.uid || null,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch {
      setError('Error al enviar la solicitud. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={styles.centered}>
        <div style={styles.card}>
          <div style={styles.checkmark}>&#10003;</div>
          <h2 style={styles.successTitle}>Solicitud enviada</h2>
          <p style={styles.successText}>
            Tu solicitud de acceso ser&aacute; revisada por el equipo de Wake.
            Recibir&aacute;s una notificaci&oacute;n por email cuando sea aprobada (m&aacute;ximo 48 horas).
          </p>
          <button onClick={() => navigate('/developers/api-keys')} style={styles.backBtn}>
            Volver a Claves API
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <button onClick={() => navigate('/developers/api-keys')} style={styles.backLink}>
        &larr; Volver a Claves API
      </button>

      <h1 style={styles.title}>Solicitar acceso write</h1>
      <p style={styles.subtitle}>
        Las claves con alcance <code style={styles.code}>write</code> permiten crear, modificar y eliminar
        datos a trav&eacute;s de la API. Requieren aprobaci&oacute;n manual del equipo de Wake.
      </p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div>
          <label style={styles.label}>Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre completo"
            style={styles.input}
            required
          />
        </div>
        <div>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            style={styles.input}
            required
          />
        </div>
        <div>
          <label style={styles.label}>Alcances solicitados</label>
          <div style={styles.scopeOptions}>
            {['write', 'creator'].map((scope) => (
              <label key={scope} style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                />
                <div>
                  <strong>{scope}</strong>
                  <span style={styles.radioDesc}>
                    {scope === 'write' && ' — Lectura y escritura de datos'}
                    {scope === 'creator' && ' — Acceso a endpoints de creador'}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label style={styles.label}>Descripci&oacute;n del caso de uso</label>
          <textarea
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            placeholder="Describe c&oacute;mo planeas usar el acceso de escritura. Por ejemplo: 'Un bot que registra autom&aacute;ticamente las comidas de mis clientes bas&aacute;ndose en fotos.'"
            style={styles.textarea}
            rows={4}
            required
          />
          <p style={styles.hint}>
            S&eacute; espec&iacute;fico sobre qu&eacute; datos vas a escribir y por qu&eacute;. Esto acelera la aprobaci&oacute;n.
          </p>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.actions}>
          <button type="button" onClick={() => navigate('/developers/api-keys')} style={styles.cancelBtn}>
            Cancelar
          </button>
          <button type="submit" disabled={submitting} style={styles.submitBtn}>
            {submitting ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </div>
      </form>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 560,
  },
  centered: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 60,
  },
  card: {
    textAlign: 'center',
    maxWidth: 400,
  },
  checkmark: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'rgba(76,175,80,0.15)',
    color: '#4caf50',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
    margin: '0 auto 16px',
  },
  successTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
  },
  successText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    lineHeight: 1.6,
    marginTop: 8,
  },
  backBtn: {
    background: '#fff',
    color: '#111',
    border: 'none',
    borderRadius: 8,
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 20,
  },
  backLink: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    marginBottom: 20,
    display: 'block',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 700,
    margin: 0,
    letterSpacing: '-0.03em',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 8,
    lineHeight: 1.6,
  },
  code: {
    background: 'rgba(255,255,255,0.08)',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    marginTop: 28,
  },
  label: {
    display: 'block',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: 500,
    marginBottom: 6,
  },
  input: {
    background: '#222',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  },
  textarea: {
    background: '#222',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  scopeOptions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    cursor: 'pointer',
  },
  radioDesc: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 400,
  },
  hint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    marginTop: 6,
  },
  error: {
    color: '#e53935',
    fontSize: 13,
    margin: 0,
  },
  actions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.6)',
    padding: '8px 16px',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
  },
  submitBtn: {
    background: '#fff',
    color: '#111',
    border: 'none',
    borderRadius: 8,
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
