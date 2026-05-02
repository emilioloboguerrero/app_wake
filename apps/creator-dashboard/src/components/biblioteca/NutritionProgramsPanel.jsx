import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { GlowingEffect, MenuDropdown, ConfirmDeleteModal } from '../ui';
import ShimmerSkeleton from '../ui/ShimmerSkeleton';
import PanelShell from './PanelShell';
import * as nutritionDb from '../../services/nutritionFirestoreService';
import { cacheConfig, queryKeys } from '../../config/queryClient';

const DotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);

export default function NutritionProgramsPanel({ searchQuery = '', sortKey, onCreateProgram }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();
  const creatorId = user?.uid ?? '';

  const { data: programs = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.nutrition.programs(creatorId),
    queryFn: () => nutritionDb.getProgramsByCreator(creatorId),
    enabled: !!creatorId,
    ...cacheConfig.otherPrograms,
    refetchOnMount: true,
  });

  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    let result = q ? programs.filter((p) => (p.name ?? '').toLowerCase().includes(q)) : [...programs];
    if (sortKey === 'name_asc') result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortKey === 'name_desc') result.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    else if (sortKey === 'date_newest') result.sort((a, b) => (b.created_at?._seconds || 0) - (a.created_at?._seconds || 0));
    else if (sortKey === 'date_oldest') result.sort((a, b) => (a.created_at?._seconds || 0) - (b.created_at?._seconds || 0));
    return result;
  }, [programs, q, sortKey]);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: (programId) => nutritionDb.deleteProgram(creatorId, programId),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.programs(creatorId) });
      showToast('Plan eliminado.', 'success');
    },
    onError: (err) => showToast(err?.message || 'No pudimos eliminar el plan. Intenta de nuevo.', 'error'),
  });

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id);
  }, [deleteTarget, deleteMutation]);

  const renderSkeleton = useCallback(() => (
    <div className="bib-nutri-list">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bib-card bib-nutri-plan-card"
          aria-hidden="true"
          style={{ opacity: 1 - i * 0.15 }}
        >
          <div className="bib-nutri-plan-card__left">
            <ShimmerSkeleton height="14px" width={`${50 + (i % 3) * 12}%`} borderRadius="4px" />
            <ShimmerSkeleton height="11px" width={`${40 + (i % 2) * 20}%`} borderRadius="3px" />
          </div>
          <div className="bib-nutri-plan-card__right">
            <ShimmerSkeleton height="15px" width="80px" borderRadius="4px" />
          </div>
        </div>
      ))}
    </div>
  ), []);

  return (
    <>
      <PanelShell
        isLoading={isLoading && !programs.length}
        isError={isError}
        isEmpty={!programs.length && !isLoading}
        emptyTitle="Sin planes de nutricion"
        emptySub="Combina dias de alimentacion en una secuencia de varias semanas y asignala a tus clientes."
        emptyCta="+ Crear plan"
        onCta={onCreateProgram}
        onRetry={() => window.location.reload()}
        renderSkeleton={renderSkeleton}
      >
        <div className="bib-nutri-list">
          {filtered.length === 0 ? (
            <div className="bib-nutri-list-empty">
              <p>{searchQuery ? `Sin resultados para "${searchQuery}"` : 'Sin planes.'}</p>
            </div>
          ) : (
            <div className="bib-nutri-list">
              <AnimatePresence mode="popLayout">
                {filtered.map((program) => {
                  const wc = program.weekCount ?? 0;
                  return (
                    <motion.div
                      key={program.id}
                      layout
                      exit={{ opacity: 0, scale: 0.92, x: -30, filter: 'blur(4px)' }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div
                        className="bib-card bib-nutri-plan-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/nutrition/programs/${program.id}`)}
                        onKeyDown={(e) => e.key === 'Enter' && navigate(`/nutrition/programs/${program.id}`)}
                      >
                        <GlowingEffect spread={18} borderWidth={1} />
                        <div className="bib-nutri-plan-card__left">
                          <span className="bib-nutri-card-name">{program.name || 'Plan sin nombre'}</span>
                          {program.description && <span className="bib-nutri-card-meta">{program.description}</span>}
                        </div>
                        <div className="bib-nutri-plan-card__right">
                          <span className="bib-nutri-plan-card__kcal">{wc} {wc === 1 ? 'semana' : 'semanas'}</span>
                        </div>
                        <div className="bib-plan-menu" onClick={(e) => e.stopPropagation()}>
                          <MenuDropdown
                            trigger={<button type="button" className="bib-plan-menu-trigger"><DotsIcon /></button>}
                            items={[{ label: 'Eliminar', danger: true, onClick: () => setDeleteTarget({ id: program.id, name: program.name }) }]}
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </PanelShell>

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        itemName={deleteTarget?.name || 'este plan'}
        description="Esta accion no se puede deshacer. Las asignaciones activas seran bloqueadas."
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}
