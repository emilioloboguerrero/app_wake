import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import { TubelightNavBar, GlowingEffect, KeepAlivePane } from '../components/ui';
import { ProgressiveRevealProvider } from '../contexts/ProgressiveRevealContext';
import { Revealable, RevealProgressBar } from '../components/guide';
import ExercisesPanel from '../components/biblioteca/ExercisesPanel';
import SessionsPanel from '../components/biblioteca/SessionsPanel';
import PlansPanel from '../components/biblioteca/PlansPanel';
import NutritionPlansPanel from '../components/biblioteca/NutritionPlansPanel';
import CreatePlanOverlay from '../components/biblioteca/CreatePlanOverlay';
import SimpleCreateOverlay from '../components/biblioteca/SimpleCreateOverlay';
import libraryService from '../services/libraryService';
import * as nutritionDb from '../services/nutritionFirestoreService';
import apiClient from '../utils/apiClient';
import BibliotecaGuide from './biblioteca-guide/BibliotecaGuide';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { queryKeys, cacheConfig } from '../config/queryClient';
import './BibliotecaScreen.css';

const DOMAIN_ITEMS = [
  { id: 'entrenamiento', label: 'Entrenamiento' },
  { id: 'nutricion', label: 'Nutricion' },
];

const TRAINING_TABS = [
  { id: 'ejercicios', label: 'Ejercicios' },
  { id: 'sesiones', label: 'Sesiones' },
  { id: 'planes', label: 'Planes' },
];

const NUTRITION_TABS = [
  { id: 'planes_nutri', label: 'Planes nutricionales' },
];

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

const SORT_OPTIONS = [
  { id: 'name_asc', label: 'Nombre A→Z' },
  { id: 'name_desc', label: 'Nombre Z→A' },
  { id: 'date_newest', label: 'Mas recientes' },
  { id: 'date_oldest', label: 'Mas antiguos' },
];

const DEFAULT_FILTERS = { sort: 'name_asc' };

function FilterSortPanel({ isOpen, onClose, filters, onFiltersChange }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeCount = filters.sort !== 'name_asc' ? 1 : 0;

  return (
    <div className="bib-filter-panel" ref={panelRef}>
      <div className="bib-filter-panel__section">
        <span className="bib-filter-panel__label">Ordenar por</span>
        <div className="bib-filter-panel__chips">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`bib-filter-chip ${filters.sort === opt.id ? 'bib-filter-chip--active' : ''}`}
              onClick={() => onFiltersChange({ ...filters, sort: opt.id })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {activeCount > 0 && (
        <button
          type="button"
          className="bib-filter-panel__clear"
          onClick={() => onFiltersChange(DEFAULT_FILTERS)}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}


const BibliotecaScreen = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user, bibliotecaGuideCompleted, refreshUserData } = useAuth();
  const { showToast } = useToast();

  const domain = searchParams.get('domain') || 'entrenamiento';
  const tab = searchParams.get('tab') || (domain === 'entrenamiento' ? 'ejercicios' : 'planes_nutri');

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showCreateLibrary, setShowCreateLibrary] = useState(false);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [showCreateNutriPlan, setShowCreateNutriPlan] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [successFor, setSuccessFor] = useState(null);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([tab]));

  // --- Mutations ---

  const createLibraryMutation = useMutation({
    mutationKey: ['libraries', 'create'],
    mutationFn: (title) => libraryService.createLibrary(title),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.libraries(user?.uid) });
      queryClient.invalidateQueries({ queryKey: queryKeys.library.exercises(user?.uid) });
      const libraryId = result?.data?.id || result?.id;
      setSuccessFor('library');
      setTimeout(() => {
        setShowCreateLibrary(false);
        setSuccessFor(null);
        if (libraryId) navigate(`/libraries/${libraryId}`);
      }, 1600);
    },
    onError: () => {
      showToast('No pudimos crear la biblioteca. Intenta de nuevo.', 'error');
    },
  });

  const createSessionMutation = useMutation({
    mutationKey: ['library-sessions', 'create'],
    mutationFn: (title) => libraryService.createLibrarySession(user.uid, { title }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.sessions(user?.uid) });
      queryClient.invalidateQueries({ queryKey: queryKeys.library.sessionsSlim(user?.uid) });
      const sessionId = result?.sessionId || result?.data?.sessionId;
      setSuccessFor('session');
      setTimeout(() => {
        setShowCreateSession(false);
        setSuccessFor(null);
        if (sessionId) navigate(`/content/sessions/${sessionId}`);
      }, 1600);
    },
    onError: () => {
      showToast('No pudimos crear la sesion. Intenta de nuevo.', 'error');
    },
  });

  const createNutriPlanMutation = useMutation({
    mutationKey: ['nutrition-plans', 'create'],
    mutationFn: (name) => nutritionDb.createPlan(user.uid, { name, description: '', categories: [] }),
    onSuccess: (planId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.plans(user?.uid) });
      setSuccessFor('nutriPlan');
      setTimeout(() => {
        setShowCreateNutriPlan(false);
        setSuccessFor(null);
        if (planId) navigate(`/nutrition/plans/${planId}`);
      }, 1600);
    },
    onError: () => {
      showToast('No pudimos crear el plan. Intenta de nuevo.', 'error');
    },
  });

  // --- Navigation ---

  const activeFilterCount = filters.sort !== 'name_asc' ? 1 : 0;

  const setDomain = useCallback((d) => {
    const defaultTab = d === 'entrenamiento' ? 'ejercicios' : 'planes_nutri';
    setSearchParams({ domain: d, tab: defaultTab }, { replace: true });
    setSearchQuery('');
    setVisitedTabs((prev) => {
      const next = new Set(prev);
      next.add(defaultTab);
      return next;
    });
  }, [setSearchParams]);

  const setTab = useCallback((t) => {
    setSearchParams({ domain, tab: t }, { replace: true });
    setSearchQuery('');
    setVisitedTabs((prev) => {
      const next = new Set(prev);
      next.add(t);
      return next;
    });
  }, [domain, setSearchParams]);

  const subTabs = domain === 'entrenamiento' ? TRAINING_TABS : NUTRITION_TABS;
  const activeSubTab = subTabs.find((t) => t.id === tab) ? tab : subTabs[0].id;

  const getSearchPlaceholder = () => {
    const labels = {
      ejercicios: 'ejercicios',
      sesiones: 'sesiones',
      planes: 'planes',
      planes_nutri: 'planes nutricionales',
    };
    return `Buscar ${labels[activeSubTab] || 'contenido'}...`;
  };

  // --- Actions ---

  const openCreateLibrary = useCallback(() => setShowCreateLibrary(true), []);
  const openCreateSession = useCallback(() => setShowCreateSession(true), []);
  const openCreateNutriPlan = useCallback(() => setShowCreateNutriPlan(true), []);

  const handlePrimaryAction = useCallback(() => {
    if (activeSubTab === 'ejercicios') openCreateLibrary();
    else if (activeSubTab === 'sesiones') openCreateSession();
    else if (activeSubTab === 'planes') setShowCreatePlan(true);
    else if (activeSubTab === 'planes_nutri') openCreateNutriPlan();
  }, [activeSubTab, openCreateLibrary, openCreateSession, openCreateNutriPlan]);

  const getPrimaryLabel = () => {
    const labels = {
      ejercicios: 'Nueva biblioteca',
      sesiones: 'Nueva sesion',
      planes: 'Nuevo plan',
      planes_nutri: 'Crear plan',
    };
    return labels[activeSubTab] || 'Crear';
  };

  const handlePlanCreated = useCallback(({ id }) => {
    setShowCreatePlan(false);
    if (id) navigate(`/plans/${id}`);
  }, [navigate]);

  const handleGuideComplete = useCallback(async () => {
    try {
      await apiClient.patch('/users/me', { bibliotecaGuideCompleted: true });
      await refreshUserData();
    } catch (err) {
      console.error('[BibliotecaScreen] Error completing guide:', err);
    }
  }, [refreshUserData]);

  // --- Cross-tab prefetching ---

  useEffect(() => {
    if (!user?.uid) return;
    if (domain === 'entrenamiento') {
      queryClient.prefetchQuery({
        queryKey: queryKeys.library.exercises(user.uid),
        queryFn: () => libraryService.getExercises(),
        ...cacheConfig.libraries,
      });
      queryClient.prefetchQuery({
        queryKey: queryKeys.library.libraries(user.uid),
        queryFn: () => libraryService.getLibrariesByCreator(),
        ...cacheConfig.libraries,
      });
      queryClient.prefetchQuery({
        queryKey: queryKeys.library.sessions(user.uid),
        queryFn: () => libraryService.getSessionLibraryWithExercises(),
        ...cacheConfig.librarySessions,
      });
      queryClient.prefetchQuery({
        queryKey: queryKeys.plans.byCreator(user.uid),
        queryFn: () => apiClient.get('/creator/plans').then((r) => r.data),
        ...cacheConfig.otherPrograms,
      });
    } else if (domain === 'nutricion') {
      queryClient.prefetchQuery({
        queryKey: queryKeys.nutrition.plans(user.uid),
        queryFn: () => nutritionDb.getPlansByCreator(user.uid),
        ...cacheConfig.otherPrograms,
      });
    }
  }, [domain, user?.uid, queryClient]);

  // --- Render ---

  if (!bibliotecaGuideCompleted) {
    return (
      <DashboardLayout screenName="Biblioteca">
        <BibliotecaGuide onComplete={handleGuideComplete} />
      </DashboardLayout>
    );
  }

  return (
    <ErrorBoundary>
      <ProgressiveRevealProvider screenKey={`biblioteca-${activeSubTab}`}>
      <DashboardLayout screenName="Biblioteca">
        <div className="bib-container">
          <div className="bib-top-row">
            <Revealable step="domain-nav">
              <div className="bib-domain-nav">
                <TubelightNavBar
                  items={DOMAIN_ITEMS}
                  activeId={domain}
                  onSelect={setDomain}
                />
              </div>
            </Revealable>
            <Revealable step="primary-btn">
              <button className="bib-primary-btn" onClick={handlePrimaryAction}>
                <span className="bib-primary-btn-plus">+</span>
                {getPrimaryLabel()}
              </button>
            </Revealable>
          </div>

          <Revealable step="sub-tabs">
            <div className="bib-nav-row">
              <div className="bib-sub-nav">
                <TubelightNavBar
                  items={subTabs}
                  activeId={activeSubTab}
                  onSelect={setTab}
                />
              </div>
            </div>
          </Revealable>

          <Revealable step="search-filter">
            <div className="bib-search-row">
              <div className="bib-search-field">
                <SearchIcon />
                <input
                  type="text"
                  className="bib-search-input"
                  placeholder={getSearchPlaceholder()}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="bib-filter-wrap">
                <button
                  type="button"
                  className={`bib-filter-btn ${activeFilterCount > 0 ? 'bib-filter-btn--active' : ''}`}
                  onClick={() => setFilterOpen((v) => !v)}
                  aria-label="Filtrar"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Filtrar
                  {activeFilterCount > 0 && (
                    <span className="bib-filter-btn__badge">{activeFilterCount}</span>
                  )}
                </button>
                <FilterSortPanel
                  isOpen={filterOpen}
                  onClose={() => setFilterOpen(false)}
                  filters={filters}
                  onFiltersChange={setFilters}
                />
              </div>
            </div>
          </Revealable>

          <Revealable step="content-area">
            <div className="bib-content">
              {visitedTabs.has('ejercicios') && (
                <KeepAlivePane active={activeSubTab === 'ejercicios'}>
                  <ExercisesPanel searchQuery={searchQuery} sortKey={filters.sort} onCreateLibrary={openCreateLibrary} />
                </KeepAlivePane>
              )}
              {visitedTabs.has('sesiones') && (
                <KeepAlivePane active={activeSubTab === 'sesiones'}>
                  <SessionsPanel searchQuery={searchQuery} sortKey={filters.sort} onCreateSession={openCreateSession} />
                </KeepAlivePane>
              )}
              {visitedTabs.has('planes') && (
                <KeepAlivePane active={activeSubTab === 'planes'}>
                  <PlansPanel searchQuery={searchQuery} sortKey={filters.sort} />
                </KeepAlivePane>
              )}
              {visitedTabs.has('planes_nutri') && (
                <KeepAlivePane active={activeSubTab === 'planes_nutri'}>
                  <NutritionPlansPanel searchQuery={searchQuery} sortKey={filters.sort} onCreatePlan={openCreateNutriPlan} />
                </KeepAlivePane>
              )}
            </div>
          </Revealable>
        </div>

        <CreatePlanOverlay
          isOpen={showCreatePlan}
          onClose={() => setShowCreatePlan(false)}
          onCreated={handlePlanCreated}
        />

        <SimpleCreateOverlay
          isOpen={showCreateLibrary}
          onClose={() => setShowCreateLibrary(false)}
          title="Nueva biblioteca"
          description="Organiza tus ejercicios por categoria, nivel o disciplina."
          placeholder="Ej: Tren superior, Calistenia avanzada..."
          ctaLabel="Crear biblioteca"
          creatingText="Creando biblioteca"
          successTitle="Biblioteca creada"
          successDesc="Agrega ejercicios, videos y musculos."
          onSubmit={(name) => createLibraryMutation.mutate(name)}
          isPending={createLibraryMutation.isPending}
          isSuccess={successFor === 'library'}
        />

        <SimpleCreateOverlay
          isOpen={showCreateSession}
          onClose={() => setShowCreateSession(false)}
          title="Nueva sesion"
          description="Dale un nombre a tu sesion. Luego agregaras imagen y ejercicios."
          placeholder="Ej: Empuje dia A, Pierna fuerza..."
          ctaLabel="Crear sesion"
          creatingText="Creando sesion"
          successTitle="Sesion creada"
          successDesc="Agrega ejercicios y configura tus series."
          onSubmit={(name) => createSessionMutation.mutate(name)}
          isPending={createSessionMutation.isPending}
          isSuccess={successFor === 'session'}
        />

        <SimpleCreateOverlay
          isOpen={showCreateNutriPlan}
          onClose={() => setShowCreateNutriPlan(false)}
          title="Nuevo plan nutricional"
          description="Dale un nombre a tu plan. Luego configuraras calorias, macros y comidas."
          placeholder="Ej: Plan definicion, Volumen 3000 kcal..."
          ctaLabel="Crear plan"
          creatingText="Creando plan"
          successTitle="Plan creado"
          successDesc="Configura las calorias, macros y comidas de tu plan."
          onSubmit={(name) => createNutriPlanMutation.mutate(name)}
          isPending={createNutriPlanMutation.isPending}
          isSuccess={successFor === 'nutriPlan'}
        />

        <RevealProgressBar />
      </DashboardLayout>
      </ProgressiveRevealProvider>
    </ErrorBoundary>
  );
};

export default BibliotecaScreen;
