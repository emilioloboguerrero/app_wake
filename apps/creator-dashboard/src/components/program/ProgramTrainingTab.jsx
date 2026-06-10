import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ProgramWeeksGrid from '../ProgramWeeksGrid';
import ProgramCadenceCalendar from './ProgramCadenceCalendar';
import PlanningLibrarySidebar from '../PlanningLibrarySidebar';
import programService from '../../services/programService';
import libraryService from '../../services/libraryService';
import plansService from '../../services/plansService';
import apiClient from '../../utils/apiClient';
import { queryKeys, cacheConfig } from '../../config/queryClient';

const LEVEL_LABELS = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

// ─── Drops-calendar write/navigation adapters ───────────────────
// ProgramCadenceCalendar is source-agnostic: it edits whatever `ops`
// points at. A course writes to `courses/{id}/modules`; a level plan writes
// to `plans/{planId}/modules`. Both expose the same module/session surface,
// so the calendar UI is identical — only the target differs.
function buildProgramOps(programId) {
  return {
    updateModule: (moduleId, updates) =>
      programService.updateModule(programId, moduleId, updates),
    deleteModule: (moduleId) => programService.deleteModule(programId, moduleId),
    // Raw apiClient (not programService.createModule) skips the 1+N
    // modules+sessions fan-out the service did before posting; unlocks_at is
    // set in the follow-up updateModule the calendar issues.
    createDrop: async (title, order) => {
      const created = await apiClient.post(`/creator/programs/${programId}/modules`, { title, order });
      return created?.data?.id ?? created?.data?.moduleId ?? created?.id ?? null;
    },
    addLibrarySession: (moduleId, librarySessionRef, dayIndex, title) =>
      programService.createSessionFromLibrary(
        programId, moduleId, librarySessionRef,
        dayIndex - 1, null, dayIndex, title,
      ),
    updateSession: (moduleId, sessionId, updates) =>
      programService.updateSession(programId, moduleId, sessionId, updates),
    deleteSession: (moduleId, sessionId) =>
      programService.deleteSession(programId, moduleId, sessionId),
    sessionEditPath: (moduleId, sessionId) =>
      `/programs/${programId}/modules/${moduleId}/sessions/${sessionId}/edit`,
    // Program-instance edits already default backPath to the program's content
    // tab, so no explicit return state is needed.
    sessionEditState: null,
  };
}

// shellProgramId is the parent course that owns the cadence; a plan session
// opened from its drops calendar must return there, not to the plan's own
// library page (the default for /plans/.../edit).
function buildPlanOps(planId, shellProgramId) {
  return {
    updateModule: (moduleId, updates) =>
      plansService.updateModule(planId, moduleId, updates),
    deleteModule: (moduleId) => plansService.deleteModule(planId, moduleId),
    createDrop: async (title, order) => {
      const created = await plansService.createModule(planId, title, order);
      return created?.id ?? created?.moduleId ?? null;
    },
    addLibrarySession: (moduleId, librarySessionRef, dayIndex, title) =>
      plansService.createSession(
        planId, moduleId, title || 'Sesión',
        dayIndex - 1, null, librarySessionRef, dayIndex,
      ),
    updateSession: (moduleId, sessionId, updates) =>
      plansService.updateSession(planId, moduleId, sessionId, updates),
    deleteSession: (moduleId, sessionId) =>
      plansService.deleteSession(planId, moduleId, sessionId),
    sessionEditPath: (moduleId, sessionId) =>
      `/plans/${planId}/modules/${moduleId}/sessions/${sessionId}/edit`,
    sessionEditState: shellProgramId
      ? { returnTo: `/programs/${shellProgramId}`, returnState: { tab: 'contenido', subtab: 'entrenamiento' } }
      : null,
  };
}

const LEVEL_SELECT_STYLE = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.9)',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'inherit',
  padding: '6px 12px',
  cursor: 'pointer',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  paddingRight: 28,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
};

// Código ABS-style shells: program = container, each level → a full plan.
// The drops calendar edits the selected level's plan (`plans/{planId}/modules`)
// while cadence (which month is live, cohort-synced) keeps living on the shell.
function LevelPlansCadenceEditor({ program, programId, creatorId }) {
  const queryClient = useQueryClient();
  const levels = program?.levels?.options || Object.keys(program.level_plans);
  const defaultLevel = program?.levels?.default || levels[0];
  const [level, setLevel] = useState(defaultLevel);
  const [sidebarSearch, setSidebarSearch] = useState('');

  const planId = program?.level_plans?.[level] || null;

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['plans', planId, 'modules'],
    queryFn: () => plansService.getModulesByPlan(planId),
    enabled: !!planId,
    ...cacheConfig.activeProgram,
  });

  const ops = useMemo(
    () => (planId ? buildPlanOps(planId, programId) : null),
    [planId, programId],
  );

  const onModulesChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['plans', planId, 'modules'] });
  }, [queryClient, planId]);

  return (
    <div className="plan-structure-layout">
      <div className="plan-structure-sidebars">
        <PlanningLibrarySidebar
          creatorId={creatorId}
          searchQuery={sidebarSearch}
          onSearchChange={setSidebarSearch}
        />
      </div>
      <div className="plan-structure-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Planificación:
          </span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            style={LEVEL_SELECT_STYLE}
          >
            {levels.map((lvl) => (
              <option key={lvl} value={lvl} style={{ background: '#1a1a1a' }}>
                {LEVEL_LABELS[lvl] || lvl}
              </option>
            ))}
          </select>
        </div>
        {!planId ? (
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            Sin plan asignado para este nivel.
          </p>
        ) : (
          <ProgramCadenceCalendar
            key={planId}
            program={program}
            modules={isLoading ? null : modules}
            onModulesChange={onModulesChange}
            ops={ops}
          />
        )}
      </div>
    </div>
  );
}

export default function ProgramTrainingTab({ programId, creatorId, program = null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddingWeek, setIsAddingWeek] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const autoCreatedRef = useRef(false);

  const hasLevelPlans = program?.level_plans && Object.keys(program.level_plans).length > 0;

  const { data: modules = [], isLoading: isLoadingModules, isSuccess } = useQuery({
    queryKey: queryKeys.modules.all(programId),
    queryFn: () => programService.getModulesByProgram(programId),
    enabled: !!programId && !hasLevelPlans,
    ...cacheConfig.activeProgram,
  });

  useEffect(() => {
    if (hasLevelPlans || !isSuccess || modules.length > 0 || autoCreatedRef.current || !programId) return;
    autoCreatedRef.current = true;
    programService.createModule(programId).then(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
    });
  }, [hasLevelPlans, isSuccess, modules.length, programId, queryClient]);

  const handleAddWeek = useCallback(async () => {
    if (!programId) return;
    setIsAddingWeek(true);
    try {
      const created = await programService.createModule(programId);
      // Rename the freshly-created module to "Mes N" for cadenced programs
      // (createModule's API always writes "Semana N"). Keeps the editor's
      // mental model consistent with the consumer brief's vocab.
      if (program?.block_cadence === 'monthly_first_monday' && created?.id) {
        try {
          const existing = await programService.getModulesByProgram(programId);
          const newest = existing.find((m) => m.id === created.id);
          const ord = typeof newest?.order === 'number' ? newest.order : (existing.length - 1);
          await programService.updateModule(programId, created.id, { title: `Mes ${ord + 1}` });
        } catch {/* best-effort: legacy title is acceptable */}
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
    } finally {
      setIsAddingWeek(false);
    }
  }, [programId, queryClient, program?.block_cadence]);

  const handleDeleteWeek = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
  }, [programId, queryClient]);

  const handleModulesChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
  }, [programId, queryClient]);

  const handleSessionClick = useCallback((mod, session) => {
    navigate(`/programs/${programId}/modules/${mod.id}/sessions/${session.id}/edit`);
  }, [navigate, programId]);

  const cadenceActive = program?.block_cadence === 'monthly_first_monday';

  const programOps = useMemo(() => buildProgramOps(programId), [programId]);

  // Level-plan shells (Código ABS) edit the selected level's plan in the same
  // drops calendar the Método uses — cadence on the shell, content on the plan.
  if (hasLevelPlans) {
    return <LevelPlansCadenceEditor program={program} programId={programId} creatorId={creatorId} />;
  }

  return (
    <div className="plan-structure-layout">
      <div className="plan-structure-sidebars">
        <PlanningLibrarySidebar
          creatorId={creatorId}
          searchQuery={sidebarSearch}
          onSearchChange={setSidebarSearch}
        />
      </div>
      <div className="plan-structure-main">
        {cadenceActive ? (
          <ProgramCadenceCalendar
            program={program}
            modules={modules}
            onModulesChange={handleModulesChange}
            ops={programOps}
          />
        ) : (
          <ProgramWeeksGrid
            programId={programId}
            program={program}
            modules={modules}
            onAddWeek={handleAddWeek}
            onDeleteWeek={handleDeleteWeek}
            onModulesChange={handleModulesChange}
            onSessionClick={handleSessionClick}
            libraryService={libraryService}
            plansService={plansService}
            creatorId={creatorId}
            isLoading={isLoadingModules}
            isAddingWeek={isAddingWeek}
            queryClient={queryClient}
            queryKeys={queryKeys}
          />
        )}
      </div>
    </div>
  );
}
