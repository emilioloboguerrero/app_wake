import React, { useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import { TubelightNavBar, SpotlightTutorial } from '../components/ui';
import ExercisesPanel from '../components/biblioteca/ExercisesPanel';
import SessionsPanel from '../components/biblioteca/SessionsPanel';
import PlansPanel from '../components/biblioteca/PlansPanel';
import RecetasPanel from '../components/biblioteca/RecetasPanel';
import NutritionPlansPanel from '../components/biblioteca/NutritionPlansPanel';
import CreateFlowOverlay from '../components/CreateFlowOverlay';
import plansService from '../services/plansService';
import { useToast } from '../contexts/ToastContext';
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
  { id: 'recetas', label: 'Recetas' },
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
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const domain = searchParams.get('domain') || 'entrenamiento';
  const tab = searchParams.get('tab') || (domain === 'entrenamiento' ? 'ejercicios' : 'recetas');

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreatePlan, setShowCreatePlan] = useState(false);

  const recetasPanelRef = useRef(null);
  const nutriPlansPanelRef = useRef(null);

  const setDomain = useCallback((d) => {
    const defaultTab = d === 'entrenamiento' ? 'ejercicios' : 'recetas';
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

  const handlePrimaryAction = useCallback(() => {
    if (activeSubTab === 'ejercicios') {
      navigate('/libraries');
    } else if (activeSubTab === 'sesiones') {
      navigate('/library/sessions/new');
    } else if (activeSubTab === 'planes') {
      setShowCreatePlan(true);
    } else if (activeSubTab === 'recetas') {
      navigate('/nutrition/meals/new');
    } else if (activeSubTab === 'planes_nutri') {
      navigate('/nutrition/plans/new');
    }
  }, [activeSubTab, navigate]);

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

  const showSearch = activeSubTab !== 'recetas' && activeSubTab !== 'planes_nutri';

  const renderContent = () => {
    switch (activeSubTab) {
      case 'ejercicios':
        return <ExercisesPanel searchQuery={searchQuery} />;
      case 'sesiones':
        return <SessionsPanel searchQuery={searchQuery} />;
      case 'planes':
        return <PlansPanel searchQuery={searchQuery} />;
      case 'recetas':
        return <RecetasPanel searchQuery={searchQuery} />;
      case 'planes_nutri':
        return <NutritionPlansPanel searchQuery={searchQuery} />;
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Biblioteca">
        <div className="bib-container">
          <div className="bib-header">
            <div className="bib-header-text">
              <h1 className="bib-title">Biblioteca</h1>
              <p className="bib-subtitle">Tu contenido reutilizable en un solo lugar</p>
            </div>
            <button className="bib-primary-btn" onClick={handlePrimaryAction}>
              <span className="bib-primary-btn-plus">+</span>
              {getPrimaryLabel()}
            </button>
          </div>

          <div className="bib-domain-nav">
            <TubelightNavBar
              items={DOMAIN_ITEMS}
              activeId={domain}
              onSelect={setDomain}
            />
          </div>

          <div className="bib-nav-row">
            <div className="bib-sub-nav">
              <TubelightNavBar
                items={subTabs}
                activeId={activeSubTab}
                onSelect={setTab}
              />
            </div>

            {showSearch && (
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
            )}
          </div>

          <div className="bib-content" key={`${domain}-${activeSubTab}`}>
            {renderContent()}
          </div>
        </div>

        <CreateFlowOverlay
          isOpen={showCreatePlan}
          onClose={() => setShowCreatePlan(false)}
          type="plan"
          onCreated={handlePlanCreated}
        />

        <SpotlightTutorial screenKey="biblioteca" steps={TUTORIAL_STEPS} />
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default BibliotecaScreen;
