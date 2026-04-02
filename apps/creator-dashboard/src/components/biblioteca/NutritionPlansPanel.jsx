import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
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

function MacroPie({ protein = 0, carbs = 0, fat = 0, id }) {
  const data = useMemo(() => {
    return [
      { name: 'Proteina', value: protein, grams: protein },
      { name: 'Carbohidratos', value: carbs, grams: carbs },
      { name: 'Grasa', value: fat, grams: fat },
    ].filter((d) => d.value > 0);
  }, [protein, carbs, fat]);

  if (data.length === 0) return null;

  return (
    <div style={{ width: 72, height: 72, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <defs>
            {[0, 1, 2].map((i) => (
              <linearGradient key={i} id={`card-pie-grad-${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`rgba(255,255,255,${0.22 + i * 0.06})`} />
                <stop offset="50%" stopColor={`rgba(255,255,255,${0.12 + i * 0.04})`} />
                <stop offset="100%" stopColor={`rgba(255,255,255,${0.05 + i * 0.03})`} />
              </linearGradient>
            ))}
          </defs>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={18}
            outerRadius={32}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={false}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={`url(#card-pie-grad-${id}-${i})`} />
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
  );
}

export default function NutritionPlansPanel({ searchQuery = '', sortKey, onCreatePlan }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();
  const creatorId = user?.uid ?? '';

  const { data: plans = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.nutrition.plans(creatorId),
    queryFn: () => nutritionDb.getPlansByCreator(creatorId),
    enabled: !!creatorId,
    ...cacheConfig.otherPrograms,
    refetchOnMount: true,
  });

  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    let result = q ? plans.filter((i) => (i.name ?? '').toLowerCase().includes(q)) : [...plans];
    if (sortKey === 'name_asc') result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortKey === 'name_desc') result.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    else if (sortKey === 'date_newest') result.sort((a, b) => (b.created_at?._seconds || 0) - (a.created_at?._seconds || 0));
    else if (sortKey === 'date_oldest') result.sort((a, b) => (a.created_at?._seconds || 0) - (b.created_at?._seconds || 0));
    return result;
  }, [plans, q, sortKey]);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: (planId) => nutritionDb.deletePlan(creatorId, planId),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.plans(creatorId) });
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
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="bib-card bib-nutri-plan-card"
          aria-hidden="true"
          style={{ opacity: 1 - i * 0.12 }}
        >
          <div className="bib-nutri-plan-card__left">
            <ShimmerSkeleton height="14px" width={`${50 + (i % 3) * 12}%`} borderRadius="4px" />
            <ShimmerSkeleton height="11px" width={`${65 + (i % 2) * 15}%`} borderRadius="3px" />
          </div>
          <div className="bib-nutri-plan-card__right">
            <div className="bib-nutri-plan-card__macros">
              <ShimmerSkeleton width="64px" height="64px" borderRadius="50%" />
              <div className="bib-nutri-plan-card__macro-labels">
                <ShimmerSkeleton height="11px" width="28px" borderRadius="3px" />
                <ShimmerSkeleton height="11px" width="28px" borderRadius="3px" />
                <ShimmerSkeleton height="11px" width="28px" borderRadius="3px" />
              </div>
            </div>
            <ShimmerSkeleton height="15px" width="58px" borderRadius="4px" />
          </div>
        </div>
      ))}
    </div>
  ), []);

  return (
    <>
    <PanelShell
      isLoading={isLoading && !plans.length}
      isError={isError}
      isEmpty={!plans.length && !isLoading}
      emptyTitle="Sin planes de nutricion"
      emptySub="Crea un plan y asignalo a tus clientes."
      emptyCta="+ Crear plan"
      onCta={onCreatePlan}
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
              {filtered.map((item) => {
                const kcal = item.daily_calories ?? 0;
                const p = item.daily_protein_g ?? 0;
                const c = item.daily_carbs_g ?? 0;
                const f = item.daily_fat_g ?? 0;
                const hasMacros = p + c + f > 0;

                return (
                  <motion.div
                    key={item.id}
                    layout
                    exit={{ opacity: 0, scale: 0.92, x: -30, filter: 'blur(4px)' }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div
                      className="bib-card bib-nutri-plan-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/nutrition/plans/${item.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/nutrition/plans/${item.id}`)}
                    >
                      <GlowingEffect spread={18} borderWidth={1} />
                      <div className="bib-nutri-plan-card__left">
                        <span className="bib-nutri-card-name">{item.name}</span>
                        {item.description && <span className="bib-nutri-card-meta">{item.description}</span>}
                      </div>
                      {hasMacros && (
                        <div className="bib-nutri-plan-card__right">
                          <div className="bib-nutri-plan-card__macros">
                            <MacroPie protein={p} carbs={c} fat={f} id={item.id} />
                            <div className="bib-nutri-plan-card__macro-labels">
                              <span className="bib-nutri-plan-card__macro">
                                {Math.round(p)}P
                              </span>
                              <span className="bib-nutri-plan-card__macro">
                                {Math.round(c)}C
                              </span>
                              <span className="bib-nutri-plan-card__macro">
                                {Math.round(f)}G
                              </span>
                            </div>
                          </div>
                          {kcal > 0 && (
                            <span className="bib-nutri-plan-card__kcal">{Math.round(kcal)} kcal</span>
                          )}
                        </div>
                      )}
                      <div className="bib-plan-menu" onClick={(e) => e.stopPropagation()}>
                        <MenuDropdown
                          trigger={<button type="button" className="bib-plan-menu-trigger"><DotsIcon /></button>}
                          items={[{ label: 'Eliminar', danger: true, onClick: () => setDeleteTarget({ id: item.id, name: item.name }) }]}
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
        description="Esta accion no se puede deshacer."
        isDeleting={deleteMutation.isPending}
      />
    </>
  );
}
