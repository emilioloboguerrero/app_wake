import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { WakeApiError } from '../utils/apiClient';

export default function Keys() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScope, setNewKeyScope] = useState('read');
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const [revokingId, setRevokingId] = useState(null);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get('/api-keys');
      setKeys(res.data || []);
    } catch (err) {
      setError(err instanceof WakeApiError ? err.message : 'Error al cargar las claves');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    if (newKeyScope === 'write') {
      navigate('/developers/keys/request-write', { state: { name: newKeyName } });
      return;
    }

    setCreating(true);
    try {
      const res = await apiClient.post('/api-keys', {
        name: newKeyName.trim(),
        scope: [newKeyScope],
      });
      setCreatedKey(res.data?.rawKey || res.rawKey);
      setNewKeyName('');
      setShowCreate(false);
      fetchKeys();
    } catch (err) {
      setError(err instanceof WakeApiError ? err.message : 'Error al crear la clave');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId) => {
    if (!confirm('¿Estás seguro? Esta acción no se puede deshacer.')) return;
    setRevokingId(keyId);
    try {
      await apiClient.delete(`/api-keys/${keyId}`);
      fetchKeys();
    } catch (err) {
      setError(err instanceof WakeApiError ? err.message : 'Error al revocar la clave');
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Nunca';
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const statusLabels = {
    active: 'Activa',
    pending_approval: 'Pendiente',
    rejected: 'Rechazada',
    revoked: 'Revocada',
  };

  const statusColors = {
    active: '#4caf50',
    pending_approval: '#ff9800',
    rejected: '#e53935',
    revoked: 'rgba(255,255,255,0.25)',
  };

  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Claves API</h1>
          <p style={styles.subtitle}>Administra tus claves de acceso a la API de Wake</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={styles.createBtn}>
          + Nueva clave
        </button>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={styles.dismissBtn}>×</button>
        </div>
      )}

      {/* Create key modal */}
      {showCreate && (
        <div style={styles.modalOverlay} onClick={() => setShowCreate(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Nueva clave API</h2>
            <form onSubmit={handleCreate} style={styles.form}>
              <div>
                <label style={styles.label}>Nombre</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Ej: Mi Dashboard de Coaching"
                  style={styles.input}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label style={styles.label}>Alcance</label>
                <div style={styles.scopeOptions}>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="scope"
                      value="read"
                      checked={newKeyScope === 'read'}
                      onChange={() => setNewKeyScope('read')}
                    />
                    <div>
                      <strong>read</strong>
                      <span style={styles.radioDesc}> — Solo lectura. Activación inmediata.</span>
                    </div>
                  </label>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="scope"
                      value="write"
                      checked={newKeyScope === 'write'}
                      onChange={() => setNewKeyScope('write')}
                    />
                    <div>
                      <strong>write</strong>
                      <span style={styles.radioDesc}> — Lectura y escritura. Requiere aprobación.</span>
                    </div>
                  </label>
                </div>
              </div>
              <div style={styles.modalActions}>
                <button type="button" onClick={() => setShowCreate(false)} style={styles.cancelBtn}>
                  Cancelar
                </button>
                <button type="submit" disabled={creating} style={styles.submitBtn}>
                  {creating ? 'Creando...' : newKeyScope === 'write' ? 'Solicitar acceso write' : 'Crear clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Created key display modal */}
      {createdKey && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>Clave creada</h2>
            <div style={styles.warningBox}>
              Esta clave no se puede volver a mostrar. Guárdala en un lugar seguro.
            </div>
            <div style={styles.keyDisplay}>
              <code style={styles.keyCode}>{createdKey}</code>
            </div>
            <div style={styles.modalActions}>
              <button onClick={handleCopy} style={styles.copyBtn}>
                {copied ? 'Copiada ✓' : 'Copiar'}
              </button>
              <button onClick={() => { setCreatedKey(null); setCopied(false); }} style={styles.submitBtn}>
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys table */}
      {loading ? (
        <p style={styles.loadingText}>Cargando claves...</p>
      ) : keys.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyTitle}>Sin claves API</p>
          <p style={styles.emptyDesc}>
            Crea tu primera clave para comenzar a usar la API de Wake.
          </p>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Nombre</th>
              <th style={styles.th}>Alcance</th>
              <th style={styles.th}>Estado</th>
              <th style={styles.th}>Creada</th>
              <th style={styles.th}>Último uso</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.keyId}>
                <td style={styles.td}>
                  <span style={{ color: '#fff', fontWeight: 500 }}>{key.name}</span>
                </td>
                <td style={styles.td}>
                  <code style={styles.code}>{(key.scope || []).join(', ')}</code>
                </td>
                <td style={styles.td}>
                  <span style={{ color: statusColors[key.status] || '#fff', fontSize: 12, fontWeight: 500 }}>
                    {statusLabels[key.status] || key.status}
                  </span>
                </td>
                <td style={styles.td}>{formatDate(key.createdAt)}</td>
                <td style={styles.td}>{formatDate(key.lastUsedAt)}</td>
                <td style={styles.td}>
                  {key.status === 'active' && (
                    <button
                      onClick={() => handleRevoke(key.keyId)}
                      disabled={revokingId === key.keyId}
                      style={styles.revokeBtn}
                    >
                      {revokingId === key.keyId ? '...' : 'Revocar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 700,
    margin: 0,
    letterSpacing: '-0.03em',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 4,
  },
  createBtn: {
    background: '#fff',
    color: '#111',
    border: 'none',
    borderRadius: 8,
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },
  errorBanner: {
    background: 'rgba(229,57,53,0.1)',
    border: '1px solid rgba(229,57,53,0.2)',
    borderRadius: 8,
    padding: '10px 16px',
    color: '#e53935',
    fontSize: 13,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    color: '#e53935',
    fontSize: 18,
    cursor: 'pointer',
    padding: '0 4px',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  emptyTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: 500,
    margin: 0,
  },
  emptyDesc: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginTop: 8,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  td: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    padding: '12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  code: {
    background: 'rgba(255,255,255,0.08)',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
  },
  revokeBtn: {
    background: 'none',
    border: '1px solid rgba(229,57,53,0.3)',
    color: '#e53935',
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#222',
    borderRadius: 12,
    padding: '28px 24px',
    maxWidth: 440,
    width: '100%',
    margin: '0 16px',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 600,
    margin: '0 0 20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: {
    display: 'block',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: 500,
    marginBottom: 6,
  },
  input: {
    background: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  },
  scopeOptions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  radioLabel: {
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
  modalActions: {
    display: 'flex',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 8,
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
  warningBox: {
    background: 'rgba(255,152,0,0.1)',
    border: '1px solid rgba(255,152,0,0.2)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#ff9800',
    fontSize: 13,
    marginBottom: 16,
  },
  keyDisplay: {
    background: '#111',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: '14px 16px',
    marginBottom: 16,
    overflowX: 'auto',
  },
  keyCode: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: '#fff',
    wordBreak: 'break-all',
  },
  copyBtn: {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
  },
};
