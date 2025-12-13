import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import libraryService from '../services/libraryService';
import programService from '../services/programService';
import { getUser } from '../services/firestoreService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, cacheConfig } from '../config/queryClient';
import './LibrariesScreen.css';
import './ProgramDetailScreen.css';
import './ProgramsScreen.css';

const TAB_CONFIG = [
  { key: 'exercises', title: 'Ejercicios' },
  { key: 'sessions', title: 'Sesiones' },
  { key: 'modules', title: 'Semanas' },
  { key: 'programs', title: 'Programas' },
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
    if (tabParam === 'programs') return TAB_CONFIG.findIndex(tab => tab.key === 'programs');
    return 0; // Default to exercises
  };
  
  const [currentTabIndex, setCurrentTabIndex] = useState(getInitialTabIndex());
  const queryClient = useQueryClient();
  
  // Update tab when URL param changes
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'sessions') {
      setCurrentTabIndex(TAB_CONFIG.findIndex(tab => tab.key === 'sessions'));
    } else if (tabParam === 'modules') {
      setCurrentTabIndex(TAB_CONFIG.findIndex(tab => tab.key === 'modules'));
    } else if (tabParam === 'programs') {
      setCurrentTabIndex(TAB_CONFIG.findIndex(tab => tab.key === 'programs'));
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
  
  // Session modal state
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionImageFile, setSessionImageFile] = useState(null);
  const [sessionImagePreview, setSessionImagePreview] = useState(null);
  const [isUploadingSessionImage, setIsUploadingSessionImage] = useState(false);
  const [sessionImageUploadProgress, setSessionImageUploadProgress] = useState(0);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  
  // Module modal state
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [moduleName, setModuleName] = useState('');
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  
  // Programs tab state
  const [programs, setPrograms] = useState([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [isProgramEditMode, setIsProgramEditMode] = useState(false);
  const [isProgramDeleteModalOpen, setIsProgramDeleteModalOpen] = useState(false);
  const [programToDelete, setProgramToDelete] = useState(null);
  const [deleteProgramConfirmation, setDeleteProgramConfirmation] = useState('');
  const [isDeletingProgram, setIsDeletingProgram] = useState(false);

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

      // Load library modules (weeks)
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
            console.error('Error loading library weeks:', err);
            setError('Error al cargar las semanas');
          } finally {
            setLoadingModules(false);
          }
        };

        loadLibraryModules();
      }, [user, currentTabIndex]);

      // Load programs
      useEffect(() => {
        const loadPrograms = async () => {
          if (!user || currentTabIndex !== TAB_CONFIG.findIndex(tab => tab.key === 'programs')) {
            return;
          }

          try {
            setLoadingPrograms(true);
            const programsData = await programService.getProgramsByCreator(user.uid);
            setPrograms(programsData);
          } catch (err) {
            console.error('Error loading programs:', err);
            setError('Error al cargar los programas');
          } finally {
            setLoadingPrograms(false);
          }
        };

        loadPrograms();
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
    const newTab = TAB_CONFIG[index];
    setCurrentTabIndex(index);
    setIsEditMode(false); // Exit edit mode when switching tabs
    setIsSessionEditMode(false); // Exit session edit mode when switching tabs
    setIsModuleEditMode(false); // Exit module edit mode when switching tabs
    setIsProgramEditMode(false); // Exit program edit mode when switching tabs
    
    // Update URL params
    if (newTab.key === 'exercises') {
      navigate('/libraries');
    } else {
      navigate(`/libraries?tab=${newTab.key}`);
    }
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
          `⚠️ No se puede eliminar esta semana de la biblioteca.\n\n` +
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
      console.error('Error deleting library week:', error);
      alert(`Error al eliminar la semana: ${error.message || 'Por favor, intenta de nuevo.'}`);
    }
  };

  // Session modal handlers
  const handleOpenSessionModal = () => {
    setIsSessionModalOpen(true);
    setSessionName('');
    setSessionImageFile(null);
    setSessionImagePreview(null);
  };

  const handleCloseSessionModal = () => {
    setIsSessionModalOpen(false);
    setSessionName('');
    setSessionImageFile(null);
    setSessionImagePreview(null);
    setIsUploadingSessionImage(false);
    setSessionImageUploadProgress(0);
  };

  const handleSessionImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecciona un archivo de imagen válido');
      return;
    }

    // Validate file size (e.g., max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      alert('El archivo es demasiado grande. El tamaño máximo es 10MB');
      return;
    }

    setSessionImageFile(file);
    
    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setSessionImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSessionImageDelete = () => {
    setSessionImageFile(null);
    setSessionImagePreview(null);
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim() || !user) {
      return;
    }

    try {
      setIsCreatingSession(true);
      
      let imageUrl = null;
      
      // Upload image if provided (need to create session first to get ID)
      if (sessionImageFile) {
        setIsUploadingSessionImage(true);
        setSessionImageUploadProgress(0);
        
        // Create session first to get sessionId
        const tempSession = await libraryService.createLibrarySession(user.uid, {
          title: sessionName.trim(),
          image_url: null // Will update after upload
        });
        
        try {
          imageUrl = await libraryService.uploadLibrarySessionImage(
            user.uid,
            tempSession.id,
            sessionImageFile,
            (progress) => {
              setSessionImageUploadProgress(Math.round(progress));
            }
          );
          
          // Update session with image URL
          await libraryService.updateLibrarySession(user.uid, tempSession.id, {
            image_url: imageUrl
          });
        } catch (uploadError) {
          console.error('Error uploading session image:', uploadError);
          // Session already created, but image upload failed - that's ok, session will have no image
          alert('La sesión se creó, pero hubo un error al subir la imagen. Puedes editarla más tarde.');
        } finally {
          setIsUploadingSessionImage(false);
          setSessionImageUploadProgress(0);
        }
      } else {
        // Create session without image
        await libraryService.createLibrarySession(user.uid, {
          title: sessionName.trim(),
          image_url: null
        });
      }
      
      // Reload sessions
      const sessions = await libraryService.getSessionLibrary(user.uid);
      setLibrarySessions(sessions);
      
      // Close modal
      handleCloseSessionModal();
    } catch (err) {
      console.error('Error creating session:', err);
      alert('Error al crear la sesión. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingSession(false);
      setIsUploadingSessionImage(false);
      setSessionImageUploadProgress(0);
    }
  };

  // Module modal handlers
  const handleOpenModuleModal = () => {
    setIsModuleModalOpen(true);
    setModuleName('');
  };

  const handleCloseModuleModal = () => {
    setIsModuleModalOpen(false);
    setModuleName('');
  };

  const handleCreateModule = async () => {
    if (!moduleName.trim() || !user) {
      return;
    }

    try {
      setIsCreatingModule(true);
      
      await libraryService.createLibraryModule(user.uid, {
        title: moduleName.trim(),
        sessionRefs: []
      });
      
      // Reload modules
      const modules = await libraryService.getModuleLibrary(user.uid);
      setLibraryModules(modules);
      
      // Close modal
      handleCloseModuleModal();
    } catch (err) {
      console.error('Error creating week:', err);
      alert('Error al crear la semana. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingModule(false);
    }
  };

  // Program handlers
  const handleDeleteProgram = (program) => {
    setProgramToDelete(program);
    setIsProgramDeleteModalOpen(true);
    setDeleteProgramConfirmation('');
  };

  const handleConfirmDeleteProgram = async () => {
    if (!programToDelete || !deleteProgramConfirmation.trim() || !user) {
      return;
    }

    if (deleteProgramConfirmation.trim() !== programToDelete.title) {
      return;
    }

    try {
      setIsDeletingProgram(true);
      
      await programService.deleteProgram(programToDelete.id);
      
      // Reload programs
      const programsData = await programService.getProgramsByCreator(user.uid);
      setPrograms(programsData);
      
      // Close modal
      setIsProgramDeleteModalOpen(false);
      setProgramToDelete(null);
      setDeleteProgramConfirmation('');
      
      // Exit edit mode if no programs left
      if (programsData.length === 0) {
        setIsProgramEditMode(false);
      }
    } catch (err) {
      console.error('Error deleting program:', err);
      alert('Error al eliminar el programa. Por favor, intenta de nuevo.');
    } finally {
      setIsDeletingProgram(false);
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
              <p>Cargando semanas...</p>
            </div>
          ) : libraryModules.length === 0 ? (
            <div className="libraries-empty">
              <p>No hay semanas guardadas en tu biblioteca.</p>
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
                      {module.title || `Semana ${module.id.slice(0, 8)}`}
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
    } else if (currentTab.key === 'programs') {
      return (
        <>
          {loadingPrograms ? (
            <div className="programs-loading">
              <p>Cargando programas...</p>
            </div>
          ) : programs.length === 0 ? (
            <div className="programs-empty">
              <p>No tienes programas aún. Crea un nuevo programa para comenzar.</p>
            </div>
          ) : (
            <div className="programs-list">
              {programs.map((program) => {
                const weekCount = programService.getWeekCount ? programService.getWeekCount(program) : 0;
                return (
                  <div 
                    key={program.id} 
                    className={`program-card ${isProgramEditMode ? 'program-card-edit-mode' : ''}`}
                    onClick={() => {
                      if (!isProgramEditMode) {
                        navigate(`/programs/${program.id}`);
                      }
                    }}
                  >
                    {isProgramEditMode && (
                      <button
                        className="program-delete-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProgram(program);
                        }}
                      >
                        <span className="program-delete-icon">−</span>
                      </button>
                    )}
                    {program.image_url ? (
                      <div className="program-card-image-wrapper">
                        <img 
                          src={program.image_url} 
                          alt={program.title || 'Programa'} 
                          className="program-card-image"
                        />
                        <div className="program-card-overlay">
                          <h3 className="program-card-title">
                            {program.title || `Programa ${program.id.slice(0, 8)}`}
                          </h3>
                        </div>
                      </div>
                    ) : (
                      <div className="program-card-header">
                        <h3 className="program-card-title">
                          {program.title || `Programa ${program.id.slice(0, 8)}`}
                        </h3>
                      </div>
                    )}
                    <div className="program-card-footer">
                      {weekCount > 0 && (
                        <span className="program-card-count">
                          {weekCount} {weekCount === 1 ? 'semana' : 'semanas'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
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
            onClick={handleOpenSessionModal}
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
            onClick={handleOpenModuleModal}
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
    } else if (currentTab.key === 'programs') {
      return (
        <div className="libraries-actions">
          <button 
            className={`library-action-pill ${isProgramEditMode ? 'library-action-pill-disabled' : ''}`}
            onClick={() => navigate('/programs')}
            disabled={isProgramEditMode}
          >
            <span className="library-action-icon">+</span>
          </button>
          <button 
            className="library-action-pill"
            onClick={() => setIsProgramEditMode(!isProgramEditMode)}
          >
            <span className="library-action-text">{isProgramEditMode ? 'Guardar' : 'Editar'}</span>
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

      {/* Create Session Modal */}
      <Modal
        isOpen={isSessionModalOpen}
        onClose={handleCloseSessionModal}
        title="Nueva sesión"
      >
        <div className="edit-program-modal-content">
          <div className="edit-program-modal-body">
            {/* Left Side - Inputs */}
            <div className="edit-program-modal-left">
              <div className="edit-program-input-group">
                <label className="edit-program-input-label">Nombre de la Sesión</label>
                <Input
                  placeholder="Nombre de la sesión"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  type="text"
                  light={true}
                />
              </div>
            </div>

            {/* Right Side - Image */}
            <div className="edit-program-modal-right">
              <div className="edit-program-image-section">
                {sessionImagePreview ? (
                  <div className="edit-program-image-container">
                    <img
                      src={sessionImagePreview}
                      alt="Sesión"
                      className="edit-program-image"
                    />
                    <div className="edit-program-image-overlay">
                      <div className="edit-program-image-actions">
                        <label className="edit-program-image-action-pill">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleSessionImageUpload}
                            disabled={isUploadingSessionImage || isCreatingSession}
                            style={{ display: 'none' }}
                          />
                          <span className="edit-program-image-action-text">
                            {isUploadingSessionImage ? 'Subiendo...' : 'Cambiar'}
                          </span>
                        </label>
                        {isUploadingSessionImage && (
                          <div className="edit-program-image-progress">
                            <div className="edit-program-image-progress-bar">
                              <div 
                                className="edit-program-image-progress-fill"
                                style={{ width: `${sessionImageUploadProgress}%` }}
                              />
                            </div>
                            <span className="edit-program-image-progress-text">
                              {sessionImageUploadProgress}%
                            </span>
                          </div>
                        )}
                        <button
                          className="edit-program-image-action-pill edit-program-image-delete-pill"
                          onClick={handleSessionImageDelete}
                          disabled={isUploadingSessionImage || isCreatingSession}
                        >
                          <span className="edit-program-image-action-text">Eliminar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="edit-program-no-image">
                    <p>No hay imagen disponible</p>
                    <label className="edit-program-image-upload-button">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleSessionImageUpload}
                        disabled={isUploadingSessionImage || isCreatingSession}
                        style={{ display: 'none' }}
                      />
                      {isUploadingSessionImage ? 'Subiendo...' : 'Subir Imagen'}
                    </label>
                    {isUploadingSessionImage && (
                      <div className="edit-program-image-progress">
                        <div className="edit-program-image-progress-bar">
                          <div 
                            className="edit-program-image-progress-fill"
                            style={{ width: `${sessionImageUploadProgress}%` }}
                          />
                        </div>
                        <span className="edit-program-image-progress-text">
                          {sessionImageUploadProgress}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="edit-program-modal-actions">
            <Button
              title={
                isCreatingSession || isUploadingSessionImage ? 'Creando...' : 'Crear'
              }
              onClick={handleCreateSession}
              disabled={
                !sessionName.trim() || 
                (isCreatingSession || isUploadingSessionImage)
              }
              loading={isCreatingSession || isUploadingSessionImage}
            />
          </div>
        </div>
      </Modal>

      {/* Create Module Modal */}
      <Modal
        isOpen={isModuleModalOpen}
        onClose={handleCloseModuleModal}
        title="Nueva semana"
      >
        <div className="modal-library-content">
          <Input
            placeholder="Nombre de la semana"
            value={moduleName}
            onChange={(e) => setModuleName(e.target.value)}
            type="text"
            light={true}
          />
          <div className="modal-actions">
            <Button
              title={isCreatingModule ? 'Creando...' : 'Crear'}
              onClick={handleCreateModule}
              disabled={!moduleName.trim() || isCreatingModule}
              loading={isCreatingModule}
            />
          </div>
        </div>
      </Modal>

      {/* Delete Program Modal */}
      <Modal
        isOpen={isProgramDeleteModalOpen}
        onClose={() => {
          setIsProgramDeleteModalOpen(false);
          setProgramToDelete(null);
          setDeleteProgramConfirmation('');
        }}
        title={programToDelete?.title || 'Eliminar programa'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre del programa:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={programToDelete?.title || 'Nombre del programa'}
              value={deleteProgramConfirmation}
              onChange={(e) => setDeleteProgramConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${deleteProgramConfirmation.trim() !== programToDelete?.title ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDeleteProgram}
              disabled={deleteProgramConfirmation.trim() !== programToDelete?.title || isDeletingProgram}
            >
              {isDeletingProgram ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción es irreversible. Todos los datos del programa se eliminarán permanentemente.
          </p>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default LibrariesScreen;

