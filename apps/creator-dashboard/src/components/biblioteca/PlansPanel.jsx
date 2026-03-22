import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { GlowingEffect, SkeletonCard, AnimatedList, FullScreenError } from '../ui';
import apiClient from '../../utils/apiClient';
import plansService from '../../services/plansService';
import { cacheConfig } from '../../config/queryClient';

const PlanRow = ({ plan, expanded, onToggle, isEditing, onDelete }) => (
  <div className={`ps-plan-row ${expanded ? 'ps-plan-row--expanded' : ''}`}>
    <GlowingEffect spread={20} proximity={48} inactiveZone={0.6} disabled={!expanded} />

    {isEditing && (
      <button
        type="button"
        className="ps-plan-row__delete"
        onClick={(e) => { e.stopPropagation(); onDelete(plan.id, plan.title); }}
        aria-label="Eliminar plan"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    )}

    <button className="ps-plan-row__header" onClick={onToggle} aria-expanded={expanded}>
      <span className="ps-plan-row__name">{plan.title || 'Sin nombre'}</span>
      <div className="ps-plan-row__chips">
        {plan.weekCount != null && (
          <span className="ps-plan-row__chip">
            {plan.weekCount} {plan.weekCount === 1 ? 'semana' : 'semanas'}
          </span>
        )}
        {plan.clientCount != null && (
          <span className="ps-plan-row__chip">
            {plan.clientCount} {plan.clientCount === 1 ? 'cliente' : 'clientes'}
          </span>
        )}
      </div>
      <svg className="ps-plan-row__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M19 9L12 16L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>

    <div className="ps-plan-row__expand">
      <div className="ps-plan-weeks">
        {plan.weeks?.length > 0 ? plan.weeks.map((week, i) => (
          <div key={week.id ?? i} className="ps-week-card">
            <p className="ps-week-card__label">Semana {week.order ?? i + 1}</p>
            <p className="ps-week-card__name">{week.title || `Semana ${i + 1}`}</p>
            {week.sessionCount != null && (
              <span className="ps-week-card__chip">{week.sessionCount} sesiones</span>
            )}
          </div>
        )) : (
          <p className="ps-plan-weeks__empty">Sin semanas configuradas</p>
        )}
      </div>
    </div>
  </div>
);

const ListSkeleton = () => (
  <div className="ps-list-skeleton" aria-busy="true" aria-label="Cargando planes">
    {Array.from({ length: 4 }).map((_, i) => (
      <SkeletonCard key={i} className="ps-list-skeleton-row" />
    ))}
  </div>
);

export default function PlansPanel({ searchQuery = '' }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [expandedIds, setExpandedIds] = useState({});
  const [isEditing, setIsEditing] = useState(false);

  const { data: plans = [], isLoading, error } = useQuery({
    queryKey: ['plans', 'creator', user?.uid],
    queryFn: () => apiClient.get('/creator/plans').then((r) => r.data),
    enabled: !!user?.uid,
    ...cacheConfig.programStructure,
  });

  const q = searchQuery.trim().toLowerCase();
  const filtered = q ? plans.filter((p) => p.title?.toLowerCase().includes(q)) : plans;

  const createPlanMutation = useMutation({
    mutationFn: () => plansService.createPlan(user?.uid, null, { title: 'Nuevo plan' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['plans', 'creator', user?.uid] });
      const planId = res?.id;
      if (planId) navigate(`/plans/${planId}`);
    },
    onError: () => showToast('No pudimos crear el plan. Intenta de nuevo.', 'error'),
  });

  const deletePlanMutation = useMutation({
    mutationFn: (planId) => plansService.deletePlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', 'creator', user?.uid] });
      showToast('Plan eliminado.', 'success');
    },
    onError: () => showToast('No pudimos eliminar el plan. Intenta de nuevo.', 'error'),
  });

  const handleDeletePlan = useCallback((planId, title) => {
    if (!window.confirm(`¿Eliminar "${title || 'este plan'}"? Esta acción no se puede deshacer.`)) return;
    deletePlanMutation.mutate(planId);
  }, [deletePlanMutation]);

  const toggleExpanded = useCallback((id) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  if (isLoading) return <ListSkeleton />;
  if (error) {
    return (
      <FullScreenError
        title="No pudimos cargar tus planes"
        message="Revisa tu conexion e intenta de nuevo."
        onRetry={() => queryClient.invalidateQueries({ queryKey: ['plans', 'creator', user?.uid] })}
      />
    );
  }
  if (filtered.length === 0) {
    return (
      <div className="lib-empty">
        <p className="lib-empty-title">Sin planes individuales</p>
        <p className="lib-empty-sub">Crea un plan base y personalizalo por cliente.</p>
        <button className="lib-empty-cta" onClick={() => createPlanMutation.mutate()}>+ Nuevo plan</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          type="button"
          className={`ps-nav-action ${isEditing ? 'ps-nav-action--active' : ''}`}
          onClick={() => setIsEditing(prev => !prev)}
        >
          {isEditing ? 'Listo' : 'Editar'}
        </button>
      </div>
      <div className="ps-plan-list">
        <AnimatedList stagger={70}>
          {filtered.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              expanded={!!expandedIds[plan.id]}
              onToggle={() => toggleExpanded(plan.id)}
              isEditing={isEditing}
              onDelete={handleDeletePlan}
            />
          ))}
        </AnimatedList>
      </div>
    </div>
  );
}
