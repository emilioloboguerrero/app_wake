import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { GlowingEffect, SkeletonCard, VirtualList, FullScreenError } from '../ui';
import libraryService from '../../services/libraryService';
import { cacheConfig, queryKeys } from '../../config/queryClient';

const MUSCLE_DISPLAY = {
  pecs: 'Pectorales',
  front_delts: 'Deltoides Frontales',
  side_delts: 'Deltoides Laterales',
  rear_delts: 'Deltoides Post.',
  triceps: 'Tríceps',
  traps: 'Trapecios',
  abs: 'Abdominales',
  lats: 'Dorsales',
  rhomboids: 'Romboides',
  biceps: 'Bíceps',
  forearms: 'Antebrazos',
  quads: 'Cuádriceps',
  glutes: 'Glúteos',
  hamstrings: 'Isquiotibiales',
  calves: 'Gemelos',
  hip_flexors: 'Flexores de Cadera',
  obliques: 'Oblicuos',
  lower_back: 'Lumbar',
  neck: 'Cuello',
};

function getExerciseMissing(ex) {
  const missing = [];
  if (!ex.video_url && !ex.video) missing.push('Video demostrativo');
  if (!ex.muscle_activation || Object.keys(ex.muscle_activation).length === 0) missing.push('Activación muscular');
  if (!ex.implements || (Array.isArray(ex.implements) && ex.implements.length === 0)) missing.push('Implementos');
  return missing;
}

function getPrimaryMuscle(ex) {
  if (ex.primaryMuscles?.length) return ex.primaryMuscles[0];
  if (ex.muscle_activation) {
    const entries = Object.entries(ex.muscle_activation);
    if (entries.length) {
      const top = entries.sort((a, b) => b[1] - a[1])[0];
      return top[0];
    }
  }
  return null;
}

function ExerciseRow({ exercise }) {
  const [calloutOpen, setCalloutOpen] = useState(false);
  const missing = useMemo(() => getExerciseMissing(exercise), [exercise]);
  const isComplete = missing.length === 0;
  const muscle = getPrimaryMuscle(exercise);
  const muscleLabel = muscle ? (MUSCLE_DISPLAY[muscle] || muscle) : null;

  const handleDotClick = useCallback((e) => {
    e.stopPropagation();
    if (!isComplete) setCalloutOpen((v) => !v);
  }, [isComplete]);

  return (
    <div className={`lib-exercise-row ${calloutOpen ? 'lib-exercise-row--open' : ''}`}>
      <GlowingEffect disabled={!calloutOpen} spread={28} borderWidth={1} />
      <div className="lib-exercise-row-inner">
        <button
          className="lib-completeness-dot"
          style={{
            background: isComplete
              ? 'rgba(74,222,128,0.6)'
              : 'rgba(251,191,36,0.8)',
          }}
          onClick={handleDotClick}
          aria-label={isComplete ? 'Ejercicio completo' : 'Ver campos faltantes'}
          title={isComplete ? 'Completo' : 'Incompleto — click para detalles'}
        />
        <span className="lib-exercise-name">{exercise.name || 'Sin nombre'}</span>
        {muscleLabel && (
          <span className="lib-muscle-pill">{muscleLabel}</span>
        )}
      </div>
      {!isComplete && (
        <div
          className={`lib-exercise-callout ${calloutOpen ? 'lib-exercise-callout--visible' : ''}`}
          aria-hidden={!calloutOpen}
        >
          <p className="lib-callout-title">A este ejercicio le falta: {missing.join(', ').toLowerCase()}.</p>
          <p className="lib-callout-sub">No es obligatorio, pero mejora la experiencia de tus clientes.</p>
        </div>
      )}
    </div>
  );
}

function SkeletonRows({ count = 6 }) {
  return (
    <div className="lib-skeleton-rows">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

function EmptyState({ onCta }) {
  return (
    <div className="lib-empty">
      <p className="lib-empty-title">Tu biblioteca de ejercicios esta vacia</p>
      <p className="lib-empty-sub">Crea ejercicios y usalos en tus sesiones.</p>
      <button className="lib-empty-cta" onClick={onCta}>+ Nueva biblioteca</button>
    </div>
  );
}

export default function ExercisesPanel({ searchQuery = '' }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: exercises = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.library.exercises(user?.uid),
    queryFn: () => libraryService.getExercises(),
    enabled: !!user?.uid,
    ...cacheConfig.programStructure,
  });

  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? exercises.filter((e) => e.name?.toLowerCase().includes(q)) : exercises),
    [exercises, q]
  );

  if (isLoading) return <SkeletonRows />;
  if (isError) return <FullScreenError title="No se pudo cargar la biblioteca" message="Verifica tu conexion e intenta de nuevo." onRetry={() => window.location.reload()} />;
  if (!filtered.length) return <EmptyState onCta={() => navigate('/libraries')} />;

  return (
    <div className="lib-exercise-list">
      <VirtualList
        items={filtered}
        itemHeight={62}
        height={Math.max(300, window.innerHeight - 380)}
        renderItem={(ex, index, style) => (
          <div key={ex.id || ex.name} style={style}>
            <ExerciseRow exercise={ex} />
          </div>
        )}
      />
    </div>
  );
}
