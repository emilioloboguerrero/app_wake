import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import FindUserModal from '../components/FindUserModal';
import AssignProgramModal from '../components/AssignProgramModal';
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
  const [isFindUserModalOpen, setIsFindUserModalOpen] = useState(false);
  const [isAssignProgramModalOpen, setIsAssignProgramModalOpen] = useState(false);
  const [lookedUpUser, setLookedUpUser] = useState(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [findUserError, setFindUserError] = useState(null);
  const [oneOnOnePrograms, setOneOnOnePrograms] = useState([]);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState(null);
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

  // Load one-on-one programs when AssignProgramModal opens
  useEffect(() => {
    const loadPrograms = async () => {
      if (!isAssignProgramModalOpen || !user) return;
      try {
        setIsLoadingPrograms(true);
        const allPrograms = await programService.getProgramsByCreator(user.uid);
        const oneOnOne = allPrograms.filter(
          (p) => (p.deliveryType || 'low_ticket') === 'one_on_one'
        );
        setOneOnOnePrograms(oneOnOne);
      } catch (err) {
        console.error('Error loading programs:', err);
        setOneOnOnePrograms([]);
      } finally {
        setIsLoadingPrograms(false);
      }
    };
    loadPrograms();
  }, [isAssignProgramModalOpen, user]);

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
    setIsFindUserModalOpen(true);
    setFindUserError(null);
  };

  const handleCloseFindUserModal = () => {
    setIsFindUserModalOpen(false);
    setFindUserError(null);
  };

  const handleLookupUser = async (emailOrUsername) => {
    if (!emailOrUsername?.trim() || !user) return null;
    try {
      setIsLookingUp(true);
      setFindUserError(null);
      const found = await oneOnOneService.lookupUserByEmailOrUsername(emailOrUsername.trim());
      return found;
    } catch (err) {
      console.error('Error looking up user:', err);
      setFindUserError(err.message || 'No se encontró ningún usuario');
      return null;
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleUserFound = (userInfo) => {
    setLookedUpUser(userInfo);
    setIsFindUserModalOpen(false);
    setIsAssignProgramModalOpen(true);
    setAssignError(null);
  };

  const handleCloseAssignProgramModal = () => {
    setIsAssignProgramModalOpen(false);
    setLookedUpUser(null);
    setAssignError(null);
  };

  const handleAssign = async (clientUserId, programId) => {
    if (!clientUserId || !programId || !user) return;
    try {
      setIsAssigning(true);
      setAssignError(null);

      await oneOnOneService.addClientToProgram(user.uid, clientUserId, programId);

      const creatorClients = await oneOnOneService.getClientsByCreator(user.uid);
      setClients(creatorClients);
      handleCloseAssignProgramModal();
    } catch (err) {
      console.error('Error adding client:', err);
      setAssignError(err.message || 'Error al agregar el cliente');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleViewClient = (clientId) => {
    handleCloseFindUserModal();
    navigate(`/one-on-one/${clientId}`, {
      state: { returnTo: '/products?tab=clientes' },
    });
  };

  const handleCreateProgram = () => {
    handleCloseAssignProgramModal();
    navigate('/products/new?type=one_on_one');
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
                onClick={() => navigate(`/one-on-one/${client.id}`, { state: { returnTo: '/products?tab=clientes' } })}
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

      {/* Find User Modal (step 1) */}
      <FindUserModal
        isOpen={isFindUserModalOpen}
        onClose={handleCloseFindUserModal}
        onUserFound={handleUserFound}
        onLookup={handleLookupUser}
        onViewClient={handleViewClient}
        clients={clients}
        isLookingUp={isLookingUp}
        error={findUserError}
      />

      {/* Assign Program Modal (step 2) */}
      <AssignProgramModal
        isOpen={isAssignProgramModalOpen}
        onClose={handleCloseAssignProgramModal}
        user={lookedUpUser}
        onAssign={handleAssign}
        programs={oneOnOnePrograms}
        isLoadingPrograms={isLoadingPrograms}
        isAssigning={isAssigning}
        error={assignError}
        onCreateProgram={handleCreateProgram}
      />

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

