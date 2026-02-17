import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import MediaPickerModal from '../components/MediaPickerModal';
import Input from '../components/Input';
import Button from '../components/Button';
import programService from '../services/programService';
import libraryService from '../services/libraryService';
import { getUser } from '../services/firestoreService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import './ProgramsScreen.css';

const TUTORIAL_SCREENS = [
  { key: 'dailyWorkout', label: 'Entrenamiento diario' },
  { key: 'workoutExecution', label: 'Ejecución del entrenamiento' },
  { key: 'workoutCompletion', label: 'Completar entrenamiento' },
  { key: 'warmup', label: 'Calentamiento' },
];

const ProgramsScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [isProgramTypeSelectionModalOpen, setIsProgramTypeSelectionModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPage, setModalPage] = useState('general'); // 'general' | 'configuracion'
  const [programName, setProgramName] = useState('');
  const [programDescription, setProgramDescription] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [programToDelete, setProgramToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  
  // General page fields
  const [discipline, setDiscipline] = useState('Fuerza - hipertrofia');
  const [programType, setProgramType] = useState('subscription'); // 'subscription' | 'one-time'
                  // NEW: delivery type – how the program is sold/used
                  // 'low_ticket' → general scalable programs (contains modules/sessions/exercises)
                  // 'one_on_one' → programs are containers/bins for organizing clients (content is in Plans, not here)
                  const [deliveryType, setDeliveryType] = useState('low_ticket');
  const [duration, setDuration] = useState(1); // Duration in weeks
  const [price, setPrice] = useState('');
  const [programImageFile, setProgramImageFile] = useState(null);
  const [programImagePreview, setProgramImagePreview] = useState(null);
  const [programImageUrlFromLibrary, setProgramImageUrlFromLibrary] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [introVideoFile, setIntroVideoFile] = useState(null);
  const [introVideoPreview, setIntroVideoPreview] = useState(null);
  const [isUploadingIntroVideo, setIsUploadingIntroVideo] = useState(false);
  const [introVideoUploadProgress, setIntroVideoUploadProgress] = useState(0);
  
  // Configuración page fields
  const [freeTrialActive, setFreeTrialActive] = useState(false);
  const [freeTrialDurationDays, setFreeTrialDurationDays] = useState('0');
  const [streakEnabled, setStreakEnabled] = useState(false);
  const [minimumSessionsPerWeek, setMinimumSessionsPerWeek] = useState(0);
  const [weightSuggestions, setWeightSuggestions] = useState(false);
  const [availableLibraries, setAvailableLibraries] = useState([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState(new Set());
  const [tutorials, setTutorials] = useState({});
  // Optional tutorial video per screen (File or null)
  const [tutorialFiles, setTutorialFiles] = useState({
    dailyWorkout: null,
    workoutExecution: null,
    workoutCompletion: null,
    warmup: null,
  });
  const [isUploadingTutorials, setIsUploadingTutorials] = useState(false);

  // Load programs with React Query (cached)
  const { data: programs = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: user ? queryKeys.programs.byCreator(user.uid) : ['programs', 'none'],
    queryFn: async () => {
      if (!user) return [];
      return await programService.getProgramsByCreator(user.uid);
    },
    enabled: !!user,
    ...cacheConfig.otherPrograms,
  });

  // Load creator name
  const { data: userDoc } = useQuery({
    queryKey: user ? queryKeys.user.detail(user.uid) : ['user', 'none'],
    queryFn: async () => {
      if (!user) return null;
      return await getUser(user.uid);
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    select: (data) => {
      if (!data) return '';
      return data.displayName || data.name || user?.email || '';
    },
  });

  useEffect(() => {
    if (userDoc) {
      setCreatorName(userDoc);
    }
  }, [userDoc]);

  const handleMediaPickerSelect = (item) => {
    setProgramImagePreview(item.url);
    setProgramImageFile(null);
    setProgramImageUrlFromLibrary(item.url);
    setIsMediaPickerOpen(false);
  };

  // Check for autoCreate parameter (from Contenido) and open modal if present
  useEffect(() => {
    const autoCreate = searchParams.get('autoCreate');
    if (autoCreate === 'true' && user) {
      setDeliveryType('low_ticket');
      setIsModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, user, setSearchParams]);

  // When arriving at /products/new?type=low_ticket (from Programas y clientes), open create modal
  useEffect(() => {
    if (location.pathname === '/products/new' && searchParams.get('type') === 'low_ticket' && user) {
      setDeliveryType('low_ticket');
      setIsModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [location.pathname, searchParams, user, setSearchParams]);

  // When arriving at /products/new?type=one_on_one, open create modal for general program (bucket)
  useEffect(() => {
    if (location.pathname === '/products/new' && searchParams.get('type') === 'one_on_one' && user) {
      setDeliveryType('one_on_one');
      setIsModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [location.pathname, searchParams, user, setSearchParams]);

  // Load libraries when modal opens
  useEffect(() => {
    const loadLibraries = async () => {
      if (isModalOpen && user) {
        try {
          const libraries = await libraryService.getLibrariesByCreator(user.uid);
          setAvailableLibraries(libraries);
        } catch (error) {
          console.error('Error loading libraries:', error);
        }
      }
    };
    loadLibraries();
  }, [isModalOpen, user]);

  // Create program mutation with optimistic update
  const createProgramMutation = useMutation({
    mutationFn: async ({ creatorId, creatorName, programData }) => {
      return await programService.createProgram(creatorId, creatorName, programData);
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.programs.byCreator(variables.creatorId) });

      // Snapshot previous value
      const previousPrograms = queryClient.getQueryData(queryKeys.programs.byCreator(variables.creatorId)) || [];

      // Optimistically update
      const tempId = `temp-${Date.now()}`;
      const access_duration = variables.programData.programType === 'subscription' ? 'monthly' : 'yearly';
      const currentYear = new Date().getFullYear();
      const version = `${currentYear}-01`;
      const now = new Date();
      const optimisticProgram = {
        id: tempId,
        creator_id: variables.creatorId,
        creatorName: variables.creatorName,
        title: variables.programData.title,
        description: variables.programData.description,
        discipline: variables.programData.discipline,
        access_duration: access_duration,
        status: variables.programData.status || 'draft',
        version: version,
        created_at: now,
        last_update: now,
        updated_at: now,
      };

      queryClient.setQueryData(queryKeys.programs.byCreator(variables.creatorId), [
        ...previousPrograms,
        optimisticProgram,
      ]);

      return { previousPrograms, tempId };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousPrograms) {
        queryClient.setQueryData(
          queryKeys.programs.byCreator(variables.creatorId),
          context.previousPrograms
        );
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate to refetch with real data
      queryClient.invalidateQueries({ queryKey: queryKeys.programs.byCreator(variables.creatorId) });
    },
  });

  // Delete program mutation with optimistic update
  const deleteProgramMutation = useMutation({
    mutationFn: async ({ programId }) => {
      return await programService.deleteProgram(programId);
    },
    onMutate: async (variables) => {
      if (!user) return;

      await queryClient.cancelQueries({ queryKey: queryKeys.programs.byCreator(user.uid) });
      const previousPrograms = queryClient.getQueryData(queryKeys.programs.byCreator(user.uid)) || [];

      queryClient.setQueryData(
        queryKeys.programs.byCreator(user.uid),
        previousPrograms.filter(p => p.id !== variables.programId)
      );

      return { previousPrograms };
    },
    onError: (err, variables, context) => {
      if (context?.previousPrograms && user) {
        queryClient.setQueryData(
          queryKeys.programs.byCreator(user.uid),
          context.previousPrograms
        );
      }
    },
    onSuccess: (data, variables) => {
      if (user) {
        queryClient.invalidateQueries({ queryKey: queryKeys.programs.byCreator(user.uid) });
        queryClient.removeQueries({ queryKey: queryKeys.programs.detail(variables.programId) });
      }
    },
  });

  const error = queryError ? 'Error al cargar los programas' : null;

  const handleAddProgram = () => {
    setIsProgramTypeSelectionModalOpen(true);
  };

  const handleSelectLowTicket = () => {
    setIsProgramTypeSelectionModalOpen(false);
    setDeliveryType('low_ticket');
    setIsModalOpen(true);
  };

  const handleCloseProgramTypeSelectionModal = () => {
    setIsProgramTypeSelectionModalOpen(false);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalPage('general');
    setProgramName('');
    setProgramDescription('');
    setDiscipline('Fuerza - hipertrofia');
    setProgramType('subscription');
    setDeliveryType('low_ticket');
    setDuration(1);
    setPrice('');
    setProgramImageFile(null);
    setProgramImagePreview(null);
    setProgramImageUrlFromLibrary(null);
    setIntroVideoFile(null);
    setIntroVideoPreview(null);
    setFreeTrialActive(false);
    setFreeTrialDurationDays('0');
    setStreakEnabled(false);
    setMinimumSessionsPerWeek(0);
    setWeightSuggestions(false);
    setAvailableLibraries([]);
    if (location.pathname === '/products/new') {
      navigate('/products');
    }
    setSelectedLibraryIds(new Set());
    setTutorials({});
    setTutorialFiles({
      dailyWorkout: null,
      workoutExecution: null,
      workoutCompletion: null,
      warmup: null,
    });
  };

  const handleDurationIncrement = () => {
    setDuration(prev => prev + 1);
  };

  const handleDurationDecrement = () => {
    setDuration(prev => Math.max(1, prev - 1));
  };

  const handleCreateProgram = async () => {
    // Validate required fields
    if (!programName.trim()) {
      alert('El nombre del programa es requerido');
      return;
    }
    if (!discipline) {
      alert('La disciplina es requerida');
      return;
    }
    if (!programType) {
      alert('El tipo es requerido');
      return;
    }
    if (!user || !creatorName) {
      return;
    }

    try {
      // Prepare program data (status always draft)
      // Initialize tutorials with default screens
      const defaultTutorials = {
        dailyWorkout: [],
        workoutCompletion: [],
        workoutExecution: []
      };
      
      const programData = {
        title: programName.trim(),
        description: programDescription.trim() || '',
        discipline,
        programType: deliveryType === 'one_on_one' ? 'subscription' : programType,
        deliveryType,
        status: 'draft', // Always draft
        price: deliveryType === 'one_on_one' ? null : (price ? parseInt(price, 10) : null),
        freeTrialActive: deliveryType === 'one_on_one' ? false : freeTrialActive,
        freeTrialDurationDays: deliveryType === 'one_on_one' ? '0' : freeTrialDurationDays,
        duration: deliveryType === 'one_on_one' ? null : (duration !== undefined && duration !== null && programType === 'one-time' ? `${parseInt(duration, 10)} semanas` : (programType === 'subscription' ? 'Mensual' : null)),
        streakEnabled,
        minimumSessionsPerWeek,
        weightSuggestions,
        availableLibraries: Array.from(selectedLibraryIds),
        tutorials: defaultTutorials,
      };
      
      // Create program first
      const newProgram = await createProgramMutation.mutateAsync({
        creatorId: user.uid,
        creatorName: creatorName,
        programData: programData
      });
      
      if (programImageUrlFromLibrary && newProgram?.id) {
        await programService.updateProgram(newProgram.id, {
          image_url: programImageUrlFromLibrary,
          image_path: null
        });
      } else if (programImageFile && newProgram?.id) {
        try {
          setIsUploadingImage(true);
          setImageUploadProgress(0);
          await programService.uploadProgramImage(
            newProgram.id,
            programImageFile,
            (progress) => setImageUploadProgress(Math.round(progress))
          );
          setImageUploadProgress(100);
        } catch (uploadErr) {
          console.error('Error uploading image:', uploadErr);
          alert(`Error al subir la imagen: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`);
        } finally {
          setIsUploadingImage(false);
        }
      }
      
      // Upload intro video if provided
      if (introVideoFile && newProgram?.id) {
        try {
          setIsUploadingIntroVideo(true);
          setIntroVideoUploadProgress(0);
          
          const introVideoUrl = await programService.uploadProgramIntroVideo(
            newProgram.id,
            introVideoFile,
            (progress) => {
              setIntroVideoUploadProgress(Math.round(progress));
            }
          );
          
          // Update program with intro video URL
          await programService.updateProgram(newProgram.id, {
            video_intro_url: introVideoUrl
          });
          
          setIntroVideoUploadProgress(100);
        } catch (uploadErr) {
          console.error('Error uploading intro video:', uploadErr);
          alert(`Error al subir el video intro: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`);
        } finally {
          setIsUploadingIntroVideo(false);
        }
      }

      // Upload optional tutorial videos per screen
      const hasTutorialFiles = Object.values(tutorialFiles).some(Boolean);
      if (hasTutorialFiles && newProgram?.id) {
        setIsUploadingTutorials(true);
        try {
          const tutorialsPayload = {
            dailyWorkout: [],
            workoutCompletion: [],
            workoutExecution: [],
            warmup: [],
          };
          for (const { key } of TUTORIAL_SCREENS) {
            const file = tutorialFiles[key];
            if (file) {
              const url = await programService.uploadTutorialVideo(
                newProgram.id,
                key,
                file,
                (p) => {}
              );
              if (url) tutorialsPayload[key] = [url];
            }
          }
          await programService.updateProgram(newProgram.id, { tutorials: tutorialsPayload });
        } catch (uploadErr) {
          console.error('Error uploading tutorial videos:', uploadErr);
          alert(`Error al subir los tutoriales: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`);
        } finally {
          setIsUploadingTutorials(false);
        }
      }
      
      handleCloseModal();
      const productTypeState = { productType: searchParams.get('type') || deliveryType || 'low_ticket' };
      // Navigate to the new program page
      if (newProgram?.id && !newProgram.id.startsWith('temp-')) {
        navigate(`/programs/${newProgram.id}`, { state: { returnTo: '/products', returnState: productTypeState } });
      } else {
        // Wait a bit for cache to update
      setTimeout(() => {
        const programs = queryClient.getQueryData(queryKeys.programs.byCreator(user.uid)) || [];
          const foundProgram = programs.find(p => p.title === programName.trim());
          if (foundProgram && foundProgram.id && !foundProgram.id.startsWith('temp-')) {
            navigate(`/programs/${foundProgram.id}`, { state: { returnTo: '/products', returnState: productTypeState } });
        }
      }, 500);
      }
    } catch (err) {
      console.error('Error creating program:', err);
      alert(`Error al crear el programa: ${err.message || 'Por favor, intenta de nuevo.'}`);
    }
  };

  const handleEditPrograms = () => {
    setIsEditMode(!isEditMode);
  };

  const handleDeleteProgram = (program) => {
    setProgramToDelete(program);
    setIsDeleteModalOpen(true);
    setDeleteConfirmation('');
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setProgramToDelete(null);
    setDeleteConfirmation('');
  };

  const handleConfirmDelete = async () => {
    if (!programToDelete || !deleteConfirmation.trim() || !user) {
      return;
    }

    // Verify the confirmation matches the program title
    if (deleteConfirmation.trim() !== programToDelete.title) {
      return;
    }

    try {
      await deleteProgramMutation.mutateAsync({
        programId: programToDelete.id,
      });
      
      // Close modal and exit edit mode if no programs left
      handleCloseDeleteModal();
      const programs = queryClient.getQueryData(queryKeys.programs.byCreator(user.uid)) || [];
      if (programs.length === 0) {
        setIsEditMode(false);
      }
    } catch (err) {
      console.error('Error deleting program:', err);
      alert('Error al eliminar el programa. Por favor, intenta de nuevo.');
    }
  };

  const isOneOnOneCreate = location.pathname === '/products/new' && deliveryType === 'one_on_one';

  return (
    <DashboardLayout screenName={isOneOnOneCreate ? 'Nuevo programa general (1-on-1)' : 'Programas Low-ticket'}>
      <div className="programs-content">
        <div className="programs-actions">
          <button 
            className={`program-action-pill ${isEditMode ? 'program-action-pill-disabled' : ''}`}
            onClick={handleAddProgram}
            disabled={isEditMode}
          >
            <span className="program-action-icon">+</span>
          </button>
          <button 
            className="program-action-pill"
            onClick={handleEditPrograms}
          >
            <span className="program-action-text">{isEditMode ? 'Guardar' : 'Editar'}</span>
          </button>
        </div>
        
        {/* Programs List */}
        {loading ? (
          <div className="programs-loading">
            <p>Cargando programas...</p>
          </div>
        ) : error ? (
          <div className="programs-error">
            <p>{error}</p>
          </div>
        ) : programs.length === 0 ? (
          <div className="programs-empty">
            <p>No tienes programas aún. Crea un nuevo programa para comenzar.</p>
          </div>
        ) : (
          <div className="programs-list">
            {programs.map((program) => {
              const weekCount = programService.getWeekCount(program);
              const programDeliveryType = program.deliveryType || 'low_ticket';
              return (
                <div 
                  key={program.id} 
                  className={`program-card ${isEditMode ? 'program-card-edit-mode' : ''}`}
                  onClick={() => {
                    if (!isEditMode) {
                      const productTypeState = { productType: programDeliveryType || 'low_ticket' };
                      navigate(`/programs/${program.id}`, { state: { returnTo: '/products', returnState: productTypeState } });
                    }
                  }}
                >
                  {isEditMode && (
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
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {weekCount > 0 && (
                          <span className="program-card-count">
                            {weekCount} {weekCount === 1 ? 'semana' : 'semanas'}
                          </span>
                        )}
                      </div>
                      <div className={`program-type-pill program-type-pill-${programDeliveryType}`}>
                        {programDeliveryType === 'one_on_one' ? '1-on-1' : 'Low-ticket'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Program Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={deliveryType === 'one_on_one' ? 'Nuevo programa general (1-on-1)' : 'Nuevo programa'}
      >
        <div className="one-on-one-modal-content">
          {deliveryType === 'one_on_one' && (
            <p className="one-on-one-field-note" style={{ marginBottom: '16px', padding: '10px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' }}>
              Los programas generales son contenedores (metadata: título, imagen, descripción). El contenido (semanas y sesiones) se asigna por cliente en la ficha de cada cliente.
            </p>
          )}
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
                  placeholder="Ej: Programa de Fuerza Avanzado"
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  type="text"
                  light={true}
                />
              </div>
              
              <div className="edit-program-input-group">
                <label className="edit-program-input-label">Descripción</label>
                <textarea
                  className="program-config-description-textarea"
                  value={programDescription}
                  onChange={(e) => setProgramDescription(e.target.value)}
                  placeholder="Describe el objetivo y características de este programa..."
                  rows={4}
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: deliveryType === 'one_on_one' ? '1fr' : '1fr 1fr', gap: '20px' }}>
                <div className="edit-program-input-group">
                  <label className="edit-program-input-label">
                    Disciplina <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span>
                  </label>
                  <select
                    className="program-config-dropdown"
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                  >
                    <option value="Fuerza - hipertrofia">Fuerza - hipertrofia</option>
                  </select>
                  <p className="one-on-one-field-note">
                    No se puede cambiar después de la creación
                  </p>
                </div>
                
                {deliveryType !== 'one_on_one' && (
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label">
                      Tipo <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span>
                    </label>
                    <select
                      className="program-config-dropdown"
                      value={programType}
                      onChange={(e) => setProgramType(e.target.value)}
                    >
                      <option value="subscription">Suscripción</option>
                      <option value="one-time">Pago único</option>
                    </select>
                    <p className="one-on-one-field-note">
                      No se puede cambiar después de la creación
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pricing & Duration Section - hide for 1-on-1 general programs */}
          {deliveryType !== 'one_on_one' && (
          <div className="one-on-one-modal-section">
            <div className="one-on-one-modal-section-header">
              <h3 className="one-on-one-modal-section-title">Precio y Duración</h3>
              <span className="one-on-one-modal-section-badge-optional">Opcional</span>
            </div>
            <div className="one-on-one-modal-section-content">
              <div style={{ display: 'grid', gridTemplateColumns: programType === 'one-time' ? '1fr 1fr' : '1fr', gap: '20px' }}>
                {programType === 'one-time' ? (
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label">Duración (semanas)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <input
                          type="number"
                          className="duration-input"
                          value={duration}
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10) || 1;
                            if (value >= 1) {
                              setDuration(value);
                            }
                          }}
                          min="1"
                          style={{
                            width: '80px',
                            padding: '12px 16px',
                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            color: 'rgba(255, 255, 255, 0.8)',
                            fontSize: '14px',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif'
                          }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={handleDurationIncrement}
                            style={{
                              width: '24px',
                              height: '24px',
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '4px',
                              color: 'rgba(255, 255, 255, 0.8)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M19 9L12 16L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)"/>
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={handleDurationDecrement}
                            disabled={duration <= 1}
                            style={{
                              width: '24px',
                              height: '24px',
                              backgroundColor: duration <= 1 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '4px',
                              color: duration <= 1 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.8)',
                              cursor: duration <= 1 ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M19 9L12 16L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '14px' }}>
                        {duration === 1 ? 'Semana' : 'Semanas'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label">Duración</label>
                    <div style={{ 
                      padding: '12px 16px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: 'rgba(255, 255, 255, 0.6)',
                      fontSize: '14px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif'
                    }}>
                      Mensual
                    </div>
                    <p className="one-on-one-field-note">
                      Los programas de suscripción se renuevan mensualmente
                    </p>
                  </div>
                )}
                
                <div className="edit-program-input-group">
                  <label className="edit-program-input-label">Precio</label>
                  <Input
                    placeholder="Ej: 29900"
                    value={price}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      setPrice(value);
                    }}
                    type="text"
                    light={true}
                  />
                  <p className="one-on-one-field-note">
                    {programType === 'subscription' ? 'Precio mensual en pesos' : 'Precio único en pesos'}
                  </p>
                </div>
              </div>
            </div>
          </div>
          )}

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
                    {programImagePreview ? (
                      <div className="program-config-card-image-container">
                        <img
                          src={programImagePreview}
                          alt="Programa"
                          className="program-config-card-image"
                        />
                        <div className="program-config-card-image-overlay">
                          <div className="program-config-card-image-actions">
                            <button type="button" className="edit-program-image-action-pill" onClick={() => setIsMediaPickerOpen(true)}>
                              <span className="edit-program-image-action-text">Cambiar</span>
                            </button>
                            <button
                              type="button"
                              className="edit-program-image-action-pill edit-program-image-delete-pill"
                              onClick={() => {
                                setProgramImageFile(null);
                                setProgramImagePreview(null);
                                setProgramImageUrlFromLibrary(null);
                              }}
                            >
                              <span className="edit-program-image-action-text">Eliminar</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, width: '100%' }}
                        onClick={() => setIsMediaPickerOpen(true)}
                      >
                        <div className="program-config-card-placeholder">
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: '8px', opacity: 0.5 }}>
                            <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span>Subir imagen</span>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Video Intro Card */}
                <div className="program-config-card">
                  <div className="program-config-card-header">
                    <span className="program-config-card-label">Video Intro</span>
                  </div>
                  <div className="program-config-card-content">
                    {introVideoPreview ? (
                      <>
                        <div className="program-config-card-video-container">
                          <video
                            src={introVideoPreview}
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
                                  setIntroVideoFile(file);
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setIntroVideoPreview(reader.result);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              style={{ display: 'none' }}
                              disabled={isUploadingIntroVideo}
                            />
                            <span className="edit-program-image-action-text">
                              {isUploadingIntroVideo ? 'Subiendo...' : 'Cambiar'}
                            </span>
                          </label>
                          {isUploadingIntroVideo && (
                            <div className="edit-program-image-progress">
                              <div className="edit-program-image-progress-bar">
                                <div 
                                  className="edit-program-image-progress-fill"
                                  style={{ width: `${introVideoUploadProgress}%` }}
                                />
                              </div>
                              <span className="edit-program-image-progress-text">
                                {introVideoUploadProgress}%
                              </span>
                            </div>
                          )}
                          <button
                            className="edit-program-image-action-pill edit-program-image-delete-pill"
                            onClick={() => {
                              setIntroVideoFile(null);
                              setIntroVideoPreview(null);
                            }}
                            disabled={isUploadingIntroVideo}
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
                              setIntroVideoFile(file);
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setIntroVideoPreview(reader.result);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          style={{ display: 'none' }}
                          disabled={isUploadingIntroVideo}
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
              <h3 className="one-on-one-modal-section-title">Configuración del Programa</h3>
              <span className="one-on-one-modal-section-badge-optional">Opcional</span>
            </div>
            <div className="one-on-one-modal-section-content">
              {/* Free Trial */}
              <div className="one-on-one-config-item">
                <label className="edit-program-input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '8px' }}>
                  <span>Prueba Gratis</span>
                  <label className="elegant-toggle">
                    <input
                      type="checkbox"
                      checked={freeTrialActive}
                      onChange={(e) => setFreeTrialActive(e.target.checked)}
                    />
                    <span className="elegant-toggle-slider"></span>
                  </label>
                </label>
                <p className="one-on-one-config-description">
                  Permite a los usuarios probar el programa gratis antes de comprarlo
                </p>
                {freeTrialActive && (
                  <div style={{ marginTop: '12px' }}>
                    <label className="edit-program-input-label" style={{ marginBottom: '8px', display: 'block', fontSize: '13px' }}>
                      Duración de la prueba gratis (días)
                    </label>
                    <Input
                      placeholder="Ej: 7"
                      value={freeTrialDurationDays}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        setFreeTrialDurationDays(value);
                      }}
                      type="text"
                      light={true}
                    />
                  </div>
                )}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '8px' }}>
                {/* Streak */}
                <div className="one-on-one-config-item">
                  <label className="edit-program-input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '8px' }}>
                    <span>Racha Activa</span>
                    <label className="elegant-toggle">
                      <input
                        type="checkbox"
                        checked={streakEnabled}
                        onChange={(e) => setStreakEnabled(e.target.checked)}
                      />
                      <span className="elegant-toggle-slider"></span>
                    </label>
                  </label>
                  <p className="one-on-one-config-description">
                    Activa el sistema de rachas para motivar la consistencia en los entrenamientos
                  </p>
                  {streakEnabled && (
                    <div style={{ marginTop: '12px' }}>
                      <label className="edit-program-input-label" style={{ marginBottom: '8px', display: 'block', fontSize: '13px' }}>
                        Mínimo de sesiones por semana
                      </label>
                      <Input
                        placeholder="Ej: 3"
                        value={minimumSessionsPerWeek}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '');
                          setMinimumSessionsPerWeek(value ? parseInt(value, 10) : 0);
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
                        checked={weightSuggestions}
                        onChange={(e) => setWeightSuggestions(e.target.checked)}
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
                {availableLibraries.length === 0 ? (
                  <div className="one-on-one-empty-state">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.4, marginBottom: '8px' }}>
                      <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20M4 19.5C4 20.163 4.26339 20.7989 4.73223 21.2678C5.20107 21.7366 5.83696 22 6.5 22H20M4 19.5V9.5M20 19.5V9.5M20 19.5L18 17M4 19.5L6 17M4 9.5C4 8.83696 4.26339 8.20107 4.73223 7.73223C5.20107 7.26339 5.83696 7 6.5 7H20C20.663 7 21.2989 7.26339 21.7678 7.73223C22.2366 8.20107 22.5 8.83696 22.5 9.5V19.5C22.5 20.163 22.2366 20.7989 21.7678 21.2678C21.2989 21.7366 20.663 22 20 22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p>No tienes bibliotecas disponibles</p>
                    <p style={{ fontSize: '12px', marginTop: '4px', opacity: 0.6 }}>Crea una biblioteca primero desde la pestaña "Ejercicios"</p>
                  </div>
                ) : (
                  <div className="one-on-one-libraries-grid">
                    {availableLibraries.map((library) => {
                      const isSelected = selectedLibraryIds.has(library.id);
                      return (
                        <button
                          key={library.id}
                          type="button"
                          onClick={() => {
                            setSelectedLibraryIds(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(library.id)) {
                                newSet.delete(library.id);
                              } else {
                                newSet.add(library.id);
                              }
                              return newSet;
                            });
                          }}
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
          
          {/* Tutorials (optional) - same for low-ticket and one-on-one */}
          <div className="one-on-one-modal-section">
            <div className="one-on-one-modal-section-header">
              <h3 className="one-on-one-modal-section-title">Tutoriales</h3>
              <span className="one-on-one-modal-section-badge-optional">Opcional</span>
            </div>
            <div className="one-on-one-modal-section-content">
              <p className="one-on-one-config-description" style={{ marginBottom: 16 }}>
                Videos que verán los usuarios la primera vez que entren a cada pantalla de la app (MP4, M4V o MOV).
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {TUTORIAL_SCREENS.map(({ key, label }) => (
                  <div key={key} className="one-on-one-config-item" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <label className="edit-program-input-label" style={{ minWidth: 180, marginBottom: 0 }}>
                      {label}
                    </label>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="file"
                        accept="video/mp4,video/x-m4v,video/quicktime,.mp4,.m4v,.mov"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          setTutorialFiles((prev) => ({ ...prev, [key]: file || null }));
                        }}
                        style={{ display: 'none' }}
                      />
                      <span
                        className="edit-program-image-action-pill"
                        style={{
                          padding: '8px 14px',
                          fontSize: 13,
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 8,
                        }}
                      >
                        {tutorialFiles[key] ? tutorialFiles[key].name : 'Subir video'}
                      </span>
                    </label>
                    {tutorialFiles[key] && (
                      <button
                        type="button"
                        onClick={() => setTutorialFiles((prev) => ({ ...prev, [key]: null }))}
                        className="edit-program-image-action-pill edit-program-image-delete-pill"
                        style={{ padding: '8px 12px', fontSize: 13 }}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Create Button */}
          <div className="one-on-one-modal-actions">
            <Button
              title={createProgramMutation.isPending || isUploadingImage || isUploadingIntroVideo || isUploadingTutorials ? 'Creando...' : 'Crear Programa'}
              onClick={handleCreateProgram}
              disabled={!programName.trim() || !discipline || !programType || createProgramMutation.isPending || isUploadingImage || isUploadingIntroVideo || isUploadingTutorials}
              loading={createProgramMutation.isPending || isUploadingImage || isUploadingIntroVideo || isUploadingTutorials}
            />
            <p className="one-on-one-modal-help-text">
              Los campos marcados con <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span> son requeridos. Podrás agregar contenido después de crear el programa.
            </p>
          </div>
        </div>
      </Modal>

      {/* Program Type Selection Modal */}
      <Modal
        isOpen={isProgramTypeSelectionModalOpen}
        onClose={handleCloseProgramTypeSelectionModal}
        title="Tipo de programa"
      >
        <div className="program-type-selection-modal-content">
          <p className="program-type-selection-instruction">Selecciona el tipo de programa que deseas crear:</p>
          <div className="program-type-selection-options">
            <button
              className="program-type-selection-option"
              onClick={handleSelectLowTicket}
            >
              <div className="program-type-selection-option-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="program-type-selection-option-content">
                <h3 className="program-type-selection-option-title">Low-ticket</h3>
                <p className="program-type-selection-option-description">Programas generales y escalables para múltiples usuarios</p>
              </div>
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Program Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        title={programToDelete?.title || 'Eliminar programa'}
      >
        <div className="modal-program-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre del programa:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={programToDelete?.title || 'Nombre del programa'}
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-program-button ${deleteConfirmation.trim() !== programToDelete?.title ? 'delete-program-button-disabled' : ''}`}
              onClick={handleConfirmDelete}
              disabled={deleteConfirmation.trim() !== programToDelete?.title || deleteProgramMutation.isPending}
            >
              {deleteProgramMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción es irreversible. El programa se eliminará permanentemente.
          </p>
        </div>
      </Modal>

      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelect={handleMediaPickerSelect}
        creatorId={user?.uid}
        accept="image/*"
      />
    </DashboardLayout>
  );
};

export default ProgramsScreen;

