import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { GlowingEffect, AnimatedList, MenuDropdown } from '../ui';
import PanelShell from './PanelShell';
import apiClient from '../../utils/apiClient';
import plansService from '../../services/plansService';
import { cacheConfig } from '../../config/queryClient';

const DotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="bib-plan-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M19 9L12 16L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function PlanCard({ plan, expanded, onToggle, onDelete }) {
  const menuItems = [
    {
      label: 'Eliminar',
      danger: true,
      onClick: () => onDelete(plan.id, plan.title),
    },
  ];

  return (
    <div className={`bib-card bib-plan-card ${expanded ? 'bib-plan-card--expanded' : ''}`}>
      <GlowingEffect spread={20} borderWidth={1} disabled={!expanded} />
      <div className="bib-plan-header" role="button" tabIndex={0} onClick={onToggle} onKeyDown={(e) => e.key === 'Enter' && onToggle()}>
        <span className="bib-plan-name">{plan.title || 'Sin nombre'}</span>
        <div className="bib-plan-chips">
          {plan.weekCount != null && (
            <span className="bib-pill bib-pill--dim">
              {plan.weekCount} {plan.weekCount === 1 ? 'semana' : 'semanas'}
            </span>
          )}
          {plan.clientCount != null && (
            <span className="bib-pill bib-pill--dim">
              {plan.clientCount} {plan.clientCount === 1 ? 'cliente' : 'clientes'}
            </span>
          )}
        </div>
        <div className="bib-plan-menu" onClick={(e) => e.stopPropagation()}>
          <MenuDropdown
            trigger={<button type="button" className="bib-plan-menu-trigger"><DotsIcon /></button>}
            items={menuItems}
          />
        </div>
        <ChevronIcon />
      </div>

      <div className="bib-plan-expand">
        <div className="bib-plan-weeks">
          {plan.weeks?.length > 0 ? plan.weeks.map((week, i) => (
            <div key={week.id ?? i} className="bib-week-card">
              <p className="bib-week-label">Semana {week.order ?? i + 1}</p>
              <p className="bib-week-name">{week.title || `Semana ${i + 1}`}</p>
              {week.sessionCount != null && (
                <span className="bib-week-chip">{week.sessionCount} sesiones</span>
              )}
            </div>
          )) : (
            <p className="bib-plan-weeks-empty">Sin semanas configuradas</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlansPanel({ searchQuery = '' }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [expandedIds, setExpandedIds] = useState({});

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

  return (
    <PanelShell
      isLoading={isLoading}
      isError={!!error}
      isEmpty={filtered.length === 0 && !isLoading}
      emptyTitle="Sin planes individuales"
      emptySub="Crea un plan base y personalizalo por cliente."
      emptyCta="+ Nuevo plan"
      onCta={() => createPlanMutation.mutate()}
      onRetry={() => queryClient.invalidateQueries({ queryKey: ['plans', 'creator', user?.uid] })}
    >
      <div className="bib-plans-list">
        <AnimatedList stagger={70}>
          {filtered.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              expanded={!!expandedIds[plan.id]}
              onToggle={() => toggleExpanded(plan.id)}
              onDelete={handleDeletePlan}
            />
          ))}
        </AnimatedList>
      </div>
    </PanelShell>
  );
}
