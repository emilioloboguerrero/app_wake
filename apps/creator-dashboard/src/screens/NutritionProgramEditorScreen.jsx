import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import { FullScreenError } from '../components/ui';
import ShimmerSkeleton from '../components/ui/ShimmerSkeleton';
import NutritionLibrarySidebar from '../components/nutrition/NutritionLibrarySidebar';
import NutritionWeeksGrid from '../components/nutrition/NutritionWeeksGrid';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { cacheConfig, queryKeys } from '../config/queryClient';
import * as nutritionDb from '../services/nutritionFirestoreService';
import './NutritionProgramEditorScreen.css';

const BACK_PATH = '/biblioteca?domain=nutricion&tab=programas_nutri';

const emptyWeek = () => ({ days: [null, null, null, null, null, null, null] });

const normalizeWeeks = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) return [emptyWeek()];
  return raw.map((w) => ({
    days: Array.isArray(w?.days) && w.days.length === 7
      ? w.days.map((d) => (typeof d === 'string' ? d : null))
      : [null, null, null, null, null, null, null],
  }));
};

export default function NutritionProgramEditorScreen() {
  const { programId } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();
  const creatorId = user?.uid ?? '';

  const detailKey = queryKeys.nutrition.program(creatorId, programId);

  const programQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => nutritionDb.getProgramById(creatorId, programId),
    enabled: !!creatorId && !!programId,
    ...cacheConfig.programStructure,
  });

  const plansQuery = useQuery({
    queryKey: queryKeys.nutrition.plans(creatorId),
    queryFn: () => nutritionDb.getPlansByCreator(creatorId),
    enabled: !!creatorId,
    ...cacheConfig.otherPrograms,
  });

  const program = programQuery.data;
  const programName = program?.name ?? '';
  const weeks = useMemo(() => normalizeWeeks(program?.weeks), [program?.weeks]);

  const daysById = useMemo(() => {
    const map = new Map();
    (plansQuery.data ?? []).forEach((d) => map.set(d.id, d));
    return map;
  }, [plansQuery.data]);

  const [sidebarSearch, setSidebarSearch] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const saveMutation = useMutation({
    mutationFn: (updates) => nutritionDb.updateProgram(creatorId, programId, {
      name: updates.name ?? program?.name ?? '',
      description: program?.description ?? '',
      weeks: updates.weeks ?? program?.weeks ?? [emptyWeek()],
    }),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData(detailKey);
      queryClient.setQueryData(detailKey, (old) => ({ ...(old ?? {}), ...updates }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
      showToast('No pudimos guardar el cambio.', 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: detailKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.programs(creatorId) });
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'program-assignments', programId] });
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'assignments'] });
    },
  });

  const saveWeeks = useCallback((nextWeeks) => {
    saveMutation.mutate({ weeks: nextWeeks });
  }, [saveMutation]);

  const handleAddWeek = useCallback(() => {
    saveWeeks([...weeks, emptyWeek()]);
  }, [weeks, saveWeeks]);

  const handleDeleteWeek = useCallback((weekIndex) => {
    const next = weeks.length <= 1 ? [emptyWeek()] : weeks.filter((_, i) => i !== weekIndex);
    saveWeeks(next);
  }, [weeks, saveWeeks]);

  const handleDuplicateWeek = useCallback((weekIndex) => {
    const source = weeks[weekIndex];
    if (!source) return;
    const copy = { days: [...source.days] };
    const next = [...weeks.slice(0, weekIndex + 1), copy, ...weeks.slice(weekIndex + 1)];
    saveWeeks(next);
  }, [weeks, saveWeeks]);

  const handleAssignPlan = useCallback((weekIndex, dayIndex, planId) => {
    const next = weeks.map((w, wi) => (
      wi === weekIndex
        ? { days: w.days.map((d, di) => (di === dayIndex ? planId : d)) }
        : w
    ));
    saveWeeks(next);
  }, [weeks, saveWeeks]);

  const handleClearSlot = useCallback((weekIndex, dayIndex) => {
    const next = weeks.map((w, wi) => (
      wi === weekIndex
        ? { days: w.days.map((d, di) => (di === dayIndex ? null : d)) }
        : w
    ));
    saveWeeks(next);
  }, [weeks, saveWeeks]);

  const handleMoveDay = useCallback(({ fromWeekIndex, fromDayIndex, toWeekIndex, toDayIndex, planId }) => {
    const next = weeks.map((w, wi) => {
      if (wi !== fromWeekIndex && wi !== toWeekIndex) return w;
      const days = [...w.days];
      if (wi === fromWeekIndex) days[fromDayIndex] = null;
      if (wi === toWeekIndex) days[toDayIndex] = planId;
      return { days };
    });
    saveWeeks(next);
  }, [weeks, saveWeeks]);

  const handleDuplicateDay = useCallback(({ toWeekIndex, toDayIndex, planId }) => {
    const next = weeks.map((w, wi) => (
      wi === toWeekIndex
        ? { days: w.days.map((d, di) => (di === toDayIndex ? planId : d)) }
        : w
    ));
    saveWeeks(next);
  }, [weeks, saveWeeks]);

  const openNameEditor = useCallback(() => {
    setNameDraft(programName);
    setIsEditingName(true);
  }, [programName]);

  const commitName = useCallback(() => {
    const trimmed = nameDraft.trim();
    setIsEditingName(false);
    if (!trimmed || trimmed === programName) return;
    saveMutation.mutate({ name: trimmed });
  }, [nameDraft, programName, saveMutation]);

  if (programQuery.isLoading) {
    return (
      <DashboardLayout
        screenName="Plan nutricional"
        showBackButton
        backPath={BACK_PATH}
      >
        <div className="np-root">
          <div className="plan-structure-layout" aria-hidden>
            <div className="plan-structure-sidebars">
              <div className="planning-library-sidebar">
                <div className="plan-structure-search">
                  <ShimmerSkeleton width="100%" height="36px" borderRadius="8px" />
                </div>
                <div className="planning-sidebar-content">
                  <ShimmerSkeleton width="60%" height="11px" borderRadius="3px" />
                  <div style={{ height: 12 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <ShimmerSkeleton key={i} width="100%" height="44px" borderRadius="10px" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="plan-structure-main">
              <div className="plan-weeks-grid">
                <div className="plan-weeks-grid-header">
                  <ShimmerSkeleton width="140px" height="36px" borderRadius="8px" />
                </div>
                <div className="plan-weeks-list-wrap">
                  <div className="plan-weeks-days-header">
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                      <div key={d} className="plan-weeks-days-header-cell">
                        <ShimmerSkeleton width="32px" height="14px" borderRadius="4px" />
                      </div>
                    ))}
                  </div>
                  {[0, 1].map((i) => (
                    <div key={i} className="plan-weeks-week-block">
                      <div className="plan-weeks-week-header">
                        <ShimmerSkeleton width="90px" height="16px" borderRadius="4px" />
                      </div>
                      <div className="plan-weeks-week-days">
                        {[0, 1, 2, 3, 4, 5, 6].map((j) => (
                          <div key={j} className="plan-weeks-day-cell">
                            {(i + j) % 2 === 0 && (
                              <ShimmerSkeleton width="100%" height="44px" borderRadius="8px" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (programQuery.isError || !program) {
    return (
      <DashboardLayout
        screenName="Plan nutricional"
        showBackButton
        backPath={BACK_PATH}
      >
        <FullScreenError
          message="No pudimos cargar este plan."
          onRetry={() => programQuery.refetch()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      screenName={programName || 'Plan nutricional'}
      showBackButton
      backPath={BACK_PATH}
      onHeaderEditClick={openNameEditor}
    >
      <div className="np-root">
        <div className="plan-structure-layout">
          <div className="plan-structure-sidebars">
            <NutritionLibrarySidebar
              creatorId={creatorId}
              searchQuery={sidebarSearch}
              onSearchChange={setSidebarSearch}
            />
          </div>
          <div className="plan-structure-main">
            <NutritionWeeksGrid
              weeks={weeks}
              daysById={daysById}
              plans={plansQuery.data ?? []}
              isLoadingPlans={plansQuery.isLoading}
              onAddWeek={handleAddWeek}
              onDeleteWeek={handleDeleteWeek}
              onDuplicateWeek={handleDuplicateWeek}
              onAssignPlan={handleAssignPlan}
              onClearSlot={handleClearSlot}
              onMoveDay={handleMoveDay}
              onDuplicateDay={handleDuplicateDay}
              showToast={showToast}
            />
          </div>
        </div>
      </div>

      <Modal
        isOpen={isEditingName}
        onClose={() => setIsEditingName(false)}
        title="Editar nombre"
      >
        <div className="np-name-modal">
          <input
            autoFocus
            type="text"
            className="np-name-modal-input"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitName(); }
              if (e.key === 'Escape') setIsEditingName(false);
            }}
            placeholder="Nombre del plan"
            maxLength={200}
          />
          <div className="np-name-modal-actions">
            <button type="button" className="np-name-modal-btn np-name-modal-btn--secondary" onClick={() => setIsEditingName(false)}>
              Cancelar
            </button>
            <button type="button" className="np-name-modal-btn np-name-modal-btn--primary" onClick={commitName}>
              Listo
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
