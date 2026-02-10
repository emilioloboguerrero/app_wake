import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Button from '../components/Button';
import CalendarView from '../components/CalendarView';
import SessionAssignmentModal from '../components/SessionAssignmentModal';
import SessionPerformanceModal from '../components/SessionPerformanceModal';
import PlanningLibrarySidebar from '../components/PlanningLibrarySidebar';
import plansService from '../services/plansService';
import oneOnOneService from '../services/oneOnOneService';
import clientSessionService from '../services/clientSessionService';
import clientProgramService from '../services/clientProgramService';
import clientPlanContentService from '../services/clientPlanContentService';
import programService from '../services/programService';
import libraryService from '../services/libraryService';
import { getUser } from '../services/firestoreService';
import { getWeeksBetween, getMondayWeek } from '../utils/weekCalculation';
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
  const [completedSessionIds, setCompletedSessionIds] = useState(new Set()); // session IDs client has completed (for green indicator)
  const [performanceModalContext, setPerformanceModalContext] = useState(null); // { session, type, date?, weekKey?, weekContent? } for Ver desempeño
  // Info tab: client user doc and access end date form
  const [clientUserDoc, setClientUserDoc] = useState(null);
  const [loadingClientUser, setLoadingClientUser] = useState(false);
  const [infoProgramId, setInfoProgramId] = useState(null);
  const [infoAccessEndDate, setInfoAccessEndDate] = useState('');
  const [infoNoEndDate, setInfoNoEndDate] = useState(true);
  const [isSavingAccessEndDate, setIsSavingAccessEndDate] = useState(false);
  const [accessEndDateError, setAccessEndDateError] = useState(null);

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

  // Load client user doc when Info tab is active (for access end date)
  const isInfoTab = TAB_CONFIG[currentTabIndex]?.key === 'info';
  useEffect(() => {
    if (!isInfoTab || !client?.clientUserId) return;
    let cancelled = false;
    setLoadingClientUser(true);
    setAccessEndDateError(null);
    getUser(client.clientUserId)
      .then((userDoc) => {
        if (!cancelled) setClientUserDoc(userDoc);
      })
      .catch((err) => {
        if (!cancelled) {
          setAccessEndDateError(err?.message || 'Error al cargar datos del usuario');
          setClientUserDoc(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingClientUser(false);
      });
    return () => { cancelled = true; };
  }, [isInfoTab, client?.clientUserId]);

  // Sync info program selector when assignedPrograms loads and we're on Info tab
  useEffect(() => {
    if (!isInfoTab || assignedPrograms.length === 0) return;
    const assigned = assignedPrograms.filter((p) => p.isAssigned);
    if (assigned.length > 0 && !infoProgramId) setInfoProgramId(assigned[0].id);
  }, [isInfoTab, assignedPrograms, infoProgramId]);

  // Sync access end date form from clientUserDoc when program or user doc changes
  useEffect(() => {
    if (!clientUserDoc || !infoProgramId) return;
    const courses = clientUserDoc.courses || {};
    const entry = courses[infoProgramId];
    if (!entry) {
      setInfoNoEndDate(true);
      setInfoAccessEndDate('');
      return;
    }
    const exp = entry.expires_at;
    if (!exp) {
      setInfoNoEndDate(true);
      setInfoAccessEndDate('');
      return;
    }
    try {
      const d = new Date(exp);
      const far = new Date();
      far.setFullYear(far.getFullYear() + 2);
      const noEnd = d > far;
      setInfoNoEndDate(noEnd);
      setInfoAccessEndDate(noEnd ? '' : d.toISOString().slice(0, 10));
    } catch {
      setInfoNoEndDate(true);
      setInfoAccessEndDate('');
    }
  }, [clientUserDoc, infoProgramId]);

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
  // Include overflow weeks (past/future month days visible in calendar grid) so sessions show there too
  useEffect(() => {
    if (!client?.clientUserId || !user?.uid) {
      return;
    }
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastOfMonth.getDate();
    const startingDayOfWeek = (firstOfMonth.getDay() + 6) % 7; // Mon=0
    const totalCells = Math.ceil((startingDayOfWeek + daysInMonth) / 7) * 7;
    const trailingCount = Math.max(0, totalCells - startingDayOfWeek - daysInMonth);
    const startDate = new Date(year, month, 1 - startingDayOfWeek);
    const endDate = new Date(year, month, daysInMonth + trailingCount);
    let cancelled = false;
    (async () => {
      try {
        const [programs, sessions] = await Promise.all([
          programService.getProgramsByCreator(user.uid),
          clientSessionService.getClientSessions(client.clientUserId, startDate, endDate)
        ]);
        if (cancelled) return;
        const creatorProgramIds = new Set((programs || []).map((p) => p.id));
        const filtered = (sessions || []).filter((s) => creatorProgramIds.has(s.program_id));
        const enriched = await enrichPlannedSessionsWithTitles(filtered, user.uid);
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

  // Ref to read latest weekContentByWeekKey inside async effect (skip refetch when already loaded)
  const weekContentByWeekKeyRef = React.useRef(weekContentByWeekKey);
  weekContentByWeekKeyRef.current = weekContentByWeekKey;

  // Load week content (plan sessions or client copy) for each week visible in calendar grid that has a plan assignment
  useEffect(() => {
    if (!client?.clientUserId || !selectedProgramId || !planAssignments || Object.keys(planAssignments).length === 0) {
      setWeekContentByWeekKey({});
      return;
    }
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastOfMonth.getDate();
    const startingDayOfWeek = (firstOfMonth.getDay() + 6) % 7;
    const totalCells = Math.ceil((startingDayOfWeek + daysInMonth) / 7) * 7;
    const trailingCount = Math.max(0, totalCells - startingDayOfWeek - daysInMonth);
    const startDate = new Date(year, month, 1 - startingDayOfWeek);
    const endDate = new Date(year, month, daysInMonth + trailingCount);
    const weekKeysInMonth = getWeeksBetween(startDate, endDate);
    const weekKeysWithPlans = weekKeysInMonth.filter((wk) => planAssignments[wk]?.planId);
    if (weekKeysWithPlans.length === 0) {
      setWeekContentByWeekKey({});
      return;
    }
    let cancelled = false;
    setIsLoadingWeekContent(true);
    const load = async () => {
      const prev = weekContentByWeekKeyRef.current;
      const next = {};
      for (const weekKey of weekKeysWithPlans) {
        if (cancelled) return;
        const assignment = planAssignments[weekKey];
        const existing = prev?.[weekKey];
        if (existing?.planId === assignment.planId && existing?.sessions?.length !== undefined) {
          next[weekKey] = existing;
          continue;
        }
        try {
          const clientContent = await clientPlanContentService.getClientPlanContent(
            client.clientUserId,
            selectedProgramId,
            weekKey
          );
          if (clientContent?.sessions) {
            const planId = clientContent.source_plan_id || assignment.planId;
            const moduleId = clientContent.source_module_id;
            let sessions = clientContent.sessions;
            if (planId && moduleId) {
              try {
                const planSessions = await plansService.getSessionsByModule(planId, moduleId);
                const refBySessionId = new Map(planSessions.map((ps) => [ps.id, ps.librarySessionRef]).filter(([, ref]) => ref));
                if (refBySessionId.size > 0) {
                  sessions = clientContent.sessions.map((s) => {
                    const libraryRef = s.librarySessionRef ?? refBySessionId.get(s.id);
                    return libraryRef ? { ...s, librarySessionRef: libraryRef } : s;
                  });
                }
              } catch (_) {}
            }
            next[weekKey] = {
              sessions,
              title: clientContent.title,
              fromClientCopy: true,
              planId,
              moduleId
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
      if (!cancelled && user?.uid) {
        const weekKeys = Object.keys(next);
        if (weekKeys.length > 0) {
          try {
            const librarySessions = await libraryService.getSessionLibrary(user.uid);
            const libraryByTitle = new Map();
            for (const lib of librarySessions || []) {
              const t = (lib.title || lib.name || '').trim().toLowerCase();
              if (t && !libraryByTitle.has(t)) libraryByTitle.set(t, lib.id);
            }
            for (const weekKey of weekKeys) {
              const entry = next[weekKey];
              if (!entry?.sessions?.length) continue;
              const enriched = entry.sessions.map((s) => {
                if (s.librarySessionRef) return s;
                const title = (s.title || s.session_name || '').trim().toLowerCase();
                const matchedId = title ? libraryByTitle.get(title) : null;
                return matchedId ? { ...s, librarySessionRef: matchedId } : s;
              });
              next[weekKey] = { ...entry, sessions: enriched };
            }
          } catch (_) {}
        }
      }
      if (!cancelled) {
        setWeekContentByWeekKey((prevState) => ({ ...prevState, ...next }));
        setIsLoadingWeekContent(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [client?.clientUserId, selectedProgramId, currentDate.getFullYear(), currentDate.getMonth(), planAssignments, user?.uid]);

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

  // Load completed session IDs for this client+program (from users.courseProgress) - for calendar completion indicator
  useEffect(() => {
    if (!client?.clientUserId || !selectedProgramId) {
      console.log('[ClientProgramScreen] completedSessionIds: skip load (missing clientUserId or selectedProgramId)', {
        clientUserId: client?.clientUserId ?? null,
        selectedProgramId: selectedProgramId ?? null
      });
      setCompletedSessionIds(new Set());
      return;
    }
    let cancelled = false;
    console.log('[ClientProgramScreen] completedSessionIds: loading for', {
      clientUserId: client.clientUserId,
      selectedProgramId
    });
    clientProgramService.getClientCompletedSessionIds(selectedProgramId, client.clientUserId).then((ids) => {
      if (!cancelled) {
        console.log('[ClientProgramScreen] completedSessionIds: loaded', { size: ids.size, sample: ids.size ? [...ids].slice(0, 10) : [] });
        setCompletedSessionIds(ids);
      }
    }).catch((err) => {
      if (!cancelled) {
        console.error('[ClientProgramScreen] completedSessionIds: load failed', err?.message || err);
        setCompletedSessionIds(new Set());
      }
    });
    return () => { cancelled = true; };
  }, [client?.clientUserId, selectedProgramId]);

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
      const [programs, sessions] = await Promise.all([
        programService.getProgramsByCreator(user.uid),
        clientSessionService.getClientSessions(client.clientUserId, startDate, endDate)
      ]);
      const creatorProgramIds = new Set((programs || []).map((p) => p.id));
      const filtered = (sessions || []).filter((s) => creatorProgramIds.has(s.program_id));
      const enriched = await enrichPlannedSessionsWithTitles(filtered, user?.uid);
      setPlannedSessions(enriched);
      
      setIsSessionAssignmentModalOpen(false);
    } catch (error) {
      console.error('Error assigning session:', error);
      alert('Error al asignar la sesión');
    }
  };

  const handleSaveAccessEndDate = async () => {
    if (!client?.clientUserId || !infoProgramId) return;
    setAccessEndDateError(null);
    setIsSavingAccessEndDate(true);
    try {
      const value = infoNoEndDate ? null : (infoAccessEndDate ? new Date(infoAccessEndDate + 'T23:59:59.999Z').toISOString() : null);
      await clientProgramService.setClientProgramAccessEndDate(client.clientUserId, infoProgramId, value);
      const userDoc = await getUser(client.clientUserId);
      setClientUserDoc(userDoc);
    } catch (err) {
      setAccessEndDateError(err?.message || 'Error al guardar');
    } finally {
      setIsSavingAccessEndDate(false);
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

      // Load week content for the newly assigned week so session cards show immediately (no wait for effect)
      try {
        const modules = await plansService.getModulesByPlan(planId);
        const mod = modules?.[moduleIndex];
        if (mod) {
          const sessions = await plansService.getSessionsByModule(planId, mod.id);
          setWeekContentByWeekKey((prev) => ({
            ...prev,
            [weekKey]: {
              sessions: sessions || [],
              title: mod.title,
              fromClientCopy: false,
              planId,
              moduleId: mod.id
            }
          }));
        }
      } catch (err) {
        console.warn('Could not preload week content for new assignment:', err);
      }

      console.log('✅ Plan assigned to week:', { programId: selectedProgramId, planId, weekKey, moduleIndex });
    } catch (error) {
      console.error('Error assigning plan to week:', error);
      alert(`Error al asignar el plan a la semana: ${error.message || 'Error desconocido'}`);
    }
  };

  const handleRemovePlanFromWeek = async (weekKey) => {
    if (!client?.clientUserId || !selectedProgramId || !weekKey) return;
    try {
      await clientProgramService.removePlanFromWeek(selectedProgramId, client.clientUserId, weekKey);
      const assignments = await clientProgramService.getPlanAssignments(selectedProgramId, client.clientUserId);
      setPlanAssignments(assignments || {});
      setWeekContentByWeekKey((prev) => {
        const next = { ...prev };
        delete next[weekKey];
        return next;
      });
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const [programs, sessions] = await Promise.all([
        programService.getProgramsByCreator(user.uid),
        clientSessionService.getClientSessions(client.clientUserId, startDate, endDate)
      ]);
      const creatorProgramIds = new Set((programs || []).map((p) => p.id));
      const filtered = (sessions || []).filter((s) => creatorProgramIds.has(s.program_id));
      const enriched = await enrichPlannedSessionsWithTitles(filtered, user?.uid);
      setPlannedSessions(enriched);
    } catch (error) {
      console.error('Error removing plan from week:', error);
      alert(`Error al quitar el plan de la semana: ${error.message || 'Error desconocido'}`);
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
      const [programs, sessions] = await Promise.all([
        programService.getProgramsByCreator(user.uid),
        clientSessionService.getClientSessions(client.clientUserId, startDate, endDate)
      ]);
      const creatorProgramIds = new Set((programs || []).map((p) => p.id));
      const filtered = (sessions || []).filter((s) => creatorProgramIds.has(s.program_id));
      const enriched = await enrichPlannedSessionsWithTitles(filtered, user?.uid);
      setPlannedSessions(enriched);
    } catch (error) {
      console.error('[ClientProgramScreen] handleSessionAssignment error:', error);
      alert('Error al asignar la sesión');
    }
  };

  const handleEditSessionAssignment = ({ session, date }) => {
    if (!client?.clientUserId || !session?.session_id) return;
    if (session.plan_id) {
      navigate(`/content/sessions/${session.session_id}`, {
        state: {
          editScope: 'client_plan',
          clientId: client.clientUserId,
          programId: selectedProgramId,
          weekKey: getMondayWeek(date),
          clientName: client?.clientName || client?.name || client?.displayName || 'Cliente'
        }
      });
      return;
    }
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
      const [programs, sessions] = await Promise.all([
        programService.getProgramsByCreator(user.uid),
        clientSessionService.getClientSessions(client.clientUserId, startDate, endDate)
      ]);
      const creatorProgramIds = new Set((programs || []).map((p) => p.id));
      const filtered = (sessions || []).filter((s) => creatorProgramIds.has(s.program_id));
      const enriched = await enrichPlannedSessionsWithTitles(filtered, user?.uid);
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
                  clientUserId={client?.clientUserId}
                  onDateSelect={handleDateSelect}
                  plannedSessions={plannedSessions}
                  programColors={programColors}
                  completedSessionIds={completedSessionIds}
                  onMonthChange={setCurrentDate}
                  planAssignments={planAssignments}
                  plans={plans}
                  planWeeksCount={planWeeksCount}
                  onPlanAssignment={handlePlanAssignment}
                  onRemovePlanFromWeek={handleRemovePlanFromWeek}
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
                  onVerDesempeno={setPerformanceModalContext}
                />
                <SessionPerformanceModal
                  isOpen={!!performanceModalContext}
                  onClose={() => setPerformanceModalContext(null)}
                  clientUserId={client?.clientUserId ?? null}
                  creatorId={user?.uid ?? null}
                  programId={selectedProgramId ?? null}
                  session={performanceModalContext?.session ?? null}
                  dateStr={performanceModalContext?.date
                    ? (performanceModalContext.date instanceof Date
                        ? performanceModalContext.date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                        : String(performanceModalContext.date))
                    : performanceModalContext?.weekKey ?? null}
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
        const assignedForInfo = assignedPrograms.filter((p) => p.isAssigned) || [];
        const currentExpiresAt = infoProgramId && clientUserDoc?.courses?.[infoProgramId]?.expires_at;
        const currentStatusText = (() => {
          if (!currentExpiresAt) return 'Sin fecha de fin';
          try {
            const d = new Date(currentExpiresAt);
            const far = new Date();
            far.setFullYear(far.getFullYear() + 2);
            if (d > far) return 'Sin fecha de fin';
            return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
          } catch {
            return 'Sin fecha de fin';
          }
        })();
        const savedAccessState = (() => {
          if (!infoProgramId || !clientUserDoc?.courses?.[infoProgramId]) return { noEndDate: true, date: '' };
          const exp = clientUserDoc.courses[infoProgramId].expires_at;
          if (!exp) return { noEndDate: true, date: '' };
          try {
            const d = new Date(exp);
            const far = new Date();
            far.setFullYear(far.getFullYear() + 2);
            if (d > far) return { noEndDate: true, date: '' };
            return { noEndDate: false, date: d.toISOString().slice(0, 10) };
          } catch {
            return { noEndDate: true, date: '' };
          }
        })();
        const hasAccessFormChanged = infoProgramId && clientUserDoc?.courses?.[infoProgramId] && (
          infoNoEndDate !== savedAccessState.noEndDate ||
          (!infoNoEndDate && (infoAccessEndDate || '') !== savedAccessState.date)
        );
        const profileName = clientUserDoc?.displayName || clientUserDoc?.name || client?.clientName || null;
        const profileEmail = clientUserDoc?.email || client?.clientEmail || null;
        const hasProfile = profileName || profileEmail;
        return (
          <div className="client-program-tab-content client-program-info-tab">
            {loadingClientUser ? (
              <div className="client-program-info-loading">
                <div className="client-program-info-loading-skeleton client-program-info-loading-skeleton-avatar" />
                <div className="client-program-info-loading-skeleton client-program-info-loading-skeleton-line" />
                <div className="client-program-info-loading-skeleton client-program-info-loading-skeleton-line short" />
                <div className="client-program-info-loading-skeleton client-program-info-loading-skeleton-card" />
              </div>
            ) : accessEndDateError && !clientUserDoc ? (
              <div className="client-program-info-err-block">
                <span className="client-program-info-err-icon" aria-hidden>!</span>
                <p className="client-program-info-error">{accessEndDateError}</p>
              </div>
            ) : assignedForInfo.length === 0 ? (
              <div className="client-program-info-empty-block">
                <span className="client-program-info-empty-icon" aria-hidden>◇</span>
                <p className="client-program-info-empty">Este cliente no tiene programas asignados</p>
                <p className="client-program-info-empty-hint">Ve a la pestaña Planificación y asígnale un programa para gestionar su acceso aquí.</p>
              </div>
            ) : (
              <div className={`client-program-info-layout ${!hasProfile ? 'client-program-info-layout--no-profile' : ''}`}>
                {hasProfile && (
                  <section className="client-program-info-profile-card">
                    <div className="client-program-info-profile-header">
                      <div className="client-program-info-profile-avatar">
                        {(profileName || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="client-program-info-profile-heading">
                        <h3 className="client-program-info-profile-name">{profileName || 'Sin nombre'}</h3>
                        {profileEmail && (
                          <a href={`mailto:${profileEmail}`} className="client-program-info-profile-email">{profileEmail}</a>
                        )}
                      </div>
                    </div>
                    <div className="client-program-info-profile-fields">
                      {(clientUserDoc?.age != null && clientUserDoc?.age !== '') && (
                        <div className="client-program-info-profile-field">
                          <span className="client-program-info-profile-field-label">Edad</span>
                          <span className="client-program-info-profile-field-value">{clientUserDoc.age} años</span>
                        </div>
                      )}
                      {(clientUserDoc?.country || clientUserDoc?.city) && (
                        <div className="client-program-info-profile-field">
                          <span className="client-program-info-profile-field-label">Ubicación</span>
                          <span className="client-program-info-profile-field-value">
                            {[clientUserDoc?.city, clientUserDoc?.country].filter(Boolean).join(', ') || '—'}
                          </span>
                        </div>
                      )}
                      {(clientUserDoc?.height != null && clientUserDoc?.height !== '') && (
                        <div className="client-program-info-profile-field">
                          <span className="client-program-info-profile-field-label">Altura</span>
                          <span className="client-program-info-profile-field-value">{clientUserDoc.height} cm</span>
                        </div>
                      )}
                      {(clientUserDoc?.initialWeight != null && clientUserDoc?.initialWeight !== '') && (
                        <div className="client-program-info-profile-field">
                          <span className="client-program-info-profile-field-label">Peso inicial</span>
                          <span className="client-program-info-profile-field-value">{clientUserDoc.initialWeight} kg</span>
                        </div>
                      )}
                      {clientUserDoc?.gender && (
                        <div className="client-program-info-profile-field">
                          <span className="client-program-info-profile-field-label">Género</span>
                          <span className="client-program-info-profile-field-value">{clientUserDoc.gender}</span>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                <section className="client-program-info-access-card">
                  <div className="client-program-info-access-card-inner">
                    <header className="client-program-info-access-card-header">
                      <h3 className="client-program-info-access-card-title">Programa y acceso</h3>
                    </header>

                    <div className="client-program-info-access-card-row">
                      <div className="client-program-info-access-card-program-block">
                        <span className="client-program-info-access-card-label">Programa</span>
                        <div className="client-program-info-program-list">
                          {assignedForInfo.map((program) => (
                            <button
                              key={program.id}
                              type="button"
                              className={`client-program-info-program-item ${infoProgramId === program.id ? 'client-program-info-program-item--selected' : ''}`}
                              onClick={() => setInfoProgramId(program.id)}
                            >
                              {program.image_url ? (
                                <span className="client-program-info-program-thumb" style={{ backgroundImage: `url(${program.image_url})` }} />
                              ) : (
                                <span className="client-program-info-program-initial">
                                  {(program.title || 'P').charAt(0).toUpperCase()}
                                </span>
                              )}
                              <span className="client-program-info-program-name">
                                {program.title || `Programa ${program.id.slice(0, 8)}`}
                              </span>
                              {infoProgramId === program.id && (
                                <span className="client-program-info-program-check" aria-hidden>✓</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {infoProgramId && clientUserDoc?.courses?.[infoProgramId] ? (
                        <div className="client-program-info-access-card-end-block">
                          <span className="client-program-info-access-card-label">Fin de acceso</span>
                          <div className="client-program-info-status-card">
                            <span className="client-program-info-status-label">Ahora</span>
                            <span className="client-program-info-status-value">{currentStatusText}</span>
                          </div>
                          <div className="client-program-info-access-row">
                            <span className="client-program-info-access-label">Cambiar a</span>
                            <div className="client-program-info-access-controls">
                              <button
                                type="button"
                                className={`client-program-info-access-btn ${infoNoEndDate ? 'client-program-info-access-btn--on' : ''}`}
                                onClick={() => { setInfoNoEndDate(true); setInfoAccessEndDate(''); }}
                              >
                                Sin fecha
                              </button>
                              <button
                                type="button"
                                className={`client-program-info-access-btn ${!infoNoEndDate ? 'client-program-info-access-btn--on' : ''}`}
                                onClick={() => setInfoNoEndDate(false)}
                              >
                                Hasta
                              </button>
                              {!infoNoEndDate && (
                                <input
                                  type="date"
                                  className="client-program-info-date"
                                  value={infoAccessEndDate}
                                  onChange={(e) => setInfoAccessEndDate(e.target.value)}
                                />
                              )}
                            </div>
                          </div>
                          {accessEndDateError && (
                            <p className="client-program-info-msg client-program-info-msg--error">{accessEndDateError}</p>
                          )}
                          <Button
                            title={isSavingAccessEndDate ? 'Guardando…' : 'Guardar cambios'}
                            onClick={handleSaveAccessEndDate}
                            disabled={!hasAccessFormChanged || isSavingAccessEndDate}
                            loading={isSavingAccessEndDate}
                          />
                        </div>
                      ) : (
                        <div className="client-program-info-access-card-end-block client-program-info-access-card-end-block--empty">
                          <span className="client-program-info-access-card-label">Fin de acceso</span>
                          <p className="client-program-info-access-empty-hint">Selecciona un programa para gestionar su fecha de fin de acceso.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            )}
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
