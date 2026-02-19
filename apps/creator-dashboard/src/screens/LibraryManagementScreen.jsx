import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import libraryService from '../services/libraryService';
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
  
  // Exercises tab data
  const [exerciseLibraries, setExerciseLibraries] = useState([]);
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  
  // Sessions tab data
  const [librarySessions, setLibrarySessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  
  // Modules tab data
  const [libraryModules, setLibraryModules] = useState([]);
  const [isLoadingModules, setIsLoadingModules] = useState(false);

  // Load exercise libraries
  useEffect(() => {
    const loadExerciseLibraries = async () => {
      if (!user || currentTabIndex !== 0) return;
      
      try {
        setIsLoadingExercises(true);
        const libraries = await libraryService.getLibrariesByCreator(user.uid);
        setExerciseLibraries(libraries);
      } catch (error) {
        console.error('Error loading exercise libraries:', error);
      } finally {
        setIsLoadingExercises(false);
      }
    };
    
    loadExerciseLibraries();
  }, [user, currentTabIndex]);

  // Load library sessions
  useEffect(() => {
    const loadSessions = async () => {
      if (!user || currentTabIndex !== 1) return;
      
      try {
        setIsLoadingSessions(true);
        const sessions = await libraryService.getSessionLibrary(user.uid);
        setLibrarySessions(sessions);
      } catch (error) {
        console.error('Error loading library sessions:', error);
      } finally {
        setIsLoadingSessions(false);
      }
    };
    
    loadSessions();
  }, [user, currentTabIndex]);

  // Load library modules
  useEffect(() => {
    const loadModules = async () => {
      if (!user || currentTabIndex !== 2) return;
      
      try {
        setIsLoadingModules(true);
        const modules = await libraryService.getModuleLibrary(user.uid);
        setLibraryModules(modules);
      } catch (error) {
        console.error('Error loading library modules:', error);
      } finally {
        setIsLoadingModules(false);
      }
    };
    
    loadModules();
  }, [user, currentTabIndex]);

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
                  background: 'rgba(191, 168, 77, 0.2)',
                  border: '1px solid rgba(191, 168, 77, 0.5)',
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
              <div className="library-loading">
                <p>Cargando bibliotecas de ejercicios...</p>
              </div>
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
                  background: 'rgba(191, 168, 77, 0.2)',
                  border: '1px solid rgba(191, 168, 77, 0.5)',
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
              <div className="library-loading">
                <p>Cargando sesiones de biblioteca...</p>
              </div>
            ) : librarySessions.length === 0 ? (
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
                  background: 'rgba(191, 168, 77, 0.2)',
                  border: '1px solid rgba(191, 168, 77, 0.5)',
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
              <div className="library-loading">
                <p>Cargando módulos de biblioteca...</p>
              </div>
            ) : libraryModules.length === 0 ? (
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
    <DashboardLayout screenName="Entrenamiento">
      <div className="library-management-container">
        {/* Tab Navigation */}
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

        {/* Tab Content */}
        <div className="library-tab-content-wrapper">
          {renderTabContent()}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default LibraryManagementScreen;

