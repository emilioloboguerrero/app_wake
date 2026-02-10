import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import oneOnOneService from '../services/oneOnOneService';
import clientProgramService from '../services/clientProgramService';
import programService from '../services/programService';
import './OneOnOneScreen.css';

const OneOnOneScreen = ({ noLayout = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientUserId, setClientUserId] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [oneOnOnePrograms, setOneOnOnePrograms] = useState([]);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isClientDetailModalOpen, setIsClientDetailModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientUserData, setClientUserData] = useState(null);
  const [loadingClientData, setLoadingClientData] = useState(false);
  const [clientPrograms, setClientPrograms] = useState({}); // Map: clientId -> programs[]
  const [isLoadingClientPrograms, setIsLoadingClientPrograms] = useState({});

  useEffect(() => {
    const loadClients = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const creatorClients = await oneOnOneService.getClientsByCreator(user.uid);
        setClients(creatorClients);
      } catch (err) {
        console.error('Error loading clients:', err);
        setError('Error al cargar los clientes');
      } finally {
        setLoading(false);
      }
    };

    loadClients();
  }, [user]);

  // Load one-on-one programs when modal opens (for program selector)
  useEffect(() => {
    const loadPrograms = async () => {
      if (!isModalOpen || !user) return;
      try {
        setIsLoadingPrograms(true);
        const allPrograms = await programService.getProgramsByCreator(user.uid);
        const oneOnOne = allPrograms.filter(
          (p) => (p.deliveryType || 'low_ticket') === 'one_on_one'
        );
        setOneOnOnePrograms(oneOnOne);
        if (oneOnOne.length > 0 && !selectedProgramId) {
          setSelectedProgramId(oneOnOne[0].id);
        }
      } catch (err) {
        console.error('Error loading programs:', err);
        setOneOnOnePrograms([]);
      } finally {
        setIsLoadingPrograms(false);
      }
    };
    loadPrograms();
  }, [isModalOpen, user]);

  // Load programs for a specific client
  const loadClientPrograms = async (clientUserId) => {
    if (isLoadingClientPrograms[clientUserId] || clientPrograms[clientUserId]) {
      return;
    }

    try {
      setIsLoadingClientPrograms(prev => ({ ...prev, [clientUserId]: true }));
      
      // Get all programs for the creator
      const allPrograms = await programService.getProgramsByCreator(user.uid);
      
      // Only consider 1-on-1 programs for client management
      const oneOnOnePrograms = allPrograms.filter(
        (program) => (program.deliveryType || 'low_ticket') === 'one_on_one'
      );

      // Get client programs for each 1-on-1 program
      const programsWithClientStatus = await Promise.all(
        oneOnOnePrograms.map(async (program) => {
          try {
            const clientProgram = await clientProgramService.getClientProgram(program.id, clientUserId);
            return {
              ...program,
              isAssigned: !!clientProgram
            };
          } catch (error) {
            return {
              ...program,
              isAssigned: false
            };
          }
        })
      );
      
      setClientPrograms(prev => ({
        ...prev,
        [clientUserId]: programsWithClientStatus
      }));
    } catch (error) {
      console.error(`Error loading programs for client ${clientUserId}:`, error);
    } finally {
      setIsLoadingClientPrograms(prev => ({ ...prev, [clientUserId]: false }));
    }
  };

  const handleAddClient = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setClientUserId('');
    setSelectedProgramId('');
    setError(null);
  };

  const handleCreateClient = async () => {
    if (!clientUserId.trim() || !user) {
      return;
    }
    if (!selectedProgramId) {
      setError('Selecciona un programa 1-on-1 para asignar al cliente');
      return;
    }

    try {
      setIsCreating(true);
      setError(null);

      await oneOnOneService.addClientToProgram(
        user.uid,
        clientUserId.trim(),
        selectedProgramId
      );

      const creatorClients = await oneOnOneService.getClientsByCreator(user.uid);
      setClients(creatorClients);
      handleCloseModal();
    } catch (err) {
      console.error('Error creating client:', err);
      setError(err.message || 'Error al agregar el cliente');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClientNameClick = async (client) => {
    setSelectedClient(client);
    setIsClientDetailModalOpen(true);
    setLoadingClientData(true);
    setError(null);

    try {
      const userData = await oneOnOneService.getClientUserData(client.clientUserId);
      setClientUserData(userData);
    } catch (err) {
      console.error('Error fetching client data:', err);
      setError('Error al cargar los datos del cliente');
    } finally {
      setLoadingClientData(false);
    }
  };

  const handleCloseClientDetailModal = () => {
    setIsClientDetailModalOpen(false);
    setSelectedClient(null);
    setClientUserData(null);
    setError(null);
  };

  const content = (
    <>
      <div className="one-on-one-content">
        <div className="one-on-one-actions">
          <button 
            className="one-on-one-action-pill"
            onClick={handleAddClient}
          >
            <span className="one-on-one-action-icon">+</span>
          </button>
        </div>
        
        {/* Clients List */}
        {loading ? (
          <div className="one-on-one-loading">
            <p>Cargando clientes...</p>
          </div>
        ) : error ? (
          <div className="one-on-one-error">
            <p>{error}</p>
          </div>
        ) : clients.length === 0 ? (
          <div className="one-on-one-empty">
            <p>No tienes clientes aún. Agrega un cliente para comenzar.</p>
          </div>
        ) : (
          <div className="one-on-one-list">
            {clients.map((client) => (
              <div 
                key={client.id} 
                className="one-on-one-client-box"
                onClick={() => navigate(`/one-on-one/${client.id}`)}
                onMouseEnter={() => loadClientPrograms(client.clientUserId)}
              >
                <div className="one-on-one-client-header">
                  <div className="one-on-one-client-name-wrap">
                    <span className="one-on-one-client-name">
                      {client.clientName || client.clientEmail || `Cliente ${client.clientUserId.slice(0, 8)}`}
                    </span>
                    <button
                      type="button"
                      className="one-on-one-client-info-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClientNameClick(client);
                      }}
                      title="Ver información del cliente"
                      aria-label="Ver información del cliente"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 16V12M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  {clientPrograms[client.clientUserId] && (
                    <div className="one-on-one-client-programs-inline">
                      {clientPrograms[client.clientUserId].filter(p => p.isAssigned).length > 0 ? (
                        <>
                          {clientPrograms[client.clientUserId]
                            .filter(p => p.isAssigned)
                            .slice(0, 3)
                            .map((program) => (
                              <span key={program.id} className="one-on-one-client-program-tag">
                                {program.title || `Programa ${program.id.slice(0, 8)}`}
                              </span>
                            ))}
                          {clientPrograms[client.clientUserId].filter(p => p.isAssigned).length > 3 && (
                            <span className="one-on-one-client-program-tag one-on-one-client-program-tag--more">
                              +{clientPrograms[client.clientUserId].filter(p => p.isAssigned).length - 3}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="one-on-one-client-program-tag one-on-one-client-program-tag--empty">Sin programas</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Agregar Cliente"
        wide
      >
        <div className="add-client-modal">
          {error && (
            <div className="add-client-modal-error">
              <p>{error}</p>
            </div>
          )}

          {/* Step 1: Client ID */}
          <section className="add-client-modal-section">
            <div className="add-client-modal-section-header">
              <span className="add-client-modal-step">1</span>
              <h3 className="add-client-modal-section-title">Datos del cliente</h3>
            </div>
            <div className="add-client-modal-section-content">
              <label className="add-client-modal-label">
                User ID del cliente <span className="add-client-modal-required">*</span>
              </label>
              <Input
                placeholder="Ej: abc123xyz o el ID que te comparta el cliente"
                value={clientUserId}
                onChange={(e) => setClientUserId(e.target.value)}
                type="text"
                light={true}
              />
              <p className="add-client-modal-hint">
                El cliente puede encontrar su User ID en la app (perfil o ajustes). Pídele que te lo comparta.
              </p>
            </div>
          </section>

          {/* Step 2: Program selection */}
          <section className="add-client-modal-section">
            <div className="add-client-modal-section-header">
              <span className="add-client-modal-step">2</span>
              <h3 className="add-client-modal-section-title">Programa a asignar</h3>
              <span className="add-client-modal-subtitle">Selecciona un programa 1-on-1</span>
            </div>
            <div className="add-client-modal-section-content">
              {isLoadingPrograms ? (
                <div className="add-client-modal-loading">Cargando programas...</div>
              ) : (
                <div className="add-client-modal-programs-grid">
                  {/* + Create new program card */}
                  <button
                    type="button"
                    className="add-client-modal-program-card add-client-modal-program-card-new"
                    onClick={() => {
                      handleCloseModal();
                      navigate('/products/new?type=one_on_one');
                    }}
                  >
                    <span className="add-client-modal-program-card-new-icon">+</span>
                    <span className="add-client-modal-program-card-new-label">Crear nuevo programa</span>
                    <span className="add-client-modal-program-card-new-hint">Ir a Productos</span>
                  </button>

                  {/* Existing program cards */}
                  {oneOnOnePrograms.map((program) => (
                    <button
                      key={program.id}
                      type="button"
                      className={`add-client-modal-program-card ${selectedProgramId === program.id ? 'add-client-modal-program-card-selected' : ''}`}
                      onClick={() => setSelectedProgramId(program.id)}
                    >
                      {program.image_url ? (
                        <div className="add-client-modal-program-card-image">
                          <img src={program.image_url} alt={program.title || 'Programa'} />
                        </div>
                      ) : (
                        <div className="add-client-modal-program-card-placeholder">
                          <span>{program.title?.charAt(0) || 'P'}</span>
                        </div>
                      )}
                      <div className="add-client-modal-program-card-info">
                        <span className="add-client-modal-program-card-title">
                          {program.title || `Programa ${program.id.slice(0, 8)}`}
                        </span>
                        {program.discipline && (
                          <span className="add-client-modal-program-card-discipline">{program.discipline}</span>
                        )}
                      </div>
                      {selectedProgramId === program.id && (
                        <div className="add-client-modal-program-card-check">✓</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {!isLoadingPrograms && oneOnOnePrograms.length === 0 && (
                <p className="add-client-modal-empty-hint">
                  No tienes programas 1-on-1. Crea uno con el botón anterior o ve a Productos → 1-on-1.
                </p>
              )}
            </div>
          </section>

          <div className="add-client-modal-actions">
            <Button
              title="Agregar cliente"
              onClick={handleCreateClient}
              disabled={!clientUserId.trim() || !selectedProgramId || isCreating || isLoadingPrograms || oneOnOnePrograms.length === 0}
              loading={isCreating}
            />
          </div>
        </div>
      </Modal>

      {/* Client Detail Modal */}
      <Modal
        isOpen={isClientDetailModalOpen}
        onClose={handleCloseClientDetailModal}
        title={selectedClient?.clientName || 'Detalles del Cliente'}
      >
        <div className="modal-client-detail-content">
          {loadingClientData ? (
            <div className="client-detail-loading">
              <p>Cargando datos...</p>
            </div>
          ) : error ? (
            <div className="modal-error-message">
              <p>{error}</p>
            </div>
          ) : clientUserData ? (
            <div className="client-detail-info">
              <div className="client-detail-row">
                <span className="client-detail-label">Nombre:</span>
                <span className="client-detail-value">{clientUserData.name || 'No disponible'}</span>
              </div>
              <div className="client-detail-row">
                <span className="client-detail-label">Username:</span>
                <span className="client-detail-value">{clientUserData.username || 'No disponible'}</span>
              </div>
              <div className="client-detail-row">
                <span className="client-detail-label">Email:</span>
                <span className="client-detail-value">{clientUserData.email || 'No disponible'}</span>
              </div>
              <div className="client-detail-row">
                <span className="client-detail-label">Edad:</span>
                <span className="client-detail-value">{clientUserData.age ? `${clientUserData.age} años` : 'No disponible'}</span>
              </div>
              <div className="client-detail-row">
                <span className="client-detail-label">Género:</span>
                <span className="client-detail-value">{clientUserData.gender || 'No disponible'}</span>
              </div>
              <div className="client-detail-row">
                <span className="client-detail-label">País:</span>
                <span className="client-detail-value">{clientUserData.country || 'No disponible'}</span>
              </div>
              <div className="client-detail-row">
                <span className="client-detail-label">Ciudad:</span>
                <span className="client-detail-value">{clientUserData.city || 'No disponible'}</span>
              </div>
              <div className="client-detail-row">
                <span className="client-detail-label">Altura:</span>
                <span className="client-detail-value">{clientUserData.height ? `${clientUserData.height} cm` : 'No disponible'}</span>
              </div>
              <div className="client-detail-row">
                <span className="client-detail-label">Peso Inicial:</span>
                <span className="client-detail-value">{clientUserData.initialWeight ? `${clientUserData.initialWeight} kg` : 'No disponible'}</span>
              </div>
            </div>
          ) : (
            <div className="client-detail-empty">
              <p>No se encontraron datos del cliente</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );

  if (noLayout) return content;
  return (
    <DashboardLayout screenName="Clientes">
      {content}
    </DashboardLayout>
  );
};

export default OneOnOneScreen;

