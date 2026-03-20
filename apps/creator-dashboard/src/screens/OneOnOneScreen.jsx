import React, { useState, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ScreenSkeleton from '../components/ScreenSkeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import Modal from '../components/Modal';
import Input from '../components/Input';
import FindUserModal from '../components/FindUserModal';
import AssignProgramModal from '../components/AssignProgramModal';
import oneOnOneService from '../services/oneOnOneService';
import clientProgramService from '../services/clientProgramService';
import programService from '../services/programService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import logger from '../utils/logger';
import './OneOnOneScreen.css';

const OneOnOneScreen = ({ noLayout = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading: loading, isError: isClientsError } = useQuery({
    queryKey: queryKeys.clients.byCreator(user?.uid),
    queryFn: () => oneOnOneService.getClientsByCreator(user.uid),
    enabled: !!user?.uid,
    ...cacheConfig.userProfile,
  });

  const [error, setError] = useState(null);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(null);

  const [isFindUserModalOpen, setIsFindUserModalOpen] = useState(false);
  const [isAssignProgramModalOpen, setIsAssignProgramModalOpen] = useState(false);
  const [lookedUpUser, setLookedUpUser] = useState(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [findUserError, setFindUserError] = useState(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState(null);
  const [isClientDetailModalOpen, setIsClientDetailModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loadingClientData, setLoadingClientData] = useState(false);
  const [clientUserData, setClientUserData] = useState(null);
  const clientDetailMountedRef = useRef(false);

  const selectedClientData = useMemo(
    () => (selectedClientId ? clients.find((c) => c.id === selectedClientId || c.clientUserId === selectedClientId) : null),
    [clients, selectedClientId]
  );
  const selectedClientUserId = selectedClientData?.clientUserId ?? null;

  const { data: oneOnOnePrograms = [], isLoading: isLoadingPrograms } = useQuery({
    queryKey: queryKeys.programs.byCreator(user?.uid),
    queryFn: async () => {
      const allPrograms = await programService.getProgramsByCreator(user.uid);
      return allPrograms.filter((p) => (p.deliveryType || 'low_ticket') === 'one_on_one');
    },
    enabled: isAssignProgramModalOpen && !!user?.uid,
    ...cacheConfig.otherPrograms,
  });

  const { data: clientProgramsList = [], isLoading: isLoadingClientPrograms } = useQuery({
    queryKey: queryKeys.clients.programs(selectedClientUserId, user?.uid),
    queryFn: async () => {
      const allPrograms = await programService.getProgramsByCreator(user.uid);
      const oneOnOne = allPrograms.filter((p) => (p.deliveryType || 'low_ticket') === 'one_on_one');
      return Promise.all(
        oneOnOne.map(async (program) => {
          try {
            const clientProgram = await clientProgramService.getClientProgram(program.id, selectedClientUserId);
            return { ...program, isAssigned: !!clientProgram };
          } catch {
            return { ...program, isAssigned: false };
          }
        })
      );
    },
    enabled: !!selectedClientUserId && !!user?.uid,
    ...cacheConfig.programStructure,
  });

  const assignedPrograms = clientProgramsList.filter((p) => p.isAssigned);

  const filteredClients = useMemo(() => {
    const q = (clientSearchQuery || '').trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        (c.clientName || '').toLowerCase().includes(q) ||
        (c.clientEmail || '').toLowerCase().includes(q) ||
        (c.clientUserId || '').toLowerCase().includes(q)
    );
  }, [clients, clientSearchQuery]);

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
      logger.error('Error looking up user:', err);
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.clients.byCreator(user.uid) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.clients.programs(clientUserId, user.uid) });
      setSelectedClientId(clientUserId);
      handleCloseAssignProgramModal();
    } catch (err) {
      logger.error('Error adding client:', err);
      setAssignError(err.message || 'Error al agregar el cliente');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleViewClient = (clientId) => {
    handleCloseFindUserModal();
    navigate(`/one-on-one/${clientId}`, { state: { returnTo: '/products?tab=clientes' } });
  };

  const handleCreateProgram = () => {
    handleCloseAssignProgramModal();
    navigate('/products/new?type=one_on_one');
  };

  const handleOpenClientProgram = (clientId) => {
    navigate(`/one-on-one/${clientId}`, { state: { returnTo: '/products?tab=clientes' } });
  };

  const handleClientInfoClick = async (client) => {
    setSelectedClient(client);
    setIsClientDetailModalOpen(true);
    setLoadingClientData(true);
    setError(null);
    clientDetailMountedRef.current = true;
    try {
      const userData = await oneOnOneService.getClientUserData(client.clientUserId);
      if (!clientDetailMountedRef.current) return;
      setClientUserData(userData);
    } catch (err) {
      logger.error('Error fetching client data:', err);
      if (!clientDetailMountedRef.current) return;
      setError('Error al cargar los datos del cliente');
    } finally {
      if (clientDetailMountedRef.current) setLoadingClientData(false);
    }
  };

  const handleCloseClientDetailModal = () => {
    clientDetailMountedRef.current = false;
    setIsClientDetailModalOpen(false);
    setSelectedClient(null);
    setClientUserData(null);
    setError(null);
  };

  const content = (
    <>
      <div className="one-on-one-layout">
        <aside className="one-on-one-sidebar">
          <div className="one-on-one-sidebar-header">
            <h2 className="one-on-one-sidebar-title">Clientes</h2>
            <button
              type="button"
              className="one-on-one-sidebar-add-btn"
              onClick={handleAddClient}
              title="Añadir cliente"
            >
              <span className="one-on-one-sidebar-add-icon">+</span>
              <span className="one-on-one-sidebar-add-text">Añadir</span>
            </button>
          </div>
          <div className="one-on-one-sidebar-search">
            <Input
              placeholder="Buscar por nombre o email…"
              value={clientSearchQuery}
              onChange={(e) => setClientSearchQuery(e.target.value)}
              type="text"
              light
            />
          </div>
          <div className="one-on-one-sidebar-content">
            {loading ? (
              <ScreenSkeleton />
            ) : isClientsError ? (
              <div className="one-on-one-sidebar-empty">
                <p>Error al cargar los clientes. Recarga la página.</p>
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="one-on-one-sidebar-empty">
                <p>
                  {clientSearchQuery.trim()
                    ? 'No hay coincidencias'
                    : 'No tienes clientes. Añade uno para empezar.'}
                </p>
              </div>
            ) : (
              <ul className="one-on-one-client-list">
                {filteredClients.map((client) => {
                  const isSelected = selectedClientId === client.id || selectedClientId === client.clientUserId;
                  return (
                    <li key={client.id}>
                      <button
                        type="button"
                        className={`one-on-one-client-item ${isSelected ? 'one-on-one-client-item-selected' : ''}`}
                        onClick={() => {
                          setSelectedClientId(isSelected ? null : (client.id || client.clientUserId));
                        }}
                      >
                        <div className="one-on-one-client-item-avatar">
                          {(client.clientName || client.clientEmail || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="one-on-one-client-item-body">
                          <span className="one-on-one-client-item-name">
                            {client.clientName || client.clientEmail || `Cliente ${(client.clientUserId || '').slice(0, 8)}`}
                          </span>
                          <span className="one-on-one-client-item-meta">
                            {isSelected && isLoadingClientPrograms
                              ? '…'
                              : isSelected && assignedPrograms.length === 0
                                ? 'Sin programas'
                                : isSelected
                                  ? `${assignedPrograms.length} programa${assignedPrograms.length !== 1 ? 's' : ''}`
                                  : ''}
                          </span>
                        </div>
                        <span className="one-on-one-client-status-pill">Activo</span>
                        <svg className="one-on-one-client-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <main className="one-on-one-main">
          {!selectedClientData ? (
            <div className="one-on-one-main-empty">
              <div className="one-on-one-main-empty-inner">
                <h3 className="one-on-one-main-empty-title">Clientes uno a uno</h3>
                <p className="one-on-one-main-empty-desc">
                  Gestiona los clientes de tus programas personales. Selecciona un cliente en la lista o añade uno nuevo.
                </p>
                <button type="button" className="one-on-one-main-empty-btn" onClick={handleAddClient}>
                  <span className="one-on-one-main-empty-btn-icon">+</span>
                  Añadir cliente
                </button>
              </div>
            </div>
          ) : (
            <div className="one-on-one-main-detail">
              <div className="one-on-one-main-header">
                <div className="one-on-one-main-header-text">
                  <h3 className="one-on-one-main-client-name">
                    {selectedClientData.clientName || selectedClientData.clientEmail || `Cliente ${(selectedClientData.clientUserId || '').slice(0, 8)}`}
                  </h3>
                  <p className="one-on-one-main-client-meta">
                    {assignedPrograms.length === 0
                      ? 'Sin programas asignados'
                      : `${assignedPrograms.length} programa${assignedPrograms.length !== 1 ? 's' : ''} asignado${assignedPrograms.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <div className="one-on-one-main-header-actions">
                  <button
                    type="button"
                    className="one-on-one-main-btn one-on-one-main-btn-primary"
                    onClick={() => handleOpenClientProgram(selectedClientData.id || selectedClientData.clientUserId)}
                  >
                    Abrir planificación
                  </button>
                  <button
                    type="button"
                    className="one-on-one-main-btn one-on-one-main-btn-secondary"
                    onClick={() => handleClientInfoClick(selectedClientData)}
                    title="Ver información del cliente"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 16V12M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Info</span>
                  </button>
                </div>
              </div>
              <section className="one-on-one-main-programs">
                <h4 className="one-on-one-main-programs-title">Programas asignados</h4>
                {isLoadingClientPrograms ? (
                  <ScreenSkeleton />
                ) : assignedPrograms.length === 0 ? (
                  <div className="one-on-one-main-programs-empty">
                    <p>Este cliente no tiene programas asignados. Asigna uno desde la planificación del cliente.</p>
                    <button
                      type="button"
                      className="one-on-one-main-btn one-on-one-main-btn-primary"
                      onClick={() => handleOpenClientProgram(selectedClientData.id || selectedClientData.clientUserId)}
                    >
                      Abrir planificación
                    </button>
                  </div>
                ) : (
                  <ul className="one-on-one-main-programs-list">
                    {assignedPrograms.map((program) => (
                      <li key={program.id} className="one-on-one-main-program-card">
                        <div className="one-on-one-main-program-info">
                          <span className="one-on-one-main-program-name">
                            {program.title || `Programa ${(program.id || '').slice(0, 8)}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="one-on-one-main-program-open"
                          onClick={() => handleOpenClientProgram(selectedClientData.id || selectedClientData.clientUserId)}
                        >
                          Abrir
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </main>
      </div>

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

      <Modal
        isOpen={isClientDetailModalOpen}
        onClose={handleCloseClientDetailModal}
        title={selectedClient?.clientName || 'Detalles del Cliente'}
      >
        <div className="modal-client-detail-content">
          {loadingClientData ? (
            <ScreenSkeleton />
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
    <ErrorBoundary>
    <DashboardLayout screenName="Clientes">
      {content}
    </DashboardLayout>
    </ErrorBoundary>
  );
};

export default OneOnOneScreen;
