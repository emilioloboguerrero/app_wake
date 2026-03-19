import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import apiClient from '../utils/apiClient';
import './ApiKeysScreen.css';

const AVAILABLE_SCOPES = ['read', 'write'];

const ApiKeysScreen = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [revealModalOpen, setRevealModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState(['read']);
  const [createdKey, setCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revokeConfirmId, setRevokeConfirmId] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['api-keys', user?.uid],
    queryFn: () => apiClient.get('/api-keys'),
    enabled: !!user?.uid,
  });

  const keys = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/api-keys', { name: newKeyName.trim(), scopes: newKeyScopes }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', user?.uid] });
      setCreateModalOpen(false);
      setCreatedKey(res);
      setRevealModalOpen(true);
      setNewKeyName('');
      setNewKeyScopes(['read']);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId) => apiClient.delete(`/api-keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', user?.uid] });
      setRevokeConfirmId(null);
    },
  });

  const handleCopy = () => {
    if (!createdKey?.key) return;
    navigator.clipboard.writeText(createdKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const toggleScope = (scope) => {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleCloseCreate = () => {
    setCreateModalOpen(false);
    setNewKeyName('');
    setNewKeyScopes(['read']);
  };

  return (
    <DashboardLayout screenName="API Keys">
      <div className="api-keys-screen">

        {/* Header */}
        <div className="api-keys-header">
          <div>
            <h1 className="api-keys-title">API Keys</h1>
            <p className="api-keys-subtitle">Permite que herramientas externas accedan a tu cuenta de forma segura.</p>
          </div>
          <button className="api-keys-new-btn" onClick={() => setCreateModalOpen(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            Nueva API key
          </button>
        </div>

        {/* Info banner */}
        <div className="api-keys-banner">
          <span className="api-keys-banner-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <p className="api-keys-banner-text">
            Las claves solo se muestran una vez al crearlas. Guárdalas en un lugar seguro — no podremos recuperarlas.
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="api-keys-skeleton-row"
                style={{ animationDelay: `${i * 80}ms`, opacity: 1 - i * 0.15 }}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="api-keys-error">
            No se pudieron cargar las claves. Verifica tu conexión e intenta de nuevo.
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && keys.length === 0 && (
          <div className="api-keys-empty">
            <span className="api-keys-empty-icon" aria-hidden>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <p className="api-keys-empty-title">No tienes API keys</p>
            <p className="api-keys-empty-desc">Crea una para conectar herramientas externas a tu cuenta.</p>
            <button className="api-keys-empty-cta" onClick={() => setCreateModalOpen(true)}>
              Crear primera clave
            </button>
          </div>
        )}

        {/* Key list */}
        {!isLoading && !error && keys.length > 0 && (
          <div className="api-keys-list">
            {keys.map((k, i) => (
              <div
                key={k.keyId}
                className="api-key-row api-keys-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="api-key-info">
                  <span className="api-key-name">{k.name}</span>
                  <span className="api-key-prefix">{k.keyPrefix}…</span>
                  <div className="api-key-meta">
                    <div className="api-key-scopes">
                      {(k.scopes || []).map((s) => (
                        <span key={s} className="api-key-scope-pill">{s}</span>
                      ))}
                    </div>
                    <span className="api-key-date">Creada {formatDate(k.createdAt)}</span>
                    {k.lastUsedAt && (
                      <span className="api-key-date">Último uso {formatDate(k.lastUsedAt)}</span>
                    )}
                  </div>
                </div>
                <button
                  className="api-key-revoke-btn"
                  onClick={() => setRevokeConfirmId(k.keyId)}
                  aria-label={`Revocar clave ${k.name}`}
                >
                  Revocar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={handleCloseCreate}
        title="Nueva API Key"
      >
        <div className="api-keys-modal-form">
          <div className="api-keys-field">
            <label className="api-keys-label">Nombre</label>
            <input
              className="api-keys-input"
              placeholder="Ej. Integración Garmin"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              maxLength={60}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newKeyName.trim() && newKeyScopes.length > 0 && !createMutation.isPending) {
                  createMutation.mutate();
                }
              }}
            />
          </div>

          <div className="api-keys-field">
            <label className="api-keys-label">Permisos</label>
            <div className="api-keys-scopes">
              {AVAILABLE_SCOPES.map((scope) => (
                <button
                  key={scope}
                  className={`api-keys-scope-btn ${newKeyScopes.includes(scope) ? 'active' : ''}`}
                  onClick={() => toggleScope(scope)}
                  type="button"
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>

          {createMutation.error && (
            <p className="api-keys-error-inline">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Error al crear la clave. Intenta de nuevo.
            </p>
          )}

          <div className="api-keys-modal-actions">
            <button className="api-keys-cancel-btn" type="button" onClick={handleCloseCreate}>
              Cancelar
            </button>
            <button
              className="api-keys-submit-btn"
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!newKeyName.trim() || newKeyScopes.length === 0 || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creando…' : 'Crear clave'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reveal modal — shown once after creation */}
      <Modal
        isOpen={revealModalOpen}
        onClose={() => { setRevealModalOpen(false); setCreatedKey(null); setCopied(false); }}
        title="Copia tu clave ahora"
      >
        {createdKey && (
          <div className="api-keys-reveal">
            <p className="api-keys-reveal-warning">
              <span className="api-keys-reveal-warning-icon" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
              Esta es la única vez que verás esta clave completa. No podremos volvértela a mostrar.
            </p>
            <div className="api-keys-reveal-key">
              <code>{createdKey.key}</code>
            </div>
            <button
              className={`api-keys-copy-btn ${copied ? 'api-keys-copy-btn--copied' : ''}`}
              onClick={handleCopy}
              type="button"
            >
              {copied ? '¡Copiado!' : 'Copiar clave'}
            </button>
          </div>
        )}
      </Modal>

      {/* Revoke confirm modal */}
      <Modal
        isOpen={!!revokeConfirmId}
        onClose={() => setRevokeConfirmId(null)}
        title="Revocar clave"
      >
        <div className="api-keys-modal-form">
          <p className="api-keys-revoke-warning">
            Esta acción es permanente. La clave dejará de funcionar de inmediato y no puede recuperarse.
          </p>
          {revokeMutation.error && (
            <p className="api-keys-error-inline">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Error al revocar. Intenta de nuevo.
            </p>
          )}
          <div className="api-keys-modal-actions">
            <button className="api-keys-cancel-btn" type="button" onClick={() => setRevokeConfirmId(null)}>
              Cancelar
            </button>
            <button
              className="api-keys-submit-btn api-keys-submit-btn--danger"
              type="button"
              onClick={() => revokeMutation.mutate(revokeConfirmId)}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? 'Revocando…' : 'Revocar'}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default ApiKeysScreen;
