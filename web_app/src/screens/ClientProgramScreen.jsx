import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import CalendarView from '../components/CalendarView';
import PlanningModal from '../components/PlanningModal';
import SessionAssignmentModal from '../components/SessionAssignmentModal';
import SessionCreationModal from '../components/SessionCreationModal';
import oneOnOneService from '../services/oneOnOneService';
import './ClientProgramScreen.css';

const TAB_CONFIG = [
  { key: 'lab', title: 'Lab' },
  { key: 'planificacion', title: 'Planificación' },
  { key: 'nutricion', title: 'Nutrición' },
  { key: 'info', title: 'Info' },
];

const ClientProgramScreen = () => {
  const { clientId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPlanningModalOpen, setIsPlanningModalOpen] = useState(false);
  const [isSessionAssignmentModalOpen, setIsSessionAssignmentModalOpen] = useState(false);
  const [isSessionCreationModalOpen, setIsSessionCreationModalOpen] = useState(false);
  const [selectedPlanningDate, setSelectedPlanningDate] = useState(null);

  useEffect(() => {
    const loadClient = async () => {
      if (!clientId || !user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const clientData = await oneOnOneService.getClientById(clientId);
        if (!clientData) {
          setError('Cliente no encontrado');
          return;
        }

        // Verify the client belongs to the current creator
        if (clientData.creatorId !== user.uid) {
          setError('No tienes permiso para ver este cliente');
          return;
        }

        setClient(clientData);
      } catch (err) {
        console.error('Error loading client:', err);
        setError('Error al cargar el cliente');
      } finally {
        setLoading(false);
      }
    };

    loadClient();
  }, [clientId, user]);

  const handleTabClick = (index) => {
    setCurrentTabIndex(index);
  };

  const renderTabContent = () => {
    const currentTab = TAB_CONFIG[currentTabIndex];
    
    switch (currentTab.key) {
      case 'lab':
        return (
          <div className="client-program-tab-content">
            <p>Lab content coming soon...</p>
          </div>
        );
      case 'planificacion':
        return (
          <div className="client-program-tab-content">
            <CalendarView 
              onDateSelect={(date) => {
                setSelectedPlanningDate(date);
                setIsPlanningModalOpen(true);
              }}
            />
            <PlanningModal
              isOpen={isPlanningModalOpen}
              onClose={() => {
                setIsPlanningModalOpen(false);
                setSelectedPlanningDate(null);
              }}
              selectedDate={selectedPlanningDate}
              onWorkoutClick={(date) => {
                console.log('Workout clicked, opening SessionAssignmentModal');
                setIsPlanningModalOpen(false);
                setIsSessionAssignmentModalOpen(true);
              }}
            />
            <SessionAssignmentModal
              isOpen={isSessionAssignmentModalOpen}
              onClose={() => {
                console.log('SessionAssignmentModal: onClose called');
                setIsSessionAssignmentModalOpen(false);
                setSelectedPlanningDate(null);
              }}
              selectedDate={selectedPlanningDate}
              onSessionCreated={(date) => {
                setIsSessionAssignmentModalOpen(false);
                setIsSessionCreationModalOpen(true);
              }}
              onSessionAdded={(sessionId) => {
                console.log('Session added from library:', sessionId);
                // TODO: Implement session addition from library
              }}
              onSaveToLibrary={(sessionId) => {
                console.log('Save session to library:', sessionId);
                // TODO: Implement save to library logic
              }}
            />
            <SessionCreationModal
              isOpen={isSessionCreationModalOpen}
              onClose={() => {
                setIsSessionCreationModalOpen(false);
                setSelectedPlanningDate(null);
              }}
              selectedDate={selectedPlanningDate}
              onSave={(sessionData) => {
                console.log('Session saved:', sessionData);
                // TODO: Implement session save logic
              }}
              onSaveToLibrary={(sessionId) => {
                console.log('Save session to library:', sessionId);
                // TODO: Implement save to library logic
              }}
            />
          </div>
        );
      case 'nutricion':
        return (
          <div className="client-program-tab-content">
            <p>Nutrición content coming soon...</p>
          </div>
        );
      case 'info':
        return (
          <div className="client-program-tab-content">
            <p>Info content coming soon...</p>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <DashboardLayout screenName="Cliente">
        <div className="client-program-loading">
          <p>Cargando...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !client) {
    return (
      <DashboardLayout screenName="Cliente">
        <div className="client-program-error">
          <p>{error || 'Cliente no encontrado'}</p>
          <button 
            className="client-program-back-button"
            onClick={() => navigate('/one-on-one')}
          >
            Volver
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const containerWidth = 100 / TAB_CONFIG.length;
  const clientName = client.clientName || client.clientEmail || `Cliente ${client.clientUserId.slice(0, 8)}`;

  return (
    <DashboardLayout 
      screenName={clientName}
      showBackButton={true}
      backPath="/one-on-one"
    >
      <div className="client-program-container">
        {/* Tab Bar */}
        <div className="client-program-tab-bar">
          <div className="client-program-tab-header-container">
            <div className="client-program-tab-indicator-wrapper">
              {TAB_CONFIG.map((tab, index) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabClick(index)}
                  className={`client-program-tab-button ${currentTabIndex === index ? 'client-program-tab-button-active' : ''}`}
                >
                  <span className="client-program-tab-title-text">{tab.title}</span>
                </button>
              ))}
              <div 
                className="client-program-tab-indicator"
                style={{
                  width: `${containerWidth}%`,
                  transform: `translateX(${currentTabIndex * 100}%)`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="client-program-content">
          {renderTabContent()}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ClientProgramScreen;
