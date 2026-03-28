import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShimmerSkeleton } from '../ui';
import CalendarView from '../CalendarView';
import PlanningLibrarySidebar from '../PlanningLibrarySidebar';
import clientProgramService from '../../services/clientProgramService';
import clientPlanContentService from '../../services/clientPlanContentService';
import clientSessionService from '../../services/clientSessionService';
import plansService from '../../services/plansService';
import { getMondayWeek } from '../../utils/weekCalculation';
import { extractAccentFromImage } from '../events/eventFieldComponents';
import DeleteSessionModal from './DeleteSessionModal';
import './ClientPlanTab.css';

export default function ClientPlanTab({
  clientId, clientUserId, clientName, creatorId,
  currentModule, planId, activeProgram,
  programs, programsLoading, selectedProgramId, onProgramChange,
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarSearch, setSidebarSearch] = useState('');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'plan'|'date', session, weekKey?, date? }

  const programId = activeProgram?.id;
  const programImageUrl = activeProgram?.imageUrl || activeProgram?.image_url;
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  // ── Program accent color from image ────────────────────────────────
  const [programAccent, setProgramAccent] = useState(null);
  useEffect(() => {
    if (!programImageUrl) { setProgramAccent(null); return; }
    return extractAccentFromImage(programImageUrl, setProgramAccent);
  }, [programImageUrl]);

  const programAccentColor = useMemo(() => {
    if (!programAccent) return null;
    const [r, g, b] = programAccent;
    return `rgba(${r}, ${g}, ${b}, 0.18)`;
  }, [programAccent]);

  // ── Single calendar query (replaces 100+ lines of useEffect + state) ──
  const calendarKey = ['calendar', clientUserId, programId, monthStr];

  const { data: calendar, isLoading: calendarLoading, error: calendarError } = useQuery({
    queryKey: calendarKey,
    queryFn: () => clientProgramService.getCalendar(clientUserId, programId, monthStr),
    enabled: !!clientUserId && !!programId,
    staleTime: 0,
    gcTime: 0,
  });

  const planAssignments = calendar?.planAssignments || {};
  const weekContentByWeekKey = calendar?.weeks || {};
  const dateSessions = calendar?.dateSessions || [];
  const completedByDate = calendar?.completedByDate || {};

  // ── Derived data for CalendarView ──────────────────────────────
  const completedSessionIds = useMemo(() => {
    const ids = new Set();
    for (const sessions of Object.values(completedByDate)) {
      for (const h of sessions) ids.add(h.sessionId || h.id);
    }
    return ids;
  }, [completedByDate]);

  const completedSessionsByDate = completedByDate;

  // hasClientPlanCopy is now per-week from calendar data
  const [selectedDayWeekKey, setSelectedDayWeekKey] = useState(null);
  const hasClientPlanCopy = selectedDayWeekKey
    ? !!weekContentByWeekKey[selectedDayWeekKey]?.isPersonalized
    : false;

  // ── Plans list (for plan bar labels) ─────────────────────────
  const { data: plans = [] } = useQuery({
    queryKey: ['library', 'plans', creatorId],
    queryFn: () => plansService.getPlansByCreator(creatorId),
    enabled: !!creatorId,
    staleTime: 10 * 60 * 1000,
  });

  const planWeeksCount = useMemo(() => {
    const map = {};
    for (const p of plans) {
      map[p.id] = p.weekCount || p.weeks?.length || 0;
    }
    return map;
  }, [plans]);

  // ── Invalidate helper ──────────────────────────────────────────
  const invalidateCalendar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: calendarKey });
  }, [queryClient, calendarKey]);

  // ── Mutations (React Query handles loading states) ─────────────

  const assignPlanMutation = useMutation({
    mutationFn: ({ assignPlanId, weekKey }) =>
      clientProgramService.assignPlan(programId, clientUserId, assignPlanId, weekKey),
    onSuccess: () => {
      invalidateCalendar();
      queryClient.invalidateQueries({ queryKey: ['assignedPrograms'] });
    },
  });

  const removePlanMutation = useMutation({
    mutationFn: ({ removePlanId }) =>
      clientProgramService.removePlan(programId, clientUserId, removePlanId),
    onSuccess: () => {
      invalidateCalendar();
      queryClient.invalidateQueries({ queryKey: ['assignedPrograms'] });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: ({ weekKey, sessionId }) =>
      clientPlanContentService.deleteSession(clientUserId, programId, weekKey, sessionId),
    onSuccess: () => invalidateCalendar(),
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ weekKey, sessionId, updates }) =>
      clientPlanContentService.updateSession(clientUserId, programId, weekKey, sessionId, updates),
    onSuccess: () => invalidateCalendar(),
  });

  const addLibrarySessionMutation = useMutation({
    mutationFn: ({ weekKey, dayIndex, librarySessionId }) =>
      clientPlanContentService.addLibrarySessionToWeek(clientUserId, programId, weekKey, librarySessionId, dayIndex),
    onSuccess: () => invalidateCalendar(),
  });

  const assignDateSessionMutation = useMutation({
    mutationFn: (sessionData) =>
      clientSessionService.assignSessionToDate(
        clientUserId, programId,
        sessionData.planId ?? null,
        sessionData.sessionId,
        sessionData.date,
        sessionData.moduleId ?? null,
        {
          ...(sessionData.library_session_ref ? { library_session_ref: true } : {}),
          ...(sessionData.session_name ? { session_name: sessionData.session_name } : {}),
        }
      ),
    onSuccess: () => invalidateCalendar(),
  });

  const deleteDateSessionMutation = useMutation({
    mutationFn: ({ date, sessionId }) =>
      clientSessionService.removeSessionFromDate(clientUserId, date, sessionId),
    onSuccess: () => invalidateCalendar(),
  });

  // ── Handlers (each is now a single mutation call) ──────────────

  // FLOW 1: Plan assignment (drag from sidebar)
  const handlePlanAssignment = useCallback((assignPlanId, weekKey) => {
    if (!programId || !clientUserId || assignPlanMutation.isPending) return;
    assignPlanMutation.mutate({ assignPlanId, weekKey }, {
      onError: (err) => alert(err?.message === 'Este plan no tiene semanas' ? err.message : 'Error al asignar el plan'),
    });
  }, [programId, clientUserId, assignPlanMutation]);

  // FLOW 2: Plan removal (removes ALL weeks of that plan) — open confirmation modal
  const handleRemovePlanFromWeek = useCallback((weekKey) => {
    const removePlanId = planAssignments[weekKey]?.planId;
    if (!removePlanId || !programId || !clientUserId) return;
    const plan = plans.find((p) => p.id === removePlanId);
    setDeleteConfirm({ type: 'removePlan', removePlanId, planName: plan?.title || 'Plan', weekKey });
  }, [planAssignments, programId, clientUserId, plans]);

  // FLOW 3: Personalize week — now implicit (server copy-on-write handles it)
  // We still expose the handler for the CalendarView button, but it just invalidates
  const handlePersonalizePlanWeek = useCallback(() => {
    // No-op: copy-on-write happens automatically on first mutation.
    // If the user explicitly clicks "Personalizar", we could force a copy here,
    // but the simpler approach is: the first edit triggers the copy.
    // For now, just show a toast or do nothing.
  }, []);

  // FLOW 4: Reset personalized week
  const handleResetPlanWeek = useCallback(async ({ weekKey }) => {
    if (!clientUserId || !programId || !weekKey) return;
    if (!window.confirm('Restablecer esta semana al plan original?')) return;
    try {
      await clientPlanContentService.deleteClientPlanContent(clientUserId, programId, weekKey);
      invalidateCalendar();
    } catch (err) {
      alert(err.message || 'Error al restablecer');
    }
  }, [clientUserId, programId, invalidateCalendar]);

  // FLOW 5: Edit session within plan week — navigate to editor
  const handleEditPlanSession = useCallback(({ session, weekKey }) => {
    if (!clientUserId || !programId || !session?.id || !weekKey) return;
    navigate(`/content/sessions/${session.id}`, {
      state: {
        returnTo: location.pathname,
        returnState: { tab: 'contenido', subtab: 'entrenamiento' },
        editScope: 'client_plan',
        clientId: clientUserId,
        programId,
        weekKey,
        clientName,
      },
    });
  }, [clientUserId, programId, clientName, navigate, location.pathname]);

  // FLOW 6: Delete session from plan week — open confirmation modal
  const handleDeletePlanSession = useCallback(({ session, weekKey }) => {
    if (!clientUserId || !programId || !session?.id || !weekKey) return;
    setDeleteConfirm({ type: 'plan', session, weekKey });
  }, [clientUserId, programId]);

  // FLOW 7: Move session between days (same week) — single PATCH with copy-on-write
  const handleMovePlanSessionDay = useCallback(({ session, weekKey, targetDayIndex }) => {
    if (!clientUserId || !programId || !session?.id || weekKey == null || targetDayIndex == null) return;
    updateSessionMutation.mutate({ weekKey, sessionId: session.id, updates: { dayIndex: targetDayIndex } }, {
      onError: (err) => alert(err.message || 'Error al mover'),
    });
  }, [clientUserId, programId, updateSessionMutation]);

  // FLOW 8: Move session between weeks — delete from source, add to target
  const handleMovePlanSessionToWeek = useCallback(async ({
    session, sourceWeekKey, targetWeekKey, targetDayIndex,
  }) => {
    if (!clientUserId || !programId || !session?.id) return;
    try {
      // Use the old service for cross-week moves (requires both source and target manipulation)
      await clientPlanContentService.moveSessionToWeek(
        clientUserId, programId, sourceWeekKey, targetWeekKey, session.id, targetDayIndex
      );
      invalidateCalendar();
    } catch (err) {
      alert(err.message || 'Error al mover la sesion');
    }
  }, [clientUserId, programId, invalidateCalendar]);

  // FLOW 9: Add library session to plan day
  const handleAddLibrarySessionToPlanDay = useCallback(({ weekKey, dayIndex, librarySessionId }) => {
    if (!clientUserId || !programId) return;
    addLibrarySessionMutation.mutate({ weekKey, dayIndex, librarySessionId }, {
      onError: (err) => alert(err.message || 'Error al agregar la sesion'),
    });
  }, [clientUserId, programId, addLibrarySessionMutation, planAssignments]);

  // FLOW 10: Assign individual session to date
  const handleSessionAssignment = useCallback((sessionData) => {
    if (!clientUserId || !programId) return;
    assignDateSessionMutation.mutate(sessionData, {
      onError: () => alert('Error al asignar la sesion'),
    });
  }, [clientUserId, programId, assignDateSessionMutation]);

  // FLOW 11: Edit date-assigned session
  const handleEditSessionAssignment = useCallback(({ session, date }) => {
    if (!clientUserId || !session?.session_id) return;
    const returnState = { tab: 'contenido', subtab: 'entrenamiento' };
    if (session.plan_id) {
      const weekKey = session.week_key || getMondayWeek(date);
      navigate(`/content/sessions/${session.session_id}`, {
        state: {
          returnTo: location.pathname, returnState,
          editScope: 'client_plan',
          clientId: clientUserId, programId, weekKey, clientName,
        },
      });
    } else {
      navigate(`/content/sessions/${session.session_id}`, {
        state: {
          returnTo: location.pathname, returnState,
          editScope: 'client',
          clientSessionId: session.id, clientId: clientUserId, clientName,
        },
      });
    }
  }, [clientUserId, programId, clientName, navigate, location.pathname]);

  // FLOW 12: Delete date-assigned session — open confirmation modal
  const handleDeleteSessionAssignment = useCallback(({ session, date }) => {
    if (!clientUserId) return;
    setDeleteConfirm({ type: 'date', session, date });
  }, [clientUserId]);

  // Confirm deletion from modal
  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    const onDone = () => setDeleteConfirm(null);
    if (deleteConfirm.type === 'plan') {
      deleteSessionMutation.mutate(
        { weekKey: deleteConfirm.weekKey, sessionId: deleteConfirm.session.id },
        { onSuccess: onDone, onError: (err) => { onDone(); alert(err.message || 'Error al quitar la sesion'); } }
      );
    } else if (deleteConfirm.type === 'date') {
      deleteDateSessionMutation.mutate(
        { date: deleteConfirm.date, sessionId: deleteConfirm.session.session_id },
        { onSuccess: onDone, onError: () => { onDone(); alert('Error al eliminar la sesion'); } }
      );
    } else if (deleteConfirm.type === 'removePlan') {
      removePlanMutation.mutate(
        { removePlanId: deleteConfirm.removePlanId },
        { onSuccess: onDone, onError: () => { onDone(); alert('Error al quitar el plan'); } }
      );
    }
  }, [deleteConfirm, deleteSessionMutation, deleteDateSessionMutation, removePlanMutation]);

  const deleteConfirmItemName = deleteConfirm
    ? deleteConfirm.type === 'removePlan'
      ? deleteConfirm.planName
      : (deleteConfirm.session?.title || deleteConfirm.session?.session_name || 'Sesion')
    : '';

  const isDeletePending = deleteSessionMutation.isPending || deleteDateSessionMutation.isPending || removePlanMutation.isPending;

  // Selected day change
  const handleSelectedDayChange = useCallback((dayInfo) => {
    if (dayInfo?.planAssignments?.length > 0 && dayInfo?.weekKey) {
      setSelectedDayWeekKey(dayInfo.weekKey);
    } else {
      setSelectedDayWeekKey(null);
    }
  }, []);

  const handleDateSelect = useCallback(() => {}, []);

  // ── Loading skeleton ─────────────────────────────────────────
  if (programsLoading || !programs?.length) {
    return (
      <div className="cpt-layout">
        {/* Sidebar skeleton */}
        <div className="cpt-skeleton-sidebar">
          <div className="cpt-skeleton-tabs">
            <ShimmerSkeleton width="48%" height={32} borderRadius={6} />
            <ShimmerSkeleton width="48%" height={32} borderRadius={6} />
          </div>
          <ShimmerSkeleton width={140} height={16} borderRadius={4} />
          <ShimmerSkeleton width="100%" height={36} borderRadius={8} />
          <div className="cpt-skeleton-sidebar-items">
            {Array.from({ length: 5 }, (_, i) => (
              <ShimmerSkeleton key={i} width="100%" height={40} borderRadius={8} />
            ))}
          </div>
        </div>

        {/* Calendar skeleton */}
        <div className="cpt-skeleton-main">
          <div className="cpt-skeleton-header">
            <ShimmerSkeleton width={160} height={32} borderRadius={6} />
            <div className="cpt-skeleton-nav">
              <ShimmerSkeleton width={32} height={32} borderRadius={6} />
              <ShimmerSkeleton width={32} height={32} borderRadius={6} />
            </div>
          </div>
          <div className="cpt-skeleton-weekdays">
            {Array.from({ length: 7 }, (_, i) => (
              <ShimmerSkeleton key={i} width={32} height={14} borderRadius={4} />
            ))}
          </div>
          <div className="cpt-skeleton-grid">
            {Array.from({ length: 35 }, (_, i) => (
              <ShimmerSkeleton key={i} width="100%" height={80} borderRadius={8} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cpt-layout">
      <div className="cpt-sidebar">
        <PlanningLibrarySidebar
          creatorId={creatorId}
          searchQuery={sidebarSearch}
          onSearchChange={setSidebarSearch}
        />
      </div>

      <div className="cpt-main">
        <div className="cpt-content">
          <CalendarView
            clientUserId={clientUserId}
            onDateSelect={handleDateSelect}
            plannedSessions={dateSessions}
            programColors={{}}
            isLoading={calendarLoading}
            completedSessionIds={completedSessionIds}
            completedSessionsByDate={completedSessionsByDate}
            onMonthChange={setCurrentDate}
            planAssignments={planAssignments}
            programAccentColor={programAccentColor}
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
            onAddPlanSessionToDay={handleAddLibrarySessionToPlanDay}
            assignedPrograms={programs}
            selectedProgramId={programId}
            onVerDesempeno={() => {}}
            isAddingSessionToPlanDay={addLibrarySessionMutation.isPending}
            addingToWeekKey={null}
            addingToDayIndex={null}
            isPersonalizingPlanWeek={false}
            isResettingPlanWeek={false}
            isDeletingPlanSession={deleteSessionMutation.isPending}
            deletingPlanSessionId={deleteSessionMutation.isPending ? deleteSessionMutation.variables?.sessionId : null}
            deletingPlanSessionWeekKey={deleteSessionMutation.isPending ? deleteSessionMutation.variables?.weekKey : null}
            isMovingPlanSession={updateSessionMutation.isPending}
            isAssigningPlan={assignPlanMutation.isPending}
            assigningPlanWeekKey={null}
            isRemovingPlanFromWeek={removePlanMutation.isPending}
            removingPlanId={removePlanMutation.isPending ? removePlanMutation.variables?.removePlanId : null}
            isAssigningSession={assignDateSessionMutation.isPending}
            isDeletingSessionAssignment={deleteDateSessionMutation.isPending}
            deletingSessionAssignmentId={deleteDateSessionMutation.isPending ? deleteDateSessionMutation.variables?.sessionId : null}
            showVolumeButton={false}
            onVolumeClick={() => {}}
            onWeekClick={() => {}}
          />
        </div>
      </div>

      <DeleteSessionModal
        isOpen={!!deleteConfirm}
        onClose={() => !isDeletePending && setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        title={
          deleteConfirm?.type === 'removePlan'
            ? 'Quitar este plan del cliente?'
            : 'Eliminar esta sesion del plan?'
        }
        sessionName={deleteConfirmItemName}
        description={
          deleteConfirm?.type === 'removePlan'
            ? 'Se eliminaran todas las semanas asignadas de este plan.'
            : deleteConfirm?.type === 'plan'
              ? 'El cliente ya no vera esta sesion en su semana.'
              : 'Esta sesion se eliminara del dia asignado.'
        }
        confirmLabel={deleteConfirm?.type === 'removePlan' ? 'Quitar plan' : 'Eliminar'}
        confirmingLabel={deleteConfirm?.type === 'removePlan' ? 'Quitando...' : 'Eliminando...'}
        isDeleting={isDeletePending}
      />
    </div>
  );
}
