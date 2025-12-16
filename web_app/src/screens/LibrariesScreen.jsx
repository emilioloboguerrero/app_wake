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
  const [isProgramTypeSelectionModalOpen, setIsProgramTypeSelectionModalOpen] = useState(false);
  const [isOneOnOneModalOpen, setIsOneOnOneModalOpen] = useState(false);
  
  // One-on-One Program state
  const [oneOnOneProgramName, setOneOnOneProgramName] = useState('');
  const [oneOnOneProgramDescription, setOneOnOneProgramDescription] = useState('');
  const [oneOnOneDiscipline, setOneOnOneDiscipline] = useState('Fuerza - hipertrofia');
  const [oneOnOneProgramImageFile, setOneOnOneProgramImageFile] = useState(null);
  const [oneOnOneProgramImagePreview, setOneOnOneProgramImagePreview] = useState(null);
  const [isUploadingOneOnOneImage, setIsUploadingOneOnOneImage] = useState(false);
  const [oneOnOneImageUploadProgress, setOneOnOneImageUploadProgress] = useState(0);
  const [oneOnOneIntroVideoFile, setOneOnOneIntroVideoFile] = useState(null);
  const [oneOnOneIntroVideoPreview, setOneOnOneIntroVideoPreview] = useState(null);
  const [isUploadingOneOnOneIntroVideo, setIsUploadingOneOnOneIntroVideo] = useState(false);
  const [oneOnOneIntroVideoUploadProgress, setOneOnOneIntroVideoUploadProgress] = useState(0);
  const [oneOnOneStreakEnabled, setOneOnOneStreakEnabled] = useState(false);
  const [oneOnOneMinimumSessionsPerWeek, setOneOnOneMinimumSessionsPerWeek] = useState(0);
  const [oneOnOneWeightSuggestions, setOneOnOneWeightSuggestions] = useState(false);
  const [oneOnOneAvailableLibraries, setOneOnOneAvailableLibraries] = useState([]);
  const [oneOnOneSelectedLibraryIds, setOneOnOneSelectedLibraryIds] = useState(new Set());

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

  // One-on-One Program handlers
  const handleCloseOneOnOneModal = () => {
    setIsOneOnOneModalOpen(false);
    // Reset all one-on-one form fields
    setOneOnOneProgramName('');
    setOneOnOneProgramDescription('');
    setOneOnOneDiscipline('Fuerza - hipertrofia');
    setOneOnOneProgramImageFile(null);
    setOneOnOneProgramImagePreview(null);
    setOneOnOneIntroVideoFile(null);
    setOneOnOneIntroVideoPreview(null);
    setOneOnOneStreakEnabled(false);
    setOneOnOneMinimumSessionsPerWeek(0);
    setOneOnOneWeightSuggestions(false);
    setOneOnOneAvailableLibraries([]);
    setOneOnOneSelectedLibraryIds(new Set());
  };

  // Load libraries when one-on-one modal opens
  useEffect(() => {
    const loadOneOnOneLibraries = async () => {
      if (!isOneOnOneModalOpen || !user) return;
      
      try {
        const libraries = await libraryService.getLibrariesByCreator(user.uid);
        setOneOnOneAvailableLibraries(libraries);
      } catch (err) {
        console.error('Error loading libraries:', err);
        alert('Error al cargar las bibliotecas');
      }
    };
    
    loadOneOnOneLibraries();
  }, [isOneOnOneModalOpen, user]);

  const handleToggleOneOnOneLibrary = (libraryId) => {
    setOneOnOneSelectedLibraryIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(libraryId)) {
        newSet.delete(libraryId);
      } else {
        newSet.add(libraryId);
      }
      return newSet;
    });
  };

  // Create one-on-one program mutation
  const createOneOnOneProgramMutation = useMutation({
    mutationFn: async ({ creatorId, creatorName, programData }) => {
      return await programService.createProgram(creatorId, creatorName, programData);
    },
    onSuccess: () => {
      // Reload programs list
      const loadPrograms = async () => {
        try {
          const programsData = await programService.getProgramsByCreator(user.uid);
          setPrograms(programsData);
        } catch (err) {
          console.error('Error reloading programs:', err);
        }
      };
      if (user) loadPrograms();
    },
  });

  const handleCreateOneOnOneProgram = async () => {
    // Validate required fields
    if (!oneOnOneProgramName.trim()) {
      alert('El nombre del programa es requerido');
      return;
    }
    if (!oneOnOneDiscipline) {
      alert('La disciplina es requerida');
      return;
    }
    if (!user || !creatorName) {
      return;
    }

    try {
      // Prepare program data for one-on-one
      const defaultTutorials = {
        dailyWorkout: [],
        workoutCompletion: [],
        workoutExecution: []
      };
      
      const programData = {
        title: oneOnOneProgramName.trim(),
        description: oneOnOneProgramDescription.trim() || '',
        discipline: oneOnOneDiscipline,
        programType: null, // No subscription/one-time for one-on-one
        deliveryType: 'one_on_one', // Set delivery type
        status: 'draft',
        price: null, // No pricing for one-on-one
        freeTrialActive: false, // No free trial for one-on-one
        freeTrialDurationDays: 0,
        duration: null, // No duration for one-on-one
        streakEnabled: oneOnOneStreakEnabled,
        minimumSessionsPerWeek: oneOnOneStreakEnabled ? parseInt(oneOnOneMinimumSessionsPerWeek || '0', 10) : 0,
        weightSuggestions: oneOnOneWeightSuggestions,
        availableLibraries: Array.from(oneOnOneSelectedLibraryIds),
        tutorials: defaultTutorials,
      };
      
      // Create program first
      const newProgram = await createOneOnOneProgramMutation.mutateAsync({
        creatorId: user.uid,
        creatorName: creatorName,
        programData: programData
      });
      
      // Upload image if provided
      if (oneOnOneProgramImageFile && newProgram?.id) {
        try {
          setIsUploadingOneOnOneImage(true);
          setOneOnOneImageUploadProgress(0);
          
          await programService.uploadProgramImage(
            newProgram.id,
            oneOnOneProgramImageFile,
            (progress) => {
              setOneOnOneImageUploadProgress(Math.round(progress));
            }
          );
          
          setOneOnOneImageUploadProgress(100);
        } catch (uploadErr) {
          console.error('Error uploading image:', uploadErr);
          alert(`Error al subir la imagen: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`);
        } finally {
          setIsUploadingOneOnOneImage(false);
        }
      }
      
      // Upload intro video if provided
      if (oneOnOneIntroVideoFile && newProgram?.id) {
        try {
          setIsUploadingOneOnOneIntroVideo(true);
          setOneOnOneIntroVideoUploadProgress(0);
          
          const introVideoUrl = await programService.uploadProgramIntroVideo(
            newProgram.id,
            oneOnOneIntroVideoFile,
            (progress) => {
              setOneOnOneIntroVideoUploadProgress(Math.round(progress));
            }
          );
          
          // Update program with intro video URL
          await programService.updateProgram(newProgram.id, {
            video_intro_url: introVideoUrl
          });
          
          setOneOnOneIntroVideoUploadProgress(100);
        } catch (uploadErr) {
          console.error('Error uploading intro video:', uploadErr);
          alert(`Error al subir el video intro: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`);
        } finally {
          setIsUploadingOneOnOneIntroVideo(false);
        }
      }
      
      handleCloseOneOnOneModal();
      // Navigate to the new program page
      if (newProgram?.id && !newProgram.id.startsWith('temp-')) {
        navigate(`/programs/${newProgram.id}`);
      } else {
        // Wait a bit for cache to update
        setTimeout(async () => {
          const programsData = await programService.getProgramsByCreator(user.uid);
          const foundProgram = programsData.find(p => p.title === oneOnOneProgramName.trim());
          if (foundProgram && foundProgram.id && !foundProgram.id.startsWith('temp-')) {
            navigate(`/programs/${foundProgram.id}`);
          }
        }, 500);
      }
    } catch (err) {
      console.error('Error creating one-on-one program:', err);
      alert(`Error al crear el programa: ${err.message || 'Por favor, intenta de nuevo.'}`);
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
            onClick={() => setIsProgramTypeSelectionModalOpen(true)}
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

      {/* Program Type Selection Modal */}
      <Modal
        isOpen={isProgramTypeSelectionModalOpen}
        onClose={() => setIsProgramTypeSelectionModalOpen(false)}
        title="Tipo de programa"
      >
        <div className="program-type-selection-modal-content">
          <p className="program-type-selection-instruction">Selecciona el tipo de programa que deseas crear:</p>
          <div className="program-type-selection-options">
            <button
              className="program-type-selection-option"
              onClick={() => {
                setIsProgramTypeSelectionModalOpen(false);
                navigate('/programs?autoCreate=true');
              }}
            >
              <div className="program-type-selection-option-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="program-type-selection-option-content">
                <h3 className="program-type-selection-option-title">Low Ticket</h3>
                <p className="program-type-selection-option-description">Programas generales y escalables para múltiples usuarios</p>
              </div>
            </button>
            <button
              className="program-type-selection-option"
              onClick={() => {
                setIsProgramTypeSelectionModalOpen(false);
                setIsOneOnOneModalOpen(true);
              }}
            >
              <div className="program-type-selection-option-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="program-type-selection-option-content">
                <h3 className="program-type-selection-option-title">1 on 1</h3>
                <p className="program-type-selection-option-description">Programas personalizados para clientes individuales</p>
              </div>
            </button>
          </div>
        </div>
      </Modal>

      {/* One on One Program Modal */}
      <Modal
        isOpen={isOneOnOneModalOpen}
        onClose={handleCloseOneOnOneModal}
        title="Nuevo programa 1 on 1"
      >
        <div className="one-on-one-modal-content">
          {/* Information Section */}
          <div className="one-on-one-modal-section">
            <div className="one-on-one-modal-section-header">
              <h3 className="one-on-one-modal-section-title">Información Básica</h3>
              <span className="one-on-one-modal-section-badge">Requerido</span>
            </div>
            <div className="one-on-one-modal-section-content">
              <div className="edit-program-input-group">
                <label className="edit-program-input-label">
                  Nombre del Programa <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span>
                </label>
                <Input
                  placeholder="Ej: Programa Personalizado para Juan"
                  value={oneOnOneProgramName}
                  onChange={(e) => setOneOnOneProgramName(e.target.value)}
                  type="text"
                  light={true}
                />
              </div>
              
              <div className="edit-program-input-group">
                <label className="edit-program-input-label">Descripción</label>
                <textarea
                  className="program-config-description-textarea"
                  value={oneOnOneProgramDescription}
                  onChange={(e) => setOneOnOneProgramDescription(e.target.value)}
                  placeholder="Describe el objetivo y características de este programa personalizado..."
                  rows={4}
                />
              </div>
              
              <div className="edit-program-input-group">
                <label className="edit-program-input-label">
                  Disciplina <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span>
                </label>
                <select
                  className="program-config-dropdown"
                  value={oneOnOneDiscipline}
                  onChange={(e) => setOneOnOneDiscipline(e.target.value)}
                >
                  <option value="Fuerza - hipertrofia">Fuerza - hipertrofia</option>
                </select>
                <p className="one-on-one-field-note">
                  Esta opción no se puede cambiar después de la creación
                </p>
              </div>
            </div>
          </div>

          {/* Visual Content Section */}
          <div className="one-on-one-modal-section">
            <div className="one-on-one-modal-section-header">
              <h3 className="one-on-one-modal-section-title">Contenido Visual</h3>
              <span className="one-on-one-modal-section-badge-optional">Opcional</span>
            </div>
            <div className="one-on-one-modal-section-content">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Image Card */}
                <div className="program-config-card">
                  <div className="program-config-card-header">
                    <span className="program-config-card-label">Imagen del Programa</span>
                  </div>
                  <div className="program-config-card-content">
                    {oneOnOneProgramImagePreview ? (
                      <div className="program-config-card-image-container">
                        <img
                          src={oneOnOneProgramImagePreview}
                          alt="Programa"
                          className="program-config-card-image"
                        />
                        <div className="program-config-card-image-overlay">
                          <div className="program-config-card-image-actions">
                            <label className="edit-program-image-action-pill">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) {
                                    setOneOnOneProgramImageFile(file);
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setOneOnOneProgramImagePreview(reader.result);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                style={{ display: 'none' }}
                                disabled={isUploadingOneOnOneImage}
                              />
                              <span className="edit-program-image-action-text">
                                {isUploadingOneOnOneImage ? 'Subiendo...' : 'Cambiar'}
                              </span>
                            </label>
                            {isUploadingOneOnOneImage && (
                              <div className="edit-program-image-progress">
                                <div className="edit-program-image-progress-bar">
                                  <div 
                                    className="edit-program-image-progress-fill"
                                    style={{ width: `${oneOnOneImageUploadProgress}%` }}
                                  />
                                </div>
                                <span className="edit-program-image-progress-text">
                                  {oneOnOneImageUploadProgress}%
                                </span>
                              </div>
                            )}
                            <button
                              className="edit-program-image-action-pill edit-program-image-delete-pill"
                              onClick={() => {
                                setOneOnOneProgramImageFile(null);
                                setOneOnOneProgramImagePreview(null);
                              }}
                              disabled={isUploadingOneOnOneImage}
                            >
                              <span className="edit-program-image-action-text">Eliminar</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <label style={{ cursor: 'pointer' }}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              setOneOnOneProgramImageFile(file);
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setOneOnOneProgramImagePreview(reader.result);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          style={{ display: 'none' }}
                          disabled={isUploadingOneOnOneImage}
                        />
                        <div className="program-config-card-placeholder">
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: '8px', opacity: 0.5 }}>
                            <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span>Subir imagen</span>
                        </div>
                      </label>
                    )}
                  </div>
                </div>
                
                {/* Video Intro Card */}
                <div className="program-config-card">
                  <div className="program-config-card-header">
                    <span className="program-config-card-label">Video Intro</span>
                  </div>
                  <div className="program-config-card-content">
                    {oneOnOneIntroVideoPreview ? (
                      <>
                        <div className="program-config-card-video-container">
                          <video
                            src={oneOnOneIntroVideoPreview}
                            controls
                            className="program-config-card-video"
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          <label className="edit-program-image-action-pill">
                            <input
                              type="file"
                              accept="video/*"
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                  setOneOnOneIntroVideoFile(file);
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setOneOnOneIntroVideoPreview(reader.result);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              style={{ display: 'none' }}
                              disabled={isUploadingOneOnOneIntroVideo}
                            />
                            <span className="edit-program-image-action-text">
                              {isUploadingOneOnOneIntroVideo ? 'Subiendo...' : 'Cambiar'}
                            </span>
                          </label>
                          {isUploadingOneOnOneIntroVideo && (
                            <div className="edit-program-image-progress">
                              <div className="edit-program-image-progress-bar">
                                <div 
                                  className="edit-program-image-progress-fill"
                                  style={{ width: `${oneOnOneIntroVideoUploadProgress}%` }}
                                />
                              </div>
                              <span className="edit-program-image-progress-text">
                                {oneOnOneIntroVideoUploadProgress}%
                              </span>
                            </div>
                          )}
                          <button
                            className="edit-program-image-action-pill edit-program-image-delete-pill"
                            onClick={() => {
                              setOneOnOneIntroVideoFile(null);
                              setOneOnOneIntroVideoPreview(null);
                            }}
                            disabled={isUploadingOneOnOneIntroVideo}
                          >
                            <span className="edit-program-image-action-text">Eliminar</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <label style={{ cursor: 'pointer' }}>
                        <input
                          type="file"
                          accept="video/*"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              setOneOnOneIntroVideoFile(file);
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setOneOnOneIntroVideoPreview(reader.result);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          style={{ display: 'none' }}
                          disabled={isUploadingOneOnOneIntroVideo}
                        />
                        <div className="program-config-card-placeholder">
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: '8px', opacity: 0.5 }}>
                            <path d="M15 10L19.553 7.276C19.834 7.107 20.181 7.107 20.462 7.276C20.743 7.445 21 7.796 21 8.118V15.882C21 16.204 20.743 16.555 20.462 16.724C20.181 16.893 19.834 16.893 19.553 16.724L15 14M5 18H13C13.5304 18 14.0391 17.7893 14.4142 17.4142C14.7893 17.0391 15 16.5304 15 16V8C15 7.46957 14.7893 6.96086 14.4142 6.58579C14.0391 6.21071 13.5304 6 13 6H5C4.46957 6 3.96086 6.21071 3.58579 6.58579C3.21071 6.96086 3 7.46957 3 8V16C3 16.5304 3.21071 17.0391 3.58579 17.4142C3.96086 17.7893 4.46957 18 5 18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span>Subir video</span>
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Configuration Section */}
          <div className="one-on-one-modal-section">
            <div className="one-on-one-modal-section-header">
              <h3 className="one-on-one-modal-section-title">Configuración de Entrenamiento</h3>
              <span className="one-on-one-modal-section-badge-optional">Opcional</span>
            </div>
            <div className="one-on-one-modal-section-content">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Streak */}
                <div className="one-on-one-config-item">
                  <label className="edit-program-input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '8px' }}>
                    <span>Racha Activa</span>
                    <label className="elegant-toggle">
                      <input
                        type="checkbox"
                        checked={oneOnOneStreakEnabled}
                        onChange={(e) => setOneOnOneStreakEnabled(e.target.checked)}
                      />
                      <span className="elegant-toggle-slider"></span>
                    </label>
                  </label>
                  <p className="one-on-one-config-description">
                    Activa el sistema de rachas para motivar la consistencia en los entrenamientos
                  </p>
                  {oneOnOneStreakEnabled && (
                    <div style={{ marginTop: '12px' }}>
                      <label className="edit-program-input-label" style={{ marginBottom: '8px', display: 'block', fontSize: '13px' }}>
                        Mínimo de sesiones por semana
                      </label>
                      <Input
                        placeholder="Ej: 3"
                        value={oneOnOneMinimumSessionsPerWeek}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '');
                          setOneOnOneMinimumSessionsPerWeek(value ? parseInt(value, 10) : 0);
                        }}
                        type="text"
                        light={true}
                      />
                    </div>
                  )}
                </div>
                
                {/* Weight Suggestions */}
                <div className="one-on-one-config-item">
                  <label className="edit-program-input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '8px' }}>
                    <span>Sugerencias de Peso</span>
                    <label className="elegant-toggle">
                      <input
                        type="checkbox"
                        checked={oneOnOneWeightSuggestions}
                        onChange={(e) => setOneOnOneWeightSuggestions(e.target.checked)}
                      />
                      <span className="elegant-toggle-slider"></span>
                    </label>
                  </label>
                  <p className="one-on-one-config-description">
                    Muestra sugerencias automáticas de peso basadas en entrenamientos anteriores
                  </p>
                </div>
              </div>
              
              {/* Available Libraries */}
              <div className="edit-program-input-group" style={{ marginTop: '8px', gridColumn: '1 / -1' }}>
                <label className="edit-program-input-label">Bibliotecas Disponibles</label>
                <p className="one-on-one-field-note" style={{ marginBottom: '12px' }}>
                  Selecciona las bibliotecas de ejercicios que estarán disponibles para construir este programa
                </p>
                {oneOnOneAvailableLibraries.length === 0 ? (
                  <div className="one-on-one-empty-state">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.4, marginBottom: '8px' }}>
                      <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20M4 19.5C4 20.163 4.26339 20.7989 4.73223 21.2678C5.20107 21.7366 5.83696 22 6.5 22H20M4 19.5V9.5M20 19.5V9.5M20 19.5L18 17M4 19.5L6 17M4 9.5C4 8.83696 4.26339 8.20107 4.73223 7.73223C5.20107 7.26339 5.83696 7 6.5 7H20C20.663 7 21.2989 7.26339 21.7678 7.73223C22.2366 8.20107 22.5 8.83696 22.5 9.5V19.5C22.5 20.163 22.2366 20.7989 21.7678 21.2678C21.2989 21.7366 20.663 22 20 22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p>No tienes bibliotecas disponibles</p>
                    <p style={{ fontSize: '12px', marginTop: '4px', opacity: 0.6 }}>Crea una biblioteca primero desde la pestaña "Ejercicios"</p>
                  </div>
                ) : (
                  <div className="one-on-one-libraries-grid">
                    {oneOnOneAvailableLibraries.map((library) => {
                      const isSelected = oneOnOneSelectedLibraryIds.has(library.id);
                      return (
                        <button
                          key={library.id}
                          type="button"
                          onClick={() => handleToggleOneOnOneLibrary(library.id)}
                          className={`one-on-one-library-item ${isSelected ? 'one-on-one-library-item-selected' : ''}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                            {isSelected && (
                              <div className="one-on-one-library-check">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                            )}
                            <span>{library.title || `Biblioteca ${library.id.slice(0, 8)}`}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Create Button */}
          <div className="one-on-one-modal-actions">
            <Button
              title={createOneOnOneProgramMutation.isPending || isUploadingOneOnOneImage || isUploadingOneOnOneIntroVideo ? 'Creando...' : 'Crear Programa'}
              onClick={handleCreateOneOnOneProgram}
              disabled={!oneOnOneProgramName.trim() || !oneOnOneDiscipline || createOneOnOneProgramMutation.isPending || isUploadingOneOnOneImage || isUploadingOneOnOneIntroVideo}
              loading={createOneOnOneProgramMutation.isPending || isUploadingOneOnOneImage || isUploadingOneOnOneIntroVideo}
            />
            <p className="one-on-one-modal-help-text">
              Los campos marcados con <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span> son requeridos. Podrás agregar contenido después de crear el programa.
            </p>
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

