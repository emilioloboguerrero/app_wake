import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import CalendarView from '../components/CalendarView';
import SessionAssignmentModal from '../components/SessionAssignmentModal';
import PlanningLibrarySidebar from '../components/PlanningLibrarySidebar';
import plansService from '../services/plansService';
import oneOnOneService from '../services/oneOnOneService';
import clientSessionService from '../services/clientSessionService';
import clientProgramService from '../services/clientProgramService';
import clientPlanContentService from '../services/clientPlanContentService';
import programService from '../services/programService';
import libraryService from '../services/libraryService';
import { getWeeksBetween } from '../utils/weekCalculation';
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
  const [selectedPlanningDate, setSelectedPlanningDate] = useState(null);
  const [selectedProgramId, setSelectedProgramId] = useState(null); // Selected program (container/bin)
  const [assignedPrograms, setAssignedPrograms] = useState([]);
  const [plannedSessions, setPlannedSessions] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [planAssignments, setPlanAssignments] = useState({}); // Object mapping week keys to plan assignments
  const [isLoadingPlanAssignments, setIsLoadingPlanAssignments] = useState(false);
  const [contentPlanId, setContentPlanId] = useState(null); // Plan that provides content for selected program (for this client)
  const [isLoadingContentPlan, setIsLoadingContentPlan] = useState(false);
  const [isSavingContentPlan, setIsSavingContentPlan] = useState(false);
  const [plans, setPlans] = useState([]);
  const [planningSearchQuery, setPlanningSearchQuery] = useState('');
  const [sidebarPulseTrigger, setSidebarPulseTrigger] = useState(null); // timestamp to trigger one-time pulse on sessions sidebar
  const [selectedDayInfoForPlan, setSelectedDayInfoForPlan] = useState(null); // { weekKey, planAssignments }
  const [hasClientPlanCopy, setHasClientPlanCopy] = useState(false);
  const [isLoadingPlanCopyStatus, setIsLoadingPlanCopyStatus] = useState(false);
  // Week content (plan or client copy sessions) per weekKey for calendar display
  const [weekContentByWeekKey, setWeekContentByWeekKey] = useState({});
  const [isLoadingWeekContent, setIsLoadingWeekContent] = useState(false);
  const [addPlanSessionTarget, setAddPlanSessionTarget] = useState(null); // { weekKey, dayIndex, assignment }
  const [librarySessionsForAdd, setLibrarySessionsForAdd] = useState([]);
  const [isLoadingLibrarySessions, setIsLoadingLibrarySessions] = useState(false);
  const [planWeeksCount, setPlanWeeksCount] = useState({}); // { [planId]: number } for calendar plan bar label

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

  // Load assigned programs when client loads (for program selector and plan/session assignment)
  useEffect(() => {
    const loadAssignedPrograms = async () => {
      if (!user?.uid || !client?.clientUserId) return;
      try {
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
            } catch {
              return { ...program, isAssigned: false };
            }
          })
        );
        setAssignedPrograms(programsWithStatus);
        // Auto-select first assigned program, or first one-on-one program if none assigned
        setSelectedProgramId((prev) => {
          if (prev) return prev; // Keep current selection
          const assigned = programsWithStatus.find((p) => p.isAssigned);
          return assigned?.id ?? programsWithStatus[0]?.id ?? null;
        });
      } catch (error) {
        console.error('Error loading assigned programs:', error);
        setAssignedPrograms([]);
      }
    };
    loadAssignedPrograms();
  }, [user?.uid, client?.clientUserId]);

  // Enrich planned sessions with library session titles (for date-assigned sessions, not from plan)
  const enrichPlannedSessionsWithTitles = async (sessions, creatorId) => {
    if (!sessions?.length || !creatorId) return sessions ?? [];
    try {
      const librarySessions = await libraryService.getSessionLibrary(creatorId);
      const titleBySessionId = new Map(librarySessions.map((s) => [s.id, s.title || s.name]));
      return sessions.map((s) => ({
        ...s,
        session_name: titleBySessionId.get(s.session_id) ?? s.session_name ?? null,
      }));
    } catch {
      return sessions ?? [];
    }
  };

  // Load planned sessions when client or date changes (use clientUserId for client_sessions)
  useEffect(() => {
    if (!client?.clientUserId) {
      console.log('[ClientProgramScreen] loadPlannedSessions: skip (no client.clientUserId)', { hasClient: !!client });
      return;
    }
    const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    let cancelled = false;
    (async () => {
      try {
        const sessions = await clientSessionService.getClientSessions(client.clientUserId, startDate, endDate);
        if (cancelled) return;
        const enriched = await enrichPlannedSessionsWithTitles(sessions ?? [], user?.uid);
        if (cancelled) return;
        setPlannedSessions(enriched);
      } catch (err) {
        if (!cancelled) setPlannedSessions([]);
        console.error('[ClientProgramScreen] loadPlannedSessions: error', err);
      }
    })();
    return () => { cancelled = true; };
  }, [client?.clientUserId, currentDate, user?.uid]);

  // Load plans (for content dropdown) and content_plan_id when program selected
  useEffect(() => {
    const loadPlansAndContentPlan = async () => {
      if (!user?.uid) return;
      try {
        const allPlans = await plansService.getPlansByCreator(user.uid);
        setPlans(allPlans);
      } catch (error) {
        console.error('Error loading plans:', error);
        setPlans([]);
      }
    };
    loadPlansAndContentPlan();
  }, [user?.uid]);

  useEffect(() => {
    if (!selectedProgramId || !client?.clientUserId) {
      setContentPlanId(null);
      setPlanAssignments({});
      return;
    }
    const loadContentPlan = async () => {
      setIsLoadingContentPlan(true);
      try {
        const cp = await clientProgramService.getClientProgram(selectedProgramId, client.clientUserId);
        setContentPlanId(cp?.content_plan_id ?? null);
        setPlanAssignments(cp?.planAssignments ?? {});
      } catch (error) {
        console.error('Error loading content plan:', error);
        setContentPlanId(null);
        setPlanAssignments({});
      } finally {
        setIsLoadingContentPlan(false);
      }
    };
    loadContentPlan();
  }, [selectedProgramId, client?.clientUserId]);

  // Load week content (plan sessions or client copy) for each week in current month that has a plan assignment
  useEffect(() => {
    if (!client?.clientUserId || !selectedProgramId || !planAssignments || Object.keys(planAssignments).length === 0) {
      setWeekContentByWeekKey({});
      return;
    }
    const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const weekKeysInMonth = getWeeksBetween(startDate, endDate);
    const weekKeysWithPlans = weekKeysInMonth.filter((wk) => planAssignments[wk]?.planId);
    if (weekKeysWithPlans.length === 0) {
      setWeekContentByWeekKey({});
      return;
    }
    let cancelled = false;
    setIsLoadingWeekContent(true);
    const load = async () => {
      const next = {};
      for (const weekKey of weekKeysWithPlans) {
        if (cancelled) return;
        const assignment = planAssignments[weekKey];
        try {
          const clientContent = await clientPlanContentService.getClientPlanContent(
            client.clientUserId,
            selectedProgramId,
            weekKey
          );
          if (clientContent?.sessions) {
            next[weekKey] = {
              sessions: clientContent.sessions,
              title: clientContent.title,
              fromClientCopy: true,
              planId: clientContent.source_plan_id || assignment.planId,
              moduleId: clientContent.source_module_id
            };
            continue;
          }
        } catch (_) {}
        try {
          const modules = await plansService.getModulesByPlan(assignment.planId);
          const mod = modules?.[assignment.moduleIndex ?? 0];
          if (mod) {
            const sessions = await plansService.getSessionsByModule(assignment.planId, mod.id);
            next[weekKey] = {
              sessions: sessions || [],
              title: mod.title,
              fromClientCopy: false,
              planId: assignment.planId,
              moduleId: mod.id
            };
          }
        } catch (_) {}
      }
      if (!cancelled) {
        setWeekContentByWeekKey(next);
        setIsLoadingWeekContent(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [client?.clientUserId, selectedProgramId, currentDate.getFullYear(), currentDate.getMonth(), planAssignments]);

  // Load week count per plan for calendar plan bar "(N semanas)"
  useEffect(() => {
    const planIds = [...new Set(Object.values(planAssignments || {}).map((a) => a.planId).filter(Boolean))];
    if (planIds.length === 0) {
      setPlanWeeksCount({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      const next = {};
      await Promise.all(
        planIds.map(async (planId) => {
          try {
            const modules = await plansService.getModulesByPlan(planId);
            if (!cancelled) next[planId] = modules?.length ?? 0;
          } catch {
            if (!cancelled) next[planId] = 0;
          }
        })
      );
      if (!cancelled) setPlanWeeksCount(next);
    };
    load();
    return () => { cancelled = true; };
  }, [planAssignments]);

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
    if (!client?.clientUserId) return;
    const programId = sessionData.programId ?? selectedProgramId;
    if (!programId) {
      console.error('handleSessionAssigned: missing programId');
      return;
    }
    try {
      await clientSessionService.assignSessionToDate(
        client.clientUserId,
        programId,
        sessionData.planId ?? contentPlanId ?? null,
        sessionData.sessionId,
        sessionData.date,
        sessionData.moduleId ?? null,
        sessionData.library_session_ref ? { library_session_ref: true } : {}
      );
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const sessions = await clientSessionService.getClientSessions(client.clientUserId, startDate, endDate);
      const enriched = await enrichPlannedSessionsWithTitles(sessions ?? [], user?.uid);
      setPlannedSessions(enriched);
      
      setIsSessionAssignmentModalOpen(false);
    } catch (error) {
      console.error('Error assigning session:', error);
      alert('Error al asignar la sesión');
    }
  };

  const handleDateSelect = (date, dayInfo) => {
    setSelectedPlanningDate(date);
    // Only open add-session modal when the day has no sessions (date-assigned or from plan)
    if (!dayInfo?.hasAnySession) {
      setIsSessionAssignmentModalOpen(true);
    }
  };

  const handlePlanAssignment = async (planId, weekKey, day) => {
    if (!client?.clientUserId || !selectedProgramId || !planId || !weekKey) {
      alert('Por favor, selecciona un programa primero');
      return;
    }
    try {
      const clientProgram = await clientProgramService.getClientProgram(selectedProgramId, client.clientUserId);
      if (!clientProgram) {
        await clientProgramService.assignProgramToClient(selectedProgramId, client.clientUserId);
        setAssignedPrograms((prev) =>
          prev.map((p) =>
            p.id === selectedProgramId ? { ...p, isAssigned: true } : p
          )
        );
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

  const handleSessionAssignment = async (sessionData) => {
    console.log('[ClientProgramScreen] handleSessionAssignment', { clientUserId: client?.clientUserId, selectedProgramId, sessionData });
    if (!client?.clientUserId || !selectedProgramId) {
      alert('Por favor, selecciona un programa primero');
      return;
    }
    try {
      await clientSessionService.assignSessionToDate(
        client.clientUserId,
        selectedProgramId,
        sessionData.planId ?? null,
        sessionData.sessionId,
        sessionData.date,
        sessionData.moduleId ?? null,
        sessionData.library_session_ref ? { library_session_ref: true } : {}
      );
      console.log('[ClientProgramScreen] handleSessionAssignment: wrote doc, reloading sessions for', client.clientUserId);
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const sessions = await clientSessionService.getClientSessions(client.clientUserId, startDate, endDate);
      const enriched = await enrichPlannedSessionsWithTitles(sessions ?? [], user?.uid);
      setPlannedSessions(enriched);
    } catch (error) {
      console.error('[ClientProgramScreen] handleSessionAssignment error:', error);
      alert('Error al asignar la sesión');
    }
  };

  const handleEditSessionAssignment = ({ session, date }) => {
    if (!client?.clientUserId || !session?.session_id) return;
    navigate(`/content/sessions/${session.session_id}`, {
      state: {
        editScope: 'client',
        clientSessionId: session.id,
        clientId: client.clientUserId,
        clientName: client?.clientName || client?.name || client?.displayName || 'Cliente'
      }
    });
  };

  const handleDeleteSessionAssignment = async ({ session, date }) => {
    if (!client?.clientUserId) return;
    if (!window.confirm('¿Eliminar esta sesión del día?')) return;
    try {
      await clientSessionService.removeSessionFromDate(
        client.clientUserId,
        date,
        session.session_id
      );
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const sessions = await clientSessionService.getClientSessions(client.clientUserId, startDate, endDate);
      const enriched = await enrichPlannedSessionsWithTitles(sessions ?? [], user?.uid);
      setPlannedSessions(enriched);
    } catch (error) {
      console.error('[ClientProgramScreen] handleDeleteSessionAssignment error:', error);
      alert('Error al eliminar la sesión');
    }
  };

  // When user selects a day with plan assignments, load whether this week has a client plan copy
  useEffect(() => {
    if (!client?.clientUserId || !selectedProgramId || !selectedDayInfoForPlan?.weekKey || !selectedDayInfoForPlan?.planAssignments?.length) {
      setHasClientPlanCopy(false);
      return;
    }
    const { weekKey } = selectedDayInfoForPlan;
    let cancelled = false;
    setIsLoadingPlanCopyStatus(true);
    setHasClientPlanCopy(false);
    clientPlanContentService.getClientPlanContent(client.clientUserId, selectedProgramId, weekKey).then((content) => {
      if (!cancelled) {
        setHasClientPlanCopy(!!content);
        setIsLoadingPlanCopyStatus(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setHasClientPlanCopy(false);
        setIsLoadingPlanCopyStatus(false);
      }
    });
    return () => { cancelled = true; };
  }, [client?.clientUserId, selectedProgramId, selectedDayInfoForPlan?.weekKey, selectedDayInfoForPlan?.planAssignments?.length]);

  const handleSelectedDayChange = (dayInfo) => {
    if (dayInfo?.planAssignments?.length > 0 && dayInfo?.weekKey) {
      setSelectedDayInfoForPlan({ weekKey: dayInfo.weekKey, planAssignments: dayInfo.planAssignments });
    } else {
      setSelectedDayInfoForPlan(null);
      setHasClientPlanCopy(false);
    }
  };

  const handlePersonalizePlanWeek = async ({ assignment, weekKey }) => {
    if (!client?.clientUserId || !selectedProgramId || !assignment?.planId || weekKey == null) return;
    try {
      const modules = await plansService.getModulesByPlan(assignment.planId);
      const moduleIndex = assignment.moduleIndex ?? 0;
      const module = modules?.[moduleIndex];
      if (!module) {
        alert('Módulo del plan no encontrado');
        return;
      }
      await clientPlanContentService.copyFromPlan(
        client.clientUserId,
        selectedProgramId,
        weekKey,
        assignment.planId,
        module.id
      );
      setHasClientPlanCopy(true);
    } catch (error) {
      console.error('Error personalizando plan:', error);
      alert(error.message || 'Error al personalizar la semana');
    }
  };

  const handleResetPlanWeek = async ({ assignment, weekKey }) => {
    if (!client?.clientUserId || !selectedProgramId || weekKey == null || !assignment?.planId) return;
    if (!window.confirm('¿Restablecer esta semana al plan original? Se usará de nuevo el contenido del plan para todos.')) return;
    try {
      await clientPlanContentService.deleteClientPlanContent(client.clientUserId, selectedProgramId, weekKey);
      setHasClientPlanCopy(false);
      const modules = await plansService.getModulesByPlan(assignment.planId);
      const mod = modules?.[assignment.moduleIndex ?? 0];
      if (mod) {
        const sessions = await plansService.getSessionsByModule(assignment.planId, mod.id);
        setWeekContentByWeekKey((p) => ({ ...p, [weekKey]: { sessions: sessions || [], title: mod.title, fromClientCopy: false, planId: assignment.planId, moduleId: mod.id } }));
      }
    } catch (error) {
      console.error('Error restableciendo plan:', error);
      alert(error.message || 'Error al restablecer');
    }
  };

  const handleEditPlanSession = async ({ session, weekKey, weekContent }) => {
    if (!client?.clientUserId || !selectedProgramId || !session?.id || !weekKey || !weekContent) return;
    try {
      if (!weekContent.fromClientCopy) {
        await clientPlanContentService.copyFromPlan(
          client.clientUserId,
          selectedProgramId,
          weekKey,
          weekContent.planId,
          weekContent.moduleId
        );
        const content = await clientPlanContentService.getClientPlanContent(
          client.clientUserId,
          selectedProgramId,
          weekKey
        );
        if (content?.sessions) {
          setWeekContentByWeekKey((prev) => ({
            ...prev,
            [weekKey]: {
              sessions: content.sessions,
              title: content.title,
              fromClientCopy: true,
              planId: content.source_plan_id || weekContent.planId,
              moduleId: content.source_module_id || weekContent.moduleId
            }
          }));
        }
        setHasClientPlanCopy(true);
      }
      navigate(`/content/sessions/${session.id}`, {
        state: {
          editScope: 'client_plan',
          clientId: client.clientUserId,
          programId: selectedProgramId,
          weekKey,
          clientName: client?.clientName || client?.name || client?.displayName || 'Cliente',
          returnTo: `/clients/${clientId}`
        }
      });
    } catch (error) {
      console.error('Error opening plan session for edit:', error);
      alert(error.message || 'Error al abrir la sesión');
    }
  };

  const handleDeletePlanSession = async ({ session, weekKey, weekContent }) => {
    if (!client?.clientUserId || !selectedProgramId || !session?.id || !weekKey) return;
    if (!window.confirm('¿Quitar esta sesión de la semana para este cliente? No se borra del plan ni de la biblioteca.')) return;
    try {
      if (!weekContent.fromClientCopy) {
        await clientPlanContentService.copyFromPlan(
          client.clientUserId,
          selectedProgramId,
          weekKey,
          weekContent.planId,
          weekContent.moduleId
        );
      }
      await clientPlanContentService.deleteSession(client.clientUserId, selectedProgramId, weekKey, session.id);
      const content = await clientPlanContentService.getClientPlanContent(client.clientUserId, selectedProgramId, weekKey);
      if (content?.sessions) {
        setWeekContentByWeekKey((prev) => ({
          ...prev,
          [weekKey]: {
            sessions: content.sessions,
            title: content.title,
            fromClientCopy: true,
            planId: content.source_plan_id || weekContent.planId,
            moduleId: content.source_module_id || weekContent.moduleId
          }
        }));
      }
    } catch (error) {
      console.error('Error deleting plan session:', error);
      alert(error.message || 'Error al quitar la sesión');
    }
  };

  const handleMovePlanSessionDay = async ({ session, weekKey, weekContent, targetDayIndex }) => {
    if (!client?.clientUserId || !selectedProgramId || !session?.id || weekKey == null || targetDayIndex == null) return;
    try {
      if (!weekContent.fromClientCopy) {
        await clientPlanContentService.copyFromPlan(
          client.clientUserId,
          selectedProgramId,
          weekKey,
          weekContent.planId,
          weekContent.moduleId
        );
      }
      await clientPlanContentService.updateSession(
        client.clientUserId,
        selectedProgramId,
        weekKey,
        session.id,
        { dayIndex: targetDayIndex }
      );
      const content = await clientPlanContentService.getClientPlanContent(client.clientUserId, selectedProgramId, weekKey);
      if (content?.sessions) {
        setWeekContentByWeekKey((prev) => ({
          ...prev,
          [weekKey]: {
            sessions: content.sessions,
            title: content.title,
            fromClientCopy: true,
            planId: content.source_plan_id || weekContent.planId,
            moduleId: content.source_module_id || weekContent.moduleId
          }
        }));
      }
    } catch (error) {
      console.error('Error moving plan session day:', error);
      alert(error.message || 'Error al mover');
    }
  };

  const handleMovePlanSessionToWeek = async ({
    session,
    sourceWeekKey,
    targetWeekKey,
    targetDayIndex,
    targetPlanAssignment
  }) => {
    if (!client?.clientUserId || !selectedProgramId || !session?.id) return;
    try {
      let targetAssignment = targetPlanAssignment;
      if (targetPlanAssignment && !targetPlanAssignment.moduleId) {
        const modules = await plansService.getModulesByPlan(targetPlanAssignment.planId);
        const mod = modules?.[targetPlanAssignment.moduleIndex ?? 0];
        if (mod) targetAssignment = { ...targetPlanAssignment, moduleId: mod.id };
      }
      await clientPlanContentService.moveSessionToWeek(
        client.clientUserId,
        selectedProgramId,
        sourceWeekKey,
        targetWeekKey,
        session.id,
        targetDayIndex,
        targetAssignment || undefined
      );
      const reloadWeek = async (wk) => {
        const content = await clientPlanContentService.getClientPlanContent(client.clientUserId, selectedProgramId, wk);
        if (content?.sessions) {
          return { sessions: content.sessions, title: content.title, fromClientCopy: true, planId: content.source_plan_id, moduleId: content.source_module_id };
        }
        const ass = planAssignments[wk];
        if (ass?.planId) {
          const modules = await plansService.getModulesByPlan(ass.planId);
          const mod = modules?.[ass.moduleIndex ?? 0];
          if (mod) {
            const sessions = await plansService.getSessionsByModule(ass.planId, mod.id);
            return { sessions: sessions || [], title: mod.title, fromClientCopy: false, planId: ass.planId, moduleId: mod.id };
          }
        }
        return null;
      };
      const [sourceContent, targetContent] = await Promise.all([reloadWeek(sourceWeekKey), reloadWeek(targetWeekKey)]);
      setWeekContentByWeekKey((prev) => ({
        ...prev,
        ...(sourceContent && { [sourceWeekKey]: sourceContent }),
        ...(targetContent && { [targetWeekKey]: targetContent })
      }));
    } catch (error) {
      console.error('Error moving plan session to week:', error);
      alert(error.message || 'Error al mover la sesión');
    }
  };

  const addLibrarySessionToPlanWeek = async (weekKey, dayIndex, librarySessionId) => {
    if (!client?.clientUserId || !selectedProgramId || !user?.uid) return;
    const assignment = planAssignments[weekKey];
    if (assignment?.planId) {
      const modules = await plansService.getModulesByPlan(assignment.planId);
      const mod = modules?.[assignment.moduleIndex ?? 0];
      if (mod) {
        await clientPlanContentService.ensureClientPlanContentForWeek(
          client.clientUserId,
          selectedProgramId,
          weekKey,
          { planId: assignment.planId, moduleId: mod.id }
        );
      } else {
        await clientPlanContentService.ensureClientPlanContentForWeek(client.clientUserId, selectedProgramId, weekKey, {});
      }
    } else {
      await clientPlanContentService.ensureClientPlanContentForWeek(client.clientUserId, selectedProgramId, weekKey, {});
    }
    const libSession = await libraryService.getLibrarySessionById(user.uid, librarySessionId);
    if (!libSession) {
      alert('Sesión de biblioteca no encontrada');
      return;
    }
    const payload = {
      title: libSession.title || libSession.name || 'Sesión',
      dayIndex,
      exercises: (libSession.exercises || []).map((ex) => ({
        title: ex.title || ex.name || 'Ejercicio',
        sets: (ex.sets || []).map((s) => ({
          title: s.title,
          reps: s.reps,
          intensity: s.intensity
        }))
      }))
    };
    await clientPlanContentService.addSession(client.clientUserId, selectedProgramId, weekKey, payload);
    const content = await clientPlanContentService.getClientPlanContent(client.clientUserId, selectedProgramId, weekKey);
    if (content?.sessions) {
      setWeekContentByWeekKey((prev) => ({
        ...prev,
        [weekKey]: {
          sessions: content.sessions,
          title: content.title,
          fromClientCopy: true,
          planId: content.source_plan_id,
          moduleId: content.source_module_id
        }
      }));
    }
    setHasClientPlanCopy(true);
  };

  const handleAddLibrarySessionToPlanDay = async ({ weekKey, dayIndex, librarySessionId }) => {
    try {
      await addLibrarySessionToPlanWeek(weekKey, dayIndex, librarySessionId);
    } catch (error) {
      console.error('Error adding library session to plan day:', error);
      alert(error.message || 'Error al añadir la sesión');
    }
  };

  const handleAddPlanSessionToDay = ({ weekKey, dayIndex, assignment }) => {
    setAddPlanSessionTarget({ weekKey, dayIndex, assignment });
    setIsLoadingLibrarySessions(true);
    setLibrarySessionsForAdd([]);
    libraryService.getSessionLibrary(user?.uid).then((sessions) => {
      setLibrarySessionsForAdd(sessions || []);
    }).catch(() => setLibrarySessionsForAdd([])).finally(() => setIsLoadingLibrarySessions(false));
  };

  const handleConfirmAddPlanSession = async (librarySessionId) => {
    if (!addPlanSessionTarget || !librarySessionId) return;
    try {
      await addLibrarySessionToPlanWeek(addPlanSessionTarget.weekKey, addPlanSessionTarget.dayIndex, librarySessionId);
      setAddPlanSessionTarget(null);
    } catch (error) {
      console.error('Error adding session:', error);
      alert(error.message || 'Error al añadir');
    }
  };

  const handleContentPlanChange = async (planId) => {
    if (!client?.clientUserId || !selectedProgramId) return;
    setIsSavingContentPlan(true);
    try {
      await clientProgramService.setClientContentPlan(selectedProgramId, client.clientUserId, planId || null);
      setContentPlanId(planId || null);
    } catch (error) {
      console.error('Error setting content plan:', error);
      alert('Error al guardar el contenido del programa');
    } finally {
      setIsSavingContentPlan(false);
    }
  };

  const renderTabContent = () => {
    const currentTab = TAB_CONFIG[currentTabIndex];
    
    switch (currentTab.key) {
      case 'lab':
        return (
          <div className="client-program-tab-content client-program-tab-empty">
            <p className="client-program-tab-empty-title">Estadísticas del cliente</p>
            <p className="client-program-tab-empty-message">Próximamente podrás ver aquí métricas y progreso de este cliente.</p>
          </div>
        );
      case 'planificacion':
        return (
          <div className="client-program-planning-content">
            {/* Program selector (required for plan/session assignment) */}
            <div className="client-program-planning-header">
              <div className="client-program-planning-header-inner">
                <label className="client-program-planning-program-label">Programa</label>
                <select
                  className="client-program-planning-program-select"
                  value={selectedProgramId || ''}
                  onChange={(e) => handleProgramSelect(e.target.value || null)}
                  title="Selecciona el programa para asignar planes (por semana) o sesiones (por día)"
                >
                  <option value="">— Selecciona un programa —</option>
                  {assignedPrograms.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.title || `Programa ${program.id.slice(0, 8)}`}
                      {program.isAssigned ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <p className="client-program-planning-hint">Selecciona un programa y arrastra <strong>planes</strong> a la barra de semanas o <strong>sesiones</strong> a un día concreto.</p>
            </div>
            {/* Layout: left (library - sessions/plans only), right (calendar) */}
            <div className="plan-structure-layout client-program-planning-layout">
              <div className="plan-structure-sidebars client-program-planning-left">
                <PlanningLibrarySidebar
                  creatorId={user?.uid}
                  searchQuery={planningSearchQuery}
                  onSearchChange={setPlanningSearchQuery}
                  pulseTrigger={sidebarPulseTrigger}
                />
              </div>
              <div className="plan-structure-main client-program-planning-main">
                <CalendarView
                  onDateSelect={handleDateSelect}
                  plannedSessions={plannedSessions}
                  programColors={programColors}
                  onMonthChange={setCurrentDate}
                  planAssignments={planAssignments}
                  plans={plans}
                  planWeeksCount={planWeeksCount}
                  onPlanAssignment={handlePlanAssignment}
                  onSessionAssignment={handleSessionAssignment}
                  onEditSessionAssignment={handleEditSessionAssignment}
                  onDeleteSessionAssignment={handleDeleteSessionAssignment}
                  onSelectedDayChange={handleSelectedDayChange}
                  hasClientPlanCopy={hasClientPlanCopy}
                  onPersonalizePlanWeek={handlePersonalizePlanWeek}
                  onResetPlanWeek={handleResetPlanWeek}
                  weekContentByWeekKey={weekContentByWeekKey}
                  onEditPlanSession={handleEditPlanSession}
                  onDeletePlanSession={handleDeletePlanSession}
                  onMovePlanSessionDay={handleMovePlanSessionDay}
                  onMovePlanSessionToWeek={handleMovePlanSessionToWeek}
                  onAddLibrarySessionToPlanDay={handleAddLibrarySessionToPlanDay}
                  onAddPlanSessionToDay={handleAddPlanSessionToDay}
                  assignedPrograms={assignedPrograms}
                  selectedProgramId={selectedProgramId}
                />
                <SessionAssignmentModal
                  isOpen={isSessionAssignmentModalOpen}
                  onClose={() => {
                    setIsSessionAssignmentModalOpen(false);
                    setSelectedPlanningDate(null);
                  }}
                  selectedDate={selectedPlanningDate}
                  creatorId={user?.uid}
                  onSessionAssigned={handleSessionAssigned}
                  onAddFromLibrary={() => {
                    setIsSessionAssignmentModalOpen(false);
                    setSelectedPlanningDate(null);
                    setSidebarPulseTrigger(Date.now());
                  }}
                />
                {addPlanSessionTarget && (
                  <div className="client-program-modal-overlay" onClick={() => setAddPlanSessionTarget(null)}>
                    <div className="client-program-add-plan-session-modal" onClick={(e) => e.stopPropagation()}>
                      <h3>Añadir sesión a este día (solo este cliente)</h3>
                      <p className="client-program-add-plan-session-hint">Elige una sesión de tu biblioteca para añadirla a la semana del plan.</p>
                      {isLoadingLibrarySessions ? (
                        <p>Cargando sesiones...</p>
                      ) : librarySessionsForAdd.length === 0 ? (
                        <p>No hay sesiones en la biblioteca. Crea una en Contenido.</p>
                      ) : (
                        <ul className="client-program-add-plan-session-list">
                          {librarySessionsForAdd.map((s) => (
                            <li key={s.id}>
                              <button
                                type="button"
                                className="client-program-add-plan-session-item"
                                onClick={() => handleConfirmAddPlanSession(s.id)}
                              >
                                {s.title || s.name || 'Sesión'}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <button type="button" className="client-program-add-plan-session-cancel" onClick={() => setAddPlanSessionTarget(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 'nutricion':
        return (
          <div className="client-program-tab-content client-program-tab-empty">
            <p className="client-program-tab-empty-title">Nutrición</p>
            <p className="client-program-tab-empty-message">Próximamente podrás gestionar el plan nutricional de este cliente.</p>
          </div>
        );
      case 'info':
        return (
          <div className="client-program-tab-content client-program-tab-empty">
            <p className="client-program-tab-empty-title">Info del cliente</p>
            <p className="client-program-tab-empty-message">Próximamente podrás ver y editar la información de perfil del cliente.</p>
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
            onClick={() => navigate('/products?tab=clientes')}
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
      backPath="/products?tab=clientes"
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
