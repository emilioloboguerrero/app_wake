import React, { useState, useEffect, useRef, useCallback, useMemo, startTransition } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import debounce from 'lodash/debounce';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import MediaPickerModal from '../components/MediaPickerModal';
import Button from '../components/Button';
import Input from '../components/Input';
import MeasuresObjectivesEditorModal from '../components/MeasuresObjectivesEditorModal';
import programService from '../services/programService';
import measureObjectivePresetsService from '../services/measureObjectivePresetsService';
import plansService from '../services/plansService';
import libraryService from '../services/libraryService';
import programAnalyticsService from '../services/programAnalyticsService';
import { deleteField } from 'firebase/firestore';
import {
  useProgram,
  useModules,
  useSessions,
  useExercises,
  useCreateModule,
  useUpdateModuleOrder,
  useDeleteModule,
  useCreateSession,
  useUpdateSessionOrder,
  useCreateExercise,
  useUpdateExercise,
  useDeleteExercise,
  useUpdateExerciseOrder,
} from '../hooks/usePrograms';
import {
  useProgramRealtime,
  useModuleSessionsRealtime,
  useSessionExercisesRealtime,
} from '../hooks/useProgramRealtime';
import { queryKeys, cacheConfig } from '../config/queryClient';
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, LabelList, ComposedChart
} from 'recharts';
import { getAccessDurationLabel, getAccessTypeLabel, getStatusLabel, getDurationLabel } from '../utils/durationHelper';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './ProgramDetailScreen.css';

const TAB_CONFIG = [
  { key: 'lab', title: 'Lab', navLabel: 'Resumen', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19.5 3.5L18 2L4.5 15.5L2 22L8.5 19.5L19.5 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 6L18 11M8 11L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  )},
  { key: 'configuracion', title: 'Configuración', navLabel: 'Ajustes', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.0113 9.77251C4.28059 9.5799 4.48571 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.95653 6.85425 4.10405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15H19.4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  )},
  { key: 'contenido', title: 'Contenido', navLabel: 'Contenido', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.7519 11.1679L11.5547 9.03647C10.8901 8.59343 10 9.06982 10 9.86852V14.1315C10 14.9302 10.8901 15.4066 11.5547 14.9635L14.7519 12.8321C15.3457 12.4362 15.3457 11.5638 14.7519 11.1679Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  )},
];

const TUTORIAL_SCREENS = [
  { key: 'dailyWorkout', label: 'Entrenamiento diario' },
  { key: 'workoutExecution', label: 'Ejecución del entrenamiento' },
  { key: 'workoutCompletion', label: 'Completar entrenamiento' },
  { key: 'warmup', label: 'Calentamiento' },
];

// Stat explanations for Lab page
const STAT_EXPLANATIONS = {
  'totalEnrolled': {
    title: 'Total Inscritos',
    description: 'Número total de usuarios que se han inscrito en este programa, incluyendo activos, expirados, cancelados y pruebas gratuitas.'
  },
  'activeEnrollments': {
    title: 'Activos',
    description: 'Usuarios con inscripción activa. Un usuario se considera activo si su estado es "active" y su fecha de expiración no ha pasado.'
  },
  'trialUsers': {
    title: 'Pruebas Gratis',
    description: 'Número de usuarios que están usando o han usado una prueba gratuita del programa.'
  },
  'expiredEnrollments': {
    title: 'Expirados',
    description: 'Usuarios cuyas inscripciones han expirado. Esto incluye usuarios cuya fecha de expiración ha pasado y no están cancelados.'
  },
  'cancelledEnrollments': {
    title: 'Cancelados',
    description: 'Usuarios que han cancelado su suscripción al programa.'
  },
  'recentEnrollments30Days': {
    title: 'Últimos 30 días',
    description: 'Número de nuevas inscripciones en los últimos 30 días.'
  },
  'averageEnrollmentDurationDays': {
    title: 'Duración Promedio (días)',
    description: 'Duración promedio de las inscripciones, calculada desde la fecha de compra hasta la fecha de expiración.'
  },
  'totalSessionsCompleted': {
    title: 'Sesiones Completadas',
    description: 'Número total de sesiones completadas por todos los usuarios inscritos en el programa.'
  },
  'averageSessionsPerUser': {
    title: 'Promedio por Usuario',
    description: 'Número promedio de sesiones completadas por usuario inscrito en el programa.'
  },
  'completionRate': {
    title: 'Tasa de Finalización',
    description: 'Porcentaje de usuarios inscritos que han completado al menos una sesión del programa.'
  },
  'usersWithAtLeastOneSession': {
    title: 'Usuarios Activos',
    description: 'Número de usuarios que han completado al menos una sesión. Un usuario se considera activo si ha completado al menos una sesión del programa.'
  },
  'totalCompletions': {
    title: 'Total Completadas',
    description: 'Número total de veces que se han completado sesiones del programa por todos los usuarios.'
  },
  'averageDuration': {
    title: 'Duración Promedio',
    description: 'Tiempo promedio que los usuarios tardan en completar una sesión, calculado en minutos y segundos.'
  },
  'mostCompletedSession': {
    title: 'Más Completada',
    description: 'La sesión que ha sido completada más veces por los usuarios del programa.'
  },
  'leastCompletedSession': {
    title: 'Menos Completada',
    description: 'La sesión que ha sido completada menos veces por los usuarios del programa.'
  },
  'totalUniqueExercises': {
    title: 'Ejercicios Únicos Realizados',
    description: 'Número total de ejercicios diferentes que han sido realizados al menos una vez por los usuarios del programa.'
  },
  'totalModules': {
    title: 'Módulos',
    description: 'Número total de módulos que contiene el programa.'
  },
  'totalSessions': {
    title: 'Sesiones',
    description: 'Número total de sesiones que contiene el programa, sumando todas las sesiones de todos los módulos.'
  },
  'totalExercises': {
    title: 'Ejercicios',
    description: 'Número total de ejercicios que contiene el programa, sumando todos los ejercicios de todas las sesiones.'
  },
  'averageExercisesPerSession': {
    title: 'Promedio Ejercicios/Sesión',
    description: 'Número promedio de ejercicios por sesión en el programa.'
  },
  'usersWithZeroSessions': {
    title: '0 Sesiones',
    description: 'Número de usuarios inscritos que no han completado ninguna sesión del programa.'
  },
  'usersWithOneToFiveSessions': {
    title: '1-5 Sesiones',
    description: 'Número de usuarios que han completado entre 1 y 5 sesiones del programa.'
  },
  'usersWithSixToTenSessions': {
    title: '6-10 Sesiones',
    description: 'Número de usuarios que han completado entre 6 y 10 sesiones del programa.'
  },
  'usersWithTenPlusSessions': {
    title: '10+ Sesiones',
    description: 'Número de usuarios que han completado 10 o más sesiones del programa.'
  },
  'averageWeeklyStreak': {
    title: 'Racha Semanal Promedio',
    description: 'Promedio de semanas consecutivas que los usuarios han completado según los requisitos de la racha semanal del programa.'
  }
};

const getLibraryExerciseKey = (libraryId, exerciseName) => `${libraryId || ''}::${exerciseName || ''}`;

const isLibraryExerciseDataComplete = (exerciseData) => {
  if (!exerciseData) return false;
  
  const hasVideo = Boolean(exerciseData.video_url || exerciseData.video);
  const hasMuscles = Boolean(exerciseData.muscle_activation && Object.keys(exerciseData.muscle_activation).length > 0);
  const hasImplements = Boolean(exerciseData.implements && Array.isArray(exerciseData.implements) && exerciseData.implements.length > 0);
  
  return hasVideo && hasMuscles && hasImplements;
};

const getPrimaryReferences = (exercise) => {
  if (!exercise || typeof exercise.primary !== 'object' || exercise.primary === null) {
    return [];
  }
  
  return Object.entries(exercise.primary)
    .filter(([libraryId, exerciseName]) => Boolean(libraryId) && Boolean(exerciseName))
    .map(([libraryId, exerciseName]) => ({
      libraryId,
      exerciseName,
    }));
};

const getAlternativeReferences = (exercise) => {
  if (!exercise || typeof exercise.alternatives !== 'object' || exercise.alternatives === null || Array.isArray(exercise.alternatives)) {
    return [];
  }
  
  const references = [];
  
  Object.entries(exercise.alternatives).forEach(([libraryId, values]) => {
    if (!libraryId || !Array.isArray(values)) {
      return;
    }
    
    values.forEach((value) => {
      if (typeof value === 'string' && value.trim()) {
        references.push({ libraryId, exerciseName: value });
      } else if (value && typeof value === 'object') {
        const derivedName = value.name || value.title || value.id || '';
        if (derivedName) {
          references.push({ libraryId, exerciseName: derivedName });
        }
      }
    });
  });
  
  return references;
};

const getExerciseLibraryReferences = (exercise) => {
  return [
    ...getPrimaryReferences(exercise),
    ...getAlternativeReferences(exercise),
  ];
};

// Sortable Series Card Component
const SortableSeriesCard = ({ set, setIndex, isSeriesEditMode, isExpanded, onToggleExpansion, onDeleteSet, onDuplicateSet, objectivesFields, getObjectiveDisplayName, handleUpdateSetValue, hasUnsavedChanges, onSaveSetChanges, isSavingSetChanges, parseIntensityForDisplay }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: set.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Get set number from order field, fallback to index + 1
  const setNumber = (set.order !== undefined && set.order !== null) ? set.order + 1 : setIndex + 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`exercise-series-card ${isSeriesEditMode ? 'exercise-series-card-edit-mode' : ''} ${isDragging ? 'exercise-series-card-dragging' : ''}`}
    >
      {isSeriesEditMode && (
        <button
          className="exercise-series-delete-button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteSet(set);
          }}
        >
          <span className="exercise-series-delete-icon">−</span>
        </button>
      )}
      {isSeriesEditMode && (
        <div
          className="exercise-series-drag-handle"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="9" cy="5" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="5" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="19" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="19" r="1.5" fill="currentColor"/>
          </svg>
        </div>
      )}
      <button
        className="exercise-series-card-header"
        onClick={() => onToggleExpansion(set.id)}
      >
        <span className="exercise-series-number">{setNumber}</span>
        <span className="exercise-series-info">
          {`Serie ${setNumber}`}
        </span>
        <div className="exercise-series-header-right">
          {!isSeriesEditMode && (
            <button
              className="exercise-series-duplicate-button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateSet(set);
              }}
            >
              <span className="exercise-series-duplicate-icon">⧉</span>
            </button>
          )}
          {hasUnsavedChanges && (
            <button
              className="exercise-series-save-button"
              onClick={(e) => {
                e.stopPropagation();
                onSaveSetChanges(set.id);
              }}
              disabled={isSavingSetChanges}
            >
              <span className="exercise-series-save-text">
                {isSavingSetChanges ? 'Guardando...' : 'Guardar'}
              </span>
            </button>
          )}
          <svg
            className={`exercise-series-expand-icon ${isExpanded ? 'expanded' : ''}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>
      
      {isExpanded && (
        <div className="exercise-series-content">
          {/* Headers row */}
          <div className="exercise-series-inputs-row exercise-series-headers-row">
            <div className="exercise-series-set-number-space"></div>
            <div className="exercise-series-inputs-container">
              {objectivesFields.map((field) => (
                <div key={field} className="exercise-series-input-group">
                  <span className="exercise-series-input-label">
                    {getObjectiveDisplayName(field)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Input row for this set */}
          <div className="exercise-series-inputs-row">
            <div className="exercise-series-set-number-container">
              <span className="exercise-series-set-number">{setNumber}</span>
            </div>
            <div className="exercise-series-inputs-container">
              {objectivesFields.map((field) => (
                <div key={field} className="exercise-series-input-group">
                  {field === 'intensity' ? (
                    <div className="exercise-series-intensity-input-wrapper">
                      <input
                        type="text"
                        className="exercise-series-input exercise-series-intensity-input"
                        placeholder="--"
                        value={parseIntensityForDisplay(set[field])}
                        onChange={(e) => handleUpdateSetValue(setIndex, field, e.target.value)}
                        maxLength={2}
                      />
                      <span className="exercise-series-intensity-suffix">/10</span>
                    </div>
                  ) : (
                    <input
                      type="text"
                      className="exercise-series-input"
                      placeholder="--"
                      value={set[field] !== undefined && set[field] !== null ? String(set[field]) : ''}
                      onChange={(e) => handleUpdateSetValue(setIndex, field, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Sortable Exercise Card Component
const SortableExerciseCard = ({ exercise, isExerciseEditMode, onDeleteExercise, exerciseIndex, isExerciseIncomplete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exercise.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Extract title from primary field (map of library IDs to titles)
  const getExerciseTitle = () => {
    if (exercise.primary && typeof exercise.primary === 'object') {
      // Get the first value from the primary map
      const primaryValues = Object.values(exercise.primary);
      if (primaryValues.length > 0 && primaryValues[0]) {
        return primaryValues[0];
      }
    }
    // Fallback to name, title, or id
    return exercise.name || exercise.title || `Ejercicio ${exercise.id?.slice(0, 8) || ''}`;
  };

  // Get exercise number from order field, fallback to index + 1
  const exerciseNumber = (exercise.order !== undefined && exercise.order !== null) ? exercise.order + 1 : exerciseIndex + 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`exercise-card ${isExerciseEditMode ? 'exercise-card-edit-mode' : ''} ${isDragging ? 'exercise-card-dragging' : ''}`}
    >
      {!isExerciseEditMode && isExerciseIncomplete(exercise) && (
        <div className="exercise-incomplete-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      <div className="exercise-card-number">{exerciseNumber}</div>
      {isExerciseEditMode && (
        <>
          <button
            className="exercise-delete-button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteExercise(exercise);
            }}
          >
            <span className="exercise-delete-icon">−</span>
          </button>
          <div
            className="exercise-drag-handle"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="9" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="19" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="19" r="1.5" fill="currentColor"/>
            </svg>
          </div>
        </>
      )}
      <div className="exercise-card-header">
        <div className="exercise-card-title-row">
          <h3 className="exercise-card-title">
            {getExerciseTitle()}
          </h3>
        </div>
      </div>
      {exercise.video_url && (
        <div className="exercise-card-video">
          <video
            src={exercise.video_url}
            controls
            className="exercise-card-video-player"
          />
        </div>
      )}
    </div>
  );
};

// Sortable Module Card Component
const SortableModuleCard = ({ module, isModuleEditMode, onModuleClick, onDeleteModule, moduleIndex, isModuleIncomplete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const moduleNumber = (module.order !== undefined && module.order !== null) ? module.order + 1 : moduleIndex + 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`module-card ${isModuleEditMode ? 'module-card-edit-mode' : ''} ${isDragging ? 'module-card-dragging' : ''}`}
      onClick={() => onModuleClick(module)}
    >
      <div className="module-card-number">{moduleNumber}</div>
      {!isModuleEditMode && isModuleIncomplete && (
        <div className="module-incomplete-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      {isModuleEditMode && (
        <>
          <button
            className="module-delete-button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteModule(module);
            }}
          >
            <span className="module-delete-icon">−</span>
          </button>
          <div
            className="module-drag-handle"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="9" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="19" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="19" r="1.5" fill="currentColor"/>
            </svg>
          </div>
        </>
      )}
      <div className="module-card-header">
        <h3 className="module-card-title">
          {module.title || `Semana ${moduleNumber}`}
        </h3>
        {module.description && (
          <p className="module-card-description">{module.description}</p>
        )}
      </div>
      <div className="module-card-footer">
        {/* TODO: Add module count or other info */}
      </div>
    </div>
  );
};

// Sortable Session Card Component
const SortableSessionCard = ({ session, isSessionEditMode, onSessionClick, onDeleteSession, sessionIndex, isSessionIncomplete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: session.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const cardStyle = {
    ...style,
    ...(session.image_url ? {
      backgroundImage: `url(${session.image_url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    } : {})
  };

  const sessionNumber = (session.order !== undefined && session.order !== null) ? session.order + 1 : sessionIndex + 1;

  return (
    <div
      ref={setNodeRef}
      style={cardStyle}
      className={`session-card ${isSessionEditMode ? 'session-card-edit-mode' : ''} ${isDragging ? 'session-card-dragging' : ''} ${session.image_url ? 'session-card-with-image' : ''}`}
      onClick={() => onSessionClick(session)}
    >
      <div className="session-card-number">{sessionNumber}</div>
      {!isSessionEditMode && isSessionIncomplete && (
        <div className="session-incomplete-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
      {isSessionEditMode && (
        <>
          <button
            className="session-delete-button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteSession(session);
            }}
          >
            <span className="session-delete-icon">−</span>
          </button>
          <div
            className="session-drag-handle"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="9" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="9" cy="19" r="1.5" fill="currentColor"/>
              <circle cx="15" cy="19" r="1.5" fill="currentColor"/>
            </svg>
          </div>
        </>
      )}
      <div className="session-card-header">
        <h3 className="session-card-title">
          {session.title || session.name || `Sesión ${session.id.slice(0, 8)}`}
        </h3>
      </div>
    </div>
  );
};

const ProgramDetailScreen = () => {
  const { programId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  
  const [selectedUserInfo, setSelectedUserInfo] = useState(null);
  const [isUserInfoModalOpen, setIsUserInfoModalOpen] = useState(false);
  const [statExplanation, setStatExplanation] = useState(null);
  const [isStatExplanationModalOpen, setIsStatExplanationModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [priceValue, setPriceValue] = useState('');
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);
  const [isDurationModalOpen, setIsDurationModalOpen] = useState(false);
  const [durationValue, setDurationValue] = useState(0);
  const [isUpdatingDuration, setIsUpdatingDuration] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');
  const [isUpdatingDescription, setIsUpdatingDescription] = useState(false);
  const [isEditProgramModalOpen, setIsEditProgramModalOpen] = useState(false);
  const [programNameValue, setProgramNameValue] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [isUpdatingProgram, setIsUpdatingProgram] = useState(false);
  const [isStreakModalOpen, setIsStreakModalOpen] = useState(false);
  const [streakEnabled, setStreakEnabled] = useState(false);
  const [minimumSessionsPerWeek, setMinimumSessionsPerWeek] = useState(0);
  const [isUpdatingStreak, setIsUpdatingStreak] = useState(false);
  const [isWeightSuggestionsModalOpen, setIsWeightSuggestionsModalOpen] = useState(false);
  const [weightSuggestionsEnabled, setWeightSuggestionsEnabled] = useState(false);
  const [isUpdatingWeightSuggestions, setIsUpdatingWeightSuggestions] = useState(false);
  const [isFreeTrialModalOpen, setIsFreeTrialModalOpen] = useState(false);
  const [freeTrialActive, setFreeTrialActive] = useState(false);
  const [freeTrialDurationDays, setFreeTrialDurationDays] = useState('0');
  const [isUpdatingFreeTrial, setIsUpdatingFreeTrial] = useState(false);
  const [isAuxiliaryLibrariesModalOpen, setIsAuxiliaryLibrariesModalOpen] = useState(false);
  const [availableLibraries, setAvailableLibraries] = useState([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState(new Set());
  const [isLoadingLibraries, setIsLoadingLibraries] = useState(false);
  const [isUpdatingAuxiliaryLibraries, setIsUpdatingAuxiliaryLibraries] = useState(false);
  const [isAnunciosModalOpen, setIsAnunciosModalOpen] = useState(false);
  const [selectedScreen, setSelectedScreen] = useState(null);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);
  const [isUploadingAnuncioVideo, setIsUploadingAnuncioVideo] = useState(false);
  const [anuncioVideoUploadProgress, setAnuncioVideoUploadProgress] = useState(0);
  const [isAnuncioVideoEditMode, setIsAnuncioVideoEditMode] = useState(false);
  const [isAnuncioVideoPlaying, setIsAnuncioVideoPlaying] = useState(false);
  const [isIntroVideoModalOpen, setIsIntroVideoModalOpen] = useState(false);
  const [isUploadingIntroVideo, setIsUploadingIntroVideo] = useState(false);
  const [introVideoUploadProgress, setIntroVideoUploadProgress] = useState(0);
  const [isIntroVideoEditMode, setIsIntroVideoEditMode] = useState(false);
  const [isIntroVideoPlaying, setIsIntroVideoPlaying] = useState(false);
  const [isModuleEditMode, setIsModuleEditMode] = useState(false);
  const [selectedModule, setSelectedModule] = useState(null);
  const [sessions, setSessions] = useState([]);
  // isLoadingSessions now comes from useSessions hook
  const [isSessionEditMode, setIsSessionEditMode] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [exercises, setExercises] = useState([]);
  // isLoadingExercises now comes from useExercises hook
  const [exerciseSetsMap, setExerciseSetsMap] = useState({}); // Map: exerciseId -> sets array
  const [sessionIncompleteMap, setSessionIncompleteMap] = useState({}); // Map: sessionId -> boolean
  const [moduleIncompleteMap, setModuleIncompleteMap] = useState({}); // Map: moduleId -> boolean
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isCopySessionModalOpen, setIsCopySessionModalOpen] = useState(false);
  const [copySessionModalPage, setCopySessionModalPage] = useState('biblioteca'); // 'crear' | 'biblioteca'
  const [sessionToEdit, setSessionToEdit] = useState(null);
  const [sessionName, setSessionName] = useState('');
  const [sessionImageFile, setSessionImageFile] = useState(null);
  const [sessionImagePreview, setSessionImagePreview] = useState(null);
  const [sessionImageUrlFromLibrary, setSessionImageUrlFromLibrary] = useState(null);
  const [isUploadingSessionImage, setIsUploadingSessionImage] = useState(false);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [mediaPickerContext, setMediaPickerContext] = useState('program'); // 'program' | 'session'
  const [sessionImageUploadProgress, setSessionImageUploadProgress] = useState(0);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);
  const [isDeleteSessionModalOpen, setIsDeleteSessionModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [deleteSessionConfirmation, setDeleteSessionConfirmation] = useState('');
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  // ✅ NEW: Library session states
  const [librarySessions, setLibrarySessions] = useState([]);
  const [isLoadingLibrarySessions, setIsLoadingLibrarySessions] = useState(false);
  const [isEditingLibrarySession, setIsEditingLibrarySession] = useState(false);
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [isCopyModuleModalOpen, setIsCopyModuleModalOpen] = useState(false);
  const [copyModuleModalPage, setCopyModuleModalPage] = useState('biblioteca'); // 'crear' | 'biblioteca'
  // ✅ NEW: Library module states
  const [libraryModules, setLibraryModules] = useState([]);
  const [isLoadingLibraryModules, setIsLoadingLibraryModules] = useState(false);
  const [moduleName, setModuleName] = useState('');
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [isDeleteModuleModalOpen, setIsDeleteModuleModalOpen] = useState(false);
  const [moduleToDelete, setModuleToDelete] = useState(null);
  const [deleteModuleConfirmation, setDeleteModuleConfirmation] = useState('');
  const [isDeletingModule, setIsDeletingModule] = useState(false);
  const [isUpdatingModuleOrder, setIsUpdatingModuleOrder] = useState(false);
  const [isUpdatingSessionOrder, setIsUpdatingSessionOrder] = useState(false);
  const [originalModulesOrder, setOriginalModulesOrder] = useState([]);
  const [originalSessionsOrder, setOriginalSessionsOrder] = useState([]);
  const [isExerciseEditMode, setIsExerciseEditMode] = useState(false);
  const [isUpdatingExerciseOrder, setIsUpdatingExerciseOrder] = useState(false);
  const [originalExercisesOrder, setOriginalExercisesOrder] = useState([]);
  const [isDeleteExerciseModalOpen, setIsDeleteExerciseModalOpen] = useState(false);
  const [exerciseToDelete, setExerciseToDelete] = useState(null);
  const [deleteExerciseConfirmation, setDeleteExerciseConfirmation] = useState('');
  const [isDeletingExercise, setIsDeletingExercise] = useState(false);
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [isCreateExerciseModalOpen, setIsCreateExerciseModalOpen] = useState(false);
  const [newExerciseDraft, setNewExerciseDraft] = useState(null);
  const [newExerciseSets, setNewExerciseSets] = useState([]);
  const [numberOfSetsForNewExercise, setNumberOfSetsForNewExercise] = useState(3);
  const [newExerciseDefaultSetValues, setNewExerciseDefaultSetValues] = useState({});
  const [showPerSetCardsNewExercise, setShowPerSetCardsNewExercise] = useState(false);
  const [isCreatingNewExercise, setIsCreatingNewExercise] = useState(false);
  const [isCreatingExercise, setIsCreatingExercise] = useState(false); // Track if we're creating a new exercise in the main modal
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [selectedExerciseTab, setSelectedExerciseTab] = useState('general');
  const [exerciseDraft, setExerciseDraft] = useState(null);
  const [libraryTitles, setLibraryTitles] = useState({}); // Map: libraryId -> library title
  const [libraryDataCache, setLibraryDataCache] = useState({}); // Map: libraryId -> full library data
  const [libraryExerciseCompleteness, setLibraryExerciseCompleteness] = useState({}); // Map: libraryId::exerciseName -> boolean
  const libraryDataCacheRef = useRef(libraryDataCache);
  const libraryExerciseCompletenessRef = useRef(libraryExerciseCompleteness);
  // Library/Exercise selection modal state
  const [isLibraryExerciseModalOpen, setIsLibraryExerciseModalOpen] = useState(false);
  const [libraryExerciseModalMode, setLibraryExerciseModalMode] = useState(null); // 'primary', 'add-alternative', 'edit-alternative'
  const [availableLibrariesForSelection, setAvailableLibrariesForSelection] = useState([]);
  const [selectedLibraryForExercise, setSelectedLibraryForExercise] = useState(null);
  const [exercisesFromSelectedLibrary, setExercisesFromSelectedLibrary] = useState([]);
  const [isLoadingLibrariesForSelection, setIsLoadingLibrariesForSelection] = useState(false);
  const [isLoadingExercisesFromLibrary, setIsLoadingExercisesFromLibrary] = useState(false);
  const [alternativeToEdit, setAlternativeToEdit] = useState(null); // { libraryId, index } for editing alternatives
  // Edit mode state for alternatives section only (measures/objectives moved to preset card)
  const [isAlternativesEditMode, setIsAlternativesEditMode] = useState(false);
  // Presets: single "Medidas y objetivos" card
  const [presetsList, setPresetsList] = useState([]);
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [isPresetSelectorOpen, setIsPresetSelectorOpen] = useState(false);
  const [isMeasuresObjectivesEditorOpen, setIsMeasuresObjectivesEditorOpen] = useState(false);
  const [editorModalMode, setEditorModalMode] = useState('exercise');
  const [presetBeingEditedId, setPresetBeingEditedId] = useState(null);
  const [appliedPresetId, setAppliedPresetId] = useState(null);
  const [dataEditMenuOpen, setDataEditMenuOpen] = useState(false);
  const dataEditMenuRef = useRef(null);
  // Series/Sets state
  const [expandedSeries, setExpandedSeries] = useState({}); // Map: setId -> boolean
  const [showPerSetCards, setShowPerSetCards] = useState(false);
  const [exerciseSets, setExerciseSets] = useState([]); // Array of sets for the selected exercise
  const [originalExerciseSets, setOriginalExerciseSets] = useState([]); // Original sets when modal opens
  const [unsavedSetChanges, setUnsavedSetChanges] = useState({}); // Map: setId -> boolean (has unsaved changes)
  const [isSeriesEditMode, setIsSeriesEditMode] = useState(false);
  
  // Determine if we're actively editing (any edit mode is active)
  // Must be declared after all edit mode states
  const isActivelyEditing = isModuleEditMode || isSessionEditMode || isExerciseEditMode || isSeriesEditMode;
  
  // Load program data with React Query
  const { data: program, isLoading: programLoading, error: programError } = useProgram(programId, {
    isActive: isActivelyEditing,
  });

  // For 1-on-1 general programs, hide Contenido tab (content is assigned per client)
  const effectiveTabConfig = useMemo(() =>
    program?.deliveryType === 'one_on_one'
      ? TAB_CONFIG.filter((t) => t.key !== 'contenido')
      : TAB_CONFIG,
    [program?.deliveryType]
  );
  const currentTab = effectiveTabConfig[Math.min(currentTabIndex, effectiveTabConfig.length - 1)] ?? effectiveTabConfig[0];

  // Clamp tab index when switching to 1-on-1 (Contenido tab removed)
  useEffect(() => {
    if (currentTabIndex >= effectiveTabConfig.length) {
      setCurrentTabIndex(Math.max(0, effectiveTabConfig.length - 1));
    }
  }, [effectiveTabConfig.length, currentTabIndex]);

  const isConfigTabActive = effectiveTabConfig[currentTabIndex]?.key === 'configuracion';
  // Sync inline config form from program when on Ajustes tab
  useEffect(() => {
    if (!isConfigTabActive || !program) return;
    setProgramNameValue(program.title || '');
    setPriceValue(program.price != null ? String(program.price) : '');
    let dur = 1;
    if (program.duration) {
      const m = typeof program.duration === 'string' ? program.duration.match(/^(\d+)/) : null;
      dur = m ? parseInt(m[1], 10) : (typeof program.duration === 'number' ? program.duration : 1);
    }
    setDurationValue(dur);
    setFreeTrialActive(!!program.free_trial?.active);
    setFreeTrialDurationDays(String(program.free_trial?.duration_days ?? 0));
    setStreakEnabled(!!program.programSettings?.streakEnabled);
    setMinimumSessionsPerWeek(program.programSettings?.minimumSessionsPerWeek ?? 0);
    setWeightSuggestionsEnabled(!!program.weight_suggestions);
    setSelectedLibraryIds(new Set(program.availableLibraries || []));
  }, [isConfigTabActive, program?.id, program?.title, program?.price, program?.duration, program?.free_trial, program?.programSettings, program?.weight_suggestions, program?.availableLibraries]);

  // Load libraries list when on Ajustes tab (for inline libraries section)
  useEffect(() => {
    if (!isConfigTabActive || !program || !user) return;
    libraryService.getLibrariesByCreator(user.uid).then((libs) => setAvailableLibraries(libs || [])).catch((err) => console.error(err));
  }, [isConfigTabActive, program?.id, user?.uid]);

  useEffect(() => {
    if (isPresetSelectorOpen && user?.uid) {
      measureObjectivePresetsService.list(user.uid).then(setPresetsList).catch((err) => {
        console.error('Error loading presets:', err);
        setPresetsList([]);
      });
    }
  }, [isPresetSelectorOpen, user?.uid]);

  useEffect(() => {
    if (!dataEditMenuOpen) return;
    const handleClick = (e) => {
      if (dataEditMenuRef.current && !dataEditMenuRef.current.contains(e.target)) setDataEditMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dataEditMenuOpen]);

  const isLabTabActive = currentTab?.key === 'lab';
  const { data: analytics, isLoading: isLoadingAnalytics, error: analyticsQueryError } = useQuery({
    queryKey: queryKeys.analytics.program(programId),
    queryFn: async () => {
      if (!programId) return null;
      return await programAnalyticsService.getProgramAnalytics(programId);
    },
    enabled: !!programId && isLabTabActive,
    ...cacheConfig.analytics,
  });
  const analyticsError = analyticsQueryError ? 'Error al cargar las estadísticas' : null;

  // Load plans for content source selector (low-ticket only)
  const isLowTicket = program?.deliveryType !== 'one_on_one';
  const { data: plans = [] } = useQuery({
    queryKey: ['plans', user?.uid],
    queryFn: async () => (user ? plansService.getPlansByCreator(user.uid) : []),
    enabled: !!user && !!programId && !!isLowTicket,
  });
  const [contentPlanId, setContentPlanId] = useState(null);
  const [isSavingContentPlan, setIsSavingContentPlan] = useState(false);
  useEffect(() => {
    setContentPlanId(program?.content_plan_id ?? null);
  }, [program?.content_plan_id]);
  const handleContentPlanChange = async (planId) => {
    if (!program?.id) return;
    setIsSavingContentPlan(true);
    try {
      await programService.updateProgram(program.id, { content_plan_id: planId || null });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, content_plan_id: planId || null }));
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.withCounts(programId) });
      setContentPlanId(planId || null);
    } catch (err) {
      alert(err.message || 'Error al actualizar');
    } finally {
      setIsSavingContentPlan(false);
    }
  };

  // Load modules with React Query (use counts for initial load)
  const { data: modulesData = [], isLoading: isLoadingModules } = useModules(programId, {
    isActive: isActivelyEditing,
    useCounts: true, // Use optimized version with counts
  });
  
  // Sort and set modules (maintain local state for drag-and-drop)
  const [modules, setModules] = useState([]);
  
  // Helper function to check exercise completeness (defined early to avoid initialization errors)
  // This is used in multiple useEffects before checkExerciseIncomplete is defined
  // Note: Library completeness check is skipped here (will be checked later when library data loads)
  const checkExerciseCompletenessInline = useCallback((exercise, sets) => {
    if (!exercise) return true;
    
    // Check primary exercise
    let hasPrimary = false;
    if (exercise.primary && typeof exercise.primary === 'object' && exercise.primary !== null) {
      try {
        const primaryValues = Object.values(exercise.primary);
        if (primaryValues.length > 0 && primaryValues[0]) {
          hasPrimary = true;
        }
      } catch (error) {}
    }
    if (!hasPrimary) return true;
    // Library completeness check is done separately via isExerciseIncomplete function
    
    // Check alternatives
    const alternatives = exercise.alternatives && typeof exercise.alternatives === 'object' && exercise.alternatives !== null && !Array.isArray(exercise.alternatives)
      ? exercise.alternatives
      : {};
    const alternativesCount = Object.values(alternatives).reduce((sum, arr) => {
      return sum + (Array.isArray(arr) ? arr.length : 0);
    }, 0);
    if (alternativesCount === 0) return true;
    // Library completeness check is done separately via isExerciseIncomplete function
    
    // Check measures
    const hasMeasures = Array.isArray(exercise.measures) && exercise.measures.length > 0;
    if (!hasMeasures) return true;
    
    // Check objectives
    const objectives = Array.isArray(exercise.objectives) ? exercise.objectives : [];
    if (objectives.length === 0) return true;
    
    // Check sets
    if (sets.length === 0) return true;
    
    // Check that sets have required data filled
    const validObjectives = objectives.filter(obj => obj !== 'previous');
    if (validObjectives.length > 0) {
      const allSetsHaveData = sets.every(set => {
        return validObjectives.some(obj => {
          const value = set[obj];
          return value !== null && value !== undefined && value !== '';
        });
      });
      if (!allSetsHaveData) return true;
    }
    
    return false;
  }, []);
  
  // Memoize sorted modules to avoid re-sorting on every render
  const sortedModules = useMemo(() => {
    if (modulesData.length === 0) return [];
    return [...modulesData].sort((a, b) => {
      const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
      const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
      return orderA - orderB;
    });
  }, [modulesData]);

  useEffect(() => {
    if (sortedModules.length > 0) {
      setModules(sortedModules);
      
      // Use denormalized completeness flags if available
      const moduleStatuses = {};
      const modulesWithFlags = sortedModules.filter(module => 
        module.isComplete !== undefined && module.isComplete !== null
      );
      
      modulesWithFlags.forEach(module => {
        moduleStatuses[module.id] = !module.isComplete;
      });
      
      if (Object.keys(moduleStatuses).length > 0) {
        setModuleIncompleteMap(prev => ({ ...prev, ...moduleStatuses }));
      }
      
      // If not all modules have denormalized flags, check completeness for modules without flags
      // This happens in the background and doesn't block the UI
      const modulesNeedingCheck = sortedModules.filter(module => 
        module.isComplete === undefined || module.isComplete === null
      );
      
      if (modulesNeedingCheck.length > 0) {
        // Check completeness for modules without flags (background check)
        // This runs asynchronously after component is fully rendered, so checkModuleIncomplete will be available
        const checkModulesCompleteness = async () => {
          const moduleStatusesToCheck = {};
          
          // Check each module that needs checking
          for (const module of modulesNeedingCheck) {
            try {
              // Use checkModuleIncomplete which is defined later in the component
              // Since this runs asynchronously, the function will be available
              const sessionsData = await programService.getSessionsByModule(programId, module.id);
              const sortedSessions = sessionsData.sort((a, b) => {
                const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
                const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
                return orderA - orderB;
              });
              
              // Check if any session is incomplete
              let moduleIncomplete = false;
              for (const session of sortedSessions) {
                // Check session completeness by loading exercises and sets
                const exercisesData = await programService.getExercisesBySession(programId, module.id, session.id);
                if (exercisesData.length === 0) {
                  moduleIncomplete = true;
                  break;
                }
                
                // Load sets for all exercises
                const setsMap = {};
                await Promise.all(
                  exercisesData.map(async (exercise) => {
                    try {
                      const setsData = await programService.getSetsByExercise(
                        programId,
                        module.id,
                        session.id,
                        exercise.id
                      );
                      setsMap[exercise.id] = setsData;
                    } catch (err) {
                      setsMap[exercise.id] = [];
                    }
                  })
                );
                
                // Check if any exercise is incomplete
                const hasIncomplete = exercisesData.some(exercise => {
                  const sets = setsMap[exercise.id] || [];
                  return checkExerciseCompletenessInline(exercise, sets);
                });
                
                if (hasIncomplete) {
                  moduleIncomplete = true;
                  break;
                }
              }
              
              moduleStatusesToCheck[module.id] = moduleIncomplete;
            } catch (err) {
              console.error(`Error checking module ${module.id} completeness:`, err);
              moduleStatusesToCheck[module.id] = false; // Default to complete on error
            }
          }
          
          // Update module incomplete map
          setModuleIncompleteMap(prev => ({
            ...prev,
            ...moduleStatuses,
            ...moduleStatusesToCheck
          }));
        };
        
        // Run in background (don't await)
        checkModulesCompleteness();
      }
    }
  }, [sortedModules, programId, checkExerciseCompletenessInline]);
  
  const loading = programLoading;
  const error = programError ? 'Error al cargar el programa' : null;
  const [isUpdatingSeriesOrder, setIsUpdatingSeriesOrder] = useState(false);
  const [originalSeriesOrder, setOriginalSeriesOrder] = useState([]);
  const [isCreatingSet, setIsCreatingSet] = useState(false);
  const [isSavingSetChanges, setIsSavingSetChanges] = useState(false);

  const isLibraryExerciseIncomplete = (libraryId, exerciseName) => {
    if (!libraryId || !exerciseName) {
      return false;
    }
    const key = getLibraryExerciseKey(libraryId, exerciseName);
    return libraryExerciseCompleteness[key] === false;
  };

  const hasIncompleteLibraryReference = (references = []) => {
    if (!Array.isArray(references) || references.length === 0) {
      return false;
    }

    return references.some(({ libraryId, exerciseName }) => isLibraryExerciseIncomplete(libraryId, exerciseName));
  };

  const activeExerciseForModal = exerciseDraft || selectedExercise || null;
  const currentExerciseId = activeExerciseForModal?.id || null;
  const draftAlternatives =
    activeExerciseForModal &&
    activeExerciseForModal.alternatives &&
    typeof activeExerciseForModal.alternatives === 'object' &&
    !Array.isArray(activeExerciseForModal.alternatives)
      ? activeExerciseForModal.alternatives
      : {};
  const draftMeasures = Array.isArray(activeExerciseForModal?.measures)
    ? activeExerciseForModal.measures
    : [];
  const draftObjectives = Array.isArray(activeExerciseForModal?.objectives)
    ? activeExerciseForModal.objectives
    : [];
  const draftCustomObjectiveLabels = activeExerciseForModal?.customObjectiveLabels && typeof activeExerciseForModal.customObjectiveLabels === 'object'
    ? activeExerciseForModal.customObjectiveLabels
    : {};
  const draftCustomMeasureLabels = activeExerciseForModal?.customMeasureLabels && typeof activeExerciseForModal.customMeasureLabels === 'object'
    ? activeExerciseForModal.customMeasureLabels
    : {};
  const primaryLibraryReferences = activeExerciseForModal ? getPrimaryReferences(activeExerciseForModal) : [];
  const primaryLibraryReference = primaryLibraryReferences.length > 0 ? primaryLibraryReferences[0] : null;
  const isPrimaryLibraryIncomplete = primaryLibraryReference
    ? isLibraryExerciseIncomplete(primaryLibraryReference.libraryId, primaryLibraryReference.exerciseName)
    : false;

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    libraryDataCacheRef.current = libraryDataCache;
  }, [libraryDataCache]);

  useEffect(() => {
    libraryExerciseCompletenessRef.current = libraryExerciseCompleteness;
  }, [libraryExerciseCompleteness]);

  const fetchLibraryExerciseCompleteness = useCallback(async (references = []) => {
    if (!Array.isArray(references) || references.length === 0) {
      return;
    }

    const uniqueRefs = [];
    const seenKeys = new Set();

    references.forEach(({ libraryId, exerciseName }) => {
      if (!libraryId || !exerciseName) {
        return;
      }
      const key = getLibraryExerciseKey(libraryId, exerciseName);
      if (libraryExerciseCompletenessRef.current[key] !== undefined || seenKeys.has(key)) {
        return;
      }
      seenKeys.add(key);
      uniqueRefs.push({ libraryId, exerciseName, key });
    });

    if (uniqueRefs.length === 0) {
      return;
    }

    const librariesToFetch = Array.from(
      new Set(
        uniqueRefs
          .map(({ libraryId }) => libraryId)
          .filter((libraryId) => !Object.prototype.hasOwnProperty.call(libraryDataCacheRef.current, libraryId))
      )
    );

    let fetchedLibraries = {};
    if (librariesToFetch.length > 0) {
      const results = await Promise.all(
        librariesToFetch.map(async (libraryId) => {
            try {
              const library = await libraryService.getLibraryById(libraryId);
              return { libraryId, data: library || null };
            } catch (error) {
              console.error('Error fetching library data:', error);
              return { libraryId, data: null };
            }
        })
      );

      fetchedLibraries = results.reduce((acc, { libraryId, data }) => {
        acc[libraryId] = data;
        return acc;
      }, {});

      if (results.length > 0) {
        setLibraryDataCache((prev) => {
          let hasChange = false;
          const next = { ...prev };
          results.forEach(({ libraryId, data }) => {
            if (!Object.prototype.hasOwnProperty.call(prev, libraryId)) {
              next[libraryId] = data;
              hasChange = true;
            }
          });
          if (hasChange) {
            libraryDataCacheRef.current = next;
            return next;
          }
          return prev;
        });
      }
    }

    const completenessUpdates = {};

    uniqueRefs.forEach(({ libraryId, exerciseName, key }) => {
      const libraryData = Object.prototype.hasOwnProperty.call(libraryDataCacheRef.current, libraryId)
        ? libraryDataCacheRef.current[libraryId]
        : fetchedLibraries[libraryId];

      if (!libraryData) {
        completenessUpdates[key] = false;
        return;
      }

      const exerciseData = libraryData[exerciseName];
      completenessUpdates[key] = isLibraryExerciseDataComplete(exerciseData);
    });

    if (Object.keys(completenessUpdates).length > 0) {
      setLibraryExerciseCompleteness((prev) => {
        const next = { ...prev, ...completenessUpdates };
        libraryExerciseCompletenessRef.current = next;
        return next;
      });
    }
  }, []);

  // Verify program ownership
  useEffect(() => {
    if (program && user && program.creator_id !== user.uid) {
      setError('No tienes permiso para ver este programa');
    }
  }, [program, user]);

  // Enable real-time listeners when actively editing
  useProgramRealtime(programId, isActivelyEditing);
  
  // Enable real-time listeners for selected module/session when editing
  useModuleSessionsRealtime(programId, selectedModule?.id, isActivelyEditing && !!selectedModule);
  useSessionExercisesRealtime(programId, selectedModule?.id, selectedSession?.id, isActivelyEditing && !!selectedSession);

  useEffect(() => {
    if (!exercises || exercises.length === 0) {
      return;
    }

    const references = exercises.flatMap((exercise) => getExerciseLibraryReferences(exercise));
    if (references.length === 0) {
      return;
    }

    fetchLibraryExerciseCompleteness(references);
  }, [exercises, fetchLibraryExerciseCompleteness]);

  // Analytics are now loaded via React Query hook above
  // They're automatically cached for 15 minutes and only refetch when stale

  // Handlers for Lab page
  const handleShowStatExplanation = (statKey) => {
    const explanation = STAT_EXPLANATIONS[statKey];
    if (explanation) {
      setStatExplanation(explanation);
      setIsStatExplanationModalOpen(true);
    }
  };

  const handleShowUserInfo = (user) => {
    setSelectedUserInfo(user);
    setIsUserInfoModalOpen(true);
  };

  // Improved metric card with description
  const MetricCard = ({ statKey, value, label, percentageChange, description }) => (
    <div 
      className="lab-metric-card"
      onClick={() => {
        if (STAT_EXPLANATIONS[statKey]) {
          setStatExplanation(STAT_EXPLANATIONS[statKey]);
          setIsStatExplanationModalOpen(true);
        }
      }}
      style={{ cursor: STAT_EXPLANATIONS[statKey] ? 'pointer' : 'default' }}
    >
      <div className="lab-metric-header">
        <div className="lab-metric-value">{value || 0}</div>
        {percentageChange !== null && percentageChange !== undefined && !isNaN(percentageChange) && (
          <div className={`lab-metric-change ${percentageChange >= 0 ? 'lab-metric-change-positive' : 'lab-metric-change-negative'}`}>
            {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="lab-metric-label">{label}</div>
      {description && (
        <div className="lab-metric-description">{description}</div>
      )}
    </div>
  );

  useEffect(() => {
    const sourceExercise = exerciseDraft || selectedExercise;
    if (!sourceExercise) {
      return;
    }

    const references = getExerciseLibraryReferences(sourceExercise);
    if (references.length === 0) {
      return;
    }

    fetchLibraryExerciseCompleteness(references);
  }, [exerciseDraft, selectedExercise, fetchLibraryExerciseCompleteness]);

  const handleTabClick = useCallback((index) => {
    // Prevent tab switching when in edit mode
    if (isModuleEditMode || isSessionEditMode || isExerciseEditMode) return;
    
    if (index === currentTabIndex) return;
    
    // Clear selections when switching away from contenido tab
    const newTab = effectiveTabConfig[index];
    const currentTab = effectiveTabConfig[currentTabIndex];
    if (currentTab?.key === 'contenido' && newTab?.key !== 'contenido') {
      setSelectedModule(null);
      setSelectedSession(null);
      setSessions([]);
      setExercises([]);
      setIsSessionEditMode(false);
    }
    
    setCurrentTabIndex(index);
  }, [isModuleEditMode, isSessionEditMode, isExerciseEditMode, currentTabIndex]);

  const handleStatusPillClick = () => {
    setSelectedStatus(program.status);
    setIsStatusModalOpen(true);
  };

  const handleCloseStatusModal = () => {
    setIsStatusModalOpen(false);
    setSelectedStatus(null);
  };

  const handleStatusChange = async () => {
    if (!program || !selectedStatus || selectedStatus === program.status) {
      handleCloseStatusModal();
      return;
    }

    try {
      setIsUpdatingStatus(true);
      await programService.updateProgram(program.id, { status: selectedStatus });
      
      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          status: selectedStatus
        })
      );
      
      handleCloseStatusModal();
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Error al actualizar el estado del programa');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handlePricePillClick = () => {
    setPriceValue(program.price?.toString() || '');
    setIsPriceModalOpen(true);
  };

  const handleClosePriceModal = () => {
    setIsPriceModalOpen(false);
    setPriceValue('');
  };

  const handlePriceChange = async () => {
    if (!program) {
      handleClosePriceModal();
      return;
    }

    const numericPrice = priceValue === '' ? null : parseInt(priceValue, 10);
    
    // Validate minimum price of 2000
    if (numericPrice !== null && numericPrice < 2000) {
      return; // Silently prevent saving if below 2000
    }

    // If price hasn't changed, just close
    if (numericPrice === program.price) {
      handleClosePriceModal();
      return;
    }

    try {
      setIsUpdatingPrice(true);
      await programService.updateProgram(program.id, { price: numericPrice });
      
      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          price: numericPrice
        })
      );
      
      handleClosePriceModal();
    } catch (err) {
      console.error('Error updating price:', err);
      alert('Error al actualizar el precio del programa');
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  const isOneTimePayment = () => {
    if (!program || !program.access_duration) return false;
    return program.access_duration !== 'monthly';
  };

  const handleDurationPillClick = () => {
    if (!isOneTimePayment()) return;
    // Extract number from duration string (e.g., "4 semanas" -> 4) or use the number directly
    let initialValue = 1;
    if (program.duration) {
      if (typeof program.duration === 'string') {
        const match = program.duration.match(/^(\d+)/);
        initialValue = match ? parseInt(match[1], 10) : 1;
      } else {
        initialValue = program.duration;
      }
    }
    setDurationValue(initialValue);
    setIsDurationModalOpen(true);
  };

  const handleCloseDurationModal = () => {
    setIsDurationModalOpen(false);
    setDurationValue(0);
  };

  const handleEditProgramClick = () => {
    if (!program) return;
    setProgramNameValue(program.title || '');
    setIsEditProgramModalOpen(true);
  };

  const handleCloseEditProgramModal = () => {
    setIsEditProgramModalOpen(false);
    setProgramNameValue('');
    setImageUploadProgress(0);
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !program) {
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

    try {
      setIsUploadingImage(true);
      setImageUploadProgress(0);

      const imageURL = await programService.uploadProgramImage(
        program.id,
        file,
        (progress) => {
          setImageUploadProgress(Math.round(progress));
        }
      );

      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          image_url: imageURL
        })
      );

      setImageUploadProgress(100);
    } catch (err) {
      console.error('Error uploading image:', err);
      alert('Error al subir la imagen. Por favor, intenta de nuevo.');
    } finally {
      setIsUploadingImage(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleImageDelete = async () => {
    if (!program || !program.image_path) {
      return;
    }

    if (!window.confirm('¿Estás seguro de que quieres eliminar la imagen del programa?')) {
      return;
    }

    try {
      await programService.deleteProgramImage(program.id, program.image_path);
      
      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          image_url: null,
          image_path: null
        })
      );
    } catch (err) {
      console.error('Error deleting image:', err);
      alert('Error al eliminar la imagen. Por favor, intenta de nuevo.');
    }
  };

  const handleUpdateProgram = async () => {
    if (!program) return;

    const updates = {};
    if (programNameValue.trim() !== program.title) {
      updates.title = programNameValue.trim();
    }

    if (Object.keys(updates).length === 0) {
      handleCloseEditProgramModal();
      return;
    }

    try {
      setIsUpdatingProgram(true);
      await programService.updateProgram(program.id, updates);
      
      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          ...updates
        })
      );
      
      handleCloseEditProgramModal();
    } catch (err) {
      console.error('Error updating program:', err);
      alert('Error al actualizar el programa');
    } finally {
      setIsUpdatingProgram(false);
    }
  };

  const handleDurationIncrement = () => {
    setDurationValue(prev => prev + 1);
  };

  const handleDurationDecrement = () => {
    if (durationValue > 1) {
      setDurationValue(prev => prev - 1);
    }
  };

  const handleDurationChange = async () => {
    if (!program) {
      handleCloseDurationModal();
      return;
    }

    const durationString = `${durationValue} semanas`;
    const currentDurationString = typeof program.duration === 'string' 
      ? program.duration 
      : program.duration ? `${program.duration} semanas` : null;

    // If duration hasn't changed, just close
    if (durationString === currentDurationString) {
      handleCloseDurationModal();
      return;
    }

    try {
      setIsUpdatingDuration(true);
      await programService.updateProgram(program.id, { duration: durationString });
      
      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          duration: durationString
        })
      );
      
      handleCloseDurationModal();
    } catch (err) {
      console.error('Error updating duration:', err);
      alert('Error al actualizar la duración del programa');
    } finally {
      setIsUpdatingDuration(false);
    }
  };

  const handleStreakPillClick = () => {
    if (!program) return;
    const programSettings = program.programSettings || {};
    setStreakEnabled(programSettings.streakEnabled || false);
    setMinimumSessionsPerWeek(programSettings.minimumSessionsPerWeek || 0);
    setIsStreakModalOpen(true);
  };

  const handleCloseStreakModal = () => {
    setIsStreakModalOpen(false);
    setStreakEnabled(false);
    setMinimumSessionsPerWeek(0);
  };

  const handleUpdateStreak = async () => {
    if (!program) return;

    const programSettings = {
      ...(program.programSettings || {}),
      streakEnabled: streakEnabled,
      minimumSessionsPerWeek: minimumSessionsPerWeek
    };

    try {
      setIsUpdatingStreak(true);
      await programService.updateProgram(program.id, { programSettings });
      
      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          programSettings
        })
      );
      
      handleCloseStreakModal();
    } catch (err) {
      console.error('Error updating streak settings:', err);
      alert('Error al actualizar la configuración de racha');
    } finally {
      setIsUpdatingStreak(false);
    }
  };

  const handleWeightSuggestionsPillClick = () => {
    if (!program) return;
    setWeightSuggestionsEnabled(program.weight_suggestions || false);
    setIsWeightSuggestionsModalOpen(true);
  };

  const handleCloseWeightSuggestionsModal = () => {
    setIsWeightSuggestionsModalOpen(false);
    setWeightSuggestionsEnabled(false);
  };

  const handleUpdateWeightSuggestions = async () => {
    if (!program) return;

    try {
      setIsUpdatingWeightSuggestions(true);
      await programService.updateProgram(program.id, { weight_suggestions: weightSuggestionsEnabled });
      
      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          weight_suggestions: weightSuggestionsEnabled
        })
      );
      
      handleCloseWeightSuggestionsModal();
    } catch (err) {
      console.error('Error updating weight suggestions settings:', err);
      alert('Error al actualizar la configuración de sugerencias de peso');
    } finally {
      setIsUpdatingWeightSuggestions(false);
    }
  };

  const handleFreeTrialPillClick = () => {
    if (!program) return;
    const freeTrial = program.free_trial || {};
    setFreeTrialActive(!!freeTrial.active);
    setFreeTrialDurationDays(
      freeTrial.duration_days !== undefined && freeTrial.duration_days !== null
        ? String(freeTrial.duration_days)
        : '0'
    );
    setIsFreeTrialModalOpen(true);
  };

  const handleCloseFreeTrialModal = () => {
    setIsFreeTrialModalOpen(false);
  };

  const handleFreeTrialDurationInputChange = (value) => {
    if (value === '' || /^\d*$/.test(value)) {
      setFreeTrialDurationDays(value);
    }
  };

  const getParsedFreeTrialDuration = () => {
    const parsed = parseInt(freeTrialDurationDays, 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  };

  const incrementFreeTrialDuration = () => {
    if (!freeTrialActive) return;
    const newValue = getParsedFreeTrialDuration() + 1;
    setFreeTrialDurationDays(String(newValue));
  };

  const decrementFreeTrialDuration = () => {
    if (!freeTrialActive) return;
    const currentValue = getParsedFreeTrialDuration();
    if (currentValue <= 0) return;
    setFreeTrialDurationDays(String(currentValue - 1));
  };

  const handleUpdateFreeTrial = async () => {
    if (!program) return;

    const normalizedDuration = getParsedFreeTrialDuration();
    const free_trial = {
      active: freeTrialActive,
      duration_days: normalizedDuration,
    };

    try {
      setIsUpdatingFreeTrial(true);
      await programService.updateProgram(program.id, { free_trial });

      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          free_trial
        })
      );

      setIsFreeTrialModalOpen(false);
    } catch (err) {
      console.error('Error updating free trial settings:', err);
      alert('Error al actualizar la prueba gratis');
    } finally {
      setIsUpdatingFreeTrial(false);
    }
  };

  const handleAuxiliaryLibrariesPillClick = async () => {
    if (!program || !user) return;

    try {
      setIsLoadingLibraries(true);
      setIsAuxiliaryLibrariesModalOpen(true);
      
      // Load available libraries for the creator
      const libraries = await libraryService.getLibrariesByCreator(user.uid);
      setAvailableLibraries(libraries);
      
      // Initialize selected libraries from program
      const currentSelected = program.availableLibraries || [];
      setSelectedLibraryIds(new Set(currentSelected));
    } catch (err) {
      console.error('Error loading libraries:', err);
      alert('Error al cargar las bibliotecas');
      setIsAuxiliaryLibrariesModalOpen(false);
    } finally {
      setIsLoadingLibraries(false);
    }
  };

  const handleCloseAuxiliaryLibrariesModal = () => {
    setIsAuxiliaryLibrariesModalOpen(false);
    setAvailableLibraries([]);
    setSelectedLibraryIds(new Set());
  };

  const handleToggleLibrary = (libraryId) => {
    setSelectedLibraryIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(libraryId)) {
        newSet.delete(libraryId);
      } else {
        newSet.add(libraryId);
      }
      return newSet;
    });
  };

  const handleUpdateAuxiliaryLibraries = async () => {
    if (!program || !program.id) {
      console.error('Cannot update auxiliary libraries: program or program.id is missing');
      alert('Error: No se pudo identificar el programa');
      return;
    }

    try {
      setIsUpdatingAuxiliaryLibraries(true);
      // Ensure we have a valid array (even if empty)
      const libraryIdsArray = Array.from(selectedLibraryIds).filter(id => id && (typeof id === 'string' || typeof id === 'number'));
      console.log('[handleUpdateAuxiliaryLibraries] Starting update:', { 
        programId: program.id, 
        libraryIdsArray,
        libraryIdsArrayLength: libraryIdsArray.length,
        selectedLibraryIds: Array.from(selectedLibraryIds),
        programAvailableLibraries: program.availableLibraries
      });
      
      // Ensure we always send an array, never null or undefined
      const updateData = { 
        availableLibraries: libraryIdsArray.length > 0 ? libraryIdsArray : [] 
      };
      
      await programService.updateProgram(program.id, updateData);
      
      // Update React Query cache instead of using setProgram (which doesn't exist)
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          availableLibraries: libraryIdsArray
        })
      );
      
      console.log('[handleUpdateAuxiliaryLibraries] Update successful');
      handleCloseAuxiliaryLibrariesModal();
    } catch (err) {
      console.error('[handleUpdateAuxiliaryLibraries] Error updating auxiliary libraries:', err);
      console.error('[handleUpdateAuxiliaryLibraries] Error details:', {
        message: err.message,
        code: err.code,
        name: err.name,
        programId: program?.id,
        selectedLibraryIds: Array.from(selectedLibraryIds),
        stack: err.stack
      });
      
      // Show user-friendly error message with details for debugging
      let errorMessage = 'Por favor, intenta de nuevo.';
      if (err.message) {
        errorMessage = err.message;
      } else if (err.code) {
        errorMessage = `Error ${err.code}`;
      }
      
      alert(`Error al actualizar las bibliotecas auxiliares: ${errorMessage}`);
    } finally {
      setIsUpdatingAuxiliaryLibraries(false);
    }
  };

  /* Inline save helpers (no modals) */
  const saveStatus = async (status) => {
    if (!program || status === program.status) return;
    try {
      setIsUpdatingStatus(true);
      await programService.updateProgram(program.id, { status });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, status }));
    } catch (err) {
      console.error(err);
      alert('Error al actualizar el estado');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const saveTitle = async (title) => {
    if (!program || title.trim() === (program.title || '')) return;
    try {
      setIsUpdatingProgram(true);
      const t = title.trim();
      await programService.updateProgram(program.id, { title: t });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, title: t }));
    } catch (err) {
      console.error(err);
      alert('Error al actualizar el nombre');
    } finally {
      setIsUpdatingProgram(false);
    }
  };

  const savePrice = async (value) => {
    if (!program) return;
    const numericPrice = value === '' ? null : parseInt(String(value).replace(/\D/g, ''), 10);
    if (numericPrice !== null && numericPrice < 2000) return;
    if (numericPrice === program.price) return;
    try {
      setIsUpdatingPrice(true);
      await programService.updateProgram(program.id, { price: numericPrice });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, price: numericPrice }));
    } catch (err) {
      console.error(err);
      alert('Error al actualizar el precio');
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  const saveDuration = async (weeks) => {
    if (!program || !isOneTimePayment()) return;
    const w = Math.max(1, parseInt(weeks, 10) || 1);
    const durationString = `${w} semanas`;
    if (durationString === (typeof program.duration === 'string' ? program.duration : program.duration ? `${program.duration} semanas` : null)) return;
    try {
      setIsUpdatingDuration(true);
      await programService.updateProgram(program.id, { duration: durationString });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, duration: durationString }));
    } catch (err) {
      console.error(err);
      alert('Error al actualizar la duración');
    } finally {
      setIsUpdatingDuration(false);
    }
  };

  const saveFreeTrial = async (active, durationDays) => {
    if (!program) return;
    const days = Math.max(0, parseInt(durationDays, 10) || 0);
    const free_trial = { active: !!active, duration_days: days };
    try {
      setIsUpdatingFreeTrial(true);
      await programService.updateProgram(program.id, { free_trial });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, free_trial }));
    } catch (err) {
      console.error(err);
      alert('Error al actualizar la prueba gratis');
    } finally {
      setIsUpdatingFreeTrial(false);
    }
  };

  const saveStreak = async (enabled, minSessionsPerWeek) => {
    if (!program) return;
    const programSettings = { ...(program.programSettings || {}), streakEnabled: !!enabled, minimumSessionsPerWeek: Math.max(0, parseInt(minSessionsPerWeek, 10) || 0) };
    try {
      setIsUpdatingStreak(true);
      await programService.updateProgram(program.id, { programSettings });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, programSettings }));
    } catch (err) {
      console.error(err);
      alert('Error al actualizar la racha');
    } finally {
      setIsUpdatingStreak(false);
    }
  };

  const saveWeightSuggestions = async (enabled) => {
    if (!program) return;
    try {
      setIsUpdatingWeightSuggestions(true);
      await programService.updateProgram(program.id, { weight_suggestions: !!enabled });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, weight_suggestions: !!enabled }));
    } catch (err) {
      console.error(err);
      alert('Error al actualizar sugerencias de peso');
    } finally {
      setIsUpdatingWeightSuggestions(false);
    }
  };

  const saveAuxiliaryLibraries = async (libraryIds) => {
    if (!program) return;
    const ids = Array.from(libraryIds || []).filter(Boolean);
    try {
      setIsUpdatingAuxiliaryLibraries(true);
      await programService.updateProgram(program.id, { availableLibraries: ids });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, availableLibraries: ids }));
    } catch (err) {
      console.error(err);
      alert('Error al actualizar bibliotecas');
    } finally {
      setIsUpdatingAuxiliaryLibraries(false);
    }
  };

  const handleAnunciosPillClick = () => {
    if (!program) return;
    const tutorials = program.tutorials || {};
    const screenNames = Object.keys(tutorials);
    if (screenNames.length > 0) {
      setSelectedScreen(screenNames[0]);
      setSelectedVideoIndex(0);
    } else {
      setSelectedScreen(null);
      setSelectedVideoIndex(0);
    }
    setIsAnunciosModalOpen(true);
    setIsAnuncioVideoEditMode(false);
    setIsAnuncioVideoPlaying(false);
  };

  const handleCloseAnunciosModal = () => {
    setIsAnunciosModalOpen(false);
    setSelectedScreen(null);
    setSelectedVideoIndex(0);
    setIsAnuncioVideoEditMode(false);
    setIsAnuncioVideoPlaying(false);
  };

  const handleAnuncioVideoUpload = async (event, isReplacing = false) => {
    const file = event.target.files[0];
    if (!file || !selectedScreen || !program) {
      return;
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      alert('Por favor, selecciona un archivo de video válido');
      return;
    }

    // No file size limit for videos

    try {
      setIsUploadingAnuncioVideo(true);
      setAnuncioVideoUploadProgress(0);

      // Upload video to Firebase Storage
      const videoURL = await programService.uploadTutorialVideo(
        program.id,
        selectedScreen,
        file,
        (progress) => {
          setAnuncioVideoUploadProgress(Math.round(progress));
        }
      );

      // Update Firestore
      const tutorials = { ...(program.tutorials || {}) };
      if (!tutorials[selectedScreen]) {
        tutorials[selectedScreen] = [];
      }

      if (isReplacing && tutorials[selectedScreen][selectedVideoIndex]) {
        // Delete old video from storage
        const oldVideoURL = tutorials[selectedScreen][selectedVideoIndex];
        try {
          await programService.deleteTutorialVideo(program.id, selectedScreen, oldVideoURL);
        } catch (deleteErr) {
          console.warn('Error deleting old video:', deleteErr);
        }
        // Replace video at current index
        tutorials[selectedScreen][selectedVideoIndex] = videoURL;
      } else {
        // Add new video
        tutorials[selectedScreen].push(videoURL);
        // If adding new video, select it
        setSelectedVideoIndex(tutorials[selectedScreen].length - 1);
      }

      await programService.updateProgram(program.id, { tutorials });

      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          tutorials
        })
      );

      setAnuncioVideoUploadProgress(100);
      setIsAnuncioVideoEditMode(false);
    } catch (err) {
      console.error('Error uploading video:', err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        name: err.name,
        stack: err.stack
      });
      const errorMessage = err.message || err.code || 'Error desconocido';
      alert(`Error al subir el video: ${errorMessage}`);
    } finally {
      setIsUploadingAnuncioVideo(false);
      event.target.value = '';
    }
  };

  const handleAnuncioVideoDelete = async () => {
    if (!program || !selectedScreen) return;

    const videos = program.tutorials?.[selectedScreen] || [];
    if (selectedVideoIndex >= videos.length) return;

    if (!window.confirm('¿Estás seguro de que quieres eliminar este video?')) {
      return;
    }

    try {
      const videoURL = videos[selectedVideoIndex];
      
      // Delete from Storage
      await programService.deleteTutorialVideo(program.id, selectedScreen, videoURL);

      // Update Firestore
      const tutorials = { ...(program.tutorials || {}) };
      tutorials[selectedScreen] = tutorials[selectedScreen].filter((_, index) => index !== selectedVideoIndex);
      
      if (tutorials[selectedScreen].length === 0) {
        delete tutorials[selectedScreen];
      }

      await programService.updateProgram(program.id, { tutorials });

      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          tutorials
        })
      );

      // Adjust selected video index
      const newLength = tutorials[selectedScreen]?.length || 0;
      if (newLength === 0) {
        setSelectedVideoIndex(0);
      } else if (selectedVideoIndex >= newLength) {
        setSelectedVideoIndex(newLength - 1);
      }
    } catch (err) {
      console.error('Error deleting video:', err);
      alert('Error al eliminar el video. Por favor, intenta de nuevo.');
    }
  };

  const handleAnuncioVideoUploadForScreen = async (event, screenKey, isReplacing = false, videoIndex = 0) => {
    const file = event.target.files[0];
    if (!file || !program) return;
    if (!file.type.startsWith('video/')) {
      alert('Por favor, selecciona un archivo de video válido');
      return;
    }
    try {
      setIsUploadingAnuncioVideo(true);
      setAnuncioVideoUploadProgress(0);
      const videoURL = await programService.uploadTutorialVideo(program.id, screenKey, file, (p) => setAnuncioVideoUploadProgress(Math.round(p)));
      const tutorials = { ...(program.tutorials || {}) };
      if (!tutorials[screenKey]) tutorials[screenKey] = [];
      if (isReplacing && tutorials[screenKey][videoIndex]) {
        try {
          await programService.deleteTutorialVideo(program.id, screenKey, tutorials[screenKey][videoIndex]);
        } catch (e) { /* ignore */ }
        tutorials[screenKey][videoIndex] = videoURL;
      } else {
        tutorials[screenKey].push(videoURL);
      }
      await programService.updateProgram(program.id, { tutorials });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, tutorials }));
      setAnuncioVideoUploadProgress(100);
    } catch (err) {
      console.error('Error uploading video:', err);
      alert(err?.message || 'Error al subir el video');
    } finally {
      setIsUploadingAnuncioVideo(false);
      event.target.value = '';
    }
  };

  const handleAnuncioVideoDeleteForScreen = async (screenKey, videoIndex) => {
    if (!program) return;
    const videos = program.tutorials?.[screenKey] || [];
    if (videoIndex >= videos.length) return;
    if (!window.confirm('¿Eliminar este video?')) return;
    try {
      const videoURL = videos[videoIndex];
      await programService.deleteTutorialVideo(program.id, screenKey, videoURL);
      const tutorials = { ...(program.tutorials || {}) };
      tutorials[screenKey] = tutorials[screenKey].filter((_, i) => i !== videoIndex);
      if (tutorials[screenKey].length === 0) delete tutorials[screenKey];
      await programService.updateProgram(program.id, { tutorials });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, tutorials }));
    } catch (err) {
      console.error('Error deleting video:', err);
      alert('Error al eliminar el video');
    }
  };

  const handleIntroVideoCardClick = () => {
    setIsIntroVideoModalOpen(true);
    setIsIntroVideoEditMode(false);
    setIsIntroVideoPlaying(false);
  };

  const handleCloseIntroVideoModal = () => {
    setIsIntroVideoModalOpen(false);
    setIsIntroVideoEditMode(false);
    setIsIntroVideoPlaying(false);
  };

  const handleIntroVideoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !program) {
      return;
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      alert('Por favor, selecciona un archivo de video válido');
      return;
    }

    // No file size limit for videos

    try {
      setIsUploadingIntroVideo(true);
      setIntroVideoUploadProgress(0);

      // Upload video to Firebase Storage
      const videoURL = await programService.uploadProgramIntroVideo(
        program.id,
        file,
        (progress) => {
          setIntroVideoUploadProgress(Math.round(progress));
        }
      );

      // Update Firestore
      await programService.updateProgram(program.id, { video_intro_url: videoURL });

      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          video_intro_url: videoURL
        })
      );

      setIntroVideoUploadProgress(100);
      setIsIntroVideoEditMode(false);
    } catch (err) {
      console.error('Error uploading intro video:', err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        name: err.name,
        stack: err.stack
      });
      const errorMessage = err.message || err.code || 'Error desconocido';
      alert(`Error al subir el video: ${errorMessage}`);
    } finally {
      setIsUploadingIntroVideo(false);
      event.target.value = '';
    }
  };

  const handleIntroVideoDelete = async () => {
    if (!program || !program.video_intro_url) return;

    if (!window.confirm('¿Estás seguro de que quieres eliminar el video de introducción?')) {
      return;
    }

    try {
      // Delete from Storage
      await programService.deleteProgramIntroVideo(program.id, program.video_intro_url);

      // Update Firestore
      await programService.updateProgram(program.id, { video_intro_url: null });

      // Update React Query cache
      queryClient.setQueryData(
        queryKeys.programs.detail(program.id),
        (oldData) => ({
          ...oldData,
          video_intro_url: null
        })
      );
    } catch (err) {
      console.error('Error deleting intro video:', err);
      alert('Error al eliminar el video. Por favor, intenta de nuevo.');
    }
  };

  const handleAddModule = () => {
    setIsCopyModuleModalOpen(true);
    setCopyModuleModalPage('biblioteca');
    setModuleName('');
    // Load library modules when opening
    if (libraryModules.length === 0) {
      loadLibraryModules();
    }
  };

  const handleCloseCopyModuleModal = () => {
    setIsCopyModuleModalOpen(false);
    setCopyModuleModalPage('biblioteca');
    setModuleName('');
    setLibraryModules([]);
  };

  const handleCloseModuleModal = () => {
    setIsModuleModalOpen(false);
    setModuleName('');
  };

  // Mutation hooks
  const createModuleMutation = useCreateModule();
  const updateModuleOrderMutation = useUpdateModuleOrder();
  const deleteModuleMutation = useDeleteModule();
  const createSessionMutation = useCreateSession();
  const updateSessionOrderMutation = useUpdateSessionOrder();
  const createExerciseMutation = useCreateExercise();
  const updateExerciseMutation = useUpdateExercise();
  const deleteExerciseMutation = useDeleteExercise();
  const updateExerciseOrderMutation = useUpdateExerciseOrder();

  // Debounced save for module order (Phase 1)
  const debouncedSaveModuleOrder = useMemo(
    () => debounce(async (moduleOrders) => {
      try {
        await updateModuleOrderMutation.mutateAsync({
          programId,
          moduleOrders,
        });
      } catch (error) {
        console.error('Error saving module order:', error);
        // Revert UI on error
        if (originalModulesOrder.length > 0) {
          setModules([...originalModulesOrder]);
        }
        alert('Error al guardar el orden de los módulos');
      }
    }, 1000),
    [programId, updateModuleOrderMutation, originalModulesOrder]
  );

  // Debounced save for session order (Phase 1)
  const debouncedSaveSessionOrder = useMemo(
    () => debounce(async (sessionOrders) => {
      if (!selectedModule) return;
      try {
        await updateSessionOrderMutation.mutateAsync({
          programId,
          moduleId: selectedModule.id,
          sessionOrders,
        });
      } catch (error) {
        console.error('Error saving session order:', error);
        if (originalSessionsOrder.length > 0) {
          setSessions([...originalSessionsOrder]);
        }
        alert('Error al guardar el orden de las sesiones');
      }
    }, 1000),
    [programId, selectedModule, updateSessionOrderMutation, originalSessionsOrder]
  );

  // Helper to update completeness flags in Firestore (Phase 4)
  // Note: This uses the exercises state, not exercisesData from the hook
  const updateCompletenessFlags = useCallback(async (sessionId, moduleId) => {
    if (!programId || !sessionId || !moduleId) return;
    
    try {
      // Check if session is complete
      // Use exercises state instead of exercisesData to avoid initialization order issues
      const exercisesToCheck = exercises.filter(ex => ex);
      const setsMap = exerciseSetsMap;
      
      let sessionComplete = true;
      for (const exercise of exercisesToCheck) {
        const sets = setsMap[exercise.id] || [];
        if (checkExerciseIncomplete(exercise, sets)) {
          sessionComplete = false;
          break;
        }
      }
      
      // Update session completeness flag
      await programService.updateSessionCompleteness(programId, moduleId, sessionId, sessionComplete);
      
      // Check all sessions in module to update module completeness
      const allSessions = sessions;
      let moduleComplete = true;
      for (const session of allSessions) {
        // For other sessions, use cached completeness if available
        const isIncomplete = sessionIncompleteMap[session.id];
        if (isIncomplete === undefined) {
          // Need to check this session
          const sessionExercises = await programService.getExercisesBySession(programId, moduleId, session.id);
          // Simplified check - in production, you'd want to load sets too
          const hasIncomplete = sessionExercises.some(ex => {
            // Basic check without sets
            return !ex.primary || !ex.alternatives || !ex.measures || !ex.objectives;
          });
          if (hasIncomplete) {
            moduleComplete = false;
            break;
          }
        } else if (isIncomplete) {
          moduleComplete = false;
          break;
        }
      }
      
      // Update module completeness flag
      await programService.updateModuleCompleteness(programId, moduleId, moduleComplete);
      
      // Update local state
      setSessionIncompleteMap(prev => ({
        ...prev,
        [sessionId]: !sessionComplete,
      }));
      setModuleIncompleteMap(prev => ({
        ...prev,
        [moduleId]: !moduleComplete,
      }));
    } catch (error) {
      console.error('Error updating completeness flags:', error);
      // Don't throw - this is a background update
    }
  }, [programId, exercises, exerciseSetsMap, sessions, sessionIncompleteMap]);

  const handleCreateModule = async () => {
    if (!moduleName || !moduleName.trim() || !programId) {
      return;
    }

    try {
      const newModule = await createModuleMutation.mutateAsync({
        programId,
        moduleName: moduleName.trim(),
      });
      
      
      // Close the appropriate modal
      if (isCopyModuleModalOpen) {
        handleCloseCopyModuleModal();
      } else {
      handleCloseModuleModal();
      }
    } catch (err) {
      console.error('Error creating module:', err);
      alert('Error al crear el módulo. Por favor, intenta de nuevo.');
    }
  };

  // ✅ NEW: Load library modules
  const loadLibraryModules = async () => {
    if (!user) return;
    
    try {
      setIsLoadingLibraryModules(true);
      const modules = await libraryService.getModuleLibrary(user.uid);
      setLibraryModules(modules);
    } catch (error) {
      console.error('Error loading library modules:', error);
      alert('Error al cargar los módulos de la biblioteca');
    } finally {
      setIsLoadingLibraryModules(false);
    }
  };

  // ✅ NEW: Handle library module selection
  const handleSelectLibraryModule = async (libraryModuleId) => {
    if (!programId || !libraryModuleId) return;
    
    try {
      setIsCreatingModule(true);
      await programService.createModuleFromLibrary(programId, libraryModuleId);
      
      // Reload modules
      const modulesData = await programService.getModulesByProgram(programId);
      const sortedModules = modulesData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      setModules(sortedModules);
      
      handleCloseCopyModuleModal();
    } catch (err) {
      console.error('Error creating module from library:', err);
      alert(`Error al agregar el módulo: ${err.message || 'Por favor, intenta de nuevo.'}`);
    } finally {
      setIsCreatingModule(false);
    }
  };

  const handleEditModules = async () => {
    if (!isModuleEditMode) {
      // Entering edit mode: store original order
      setOriginalModulesOrder([...modules]);
      setIsModuleEditMode(true);
    } else {
      // Exiting edit mode: save order
      await handleSaveModuleOrder();
    }
  };

  const handleSaveModuleOrder = async () => {
    if (!programId) return;

    try {
      setIsUpdatingModuleOrder(true);
      const moduleOrders = modules.map((module, index) => ({
        moduleId: module.id,
        order: index,
      }));
      
      // Use debounced save for better performance
      await debouncedSaveModuleOrder(moduleOrders);
      
      // Flush debounce to ensure it saves immediately when exiting edit mode
      debouncedSaveModuleOrder.flush();
      
      setIsModuleEditMode(false);
      setOriginalModulesOrder([]);
    } catch (err) {
      console.error('Error updating module order:', err);
      if (originalModulesOrder.length > 0) {
        setModules([...originalModulesOrder]);
      }
      alert('Error al actualizar el orden de los módulos. Por favor, intenta de nuevo.');
    } finally {
      setIsUpdatingModuleOrder(false);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = modules.findIndex((module) => module.id === active.id);
    const newIndex = modules.findIndex((module) => module.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Only update local state - don't save to Firestore yet
    const newModules = arrayMove(modules, oldIndex, newIndex);
    setModules(newModules);
  };

  const handleEditSessions = async () => {
    if (!isSessionEditMode) {
      // Entering edit mode: store original order
      setOriginalSessionsOrder([...sessions]);
      setIsSessionEditMode(true);
    } else {
      // Exiting edit mode: save order
      await handleSaveSessionOrder();
    }
  };

  const handleSaveSessionOrder = async () => {
    if (!programId || !selectedModule) return;

    try {
      setIsUpdatingSessionOrder(true);
      const sessionOrders = sessions.map((session, index) => ({
        sessionId: session.id,
        order: index,
      }));
      
      // Use debounced save for better performance
      await debouncedSaveSessionOrder(sessionOrders);
      
      // Flush debounce to ensure it saves immediately when exiting edit mode
      debouncedSaveSessionOrder.flush();
      
      setIsSessionEditMode(false);
      setOriginalSessionsOrder([]);
    } catch (err) {
      console.error('Error updating session order:', err);
      if (originalSessionsOrder.length > 0) {
        setSessions([...originalSessionsOrder]);
      }
      alert('Error al actualizar el orden de las sesiones. Por favor, intenta de nuevo.');
    } finally {
      setIsUpdatingSessionOrder(false);
    }
  };

  const handleDragEndSessions = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !selectedModule) {
      return;
    }

    const oldIndex = sessions.findIndex((session) => session.id === active.id);
    const newIndex = sessions.findIndex((session) => session.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Only update local state - don't save to Firestore yet
    const newSessions = arrayMove(sessions, oldIndex, newIndex);
    setSessions(newSessions);
  };

  const handleDeleteModule = async (module) => {
    // ✅ NEW: Check if library module - check usage
    if (module.libraryModuleRef && user) {
      try {
        const usageCheck = await libraryService.checkLibraryModuleUsage(user.uid, module.libraryModuleRef);
        
        if (usageCheck.inUse) {
          alert(
            `⚠️ No se puede eliminar este módulo de la biblioteca.\n\n` +
            `Está siendo usada en ${usageCheck.count} programa(s).\n\n` +
            `Primero debes eliminar o reemplazar todas las referencias en los programas.`
          );
          return;
        }
      } catch (error) {
        console.error('Error checking library module usage:', error);
        // Continue with delete attempt anyway
      }
    }
    
    setModuleToDelete(module);
    setIsDeleteModuleModalOpen(true);
    setDeleteModuleConfirmation('');
  };

  const handleCloseDeleteModuleModal = () => {
    setIsDeleteModuleModalOpen(false);
    setModuleToDelete(null);
    setDeleteModuleConfirmation('');
  };

  const handleConfirmDeleteModule = async () => {
    if (!moduleToDelete || !deleteModuleConfirmation.trim() || !programId) {
      return;
    }

    // Verify the confirmation matches the module title
    const moduleTitle = moduleToDelete.title || moduleToDelete.name || `Módulo ${moduleToDelete.id?.slice(0, 8) || ''}`;
    if (deleteModuleConfirmation.trim() !== moduleTitle) {
      return;
    }

    try {
      setIsDeletingModule(true);
      console.log('[handleConfirmDeleteModule] Starting deletion:', {
        programId,
        moduleId: moduleToDelete.id,
        moduleTitle: moduleTitle
      });
      
      if (!programId || !moduleToDelete?.id) {
        throw new Error('Missing programId or moduleId');
      }
      
      await programService.deleteModule(programId, moduleToDelete.id);
      
      // Reload modules
      const modulesData = await programService.getModulesByProgram(programId);
      // Sort modules by order field
      const sortedModules = modulesData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      setModules(sortedModules);
      
      // If the deleted module was selected, go back to modules list
      if (selectedModule && selectedModule.id === moduleToDelete.id) {
        setSelectedModule(null);
        setSessions([]);
      }
      
      // Close modal and exit edit mode if no modules left
      handleCloseDeleteModuleModal();
      if (modulesData.length === 0) {
        setIsModuleEditMode(false);
      }
    } catch (err) {
      console.error('[handleConfirmDeleteModule] Error deleting module:', err);
      console.error('[handleConfirmDeleteModule] Error details:', {
        message: err.message,
        code: err.code,
        stack: err.stack
      });
      alert(`Error al eliminar el módulo. Por favor, intenta de nuevo.${err.message ? ` Error: ${err.message}` : ''}`);
    } finally {
      setIsDeletingModule(false);
    }
  };

  // Load sessions with React Query when module is selected
  const { data: sessionsData = [], isLoading: isLoadingSessions } = useSessions(
    programId,
    selectedModule?.id,
    { isActive: isActivelyEditing, enabled: !!selectedModule }
  );

  // Memoize sorted sessions to avoid re-sorting on every render
  const sortedSessions = useMemo(() => {
    if (sessionsData.length === 0) return [];
    return [...sessionsData].sort((a, b) => {
      const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
      const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
      return orderA - orderB;
    });
  }, [sessionsData]);

  useEffect(() => {
    if (sortedSessions.length > 0) {
      setSessions(sortedSessions);
      
      // Use denormalized completeness flags if available (Phase 4 optimization)
      const sessionStatuses = {};
      const sessionsWithFlags = sortedSessions.filter(session => 
        session.isComplete !== undefined && session.isComplete !== null
      );
      
      sessionsWithFlags.forEach(session => {
        sessionStatuses[session.id] = !session.isComplete;
      });
      
      if (Object.keys(sessionStatuses).length > 0) {
        setSessionIncompleteMap(prev => ({ ...prev, ...sessionStatuses }));
      }
      
      // If not all sessions have denormalized flags, check completeness for all sessions
      // This ensures completeness icons appear automatically when module is clicked
      const sessionsNeedingCheck = sortedSessions.filter(session => 
        session.isComplete === undefined || session.isComplete === null
      );
      
      if (sessionsNeedingCheck.length > 0 && selectedModule) {
        // Check completeness for sessions without flags
        const checkSessionsCompleteness = async () => {
          const sessionStatusesToCheck = {};
          
          await Promise.all(
            sessionsNeedingCheck.map(async (session) => {
              try {
                // Load exercises for this session
                const exercisesData = await programService.getExercisesBySession(
                  programId,
                  selectedModule.id,
                  session.id
                );
                
                if (exercisesData.length === 0) {
                  sessionStatusesToCheck[session.id] = true; // No exercises = incomplete
                  return;
                }
                
                // Load sets for all exercises in this session
                const setsMap = {};
                await Promise.all(
                  exercisesData.map(async (exercise) => {
                    try {
                      const setsData = await programService.getSetsByExercise(
                        programId,
                        selectedModule.id,
                        session.id,
                        exercise.id
                      );
                      setsMap[exercise.id] = setsData;
                    } catch (err) {
                      console.error(`Error loading sets for exercise ${exercise.id}:`, err);
                      setsMap[exercise.id] = [];
                    }
                  })
                );
                
                // Check if any exercise is incomplete
                const hasIncomplete = exercisesData.some(exercise => {
                  const sets = setsMap[exercise.id] || [];
                  return checkExerciseCompletenessInline(exercise, sets);
                });
                
                sessionStatusesToCheck[session.id] = hasIncomplete;
              } catch (err) {
                console.error(`Error checking session ${session.id} completeness:`, err);
                sessionStatusesToCheck[session.id] = false; // Default to complete on error
              }
            })
          );
          
          // Update session incomplete map
          setSessionIncompleteMap(prev => ({
            ...prev,
            ...sessionStatuses,
            ...sessionStatusesToCheck
          }));
          
          // Update module incomplete status
          const allSessionStatuses = { ...sessionStatuses, ...sessionStatusesToCheck };
          const hasIncompleteSession = Object.values(allSessionStatuses).some(status => status === true);
          setModuleIncompleteMap(prev => ({
            ...prev,
            [selectedModule.id]: hasIncompleteSession
          }));
        };
        
        checkSessionsCompleteness();
      } else if (Object.keys(sessionStatuses).length > 0) {
        // All sessions have flags, just update module status
        const hasIncompleteSession = Object.values(sessionStatuses).some(status => status === true);
        setModuleIncompleteMap(prev => ({
          ...prev,
          [selectedModule.id]: hasIncompleteSession
        }));
      }
    }
  }, [sortedSessions, selectedModule, programId]);

  const handleModuleClick = useCallback((module) => {
    if (isModuleEditMode) {
      return;
    }

    setSelectedModule(module);
    // Sessions will be loaded automatically via React Query hook
  }, [isModuleEditMode]);

  const handleBackToModules = () => {
    setSelectedModule(null);
    setSessions([]);
    setIsSessionEditMode(false);
    setSelectedSession(null);
    setExercises([]);
  };

  // Load exercises with React Query when session is selected
  const { data: exercisesData = [], isLoading: isLoadingExercises } = useExercises(
    programId,
    selectedModule?.id,
    selectedSession?.id,
    { isActive: isActivelyEditing, enabled: !!selectedModule && !!selectedSession }
  );

  // Memoize sorted exercises to avoid re-sorting on every render
  const sortedExercises = useMemo(() => {
    if (exercisesData.length === 0) return [];
    return [...exercisesData].sort((a, b) => {
      const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
      const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
      return orderA - orderB;
    });
  }, [exercisesData]);

  useEffect(() => {
    if (sortedExercises.length > 0) {
      setExercises(sortedExercises);
    }
  }, [sortedExercises]);

  // checkExerciseCompletenessInline is now defined earlier (moved to avoid initialization errors)

  // Load sets for all exercises when session is selected (needed for completeness checking)
  useEffect(() => {
    const loadSetsForAllExercises = async () => {
      if (!programId || !selectedModule || !selectedSession || exercises.length === 0) {
        return;
      }

      try {
        // Load sets for all exercises in parallel
        const setsMap = {};
        await Promise.all(
          exercises.map(async (exercise) => {
            try {
              const setsData = await programService.getSetsByExercise(
                programId,
                selectedModule.id,
                selectedSession.id,
                exercise.id
              );
              setsMap[exercise.id] = setsData;
            } catch (err) {
              console.error(`Error loading sets for exercise ${exercise.id}:`, err);
              setsMap[exercise.id] = [];
            }
          })
        );
        
        // Update exerciseSetsMap with all sets
        setExerciseSetsMap(prev => ({
          ...prev,
          ...setsMap
        }));

        // Check session completeness after sets are loaded
        const hasIncompleteExercise = exercises.some(exercise => {
          const sets = setsMap[exercise.id] || [];
          return checkExerciseCompletenessInline(exercise, sets);
        });

        // Update session incomplete status
        setSessionIncompleteMap(prev => ({
          ...prev,
          [selectedSession.id]: hasIncompleteExercise
        }));

        // Update module incomplete status if this session is incomplete
        if (hasIncompleteExercise && selectedModule) {
          setModuleIncompleteMap(prev => ({
            ...prev,
            [selectedModule.id]: true
          }));
        }
      } catch (error) {
        console.error('Error loading sets for exercises:', error);
      }
    };

    loadSetsForAllExercises();
  }, [programId, selectedModule?.id, selectedSession?.id, exercises]);

  const handleSessionClick = useCallback((session) => {
    if (isSessionEditMode) {
      return;
    }

    setSelectedSession(session);
    // Exercises will be loaded automatically via React Query hook
    // Completeness checking is now handled via denormalized flags or on-demand
  }, [isSessionEditMode]);

  const handleBackToSessions = () => {
    setSelectedSession(null);
    setExercises([]);
    setIsExerciseEditMode(false);
    setExerciseSetsMap({});
    setSelectedExercise(null);
    setExerciseDraft(null);
  };

  const applyExercisePatch = async (exerciseId, patch) => {
    if (!exerciseId || !patch) {
      return;
    }

    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, ...patch } : exercise
      )
    );

    setSelectedExercise((prev) =>
      prev && prev.id === exerciseId ? { ...prev, ...patch } : prev
    );

    setExerciseDraft((prev) =>
      prev && prev.id === exerciseId ? { ...prev, ...patch } : prev
    );
  };

  const handleExerciseClick = async (exercise) => {
    if (isExerciseEditMode) {
      return;
    }
    try {
      const normalizedExercise = {
        ...exercise,
        alternatives:
          exercise.alternatives && typeof exercise.alternatives === 'object' && exercise.alternatives !== null && !Array.isArray(exercise.alternatives)
            ? exercise.alternatives
            : {},
        measures: Array.isArray(exercise.measures) ? exercise.measures : [],
        objectives: Array.isArray(exercise.objectives) ? exercise.objectives : [],
        customObjectiveLabels: exercise.customObjectiveLabels && typeof exercise.customObjectiveLabels === 'object' ? exercise.customObjectiveLabels : {},
        customMeasureLabels: exercise.customMeasureLabels && typeof exercise.customMeasureLabels === 'object' ? exercise.customMeasureLabels : {},
      };

      setSelectedExercise(normalizedExercise);
      setExerciseDraft(JSON.parse(JSON.stringify(normalizedExercise)));
      setSelectedExerciseTab('general');
      setIsExerciseModalOpen(true);
      
      // Load exercise data for primary and alternatives (titles + completeness)
      const referenceLibrariesMap = {};
      getPrimaryReferences(normalizedExercise).forEach(({ libraryId, exerciseName }) => {
        if (!libraryId || !exerciseName) return;
        if (!referenceLibrariesMap[libraryId]) {
          referenceLibrariesMap[libraryId] = new Set();
        }
        referenceLibrariesMap[libraryId].add(exerciseName);
      });

      if (normalizedExercise.alternatives && Object.keys(normalizedExercise.alternatives).length > 0) {
        Object.entries(normalizedExercise.alternatives).forEach(([libraryId, values]) => {
          if (!libraryId || !Array.isArray(values)) return;
          values.forEach((value) => {
            const exerciseName = typeof value === 'string' ? value : value?.name || value?.title || value?.id;
            if (!exerciseName) return;
            if (!referenceLibrariesMap[libraryId]) {
              referenceLibrariesMap[libraryId] = new Set();
            }
            referenceLibrariesMap[libraryId].add(exerciseName);
          });
        });
      }

      const libraryIds = Object.keys(referenceLibrariesMap);
      if (libraryIds.length > 0) {
        const titlesMap = {};
        const libraryDataUpdates = {};
        const completenessUpdates = {};
        
        await Promise.all(
          libraryIds.map(async (libraryId) => {
            try {
              let libraryData = libraryDataCache[libraryId];
              if (!libraryData) {
                libraryData = await libraryService.getLibraryById(libraryId);
                if (libraryData) {
                  libraryDataUpdates[libraryId] = libraryData;
                }
              }

              if (libraryData && libraryData.title) {
                titlesMap[libraryId] = libraryData.title;
              } else {
                titlesMap[libraryId] = libraryId;
              }

              referenceLibrariesMap[libraryId].forEach((exerciseName) => {
                if (!exerciseName) return;
                const key = getLibraryExerciseKey(libraryId, exerciseName);
                if (libraryData) {
                  completenessUpdates[key] = isLibraryExerciseDataComplete(libraryData[exerciseName]);
                } else {
                  completenessUpdates[key] = false;
                }
              });
            } catch (error) {
              console.error(`Error fetching library ${libraryId}:`, error);
              titlesMap[libraryId] = libraryId;
              referenceLibrariesMap[libraryId].forEach((exerciseName) => {
                if (!exerciseName) return;
                completenessUpdates[getLibraryExerciseKey(libraryId, exerciseName)] = false;
              });
            }
          })
        );

        setLibraryTitles(titlesMap);

        if (Object.keys(libraryDataUpdates).length > 0) {
          setLibraryDataCache((prev) => ({
            ...prev,
            ...libraryDataUpdates,
          }));
        }

        if (Object.keys(completenessUpdates).length > 0) {
          setLibraryExerciseCompleteness((prev) => ({
            ...prev,
            ...completenessUpdates,
          }));
        }
      } else {
        setLibraryTitles({});
      }
      // Load sets/series from subcollection
      if (programId && selectedModule && selectedSession) {
        const setsData = await programService.getSetsByExercise(
          programId,
          selectedModule.id,
          selectedSession.id,
          exercise.id
        );
        setExerciseSets(setsData);
        // Store original sets for comparison
        setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
        // Reset unsaved changes
        setUnsavedSetChanges({});
      } else {
        setExerciseSets([]);
        setOriginalExerciseSets([]);
        setUnsavedSetChanges({});
      }
      setExpandedSeries({}); // Reset expanded state
    } catch (error) {
      console.error('Error opening exercise modal:', error);
      alert('Error al abrir el ejercicio. Por favor, intenta de nuevo.');
    }
  };

  const handleCloseCreateExerciseModal = () => {
    setNewExerciseDraft(null);
    setNewExerciseSets([]);
    setNumberOfSetsForNewExercise(3);
    setNewExerciseDefaultSetValues({});
    setShowPerSetCardsNewExercise(false);
    setIsCreateExerciseModalOpen(false);
  };

  const handleSelectPrimaryForNewExercise = async () => {
    if (!user) return;
    
    try {
      setIsLoadingLibrariesForSelection(true);
      setLibraryExerciseModalMode('primary');
      setAlternativeToEdit(null);
      setSelectedLibraryForExercise(null);
      setExercisesFromSelectedLibrary([]);
      
      // Load available libraries
      const libraries = await libraryService.getLibrariesByCreator(user.uid);
      setAvailableLibrariesForSelection(libraries);
      setIsLibraryExerciseModalOpen(true);
    } catch (err) {
      console.error('Error loading libraries:', err);
      alert('Error al cargar las bibliotecas');
    } finally {
      setIsLoadingLibrariesForSelection(false);
    }
  };

  const handleSelectExerciseForNew = async (exerciseName) => {
    if (!selectedLibraryForExercise || !exerciseName) {
      return;
    }

    try {
      if (libraryExerciseModalMode === 'primary') {
        // Update primary exercise for new exercise
        const primaryUpdate = {
          [selectedLibraryForExercise]: exerciseName
        };
        
        setNewExerciseDraft(prev => ({
          ...prev,
          primary: primaryUpdate
        }));
        
        // Update library titles if needed
        if (!libraryTitles[selectedLibraryForExercise]) {
          const library = await libraryService.getLibraryById(selectedLibraryForExercise);
          if (library && library.title) {
            setLibraryTitles(prev => ({
              ...prev,
              [selectedLibraryForExercise]: library.title
            }));
          }
        }
      }
      
      handleCloseLibraryExerciseModal();
    } catch (err) {
      console.error('Error updating exercise:', err);
      alert('Error al actualizar el ejercicio. Por favor, intenta de nuevo.');
    }
  };

  const handleAddSetToNewExercise = () => {
    const editableObjectives = (newExerciseDraft?.objectives || []).filter(o => o !== 'previous');
    const defaultSet = {};
    editableObjectives.forEach(o => { defaultSet[o] = null; });
    if (Object.keys(defaultSet).length === 0) {
      defaultSet.reps = null;
      defaultSet.intensity = null;
    }
    setNewExerciseSets(prev => [...prev, defaultSet]);
  };

  const handleUpdateNewExerciseSet = (index, field, value) => {
    setNewExerciseSets(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return updated;
    });
  };

  const handleRemoveSetFromNewExercise = (index) => {
    setNewExerciseSets(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateNewExerciseDefaultValue = (field, value) => {
    let processed = value;
    if (field === 'intensity') {
      const num = value.replace(/[^0-9]/g, '');
      if (num === '') processed = '';
      else {
        const n = parseInt(num, 10);
        processed = n < 1 ? '1' : n > 10 ? '10' : String(n);
      }
    } else if (field === 'reps') {
      processed = formatRepsValue(value);
    }
    const stored = processed === '' ? null : (field === 'intensity' && processed ? `${processed}/10` : processed);
    setNewExerciseDefaultSetValues(prev => ({ ...prev, [field]: stored }));
    if (newExerciseSets.length === 0 && (numberOfSetsForNewExercise || 0) >= 1) {
      const editableObjectives = (newExerciseDraft?.objectives || []).filter(o => o !== 'previous');
      const fields = editableObjectives.length ? editableObjectives : ['reps', 'intensity'];
      const defaultSet = { [field]: stored };
      fields.forEach(o => {
        if (o !== field) {
          const v = newExerciseDefaultSetValues[o];
          defaultSet[o] = v != null && v !== '' ? v : null;
        }
      });
      const count = Math.max(1, Math.min(20, Math.floor(numberOfSetsForNewExercise) || 1));
      setNewExerciseSets(Array.from({ length: count }, () => ({ ...defaultSet })));
      return;
    }
    if (newExerciseSets.length >= 1) {
      setNewExerciseSets(prev => prev.map(s => ({ ...s, [field]: stored })));
    }
  };

  const syncNewExerciseSetsCount = (count) => {
    const target = Math.max(1, Math.min(20, Math.floor(count) || 1));
    const editableObjectives = (newExerciseDraft?.objectives || []).filter(o => o !== 'previous');
    const fields = editableObjectives.length ? editableObjectives : ['reps', 'intensity'];
    const defaultSet = {};
    fields.forEach(o => {
      const v = newExerciseDefaultSetValues[o];
      defaultSet[o] = v != null && v !== '' ? v : null;
    });
    setNewExerciseSets(Array.from({ length: target }, () => ({ ...defaultSet })));
    setNumberOfSetsForNewExercise(target);
  };

  const handleApplyDefaultToNewExerciseSets = () => {
    const editableObjectives = (newExerciseDraft?.objectives || []).filter(o => o !== 'previous');
    const fields = editableObjectives.length ? editableObjectives : ['reps', 'intensity'];
    const defaultSet = {};
    fields.forEach(o => {
      const v = newExerciseDefaultSetValues[o];
      defaultSet[o] = v != null && v !== '' ? v : null;
    });
    const count = Math.max(1, Math.min(20, Math.floor(numberOfSetsForNewExercise) || 1));
    setNewExerciseSets(Array.from({ length: count }, () => ({ ...defaultSet })));
  };

  const handleCreateNewExercise = async () => {
    if (!programId || !selectedModule || !selectedSession || !newExerciseDraft) {
      return;
    }

    // Validate requirements
    const hasPrimary = newExerciseDraft.primary && 
      typeof newExerciseDraft.primary === 'object' && 
      Object.values(newExerciseDraft.primary).length > 0 &&
      Object.values(newExerciseDraft.primary)[0];
    
    if (!hasPrimary) {
      alert('Por favor selecciona un ejercicio principal');
      return;
    }

    let setsToCreate = newExerciseSets;
    if (setsToCreate.length === 0 && numberOfSetsForNewExercise >= 1) {
      const editableObjectives = (newExerciseDraft?.objectives || []).filter(o => o !== 'previous');
      const fields = editableObjectives.length ? editableObjectives : ['reps', 'intensity'];
      const defaultSet = {};
      fields.forEach(o => {
        const v = newExerciseDefaultSetValues[o];
        defaultSet[o] = v != null && v !== '' ? v : null;
      });
      const count = Math.max(1, Math.min(20, Math.floor(numberOfSetsForNewExercise) || 1));
      setsToCreate = Array.from({ length: count }, () => ({ ...defaultSet }));
    }
    if (setsToCreate.length === 0) {
      alert('Por favor crea al menos una serie');
      return;
    }

    try {
      setIsCreatingNewExercise(true);
      
      // Get primary exercise name
      const primaryValues = Object.values(newExerciseDraft.primary);
      const primaryExerciseName = primaryValues[0];
      
      // Check if session is a library reference
      const sessionIsLibraryRef = selectedSession.librarySessionRef;
      
      let newExercise;
      if (sessionIsLibraryRef && user) {
        // If session is a library reference, create exercise in library session
        console.log('handleCreateNewExercise: Session is library reference, creating in library session');
        newExercise = await libraryService.createExerciseInLibrarySession(
          user.uid,
          selectedSession.librarySessionRef,
          primaryExerciseName
        );
      } else {
        // Standalone session - create exercise in program session
        newExercise = await programService.createExercise(
          programId,
          selectedModule.id,
          selectedSession.id,
          primaryExerciseName
        );
      }

      // Update exercise with primary, alternatives, measures, objectives, and custom labels
      const updateData = {
        primary: newExerciseDraft.primary,
        alternatives: newExerciseDraft.alternatives || {},
        measures: newExerciseDraft.measures || [],
        objectives: newExerciseDraft.objectives || [],
        customObjectiveLabels: newExerciseDraft.customObjectiveLabels && typeof newExerciseDraft.customObjectiveLabels === 'object' ? newExerciseDraft.customObjectiveLabels : {},
        customMeasureLabels: newExerciseDraft.customMeasureLabels && typeof newExerciseDraft.customMeasureLabels === 'object' ? newExerciseDraft.customMeasureLabels : {},
        name: deleteField(),
        title: deleteField()
      };
      
      if (sessionIsLibraryRef && user) {
        // Update exercise in library session
        await libraryService.updateExerciseInLibrarySession(
          user.uid,
          selectedSession.librarySessionRef,
          newExercise.id,
          updateData
        );
      } else {
        // Update exercise in program session
        await programService.updateExercise(
          programId,
          selectedModule.id,
          selectedSession.id,
          newExercise.id,
          updateData
        );
      }

      // Create sets
      for (let i = 0; i < setsToCreate.length; i++) {
        const set = setsToCreate[i];
        
        let createdSet;
        if (sessionIsLibraryRef && user) {
          // Create set in library session exercise
          createdSet = await libraryService.createSetInLibraryExercise(
            user.uid,
            selectedSession.librarySessionRef,
            newExercise.id,
            i
          );
        } else {
          // Create set in program session exercise
          await programService.createSet(
            programId,
            selectedModule.id,
            selectedSession.id,
            newExercise.id
          );
          
          // Get the created set
          const setsData = await programService.getSetsByExercise(
            programId,
            selectedModule.id,
            selectedSession.id,
            newExercise.id
          );
          
          createdSet = setsData[setsData.length - 1];
        }
        
        if (createdSet) {
          const editableObjectives = (newExerciseDraft.objectives || []).filter(o => o !== 'previous');
          const setUpdateData = { order: i, title: `Serie ${i + 1}` };
          editableObjectives.forEach(obj => {
            setUpdateData[obj] = set[obj] != null && set[obj] !== '' ? set[obj] : null;
          });
          if (sessionIsLibraryRef && user) {
            await libraryService.updateSetInLibraryExercise(
              user.uid,
              selectedSession.librarySessionRef,
              newExercise.id,
              createdSet.id,
              setUpdateData
            );
          } else {
            await programService.updateSet(
              programId,
              selectedModule.id,
              selectedSession.id,
              newExercise.id,
              createdSet.id,
              setUpdateData
            );
          }
        }
      }

      // Reload exercises
      const exercisesData = await programService.getExercisesBySession(programId, selectedModule.id, selectedSession.id);
      const sortedExercises = exercisesData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      setExercises(sortedExercises);

      // Refresh incomplete status
      await refreshIncompleteStatus();

      // Close modal
      handleCloseCreateExerciseModal();
    } catch (err) {
      console.error('Error creating exercise:', err);
      alert('Error al crear el ejercicio. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingNewExercise(false);
    }
  };

  // Check if new exercise can be saved
  const canSaveNewExercise = () => {
    if (!newExerciseDraft) return false;
    
    const hasPrimary = newExerciseDraft.primary && 
      typeof newExerciseDraft.primary === 'object' && 
      Object.values(newExerciseDraft.primary).length > 0 &&
      Object.values(newExerciseDraft.primary)[0];
    
    const hasSets = newExerciseSets.length > 0 || (numberOfSetsForNewExercise >= 1);
    return hasPrimary && hasSets;
  };

  // Check if we can save the exercise being created in the main modal
  const canSaveCreatingExercise = () => {
    if (!isCreatingExercise || !exerciseDraft) return false;
    
    // Check for primary exercise
    const hasPrimary = exerciseDraft.primary && 
      typeof exerciseDraft.primary === 'object' && 
      exerciseDraft.primary !== null &&
      Object.values(exerciseDraft.primary).length > 0 &&
      Object.values(exerciseDraft.primary)[0];
    
    // Check for at least one set
    const hasSets = exerciseSets.length > 0;
    
    // Data is mandatory: at least one measure and one objective
    const measures = Array.isArray(exerciseDraft.measures) ? exerciseDraft.measures : [];
    const objectives = Array.isArray(exerciseDraft.objectives) ? exerciseDraft.objectives : [];
    const hasData = measures.length > 0 && objectives.length > 0;
    
    return hasPrimary && hasSets && hasData;
  };

  // Save the exercise being created
  const handleSaveCreatingExercise = async () => {
    if (!canSaveCreatingExercise() || !programId || !selectedModule || !selectedSession) {
      return;
    }

    try {
      setIsCreatingNewExercise(true);
      
      // Get primary exercise name
      const primaryValues = Object.values(exerciseDraft.primary);
      const primaryExerciseName = primaryValues[0];
      
      // Check if session is a library reference
      const sessionIsLibraryRef = selectedSession.librarySessionRef;
      
      let newExercise;
      if (sessionIsLibraryRef && user) {
        // If session is a library reference, create exercise in library session
        console.log('Session is library reference, creating exercise in library session:', {
          librarySessionRef: selectedSession.librarySessionRef,
          primaryExerciseName
        });
        
        newExercise = await libraryService.createExerciseInLibrarySession(
          user.uid,
          selectedSession.librarySessionRef,
          primaryExerciseName
        );
        
        // Also create a program exercise document for override support (if needed)
        // For now, exercises from library sessions are loaded directly from library
        // Program exercise document might not be needed unless we implement exercise overrides
      } else {
        // Standalone session - create exercise in program session
        newExercise = await programService.createExercise(
          programId,
          selectedModule.id,
          selectedSession.id,
          primaryExerciseName
        );
      }

      // Update exercise with primary, alternatives, measures, and objectives
      // Explicitly remove name and title fields that were automatically created
      const updateData = {
        primary: exerciseDraft.primary,
        alternatives: exerciseDraft.alternatives || {},
        measures: exerciseDraft.measures || [],
        objectives: exerciseDraft.objectives || [],
        name: deleteField(),
        title: deleteField()
      };
      
      if (sessionIsLibraryRef && user) {
        // Update exercise in library session
        await libraryService.updateExerciseInLibrarySession(
          user.uid,
          selectedSession.librarySessionRef,
          newExercise.id,
          updateData
        );
      } else {
        // Update exercise in program session
        await programService.updateExercise(
          programId,
          selectedModule.id,
          selectedSession.id,
          newExercise.id,
          updateData
        );
      }

      // Create sets (filter out temporary sets and create real ones)
      const tempSets = exerciseSets.filter(set => set.id && set.id.startsWith('temp-'));
      for (let i = 0; i < tempSets.length; i++) {
        const tempSet = tempSets[i];
        
        let createdSet;
        if (sessionIsLibraryRef && user) {
          // Create set in library session exercise
          createdSet = await libraryService.createSetInLibraryExercise(
            user.uid,
            selectedSession.librarySessionRef,
            newExercise.id,
            i
          );
        } else {
          // Create set in program session exercise
          await programService.createSet(
            programId,
            selectedModule.id,
            selectedSession.id,
            newExercise.id
          );
          
          // Get the created set
          const setsData = await programService.getSetsByExercise(
            programId,
            selectedModule.id,
            selectedSession.id,
            newExercise.id
          );
          
          createdSet = setsData[setsData.length - 1];
        }
        
        if (createdSet) {
          const editableObjectives = (newExerciseDraft.objectives || []).filter(o => o !== 'previous');
          const updateSetData = { order: i, title: `Serie ${i + 1}` };
          editableObjectives.forEach(obj => {
            updateSetData[obj] = tempSet[obj] != null && tempSet[obj] !== '' ? tempSet[obj] : null;
          });
          if (sessionIsLibraryRef && user) {
            await libraryService.updateSetInLibraryExercise(
              user.uid,
              selectedSession.librarySessionRef,
              newExercise.id,
              createdSet.id,
              updateSetData
            );
          } else {
            await programService.updateSet(
              programId,
              selectedModule.id,
              selectedSession.id,
              newExercise.id,
              createdSet.id,
              updateSetData
            );
          }
        }
      }

      // Reload exercises and sets
      const exercisesData = await programService.getExercisesBySession(programId, selectedModule.id, selectedSession.id);
      const sortedExercises = exercisesData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      setExercises(sortedExercises);
      
      // Load sets for the new exercise (works for both library and program sessions)
      const setsData = await programService.getSetsByExercise(
        programId,
        selectedModule.id,
        selectedSession.id,
        newExercise.id
      );
      setExerciseSets(setsData);
      setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
      
      // Update sets map
      setExerciseSetsMap(prev => ({
        ...prev,
        [newExercise.id]: setsData
      }));
      
      // Refresh incomplete status
      await refreshIncompleteStatus();
      
      // Close modal and reset
      setIsExerciseModalOpen(false);
      setIsCreatingExercise(false);
      setSelectedExercise(null);
      setExerciseDraft(null);
      setExerciseSets([]);
      setOriginalExerciseSets([]);
      setAppliedPresetId(null);
      setIsPresetSelectorOpen(false);
      setIsMeasuresObjectivesEditorOpen(false);
      setUnsavedSetChanges({});
    } catch (err) {
      console.error('Error creating exercise:', err);
      alert('Error al crear el ejercicio. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingNewExercise(false);
    }
  };

  const handleCloseExerciseModal = () => {
    if (isCreatingExercise && canSaveCreatingExercise()) {
      if (window.confirm('¿Guardar ejercicio antes de cerrar?')) {
        handleSaveCreatingExercise();
        return;
      }
    }

    // Check if there are unsaved changes
    const hasUnsavedChanges = Object.values(unsavedSetChanges).some(hasChanges => hasChanges);
    
    if (hasUnsavedChanges) {
      if (!window.confirm('Tienes cambios sin guardar. ¿Estás seguro de que quieres cerrar?')) {
        return;
      }
    }
    
    setIsExerciseModalOpen(false);
    setSelectedExercise(null);
    setSelectedExerciseTab('general');
    setExerciseDraft(null);
    setLibraryTitles({});
    setExerciseSets([]);
    setAppliedPresetId(null);
    setIsPresetSelectorOpen(false);
    setIsMeasuresObjectivesEditorOpen(false);
    setOriginalExerciseSets([]);
    setUnsavedSetChanges({});
    setExpandedSeries({});
    setShowPerSetCards(false);
    setIsSeriesEditMode(false);
    setOriginalSeriesOrder([]);
    setIsCreatingExercise(false);
  };

  useEffect(() => {
    if (!isExerciseModalOpen || !isCreatingExercise) return;
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSaveCreatingExercise()) {
        e.preventDefault();
        handleSaveCreatingExercise();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExerciseModalOpen, isCreatingExercise]);

  const syncProgramSetsCount = (targetCount) => {
    const target = Math.max(1, Math.min(20, Math.floor(targetCount) || 1));
    const current = exerciseSets.length;
    if (target === current) return;
    if (!currentExerciseId || !programId || !selectedModule || !selectedSession) return;
    if (target > current) {
      (async () => {
        for (let i = 0; i < target - current; i++) await handleCreateSet();
      })();
    } else {
      if (!window.confirm(`Se eliminarán ${current - target} serie(s). ¿Continuar?`)) return;
      const toRemove = exerciseSets.slice(-(current - target));
      (async () => {
        for (const s of toRemove) await handleDeleteSet(s, { skipConfirm: true });
      })();
    }
  };

  // Toggle series expansion
  const handleToggleSeriesExpansion = (setId) => {
    setExpandedSeries(prev => ({
      ...prev,
      [setId]: !prev[setId]
    }));
  };

  // Parse intensity value from "x/10" format to just the number for display
  const parseIntensityForDisplay = (value) => {
    if (!value || value === null || value === undefined || value === '') {
      return '';
    }
    const strValue = String(value);
    // If it's in "x/10" format, extract the number
    if (strValue.includes('/10')) {
      return strValue.replace('/10', '').trim();
    }
    // If it's just a number, return it
    return strValue;
  };

  // Format reps value to "x-y" format
  const formatRepsValue = (value) => {
    // Remove all spaces and keep only numbers and "-"
    let cleaned = value.replace(/[^0-9-]/g, '');
    
    // Remove multiple consecutive dashes (keep only single dashes)
    cleaned = cleaned.replace(/-+/g, '-');
    
    // Remove leading dashes (but allow trailing dash while typing)
    cleaned = cleaned.replace(/^-+/, '');
    
    // If empty, return empty string
    if (cleaned === '') {
      return '';
    }
    
    // Split by dash to get parts
    const parts = cleaned.split('-');
    
    // If only one part (no dash or trailing dash), return as is
    if (parts.length === 1) {
      return parts[0];
    }
    
    // If there's a trailing dash (like "10-"), allow it for now
    if (cleaned.endsWith('-') && parts.length === 2 && parts[1] === '') {
      return cleaned; // Allow "10-" format while typing
    }
    
    // If more than 2 parts, take first two
    if (parts.length > 2) {
      return `${parts[0]}-${parts[1]}`;
    }
    
    // Return formatted as "x-y"
    return cleaned;
  };

  // Update set value for a specific objective (only local state, not DB)
  const handleUpdateSetValue = (setIndex, objectiveField, value) => {
    if (!currentExerciseId || !programId || !selectedModule || !selectedSession) {
      return;
    }

    const set = exerciseSets[setIndex];
    if (!set || !set.id) {
      console.error('Set not found or missing ID');
      return;
    }

    let processedValue = value;

    // Only apply special validation for known objective types; custom objectives store as-is
    if (objectiveField === 'intensity') {
      // Remove any non-numeric characters
      const numericValue = value.replace(/[^0-9]/g, '');
      if (numericValue === '') {
        processedValue = '';
      } else {
        const numValue = parseInt(numericValue, 10);
        if (numValue < 1) processedValue = '1';
        else if (numValue > 10) processedValue = '10';
        else processedValue = String(numValue);
      }
    } else if (objectiveField === 'reps') {
      processedValue = formatRepsValue(value);
    }
    // Other objective fields (including custom) are stored as-is

    // Update local state only (not DB)
    const updatedSets = [...exerciseSets];
    const originalSet = originalExerciseSets.find(s => s.id === set.id);
    
    // For intensity, store as "x/10" format in local state
    let valueToStore = processedValue === '' ? null : processedValue;
    if (objectiveField === 'intensity' && processedValue !== '') {
      valueToStore = `${processedValue}/10`;
    }
    
    updatedSets[setIndex] = {
      ...updatedSets[setIndex],
      [objectiveField]: valueToStore
    };
    setExerciseSets(updatedSets);
    
    // Check all editable objective fields for this set to determine if it has any unsaved changes
    const editableObjectiveFields = draftObjectives.filter(o => o !== 'previous');
    let setHasChanges = false;
    if (originalSet && editableObjectiveFields.length > 0) {
      for (const field of editableObjectiveFields) {
        const current = updatedSets[setIndex][field];
        const original = originalSet[field];
        const currentNormalized = current === null || current === undefined || current === '' ? null : String(current);
        const originalNormalized = original === null || original === undefined || original === '' ? null : String(original);
        if (currentNormalized !== originalNormalized) {
          setHasChanges = true;
          break;
        }
      }
    }
    
    setUnsavedSetChanges(prev => ({
      ...prev,
      [set.id]: setHasChanges
    }));
  };

  const handleUpdateAllSetsValue = (objectiveField, value) => {
    if (!currentExerciseId || !programId || !selectedModule || !selectedSession || exerciseSets.length === 0) return;
    let processedValue = value;
    if (objectiveField === 'intensity') {
      const numericValue = value.replace(/[^0-9]/g, '');
      if (numericValue === '') processedValue = '';
      else {
        const numValue = parseInt(numericValue, 10);
        if (numValue < 1) processedValue = '1';
        else if (numValue > 10) processedValue = '10';
        else processedValue = String(numValue);
      }
    } else if (objectiveField === 'reps') {
      processedValue = formatRepsValue(value);
    }
    const valueToStore = processedValue === '' ? null : (objectiveField === 'intensity' && processedValue !== '' ? `${processedValue}/10` : processedValue);
    const updatedSets = exerciseSets.map(s => ({ ...s, [objectiveField]: valueToStore }));
    setExerciseSets(updatedSets);
    const newUnsaved = {};
    updatedSets.forEach(s => { if (s.id) newUnsaved[s.id] = true; });
    setUnsavedSetChanges(prev => ({ ...prev, ...newUnsaved }));
  };

  // Save all changes for a specific set
  const handleSaveSetChanges = async (setId) => {
    if (!programId || !selectedModule || !selectedSession) {
      return;
    }

    // If creating exercise, sets are already in local state, no need to save
    if (isCreatingExercise) {
      // Just mark as saved by updating original sets
      const setIndex = exerciseSets.findIndex(s => s.id === setId);
      if (setIndex !== -1) {
        const updatedOriginalSets = [...originalExerciseSets];
        updatedOriginalSets[setIndex] = { ...exerciseSets[setIndex] };
        setOriginalExerciseSets(updatedOriginalSets);
        setUnsavedSetChanges(prev => {
          const newState = { ...prev };
          delete newState[setId];
          return newState;
        });
      }
      return;
    }

    if (!currentExerciseId) {
      return;
    }

    const setIndex = exerciseSets.findIndex(s => s.id === setId);
    if (setIndex === -1) {
      return;
    }

    const set = exerciseSets[setIndex];
    const originalSet = originalExerciseSets.find(s => s.id === setId);
    
    if (!set || !originalSet) {
      return;
    }

    // Build update data with only changed fields (all editable objectives, not just reps/intensity)
    const editableObjectiveFields = draftObjectives.filter(o => o !== 'previous');
    const updateData = {};
    let hasChanges = false;

    for (const field of editableObjectiveFields) {
      const current = set[field];
      const original = originalSet[field];
      const currentNormalized = current === null || current === undefined || current === '' ? null : String(current);
      const originalNormalized = original === null || original === undefined || original === '' ? null : String(original);
      if (currentNormalized !== originalNormalized) {
        updateData[field] = current === null || current === '' ? null : current;
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return; // No changes to save
    }

    try {
      setIsSavingSetChanges(true);
      
      // Check if session is a library reference
      const sessionIsLibraryRef = selectedSession.librarySessionRef;
      
      if (sessionIsLibraryRef && user) {
        // Update set in library session exercise
        await libraryService.updateSetInLibraryExercise(
          user.uid,
          selectedSession.librarySessionRef,
          currentExerciseId,
          setId,
          updateData
        );
      } else {
        // Update set in program session exercise
        await programService.updateSet(
          programId,
          selectedModule.id,
          selectedSession.id,
          currentExerciseId,
          setId,
          updateData
        );
      }
      
      // Update original sets to reflect saved state
      const updatedOriginalSets = [...originalExerciseSets];
      const originalSetIndex = updatedOriginalSets.findIndex(s => s.id === setId);
      if (originalSetIndex !== -1) {
        updatedOriginalSets[originalSetIndex] = {
          ...updatedOriginalSets[originalSetIndex],
          ...updateData
        };
      }
      setOriginalExerciseSets(updatedOriginalSets);
      
      // Update sets map for incomplete check
      setExerciseSetsMap(prev => ({
        ...prev,
        [currentExerciseId]: exerciseSets
      }));
      
      // Clear unsaved changes flag for this set
      setUnsavedSetChanges(prev => {
        const newState = { ...prev };
        delete newState[setId];
        return newState;
      });
      
      // Refresh incomplete status after set update
      await refreshIncompleteStatus();
    } catch (err) {
      console.error('Error saving set changes:', err);
      alert('Error al guardar los cambios. Por favor, intenta de nuevo.');
    } finally {
      setIsSavingSetChanges(false);
    }
  };

  // Handle edit series mode
  const handleEditSeries = async () => {
    if (!isSeriesEditMode) {
      // Entering edit mode: store original order
      setOriginalSeriesOrder([...exerciseSets]);
      setIsSeriesEditMode(true);
    } else {
      // Exiting edit mode: save order
      await handleSaveSeriesOrder();
    }
  };

  // Save series order
  const handleSaveSeriesOrder = async () => {
    if (!programId || !selectedModule || !selectedSession || !currentExerciseId) return;

    try {
      setIsUpdatingSeriesOrder(true);
      const seriesOrders = exerciseSets.map((set, index) => ({
        setId: set.id,
        order: index,
        title: `Serie ${index + 1}`,
      }));
      
      // Update each set's order and title
      await Promise.all(
        seriesOrders.map(({ setId, order, title }) =>
          programService.updateSet(
            programId,
            selectedModule.id,
            selectedSession.id,
            currentExerciseId,
            setId,
            { order, title }
          )
        )
      );
      
      // Update local state with new titles
      const updatedSets = exerciseSets.map((set, index) => ({
        ...set,
        order: index,
        title: `Serie ${index + 1}`,
      }));
      setExerciseSets(updatedSets);
      // Update original sets
      setOriginalExerciseSets(JSON.parse(JSON.stringify(updatedSets)));
      // Clear unsaved changes
      setUnsavedSetChanges({});
      // Update sets map for incomplete check
      setExerciseSetsMap(prev => ({
        ...prev,
        [currentExerciseId]: updatedSets
      }));
      
      // Refresh incomplete status after series order update
      await refreshIncompleteStatus();
      
      setIsSeriesEditMode(false);
      setOriginalSeriesOrder([]);
    } catch (err) {
      console.error('Error updating series order:', err);
      // Revert to original order on error
      if (originalSeriesOrder.length > 0) {
        setExerciseSets([...originalSeriesOrder]);
      }
      alert('Error al actualizar el orden de las series. Por favor, intenta de nuevo.');
    } finally {
      setIsUpdatingSeriesOrder(false);
    }
  };

  // Handle drag end for series
  const handleDragEndSeries = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = exerciseSets.findIndex((set) => set.id === active.id);
    const newIndex = exerciseSets.findIndex((set) => set.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Only update local state - don't save to Firestore yet
    const newSets = arrayMove(exerciseSets, oldIndex, newIndex);
    setExerciseSets(newSets);
  };

  // Handle create set
  const handleCreateSet = async () => {
    if (!programId || !selectedModule || !selectedSession) {
      return;
    }

    // If creating a new exercise, just add a temporary set to the list
    if (isCreatingExercise) {
      const tempSet = {
        id: `temp-${Date.now()}-${Math.random()}`,
        reps: null,
        intensity: null,
        order: exerciseSets.length,
        title: `Serie ${exerciseSets.length + 1}`
      };
      setExerciseSets(prev => [...prev, tempSet]);
      setOriginalExerciseSets(prev => [...prev, { ...tempSet }]);
      return tempSet;
    }

    // Otherwise, create set normally for existing exercise
    if (!currentExerciseId) {
      return;
    }

    try {
      setIsCreatingSet(true);
      const newSet = await programService.createSet(
        programId,
        selectedModule.id,
        selectedSession.id,
        currentExerciseId
      );
      
      // Reload sets
      const setsData = await programService.getSetsByExercise(
        programId,
        selectedModule.id,
        selectedSession.id,
        currentExerciseId
      );
      setExerciseSets(setsData);
      // Update original sets
      setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
      // Clear unsaved changes
      setUnsavedSetChanges({});
      // Update sets map for incomplete check
      setExerciseSetsMap(prev => ({
        ...prev,
        [currentExerciseId]: setsData
      }));
      
      // Refresh incomplete status after set creation
      await refreshIncompleteStatus();
      
      return newSet;
    } catch (err) {
      console.error('Error creating set:', err);
      alert('Error al crear la serie. Por favor, intenta de nuevo.');
      throw err;
    } finally {
      setIsCreatingSet(false);
    }
  };

  const handleDuplicateSet = async (setToDuplicate) => {
    if (!setToDuplicate || !currentExerciseId || !programId || !selectedModule || !selectedSession) {
      return;
    }

    try {
      const newSet = await handleCreateSet();
      if (!newSet || !newSet.id) return;

      const updateData = {
        reps: setToDuplicate.reps || null,
        intensity: setToDuplicate.intensity || null,
        order: exerciseSets.length, // place at end in local state; will be normalized later
        title: `Serie ${exerciseSets.length + 1}`,
      };

      await programService.updateSet(
        programId,
        selectedModule.id,
        selectedSession.id,
        currentExerciseId,
        newSet.id,
        updateData
      );

      // Reload sets after update
      const setsData = await programService.getSetsByExercise(
        programId,
        selectedModule.id,
        selectedSession.id,
        currentExerciseId
      );
      const sortedSets = setsData
        .map((set, index) => ({
          ...set,
          order: index,
          title: `Serie ${index + 1}`,
        }));

      setExerciseSets(sortedSets);
      setOriginalExerciseSets(JSON.parse(JSON.stringify(sortedSets)));
      setUnsavedSetChanges({});
      setExerciseSetsMap(prev => ({
        ...prev,
        [currentExerciseId]: sortedSets
      }));
      
      // Refresh incomplete status after set duplication
      await refreshIncompleteStatus();
    } catch (err) {
      console.error('Error duplicando serie:', err);
      alert('Error al duplicar la serie. Por favor, intenta de nuevo.');
    }
  };

  // Handle delete set
  const handleDeleteSet = async (set, options = {}) => {
    if (!programId || !selectedModule || !selectedSession || !set || !set.id) {
      return;
    }

    if (!options.skipConfirm && !window.confirm('¿Estás seguro de que quieres eliminar esta serie?')) {
      return;
    }

    // If creating a new exercise, just remove from local state
    if (isCreatingExercise && set.id.startsWith('temp-')) {
      setExerciseSets(prev => prev.filter(s => s.id !== set.id));
      setOriginalExerciseSets(prev => prev.filter(s => s.id !== set.id));
      setUnsavedSetChanges(prev => {
        const newState = { ...prev };
        delete newState[set.id];
        return newState;
      });
      return;
    }

    // Otherwise, delete from database
    if (!currentExerciseId) {
      return;
    }

    try {
      await programService.deleteSet(
        programId,
        selectedModule.id,
        selectedSession.id,
        currentExerciseId,
        set.id
      );
      
      // Reload sets
      const setsData = await programService.getSetsByExercise(
        programId,
        selectedModule.id,
        selectedSession.id,
        currentExerciseId
      );
      setExerciseSets(setsData);
      // Update original sets
      setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
      // Clear unsaved changes
      setUnsavedSetChanges({});
      // Update sets map for incomplete check
      setExerciseSetsMap(prev => ({
        ...prev,
        [currentExerciseId]: setsData
      }));
      
      // Refresh incomplete status after set deletion
      await refreshIncompleteStatus();
    } catch (err) {
      console.error('Error deleting set:', err);
      alert('Error al eliminar la serie. Por favor, intenta de nuevo.');
    }
  };

  // Helper function to check if an exercise is incomplete
  const isExerciseIncomplete = (exercise) => {
    if (!exercise) return true;
    
    // Check primary exercise - must have a value
    let hasPrimary = false;
    if (exercise.primary && typeof exercise.primary === 'object' && exercise.primary !== null) {
      try {
        const primaryValues = Object.values(exercise.primary);
        if (primaryValues.length > 0 && primaryValues[0]) {
          hasPrimary = true;
        }
      } catch (error) {
        // If error accessing primary, consider it incomplete
      }
    }
    if (!hasPrimary) return true;
    if (hasIncompleteLibraryReference(getPrimaryReferences(exercise))) return true;
    
    // Check alternatives - must have at least one
    const alternatives = exercise.alternatives && typeof exercise.alternatives === 'object' && exercise.alternatives !== null && !Array.isArray(exercise.alternatives)
      ? exercise.alternatives
      : {};
    const alternativesCount = Object.values(alternatives).reduce((sum, arr) => {
      return sum + (Array.isArray(arr) ? arr.length : 0);
    }, 0);
    if (alternativesCount === 0) return true;
    if (hasIncompleteLibraryReference(getAlternativeReferences(exercise))) return true;
    
    // Check measures - must have at least one
    const hasMeasures = Array.isArray(exercise.measures) && exercise.measures.length > 0;
    if (!hasMeasures) return true;
    
    // Check objectives - must have at least one
    // "previous" CAN be in objectives, but its value in sets should be empty
    const objectives = Array.isArray(exercise.objectives) ? exercise.objectives : [];
    if (objectives.length === 0) return true;
    
    // Check sets - must have at least one set
    const sets = exerciseSetsMap[exercise.id] || [];
    if (sets.length === 0) return true;
    
    // Check that sets have required data filled (excluding "previous" which can be empty)
    // For each set, check that all objectives (except "previous") have values
    const validObjectives = objectives.filter(obj => obj !== 'previous');
    if (validObjectives.length > 0) {
      // Check if all sets have at least one valid objective filled
      const allSetsHaveData = sets.every(set => {
        // Check if at least one valid objective has a value
        return validObjectives.some(obj => {
          const value = set[obj];
          return value !== null && value !== undefined && value !== '';
        });
      });
      if (!allSetsHaveData) return true;
    }
    
    return false;
  };

  // Helper function to check if an exercise is incomplete (given exercise data and sets)
  const checkExerciseIncomplete = (exercise, sets = []) => {
    if (!exercise) return true;
    
    // Check primary exercise
    let hasPrimary = false;
    if (exercise.primary && typeof exercise.primary === 'object' && exercise.primary !== null) {
      try {
        const primaryValues = Object.values(exercise.primary);
        if (primaryValues.length > 0 && primaryValues[0]) {
          hasPrimary = true;
        }
      } catch (error) {}
    }
    if (!hasPrimary) return true;
    if (hasIncompleteLibraryReference(getPrimaryReferences(exercise))) return true;
    
    // Check alternatives
    const alternatives = exercise.alternatives && typeof exercise.alternatives === 'object' && exercise.alternatives !== null && !Array.isArray(exercise.alternatives)
      ? exercise.alternatives
      : {};
    const alternativesCount = Object.values(alternatives).reduce((sum, arr) => {
      return sum + (Array.isArray(arr) ? arr.length : 0);
    }, 0);
    if (alternativesCount === 0) return true;
    if (hasIncompleteLibraryReference(getAlternativeReferences(exercise))) return true;
    
    // Check measures
    const hasMeasures = Array.isArray(exercise.measures) && exercise.measures.length > 0;
    if (!hasMeasures) return true;
    
    // Check objectives
    const objectives = Array.isArray(exercise.objectives) ? exercise.objectives : [];
    if (objectives.length === 0) return true;
    
    // Check sets
    if (sets.length === 0) return true;
    
    // Check that sets have required data filled
    const validObjectives = objectives.filter(obj => obj !== 'previous');
    if (validObjectives.length > 0) {
      const allSetsHaveData = sets.every(set => {
        return validObjectives.some(obj => {
          const value = set[obj];
          return value !== null && value !== undefined && value !== '';
        });
      });
      if (!allSetsHaveData) return true;
    }
    
    return false;
  };

  // Helper function to check if a session is incomplete by loading all exercises and sets
  const checkSessionIncomplete = async (sessionId, moduleId) => {
    if (!sessionId || !moduleId || !programId) return false;
    
    try {
      const exercisesData = await programService.getExercisesBySession(programId, moduleId, sessionId);
      const sortedExercises = exercisesData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      
      // Load sets for all exercises
      const setsMap = {};
      await Promise.all(
        sortedExercises.map(async (exercise) => {
          try {
            const setsData = await programService.getSetsByExercise(
              programId,
              moduleId,
              sessionId,
              exercise.id
            );
            setsMap[exercise.id] = setsData;
          } catch (err) {
            console.error(`Error loading sets for exercise ${exercise.id}:`, err);
            setsMap[exercise.id] = [];
          }
        })
      );
      
      // Check if any exercise is incomplete
      return sortedExercises.some(exercise => {
        const sets = setsMap[exercise.id] || [];
        return checkExerciseIncomplete(exercise, sets);
      });
    } catch (err) {
      console.error(`Error checking session ${sessionId} completeness:`, err);
      return false;
    }
  };

  // Helper function to check if a module is incomplete by checking all sessions
  const checkModuleIncomplete = async (moduleId) => {
    if (!moduleId || !programId) return false;
    
    try {
      const sessionsData = await programService.getSessionsByModule(programId, moduleId);
      const sortedSessions = sessionsData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      
      // Check if any session is incomplete
      for (const session of sortedSessions) {
        const isIncomplete = await checkSessionIncomplete(session.id, moduleId);
        if (isIncomplete) return true;
      }
      
      return false;
    } catch (err) {
      console.error(`Error checking module ${moduleId} completeness:`, err);
      return false;
    }
  };

  // Helper function to check if a session is incomplete (synchronous, uses state map)
  const isSessionIncomplete = (session) => {
    if (!session || !session.id) return false;
    return sessionIncompleteMap[session.id] === true;
  };

  // Helper function to check if a module is incomplete (synchronous, uses state map)
  const isModuleIncomplete = (module) => {
    if (!module || !module.id) return false;
    return moduleIncompleteMap[module.id] === true;
  };

  // Helper function to refresh incomplete status for current session and module
  const refreshIncompleteStatus = async () => {
    if (!selectedSession || !selectedModule || !programId) return;
    
    try {
      // Check current session completeness
      const sessionIncomplete = await checkSessionIncomplete(selectedSession.id, selectedModule.id);
      
      // Update session incomplete status
      setSessionIncompleteMap(prev => ({
        ...prev,
        [selectedSession.id]: sessionIncomplete
      }));
      
      // Check all sessions in module to update module incomplete status
      const sessionsData = await programService.getSessionsByModule(programId, selectedModule.id);
      const sortedSessions = sessionsData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      
      // Check each session's incomplete status
      const sessionStatuses = {};
      for (const session of sortedSessions) {
        if (session.id === selectedSession.id) {
          sessionStatuses[session.id] = sessionIncomplete;
        } else {
          // Check other sessions
          const isIncomplete = await checkSessionIncomplete(session.id, selectedModule.id);
          sessionStatuses[session.id] = isIncomplete;
        }
      }
      
      // Update session incomplete map
      setSessionIncompleteMap(prev => ({
        ...prev,
        ...sessionStatuses
      }));
      
      // Update module incomplete status
      const hasIncompleteSession = Object.values(sessionStatuses).some(status => status === true);
      setModuleIncompleteMap(prev => ({
        ...prev,
        [selectedModule.id]: hasIncompleteSession
      }));
    } catch (err) {
      console.error('Error refreshing incomplete status:', err);
    }
  };

  // Helper function to get primary exercise name
  const getPrimaryExerciseName = () => {
    const source = exerciseDraft || selectedExercise;
    if (!source) return 'Sin ejercicio';
    if (source.primary && typeof source.primary === 'object' && source.primary !== null) {
      try {
        const primaryValues = Object.values(source.primary);
        if (primaryValues.length > 0 && primaryValues[0]) {
          return primaryValues[0];
        }
      } catch (error) {
        console.error('Error extracting primary exercise name:', error);
      }
    }
    return source.name || source.title || `Ejercicio ${source.id?.slice(0, 8) || ''}`;
  };

  const handleAddAlternative = async () => {
    if (!user) return;
    
    // Allow adding alternatives even when creating (no currentExerciseId needed)
    if (!isCreatingExercise && !currentExerciseId) return;
    
    try {
      setIsLoadingLibrariesForSelection(true);
      setLibraryExerciseModalMode('add-alternative');
      setAlternativeToEdit(null);
      setSelectedLibraryForExercise(null);
      setExercisesFromSelectedLibrary([]);
      
      // Load available libraries
      const libraries = await libraryService.getLibrariesByCreator(user.uid);
      setAvailableLibrariesForSelection(libraries);
      setIsLibraryExerciseModalOpen(true);
    } catch (err) {
      console.error('Error loading libraries:', err);
      alert('Error al cargar las bibliotecas');
    } finally {
      setIsLoadingLibrariesForSelection(false);
    }
  };

  const applyPresetToExercise = async (preset) => {
    if (!programId || !selectedModule || !selectedSession) return;
    const objectives = Array.isArray(preset.objectives) && preset.objectives.includes('previous')
      ? preset.objectives
      : [...(preset.objectives || []), 'previous'];
    const updates = {
      measures: preset.measures || [],
      objectives,
      customMeasureLabels: preset.customMeasureLabels && typeof preset.customMeasureLabels === 'object' ? preset.customMeasureLabels : {},
      customObjectiveLabels: preset.customObjectiveLabels && typeof preset.customObjectiveLabels === 'object' ? preset.customObjectiveLabels : {},
    };
    if (isCreatingExercise) {
      setExerciseDraft((prev) => ({ ...prev, ...updates }));
      setSelectedExercise((prev) => (prev ? { ...prev, ...updates } : null));
      setAppliedPresetId(preset.id);
      setIsPresetSelectorOpen(false);
      return;
    }
    if (!currentExerciseId) return;
    try {
      const payload = { ...updates };
      if (selectedSession.librarySessionRef && user) {
        await libraryService.updateExerciseInLibrarySession(user.uid, selectedSession.librarySessionRef, currentExerciseId, payload);
      } else {
        await programService.updateExercise(programId, selectedModule.id, selectedSession.id, currentExerciseId, payload);
      }
      applyExercisePatch(currentExerciseId, payload);
      await refreshIncompleteStatus();
      setAppliedPresetId(preset.id);
      setIsPresetSelectorOpen(false);
    } catch (err) {
      console.error('Error applying preset:', err);
      alert('Error al aplicar la plantilla. Por favor, intenta de nuevo.');
    }
  };

  const handleMeasuresObjectivesEditorSave = async (data) => {
    const updates = {
      measures: data.measures || [],
      objectives: data.objectives || [],
      customMeasureLabels: data.customMeasureLabels && typeof data.customMeasureLabels === 'object' ? data.customMeasureLabels : {},
      customObjectiveLabels: data.customObjectiveLabels && typeof data.customObjectiveLabels === 'object' ? data.customObjectiveLabels : {},
    };
    if (editorModalMode === 'create_preset' && data.name && user?.uid) {
      try {
        const { id } = await measureObjectivePresetsService.create(user.uid, { name: data.name, ...updates });
        setPresetsList((prev) => [...prev, { id, name: data.name, ...updates }]);
        setAppliedPresetId(null);
        await applyPresetToExercise({ id, name: data.name, ...updates });
      } catch (err) {
        console.error('Error creating preset:', err);
        alert('Error al crear la plantilla. Por favor, intenta de nuevo.');
        return;
      }
    } else if (editorModalMode === 'edit_preset' && presetBeingEditedId && data.name && user?.uid) {
      try {
        await measureObjectivePresetsService.update(user.uid, presetBeingEditedId, { name: data.name, ...updates });
        setPresetsList((prev) => prev.map((p) => (p.id === presetBeingEditedId ? { ...p, name: data.name, ...updates } : p)));
        if (appliedPresetId === presetBeingEditedId && currentExerciseId && (programId && selectedModule && selectedSession)) {
          const payload = { ...updates };
          if (selectedSession.librarySessionRef && user) {
            await libraryService.updateExerciseInLibrarySession(user.uid, selectedSession.librarySessionRef, currentExerciseId, payload);
          } else {
            await programService.updateExercise(programId, selectedModule.id, selectedSession.id, currentExerciseId, payload);
          }
          applyExercisePatch(currentExerciseId, payload);
          await refreshIncompleteStatus();
        }
      } catch (err) {
        console.error('Error updating preset:', err);
        alert('Error al guardar la plantilla. Por favor, intenta de nuevo.');
        return;
      }
    } else if (editorModalMode === 'exercise') {
      if (isCreatingExercise) {
        setExerciseDraft((prev) => ({ ...prev, ...updates }));
        setSelectedExercise((prev) => (prev ? { ...prev, ...updates } : null));
      } else if (currentExerciseId && programId && selectedModule && selectedSession) {
        try {
          const payload = { ...updates };
          if (selectedSession.librarySessionRef && user) {
            await libraryService.updateExerciseInLibrarySession(user.uid, selectedSession.librarySessionRef, currentExerciseId, payload);
          } else {
            await programService.updateExercise(programId, selectedModule.id, selectedSession.id, currentExerciseId, payload);
          }
          applyExercisePatch(currentExerciseId, payload);
          await refreshIncompleteStatus();
        } catch (err) {
          console.error('Error updating exercise:', err);
          alert('Error al guardar. Por favor, intenta de nuevo.');
          return;
        }
      }
      setAppliedPresetId(null);
    }
    setIsMeasuresObjectivesEditorOpen(false);
    setEditorModalMode('exercise');
    setPresetBeingEditedId(null);
  };

  const handleMeasuresObjectivesEditorChange = (data) => {
    const updates = {
      measures: data.measures || [],
      objectives: data.objectives || [],
      customMeasureLabels: data.customMeasureLabels && typeof data.customMeasureLabels === 'object' ? data.customMeasureLabels : {},
      customObjectiveLabels: data.customObjectiveLabels && typeof data.customObjectiveLabels === 'object' ? data.customObjectiveLabels : {},
    };
    setExerciseDraft((prev) => (prev ? { ...prev, ...updates } : null));
    setSelectedExercise((prev) => (prev ? { ...prev, ...updates } : null));
    setAppliedPresetId(null);
    if (!isCreatingExercise && currentExerciseId && programId && selectedModule && selectedSession) {
      const payload = { ...updates };
      const persist = async () => {
        try {
          if (selectedSession.librarySessionRef && user) {
            await libraryService.updateExerciseInLibrarySession(user.uid, selectedSession.librarySessionRef, currentExerciseId, payload);
          } else {
            await programService.updateExercise(programId, selectedModule.id, selectedSession.id, currentExerciseId, payload);
          }
          applyExercisePatch(currentExerciseId, payload);
          await refreshIncompleteStatus();
        } catch (err) {
          console.error('Error updating exercise:', err);
        }
      };
      persist();
    }
  };

  // Helper function to get objective display name (supports custom labels)
  const getObjectiveDisplayName = (objective) => {
    if (draftCustomObjectiveLabels[objective]) return draftCustomObjectiveLabels[objective];
    const translations = {
      'reps': 'Repeticiones',
      'intensity': 'Intensidad',
      'previous': 'Anterior'
    };
    return translations[objective] || objective;
  };

  const handleDeleteAlternative = async (libraryId, index) => {
    if (!programId || !selectedModule || !selectedSession) {
      return;
    }

    try {
      const currentAlternatives = JSON.parse(JSON.stringify(draftAlternatives));
      if (currentAlternatives[libraryId] && Array.isArray(currentAlternatives[libraryId])) {
        currentAlternatives[libraryId] = currentAlternatives[libraryId].filter((_, i) => i !== index);
        
        if (currentAlternatives[libraryId].length === 0) {
          delete currentAlternatives[libraryId];
        }

        // If creating exercise, just update the draft
        if (isCreatingExercise) {
          setExerciseDraft(prev => ({
            ...prev,
            alternatives: currentAlternatives
          }));
          setSelectedExercise(prev => ({
            ...prev,
            alternatives: currentAlternatives
          }));
          return;
        }

        // Otherwise, save to database
        if (!currentExerciseId) return;

        await programService.updateExercise(
          programId,
          selectedModule.id,
          selectedSession.id,
          currentExerciseId,
          { alternatives: currentAlternatives }
        );

        applyExercisePatch(currentExerciseId, { alternatives: currentAlternatives });
        await refreshIncompleteStatus();
      }
    } catch (err) {
      console.error('Error deleting alternative:', err);
      alert('Error al eliminar la alternativa. Por favor, intenta de nuevo.');
    }
  };

  // Helper function to get measure display name (supports custom labels)
  const getMeasureDisplayName = (measure) => {
    if (draftCustomMeasureLabels[measure]) return draftCustomMeasureLabels[measure];
    if (measure === 'reps') return 'Repeticiones';
    if (measure === 'weight') return 'Peso';
    return measure;
  };

  const handleEditPrimary = async () => {
    if (!user) return;
    
    // Allow editing primary even when creating (no currentExerciseId needed)
    if (!isCreatingExercise && !currentExerciseId) return;
    
    try {
      setIsLoadingLibrariesForSelection(true);
      setLibraryExerciseModalMode('primary');
      setAlternativeToEdit(null);
      setSelectedLibraryForExercise(null);
      setExercisesFromSelectedLibrary([]);
      
      // Load available libraries
      const libraries = await libraryService.getLibrariesByCreator(user.uid);
      setAvailableLibrariesForSelection(libraries);
      setIsLibraryExerciseModalOpen(true);
    } catch (err) {
      console.error('Error loading libraries:', err);
      alert('Error al cargar las bibliotecas');
    } finally {
      setIsLoadingLibrariesForSelection(false);
    }
  };

  const handleEditAlternative = async (libraryId, index) => {
    if (!user) return;
    
    // Allow editing alternatives even when creating (no currentExerciseId needed)
    if (!isCreatingExercise && !currentExerciseId) return;
    
    try {
      setIsLoadingLibrariesForSelection(true);
      setLibraryExerciseModalMode('edit-alternative');
      setAlternativeToEdit({ libraryId, index });
      setSelectedLibraryForExercise(null);
      setExercisesFromSelectedLibrary([]);
      
      // Load available libraries
      const libraries = await libraryService.getLibrariesByCreator(user.uid);
      setAvailableLibrariesForSelection(libraries);
      setIsLibraryExerciseModalOpen(true);
    } catch (err) {
      console.error('Error loading libraries:', err);
      alert('Error al cargar las bibliotecas');
    } finally {
      setIsLoadingLibrariesForSelection(false);
    }
  };

  const handleCloseLibraryExerciseModal = () => {
    setIsLibraryExerciseModalOpen(false);
    setLibraryExerciseModalMode(null);
    setSelectedLibraryForExercise(null);
    setExercisesFromSelectedLibrary([]);
    setAvailableLibrariesForSelection([]);
    setAlternativeToEdit(null);
  };

  const handleSelectLibrary = async (libraryId) => {
    if (!libraryId) return;
    
    try {
      setIsLoadingExercisesFromLibrary(true);
      setSelectedLibraryForExercise(libraryId);
      
      // Load library data
      const library = await libraryService.getLibraryById(libraryId);
      if (library) {
        // Get exercises from library and sort by name
        const exercises = libraryService.getExercisesFromLibrary(library);
        exercises.sort((a, b) => a.name.localeCompare(b.name));
        setExercisesFromSelectedLibrary(exercises);
      }
    } catch (err) {
      console.error('Error loading exercises from library:', err);
      alert('Error al cargar los ejercicios de la biblioteca');
    } finally {
      setIsLoadingExercisesFromLibrary(false);
    }
  };

  const handleSelectExercise = async (exerciseName) => {
    // If creating new exercise in the create modal, use the new handler
    if (isCreateExerciseModalOpen && libraryExerciseModalMode === 'primary') {
      await handleSelectExerciseForNew(exerciseName);
      return;
    }
    
    // If creating exercise in the main modal, update the draft directly
    if (isCreatingExercise && libraryExerciseModalMode === 'primary') {
      const exerciseId = 'new'; // Temporary ID
      const primaryUpdate = {
        [selectedLibraryForExercise]: exerciseName
      };
      
      setExerciseDraft(prev => ({
        ...prev,
        primary: primaryUpdate
      }));
      
      setSelectedExercise(prev => ({
        ...prev,
        primary: primaryUpdate
      }));
      
      handleCloseLibraryExerciseModal();
      return;
    }

    const exerciseId = currentExerciseId;
    if (!exerciseId || !programId || !selectedModule || !selectedSession || !selectedLibraryForExercise || !exerciseName) {
      return;
    }

    try {
      if (libraryExerciseModalMode === 'primary') {
        // Update primary exercise
        const primaryUpdate = {
          [selectedLibraryForExercise]: exerciseName
        };
        
        await programService.updateExercise(
          programId,
          selectedModule.id,
          selectedSession.id,
          exerciseId,
          { primary: primaryUpdate }
        );
        
        applyExercisePatch(exerciseId, { primary: primaryUpdate });
        await refreshIncompleteStatus();
        
      } else if (libraryExerciseModalMode === 'add-alternative') {
        // Add alternative exercise - check if it already exists in any library
        const currentAlternatives = JSON.parse(JSON.stringify(draftAlternatives));
        let exerciseExists = false;
        
        // Check all libraries for this exercise name
        for (const libraryId in currentAlternatives) {
          if (Array.isArray(currentAlternatives[libraryId]) && currentAlternatives[libraryId].includes(exerciseName)) {
            exerciseExists = true;
            break;
          }
        }
        
        if (exerciseExists) {
          alert('Esta alternativa ya está agregada.');
          handleCloseLibraryExerciseModal();
          return;
        }
        
        if (!currentAlternatives[selectedLibraryForExercise]) {
          currentAlternatives[selectedLibraryForExercise] = [];
        }
        
        currentAlternatives[selectedLibraryForExercise].push(exerciseName);
        
        // If creating exercise, just update the draft
        if (isCreatingExercise) {
          setExerciseDraft(prev => ({
            ...prev,
            alternatives: currentAlternatives
          }));
          setSelectedExercise(prev => ({
            ...prev,
            alternatives: currentAlternatives
          }));
          
          // Update library titles if needed
          if (!libraryTitles[selectedLibraryForExercise]) {
            const library = await libraryService.getLibraryById(selectedLibraryForExercise);
            if (library && library.title) {
              setLibraryTitles({
                ...libraryTitles,
                [selectedLibraryForExercise]: library.title
              });
            }
          }
          
          handleCloseLibraryExerciseModal();
          return;
        }
        
        // Otherwise, save to database
        await programService.updateExercise(
          programId,
          selectedModule.id,
          selectedSession.id,
          exerciseId,
          { alternatives: currentAlternatives }
        );
        
        applyExercisePatch(exerciseId, { alternatives: currentAlternatives });
        await refreshIncompleteStatus();
        
        // Update library titles if needed
        if (!libraryTitles[selectedLibraryForExercise]) {
          const library = await libraryService.getLibraryById(selectedLibraryForExercise);
          if (library && library.title) {
            setLibraryTitles({
              ...libraryTitles,
              [selectedLibraryForExercise]: library.title
            });
          }
        }
        
      } else if (libraryExerciseModalMode === 'edit-alternative' && alternativeToEdit) {
        // Replace alternative exercise - check if new value already exists elsewhere
        const currentAlternatives = JSON.parse(JSON.stringify(draftAlternatives));
        if (currentAlternatives[alternativeToEdit.libraryId] && 
            Array.isArray(currentAlternatives[alternativeToEdit.libraryId]) &&
            alternativeToEdit.index < currentAlternatives[alternativeToEdit.libraryId].length) {
          
          // Check if exercise already exists in any library (excluding current index)
          let exerciseExists = false;
          for (const libraryId in currentAlternatives) {
            if (Array.isArray(currentAlternatives[libraryId])) {
              const indexInLibrary = currentAlternatives[libraryId].indexOf(exerciseName);
              if (indexInLibrary !== -1 && !(libraryId === alternativeToEdit.libraryId && indexInLibrary === alternativeToEdit.index)) {
                exerciseExists = true;
                break;
              }
            }
          }
          
          if (exerciseExists) {
            alert('Esta alternativa ya está agregada.');
            handleCloseLibraryExerciseModal();
            return;
          }
          
          // Replace at the specific index
          currentAlternatives[alternativeToEdit.libraryId][alternativeToEdit.index] = exerciseName;
          
          // If creating exercise, just update the draft
          if (isCreatingExercise) {
            setExerciseDraft(prev => ({
              ...prev,
              alternatives: currentAlternatives
            }));
            setSelectedExercise(prev => ({
              ...prev,
              alternatives: currentAlternatives
            }));
            handleCloseLibraryExerciseModal();
            return;
          }
          
          // Otherwise, save to database
          await programService.updateExercise(
            programId,
            selectedModule.id,
            selectedSession.id,
            exerciseId,
            { alternatives: currentAlternatives }
          );
          
          applyExercisePatch(exerciseId, { alternatives: currentAlternatives });
          await refreshIncompleteStatus();
        }
      }
      
      handleCloseLibraryExerciseModal();
    } catch (err) {
      console.error('Error updating exercise:', err);
      alert('Error al actualizar el ejercicio. Por favor, intenta de nuevo.');
    }
  };

  const handleEditExercises = async () => {
    if (!isExerciseEditMode) {
      // Entering edit mode: store original order
      setOriginalExercisesOrder([...exercises]);
      setIsExerciseEditMode(true);
    } else {
      // Exiting edit mode: save order
      await handleSaveExerciseOrder();
    }
  };

  const handleSaveExerciseOrder = async () => {
    if (!programId || !selectedModule || !selectedSession) return;

    try {
      setIsUpdatingExerciseOrder(true);
      const exerciseOrders = exercises.map((exercise, index) => ({
        exerciseId: exercise.id,
        order: index,
      }));
      await programService.updateExerciseOrder(programId, selectedModule.id, selectedSession.id, exerciseOrders);
      setIsExerciseEditMode(false);
      setOriginalExercisesOrder([]);
    } catch (err) {
      console.error('Error updating exercise order:', err);
      // Revert to original order on error
      if (originalExercisesOrder.length > 0) {
        setExercises([...originalExercisesOrder]);
      }
      alert('Error al actualizar el orden de los ejercicios. Por favor, intenta de nuevo.');
    } finally {
      setIsUpdatingExerciseOrder(false);
    }
  };

  const handleDragEndExercises = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !selectedSession) {
      return;
    }

    const oldIndex = exercises.findIndex((exercise) => exercise.id === active.id);
    const newIndex = exercises.findIndex((exercise) => exercise.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Only update local state - don't save to Firestore yet
    const newExercises = arrayMove(exercises, oldIndex, newIndex);
    setExercises(newExercises);
  };

  const handleDeleteExercise = (exercise) => {
    setExerciseToDelete(exercise);
    setIsDeleteExerciseModalOpen(true);
    setDeleteExerciseConfirmation('');
  };

  const handleCloseDeleteExerciseModal = () => {
    setIsDeleteExerciseModalOpen(false);
    setExerciseToDelete(null);
    setDeleteExerciseConfirmation('');
  };

  const handleConfirmDeleteExercise = async () => {
    if (!exerciseToDelete || !deleteExerciseConfirmation.trim() || !programId || !selectedModule || !selectedSession) {
      return;
    }

    // Extract title from primary field for confirmation
    const getExerciseTitle = () => {
      if (exerciseToDelete.primary && typeof exerciseToDelete.primary === 'object') {
        const primaryValues = Object.values(exerciseToDelete.primary);
        if (primaryValues.length > 0 && primaryValues[0]) {
          return primaryValues[0];
        }
      }
      return exerciseToDelete.name || exerciseToDelete.title || `Ejercicio ${exerciseToDelete.id?.slice(0, 8) || ''}`;
    };

    const exerciseTitle = getExerciseTitle();
    if (deleteExerciseConfirmation.trim() !== exerciseTitle) {
      return;
    }

    try {
      setIsDeletingExercise(true);
      console.log('[handleConfirmDeleteExercise] Starting deletion:', {
        programId,
        moduleId: selectedModule?.id,
        sessionId: selectedSession?.id,
        exerciseId: exerciseToDelete?.id,
        exerciseTitle: exerciseTitle
      });
      
      if (!programId || !selectedModule?.id || !selectedSession?.id || !exerciseToDelete?.id) {
        throw new Error('Missing required IDs for exercise deletion');
      }
      
      await programService.deleteExercise(programId, selectedModule.id, selectedSession.id, exerciseToDelete.id);
      
      // Reload exercises
      const exercisesData = await programService.getExercisesBySession(programId, selectedModule.id, selectedSession.id);
      // Sort exercises by order field
      const sortedExercises = exercisesData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      setExercises(sortedExercises);
      
      // Close modal and exit edit mode if no exercises left
      handleCloseDeleteExerciseModal();
      if (exercisesData.length === 0) {
        setIsExerciseEditMode(false);
      }
    } catch (err) {
      console.error('[handleConfirmDeleteExercise] Error deleting exercise:', err);
      console.error('[handleConfirmDeleteExercise] Error details:', {
        message: err.message,
        code: err.code,
        stack: err.stack
      });
      alert(`Error al eliminar el ejercicio. Por favor, intenta de nuevo.${err.message ? ` Error: ${err.message}` : ''}`);
    } finally {
      setIsDeletingExercise(false);
    }
  };

  const handleAddSession = () => {
    setIsCopySessionModalOpen(true);
    setCopySessionModalPage('biblioteca');
    setSessionName('');
    setSessionImageFile(null);
    setSessionImagePreview(null);
    setSessionToEdit(null);
    // Load library sessions when opening
    if (librarySessions.length === 0) {
      loadLibrarySessions();
    }
  };

  // ✅ NEW: Load library sessions
  const loadLibrarySessions = async () => {
    if (!user) return;
    
    try {
      setIsLoadingLibrarySessions(true);
      const sessions = await libraryService.getSessionLibrary(user.uid);
      setLibrarySessions(sessions);
    } catch (error) {
      console.error('Error loading library sessions:', error);
      alert('Error al cargar las sesiones de la biblioteca');
    } finally {
      setIsLoadingLibrarySessions(false);
    }
  };

  // ✅ NEW: Handle library session selection
  const handleSelectLibrarySession = async (librarySessionId) => {
    if (!programId || !selectedModule || !librarySessionId || !user) return;
    
    try {
      setIsCreatingSession(true);
      
      console.log('Adding session to module:', {
        programId,
        moduleId: selectedModule.id,
        librarySessionId,
        isLibraryModule: !!selectedModule.libraryModuleRef
      });
      
      // Check if the module is a library reference
      if (selectedModule.libraryModuleRef) {
        // If module is a library reference, add session to library module's sessionRefs
        console.log('Module is library reference, adding to library module sessionRefs');
        await libraryService.addSessionToLibraryModule(
          user.uid,
          selectedModule.libraryModuleRef,
          librarySessionId
        );
      }
      
      // Always create program session document for override support
      await programService.createSessionFromLibrary(
        programId,
        selectedModule.id,
        librarySessionId
      );
      
      // Reload sessions
      const sessionsData = await programService.getSessionsByModule(programId, selectedModule.id);
      const sortedSessions = sessionsData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      setSessions(sortedSessions);
      
      handleCloseCopySessionModal();
    } catch (err) {
      console.error('Error creating session from library:', err);
      alert(`Error al agregar la sesión: ${err.message || 'Por favor, intenta de nuevo.'}`);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleCloseCopySessionModal = () => {
    setIsCopySessionModalOpen(false);
    setCopySessionModalPage('biblioteca');
    setLibrarySessions([]);
    if (!sessionToEdit) {
      setSessionName('');
      setSessionImageFile(null);
      setSessionImagePreview(null);
    }
  };

  const handleCloseSessionModal = () => {
    setIsSessionModalOpen(false);
    setSessionToEdit(null);
    setSessionName('');
    setSessionImageFile(null);
    setSessionImagePreview(null);
    setSessionImageUrlFromLibrary(null);
    setSessionImageUploadProgress(0);
  };

  const handleEditSessionClick = () => {
    if (!selectedSession) return;
    setSessionToEdit(selectedSession);
    // Use overridden values if they exist, otherwise use library/standalone values
    const displayTitle = selectedSession.title || selectedSession.name || '';
    const displayImage = selectedSession.image_url || null;
    setSessionName(displayTitle);
    setSessionImagePreview(displayImage);
    setSessionImageFile(null);
    // Reset editing library state - will be determined when saving
    setIsEditingLibrarySession(false);
    setIsSessionModalOpen(true);
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
    setSessionImageUrlFromLibrary(null);
    setSessionImageUploadProgress(0);
    // If editing, mark that we want to remove the image
    if (sessionToEdit) {
      setSessionImagePreview(null);
    }
  };

  const handleOpenMediaPicker = (context) => {
    setMediaPickerContext(context);
    setIsMediaPickerOpen(true);
  };

  const handleMediaPickerSelect = async (item) => {
    if (mediaPickerContext === 'program' && program) {
      try {
        await programService.updateProgram(program.id, { image_url: item.url, image_path: null });
        queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, image_url: item.url, image_path: null }));
      } catch (err) {
        console.error('Error updating program image:', err);
        alert('Error al asignar la imagen.');
      }
      setIsMediaPickerOpen(false);
      return;
    }
    if (mediaPickerContext === 'session') {
      if (isSessionModalOpen) {
        setSessionImagePreview(item.url);
        setSessionImageFile(null);
        setSessionImageUrlFromLibrary(item.url);
      } else if (selectedSession && programId && selectedModule) {
        try {
          if (selectedSession.librarySessionRef && user) {
            await libraryService.updateLibrarySession(user.uid, selectedSession.librarySessionRef, { image_url: item.url });
          } else {
            await programService.updateSession(programId, selectedModule.id, selectedSession.id, { image_url: item.url });
          }
          setSelectedSession(prev => (prev ? { ...prev, image_url: item.url } : null));
        } catch (err) {
          console.error('Error updating session image:', err);
          alert('Error al asignar la imagen.');
        }
      }
    }
    setIsMediaPickerOpen(false);
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim() || !programId || !selectedModule) {
      return;
    }

    try {
      setIsCreatingSession(true);
      
      console.log('Creating session with:', {
        programId,
        moduleId: selectedModule.id,
        sessionName: sessionName.trim(),
        hasImageFile: !!sessionImageFile,
      });
      
      let imageUrl = sessionImageUrlFromLibrary || null;
      if (!imageUrl && sessionImageFile) {
        try {
          setIsUploadingSessionImage(true);
          setSessionImageUploadProgress(0);
          imageUrl = await programService.uploadSessionImage(
            programId,
            selectedModule.id,
            sessionImageFile,
            (progress) => setSessionImageUploadProgress(Math.round(progress))
          );
          setSessionImageUploadProgress(100);
        } catch (uploadErr) {
          console.error('Error uploading session image - Full error:', uploadErr);
          alert(`Error al subir la imagen: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`);
          return;
        } finally {
          setIsUploadingSessionImage(false);
        }
      }
      
      const newSession = await programService.createSession(programId, selectedModule.id, sessionName.trim(), null, imageUrl);
      
      // ✅ NEW: Save to library if requested
      
      // Reload sessions
      const sessionsData = await programService.getSessionsByModule(programId, selectedModule.id);
      // Sort sessions by order field
      const sortedSessions = sessionsData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      setSessions(sortedSessions);
      
      // Close the appropriate modal
      if (isCopySessionModalOpen) {
        handleCloseCopySessionModal();
      } else {
      handleCloseSessionModal();
      }
    } catch (err) {
      console.error('Error creating session - Full error:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      alert(`Error al crear la sesión: ${err.message || 'Por favor, intenta de nuevo.'}`);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleUpdateSession = async () => {
    if (!sessionName.trim() || !programId || !selectedModule || !sessionToEdit) {
      return;
    }

    try {
      setIsUpdatingSession(true);
      
      console.log('Updating session with:', {
        programId,
        moduleId: selectedModule.id,
        sessionId: sessionToEdit.id,
        sessionName: sessionName.trim(),
        hasImageFile: !!sessionImageFile,
        hasImagePreview: !!sessionImagePreview,
        currentImageUrl: sessionToEdit.image_url,
        isLibrarySession: !!sessionToEdit.librarySessionRef,
        isEditingLibrary: isEditingLibrarySession
      });
      
      // ✅ NEW: Check if library session - show edit options
      if (sessionToEdit.librarySessionRef && !isEditingLibrarySession) {
        // Show modal to choose: edit library or customize for program
        const editChoice = window.confirm(
          'Esta sesión está vinculada a la biblioteca.\n\n' +
          '¿Cómo deseas editar?\n\n' +
          'OK = Editar en biblioteca (afecta todos los programas)\n' +
          'Cancelar = Personalizar solo para este programa'
        );
        
        setIsEditingLibrarySession(editChoice);
        
        if (!editChoice) {
          // User chose to customize for this program only
          // Update override instead
          let imageUrl = sessionImageUrlFromLibrary ?? sessionToEdit.image_url ?? null;
          if (sessionImageFile) {
            try {
              setIsUploadingSessionImage(true);
              imageUrl = await programService.uploadSessionImage(
                programId,
                selectedModule.id,
                sessionImageFile,
                (progress) => setSessionImageUploadProgress(Math.round(progress))
              );
            } catch (uploadErr) {
              alert(`Error al subir la imagen: ${uploadErr.message}`);
              return;
            } finally {
              setIsUploadingSessionImage(false);
            }
          } else if (!sessionImagePreview && sessionToEdit.image_url) {
            imageUrl = null;
          }
          
          // Update override
          await programService.updateSessionOverride(programId, selectedModule.id, sessionToEdit.id, {
            title: sessionName.trim(),
            image_url: imageUrl
          });
          
          // Reload sessions
          const sessionsData = await programService.getSessionsByModule(programId, selectedModule.id);
          const sortedSessions = sessionsData.sort((a, b) => {
            const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
            const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
            return orderA - orderB;
          });
          setSessions(sortedSessions);
          
          if (selectedSession && selectedSession.id === sessionToEdit.id) {
            const updatedSession = sortedSessions.find(s => s.id === sessionToEdit.id);
            if (updatedSession) setSelectedSession(updatedSession);
          }
          
          handleCloseSessionModal();
          setIsUpdatingSession(false);
          return;
        }
      }
      
      // ✅ Regular update (standalone or editing library)
      let imageUrl = sessionImageUrlFromLibrary ?? sessionToEdit.image_url ?? null;
      let shouldRemoveImage = false;
      
      if (sessionImageFile) {
        try {
          setIsUploadingSessionImage(true);
          setSessionImageUploadProgress(0);
          imageUrl = await programService.uploadSessionImage(
            programId,
            selectedModule.id,
            sessionImageFile,
            (progress) => setSessionImageUploadProgress(Math.round(progress))
          );
          setSessionImageUploadProgress(100);
        } catch (uploadErr) {
          console.error('Error uploading session image - Full error:', uploadErr);
          alert(`Error al subir la imagen: ${uploadErr.message || 'Por favor, intenta de nuevo.'}`);
          return;
        } finally {
          setIsUploadingSessionImage(false);
        }
      } else if (!sessionImagePreview && sessionToEdit.image_url) {
        shouldRemoveImage = true;
        imageUrl = null;
      }
      
          // ✅ NEW: If editing library session, update library
          if (sessionToEdit.librarySessionRef && isEditingLibrarySession && user) {
            // Update library session (this will propagate to all programs)
            await libraryService.updateLibrarySession(user.uid, sessionToEdit.librarySessionRef, {
              title: sessionName.trim(),
              image_url: imageUrl
            });
            
            // The library update will propagate to all programs using it
            // No need to update override since we're editing the library directly
          } else {
        // Update standalone session
        const updateData = {
          title: sessionName.trim()
        };
        
        if (shouldRemoveImage) {
          updateData.image_url = null;
        } else if (imageUrl !== null) {
          updateData.image_url = imageUrl;
        }
        
        await programService.updateSession(programId, selectedModule.id, sessionToEdit.id, updateData);
      }
      
      // Reload sessions
      const sessionsData = await programService.getSessionsByModule(programId, selectedModule.id);
      // Sort sessions by order field
      const sortedSessions = sessionsData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      setSessions(sortedSessions);
      
      // Update selectedSession if it's the one being edited
      if (selectedSession && selectedSession.id === sessionToEdit.id) {
        const updatedSession = sortedSessions.find(s => s.id === sessionToEdit.id);
        if (updatedSession) {
          setSelectedSession(updatedSession);
        }
      }
      
      handleCloseSessionModal();
    } catch (err) {
      console.error('Error updating session - Full error:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      alert(`Error al actualizar la sesión: ${err.message || 'Por favor, intenta de nuevo.'}`);
    } finally {
      setIsUpdatingSession(false);
    }
  };

  const handleDeleteSession = (session) => {
    setSessionToDelete(session);
    setIsDeleteSessionModalOpen(true);
    setDeleteSessionConfirmation('');
  };

  const handleCloseDeleteSessionModal = () => {
    setIsDeleteSessionModalOpen(false);
    setSessionToDelete(null);
    setDeleteSessionConfirmation('');
  };

  const handleConfirmDeleteSession = async () => {
    if (!sessionToDelete || !deleteSessionConfirmation.trim() || !programId || !selectedModule) {
      console.error('Missing required data for deletion:', {
        hasSessionToDelete: !!sessionToDelete,
        hasConfirmation: !!deleteSessionConfirmation.trim(),
        hasProgramId: !!programId,
        hasSelectedModule: !!selectedModule,
        sessionToDelete,
        programId,
        selectedModuleId: selectedModule?.id
      });
      return;
    }

    // Verify the confirmation matches the session title
    const sessionTitle = sessionToDelete.title || sessionToDelete.name || `Sesión ${sessionToDelete.id?.slice(0, 8) || ''}`;
    if (deleteSessionConfirmation.trim() !== sessionTitle) {
      console.error('Confirmation mismatch:', {
        entered: deleteSessionConfirmation.trim(),
        expected: sessionTitle
      });
      return;
    }

    try {
      setIsDeletingSession(true);
      
      console.log('Attempting to delete session with:', {
        programId,
        moduleId: selectedModule.id,
        sessionId: sessionToDelete.id,
        session: sessionToDelete
      });
      
      // ✅ NEW: If library session reference, just remove the reference (don't delete library)
      if (sessionToDelete.librarySessionRef) {
        // Delete program session document (which is just a reference)
        await programService.deleteSession(programId, selectedModule.id, sessionToDelete.id);
      } else {
        // Standalone session - delete normally
        await programService.deleteSession(programId, selectedModule.id, sessionToDelete.id);
      }
      
      // Reload sessions
      const sessionsData = await programService.getSessionsByModule(programId, selectedModule.id);
      // Sort sessions by order field
      const sortedSessions = sessionsData.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      setSessions(sortedSessions);
      
      // If the deleted session was selected, go back to sessions list
      if (selectedSession && selectedSession.id === sessionToDelete.id) {
        setSelectedSession(null);
        setExercises([]);
      }
      
      // Close modal and exit edit mode if no sessions left
      handleCloseDeleteSessionModal();
      if (sessionsData.length === 0) {
        setIsSessionEditMode(false);
      }
    } catch (err) {
      console.error('Error deleting session - Full error:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      alert(`Error al eliminar la sesión: ${err.message || 'Por favor, intenta de nuevo.'}`);
    } finally {
      setIsDeletingSession(false);
    }
  };

  // Memoize tab content rendering to prevent unnecessary re-renders
  const renderTabContent = useCallback(() => {
    if (loading) {
      return (
        <div className="program-detail-loading">
          <p>Cargando programa...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="program-detail-error">
          <p>{error}</p>
        </div>
      );
    }

    if (!program) {
      return null;
    }

    const currentTab = effectiveTabConfig[currentTabIndex];

    switch (currentTab.key) {
      case 'lab':
        return (
          <div className="program-tab-content">
            <h1 className="program-page-title">Resumen</h1>
            <div className="lab-content">
              {isLoadingAnalytics ? (
                <div className="lab-loading">
                  <p>Cargando estadísticas...</p>
                </div>
              ) : analyticsError ? (
                <div className="lab-error">
                  <p>{analyticsError}</p>
                </div>
              ) : analytics ? (
                <>
                  <div className="program-section lab-section lab-section-overview">
                    <div className="program-section__header">
                      <h2 className="program-section__title">Resumen general</h2>
                    </div>
                    <div className="lab-metrics-grid lab-metrics-grid-overview">
                      <MetricCard 
                        statKey="totalEnrolled"
                        value={analytics.enrollment.totalEnrolled}
                        label="Total Inscritos"
                        description="Usuarios que se han inscrito en el programa"
                      />
                      <MetricCard 
                        statKey="activeEnrollments"
                        value={analytics.enrollment.activeEnrollments}
                        label="Activos"
                        description="Usuarios con inscripción activa actualmente"
                      />
                      <MetricCard 
                        statKey="totalSessionsCompleted"
                        value={analytics.engagement.totalSessionsCompleted}
                        label="Sesiones Completadas"
                        description="Total de sesiones completadas por todos los usuarios"
                      />
                      <MetricCard 
                        statKey="completionRate"
                        value={`${analytics.engagement.completionRate}%`}
                        label="Tasa de Finalización"
                        description="Porcentaje de usuarios que han completado al menos una sesión"
                      />
                    </div>
                  </div>

                  <div className="program-section lab-section">
                    <div className="program-section__header">
                      <h2 className="program-section__title">Inscripciones</h2>
                    </div>
                    <div className="lab-metrics-grid">
                      <MetricCard 
                        statKey="recentEnrollments30Days"
                        value={analytics.enrollment.recentEnrollments30Days}
                        label="Últimos 30 días"
                        description="Nuevas inscripciones en el último mes"
                        percentageChange={analytics.enrollment.recentEnrollmentsPercentageChange}
                      />
                      <MetricCard 
                        statKey="trialUsers"
                        value={analytics.enrollment.trialUsers}
                        label="Pruebas Gratis"
                        description="Usuarios que están usando o usaron prueba gratis"
                      />
                      <MetricCard 
                        statKey="expiredEnrollments"
                        value={analytics.enrollment.expiredEnrollments}
                        label="Expirados"
                        description="Inscripciones que han expirado"
                      />
                      <MetricCard 
                        statKey="cancelledEnrollments"
                        value={analytics.enrollment.cancelledEnrollments}
                        label="Cancelados"
                        description="Usuarios que cancelaron su suscripción"
                      />
                      <MetricCard 
                        statKey="averageEnrollmentDurationDays"
                        value={analytics.enrollment.averageEnrollmentDurationDays}
                        label="Duración Promedio"
                        description="Duración promedio de las inscripciones en días"
                      />
                    </div>
                  </div>

                  <div className="program-section lab-section">
                    <div className="program-section__header">
                      <h2 className="program-section__title">Compromiso</h2>
                    </div>
                    <div className="lab-metrics-grid">
                      <MetricCard 
                        statKey="averageSessionsPerUser"
                        value={analytics.engagement.averageSessionsPerUser}
                        label="Promedio por Usuario"
                        description="Sesiones completadas en promedio por usuario"
                      />
                      <MetricCard 
                        statKey="usersWithAtLeastOneSession"
                        value={analytics.engagement.usersWithAtLeastOneSession}
                        label="Usuarios Activos"
                        description="Usuarios que han completado al menos una sesión"
                      />
                      <MetricCard 
                        statKey="averageDuration"
                        value={analytics.sessions.averageDuration > 0 
                          ? `${Math.floor(analytics.sessions.averageDuration / 60)}m ${analytics.sessions.averageDuration % 60}s`
                          : 'N/A'}
                        label="Duración Promedio"
                        description="Tiempo promedio que tardan los usuarios en completar una sesión"
                      />
                      <MetricCard 
                        statKey="totalCompletions"
                        value={analytics.sessions.totalCompletions}
                        label="Total Completadas"
                        description="Número total de veces que se completaron sesiones"
                      />
                    </div>
                  </div>

                  <div className="program-section lab-section">
                    <div className="program-section__header">
                      <h2 className="program-section__title">Progresión de usuarios</h2>
                    </div>
                    <div className="lab-metrics-grid">
                      <MetricCard 
                        statKey="usersWithZeroSessions"
                        value={analytics.progression.usersWithZeroSessions}
                        label="0 Sesiones"
                        description="Usuarios que aún no han completado ninguna sesión"
                      />
                      <MetricCard 
                        statKey="usersWithOneToFiveSessions"
                        value={analytics.progression.usersWithOneToFiveSessions}
                        label="1-5 Sesiones"
                        description="Usuarios que han completado entre 1 y 5 sesiones"
                      />
                      <MetricCard 
                        statKey="usersWithSixToTenSessions"
                        value={analytics.progression.usersWithSixToTenSessions}
                        label="6-10 Sesiones"
                        description="Usuarios que han completado entre 6 y 10 sesiones"
                      />
                      <MetricCard 
                        statKey="usersWithTenPlusSessions"
                        value={analytics.progression.usersWithTenPlusSessions}
                        label="10+ Sesiones"
                        description="Usuarios que han completado 10 o más sesiones"
                      />
                      {analytics.progression.averageWeeklyStreak !== undefined && (
                        <MetricCard 
                          statKey="averageWeeklyStreak"
                          value={analytics.progression.averageWeeklyStreak}
                          label="Racha Semanal Promedio"
                          description="Promedio de semanas consecutivas completadas"
                        />
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="lab-empty">
                  <p>No hay datos disponibles</p>
                </div>
              )}
            </div>
          </div>
        );
      case 'configuracion': {
        const tutorialsCount = !program.tutorials ? 0 : Object.values(program.tutorials).reduce((sum, videos) => sum + (Array.isArray(videos) ? videos.length : 0), 0);
        return (
          <div className="program-tab-content">
            <h1 className="program-page-title">Ajustes</h1>
            {program.deliveryType === 'one_on_one' && (
              <div className="program-section" style={{ marginBottom: 24 }}>
                <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                  Este programa es un contenedor general (1-on-1). Los cambios aquí se aplican por referencia a todos los clientes. El contenido (semanas y sesiones) se asigna en la ficha de cada cliente.
                </p>
              </div>
            )}

            {/* Contenido visual: image, video, tutorials cards */}
            <div className="program-section">
              <div className="program-section__header">
                <h2 className="program-section__title">Contenido visual</h2>
              </div>
              <div className="program-visual-cards">
                {/* Image card – edit inline */}
                <div className="program-visual-card program-visual-card--editable" onClick={(e) => e.stopPropagation()}>
                  <div className="program-visual-card__label">Imagen del programa</div>
                  <div className="program-visual-card__media">
                    {program.image_url ? (
                      <>
                        <img src={program.image_url} alt="Programa" />
                        <div className="program-visual-card__overlay">
                          <button type="button" className="program-visual-card__btn program-visual-card__btn--change" onClick={() => handleOpenMediaPicker('program')}>
                            Cambiar
                          </button>
                          {isUploadingImage && (
                            <div className="program-visual-card__progress">
                              <div className="program-visual-card__progress-bar"><div className="program-visual-card__progress-fill" style={{ width: `${imageUploadProgress}%` }} /></div>
                            </div>
                          )}
                          <button type="button" className="program-visual-card__btn program-visual-card__btn--delete" onClick={handleImageDelete} disabled={isUploadingImage}>Eliminar</button>
                        </div>
                      </>
                    ) : (
                      <button type="button" className="program-visual-card__placeholder program-visual-card__placeholder--clickable" onClick={() => handleOpenMediaPicker('program')}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span>Subir imagen</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Video intro card – edit inline */}
                <div className="program-visual-card program-visual-card--editable" onClick={(e) => e.stopPropagation()}>
                  <div className="program-visual-card__label">Video intro</div>
                  <div className="program-visual-card__media">
                    {program.video_intro_url ? (
                      <>
                        <video src={program.video_intro_url} muted playsInline />
                        <div className="program-visual-card__overlay">
                          <label className="program-visual-card__btn program-visual-card__btn--change">
                            <input type="file" accept="video/*" onChange={handleIntroVideoUpload} disabled={isUploadingIntroVideo} style={{ display: 'none' }} />
                            {isUploadingIntroVideo ? `Subiendo ${introVideoUploadProgress}%` : 'Cambiar'}
                          </label>
                          {isUploadingIntroVideo && (
                            <div className="program-visual-card__progress">
                              <div className="program-visual-card__progress-bar"><div className="program-visual-card__progress-fill" style={{ width: `${introVideoUploadProgress}%` }} /></div>
                            </div>
                          )}
                          <button type="button" className="program-visual-card__btn program-visual-card__btn--delete" onClick={handleIntroVideoDelete} disabled={isUploadingIntroVideo}>Eliminar</button>
                        </div>
                      </>
                    ) : (
                      <label className="program-visual-card__placeholder program-visual-card__placeholder--clickable">
                        <input type="file" accept="video/*" onChange={handleIntroVideoUpload} disabled={isUploadingIntroVideo} style={{ display: 'none' }} />
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 10l4.553-2.724c.281-.169.628-.169.909 0 .281.169.538.52.538.842v7.764c0 .322-.257.673-.538.842-.281.169-.628.169-.909 0L15 14M5 18h8c.53 0 1.039-.211 1.414-.586C14.789 17.039 15 16.53 15 16V8c0-.53-.211-1.039-.586-1.414C14.039 6.211 13.53 6 13 6H5c-.53 0-1.039.211-1.414.586C3.211 6.961 3 7.47 3 8v8c0 .53.211 1.039.586 1.414C3.961 17.789 4.47 18 5 18z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span>{isUploadingIntroVideo ? `Subiendo ${introVideoUploadProgress}%` : 'Subir video'}</span>
                        {isUploadingIntroVideo && <div className="program-visual-card__progress"><div className="program-visual-card__progress-bar"><div className="program-visual-card__progress-fill" style={{ width: `${introVideoUploadProgress}%` }} /></div></div>}
                      </label>
                    )}
                  </div>
                </div>

                {/* Tutorials card – edit inline */}
                <div className="program-visual-card program-visual-card--editable program-visual-card--tutorials" onClick={(e) => e.stopPropagation()}>
                  <div className="program-visual-card__label">Tutoriales</div>
                  <div className="program-visual-card__tutorials-body">
                    {TUTORIAL_SCREENS.map(({ key: screenKey, label }) => {
                      const videos = program.tutorials?.[screenKey] || [];
                      return (
                        <div key={screenKey} className="program-visual-card__tutorial-row">
                          <span className="program-visual-card__tutorial-label">{label}</span>
                          <div className="program-visual-card__tutorial-actions">
                            <label className="program-visual-card__btn program-visual-card__btn--small">
                              <input type="file" accept="video/*" onChange={(e) => handleAnuncioVideoUploadForScreen(e, screenKey, false)} disabled={isUploadingAnuncioVideo} style={{ display: 'none' }} />
                              {isUploadingAnuncioVideo ? 'Subiendo...' : '+'}
                            </label>
                            {videos.map((url, idx) => (
                              <span key={idx} className="program-visual-card__tutorial-video-pill">
                                <span>Video {idx + 1}</span>
                                <button type="button" className="program-visual-card__btn program-visual-card__btn--small program-visual-card__btn--delete" onClick={() => handleAnuncioVideoDeleteForScreen(screenKey, idx)} disabled={isUploadingAnuncioVideo}>×</button>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Información básica – edit inline */}
            <div className="program-section">
              <div className="program-section__header">
                <h2 className="program-section__title">Información básica</h2>
              </div>
              <div className="program-section__content program-config-inline">
                <div className="program-config-inline-row">
                  <span className="program-config-item-label">Nombre</span>
                  <div className="program-config-inline-field">
                    <input type="text" className="program-config-inline-input" value={programNameValue} onChange={(e) => setProgramNameValue(e.target.value)} placeholder="Nombre del programa" style={{ minWidth: 200 }} />
                    <button type="button" className="program-config-inline-btn" onClick={() => saveTitle(programNameValue)} disabled={isUpdatingProgram || !programNameValue.trim() || programNameValue.trim() === (program?.title || '')}>
                      {isUpdatingProgram ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
                <div className="program-config-inline-row">
                  <span className="program-config-item-label">Disciplina</span>
                  <span className="program-config-item-value">{program.discipline || 'No especificada'}</span>
                </div>
                <div className="program-config-inline-row">
                  <span className="program-config-item-label">Tipo</span>
                  <span className="program-config-item-value">{getAccessTypeLabel(program.access_duration)}</span>
                </div>
                <div className="program-config-inline-row">
                  <span className="program-config-item-label">Estado</span>
                  <div className="program-config-inline-field program-config-status-btns">
                    <button type="button" className={`program-config-status-btn ${program.status === 'draft' ? 'program-config-status-btn--active' : ''} program-config-status-btn--draft`} onClick={() => saveStatus('draft')} disabled={isUpdatingStatus || program.status === 'draft'}>Borrador</button>
                    <button type="button" className={`program-config-status-btn ${program.status === 'published' ? 'program-config-status-btn--active' : ''} program-config-status-btn--published`} onClick={() => saveStatus('published')} disabled={isUpdatingStatus || program.status === 'published'}>Publicado</button>
                  </div>
                </div>
                <div className="program-config-inline-row program-config-inline-row--full">
                  <span className="program-config-item-label">Descripción</span>
                  {isEditingDescription ? (
                    <div className="program-config-description-edit">
                      <textarea className="program-config-description-textarea" value={descriptionValue} onChange={(e) => setDescriptionValue(e.target.value)} placeholder="Escribe la descripción del programa..." rows={5} />
                      <div className="program-config-description-actions">
                        <Button title={isUpdatingDescription ? 'Guardando...' : 'Guardar'} onClick={async () => { if (!program) return; try { setIsUpdatingDescription(true); await programService.updateProgram(program.id, { description: descriptionValue }); queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, description: descriptionValue })); setIsEditingDescription(false); } catch (err) { console.error(err); alert('Error al actualizar la descripción'); } finally { setIsUpdatingDescription(false); } }} disabled={isUpdatingDescription} loading={isUpdatingDescription} />
                      </div>
                    </div>
                  ) : (
                    <div className="program-config-inline-field">
                      <p className="program-config-description">{program.description || 'Sin descripción'}</p>
                      <button type="button" className="program-config-inline-btn" onClick={() => { setIsEditingDescription(true); setDescriptionValue(program.description || ''); }}>Editar</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Precio y duración – edit inline */}
            <div className="program-section">
              <div className="program-section__header">
                <h2 className="program-section__title">Precio y duración</h2>
              </div>
              <div className="program-section__content program-config-inline">
                <div className="program-config-inline-row">
                  <span className="program-config-item-label">Precio</span>
                  <div className="program-config-inline-field">
                    <input type="text" className="program-config-inline-input" value={priceValue} onChange={(e) => setPriceValue(e.target.value.replace(/\D/g, ''))} placeholder="Gratis o monto" style={{ maxWidth: 140 }} />
                    <span className="program-config-inline-hint">$ (mín. 2000)</span>
                    <button type="button" className="program-config-inline-btn" onClick={() => savePrice(priceValue)} disabled={isUpdatingPrice || (priceValue !== '' && parseInt(priceValue, 10) < 2000)}>{isUpdatingPrice ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                </div>
                <div className="program-config-inline-row">
                  <span className="program-config-item-label">Prueba gratis</span>
                  <div className="program-config-inline-field program-config-inline-toggle-row">
                    <label className="program-config-toggle-wrap">
                      <input type="checkbox" checked={freeTrialActive} onChange={(e) => setFreeTrialActive(e.target.checked)} />
                      <span className="program-config-toggle-slider" />
                    </label>
                    {freeTrialActive && (
                      <>
                        <input type="number" min={0} className="program-config-inline-input" value={freeTrialDurationDays} onChange={(e) => setFreeTrialDurationDays(e.target.value.replace(/\D/g, ''))} style={{ width: 56 }} />
                        <span className="program-config-inline-hint">días</span>
                      </>
                    )}
                    <button type="button" className="program-config-inline-btn" onClick={() => saveFreeTrial(freeTrialActive, freeTrialDurationDays)} disabled={isUpdatingFreeTrial}>{isUpdatingFreeTrial ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                </div>
                <div className="program-config-inline-row">
                  <span className="program-config-item-label">Duración</span>
                  {isOneTimePayment() ? (
                    <div className="program-config-inline-field">
                      <input type="number" min={1} className="program-config-inline-input" value={durationValue} onChange={(e) => setDurationValue(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 64 }} />
                      <span className="program-config-inline-hint">semanas</span>
                      <button type="button" className="program-config-inline-btn" onClick={() => saveDuration(durationValue)} disabled={isUpdatingDuration}>{isUpdatingDuration ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                  ) : (
                    <span className="program-config-item-value">Mensual</span>
                  )}
                </div>
              </div>
            </div>

            {/* Ejecución – edit inline */}
            <div className="program-section">
              <div className="program-section__header">
                <h2 className="program-section__title">Ejecución</h2>
              </div>
              <div className="program-section__content program-config-inline">
                <div className="program-config-inline-row">
                  <span className="program-config-item-label">Racha</span>
                  <div className="program-config-inline-field program-config-inline-toggle-row">
                    <label className="program-config-toggle-wrap">
                      <input type="checkbox" checked={streakEnabled} onChange={(e) => setStreakEnabled(e.target.checked)} />
                      <span className="program-config-toggle-slider" />
                    </label>
                    {streakEnabled && (
                      <>
                        <input type="number" min={0} className="program-config-inline-input" value={minimumSessionsPerWeek} onChange={(e) => setMinimumSessionsPerWeek(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ width: 56 }} />
                        <span className="program-config-inline-hint">sesiones/semana</span>
                      </>
                    )}
                    <button type="button" className="program-config-inline-btn" onClick={() => saveStreak(streakEnabled, minimumSessionsPerWeek)} disabled={isUpdatingStreak}>{isUpdatingStreak ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                </div>
                <div className="program-config-inline-row">
                  <span className="program-config-item-label">Sugerencias de peso</span>
                  <div className="program-config-inline-field program-config-inline-toggle-row">
                    <label className="program-config-toggle-wrap">
                      <input type="checkbox" checked={weightSuggestionsEnabled} onChange={(e) => setWeightSuggestionsEnabled(e.target.checked)} />
                      <span className="program-config-toggle-slider" />
                    </label>
                    <button type="button" className="program-config-inline-btn" onClick={() => saveWeightSuggestions(weightSuggestionsEnabled)} disabled={isUpdatingWeightSuggestions}>{isUpdatingWeightSuggestions ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                </div>
                <div className="program-config-inline-row program-config-inline-row--full">
                  <span className="program-config-item-label">Bibliotecas auxiliares</span>
                  <div className="program-config-inline-field program-config-libraries-inline">
                    {isLoadingLibraries ? (
                      <p className="program-config-inline-hint">Cargando bibliotecas...</p>
                    ) : availableLibraries.length === 0 ? (
                      <p className="program-config-inline-hint">No tienes bibliotecas. Crea una desde Ejercicios.</p>
                    ) : (
                      <>
                        <div className="program-config-libraries-checkboxes">
                          {availableLibraries.map((lib) => (
                            <label key={lib.id} className="program-config-library-chip">
                              <input type="checkbox" checked={selectedLibraryIds.has(lib.id)} onChange={() => handleToggleLibrary(lib.id)} />
                              <span>{lib.title || `Biblioteca ${lib.id?.slice(0, 8)}`}</span>
                            </label>
                          ))}
                        </div>
                        <button type="button" className="program-config-inline-btn" onClick={() => saveAuxiliaryLibraries(selectedLibraryIds)} disabled={isUpdatingAuxiliaryLibraries}>{isUpdatingAuxiliaryLibraries ? 'Guardando...' : 'Guardar'}</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }
      case 'contenido':
        // If a session is selected, show exercises view
        if (selectedSession && selectedModule) {
          return (
            <div className="program-tab-content">
              <div className="exercises-content">
                <div className="exercises-header">
                  <h2 className="page-section-title">Ejercicios</h2>
                  {!contentPlanId && (
                  <div className="exercises-actions">
                  <button 
                    className={`exercise-action-pill ${isExerciseEditMode ? 'exercise-action-pill-disabled' : ''}`}
                    disabled={isExerciseEditMode}
                    onClick={() => {
                      if (!isExerciseEditMode) {
                        // Create a new empty exercise draft
                        const newExercise = {
                          id: 'new', // Temporary ID
                          primary: null,
                          alternatives: {},
                          measures: [],
                          objectives: []
                        };
                        setSelectedExercise(newExercise);
                        setExerciseDraft(JSON.parse(JSON.stringify(newExercise)));
                        setSelectedExerciseTab('general');
                        setIsCreatingExercise(true);
                        setExerciseSets([]);
                        setOriginalExerciseSets([]);
                        setUnsavedSetChanges({});
                        setIsExerciseModalOpen(true);
                      }
                    }}
                  >
                    <span className="exercise-action-icon">+</span>
                  </button>
                  <button 
                    className="exercise-action-pill"
                    onClick={handleEditExercises}
                  >
                    <span className="exercise-action-text">{isExerciseEditMode ? 'Guardar' : 'Editar'}</span>
                  </button>
                  </div>
                  )}
                </div>
                
                {/* Exercises List */}
                {isLoadingExercises ? (
                  <div className="exercises-loading">
                    <p>Cargando ejercicios...</p>
                  </div>
                ) : exercises.length === 0 ? (
                  <div className="exercises-empty">
                    <p>No hay ejercicios en esta sesión aún.</p>
                  </div>
                ) : (
                  <>
                    {isExerciseEditMode ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEndExercises}
                      >
                        <SortableContext
                          items={exercises.map((exercise) => exercise.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="exercises-list">
                            {exercises.map((exercise, index) => (
                              <SortableExerciseCard
                                key={exercise.id}
                                exercise={exercise}
                                isExerciseEditMode={isExerciseEditMode}
                                onDeleteExercise={handleDeleteExercise}
                                exerciseIndex={index}
                                isExerciseIncomplete={isExerciseIncomplete}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="exercises-list">
                        {exercises.map((exercise, index) => {
                          // Extract title from primary field (map of library IDs to titles)
                          const getExerciseTitle = () => {
                            if (exercise.primary && typeof exercise.primary === 'object') {
                              // Get the first value from the primary map
                              const primaryValues = Object.values(exercise.primary);
                              if (primaryValues.length > 0 && primaryValues[0]) {
                                return primaryValues[0];
                              }
                            }
                            // Fallback to name, title, or id
                            return exercise.name || exercise.title || `Ejercicio ${exercise.id?.slice(0, 8) || ''}`;
                          };

                          // Get exercise number from order field, fallback to index + 1
                          const exerciseNumber = (exercise.order !== undefined && exercise.order !== null) ? exercise.order + 1 : index + 1;

                          return (
                            <div 
                              key={exercise.id} 
                              className="exercise-card"
                              onClick={() => handleExerciseClick(exercise)}
                              style={{ cursor: 'pointer' }}
                            >
                              <div className="exercise-card-number">{exerciseNumber}</div>
                              {!isExerciseEditMode && isExerciseIncomplete(exercise) && (
                                <div className="exercise-incomplete-icon">
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </div>
                              )}
                              <div className="exercise-card-header">
                                <div className="exercise-card-title-row">
                                <h3 className="exercise-card-title">
                                  {getExerciseTitle()}
                                </h3>
                                </div>
                              </div>
                              {exercise.description && (
                                <p className="exercise-card-description">{exercise.description}</p>
                              )}
                              {exercise.video_url && (
                                <div className="exercise-card-video">
                                  <video
                                    src={exercise.video_url}
                                    controls
                                    className="exercise-card-video-player"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        }
        
        // If a module is selected, show sessions view
        if (selectedModule) {
          const moduleName = selectedModule.title || selectedModule.name || `Módulo ${selectedModule.id?.slice(0, 8) || ''}`;
          return (
            <div className="program-tab-content">
              <div className="sessions-content">
                <div className="sessions-header">
                  <h2 className="page-section-title">Sesiones</h2>
                  {!contentPlanId && (
                  <div className="sessions-actions">
                  <button 
                    className={`session-action-pill ${isSessionEditMode ? 'session-action-pill-disabled' : ''}`}
                    onClick={handleAddSession}
                    disabled={isSessionEditMode}
                  >
                    <span className="session-action-icon">+</span>
                  </button>
                  <button 
                    className="session-action-pill"
                    onClick={handleEditSessions}
                  >
                    <span className="session-action-text">{isSessionEditMode ? 'Guardar' : 'Editar'}</span>
                  </button>
                </div>
                  )}
              </div>
                
                {/* Sessions List */}
                {isLoadingSessions ? (
                  <div className="sessions-loading">
                    <p>Cargando sesiones...</p>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="sessions-empty">
                    <p>No hay sesiones aún en este módulo. Crea una nueva sesión para comenzar.</p>
                  </div>
                ) : (
                  <>
                    {isSessionEditMode ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEndSessions}
                      >
                        <SortableContext
                          items={sessions.map((session) => session.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="sessions-list">
                            {sessions.map((session, index) => (
                              <SortableSessionCard
                                key={session.id}
                                session={session}
                                isSessionEditMode={isSessionEditMode}
                                onSessionClick={handleSessionClick}
                                onDeleteSession={handleDeleteSession}
                                sessionIndex={index}
                                isSessionIncomplete={isSessionIncomplete(session)}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="sessions-list">
                        {sessions.map((session, index) => {
                          const sessionNumber = (session.order !== undefined && session.order !== null) ? session.order + 1 : index + 1;
                          return (
                          <div
                            key={session.id}
                            className={`session-card ${session.image_url ? 'session-card-with-image' : ''}`}
                            style={session.image_url ? {
                              backgroundImage: `url(${session.image_url})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              backgroundRepeat: 'no-repeat',
                            } : {}}
                            onClick={() => handleSessionClick(session)}
                          >
                              <div className="session-card-number">{sessionNumber}</div>
                              {isSessionIncomplete(session) && (
                                <div className="session-incomplete-icon">
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </div>
                              )}
                            <div className="session-card-header">
                              <h3 className="session-card-title">
                                {session.title || session.name || `Sesión ${session.id.slice(0, 8)}`}
                              </h3>
                              {session.description && (
                                <p className="session-card-description">{session.description}</p>
                              )}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        }
        
        // Otherwise, show modules list
        return (
          <div className="program-tab-content">
            <h1 className="program-page-title">Contenido</h1>
            {isLowTicket && (
              <div className="program-content-source-bar" style={{ marginBottom: 24, padding: '12px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 14, marginRight: 12 }}>Fuente del contenido:</span>
                <select
                  value={contentPlanId ?? ''}
                  onChange={(e) => handleContentPlanChange(e.target.value || null)}
                  disabled={isSavingContentPlan}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: 14,
                    minWidth: 220,
                    marginRight: 12,
                  }}
                >
                  <option value="">Crear contenido aquí (inline)</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.title || `Plan ${p.id?.slice(0, 8)}`}</option>
                  ))}
                </select>
                {isSavingContentPlan && <span style={{ fontSize: 13, opacity: 0.7 }}>Guardando...</span>}
                <span style={{ display: 'block', fontSize: 12, opacity: 0.6, marginTop: 8 }}>
                  {contentPlanId ? 'El contenido viene del plan seleccionado.' : 'Crea módulos, sesiones y ejercicios directamente en este programa.'}
                </span>
              </div>
            )}
            <div className="program-section">
              <div className="program-section__header program-section__header--row">
                <h2 className="program-section__title">Módulos</h2>
                {!contentPlanId && (
                <div className="modules-actions">
                  <button
                    className={`module-action-pill ${isModuleEditMode ? 'module-action-pill-disabled' : ''}`}
                    onClick={handleAddModule}
                    disabled={isModuleEditMode}
                  >
                    <span className="module-action-icon">+</span>
                  </button>
                  <button className="module-action-pill" onClick={handleEditModules}>
                    <span className="module-action-text">{isModuleEditMode ? 'Guardar' : 'Editar'}</span>
                  </button>
                </div>
                )}
              </div>
              <div className="modules-content">
              {/* Modules List */}
              {isLoadingModules ? (
                <div className="modules-loading">
                  <p>Cargando módulos...</p>
                </div>
              ) : modules.length === 0 ? (
                <div className="modules-empty">
                  <p>No tienes módulos aún. Crea un nuevo módulo para comenzar.</p>
                </div>
              ) : (
                <>
                  {isModuleEditMode ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={modules.map((module) => module.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="modules-list">
                          {modules.map((module, index) => (
                            <SortableModuleCard
                              key={module.id}
                              module={module}
                              isModuleEditMode={isModuleEditMode}
                              onModuleClick={handleModuleClick}
                              onDeleteModule={handleDeleteModule}
                              moduleIndex={index}
                              isModuleIncomplete={isModuleIncomplete(module)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="modules-list">
                      {modules.map((module, index) => {
                        const moduleNumber = (module.order !== undefined && module.order !== null) ? module.order + 1 : index + 1;
                        return (
                          <div
                            key={module.id}
                            className="module-card"
                            onClick={() => handleModuleClick(module)}
                          >
                            <div className="module-card-number">{moduleNumber}</div>
                            {isModuleIncomplete(module) && (
                              <div className="module-incomplete-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                            )}
                            <div className="module-card-header">
                              <h3 className="module-card-title">
                                {module.title || `Semana ${moduleNumber}`}
                              </h3>
                              {module.description && (
                                <p className="module-card-description">{module.description}</p>
                              )}
                            </div>
                            <div className="module-card-footer">
                              {/* TODO: Add module count or other info */}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  }, [loading, error, program, currentTabIndex, isLoadingAnalytics, analyticsError, analytics, selectedModule, selectedSession, modules, sessions, exercises, isModuleEditMode, isSessionEditMode, isExerciseEditMode, moduleIncompleteMap, sessionIncompleteMap, handleModuleClick, handleSessionClick, handleExerciseClick, handleCreateModule, handleCreateSession, handleCreateNewExercise, handleDeleteModule, handleDeleteSession, handleDeleteExercise, handleSaveModuleOrder, handleSaveSessionOrder, handleSaveExerciseOrder, isExerciseIncomplete]);

  const getScreenName = () => {
    if (selectedSession && currentTabIndex === effectiveTabConfig.findIndex(tab => tab.key === 'contenido')) {
      return selectedSession.title || selectedSession.name || `Sesión ${selectedSession.id?.slice(0, 8) || ''}`;
    }
    if (selectedModule && currentTabIndex === effectiveTabConfig.findIndex(tab => tab.key === 'contenido')) {
      const moduleName = selectedModule.title || selectedModule.name || `Módulo ${selectedModule.id?.slice(0, 8) || ''}`;
      return `Sesiones - ${moduleName}`;
    }
    return program?.title || 'Programa';
  };

  const shouldShowBackButton = selectedSession || selectedModule;
  
  const getBackPath = () => {
    if (selectedSession) return null;
    if (selectedModule) return null;
    return '/products';
  };

  const isContenidoTab = effectiveTabConfig[currentTabIndex]?.key === 'contenido';
  const showBreadcrumb = isContenidoTab && (selectedModule || selectedSession);

  return (
    <DashboardLayout 
      screenName={getScreenName()}
      headerBackgroundImage={selectedSession?.image_url || program?.image_url || null}
      onHeaderEditClick={selectedSession ? handleEditSessionClick : handleEditProgramClick}
      onBack={selectedSession ? handleBackToSessions : selectedModule ? handleBackToModules : null}
      showBackButton={shouldShowBackButton}
      backPath={getBackPath()}
    >
      <div className="program-page">
        <main className="program-page__main">
          {/* Top menu */}
          <nav className="program-page__top-nav" aria-label="Secciones del programa">
            {effectiveTabConfig.map((tab, index) => (
              <button
                key={tab.key}
                type="button"
                className={`program-page__tab ${currentTabIndex === index ? 'program-page__tab--active' : ''} ${isModuleEditMode || isSessionEditMode || isExerciseEditMode ? 'program-page__tab--disabled' : ''}`}
                onClick={() => handleTabClick(index)}
                disabled={isModuleEditMode || isSessionEditMode || isExerciseEditMode}
              >
                <span className="program-page__tab-icon">{tab.icon}</span>
                <span className="program-page__tab-label">{tab.navLabel || tab.title}</span>
              </button>
            ))}
          </nav>

          {/* Breadcrumb when in Contenido and drilled in */}
          {showBreadcrumb && (
            <div className="program-page__breadcrumb">
              <button type="button" className="program-page__breadcrumb-link" onClick={() => navigate('/products')}>
                {program?.title || 'Programa'}
              </button>
              {selectedModule && (
                <>
                  <span className="program-page__breadcrumb-sep">/</span>
                  <button
                    type="button"
                    className="program-page__breadcrumb-link"
                    onClick={() => { setSelectedModule(null); setSessions([]); setSelectedSession(null); setExercises([]); }}
                  >
                    {selectedModule.title || selectedModule.name || `Semana`}
                  </button>
                </>
              )}
              {selectedSession && (
                <>
                  <span className="program-page__breadcrumb-sep">/</span>
                  <button
                    type="button"
                    className="program-page__breadcrumb-link program-page__breadcrumb-link--current"
                    onClick={() => { setSelectedSession(null); setExercises([]); }}
                  >
                    {selectedSession.title || selectedSession.name || 'Sesión'}
                  </button>
                  <button
                    type="button"
                    className="program-page__breadcrumb-image-btn"
                    onClick={() => handleOpenMediaPicker('session')}
                    aria-label="Cambiar imagen de la sesión"
                    title="Cambiar imagen"
                  >
                    {selectedSession.image_url ? (
                      <img src={selectedSession.image_url} alt="" />
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="program-page__content">
            {renderTabContent()}
          </div>
        </main>
      </div>

      {/* Status Change Modal */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={handleCloseStatusModal}
        title="Cambiar Estado"
      >
        <div className="status-modal-content">
          <div className="status-options">
            <button
              className={`status-option ${selectedStatus === 'draft' ? 'status-option-selected status-option-draft' : ''}`}
              onClick={() => setSelectedStatus('draft')}
            >
              <span className="status-option-label">Borrador</span>
            </button>
            <button
              className={`status-option ${selectedStatus === 'published' ? 'status-option-selected status-option-published' : ''}`}
              onClick={() => setSelectedStatus('published')}
            >
              <span className="status-option-label">Publicado</span>
            </button>
          </div>
          <div className="status-modal-actions">
            <Button
              title={isUpdatingStatus ? 'Guardando...' : 'Guardar'}
              onClick={handleStatusChange}
              disabled={isUpdatingStatus || selectedStatus === program?.status}
              loading={isUpdatingStatus}
            />
          </div>
          </div>
        </Modal>

      {/* Price Change Modal */}
      <Modal
        isOpen={isPriceModalOpen}
        onClose={handleClosePriceModal}
        title="Cambiar Precio"
      >
        <div className="price-modal-content">
          <div className="price-input-container">
            <Input
              type="number"
              placeholder="Precio"
              value={priceValue}
              onChange={(e) => {
                const value = e.target.value;
                // Allow empty or numeric values
                if (value === '' || /^\d+$/.test(value)) {
                  setPriceValue(value);
                }
              }}
              min="2000"
              light={true}
            />
            <p className="price-modal-info-text">
              Este cambio solo aplicará a compras futuras y no afectará suscripciones en curso.
            </p>
          </div>
          <div className="price-modal-actions">
            <Button
              title={isUpdatingPrice ? 'Guardando...' : 'Guardar'}
              onClick={handlePriceChange}
              disabled={isUpdatingPrice || (priceValue !== '' && parseInt(priceValue, 10) < 2000) || (priceValue === '' && program?.price === null) || (priceValue !== '' && parseInt(priceValue, 10) === program?.price)}
              loading={isUpdatingPrice}
            />
          </div>
          </div>
        </Modal>

      {/* Duration Change Modal */}
      <Modal
        isOpen={isDurationModalOpen}
        onClose={handleCloseDurationModal}
        title="Cambiar duración (semanas)"
      >
        <div className="duration-modal-content">
          <div className="duration-input-container">
            <div className="duration-input-wrapper">
              <input
                type="number"
                className="duration-input"
                value={durationValue}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10) || 1;
                  if (value >= 1) {
                    setDurationValue(value);
                  }
                }}
                min="1"
              />
              <div className="duration-arrows">
                <button
                  type="button"
                  className="duration-spinner-button duration-spinner-up"
                  onClick={handleDurationIncrement}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)"/>
                  </svg>
                </button>
                <button
                  type="button"
                  className="duration-spinner-button duration-spinner-down"
                  disabled={durationValue <= 1}
                  onClick={handleDurationDecrement}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <p className="duration-modal-info-text">
              Semanas
            </p>
          </div>
          <div className="duration-modal-actions">
            <Button
              title={isUpdatingDuration ? 'Guardando...' : 'Guardar'}
              onClick={handleDurationChange}
              disabled={isUpdatingDuration || (() => {
                const durationString = `${durationValue} semanas`;
                const currentDurationString = typeof program?.duration === 'string' 
                  ? program.duration 
                  : program?.duration ? `${program.duration} semanas` : null;
                return durationString === currentDurationString;
              })()}
              loading={isUpdatingDuration}
            />
          </div>
        </div>
      </Modal>

      {/* Edit Program Modal */}
      <Modal
        isOpen={isEditProgramModalOpen}
        onClose={handleCloseEditProgramModal}
        title="Editar Programa"
      >
        <div className="edit-program-modal-content">
          <div className="edit-program-modal-body">
            {/* Left Side - Inputs */}
            <div className="edit-program-modal-left">
              <div className="edit-program-input-group">
                <label className="edit-program-input-label">Nombre del Programa</label>
                <Input
                  placeholder="Nombre del programa"
                  value={programNameValue}
                  onChange={(e) => setProgramNameValue(e.target.value)}
                  type="text"
                  light={true}
                />
              </div>
            </div>

            {/* Right Side - Image */}
            <div className="edit-program-modal-right">
              <div className="edit-program-image-section">
                {program?.image_url ? (
                  <div className="edit-program-image-container">
                    <img
                      src={program.image_url}
                      alt="Programa"
                      className="edit-program-image"
                    />
                    <div className="edit-program-image-overlay">
                      <div className="edit-program-image-actions">
                        <button type="button" className="edit-program-image-action-pill" onClick={() => handleOpenMediaPicker('program')}>
                          <span className="edit-program-image-action-text">Cambiar</span>
                        </button>
                        <button
                          className="edit-program-image-action-pill edit-program-image-delete-pill"
                          onClick={handleImageDelete}
                        >
                          <span className="edit-program-image-action-text">Eliminar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="edit-program-no-image">
                    <p>No hay imagen disponible</p>
                    <button type="button" className="edit-program-image-upload-button" onClick={() => handleOpenMediaPicker('program')}>
                      Subir Imagen
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="edit-program-modal-actions">
            <Button
              title={isUpdatingProgram ? 'Guardando...' : 'Guardar'}
              onClick={handleUpdateProgram}
              disabled={isUpdatingProgram || !programNameValue.trim() || programNameValue.trim() === (program?.title || '')}
              loading={isUpdatingProgram}
            />
          </div>
        </div>
      </Modal>

      {/* Streak Modal */}
      <Modal
        isOpen={isStreakModalOpen}
        onClose={handleCloseStreakModal}
        title="Configurar Racha"
      >
        <div className="streak-modal-content">
          <div className="streak-modal-body">
            <div className="streak-row">
              <div className="streak-toggle-section">
                <label className="streak-toggle-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <span>Activar Racha</span>
                  <label className="elegant-toggle">
                  <input
                    type="checkbox"
                    checked={streakEnabled}
                    onChange={(e) => setStreakEnabled(e.target.checked)}
                  />
                    <span className="elegant-toggle-slider"></span>
                  </label>
                </label>
              </div>
              {streakEnabled && (
                <div className="streak-input-section">
                  <label className="streak-input-label">
                    Cantidad mínima de sesiones en la semana para mantener la racha
                  </label>
                  <div className="streak-input-wrapper">
                    <input
                      type="number"
                      className="streak-input"
                      value={minimumSessionsPerWeek}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10) || 0;
                        if (value >= 0) {
                          setMinimumSessionsPerWeek(value);
                        }
                      }}
                      min="0"
                    />
                    <div className="streak-arrows">
                      <button
                        type="button"
                        className="streak-spinner-button streak-spinner-up"
                        onClick={() => setMinimumSessionsPerWeek(prev => prev + 1)}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)"/>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="streak-spinner-button streak-spinner-down"
                        disabled={minimumSessionsPerWeek <= 0}
                        onClick={() => setMinimumSessionsPerWeek(prev => Math.max(0, prev - 1))}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="streak-modal-actions">
            <Button
              title={isUpdatingStreak ? 'Guardando...' : 'Guardar'}
              onClick={handleUpdateStreak}
              disabled={isUpdatingStreak || (streakEnabled && minimumSessionsPerWeek <= 0)}
              loading={isUpdatingStreak}
            />
          </div>
        </div>
      </Modal>

      {/* Weight Suggestions Modal */}
      <Modal
        isOpen={isWeightSuggestionsModalOpen}
        onClose={handleCloseWeightSuggestionsModal}
        title="Configurar Sugerencias de Peso"
      >
        <div className="weight-suggestions-modal-content">
          <div className="weight-suggestions-modal-body">
            <div className="weight-suggestions-toggle-section">
              <label className="weight-suggestions-toggle-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span>Activar Sugerencias de Peso</span>
                <label className="elegant-toggle">
                <input
                  type="checkbox"
                  checked={weightSuggestionsEnabled}
                  onChange={(e) => setWeightSuggestionsEnabled(e.target.checked)}
                />
                  <span className="elegant-toggle-slider"></span>
                </label>
              </label>
            </div>
          </div>
          <div className="weight-suggestions-modal-actions">
            <Button
              title={isUpdatingWeightSuggestions ? 'Guardando...' : 'Guardar'}
              onClick={handleUpdateWeightSuggestions}
              disabled={isUpdatingWeightSuggestions}
              loading={isUpdatingWeightSuggestions}
            />
          </div>
        </div>
      </Modal>

      {/* Free Trial Modal */}
      <Modal
        isOpen={isFreeTrialModalOpen}
        onClose={handleCloseFreeTrialModal}
        title="Configurar Prueba Gratis"
      >
        <div className="free-trial-modal-content">
          <div className="free-trial-modal-body">
            <div className="free-trial-toggle-section">
              <label className="free-trial-toggle-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span>Activar prueba gratis</span>
                <label className="elegant-toggle">
                <input
                  type="checkbox"
                  checked={freeTrialActive}
                  onChange={(e) => setFreeTrialActive(e.target.checked)}
                />
                  <span className="elegant-toggle-slider"></span>
                </label>
              </label>
            </div>
            <div className="free-trial-duration-section">
              <label className="free-trial-duration-label">Duración de la prueba (días)</label>
              <div className="free-trial-duration-input-wrapper">
                <input
                  type="number"
                  min="0"
                  className="free-trial-duration-input"
                  value={freeTrialDurationDays}
                  onChange={(e) => handleFreeTrialDurationInputChange(e.target.value)}
                  disabled={!freeTrialActive}
                />
                <div className="free-trial-duration-arrows">
                  <button
                    type="button"
                    className="free-trial-duration-spinner-button"
                    onClick={incrementFreeTrialDuration}
                    disabled={!freeTrialActive}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="free-trial-duration-spinner-button"
                    onClick={decrementFreeTrialDuration}
                    disabled={!freeTrialActive || getParsedFreeTrialDuration() <= 0}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <p className="free-trial-duration-helper">
                Define cuántos días podrá usar el programa antes de pagar.
              </p>
            </div>
          </div>
          <div className="free-trial-modal-actions">
            <Button
              title={isUpdatingFreeTrial ? 'Guardando...' : 'Guardar'}
              onClick={handleUpdateFreeTrial}
              disabled={isUpdatingFreeTrial}
              loading={isUpdatingFreeTrial}
            />
          </div>
        </div>
      </Modal>

      {/* Auxiliary Libraries Modal */}
      <Modal
        isOpen={isAuxiliaryLibrariesModalOpen}
        onClose={handleCloseAuxiliaryLibrariesModal}
        title="Bibliotecas Auxiliares"
      >
        <div className="auxiliary-libraries-modal-content">
          {isLoadingLibraries ? (
            <div className="auxiliary-libraries-loading">
              <p>Cargando bibliotecas...</p>
            </div>
          ) : (
            <>
              <div className="auxiliary-libraries-body">
                {availableLibraries.length === 0 ? (
                  <div className="auxiliary-libraries-empty">
                    <p>No tienes bibliotecas disponibles. Crea una biblioteca primero.</p>
                  </div>
                ) : (
                  <div className="auxiliary-libraries-grid">
                    {availableLibraries.map((library) => (
                      <div
                        key={library.id}
                        className={`auxiliary-library-card ${selectedLibraryIds.has(library.id) ? 'auxiliary-library-card-selected' : ''}`}
                      >
                        <div className="auxiliary-library-card-content" onClick={() => handleToggleLibrary(library.id)} style={{ cursor: 'pointer', flex: 1 }}>
                          <h4 className="auxiliary-library-card-title">{library.title || 'Sin título'}</h4>
                          {library.description && (
                            <p className="auxiliary-library-card-description">{library.description}</p>
                          )}
                        </div>
                        <div className="auxiliary-library-card-checkbox" onClick={(e) => e.stopPropagation()}>
                          <label className="elegant-toggle" style={{ cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={selectedLibraryIds.has(library.id)}
                              onChange={() => handleToggleLibrary(library.id)}
                            />
                            <span className="elegant-toggle-slider"></span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="auxiliary-libraries-modal-actions">
                <Button
                  title={isUpdatingAuxiliaryLibraries ? 'Guardando...' : 'Guardar'}
                  onClick={handleUpdateAuxiliaryLibraries}
                  disabled={isUpdatingAuxiliaryLibraries || isLoadingLibraries}
                  loading={isUpdatingAuxiliaryLibraries}
                />
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Anuncios Modal */}
      <Modal
        isOpen={isAnunciosModalOpen}
        onClose={handleCloseAnunciosModal}
        title="Anuncios"
      >
        <div className="anuncios-modal-content">
          <div className="anuncios-modal-body">
            {/* Left Side - Screen List */}
            <div className="anuncios-modal-left">
              <div className="anuncios-screens-list">
                <label className="anuncios-screens-label">Pantallas</label>
                {program?.tutorials && Object.keys(program.tutorials).length > 0 ? (
                  <div className="anuncios-screens-container">
                    {Object.keys(program.tutorials).map((screenName) => (
                      <button
                        key={screenName}
                        className={`anuncios-screen-item ${selectedScreen === screenName ? 'anuncios-screen-item-active' : ''}`}
                        onClick={() => {
                          setSelectedScreen(screenName);
                          setSelectedVideoIndex(0);
                          setIsAnuncioVideoEditMode(false);
                          setIsAnuncioVideoPlaying(false);
                        }}
                      >
                        <span className="anuncios-screen-name">{screenName}</span>
                        <span className="anuncios-screen-count">
                          {program.tutorials[screenName]?.length || 0} videos
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="anuncios-no-screens">
                    <p>No hay pantallas disponibles. Agrega pantallas al mapa de tutoriales primero.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side - Video Display */}
            <div className="anuncios-modal-right">
              {selectedScreen ? (
                <div className="anuncios-video-section">
                  <div className="anuncios-video-header">
                    <h3 className="anuncios-video-title">{selectedScreen}</h3>
                    {program.tutorials?.[selectedScreen] && program.tutorials[selectedScreen].length > 1 && (
                      <div className="anuncios-video-selector">
                        <label className="anuncios-video-selector-label">Video:</label>
                        <select
                          className="anuncios-video-select"
                          value={selectedVideoIndex}
                          onChange={(e) => {
                            setSelectedVideoIndex(parseInt(e.target.value, 10));
                            setIsAnuncioVideoEditMode(false);
                            setIsAnuncioVideoPlaying(false);
                          }}
                        >
                          {program.tutorials[selectedScreen].map((_, index) => (
                            <option key={index} value={index}>
                              Video {index + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className={`anuncios-video-content ${isAnuncioVideoEditMode ? 'anuncios-video-content-edit' : ''}`}>
                    {program.tutorials?.[selectedScreen] && program.tutorials[selectedScreen].length > 0 ? (
                      <div className="anuncios-video-container">
                        <video
                          className="anuncios-video-player"
                          src={program.tutorials[selectedScreen][selectedVideoIndex]}
                          controls={!isAnuncioVideoEditMode}
                          style={{ pointerEvents: isAnuncioVideoEditMode ? 'none' : 'auto' }}
                          onPlay={() => setIsAnuncioVideoPlaying(true)}
                          onPause={() => setIsAnuncioVideoPlaying(false)}
                          onEnded={() => setIsAnuncioVideoPlaying(false)}
                        />
                        {!isAnuncioVideoEditMode && !isAnuncioVideoPlaying ? (
                          <div className="anuncios-video-actions-overlay">
                            <button
                              className="anuncios-video-action-pill"
                              onClick={() => setIsAnuncioVideoEditMode(true)}
                              disabled={isUploadingAnuncioVideo}
                            >
                              <span className="anuncios-video-action-text">Editar</span>
                            </button>
                          </div>
                        ) : !isAnuncioVideoEditMode ? null : (
                          <div className="anuncios-video-edit-overlay">
                            <div className="anuncios-video-edit-buttons">
                              <div className="anuncios-video-edit-row">
                                <div className="anuncios-video-action-group">
                                  <label className="anuncios-video-action-pill">
                                    <input
                                      type="file"
                                      accept="video/*"
                                      onChange={(e) => handleAnuncioVideoUpload(e, true)}
                                      disabled={isUploadingAnuncioVideo}
                                      style={{ display: 'none' }}
                                    />
                                    <span className="anuncios-video-action-text">
                                      {isUploadingAnuncioVideo ? 'Subiendo...' : 'Cambiar'}
                                    </span>
                                  </label>
                                  {isUploadingAnuncioVideo && (
                                    <div className="anuncios-video-progress">
                                      <div className="anuncios-video-progress-bar">
                                        <div 
                                          className="anuncios-video-progress-fill"
                                          style={{ width: `${anuncioVideoUploadProgress}%` }}
                                        />
                                      </div>
                                      <span className="anuncios-video-progress-text">
                                        {anuncioVideoUploadProgress}%
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <button
                                  className="anuncios-video-action-pill anuncios-video-delete-pill"
                                  onClick={handleAnuncioVideoDelete}
                                  disabled={isUploadingAnuncioVideo}
                                >
                                  <span className="anuncios-video-action-text">Eliminar</span>
                                </button>
                              </div>
                              <button
                                className="anuncios-video-action-pill anuncios-video-save-pill"
                                onClick={() => setIsAnuncioVideoEditMode(false)}
                                disabled={isUploadingAnuncioVideo}
                              >
                                <span className="anuncios-video-action-text">Guardar</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="anuncios-no-video">
                        <p>No hay videos para esta pantalla</p>
                      </div>
                    )}
                  </div>
                  <div className="anuncios-video-footer">
                    {program.tutorials?.[selectedScreen] && program.tutorials[selectedScreen].length > 0 && (
                      <div className="anuncios-video-selector-footer">
                        <label className="anuncios-video-selector-label">Video:</label>
                        <select
                          className="anuncios-video-select"
                          value={selectedVideoIndex}
                          onChange={(e) => {
                            setSelectedVideoIndex(parseInt(e.target.value, 10));
                            setIsAnuncioVideoEditMode(false);
                            setIsAnuncioVideoPlaying(false);
                          }}
                        >
                          {program.tutorials[selectedScreen].map((_, index) => (
                            <option key={index} value={index}>
                              Video {index + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <label className="anuncios-video-add-button">
                      <input
                        type="file"
                        accept="video/*"
                        onChange={(e) => handleAnuncioVideoUpload(e, false)}
                        disabled={isUploadingAnuncioVideo}
                        style={{ display: 'none' }}
                      />
                      <span className="anuncios-video-add-icon">+</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="anuncios-no-screen-selected">
                  <p>Selecciona una pantalla para ver sus videos</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Intro Video Modal */}
      <Modal
        isOpen={isIntroVideoModalOpen}
        onClose={handleCloseIntroVideoModal}
        title="Video Introducción al Programa"
      >
        <div className="intro-video-modal-content">
          <div className="intro-video-modal-body">
            {/* Left Side - Hidden */}
            <div className="intro-video-modal-left" style={{ display: 'none' }}>
            </div>

            {/* Right Side - Video Display */}
            <div className="intro-video-modal-right">
              <div className={`intro-video-right-content ${isIntroVideoEditMode ? 'intro-video-right-content-edit' : ''}`}>
                {program?.video_intro_url ? (
                  <div className="intro-video-view">
                    <div className="intro-video-container">
                      <video
                        className="intro-video-player"
                        src={program.video_intro_url}
                        controls={!isIntroVideoEditMode}
                        style={{ pointerEvents: isIntroVideoEditMode ? 'none' : 'auto' }}
                        onPlay={() => setIsIntroVideoPlaying(true)}
                        onPause={() => setIsIntroVideoPlaying(false)}
                        onEnded={() => setIsIntroVideoPlaying(false)}
                      />
                      {!isIntroVideoEditMode && !isIntroVideoPlaying ? (
                        <div className="intro-video-actions-overlay">
                          <button
                            className="intro-video-action-pill"
                            onClick={() => setIsIntroVideoEditMode(true)}
                            disabled={isUploadingIntroVideo}
                          >
                            <span className="intro-video-action-text">Editar</span>
                          </button>
                        </div>
                      ) : !isIntroVideoEditMode ? null : (
                        <div className="intro-video-edit-overlay">
                          <div className="intro-video-edit-buttons">
                            <div className="intro-video-edit-row">
                              <div className="intro-video-action-group">
                                <label className="intro-video-action-pill">
                                  <input
                                    type="file"
                                    accept="video/*"
                                    onChange={handleIntroVideoUpload}
                                    disabled={isUploadingIntroVideo}
                                    style={{ display: 'none' }}
                                  />
                                  <span className="intro-video-action-text">
                                    {isUploadingIntroVideo ? 'Subiendo...' : 'Cambiar'}
                                  </span>
                                </label>
                                {isUploadingIntroVideo && (
                                  <div className="intro-video-progress">
                                    <div className="intro-video-progress-bar">
                                      <div 
                                        className="intro-video-progress-fill"
                                        style={{ width: `${introVideoUploadProgress}%` }}
                                      />
                                    </div>
                                    <span className="intro-video-progress-text">
                                      {introVideoUploadProgress}%
                                    </span>
                                  </div>
                                )}
                              </div>
                              <button
                                className="intro-video-action-pill intro-video-delete-pill"
                                onClick={handleIntroVideoDelete}
                                disabled={isUploadingIntroVideo}
                              >
                                <span className="intro-video-action-text">Eliminar</span>
                              </button>
                            </div>
                            <button
                              className="intro-video-action-pill intro-video-save-pill"
                              onClick={() => setIsIntroVideoEditMode(false)}
                              disabled={isUploadingIntroVideo}
                            >
                              <span className="intro-video-action-text">Guardar</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="intro-video-no-video">
                    <p>No hay video disponible para este programa</p>
                    <div className="intro-video-upload-group">
                      <label className="intro-video-upload-button">
                        <input
                          type="file"
                          accept="video/*"
                          onChange={handleIntroVideoUpload}
                          disabled={isUploadingIntroVideo}
                          style={{ display: 'none' }}
                        />
                        {isUploadingIntroVideo ? 'Subiendo...' : 'Subir Video'}
                      </label>
                      {isUploadingIntroVideo && (
                        <div className="intro-video-progress">
                          <div className="intro-video-progress-bar">
                            <div 
                              className="intro-video-progress-fill"
                              style={{ width: `${introVideoUploadProgress}%` }}
                            />
                          </div>
                          <span className="intro-video-progress-text">
                            {introVideoUploadProgress}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Create/Copy Module Modal */}
      <Modal
        isOpen={isCopyModuleModalOpen}
        onClose={handleCloseCopyModuleModal}
        title="Nuevo Módulo"
      >
        <div className="anuncios-modal-content">
          <div className="anuncios-modal-body">
            {/* Left Side - Menu */}
            <div className="anuncios-modal-left">
              <div className="anuncios-screens-list">
                <label className="anuncios-screens-label">Opciones</label>
                <div className="anuncios-screens-container">
                  <button
                    className={`anuncios-screen-item ${copyModuleModalPage === 'biblioteca' ? 'anuncios-screen-item-active' : ''}`}
                    onClick={() => {
                      setCopyModuleModalPage('biblioteca');
                      if (libraryModules.length === 0) {
                        loadLibraryModules();
                      }
                    }}
                  >
                    <span className="anuncios-screen-name">Usar de Biblioteca</span>
                  </button>
                  <button
                    className={`anuncios-screen-item ${copyModuleModalPage === 'crear' ? 'anuncios-screen-item-active' : ''}`}
                    onClick={() => setCopyModuleModalPage('crear')}
                  >
                    <span className="anuncios-screen-name">Crear</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Side - Content */}
            <div className="anuncios-modal-right">
              {copyModuleModalPage === 'crear' && (
                <div className="edit-program-modal-right" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label">Nombre del Módulo</label>
                    <Input
                      placeholder="Nombre del módulo"
                      value={moduleName || ''}
                      onChange={(e) => setModuleName(e.target.value || '')}
                      type="text"
                      light={true}
                    />
                  </div>
                  <div className="edit-program-modal-actions" style={{ flexShrink: 0, marginTop: 'auto', paddingTop: '16px' }}>
                    <Button
                      title={isCreatingModule ? 'Creando...' : 'Crear'}
                      onClick={handleCreateModule}
                      disabled={!moduleName || !moduleName.trim() || isCreatingModule}
                      loading={isCreatingModule}
                    />
                  </div>
                </div>
              )}

              {/* ✅ NEW: Library modules page */}
              {copyModuleModalPage === 'biblioteca' && (
                <div className="copy-session-selection-section">
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                    <button
                      className="copy-session-item-button"
                      onClick={() => {
                        // TODO: Navigate to library module creation page
                        console.log('Navigate to library module creation page');
                        navigate('/library/modules/new'); // Placeholder route
                      }}
                      style={{ minWidth: 'auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <span style={{ fontSize: '18px' }}>+</span>
                      <span>Nuevo Módulo</span>
                    </button>
                  </div>
                  {isLoadingLibraryModules ? (
                    <div className="copy-session-loading">
                      <p>Cargando módulos de biblioteca...</p>
                    </div>
                  ) : libraryModules.length === 0 ? (
                    <div className="copy-session-empty">
                      <p>No hay módulos guardados en tu biblioteca.</p>
                    </div>
                  ) : (
                    <div className="copy-session-list">
                      {libraryModules.map((libraryModule) => (
                        <div key={libraryModule.id} className="copy-session-item">
                          <div className="copy-session-item-info">
                            <h4 className="copy-session-item-name">
                              {libraryModule.title || `Módulo ${libraryModule.id?.slice(0, 8)}`}
                            </h4>
                            <p className="copy-session-item-module" style={{ fontSize: '12px', color: '#666' }}>
                              📚 Módulo de biblioteca • {(libraryModule.sessionRefs || []).length} sesiones
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              className="copy-session-item-button"
                              onClick={() => navigate(`/library/modules/${libraryModule.id}/edit`)}
                              style={{ minWidth: 'auto', padding: '8px 12px', fontSize: '14px' }}
                            >
                              Editar
                            </button>
                            <button
                              className="copy-session-item-button"
                              onClick={() => handleSelectLibraryModule(libraryModule.id)}
                              disabled={isCreatingModule}
                            >
                              {isCreatingModule ? 'Agregando...' : 'Agregar'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </Modal>

      {/* Create Module Modal (for edit mode, if needed) */}
      <Modal
        isOpen={isModuleModalOpen}
        onClose={handleCloseModuleModal}
        title="Nuevo módulo"
      >
        <div className="modal-library-content">
          <Input
            placeholder="Nombre del módulo"
            value={moduleName || ''}
            onChange={(e) => setModuleName(e.target.value || '')}
            type="text"
            light={true}
          />
          <div className="modal-actions">
            <Button
              title="Crear"
              onClick={handleCreateModule}
              disabled={!moduleName || !moduleName.trim() || isCreatingModule}
              loading={isCreatingModule}
            />
          </div>
        </div>
      </Modal>

      {/* Delete Module Modal */}
      <Modal
        isOpen={isDeleteModuleModalOpen}
        onClose={handleCloseDeleteModuleModal}
        title={moduleToDelete?.title || moduleToDelete?.name || 'Eliminar módulo'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre del módulo:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={(() => {
                if (!moduleToDelete) return 'Nombre del módulo';
                return moduleToDelete.title || moduleToDelete.name || `Módulo ${moduleToDelete.id?.slice(0, 8) || ''}`;
              })()}
              value={deleteModuleConfirmation}
              onChange={(e) => setDeleteModuleConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${(() => {
                if (!moduleToDelete) return true;
                const moduleTitle = moduleToDelete.title || moduleToDelete.name || `Módulo ${moduleToDelete.id?.slice(0, 8) || ''}`;
                return deleteModuleConfirmation.trim() !== moduleTitle;
              })() ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDeleteModule}
              disabled={(() => {
                if (!moduleToDelete) return true;
                const moduleTitle = moduleToDelete.title || moduleToDelete.name || `Módulo ${moduleToDelete.id?.slice(0, 8) || ''}`;
                return deleteModuleConfirmation.trim() !== moduleTitle || isDeletingModule;
              })()}
            >
              {isDeletingModule ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción es irreversible. Todo el contenido de este módulo se eliminará permanentemente.
          </p>
        </div>
      </Modal>

      {/* Create/Edit Session Modal */}
      <Modal
        isOpen={isSessionModalOpen}
        onClose={handleCloseSessionModal}
        title={sessionToEdit ? "Editar sesión" : "Nueva sesión"}
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
                {(sessionImagePreview || (sessionToEdit && sessionToEdit.image_url)) ? (
                  <div className="edit-program-image-container">
                    <img
                      src={sessionImagePreview || sessionToEdit?.image_url}
                      alt="Sesión"
                      className="edit-program-image"
                    />
                    <div className="edit-program-image-overlay">
                      <div className="edit-program-image-actions">
                        <button type="button" className="edit-program-image-action-pill" onClick={() => handleOpenMediaPicker('session')}>
                          <span className="edit-program-image-action-text">Cambiar</span>
                        </button>
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
                    <button type="button" className="edit-program-image-upload-button" onClick={() => handleOpenMediaPicker('session')}>
                      Subir Imagen
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="edit-program-modal-actions">
            <Button
              title={
                sessionToEdit 
                  ? (isUpdatingSession || isUploadingSessionImage ? 'Guardando...' : 'Guardar')
                  : (isCreatingSession || isUploadingSessionImage ? 'Creando...' : 'Crear')
              }
              onClick={sessionToEdit ? handleUpdateSession : handleCreateSession}
              disabled={
                !sessionName.trim() || 
                (sessionToEdit ? (isUpdatingSession || isUploadingSessionImage) : (isCreatingSession || isUploadingSessionImage))
              }
              loading={sessionToEdit ? (isUpdatingSession || isUploadingSessionImage) : (isCreatingSession || isUploadingSessionImage)}
            />
          </div>
        </div>
      </Modal>

      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelect={handleMediaPickerSelect}
        creatorId={user?.uid}
        accept="image/*"
      />

      {/* Create/Copy Session Modal */}
      <Modal
        isOpen={isCopySessionModalOpen}
        onClose={handleCloseCopySessionModal}
        title="Nueva Sesión"
      >
        <div className="anuncios-modal-content">
          <div className="anuncios-modal-body">
            {/* Left Side - Menu */}
            <div className="anuncios-modal-left">
              <div className="anuncios-screens-list">
                <label className="anuncios-screens-label">Opciones</label>
                <div className="anuncios-screens-container">
                  <button
                    className={`anuncios-screen-item ${copySessionModalPage === 'biblioteca' ? 'anuncios-screen-item-active' : ''}`}
                    onClick={() => {
                      setCopySessionModalPage('biblioteca');
                      if (librarySessions.length === 0) {
                        loadLibrarySessions();
                      }
                    }}
                  >
                    <span className="anuncios-screen-name">Usar de Biblioteca</span>
                  </button>
                  <button
                    className={`anuncios-screen-item ${copySessionModalPage === 'crear' ? 'anuncios-screen-item-active' : ''}`}
                    onClick={() => setCopySessionModalPage('crear')}
                  >
                    <span className="anuncios-screen-name">Crear</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Side - Content */}
            <div className="anuncios-modal-right">
              {copySessionModalPage === 'crear' && (
                <div className="edit-program-modal-right" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
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
                  <div className="edit-program-image-section" style={{ flex: '0 1 auto', minHeight: '300px', maxHeight: '400px' }}>
                    {sessionImagePreview ? (
                      <div className="edit-program-image-container">
                        <img
                          src={sessionImagePreview}
                          alt="Sesión"
                          className="edit-program-image"
                        />
                        <div className="edit-program-image-overlay">
                          <div className="edit-program-image-actions">
                            <button type="button" className="edit-program-image-action-pill" onClick={() => handleOpenMediaPicker('session')}>
                              <span className="edit-program-image-action-text">Cambiar</span>
                            </button>
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
                        <button type="button" className="edit-program-image-upload-button" onClick={() => handleOpenMediaPicker('session')}>
                          Subir Imagen
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="edit-program-modal-actions" style={{ flexShrink: 0, marginTop: 'auto', paddingTop: '16px' }}>
            <Button
              title={isCreatingSession || isUploadingSessionImage ? 'Creando...' : 'Crear'}
              onClick={handleCreateSession}
              disabled={!sessionName.trim() || isCreatingSession || isUploadingSessionImage}
              loading={isCreatingSession || isUploadingSessionImage}
            />
                  </div>
                </div>
              )}

              {/* ✅ NEW: Library sessions page */}
              {copySessionModalPage === 'biblioteca' && (
                <div className="copy-session-selection-section">
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                    <button
                      className="copy-session-item-button"
                      onClick={() => {
                        // TODO: Navigate to library session creation page
                        console.log('Navigate to library session creation page');
                        navigate('/library/sessions/new'); // Placeholder route
                      }}
                      style={{ minWidth: 'auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <span style={{ fontSize: '18px' }}>+</span>
                      <span>Nueva Sesión</span>
                    </button>
                  </div>
                  {isLoadingLibrarySessions ? (
                    <div className="copy-session-loading">
                      <p>Cargando sesiones de biblioteca...</p>
                    </div>
                  ) : librarySessions.length === 0 ? (
                    <div className="copy-session-empty">
                      <p>No hay sesiones guardadas en tu biblioteca.</p>
                    </div>
                  ) : (
                    <div className="copy-session-list">
                      {librarySessions.map((librarySession) => (
                        <div key={librarySession.id} className="copy-session-item">
                          <div className="copy-session-item-info">
                            <h4 className="copy-session-item-name">
                              {librarySession.title || `Sesión ${librarySession.id?.slice(0, 8)}`}
                            </h4>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              className="copy-session-item-button"
                              onClick={() => navigate(`/content/sessions/${librarySession.id}`, { state: { returnTo: location.pathname } })}
                              style={{ minWidth: 'auto', padding: '8px 12px', fontSize: '14px' }}
                            >
                              Editar
                            </button>
                            <button
                              className="copy-session-item-button"
                              onClick={() => handleSelectLibrarySession(librarySession.id)}
                              disabled={isCreatingSession}
                            >
                              {isCreatingSession ? 'Agregando...' : 'Agregar'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Session Modal */}
      <Modal
        isOpen={isDeleteSessionModalOpen}
        onClose={handleCloseDeleteSessionModal}
        title={sessionToDelete?.title || sessionToDelete?.name || 'Eliminar sesión'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre de la sesión:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={(() => {
                if (!sessionToDelete) return 'Nombre de la sesión';
                return sessionToDelete.title || sessionToDelete.name || `Sesión ${sessionToDelete.id?.slice(0, 8) || ''}`;
              })()}
              value={deleteSessionConfirmation}
              onChange={(e) => setDeleteSessionConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${(() => {
                if (!sessionToDelete) return true;
                const sessionTitle = sessionToDelete.title || sessionToDelete.name || `Sesión ${sessionToDelete.id?.slice(0, 8) || ''}`;
                return deleteSessionConfirmation.trim() !== sessionTitle;
              })() ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDeleteSession}
              disabled={(() => {
                if (!sessionToDelete) return true;
                const sessionTitle = sessionToDelete.title || sessionToDelete.name || `Sesión ${sessionToDelete.id?.slice(0, 8) || ''}`;
                return deleteSessionConfirmation.trim() !== sessionTitle || isDeletingSession;
              })()}
            >
              {isDeletingSession ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción es irreversible. Todo el contenido de esta sesión se eliminará permanentemente.
          </p>
        </div>
      </Modal>

      {/* Delete Exercise Modal */}
      <Modal
        isOpen={isDeleteExerciseModalOpen}
        onClose={handleCloseDeleteExerciseModal}
        title={(() => {
          if (!exerciseToDelete) return 'Eliminar ejercicio';
          // Extract title from primary field
          if (exerciseToDelete.primary && typeof exerciseToDelete.primary === 'object') {
            const primaryValues = Object.values(exerciseToDelete.primary);
            if (primaryValues.length > 0 && primaryValues[0]) {
              return primaryValues[0];
            }
          }
          return exerciseToDelete.name || exerciseToDelete.title || `Ejercicio ${exerciseToDelete.id?.slice(0, 8) || ''}`;
        })()}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre del ejercicio:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={(() => {
                if (!exerciseToDelete) return 'Nombre del ejercicio';
                // Extract title from primary field
                if (exerciseToDelete.primary && typeof exerciseToDelete.primary === 'object') {
                  const primaryValues = Object.values(exerciseToDelete.primary);
                  if (primaryValues.length > 0 && primaryValues[0]) {
                    return primaryValues[0];
                  }
                }
                return exerciseToDelete.name || exerciseToDelete.title || `Ejercicio ${exerciseToDelete.id?.slice(0, 8) || ''}`;
              })()}
              value={deleteExerciseConfirmation}
              onChange={(e) => setDeleteExerciseConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${(() => {
                if (!exerciseToDelete) return true;
                // Extract title from primary field
                const getExerciseTitle = () => {
                  if (exerciseToDelete.primary && typeof exerciseToDelete.primary === 'object') {
                    const primaryValues = Object.values(exerciseToDelete.primary);
                    if (primaryValues.length > 0 && primaryValues[0]) {
                      return primaryValues[0];
                    }
                  }
                  return exerciseToDelete.name || exerciseToDelete.title || `Ejercicio ${exerciseToDelete.id?.slice(0, 8) || ''}`;
                };
                const exerciseTitle = getExerciseTitle();
                return deleteExerciseConfirmation.trim() !== exerciseTitle;
              })() ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDeleteExercise}
              disabled={(() => {
                if (!exerciseToDelete) return true;
                // Extract title from primary field
                const getExerciseTitle = () => {
                  if (exerciseToDelete.primary && typeof exerciseToDelete.primary === 'object') {
                    const primaryValues = Object.values(exerciseToDelete.primary);
                    if (primaryValues.length > 0 && primaryValues[0]) {
                      return primaryValues[0];
                    }
                  }
                  return exerciseToDelete.name || exerciseToDelete.title || `Ejercicio ${exerciseToDelete.id?.slice(0, 8) || ''}`;
                };
                const exerciseTitle = getExerciseTitle();
                return deleteExerciseConfirmation.trim() !== exerciseTitle || isDeletingExercise;
              })()}
            >
              {isDeletingExercise ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción es irreversible. El ejercicio se eliminará permanentemente.
          </p>
        </div>
      </Modal>

      {/* Exercise Modal */}
      <Modal
        isOpen={isExerciseModalOpen}
        onClose={handleCloseExerciseModal}
        title={(() => {
          const source = exerciseDraft || selectedExercise;
          if (!source) return 'Ejercicio';
          if (source.primary && typeof source.primary === 'object' && source.primary !== null) {
            try {
              const primaryValues = Object.values(source.primary);
              if (primaryValues.length > 0 && primaryValues[0]) {
                return primaryValues[0];
              }
            } catch (error) {
              console.error('Error extracting exercise title:', error);
            }
          }
          return source.name || source.title || `Ejercicio ${source.id?.slice(0, 8) || ''}`;
        })()}
        extraWide={true}
      >
        <div className="exercise-modal-layout">
          {/* Requirements Announcement - Always at top when creating */}
          {isCreatingExercise && !canSaveCreatingExercise() && (
            <div className="create-exercise-requirements-summary" style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)', borderRadius: '8px' }}>
              <p className="create-exercise-requirements-text">
                Para crear el ejercicio, necesitas:
                {(!exerciseDraft?.primary || Object.values(exerciseDraft.primary || {}).length === 0) && (
                  <span className="create-exercise-requirement-item"> • Ejercicio principal</span>
                )}
                {(draftMeasures.length === 0 || draftObjectives.length === 0) && (
                  <span className="create-exercise-requirement-item"> • Data (elegir plantilla o editar manual)</span>
                )}
                {exerciseSets.length === 0 && (
                  <span className="create-exercise-requirement-item"> • Al menos una serie</span>
                )}
              </p>
            </div>
          )}
          
          {/* Main Content Area - Two Columns */}
          <div className="exercise-modal-main-content">
            {/* Left Side - General Exercise Info */}
            <div className="exercise-modal-left-panel">
              {!selectedExercise ? (
                <div className="exercise-tab-empty">
                  <p>Cargando ejercicio...</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Primary Exercise Section */}
                    <div className="one-on-one-modal-section">
                      <div className="one-on-one-modal-section-header">
                        <h3 className="one-on-one-modal-section-title">Ejercicio Principal</h3>
                        {isCreatingExercise && (
                          <span className="one-on-one-modal-section-badge">Requerido</span>
                        )}
                      </div>
                      <div className="one-on-one-modal-section-content">
                        {getPrimaryExerciseName() && getPrimaryExerciseName() !== 'Sin ejercicio' ? (
                          <div className="exercise-horizontal-card">
                            <span className="exercise-horizontal-card-name">
                              {getPrimaryExerciseName()}
                              {isPrimaryLibraryIncomplete && (
                                <span
                                  className="exercise-incomplete-icon-small exercise-incomplete-icon-inline"
                                  title="Este ejercicio de la biblioteca está incompleto"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </span>
                              )}
                            </span>
                            <button 
                              className="exercise-horizontal-card-edit"
                              onClick={handleEditPrimary}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 8.00012L4 16.0001V20.0001L8 20.0001L16 12.0001M12 8.00012L14.8686 5.13146L14.8704 5.12976C15.2652 4.73488 15.463 4.53709 15.691 4.46301C15.8919 4.39775 16.1082 4.39775 16.3091 4.46301C16.5369 4.53704 16.7345 4.7346 17.1288 5.12892L18.8686 6.86872C19.2646 7.26474 19.4627 7.46284 19.5369 7.69117C19.6022 7.89201 19.6021 8.10835 19.5369 8.3092C19.4628 8.53736 19.265 8.73516 18.8695 9.13061L18.8686 9.13146L16 12.0001M12 8.00012L16 12.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              className="create-exercise-select-button"
                              onClick={handleEditPrimary}
                            >
                              <span className="create-exercise-select-button-text">Seleccionar Ejercicio Principal</span>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 8.00012L4 16.0001V20.0001L8 20.0001L16 12.0001M12 8.00012L14.8686 5.13146L14.8704 5.12976C15.2652 4.73488 15.463 4.53709 15.691 4.46301C15.8919 4.39775 16.1082 4.39775 16.3091 4.46301C16.5369 4.53704 16.7345 4.7346 17.1288 5.12892L18.8686 6.86872C19.2646 7.26474 19.4627 7.46284 19.5369 7.69117C19.6022 7.89201 19.6021 8.10835 19.5369 8.3092C19.4628 8.53736 19.265 8.73516 18.8695 9.13061L18.8686 9.13146L16 12.0001M12 8.00012L16 12.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                            {isCreatingExercise && (
                              <p className="one-on-one-field-note" style={{ marginTop: '8px', marginBottom: 0 }}>
                                Selecciona el ejercicio principal de tu biblioteca
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Alternatives */}
                    <div className="one-on-one-modal-section">
                      <div className="one-on-one-modal-section-header">
                        <h3 className="one-on-one-modal-section-title">Alternativas</h3>
                        <span className="one-on-one-modal-section-badge-recommended">Altamente Recomendado</span>
                      </div>
                      <div className="one-on-one-modal-section-content">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <p className="one-on-one-field-note" style={{ margin: 0 }}>
                            Ejercicios alternativos que pueden reemplazar al ejercicio principal
                          </p>
                          <div className="exercise-general-actions-container">
                            {isAlternativesEditMode ? (
                              <div className="exercise-general-actions-dropdown">
                                <button 
                                  className="exercise-general-action-button"
                                  onClick={handleAddAlternative}
                                >
                                  <span className="exercise-general-action-icon">+</span>
                                </button>
                                <button 
                                  className="exercise-general-action-button exercise-general-action-button-save"
                                  onClick={() => setIsAlternativesEditMode(false)}
                                >
                                  <span className="exercise-general-action-text">Guardar</span>
                                </button>
                              </div>
                            ) : (
                              <button 
                                className="exercise-general-edit-button"
                                onClick={() => setIsAlternativesEditMode(true)}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M12 8.00012L4 16.0001V20.0001L8 20.0001L16 12.0001M12 8.00012L14.8686 5.13146L14.8704 5.12976C15.2652 4.73488 15.463 4.53709 15.691 4.46301C15.8919 4.39775 16.1082 4.39775 16.3091 4.46301C16.5369 4.53704 16.7345 4.7346 17.1288 5.12892L18.8686 6.86872C19.2646 7.26474 19.4627 7.46284 19.5369 7.69117C19.6022 7.89201 19.6021 8.10835 19.5369 8.3092C19.4628 8.53736 19.265 8.73516 18.8695 9.13061L18.8686 9.13146L16 12.0001M12 8.00012L16 12.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                        {Object.keys(draftAlternatives).length === 0 ? (
                          <div className="one-on-one-empty-state" style={{ padding: '24px 16px' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.4, marginBottom: '8px' }}>
                              <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <p style={{ margin: 0 }}>No hay alternativas agregadas</p>
                          </div>
                        ) : (
                          <div className="exercise-alternatives-list">
                            {Object.entries(draftAlternatives).map(([libraryId, alternativesArray]) => (
                              <div key={libraryId} className="exercise-alternatives-group">
                                <h5 className="exercise-alternatives-library-title">
                                  {libraryTitles[libraryId] || libraryId}
                                </h5>
                                {Array.isArray(alternativesArray) && alternativesArray.length > 0 ? (
                                  <div className="exercise-horizontal-cards-list">
                                    {alternativesArray.map((alternativeName, index) => (
                                      <div key={`${libraryId}-${index}`} className="exercise-horizontal-card">
                                        {(() => {
                                          const alternativeLabel = typeof alternativeName === 'string'
                                            ? alternativeName
                                            : alternativeName?.name || alternativeName?.title || `Alternativa ${index + 1}`;
                                          const alternativeKeyName = typeof alternativeName === 'string'
                                            ? alternativeName
                                            : alternativeName?.name || alternativeName?.title || alternativeName?.id;
                                          const alternativeIncomplete = isLibraryExerciseIncomplete(
                                            libraryId,
                                            alternativeKeyName
                                          );

                                          return (
                                        <span className="exercise-horizontal-card-name">
                                              {alternativeLabel}
                                              {alternativeIncomplete && (
                                                <span
                                                  className="exercise-incomplete-icon-small exercise-incomplete-icon-inline"
                                                  title="Esta alternativa de la biblioteca está incompleta"
                                                >
                                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                  </svg>
                                        </span>
                                              )}
                                            </span>
                                          );
                                        })()}
                                        {isAlternativesEditMode && (
                                          <button 
                                            className="exercise-horizontal-card-delete"
                                            onClick={() => handleDeleteAlternative(libraryId, index)}
                                          >
                                            <span className="exercise-horizontal-card-delete-icon">−</span>
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="exercise-general-empty">No hay alternativas para esta biblioteca</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Data – when set: visual summary + Editar dropdown; else: two choice cards */}
                    <div className="one-on-one-modal-section">
                      <div className="one-on-one-modal-section-header">
                        <h3 className="one-on-one-modal-section-title">Data</h3>
                        {!(draftMeasures.length > 0 && draftObjectives.length > 0) && (
                          <span className="one-on-one-modal-section-badge">Requerido</span>
                        )}
                      </div>
                      {(draftMeasures.length > 0 || draftObjectives.length > 0) ? (
                        <>
                          <div className="data-summary">
                            <div className="data-summary-header">
                              {appliedPresetId && presetsList.find((p) => p.id === appliedPresetId) ? (
                                <p className="data-summary-preset-name">
                                  Plantilla: {presetsList.find((p) => p.id === appliedPresetId).name}
                                </p>
                              ) : (
                                <span />
                              )}
                              <div className="data-summary-actions" ref={dataEditMenuRef}>
                                <button
                                  type="button"
                                  className="data-editar-btn"
                                  onClick={() => setDataEditMenuOpen((v) => !v)}
                                >
                                  Editar
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: dataEditMenuOpen ? 'rotate(180deg)' : 'none' }}>
                                    <path d="M6 9l6 6 6-6" />
                                  </svg>
                                </button>
                                {dataEditMenuOpen && (
                                  <div className="data-editar-dropdown">
                                    <button
                                      type="button"
                                      className="data-editar-dropdown-item"
                                      onClick={() => {
                                        setDataEditMenuOpen(false);
                                        setIsPresetSelectorOpen(true);
                                      }}
                                    >
                                      Elegir plantilla
                                    </button>
                                    <button
                                      type="button"
                                      className="data-editar-dropdown-item"
                                      onClick={() => {
                                        setDataEditMenuOpen(false);
                                        setEditorModalMode('exercise');
                                        setPresetBeingEditedId(null);
                                        setIsMeasuresObjectivesEditorOpen(true);
                                      }}
                                    >
                                      Editar manual
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="data-summary-columns">
                              <div className="data-summary-column">
                                <p className="data-summary-column-title">Datos que registra el usuario</p>
                                <ul className="data-summary-list">
                                  {draftMeasures.map((m) => (
                                    <li key={m} className="data-summary-list-item">
                                      {getMeasureDisplayName(m)}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="data-summary-column">
                                <p className="data-summary-column-title">Pautas para las series</p>
                                <ul className="data-summary-list">
                                  {draftObjectives.filter((o) => o !== 'previous').map((o) => (
                                    <li key={o} className="data-summary-list-item">
                                      {getObjectiveDisplayName(o)}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="data-choice-cards">
                          <button
                            type="button"
                            className="data-choice-card"
                            onClick={() => setIsPresetSelectorOpen(true)}
                          >
                            <svg className="data-choice-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="3" width="7" height="7" rx="1" />
                              <rect x="14" y="3" width="7" height="7" rx="1" />
                              <rect x="3" y="14" width="7" height="7" rx="1" />
                              <rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                            Plantillas
                          </button>
                          <button
                            type="button"
                            className="data-choice-card"
                            onClick={() => {
                              setEditorModalMode('exercise');
                              setPresetBeingEditedId(null);
                              setIsMeasuresObjectivesEditorOpen(true);
                            }}
                          >
                            <svg className="data-choice-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                            Manual
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
            </div>
            
            {/* Right Side - Sets Panel (Always Visible) */}
            <div className="exercise-modal-right-panel">
              <div className="exercise-sets-panel-header">
                <h3 className="exercise-sets-panel-title">Series</h3>
                {isCreatingExercise && (
                  <span className="one-on-one-modal-section-badge">Requerido</span>
                )}
              </div>
              
              <div className="exercise-sets-panel-content">
                <div className="sets-panel-cards-stack">
                  <div className="sets-panel-glass-card sets-panel-glass-card-series">
                    <span className="sets-panel-glass-label">Series</span>
                    <div className="sets-panel-number-wrap">
                      <button type="button" className="sets-panel-number-btn" onClick={() => syncProgramSetsCount(exerciseSets.length - 1)} aria-label="Menos series">−</button>
                      <input type="number" min={1} max={20} className="sets-panel-number-input" value={exerciseSets.length} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) syncProgramSetsCount(Math.max(1, Math.min(20, v))); }} />
                      <button type="button" className="sets-panel-number-btn" onClick={() => syncProgramSetsCount(exerciseSets.length + 1)} aria-label="Más series">+</button>
                    </div>
                  </div>
                  {(draftMeasures.length > 0 && draftObjectives.length > 0) && (draftObjectives.filter(o => o !== 'previous').length ? draftObjectives.filter(o => o !== 'previous') : ['reps', 'intensity']).map((field) => {
                    const firstVal = exerciseSets[0]?.[field];
                    const allSame = exerciseSets.length > 0 && exerciseSets.every(s => {
                      const a = firstVal === null || firstVal === undefined || firstVal === '' ? null : String(firstVal);
                      const b = s[field] === null || s[field] === undefined || s[field] === '' ? null : String(s[field]);
                      return a === b;
                    });
                    const displayVal = allSame ? (firstVal != null && firstVal !== '' ? String(firstVal) : '') : '';
                    return (
                      <div key={field} className="sets-panel-glass-card">
                        <span className="sets-panel-glass-label">{getObjectiveDisplayName(field)}</span>
                        {field === 'intensity' ? (
                          <div className="exercise-series-intensity-input-wrapper sets-panel-glass-input-wrap">
                            <input type="text" className="exercise-series-input exercise-series-intensity-input sets-panel-glass-input" placeholder="8" maxLength={2} value={displayVal ? parseIntensityForDisplay(displayVal) : ''} onChange={(e) => handleUpdateAllSetsValue(field, e.target.value)} />
                            <span className="exercise-series-intensity-suffix">/10</span>
                          </div>
                        ) : (
                          <input type="text" className="exercise-series-input sets-panel-glass-input" placeholder="10" value={displayVal} onChange={(e) => handleUpdateAllSetsValue(field, e.target.value)} />
                        )}
                      </div>
                    );
                  })}
                </div>
                {!(draftMeasures.length > 0 && draftObjectives.length > 0) && (
                  <div className="exercises-empty sets-panel-empty-compact">
                    <p>Configura Data (plantilla o manual) en el panel izquierdo para definir las series.</p>
                  </div>
                )}
                {(draftMeasures.length > 0 && draftObjectives.length > 0) && (
                <>
                {exerciseSets.length > 0 && (
                  <button type="button" className="sets-panel-toggle-detail" onClick={() => setShowPerSetCards(prev => !prev)}>
                    {showPerSetCards ? 'Ocultar detalle por serie' : 'Editar por serie'}
                  </button>
                )}
                {exerciseSets.length === 0 ? (
                  <div className="exercises-empty sets-panel-empty-compact">
                    <p>No hay series. Aumenta el número de series arriba.</p>
                  </div>
                ) : showPerSetCards ? (
                  <>
                    <div className="exercise-sets-panel-actions">
                      <button className={`exercise-action-pill ${isSeriesEditMode ? 'exercise-action-pill-disabled' : ''}`} onClick={handleCreateSet} disabled={isSeriesEditMode || isCreatingSet}>
                        <span className="exercise-action-icon">+</span>
                        <span className="exercise-action-text">Agregar Serie</span>
                      </button>
                      {!isCreatingExercise && (
                        <button className="exercise-action-pill" onClick={handleEditSeries} disabled={isUpdatingSeriesOrder}>
                          <span className="exercise-action-text">{isSeriesEditMode ? 'Guardar' : 'Editar'}</span>
                        </button>
                      )}
                    </div>
                    {isSeriesEditMode ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEndSeries}
                      >
                        <SortableContext
                          items={exerciseSets.map((set) => set.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="exercises-list">
                            {exerciseSets.map((set, setIndex) => {
                              const isExpanded = expandedSeries[set.id] || false;
                              // Get objectives fields to display (excluding 'previous' - all others are editable)
                              const objectivesFields = draftObjectives.filter(obj => obj !== 'previous');
                              
                              // Get set number from order field, fallback to index + 1
                              const setNumber = (set.order !== undefined && set.order !== null) ? set.order + 1 : setIndex + 1;
                              
                              return (
                                <SortableSeriesCard
                                  key={set.id}
                                  set={set}
                                  setIndex={setIndex}
                                  isSeriesEditMode={isSeriesEditMode}
                                  isExpanded={isExpanded}
                                  onToggleExpansion={handleToggleSeriesExpansion}
                                  onDeleteSet={handleDeleteSet}
                                  onDuplicateSet={handleDuplicateSet}
                                  objectivesFields={objectivesFields}
                                  getObjectiveDisplayName={getObjectiveDisplayName}
                                  handleUpdateSetValue={handleUpdateSetValue}
                                  hasUnsavedChanges={unsavedSetChanges[set.id] || false}
                                  onSaveSetChanges={handleSaveSetChanges}
                                  isSavingSetChanges={isSavingSetChanges}
                                  parseIntensityForDisplay={parseIntensityForDisplay}
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="sets-detail-table-wrap">
                        <table className="sets-detail-table">
                          <thead>
                            <tr>
                              <th className="sets-detail-th sets-detail-th-num">#</th>
                              {(draftObjectives.filter(o => o !== 'previous').length ? draftObjectives.filter(o => o !== 'previous') : ['reps', 'intensity']).map((field) => (
                                <th key={field} className="sets-detail-th">{getObjectiveDisplayName(field)}</th>
                              ))}
                              <th className="sets-detail-th sets-detail-th-actions" />
                            </tr>
                          </thead>
                          <tbody>
                            {exerciseSets.map((set, setIndex) => {
                              const objectivesFields = draftObjectives.filter(obj => obj !== 'previous');
                              const setNumber = (set.order !== undefined && set.order !== null) ? set.order + 1 : setIndex + 1;
                              return (
                                <tr key={set.id} className="sets-detail-row">
                                  <td className="sets-detail-td sets-detail-td-num">{setNumber}</td>
                                  {objectivesFields.map((field) => (
                                    <td key={field} className="sets-detail-td">
                                      {field === 'intensity' ? (
                                        <div className="exercise-series-intensity-input-wrapper sets-detail-input-wrap">
                                          <input type="text" className="exercise-series-input exercise-series-intensity-input sets-detail-input" placeholder="--" value={parseIntensityForDisplay(set[field])} onChange={(e) => handleUpdateSetValue(setIndex, field, e.target.value)} maxLength={2} />
                                          <span className="exercise-series-intensity-suffix">/10</span>
                                        </div>
                                      ) : (
                                        <input type="text" className="exercise-series-input sets-detail-input" placeholder="--" value={set[field] !== undefined && set[field] !== null ? String(set[field]) : ''} onChange={(e) => handleUpdateSetValue(setIndex, field, e.target.value)} />
                                      )}
                                    </td>
                                  ))}
                                  <td className="sets-detail-td sets-detail-td-actions">
                                    <button type="button" className="sets-detail-action-btn" onClick={() => handleDuplicateSet(set)} title="Duplicar">⧉</button>
                                    {unsavedSetChanges[set.id] && (
                                      <button type="button" className="sets-detail-action-btn sets-detail-save" onClick={() => handleSaveSetChanges(set.id)} disabled={isSavingSetChanges}>{isSavingSetChanges ? '…' : 'Guardar'}</button>
                                    )}
                                    <button type="button" className="sets-detail-action-btn sets-detail-delete" onClick={() => handleDeleteSet(set)} title="Eliminar">×</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {isSeriesEditMode && <p className="sets-detail-drag-hint">Arrastra las filas para cambiar el orden.</p>}
                  </>
                ) : null}
                </>
                )}
                
                {isCreatingExercise && (
                  <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <Button
                      title={isCreatingNewExercise ? 'Creando...' : 'Crear Ejercicio (⌘↵)'}
                      onClick={handleSaveCreatingExercise}
                      disabled={!canSaveCreatingExercise() || isCreatingNewExercise}
                      loading={isCreatingNewExercise}
                      style={{ width: '100%' }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Preset selector modal */}
      <Modal
        isOpen={isPresetSelectorOpen}
        onClose={() => {
          setIsPresetSelectorOpen(false);
          setPresetSearchQuery('');
        }}
        title="Elegir plantilla"
      >
        <div className="measure-selection-modal-content">
          <input
            type="text"
            className="preset-selector-search"
            placeholder="Buscar plantilla..."
            value={presetSearchQuery}
            onChange={(e) => setPresetSearchQuery(e.target.value)}
          />
          <div className="preset-selector-list">
            {presetsList
              .filter((p) => !presetSearchQuery.trim() || (p.name || '').toLowerCase().includes(presetSearchQuery.trim().toLowerCase()))
              .map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="preset-selector-item"
                  onClick={() => applyPresetToExercise(preset)}
                >
                  <span className="preset-selector-item-name">{preset.name || 'Sin nombre'}</span>
                  <button
                    type="button"
                    className="exercise-general-edit-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPresetBeingEditedId(preset.id);
                      setEditorModalMode('edit_preset');
                      setIsPresetSelectorOpen(false);
                      setIsMeasuresObjectivesEditorOpen(true);
                    }}
                    title="Editar plantilla"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 8.00012L4 16.0001V20.0001L8 20.0001L16 12.0001M12 8.00012L14.8686 5.13146L14.8704 5.12976C15.2652 4.73488 15.463 4.53709 15.691 4.46301C15.8919 4.39775 16.1082 4.39775 16.3091 4.46301C16.5369 4.53704 16.7345 4.7346 17.1288 5.12892L18.8686 6.86872C19.2646 7.26474 19.4627 7.46284 19.5369 7.69117C19.6022 7.89201 19.6021 8.10835 19.5369 8.3092C19.4628 8.53736 19.265 8.73516 18.8695 9.13061L18.8686 9.13146L16 12.0001M12 8.00012L16 12.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </button>
              ))}
          </div>
          <div className="preset-selector-create">
            <button
              type="button"
              className="preset-selector-create-btn"
              onClick={() => {
                setPresetBeingEditedId(null);
                setEditorModalMode('create_preset');
                setIsPresetSelectorOpen(false);
                setIsMeasuresObjectivesEditorOpen(true);
              }}
            >
              <span style={{ fontSize: 18 }}>+</span>
              Crear plantilla nueva
            </button>
          </div>
        </div>
      </Modal>

      <MeasuresObjectivesEditorModal
        isOpen={isMeasuresObjectivesEditorOpen}
        onClose={() => {
          setIsMeasuresObjectivesEditorOpen(false);
          setEditorModalMode('exercise');
          setPresetBeingEditedId(null);
        }}
        initialValues={
          editorModalMode === 'edit_preset' && presetBeingEditedId
            ? (() => {
                const p = presetsList.find((x) => x.id === presetBeingEditedId);
                return p
                  ? { measures: p.measures || [], objectives: p.objectives || [], customMeasureLabels: p.customMeasureLabels || {}, customObjectiveLabels: p.customObjectiveLabels || {} }
                  : { measures: draftMeasures, objectives: draftObjectives, customMeasureLabels: draftCustomMeasureLabels, customObjectiveLabels: draftCustomObjectiveLabels };
              })()
            : { measures: draftMeasures, objectives: draftObjectives, customMeasureLabels: draftCustomMeasureLabels, customObjectiveLabels: draftCustomObjectiveLabels }
        }
        onSave={handleMeasuresObjectivesEditorSave}
        onChange={handleMeasuresObjectivesEditorChange}
        mode={editorModalMode}
        initialPresetName={editorModalMode === 'edit_preset' && presetBeingEditedId ? (presetsList.find((p) => p.id === presetBeingEditedId)?.name || '') : ''}
      />

      {/* Library/Exercise Selection Modal */}
      <Modal
        isOpen={isLibraryExerciseModalOpen}
        onClose={handleCloseLibraryExerciseModal}
        title={(() => {
          if (libraryExerciseModalMode === 'primary') return 'Seleccionar Ejercicio Principal';
          if (libraryExerciseModalMode === 'add-alternative') return 'Agregar Alternativa';
          if (libraryExerciseModalMode === 'edit-alternative') return 'Editar Alternativa';
          return 'Seleccionar Ejercicio';
        })()}
      >
        <div className="library-exercise-selection-modal-content">
          {isLoadingLibrariesForSelection ? (
            <div className="library-exercise-selection-loading">
              <p>Cargando bibliotecas...</p>
            </div>
          ) : !selectedLibraryForExercise ? (
            <div className="library-exercise-selection-body">
              <h4 className="library-exercise-selection-step-title">Paso 1: Selecciona una biblioteca</h4>
              {availableLibrariesForSelection.length === 0 ? (
                <div className="library-exercise-selection-empty">
                  <p>No tienes bibliotecas disponibles. Crea una biblioteca primero.</p>
                </div>
              ) : (
                <div className="library-exercise-selection-list">
                  {availableLibrariesForSelection.map((library) => (
                    <button
                      key={library.id}
                      className="library-exercise-selection-item"
                      onClick={() => handleSelectLibrary(library.id)}
                    >
                      <span className="library-exercise-selection-item-name">{library.title || 'Sin título'}</span>
                      <span className="library-exercise-selection-item-count">
                        {libraryService.getExerciseCount(library)} ejercicios
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="library-exercise-selection-body">
              <div className="library-exercise-selection-header">
                <button
                  className="library-exercise-selection-back-button"
                  onClick={() => {
                    setSelectedLibraryForExercise(null);
                    setExercisesFromSelectedLibrary([]);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Volver
                </button>
                <h4 className="library-exercise-selection-step-title">
                  Paso 2: Selecciona un ejercicio de "{libraryTitles[selectedLibraryForExercise] || availableLibrariesForSelection.find(l => l.id === selectedLibraryForExercise)?.title || selectedLibraryForExercise}"
                </h4>
              </div>
              {isLoadingExercisesFromLibrary ? (
                <div className="library-exercise-selection-loading">
                  <p>Cargando ejercicios...</p>
                </div>
              ) : exercisesFromSelectedLibrary.length === 0 ? (
                <div className="library-exercise-selection-empty">
                  <p>Esta biblioteca no tiene ejercicios disponibles.</p>
                </div>
              ) : (
                <div className="library-exercise-selection-list">
                  {exercisesFromSelectedLibrary.map((exercise) => (
                    <button
                      key={exercise.name}
                      className="library-exercise-selection-item"
                      onClick={() => handleSelectExercise(exercise.name)}
                    >
                      <span className="library-exercise-selection-item-name">{exercise.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Create New Exercise Modal */}
      <Modal
        isOpen={isCreateExerciseModalOpen}
        onClose={handleCloseCreateExerciseModal}
        title="Crear Nuevo Ejercicio"
        extraWide={true}
      >
        <div className="exercise-modal-layout">
          {!canSaveNewExercise() && (
            <div className="create-exercise-requirements-summary" style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)', borderRadius: '8px' }}>
              <p className="create-exercise-requirements-text">
                Para crear el ejercicio, necesitas:
                {(!newExerciseDraft?.primary || Object.values(newExerciseDraft.primary || {}).length === 0) && (
                  <span className="create-exercise-requirement-item"> • Ejercicio principal</span>
                )}
                {newExerciseSets.length === 0 && (
                  <span className="create-exercise-requirement-item"> • Al menos una serie</span>
                )}
              </p>
            </div>
          )}
          
          <div className="exercise-modal-main-content">
            {/* Left Side - General Exercise Info */}
            <div className="exercise-modal-left-panel">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Primary Exercise Section */}
                <div className="one-on-one-modal-section">
                  <div className="one-on-one-modal-section-header">
                    <h3 className="one-on-one-modal-section-title">Ejercicio Principal</h3>
                    <span className="one-on-one-modal-section-badge">Requerido</span>
                  </div>
                  <div className="one-on-one-modal-section-content">
                    {newExerciseDraft?.primary && Object.values(newExerciseDraft.primary).length > 0 ? (
                      <div className="exercise-horizontal-card">
                        <span className="exercise-horizontal-card-name">
                          {Object.values(newExerciseDraft.primary)[0]}
                        </span>
                        <button 
                          className="exercise-horizontal-card-edit"
                          onClick={handleSelectPrimaryForNewExercise}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 8.00012L4 16.0001V20.0001L8 20.0001L16 12.0001M12 8.00012L14.8686 5.13146L14.8704 5.12976C15.2652 4.73488 15.463 4.53709 15.691 4.46301C15.8919 4.39775 16.1082 4.39775 16.3091 4.46301C16.5369 4.53704 16.7345 4.7346 17.1288 5.12892L18.8686 6.86872C19.2646 7.26474 19.4627 7.46284 19.5369 7.69117C19.6022 7.89201 19.6021 8.10835 19.5369 8.3092C19.4628 8.53736 19.265 8.73516 18.8695 9.13061L18.8686 9.13146L16 12.0001M12 8.00012L16 12.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          className="create-exercise-select-button"
                          onClick={handleSelectPrimaryForNewExercise}
                        >
                          <span className="create-exercise-select-button-text">Seleccionar Ejercicio Principal</span>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 8.00012L4 16.0001V20.0001L8 20.0001L16 12.0001M12 8.00012L14.8686 5.13146L14.8704 5.12976C15.2652 4.73488 15.463 4.53709 15.691 4.46301C15.8919 4.39775 16.1082 4.39775 16.3091 4.46301C16.5369 4.53704 16.7345 4.7346 17.1288 5.12892L18.8686 6.86872C19.2646 7.26474 19.4627 7.46284 19.5369 7.69117C19.6022 7.89201 19.6021 8.10835 19.5369 8.3092C19.4628 8.53736 19.265 8.73516 18.8695 9.13061L18.8686 9.13146L16 12.0001M12 8.00012L16 12.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <p className="one-on-one-field-note" style={{ marginTop: '8px', marginBottom: 0 }}>
                          Selecciona el ejercicio principal de tu biblioteca
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Optional Configuration Section */}
                <div className="one-on-one-modal-section">
                  <div className="one-on-one-modal-section-header">
                    <h3 className="one-on-one-modal-section-title">Configuración Opcional</h3>
                    <span className="one-on-one-modal-section-badge-optional">Opcional</span>
                  </div>
                  <div className="one-on-one-modal-section-content">
                    <p className="one-on-one-field-note" style={{ marginBottom: '16px' }}>
                      Puedes agregar alternativas, medidas y objetivos después de crear el ejercicio desde la vista de edición.
                    </p>
                    <div style={{ 
                      padding: '16px', 
                      backgroundColor: 'rgba(255, 255, 255, 0.03)', 
                      border: '1px solid rgba(255, 255, 255, 0.08)', 
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.6, flexShrink: 0 }}>
                        <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.5' }}>
                        Las alternativas, medidas y objetivos pueden configurarse después de crear el ejercicio
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right Side - Sets Panel (Always Visible) */}
            <div className="exercise-modal-right-panel">
              <div className="exercise-sets-panel-header">
                <h3 className="exercise-sets-panel-title">Series</h3>
                <span className="one-on-one-modal-section-badge">Requerido</span>
              </div>
              
              <div className="exercise-sets-panel-content">
                <div className="sets-panel-cards-stack">
                  <div className="sets-panel-glass-card sets-panel-glass-card-series">
                    <span className="sets-panel-glass-label">Series</span>
                    <div className="sets-panel-number-wrap">
                      <button type="button" className="sets-panel-number-btn" onClick={() => syncNewExerciseSetsCount((newExerciseSets.length || numberOfSetsForNewExercise) - 1)} aria-label="Menos series">−</button>
                      <input type="number" min={1} max={20} className="sets-panel-number-input" value={newExerciseSets.length || numberOfSetsForNewExercise} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) syncNewExerciseSetsCount(Math.max(1, Math.min(20, v))); }} />
                      <button type="button" className="sets-panel-number-btn" onClick={() => syncNewExerciseSetsCount((newExerciseSets.length || numberOfSetsForNewExercise) + 1)} aria-label="Más series">+</button>
                    </div>
                  </div>
                  {((newExerciseDraft?.measures?.length ?? 0) > 0 && (newExerciseDraft?.objectives?.length ?? 0) > 0) && ((newExerciseDraft?.objectives || []).filter(o => o !== 'previous').length ? (newExerciseDraft?.objectives || []).filter(o => o !== 'previous') : ['reps', 'intensity']).map((obj) => (
                    <div key={obj} className="sets-panel-glass-card">
                      <span className="sets-panel-glass-label">{newExerciseDraft?.customObjectiveLabels?.[obj] || { reps: 'Repeticiones', intensity: 'Intensidad' }[obj] || obj}</span>
                      {obj === 'intensity' ? (
                        <div className="exercise-series-intensity-input-wrapper sets-panel-glass-input-wrap">
                          <input type="text" className="exercise-series-input exercise-series-intensity-input sets-panel-glass-input" placeholder="8" maxLength={2} value={newExerciseDefaultSetValues[obj] != null && newExerciseDefaultSetValues[obj] !== '' ? String(newExerciseDefaultSetValues[obj]).replace(/\/10$/, '') : ''} onChange={(e) => handleUpdateNewExerciseDefaultValue(obj, e.target.value)} />
                          <span className="exercise-series-intensity-suffix">/10</span>
                        </div>
                      ) : (
                        <input type="text" className="exercise-series-input sets-panel-glass-input" placeholder="10" value={newExerciseDefaultSetValues[obj] != null && newExerciseDefaultSetValues[obj] !== '' ? String(newExerciseDefaultSetValues[obj]) : ''} onChange={(e) => handleUpdateNewExerciseDefaultValue(obj, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
                {!((newExerciseDraft?.measures?.length ?? 0) > 0 && (newExerciseDraft?.objectives?.length ?? 0) > 0) && (
                  <div className="exercises-empty sets-panel-empty-compact">
                    <p>Configura Data (plantilla o manual) para definir las series.</p>
                  </div>
                )}
                {((newExerciseDraft?.measures?.length ?? 0) > 0 && (newExerciseDraft?.objectives?.length ?? 0) > 0) && (
                <>
                {newExerciseSets.length > 0 && (
                  <button type="button" className="sets-panel-toggle-detail" onClick={() => setShowPerSetCardsNewExercise(prev => !prev)}>
                    {showPerSetCardsNewExercise ? 'Ocultar detalle por serie' : 'Editar por serie'}
                  </button>
                )}
                {newExerciseSets.length === 0 ? (
                  <div className="exercises-empty sets-panel-empty-compact">
                    <p>Indica el número de series y los valores; se aplicarán a todas.</p>
                  </div>
                ) : showPerSetCardsNewExercise ? (
                  <>
                    <div className="exercise-sets-panel-actions">
                      <button className="exercise-action-pill" onClick={handleAddSetToNewExercise}>
                        <span className="exercise-action-icon">+</span>
                        <span className="exercise-action-text">Agregar Serie</span>
                      </button>
                    </div>
                    <div className="create-exercise-sets-list">
                      {newExerciseSets.map((set, index) => (
                        <div key={index} className="create-exercise-set-item">
                          <div className="create-exercise-set-header">
                            <span className="create-exercise-set-number">Serie {index + 1}</span>
                            {newExerciseSets.length > 1 && (
                              <button className="create-exercise-set-remove" onClick={() => handleRemoveSetFromNewExercise(index)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            )}
                          </div>
                          <div className="create-exercise-set-fields">
                            {((newExerciseDraft?.objectives || []).filter(o => o !== 'previous').length ? (newExerciseDraft?.objectives || []).filter(o => o !== 'previous') : ['reps', 'intensity']).map((obj) => (
                              <div key={obj} className="create-exercise-set-field">
                                <label className="create-exercise-set-label">{newExerciseDraft?.customObjectiveLabels?.[obj] || { reps: 'Repeticiones', intensity: 'Intensidad' }[obj] || obj}</label>
                                <Input type="text" placeholder={obj === 'intensity' ? 'Ej: 8/10' : obj === 'reps' ? 'Ej: 10' : '--'} value={set[obj] != null && set[obj] !== '' ? String(set[obj]) : ''} onChange={(e) => handleUpdateNewExerciseSet(index, obj, e.target.value)} light={true} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
                </>
                )}
                
                <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <Button
                    title={isCreatingNewExercise ? 'Creando...' : 'Crear Ejercicio'}
                    onClick={handleCreateNewExercise}
                    disabled={!canSaveNewExercise() || isCreatingNewExercise}
                    loading={isCreatingNewExercise}
                    style={{ width: '100%' }}
                  />
                  <p className="one-on-one-modal-help-text" style={{ marginTop: '12px', marginBottom: 0 }}>
                    Los campos marcados con <span style={{ color: 'rgba(255, 68, 68, 0.9)' }}>*</span> son requeridos.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Stat Explanation Modal */}
      <Modal
        isOpen={isStatExplanationModalOpen}
        onClose={() => setIsStatExplanationModalOpen(false)}
        title={statExplanation?.title || 'Información'}
      >
        <div className="stat-explanation-modal-content">
          <p className="stat-explanation-text">{statExplanation?.description || ''}</p>
        </div>
      </Modal>

      {/* User Info Modal */}
      <Modal
        isOpen={isUserInfoModalOpen}
        onClose={() => setIsUserInfoModalOpen(false)}
        title="Información del Usuario"
      >
        <div className="user-info-modal-content">
          {selectedUserInfo && (
            <>
              <div className="user-info-field">
                <span className="user-info-label">Nombre:</span>
                <span className="user-info-value">{selectedUserInfo.userName || 'N/A'}</span>
              </div>
              {selectedUserInfo.userEmail && (
                <div className="user-info-field">
                  <span className="user-info-label">Email:</span>
                  <span className="user-info-value">{selectedUserInfo.userEmail}</span>
                </div>
              )}
              {selectedUserInfo.userCity && (
                <div className="user-info-field">
                  <span className="user-info-label">Ciudad:</span>
                  <span className="user-info-value">{selectedUserInfo.userCity}</span>
                </div>
              )}
              {selectedUserInfo.userAge && (
                <div className="user-info-field">
                  <span className="user-info-label">Edad:</span>
                  <span className="user-info-value">{selectedUserInfo.userAge} años</span>
                </div>
              )}
              <div className="user-info-field">
                <span className="user-info-label">Sesiones Completadas:</span>
                <span className="user-info-value">{selectedUserInfo.sessionsCompleted || 0}</span>
              </div>
              {selectedUserInfo.courseData && (
                <>
                  <div className="user-info-field">
                    <span className="user-info-label">Estado:</span>
                    <span className="user-info-value">{selectedUserInfo.courseData.status || 'N/A'}</span>
                  </div>
                  {selectedUserInfo.courseData.purchased_at && (
                    <div className="user-info-field">
                      <span className="user-info-label">Fecha de Compra:</span>
                      <span className="user-info-value">
                        {new Date(selectedUserInfo.courseData.purchased_at).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                  )}
                  {selectedUserInfo.courseData.expires_at && (
                    <div className="user-info-field">
                      <span className="user-info-label">Fecha de Expiración:</span>
                      <span className="user-info-value">
                        {new Date(selectedUserInfo.courseData.expires_at).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                  )}
                  {selectedUserInfo.courseData.is_trial && (
                    <div className="user-info-field">
                      <span className="user-info-label">Tipo:</span>
                      <span className="user-info-value">Prueba Gratis</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default ProgramDetailScreen;

