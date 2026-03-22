import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  GlowingEffect,
  TubelightNavBar,
  SkeletonCard,
  ProgressRing,
  AnimatedList,
  SpotlightTutorial,
  FullScreenError,
} from '../components/ui';
import apiClient from '../utils/apiClient';
import plansService from '../services/plansService';
import CreateFlowOverlay from '../components/CreateFlowOverlay';
import { cacheConfig } from '../config/queryClient';
import './ProgramsScreen.css';

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'grupales', label: 'Programas grupales' },
  { id: 'individuales', label: 'Planes individuales' },
];

const TUTORIAL_STEPS = [
  {
    selector: '.ps-nav-wrap',
    title: 'Tipos de programa',
    body: 'Los programas grupales son los que vendes a multiples clientes. Los planes individuales se personalizan por persona.',
  },
  {
    selector: '.programs-fab',
    title: 'Crea un programa',
    body: 'Empieza con la estructura basica. Despues puedes arrastrar sesiones desde tu biblioteca.',
  },
  {
    selector: '.program-card',
    title: 'Tu programa',
    body: 'Cada programa muestra cuantos clientes estan inscritos y su tasa de completitud.',
  },
];

// ─── Skeleton states ──────────────────────────────────────────────────────────

const GridSkeleton = () => (
  <div className="ps-grid ps-grid--skeleton" aria-busy="true" aria-label="Cargando programas">
    {Array.from({ length: 6 }).map((_, i) => (
      <SkeletonCard key={i} className="ps-skeleton-card" />
    ))}
  </div>
);

const ListSkeleton = () => (
  <div className="ps-list-skeleton" aria-busy="true" aria-label="Cargando planes">
    {Array.from({ length: 4 }).map((_, i) => (
      <SkeletonCard key={i} className="ps-list-skeleton-row" />
    ))}
  </div>
);

// ─── Empty state ──────────────────────────────────────────────────────────────

const EmptyState = ({ text, cta, onClick }) => (
  <div className="ps-empty">
    <div className="ps-empty__icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
    <p className="ps-empty__text">{text}</p>
    {cta && <button className="ps-empty__cta" onClick={onClick}>{cta}</button>}
  </div>
);

// ─── Program card ─────────────────────────────────────────────────────────────

const ProgramCard = ({ program, index, onClick }) => {
  const completion = program.completionRate ?? 0;

  return (
    <div
      className="ps-card program-card"
      style={{ '--card-index': index }}
      role="button"
      tabIndex={0}
      onClick={() => onClick(program)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(program); }}
    >
      <GlowingEffect spread={24} proximity={60} inactiveZone={0.6} />

      {program.imageUrl ? (
        <div className="ps-card__img-wrap">
          <img
            src={program.imageUrl}
            alt={program.title || 'Programa'}
            className="ps-card__img"
            loading="lazy"
          />
          <div className="ps-card__img-gradient" />
        </div>
      ) : (
        <div className="ps-card__placeholder">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 21H21M4 21V7L12 3L20 7V21M4 21H20M9 9V17M15 9V17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      <div className="ps-card__body">
        <div className="ps-card__header">
          <p className="ps-card__name">{program.title || 'Sin nombre'}</p>
          {program.enrollmentCount != null && (
            <span className="ps-card__chip">
              {program.enrollmentCount} {program.enrollmentCount === 1 ? 'cliente' : 'clientes'}
            </span>
          )}
        </div>

        <div className="ps-card__footer">
          <div className="ps-card__ring-wrap">
            <ProgressRing
              percent={completion}
              size={40}
              strokeWidth={3}
              color="rgba(255,255,255,0.7)"
              label={`${Math.round(completion)}%`}
            />
            <span className="ps-card__ring-label">adherencia</span>
          </div>

          <button
            className="ps-card__view-btn"
            onClick={(e) => { e.stopPropagation(); onClick(program); }}
            tabIndex={-1}
            aria-hidden
          >
            Ver programa
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Plan row ─────────────────────────────────────────────────────────────────

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

    <button
      className="ps-plan-row__header"
      onClick={onToggle}
      aria-expanded={expanded}
    >
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

      <svg
        className="ps-plan-row__chevron"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
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

// ─── Grupales tab ─────────────────────────────────────────────────────────────

const GrupalesTab = ({ userId }) => {
  const navigate = useNavigate();

  const { data: programs = [], isLoading, error } = useQuery({
    queryKey: ['programs', 'creator', userId],
    queryFn: () => apiClient.get('/creator/programs').then((r) => r.data),
    enabled: !!userId,
    ...cacheConfig.programStructure,
  });

  const handleCardClick = useCallback((program) => {
    navigate(`/programs/${program.id}`);
  }, [navigate]);

  return (
    <div className="ps-tab-pane">
      {isLoading ? (
        <GridSkeleton />
      ) : error ? (
        <FullScreenError
          title="No pudimos cargar tus programas"
          message="Revisa tu conexion e intenta de nuevo."
          onRetry={() => window.location.reload()}
        />
      ) : programs.length === 0 ? (
        <EmptyState
          text="Todavia no tienes programas grupales. Usa el botón + de arriba para crear uno."
          cta={null}
        />
      ) : (
        <div className="ps-grid">
          {programs.map((program, i) => (
            <ProgramCard
              key={program.id}
              program={program}
              index={i}
              onClick={handleCardClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Individuales tab ─────────────────────────────────────────────────────────

const IndividualesTab = ({ userId, isEditing }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [expandedIds, setExpandedIds] = useState({});

  const { data: plans = [], isLoading, error } = useQuery({
    queryKey: ['plans', 'creator', userId],
    queryFn: () => apiClient.get('/creator/plans').then((r) => r.data),
    enabled: !!userId,
    ...cacheConfig.programStructure,
  });

  const createPlanMutation = useMutation({
    mutationFn: () => plansService.createPlan(userId, null, { title: 'Nuevo plan' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['plans', 'creator', userId] });
      const planId = res?.id;
      if (planId) navigate(`/plans/${planId}`);
    },
    onError: () => showToast('No pudimos crear el plan. Intenta de nuevo.', 'error'),
  });

  const deletePlanMutation = useMutation({
    mutationFn: (planId) => plansService.deletePlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', 'creator', userId] });
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
    <div className="ps-tab-pane">
      {isLoading ? (
        <ListSkeleton />
      ) : error ? (
        <FullScreenError
          title="No pudimos cargar tus planes"
          message="Revisa tu conexion e intenta de nuevo."
          onRetry={() => queryClient.invalidateQueries({ queryKey: ['plans', 'creator', userId] })}
        />
      ) : plans.length === 0 ? (
        <EmptyState
          text="Sin planes individuales. Crea un plan base y personalizalo por cliente."
          cta="Nuevo plan"
          onClick={() => createPlanMutation.mutate()}
        />
      ) : (
        <div className="ps-plan-list">
          <AnimatedList stagger={70}>
            {plans.map((plan) => (
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
      )}
    </div>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

const ProgramsScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('grupales');
  const [isEditing, setIsEditing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    setIsEditing(false);
  }, []);

  const handleCreated = useCallback(({ id, type }) => {
    setShowCreate(false);
    if (type === 'program') {
      queryClient.invalidateQueries({ queryKey: ['programs', 'creator', user?.uid] });
      if (id) navigate(`/programs/${id}`);
    } else {
      queryClient.invalidateQueries({ queryKey: ['plans', 'creator', user?.uid] });
      if (id) navigate(`/plans/${id}`);
    }
  }, [navigate, queryClient, user?.uid]);

  const createType = activeTab === 'grupales' ? 'program' : 'plan';

  return (
    <DashboardLayout screenName="Programas">
      <ErrorBoundary>
        <div className="programs-screen">
          <div className="ps-nav-wrap">
            <TubelightNavBar
              items={TABS}
              activeId={activeTab}
              onSelect={handleTabChange}
            />
            <div className="ps-nav-actions">
              <button
                type="button"
                className="ps-nav-action ps-nav-action--plus"
                onClick={() => setShowCreate(true)}
                aria-label={activeTab === 'grupales' ? 'Nuevo programa' : 'Nuevo plan'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
              {activeTab === 'individuales' && (
                <button
                  type="button"
                  className={`ps-nav-action ${isEditing ? 'ps-nav-action--active' : ''}`}
                  onClick={() => setIsEditing(prev => !prev)}
                >
                  {isEditing ? 'Listo' : 'Editar'}
                </button>
              )}
            </div>
          </div>

          <div className="ps-content">
            {activeTab === 'grupales' ? (
              <GrupalesTab userId={user?.uid} />
            ) : (
              <div className="tab-planes">
                <IndividualesTab userId={user?.uid} isEditing={isEditing} />
              </div>
            )}
          </div>
        </div>

        <SpotlightTutorial
          screenKey="programs"
          steps={TUTORIAL_STEPS}
        />

        <CreateFlowOverlay
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          type={createType}
          onCreated={handleCreated}
        />
      </ErrorBoundary>
    </DashboardLayout>
  );
};

export default ProgramsScreen;
