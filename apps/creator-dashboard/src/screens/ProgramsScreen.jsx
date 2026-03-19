import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  GlowingEffect,
  TubelightNavBar,
  SkeletonCard,
  ProgressRing,
  AnimatedList,
  SpotlightTutorial,
} from '../components/ui';
import apiClient from '../utils/apiClient';
import { cacheConfig } from '../config/queryClient';
import './ProgramsScreen.css';

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'grupales', label: 'Programas grupales' },
  { id: 'individuales', label: 'Planes individuales' },
];

const TUTORIAL_STEPS = [
  {
    selector: '.programs-fab',
    title: 'Crea un programa',
    body: 'Pulsa aquí para crear tu primer programa grupal.',
  },
  {
    selector: '.program-card',
    title: 'Tu programa',
    body: 'Cada programa muestra la adherencia de tus clientes en tiempo real.',
  },
  {
    selector: '.tab-planes',
    title: 'Planes individuales',
    body: 'Diseña planes semana a semana para clientes uno a uno.',
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
    <button className="ps-empty__cta" onClick={onClick}>{cta}</button>
  </div>
);

// ─── Error state ──────────────────────────────────────────────────────────────

const ErrorState = ({ message }) => (
  <div className="ps-error-state">
    <p>{message}</p>
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

const PlanRow = ({ plan, expanded, onToggle }) => (
  <div className={`ps-plan-row ${expanded ? 'ps-plan-row--expanded' : ''}`}>
    <GlowingEffect spread={20} proximity={48} inactiveZone={0.6} disabled={!expanded} />

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

// ─── Create program modal ─────────────────────────────────────────────────────

const CreateProgramModal = ({ onClose, onSubmit, isPending }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: description.trim() });
  };

  return (
    <div className="ps-modal-backdrop" onClick={onClose}>
      <div
        className="ps-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ps-modal-title"
      >
        <div className="ps-modal__header">
          <h2 className="ps-modal__title" id="ps-modal-title">Nuevo programa</h2>
          <button className="ps-modal__close" onClick={onClose} aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form className="ps-modal__form" onSubmit={handleSubmit}>
          <div className="ps-modal__field">
            <label className="ps-modal__label" htmlFor="ps-program-title">
              Nombre del programa <span className="ps-modal__required">*</span>
            </label>
            <input
              id="ps-program-title"
              className="ps-modal__input"
              type="text"
              placeholder="Ej: Fuerza avanzada 12 semanas"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="ps-modal__field">
            <label className="ps-modal__label" htmlFor="ps-program-desc">
              Descripción
            </label>
            <textarea
              id="ps-program-desc"
              className="ps-modal__textarea"
              placeholder="Describe el objetivo y características de este programa..."
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="ps-modal__actions">
            <button
              type="button"
              className="ps-modal__btn-cancel"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="ps-modal__btn-create"
              disabled={!title.trim() || isPending}
            >
              {isPending ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Grupales tab ─────────────────────────────────────────────────────────────

const GrupalesTab = ({ userId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const { data: programs = [], isLoading, error } = useQuery({
    queryKey: ['programs', 'creator', userId],
    queryFn: () => apiClient.get('/programs').then((r) => r.data),
    enabled: !!userId,
    ...cacheConfig.programStructure,
  });

  const createMutation = useMutation({
    mutationFn: ({ title, description }) =>
      apiClient.post('/programs', { title, description }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programs', 'creator', userId] });
      setShowModal(false);
    },
  });

  const handleCardClick = useCallback((program) => {
    navigate(`/programs/${program.id}`);
  }, [navigate]);

  return (
    <div className="ps-tab-pane">
      {isLoading ? (
        <GridSkeleton />
      ) : error ? (
        <ErrorState message="No se pudieron cargar los programas. Por favor, intenta de nuevo." />
      ) : programs.length === 0 ? (
        <EmptyState
          text="Aún no tienes programas. ¡Crea el primero!"
          cta="Crea tu primer programa →"
          onClick={() => setShowModal(true)}
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

      <button
        className="ps-fab programs-fab"
        onClick={() => setShowModal(true)}
        aria-label="Crear programa"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        </svg>
      </button>

      {showModal && (
        <CreateProgramModal
          onClose={() => setShowModal(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
        />
      )}
    </div>
  );
};

// ─── Individuales tab ─────────────────────────────────────────────────────────

const IndividualesTab = ({ userId }) => {
  const [expandedIds, setExpandedIds] = useState({});

  const { data: plans = [], isLoading, error } = useQuery({
    queryKey: ['plans', 'creator', userId],
    queryFn: () => apiClient.get('/plans').then((r) => r.data),
    enabled: !!userId,
    ...cacheConfig.programStructure,
  });

  const toggleExpanded = useCallback((id) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div className="ps-tab-pane">
      {isLoading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState message="No se pudieron cargar los planes. Por favor, intenta de nuevo." />
      ) : plans.length === 0 ? (
        <EmptyState
          text="Aún no tienes planes individuales. ¡Crea el primero!"
          cta="Crea tu primer plan individual →"
          onClick={() => {}}
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
  const [activeTab, setActiveTab] = useState('grupales');

  return (
    <DashboardLayout screenName="Programas">
      <ErrorBoundary>
        <div className="programs-screen">
          <div className="ps-nav-wrap">
            <TubelightNavBar
              items={TABS}
              activeId={activeTab}
              onSelect={setActiveTab}
            />
          </div>

          <div className="ps-content">
            {activeTab === 'grupales' ? (
              <GrupalesTab userId={user?.uid} />
            ) : (
              <div className="tab-planes">
                <IndividualesTab userId={user?.uid} />
              </div>
            )}
          </div>
        </div>

        <SpotlightTutorial
          screenKey="programs"
          steps={TUTORIAL_STEPS}
        />
      </ErrorBoundary>
    </DashboardLayout>
  );
};

export default ProgramsScreen;
