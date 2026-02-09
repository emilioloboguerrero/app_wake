import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import libraryService from '../services/libraryService';
import programService from '../services/programService';
import plansService from '../services/plansService';
import { getUser } from '../services/firestoreService';
import './ContentHubScreen.css';

const ContentHubScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('libraries'); // 'libraries' | 'sessions' | 'contenido' | 'programs'
  
  // Library management state
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [libraryName, setLibraryName] = useState('');
  const [isCreatingLibrary, setIsCreatingLibrary] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [libraryToDelete, setLibraryToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [creatorName, setCreatorName] = useState('');

  // Sessions management state
  const [librarySessions, setLibrarySessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isSessionEditMode, setIsSessionEditMode] = useState(false);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionImageFile, setSessionImageFile] = useState(null);
  const [sessionImagePreview, setSessionImagePreview] = useState(null);
  const [isUploadingSessionImage, setIsUploadingSessionImage] = useState(false);
  const [sessionImageUploadProgress, setSessionImageUploadProgress] = useState(0);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isSessionDeleteModalOpen, setIsSessionDeleteModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [sessionDeleteConfirmation, setSessionDeleteConfirmation] = useState('');

  // Programs management state
  const [programs, setPrograms] = useState([]);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);
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

  // Plans (Contenido) state
  const [plans, setPlans] = useState([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);

  // Fetch libraries with React Query
  const { data: libraries = [], isLoading: librariesLoading } = useQuery({
    queryKey: ['libraries', user?.uid],
    queryFn: async () => {
      if (!user) return [];
      return await libraryService.getLibrariesByCreator(user.uid);
    },
    enabled: !!user,
  });

  // Load creator name
  useEffect(() => {
    const loadCreatorName = async () => {
      if (!user) return;
      try {
        const userDoc = await getUser(user.uid);
        if (userDoc) {
          setCreatorName(userDoc.displayName || userDoc.name || user.email || '');
        }
      } catch (error) {
        console.error('Error loading creator name:', error);
      }
    };
    loadCreatorName();
  }, [user]);

  // Delete library mutation
  const deleteLibraryMutation = useMutation({
    mutationFn: async (libraryId) => {
      return await libraryService.deleteLibrary(libraryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraries', user?.uid] });
    },
  });


  // Map: librarySessionId -> plan titles (for showing which plan(s) a session belongs to)
  const [sessionIdToPlanNames, setSessionIdToPlanNames] = useState({});
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [planSearchQuery, setPlanSearchQuery] = useState('');

  // Load library sessions when sessions tab is active
  useEffect(() => {
    const loadSessions = async () => {
      if (!user || activeTab !== 'sessions') {
        return;
      }

      try {
        setIsLoadingSessions(true);
        const sessions = await libraryService.getSessionLibrary(user.uid);
        setLibrarySessions(sessions);

        const plansData = await plansService.getPlansByCreator(user.uid);
        const map = {};
        for (const plan of plansData) {
          const modules = await plansService.getModulesByPlan(plan.id);
          for (const mod of modules) {
            const planSessions = await plansService.getSessionsByModule(plan.id, mod.id);
            for (const ps of planSessions) {
              if (ps.librarySessionRef) {
                if (!map[ps.librarySessionRef]) map[ps.librarySessionRef] = [];
                if (!map[ps.librarySessionRef].includes(plan.title)) {
                  map[ps.librarySessionRef].push(plan.title || 'Plan sin nombre');
                }
              }
            }
          }
        }
        setSessionIdToPlanNames(map);
      } catch (err) {
        console.error('Error loading library sessions:', err);
      } finally {
        setIsLoadingSessions(false);
      }
    };

    loadSessions();
  }, [user, activeTab]);

  // When arriving from Programas y clientes (1-on-1 choice), open programs tab and one-on-one modal
  useEffect(() => {
    if (location.state?.openOneOnOneModal && user) {
      setActiveTab('programs');
      setIsOneOnOneModalOpen(true);
      navigate('/content', { replace: true, state: {} });
    }
  }, [location.state?.openOneOnOneModal, user, navigate]);

  // Load programs when programs tab is active
  useEffect(() => {
    const loadPrograms = async () => {
      if (!user || activeTab !== 'programs') {
        return;
      }

      try {
        setIsLoadingPrograms(true);
        const programsData = await programService.getProgramsByCreator(user.uid);
        setPrograms(programsData);
      } catch (err) {
        console.error('Error loading programs:', err);
      } finally {
        setIsLoadingPrograms(false);
      }
    };

    loadPrograms();
  }, [user, activeTab]);

  // Load plans when contenido tab is active
  useEffect(() => {
    const loadPlans = async () => {
      if (!user || activeTab !== 'contenido') {
        return;
      }

      try {
        setIsLoadingPlans(true);
        const plansData = await plansService.getPlansByCreator(user.uid);
        setPlans(plansData);
      } catch (err) {
        console.error('Error loading plans:', err);
      } finally {
        setIsLoadingPlans(false);
      }
    };

    loadPlans();
  }, [user, activeTab]);

  // Load libraries when one-on-one modal opens
  useEffect(() => {
    const loadOneOnOneLibraries = async () => {
      if (!isOneOnOneModalOpen || !user) return;
      
      try {
        const libraries = await libraryService.getLibrariesByCreator(user.uid);
        setOneOnOneAvailableLibraries(libraries);
      } catch (err) {
        console.error('Error loading libraries:', err);
      }
    };
    
    loadOneOnOneLibraries();
  }, [isOneOnOneModalOpen, user]);

  const tabs = [
    { 
      id: 'libraries', 
      label: 'Ejercicios', 
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20M4 19.5C4 20.163 4.26339 20.7989 4.73223 21.2678C5.20107 21.7366 5.83696 22 6.5 22H20M4 19.5V9.5M20 19.5V9.5M20 19.5L18 17M4 19.5L6 17M4 9.5C4 8.83696 4.26339 8.20107 4.73223 7.73223C5.20107 7.26339 5.83696 7 6.5 7H20C20.663 7 21.2989 7.26339 21.7678 7.73223C22.2366 8.20107 22.5 8.83696 22.5 9.5V19.5C22.5 20.163 22.2366 20.7989 21.7678 21.2678C21.2989 21.7366 20.663 22 20 22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    { 
      id: 'sessions', 
      label: 'Sesiones', 
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14.7519 11.1679L11.5547 9.03647C10.8901 8.59343 10 9.06982 10 9.86852V14.1315C10 14.9302 10.8901 15.4066 11.5547 14.9635L14.7519 12.8321C15.3457 12.4362 15.3457 11.5638 14.7519 11.1679Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    { 
      id: 'contenido', 
      label: 'Contenido', 
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    { 
      id: 'programs', 
      label: 'Programas', 
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
  ];

  const handleCreateLibrary = () => {
    setIsLibraryModalOpen(true);
    setLibraryName('');
  };

  const handleCloseLibraryModal = () => {
    setIsLibraryModalOpen(false);
    setLibraryName('');
  };

  const handleSubmitLibrary = async () => {
    if (!libraryName.trim() || !user || !creatorName) {
      return;
    }

    try {
      setIsCreatingLibrary(true);
      const newLibrary = await libraryService.createLibrary(user.uid, creatorName, libraryName.trim());
      queryClient.invalidateQueries({ queryKey: ['libraries', user?.uid] });
      handleCloseLibraryModal();
      // Navigate to the library exercises screen
      navigate(`/libraries/${newLibrary.id}`);
    } catch (err) {
      console.error('Error creating library:', err);
      alert('Error al crear la biblioteca. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingLibrary(false);
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

    if (deleteConfirmation.trim() !== libraryToDelete.title) {
      return;
    }

    try {
      await deleteLibraryMutation.mutateAsync(libraryToDelete.id);
      handleCloseDeleteModal();
      const updatedLibraries = await libraryService.getLibrariesByCreator(user.uid);
      if (updatedLibraries.length === 0) {
        setIsEditMode(false);
      }
    } catch (err) {
      console.error('Error deleting library:', err);
      alert('Error al eliminar la biblioteca. Por favor, intenta de nuevo.');
    }
  };

  // Session management handlers
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
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecciona un archivo de imagen válido');
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('El archivo es demasiado grande. El tamaño máximo es 10MB');
      return;
    }

    setSessionImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setSessionImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim() || !user) return;

    try {
      setIsCreatingSession(true);
      let imageUrl = null;

      if (sessionImageFile) {
        setIsUploadingSessionImage(true);
        setSessionImageUploadProgress(0);
        
        const tempSession = await libraryService.createLibrarySession(user.uid, {
          title: sessionName.trim(),
          image_url: null
        });
        
        try {
          imageUrl = await libraryService.uploadLibrarySessionImage(
            user.uid,
            tempSession.id,
            sessionImageFile,
            (progress) => setSessionImageUploadProgress(Math.round(progress))
          );
          
          await libraryService.updateLibrarySession(user.uid, tempSession.id, {
            image_url: imageUrl
          });
        } catch (uploadErr) {
          console.error('Error uploading session image:', uploadErr);
          alert('La sesión se creó, pero hubo un error al subir la imagen.');
        } finally {
          setIsUploadingSessionImage(false);
        }
      } else {
        await libraryService.createLibrarySession(user.uid, {
          title: sessionName.trim(),
          image_url: null
        });
      }
      
      const sessions = await libraryService.getSessionLibrary(user.uid);
      setLibrarySessions(sessions);
      handleCloseSessionModal();
    } catch (err) {
      console.error('Error creating session:', err);
      alert('Error al crear la sesión. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingSession(false);
      setIsUploadingSessionImage(false);
    }
  };

  const handleDeleteSession = (session) => {
    setSessionToDelete(session);
    setIsSessionDeleteModalOpen(true);
    setSessionDeleteConfirmation('');
  };

  const handleCloseSessionDeleteModal = () => {
    setIsSessionDeleteModalOpen(false);
    setSessionToDelete(null);
    setSessionDeleteConfirmation('');
  };

  const handleConfirmDeleteSession = async () => {
    if (!sessionToDelete || !sessionDeleteConfirmation.trim() || !user) return;

    if (sessionDeleteConfirmation.trim() !== sessionToDelete.title) return;

    try {
      const usageCheck = await libraryService.checkLibrarySessionUsage(user.uid, sessionToDelete.id);
      
      if (usageCheck.inUse) {
        alert(
          `No se puede eliminar esta sesión.\n\nEstá siendo usada en ${usageCheck.count} programa(s).\n\nPrimero debes eliminar o reemplazar todas las referencias en los programas.`
        );
        handleCloseSessionDeleteModal();
        return;
      }

      await libraryService.deleteLibrarySession(user.uid, sessionToDelete.id);
      const sessions = await libraryService.getSessionLibrary(user.uid);
      setLibrarySessions(sessions);
      handleCloseSessionDeleteModal();
      
      if (sessions.length === 0) {
        setIsSessionEditMode(false);
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      alert(`Error al eliminar la sesión: ${err.message || 'Por favor, intenta de nuevo.'}`);
    }
  };

  const handleLibraryClick = (libraryId) => {
    if (!isEditMode) {
      navigate(`/libraries/${libraryId}`);
    }
  };

  const handlePlanClick = (planId) => {
    navigate(`/plans/${planId}`);
  };

  // Program management handlers
  const handleDeleteProgram = (program) => {
    setProgramToDelete(program);
    setIsProgramDeleteModalOpen(true);
    setDeleteProgramConfirmation('');
  };

  const handleCloseProgramDeleteModal = () => {
    setIsProgramDeleteModalOpen(false);
    setProgramToDelete(null);
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
      const programsData = await programService.getProgramsByCreator(user.uid);
      setPrograms(programsData);
      handleCloseProgramDeleteModal();
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
    setOneOnOneSelectedLibraryIds(new Set());
  };

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

  const handleCreateOneOnOneProgram = async () => {
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
      const defaultTutorials = {
        dailyWorkout: [],
        workoutCompletion: [],
        workoutExecution: []
      };
      
      const programData = {
        title: oneOnOneProgramName.trim(),
        description: oneOnOneProgramDescription.trim() || '',
        discipline: oneOnOneDiscipline,
        programType: null,
        deliveryType: 'one_on_one',
        status: 'draft',
        price: null,
        freeTrialActive: false,
        freeTrialDurationDays: 0,
        duration: null,
        streakEnabled: oneOnOneStreakEnabled,
        minimumSessionsPerWeek: oneOnOneStreakEnabled ? parseInt(oneOnOneMinimumSessionsPerWeek || '0', 10) : 0,
        weightSuggestions: oneOnOneWeightSuggestions,
        availableLibraries: Array.from(oneOnOneSelectedLibraryIds),
        tutorials: defaultTutorials,
      };
      
      const newProgram = await programService.createProgram(user.uid, creatorName, programData);
      
      if (oneOnOneProgramImageFile && newProgram?.id) {
        try {
          setIsUploadingOneOnOneImage(true);
          setOneOnOneImageUploadProgress(0);
          await programService.uploadProgramImage(
            newProgram.id,
            oneOnOneProgramImageFile,
            (progress) => setOneOnOneImageUploadProgress(Math.round(progress))
          );
        } catch (uploadErr) {
          console.error('Error uploading image:', uploadErr);
          alert(`Error al subir la imagen: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`);
        } finally {
          setIsUploadingOneOnOneImage(false);
        }
      }
      
      if (oneOnOneIntroVideoFile && newProgram?.id) {
        try {
          setIsUploadingOneOnOneIntroVideo(true);
          setOneOnOneIntroVideoUploadProgress(0);
          const introVideoUrl = await programService.uploadProgramIntroVideo(
            newProgram.id,
            oneOnOneIntroVideoFile,
            (progress) => setOneOnOneIntroVideoUploadProgress(Math.round(progress))
          );
          await programService.updateProgram(newProgram.id, {
            video_intro_url: introVideoUrl
          });
        } catch (uploadErr) {
          console.error('Error uploading intro video:', uploadErr);
          alert(`Error al subir el video intro: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`);
        } finally {
          setIsUploadingOneOnOneIntroVideo(false);
        }
      }
      
      handleCloseOneOnOneModal();
      const programsData = await programService.getProgramsByCreator(user.uid);
      setPrograms(programsData);
      
      if (newProgram?.id && !newProgram.id.startsWith('temp-')) {
        navigate(`/programs/${newProgram.id}`);
      }
    } catch (err) {
      console.error('Error creating one-on-one program:', err);
      alert(`Error al crear el programa: ${err.message || 'Por favor, intenta de nuevo.'}`);
    }
  };

  const handleProgramClick = (programId) => {
    navigate(`/programs/${programId}`);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'libraries':
        return (
          <div className="content-hub-section">
            <div className="content-hub-header">
              <h2 className="content-hub-title">Ejercicios</h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {libraries.length > 0 && (
                  <button
                    className="content-hub-create-button"
                    onClick={handleEditLibraries}
                  >
                    {isEditMode ? 'Guardar' : 'Editar'}
                  </button>
                )}
                <button 
                  className={`content-hub-create-button ${isEditMode ? 'content-hub-create-button-disabled' : ''}`}
                  onClick={handleCreateLibrary}
                  disabled={isEditMode}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Nueva Biblioteca
                </button>
              </div>
            </div>

            {librariesLoading ? (
              <div className="content-hub-loading">Cargando bibliotecas...</div>
            ) : libraries.length === 0 ? (
              <div className="content-hub-empty">
                <svg className="content-hub-empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20M4 19.5C4 20.163 4.26339 20.7989 4.73223 21.2678C5.20107 21.7366 5.83696 22 6.5 22H20M4 19.5V9.5M20 19.5V9.5M20 19.5L18 17M4 19.5L6 17M4 9.5C4 8.83696 4.26339 8.20107 4.73223 7.73223C5.20107 7.26339 5.83696 7 6.5 7H20C20.663 7 21.2989 7.26339 21.7678 7.73223C22.2366 8.20107 22.5 8.83696 22.5 9.5V19.5C22.5 20.163 22.2366 20.7989 21.7678 21.2678C21.2989 21.7366 20.663 22 20 22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                </svg>
                <h3>No hay bibliotecas</h3>
                <button className="content-hub-empty-button" onClick={handleCreateLibrary}>
                  Crear Biblioteca
                </button>
              </div>
            ) : (
              <>
                <div className="content-hub-search-bar" style={{ marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
                  <Input
                    placeholder="Buscar bibliotecas..."
                    value={librarySearchQuery}
                    onChange={(e) => setLibrarySearchQuery(e.target.value)}
                    type="text"
                    light={true}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button type="button" className="content-hub-create-button" onClick={() => {}}>
                    Filtrar
                  </button>
                </div>
                <div className="content-hub-grid">
                {libraries
                  .filter((library) => {
                    const q = librarySearchQuery.trim().toLowerCase();
                    if (!q) return true;
                    const title = (library.title || '').toLowerCase();
                    return title.includes(q);
                  })
                  .map((library) => {
                  const exerciseCount = libraryService.getExerciseCount(library);
                  return (
                    <div
                      key={library.id}
                      className={`content-hub-card ${isEditMode ? 'content-hub-card-edit-mode' : ''}`}
                      onClick={() => {
                        if (!isEditMode) {
                          handleLibraryClick(library.id);
                        }
                      }}
                    >
                      {isEditMode && (
                        <button
                          className="content-hub-card-delete-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLibrary(library);
                          }}
                        >
                          <span className="content-hub-card-delete-icon">−</span>
                        </button>
                      )}
                      <div className="content-hub-card-header">
                        <div className="content-hub-card-icon">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20M4 19.5C4 20.163 4.26339 20.7989 4.73223 21.2678C5.20107 21.7366 5.83696 22 6.5 22H20M4 19.5V9.5M20 19.5V9.5M20 19.5L18 17M4 19.5L6 17M4 9.5C4 8.83696 4.26339 8.20107 4.73223 7.73223C5.20107 7.26339 5.83696 7 6.5 7H20C20.663 7 21.2989 7.26339 21.7678 7.73223C22.2366 8.20107 22.5 8.83696 22.5 9.5V19.5C22.5 20.163 22.2366 20.7989 21.7678 21.2678C21.2989 21.7366 20.663 22 20 22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className="content-hub-card-info">
                          <h3 className="content-hub-card-title">{library.title || 'Biblioteca sin nombre'}</h3>
                          <p className="content-hub-card-meta">{exerciseCount} ejercicio{exerciseCount !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="content-hub-card-footer">
                        <span className="content-hub-card-action">Gestionar</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>
        );

      case 'contenido':
        return (
          <div className="content-hub-section">
            <div className="content-hub-header">
              <h2 className="content-hub-title">Contenido (Planes)</h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                  className="content-hub-create-button"
                  onClick={() => navigate('/plans/new')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Nuevo plan
                </button>
              </div>
            </div>

            {isLoadingPlans ? (
              <div className="content-hub-loading">Cargando planes...</div>
            ) : plans.length === 0 ? (
              <div className="content-hub-empty">
                <svg className="content-hub-empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" opacity="0.3">
                  <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <h3>No hay planes</h3>
                <p className="content-hub-empty-description" style={{ marginTop: 8, marginBottom: 16, opacity: 0.7, fontSize: 14 }}>
                  Crea planes de contenido (semanas, sesiones, ejercicios) para asignar a programas 1-on-1 y low-ticket.
                </p>
                <button className="content-hub-empty-button" onClick={() => navigate('/plans/new')}>
                  Crear plan
                </button>
              </div>
            ) : (
              <>
                <div className="content-hub-search-bar" style={{ marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
                  <Input
                    placeholder="Buscar planes..."
                    value={planSearchQuery}
                    onChange={(e) => setPlanSearchQuery(e.target.value)}
                    type="text"
                    light={true}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button type="button" className="content-hub-create-button" onClick={() => {}}>
                    Filtrar
                  </button>
                </div>
                <div className="content-hub-grid">
                {plans
                  .filter((plan) => {
                    const q = planSearchQuery.trim().toLowerCase();
                    if (!q) return true;
                    const title = (plan.title || '').toLowerCase();
                    const desc = (plan.description || '').toLowerCase();
                    const discipline = (plan.discipline || '').toLowerCase();
                    return title.includes(q) || desc.includes(q) || discipline.includes(q);
                  })
                  .map((plan) => (
                  <div
                    key={plan.id}
                    className="content-hub-card"
                    onClick={() => handlePlanClick(plan.id)}
                  >
                    <div className="content-hub-card-header">
                      <div className="content-hub-card-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="content-hub-card-info">
                        <h3 className="content-hub-card-title">{plan.title || 'Plan sin nombre'}</h3>
                        {plan.description && (
                          <p className="content-hub-card-description">{plan.description}</p>
                        )}
                        {plan.discipline && (
                          <p className="content-hub-card-meta">{plan.discipline}</p>
                        )}
                      </div>
                    </div>
                    <div className="content-hub-card-footer">
                      <span className="content-hub-card-action">Gestionar</span>
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </div>
        );

      case 'programs':
        return (
          <div className="content-hub-section">
            <div className="content-hub-header">
              <h2 className="content-hub-title">Programas</h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {programs.length > 0 && (
                  <button
                    className="content-hub-create-button"
                    onClick={() => setIsProgramEditMode(!isProgramEditMode)}
                  >
                    {isProgramEditMode ? 'Guardar' : 'Editar'}
                  </button>
                )}
                <button 
                  className={`content-hub-create-button ${isProgramEditMode ? 'content-hub-create-button-disabled' : ''}`}
                  onClick={() => setIsProgramTypeSelectionModalOpen(true)}
                  disabled={isProgramEditMode}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Nuevo Programa
                </button>
              </div>
            </div>

            {isLoadingPrograms ? (
              <div className="content-hub-loading">Cargando programas...</div>
            ) : programs.length === 0 ? (
              <div className="content-hub-empty">
                <svg className="content-hub-empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                </svg>
                <h3>No hay programas</h3>
                <button className="content-hub-empty-button" onClick={() => setIsProgramTypeSelectionModalOpen(true)}>
                  Crear Programa
                </button>
              </div>
            ) : (
              <div className="content-hub-grid">
                {programs.map((program) => {
                  const weekCount = program.modules?.length || 0;
                  return (
                    <div
                      key={program.id}
                      className={`content-hub-card ${isProgramEditMode ? 'content-hub-card-edit-mode' : ''}`}
                      onClick={() => {
                        if (!isProgramEditMode) {
                          handleProgramClick(program.id);
                        }
                      }}
                    >
                      {isProgramEditMode && (
                        <button
                          className="content-hub-card-delete-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProgram(program);
                          }}
                        >
                          <span className="content-hub-card-delete-icon">−</span>
                        </button>
                      )}
                      {program.image_url ? (
                        <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                          <img 
                            src={program.image_url} 
                            alt={program.title || 'Programa'} 
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)', padding: '16px' }}>
                            <h3 className="content-hub-card-title" style={{ color: 'white', margin: 0 }}>
                              {program.title || 'Programa sin nombre'}
                            </h3>
                          </div>
                        </div>
                      ) : (
                        <div className="content-hub-card-header">
                          <div className="content-hub-card-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div className="content-hub-card-info">
                            <h3 className="content-hub-card-title">{program.title || 'Programa sin nombre'}</h3>
                            {program.description && (
                              <p className="content-hub-card-description">{program.description}</p>
                            )}
                            {program.discipline && (
                              <p className="content-hub-card-meta">{program.discipline}</p>
                            )}
                          </div>
                        </div>
                      )}
                      {(weekCount > 0 || program.discipline) && (
                        <div className="content-hub-card-footer">
                          {weekCount > 0 && (
                            <span className="content-hub-card-meta">
                              {weekCount} {weekCount === 1 ? 'semana' : 'semanas'}
                            </span>
                          )}
                          <span className="content-hub-card-action">Gestionar</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'sessions':
        return (
          <div className="content-hub-section">
            <div className="content-hub-header">
              <h2 className="content-hub-title">Sesiones</h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {librarySessions.length > 0 && (
                  <button
                    className="content-hub-create-button"
                    onClick={() => setIsSessionEditMode(!isSessionEditMode)}
                  >
                    {isSessionEditMode ? 'Guardar' : 'Editar'}
                  </button>
                )}
                <button 
                  className={`content-hub-create-button ${isSessionEditMode ? 'content-hub-create-button-disabled' : ''}`}
                  onClick={handleOpenSessionModal}
                  disabled={isSessionEditMode}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Nueva Sesión
                </button>
              </div>
            </div>

            {isLoadingSessions ? (
              <div className="content-hub-loading">Cargando sesiones...</div>
            ) : librarySessions.length === 0 ? (
              <div className="content-hub-empty">
                <svg className="content-hub-empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14.7519 11.1679L11.5547 9.03647C10.8901 8.59343 10 9.06982 10 9.86852V14.1315C10 14.9302 10.8901 15.4066 11.5547 14.9635L14.7519 12.8321C15.3457 12.4362 15.3457 11.5638 14.7519 11.1679Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                  <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                </svg>
                <h3>No hay sesiones</h3>
                <button className="content-hub-empty-button" onClick={handleOpenSessionModal}>
                  Crear Sesión
                </button>
              </div>
            ) : (
              <>
                <div className="content-hub-sessions-search" style={{ marginBottom: 24, display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
                  <Input
                    placeholder="Buscar sesiones..."
                    value={sessionSearchQuery}
                    onChange={(e) => setSessionSearchQuery(e.target.value)}
                    type="text"
                    light={true}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button
                    type="button"
                    className="content-hub-create-button"
                    onClick={() => {}}
                  >
                    Filtrar
                  </button>
                </div>
                <div className="content-hub-grid content-hub-grid--sessions">
                {librarySessions
                  .filter((session) => {
                    const q = sessionSearchQuery.trim().toLowerCase();
                    if (!q) return true;
                    const title = (session.title || '').toLowerCase();
                    const planNames = (sessionIdToPlanNames[session.id] || []).join(' ').toLowerCase();
                    return title.includes(q) || planNames.includes(q);
                  })
                  .map((session) => (
                  <div
                    key={session.id}
                    className={`content-hub-card content-hub-card--session ${isSessionEditMode ? 'content-hub-card-edit-mode' : ''}`}
                    onClick={() => {
                      if (!isSessionEditMode) {
                        navigate(`/content/sessions/${session.id}`);
                      }
                    }}
                  >
                    {isSessionEditMode && (
                      <button
                        className="content-hub-card-delete-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session);
                        }}
                      >
                        <span className="content-hub-card-delete-icon">−</span>
                      </button>
                    )}
                    <div className="content-hub-card-header">
                      <div className="content-hub-card-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M14.7519 11.1679L11.5547 9.03647C10.8901 8.59343 10 9.06982 10 9.86852V14.1315C10 14.9302 10.8901 15.4066 11.5547 14.9635L14.7519 12.8321C15.3457 12.4362 15.3457 11.5638 14.7519 11.1679Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="content-hub-card-info">
                        <h3 className="content-hub-card-title">{session.title || 'Sesión sin nombre'}</h3>
                        {sessionIdToPlanNames[session.id]?.length > 0 && (
                          <p className="content-hub-card-meta" style={{ opacity:1, marginTop: 4, marginBottom: 0 }}>
                            ({sessionIdToPlanNames[session.id].join(', ')})
                          </p>
                        )}
                        {session.image_url && (
                          <div style={{ marginTop: '12px', borderRadius: '8px', overflow: 'hidden', maxWidth: '200px' }}>
                            <img src={session.image_url} alt={session.title} style={{ width: '100%', height: 'auto', display: 'block' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardLayout screenName="Contenido">
      <div className="content-hub-screen">
        <div className="content-hub-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`content-hub-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <div className="content-hub-tab-icon">{tab.icon}</div>
              <span className="content-hub-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="content-hub-content">
          {renderContent()}
        </div>
      </div>

      {/* Create Library Modal */}
      <Modal
        isOpen={isLibraryModalOpen}
        onClose={handleCloseLibraryModal}
        title="Nueva Biblioteca"
      >
        <div className="content-hub-modal-content">
          <div className="content-hub-modal-input-group">
            <label className="content-hub-modal-label">
              Nombre de la Biblioteca <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span>
            </label>
            <Input
              placeholder="Ej: Ejercicios de Fuerza"
              value={libraryName}
              onChange={(e) => setLibraryName(e.target.value)}
              type="text"
              light={true}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && libraryName.trim()) {
                  handleSubmitLibrary();
                }
              }}
            />
          </div>
          <div className="content-hub-modal-actions">
            <Button
              title={isCreatingLibrary ? 'Creando...' : 'Crear Biblioteca'}
              onClick={handleSubmitLibrary}
              disabled={!libraryName.trim() || isCreatingLibrary}
              loading={isCreatingLibrary}
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
        <div className="content-hub-modal-content">
          <p className="content-hub-modal-text">
            Para confirmar, escribe el nombre de la biblioteca:
          </p>
          <div className="content-hub-modal-input-group">
            <Input
              placeholder={libraryToDelete?.title || 'Nombre de la biblioteca'}
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              type="text"
              light={true}
            />
          </div>
          <div className="content-hub-modal-actions">
            <button
              className={`content-hub-delete-button ${deleteConfirmation.trim() !== libraryToDelete?.title ? 'content-hub-delete-button-disabled' : ''}`}
              onClick={handleConfirmDelete}
              disabled={deleteConfirmation.trim() !== libraryToDelete?.title || deleteLibraryMutation.isPending}
            >
              {deleteLibraryMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="content-hub-modal-warning">
            Esta acción es irreversible. La biblioteca se eliminará permanentemente.
          </p>
        </div>
      </Modal>

      {/* Create Session Modal */}
      <Modal
        isOpen={isSessionModalOpen}
        onClose={handleCloseSessionModal}
        title="Nueva Sesión"
      >
        <div className="content-hub-modal-content">
          <div className="content-hub-modal-input-group">
            <label className="content-hub-modal-label">
              Nombre de la Sesión <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span>
            </label>
            <Input
              placeholder="Ej: Día 1 - Piernas"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              type="text"
              light={true}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && sessionName.trim() && !isCreatingSession) {
                  handleCreateSession();
                }
              }}
            />
          </div>
          <div className="content-hub-modal-input-group">
            <label className="content-hub-modal-label">Imagen (opcional)</label>
            {sessionImagePreview ? (
              <div style={{ marginTop: '8px', position: 'relative', display: 'inline-block' }}>
                <img 
                  src={sessionImagePreview} 
                  alt="Preview" 
                  style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }}
                />
                <button
                  onClick={() => {
                    setSessionImageFile(null);
                    setSessionImagePreview(null);
                  }}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <label
                style={{
                  display: 'block',
                  marginTop: '8px',
                  padding: '12px',
                  border: '1px dashed rgba(255, 255, 255, 0.3)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.7)'
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSessionImageUpload}
                  disabled={isUploadingSessionImage || isCreatingSession}
                  style={{ display: 'none' }}
                />
                {isUploadingSessionImage ? `Subiendo... ${sessionImageUploadProgress}%` : 'Subir imagen'}
              </label>
            )}
          </div>
          <div className="content-hub-modal-actions">
            <Button
              title={isCreatingSession ? 'Creando...' : 'Crear Sesión'}
              onClick={handleCreateSession}
              disabled={!sessionName.trim() || isCreatingSession}
              loading={isCreatingSession}
            />
          </div>
        </div>
      </Modal>

      {/* Delete Session Modal */}
      <Modal
        isOpen={isSessionDeleteModalOpen}
        onClose={handleCloseSessionDeleteModal}
        title={sessionToDelete?.title || 'Eliminar sesión'}
      >
        <div className="content-hub-modal-content">
          <p className="content-hub-modal-text">
            Para confirmar, escribe el nombre de la sesión:
          </p>
          <div className="content-hub-modal-input-group">
            <Input
              placeholder={sessionToDelete?.title || 'Nombre de la sesión'}
              value={sessionDeleteConfirmation}
              onChange={(e) => setSessionDeleteConfirmation(e.target.value)}
              type="text"
              light={true}
            />
          </div>
          <div className="content-hub-modal-actions">
            <button
              className={`content-hub-delete-button ${sessionDeleteConfirmation.trim() !== sessionToDelete?.title ? 'content-hub-delete-button-disabled' : ''}`}
              onClick={handleConfirmDeleteSession}
              disabled={sessionDeleteConfirmation.trim() !== sessionToDelete?.title}
            >
              Eliminar
            </button>
          </div>
          <p className="content-hub-modal-warning">
            Esta acción es irreversible. La sesión se eliminará permanentemente.
          </p>
        </div>
      </Modal>

      {/* Program Type Selection Modal */}
      <Modal
        isOpen={isProgramTypeSelectionModalOpen}
        onClose={() => setIsProgramTypeSelectionModalOpen(false)}
        title="Tipo de programa"
      >
        <div className="content-hub-modal-content">
          <p className="content-hub-modal-text" style={{ marginBottom: '24px' }}>
            Selecciona el tipo de programa que deseas crear:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button
              className="content-hub-create-button"
              onClick={() => {
                setIsProgramTypeSelectionModalOpen(false);
                navigate('/programs?autoCreate=true');
              }}
              style={{ width: '100%', justifyContent: 'flex-start', padding: '16px' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '12px' }}>
                <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>Low-ticket</span>
                <span style={{ fontSize: '13px', opacity: 0.7, marginTop: '4px' }}>Programas generales y escalables para múltiples usuarios</span>
              </div>
            </button>
            <button
              className="content-hub-create-button"
              onClick={() => {
                setIsProgramTypeSelectionModalOpen(false);
                setIsOneOnOneModalOpen(true);
              }}
              style={{ width: '100%', justifyContent: 'flex-start', padding: '16px' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '12px' }}>
                <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: '15px' }}>1-on-1</span>
                <span style={{ fontSize: '13px', opacity: 0.7, marginTop: '4px' }}>Programas personalizados para clientes individuales</span>
              </div>
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Program Modal */}
      <Modal
        isOpen={isProgramDeleteModalOpen}
        onClose={handleCloseProgramDeleteModal}
        title={programToDelete?.title || 'Eliminar programa'}
      >
        <div className="content-hub-modal-content">
          <p className="content-hub-modal-text">
            Para confirmar, escribe el nombre del programa:
          </p>
          <div className="content-hub-modal-input-group">
            <Input
              placeholder={programToDelete?.title || 'Nombre del programa'}
              value={deleteProgramConfirmation}
              onChange={(e) => setDeleteProgramConfirmation(e.target.value)}
              type="text"
              light={true}
            />
          </div>
          <div className="content-hub-modal-actions">
            <button
              className={`content-hub-delete-button ${deleteProgramConfirmation.trim() !== programToDelete?.title ? 'content-hub-delete-button-disabled' : ''}`}
              onClick={handleConfirmDeleteProgram}
              disabled={deleteProgramConfirmation.trim() !== programToDelete?.title || isDeletingProgram}
            >
              {isDeletingProgram ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="content-hub-modal-warning">
            Esta acción es irreversible. Todos los datos del programa se eliminarán permanentemente.
          </p>
        </div>
      </Modal>

      {/* One-on-One Program Modal - Simplified version for ContentHubScreen */}
      <Modal
        isOpen={isOneOnOneModalOpen}
        onClose={handleCloseOneOnOneModal}
        title="Nuevo programa 1-on-1"
      >
        <div className="content-hub-modal-content" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
          <div className="content-hub-modal-input-group">
            <label className="content-hub-modal-label">
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
          
          <div className="content-hub-modal-input-group">
            <label className="content-hub-modal-label">Descripción</label>
            <textarea
              value={oneOnOneProgramDescription}
              onChange={(e) => setOneOnOneProgramDescription(e.target.value)}
              placeholder="Describe el objetivo y características de este programa personalizado..."
              rows={4}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'rgba(255, 255, 255, 0.9)',
                fontFamily: 'inherit',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
          </div>
          
          <div className="content-hub-modal-input-group">
            <label className="content-hub-modal-label">
              Disciplina <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span>
            </label>
            <select
              value={oneOnOneDiscipline}
              onChange={(e) => setOneOnOneDiscipline(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'rgba(255, 255, 255, 0.9)',
                fontFamily: 'inherit',
                fontSize: '14px'
              }}
            >
              <option value="Fuerza - hipertrofia">Fuerza - hipertrofia</option>
            </select>
            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '4px' }}>
              Esta opción no se puede cambiar después de la creación
            </p>
          </div>

          <div className="content-hub-modal-input-group">
            <label className="content-hub-modal-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Racha Activa</span>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={oneOnOneStreakEnabled}
                  onChange={(e) => setOneOnOneStreakEnabled(e.target.checked)}
                  style={{ width: '40px', height: '20px', cursor: 'pointer' }}
                />
              </label>
            </label>
            {oneOnOneStreakEnabled && (
              <Input
                placeholder="Ej: 3"
                value={oneOnOneMinimumSessionsPerWeek}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setOneOnOneMinimumSessionsPerWeek(value ? parseInt(value, 10) : 0);
                }}
                type="text"
                light={true}
                style={{ marginTop: '8px' }}
              />
            )}
          </div>

          <div className="content-hub-modal-input-group">
            <label className="content-hub-modal-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Sugerencias de Peso</span>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={oneOnOneWeightSuggestions}
                  onChange={(e) => setOneOnOneWeightSuggestions(e.target.checked)}
                  style={{ width: '40px', height: '20px', cursor: 'pointer' }}
                />
              </label>
            </label>
          </div>

          {oneOnOneAvailableLibraries.length > 0 && (
            <div className="content-hub-modal-input-group">
              <label className="content-hub-modal-label">Bibliotecas Disponibles</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {oneOnOneAvailableLibraries.map((library) => {
                  const isSelected = oneOnOneSelectedLibraryIds.has(library.id);
                  return (
                    <button
                      key={library.id}
                      type="button"
                      onClick={() => handleToggleOneOnOneLibrary(library.id)}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        backgroundColor: isSelected ? 'rgba(191, 168, 77, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${isSelected ? 'rgba(191, 168, 77, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
                        color: 'rgba(255, 255, 255, 0.9)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}
                    >
                      {isSelected && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                      <span>{library.title || `Biblioteca ${library.id.slice(0, 8)}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="content-hub-modal-actions">
            <Button
              title={isUploadingOneOnOneImage || isUploadingOneOnOneIntroVideo ? 'Creando...' : 'Crear Programa'}
              onClick={handleCreateOneOnOneProgram}
              disabled={!oneOnOneProgramName.trim() || !oneOnOneDiscipline || isUploadingOneOnOneImage || isUploadingOneOnOneIntroVideo}
              loading={isUploadingOneOnOneImage || isUploadingOneOnOneIntroVideo}
            />
          </div>
          <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '16px', textAlign: 'center' }}>
            Los campos marcados con <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span> son requeridos. Podrás agregar contenido después de crear el programa.
          </p>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default ContentHubScreen;

