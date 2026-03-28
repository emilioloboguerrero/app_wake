import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import { TubelightNavBar, SpotlightTutorial, GlowingEffect } from '../components/ui';
import ExercisesPanel from '../components/biblioteca/ExercisesPanel';
import SessionsPanel from '../components/biblioteca/SessionsPanel';
import PlansPanel from '../components/biblioteca/PlansPanel';
import RecetasPanel from '../components/biblioteca/RecetasPanel';
import NutritionPlansPanel from '../components/biblioteca/NutritionPlansPanel';
import CreateFlowOverlay from '../components/CreateFlowOverlay';
import CreatePlanOverlay from '../components/biblioteca/CreatePlanOverlay';
import libraryService from '../services/libraryService';
import * as nutritionDb from '../services/nutritionFirestoreService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { queryKeys } from '../config/queryClient';
import './BibliotecaScreen.css';

const DOMAIN_ITEMS = [
  { id: 'entrenamiento', label: 'Entrenamiento' },
  { id: 'nutricion', label: 'Nutrición' },
];

const TRAINING_TABS = [
  { id: 'ejercicios', label: 'Ejercicios' },
  { id: 'sesiones', label: 'Sesiones' },
  { id: 'planes', label: 'Planes' },
];

const NUTRITION_TABS = [
  { id: 'planes_nutri', label: 'Planes nutricionales' },
  { id: 'recetas', label: 'Recetas' },
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
  { id: 'date_newest', label: 'Más recientes' },
  { id: 'date_oldest', label: 'Más antiguos' },
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

const TUTORIAL_STEPS = [
  {
    selector: '.bib-domain-nav',
    title: 'Dos mundos',
    body: 'Entrenamiento tiene tus ejercicios, sesiones y planes. Nutrición tiene tus recetas y planes nutricionales.',
  },
  {
    selector: '.bib-sub-nav',
    title: 'Contenido reutilizable',
    body: 'Todo lo que creas acá lo puedes usar en cualquier programa o asignar a clientes.',
  },
  {
    selector: '.bib-primary-btn',
    title: 'Crear',
    body: 'El botón + cambia segun la pestaña activa. Crea sesiones, planes, recetas o planes nutricionales.',
  },
];

const BibliotecaScreen = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();

  const domain = searchParams.get('domain') || 'entrenamiento';
  const tab = searchParams.get('tab') || (domain === 'entrenamiento' ? 'ejercicios' : 'recetas');

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [showCreateLibrary, setShowCreateLibrary] = useState(false);
  const [libStep, setLibStep] = useState('name');
  const [newLibraryTitle, setNewLibraryTitle] = useState('');
  const [createdLibraryId, setCreatedLibraryId] = useState(null);
  const libInputRef = useRef(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showCreateNutriPlan, setShowCreateNutriPlan] = useState(false);
  const [nutriPlanStep, setNutriPlanStep] = useState('name');
  const [nutriPlanName, setNutriPlanName] = useState('');
  const nutriPlanInputRef = useRef(null);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionStep, setSessionStep] = useState('name');
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const sessionInputRef = useRef(null);

  const createLibraryMutation = useMutation({
    mutationFn: (title) => libraryService.createLibrary(title),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.libraries(user?.uid) });
      queryClient.invalidateQueries({ queryKey: queryKeys.library.exercises(user?.uid) });
      const libraryId = result?.data?.id || result?.id;
      setCreatedLibraryId(libraryId);
      setLibStep('success');
      setTimeout(() => {
        setShowCreateLibrary(false);
        if (libraryId) navigate(`/libraries/${libraryId}`);
      }, 1600);
    },
    onError: () => {
      setLibStep('name');
      showToast('No pudimos crear la biblioteca. Intenta de nuevo.', 'error');
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: (title) => libraryService.createLibrarySession(user.uid, { title }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.sessions(user?.uid) });
      const sessionId = result?.sessionId || result?.data?.sessionId;
      setSessionStep('success');
      setTimeout(() => {
        setShowCreateSession(false);
        if (sessionId) navigate(`/content/sessions/${sessionId}`);
      }, 1600);
    },
    onError: () => {
      setSessionStep('name');
      showToast('No pudimos crear la sesión. Intenta de nuevo.', 'error');
    },
  });

  const handleCreateSession = useCallback(() => {
    const title = newSessionTitle.trim();
    if (!title) return;
    setSessionStep('creating');
    createSessionMutation.mutate(title);
  }, [newSessionTitle, createSessionMutation]);

  const openCreateSession = useCallback(() => {
    setShowCreateSession(true);
    setSessionStep('name');
    setNewSessionTitle('');
    setTimeout(() => sessionInputRef.current?.focus(), 300);
  }, []);

  const handleCreateLibrary = useCallback(() => {
    const title = newLibraryTitle.trim();
    if (!title) return;
    setLibStep('creating');
    createLibraryMutation.mutate(title);
  }, [newLibraryTitle, createLibraryMutation]);

  const openCreateLibrary = useCallback(() => {
    setShowCreateLibrary(true);
    setLibStep('name');
    setNewLibraryTitle('');
    setCreatedLibraryId(null);
    setTimeout(() => libInputRef.current?.focus(), 300);
  }, []);

  useEffect(() => {
    if (!showCreateLibrary) return;
    if (libStep !== 'name') return;
    const handler = (e) => { if (e.key === 'Escape') setShowCreateLibrary(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showCreateLibrary, libStep]);

  useEffect(() => {
    if (!showCreateSession) return;
    if (sessionStep !== 'name') return;
    const handler = (e) => { if (e.key === 'Escape') setShowCreateSession(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showCreateSession, sessionStep]);

  useEffect(() => {
    if (!showCreateNutriPlan) return;
    if (nutriPlanStep !== 'name') return;
    const handler = (e) => { if (e.key === 'Escape') setShowCreateNutriPlan(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showCreateNutriPlan, nutriPlanStep]);

  const activeFilterCount = filters.sort !== 'name_asc' ? 1 : 0;

  const setDomain = useCallback((d) => {
    const defaultTab = d === 'entrenamiento' ? 'ejercicios' : 'planes_nutri';
    setSearchParams({ domain: d, tab: defaultTab }, { replace: true });
    setSearchQuery('');
  }, [setSearchParams]);

  const setTab = useCallback((t) => {
    setSearchParams({ domain, tab: t }, { replace: true });
    setSearchQuery('');
  }, [domain, setSearchParams]);

  const subTabs = domain === 'entrenamiento' ? TRAINING_TABS : NUTRITION_TABS;
  const activeSubTab = subTabs.find((t) => t.id === tab) ? tab : subTabs[0].id;

  const getSearchPlaceholder = () => {
    const labels = {
      ejercicios: 'ejercicios',
      sesiones: 'sesiones',
      planes: 'planes',
      recetas: 'recetas',
      planes_nutri: 'planes nutricionales',
    };
    return `Buscar ${labels[activeSubTab] || 'contenido'}…`;
  };

  const createNutriPlanMutation = useMutation({
    mutationFn: (name) => nutritionDb.createPlan(user.uid, { name, description: '', categories: [] }),
    onSuccess: (planId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.plans(user?.uid) });
      setNutriPlanStep('success');
      setTimeout(() => {
        setShowCreateNutriPlan(false);
        if (planId) navigate(`/nutrition/plans/${planId}`);
      }, 1600);
    },
    onError: () => {
      setNutriPlanStep('name');
      showToast('No pudimos crear el plan. Intenta de nuevo.', 'error');
    },
  });

  const handleCreateNutriPlan = useCallback(() => {
    const name = nutriPlanName.trim();
    if (!name) return;
    setNutriPlanStep('creating');
    createNutriPlanMutation.mutate(name);
  }, [nutriPlanName, createNutriPlanMutation]);

  const openCreateNutriPlan = useCallback(() => {
    setShowCreateNutriPlan(true);
    setNutriPlanStep('name');
    setNutriPlanName('');
    setTimeout(() => nutriPlanInputRef.current?.focus(), 300);
  }, []);

  const handlePrimaryAction = useCallback(() => {
    if (activeSubTab === 'ejercicios') {
      openCreateLibrary();
    } else if (activeSubTab === 'sesiones') {
      openCreateSession();
    } else if (activeSubTab === 'planes') {
      setShowCreatePlan(true);
    } else if (activeSubTab === 'recetas') {
      navigate('/nutrition/meals/new');
    } else if (activeSubTab === 'planes_nutri') {
      openCreateNutriPlan();
    }
  }, [activeSubTab, navigate, openCreateLibrary, openCreateSession, openCreateNutriPlan]);

  const getPrimaryLabel = () => {
    const labels = {
      ejercicios: 'Nueva biblioteca',
      sesiones: 'Nueva sesión',
      planes: 'Nuevo plan',
      recetas: 'Crear receta',
      planes_nutri: 'Crear plan',
    };
    return labels[activeSubTab] || 'Crear';
  };

  const handlePlanCreated = useCallback(({ id }) => {
    setShowCreatePlan(false);
    if (id) navigate(`/plans/${id}`);
  }, [navigate]);

  const renderContent = () => {
    switch (activeSubTab) {
      case 'ejercicios':
        return <ExercisesPanel searchQuery={searchQuery} onCreateLibrary={openCreateLibrary} />;
      case 'sesiones':
        return <SessionsPanel searchQuery={searchQuery} onCreateSession={openCreateSession} />;
      case 'planes':
        return <PlansPanel searchQuery={searchQuery} />;
      case 'recetas':
        return <RecetasPanel searchQuery={searchQuery} />;
      case 'planes_nutri':
        return <NutritionPlansPanel searchQuery={searchQuery} onCreatePlan={openCreateNutriPlan} />;
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Biblioteca">
        <div className="bib-container">
          <div className="bib-top-row">
            <div className="bib-domain-nav">
              <TubelightNavBar
                items={DOMAIN_ITEMS}
                activeId={domain}
                onSelect={setDomain}
              />
            </div>
            <button className="bib-primary-btn" onClick={handlePrimaryAction}>
              <span className="bib-primary-btn-plus">+</span>
              {getPrimaryLabel()}
            </button>
          </div>

          <div className="bib-nav-row">
            <div className="bib-sub-nav">
              <TubelightNavBar
                items={subTabs}
                activeId={activeSubTab}
                onSelect={setTab}
              />
            </div>
          </div>

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

          <div className="bib-content" key={`${domain}-${activeSubTab}`}>
            {renderContent()}
          </div>
        </div>

        <CreatePlanOverlay
          isOpen={showCreatePlan}
          onClose={() => setShowCreatePlan(false)}
          onCreated={handlePlanCreated}
        />

        {showCreateNutriPlan && (
          <div className="cfo-overlay" onClick={nutriPlanStep === 'name' ? () => setShowCreateNutriPlan(false) : undefined}>
            <div className="cfo-card" onClick={(e) => e.stopPropagation()}>
              <GlowingEffect spread={40} borderWidth={1} />

              <div className="cfo-topbar">
                <div />
                {nutriPlanStep === 'name' && (
                  <button type="button" className="cfo-close" onClick={() => setShowCreateNutriPlan(false)} aria-label="Cerrar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                )}
              </div>

              <div className="cfo-body">
                {nutriPlanStep === 'name' && (
                  <div className="cfo-step" key="nutri-plan-name">
                    <div className="cfo-step__header">
                      <h1 className="cfo-step__title">Nuevo plan nutricional</h1>
                      <p className="cfo-step__desc">Dale un nombre a tu plan. Luego configuraras calorias, macros y comidas.</p>
                    </div>
                    <div className="cfo-step__content">
                      <input
                        ref={nutriPlanInputRef}
                        className="cfo-name-input"
                        type="text"
                        placeholder="Ej: Plan definicion, Volumen 3000 kcal..."
                        value={nutriPlanName}
                        onChange={(e) => setNutriPlanName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && nutriPlanName.trim()) handleCreateNutriPlan(); }}
                        maxLength={80}
                      />
                    </div>
                    <div className="cfo-footer" style={{ justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="cfo-next-btn"
                        onClick={handleCreateNutriPlan}
                        disabled={!nutriPlanName.trim()}
                      >
                        Crear plan
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                  </div>
                )}

                {nutriPlanStep === 'creating' && (
                  <div className="cfo-step cfo-step--center" key="nutri-plan-creating">
                    <div className="cfo-spinner" />
                    <p className="cfo-status-text">Creando plan</p>
                  </div>
                )}

                {nutriPlanStep === 'success' && (
                  <div className="cfo-step cfo-step--center" key="nutri-plan-success">
                    <div className="cfo-check-wrap">
                      <svg className="cfo-check-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
                        <circle className="cfo-check-circle" cx="24" cy="24" r="22" stroke="rgba(74,222,128,0.8)" strokeWidth="2.5" />
                        <path className="cfo-check-path" d="M14 25l7 7 13-14" stroke="rgba(74,222,128,0.9)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h2 className="cfo-success-title">Plan creado</h2>
                    <p className="cfo-success-desc">Configura las calorias, macros y comidas de tu plan.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showCreateLibrary && (
          <div className="cfo-overlay" onClick={libStep === 'name' ? () => setShowCreateLibrary(false) : undefined}>
            <div className="cfo-card" onClick={(e) => e.stopPropagation()}>
              <GlowingEffect spread={40} borderWidth={1} />

              <div className="cfo-topbar">
                <div />
                {libStep === 'name' && (
                  <button type="button" className="cfo-close" onClick={() => setShowCreateLibrary(false)} aria-label="Cerrar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                )}
              </div>

              <div className="cfo-body">
                {libStep === 'name' && (
                  <div className="cfo-step" key="lib-name">
                    <div className="cfo-step__header">
                      <h1 className="cfo-step__title">Nueva biblioteca</h1>
                      <p className="cfo-step__desc">Organiza tus ejercicios por categoria, nivel o disciplina.</p>
                    </div>
                    <div className="cfo-step__content">
                      <input
                        ref={libInputRef}
                        className="cfo-name-input"
                        type="text"
                        placeholder="Ej: Tren superior, Calistenia avanzada..."
                        value={newLibraryTitle}
                        onChange={(e) => setNewLibraryTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && newLibraryTitle.trim()) handleCreateLibrary(); }}
                        maxLength={80}
                      />
                    </div>
                    <div className="cfo-footer" style={{ justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="cfo-next-btn"
                        onClick={handleCreateLibrary}
                        disabled={!newLibraryTitle.trim()}
                      >
                        Crear biblioteca
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                  </div>
                )}

                {libStep === 'creating' && (
                  <div className="cfo-step cfo-step--center" key="lib-creating">
                    <div className="cfo-spinner" />
                    <p className="cfo-status-text">Creando biblioteca</p>
                  </div>
                )}

                {libStep === 'success' && (
                  <div className="cfo-step cfo-step--center" key="lib-success">
                    <div className="cfo-check-wrap">
                      <svg className="cfo-check-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
                        <circle className="cfo-check-circle" cx="24" cy="24" r="22" stroke="rgba(74,222,128,0.8)" strokeWidth="2.5" />
                        <path className="cfo-check-path" d="M14 25l7 7 13-14" stroke="rgba(74,222,128,0.9)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h2 className="cfo-success-title">Biblioteca creada</h2>
                    <p className="cfo-success-desc">Agrega ejercicios, videos y musculos.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showCreateSession && (
          <div className="cfo-overlay" onClick={sessionStep === 'name' ? () => setShowCreateSession(false) : undefined}>
            <div className="cfo-card" onClick={(e) => e.stopPropagation()}>
              <GlowingEffect spread={40} borderWidth={1} />

              <div className="cfo-topbar">
                <div />
                {sessionStep === 'name' && (
                  <button type="button" className="cfo-close" onClick={() => setShowCreateSession(false)} aria-label="Cerrar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                )}
              </div>

              <div className="cfo-body">
                {sessionStep === 'name' && (
                  <div className="cfo-step" key="session-name">
                    <div className="cfo-step__header">
                      <h1 className="cfo-step__title">Nueva sesión</h1>
                      <p className="cfo-step__desc">Dale un nombre a tu sesión. Luego agregarás imagen y ejercicios.</p>
                    </div>
                    <div className="cfo-step__content">
                      <input
                        ref={sessionInputRef}
                        className="cfo-name-input"
                        type="text"
                        placeholder="Ej: Empuje día A, Pierna fuerza..."
                        value={newSessionTitle}
                        onChange={(e) => setNewSessionTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && newSessionTitle.trim()) handleCreateSession(); }}
                        maxLength={80}
                      />
                    </div>
                    <div className="cfo-footer" style={{ justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="cfo-next-btn"
                        onClick={handleCreateSession}
                        disabled={!newSessionTitle.trim()}
                      >
                        Crear sesión
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                  </div>
                )}

                {sessionStep === 'creating' && (
                  <div className="cfo-step cfo-step--center" key="session-creating">
                    <div className="cfo-spinner" />
                    <p className="cfo-status-text">Creando sesión</p>
                  </div>
                )}

                {sessionStep === 'success' && (
                  <div className="cfo-step cfo-step--center" key="session-success">
                    <div className="cfo-check-wrap">
                      <svg className="cfo-check-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
                        <circle className="cfo-check-circle" cx="24" cy="24" r="22" stroke="rgba(74,222,128,0.8)" strokeWidth="2.5" />
                        <path className="cfo-check-path" d="M14 25l7 7 13-14" stroke="rgba(74,222,128,0.9)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h2 className="cfo-success-title">Sesión creada</h2>
                    <p className="cfo-success-desc">Agrega ejercicios y configura tus series.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <SpotlightTutorial screenKey="biblioteca" steps={TUTORIAL_STEPS} />
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default BibliotecaScreen;
