import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import CalendarView from '../components/CalendarView';
import SessionAssignmentModal from '../components/SessionAssignmentModal';
import SessionCreationModal from '../components/SessionCreationModal';
import PlanningSidebar from '../components/PlanningSidebar';
import PlansSidebar from '../components/PlansSidebar';
import plansService from '../services/plansService';
import oneOnOneService from '../services/oneOnOneService';
import clientSessionService from '../services/clientSessionService';
import clientProgramService from '../services/clientProgramService';
import programService from '../services/programService';
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
  const [selectedProgramId, setSelectedProgramId] = useState(null); // Selected program (container/bin)
  const [assignedPrograms, setAssignedPrograms] = useState([]);
  const [plannedSessions, setPlannedSessions] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [planAssignments, setPlanAssignments] = useState({}); // Object mapping week keys to plan assignments
  const [isLoadingPlanAssignments, setIsLoadingPlanAssignments] = useState(false);

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
      // sessionData should include planId
      await clientSessionService.assignSessionToDate(
        clientId,
        sessionData.programId,
        sessionData.planId, // NEW: plan ID is required
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

  const handlePlanAssignment = async (planId, weekKey, day) => {
    if (!client?.clientUserId || !selectedProgramId || !planId || !weekKey) {
      alert('Por favor, selecciona un programa primero');
      return;
    }

    try {
      // Ensure program is assigned to client
      const clientProgram = await clientProgramService.getClientProgram(selectedProgramId, client.clientUserId);
      if (!clientProgram) {
        await clientProgramService.assignProgramToClient(selectedProgramId, client.clientUserId);
        // Reload programs
        const allPrograms = await programService.getProgramsByCreator(user.uid);
        const oneOnOnePrograms = allPrograms.filter(
          (p) => (p.deliveryType || 'low_ticket') === 'one_on_one'
        );
        const programsWithStatus = await Promise.all(
          oneOnOnePrograms.map(async (program) => {
            try {
              const cp = await clientProgramService.getClientProgram(program.id, client.clientUserId);
              return {
                ...program,
                isAssigned: !!cp,
                clientProgramId: cp?.id
              };
            } catch (error) {
              return {
                ...program,
                isAssigned: false
              };
            }
          })
        );
        setAssignedPrograms(programsWithStatus);
      }

      // Determine which module index to assign (for now, assign module 0)
      const moduleIndex = 0;
      
      // Assign plan to week in the context of the selected program
      await clientProgramService.assignPlanToWeek(
        selectedProgramId,
        client.clientUserId,
        planId,
        weekKey,
        moduleIndex
      );

      // Reload plan assignments to reflect the change
      const assignments = await clientProgramService.getPlanAssignments(
        selectedProgramId,
        client.clientUserId
      );
      
      setPlanAssignments(assignments || {});

      console.log('✅ Plan assigned to week:', { programId: selectedProgramId, planId, weekKey, moduleIndex });
    } catch (error) {
      console.error('Error assigning plan to week:', error);
      alert(`Error al asignar el plan a la semana: ${error.message || 'Error desconocido'}`);
    }
  };

  const handleProgramSelect = (programId) => {
    setSelectedProgramId(programId);
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
            <div className="client-program-planning-sidebars">
              <PlanningSidebar
                clientId={client?.clientUserId}
                creatorId={user?.uid}
                selectedProgramId={selectedProgramId}
                onProgramSelect={handleProgramSelect}
                onProgramsChange={setAssignedPrograms}
              />
              {selectedProgramId && (
                <PlansSidebar
                  creatorId={user?.uid}
                  selectedPlanId={null}
                  onPlanSelect={(planId) => {
                    // Could allow selecting a plan to see details
                    console.log('Plan selected:', planId);
                  }}
                />
              )}
            </div>
            <div className="client-program-planning-main">
              <CalendarView 
                onDateSelect={handleDateSelect}
                plannedSessions={plannedSessions}
                programColors={programColors}
                onMonthChange={setCurrentDate}
                planAssignments={planAssignments}
                onPlanAssignment={handlePlanAssignment}
                assignedPrograms={assignedPrograms}
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
