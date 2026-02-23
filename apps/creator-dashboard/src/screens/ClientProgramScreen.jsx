import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Button from '../components/Button';
import Input from '../components/Input';
import CalendarView from '../components/CalendarView';
import WeekVolumeDrawer from '../components/WeekVolumeDrawer';
import SessionAssignmentModal from '../components/SessionAssignmentModal';
import SessionPerformanceModal from '../components/SessionPerformanceModal';
import PlanningLibrarySidebar from '../components/PlanningLibrarySidebar';
import Modal from '../components/Modal';
import plansService from '../services/plansService';
import oneOnOneService from '../services/oneOnOneService';
import clientSessionService from '../services/clientSessionService';
import clientProgramService from '../services/clientProgramService';
import clientPlanContentService from '../services/clientPlanContentService';
import programService from '../services/programService';
import libraryService from '../services/libraryService';
import * as nutritionDb from '../services/nutritionFirestoreService';
import clientNutritionPlanContentService from '../services/clientNutritionPlanContentService';
import { getUser } from '../services/firestoreService';
import { getWeeksBetween, getMondayWeek, getWeekDates } from '../utils/weekCalculation';
import { computePlannedMuscleVolumes, getPrimaryReferences } from '../utils/plannedVolumeUtils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import './ClientProgramScreen.css';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MINI_DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const NUTRITION_DRAG_TYPE = 'nutrition_plan';

function getMiniCalendarDays(monthFirst) {
  const year = monthFirst.getFullYear();
  const month = monthFirst.getMonth();
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7;
  const startDate = new Date(first);
  startDate.setDate(first.getDate() - startDow);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push({ date: d, day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return cells;
}

function toLocalDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function assignmentDateToISO(value) {
  if (!value) return '';
  const d = value?.toDate ? value.toDate() : (typeof value === 'string' ? new Date(value) : value);
  return d && !isNaN(d.getTime()) ? toLocalDateISO(d) : '';
}


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
  const location = useLocation();
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
  const [performanceModalContext, setPerformanceModalContext] = useState(null); // { session, type, date?, weekKey?, weekContent? } or { historyOnlyData } from calendar history-only cards
  const [sessionHistory, setSessionHistory] = useState([]); // Completed sessions from sessionHistory (independent of plans)
  const [isLoadingSessionHistory, setIsLoadingSessionHistory] = useState(false);
  // Info tab: client user doc and access end date form
  const [clientUserDoc, setClientUserDoc] = useState(null);
  const [loadingClientUser, setLoadingClientUser] = useState(false);
  const [infoProgramId, setInfoProgramId] = useState(null);
  const [infoAccessEndDate, setInfoAccessEndDate] = useState('');
  const [infoNoEndDate, setInfoNoEndDate] = useState(true);
  const [isSavingAccessEndDate, setIsSavingAccessEndDate] = useState(false);
  const [accessEndDateError, setAccessEndDateError] = useState(null);
  // Planificación tab: loading states for async actions (prevent double-submit, show feedback)
  const [isAddingSessionToPlanDay, setIsAddingSessionToPlanDay] = useState(false);
  const [addingToWeekKey, setAddingToWeekKey] = useState(null); // weekKey of day we're adding to (for loading state on cell)
  const [addingToDayIndex, setAddingToDayIndex] = useState(null); // 0-6 day index
  const [addingSessionIdInModal, setAddingSessionIdInModal] = useState(null); // which session id is being added in modal
  const [isPersonalizingPlanWeek, setIsPersonalizingPlanWeek] = useState(false);
  const [isResettingPlanWeek, setIsResettingPlanWeek] = useState(false);
  const [isDeletingPlanSession, setIsDeletingPlanSession] = useState(false);
  const [isMovingPlanSession, setIsMovingPlanSession] = useState(false);
  const [weekVolumeDrawerOpen, setWeekVolumeDrawerOpen] = useState(false);
  const [selectedWeekKeyForVolume, setSelectedWeekKeyForVolume] = useState('');
  const [weekVolumeLoading, setWeekVolumeLoading] = useState(false);
  const [weekVolumeMuscleVolumes, setWeekVolumeMuscleVolumes] = useState({});
  const [isAssigningPlan, setIsAssigningPlan] = useState(false);
  const [assigningPlanWeekKey, setAssigningPlanWeekKey] = useState(null);
  const [isRemovingPlanFromWeek, setIsRemovingPlanFromWeek] = useState(false);
  const [removingPlanWeekKey, setRemovingPlanWeekKey] = useState(null);
  const [isAssigningSession, setIsAssigningSession] = useState(false);
  const [isDeletingSessionAssignment, setIsDeletingSessionAssignment] = useState(false);
  // Nutrition tab: creator's plans, client's assignment, assign form
  const [nutritionPlans, setNutritionPlans] = useState([]);
  const [clientNutritionAssignments, setClientNutritionAssignments] = useState([]);
  const [nutritionAssignPlanId, setNutritionAssignPlanId] = useState('');
  const [nutritionAssignStartDate, setNutritionAssignStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [nutritionAssignNoEndDate, setNutritionAssignNoEndDate] = useState(true);
  const [nutritionAssignEndDate, setNutritionAssignEndDate] = useState('');
  const [isNutritionLoading, setIsNutritionLoading] = useState(false);
  const [isAssigningNutrition, setIsAssigningNutrition] = useState(false);
  const [isEndingNutrition, setIsEndingNutrition] = useState(false);
  const [nutritionPlanSearchQuery, setNutritionPlanSearchQuery] = useState('');
  const [nutritionAssignModalPlan, setNutritionAssignModalPlan] = useState(null);
  const [nutritionModalStartDate, setNutritionModalStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [nutritionModalNoEndDate, setNutritionModalNoEndDate] = useState(true);
  const [nutritionModalEndDate, setNutritionModalEndDate] = useState('');
  const [nutritionDropZoneActive, setNutritionDropZoneActive] = useState(false);
  const [nutritionModalCalendarMonth, setNutritionModalCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [nutritionModalEditingEnd, setNutritionModalEditingEnd] = useState(false);
  const [nutritionModalEditingAssignmentId, setNutritionModalEditingAssignmentId] = useState(null);
  const [nutritionCurrentCardMenuOpen, setNutritionCurrentCardMenuOpen] = useState(false);
  const [nutritionPlanDetail, setNutritionPlanDetail] = useState(null);
  const [isLoadingNutritionPlanDetail, setIsLoadingNutritionPlanDetail] = useState(false);

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

  // Restore tab when returning from session edit (back button passed returnState.tab)
  useEffect(() => {
    const tab = location.state?.tab;
    if (typeof tab === 'number' && tab >= 0 && tab < TAB_CONFIG.length) {
      setCurrentTabIndex(tab);
    }
  }, [location.pathname, location.state?.tab]);

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

  const isNutricionTab = TAB_CONFIG[currentTabIndex]?.key === 'nutricion';
  useEffect(() => {
    if (!isNutricionTab || !user?.uid) return;
    let cancelled = false;
    setIsNutritionLoading(true);
    nutritionDb.getPlansByCreator(user.uid).then((list) => {
      if (!cancelled) setNutritionPlans(list);
    }).catch((e) => {
      if (!cancelled) setNutritionPlans([]);
    }).finally(() => {
      if (!cancelled) setIsNutritionLoading(false);
    });
  }, [isNutricionTab, user?.uid]);

  useEffect(() => {
    if (!isNutricionTab || !client?.clientUserId) return;
    let cancelled = false;
    nutritionDb.getAssignmentsByUser(client.clientUserId).then((list) => {
      if (!cancelled) setClientNutritionAssignments(list);
    }).catch(() => {
      if (!cancelled) setClientNutritionAssignments([]);
    });
  }, [isNutricionTab, client?.clientUserId]);

  // Load plan detail and meals (for summary: objectives, categories, recipe resolution) when client has an assignment
  useEffect(() => {
    const assignment = clientNutritionAssignments[0] || null;
    if (!assignment?.planId || !user?.uid) {
      setNutritionPlanDetail(null);
      return;
    }
    let cancelled = false;
    setIsLoadingNutritionPlanDetail(true);
    (async () => {
      try {
        const [clientCopy, plan] = await Promise.all([
          clientNutritionPlanContentService.getByAssignmentId(assignment.id),
          nutritionDb.getPlanById(user.uid, assignment.planId),
        ]);
        if (cancelled) return;
        if (clientCopy?.categories?.length) {
          setNutritionPlanDetail({
            daily_calories: clientCopy.daily_calories ?? null,
            daily_protein_g: clientCopy.daily_protein_g ?? null,
            daily_carbs_g: clientCopy.daily_carbs_g ?? null,
            daily_fat_g: clientCopy.daily_fat_g ?? null,
            categories: clientCopy.categories,
          });
          return;
        }
        setNutritionPlanDetail(plan ? {
          daily_calories: plan.daily_calories ?? null,
          daily_protein_g: plan.daily_protein_g ?? null,
          daily_carbs_g: plan.daily_carbs_g ?? null,
          daily_fat_g: plan.daily_fat_g ?? null,
          categories: plan.categories ?? [],
        } : null);
      } catch (e) {
        if (!cancelled) setNutritionPlanDetail(null);
      } finally {
        if (!cancelled) setIsLoadingNutritionPlanDetail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientNutritionAssignments, user?.uid]);

  const nutritionObjectivesPieData = useMemo(() => {
    const p = Number(nutritionPlanDetail?.daily_protein_g) || 0;
    const c = Number(nutritionPlanDetail?.daily_carbs_g) || 0;
    const f = Number(nutritionPlanDetail?.daily_fat_g) || 0;
    const totalG = p + c + f;
    if (totalG <= 0) return [];
    return [
      { name: 'Proteína', value: p, grams: p },
      { name: 'Carbohidratos', value: c, grams: c },
      { name: 'Grasa', value: f, grams: f },
    ].filter((d) => d.value > 0);
  }, [nutritionPlanDetail?.daily_protein_g, nutritionPlanDetail?.daily_carbs_g, nutritionPlanDetail?.daily_fat_g]);

  async function handleAssignNutritionPlan(overrides = null) {
    const planId = overrides?.planId ?? nutritionAssignPlanId;
    const startDate = overrides?.startDate ?? nutritionAssignStartDate;
    const noEndDate = overrides?.noEndDate ?? nutritionAssignNoEndDate;
    const endDate = overrides?.endDate ?? nutritionAssignEndDate;
    const assignmentId = overrides?.assignmentId ?? nutritionModalEditingAssignmentId;
    if (!client?.clientUserId || !planId || !user?.uid) return;
    if (assignmentId && !startDate) return;
    setIsAssigningNutrition(true);
    try {
      if (assignmentId) {
        await nutritionDb.updateAssignment(assignmentId, {
          startDate: startDate || null,
          endDate: noEndDate ? null : (endDate || null),
        });
        setNutritionModalEditingAssignmentId(null);
        setNutritionAssignModalPlan(null);
      } else {
        const planSnapshot = await nutritionDb.getPlanById(user.uid, planId);
      await nutritionDb.createAssignment({
        userId: client.clientUserId,
          planId,
        plan: planSnapshot ? { id: planSnapshot.id, name: planSnapshot.name, description: planSnapshot.description, daily_calories: planSnapshot.daily_calories, daily_protein_g: planSnapshot.daily_protein_g, daily_carbs_g: planSnapshot.daily_carbs_g, daily_fat_g: planSnapshot.daily_fat_g, categories: planSnapshot.categories } : null,
        assignedBy: user.uid,
        source: 'one_on_one',
        programId: selectedProgramId ?? null,
          startDate: startDate || null,
          endDate: noEndDate ? null : (endDate || null),
      });
      setNutritionAssignPlanId('');
      setNutritionAssignEndDate('');
        setNutritionAssignModalPlan(null);
      }
      const list = await nutritionDb.getAssignmentsByUser(client.clientUserId);
      setClientNutritionAssignments(list);
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Error al asignar plan');
    } finally {
      setIsAssigningNutrition(false);
    }
  }

  async function handleEndNutritionAssignment(assignmentId) {
    if (!assignmentId) return;
    setIsEndingNutrition(true);
    try {
      try {
        await clientNutritionPlanContentService.deleteByAssignmentId(assignmentId);
      } catch (e) {
        console.warn('Could not delete client nutrition plan copy:', e?.message);
      }
      await nutritionDb.deleteAssignment(assignmentId);
      const list = await nutritionDb.getAssignmentsByUser(client.clientUserId);
      setClientNutritionAssignments(list);
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Error al quitar asignación');
    } finally {
      setIsEndingNutrition(false);
    }
  }

  // Sync info program selector when assignedPrograms loads (so Planificación uses same program as Info)
  useEffect(() => {
    if (assignedPrograms.length === 0) return;
    const assigned = assignedPrograms.filter((p) => p.isAssigned);
    if (assigned.length > 0 && !infoProgramId) setInfoProgramId(assigned[0].id);
  }, [assignedPrograms, infoProgramId]);

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

  const weekVolumeWeekOptions = useMemo(() => {
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
    const weekKeys = getWeeksBetween(startDate, endDate);
    return weekKeys.map((weekKey) => {
      const { start, end } = getWeekDates(weekKey);
      const d = (date) => `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
      const label = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()
        ? `${start.getDate()}–${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`
        : `${d(start)} – ${d(end)} ${end.getFullYear()}`;
      return { value: weekKey, label };
    });
  }, [currentDate]);

  useEffect(() => {
    if (!weekVolumeDrawerOpen || !selectedWeekKeyForVolume || !user?.uid) {
      if (!weekVolumeDrawerOpen) setWeekVolumeMuscleVolumes({});
      return;
    }
    const weekContent = weekContentByWeekKey[selectedWeekKeyForVolume];
    const sessions = weekContent?.sessions ?? [];
    const allExercises = sessions.flatMap((s) => s.exercises || []);
    if (allExercises.length === 0) {
      setWeekVolumeMuscleVolumes({});
      setWeekVolumeLoading(false);
      return;
    }
    const libraryIds = new Set();
    allExercises.forEach((ex) => {
      getPrimaryReferences(ex).forEach(({ libraryId }) => {
        if (libraryId) libraryIds.add(libraryId);
      });
    });
    let cancelled = false;
    setWeekVolumeLoading(true);
    (async () => {
      try {
        const libraryDataCache = {};
        for (const libraryId of libraryIds) {
          const lib = await libraryService.getLibraryById(libraryId);
          if (cancelled) return;
          if (lib) libraryDataCache[libraryId] = lib;
        }
        if (cancelled) return;
        const volumes = computePlannedMuscleVolumes(allExercises, libraryDataCache);
        setWeekVolumeMuscleVolumes(volumes);
      } catch (err) {
        console.warn('[ClientProgramScreen] Week volume load failed:', err);
        if (!cancelled) setWeekVolumeMuscleVolumes({});
      } finally {
        if (!cancelled) setWeekVolumeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [weekVolumeDrawerOpen, selectedWeekKeyForVolume, user?.uid, weekContentByWeekKey]);

  const openWeekVolumeDrawer = useCallback(() => {
    setSelectedWeekKeyForVolume('');
    setWeekVolumeDrawerOpen(true);
  }, []);

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

  // Load session history when Planificación tab is active (for calendar completed indicators and history-only cards)
  const isPlanificacionTab = TAB_CONFIG[currentTabIndex]?.key === 'planificacion';
  const needsSessionHistory = isPlanificacionTab;

  // When on Planificación tab, use the program selected in Info (no selector on Planificación)
  useEffect(() => {
    if (isPlanificacionTab && infoProgramId) setSelectedProgramId(infoProgramId);
  }, [isPlanificacionTab, infoProgramId]);

  useEffect(() => {
    if (!needsSessionHistory || !client?.clientUserId || !selectedProgramId) {
      if (needsSessionHistory && (!client?.clientUserId || !selectedProgramId)) {
        setSessionHistory([]);
      }
      return;
    }
    let cancelled = false;
    setIsLoadingSessionHistory(true);
    setSessionHistory([]);
    clientProgramService.getClientSessionHistory(selectedProgramId, client.clientUserId).then((items) => {
      if (!cancelled) setSessionHistory(items);
    }).catch((err) => {
      if (!cancelled) {
        console.error('[ClientProgramScreen] sessionHistory load failed', err?.message);
        setSessionHistory([]);
      }
    }).finally(() => {
      if (!cancelled) setIsLoadingSessionHistory(false);
    });
    return () => { cancelled = true; };
  }, [needsSessionHistory, client?.clientUserId, selectedProgramId]);

  // Map session history to date for calendar (so completed sessions persist when plan is deleted)
  const completedSessionsByDate = useMemo(() => {
    const map = {};
    if (!sessionHistory?.length) return map;
    sessionHistory.forEach((item) => {
      const completedAt = item.completedAt;
      if (!completedAt) return;
      const d = typeof completedAt === 'string' ? new Date(completedAt) : completedAt;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(item);
    });
    return map;
  }, [sessionHistory]);

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
    setIsAssigningPlan(true);
    setAssigningPlanWeekKey(weekKey);
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

      // Assign all weeks of the plan to consecutive calendar weeks starting at weekKey
      const { weekKeys: assignedWeekKeys } = await clientProgramService.assignPlanToConsecutiveWeeks(
        selectedProgramId,
        client.clientUserId,
        planId,
        weekKey
      );

      const assignments = await clientProgramService.getPlanAssignments(
        selectedProgramId,
        client.clientUserId
      );
      setPlanAssignments(assignments || {});

      // Preload week content for all assigned weeks so session cards show immediately
      try {
        const modules = await plansService.getModulesByPlan(planId);
        const next = {};
        for (let i = 0; i < assignedWeekKeys.length; i++) {
          const wk = assignedWeekKeys[i];
          const mod = modules?.[i];
          if (mod) {
            const sessions = await plansService.getSessionsByModule(planId, mod.id);
            next[wk] = {
              sessions: sessions || [],
              title: mod.title,
              fromClientCopy: false,
              planId,
              moduleId: mod.id
            };
          }
        }
        setWeekContentByWeekKey((prev) => ({ ...prev, ...next }));
      } catch (err) {
        console.warn('Could not preload week content for new assignment:', err);
      }

      console.log('✅ Plan assigned to consecutive weeks:', { programId: selectedProgramId, planId, weekKey, count: assignedWeekKeys.length });
    } catch (error) {
      console.error('Error assigning plan:', error);
      alert(error?.message === 'Este plan no tiene semanas.' ? error.message : `Error al asignar el plan: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsAssigningPlan(false);
      setAssigningPlanWeekKey(null);
    }
  };

  const handleRemovePlanFromWeek = async (weekKey) => {
    if (!client?.clientUserId || !selectedProgramId || !weekKey) return;
    setIsRemovingPlanFromWeek(true);
    setRemovingPlanWeekKey(weekKey);
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
    } finally {
      setIsRemovingPlanFromWeek(false);
      setRemovingPlanWeekKey(null);
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
    setIsAssigningSession(true);
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
    } finally {
      setIsAssigningSession(false);
    }
  };

  const handleEditSessionAssignment = ({ session, date }) => {
    if (!client?.clientUserId || !session?.session_id) return;
    const returnState = { tab: currentTabIndex };
    if (session.plan_id) {
      navigate(`/content/sessions/${session.session_id}`, {
        state: {
          returnTo: location.pathname,
          returnState,
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
        returnTo: location.pathname,
        returnState,
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
    setIsDeletingSessionAssignment(true);
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
    } finally {
      setIsDeletingSessionAssignment(false);
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
    setIsPersonalizingPlanWeek(true);
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
        module.id,
        user?.uid
      );
      setHasClientPlanCopy(true);
    } catch (error) {
      console.error('Error personalizando plan:', error);
      alert(error.message || 'Error al personalizar la semana');
    } finally {
      setIsPersonalizingPlanWeek(false);
    }
  };

  const handleResetPlanWeek = async ({ assignment, weekKey }) => {
    if (!client?.clientUserId || !selectedProgramId || weekKey == null || !assignment?.planId) return;
    if (!window.confirm('¿Restablecer esta semana al plan original? Se usará de nuevo el contenido del plan para todos.')) return;
    setIsResettingPlanWeek(true);
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
    } finally {
      setIsResettingPlanWeek(false);
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
          weekContent.moduleId,
          user?.uid
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
          returnTo: location.pathname,
          returnState: { tab: currentTabIndex },
          editScope: 'client_plan',
          clientId: client.clientUserId,
          programId: selectedProgramId,
          weekKey,
          clientName: client?.clientName || client?.name || client?.displayName || 'Cliente'
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
    setIsDeletingPlanSession(true);
    try {
      if (!weekContent?.fromClientCopy) {
        await clientPlanContentService.copyFromPlan(
          client.clientUserId,
          selectedProgramId,
          weekKey,
          weekContent.planId,
          weekContent.moduleId,
          user?.uid
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
    } finally {
      setIsDeletingPlanSession(false);
    }
  };

  const handleMovePlanSessionDay = async ({ session, weekKey, weekContent, targetDayIndex }) => {
    if (!client?.clientUserId || !selectedProgramId || !session?.id || weekKey == null || targetDayIndex == null) return;
    const prevContent = weekContentByWeekKey[weekKey];
    const optimisticSessions = (weekContent?.sessions || []).map((s) =>
      s.id === session.id
        ? { ...s, dayIndex: targetDayIndex, day_index: targetDayIndex }
        : s
    );
    setWeekContentByWeekKey((prev) => ({
      ...prev,
      [weekKey]: {
        ...weekContent,
        sessions: optimisticSessions,
        fromClientCopy: weekContent?.fromClientCopy ?? true
      }
    }));
    try {
      if (!weekContent.fromClientCopy) {
        await clientPlanContentService.copyFromPlan(
          client.clientUserId,
          selectedProgramId,
          weekKey,
          weekContent.planId,
          weekContent.moduleId,
          user?.uid
        );
      }
      await clientPlanContentService.updateSession(
        client.clientUserId,
        selectedProgramId,
        weekKey,
        session.id,
        { dayIndex: targetDayIndex }
      );
    } catch (error) {
      console.error('Error moving plan session day:', error);
      setWeekContentByWeekKey((prev) => ({
        ...prev,
        ...(prevContent != null && { [weekKey]: prevContent })
      }));
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
    setIsMovingPlanSession(true);
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
    } finally {
      setIsMovingPlanSession(false);
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
          { planId: assignment.planId, moduleId: mod.id, creatorId: user.uid }
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
    setIsAddingSessionToPlanDay(true);
    setAddingToWeekKey(weekKey);
    setAddingToDayIndex(dayIndex);
    try {
      await addLibrarySessionToPlanWeek(weekKey, dayIndex, librarySessionId);
    } catch (error) {
      console.error('Error adding library session to plan day:', error);
      alert(error.message || 'Error al añadir la sesión');
    } finally {
      setIsAddingSessionToPlanDay(false);
      setAddingToWeekKey(null);
      setAddingToDayIndex(null);
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
    setAddingSessionIdInModal(librarySessionId);
    setIsAddingSessionToPlanDay(true);
    setAddingToWeekKey(addPlanSessionTarget.weekKey);
    setAddingToDayIndex(addPlanSessionTarget.dayIndex);
    try {
      await addLibrarySessionToPlanWeek(addPlanSessionTarget.weekKey, addPlanSessionTarget.dayIndex, librarySessionId);
      setAddPlanSessionTarget(null);
    } catch (error) {
      console.error('Error adding session:', error);
      alert(error.message || 'Error al añadir');
    } finally {
      setIsAddingSessionToPlanDay(false);
      setAddingSessionIdInModal(null);
      setAddingToWeekKey(null);
      setAddingToDayIndex(null);
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
            {/* Layout: left (library - sessions/plans only), right (calendar). Program is chosen in Info tab. */}
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
                  completedSessionsByDate={completedSessionsByDate}
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
                  isAddingSessionToPlanDay={isAddingSessionToPlanDay}
                  addingToWeekKey={addingToWeekKey}
                  addingToDayIndex={addingToDayIndex}
                  isPersonalizingPlanWeek={isPersonalizingPlanWeek}
                  isResettingPlanWeek={isResettingPlanWeek}
                  isDeletingPlanSession={isDeletingPlanSession}
                  isMovingPlanSession={isMovingPlanSession}
                  isAssigningPlan={isAssigningPlan}
                  assigningPlanWeekKey={assigningPlanWeekKey}
                  isRemovingPlanFromWeek={isRemovingPlanFromWeek}
                  removingPlanWeekKey={removingPlanWeekKey}
                  isAssigningSession={isAssigningSession}
                  isDeletingSessionAssignment={isDeletingSessionAssignment}
                  showVolumeButton
                  onVolumeClick={openWeekVolumeDrawer}
                  onWeekClick={(weekKey) => {
                    setSelectedWeekKeyForVolume(weekKey);
                    setWeekVolumeDrawerOpen(true);
                  }}
                />
                <WeekVolumeDrawer
                  isOpen={weekVolumeDrawerOpen}
                  onClose={() => setWeekVolumeDrawerOpen(false)}
                  title="Volumen de la semana"
                  subtitle="Series efectivas por músculo (intensidad ≥7) para esta semana."
                  weekOptions={weekVolumeWeekOptions}
                  selectedWeekValue={selectedWeekKeyForVolume}
                  onWeekChange={setSelectedWeekKeyForVolume}
                  loading={weekVolumeLoading}
                  plannedMuscleVolumes={weekVolumeMuscleVolumes}
                  emptyMessage="Esta semana no tiene sesiones con ejercicios (e intensidad ≥7), o el contenido aún no se ha cargado."
                  promptWhenNoWeek="Haz clic en una semana del calendario para ver el volumen."
                  variant="card"
                  displayMonth={currentDate}
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
                  <div className="client-program-modal-overlay" onClick={() => !isAddingSessionToPlanDay && setAddPlanSessionTarget(null)}>
                    <div className="client-program-add-plan-session-modal" onClick={(e) => e.stopPropagation()}>
                      <h3>Añadir sesión a este día (solo este cliente)</h3>
                      <p className="client-program-add-plan-session-hint">Elige una sesión de tu biblioteca para añadirla a la semana del plan.</p>
                      {isLoadingLibrarySessions ? (
                        <p>Cargando sesiones...</p>
                      ) : librarySessionsForAdd.length === 0 ? (
                        <p>No hay sesiones en la biblioteca. Crea una en Contenido.</p>
                      ) : (
                        <ul className="client-program-add-plan-session-list">
                          {librarySessionsForAdd.map((s) => {
                            const isThisAdding = addingSessionIdInModal === s.id;
                            return (
                              <li key={s.id}>
                                <button
                                  type="button"
                                  className="client-program-add-plan-session-item"
                                  onClick={() => handleConfirmAddPlanSession(s.id)}
                                  disabled={isAddingSessionToPlanDay}
                                  aria-busy={isThisAdding}
                                >
                                  {isThisAdding ? (
                                    <span className="client-program-add-plan-session-item-loading">
                                      <span className="client-program-add-plan-session-spinner" aria-hidden />
                                      Añadiendo...
                                    </span>
                                  ) : (
                                    (s.title || s.name || 'Sesión')
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <button type="button" className="client-program-add-plan-session-cancel" onClick={() => setAddPlanSessionTarget(null)} disabled={isAddingSessionToPlanDay}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 'nutricion': {
        const currentNutritionAssignment = clientNutritionAssignments[0] || null;
        const currentPlanName = currentNutritionAssignment && nutritionPlans.find((p) => p.id === currentNutritionAssignment.planId)?.name;
        const nutritionStartDateStr = currentNutritionAssignment?.startDate
          ? (currentNutritionAssignment.startDate?.toDate ? currentNutritionAssignment.startDate.toDate().toLocaleDateString('es-ES') : String(currentNutritionAssignment.startDate))
          : '';
        const nutritionEndDateStr = currentNutritionAssignment?.endDate
          ? (currentNutritionAssignment.endDate?.toDate ? currentNutritionAssignment.endDate.toDate().toLocaleDateString('es-ES') : String(currentNutritionAssignment.endDate))
          : null;
        const nutritionPlanQ = (nutritionPlanSearchQuery || '').trim().toLowerCase();
        const filteredNutritionPlans = nutritionPlanQ
          ? nutritionPlans.filter((p) => (p.name || '').toLowerCase().includes(nutritionPlanQ))
          : nutritionPlans;
        return (
          <div className="client-program-nutricion-content">
            <div className="plan-structure-layout client-program-nutricion-layout">
              {/* Left panel: plans list (same structure as session-edit sidebar) */}
              <aside className="plan-structure-sidebars client-program-nutricion-sidebar">
                <div className="client-program-nutricion-sidebar-header">
                  <h3 className="client-program-nutricion-sidebar-title">Planes</h3>
            </div>
                <div className="client-program-nutricion-sidebar-search">
                  <Input
                    placeholder="Buscar planes…"
                    value={nutritionPlanSearchQuery}
                    onChange={(e) => setNutritionPlanSearchQuery(e.target.value)}
                    type="text"
                    light
                  />
                </div>
                <div className="client-program-nutricion-sidebar-content">
                  {currentNutritionAssignment && (
                    <div className="client-program-nutricion-sidebar-current">
                      <span className="client-program-nutricion-sidebar-current-label">Asignación actual</span>
                      <span className="client-program-nutricion-sidebar-current-name">{currentPlanName || currentNutritionAssignment.planId}</span>
                    </div>
                  )}
            {isNutritionLoading ? (
                    <div className="client-program-nutricion-sidebar-loading">
                      <p>Cargando planes…</p>
                    </div>
                  ) : filteredNutritionPlans.length === 0 ? (
                    <div className="client-program-nutricion-sidebar-empty">
                      <p>{nutritionPlanQ ? 'No hay coincidencias' : 'No hay planes. Crea uno en Nutrición.'}</p>
                    </div>
                  ) : (
                    <ul className="client-program-nutricion-plan-list">
                      {filteredNutritionPlans.map((p) => {
                        const isSelected = nutritionAssignPlanId === p.id;
                        return (
                        <li key={p.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            className={`client-program-nutricion-plan-item client-program-nutricion-plan-item-draggable ${isSelected ? 'client-program-nutricion-plan-item-selected' : ''}`}
                            onClick={() => setNutritionAssignPlanId(p.id)}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = 'copy';
                              e.dataTransfer.setData('application/json', JSON.stringify({
                                type: NUTRITION_DRAG_TYPE,
                                planId: p.id,
                                planName: p.name || `Plan ${(p.id || '').slice(0, 8)}`,
                              }));
                              e.currentTarget.classList.add('client-program-nutricion-plan-item-dragging');
                            }}
                            onDragEnd={(e) => e.currentTarget.classList.remove('client-program-nutricion-plan-item-dragging')}
                            onKeyDown={(e) => e.key === 'Enter' && setNutritionAssignPlanId(p.id)}
                          >
                            <span className="client-program-nutricion-plan-item-avatar">{(p.name || 'P').charAt(0)}</span>
                            <span className="client-program-nutricion-plan-item-name">{p.name || `Plan ${(p.id || '').slice(0, 8)}`}</span>
                            <span className="client-program-nutricion-plan-item-drag-hint" aria-hidden>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 5h6M9 12h6M9 19h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                            </span>
                          </div>
                        </li>
                      );})}
                    </ul>
                  )}
                </div>
              </aside>
              {/* Middle panel: single center card (exercise-edit style) */}
              <div className="plan-structure-main client-program-nutricion-main">
                <div className="client-program-nutricion-center-card">
                  {!currentNutritionAssignment ? (
                    <div
                      className={`client-program-nutricion-empty ${nutritionDropZoneActive ? 'client-program-nutricion-empty-drag-over' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        setNutritionDropZoneActive(true);
                      }}
                      onDragLeave={() => setNutritionDropZoneActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setNutritionDropZoneActive(false);
                        let data;
                        try {
                          data = JSON.parse(e.dataTransfer.getData('application/json'));
                        } catch { return; }
                        if (data?.type !== NUTRITION_DRAG_TYPE || !data?.planId) return;
                        setNutritionAssignModalPlan({ id: data.planId, name: data.planName || 'Plan' });
                        const today = new Date().toISOString().slice(0, 10);
                        setNutritionModalStartDate(today);
                        setNutritionModalNoEndDate(true);
                        setNutritionModalEndDate('');
                        setNutritionModalCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                        setNutritionModalEditingEnd(false);
                      }}
                    >
                      <div className="client-program-nutricion-empty-icon" aria-hidden>
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <p className="client-program-nutricion-empty-text">No tiene un plan nutricional asignado</p>
                      <p className="client-program-nutricion-empty-hint">Arrastra un plan desde el panel izquierdo para asignarlo</p>
                    </div>
            ) : (
              <>
                    <div className="client-program-nutricion-center-content client-program-nutricion-center-content-full">
                      <div className="client-program-nutricion-card client-program-nutricion-current-card">
                        <div className="client-program-nutricion-current-card-row">
                        <div className="client-program-nutricion-current-left">
                          <span className="client-program-nutricion-current-name">{currentPlanName || currentNutritionAssignment.planId}</span>
                      <button
                        type="button"
                            className="client-program-nutricion-current-edit-btn"
                        onClick={() => navigate(`/nutrition/plans/${currentNutritionAssignment.planId}`, {
                          state: {
                            editScope: 'assignment',
                            assignmentId: currentNutritionAssignment.id,
                            assignmentPlanId: currentNutritionAssignment.planId,
                            clientName: client?.clientName || client?.name || client?.displayName || 'Cliente',
                            returnTo: location.pathname,
                            returnState: { tab: currentTabIndex },
                          },
                        })}
                            aria-label="Editar plan (solo este cliente)"
                      >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M18.5 2.50023C18.8978 2.1024 19.4374 1.87891 20 1.87891C20.5626 1.87891 21.1022 2.1024 21.5 2.50023C21.8978 2.89805 22.1213 3.43762 22.1213 4.00023C22.1213 4.56284 21.8978 5.1024 21.5 5.50023L12 15.0002L8 16.0002L9 12.0002L18.5 2.50023Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                      </button>
                        </div>
                        <div className="client-program-nutricion-current-pills">
                          <div className="client-program-nutricion-current-pill">
                            <span className="client-program-nutricion-current-pill-label">Inicio</span>
                            <span className="client-program-nutricion-current-pill-value">{nutritionStartDateStr || '—'}</span>
                          </div>
                          {nutritionEndDateStr && (
                            <div className="client-program-nutricion-current-pill">
                              <span className="client-program-nutricion-current-pill-label">Fin</span>
                              <span className="client-program-nutricion-current-pill-value">{nutritionEndDateStr}</span>
                            </div>
                          )}
                        </div>
                        <div className="client-program-nutricion-current-menu-wrap">
                      <button
                        type="button"
                            className="client-program-nutricion-current-menu-btn"
                            onClick={() => setNutritionCurrentCardMenuOpen((o) => !o)}
                            aria-label="Más opciones"
                            aria-expanded={nutritionCurrentCardMenuOpen}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="6" r="1.5" fill="currentColor"/>
                              <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                              <circle cx="12" cy="18" r="1.5" fill="currentColor"/>
                            </svg>
                          </button>
                          {nutritionCurrentCardMenuOpen && (
                            <>
                              <div className="client-program-nutricion-current-menu-backdrop" onClick={() => setNutritionCurrentCardMenuOpen(false)} aria-hidden />
                              <div className="client-program-nutricion-current-menu-dropdown">
                                <button
                                  type="button"
                                  className="client-program-nutricion-current-menu-item"
                                  onClick={() => {
                                    setNutritionCurrentCardMenuOpen(false);
                                    setNutritionAssignModalPlan({ id: currentNutritionAssignment.planId, name: currentPlanName || currentNutritionAssignment.planId || 'Plan' });
                                    setNutritionModalEditingAssignmentId(currentNutritionAssignment.id);
                                    const startIso = assignmentDateToISO(currentNutritionAssignment.startDate);
                                    const endIso = assignmentDateToISO(currentNutritionAssignment.endDate);
                                    setNutritionModalStartDate(startIso || new Date().toISOString().slice(0, 10));
                                    setNutritionModalNoEndDate(!endIso);
                                    setNutritionModalEndDate(endIso || '');
                                    setNutritionModalCalendarMonth(startIso ? new Date(startIso + 'T00:00:00') : new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                                    setNutritionModalEditingEnd(false);
                                  }}
                                >
                                  Editar fechas
                                </button>
                                <button
                                  type="button"
                                  className="client-program-nutricion-current-menu-item client-program-nutricion-current-menu-item--danger"
                                  onClick={() => {
                                    setNutritionCurrentCardMenuOpen(false);
                                    handleEndNutritionAssignment(currentNutritionAssignment.id);
                                  }}
                        disabled={isEndingNutrition}
                      >
                        {isEndingNutrition ? 'Quitando…' : 'Quitar asignación'}
                      </button>
                    </div>
                            </>
                          )}
                  </div>
                        </div>
                      {currentNutritionAssignment && (nutritionPlanDetail || isLoadingNutritionPlanDetail) && (
                        <div className="client-program-nutricion-summary-card">
                        {isLoadingNutritionPlanDetail ? (
                          <p className="client-program-nutricion-summary-loading">Cargando objetivos…</p>
                        ) : nutritionPlanDetail ? (
                          <div className="client-program-nutricion-summary-left-inner">
                            <div className="client-program-nutricion-summary-hero">
                              <div className="client-program-nutricion-summary-hero-value">
                                {(nutritionPlanDetail.daily_calories ?? 0) > 0 ? nutritionPlanDetail.daily_calories : '—'}
                              </div>
                              <div className="client-program-nutricion-summary-hero-label">kcal objetivo</div>
                            </div>
                            <div className="client-program-nutricion-summary-pie-macros-row">
                              {nutritionObjectivesPieData.length > 0 ? (
                                <div className="client-program-nutricion-summary-pie-wrap">
                                  <ResponsiveContainer width="100%" height={120}>
                                    <PieChart className="library-session-pie-chart">
                                      <defs>
                                        {[0, 1, 2].map((i) => (
                                          <linearGradient key={i} id={`client-nutricion-pie-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={`rgba(255,255,255,${0.22 + i * 0.06})`} />
                                            <stop offset="50%" stopColor={`rgba(255,255,255,${0.12 + i * 0.04})`} />
                                            <stop offset="100%" stopColor={`rgba(255,255,255,${0.05 + i * 0.03})`} />
                                          </linearGradient>
                                        ))}
                                      </defs>
                                      <Pie
                                        key={`macro-${nutritionObjectivesPieData.map((d) => d.value).join('-')}`}
                                        data={nutritionObjectivesPieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={28}
                                        outerRadius={48}
                                        paddingAngle={2}
                                        dataKey="value"
                                        nameKey="name"
                                        label={false}
                                      >
                                        {nutritionObjectivesPieData.map((_, i) => (
                                          <Cell key={i} fill={`url(#client-nutricion-pie-grad-${i})`} />
                                        ))}
                                      </Pie>
                                      <Tooltip
                                        content={({ active, payload }) => {
                                          if (!active || !payload?.length) return null;
                                          const { name, grams } = payload[0].payload;
                                          return (
                                            <div className="library-session-pie-tooltip">
                                              <span className="library-session-pie-tooltip-name">{name}</span>
                                              <span className="library-session-pie-tooltip-sets">{Number(grams ?? 0).toFixed(0)} g</span>
                                            </div>
                                          );
                                        }}
                                      />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                              ) : (
                                <div className="client-program-nutricion-summary-pie-placeholder" />
                              )}
                              <div className="client-program-nutricion-summary-macros">
                                <div className="client-program-nutricion-summary-macro-row">
                                  <span className="client-program-nutricion-summary-macro-name">Proteína</span>
                                  <span className="client-program-nutricion-summary-macro-value">
                                    {(nutritionPlanDetail.daily_protein_g ?? 0) > 0 ? `${nutritionPlanDetail.daily_protein_g} g` : '—'}
                                  </span>
                                </div>
                                <div className="client-program-nutricion-summary-macro-row">
                                  <span className="client-program-nutricion-summary-macro-name">Carbohidratos</span>
                                  <span className="client-program-nutricion-summary-macro-value">
                                    {(nutritionPlanDetail.daily_carbs_g ?? 0) > 0 ? `${nutritionPlanDetail.daily_carbs_g} g` : '—'}
                                  </span>
                                </div>
                                <div className="client-program-nutricion-summary-macro-row">
                                  <span className="client-program-nutricion-summary-macro-name">Grasa</span>
                                  <span className="client-program-nutricion-summary-macro-value">
                                    {(nutritionPlanDetail.daily_fat_g ?? 0) > 0 ? `${nutritionPlanDetail.daily_fat_g} g` : '—'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        </div>
                      )}
                      </div>
                    </div>
              </>
            )}
          </div>
              </div>
            </div>
            {/* Assign-dates modal (after drag to center) */}
            {nutritionAssignModalPlan && (() => {
              const startTime = nutritionModalStartDate ? new Date(nutritionModalStartDate + 'T00:00:00').getTime() : 0;
              const endTime = nutritionModalEndDate ? new Date(nutritionModalEndDate + 'T00:00:00').getTime() : 0;
              const isInRange = (cellDate) => {
                const t = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate()).getTime();
                return startTime && endTime && t >= startTime && t <= endTime;
              };
              return (
              <Modal
                isOpen={!!nutritionAssignModalPlan}
                onClose={() => { setNutritionAssignModalPlan(null); setNutritionModalEditingAssignmentId(null); }}
                title={nutritionModalEditingAssignmentId ? `Editar fechas: ${nutritionAssignModalPlan.name}` : `Asignar plan: ${nutritionAssignModalPlan.name}`}
                containerClassName="client-program-nutricion-modal-container"
                contentClassName="client-program-nutricion-modal-content"
              >
                <div className="client-program-nutricion-modal-body">
                  <div className="client-program-nutricion-modal-dates-row">
                    <button
                      type="button"
                      className={`client-program-nutricion-modal-date-chip ${!nutritionModalEditingEnd ? 'client-program-nutricion-modal-date-chip--active' : ''}`}
                      onClick={() => {
                        setNutritionModalEditingEnd(false);
                        if (nutritionModalStartDate) setNutritionModalCalendarMonth(new Date(nutritionModalStartDate + 'T00:00:00'));
                      }}
                    >
                      <span className="client-program-nutricion-modal-date-label">Inicio</span>
                      <span className="client-program-nutricion-modal-date-value">
                        {nutritionModalStartDate ? (() => {
                          const d = new Date(nutritionModalStartDate + 'T00:00:00');
                          return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
                        })() : '—'}
                      </span>
                    </button>
                    <div className="client-program-nutricion-modal-fin-group">
                      <button
                        type="button"
                        className={`client-program-nutricion-modal-date-chip ${nutritionModalEditingEnd ? 'client-program-nutricion-modal-date-chip--active' : ''} ${nutritionModalNoEndDate ? 'client-program-nutricion-modal-date-chip--no-end' : ''}`}
                        onClick={() => {
                          setNutritionModalEditingEnd(true);
                          if (!nutritionModalNoEndDate) {
                            if (nutritionModalEndDate) setNutritionModalCalendarMonth(new Date(nutritionModalEndDate + 'T00:00:00'));
                            else if (nutritionModalStartDate) setNutritionModalCalendarMonth(new Date(nutritionModalStartDate + 'T00:00:00'));
                          } else {
                            setNutritionModalNoEndDate(false);
                            if (nutritionModalStartDate) {
                              setNutritionModalEndDate(nutritionModalStartDate);
                              setNutritionModalCalendarMonth(new Date(nutritionModalStartDate + 'T00:00:00'));
                            }
                          }
                        }}
                      >
                        <span className="client-program-nutricion-modal-date-label">Fin</span>
                        <span className="client-program-nutricion-modal-date-value">
                          {nutritionModalNoEndDate ? 'Sin fecha de fin (pulsa para elegir)' : (nutritionModalEndDate ? (() => {
                            const d = new Date(nutritionModalEndDate + 'T00:00:00');
                            return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
                          })() : 'Selecciona en el calendario')}
                        </span>
                      </button>
                      {!nutritionModalNoEndDate && (
                        <button
                          type="button"
                          className="client-program-nutricion-modal-sin-fin-link"
                          onClick={() => {
                            setNutritionModalNoEndDate(true);
                            setNutritionModalEndDate('');
                            setNutritionModalEditingEnd(false);
                            if (nutritionModalStartDate) setNutritionModalCalendarMonth(new Date(nutritionModalStartDate + 'T00:00:00'));
                          }}
                        >
                          Sin fecha de fin
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="client-program-nutricion-modal-calendars">
                    <div className="client-program-nutricion-modal-calendar-block client-program-nutricion-modal-calendar-block--single">
                      <div className="nutrition-modal-calendar nutrition-modal-calendar--range">
                        <div className="nutrition-modal-calendar-header">
                          <button type="button" className="nutrition-modal-calendar-nav" onClick={() => setNutritionModalCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} aria-label="Mes anterior">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                          <span className="nutrition-modal-calendar-month">{MONTH_NAMES_FULL[nutritionModalCalendarMonth.getMonth()]} {nutritionModalCalendarMonth.getFullYear()}</span>
                          <button type="button" className="nutrition-modal-calendar-nav" onClick={() => setNutritionModalCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} aria-label="Mes siguiente">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </button>
                        </div>
                        <div className="nutrition-modal-calendar-weekdays">
                          {MINI_DAY_NAMES.map((name) => <div key={name} className="nutrition-modal-calendar-weekday">{name}</div>)}
                        </div>
                        <div className="nutrition-modal-calendar-grid">
                          {getMiniCalendarDays(nutritionModalCalendarMonth).map((cell, i) => {
                            const iso = toLocalDateISO(cell.date);
                            const isStart = nutritionModalStartDate === iso;
                            const isEnd = !nutritionModalNoEndDate && nutritionModalEndDate === iso;
                            const inRange = isInRange(cell.date);
                            const isSelected = isStart || isEnd;
                            const handleClick = () => {
                              if (nutritionModalNoEndDate || !nutritionModalEditingEnd) {
                                setNutritionModalStartDate(iso);
                                setNutritionModalCalendarMonth(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
                              } else {
                                const startT = nutritionModalStartDate ? new Date(nutritionModalStartDate + 'T00:00:00').getTime() : 0;
                                const cellT = cell.date.getTime();
                                const endIso = cellT < startT ? nutritionModalStartDate : iso;
                                setNutritionModalEndDate(endIso);
                                setNutritionModalCalendarMonth(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
                              }
                            };
                            return (
                              <button
                                key={i}
                                type="button"
                                className={`nutrition-modal-calendar-day ${!cell.inMonth ? 'nutrition-modal-calendar-day--other' : ''} ${inRange ? 'nutrition-modal-calendar-day--in-range' : ''} ${isSelected ? 'nutrition-modal-calendar-day--selected' : ''}`}
                                onClick={handleClick}
                              >
                                {cell.day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="client-program-nutricion-modal-actions">
                    <button type="button" className="client-program-nutricion-btn client-program-nutricion-btn-secondary" onClick={() => setNutritionAssignModalPlan(null)}>Cancelar</button>
                    <button
                      type="button"
                      className="client-program-nutricion-btn client-program-nutricion-btn-primary"
                      onClick={() => handleAssignNutritionPlan({
                        planId: nutritionAssignModalPlan.id,
                        startDate: nutritionModalStartDate,
                        noEndDate: nutritionModalNoEndDate,
                        endDate: nutritionModalNoEndDate ? '' : nutritionModalEndDate,
                        assignmentId: nutritionModalEditingAssignmentId || undefined,
                      })}
                      disabled={isAssigningNutrition || (!nutritionModalNoEndDate && !nutritionModalEndDate)}
                    >
                      {isAssigningNutrition ? (nutritionModalEditingAssignmentId ? 'Guardando…' : 'Asignando…') : (nutritionModalEditingAssignmentId ? 'Guardar fechas' : 'Asignar plan')}
                    </button>
                  </div>
                </div>
              </Modal>
              );
            })()}
          </div>
        );
      }
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
    const errorBackPath = location.state?.returnTo || '/products?tab=clientes';
    return (
      <DashboardLayout screenName="Cliente">
        <div className="client-program-error">
          <p>{error || 'Cliente no encontrado'}</p>
          <button 
            className="client-program-back-button"
            onClick={() => navigate(errorBackPath)}
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
      backPath={location.state?.returnTo || '/products?tab=clientes'}
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

        {/* Session performance modal - used from Planificación (calendar cards and history-only cards) */}
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
          historyOnlyData={performanceModalContext?.historyOnlyData ?? null}
        />
      </div>
    </DashboardLayout>
  );
};

export default ClientProgramScreen;
