import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import { useToast } from '../contexts/ToastContext';
import apiClient from '../utils/apiClient';
import './ApiKeysScreen.css';

const ApiKeysScreen = () => {
  const { showToast } = useToast();
  const [requested, setRequested] = useState(false);

  const requestMutation = useMutation({
    mutationFn: () => apiClient.post('/creator/request-api-access'),
    onSuccess: () => {
      setRequested(true);
      showToast('Solicitud enviada correctamente', 'success');
    },
    onError: () => {
      showToast('No se pudo enviar la solicitud. Intenta de nuevo.', 'error');
    },
  });

  return (
    <DashboardLayout screenName="API Keys">
      <div className="apikeys-screen">
        <div className="apikeys-content">

          {/* Fake content visible behind the blur */}
          <div className="apikeys-header" aria-hidden>
            <div className="apikeys-header__text">
              <p className="apikeys-section-label">Desarrolladores</p>
              <p className="apikeys-header__sub">
                Usa estas claves para conectar herramientas externas a tu cuenta Wake de forma segura.
              </p>
            </div>
            <div className="apikeys-btn-create apikeys-btn-create--fake">Crear clave</div>
          </div>

          <div className="apikeys-card apikeys-card--empty" aria-hidden>
            <div className="apikeys-empty">
              <div className="apikeys-empty__icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="apikeys-empty__title">Sin claves de API</p>
              <p className="apikeys-empty__sub">
                Aun no tienes claves de API. Crea una para conectar herramientas externas.
              </p>
            </div>
          </div>

          <div className="apikeys-card" aria-hidden>
            <ul className="apikeys-list">
              {['Zapier', 'Make.com', 'Webhook'].map((name, i) => (
                <li key={i} className="apikeys-row">
                  <div className="apikeys-row__info">
                    <span className="apikeys-row__name">{name}</span>
                    <span className="apikeys-row__id">wk_live_xxxx...xxxx</span>
                    <div className="apikeys-row__meta">
                      <span>Creada ene 2026</span>
                      <span className="apikeys-row__dot" aria-hidden>·</span>
                      <span>Ultimo uso: mar 2026</span>
                    </div>
                  </div>
                  <div className="apikeys-btn-revoke" style={{ opacity: 1 }}>Revocar</div>
                </li>
              ))}
            </ul>
          </div>

          {/* Gate overlay */}
          <div className="apikeys-gate">
            <div className="apikeys-gate__blur" />
            <div className="apikeys-gate__overlay">
              <div className="apikeys-gate__card">
                <div className="apikeys-gate__icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="12" cy="16.5" r="1.5" fill="currentColor"/>
                  </svg>
                </div>
                <h2 className="apikeys-gate__title">Integraciones API</h2>
                <p className="apikeys-gate__desc">
                  Las integraciones de API te permiten conectar herramientas externas a tu cuenta Wake. Solicita acceso y te contactaremos pronto.
                </p>
                {requested ? (
                  <div className="apikeys-gate__sent">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Solicitud enviada</span>
                  </div>
                ) : (
                  <button
                    className="apikeys-gate__btn"
                    onClick={() => requestMutation.mutate()}
                    disabled={requestMutation.isPending}
                  >
                    {requestMutation.isPending ? 'Enviando...' : 'Solicitar acceso'}
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default ApiKeysScreen;
