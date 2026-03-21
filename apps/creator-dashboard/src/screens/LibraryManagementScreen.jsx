import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import { GlowingEffect, SkeletonCard, TubelightNavBar, AnimatedList, SpotlightTutorial, VirtualList, FullScreenError } from '../components/ui';
import libraryService from '../services/libraryService';
import { cacheConfig, queryKeys } from '../config/queryClient';
import './LibraryManagementScreen.css';

// ─── Static config ──────────────────────────────────────────────────────────

const TAB_ITEMS = [
  { id: 'ejercicios', label: 'Ejercicios' },
  { id: 'sesiones',   label: 'Sesiones'   },
  { id: 'modulos',    label: 'Módulos'    },
];

const MUSCLE_DISPLAY = {
  pecs: 'Pectorales',
  front_delts: 'Deltoides Frontales',
  side_delts: 'Deltoides Laterales',
  rear_delts: 'Deltoides Post.',
  triceps: 'Tríceps',
  traps: 'Trapecios',
  abs: 'Abdominales',
  lats: 'Dorsales',
  rhomboids: 'Romboides',
  biceps: 'Bíceps',
  forearms: 'Antebrazos',
  quads: 'Cuádriceps',
  glutes: 'Glúteos',
  hamstrings: 'Isquiotibiales',
  calves: 'Gemelos',
  hip_flexors: 'Flexores de Cadera',
  obliques: 'Oblicuos',
  lower_back: 'Lumbar',
  neck: 'Cuello',
};

function getExerciseMissing(ex) {
  const missing = [];
  if (!ex.video_url && !ex.video) missing.push('Video demostrativo');
  if (!ex.muscle_activation || Object.keys(ex.muscle_activation).length === 0) missing.push('Activación muscular');
  if (!ex.implements || (Array.isArray(ex.implements) && ex.implements.length === 0)) missing.push('Implementos');
  return missing;
}

function getPrimaryMuscle(ex) {
  if (ex.primaryMuscles?.length) return ex.primaryMuscles[0];
  if (ex.muscle_activation) {
    const entries = Object.entries(ex.muscle_activation);
    if (entries.length) {
      const top = entries.sort((a, b) => b[1] - a[1])[0];
      return top[0];
    }
  }
  return null;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

const GripIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="9"  cy="5"  r="1.5" fill="currentColor" />
    <circle cx="15" cy="5"  r="1.5" fill="currentColor" />
    <circle cx="9"  cy="12" r="1.5" fill="currentColor" />
    <circle cx="15" cy="12" r="1.5" fill="currentColor" />
    <circle cx="9"  cy="19" r="1.5" fill="currentColor" />
    <circle cx="15" cy="19" r="1.5" fill="currentColor" />
  </svg>
);

// ─── Skeleton grid ───────────────────────────────────────────────────────────

function SkeletonGrid({ count = 6, cols = 2 }) {
  return (
    <div
      className="lib-skeleton-grid"
      style={{ '--lib-grid-cols': cols }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

function SkeletonRows({ count = 5 }) {
  return (
    <div className="lib-skeleton-rows">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ─── Exercise row ────────────────────────────────────────────────────────────

function ExerciseRow({ exercise }) {
  const [calloutOpen, setCalloutOpen] = useState(false);
  const missing = useMemo(() => getExerciseMissing(exercise), [exercise]);
  const isComplete = missing.length === 0;
  const muscle = getPrimaryMuscle(exercise);
  const muscleLabel = muscle ? (MUSCLE_DISPLAY[muscle] || muscle) : null;

  const handleDotClick = useCallback((e) => {
    e.stopPropagation();
    if (!isComplete) setCalloutOpen((v) => !v);
  }, [isComplete]);

  return (
    <div className={`lib-exercise-row ${calloutOpen ? 'lib-exercise-row--open' : ''}`}>
      <GlowingEffect disabled={!calloutOpen} spread={28} borderWidth={1} />

      <div className="lib-exercise-row-inner">
        <button
          className="lib-completeness-dot"
          style={{
            background: isComplete
              ? 'rgba(74,222,128,0.6)'
              : 'rgba(251,191,36,0.8)',
          }}
          onClick={handleDotClick}
          aria-label={isComplete ? 'Ejercicio completo' : 'Ver campos faltantes'}
          title={isComplete ? 'Completo' : 'Incompleto — click para detalles'}
        />

        <span className="lib-exercise-name">{exercise.name || 'Sin nombre'}</span>

        {muscleLabel && (
          <span className="lib-muscle-pill">{muscleLabel}</span>
        )}
      </div>

      {!isComplete && (
        <div
          className={`lib-exercise-callout ${calloutOpen ? 'lib-exercise-callout--visible' : ''}`}
          aria-hidden={!calloutOpen}
        >
          <p className="lib-callout-title">A este ejercicio le falta: {missing.join(', ').toLowerCase()}.</p>
          <p className="lib-callout-sub">No es obligatorio, pero mejora la experiencia de tus clientes.</p>
        </div>
      )}
    </div>
  );
}

// ─── Sortable session card ───────────────────────────────────────────────────

function SortableSessionCard({ session, onNavigate }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: session.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  const exerciseCount = session.exercises?.length ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="lib-session-card"
      onClick={() => onNavigate(session.id)}
    >
      <GlowingEffect spread={24} borderWidth={1} />

      <div className="lib-session-card-top">
        <button
          className="lib-drag-handle"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label="Arrastrar sesión"
        >
          <GripIcon />
        </button>

        <h3 className="lib-session-title">
          {session.title || `Sesión ${session.id?.slice(0, 6)}`}
        </h3>

        <span className="lib-count-badge">
          {exerciseCount} {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
        </span>
      </div>

      {session.muscleGroups?.length > 0 && (
        <div className="lib-session-muscles">
          {session.muscleGroups.slice(0, 3).map((mg) => (
            <span key={mg} className="lib-muscle-pill lib-muscle-pill--dim">{mg}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Module card ─────────────────────────────────────────────────────────────

function ModuleCard({ mod, onNavigate }) {
  const sessionCount = mod.sessionRefs?.length ?? 0;

  return (
    <div
      className="lib-module-card"
      onClick={() => onNavigate(mod.id)}
    >
      <GlowingEffect spread={24} borderWidth={1} />

      <h3 className="lib-module-title">
        {mod.title || `Módulo ${mod.id?.slice(0, 6)}`}
      </h3>

      <span className="lib-count-badge">
        {sessionCount} {sessionCount === 1 ? 'sesión' : 'sesiones'}
      </span>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ title, subtitle, ctaLabel, onCta }) {
  return (
    <div className="lib-empty">
      <p className="lib-empty-title">{title}</p>
      <p className="lib-empty-sub">{subtitle}</p>
      {ctaLabel && (
        <button className="lib-empty-cta" onClick={onCta}>
          + {ctaLabel}
        </button>
      )}
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

const LibraryManagementScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('ejercicios');
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionOrder, setSessionOrder] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // ── Data fetching ────────────────────────────────────────────────────────

  const { data: exercises = [], isLoading: loadingEx, isError: errorEx } = useQuery({
    queryKey: queryKeys.library.exercises(user?.uid),
    queryFn: () => libraryService.getExercises(),
    enabled: !!user?.uid && activeTab === 'ejercicios',
    ...cacheConfig.programStructure,
  });

  const { data: rawSessions = [], isLoading: loadingSess, isError: errorSess } = useQuery({
    queryKey: queryKeys.library.sessions(user?.uid),
    queryFn: () => libraryService.getSessionLibrary(),
    enabled: !!user?.uid && activeTab === 'sesiones',
    ...cacheConfig.programStructure,
  });

  const { data: modules = [], isLoading: loadingMod, isError: errorMod } = useQuery({
    queryKey: queryKeys.library.modules(user?.uid),
    queryFn: () => libraryService.getModuleLibrary(),
    enabled: !!user?.uid && activeTab === 'modulos',
    ...cacheConfig.programStructure,
  });

  // Keep local session order for drag-and-drop; sync from server when rawSessions changes.
  const sessions = useMemo(() => {
    if (sessionOrder && sessionOrder.length === rawSessions.length) {
      const byId = Object.fromEntries(rawSessions.map((s) => [s.id, s]));
      return sessionOrder.map((id) => byId[id]).filter(Boolean);
    }
    return rawSessions;
  }, [rawSessions, sessionOrder]);

  // ── Filtering ────────────────────────────────────────────────────────────

  const q = searchQuery.trim().toLowerCase();

  const filteredExercises = useMemo(
    () => (q ? exercises.filter((e) => e.name?.toLowerCase().includes(q)) : exercises),
    [exercises, q]
  );

  const filteredSessions = useMemo(
    () => (q ? sessions.filter((s) => s.title?.toLowerCase().includes(q)) : sessions),
    [sessions, q]
  );

  const filteredModules = useMemo(
    () => (q ? modules.filter((m) => m.title?.toLowerCase().includes(q)) : modules),
    [modules, q]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleTabChange = useCallback((id) => {
    setActiveTab(id);
    setSearchQuery('');
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sessions.map((s) => s.id);
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    setSessionOrder(arrayMove(ids, from, to));
  }, [sessions]);

  // ── Primary action per tab ───────────────────────────────────────────────

  const primaryActions = {
    ejercicios: { label: 'Nueva biblioteca', path: '/libraries' },
    sesiones:   { label: 'Nueva sesión',     path: '/library/sessions/new' },
    modulos:    { label: 'Nuevo módulo',      path: '/library/modules/new' },
  };
  const primary = primaryActions[activeTab];

  // ── Render tab content ───────────────────────────────────────────────────

  const renderContent = () => {
    if (activeTab === 'ejercicios') {
      if (loadingEx) return <SkeletonRows count={6} />;
      if (errorEx) return <FullScreenError title="No se pudo cargar la biblioteca" message="Verifica tu conexion e intenta de nuevo." onRetry={() => window.location.reload()} />;
      if (!filteredExercises.length) {
        return (
          <EmptyState
            title="Tu biblioteca de ejercicios esta vacia"
            subtitle="Crea ejercicios y usalos en tus sesiones."
            ctaLabel="Nueva biblioteca"
            onCta={() => navigate('/libraries')}
          />
        );
      }
      return (
        <div className="lib-exercise-list">
          <VirtualList
            items={filteredExercises}
            itemHeight={62}
            height={Math.max(300, window.innerHeight - 380)}
            renderItem={(ex, index, style) => (
              <div key={ex.id || ex.name} style={style}>
                <ExerciseRow exercise={ex} />
              </div>
            )}
          />
        </div>
      );
    }

    if (activeTab === 'sesiones') {
      if (loadingSess) return <SkeletonGrid count={6} cols={2} />;
      if (errorSess) return <FullScreenError title="No se pudieron cargar las sesiones" message="Verifica tu conexion e intenta de nuevo." onRetry={() => window.location.reload()} />;
      if (!filteredSessions.length) {
        return (
          <EmptyState
            title="Sin sesiones guardadas"
            subtitle="Crea una sesion y reutilizala en multiples programas."
            ctaLabel="Nueva sesión"
            onCta={() => navigate('/library/sessions/new')}
          />
        );
      }
      return (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredSessions.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="lib-sessions-grid">
              {filteredSessions.map((session) => (
                <SortableSessionCard
                  key={session.id}
                  session={session}
                  onNavigate={(id) => navigate(`/content/sessions/${id}`)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      );
    }

    if (activeTab === 'modulos') {
      if (loadingMod) return <SkeletonRows count={5} />;
      if (errorMod) return <FullScreenError title="No se pudieron cargar los modulos" message="Verifica tu conexion e intenta de nuevo." onRetry={() => window.location.reload()} />;
      if (!filteredModules.length) {
        return (
          <EmptyState
            title="Los modulos agrupan sesiones"
            subtitle="Crea uno para organizar mejor tu biblioteca."
            ctaLabel="Nuevo módulo"
            onCta={() => navigate('/library/modules/new')}
          />
        );
      }
      return (
        <div className="lib-modules-list">
          <AnimatedList stagger={50}>
            {filteredModules.map((mod) => (
              <ModuleCard
                key={mod.id}
                mod={mod}
                onNavigate={(id) => navigate(`/library/modules/${id}/edit`)}
              />
            ))}
          </AnimatedList>
        </div>
      );
    }

    return null;
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
    <DashboardLayout screenName="Biblioteca">
      <div className="lib-container">

        {/* Header */}
        <div className="lib-header">
          <div className="lib-header-text">
            <h1 className="lib-title">Biblioteca</h1>
            <p className="lib-subtitle">Tu contenido reutilizable en un solo lugar</p>
          </div>
          <button
            className="lib-primary-btn"
            onClick={() => navigate(primary.path)}
          >
            <span className="lib-primary-btn-plus">+</span>
            {primary.label}
          </button>
        </div>

        {/* TubelightNavBar + search row */}
        <div className="lib-nav-bar">
          <TubelightNavBar
            items={TAB_ITEMS}
            activeId={activeTab}
            onSelect={handleTabChange}
          />

          <div className="lib-search-field">
            <SearchIcon />
            <input
              type="text"
              className="lib-search-input"
              placeholder={`Buscar ${TAB_ITEMS.find((t) => t.id === activeTab)?.label.toLowerCase()}…`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Content */}
        <div className="lib-content" key={activeTab}>
          {renderContent()}
        </div>

      </div>

      <SpotlightTutorial
        screenKey="library"
        steps={[
          {
            selector: '.tubelight-nav',
            title: 'Tabs',
            body: 'Ejercicios son los bloques basicos. Sesiones combinan ejercicios. Modulos agrupan sesiones.',
          },
          {
            selector: '.lib-completeness-dot',
            title: 'Completitud',
            body: 'El punto amarillo significa que al ejercicio le falta video, musculos o equipamiento. Funciona igual, pero queda mejor completo.',
          },
          {
            selector: '.lib-drag-handle',
            title: 'Arrastrar',
            body: 'Puedes arrastrar modulos para reordenarlos. Las sesiones se arrastran dentro de los modulos.',
          },
          {
            selector: '.lib-primary-btn',
            title: 'Reutilizar',
            body: 'Todo lo que creas aca lo puedes usar en cualquier programa. Editar la fuente actualiza todos los programas conectados.',
          },
        ]}
      />
    </DashboardLayout>
  </ErrorBoundary>
  );
};

export default LibraryManagementScreen;
