import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import libraryService from '../services/libraryService';
import { queryKeys } from '../config/queryClient';
import './LibraryManagementScreen.css';

const TAB_CONFIG = [
  { key: 'exercises', title: 'Ejercicios' },
  { key: 'sessions', title: 'Sesiones' },
  { key: 'modules', title: 'Módulos' }
];

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="library-search-icon">
    <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const MenuDotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
  </svg>
);

const SkeletonGrid = () => (
  <div className="library-skeleton-grid">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="library-skeleton-card">
        <div className="library-skeleton-line library-skeleton-line-title" />
        <div className="library-skeleton-line library-skeleton-line-meta" />
      </div>
    ))}
  </div>
);

const LibraryManagementScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: exerciseLibraries = [], isLoading: isLoadingExercises } = useQuery({
    queryKey: queryKeys.library.exercises(user?.uid),
    queryFn: () => libraryService.getLibrariesByCreator(user.uid),
    enabled: !!user?.uid && currentTabIndex === 0,
  });

  const { data: librarySessions = [], isLoading: isLoadingSessions } = useQuery({
    queryKey: queryKeys.library.sessions(user?.uid),
    queryFn: () => libraryService.getSessionLibrary(user.uid),
    enabled: !!user?.uid && currentTabIndex === 1,
  });

  const { data: libraryModules = [], isLoading: isLoadingModules } = useQuery({
    queryKey: queryKeys.library.modules(user?.uid),
    queryFn: () => libraryService.getModuleLibrary(user.uid),
    enabled: !!user?.uid && currentTabIndex === 2,
  });

  const handleTabClick = (index) => {
    setCurrentTabIndex(index);
    setSearchQuery('');
  };

  const currentTab = TAB_CONFIG[currentTabIndex];

  const primaryActions = {
    exercises: { label: 'Nueva biblioteca', path: '/libraries' },
    sessions:  { label: 'Nueva sesión',    path: '/library/sessions/new' },
    modules:   { label: 'Nuevo módulo',    path: '/library/modules/new' },
  };
  const primaryAction = primaryActions[currentTab.key];

  const filterByQuery = (items, key = 'title') =>
    searchQuery.trim()
      ? items.filter((item) => (item[key] || '').toLowerCase().includes(searchQuery.toLowerCase()))
      : items;

  const renderTabContent = () => {
    switch (currentTab.key) {
      case 'exercises': {
        if (isLoadingExercises) return <SkeletonGrid />;
        const filtered = filterByQuery(exerciseLibraries);
        if (filtered.length === 0) {
          return (
            <div className="library-empty">
              <div className="library-empty-icon">📚</div>
              <h3 className="library-empty-title">Tu biblioteca está vacía</h3>
              <p className="library-empty-sub">Crea tu primera biblioteca de ejercicios para empezar</p>
              <button className="library-empty-cta" onClick={() => navigate('/libraries')}>
                <span>+</span> Nueva biblioteca
              </button>
            </div>
          );
        }
        return (
          <div className="library-list">
            {filtered.map((library) => {
              const exerciseCount = libraryService.getExerciseCount(library);
              return (
                <div
                  key={library.id}
                  className="library-item-card"
                  onClick={() => navigate(`/libraries/${library.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="library-item-header">
                    <h3 className="library-item-title">
                      {library.title || `Biblioteca ${library.id.slice(0, 8)}`}
                    </h3>
                    <button
                      className="library-card-menu"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Opciones"
                    >
                      <MenuDotsIcon />
                    </button>
                  </div>
                  <div className="library-card-badges">
                    <span className="library-badge library-badge-count">
                      {exerciseCount} {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      case 'sessions': {
        if (isLoadingSessions) return <SkeletonGrid />;
        const filtered = filterByQuery(librarySessions);
        if (filtered.length === 0) {
          return (
            <div className="library-empty">
              <div className="library-empty-icon">🏋️</div>
              <h3 className="library-empty-title">Tu biblioteca está vacía</h3>
              <p className="library-empty-sub">Crea tu primera sesión para empezar</p>
              <button className="library-empty-cta" onClick={() => navigate('/library/sessions/new')}>
                <span>+</span> Nueva sesión
              </button>
            </div>
          );
        }
        return (
          <div className="library-list">
            {filtered.map((session) => (
              <div
                key={session.id}
                className="library-item-card"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/content/sessions/${session.id}`)}
              >
                <div className="library-item-header">
                  <h3 className="library-item-title">
                    {session.title || `Sesión ${session.id?.slice(0, 8)}`}
                  </h3>
                  <button
                    className="library-card-menu"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Opciones"
                  >
                    <MenuDotsIcon />
                  </button>
                </div>
                <div className="library-card-badges">
                  {session.exercises?.length > 0 && (
                    <span className="library-badge library-badge-count">
                      {session.exercises.length} {session.exercises.length === 1 ? 'ejercicio' : 'ejercicios'}
                    </span>
                  )}
                  {(session.muscleGroups || []).slice(0, 3).map((mg) => (
                    <span key={mg} className="library-badge library-badge-muscle">{mg}</span>
                  ))}
                </div>
                {session.image_url && (
                  <div className="library-card-image">
                    <img src={session.image_url} alt={session.title} />
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      }

      case 'modules': {
        if (isLoadingModules) return <SkeletonGrid />;
        const filtered = filterByQuery(libraryModules);
        if (filtered.length === 0) {
          return (
            <div className="library-empty">
              <div className="library-empty-icon">📦</div>
              <h3 className="library-empty-title">Tu biblioteca está vacía</h3>
              <p className="library-empty-sub">Crea tu primer módulo para empezar</p>
              <button className="library-empty-cta" onClick={() => navigate('/library/modules/new')}>
                <span>+</span> Nuevo módulo
              </button>
            </div>
          );
        }
        return (
          <div className="library-list">
            {filtered.map((module) => {
              const sessionCount = (module.sessionRefs || []).length;
              return (
                <div
                  key={module.id}
                  className="library-item-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/library/modules/${module.id}/edit`)}
                >
                  <div className="library-item-header">
                    <h3 className="library-item-title">
                      {module.title || `Módulo ${module.id?.slice(0, 8)}`}
                    </h3>
                    <button
                      className="library-card-menu"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Opciones"
                    >
                      <MenuDotsIcon />
                    </button>
                  </div>
                  <div className="library-card-badges">
                    <span className="library-badge library-badge-count">
                      {sessionCount} {sessionCount === 1 ? 'sesión' : 'sesiones'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Entrenamiento">
        <div className="library-management-container">

          {/* Page header */}
          <div className="library-page-header">
            <div className="library-page-header-text">
              <h1 className="library-page-title">Biblioteca</h1>
              <p className="library-page-subtitle">Tus sesiones y módulos listos para reutilizar</p>
            </div>
            <button
              className="library-primary-btn"
              onClick={() => navigate(primaryAction.path)}
            >
              <span className="library-primary-btn-icon">+</span>
              {primaryAction.label}
            </button>
          </div>

          {/* Tab navigation + search */}
          <div className="library-tab-navigation">
            <div className="library-tab-header-container">
              <div className="library-tab-indicator-wrapper">
                {TAB_CONFIG.map((tab, index) => (
                  <button
                    key={tab.key}
                    className={`library-tab-button ${currentTabIndex === index ? 'library-tab-button-active' : ''}`}
                    onClick={() => handleTabClick(index)}
                  >
                    <span className="library-tab-title-text">{tab.title}</span>
                  </button>
                ))}
                <div
                  className="library-tab-indicator"
                  style={{ transform: `translateX(${currentTabIndex * 100}%)` }}
                />
              </div>

              <div className="library-search-wrapper">
                <div className="library-search-field">
                  <SearchIcon />
                  <input
                    type="text"
                    className="library-search-input"
                    placeholder={`Buscar ${currentTab.title.toLowerCase()}…`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="library-tab-content-wrapper">
            <div className="library-tab-content">
              {renderTabContent()}
            </div>
          </div>

        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default LibraryManagementScreen;
