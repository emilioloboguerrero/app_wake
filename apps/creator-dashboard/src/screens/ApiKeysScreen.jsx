import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import { GlowingEffect, ShimmerSkeleton } from '../components/ui';
import apiClient from '../utils/apiClient';
import './ApiKeysScreen.css';

const formatDate = (iso) => {
  if (!iso) return 'Nunca';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
};

const truncateKeyId = (id) => {
  if (!id) return '—';
  return id.length > 16 ? `${id.slice(0, 16)}...` : id;
};

const ApiKeysScreen = () => {
  const queryClient = useQueryClient();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [revealModalOpen, setRevealModalOpen] = useState(false);
  const [revokeConfirmKey, setRevokeConfirmKey] = useState(null);
  const [keyName, setKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const nameInputRef = useRef(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['creator', 'api-keys'],
    queryFn: () => apiClient.get('/api-keys').then((r) => r.data ?? r),
  });

  const keys = Array.isArray(data) ? data : (data?.keys ?? []);

  const createMutation = useMutation({
    mutationFn: (name) => apiClient.post('/api-keys', { name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['creator', 'api-keys'] });
      setCreateModalOpen(false);
      setKeyName('');
      setCreatedKey(res.data ?? res);
      setRevealModalOpen(true);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId) => apiClient.delete(`/api-keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator', 'api-keys'] });
      setRevokeConfirmKey(null);
    },
  });

  const handleOpenCreate = () => {
    setKeyName('');
    createMutation.reset();
    setCreateModalOpen(true);
  };

  const handleCloseCreate = () => {
    setCreateModalOpen(false);
    setKeyName('');
    createMutation.reset();
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!keyName.trim() || createMutation.isPending) return;
    createMutation.mutate(keyName.trim());
  };

  const handleCopy = () => {
    const raw = createdKey?.key ?? createdKey?.rawKey ?? '';
    if (!raw) return;
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const handleCloseReveal = () => {
    setRevealModalOpen(false);
    setCreatedKey(null);
    setCopied(false);
  };

  const handleOpenRevoke = (key) => {
    revokeMutation.reset();
    setRevokeConfirmKey(key);
  };

  const handleCloseRevoke = () => {
    setRevokeConfirmKey(null);
    revokeMutation.reset();
  };

  useEffect(() => {
    if (createModalOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [createModalOpen]);

  const renderList = () => {
    if (isLoading) {
      return (
        <div className="apikeys-card apikeys-card--loading">
          <GlowingEffect />
          <div className="apikeys-skeleton-list">
            {[0, 1, 2].map((i) => (
              <div key={i} className="apikeys-skeleton-row">
                <div className="apikeys-skeleton-left">
                  <ShimmerSkeleton height="13px" width="140px" />
                  <ShimmerSkeleton height="11px" width="100px" />
                </div>
                <ShimmerSkeleton height="32px" width="68px" borderRadius="8px" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (isError) {
      return (
        <div className="apikeys-card">
          <GlowingEffect />
          <p className="apikeys-error-msg">
            No se pudieron cargar las claves. Verifica tu conexión e intenta de nuevo.
          </p>
        </div>
      );
    }

    if (keys.length === 0) {
      return (
        <div className="apikeys-card apikeys-card--empty">
          <GlowingEffect />
          <div className="apikeys-empty">
            <div className="apikeys-empty__icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="apikeys-empty__title">Sin claves de API</p>
            <p className="apikeys-empty__sub">
              Aún no tienes claves de API. Crea una para conectar herramientas externas.
            </p>
            <button className="apikeys-btn-create" onClick={handleOpenCreate}>
              Crear clave
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="apikeys-card">
        <GlowingEffect />
        <ul className="apikeys-list">
          {keys.map((k, idx) => {
            const keyId = k.id ?? k.keyId;
            return (
              <li
                key={keyId ?? idx}
                className="apikeys-row"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="apikeys-row__info">
                  <span className="apikeys-row__name">{k.name || 'Sin nombre'}</span>
                  <span className="apikeys-row__id">{truncateKeyId(keyId)}</span>
                  <div className="apikeys-row__meta">
                    <span>Creada {formatDate(k.createdAt)}</span>
                    <span className="apikeys-row__dot" aria-hidden>·</span>
                    <span>Último uso: {formatDate(k.lastUsedAt)}</span>
                  </div>
                </div>
                <button
                  className="apikeys-btn-revoke"
                  onClick={() => handleOpenRevoke(k)}
                  disabled={revokeMutation.isPending && revokeConfirmKey?.id === keyId}
                  aria-label={`Revocar clave ${k.name || 'Sin nombre'}`}
                >
                  Revocar
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <DashboardLayout screenName="API Keys">
      <div className="apikeys-screen">
        <div className="apikeys-content">

          <div className="apikeys-header">
            <div className="apikeys-header__text">
              <p className="apikeys-section-label">Desarrolladores</p>
              <p className="apikeys-header__sub">
                Usa estas claves para conectar herramientas externas a tu cuenta Wake de forma segura.
              </p>
            </div>
            <button className="apikeys-btn-create" onClick={handleOpenCreate}>
              Crear clave
            </button>
          </div>

          {renderList()}

        </div>
      </div>

      {/* ── Create modal ─────────────────────────────────────────── */}
      <Modal isOpen={createModalOpen} onClose={handleCloseCreate} title="Nueva clave de API">
        <form onSubmit={handleCreateSubmit} className="apikeys-modal-form">
          <div className="apikeys-modal-field">
            <label className="apikeys-modal-label">Nombre</label>
            <input
              ref={nameInputRef}
              className="apikeys-modal-input"
              placeholder="Ej. Integración Zapier"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              disabled={createMutation.isPending}
              maxLength={80}
            />
          </div>
          {createMutation.isError && (
            <p className="apikeys-error-inline">
              {createMutation.error?.message || 'No se pudo crear la clave. Intenta de nuevo.'}
            </p>
          )}
          <div className="apikeys-modal-actions">
            <button
              type="button"
              className="apikeys-btn-ghost"
              onClick={handleCloseCreate}
              disabled={createMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="apikeys-btn-primary"
              disabled={!keyName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creando…' : 'Crear clave'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Reveal modal — shown once after creation ──────────────── */}
      <Modal isOpen={revealModalOpen} onClose={handleCloseReveal} title="Copia tu clave ahora">
        {createdKey && (
          <div className="apikeys-reveal">
            <div className="apikeys-reveal-warning">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>Esta clave solo se muestra una vez. Cópiala ahora antes de cerrar.</span>
            </div>
            <div className="apikeys-reveal-box">
              <code className="apikeys-reveal-code">
                {createdKey?.key ?? createdKey?.rawKey ?? '—'}
              </code>
            </div>
            <button
              className={`apikeys-btn-copy ${copied ? 'apikeys-btn-copy--done' : ''}`}
              onClick={handleCopy}
              type="button"
            >
              {copied ? 'Copiada ✓' : 'Copiar clave'}
            </button>
          </div>
        )}
      </Modal>

      {/* ── Revoke confirmation modal ─────────────────────────────── */}
      <Modal
        isOpen={!!revokeConfirmKey}
        onClose={handleCloseRevoke}
        title="¿Revocar esta clave?"
      >
        <div className="apikeys-modal-form">
          <p className="apikeys-revoke-desc">
            Las integraciones que la usen dejarán de funcionar. Esta acción no se puede deshacer.
          </p>
          {revokeConfirmKey?.name && (
            <p className="apikeys-revoke-keyname">{revokeConfirmKey.name}</p>
          )}
          {revokeMutation.isError && (
            <p className="apikeys-error-inline">
              {revokeMutation.error?.message || 'No se pudo revocar. Intenta de nuevo.'}
            </p>
          )}
          <div className="apikeys-modal-actions">
            <button
              type="button"
              className="apikeys-btn-ghost"
              onClick={handleCloseRevoke}
              disabled={revokeMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="apikeys-btn-danger"
              onClick={() => revokeMutation.mutate(revokeConfirmKey?.id ?? revokeConfirmKey?.keyId)}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? 'Revocando…' : 'Sí, revocar'}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default ApiKeysScreen;
