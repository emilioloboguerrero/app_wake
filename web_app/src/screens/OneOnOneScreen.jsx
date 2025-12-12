import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import oneOnOneService from '../services/oneOnOneService';
import './OneOnOneScreen.css';

const OneOnOneScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientUserId, setClientUserId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isClientDetailModalOpen, setIsClientDetailModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientUserData, setClientUserData] = useState(null);
  const [loadingClientData, setLoadingClientData] = useState(false);

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

  const handleAddClient = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setClientUserId('');
    setError(null);
  };

  const handleCreateClient = async () => {
    if (!clientUserId.trim() || !user) {
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      
      const newClient = await oneOnOneService.addClient(user.uid, clientUserId.trim());
      
      // Reload clients
      const creatorClients = await oneOnOneService.getClientsByCreator(user.uid);
      setClients(creatorClients);
      
      // Close modal
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

  return (
    <DashboardLayout screenName="1 on 1">
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
              >
                <span 
                  className="one-on-one-client-name"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClientNameClick(client);
                  }}
                >
                  {client.clientName || client.clientEmail || `Cliente ${client.clientUserId.slice(0, 8)}`}
                </span>
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
      >
        <div className="modal-one-on-one-content">
          {error && (
            <div className="modal-error-message">
              <p>{error}</p>
            </div>
          )}
          <Input
            placeholder="User ID del cliente"
            value={clientUserId}
            onChange={(e) => setClientUserId(e.target.value)}
            type="text"
            light={true}
          />
          <div className="modal-actions">
            <Button
              title="Agregar"
              onClick={handleCreateClient}
              disabled={!clientUserId.trim() || isCreating}
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
    </DashboardLayout>
  );
};

export default OneOnOneScreen;

