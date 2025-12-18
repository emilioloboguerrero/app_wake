import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import libraryService from '../services/libraryService';
import plansService from '../services/plansService';
import { getUser } from '../services/firestoreService';
import './ContentHubScreen.css';

const ContentHubScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('libraries'); // 'libraries' | 'sessions' | 'modules' | 'plans'
  
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

  // Modules management state
  const [libraryModules, setLibraryModules] = useState([]);
  const [isLoadingModules, setIsLoadingModules] = useState(false);
  const [isModuleEditMode, setIsModuleEditMode] = useState(false);
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [moduleName, setModuleName] = useState('');
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [isModuleDeleteModalOpen, setIsModuleDeleteModalOpen] = useState(false);
  const [moduleToDelete, setModuleToDelete] = useState(null);
  const [moduleDeleteConfirmation, setModuleDeleteConfirmation] = useState('');

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

  // Fetch plans
  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['plans', user?.uid],
    queryFn: async () => {
      if (!user) return [];
      return await plansService.getPlansByCreator(user.uid);
    },
    enabled: !!user,
  });

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
      } catch (err) {
        console.error('Error loading library sessions:', err);
      } finally {
        setIsLoadingSessions(false);
      }
    };

    loadSessions();
  }, [user, activeTab]);

  // Load library modules when modules tab is active
  useEffect(() => {
    const loadModules = async () => {
      if (!user || activeTab !== 'modules') {
        return;
      }

      try {
        setIsLoadingModules(true);
        const modules = await libraryService.getModuleLibrary(user.uid);
        setLibraryModules(modules);
      } catch (err) {
        console.error('Error loading library modules:', err);
      } finally {
        setIsLoadingModules(false);
      }
    };

    loadModules();
  }, [user, activeTab]);

  const tabs = [
    { 
      id: 'libraries', 
      label: 'Bibliotecas', 
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20M4 19.5C4 20.163 4.26339 20.7989 4.73223 21.2678C5.20107 21.7366 5.83696 22 6.5 22H20M4 19.5V9.5M20 19.5V9.5M20 19.5L18 17M4 19.5L6 17M4 9.5C4 8.83696 4.26339 8.20107 4.73223 7.73223C5.20107 7.26339 5.83696 7 6.5 7H20C20.663 7 21.2989 7.26339 21.7678 7.73223C22.2366 8.20107 22.5 8.83696 22.5 9.5V19.5C22.5 20.163 22.2366 20.7989 21.7678 21.2678C21.2989 21.7366 20.663 22 20 22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    { 
      id: 'plans', 
      label: 'Planes', 
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
      id: 'modules', 
      label: 'Módulos', 
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M16 21V13C16 12.4477 15.5523 12 15 12H9C8.44772 12 8 12.4477 8 13V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 7L12 2L22 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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

  // Module management handlers
  const handleOpenModuleModal = () => {
    setIsModuleModalOpen(true);
    setModuleName('');
  };

  const handleCloseModuleModal = () => {
    setIsModuleModalOpen(false);
    setModuleName('');
  };

  const handleCreateModule = async () => {
    if (!moduleName.trim() || !user) return;

    try {
      setIsCreatingModule(true);
      await libraryService.createLibraryModule(user.uid, {
        title: moduleName.trim(),
        sessionRefs: []
      });
      
      const modules = await libraryService.getModuleLibrary(user.uid);
      setLibraryModules(modules);
      handleCloseModuleModal();
    } catch (err) {
      console.error('Error creating module:', err);
      alert('Error al crear el módulo. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingModule(false);
    }
  };

  const handleDeleteModule = (module) => {
    setModuleToDelete(module);
    setIsModuleDeleteModalOpen(true);
    setModuleDeleteConfirmation('');
  };

  const handleCloseModuleDeleteModal = () => {
    setIsModuleDeleteModalOpen(false);
    setModuleToDelete(null);
    setModuleDeleteConfirmation('');
  };

  const handleConfirmDeleteModule = async () => {
    if (!moduleToDelete || !moduleDeleteConfirmation.trim() || !user) return;

    if (moduleDeleteConfirmation.trim() !== moduleToDelete.title) return;

    try {
      const usageCheck = await libraryService.checkLibraryModuleUsage(user.uid, moduleToDelete.id);
      
      if (usageCheck.inUse) {
        alert(
          `No se puede eliminar este módulo.\n\nEstá siendo usada en ${usageCheck.count} programa(s).\n\nPrimero debes eliminar o reemplazar todas las referencias en los programas.`
        );
        handleCloseModuleDeleteModal();
        return;
      }

      await libraryService.deleteLibraryModule(user.uid, moduleToDelete.id);
      const modules = await libraryService.getModuleLibrary(user.uid);
      setLibraryModules(modules);
      handleCloseModuleDeleteModal();
      
      if (modules.length === 0) {
        setIsModuleEditMode(false);
      }
    } catch (err) {
      console.error('Error deleting module:', err);
      alert(`Error al eliminar el módulo: ${err.message || 'Por favor, intenta de nuevo.'}`);
    }
  };

  const handleCreatePlan = () => {
    navigate('/plans/new');
  };

  const handleLibraryClick = (libraryId) => {
    if (!isEditMode) {
      navigate(`/libraries/${libraryId}`);
    }
  };

  const handlePlanClick = (planId) => {
    navigate(`/plans/${planId}`);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'libraries':
        return (
          <div className="content-hub-section">
            <div className="content-hub-header">
              <h2 className="content-hub-title">Bibliotecas</h2>
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
              <div className="content-hub-grid">
                {libraries.map((library) => {
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
            )}
          </div>
        );

      case 'plans':
        return (
          <div className="content-hub-section">
            <div className="content-hub-header">
              <h2 className="content-hub-title">Planes</h2>
              <button className="content-hub-create-button" onClick={handleCreatePlan}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Nuevo Plan
              </button>
            </div>

            {plansLoading ? (
              <div className="content-hub-loading">Cargando planes...</div>
            ) : plans.length === 0 ? (
              <div className="content-hub-empty">
                <svg className="content-hub-empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                </svg>
                <h3>No hay planes</h3>
                <button className="content-hub-empty-button" onClick={handleCreatePlan}>
                  Crear Plan
                </button>
              </div>
            ) : (
              <div className="content-hub-grid">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="content-hub-card"
                    onClick={() => handlePlanClick(plan.id)}
                  >
                    <div className="content-hub-card-header">
                      <div className="content-hub-card-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
              <div className="content-hub-grid">
                {librarySessions.map((session) => (
                  <div
                    key={session.id}
                    className={`content-hub-card ${isSessionEditMode ? 'content-hub-card-edit-mode' : ''}`}
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
                        {session.image_url && (
                          <div style={{ marginTop: '12px', borderRadius: '8px', overflow: 'hidden', maxWidth: '200px' }}>
                            <img src={session.image_url} alt={session.title} style={{ width: '100%', height: 'auto', display: 'block' }} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="content-hub-card-footer">
                      <span className="content-hub-card-action">Biblioteca</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'modules':
        return (
          <div className="content-hub-section">
            <div className="content-hub-header">
              <h2 className="content-hub-title">Módulos</h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {libraryModules.length > 0 && (
                  <button
                    className="content-hub-create-button"
                    onClick={() => setIsModuleEditMode(!isModuleEditMode)}
                  >
                    {isModuleEditMode ? 'Guardar' : 'Editar'}
                  </button>
                )}
                <button 
                  className={`content-hub-create-button ${isModuleEditMode ? 'content-hub-create-button-disabled' : ''}`}
                  onClick={handleOpenModuleModal}
                  disabled={isModuleEditMode}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Nuevo Módulo
                </button>
              </div>
            </div>

            {isLoadingModules ? (
              <div className="content-hub-loading">Cargando módulos...</div>
            ) : libraryModules.length === 0 ? (
              <div className="content-hub-empty">
                <svg className="content-hub-empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                  <path d="M16 21V13C16 12.4477 15.5523 12 15 12H9C8.44772 12 8 12.4477 8 13V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                  <path d="M2 7L12 2L22 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                </svg>
                <h3>No hay módulos</h3>
                <button className="content-hub-empty-button" onClick={handleOpenModuleModal}>
                  Crear Módulo
                </button>
              </div>
            ) : (
              <div className="content-hub-grid">
                {libraryModules.map((module) => {
                  const sessionCount = (module.sessionRefs || []).length;
                  return (
                    <div
                      key={module.id}
                      className={`content-hub-card ${isModuleEditMode ? 'content-hub-card-edit-mode' : ''}`}
                    >
                      {isModuleEditMode && (
                        <button
                          className="content-hub-card-delete-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteModule(module);
                          }}
                        >
                          <span className="content-hub-card-delete-icon">−</span>
                        </button>
                      )}
                      <div className="content-hub-card-header">
                        <div className="content-hub-card-icon">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M16 21V13C16 12.4477 15.5523 12 15 12H9C8.44772 12 8 12.4477 8 13V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M2 7L12 2L22 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className="content-hub-card-info">
                          <h3 className="content-hub-card-title">{module.title || 'Módulo sin nombre'}</h3>
                          <p className="content-hub-card-meta">{sessionCount} sesión{sessionCount !== 1 ? 'es' : ''}</p>
                        </div>
                      </div>
                      <div className="content-hub-card-footer">
                        <span className="content-hub-card-action">Biblioteca</span>
                      </div>
                    </div>
                  );
                })}
              </div>
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

      {/* Create Module Modal */}
      <Modal
        isOpen={isModuleModalOpen}
        onClose={handleCloseModuleModal}
        title="Nuevo Módulo"
      >
        <div className="content-hub-modal-content">
          <div className="content-hub-modal-input-group">
            <label className="content-hub-modal-label">
              Nombre del Módulo <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span>
            </label>
            <Input
              placeholder="Ej: Semana 1"
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              type="text"
              light={true}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && moduleName.trim() && !isCreatingModule) {
                  handleCreateModule();
                }
              }}
            />
          </div>
          <div className="content-hub-modal-actions">
            <Button
              title={isCreatingModule ? 'Creando...' : 'Crear Módulo'}
              onClick={handleCreateModule}
              disabled={!moduleName.trim() || isCreatingModule}
              loading={isCreatingModule}
            />
          </div>
        </div>
      </Modal>

      {/* Delete Module Modal */}
      <Modal
        isOpen={isModuleDeleteModalOpen}
        onClose={handleCloseModuleDeleteModal}
        title={moduleToDelete?.title || 'Eliminar módulo'}
      >
        <div className="content-hub-modal-content">
          <p className="content-hub-modal-text">
            Para confirmar, escribe el nombre del módulo:
          </p>
          <div className="content-hub-modal-input-group">
            <Input
              placeholder={moduleToDelete?.title || 'Nombre del módulo'}
              value={moduleDeleteConfirmation}
              onChange={(e) => setModuleDeleteConfirmation(e.target.value)}
              type="text"
              light={true}
            />
          </div>
          <div className="content-hub-modal-actions">
            <button
              className={`content-hub-delete-button ${moduleDeleteConfirmation.trim() !== moduleToDelete?.title ? 'content-hub-delete-button-disabled' : ''}`}
              onClick={handleConfirmDeleteModule}
              disabled={moduleDeleteConfirmation.trim() !== moduleToDelete?.title}
            >
              Eliminar
            </button>
          </div>
          <p className="content-hub-modal-warning">
            Esta acción es irreversible. El módulo se eliminará permanentemente.
          </p>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default ContentHubScreen;

