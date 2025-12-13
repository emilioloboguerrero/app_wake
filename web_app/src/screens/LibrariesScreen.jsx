import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import libraryService from '../services/libraryService';
import { getUser } from '../services/firestoreService';
import './LibrariesScreen.css';
import './ProgramDetailScreen.css';

const TAB_CONFIG = [
  { key: 'exercises', title: 'Ejercicios' },
  { key: 'sessions', title: 'Sesiones' },
  { key: 'modules', title: 'Módulos' },
];

const LibrariesScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Get initial tab from URL params
  const getInitialTabIndex = () => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'sessions') return TAB_CONFIG.findIndex(tab => tab.key === 'sessions');
    if (tabParam === 'modules') return TAB_CONFIG.findIndex(tab => tab.key === 'modules');
    return 0; // Default to exercises
  };
  
  const [currentTabIndex, setCurrentTabIndex] = useState(getInitialTabIndex());
  
  // Update tab when URL param changes
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'sessions') {
      setCurrentTabIndex(TAB_CONFIG.findIndex(tab => tab.key === 'sessions'));
    } else if (tabParam === 'modules') {
      setCurrentTabIndex(TAB_CONFIG.findIndex(tab => tab.key === 'modules'));
    }
    // If no tab param, keep current tab (don't reset to exercises)
  }, [searchParams]);
  const [libraries, setLibraries] = useState([]);
  const [librarySessions, setLibrarySessions] = useState([]);
  const [libraryModules, setLibraryModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingModules, setLoadingModules] = useState(false);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [libraryName, setLibraryName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creatorName, setCreatorName] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSessionEditMode, setIsSessionEditMode] = useState(false);
  const [isModuleEditMode, setIsModuleEditMode] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [libraryToDelete, setLibraryToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const loadCreatorData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // Load creator name from user document
        const userDoc = await getUser(user.uid);
        if (userDoc) {
          setCreatorName(userDoc.displayName || userDoc.name || user.email || '');
        }
        
        // Load libraries (exercises)
        const creatorLibraries = await libraryService.getLibrariesByCreator(user.uid);
        setLibraries(creatorLibraries);
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Error al cargar las bibliotecas');
      } finally {
        setLoading(false);
      }
    };

    loadCreatorData();
  }, [user]);

  // Load library sessions
  useEffect(() => {
    const loadLibrarySessions = async () => {
      if (!user || currentTabIndex !== TAB_CONFIG.findIndex(tab => tab.key === 'sessions')) {
        return;
      }

      try {
        setLoadingSessions(true);
        const sessions = await libraryService.getSessionLibrary(user.uid);
        setLibrarySessions(sessions);
      } catch (err) {
        console.error('Error loading library sessions:', err);
        setError('Error al cargar las sesiones');
      } finally {
        setLoadingSessions(false);
      }
    };

    loadLibrarySessions();
  }, [user, currentTabIndex]);

  // Load library modules
  useEffect(() => {
    const loadLibraryModules = async () => {
      if (!user || currentTabIndex !== TAB_CONFIG.findIndex(tab => tab.key === 'modules')) {
        return;
      }

      try {
        setLoadingModules(true);
        const modules = await libraryService.getModuleLibrary(user.uid);
        setLibraryModules(modules);
      } catch (err) {
        console.error('Error loading library modules:', err);
        setError('Error al cargar los módulos');
      } finally {
        setLoadingModules(false);
      }
    };

    loadLibraryModules();
  }, [user, currentTabIndex]);

  const handleAddLibrary = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setLibraryName(''); // Reset form when closing
  };

  const handleCreateLibrary = async () => {
    if (!libraryName.trim() || !user || !creatorName) {
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      
      const newLibrary = await libraryService.createLibrary(user.uid, creatorName, libraryName.trim());
      
      // Navigate to the new library page
      navigate(`/libraries/${newLibrary.id}`);
    } catch (err) {
      console.error('Error creating library:', err);
      setError('Error al crear la biblioteca');
      alert('Error al crear la biblioteca. Por favor, intenta de nuevo.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditLibraries = () => {
    setIsEditMode(!isEditMode);
  };

  const handleDeleteLibrary = (library) => {
    setLibraryToDelete(library);
    setIsDeleteModalOpen(true);
    setDeleteConfirmation('');
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setLibraryToDelete(null);
    setDeleteConfirmation('');
  };

  const handleConfirmDelete = async () => {
    if (!libraryToDelete || !deleteConfirmation.trim()) {
      return;
    }

    // Verify the confirmation matches the library title
    if (deleteConfirmation.trim() !== libraryToDelete.title) {
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);
      
      await libraryService.deleteLibrary(libraryToDelete.id);
      
      // Reload libraries
      const creatorLibraries = await libraryService.getLibrariesByCreator(user.uid);
      setLibraries(creatorLibraries);
      
      // Close modal and exit edit mode if no libraries left
      handleCloseDeleteModal();
      if (creatorLibraries.length === 0) {
        setIsEditMode(false);
      }
    } catch (err) {
      console.error('Error deleting library:', err);
      setError('Error al eliminar la biblioteca');
      alert('Error al eliminar la biblioteca. Por favor, intenta de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTabClick = (index) => {
    if (index === currentTabIndex) return;
    setCurrentTabIndex(index);
    setIsEditMode(false); // Exit edit mode when switching tabs
    setIsSessionEditMode(false); // Exit session edit mode when switching tabs
    setIsModuleEditMode(false); // Exit module edit mode when switching tabs
  };

  const handleEditSessions = () => {
    setIsSessionEditMode(!isSessionEditMode);
  };

  const handleDeleteLibrarySession = async (session) => {
    if (!user) return;
    
    try {
      const usageCheck = await libraryService.checkLibrarySessionUsage(user.uid, session.id);
      
      if (usageCheck.inUse) {
        alert(
          `⚠️ No se puede eliminar esta sesión de la biblioteca.\n\n` +
          `Está siendo usada en ${usageCheck.count} programa(s).\n\n` +
          `Primero debes eliminar o reemplazar todas las referencias en los programas.`
        );
        return;
      }
      
      await libraryService.deleteLibrarySession(user.uid, session.id);
      
      // Reload sessions
      const sessions = await libraryService.getSessionLibrary(user.uid);
      setLibrarySessions(sessions);
    } catch (error) {
      console.error('Error deleting library session:', error);
      alert(`Error al eliminar la sesión: ${error.message || 'Por favor, intenta de nuevo.'}`);
    }
  };

  const handleEditModules = () => {
    setIsModuleEditMode(!isModuleEditMode);
  };

  const handleDeleteLibraryModule = async (module) => {
    if (!user) return;
    
    try {
      const usageCheck = await libraryService.checkLibraryModuleUsage(user.uid, module.id);
      
      if (usageCheck.inUse) {
        alert(
          `⚠️ No se puede eliminar este módulo de la biblioteca.\n\n` +
          `Está siendo usada en ${usageCheck.count} programa(s).\n\n` +
          `Primero debes eliminar o reemplazar todas las referencias en los programas.`
        );
        return;
      }
      
      await libraryService.deleteLibraryModule(user.uid, module.id);
      
      // Reload modules
      const modules = await libraryService.getModuleLibrary(user.uid);
      setLibraryModules(modules);
    } catch (error) {
      console.error('Error deleting library module:', error);
      alert(`Error al eliminar el módulo: ${error.message || 'Por favor, intenta de nuevo.'}`);
    }
  };

  const renderTabContent = () => {
    const currentTab = TAB_CONFIG[currentTabIndex];
    
    if (currentTab.key === 'exercises') {
      return (
        <>
          {/* Libraries List */}
          {loading ? (
            <div className="libraries-loading">
              <p>Cargando bibliotecas...</p>
            </div>
          ) : error ? (
            <div className="libraries-error">
              <p>{error}</p>
            </div>
          ) : libraries.length === 0 ? (
            <div className="libraries-empty">
              <p>No tienes bibliotecas aún. Crea una nueva biblioteca para comenzar.</p>
            </div>
          ) : (
            <div className="libraries-list">
              {libraries.map((library) => {
                const exerciseCount = libraryService.getExerciseCount(library);
                return (
                  <div 
                    key={library.id} 
                    className={`library-card ${isEditMode ? 'library-card-edit-mode' : ''}`}
                    onClick={() => {
                      if (!isEditMode) {
                        navigate(`/libraries/${library.id}`);
                      }
                    }}
                  >
                    {isEditMode && (
                      <button
                        className="library-delete-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLibrary(library);
                        }}
                      >
                        <span className="library-delete-icon">−</span>
                      </button>
                    )}
                    <div className="library-card-header">
                      <h3 className="library-card-title">
                        {library.title || `Biblioteca ${library.id.slice(0, 8)}`}
                      </h3>
                      {library.description && (
                        <p className="library-card-description">{library.description}</p>
                      )}
                    </div>
                    <div className="library-card-footer">
                      <span className="library-card-count">
                        {exerciseCount} {exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      );
    } else if (currentTab.key === 'sessions') {
      return (
        <>
          {loadingSessions ? (
            <div className="libraries-loading">
              <p>Cargando sesiones...</p>
            </div>
          ) : librarySessions.length === 0 ? (
            <div className="libraries-empty">
              <p>No hay sesiones guardadas en tu biblioteca.</p>
            </div>
          ) : (
            <div className="libraries-list">
              {librarySessions.map((session) => (
                <div 
                  key={session.id} 
                  className={`library-card ${isSessionEditMode ? 'library-card-edit-mode' : ''}`}
                  onClick={() => {
                    if (!isSessionEditMode) {
                      navigate(`/library/content/sessions/${session.id}?tab=sessions`);
                    }
                  }}
                >
                  {isSessionEditMode && (
                    <button
                      className="library-delete-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLibrarySession(session);
                      }}
                    >
                      <span className="library-delete-icon">−</span>
                    </button>
                  )}
                  <div className="library-card-header">
                    <h3 className="library-card-title">
                      {session.title || `Sesión ${session.id.slice(0, 8)}`}
                    </h3>
                  </div>
                  <div className="library-card-footer">
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      );
    } else if (currentTab.key === 'modules') {
      return (
        <>
          {loadingModules ? (
            <div className="libraries-loading">
              <p>Cargando módulos...</p>
            </div>
          ) : libraryModules.length === 0 ? (
            <div className="libraries-empty">
              <p>No hay módulos guardados en tu biblioteca.</p>
            </div>
          ) : (
            <div className="libraries-list">
              {libraryModules.map((module) => (
                <div 
                  key={module.id} 
                  className={`library-card ${isModuleEditMode ? 'library-card-edit-mode' : ''}`}
                  onClick={() => {
                    if (!isModuleEditMode) {
                      navigate(`/library/content/modules/${module.id}?tab=modules`);
                    }
                  }}
                >
                  {isModuleEditMode && (
                    <button
                      className="library-delete-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLibraryModule(module);
                      }}
                    >
                      <span className="library-delete-icon">−</span>
                    </button>
                  )}
                  <div className="library-card-header">
                    <h3 className="library-card-title">
                      {module.title || `Módulo ${module.id.slice(0, 8)}`}
                    </h3>
                  </div>
                  <div className="library-card-footer">
                    <span className="library-card-count">
                      {(module.sessionRefs || []).length} {(module.sessionRefs || []).length === 1 ? 'sesión' : 'sesiones'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      );
    }
    
    return null;
  };

  const renderActions = () => {
    const currentTab = TAB_CONFIG[currentTabIndex];
    
    if (currentTab.key === 'exercises') {
      return (
        <div className="libraries-actions">
          <button 
            className={`library-action-pill ${isEditMode ? 'library-action-pill-disabled' : ''}`}
            onClick={handleAddLibrary}
            disabled={isEditMode}
          >
            <span className="library-action-icon">+</span>
          </button>
          <button 
            className="library-action-pill"
            onClick={handleEditLibraries}
          >
            <span className="library-action-text">{isEditMode ? 'Guardar' : 'Editar'}</span>
          </button>
        </div>
      );
    } else if (currentTab.key === 'sessions') {
      return (
        <div className="libraries-actions">
          <button 
            className={`library-action-pill ${isSessionEditMode ? 'library-action-pill-disabled' : ''}`}
            onClick={() => navigate('/library/sessions/new')}
            disabled={isSessionEditMode}
          >
            <span className="library-action-icon">+</span>
          </button>
          <button 
            className="library-action-pill"
            onClick={handleEditSessions}
          >
            <span className="library-action-text">{isSessionEditMode ? 'Guardar' : 'Editar'}</span>
          </button>
        </div>
      );
    } else if (currentTab.key === 'modules') {
      return (
        <div className="libraries-actions">
          <button 
            className={`library-action-pill ${isModuleEditMode ? 'library-action-pill-disabled' : ''}`}
            onClick={() => navigate('/library/modules/new')}
            disabled={isModuleEditMode}
          >
            <span className="library-action-icon">+</span>
          </button>
          <button 
            className="library-action-pill"
            onClick={handleEditModules}
          >
            <span className="library-action-text">{isModuleEditMode ? 'Guardar' : 'Editar'}</span>
          </button>
        </div>
      );
    }
    
    return null;
  };

  return (
    <DashboardLayout screenName="Bibliotecas">
      <div className="libraries-content">
        {/* Tab Bar */}
        <div className="libraries-tab-bar">
          <div className="program-tab-header-container">
            <div className="program-tab-indicator-wrapper">
              <div 
                className="program-tab-indicator"
                style={{
                  width: `${100 / TAB_CONFIG.length}%`,
                  transform: `translateX(${currentTabIndex * 100}%)`
                }}
              />
              {TAB_CONFIG.map((tab, index) => (
                <button
                  key={tab.key}
                  className={`program-tab-button ${currentTabIndex === index ? 'program-tab-button-active' : ''}`}
                  onClick={() => handleTabClick(index)}
                >
                  <span className="program-tab-title-text">{tab.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div>
          {renderActions()}
        </div>

        {/* Tab Content */}
        <div style={{ marginTop: '24px' }}>
          {renderTabContent()}
        </div>
      </div>

      {/* Create Library Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Nueva biblioteca"
      >
        <div className="modal-library-content">
          <Input
            placeholder="Nombre de la biblioteca"
            value={libraryName}
            onChange={(e) => setLibraryName(e.target.value)}
            type="text"
            light={true}
          />
          <div className="modal-actions">
            <Button
              title="Crear"
              onClick={handleCreateLibrary}
              disabled={!libraryName.trim() || isCreating}
              loading={isCreating}
            />
          </div>
        </div>
      </Modal>

      {/* Delete Library Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        title={libraryToDelete?.title || 'Eliminar biblioteca'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre de la biblioteca:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={libraryToDelete?.title || 'Nombre de la biblioteca'}
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${deleteConfirmation.trim() !== libraryToDelete?.title ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDelete}
              disabled={deleteConfirmation.trim() !== libraryToDelete?.title || isDeleting}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción es irreversible. Todos los ejercicios en esta biblioteca se eliminarán permanentemente.
          </p>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default LibrariesScreen;

