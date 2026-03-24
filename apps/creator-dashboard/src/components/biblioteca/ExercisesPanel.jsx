import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import SkewedCards from '../ui/SkewedCards';
import Modal from '../Modal';
import Input from '../Input';
import Button from '../Button';
import PanelShell from './PanelShell';
import ShimmerSkeleton from '../ui/ShimmerSkeleton';
import libraryService from '../../services/libraryService';
import { cacheConfig, queryKeys } from '../../config/queryClient';
import { useToast } from '../../contexts/ToastContext';

function ExercisesPanelSkeleton() {
  return (
    <div className="bib-library-skewed-wrap">
      <div className="skewed-cards-grid" style={{ animation: 'none' }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={`skewed-card skewed-card--pos-${i}`}
            style={{ pointerEvents: 'none' }}
          >
            <div className="skewed-card-overlay" />
            <div className="skewed-card-row">
              <ShimmerSkeleton width="50%" height="16px" borderRadius="6px" />
            </div>
            <ShimmerSkeleton width="35%" height="13px" borderRadius="4px" />
          </div>
        ))}
      </div>
    </div>
  );
}

function isComplete(ex) {
  const hasVideo = !!(ex.video_url || ex.video);
  const hasMuscles = ex.muscle_activation && Object.keys(ex.muscle_activation).length > 0;
  const hasImplements = Array.isArray(ex.implements) && ex.implements.length > 0;
  return hasVideo && hasMuscles && hasImplements;
}

export default function ExercisesPanel({ searchQuery = '', onCreateLibrary }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [quickAddLibrary, setQuickAddLibrary] = useState(null);
  const [newExerciseName, setNewExerciseName] = useState('');

  const { data: exercises = [], isLoading: exLoading, isError: exError } = useQuery({
    queryKey: queryKeys.library.exercises(user?.uid),
    queryFn: () => libraryService.getExercises(),
    enabled: !!user?.uid,
    ...cacheConfig.programStructure,
  });

  const { data: libraries = [], isLoading: libLoading } = useQuery({
    queryKey: queryKeys.library.libraries(user?.uid),
    queryFn: () => libraryService.getLibrariesByCreator(),
    enabled: !!user?.uid,
    ...cacheConfig.programStructure,
  });

  const isLoading = exLoading || libLoading;

  // Group exercises by library
  const exercisesByLibrary = useMemo(() => {
    const map = {};
    for (const ex of exercises) {
      const libId = ex.libraryId;
      if (!libId) continue;
      if (!map[libId]) map[libId] = [];
      map[libId].push(ex);
    }
    return map;
  }, [exercises]);

  // Filter libraries by search query
  const q = searchQuery.trim().toLowerCase();
  const filteredLibraries = useMemo(() => {
    if (!q) return libraries;
    return libraries.filter(lib => {
      if (lib.title?.toLowerCase().includes(q)) return true;
      const libExercises = exercisesByLibrary[lib.id] || [];
      return libExercises.some(ex => ex.name?.toLowerCase().includes(q));
    });
  }, [libraries, q, exercisesByLibrary]);

  // Quick-add mutation
  const createExerciseMutation = useMutation({
    mutationFn: ({ libraryId, name }) => libraryService.createExercise(libraryId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.library.exercises(user?.uid) });
      queryClient.invalidateQueries({ queryKey: queryKeys.library.libraries(user?.uid) });
    },
    onError: (err) => {
      showToast('No pudimos crear el ejercicio. Intenta de nuevo.', 'error');
    },
  });

  const handleNavigate = useCallback((libraryId) => {
    navigate(`/libraries/${libraryId}`, {
      state: { returnTo: '/content', returnState: { domain: 'entrenamiento', tab: 'ejercicios' } },
    });
  }, [navigate]);

  const handleQuickAdd = useCallback((library) => {
    setQuickAddLibrary(library);
    setNewExerciseName('');
  }, []);

  const handleCreateExercise = useCallback(async () => {
    const name = newExerciseName.trim();
    if (!name || !quickAddLibrary) return;

    const libExercises = exercisesByLibrary[quickAddLibrary.id] || [];
    if (libExercises.some(ex => ex.name?.toLowerCase() === name.toLowerCase())) {
      showToast('Ya existe un ejercicio con ese nombre en esta biblioteca.', 'error');
      return;
    }

    await createExerciseMutation.mutateAsync({ libraryId: quickAddLibrary.id, name });
    setQuickAddLibrary(null);
    setNewExerciseName('');
  }, [newExerciseName, quickAddLibrary, exercisesByLibrary, createExerciseMutation, showToast]);

  return (
    <PanelShell
      isLoading={isLoading}
      isError={exError}
      isEmpty={!filteredLibraries.length && !isLoading}
      emptyTitle="No tienes bibliotecas de ejercicios"
      emptySub="Crea una biblioteca de ejercicios para organizar tus ejercicios."
      emptyCta="+ Nueva biblioteca"
      onCta={onCreateLibrary || (() => navigate('/libraries'))}
      onRetry={() => window.location.reload()}
      renderSkeleton={() => <ExercisesPanelSkeleton />}
    >
      <div className="bib-library-skewed-wrap">
        <SkewedCards
          cards={filteredLibraries.map((lib, i) => {
            const libExercises = exercisesByLibrary[lib.id] || [];
            const total = libExercises.length;
            const incomplete = libExercises.filter(ex => !isComplete(ex)).length;

            return {
              key: lib.id,
              title: lib.title || 'Sin título',
              description: `${total} ${total === 1 ? 'ejercicio' : 'ejercicios'}${incomplete > 0 ? ` · ${incomplete} incompletos` : ''}`,
              className: `skewed-card--pos-${Math.min(i, 3)} skewed-card--grayscale`,
              onClick: () => handleNavigate(lib.id),
            };
          })}
        />
      </div>

      {/* Quick-add exercise modal */}
      <Modal
        isOpen={!!quickAddLibrary}
        onClose={() => setQuickAddLibrary(null)}
        title={`Nuevo ejercicio en ${quickAddLibrary?.title || ''}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            value={newExerciseName}
            onChange={(e) => setNewExerciseName(e.target.value)}
            placeholder="Nombre del ejercicio — ej: Press de banca"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateExercise()}
            autoFocus
          />
          <Button
            title="Crear ejercicio"
            onClick={handleCreateExercise}
            disabled={!newExerciseName.trim() || createExerciseMutation.isPending}
            loading={createExerciseMutation.isPending}
          />
        </div>
      </Modal>
    </PanelShell>
  );
}
