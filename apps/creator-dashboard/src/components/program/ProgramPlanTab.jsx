import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShimmerSkeleton } from '../ui';
import CalendarView from '../CalendarView';
import PlanningLibrarySidebar from '../PlanningLibrarySidebar';
import programPlanService from '../../services/programPlanService';
import programPlanContentService from '../../services/programPlanContentService';
import plansService from '../../services/plansService';
import DeleteSessionModal from '../client/DeleteSessionModal';
import './ProgramPlanTab.css';

export default function ProgramPlanTab({ programId, programName, creatorId, programAccentColor }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarSearch, setSidebarSearch] = useState('');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  // ── Calendar query ───────────────────────────────────────────────
  const calendarKey = ['program-calendar', programId, monthStr];

  const { data: calendar, isLoading: calendarLoading } = useQuery({
    queryKey: calendarKey,
    queryFn: () => programPlanService.getCalendar(programId, monthStr),
    enabled: !!programId,
    staleTime: 0,
    gcTime: 0,
  });

  const planAssignments = calendar?.planAssignments || {};
  const weekContentByWeekKey = calendar?.weeks || {};

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

  // ── Mutations ──────────────────────────────────────────────────

  const assignPlanMutation = useMutation({
    mutationFn: ({ assignPlanId, weekKey }) =>
      programPlanService.assignPlan(programId, assignPlanId, weekKey),
    onSuccess: () => invalidateCalendar(),
  });

  const removePlanMutation = useMutation({
    mutationFn: ({ removePlanId }) =>
      programPlanService.removePlan(programId, removePlanId),
    onSuccess: () => invalidateCalendar(),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: ({ weekKey, sessionId }) =>
      programPlanContentService.deleteSession(programId, weekKey, sessionId),
    onSuccess: () => invalidateCalendar(),
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ weekKey, sessionId, updates }) =>
      programPlanContentService.updateSession(programId, weekKey, sessionId, updates),
    onSuccess: () => invalidateCalendar(),
  });

  const addLibrarySessionMutation = useMutation({
    mutationFn: ({ weekKey, dayIndex, librarySessionId }) =>
      programPlanContentService.addLibrarySessionToWeek(programId, weekKey, librarySessionId, dayIndex),
    onSuccess: () => invalidateCalendar(),
  });

  // ── Handlers ───────────────────────────────────────────────────

  const handlePlanAssignment = useCallback((assignPlanId, weekKey) => {
    if (!programId || assignPlanMutation.isPending) return;
    assignPlanMutation.mutate({ assignPlanId, weekKey }, {
      onError: (err) => alert(err?.message === 'Este plan no tiene semanas' ? err.message : 'Error al asignar el plan'),
    });
  }, [programId, assignPlanMutation]);

  const handleRemovePlanFromWeek = useCallback((weekKey) => {
    const removePlanId = planAssignments[weekKey]?.planId;
    if (!removePlanId || !programId) return;
    const plan = plans.find((p) => p.id === removePlanId);
    setDeleteConfirm({ type: 'removePlan', removePlanId, planName: plan?.title || 'Plan', weekKey });
  }, [planAssignments, programId, plans]);

  const handlePersonalizePlanWeek = useCallback(() => {}, []);

  const handleResetPlanWeek = useCallback(async ({ weekKey }) => {
    if (!programId || !weekKey) return;
    if (!window.confirm('Restablecer esta semana al plan original?')) return;
    try {
      await programPlanContentService.deleteWeekContent(programId, weekKey);
      invalidateCalendar();
    } catch (err) {
      alert(err.message || 'Error al restablecer');
    }
  }, [programId, invalidateCalendar]);

  const handleEditPlanSession = useCallback(({ session, weekKey }) => {
    if (!programId || !session?.id || !weekKey) return;
    navigate(`/content/sessions/${session.id}`, {
      state: {
        returnTo: location.pathname,
        returnState: { tab: 'contenido', subtab: 'entrenamiento' },
        editScope: 'program_plan',
        programId,
        programName,
        weekKey,
      },
    });
  }, [programId, programName, navigate, location.pathname]);

  const handleDeletePlanSession = useCallback(({ session, weekKey }) => {
    if (!programId || !session?.id || !weekKey) return;
    setDeleteConfirm({ type: 'plan', session, weekKey });
  }, [programId]);

  const handleMovePlanSessionDay = useCallback(({ session, weekKey, targetDayIndex }) => {
    if (!programId || !session?.id || weekKey == null || targetDayIndex == null) return;
    updateSessionMutation.mutate({ weekKey, sessionId: session.id, updates: { dayIndex: targetDayIndex } }, {
      onError: (err) => alert(err.message || 'Error al mover'),
    });
  }, [programId, updateSessionMutation]);

  const handleMovePlanSessionToWeek = useCallback(async ({
    session, sourceWeekKey, targetWeekKey, targetDayIndex,
  }) => {
    if (!programId || !session?.id) return;
    try {
      await programPlanContentService.moveSessionToWeek(
        programId, sourceWeekKey, targetWeekKey, session.id, targetDayIndex
      );
      invalidateCalendar();
    } catch (err) {
      alert(err.message || 'Error al mover la sesion');
    }
  }, [programId, invalidateCalendar]);

  const handleAddLibrarySessionToPlanDay = useCallback(({ weekKey, dayIndex, librarySessionId }) => {
    if (!programId) return;
    addLibrarySessionMutation.mutate({ weekKey, dayIndex, librarySessionId }, {
      onError: (err) => alert(err.message || 'Error al agregar la sesion'),
    });
  }, [programId, addLibrarySessionMutation]);

  // ── Confirm deletion ───────────────────────────────────────────

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    const onDone = () => setDeleteConfirm(null);
    if (deleteConfirm.type === 'plan') {
      deleteSessionMutation.mutate(
        { weekKey: deleteConfirm.weekKey, sessionId: deleteConfirm.session.id },
        { onSuccess: onDone, onError: (err) => { onDone(); alert(err.message || 'Error al quitar la sesion'); } }
      );
    } else if (deleteConfirm.type === 'removePlan') {
      removePlanMutation.mutate(
        { removePlanId: deleteConfirm.removePlanId },
        { onSuccess: onDone, onError: () => { onDone(); alert('Error al quitar el plan'); } }
      );
    }
  }, [deleteConfirm, deleteSessionMutation, removePlanMutation]);

  const deleteConfirmItemName = deleteConfirm
    ? deleteConfirm.type === 'removePlan'
      ? deleteConfirm.planName
      : (deleteConfirm.session?.title || 'Sesion')
    : '';

  const isDeletePending = deleteSessionMutation.isPending || removePlanMutation.isPending;

  // ── hasClientPlanCopy per week ──────────────────────────────────
  const [selectedDayWeekKey, setSelectedDayWeekKey] = useState(null);
  const hasClientPlanCopy = selectedDayWeekKey
    ? !!weekContentByWeekKey[selectedDayWeekKey]?.isPersonalized
    : false;

  const handleSelectedDayChange = useCallback((dayInfo) => {
    if (dayInfo?.planAssignments?.length > 0 && dayInfo?.weekKey) {
      setSelectedDayWeekKey(dayInfo.weekKey);
    } else {
      setSelectedDayWeekKey(null);
    }
  }, []);

  // ── Loading skeleton ─────────────────────────────────────────
  if (!programId) {
    return (
      <div className="ppt-layout">
        <div className="ppt-skeleton-sidebar">
          <ShimmerSkeleton width="100%" height={36} borderRadius={8} />
          {Array.from({ length: 5 }, (_, i) => (
            <ShimmerSkeleton key={i} width="100%" height={40} borderRadius={8} />
          ))}
        </div>
        <div className="ppt-skeleton-main">
          <ShimmerSkeleton width={160} height={32} borderRadius={6} />
          <div className="ppt-skeleton-grid">
            {Array.from({ length: 35 }, (_, i) => (
              <ShimmerSkeleton key={i} width="100%" height={80} borderRadius={8} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ppt-layout">
      <div className="ppt-sidebar">
        <PlanningLibrarySidebar
          creatorId={creatorId}
          searchQuery={sidebarSearch}
          onSearchChange={setSidebarSearch}
        />
      </div>

      <div className="ppt-main">
        <div className="ppt-content">
          <CalendarView
            onDateSelect={() => {}}
            plannedSessions={[]}
            programColors={{}}
            isLoading={calendarLoading}
            completedSessionIds={new Set()}
            completedSessionsByDate={{}}
            onMonthChange={setCurrentDate}
            planAssignments={planAssignments}
            programAccentColor={programAccentColor}
            plans={plans}
            planWeeksCount={planWeeksCount}
            onPlanAssignment={handlePlanAssignment}
            onRemovePlanFromWeek={handleRemovePlanFromWeek}
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
            assignedPrograms={[]}
            selectedProgramId={programId}
            isAddingSessionToPlanDay={addLibrarySessionMutation.isPending}
            isDeletingPlanSession={deleteSessionMutation.isPending}
            deletingPlanSessionId={deleteSessionMutation.isPending ? deleteSessionMutation.variables?.sessionId : null}
            deletingPlanSessionWeekKey={deleteSessionMutation.isPending ? deleteSessionMutation.variables?.weekKey : null}
            isMovingPlanSession={updateSessionMutation.isPending}
            isAssigningPlan={assignPlanMutation.isPending}
            isRemovingPlanFromWeek={removePlanMutation.isPending}
            removingPlanId={removePlanMutation.isPending ? removePlanMutation.variables?.removePlanId : null}
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
            ? 'Quitar este plan del programa?'
            : 'Eliminar esta sesion del plan?'
        }
        sessionName={deleteConfirmItemName}
        description={
          deleteConfirm?.type === 'removePlan'
            ? 'Se eliminaran todas las semanas asignadas de este plan.'
            : 'Esta sesion se eliminara de la semana.'
        }
        confirmLabel={deleteConfirm?.type === 'removePlan' ? 'Quitar plan' : 'Eliminar'}
        confirmingLabel={deleteConfirm?.type === 'removePlan' ? 'Quitando...' : 'Eliminando...'}
        isDeleting={isDeletePending}
      />
    </div>
  );
}
