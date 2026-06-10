import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ProgramWeeksGrid from '../ProgramWeeksGrid';
import ProgramCadenceCalendar from './ProgramCadenceCalendar';
import LevelPlanSelector from './LevelPlanSelector';
import PlanningLibrarySidebar from '../PlanningLibrarySidebar';
import programService from '../../services/programService';
import libraryService from '../../services/libraryService';
import plansService from '../../services/plansService';
import { queryKeys, cacheConfig } from '../../config/queryClient';

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
  if (hasLevelPlans) return <LevelPlanSelector program={program} />;

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
