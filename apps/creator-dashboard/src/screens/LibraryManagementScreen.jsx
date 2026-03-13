import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import ScreenSkeleton from '../components/ScreenSkeleton';
import libraryService from '../services/libraryService';
import { queryKeys } from '../config/queryClient';
import './LibraryManagementScreen.css';

const TAB_CONFIG = [
  { key: 'exercises', title: 'Ejercicios' },
  { key: 'sessions', title: 'Sesiones' },
  { key: 'modules', title: 'Módulos' }
];

const LibraryManagementScreen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentTabIndex, setCurrentTabIndex] = useState(0);

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
  };

  const renderTabContent = () => {
    const currentTab = TAB_CONFIG[currentTabIndex];
    
    switch (currentTab.key) {
      case 'exercises':
        return (
          <div className="library-tab-content">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button
                className="library-action-button"
                onClick={() => navigate('/libraries')}
                style={{ 
                  padding: '8px 16px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                <span style={{ fontSize: '18px' }}>+</span>
                <span>Nueva Biblioteca</span>
              </button>
            </div>
            {isLoadingExercises ? (
              <ScreenSkeleton />
            ) : exerciseLibraries.length === 0 ? (
              <div className="library-empty">
                <p>No tienes bibliotecas de ejercicios. Crea una nueva para comenzar.</p>
              </div>
            ) : (
              <div className="library-list">
                {exerciseLibraries.map((library) => {
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
                      </div>
                      <div className="library-item-footer">
                        <span className="library-item-count">
                          {exerciseCount} {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
        
      case 'sessions':
        return (
          <div className="library-tab-content">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button
                className="library-action-button"
                onClick={() => navigate('/library/sessions/new')}
                style={{ 
                  padding: '8px 16px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                <span style={{ fontSize: '18px' }}>+</span>
                <span>Nueva Sesión</span>
              </button>
            </div>
            {isLoadingSessions ? (
              <ScreenSkeleton />
            ) :librarySessions.length === 0 ? (
              <div className="library-empty">
                <p>No tienes sesiones guardadas en tu biblioteca.</p>
              </div>
            ) : (
              <div className="library-list">
                {librarySessions.map((session) => (
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
                    </div>
                    {session.image_url && (
                      <div style={{ 
                        width: '100%', 
                        height: '120px', 
                        marginTop: '12px',
                        borderRadius: '8px',
                        overflow: 'hidden'
                      }}>
                        <img 
                          src={session.image_url} 
                          alt={session.title}
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'cover' 
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
        
      case 'modules':
        return (
          <div className="library-tab-content">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <button
                className="library-action-button"
                onClick={() => navigate('/library/modules/new')}
                style={{ 
                  padding: '8px 16px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                <span style={{ fontSize: '18px' }}>+</span>
                <span>Nuevo Módulo</span>
              </button>
            </div>
            {isLoadingModules ? (
              <ScreenSkeleton />
            ) :libraryModules.length === 0 ? (
              <div className="library-empty">
                <p>No tienes módulos guardados en tu biblioteca.</p>
              </div>
            ) : (
              <div className="library-list">
                {libraryModules.map((module) => (
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
                    </div>
                    <div className="library-item-footer">
                      <span className="library-item-count">
                        {(module.sessionRefs || []).length} {(module.sessionRefs || []).length === 1 ? 'sesión' : 'sesiones'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Entrenamiento">
        <div className="library-management-container">
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
                style={{
                  transform: `translateX(${currentTabIndex * 100}%)`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="library-tab-content-wrapper">
          {renderTabContent()}
        </div>
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default LibraryManagementScreen;

