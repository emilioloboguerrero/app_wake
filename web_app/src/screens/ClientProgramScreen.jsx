import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import CalendarView from '../components/CalendarView';
import SessionAssignmentModal from '../components/SessionAssignmentModal';
import SessionCreationModal from '../components/SessionCreationModal';
import PlanningSidebar from '../components/PlanningSidebar';
import oneOnOneService from '../services/oneOnOneService';
import clientSessionService from '../services/clientSessionService';
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
  const [isSessionAssignmentModalOpen, setIsSessionAssignmentModalOpen] = useState(false);
  const [isSessionCreationModalOpen, setIsSessionCreationModalOpen] = useState(false);
  const [selectedPlanningDate, setSelectedPlanningDate] = useState(null);
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [assignedPrograms, setAssignedPrograms] = useState([]);
  const [plannedSessions, setPlannedSessions] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());

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

  // Load planned sessions when client or date changes
  useEffect(() => {
    const loadPlannedSessions = async () => {
      if (!clientId) return;
      
      try {
        // Get sessions for current month
        const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const sessions = await clientSessionService.getClientSessions(clientId, startDate, endDate);
        setPlannedSessions(sessions);
      } catch (error) {
        console.error('Error loading planned sessions:', error);
        setPlannedSessions([]);
      }
    };

    if (clientId) {
      loadPlannedSessions();
    }
  }, [clientId, currentDate]);

  // Create program colors map for calendar
  const programColors = useMemo(() => {
    const colors = {};
    const colorPalette = [
      'rgba(191, 168, 77, 0.6)',
      'rgba(107, 142, 35, 0.6)',
      'rgba(70, 130, 180, 0.6)',
      'rgba(186, 85, 211, 0.6)',
      'rgba(220, 20, 60, 0.6)',
      'rgba(255, 140, 0, 0.6)',
    ];
    
    assignedPrograms.forEach((program, index) => {
      colors[program.id] = colorPalette[index % colorPalette.length];
    });
    
    return colors;
  }, [assignedPrograms]);

  const handleTabClick = (index) => {
    setCurrentTabIndex(index);
  };

  const handleSessionAssigned = async (sessionData) => {
    try {
      await clientSessionService.assignSessionToDate(
        clientId,
        sessionData.programId,
        sessionData.sessionId,
        sessionData.date,
        sessionData.moduleId
      );
      
      // Reload planned sessions
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const sessions = await clientSessionService.getClientSessions(clientId, startDate, endDate);
      setPlannedSessions(sessions);
      
      setIsSessionAssignmentModalOpen(false);
    } catch (error) {
      console.error('Error assigning session:', error);
      alert('Error al asignar la sesión');
    }
  };

  const handleDateSelect = (date) => {
    setSelectedPlanningDate(date);
    setIsSessionAssignmentModalOpen(true);
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
          <div className="client-program-tab-content client-program-planning-content">
            <PlanningSidebar
              clientId={client?.clientUserId}
              creatorId={user?.uid}
              selectedProgramId={selectedProgramId}
              onProgramSelect={setSelectedProgramId}
              onProgramsChange={setAssignedPrograms}
            />
            <div className="client-program-planning-main">
              <CalendarView 
                onDateSelect={handleDateSelect}
                plannedSessions={plannedSessions}
                programColors={programColors}
                onMonthChange={setCurrentDate}
              />
              <SessionAssignmentModal
                isOpen={isSessionAssignmentModalOpen}
                onClose={() => {
                  setIsSessionAssignmentModalOpen(false);
                  setSelectedPlanningDate(null);
                }}
                selectedDate={selectedPlanningDate}
                assignedPrograms={assignedPrograms}
                selectedProgramId={selectedProgramId}
                onSessionAssigned={handleSessionAssigned}
                onSessionCreated={(sessionData) => {
                  setIsSessionAssignmentModalOpen(false);
                  setIsSessionCreationModalOpen(true);
                  // TODO: Pass sessionData to creation modal
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

  const containerWidth = 100 / TAB_CONFIG.length; // Updated to 4 tabs (removed programas)
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
