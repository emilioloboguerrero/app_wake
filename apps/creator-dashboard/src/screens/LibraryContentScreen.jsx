import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import MediaPickerModal from '../components/MediaPickerModal';
import Button from '../components/Button';
import Input from '../components/Input';
import MeasuresObjectivesEditorModal from '../components/MeasuresObjectivesEditorModal';
import libraryService from '../services/libraryService';
import measureObjectivePresetsService from '../services/measureObjectivePresetsService';
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

const getMeasureDisplayNameDefault = (measure) => {
  if (measure === 'reps') return 'Repeticiones';
  if (measure === 'weight') return 'Peso';
  return measure;
};

const getObjectiveDisplayNameDefault = (objective) => {
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

// Sortable Session Card Component
const SortableSessionCard = ({ session, isSessionEditMode, onSessionClick, onDeleteSession, sessionIndex }) => {
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
          {session.title || `Sesión ${session.id.slice(0, 8)}`}
        </h3>
      </div>
    </div>
  );
};

// Sortable Module Card Component
const SortableModuleCard = ({ module, isModuleEditMode, onModuleClick, onDeleteModule, moduleIndex }) => {
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
          {module.title || `Semana ${module.id.slice(0, 8)}`}
        </h3>
      </div>
      <div className="module-card-footer">
        <span className="module-card-count">
          {(module.sessionRefs || []).length} {(module.sessionRefs || []).length === 1 ? 'sesión' : 'sesiones'}
        </span>
      </div>
    </div>
  );
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
  
  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const [libraryModules, setLibraryModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [librarySessions, setLibrarySessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Module edit mode state
  const [isModuleEditMode, setIsModuleEditMode] = useState(false);
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [moduleName, setModuleName] = useState('');
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [moduleToDelete, setModuleToDelete] = useState(null);
  const [isDeleteModuleModalOpen, setIsDeleteModuleModalOpen] = useState(false);
  const [deleteModuleConfirmation, setDeleteModuleConfirmation] = useState('');
  const [isDeletingModule, setIsDeletingModule] = useState(false);
  const [isUpdatingModuleOrder, setIsUpdatingModuleOrder] = useState(false);
  const [originalModulesOrder, setOriginalModulesOrder] = useState([]);
  
  // Session edit mode state
  const [isSessionEditMode, setIsSessionEditMode] = useState(false);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isCopySessionModalOpen, setIsCopySessionModalOpen] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState(null);
  const [sessionName, setSessionName] = useState('');
  const [sessionImageFile, setSessionImageFile] = useState(null);
  const [sessionImagePreview, setSessionImagePreview] = useState(null);
  const [sessionImageUrlFromLibrary, setSessionImageUrlFromLibrary] = useState(null);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [mediaPickerContext, setMediaPickerContext] = useState('edit'); // 'edit' | 'header'
  const [isUploadingSessionImage, setIsUploadingSessionImage] = useState(false);
  const [sessionImageUploadProgress, setSessionImageUploadProgress] = useState(0);
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [isDeleteSessionModalOpen, setIsDeleteSessionModalOpen] = useState(false);
  const [deleteSessionConfirmation, setDeleteSessionConfirmation] = useState('');
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isUpdatingSessionOrder, setIsUpdatingSessionOrder] = useState(false);
  const [originalSessionsOrder, setOriginalSessionsOrder] = useState([]);
  const [availableLibrarySessions, setAvailableLibrarySessions] = useState([]);
  const [isLoadingLibrarySessions, setIsLoadingLibrarySessions] = useState(false);
  
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
  const [presetsList, setPresetsList] = useState([]);
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [isPresetSelectorOpen, setIsPresetSelectorOpen] = useState(false);
  const [isMeasuresObjectivesEditorOpen, setIsMeasuresObjectivesEditorOpen] = useState(false);
  const [editorModalMode, setEditorModalMode] = useState('exercise');
  const [presetBeingEditedId, setPresetBeingEditedId] = useState(null);
  const [appliedPresetId, setAppliedPresetId] = useState(null);
  const [dataEditMenuOpen, setDataEditMenuOpen] = useState(false);
  const dataEditMenuRef = useRef(null);
  const [isCreatingNewExercise, setIsCreatingNewExercise] = useState(false);
  const [numberOfSetsForNewExercise, setNumberOfSetsForNewExercise] = useState(3);
  const [newExerciseDefaultSetValues, setNewExerciseDefaultSetValues] = useState({});
  const [showPerSetCards, setShowPerSetCards] = useState(false);
  const [libraryDataCache, setLibraryDataCache] = useState({}); // Map: libraryId -> full library data
  const [libraryExerciseCompleteness, setLibraryExerciseCompleteness] = useState({}); // Map: libraryId::exerciseName -> boolean
  const libraryDataCacheRef = useRef(libraryDataCache);

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

  // Load library modules (only if no moduleId or sessionId)
  useEffect(() => {
    const loadModules = async () => {
      if (!user || moduleId || sessionId) return;
      
      try {
        setLoading(true);
        const modules = await libraryService.getModuleLibrary(user.uid);
        // Sort modules by order field
        const sortedModules = modules.sort((a, b) => {
          const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
          const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
          return orderA - orderB;
        });
        setLibraryModules(sortedModules);
      } catch (err) {
        console.error('Error loading library modules:', err);
        setError('Error al cargar las semanas');
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

  // Load library sessions when modal opens
  useEffect(() => {
    if (isCopySessionModalOpen && selectedModule) {
      loadLibrarySessions();
    }
  }, [isCopySessionModalOpen, selectedModule]);

  const handleModuleClick = (module) => {
    if (isModuleEditMode) return;
    const currentTab = searchParams.get('tab') || 'modules';
    navigate(`/library/content/modules/${module.id}?tab=${currentTab}`);
  };

  // Module management handlers
  const handleAddModule = () => {
    setIsModuleModalOpen(true);
    setModuleName('');
  };

  const handleCloseModuleModal = () => {
    setIsModuleModalOpen(false);
    setModuleName('');
  };

  const handleCreateModule = async () => {
    if (!moduleName.trim() || !user) {
      return;
    }

    try {
      setIsCreatingModule(true);
      
      // Calculate new order
      const maxOrder = libraryModules.length > 0 
        ? Math.max(...libraryModules.map(m => (m.order !== undefined && m.order !== null) ? m.order : -1))
        : -1;
      const newOrder = maxOrder + 1;
      
      await libraryService.createLibraryModule(user.uid, {
        title: moduleName.trim(),
        sessionRefs: [],
        order: newOrder
      });
      
      // Reload modules
      const modules = await libraryService.getModuleLibrary(user.uid);
      // Sort modules by order field
      const sortedModules = modules.sort((a, b) => {
        const orderA = a.order !== undefined && a.order !== null ? a.order : Infinity;
        const orderB = b.order !== undefined && b.order !== null ? b.order : Infinity;
        return orderA - orderB;
      });
      setLibraryModules(sortedModules);
      
      // Close modal
      handleCloseModuleModal();
    } catch (err) {
      console.error('Error creating module:', err);
      alert('Error al crear la semana. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingModule(false);
    }
  };

  const handleEditModules = async () => {
    if (!isModuleEditMode) {
      // Entering edit mode: store original order
      setOriginalModulesOrder([...libraryModules]);
      setIsModuleEditMode(true);
    } else {
      // Exiting edit mode: save order
      await handleSaveModuleOrder();
    }
  };

  const handleSaveModuleOrder = async () => {
    if (!user) return;

    try {
      setIsUpdatingModuleOrder(true);
      
      // Update each module's order
      await Promise.all(
        libraryModules.map((module, index) => 
          libraryService.updateLibraryModule(user.uid, module.id, { order: index })
        )
      );
      
      setIsModuleEditMode(false);
      setOriginalModulesOrder([]);
      
      // Reload modules to get updated order
      const modules = await libraryService.getModuleLibrary(user.uid);
      setLibraryModules(modules);
    } catch (err) {
      console.error('Error updating module order:', err);
      // Revert to original order on error
      if (originalModulesOrder.length > 0) {
        setLibraryModules([...originalModulesOrder]);
      }
      alert('Error al actualizar el orden de las semanas. Por favor, intenta de nuevo.');
    } finally {
      setIsUpdatingModuleOrder(false);
    }
  };

  const handleDragEndModules = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = libraryModules.findIndex((module) => module.id === active.id);
    const newIndex = libraryModules.findIndex((module) => module.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Only update local state - don't save to Firestore yet
    const newModules = arrayMove(libraryModules, oldIndex, newIndex);
    setLibraryModules(newModules);
  };

  const handleDeleteModule = async (module) => {
    if (!user) return;
    
    try {
      const usageCheck = await libraryService.checkLibraryModuleUsage(user.uid, module.id);
      
      if (usageCheck.inUse) {
        alert(
          `⚠️ No se puede eliminar esta semana de la biblioteca.\n\n` +
          `Está siendo usada en ${usageCheck.count} programa(s).\n\n` +
          `Primero debes eliminar o reemplazar todas las referencias en los programas.`
        );
        return;
      }
      
      setModuleToDelete(module);
      setIsDeleteModuleModalOpen(true);
      setDeleteModuleConfirmation('');
    } catch (error) {
      console.error('Error checking module usage:', error);
      // Continue with delete attempt anyway
      setModuleToDelete(module);
      setIsDeleteModuleModalOpen(true);
      setDeleteModuleConfirmation('');
    }
  };

  const handleCloseDeleteModuleModal = () => {
    setIsDeleteModuleModalOpen(false);
    setModuleToDelete(null);
    setDeleteModuleConfirmation('');
  };

  const handleConfirmDeleteModule = async () => {
    if (!moduleToDelete || !deleteModuleConfirmation.trim() || !user) {
      return;
    }

    // Verify the confirmation matches the module title
    const moduleTitle = moduleToDelete.title || `Semana ${moduleToDelete.id?.slice(0, 8) || ''}`;
    if (deleteModuleConfirmation.trim() !== moduleTitle) {
      return;
    }

    try {
      setIsDeletingModule(true);
      
      await libraryService.deleteLibraryModule(user.uid, moduleToDelete.id);
      
      // Reload modules
      const modules = await libraryService.getModuleLibrary(user.uid);
      setLibraryModules(modules);
      
      // If the deleted module was selected, go back to modules list
      if (selectedModule && selectedModule.id === moduleToDelete.id) {
        setSelectedModule(null);
        setLibrarySessions([]);
        navigate('/library/content?tab=modules');
      }
      
      // Close modal and exit edit mode if no modules left
      handleCloseDeleteModuleModal();
      if (modules.length === 0) {
        setIsModuleEditMode(false);
      }
    } catch (err) {
      console.error('Error deleting module:', err);
      alert('Error al eliminar la semana. Por favor, intenta de nuevo.');
    } finally {
      setIsDeletingModule(false);
    }
  };

  const handleBackToModules = () => {
    navigate('/library/content');
    setSelectedModule(null);
    setLibrarySessions([]);
    setSelectedSession(null);
    setExercises([]);
  };

  const handleSessionClick = (session) => {
    if (isSessionEditMode) return;
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

  // Session management handlers
  const handleAddSession = () => {
    setIsCopySessionModalOpen(true);
    loadLibrarySessions();
  };

  const handleCloseCopySessionModal = () => {
    setIsCopySessionModalOpen(false);
    setAvailableLibrarySessions([]);
  };

  const handleEditSessionClick = () => {
    if (!selectedSession || !user) return;
    setSessionToEdit(selectedSession);
    setSessionName(selectedSession.title || '');
    setSessionImagePreview(selectedSession.image_url || null);
    setSessionImageFile(null);
    setSessionImageUrlFromLibrary(null);
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
  };

  const handleMediaPickerSelect = async (item) => {
    if (mediaPickerContext === 'header' && selectedSession && user) {
      try {
        await libraryService.updateLibrarySession(user.uid, selectedSession.id, { image_url: item.url });
        setSelectedSession(prev => (prev ? { ...prev, image_url: item.url } : null));
      } catch (err) {
        console.error('Error updating session image:', err);
        alert('Error al actualizar la imagen.');
      }
      setIsMediaPickerOpen(false);
      return;
    }
    setSessionImagePreview(item.url);
    setSessionImageFile(null);
    setSessionImageUrlFromLibrary(item.url);
    setIsMediaPickerOpen(false);
  };

  const handleUpdateSession = async () => {
    if (!sessionName.trim() || !user || !selectedSession || !sessionToEdit) {
      return;
    }

    try {
      setIsUpdatingSession(true);
      
      let imageUrl = sessionImageUrlFromLibrary ?? selectedSession.image_url ?? null;
      
      if (sessionImageFile && sessionImageFile instanceof File) {
        setIsUploadingSessionImage(true);
        setSessionImageUploadProgress(0);
        try {
          imageUrl = await libraryService.uploadLibrarySessionImage(
            user.uid,
            selectedSession.id,
            sessionImageFile,
            (progress) => setSessionImageUploadProgress(Math.round(progress))
          );
        } catch (uploadError) {
          console.error('Error uploading session image:', uploadError);
          alert(`Error al subir la imagen: ${uploadError.message || 'Por favor, intenta de nuevo.'}`);
          setIsUpdatingSession(false);
          setIsUploadingSessionImage(false);
          return;
        } finally {
          setIsUploadingSessionImage(false);
          setSessionImageUploadProgress(0);
        }
      } else if (!sessionImagePreview && selectedSession.image_url) {
        imageUrl = null;
      }
      
      await libraryService.updateLibrarySession(user.uid, selectedSession.id, {
        title: sessionName.trim(),
        image_url: imageUrl
      });
      
      // Update local state
      const updatedSession = {
        ...selectedSession,
        title: sessionName.trim(),
        image_url: imageUrl
      };
      setSelectedSession(updatedSession);
      
      // Update in sessions list if we're viewing sessions
      if (selectedModule) {
        const sessions = await libraryService.getLibraryModuleSessions(user.uid, selectedModule.id);
        setLibrarySessions(sessions);
      }
      
      // Close modal
      handleCloseSessionModal();
    } catch (err) {
      console.error('Error updating session:', err);
      console.error('Update error details:', {
        message: err.message,
        code: err.code,
        stack: err.stack
      });
      alert(`Error al actualizar la sesión: ${err.message || 'Por favor, intenta de nuevo.'}`);
    } finally {
      setIsUpdatingSession(false);
      setIsUploadingSessionImage(false);
      setSessionImageUploadProgress(0);
    }
  };

  const handleCloseSessionModal = () => {
    setIsSessionModalOpen(false);
    setSessionToEdit(null);
    setSessionName('');
    setSessionImageFile(null);
    setSessionImagePreview(null);
    setIsUploadingSessionImage(false);
    setSessionImageUploadProgress(0);
  };

  const loadLibrarySessions = async () => {
    if (!user) return;
    
    try {
      setIsLoadingLibrarySessions(true);
      const sessions = await libraryService.getSessionLibrary(user.uid);
      // Filter out sessions already in the module
      const moduleSessionIds = (selectedModule?.sessionRefs || []).map(ref => typeof ref === 'string' ? ref : ref.id || ref);
      const availableSessions = sessions.filter(session => !moduleSessionIds.includes(session.id));
      setAvailableLibrarySessions(availableSessions);
    } catch (err) {
      console.error('Error loading library sessions:', err);
      alert('Error al cargar las sesiones de la biblioteca');
    } finally {
      setIsLoadingLibrarySessions(false);
    }
  };

  const handleSelectLibrarySession = async (librarySessionId) => {
    if (!user || !selectedModule || !librarySessionId) return;
    
    try {
      setIsCreatingSession(true);
      await libraryService.addSessionToLibraryModule(user.uid, selectedModule.id, librarySessionId);
      
      // Reload sessions
      const sessions = await libraryService.getLibraryModuleSessions(user.uid, selectedModule.id);
      setLibrarySessions(sessions);
      
      handleCloseCopySessionModal();
    } catch (err) {
      console.error('Error adding session to module:', err);
      alert('Error al agregar la sesión. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleEditSessions = async () => {
    if (!isSessionEditMode) {
      // Entering edit mode: store original order
      setOriginalSessionsOrder([...librarySessions]);
      setIsSessionEditMode(true);
    } else {
      // Exiting edit mode: save order
      await handleSaveSessionOrder();
    }
  };

  const handleSaveSessionOrder = async () => {
    if (!user || !selectedModule) return;

    try {
      setIsUpdatingSessionOrder(true);
      const sessionIds = librarySessions.map(session => session.id);
      
      // Update order in database
      await libraryService.updateLibraryModuleSessionOrder(user.uid, selectedModule.id, sessionIds);
      
      setIsSessionEditMode(false);
      setOriginalSessionsOrder([]);
      
      // Reload sessions
      const sessions = await libraryService.getLibraryModuleSessions(user.uid, selectedModule.id);
      setLibrarySessions(sessions);
    } catch (err) {
      console.error('Error updating session order:', err);
      // Revert to original order on error
      if (originalSessionsOrder.length > 0) {
        setLibrarySessions([...originalSessionsOrder]);
      }
      alert('Error al actualizar el orden de las sesiones. Por favor, intenta de nuevo.');
    } finally {
      setIsUpdatingSessionOrder(false);
    }
  };

  const handleDragEndSessions = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = librarySessions.findIndex((session) => session.id === active.id);
    const newIndex = librarySessions.findIndex((session) => session.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Only update local state - don't save to Firestore yet
    const newSessions = arrayMove(librarySessions, oldIndex, newIndex);
    setLibrarySessions(newSessions);
  };

  const handleDeleteSession = async (session) => {
    if (!user || !selectedModule) return;
    
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
    if (!sessionToDelete || !deleteSessionConfirmation.trim() || !user || !selectedModule) {
      return;
    }

    // Verify the confirmation matches the session title
    const sessionTitle = sessionToDelete.title || `Sesión ${sessionToDelete.id?.slice(0, 8) || ''}`;
    if (deleteSessionConfirmation.trim() !== sessionTitle) {
      return;
    }

    try {
      setIsDeletingSession(true);
      
      // Remove session from module
      await libraryService.removeSessionFromLibraryModule(user.uid, selectedModule.id, sessionToDelete.id);
      
      // Reload sessions
      const sessions = await libraryService.getLibraryModuleSessions(user.uid, selectedModule.id);
      setLibrarySessions(sessions);
      
      // If the deleted session was selected, go back to sessions list
      if (selectedSession && selectedSession.id === sessionToDelete.id) {
        setSelectedSession(null);
        setExercises([]);
      }
      
      // Close modal and exit edit mode if no sessions left
      handleCloseDeleteSessionModal();
      if (sessions.length === 0) {
        setIsSessionEditMode(false);
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      alert('Error al eliminar la sesión. Por favor, intenta de nuevo.');
    } finally {
      setIsDeletingSession(false);
    }
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
          <p>Cargando semanas...</p>
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
          <p>No tienes semanas aún. Crea una nueva semana para comenzar.</p>
        </div>
      );
    }

    if (isModuleEditMode) {
      return (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEndModules}
        >
          <SortableContext
            items={libraryModules.map(m => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="modules-list">
              {libraryModules.map((module, index) => (
                <SortableModuleCard
                  key={module.id}
                  module={module}
                  moduleIndex={index}
                  isModuleEditMode={isModuleEditMode}
                  onModuleClick={handleModuleClick}
                  onDeleteModule={handleDeleteModule}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      );
    }

    return (
      <div className="modules-list">
        {libraryModules.map((module, index) => (
          <SortableModuleCard
            key={module.id}
            module={module}
            moduleIndex={index}
            isModuleEditMode={isModuleEditMode}
            onModuleClick={handleModuleClick}
            onDeleteModule={handleDeleteModule}
          />
        ))}
      </div>
    );
  };

  // Render module actions
  const renderModuleActions = () => {
    if (moduleId || sessionId) return null; // Don't show actions when viewing a specific module/session
    
    return (
      <div className="modules-actions">
        <button 
          className={`module-action-pill ${isModuleEditMode ? 'module-action-pill-disabled' : ''}`}
          onClick={handleAddModule}
          disabled={isModuleEditMode}
        >
          <span className="module-action-icon">+</span>
        </button>
        <button 
          className="module-action-pill"
          onClick={handleEditModules}
          disabled={isUpdatingModuleOrder}
        >
          <span className="module-action-text">{isModuleEditMode ? 'Guardar' : 'Editar'}</span>
        </button>
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
          <p>No hay sesiones aún en esta semana.</p>
        </div>
      );
    }

    if (isSessionEditMode) {
      return (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEndSessions}
        >
          <SortableContext
            items={librarySessions.map(s => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="sessions-list">
              {librarySessions.map((session, index) => (
                <SortableSessionCard
                  key={session.id}
                  session={session}
                  sessionIndex={index}
                  isSessionEditMode={isSessionEditMode}
                  onSessionClick={handleSessionClick}
                  onDeleteSession={handleDeleteSession}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      );
    }

    return (
      <div className="sessions-list">
        {librarySessions.map((session, index) => (
          <SortableSessionCard
            key={session.id}
            session={session}
            sessionIndex={index}
            isSessionEditMode={isSessionEditMode}
            onSessionClick={handleSessionClick}
            onDeleteSession={handleDeleteSession}
          />
        ))}
      </div>
    );
  };

  // Render session actions
  const renderSessionActions = () => {
    if (!selectedModule) return null; // Only show when viewing a module
    
    return (
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
          disabled={isUpdatingSessionOrder}
        >
          <span className="session-action-text">{isSessionEditMode ? 'Guardar' : 'Editar'}</span>
        </button>
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
              onClick={() => {
                if (!isExerciseEditMode) {
                  handleExerciseClick(exercise);
                }
              }}
              style={{ cursor: isExerciseEditMode ? 'default' : 'pointer' }}
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

  // Helper to check if library exercise is incomplete
  const isLibraryExerciseIncomplete = (libraryId, exerciseName) => {
    if (!libraryId || !exerciseName) {
      return false;
    }
    const key = getLibraryExerciseKey(libraryId, exerciseName);
    return libraryExerciseCompleteness[key] === false;
  };

  // Update refs when state changes
  useEffect(() => {
    libraryDataCacheRef.current = libraryDataCache;
  }, [libraryDataCache]);

  // Handle clicking on an existing exercise to open modal
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
      };

      setSelectedExercise(normalizedExercise);
      setExerciseDraft(JSON.parse(JSON.stringify(normalizedExercise)));
      setSelectedExerciseTab('general');
      setIsExerciseModalOpen(true);
      setIsCreatingExercise(false);
      
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
      if (user && sessionId && exercise.id) {
        const setsData = await libraryService.getSetsByLibraryExercise(
          user.uid,
          sessionId,
          exercise.id
        );
        setExerciseSets(setsData);
        setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
        setUnsavedSetChanges({});
        setNumberOfSetsForNewExercise(setsData.length > 0 ? setsData.length : 3);
        if (setsData.length > 0 && setsData[0]) {
          const first = setsData[0];
          setNewExerciseDefaultSetValues(prev => ({
            ...prev,
            reps: first.reps != null && first.reps !== '' ? first.reps : '',
            intensity: first.intensity != null && first.intensity !== '' ? first.intensity : ''
          }));
        }
      } else {
        setExerciseSets([]);
        setOriginalExerciseSets([]);
        setUnsavedSetChanges({});
      }
      
      // Reset edit modes
      setIsAlternativesEditMode(false);
      setAppliedPresetId(null);
      setIsPresetSelectorOpen(false);
      setIsMeasuresObjectivesEditorOpen(false);
      setExpandedSeries({});
    } catch (error) {
      console.error('Error opening exercise modal:', error);
      alert('Error al abrir el ejercicio. Por favor, intenta de nuevo.');
    }
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
  const draftCustomMeasureLabels = activeExerciseForModal?.customMeasureLabels && typeof activeExerciseForModal.customMeasureLabels === 'object'
    ? activeExerciseForModal.customMeasureLabels
    : {};
  const draftCustomObjectiveLabels = activeExerciseForModal?.customObjectiveLabels && typeof activeExerciseForModal.customObjectiveLabels === 'object'
    ? activeExerciseForModal.customObjectiveLabels
    : {};
  const getMeasureDisplayName = (m) => draftCustomMeasureLabels[m] || getMeasureDisplayNameDefault(m);
  const getObjectiveDisplayName = (o) => draftCustomObjectiveLabels[o] || getObjectiveDisplayNameDefault(o);
  
  const generateCustomId = () => 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  
  const handleAddCustomMeasure = async () => {
    const label = (customMeasureNameInput || '').trim();
    if (!label) return;
    const id = generateCustomId();
    const updatedMeasures = [...draftMeasures, id];
    const updatedCustomMeasureLabels = { ...draftCustomMeasureLabels, [id]: label };
    setCustomMeasureNameInput('');
    if (isCreatingExercise) {
      setExerciseDraft(prev => ({ ...prev, measures: updatedMeasures, customMeasureLabels: updatedCustomMeasureLabels }));
      setSelectedExercise(prev => prev ? { ...prev, measures: updatedMeasures, customMeasureLabels: updatedCustomMeasureLabels } : null);
      return;
    }
    if (!currentExerciseId || !user || !sessionId) return;
    try {
      await libraryService.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, { measures: updatedMeasures, customMeasureLabels: updatedCustomMeasureLabels });
      setExerciseDraft(prev => ({ ...prev, measures: updatedMeasures, customMeasureLabels: updatedCustomMeasureLabels }));
      setSelectedExercise(prev => prev ? { ...prev, measures: updatedMeasures, customMeasureLabels: updatedCustomMeasureLabels } : null);
    } catch (err) {
      console.error('Error adding custom measure:', err);
      alert('Error al agregar la medida. Por favor, intenta de nuevo.');
    }
  };
  
  const handleAddCustomObjective = async () => {
    const label = (customObjectiveNameInput || '').trim();
    if (!label) return;
    const id = generateCustomId();
    const updatedObjectives = [...draftObjectives, id];
    const updatedCustomObjectiveLabels = { ...draftCustomObjectiveLabels, [id]: label };
    setCustomObjectiveNameInput('');
    if (isCreatingExercise) {
      setExerciseDraft(prev => ({ ...prev, objectives: updatedObjectives, customObjectiveLabels: updatedCustomObjectiveLabels }));
      setSelectedExercise(prev => prev ? { ...prev, objectives: updatedObjectives, customObjectiveLabels: updatedCustomObjectiveLabels } : null);
      return;
    }
    if (!currentExerciseId || !user || !sessionId) return;
    try {
      await libraryService.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, { objectives: updatedObjectives, customObjectiveLabels: updatedCustomObjectiveLabels });
      setExerciseDraft(prev => ({ ...prev, objectives: updatedObjectives, customObjectiveLabels: updatedCustomObjectiveLabels }));
      setSelectedExercise(prev => prev ? { ...prev, objectives: updatedObjectives, customObjectiveLabels: updatedCustomObjectiveLabels } : null);
    } catch (err) {
      console.error('Error adding custom objective:', err);
      alert('Error al agregar el objetivo. Por favor, intenta de nuevo.');
    }
  };
  
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
    if (isCreatingExercise && canSaveCreatingExercise()) {
      if (window.confirm('¿Guardar ejercicio antes de cerrar?')) {
        handleSaveCreatingExercise();
        return;
      }
    }
    setIsExerciseModalOpen(false);
    setIsCreatingExercise(false);
    setSelectedExercise(null);
    setExerciseDraft(null);
    setExerciseSets([]);
    setOriginalExerciseSets([]);
    setUnsavedSetChanges({});
    setNumberOfSetsForNewExercise(3);
    setNewExerciseDefaultSetValues({});
    setShowPerSetCards(false);
    setSelectedExerciseTab('general');
    setIsAlternativesEditMode(false);
    setIsMeasuresEditMode(false);
    setIsObjectivesEditMode(false);
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

    const exerciseId = currentExerciseId;
    if (!isCreatingExercise && (!exerciseId || !user || !sessionId)) {
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
        } else {
          // Editing existing exercise - save to database
          await libraryService.updateExerciseInLibrarySession(
            user.uid,
            sessionId,
            exerciseId,
            { primary: primaryUpdate }
          );
          
          // Update local state
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
        } else {
          // Editing existing exercise - save to database
          await libraryService.updateExerciseInLibrarySession(
            user.uid,
            sessionId,
            exerciseId,
            { alternatives: currentAlternatives }
          );
          
          // Update local state
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
          } else {
            // Editing existing exercise - save to database
            await libraryService.updateExerciseInLibrarySession(
              user.uid,
              sessionId,
              exerciseId,
              { alternatives: currentAlternatives }
            );
            
            // Update local state
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

  const handleDeleteAlternative = async (libraryId, index) => {
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
      } else {
        // Editing existing exercise - save to database
        if (!currentExerciseId || !user || !sessionId) return;
        
        try {
          await libraryService.updateExerciseInLibrarySession(
            user.uid,
            sessionId,
            currentExerciseId,
            { alternatives: currentAlternatives }
          );
          
          // Update local state
          setExerciseDraft(prev => ({
            ...prev,
            alternatives: currentAlternatives
          }));
          setSelectedExercise(prev => ({
            ...prev,
            alternatives: currentAlternatives
          }));
        } catch (err) {
          console.error('Error deleting alternative:', err);
          alert('Error al eliminar la alternativa. Por favor, intenta de nuevo.');
        }
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

  const applyPresetToExercise = async (preset) => {
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
    if (!currentExerciseId || !user || !sessionId) return;
    try {
      await libraryService.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates);
      const sessionData = await libraryService.getLibrarySessionById(user.uid, sessionId);
      const updatedEx = sessionData.exercises?.find((ex) => ex.id === currentExerciseId);
      if (updatedEx) {
        setSelectedExercise(updatedEx);
        setExerciseDraft(JSON.parse(JSON.stringify(updatedEx)));
      }
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
    if (editorModalMode === 'create_preset' && data.name) {
      try {
        const { id } = await measureObjectivePresetsService.create(user.uid, { name: data.name, ...updates });
        setPresetsList((prev) => [...prev, { id, name: data.name, ...updates }]);
        setAppliedPresetId(null);
        applyPresetToExercise({ id, name: data.name, ...updates });
      } catch (err) {
        console.error('Error creating preset:', err);
        alert('Error al crear la plantilla. Por favor, intenta de nuevo.');
        return;
      }
    } else if (editorModalMode === 'edit_preset' && presetBeingEditedId && data.name) {
      try {
        await measureObjectivePresetsService.update(user.uid, presetBeingEditedId, { name: data.name, ...updates });
        setPresetsList((prev) => prev.map((p) => (p.id === presetBeingEditedId ? { ...p, name: data.name, ...updates } : p)));
        if (appliedPresetId === presetBeingEditedId) {
          setExerciseDraft((prev) => ({ ...prev, ...updates }));
          setSelectedExercise((prev) => (prev ? { ...prev, ...updates } : null));
          if (!isCreatingExercise && currentExerciseId && user && sessionId) {
            await libraryService.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates);
          }
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
      } else if (currentExerciseId && user && sessionId) {
        try {
          await libraryService.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates);
          const sessionData = await libraryService.getLibrarySessionById(user.uid, sessionId);
          const updatedEx = sessionData.exercises?.find((ex) => ex.id === currentExerciseId);
          if (updatedEx) {
            setSelectedExercise(updatedEx);
            setExerciseDraft(JSON.parse(JSON.stringify(updatedEx)));
          }
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
    if (!isCreatingExercise && currentExerciseId && user && sessionId) {
      libraryService.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates).catch((err) => console.error('Error updating exercise:', err));
    }
  };

  // Set handlers
  const handleCreateSet = async () => {
    if (!user || !sessionId) return;
    
    // If creating exercise, we don't need currentExerciseId (it will be null)
    // If editing existing exercise, we need currentExerciseId
    if (!isCreatingExercise && !currentExerciseId) return;
    
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
        if (!currentExerciseId) {
          console.error('Cannot create set: currentExerciseId is required for existing exercise');
          return;
        }
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
    // Check if set exists
    const set = exerciseSets[setIndex];
    if (!set || !set.id) {
      console.error('Set not found or missing ID');
      return;
    }

    let processedValue = value;

    // For intensity field, validate and restrict to 1-10
    if (field === 'intensity') {
      // Remove any non-numeric characters
      const numericValue = value.replace(/[^0-9]/g, '');
      
      // If empty, allow it
      if (numericValue === '') {
        processedValue = '';
      } else {
        // Parse and clamp to 1-10
        const numValue = parseInt(numericValue, 10);
        if (numValue < 1) {
          processedValue = '1';
        } else if (numValue > 10) {
          processedValue = '10';
        } else {
          processedValue = String(numValue);
        }
      }
    } else if (field === 'reps') {
      // For reps field, only allow numbers and "-", format to "x-y"
      processedValue = formatRepsValue(value);
    }

    // Update local state only (not DB)
    const updatedSets = [...exerciseSets];
    const originalSet = originalExerciseSets.find(s => s.id === set.id);
    
    // For intensity, store as "x/10" format in local state
    let valueToStore = processedValue === '' ? null : processedValue;
    if (field === 'intensity' && processedValue !== '') {
      valueToStore = `${processedValue}/10`;
    }
    
    updatedSets[setIndex] = {
      ...updatedSets[setIndex],
      [field]: valueToStore
    };
    setExerciseSets(updatedSets);
    
    // Check all fields for this set to determine if it has any unsaved changes
    let setHasChanges = false;
    if (originalSet) {
      for (const checkField of ['reps', 'intensity']) {
        const current = updatedSets[setIndex][checkField];
        const original = originalSet[checkField];
        // Normalize comparison (handle null/undefined/empty string)
        // For intensity, both should be in "x/10" format, so compare as strings
        const currentNormalized = current === null || current === undefined || current === '' ? null : String(current);
        const originalNormalized = original === null || original === undefined || original === '' ? null : String(original);
        if (currentNormalized !== originalNormalized) {
          setHasChanges = true;
          break;
        }
      }
    } else {
      // If no original set, always mark as having changes
      setHasChanges = true;
    }
    
    setUnsavedSetChanges(prev => ({
      ...prev,
      [set.id]: setHasChanges
    }));
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
    if (isCreatingExercise && exerciseSets.length === 0 && (numberOfSetsForNewExercise || 0) >= 1) {
      const fields = (draftObjectives.filter(o => o !== 'previous').length) ? draftObjectives.filter(o => o !== 'previous') : ['reps', 'intensity'];
      const defaultSet = { [field]: stored };
      fields.forEach(o => {
        if (o !== field) {
          const v = newExerciseDefaultSetValues[o];
          defaultSet[o] = v != null && v !== '' ? v : null;
        }
      });
      const count = Math.max(1, Math.min(20, Math.floor(numberOfSetsForNewExercise) || 1));
      const newSets = Array.from({ length: count }, (_, i) => ({
        id: `temp-${Date.now()}-${i}-${Math.random()}`,
        order: i,
        title: `Serie ${i + 1}`,
        ...defaultSet
      }));
      setExerciseSets(newSets);
      const unsaved = {};
      newSets.forEach(s => { unsaved[s.id] = false; });
      setUnsavedSetChanges(unsaved);
      return;
    }
    if (exerciseSets.length >= 1) {
      const valueToStore = stored;
      if (isCreatingExercise) {
        setExerciseSets(prev => prev.map(s => ({ ...s, [field]: valueToStore })));
      } else {
        const displayVal = field === 'intensity' && processed ? processed : (processed === '' ? '' : processed);
        handleUpdateAllSetsValue(field, displayVal);
      }
    }
  };

  const syncSetsCountToNumber = (count) => {
    const target = Math.max(1, Math.min(20, Math.floor(count) || 1));
    const fields = (draftObjectives.filter(o => o !== 'previous').length) ? draftObjectives.filter(o => o !== 'previous') : ['reps', 'intensity'];
    const defaultSet = {};
    fields.forEach(o => {
      const v = newExerciseDefaultSetValues[o];
      defaultSet[o] = v != null && v !== '' ? v : null;
    });
    if (isCreatingExercise) {
      const newSets = Array.from({ length: target }, (_, i) => ({
        id: `temp-${Date.now()}-${i}-${Math.random()}`,
        order: i,
        title: `Serie ${i + 1}`,
        ...defaultSet
      }));
      setExerciseSets(newSets);
      const unsaved = {};
      newSets.forEach(s => { unsaved[s.id] = false; });
      setUnsavedSetChanges(unsaved);
      setNumberOfSetsForNewExercise(target);
      return;
    }
    const current = exerciseSets.length;
    if (target === current) return;
    if (target > current) {
      setNumberOfSetsForNewExercise(target);
      (async () => {
        for (let i = 0; i < target - current; i++) await handleCreateSet();
        const data = await libraryService.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
        const defaultReps = newExerciseDefaultSetValues.reps != null && newExerciseDefaultSetValues.reps !== '' ? newExerciseDefaultSetValues.reps : null;
        const defaultIntensity = newExerciseDefaultSetValues.intensity != null && newExerciseDefaultSetValues.intensity !== '' ? newExerciseDefaultSetValues.intensity : null;
        if (defaultReps !== null || defaultIntensity !== null) {
          for (const set of data) {
            await libraryService.updateSetInLibraryExercise(user.uid, sessionId, currentExerciseId, set.id, {
              reps: defaultReps ?? set.reps,
              intensity: defaultIntensity ?? set.intensity
            });
          }
        }
        const updated = await libraryService.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
        setExerciseSets(updated);
        setOriginalExerciseSets(JSON.parse(JSON.stringify(updated)));
        setUnsavedSetChanges({});
      })();
    } else {
      if (!window.confirm(`Se eliminarán ${current - target} serie(s). ¿Continuar?`)) return;
      setNumberOfSetsForNewExercise(target);
      const toRemove = exerciseSets.slice(-(current - target));
      (async () => {
        for (const s of toRemove) await handleDeleteSet(s, { skipConfirm: true });
      })();
    }
  };

  const handleApplyDefaultToNewExerciseSets = () => {
    const fields = (draftObjectives.filter(o => o !== 'previous').length)
      ? draftObjectives.filter(o => o !== 'previous')
      : ['reps', 'intensity'];
    const defaultSet = {};
    fields.forEach(o => {
      const v = newExerciseDefaultSetValues[o];
      defaultSet[o] = v != null && v !== '' ? v : null;
    });
    const count = Math.max(1, Math.min(20, Math.floor(numberOfSetsForNewExercise) || 1));
    const newSets = Array.from({ length: count }, (_, i) => ({
      id: `temp-${Date.now()}-${i}-${Math.random()}`,
      order: i,
      title: `Serie ${i + 1}`,
      ...defaultSet
    }));
    setExerciseSets(newSets);
    const unsaved = {};
    newSets.forEach(s => { unsaved[s.id] = false; });
    setUnsavedSetChanges(unsaved);
  };

  const handleUpdateAllSetsValue = (objectiveField, value) => {
    if (!currentExerciseId || !user || !sessionId || exerciseSets.length === 0) return;
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

  const handleSaveSetChanges = async (setId) => {
    if (!user || !sessionId) return;
    
    // If creating exercise, sets are already in local state, just mark as saved
    if (isCreatingExercise) {
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

    // Build update data with only changed fields
    const updateData = {};
    let hasChanges = false;
    
    for (const field of ['reps', 'intensity']) {
      const current = set[field];
      const original = originalSet[field];
      // Normalize comparison (handle null/undefined/empty string)
      const currentNormalized = current === null || current === undefined || current === '' ? null : String(current);
      const originalNormalized = original === null || original === undefined || original === '' ? null : String(original);
      if (currentNormalized !== originalNormalized) {
        // For intensity, save as "x/10" format
        if (field === 'intensity' && current !== null && current !== '') {
          updateData[field] = current; // Already in "x/10" format from local state
        } else {
          updateData[field] = current === null || current === '' ? null : current;
        }
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return; // No changes to save
    }

    try {
      setIsSavingSetChanges(true);
      
      await libraryService.updateSetInLibraryExercise(
        user.uid,
        sessionId,
        currentExerciseId,
        setId,
        updateData
      );
      
      // Update original sets to reflect saved state
      const updatedOriginalSets = [...originalExerciseSets];
      updatedOriginalSets[setIndex] = { ...exerciseSets[setIndex] };
      setOriginalExerciseSets(updatedOriginalSets);
      
      setUnsavedSetChanges(prev => ({
        ...prev,
        [setId]: false
      }));
    } catch (err) {
      console.error('Error saving set changes:', err);
      alert('Error al guardar los cambios. Por favor, intenta de nuevo.');
    } finally {
      setIsSavingSetChanges(false);
    }
  };

  const handleDeleteSet = async (set, options = {}) => {
    if (!user || !sessionId) return;
    
    if (isCreatingExercise) {
      setExerciseSets(prev => prev.filter(s => s.id !== set.id));
      setUnsavedSetChanges(prev => {
        const updated = { ...prev };
        delete updated[set.id];
        return updated;
      });
    } else if (currentExerciseId) {
      if (!options.skipConfirm && !window.confirm('¿Estás seguro de que quieres eliminar esta serie?')) return;
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
    if (!user || !sessionId) return;
    
    // If creating exercise, we don't need currentExerciseId (it will be null)
    // If editing existing exercise, we need currentExerciseId
    if (!isCreatingExercise && !currentExerciseId) return;
    
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
        if (!currentExerciseId) {
          console.error('Cannot duplicate set: currentExerciseId is required for existing exercise');
          return;
        }
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
    
    const hasSets = exerciseSets.length > 0 || (numberOfSetsForNewExercise >= 1);
    
    const measures = Array.isArray(exerciseDraft.measures) ? exerciseDraft.measures : [];
    const objectives = Array.isArray(exerciseDraft.objectives) ? exerciseDraft.objectives : [];
    const hasData = measures.length > 0 && objectives.length > 0;
    
    return hasPrimary && hasSets && hasData;
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

      // Create sets (from temp sets or from number + default)
      let tempSets = exerciseSets.filter(set => set.id && String(set.id).startsWith('temp-'));
      if (tempSets.length === 0 && numberOfSetsForNewExercise >= 1) {
        const fields = (draftObjectives.filter(o => o !== 'previous').length)
          ? draftObjectives.filter(o => o !== 'previous')
          : ['reps', 'intensity'];
        const defaultSet = {};
        fields.forEach(o => {
          const v = newExerciseDefaultSetValues[o];
          defaultSet[o] = v != null && v !== '' ? v : null;
        });
        const count = Math.max(1, Math.min(20, Math.floor(numberOfSetsForNewExercise) || 1));
        tempSets = Array.from({ length: count }, (_, i) => ({ order: i, title: `Serie ${i + 1}`, ...defaultSet }));
      }
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
      onHeaderEditClick={selectedSession ? handleEditSessionClick : null}
      onBack={null}
      showBackButton={true}
      backPath={getBackPath()}
      headerImageIcon={selectedSession ? (
        <button
          type="button"
          onClick={() => { setMediaPickerContext('header'); setIsMediaPickerOpen(true); }}
          aria-label="Cambiar imagen de la sesión"
          title="Cambiar imagen"
        >
          {selectedSession.image_url ? (
            <img src={selectedSession.image_url} alt="" />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      ) : null}
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
                        setNumberOfSetsForNewExercise(3);
                        setNewExerciseDefaultSetValues({});
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
              {renderSessionActions()}
              {renderSessions()}
            </div>
          ) : (
            <div className="modules-content">
              <h2 className="page-section-title">Semanas</h2>
              {renderModuleActions()}
              {renderModules()}
            </div>
          )}
        </div>
      </div>

      {/* Exercise Modal - Unified two-column layout */}
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
                      <button type="button" className="sets-panel-number-btn" onClick={() => syncSetsCountToNumber((isCreatingExercise ? numberOfSetsForNewExercise : exerciseSets.length) - 1)} aria-label="Menos series">−</button>
                      <input type="number" min={1} max={20} className="sets-panel-number-input" value={isCreatingExercise ? numberOfSetsForNewExercise : exerciseSets.length} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) syncSetsCountToNumber(Math.max(1, Math.min(20, v))); }} />
                      <button type="button" className="sets-panel-number-btn" onClick={() => syncSetsCountToNumber((isCreatingExercise ? numberOfSetsForNewExercise : exerciseSets.length) + 1)} aria-label="Más series">+</button>
                    </div>
                  </div>
                  {(draftMeasures.length > 0 && draftObjectives.length > 0) && ((draftObjectives || []).filter(o => o !== 'previous').length ? (draftObjectives || []).filter(o => o !== 'previous') : ['reps', 'intensity']).map((obj) => (
                    <div key={obj} className="sets-panel-glass-card">
                      <span className="sets-panel-glass-label">{getObjectiveDisplayName(obj)}</span>
                      {obj === 'intensity' ? (
                        <div className="exercise-series-intensity-input-wrapper sets-panel-glass-input-wrap">
                          <input type="text" className="exercise-series-input exercise-series-intensity-input sets-panel-glass-input" placeholder="8" maxLength={2} value={newExerciseDefaultSetValues[obj] != null && newExerciseDefaultSetValues[obj] !== '' ? String(newExerciseDefaultSetValues[obj]).replace(/\/10$/, '') : ''} onChange={(e) => handleUpdateNewExerciseDefaultValue(obj, e.target.value)} />
                          <span className="exercise-series-intensity-suffix">/10</span>
                        </div>
                      ) : (
                        <input type="text" className="exercise-series-input sets-panel-glass-input" placeholder={obj === 'reps' ? '10' : '--'} value={newExerciseDefaultSetValues[obj] != null && newExerciseDefaultSetValues[obj] !== '' ? String(newExerciseDefaultSetValues[obj]) : ''} onChange={(e) => handleUpdateNewExerciseDefaultValue(obj, e.target.value)} />
                      )}
                    </div>
                  ))}
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
                    <p>{isCreatingExercise ? 'Indica el número de series y los valores; se aplicarán a todas.' : 'No hay series. Aumenta el número de series arriba.'}</p>
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
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndSeries}>
                        <SortableContext items={exerciseSets.map((set) => set.id)} strategy={verticalListSortingStrategy}>
                          <div className="sets-detail-list">
                            {exerciseSets.map((set, setIndex) => {
                              const objectivesFields = draftObjectives.filter(obj => ['reps', 'intensity'].includes(obj));
                              return (
                                <SortableSeriesCard key={set.id} set={set} setIndex={setIndex} isSeriesEditMode={true} isExpanded={true} onToggleExpansion={() => {}} onDeleteSet={handleDeleteSet} onDuplicateSet={handleDuplicateSet} objectivesFields={objectivesFields} getObjectiveDisplayName={getObjectiveDisplayName} handleUpdateSetValue={handleUpdateSetValue} hasUnsavedChanges={unsavedSetChanges[set.id] || false} onSaveSetChanges={handleSaveSetChanges} isSavingSetChanges={isSavingSetChanges} parseIntensityForDisplay={parseIntensityForDisplay} />
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
                              {((draftObjectives || []).filter(o => o !== 'previous').length ? (draftObjectives || []).filter(o => o !== 'previous') : ['reps', 'intensity']).map((field) => (
                                <th key={field} className="sets-detail-th">{getObjectiveDisplayName(field)}</th>
                              ))}
                              <th className="sets-detail-th sets-detail-th-actions" />
                            </tr>
                          </thead>
                          <tbody>
                            {exerciseSets.map((set, setIndex) => {
                              const objectivesFields = (draftObjectives || []).filter(obj => ['reps', 'intensity'].includes(obj));
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
      {/* Create Module Modal */}
      <Modal
        isOpen={isModuleModalOpen}
        onClose={handleCloseModuleModal}
        title="Nueva semana"
      >
        <div className="modal-library-content">
          <Input
            placeholder="Nombre de la semana"
            value={moduleName}
            onChange={(e) => setModuleName(e.target.value)}
            type="text"
            light={true}
          />
          <div className="modal-actions">
            <Button
              title={isCreatingModule ? 'Creando...' : 'Crear'}
              onClick={handleCreateModule}
              disabled={!moduleName.trim() || isCreatingModule}
              loading={isCreatingModule}
            />
          </div>
        </div>
      </Modal>

      {/* Delete Module Modal */}
      <Modal
        isOpen={isDeleteModuleModalOpen}
        onClose={handleCloseDeleteModuleModal}
        title={moduleToDelete?.title || 'Eliminar semana'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre de la semana:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={moduleToDelete?.title || 'Nombre de la semana'}
              value={deleteModuleConfirmation}
              onChange={(e) => setDeleteModuleConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${deleteModuleConfirmation.trim() !== (moduleToDelete?.title || '') ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDeleteModule}
              disabled={deleteModuleConfirmation.trim() !== (moduleToDelete?.title || '') || isDeletingModule}
            >
              {isDeletingModule ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción es irreversible. Todo el contenido de esta semana se eliminará permanentemente.
          </p>
        </div>
      </Modal>

      {/* Add Session from Library Modal */}
      <Modal
        isOpen={isCopySessionModalOpen}
        onClose={handleCloseCopySessionModal}
        title="Agregar Sesión"
      >
        <div className="modal-library-content" style={{ minHeight: '400px', maxHeight: '600px', overflowY: 'auto' }}>
          {isLoadingLibrarySessions ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#cccccc' }}>
              <p>Cargando sesiones...</p>
            </div>
          ) : availableLibrarySessions.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#cccccc' }}>
              <p>No hay sesiones disponibles en la biblioteca.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {availableLibrarySessions.map((session) => (
                <div key={session.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <div>
                    <h4 style={{ margin: 0, color: '#ffffff', fontSize: '16px', fontWeight: 600 }}>
                      {session.title || `Sesión ${session.id.slice(0, 8)}`}
                    </h4>
                  </div>
                  <button
                    className="copy-session-item-button"
                    onClick={() => handleSelectLibrarySession(session.id)}
                    disabled={isCreatingSession}
                  >
                    {isCreatingSession ? 'Agregando...' : 'Agregar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Edit Session Modal */}
      <Modal
        isOpen={isSessionModalOpen}
        onClose={handleCloseSessionModal}
        title="Editar Sesión"
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
                        <button type="button" className="edit-program-image-action-pill" onClick={() => { setMediaPickerContext('edit'); setIsMediaPickerOpen(true); }}>
                          <span className="edit-program-image-action-text">Cambiar</span>
                        </button>
                        <button
                          className="edit-program-image-action-pill edit-program-image-delete-pill"
                          onClick={handleSessionImageDelete}
                          disabled={isUpdatingSession}
                        >
                          <span className="edit-program-image-action-text">Eliminar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="edit-program-no-image">
                    <p>No hay imagen disponible</p>
                    <button type="button" className="edit-program-image-upload-button" onClick={() => { setMediaPickerContext('edit'); setIsMediaPickerOpen(true); }}>
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
                isUpdatingSession || isUploadingSessionImage ? 'Guardando...' : 'Guardar'
              }
              onClick={handleUpdateSession}
              disabled={
                !sessionName.trim() || 
                (isUpdatingSession || isUploadingSessionImage)
              }
              loading={isUpdatingSession || isUploadingSessionImage}
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

      {/* Delete Session Modal */}
      <Modal
        isOpen={isDeleteSessionModalOpen}
        onClose={handleCloseDeleteSessionModal}
        title={sessionToDelete?.title || 'Eliminar sesión'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre de la sesión:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={sessionToDelete?.title || 'Nombre de la sesión'}
              value={deleteSessionConfirmation}
              onChange={(e) => setDeleteSessionConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${deleteSessionConfirmation.trim() !== (sessionToDelete?.title || '') ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDeleteSession}
              disabled={deleteSessionConfirmation.trim() !== (sessionToDelete?.title || '') || isDeletingSession}
            >
              {isDeletingSession ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción es irreversible. La sesión se eliminará de esta semana.
          </p>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default LibraryContentScreen;

