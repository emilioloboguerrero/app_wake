import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ProgramWeeksGrid from '../ProgramWeeksGrid';
import PlanningLibrarySidebar from '../PlanningLibrarySidebar';
import programService from '../../services/programService';
import libraryService from '../../services/libraryService';
import plansService from '../../services/plansService';
import { queryKeys, cacheConfig } from '../../config/queryClient';

export default function ProgramTrainingTab({ programId, creatorId }) {
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
      await programService.createModule(programId);
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
    } finally {
      setIsAddingWeek(false);
    }
  }, [programId, queryClient]);

  const handleDeleteWeek = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
  }, [programId, queryClient]);

  const handleModulesChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
  }, [programId, queryClient]);

  const handleSessionClick = useCallback((mod, session) => {
    navigate(`/programs/${programId}/modules/${mod.id}/sessions/${session.id}/edit`);
  }, [navigate, programId]);

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
        <ProgramWeeksGrid
          programId={programId}
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
      </div>
    </div>
  );
}
