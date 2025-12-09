import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import programService from '../services/programService';
import { getUser } from '../services/firestoreService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import './ProgramsScreen.css';

const ProgramsScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [duration, setDuration] = useState(1); // Duration in weeks
  const [price, setPrice] = useState('');
  const [programImageFile, setProgramImageFile] = useState(null);
  const [programImagePreview, setProgramImagePreview] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
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
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalPage('general');
    setProgramName('');
    setProgramDescription('');
    setDiscipline('Fuerza - hipertrofia');
    setProgramType('subscription');
    setDuration(1);
    setPrice('');
    setProgramImageFile(null);
    setProgramImagePreview(null);
    setIntroVideoFile(null);
    setIntroVideoPreview(null);
    setFreeTrialActive(false);
    setFreeTrialDurationDays('0');
    setStreakEnabled(false);
    setMinimumSessionsPerWeek(0);
    setWeightSuggestions(false);
    setAvailableLibraries([]);
    setSelectedLibraryIds(new Set());
    setTutorials({});
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
        programType,
        status: 'draft', // Always draft
        price: price ? parseInt(price, 10) : null,
        freeTrialActive,
        freeTrialDurationDays,
        duration: duration !== undefined && duration !== null && programType === 'one-time' ? `${parseInt(duration, 10)} semanas` : (programType === 'subscription' ? 'Mensual' : null), // Duration format: "X semanas" for one-time, "Mensual" for subscription
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
      
      // Upload image if provided
      if (programImageFile && newProgram?.id) {
        try {
          setIsUploadingImage(true);
          setImageUploadProgress(0);
          
          await programService.uploadProgramImage(
            newProgram.id,
            programImageFile,
            (progress) => {
              setImageUploadProgress(Math.round(progress));
            }
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
      
      handleCloseModal();
      // Navigate to the new program page
      if (newProgram?.id && !newProgram.id.startsWith('temp-')) {
        navigate(`/programs/${newProgram.id}`);
      } else {
        // Wait a bit for cache to update
      setTimeout(() => {
        const programs = queryClient.getQueryData(queryKeys.programs.byCreator(user.uid)) || [];
          const foundProgram = programs.find(p => p.title === programName.trim());
          if (foundProgram && foundProgram.id && !foundProgram.id.startsWith('temp-')) {
            navigate(`/programs/${foundProgram.id}`);
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

  return (
    <DashboardLayout screenName="Programas">
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
              return (
                <div 
                  key={program.id} 
                  className={`program-card ${isEditMode ? 'program-card-edit-mode' : ''}`}
                  onClick={() => {
                    if (!isEditMode) {
                      navigate(`/programs/${program.id}`);
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
      </div>

      {/* Create Program Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Nuevo programa"
      >
        <div className="edit-program-modal-content">
          <div className="edit-program-modal-body">
            {/* Left Side - Menu */}
            <div className="edit-program-modal-left">
              <div className="anuncios-screens-list">
                <label className="anuncios-screens-label">Páginas</label>
                <div className="anuncios-screens-container">
                  <button
                    className={`anuncios-screen-item ${modalPage === 'general' ? 'anuncios-screen-item-active' : ''}`}
                    onClick={() => setModalPage('general')}
                  >
                    <span className="anuncios-screen-name">General</span>
                  </button>
                  <button
                    className={`anuncios-screen-item ${modalPage === 'configuracion' ? 'anuncios-screen-item-active' : ''}`}
                    onClick={() => setModalPage('configuracion')}
                  >
                    <span className="anuncios-screen-name">Configuración</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Side - Content */}
            <div className="edit-program-modal-right" style={{ overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {modalPage === 'general' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '24px', flex: 1 }}>
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label">Nombre del Programa *</label>
          <Input
            placeholder="Nombre del programa"
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
                      placeholder="Escribe la descripción del programa..."
                      rows={6}
                    />
                  </div>
                  
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label">Disciplina *</label>
                    <select
                      className="program-config-dropdown"
                      value={discipline}
                      onChange={(e) => setDiscipline(e.target.value)}
                    >
                      <option value="Fuerza - hipertrofia">Fuerza - hipertrofia</option>
                    </select>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px', marginTop: '4px', marginBottom: 0 }}>
                      No se puede cambiar después de la creación
                    </p>
                  </div>
                  
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label">Tipo *</label>
                    <select
                      className="program-config-dropdown"
                      value={programType}
                      onChange={(e) => setProgramType(e.target.value)}
                    >
                      <option value="subscription">Suscripción</option>
                      <option value="one-time">Pago único</option>
                    </select>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px', marginTop: '4px', marginBottom: 0 }}>
                      No se puede cambiar después de la creación
                    </p>
                  </div>
                  
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
                    </div>
                  )}
                  
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label">Precio</label>
                    <Input
                      placeholder="Precio (ej: 29900)"
                      value={price}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        setPrice(value);
                      }}
            type="text"
            light={true}
          />
                  </div>
                  
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
                              <label className="edit-program-image-action-pill">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (file) {
                                      setProgramImageFile(file);
                                      const reader = new FileReader();
                                      reader.onloadend = () => {
                                        setProgramImagePreview(reader.result);
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                  style={{ display: 'none' }}
                                />
                                <span className="edit-program-image-action-text">Cambiar</span>
                              </label>
                              <button
                                className="edit-program-image-action-pill edit-program-image-delete-pill"
                                onClick={() => {
                                  setProgramImageFile(null);
                                  setProgramImagePreview(null);
                                }}
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
                                setProgramImageFile(file);
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setProgramImagePreview(reader.result);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            style={{ display: 'none' }}
                          />
                          <div className="program-config-card-placeholder">
                            <span>Haz clic para subir una imagen</span>
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
                              />
                              <span className="edit-program-image-action-text">Cambiar</span>
                            </label>
                            <button
                              className="edit-program-image-action-pill edit-program-image-delete-pill"
                              onClick={() => {
                                setIntroVideoFile(null);
                                setIntroVideoPreview(null);
                              }}
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
                          />
                          <div className="program-config-card-placeholder">
                            <span>Haz clic para subir un video</span>
                          </div>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {modalPage === 'configuracion' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '24px', flex: 1 }}>
                  {/* Free Trial */}
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <span>Prueba Gratis Activa</span>
                      <label className="elegant-toggle">
                        <input
                          type="checkbox"
                          checked={freeTrialActive}
                          onChange={(e) => setFreeTrialActive(e.target.checked)}
                        />
                        <span className="elegant-toggle-slider"></span>
                      </label>
                    </label>
                    {freeTrialActive && (
                      <div style={{ marginTop: '12px' }}>
                        <label className="edit-program-input-label" style={{ marginBottom: '8px', display: 'block' }}>
                          Duración de la prueba gratis (días)
                        </label>
                        <Input
                          placeholder="Duración en días (ej: 7)"
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
                  
                  {/* Streak */}
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
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
                    {streakEnabled && (
                      <div style={{ marginTop: '12px' }}>
                        <label className="edit-program-input-label" style={{ marginBottom: '8px', display: 'block' }}>
                          Mínimo de sesiones por semana
                        </label>
                        <Input
                          placeholder="Mínimo de sesiones por semana (ej: 3)"
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
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <span>Sugerencias de Peso Activas</span>
                      <label className="elegant-toggle">
                        <input
                          type="checkbox"
                          checked={weightSuggestions}
                          onChange={(e) => setWeightSuggestions(e.target.checked)}
                        />
                        <span className="elegant-toggle-slider"></span>
                      </label>
                    </label>
                  </div>
                </div>
              )}
              
              {/* Global Create Button - Accessible from both pages */}
              <div className="edit-program-modal-actions" style={{ flexShrink: 0, marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <Button
                  title={createProgramMutation.isPending ? 'Creando...' : 'Crear'}
                  onClick={handleCreateProgram}
                  disabled={!programName.trim() || !discipline || !programType || createProgramMutation.isPending}
                  loading={createProgramMutation.isPending}
                />
              </div>
            </div>
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
    </DashboardLayout>
  );
};

export default ProgramsScreen;

