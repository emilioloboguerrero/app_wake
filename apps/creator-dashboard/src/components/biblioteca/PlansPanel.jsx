import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { GlowingEffect, AnimatedList, MenuDropdown, ConfirmDeleteModal } from '../ui';
import PanelShell from './PanelShell';
import CreatePlanOverlay from './CreatePlanOverlay';
import apiClient from '../../utils/apiClient';
import plansService from '../../services/plansService';
import { cacheConfig, queryKeys } from '../../config/queryClient';

const DotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

function PlanCard({ plan, onDelete, onOpen }) {
  return (
    <div className="bib-card bib-plan-card" onClick={() => onOpen(plan.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(plan.id)}>
      <GlowingEffect spread={20} borderWidth={1} />
      <div className="bib-plan-body">
        <span className="bib-plan-name">{plan.title || 'Sin nombre'}</span>
        {plan.discipline && <span className="bib-plan-discipline">{plan.discipline}</span>}
        <div className="bib-plan-chips">
          {plan.weekCount != null && (
            <span className="bib-pill bib-pill--dim">
              {plan.weekCount} {plan.weekCount === 1 ? 'semana' : 'semanas'}
            </span>
          )}
          {plan.clientCount > 0 && (
            <span className="bib-pill bib-pill--dim">
              {plan.clientCount} {plan.clientCount === 1 ? 'cliente' : 'clientes'}
            </span>
          )}
        </div>
      </div>
      <div className="bib-plan-actions">
        <div className="bib-plan-menu" onClick={(e) => e.stopPropagation()}>
          <MenuDropdown
            trigger={<button type="button" className="bib-plan-menu-trigger"><DotsIcon /></button>}
            items={[{ label: 'Eliminar', danger: true, onClick: () => onDelete(plan.id, plan.title) }]}
          />
        </div>
        <span className="bib-plan-open-icon"><ArrowRightIcon /></span>
      </div>
    </div>
  );
}

export default function PlansPanel({ searchQuery = '', sortKey }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: plans = [], isLoading, error } = useQuery({
    queryKey: queryKeys.plans.byCreator(user?.uid),
    queryFn: () => apiClient.get('/creator/plans').then((r) => r.data),
    enabled: !!user?.uid,
    ...cacheConfig.otherPrograms,
  });

  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    let result = q ? plans.filter((p) => p.title?.toLowerCase().includes(q)) : [...plans];
    if (sortKey === 'name_asc') result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (sortKey === 'name_desc') result.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    else if (sortKey === 'date_newest') result.sort((a, b) => (b.created_at?._seconds || 0) - (a.created_at?._seconds || 0));
    else if (sortKey === 'date_oldest') result.sort((a, b) => (a.created_at?._seconds || 0) - (b.created_at?._seconds || 0));
    return result;
  }, [plans, q, sortKey]);

  const handlePlanCreated = useCallback((data) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.plans.byCreator(user?.uid) });
    setIsCreateOpen(false);
    if (data?.id) navigate(`/plans/${data.id}`);
  }, [queryClient, user?.uid, navigate]);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const deletePlanMutation = useMutation({
    mutationFn: (planId) => plansService.deletePlan(planId),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.byCreator(user?.uid) });
      showToast('Plan eliminado.', 'success');
    },
    onError: () => showToast('No pudimos eliminar el plan. Intenta de nuevo.', 'error'),
  });

  const handleDeletePlan = useCallback((planId, title) => {
    setDeleteTarget({ id: planId, title });
  }, []);

  const confirmDeletePlan = useCallback(() => {
    if (!deleteTarget) return;
    deletePlanMutation.mutate(deleteTarget.id);
  }, [deleteTarget, deletePlanMutation]);

  const handleOpenPlan = useCallback((planId) => {
    navigate(`/plans/${planId}`);
  }, [navigate]);

  return (
    <>
      <PanelShell
        isLoading={isLoading}
        isError={!!error}
        isEmpty={filtered.length === 0 && !isLoading}
        emptyTitle="Sin planes individuales"
        emptySub="Crea un plan base y personalizalo por cliente."
        emptyCta="+ Nuevo plan"
        onCta={() => setIsCreateOpen(true)}
        onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.plans.byCreator(user?.uid) })}
      >
        <div className="bib-plans-list">
          <AnimatePresence mode="popLayout">
            {filtered.map((plan) => (
              <motion.div
                key={plan.id}
                layout
                exit={{ opacity: 0, scale: 0.92, x: -30, filter: 'blur(4px)' }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <PlanCard
                  plan={plan}
                  onDelete={handleDeletePlan}
                  onOpen={handleOpenPlan}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </PanelShell>

      <CreatePlanOverlay
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handlePlanCreated}
      />

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeletePlan}
        itemName={deleteTarget?.title || 'este plan'}
        description="Esta acción no se puede deshacer."
        isDeleting={deletePlanMutation.isPending}
      />
    </>
  );
}
