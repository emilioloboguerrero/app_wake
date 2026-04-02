import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import { ProgressiveRevealProvider } from '../contexts/ProgressiveRevealContext';
import { Revealable, RevealProgressBar } from '../components/guide';
import ShimmerSkeleton from '../components/ui/ShimmerSkeleton';
import { FullScreenError, GlowingEffect } from '../components/ui';
import ExerciseListSidebar from '../components/biblioteca/ExerciseListSidebar';
import ExerciseVideoPanel from '../components/biblioteca/ExerciseVideoPanel';
import InteractiveMusclePanel from '../components/biblioteca/InteractiveMusclePanel';
import MediaPickerModal from '../components/MediaPickerModal';
import libraryService from '../services/libraryService';
import { cacheConfig } from '../config/queryClient';
import logger from '../utils/logger';
import { useToast } from '../contexts/ToastContext';
import useConfirm from '../hooks/useConfirm';
import { detectVideoSource } from '../utils/videoUtils';
import './LibraryExercisesScreen.css';

const LibraryExercisesScreen = () => {
  const { libraryId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const queryClient = useQueryClient();
  const backPath = location.state?.returnTo || '/content';
  const backState = location.state?.returnState ?? {};

  // UI state
  const [selectedExerciseName, setSelectedExerciseName] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [addExerciseStep, setAddExerciseStep] = useState('name');
  const [newExerciseName, setNewExerciseName] = useState('');
  const addExerciseInputRef = useRef(null);

  // Video state
  const [showVideoPicker, setShowVideoPicker] = useState(false);

  // ─── Data fetching ─────────────────────────────────────────────────────
  const { data: libraryData, isLoading, error: loadError } = useQuery({
    queryKey: ['library', 'detail', libraryId],
    queryFn: () => libraryService.getLibraryById(libraryId),
    enabled: !!user && !!libraryId,
    ...cacheConfig.libraries,
  });

  const library = libraryData ?? null;
  const error = loadError?.message ?? (!isLoading && !libraryData ? 'Biblioteca no encontrada' : null);

  // Derive exercises from query data
  const exercises = useMemo(() => {
    if (!libraryData) return [];
    return libraryService.getExercisesFromLibrary(libraryData).sort((a, b) => a.name.localeCompare(b.name));
  }, [libraryData]);

  const selectedExercise = useMemo(
    () => exercises.find(ex => ex.name === selectedExerciseName) || null,
    [exercises, selectedExerciseName]
  );

  // Sort order from server data — only changes when server data refreshes (after save)
  const muscleSortOrder = useMemo(() => {
    const activation = selectedExercise?.data?.muscle_activation || {};
    return Object.entries(activation)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m);
  }, [selectedExercise?.data?.muscle_activation]);

  // All custom implements across library exercises (for the picker)
  const allCustomImplements = useMemo(() => {
    const set = new Set();
    exercises.forEach(ex => {
      if (Array.isArray(ex.data?.implements)) {
        ex.data.implements.forEach(i => set.add(i));
      }
    });
    return Array.from(set);
  }, [exercises]);

  // ─── Draft state (local, updates UI instantly, saves debounced) ────────
  const [draftMuscles, setDraftMuscles] = useState(null);
  const [draftImplements, setDraftImplements] = useState(null);
  const muscleTimerRef = useRef(null);
  const implementsTimerRef = useRef(null);
  const SAVE_DELAY = 1200;

  // Reset drafts when selected exercise changes
  useEffect(() => {
    setDraftMuscles(null);
    setDraftImplements(null);
    if (muscleTimerRef.current) clearTimeout(muscleTimerRef.current);
    if (implementsTimerRef.current) clearTimeout(implementsTimerRef.current);
  }, [selectedExerciseName]);

  // Current values: draft if editing, otherwise from server
  const currentMuscles = draftMuscles ?? selectedExercise?.data?.muscle_activation ?? {};
  const currentImplements = draftImplements ?? selectedExercise?.data?.implements ?? [];

  const hasPendingChanges = draftMuscles !== null || draftImplements !== null;

  // ─── Mutations ─────────────────────────────────────────────────────────
  const invalidateLibrary = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['library', 'detail', libraryId] }),
    [queryClient, libraryId]
  );

  const createExerciseMutation = useMutation({
    mutationKey: ['library-exercises', 'create'],
    mutationFn: (name) => libraryService.createExercise(libraryId, name),
    onSuccess: (_data, name) => {
      invalidateLibrary();
      setAddExerciseStep('success');
      setTimeout(() => {
        setShowAddExercise(false);
        setSelectedExerciseName(name);
      }, 1200);
    },
    onError: (err) => {
      logger.error('Error creating exercise:', err);
      setAddExerciseStep('name');
      showToast('No pudimos crear el ejercicio. Intenta de nuevo.', 'error');
    },
  });

  const deleteExerciseMutation = useMutation({
    mutationKey: ['library-exercises', 'delete'],
    mutationFn: (name) => libraryService.deleteExercise(libraryId, name),
    onSuccess: (_data, name) => {
      if (selectedExerciseName === name) setSelectedExerciseName(null);
      invalidateLibrary();
    },
    onError: (err) => {
      logger.error('Error deleting exercise:', err);
      showToast('No pudimos eliminar el ejercicio. Intenta de nuevo.', 'error');
    },
  });

  const saveMusclesMutation = useMutation({
    mutationKey: ['library-exercises', 'save-muscles'],
    mutationFn: ({ name, muscleActivation }) =>
      libraryService.updateExercise(libraryId, name, { muscle_activation: muscleActivation }),
    onSuccess: async () => {
      await invalidateLibrary();
      setDraftMuscles(null);
    },
    onError: (err) => {
      logger.error('Error saving muscles:', err);
      showToast('No pudimos guardar los músculos. Intenta de nuevo.', 'error');
    },
  });

  const saveImplementsMutation = useMutation({
    mutationFn: ({ name, implements: impl }) =>
      libraryService.updateExercise(libraryId, name, { implements: impl }),
    onSuccess: async () => {
      await invalidateLibrary();
      setDraftImplements(null);
    },
    onError: (err) => {
      logger.error('Error saving implements:', err);
      showToast('No pudimos guardar los implementos. Intenta de nuevo.', 'error');
    },
  });

  // Flush pending saves immediately (used when switching exercises)
  const flushPendingSaves = useCallback(() => {
    if (muscleTimerRef.current) clearTimeout(muscleTimerRef.current);
    if (implementsTimerRef.current) clearTimeout(implementsTimerRef.current);

    if (draftMuscles !== null && selectedExerciseName) {
      saveMusclesMutation.mutate({ name: selectedExerciseName, muscleActivation: draftMuscles });
    }
    if (draftImplements !== null && selectedExerciseName) {
      saveImplementsMutation.mutate({ name: selectedExerciseName, implements: draftImplements });
    }
  }, [draftMuscles, draftImplements, selectedExerciseName, saveMusclesMutation, saveImplementsMutation]);

  // ─── Handlers ──────────────────────────────────────────────────────────
  const handleSelectExercise = useCallback((exercise) => {
    flushPendingSaves();
    setSelectedExerciseName(prev => prev === exercise.name ? null : exercise.name);
  }, [flushPendingSaves]);

  const handleAddExercise = useCallback(() => {
    setShowAddExercise(true);
    setAddExerciseStep('name');
    setNewExerciseName('');
    setTimeout(() => addExerciseInputRef.current?.focus(), 300);
  }, []);

  const handleCreateExercise = useCallback(() => {
    const name = newExerciseName.trim();
    if (!name) return;

    const exists = exercises.some(ex => ex.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      showToast('Ya existe un ejercicio con ese nombre.', 'error');
      return;
    }

    setAddExerciseStep('creating');
    createExerciseMutation.mutate(name);
  }, [newExerciseName, exercises, createExerciseMutation, showToast]);

  const handleDeleteExercise = useCallback(async (exercise) => {
    const ok = await confirm(`¿Eliminar "${exercise.name}"?`);
    if (!ok) return;
    deleteExerciseMutation.mutate(exercise.name);
  }, [confirm, deleteExerciseMutation]);

  const handleMuscleChange = useCallback((newActivation) => {
    if (!selectedExerciseName) return;
    setDraftMuscles(newActivation);

    if (muscleTimerRef.current) clearTimeout(muscleTimerRef.current);
    const name = selectedExerciseName;
    muscleTimerRef.current = setTimeout(() => {
      saveMusclesMutation.mutate({ name, muscleActivation: newActivation });
    }, SAVE_DELAY);
  }, [selectedExerciseName, saveMusclesMutation]);

  const handleImplementsChange = useCallback((newImplements) => {
    if (!selectedExerciseName) return;
    setDraftImplements(newImplements);

    if (implementsTimerRef.current) clearTimeout(implementsTimerRef.current);
    const name = selectedExerciseName;
    implementsTimerRef.current = setTimeout(() => {
      saveImplementsMutation.mutate({ name, implements: newImplements });
    }, SAVE_DELAY);
  }, [selectedExerciseName, saveImplementsMutation]);

  const handleVideoSelect = useCallback(async (selected) => {
    if (!selectedExercise || !libraryId) return;

    // External link (YouTube/Vimeo) selected from MediaPickerModal
    if (selected.contentType === 'video/external') {
      try {
        if (selectedExercise.data?.video_path) {
          try {
            await libraryService.deleteExerciseVideo(libraryId, selectedExercise.name);
          } catch (_err) {
            // Storage file may not exist, continue
          }
        }

        await libraryService.updateExercise(libraryId, selectedExercise.name, {
          video_url: selected.url,
          video_source: selected.videoSource,
          video_path: null,
        });

        await invalidateLibrary();
      } catch (err) {
        logger.error('Error saving video link:', err);
        showToast('No pudimos guardar el enlace. Intenta de nuevo.', 'error');
      }
      return;
    }

    // Internal video from media library — use its URL directly
    try {
      if (selectedExercise.data?.video_path) {
        try {
          await libraryService.deleteExerciseVideo(libraryId, selectedExercise.name);
        } catch (_err) {
          // Storage file may not exist, continue
        }
      }

      await libraryService.updateExercise(libraryId, selectedExercise.name, {
        video_url: selected.url,
        video_source: 'upload',
        video_path: null,
      });

      await invalidateLibrary();
    } catch (err) {
      logger.error('Error setting video from library:', err);
      showToast('No pudimos asignar el video. Intenta de nuevo.', 'error');
    }
  }, [selectedExercise, libraryId, invalidateLibrary, showToast]);

  const deleteLibraryMutation = useMutation({
    mutationFn: () => libraryService.deleteLibrary(libraryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
      showToast('Biblioteca eliminada', 'success');
      navigate(backPath, { state: backState });
    },
    onError: () => {
      showToast('No pudimos eliminar la biblioteca. Intenta de nuevo.', 'error');
    },
  });

  const handleDeleteLibrary = useCallback(async () => {
    const count = exercises.length;
    const msg = count > 0
      ? `¿Eliminar "${library?.title || 'esta biblioteca'}" y sus ${count} ejercicio${count === 1 ? '' : 's'}? Esta acción no se puede deshacer.`
      : `¿Eliminar "${library?.title || 'esta biblioteca'}"? Esta acción no se puede deshacer.`;
    const ok = await confirm(msg);
    if (!ok) return;
    deleteLibraryMutation.mutate();
  }, [exercises.length, library?.title, confirm, deleteLibraryMutation]);

  const handleVideoDelete = useCallback(async () => {
    if (!selectedExercise || !libraryId) return;

    const ok = await confirm('¿Eliminar el video de este ejercicio?');
    if (!ok) return;

    try {
      await libraryService.deleteExerciseVideo(libraryId, selectedExercise.name);
      await invalidateLibrary();
    } catch (err) {
      logger.error('Error deleting video:', err);
      showToast('No pudimos eliminar el video. Intenta de nuevo.', 'error');
    }
  }, [selectedExercise, libraryId, confirm, invalidateLibrary, showToast]);

  // ─── Loading / Error states ────────────────────────────────────────────
  if (isLoading) {
    return (
      <ErrorBoundary>
        <DashboardLayout screenName={library?.title || 'Entrenamiento'} showBackButton backPath={backPath} backState={backState}>
          <div className="lex-content">
            <div className="lex-library-actions">
              <ShimmerSkeleton width="150px" height="30px" borderRadius="8px" />
            </div>
            <div className="lex-body">
              {/* Sidebar skeleton */}
              <div className="lex-skeleton-sidebar">
                <div className="lex-skeleton-sidebar-header">
                  <ShimmerSkeleton width="90px" height="15px" borderRadius="4px" />
                  <ShimmerSkeleton width="32px" height="32px" borderRadius="8px" />
                </div>
                <div className="lex-skeleton-sidebar-search">
                  <ShimmerSkeleton width="100%" height="30px" borderRadius="6px" />
                </div>
                <div className="lex-skeleton-sidebar-list">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="lex-skeleton-sidebar-item">
                      <ShimmerSkeleton width={`${50 + (i % 3) * 15}%`} height="13px" borderRadius="4px" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Workspace skeleton */}
              <div className="lex-skeleton-workspace">
                <ShimmerSkeleton width="180px" height="20px" borderRadius="6px" />
                <div className="lex-skeleton-workspace-columns">
                  {/* Video panel placeholder */}
                  <div className="lex-skeleton-video">
                    <ShimmerSkeleton width="100%" height="100%" borderRadius="12px" />
                  </div>
                  {/* Muscle panel placeholder */}
                  <div className="lex-skeleton-muscle">
                    <ShimmerSkeleton width="100%" height="70%" borderRadius="12px" />
                    <ShimmerSkeleton width="100%" height="28%" borderRadius="12px" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DashboardLayout>
      </ErrorBoundary>
    );
  }

  if (error || !library) {
    return (
      <DashboardLayout screenName="Entrenamiento" showBackButton backPath={backPath} backState={backState}>
        <FullScreenError title="No se pudo cargar la biblioteca" message={error || 'Biblioteca no encontrada'} onRetry={() => navigate(0)} />
      </DashboardLayout>
    );
  }

  const videoUrl = selectedExercise?.data?.video_url || selectedExercise?.data?.video || null;
  const videoSource = selectedExercise?.data?.video_source || null;

  return (
    <ErrorBoundary>
      <ProgressiveRevealProvider screenKey="library-exercises">
      <DashboardLayout screenName={library.title} showBackButton backPath={backPath} backState={backState}>
        <div className="lex-content">
          <div className="lex-library-actions">
            <button
              type="button"
              className="lex-delete-library-btn"
              onClick={handleDeleteLibrary}
              disabled={deleteLibraryMutation.isPending}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              {deleteLibraryMutation.isPending ? 'Eliminando...' : 'Eliminar biblioteca'}
            </button>
          </div>
          <div className="lex-body">
            <Revealable step="exercise-sidebar">
              <ExerciseListSidebar
                exercises={exercises}
                selectedName={selectedExerciseName}
                onSelect={handleSelectExercise}
                onAdd={handleAddExercise}
                onDelete={handleDeleteExercise}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </Revealable>

            <Revealable step="workspace">
              <div className="lex-workspace">
                {!selectedExercise ? (
                  <div className="lex-workspace-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 17l10 5 10-5" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p className="lex-workspace-empty-text">Selecciona un ejercicio para editar</p>
                    <button type="button" className="lex-workspace-empty-btn" onClick={handleAddExercise}>
                      + Nuevo ejercicio
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="lex-workspace-header">
                      <h2 className="lex-workspace-title">{selectedExercise.name}</h2>
                    </div>

                    <div className="lex-workspace-main">
                      <div className="lex-workspace-columns">
                        <Revealable step="video-panel">
                          <ExerciseVideoPanel
                            videoUrl={videoUrl}
                            videoSource={videoSource}
                            onPickVideo={() => setShowVideoPicker(true)}
                            onDelete={handleVideoDelete}
                            onDropSelect={handleVideoSelect}
                          />
                        </Revealable>

                        <InteractiveMusclePanel
                          muscleActivation={currentMuscles}
                          muscleSortOrder={muscleSortOrder}
                          onChange={handleMuscleChange}
                          isSaving={saveMusclesMutation.isPending}
                          implements={currentImplements}
                          allCustomImplements={allCustomImplements}
                          onImplementsChange={handleImplementsChange}
                          isSavingImplements={saveImplementsMutation.isPending}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Revealable>
          </div>
        </div>

        {showAddExercise && (
          <div className="cfo-overlay" onClick={addExerciseStep === 'name' ? () => setShowAddExercise(false) : undefined}>
            <div className="cfo-card" onClick={(e) => e.stopPropagation()}>
              <GlowingEffect spread={40} borderWidth={1} />

              <div className="cfo-topbar">
                <div />
                {addExerciseStep === 'name' && (
                  <button type="button" className="cfo-close" onClick={() => setShowAddExercise(false)} aria-label="Cerrar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                )}
              </div>

              <div className="cfo-body">
                {addExerciseStep === 'name' && (
                  <div className="cfo-step" key="ex-name">
                    <div className="cfo-step__header">
                      <h1 className="cfo-step__title">Nuevo ejercicio</h1>
                      <p className="cfo-step__desc">Despues podras agregar video, musculos e implementos.</p>
                    </div>
                    <div className="cfo-step__content">
                      <input
                        ref={addExerciseInputRef}
                        className="cfo-name-input"
                        type="text"
                        placeholder="Ej: Press de banca, Sentadilla bulgara..."
                        value={newExerciseName}
                        onChange={(e) => setNewExerciseName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && newExerciseName.trim()) handleCreateExercise(); }}
                        maxLength={80}
                      />
                    </div>
                    <div className="cfo-footer" style={{ justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="cfo-next-btn"
                        onClick={handleCreateExercise}
                        disabled={!newExerciseName.trim()}
                      >
                        Crear ejercicio
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                  </div>
                )}

                {addExerciseStep === 'creating' && (
                  <div className="cfo-step cfo-step--center" key="ex-creating">
                    <div className="cfo-spinner" />
                    <p className="cfo-status-text">Creando ejercicio</p>
                  </div>
                )}

                {addExerciseStep === 'success' && (
                  <div className="cfo-step cfo-step--center" key="ex-success">
                    <div className="cfo-check-wrap">
                      <svg className="cfo-check-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
                        <circle className="cfo-check-circle" cx="24" cy="24" r="22" stroke="rgba(74,222,128,0.8)" strokeWidth="2.5" />
                        <path className="cfo-check-path" d="M14 25l7 7 13-14" stroke="rgba(74,222,128,0.9)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h2 className="cfo-success-title">Ejercicio creado</h2>
                    <p className="cfo-success-desc">Agrega video, musculos e implementos.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {ConfirmModal}

        <MediaPickerModal
          isOpen={showVideoPicker}
          onClose={() => setShowVideoPicker(false)}
          onSelect={handleVideoSelect}
          accept="video/*"
        />
        <RevealProgressBar />
      </DashboardLayout>
      </ProgressiveRevealProvider>
    </ErrorBoundary>
  );
};

export default LibraryExercisesScreen;
