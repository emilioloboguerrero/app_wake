import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import Modal from '../components/Modal';
import MediaPickerModal from '../components/MediaPickerModal';
import Input from '../components/Input';
import Button from '../components/Button';
import { SkeletonCard } from '../components/ui/ShimmerSkeleton';
import programService from '../services/programService';
import libraryService from '../services/libraryService';
import apiClient from '../utils/apiClient';
import { queryKeys, cacheConfig } from '../config/queryClient';
import logger from '../utils/logger';
import { useToast } from '../contexts/ToastContext';
import './ProgramsScreen.css';

const TUTORIAL_SCREENS = [
  { key: 'dailyWorkout', label: 'Entrenamiento diario' },
  { key: 'workoutExecution', label: 'Ejecución del entrenamiento' },
  { key: 'workoutCompletion', label: 'Completar entrenamiento' },
  { key: 'warmup', label: 'Calentamiento' },
];

// ─── Skeleton grid shown while loading ───────────────────────────────────────

const ProgramsGridSkeleton = () => (
  <div className="programs-grid-skeleton">
    {Array.from({ length: 6 }).map((_, i) => (
      <SkeletonCard key={i} className="programs-skeleton-card" />
    ))}
  </div>
);

// ─── Empty state ──────────────────────────────────────────────────────────────

const ProgramsEmptyState = ({ onAdd }) => (
  <div className="programs-empty-state">
    <div className="programs-empty-icon-wrap">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 21H21M4 21V7L12 3L20 7V21M4 21H20M9 9V17M15 9V17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
    <h3 className="programs-empty-title">Todavía no hay programas</h3>
    <p className="programs-empty-desc">Crea tu primer programa para comenzar a vender.</p>
    <button className="programs-empty-cta" onClick={onAdd}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      </svg>
      Nuevo programa
    </button>
  </div>
);

// ─── Program card ─────────────────────────────────────────────────────────────

const ProgramCard = ({ program, index, isEditMode, onDelete, onClick }) => {
  const weekCount = programService.getWeekCount(program);
  const deliveryType = program.deliveryType || 'low_ticket';
  const isDraft = !program.status || program.status === 'draft';

  return (
    <div
      className={`ps-card ${isEditMode ? 'ps-card--edit' : ''}`}
      style={{ '--card-index': index }}
      onClick={() => !isEditMode && onClick(program)}
      role={isEditMode ? undefined : 'button'}
      tabIndex={isEditMode ? undefined : 0}
      onKeyDown={(e) => {
        if (!isEditMode && (e.key === 'Enter' || e.key === ' ')) onClick(program);
      }}
    >
      {/* Image or placeholder */}
      {program.image_url ? (
        <div className="ps-card__img-wrap">
          <img src={program.image_url} alt={program.title || 'Programa'} className="ps-card__img" loading="lazy" />
          <div className="ps-card__img-gradient" />
          <div className="ps-card__img-title">
            {program.title || `Programa ${program.id.slice(0, 6)}`}
          </div>
        </div>
      ) : (
        <div className="ps-card__no-img">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 21H21M4 21V7L12 3L20 7V21M4 21H20M9 9V17M15 9V17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="ps-card__no-img-title">
            {program.title || `Programa ${program.id.slice(0, 6)}`}
          </span>
        </div>
      )}

      {/* Footer row */}
      <div className="ps-card__footer">
        <div className="ps-card__meta">
          {weekCount > 0 && (
            <span className="ps-card__weeks">{weekCount} {weekCount === 1 ? 'semana' : 'semanas'}</span>
          )}
        </div>
        <div className="ps-card__badges">
          {isDraft && <span className="ps-card__badge ps-card__badge--draft">Borrador</span>}
          <span className={`ps-card__badge ps-card__badge--${deliveryType}`}>
            {deliveryType === 'one_on_one' ? '1-on-1' : 'General'}
          </span>
        </div>
      </div>

      {/* Edit-mode delete button */}
      {isEditMode && (
        <button
          className="ps-card__delete"
          onClick={(e) => { e.stopPropagation(); onDelete(program); }}
          aria-label={`Eliminar ${program.title}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          Eliminar
        </button>
      )}

      {/* Edit-mode overlay */}
      {isEditMode && <div className="ps-card__edit-overlay" />}
    </div>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

const ProgramsScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // ── Modal / UI state ──
  const [isProgramTypeSelectionModalOpen, setIsProgramTypeSelectionModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [programToDelete, setProgramToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  // ── Form state ──
  const [programName, setProgramName] = useState('');
  const [programDescription, setProgramDescription] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [discipline, setDiscipline] = useState('Fuerza - hipertrofia');
  const [programType, setProgramType] = useState('subscription');
  const [deliveryType, setDeliveryType] = useState('low_ticket');
  const [duration, setDuration] = useState(1);
  const [price, setPrice] = useState('');
  const [programImageFile, setProgramImageFile] = useState(null);
  const [programImagePreview, setProgramImagePreview] = useState(null);
  const [programImageUrlFromLibrary, setProgramImageUrlFromLibrary] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [, setImageUploadProgress] = useState(0);
  const [introVideoFile, setIntroVideoFile] = useState(null);
  const [introVideoPreview, setIntroVideoPreview] = useState(null);
  const [isUploadingIntroVideo, setIsUploadingIntroVideo] = useState(false);
  const [introVideoUploadProgress, setIntroVideoUploadProgress] = useState(0);
  const [freeTrialActive, setFreeTrialActive] = useState(false);
  const [freeTrialDurationDays, setFreeTrialDurationDays] = useState('0');
  const [weightSuggestions, setWeightSuggestions] = useState(false);
  const [availableLibraries, setAvailableLibraries] = useState([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState(new Set());
  const [, setTutorials] = useState({});
  const [tutorialFiles, setTutorialFiles] = useState({
    dailyWorkout: null,
    workoutExecution: null,
    workoutCompletion: null,
    warmup: null,
  });
  const [isUploadingTutorials, setIsUploadingTutorials] = useState(false);

  // ─── Data fetching ────────────────────────────────────────────────────────

  const { data: programs = [], isLoading, error: queryError } = useQuery({
    queryKey: user ? queryKeys.programs.byCreator(user.uid) : ['programs', 'none'],
    queryFn: async () => {
      if (!user) return [];
      return await programService.getProgramsByCreator(user.uid);
    },
    enabled: !!user,
    ...cacheConfig.otherPrograms,
  });

  const { data: userDoc } = useQuery({
    queryKey: ['creator', 'profile'],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await apiClient.get('/creator/profile');
      return data;
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    select: (data) => {
      if (!data) return '';
      return data.displayName || data.name || user?.email || '';
    },
  });

  useEffect(() => {
    if (userDoc) setCreatorName(userDoc);
  }, [userDoc]);

  // ─── URL param triggers ───────────────────────────────────────────────────

  useEffect(() => {
    const autoCreate = searchParams.get('autoCreate');
    if (autoCreate === 'true' && user) {
      setDeliveryType('low_ticket');
      setIsModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, user, setSearchParams]);

  useEffect(() => {
    if (location.pathname === '/products/new' && searchParams.get('type') === 'low_ticket' && user) {
      setDeliveryType('low_ticket');
      setIsModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [location.pathname, searchParams, user, setSearchParams]);

  useEffect(() => {
    if (location.pathname === '/products/new' && searchParams.get('type') === 'one_on_one' && user) {
      setDeliveryType('one_on_one');
      setIsModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [location.pathname, searchParams, user, setSearchParams]);

  useEffect(() => {
    const loadLibraries = async () => {
      if (isModalOpen && user) {
        try {
          const libs = await libraryService.getLibrariesByCreator(user.uid);
          setAvailableLibraries(libs);
        } catch (err) {
          logger.error('Error loading libraries:', err);
        }
      }
    };
    loadLibraries();
  }, [isModalOpen, user]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createProgramMutation = useMutation({
    mutationFn: async ({ creatorId, creatorName, programData }) =>
      await programService.createProgram(creatorId, creatorName, programData),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.programs.byCreator(variables.creatorId) });
      const previousPrograms = queryClient.getQueryData(queryKeys.programs.byCreator(variables.creatorId)) || [];
      const tempId = `temp-${Date.now()}`;
      const now = new Date();
      const optimisticProgram = {
        id: tempId,
        creator_id: variables.creatorId,
        creatorName: variables.creatorName,
        title: variables.programData.title,
        description: variables.programData.description,
        discipline: variables.programData.discipline,
        access_duration: variables.programData.programType === 'subscription' ? 'monthly' : 'yearly',
        status: variables.programData.status || 'draft',
        version: `${new Date().getFullYear()}-01`,
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
    onError: (_err, variables, context) => {
      if (context?.previousPrograms) {
        queryClient.setQueryData(queryKeys.programs.byCreator(variables.creatorId), context.previousPrograms);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.programs.byCreator(variables.creatorId) });
    },
  });

  const deleteProgramMutation = useMutation({
    mutationFn: async ({ programId }) => await programService.deleteProgram(programId),
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
    onError: (_err, _variables, context) => {
      if (context?.previousPrograms && user) {
        queryClient.setQueryData(queryKeys.programs.byCreator(user.uid), context.previousPrograms);
      }
    },
    onSuccess: (_data, variables) => {
      if (user) {
        queryClient.invalidateQueries({ queryKey: queryKeys.programs.byCreator(user.uid) });
        queryClient.removeQueries({ queryKey: queryKeys.programs.detail(variables.programId) });
      }
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleAddProgram = useCallback(() => {
    setIsProgramTypeSelectionModalOpen(true);
  }, []);

  const handleSelectLowTicket = useCallback(() => {
    setIsProgramTypeSelectionModalOpen(false);
    setDeliveryType('low_ticket');
    setIsModalOpen(true);
  }, []);

  const handleCloseProgramTypeSelectionModal = useCallback(() => {
    setIsProgramTypeSelectionModalOpen(false);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
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
    setWeightSuggestions(false);
    setAvailableLibraries([]);
    setSelectedLibraryIds(new Set());
    setTutorials({});
    setTutorialFiles({ dailyWorkout: null, workoutExecution: null, workoutCompletion: null, warmup: null });
    if (location.pathname === '/products/new') navigate('/products');
  }, [location.pathname, navigate]);

  const handleMediaPickerSelect = useCallback((item) => {
    setProgramImagePreview(item.url);
    setProgramImageFile(null);
    setProgramImageUrlFromLibrary(item.url);
    setIsMediaPickerOpen(false);
  }, []);

  const handleDurationIncrement = useCallback(() => setDuration(prev => prev + 1), []);
  const handleDurationDecrement = useCallback(() => setDuration(prev => Math.max(1, prev - 1)), []);

  const handleCreateProgram = useCallback(async () => {
    if (!programName.trim()) { showToast('El nombre del programa es requerido', 'error'); return; }
    if (!discipline) { showToast('La disciplina es requerida', 'error'); return; }
    if (!programType) { showToast('El tipo es requerido', 'error'); return; }
    if (!user || !creatorName) return;

    try {
      const programData = {
        title: programName.trim(),
        description: programDescription.trim() || '',
        discipline,
        programType: deliveryType === 'one_on_one' ? 'subscription' : programType,
        deliveryType,
        status: 'draft',
        price: deliveryType === 'one_on_one' ? null : (price ? parseInt(price, 10) : null),
        freeTrialActive: deliveryType === 'one_on_one' ? false : freeTrialActive,
        freeTrialDurationDays: deliveryType === 'one_on_one' ? '0' : freeTrialDurationDays,
        duration: deliveryType === 'one_on_one' ? null : (
          programType === 'one-time' ? `${parseInt(duration, 10)} semanas` : 'Mensual'
        ),
        weightSuggestions,
        availableLibraries: Array.from(selectedLibraryIds),
        tutorials: { dailyWorkout: [], workoutCompletion: [], workoutExecution: [] },
      };

      const newProgram = await createProgramMutation.mutateAsync({
        creatorId: user.uid,
        creatorName,
        programData,
      });

      if (programImageUrlFromLibrary && newProgram?.id) {
        await programService.updateProgram(newProgram.id, { image_url: programImageUrlFromLibrary, image_path: null });
      } else if (programImageFile && newProgram?.id) {
        try {
          setIsUploadingImage(true);
          setImageUploadProgress(0);
          await programService.uploadProgramImage(newProgram.id, programImageFile, (p) => setImageUploadProgress(Math.round(p)));
          setImageUploadProgress(100);
        } catch (uploadErr) {
          logger.error('Error uploading image:', uploadErr);
          showToast(`Error al subir la imagen: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`, 'error');
        } finally {
          setIsUploadingImage(false);
        }
      }

      if (introVideoFile && newProgram?.id) {
        try {
          setIsUploadingIntroVideo(true);
          setIntroVideoUploadProgress(0);
          const introVideoUrl = await programService.uploadProgramIntroVideo(
            newProgram.id, introVideoFile, (p) => setIntroVideoUploadProgress(Math.round(p))
          );
          await programService.updateProgram(newProgram.id, { video_intro_url: introVideoUrl });
          setIntroVideoUploadProgress(100);
        } catch (uploadErr) {
          logger.error('Error uploading intro video:', uploadErr);
          showToast(`Error al subir el video intro: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`, 'error');
        } finally {
          setIsUploadingIntroVideo(false);
        }
      }

      const hasTutorialFiles = Object.values(tutorialFiles).some(Boolean);
      if (hasTutorialFiles && newProgram?.id) {
        setIsUploadingTutorials(true);
        try {
          const tutorialsPayload = { dailyWorkout: [], workoutCompletion: [], workoutExecution: [], warmup: [] };
          for (const { key } of TUTORIAL_SCREENS) {
            const file = tutorialFiles[key];
            if (file) {
              const url = await programService.uploadTutorialVideo(newProgram.id, key, file, () => {});
              if (url) tutorialsPayload[key] = [url];
            }
          }
          await programService.updateProgram(newProgram.id, { tutorials: tutorialsPayload });
        } catch (uploadErr) {
          logger.error('Error uploading tutorial videos:', uploadErr);
          showToast(`Error al subir los tutoriales: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`, 'error');
        } finally {
          setIsUploadingTutorials(false);
        }
      }

      handleCloseModal();
      const productTypeState = { productType: searchParams.get('type') || deliveryType || 'low_ticket' };
      if (newProgram?.id && !newProgram.id.startsWith('temp-')) {
        navigate(`/programs/${newProgram.id}`, { state: { returnTo: '/products', returnState: productTypeState } });
      } else {
        setTimeout(() => {
          const latestPrograms = queryClient.getQueryData(queryKeys.programs.byCreator(user.uid)) || [];
          const found = latestPrograms.find(p => p.title === programName.trim());
          if (found && found.id && !found.id.startsWith('temp-')) {
            navigate(`/programs/${found.id}`, { state: { returnTo: '/products', returnState: productTypeState } });
          }
        }, 500);
      }
    } catch (err) {
      logger.error('Error creating program:', err);
      showToast(`Error al crear el programa: ${err.message || 'Por favor, intenta de nuevo.'}`, 'error');
    }
  }, [
    programName, discipline, programType, user, creatorName, programDescription,
    deliveryType, price, freeTrialActive, freeTrialDurationDays, duration,
    weightSuggestions, selectedLibraryIds, tutorialFiles, programImageUrlFromLibrary,
    programImageFile, introVideoFile, createProgramMutation, handleCloseModal,
    navigate, queryClient, searchParams, showToast,
  ]);

  const handleEditToggle = useCallback(() => setIsEditMode(v => !v), []);

  const handleDeleteProgram = useCallback((program) => {
    setProgramToDelete(program);
    setIsDeleteModalOpen(true);
    setDeleteConfirmation('');
  }, []);

  const handleCloseDeleteModal = useCallback(() => {
    setIsDeleteModalOpen(false);
    setProgramToDelete(null);
    setDeleteConfirmation('');
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!programToDelete || !deleteConfirmation.trim() || !user) return;
    if (deleteConfirmation.trim() !== programToDelete.title) return;

    try {
      await deleteProgramMutation.mutateAsync({ programId: programToDelete.id });
      handleCloseDeleteModal();
      const current = queryClient.getQueryData(queryKeys.programs.byCreator(user.uid)) || [];
      if (current.length === 0) setIsEditMode(false);
    } catch (err) {
      logger.error('Error deleting program:', err);
      showToast('Error al eliminar el programa. Por favor, intenta de nuevo.', 'error');
    }
  }, [programToDelete, deleteConfirmation, user, deleteProgramMutation, handleCloseDeleteModal, queryClient, showToast]);

  const handleCardClick = useCallback((program) => {
    const deliveryT = program.deliveryType || 'low_ticket';
    navigate(`/programs/${program.id}`, {
      state: { returnTo: '/products', returnState: { productType: deliveryT } },
    });
  }, [navigate]);

  const isOneOnOneCreate = location.pathname === '/products/new' && deliveryType === 'one_on_one';
  const isBusy = createProgramMutation.isPending || isUploadingImage || isUploadingIntroVideo || isUploadingTutorials;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <DashboardLayout screenName={isOneOnOneCreate ? 'Nuevo programa general (1-on-1)' : 'Programas'}>
        <div className="programs-content">

          {/* ── Toolbar ── */}
          <div className="programs-toolbar">
            <button
              className={`ps-pill${isEditMode ? ' ps-pill--disabled' : ''}`}
              onClick={handleAddProgram}
              disabled={isEditMode}
              aria-label="Nuevo programa"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
              Nuevo
            </button>
            {programs.length > 0 && (
              <button className="ps-pill" onClick={handleEditToggle}>
                {isEditMode ? 'Listo' : 'Editar'}
              </button>
            )}
          </div>

          {/* ── Content area ── */}
          {isLoading ? (
            <ProgramsGridSkeleton />
          ) : queryError ? (
            <div className="programs-error-state">
              <p>Error al cargar los programas</p>
            </div>
          ) : programs.length === 0 ? (
            <ProgramsEmptyState onAdd={handleAddProgram} />
          ) : (
            <div className="programs-grid">
              {programs.map((program, i) => (
                <ProgramCard
                  key={program.id}
                  program={program}
                  index={i}
                  isEditMode={isEditMode}
                  onDelete={handleDeleteProgram}
                  onClick={handleCardClick}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Create Program Modal ── */}
        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title={deliveryType === 'one_on_one' ? 'Nuevo programa general (1-on-1)' : 'Nuevo programa'}
        >
          <div className="one-on-one-modal-content">
            {deliveryType === 'one_on_one' && (
              <p className="one-on-one-field-note one-on-one-info-note">
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
                    Nombre del Programa <span className="required-asterisk">*</span>
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
                      Disciplina <span className="required-asterisk">*</span>
                    </label>
                    <select
                      className="program-config-dropdown"
                      value={discipline}
                      onChange={(e) => setDiscipline(e.target.value)}
                    >
                      <option value="Fuerza - hipertrofia">Fuerza - hipertrofia</option>
                    </select>
                    <p className="one-on-one-field-note">No se puede cambiar después de la creación</p>
                  </div>

                  {deliveryType !== 'one_on_one' && (
                    <div className="edit-program-input-group">
                      <label className="edit-program-input-label">
                        Tipo <span className="required-asterisk">*</span>
                      </label>
                      <select
                        className="program-config-dropdown"
                        value={programType}
                        onChange={(e) => setProgramType(e.target.value)}
                      >
                        <option value="subscription">Suscripción</option>
                        <option value="one-time">Pago único</option>
                      </select>
                      <p className="one-on-one-field-note">No se puede cambiar después de la creación</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pricing & Duration Section */}
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
                        <div className="programs-duration-row">
                          <div className="programs-duration-input-group">
                            <input
                              type="number"
                              className="duration-input programs-duration-input"
                              value={duration}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10) || 1;
                                if (v >= 1) setDuration(v);
                              }}
                              min="1"
                            />
                            <div className="programs-duration-stepper">
                              <button type="button" onClick={handleDurationIncrement} className="programs-duration-stepper-btn">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                  <path d="M19 9L12 16L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)"/>
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={handleDurationDecrement}
                                disabled={duration <= 1}
                                className="programs-duration-stepper-btn"
                                style={{
                                  backgroundColor: duration <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)',
                                  color: duration <= 1 ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.8)',
                                  cursor: duration <= 1 ? 'not-allowed' : 'pointer',
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                  <path d="M19 9L12 16L5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                          <span className="programs-duration-week-label">{duration === 1 ? 'Semana' : 'Semanas'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="edit-program-input-group">
                        <label className="edit-program-input-label">Duración</label>
                        <div className="programs-subscription-duration">Mensual</div>
                        <p className="one-on-one-field-note">Los programas de suscripción se renuevan mensualmente</p>
                      </div>
                    )}

                    <div className="edit-program-input-group">
                      <label className="edit-program-input-label">Precio</label>
                      <Input
                        placeholder="Ej: 29900"
                        value={price}
                        onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
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
                <div className="programs-visual-content-grid">
                  {/* Image Card */}
                  <div className="program-config-card">
                    <div className="program-config-card-header">
                      <span className="program-config-card-label">Imagen del Programa</span>
                    </div>
                    <div className="program-config-card-content">
                      {programImagePreview ? (
                        <div className="program-config-card-image-container">
                          <img src={programImagePreview} alt="Programa" className="program-config-card-image" />
                          <div className="program-config-card-image-overlay">
                            <div className="program-config-card-image-actions">
                              <button type="button" className="edit-program-image-action-pill" onClick={() => setIsMediaPickerOpen(true)}>
                                <span className="edit-program-image-action-text">Cambiar</span>
                              </button>
                              <button
                                type="button"
                                className="edit-program-image-action-pill edit-program-image-delete-pill"
                                onClick={() => { setProgramImageFile(null); setProgramImagePreview(null); setProgramImageUrlFromLibrary(null); }}
                              >
                                <span className="edit-program-image-action-text">Eliminar</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="programs-image-upload-btn" onClick={() => setIsMediaPickerOpen(true)}>
                          <div className="program-config-card-placeholder">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="programs-placeholder-icon">
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
                            <video src={introVideoPreview} controls className="program-config-card-video" />
                          </div>
                          <div className="programs-video-action-row">
                            <label className="edit-program-image-action-pill">
                              <input
                                type="file"
                                accept="video/*"
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) {
                                    setIntroVideoFile(file);
                                    const reader = new FileReader();
                                    reader.onloadend = () => setIntroVideoPreview(reader.result);
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                className="programs-file-input-hidden"
                                disabled={isUploadingIntroVideo}
                              />
                              <span className="edit-program-image-action-text">{isUploadingIntroVideo ? 'Subiendo...' : 'Cambiar'}</span>
                            </label>
                            {isUploadingIntroVideo && (
                              <div className="edit-program-image-progress">
                                <div className="edit-program-image-progress-bar">
                                  <div className="edit-program-image-progress-fill" style={{ width: `${introVideoUploadProgress}%` }} />
                                </div>
                                <span className="edit-program-image-progress-text">{introVideoUploadProgress}%</span>
                              </div>
                            )}
                            <button
                              className="edit-program-image-action-pill edit-program-image-delete-pill"
                              onClick={() => { setIntroVideoFile(null); setIntroVideoPreview(null); }}
                              disabled={isUploadingIntroVideo}
                            >
                              <span className="edit-program-image-action-text">Eliminar</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <label className="programs-file-label">
                          <input
                            type="file"
                            accept="video/*"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (file) {
                                setIntroVideoFile(file);
                                const reader = new FileReader();
                                reader.onloadend = () => setIntroVideoPreview(reader.result);
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="programs-file-input-hidden"
                            disabled={isUploadingIntroVideo}
                          />
                          <div className="program-config-card-placeholder">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="programs-placeholder-icon">
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
                <div className="one-on-one-config-item">
                  <label className="edit-program-input-label programs-config-toggle-label">
                    <span>Prueba Gratis</span>
                    <label className="elegant-toggle">
                      <input type="checkbox" checked={freeTrialActive} onChange={(e) => setFreeTrialActive(e.target.checked)} />
                      <span className="elegant-toggle-slider" />
                    </label>
                  </label>
                  <p className="one-on-one-config-description">Permite a los usuarios probar el programa gratis antes de comprarlo</p>
                  {freeTrialActive && (
                    <div className="programs-free-trial-sub">
                      <label className="edit-program-input-label programs-free-trial-sub-label">Duración de la prueba gratis (días)</label>
                      <Input
                        placeholder="Ej: 7"
                        value={freeTrialDurationDays}
                        onChange={(e) => setFreeTrialDurationDays(e.target.value.replace(/\D/g, ''))}
                        type="text"
                        light={true}
                      />
                    </div>
                  )}
                </div>

                <div className="programs-config-options-grid">
                  <div className="one-on-one-config-item">
                    <label className="edit-program-input-label programs-config-toggle-label">
                      <span>Sugerencias de Peso</span>
                      <label className="elegant-toggle">
                        <input type="checkbox" checked={weightSuggestions} onChange={(e) => setWeightSuggestions(e.target.checked)} />
                        <span className="elegant-toggle-slider" />
                      </label>
                    </label>
                    <p className="one-on-one-config-description">Muestra sugerencias automáticas de peso basadas en entrenamientos anteriores</p>
                  </div>
                </div>

                <div className="edit-program-input-group programs-libraries-group">
                  <label className="edit-program-input-label">Bibliotecas Disponibles</label>
                  <p className="one-on-one-field-note programs-library-field-note">
                    Selecciona las bibliotecas de ejercicios que estarán disponibles para construir este programa
                  </p>
                  {availableLibraries.length === 0 ? (
                    <div className="one-on-one-empty-state">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="programs-empty-state-icon">
                        <path d="M4 19.5C4 18.837 4.26339 18.2011 4.73223 17.7322C5.20107 17.2634 5.83696 17 6.5 17H20M4 19.5C4 20.163 4.26339 20.7989 4.73223 21.2678C5.20107 21.7366 5.83696 22 6.5 22H20M4 19.5V9.5M20 19.5V9.5M20 19.5L18 17M4 19.5L6 17M4 9.5C4 8.83696 4.26339 8.20107 4.73223 7.73223C5.20107 7.26339 5.83696 7 6.5 7H20C20.663 7 21.2989 7.26339 21.7678 7.73223C22.2366 8.20107 22.5 8.83696 22.5 9.5V19.5C22.5 20.163 22.2366 20.7989 21.7678 21.2678C21.2989 21.7366 20.663 22 20 22H6.5C5.83696 22 5.20107 21.7366 4.73223 21.2678C4.26339 20.7989 4 20.163 4 19.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <p>No tienes bibliotecas disponibles</p>
                      <p className="programs-empty-state-subtext">Crea una biblioteca primero desde la pestaña "Ejercicios"</p>
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
                                const next = new Set(prev);
                                next.has(library.id) ? next.delete(library.id) : next.add(library.id);
                                return next;
                              });
                            }}
                            className={`one-on-one-library-item ${isSelected ? 'one-on-one-library-item-selected' : ''}`}
                          >
                            <div className="programs-library-item-inner">
                              {isSelected && (
                                <div className="one-on-one-library-check">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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

            {/* Tutorials */}
            <div className="one-on-one-modal-section">
              <div className="one-on-one-modal-section-header">
                <h3 className="one-on-one-modal-section-title">Tutoriales</h3>
                <span className="one-on-one-modal-section-badge-optional">Opcional</span>
              </div>
              <div className="one-on-one-modal-section-content">
                <p className="one-on-one-config-description programs-tutorials-description">
                  Videos que verán los usuarios la primera vez que entren a cada pantalla de la app (MP4, M4V o MOV).
                </p>
                <div className="programs-tutorials-list">
                  {TUTORIAL_SCREENS.map(({ key, label }) => (
                    <div key={key} className="one-on-one-config-item programs-tutorial-item">
                      <label className="edit-program-input-label programs-tutorial-label">{label}</label>
                      <label className="programs-tutorial-upload-label">
                        <input
                          type="file"
                          accept="video/mp4,video/x-m4v,video/quicktime,.mp4,.m4v,.mov"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            setTutorialFiles(prev => ({ ...prev, [key]: file || null }));
                          }}
                          className="programs-file-input-hidden"
                        />
                        <span className="edit-program-image-action-pill programs-tutorial-upload-pill">
                          {tutorialFiles[key] ? tutorialFiles[key].name : 'Subir video'}
                        </span>
                      </label>
                      {tutorialFiles[key] && (
                        <button
                          type="button"
                          onClick={() => setTutorialFiles(prev => ({ ...prev, [key]: null }))}
                          className="edit-program-image-action-pill edit-program-image-delete-pill programs-tutorial-remove-btn"
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
                title={isBusy ? 'Creando...' : 'Crear Programa'}
                onClick={handleCreateProgram}
                disabled={!programName.trim() || !discipline || !programType || isBusy}
                loading={isBusy}
              />
              <p className="one-on-one-modal-help-text">
                Los campos marcados con <span className="programs-required-star">*</span> son requeridos. Podrás agregar contenido después de crear el programa.
              </p>
            </div>
          </div>
        </Modal>

        {/* ── Program Type Selection Modal ── */}
        <Modal
          isOpen={isProgramTypeSelectionModalOpen}
          onClose={handleCloseProgramTypeSelectionModal}
          title="Tipo de programa"
        >
          <div className="program-type-selection-modal-content">
            <p className="program-type-selection-instruction">Selecciona el tipo de programa que deseas crear:</p>
            <div className="program-type-selection-options">
              <button className="program-type-selection-option" onClick={handleSelectLowTicket}>
                <div className="program-type-selection-option-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
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

        {/* ── Delete Program Modal ── */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={handleCloseDeleteModal}
          title={programToDelete?.title || 'Eliminar programa'}
        >
          <div className="modal-program-content">
            <p className="delete-instruction-text">Para confirmar, escribe el nombre del programa:</p>
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
            <p className="delete-warning-text">Esta acción es irreversible. El programa se eliminará permanentemente.</p>
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
    </ErrorBoundary>
  );
};

export default ProgramsScreen;
