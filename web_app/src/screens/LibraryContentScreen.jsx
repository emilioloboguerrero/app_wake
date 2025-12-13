import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Button from '../components/Button';
import Input from '../components/Input';
import libraryService from '../services/libraryService';
import { deleteField } from 'firebase/firestore';
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

// Helper functions
const getLibraryExerciseKey = (libraryId, exerciseName) => `${libraryId || ''}::${exerciseName || ''}`;

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

const getMeasureDisplayName = (measure) => {
  if (measure === 'reps') return 'Repeticiones';
  if (measure === 'weight') return 'Peso';
  return measure;
};

const getObjectiveDisplayName = (objective) => {
  if (objective === 'reps') return 'Repeticiones';
  if (objective === 'intensity') return 'Intensidad';
  if (objective === 'previous') return 'Anterior';
  return objective;
};

const parseIntensityForDisplay = (intensity) => {
  if (!intensity) return '';
  if (typeof intensity === 'string') {
    // Handle formats like "8/10" or "8"
    const parts = intensity.split('/');
    return parts[0] || '';
  }
  return String(intensity);
};

const LibraryContentScreen = () => {
  const { moduleId, sessionId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  // Get the tab from URL params, default to 'modules' if viewing a module, 'sessions' if viewing a session
  const getTabFromContext = () => {
    const tabParam = searchParams.get('tab');
    if (tabParam) return tabParam;
    if (sessionId) return 'sessions';
    if (moduleId) return 'modules';
    return 'modules';
  };
  
  const tab = getTabFromContext();
  
  const [libraryModules, setLibraryModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [librarySessions, setLibrarySessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExerciseEditMode, setIsExerciseEditMode] = useState(false);
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [selectedExerciseTab, setSelectedExerciseTab] = useState('general');
  const [exerciseDraft, setExerciseDraft] = useState(null);
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [exerciseSets, setExerciseSets] = useState([]);
  const [originalExerciseSets, setOriginalExerciseSets] = useState([]);
  const [unsavedSetChanges, setUnsavedSetChanges] = useState({});
  const [expandedSeries, setExpandedSeries] = useState({});
  const [isSeriesEditMode, setIsSeriesEditMode] = useState(false);
  const [isCreatingSet, setIsCreatingSet] = useState(false);
  const [isSavingSetChanges, setIsSavingSetChanges] = useState(false);
  const [isUpdatingSeriesOrder, setIsUpdatingSeriesOrder] = useState(false);
  const [isLibraryExerciseModalOpen, setIsLibraryExerciseModalOpen] = useState(false);
  const [libraryExerciseModalMode, setLibraryExerciseModalMode] = useState(null); // 'primary', 'add-alternative', 'edit-alternative'
  const [availableLibrariesForSelection, setAvailableLibrariesForSelection] = useState([]);
  const [selectedLibraryForExercise, setSelectedLibraryForExercise] = useState(null);
  const [exercisesFromSelectedLibrary, setExercisesFromSelectedLibrary] = useState([]);
  const [isLoadingLibrariesForSelection, setIsLoadingLibrariesForSelection] = useState(false);
  const [isLoadingExercisesFromLibrary, setIsLoadingExercisesFromLibrary] = useState(false);
  const [libraryTitles, setLibraryTitles] = useState({});
  const [alternativeToEdit, setAlternativeToEdit] = useState(null); // { libraryId, index }
  const [isAlternativesEditMode, setIsAlternativesEditMode] = useState(false);
  const [isMeasuresEditMode, setIsMeasuresEditMode] = useState(false);
  const [isObjectivesEditMode, setIsObjectivesEditMode] = useState(false);
  const [isMeasureSelectionModalOpen, setIsMeasureSelectionModalOpen] = useState(false);
  const [measureToEditIndex, setMeasureToEditIndex] = useState(null);
  const [isObjectiveSelectionModalOpen, setIsObjectiveSelectionModalOpen] = useState(false);
  const [objectiveToEditIndex, setObjectiveToEditIndex] = useState(null);
  const [isCreatingNewExercise, setIsCreatingNewExercise] = useState(false);

  // Load library modules (only if no moduleId or sessionId)
  useEffect(() => {
    const loadModules = async () => {
      if (!user || moduleId || sessionId) return;
      
      try {
        setLoading(true);
        const modules = await libraryService.getModuleLibrary(user.uid);
        setLibraryModules(modules);
      } catch (err) {
        console.error('Error loading library modules:', err);
        setError('Error al cargar los módulos');
      } finally {
        setLoading(false);
      }
    };
    
    loadModules();
  }, [user, moduleId, sessionId]);

  // Load selected module and its sessions
  useEffect(() => {
    const loadModuleSessions = async () => {
      if (!user || !moduleId) {
        setSelectedModule(null);
        setLibrarySessions([]);
        return;
      }
      
      try {
        setLoading(true);
        const module = await libraryService.getLibraryModuleById(user.uid, moduleId);
        if (module) {
          setSelectedModule(module);
          const sessions = await libraryService.getLibraryModuleSessions(user.uid, moduleId);
          setLibrarySessions(sessions);
        }
      } catch (err) {
        console.error('Error loading module sessions:', err);
        setError('Error al cargar las sesiones');
      } finally {
        setLoading(false);
      }
    };
    
    loadModuleSessions();
  }, [user, moduleId]);

  // Load selected session and its exercises (standalone or from module)
  useEffect(() => {
    const loadSessionExercises = async () => {
      if (!user || !sessionId) {
        setSelectedSession(null);
        setExercises([]);
        return;
      }
      
      try {
        setLoading(true);
        const session = await libraryService.getLibrarySessionById(user.uid, sessionId);
        if (session) {
          setSelectedSession(session);
          setExercises(session.exercises || []);
        }
      } catch (err) {
        console.error('Error loading session exercises:', err);
        setError('Error al cargar los ejercicios');
      } finally {
        setLoading(false);
      }
    };
    
    loadSessionExercises();
  }, [user, sessionId]);

  const handleModuleClick = (module) => {
    const currentTab = searchParams.get('tab') || 'modules';
    navigate(`/library/content/modules/${module.id}?tab=${currentTab}`);
  };

  const handleBackToModules = () => {
    navigate('/library/content');
    setSelectedModule(null);
    setLibrarySessions([]);
    setSelectedSession(null);
    setExercises([]);
  };

  const handleSessionClick = (session) => {
    const currentTab = searchParams.get('tab') || 'modules';
    navigate(`/library/content/modules/${moduleId}/sessions/${session.id}?tab=${currentTab}`);
  };

  const handleBackToSessions = () => {
    if (moduleId) {
      navigate(`/library/content/modules/${moduleId}`);
    } else {
      navigate('/library/content');
    }
    setSelectedSession(null);
    setExercises([]);
  };

  const getScreenName = () => {
    if (selectedSession) {
      return selectedSession.title || `Sesión ${selectedSession.id?.slice(0, 8) || ''}`;
    }
    if (selectedModule) {
      const moduleName = selectedModule.title || `Módulo ${selectedModule.id?.slice(0, 8) || ''}`;
      return `Sesiones - ${moduleName}`;
    }
    return 'Biblioteca';
  };

  // Render modules list
  const renderModules = () => {
    if (loading) {
      return (
        <div className="modules-loading">
          <p>Cargando módulos...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="modules-error">
          <p>{error}</p>
        </div>
      );
    }

    if (libraryModules.length === 0) {
      return (
        <div className="modules-empty">
          <p>No tienes módulos aún. Crea un nuevo módulo para comenzar.</p>
        </div>
      );
    }

    return (
      <div className="modules-list">
        {libraryModules.map((module, index) => {
          const moduleNumber = index + 1;
          return (
            <div
              key={module.id}
              className="module-card"
              onClick={() => handleModuleClick(module)}
            >
              <div className="module-card-number">{moduleNumber}</div>
              <div className="module-card-header">
                <h3 className="module-card-title">
                  {module.title || `Módulo ${module.id.slice(0, 8)}`}
                </h3>
              </div>
              <div className="module-card-footer">
                <span className="module-card-count">
                  {(module.sessionRefs || []).length} {(module.sessionRefs || []).length === 1 ? 'sesión' : 'sesiones'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render sessions list
  const renderSessions = () => {
    if (loading) {
      return (
        <div className="sessions-loading">
          <p>Cargando sesiones...</p>
        </div>
      );
    }

    if (librarySessions.length === 0) {
      return (
        <div className="sessions-empty">
          <p>No hay sesiones aún en este módulo.</p>
        </div>
      );
    }

    return (
      <div className="sessions-list">
        {librarySessions.map((session, index) => {
          const sessionNumber = index + 1;
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
              <div className="session-card-header">
                <h3 className="session-card-title">
                  {session.title || `Sesión ${session.id.slice(0, 8)}`}
                </h3>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render exercises list
  const renderExercises = () => {
    if (loading) {
      return (
        <div className="exercises-loading">
          <p>Cargando ejercicios...</p>
        </div>
      );
    }

    if (exercises.length === 0) {
      return (
        <div className="exercises-empty">
          <p>No hay ejercicios en esta sesión aún.</p>
        </div>
      );
    }

    return (
      <div className="exercises-list">
        {exercises.map((exercise, index) => {
          const getExerciseTitle = () => {
            if (exercise.primary && typeof exercise.primary === 'object') {
              const primaryValues = Object.values(exercise.primary);
              if (primaryValues.length > 0 && primaryValues[0]) {
                return primaryValues[0];
              }
            }
            return exercise.name || exercise.title || `Ejercicio ${exercise.id?.slice(0, 8) || ''}`;
          };

          const exerciseNumber = (exercise.order !== undefined && exercise.order !== null) ? exercise.order + 1 : index + 1;

          return (
            <div 
              key={exercise.id} 
              className="exercise-card"
            >
              <div className="exercise-card-number">{exerciseNumber}</div>
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
    );
  };

  const getBackPath = () => {
    return `/libraries?tab=${tab}`;
  };

  // Computed values for exercise modal
  const activeExerciseForModal = exerciseDraft || selectedExercise || null;
  const currentExerciseId = activeExerciseForModal?.id === 'new' ? null : activeExerciseForModal?.id || null;
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
  
  const getPrimaryExerciseName = () => {
    if (!activeExerciseForModal) return '';
    if (activeExerciseForModal.primary && typeof activeExerciseForModal.primary === 'object') {
      const primaryValues = Object.values(activeExerciseForModal.primary);
      if (primaryValues.length > 0 && primaryValues[0]) {
        return primaryValues[0];
      }
    }
    return activeExerciseForModal.name || activeExerciseForModal.title || '';
  };

  // Exercise modal handlers (adapted from ProgramDetailScreen)
  const handleCloseExerciseModal = () => {
    setIsExerciseModalOpen(false);
    setIsCreatingExercise(false);
    setSelectedExercise(null);
    setExerciseDraft(null);
    setExerciseSets([]);
    setOriginalExerciseSets([]);
    setUnsavedSetChanges({});
    setSelectedExerciseTab('general');
    setIsAlternativesEditMode(false);
    setIsMeasuresEditMode(false);
    setIsObjectivesEditMode(false);
  };

  const handleEditPrimary = async () => {
    if (!user) return;
    
    try {
      setIsLoadingLibrariesForSelection(true);
      setLibraryExerciseModalMode('primary');
      setAlternativeToEdit(null);
      setSelectedLibraryForExercise(null);
      setExercisesFromSelectedLibrary([]);
      
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

  const handleSelectLibrary = async (libraryId) => {
    try {
      setIsLoadingExercisesFromLibrary(true);
      setSelectedLibraryForExercise(libraryId);
      
      const library = await libraryService.getLibraryById(libraryId);
      if (library) {
        const exercisesList = libraryService.getExercisesFromLibrary(library);
        setExercisesFromSelectedLibrary(exercisesList);
        
        if (!libraryTitles[libraryId] && library.title) {
          setLibraryTitles(prev => ({
            ...prev,
            [libraryId]: library.title
          }));
        }
      }
    } catch (err) {
      console.error('Error loading exercises from library:', err);
      alert('Error al cargar los ejercicios');
    } finally {
      setIsLoadingExercisesFromLibrary(false);
    }
  };

  const handleSelectExercise = async (exerciseName) => {
    if (!selectedLibraryForExercise || !exerciseName) {
      return;
    }

    try {
      if (libraryExerciseModalMode === 'primary') {
        const primaryUpdate = {
          [selectedLibraryForExercise]: exerciseName
        };
        
        // If creating exercise in main modal, update draft
        if (isCreatingExercise) {
          setExerciseDraft(prev => ({
            ...prev,
            primary: primaryUpdate
          }));
          setSelectedExercise(prev => ({
            ...prev,
            primary: primaryUpdate
          }));
        }
        
        if (!libraryTitles[selectedLibraryForExercise]) {
          const library = await libraryService.getLibraryById(selectedLibraryForExercise);
          if (library && library.title) {
            setLibraryTitles(prev => ({
              ...prev,
              [selectedLibraryForExercise]: library.title
            }));
          }
        }
      } else if (libraryExerciseModalMode === 'add-alternative') {
        // Add alternative
        const currentAlternatives = JSON.parse(JSON.stringify(draftAlternatives));
        let exerciseExists = false;
        
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
        
        if (isCreatingExercise) {
          setExerciseDraft(prev => ({
            ...prev,
            alternatives: currentAlternatives
          }));
          setSelectedExercise(prev => ({
            ...prev,
            alternatives: currentAlternatives
          }));
        }
        
        if (!libraryTitles[selectedLibraryForExercise]) {
          const library = await libraryService.getLibraryById(selectedLibraryForExercise);
          if (library && library.title) {
            setLibraryTitles(prev => ({
              ...prev,
              [selectedLibraryForExercise]: library.title
            }));
          }
        }
      } else if (libraryExerciseModalMode === 'edit-alternative' && alternativeToEdit) {
        // Edit alternative
        const currentAlternatives = JSON.parse(JSON.stringify(draftAlternatives));
        if (currentAlternatives[alternativeToEdit.libraryId] && 
            Array.isArray(currentAlternatives[alternativeToEdit.libraryId]) &&
            alternativeToEdit.index < currentAlternatives[alternativeToEdit.libraryId].length) {
          
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
          
          currentAlternatives[alternativeToEdit.libraryId][alternativeToEdit.index] = exerciseName;
          
          if (isCreatingExercise) {
            setExerciseDraft(prev => ({
              ...prev,
              alternatives: currentAlternatives
            }));
            setSelectedExercise(prev => ({
              ...prev,
              alternatives: currentAlternatives
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

  const handleCloseLibraryExerciseModal = () => {
    setIsLibraryExerciseModalOpen(false);
    setLibraryExerciseModalMode(null);
    setSelectedLibraryForExercise(null);
    setExercisesFromSelectedLibrary([]);
    setAvailableLibrariesForSelection([]);
    setAlternativeToEdit(null);
  };

  const handleAddAlternative = async () => {
    if (!user) return;
    
    try {
      setIsLoadingLibrariesForSelection(true);
      setLibraryExerciseModalMode('add-alternative');
      setAlternativeToEdit(null);
      setSelectedLibraryForExercise(null);
      setExercisesFromSelectedLibrary([]);
      
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

  const handleDeleteAlternative = (libraryId, index) => {
    const currentAlternatives = JSON.parse(JSON.stringify(draftAlternatives));
    if (currentAlternatives[libraryId] && Array.isArray(currentAlternatives[libraryId])) {
      currentAlternatives[libraryId].splice(index, 1);
      if (currentAlternatives[libraryId].length === 0) {
        delete currentAlternatives[libraryId];
      }
      
      if (isCreatingExercise) {
        setExerciseDraft(prev => ({
          ...prev,
          alternatives: currentAlternatives
        }));
        setSelectedExercise(prev => ({
          ...prev,
          alternatives: currentAlternatives
        }));
      }
    }
  };

  const handleEditAlternative = async (libraryId, index) => {
    if (!user) return;
    
    try {
      setIsLoadingLibrariesForSelection(true);
      setLibraryExerciseModalMode('edit-alternative');
      setAlternativeToEdit({ libraryId, index });
      setSelectedLibraryForExercise(null);
      setExercisesFromSelectedLibrary([]);
      
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

  const handleAddMeasure = () => {
    setMeasureToEditIndex(null);
    setIsMeasureSelectionModalOpen(true);
  };

  const handleSelectMeasure = async (measureValue) => {
    try {
      const updatedMeasures = [...draftMeasures];
      
      if (measureToEditIndex !== null && measureToEditIndex >= 0 && measureToEditIndex < updatedMeasures.length) {
        if (updatedMeasures.includes(measureValue) && updatedMeasures.indexOf(measureValue) !== measureToEditIndex) {
          alert('Esta medida ya está agregada.');
          return;
        }
        updatedMeasures[measureToEditIndex] = measureValue;
      } else {
        if (updatedMeasures.includes(measureValue)) {
          alert('Esta medida ya está agregada.');
          setIsMeasureSelectionModalOpen(false);
          setMeasureToEditIndex(null);
          return;
        }
        updatedMeasures.push(measureValue);
      }

      if (isCreatingExercise) {
        setExerciseDraft(prev => ({
          ...prev,
          measures: updatedMeasures
        }));
        setSelectedExercise(prev => ({
          ...prev,
          measures: updatedMeasures
        }));
        setIsMeasureSelectionModalOpen(false);
        setMeasureToEditIndex(null);
        return;
      }
    } catch (err) {
      console.error('Error updating measure:', err);
      alert('Error al actualizar la medida. Por favor, intenta de nuevo.');
    }
  };

  const handleDeleteMeasure = (index) => {
    const updatedMeasures = draftMeasures.filter((_, i) => i !== index);

    if (isCreatingExercise) {
      setExerciseDraft(prev => ({
        ...prev,
        measures: updatedMeasures
      }));
      setSelectedExercise(prev => ({
        ...prev,
        measures: updatedMeasures
      }));
    }
  };

  const handleAddObjective = () => {
    setObjectiveToEditIndex(null);
    setIsObjectiveSelectionModalOpen(true);
  };

  const handleSelectObjective = async (objectiveValue) => {
    try {
      const updatedObjectives = [...draftObjectives];
      
      if (objectiveToEditIndex !== null && objectiveToEditIndex >= 0 && objectiveToEditIndex < updatedObjectives.length) {
        if (updatedObjectives.includes(objectiveValue) && updatedObjectives.indexOf(objectiveValue) !== objectiveToEditIndex) {
          alert('Este objetivo ya está agregado.');
          return;
        }
        updatedObjectives[objectiveToEditIndex] = objectiveValue;
      } else {
        if (updatedObjectives.includes(objectiveValue)) {
          alert('Este objetivo ya está agregado.');
          setIsObjectiveSelectionModalOpen(false);
          setObjectiveToEditIndex(null);
          return;
        }
        updatedObjectives.push(objectiveValue);
      }

      if (isCreatingExercise) {
        setExerciseDraft(prev => ({
          ...prev,
          objectives: updatedObjectives
        }));
        setSelectedExercise(prev => ({
          ...prev,
          objectives: updatedObjectives
        }));
        setIsObjectiveSelectionModalOpen(false);
        setObjectiveToEditIndex(null);
        return;
      }
    } catch (err) {
      console.error('Error updating objective:', err);
      alert('Error al actualizar el objetivo. Por favor, intenta de nuevo.');
    }
  };

  const handleDeleteObjective = (index) => {
    const updatedObjectives = draftObjectives.filter((_, i) => i !== index);

    if (isCreatingExercise) {
      setExerciseDraft(prev => ({
        ...prev,
        objectives: updatedObjectives
      }));
      setSelectedExercise(prev => ({
        ...prev,
        objectives: updatedObjectives
      }));
    }
  };

  // Set handlers
  const handleCreateSet = async () => {
    if (!user || !sessionId || !currentExerciseId) return;
    
    try {
      setIsCreatingSet(true);
      const maxOrder = exerciseSets.length > 0 
        ? Math.max(...exerciseSets.map(s => (s.order !== undefined && s.order !== null) ? s.order : -1))
        : -1;
      const newOrder = maxOrder + 1;
      
      if (isCreatingExercise) {
        // Creating exercise - add temporary set
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const newSet = {
          id: tempId,
          order: newOrder,
          title: `Serie ${newOrder + 1}`,
          reps: null,
          intensity: null
        };
        setExerciseSets(prev => [...prev, newSet]);
        setUnsavedSetChanges(prev => ({ ...prev, [tempId]: false }));
      } else {
        // Existing exercise - create in database
        const newSet = await libraryService.createSetInLibraryExercise(
          user.uid,
          sessionId,
          currentExerciseId,
          newOrder
        );
        setExerciseSets(prev => [...prev, newSet]);
        setUnsavedSetChanges(prev => ({ ...prev, [newSet.id]: false }));
      }
    } catch (err) {
      console.error('Error creating set:', err);
      alert('Error al crear la serie. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingSet(false);
    }
  };

  const handleUpdateSetValue = (setIndex, field, value) => {
    const updatedSets = [...exerciseSets];
    if (updatedSets[setIndex]) {
      updatedSets[setIndex] = {
        ...updatedSets[setIndex],
        [field]: value
      };
      setExerciseSets(updatedSets);
      setUnsavedSetChanges(prev => ({
        ...prev,
        [updatedSets[setIndex].id]: true
      }));
    }
  };

  const handleSaveSetChanges = async (setId) => {
    if (!user || !sessionId || !currentExerciseId) return;
    
    const set = exerciseSets.find(s => s.id === setId);
    if (!set || !unsavedSetChanges[setId]) return;
    
    try {
      setIsSavingSetChanges(true);
      
      if (isCreatingExercise) {
        // Just mark as saved (will be saved when exercise is created)
        setUnsavedSetChanges(prev => ({
          ...prev,
          [setId]: false
        }));
      } else {
        // Save to database
        const setUpdateData = {
          reps: set.reps || null,
          intensity: set.intensity || null
        };
        
        await libraryService.updateSetInLibraryExercise(
          user.uid,
          sessionId,
          currentExerciseId,
          setId,
          setUpdateData
        );
        
        setUnsavedSetChanges(prev => ({
          ...prev,
          [setId]: false
        }));
      }
    } catch (err) {
      console.error('Error saving set changes:', err);
      alert('Error al guardar los cambios. Por favor, intenta de nuevo.');
    } finally {
      setIsSavingSetChanges(false);
    }
  };

  const handleDeleteSet = async (set) => {
    if (!user || !sessionId) return;
    
    if (isCreatingExercise) {
      // Just remove from state
      setExerciseSets(prev => prev.filter(s => s.id !== set.id));
      setUnsavedSetChanges(prev => {
        const updated = { ...prev };
        delete updated[set.id];
        return updated;
      });
    } else if (currentExerciseId) {
      // Delete from database
      try {
        await libraryService.deleteSetFromLibraryExercise(
          user.uid,
          sessionId,
          currentExerciseId,
          set.id
        );
        setExerciseSets(prev => prev.filter(s => s.id !== set.id));
        setUnsavedSetChanges(prev => {
          const updated = { ...prev };
          delete updated[set.id];
          return updated;
        });
      } catch (err) {
        console.error('Error deleting set:', err);
        alert('Error al eliminar la serie. Por favor, intenta de nuevo.');
      }
    }
  };

  const handleDuplicateSet = async (set) => {
    if (!user || !sessionId || !currentExerciseId) return;
    
    const maxOrder = exerciseSets.length > 0 
      ? Math.max(...exerciseSets.map(s => (s.order !== undefined && s.order !== null) ? s.order : -1))
      : -1;
    const newOrder = maxOrder + 1;
    
    try {
      if (isCreatingExercise) {
        // Creating exercise - duplicate in state
        const tempId = `temp-${Date.now()}-${Math.random()}`;
        const duplicatedSet = {
          id: tempId,
          order: newOrder,
          title: `Serie ${newOrder + 1}`,
          reps: set.reps || null,
          intensity: set.intensity || null
        };
        setExerciseSets(prev => [...prev, duplicatedSet]);
        setUnsavedSetChanges(prev => ({ ...prev, [tempId]: true }));
      } else {
        // Existing exercise - create in database
        const newSet = await libraryService.createSetInLibraryExercise(
          user.uid,
          sessionId,
          currentExerciseId,
          newOrder
        );
        
        const setUpdateData = {
          reps: set.reps || null,
          intensity: set.intensity || null
        };
        
        await libraryService.updateSetInLibraryExercise(
          user.uid,
          sessionId,
          currentExerciseId,
          newSet.id,
          setUpdateData
        );
        
        const updatedSets = await libraryService.getSetsByLibraryExercise(
          user.uid,
          sessionId,
          currentExerciseId
        );
        setExerciseSets(updatedSets);
        setUnsavedSetChanges(prev => ({ ...prev, [newSet.id]: false }));
      }
    } catch (err) {
      console.error('Error duplicating set:', err);
      alert('Error al duplicar la serie. Por favor, intenta de nuevo.');
    }
  };

  const handleToggleSeriesExpansion = (setId) => {
    setExpandedSeries(prev => ({
      ...prev,
      [setId]: !prev[setId]
    }));
  };

  const handleEditSeries = () => {
    if (!isSeriesEditMode) {
      setOriginalSeriesOrder([...exerciseSets]);
      setIsSeriesEditMode(true);
    } else {
      setIsSeriesEditMode(false);
      // Order is maintained in state, no need to save separately for library sessions
    }
  };

  const [originalSeriesOrder, setOriginalSeriesOrder] = useState([]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // SortableSeriesCard Component
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

  const handleDragEndSeries = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const oldIndex = exerciseSets.findIndex(set => set.id === active.id);
    const newIndex = exerciseSets.findIndex(set => set.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1) return;
    
    const reorderedSets = arrayMove(exerciseSets, oldIndex, newIndex);
    
    // Update order in reordered sets
    const updatedSets = reorderedSets.map((set, index) => ({
      ...set,
      order: index
    }));
    
    setExerciseSets(updatedSets);
    
    if (!isCreatingExercise && currentExerciseId) {
      // Save order to database
      try {
        setIsUpdatingSeriesOrder(true);
        // Update each set's order
        for (let i = 0; i < updatedSets.length; i++) {
          await libraryService.updateSetInLibraryExercise(
            user.uid,
            sessionId,
            currentExerciseId,
            updatedSets[i].id,
            { order: i }
          );
        }
      } catch (err) {
        console.error('Error updating set order:', err);
        alert('Error al actualizar el orden. Por favor, intenta de nuevo.');
        // Revert on error
        setExerciseSets(originalSeriesOrder);
      } finally {
        setIsUpdatingSeriesOrder(false);
      }
    }
  };

  const canSaveCreatingExercise = () => {
    if (!isCreatingExercise || !exerciseDraft) return false;
    
    const hasPrimary = exerciseDraft.primary && 
      typeof exerciseDraft.primary === 'object' && 
      exerciseDraft.primary !== null &&
      Object.values(exerciseDraft.primary).length > 0 &&
      Object.values(exerciseDraft.primary)[0];
    
    const hasSets = exerciseSets.length > 0;
    
    return hasPrimary && hasSets;
  };

  const handleSaveCreatingExercise = async () => {
    if (!canSaveCreatingExercise() || !user || !sessionId) {
      return;
    }

    try {
      setIsCreatingNewExercise(true);
      
      const primaryValues = Object.values(exerciseDraft.primary);
      const primaryExerciseName = primaryValues[0];
      
      const newExercise = await libraryService.createExerciseInLibrarySession(
        user.uid,
        sessionId,
        primaryExerciseName
      );

      const updateData = {
        primary: exerciseDraft.primary,
        alternatives: exerciseDraft.alternatives || {},
        measures: exerciseDraft.measures || [],
        objectives: exerciseDraft.objectives || [],
        name: deleteField(),
        title: deleteField()
      };
      
      await libraryService.updateExerciseInLibrarySession(
        user.uid,
        sessionId,
        newExercise.id,
        updateData
      );

      // Create sets (filter out temporary sets)
      const tempSets = exerciseSets.filter(set => set.id && set.id.startsWith('temp-'));
      for (let i = 0; i < tempSets.length; i++) {
        const tempSet = tempSets[i];
        await libraryService.createSetInLibraryExercise(
          user.uid,
          sessionId,
          newExercise.id,
          i
        );
        
        const setsData = await libraryService.getSetsByLibraryExercise(
          user.uid,
          sessionId,
          newExercise.id
        );
        
        if (setsData.length > 0) {
          const createdSet = setsData[setsData.length - 1];
          const setUpdateData = {
            order: i,
            title: `Serie ${i + 1}`,
            reps: tempSet.reps || null,
            intensity: tempSet.intensity || null
          };
          
          await libraryService.updateSetInLibraryExercise(
            user.uid,
            sessionId,
            newExercise.id,
            createdSet.id,
            setUpdateData
          );
        }
      }

      // Reload exercises
      const sessionData = await libraryService.getLibrarySessionById(user.uid, sessionId);
      if (sessionData) {
        setExercises(sessionData.exercises || []);
      }

      // Close modal and reset
      handleCloseExerciseModal();
    } catch (err) {
      console.error('Error creating exercise:', err);
      alert('Error al crear el ejercicio. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingNewExercise(false);
    }
  };

  return (
    <DashboardLayout 
      screenName={getScreenName()}
      headerBackgroundImage={selectedSession?.image_url || null}
      onBack={null}
      showBackButton={true}
      backPath={getBackPath()}
    >
      <div className="program-detail-container">
        <div className="program-tab-content">
          {selectedSession ? (
            <div className="exercises-content">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 className="page-section-title">Ejercicios</h2>
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
                    onClick={() => setIsExerciseEditMode(!isExerciseEditMode)}
                  >
                    <span className="exercise-action-text">{isExerciseEditMode ? 'Guardar' : 'Editar'}</span>
                  </button>
                </div>
              </div>
              {renderExercises()}
            </div>
          ) : selectedModule ? (
            <div className="sessions-content">
              <h2 className="page-section-title">Sesiones</h2>
              {renderSessions()}
            </div>
          ) : (
            <div className="modules-content">
              <h2 className="page-section-title">Módulos</h2>
              {renderModules()}
            </div>
          )}
        </div>
      </div>

      {/* Exercise Modal - Full version with tabs */}
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
      >
        <div className="anuncios-modal-content">
          {/* Requirements Announcement - Always at top when creating */}
          {isCreatingExercise && !canSaveCreatingExercise() && (
            <div className="create-exercise-requirements-summary" style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)', borderRadius: '8px' }}>
              <p className="create-exercise-requirements-text">
                Para crear el ejercicio, necesitas:
                {(!exerciseDraft?.primary || Object.values(exerciseDraft.primary || {}).length === 0) && (
                  <span className="create-exercise-requirement-item"> • Ejercicio principal</span>
                )}
                {exerciseSets.length === 0 && (
                  <span className="create-exercise-requirement-item"> • Al menos una serie</span>
                )}
              </p>
            </div>
          )}
          <div className="anuncios-modal-body">
            {/* Left Side - Tab List */}
            <div className="anuncios-modal-left">
              <div className="anuncios-screens-list">
                <label className="anuncios-screens-label">Opciones</label>
                <div className="anuncios-screens-container">
                  <button
                    className={`anuncios-screen-item ${selectedExerciseTab === 'general' ? 'anuncios-screen-item-active' : ''}`}
                    onClick={() => setSelectedExerciseTab('general')}
                  >
                    <span className="anuncios-screen-name">General</span>
                  </button>
                  <button
                    className={`anuncios-screen-item ${selectedExerciseTab === 'series' ? 'anuncios-screen-item-active' : ''}`}
                    onClick={() => setSelectedExerciseTab('series')}
                  >
                    <span className="anuncios-screen-name">Series</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Side - Content Display */}
            <div className="anuncios-modal-right">
              {!selectedExercise ? (
                <div className="exercise-tab-content">
                  <div className="exercise-tab-empty">
                    <p>Cargando ejercicio...</p>
                  </div>
                </div>
              ) : selectedExerciseTab === 'general' ? (
                <div className="exercise-tab-content">
                  <div className="exercise-general-content">
                    {/* Primary Exercise */}
                    <div className="exercise-general-section">
                      <h4 className="exercise-general-subtitle">Ejercicio Principal</h4>
                      {getPrimaryExerciseName() ? (
                        <div className="exercise-horizontal-card">
                          <span className="exercise-horizontal-card-name">
                            {getPrimaryExerciseName()}
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
                        <button
                          className="create-exercise-select-button"
                          onClick={handleEditPrimary}
                        >
                          <span className="create-exercise-select-button-text">Seleccionar Ejercicio Principal</span>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 8.00012L4 16.0001V20.0001L8 20.0001L16 12.0001M12 8.00012L14.8686 5.13146L14.8704 5.12976C15.2652 4.73488 15.463 4.53709 15.691 4.46301C15.8919 4.39775 16.1082 4.39775 16.3091 4.46301C16.5369 4.53704 16.7345 4.7346 17.1288 5.12892L18.8686 6.86872C19.2646 7.26474 19.4627 7.46284 19.5369 7.69117C19.6022 7.89201 19.6021 8.10835 19.5369 8.3092C19.4628 8.53736 19.265 8.73516 18.8695 9.13061L18.8686 9.13146L16 12.0001M12 8.00012L16 12.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Alternatives */}
                    <div className="exercise-general-section">
                      <div className="exercise-general-subtitle-row">
                        <h4 className="exercise-general-subtitle">Alternativas</h4>
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
                        <p className="exercise-general-empty">No hay alternativas agregadas</p>
                      ) : (
                        <div className="exercise-alternatives-list">
                          {Object.entries(draftAlternatives).map(([libraryId, alternativesArray]) => (
                            <div key={libraryId} className="exercise-alternatives-group">
                              <h5 className="exercise-alternatives-library-title">
                                {libraryTitles[libraryId] || libraryId}
                              </h5>
                              {Array.isArray(alternativesArray) && alternativesArray.length > 0 ? (
                                <div className="exercise-horizontal-cards-list">
                                  {alternativesArray.map((alternativeName, index) => {
                                    const alternativeLabel = typeof alternativeName === 'string'
                                      ? alternativeName
                                      : alternativeName?.name || alternativeName?.title || `Alternativa ${index + 1}`;
                                    return (
                                      <div key={`${libraryId}-${index}`} className="exercise-horizontal-card">
                                        <span className="exercise-horizontal-card-name">
                                          {alternativeLabel}
                                        </span>
                                        {isAlternativesEditMode && (
                                          <button 
                                            className="exercise-horizontal-card-delete"
                                            onClick={() => handleDeleteAlternative(libraryId, index)}
                                          >
                                            <span className="exercise-horizontal-card-delete-icon">−</span>
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="exercise-general-empty">No hay alternativas para esta biblioteca</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Measures */}
                    <div className="exercise-general-section">
                      <div className="exercise-general-subtitle-row">
                        <h4 className="exercise-general-subtitle">Qué mide</h4>
                        <div className="exercise-general-actions-container">
                          {isMeasuresEditMode ? (
                            <div className="exercise-general-actions-dropdown">
                              <button 
                                className="exercise-general-action-button"
                                onClick={handleAddMeasure}
                              >
                                <span className="exercise-general-action-icon">+</span>
                              </button>
                              <button 
                                className="exercise-general-action-button exercise-general-action-button-save"
                                onClick={() => setIsMeasuresEditMode(false)}
                              >
                                <span className="exercise-general-action-text">Guardar</span>
                              </button>
                            </div>
                          ) : (
                            <button 
                              className="exercise-general-edit-button"
                              onClick={() => setIsMeasuresEditMode(true)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 8.00012L4 16.0001V20.0001L8 20.0001L16 12.0001M12 8.00012L14.8686 5.13146L14.8704 5.12976C15.2652 4.73488 15.463 4.53709 15.691 4.46301C15.8919 4.39775 16.1082 4.39775 16.3091 4.46301C16.5369 4.53704 16.7345 4.7346 17.1288 5.12892L18.8686 6.86872C19.2646 7.26474 19.4627 7.46284 19.5369 7.69117C19.6022 7.89201 19.6021 8.10835 19.5369 8.3092C19.4628 8.53736 19.265 8.73516 18.8695 9.13061L18.8686 9.13146L16 12.0001M12 8.00012L16 12.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      {draftMeasures.length === 0 ? (
                        <p className="exercise-general-empty">No hay medidas agregadas</p>
                      ) : (
                        <div className="exercise-horizontal-cards-list">
                          {draftMeasures.map((measure, index) => (
                            <div key={index} className="exercise-horizontal-card">
                              <span className="exercise-horizontal-card-name">
                                {getMeasureDisplayName(measure)}
                              </span>
                              {isMeasuresEditMode && (
                                <button 
                                  className="exercise-horizontal-card-delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteMeasure(index);
                                  }}
                                >
                                  <span className="exercise-horizontal-card-delete-icon">−</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Objectives */}
                    <div className="exercise-general-section">
                      <div className="exercise-general-subtitle-row">
                        <h4 className="exercise-general-subtitle">Objetivos</h4>
                        <div className="exercise-general-actions-container">
                          {isObjectivesEditMode ? (
                            <div className="exercise-general-actions-dropdown">
                              <button 
                                className="exercise-general-action-button"
                                onClick={handleAddObjective}
                              >
                                <span className="exercise-general-action-icon">+</span>
                              </button>
                              <button 
                                className="exercise-general-action-button exercise-general-action-button-save"
                                onClick={() => setIsObjectivesEditMode(false)}
                              >
                                <span className="exercise-general-action-text">Guardar</span>
                              </button>
                            </div>
                          ) : (
                            <button 
                              className="exercise-general-edit-button"
                              onClick={() => setIsObjectivesEditMode(true)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 8.00012L4 16.0001V20.0001L8 20.0001L16 12.0001M12 8.00012L14.8686 5.13146L14.8704 5.12976C15.2652 4.73488 15.463 4.53709 15.691 4.46301C15.8919 4.39775 16.1082 4.39775 16.3091 4.46301C16.5369 4.53704 16.7345 4.7346 17.1288 5.12892L18.8686 6.86872C19.2646 7.26474 19.4627 7.46284 19.5369 7.69117C19.6022 7.89201 19.6021 8.10835 19.5369 8.3092C19.4628 8.53736 19.265 8.73516 18.8695 9.13061L18.8686 9.13146L16 12.0001M12 8.00012L16 12.0001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      {draftObjectives.length === 0 ? (
                        <p className="exercise-general-empty">No hay objetivos agregados</p>
                      ) : (
                        <div className="exercise-horizontal-cards-list">
                          {draftObjectives.map((objective, index) => (
                            <div key={index} className="exercise-horizontal-card">
                              <span className="exercise-horizontal-card-name">
                                {getObjectiveDisplayName(typeof objective === 'string' ? objective : objective.name || objective.title || `Objetivo ${index + 1}`)}
                              </span>
                              {isObjectivesEditMode && (
                                <button 
                                  className="exercise-horizontal-card-delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteObjective(index);
                                  }}
                                >
                                  <span className="exercise-horizontal-card-delete-icon">−</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : selectedExerciseTab === 'series' ? (
                <div className="exercise-tab-content">
                  <div className="exercises-content">
                    <div className="exercises-actions">
                      <button 
                        className={`exercise-action-pill ${isSeriesEditMode ? 'exercise-action-pill-disabled' : ''}`}
                        onClick={handleCreateSet}
                        disabled={isSeriesEditMode || isCreatingSet}
                      >
                        <span className="exercise-action-icon">+</span>
                      </button>
                      {!isCreatingExercise && (
                        <button 
                          className="exercise-action-pill"
                          onClick={handleEditSeries}
                          disabled={isUpdatingSeriesOrder}
                        >
                          <span className="exercise-action-text">{isSeriesEditMode ? 'Guardar' : 'Editar'}</span>
                        </button>
                      )}
                      {isCreatingExercise && (
                        <button 
                          className="exercise-action-pill"
                          onClick={handleSaveCreatingExercise}
                          disabled={!canSaveCreatingExercise() || isCreatingNewExercise}
                        >
                          <span className="exercise-action-text">{isCreatingNewExercise ? 'Creando...' : 'Crear Ejercicio'}</span>
                        </button>
                      )}
                    </div>
                    
                    {exerciseSets.length === 0 ? (
                      <div className="exercises-empty">
                        <p>No hay series configuradas para este ejercicio.</p>
                      </div>
                    ) : (
                      <>
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
                                  const objectivesFields = draftObjectives.filter(obj => 
                                    ['reps', 'intensity'].includes(obj)
                                  );
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
                          <div className="exercises-list">
                            {exerciseSets.map((set, setIndex) => {
                              const isExpanded = expandedSeries[set.id] || false;
                              const objectivesFields = draftObjectives.filter(obj => 
                                ['reps', 'intensity'].includes(obj)
                              );
                              const setNumber = (set.order !== undefined && set.order !== null) ? set.order + 1 : setIndex + 1;
                              
                              return (
                                <div key={set.id} className="exercise-series-card">
                                  <button
                                    className="exercise-series-card-header"
                                    onClick={() => handleToggleSeriesExpansion(set.id)}
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
                                            handleDuplicateSet(set);
                                          }}
                                        >
                                          <span className="exercise-series-duplicate-icon">⧉</span>
                                        </button>
                                      )}
                                      {unsavedSetChanges[set.id] && (
                                        <button
                                          className="exercise-series-save-button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSaveSetChanges(set.id);
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
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Modal>

      {/* Measure Selection Modal */}
      <Modal
        isOpen={isMeasureSelectionModalOpen}
        onClose={() => {
          setIsMeasureSelectionModalOpen(false);
          setMeasureToEditIndex(null);
        }}
        title={measureToEditIndex !== null ? 'Editar Medida' : 'Agregar Medida'}
      >
        <div className="measure-selection-modal-content">
          <div className="measure-selection-list">
            <button
              className="measure-selection-item"
              onClick={() => handleSelectMeasure('reps')}
              disabled={measureToEditIndex === null && draftMeasures.includes('reps')}
            >
              <span className="measure-selection-item-name">Repeticiones</span>
            </button>
            <button
              className="measure-selection-item"
              onClick={() => handleSelectMeasure('weight')}
              disabled={measureToEditIndex === null && draftMeasures.includes('weight')}
            >
              <span className="measure-selection-item-name">Peso</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Objective Selection Modal */}
      <Modal
        isOpen={isObjectiveSelectionModalOpen}
        onClose={() => {
          setIsObjectiveSelectionModalOpen(false);
          setObjectiveToEditIndex(null);
        }}
        title={objectiveToEditIndex !== null ? 'Editar Objetivo' : 'Agregar Objetivo'}
      >
        <div className="measure-selection-modal-content">
          <div className="measure-selection-list">
            <button
              className="measure-selection-item"
              onClick={() => handleSelectObjective('reps')}
              disabled={objectiveToEditIndex === null && draftObjectives.includes('reps')}
            >
              <span className="measure-selection-item-name">Repeticiones</span>
            </button>
            <button
              className="measure-selection-item"
              onClick={() => handleSelectObjective('intensity')}
              disabled={objectiveToEditIndex === null && draftObjectives.includes('intensity')}
            >
              <span className="measure-selection-item-name">Intensidad</span>
            </button>
            <button
              className="measure-selection-item"
              onClick={() => handleSelectObjective('previous')}
              disabled={objectiveToEditIndex === null && draftObjectives.includes('previous')}
            >
              <span className="measure-selection-item-name">Anterior</span>
            </button>
          </div>
        </div>
      </Modal>

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
    </DashboardLayout>
  );
};

export default LibraryContentScreen;

