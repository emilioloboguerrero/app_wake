import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import { cacheConfig } from '../config/queryClient';
import apiClient from '../utils/apiClient';
import './AssignProgramModal.css';

const AssignProgramModal = ({
  isOpen,
  onClose,
  onAssign,
  clientUser,
  creatorId,
  isAssigning = false,
  error = null,
}) => {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState('');

  const { data: programsData, isLoading: isLoadingPrograms } = useQuery({
    queryKey: ['programs', 'one_on_one', creatorId],
    queryFn: () => apiClient.get('/creator/programs'),
    enabled: isOpen && !!creatorId,
    ...cacheConfig.programStructure,
    select: (res) => (res?.data ?? []).filter((p) => p.deliveryType === 'one_on_one'),
  });

  const programs = programsData ?? [];

  useEffect(() => {
    if (!isOpen) setSelectedId('');
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && programs.length > 0 && !selectedId) {
      setSelectedId(programs[0].id);
    }
  }, [isOpen, programs, selectedId]);

  const handleClose = () => { setSelectedId(''); onClose(); };

  const handleAssign = () => {
    if (selectedId && clientUser?.userId) onAssign(clientUser.userId, selectedId);
  };

  if (!isOpen) return null;

  const name = clientUser?.displayName || clientUser?.username || 'Cliente';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Asignar programa">
      <div className="apm">
        {/* Client summary */}
        <div className="apm__client">
          <div className="apm__client-avatar">
            {clientUser?.photoURL ? (
              <img src={clientUser.photoURL} alt="" className="apm__client-avatar-img" />
            ) : (
              <span className="apm__client-avatar-initial">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="apm__client-info">
            <p className="apm__client-name">{name}</p>
            {clientUser?.email && <p className="apm__client-email">{clientUser.email}</p>}
          </div>
        </div>

        {/* Program selector */}
        <div className="apm__section">
          <p className="apm__section-label">Elige un programa</p>
          {isLoadingPrograms ? (
            <div className="apm__loading">
              <span className="fum__spinner" />
              <span>Cargando programas…</span>
            </div>
          ) : programs.length === 0 ? (
            <div className="apm__empty">
              <p>No tienes programas de asesorías.</p>
              <button
                type="button"
                className="fum__btn fum__btn--primary"
                onClick={() => { handleClose(); navigate('/products/new?type=one_on_one'); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Crear programa
              </button>
            </div>
          ) : (
            <div className="apm__list">
              <button
                type="button"
                className="apm__create-btn"
                onClick={() => { handleClose(); navigate('/products/new?type=one_on_one'); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Crear nuevo programa
              </button>
              {programs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`apm__program ${selectedId === p.id ? 'apm__program--selected' : ''}`}
                  onClick={() => setSelectedId(p.id)}
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="apm__program-thumb" />
                  ) : (
                    <span className="apm__program-placeholder">
                      {(p.title || 'P').charAt(0)}
                    </span>
                  )}
                  <span className="apm__program-info">
                    <span className="apm__program-title">{p.title || 'Sin título'}</span>
                    {p.discipline && <span className="apm__program-sub">{p.discipline}</span>}
                  </span>
                  {selectedId === p.id && (
                    <span className="apm__check">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="fum__error">{error}</p>}

        <div className="fum__actions">
          <button type="button" className="fum__btn fum__btn--ghost" onClick={handleClose} disabled={isAssigning}>
            Cancelar
          </button>
          <button
            type="button"
            className="fum__btn fum__btn--primary"
            onClick={handleAssign}
            disabled={!selectedId || programs.length === 0 || isAssigning}
          >
            {isAssigning ? (
              <><span className="fum__spinner" /> Asignando…</>
            ) : (
              'Asignar'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AssignProgramModal;
