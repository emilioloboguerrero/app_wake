import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ProgramWeeksGrid from '../ProgramWeeksGrid';
import ProgramCadenceCalendar from './ProgramCadenceCalendar';
import PlanDetailScreen from '../../screens/PlanDetailScreen';
import PlanningLibrarySidebar from '../PlanningLibrarySidebar';
import programService from '../../services/programService';
import libraryService from '../../services/libraryService';
import plansService from '../../services/plansService';
import { queryKeys, cacheConfig } from '../../config/queryClient';

const LEVEL_LABELS = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

function LevelPlanEmbedded({ program, levels }) {
  const defaultLevel = program?.levels?.default || levels[0];
  const [level, setLevel] = useState(defaultLevel);
  const planId = program?.level_plans?.[level];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Planificacion:
        </span>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          style={{
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
          }}
        >
          {levels.map((lvl) => (
            <option key={lvl} value={lvl} style={{ background: '#1a1a1a' }}>
              {LEVEL_LABELS[lvl] || lvl}
            </option>
          ))}
        </select>
      </div>
      {planId ? (
        <PlanDetailScreen key={planId} planId={planId} embedded />
      ) : (
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sin plan asignado para este nivel.</p>
      )}
    </div>
  );
}

export default function ProgramTrainingTab({ programId, creatorId, program = null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isAddingWeek, setIsAddingWeek] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const autoCreatedRef = useRef(false);

  const { data: modules = [], isLoading: isLoadingModules, isSuccess } = useQuery({
    queryKey: queryKeys.modules.all(programId),
    queryFn: () => programService.getModulesByProgram(programId),
    enabled: !!programId,
    ...cacheConfig.activeProgram,
  });

  useEffect(() => {
    if (!isSuccess || modules.length > 0 || autoCreatedRef.current || !programId) return;
    autoCreatedRef.current = true;
    programService.createModule(programId).then(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
    });
  }, [isSuccess, modules.length, programId, queryClient]);

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

  const hasLevelPlans = program?.level_plans && Object.keys(program.level_plans).length > 0;

  if (hasLevelPlans) {
    const levels = program?.levels?.options || Object.keys(program.level_plans);
    return <LevelPlanEmbedded program={program} levels={levels} />;
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
            programId={programId}
            program={program}
            modules={modules}
            onModulesChange={handleModulesChange}
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
