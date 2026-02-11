import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import MediaPickerModal from '../components/MediaPickerModal';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import MeasuresObjectivesEditorModal from '../components/MeasuresObjectivesEditorModal';
import libraryService from '../services/libraryService';
import measureObjectivePresetsService from '../services/measureObjectivePresetsService';
import clientSessionContentService from '../services/clientSessionContentService';
import clientPlanContentService from '../services/clientPlanContentService';
import { collection, addDoc, doc, deleteDoc, query, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { deleteField } from 'firebase/firestore';
import MuscleSilhouetteSVG from '../components/MuscleSilhouetteSVG';
import { getIconById, renderIconSVG } from '../utils/libraryIcons.jsx';
import './LibrarySessionDetailScreen.css';
import './ProgramDetailScreen.css';

// Muscle display names (matching mobile app)
const MUSCLE_DISPLAY_NAMES = {
  pecs: 'Pectorales',
  front_delts: 'Deltoides Frontales',
  side_delts: 'Deltoides Laterales',
  rear_delts: 'Deltoides Posteriores',
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
  "pantorrilla'nt": 'Pantorrilla'
};

const getMuscleDisplayName = (muscleKey) => {
  return MUSCLE_DISPLAY_NAMES[muscleKey] || muscleKey;
};

// Helper functions from ProgramDetailScreen
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

// Drop Zone Component
const DropZone = ({ id, children, className }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? 'dropzone-active' : ''}`}
    >
      {children}
    </div>
  );
};

// Draggable Exercise Item Component
const DraggableExercise = ({ exercise, libraryTitle, libraryIcon, isInSession = false, isIncomplete = false, onDelete, isEditMode, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: exercise.dragId || exercise.id,
    data: { exercise }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const exerciseName = exercise.name || (exercise.primary ? Object.values(exercise.primary)[0] : 'Ejercicio');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`draggable-exercise ${isDragging ? 'dragging' : ''} ${isInSession ? 'exercise-in-session' : 'exercise-available'}`}
      {...attributes}
      {...listeners}
      onClick={onClick && !isEditMode ? () => onClick(exercise) : undefined}
    >
      <div className="draggable-exercise-content">
        <div className="draggable-exercise-icon">
          {libraryIcon ? (
            typeof libraryIcon === 'string' && libraryIcon.startsWith('http') ? (
              <img 
                src={libraryIcon} 
                alt={libraryTitle || 'Library icon'} 
                className="draggable-exercise-icon-image"
              />
            ) : (
              renderIconSVG(libraryIcon, 20)
            )
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <div className="draggable-exercise-info">
          <div className="draggable-exercise-name">{exerciseName}</div>
          {isInSession && isIncomplete && (
            <span className="session-exercise-incomplete-tag" title="Ejercicio incompleto (falta Data o configuración)">Incompleto</span>
          )}
          {libraryTitle && (
            <div className="draggable-exercise-meta">{libraryTitle}</div>
          )}
        </div>
      </div>
      {isInSession && isEditMode && onDelete && (
        <button
          className="draggable-exercise-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(exercise);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
};

const LibrarySessionDetailScreen = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const backPath = location.state?.returnTo || '/content';
  const editScope = location.state?.editScope;
  const clientSessionId = location.state?.clientSessionId;
  const clientId = location.state?.clientId;
  const clientName = location.state?.clientName || 'Cliente';
  const programId = location.state?.programId;
  const weekKey = location.state?.weekKey;
  const isClientEdit = editScope === 'client' && clientSessionId;
  const isClientPlanEdit = editScope === 'client_plan' && clientId && programId && weekKey;
  const hasClientCopyRef = useRef(false);
  const [hasClientCopy, setHasClientCopy] = useState(false);
  const [session, setSession] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [availableLibraries, setAvailableLibraries] = useState([]);
  const [availableExercises, setAvailableExercises] = useState([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeId, setActiveId] = useState(null);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscles, setSelectedMuscles] = useState(new Set()); // Applied muscle filter
  const [tempSelectedMuscles, setTempSelectedMuscles] = useState(new Set()); // Temporary selection in filter modal
  const [selectedImplements, setSelectedImplements] = useState(new Set()); // Applied implement filter
  const [tempSelectedImplements, setTempSelectedImplements] = useState(new Set()); // Temporary selection in filter modal
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [exerciseToDelete, setExerciseToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // Exercise Configuration Modal State (matching ProgramDetailScreen)
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [exerciseDraft, setExerciseDraft] = useState(null);
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [libraryTitles, setLibraryTitles] = useState({}); // Map: libraryId -> library title
  const [libraryIcons, setLibraryIcons] = useState({}); // Map: libraryId -> library icon_url
  const [libraryDataCache, setLibraryDataCache] = useState({}); // Map: libraryId -> full library data
  const [libraryExerciseCompleteness, setLibraryExerciseCompleteness] = useState({}); // Map: libraryId::exerciseName -> boolean
  
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
  const [editorModalMode, setEditorModalMode] = useState('exercise'); // 'exercise' | 'create_preset' | 'edit_preset'
  const [presetBeingEditedId, setPresetBeingEditedId] = useState(null);
  const [appliedPresetId, setAppliedPresetId] = useState(null); // preset id applied to current exercise (for display)
  const [dataEditMenuOpen, setDataEditMenuOpen] = useState(false);
  const dataEditMenuRef = useRef(null);
  
  // Series/Sets state
  const [expandedSeries, setExpandedSeries] = useState({}); // Map: setId -> boolean
  const [exerciseSets, setExerciseSets] = useState([]); // Array of sets for the selected exercise
  const [originalExerciseSets, setOriginalExerciseSets] = useState([]); // Original sets when modal opens
  const [unsavedSetChanges, setUnsavedSetChanges] = useState({}); // Map: setId -> boolean (has unsaved changes)
  const [numberOfSetsForNewExercise, setNumberOfSetsForNewExercise] = useState(3);
  const [newExerciseDefaultSetValues, setNewExerciseDefaultSetValues] = useState({});
  const [showPerSetCards, setShowPerSetCards] = useState(false);
  const [isSeriesEditMode, setIsSeriesEditMode] = useState(false);
  const [isUpdatingSeriesOrder, setIsUpdatingSeriesOrder] = useState(false);
  const [originalSeriesOrder, setOriginalSeriesOrder] = useState([]);
  const [isCreatingSet, setIsCreatingSet] = useState(false);
  const [isSavingSetChanges, setIsSavingSetChanges] = useState(false);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);

  const handleHeaderImageSelect = async (item) => {
    if (!sessionId || !user) return;
    try {
      if (isClientPlanEdit && clientId && programId && weekKey) {
        await clientPlanContentService.updateSession(clientId, programId, weekKey, sessionId, { image_url: item.url });
      } else if (isClientEdit && clientSessionId) {
        await clientSessionContentService.updateSession(clientSessionId, { image_url: item.url });
      } else {
        await libraryService.updateLibrarySession(user.uid, sessionId, { image_url: item.url });
      }
      setSession(prev => (prev ? { ...prev, image_url: item.url } : null));
    } catch (err) {
      console.error('Error updating session image:', err);
      alert('Error al actualizar la imagen.');
    }
    setIsMediaPickerOpen(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: () => ({ x: 0, y: 0 }),
    })
  );

  const ensureClientCopy = useCallback(async () => {
    if (!isClientEdit || hasClientCopyRef.current || !user || !sessionId) return;
    try {
      const lib = await libraryService.getLibrarySessionById(user.uid, sessionId);
      if (lib) {
        await clientSessionContentService.copyFromLibrary(user.uid, clientSessionId, sessionId, lib);
        hasClientCopyRef.current = true;
        setHasClientCopy(true);
      }
    } catch (err) {
      console.error('Error ensuring client copy:', err);
      throw err;
    }
  }, [isClientEdit, clientSessionId, user, sessionId]);

  useEffect(() => {
    const loadData = async () => {
      if (!user || !sessionId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        let sessionData = null;
        if (isClientPlanEdit) {
          const planContent = await clientPlanContentService.getClientPlanSessionContent(clientId, programId, weekKey, sessionId);
          if (planContent?.session) {
            sessionData = { ...planContent.session, exercises: planContent.exercises || [] };
          }
        } else if (isClientEdit) {
          sessionData = await clientSessionContentService.getClientSessionContent(clientSessionId);
          const hasCopy = !!sessionData;
          hasClientCopyRef.current = hasCopy;
          setHasClientCopy(hasCopy);
        }
        if (!sessionData) {
          sessionData = await libraryService.getLibrarySessionById(user.uid, sessionId);
        }
        if (!sessionData) {
          setError('Sesión no encontrada');
          return;
        }

        setSession(sessionData);

        const sessionExercises = (sessionData.exercises || []).map(ex => ({
          ...ex,
          dragId: `session-${ex.id}`,
          isInSession: true
        }));
        setExercises(sessionExercises);

        const libraries = await libraryService.getLibrariesByCreator(user.uid);
        setAvailableLibraries(libraries);

        const iconsMap = {};
        libraries.forEach(lib => {
          iconsMap[lib.id] = lib.icon_url || lib.icon || null;
        });
        setLibraryIcons(iconsMap);

        if (libraries.length > 0) {
          setSelectedLibraryId(libraries[0].id);
          loadExercisesFromLibrary(libraries[0].id, libraries);
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Error al cargar los datos');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, sessionId, isClientEdit, clientSessionId, isClientPlanEdit, clientId, programId, weekKey]);

  const loadExercisesFromLibrary = useCallback(async (libraryId, libraries = null) => {
    if (!libraryId) return;
    
    try {
      const libs = libraries || availableLibraries;
      const library = libs.find(l => l.id === libraryId);
      if (!library) return;

      const exercisesList = libraryService.getExercisesFromLibrary(library);
      
      // Get exercise IDs that are already in session
      const sessionExerciseIds = new Set();
      exercises.forEach(ex => {
        if (ex.primary) {
          Object.entries(ex.primary).forEach(([libId, exName]) => {
            if (libId === libraryId) {
              sessionExerciseIds.add(`${libId}::${exName}`);
            }
          });
        }
      });

      // Prepare available exercises with drag IDs and sort by name
      const available = exercisesList
        .filter(ex => !sessionExerciseIds.has(`${libraryId}::${ex.name}`))
        .map(ex => ({
          ...ex,
          dragId: `available-${libraryId}-${ex.name}`,
          libraryId,
          libraryTitle: library.title,
          libraryIcon: library.icon_url || library.icon || null,
          isInSession: false
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setAvailableExercises(available);
    } catch (err) {
      console.error('Error loading exercises from library:', err);
    }
  }, [exercises, availableLibraries]);

  useEffect(() => {
    if (selectedLibraryId) {
      loadExercisesFromLibrary(selectedLibraryId);
    }
  }, [selectedLibraryId, loadExercisesFromLibrary]);

  // Load library completeness for all session exercises on initial load so "Incompleto" tag shows immediately
  useEffect(() => {
    if (!exercises || exercises.length === 0) return;
    const referenceLibrariesMap = {};
    exercises.forEach((ex) => {
      getPrimaryReferences(ex).forEach(({ libraryId, exerciseName }) => {
        if (!libraryId || !exerciseName) return;
        if (!referenceLibrariesMap[libraryId]) referenceLibrariesMap[libraryId] = new Set();
        referenceLibrariesMap[libraryId].add(exerciseName);
      });
    });
    const libraryIds = Object.keys(referenceLibrariesMap);
    if (libraryIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const completenessUpdates = {};
      await Promise.all(
        libraryIds.map(async (libraryId) => {
          try {
            const libraryData = await libraryService.getLibraryById(libraryId);
            referenceLibrariesMap[libraryId].forEach((exerciseName) => {
              if (!exerciseName) return;
              const key = getLibraryExerciseKey(libraryId, exerciseName);
              completenessUpdates[key] = libraryData ? isLibraryExerciseDataComplete(libraryData[exerciseName]) : false;
            });
          } catch (err) {
            referenceLibrariesMap[libraryId].forEach((exerciseName) => {
              if (!exerciseName) return;
              completenessUpdates[getLibraryExerciseKey(libraryId, exerciseName)] = false;
            });
          }
        })
      );
      if (!cancelled && Object.keys(completenessUpdates).length > 0) {
        setLibraryExerciseCompleteness((prev) => ({ ...prev, ...completenessUpdates }));
      }
    })();
    return () => { cancelled = true; };
  }, [exercises]);

  const contentApi = useMemo(() => {
    const effectiveSessionId = isClientEdit ? clientSessionId : sessionId;
    return {
      async ensureCopy() {
        if (isClientEdit) await ensureClientCopy();
      },
      async updateSetInLibraryExercise(uid, sessId, exId, setId, data) {
        await this.ensureCopy();
        if (isClientPlanEdit) return clientPlanContentService.updateSet(clientId, programId, weekKey, sessId, exId, setId, data);
        if (isClientEdit) return clientSessionContentService.updateSetInExercise(effectiveSessionId, exId, setId, data);
        return libraryService.updateSetInLibraryExercise(uid, sessId, exId, setId, data);
      },
      async createSetInLibraryExercise(uid, sessId, exId, order = null) {
        await this.ensureCopy();
        if (isClientPlanEdit) return clientPlanContentService.addSetToExercise(clientId, programId, weekKey, sessId, exId, order ?? undefined);
        if (isClientEdit) return clientSessionContentService.addSetToExercise(effectiveSessionId, exId, { order: order ?? 0, title: `Serie ${(order ?? 0) + 1}` });
        return libraryService.createSetInLibraryExercise(uid, sessId, exId, order);
      },
      async deleteSetFromLibraryExercise(uid, sessId, exId, setId) {
        await this.ensureCopy();
        if (isClientPlanEdit) return clientPlanContentService.deleteSet(clientId, programId, weekKey, sessId, exId, setId);
        if (isClientEdit) return clientSessionContentService.deleteSet(effectiveSessionId, exId, setId);
        return libraryService.deleteSetFromLibraryExercise(uid, sessId, exId, setId);
      },
      async getSetsByLibraryExercise(uid, sessId, exId) {
        if (isClientPlanEdit) return clientPlanContentService.getSetsByExercise(clientId, programId, weekKey, sessId, exId);
        if (isClientEdit) return clientSessionContentService.getSetsForExercise(effectiveSessionId, exId);
        return libraryService.getSetsByLibraryExercise(uid, sessId, exId);
      },
      async updateLibrarySession(uid, sessId, updates) {
        await this.ensureCopy();
        if (isClientPlanEdit) return clientPlanContentService.updateSession(clientId, programId, weekKey, sessId, updates);
        if (isClientEdit) return clientSessionContentService.updateSession(effectiveSessionId, updates);
        return libraryService.updateLibrarySession(uid, sessId, updates);
      },
      async updateExerciseInLibrarySession(uid, sessId, exId, updates) {
        await this.ensureCopy();
        if (isClientPlanEdit) return clientPlanContentService.updateExercise(clientId, programId, weekKey, sessId, exId, updates);
        if (isClientEdit) return clientSessionContentService.updateExercise(effectiveSessionId, exId, updates);
        return libraryService.updateExerciseInLibrarySession(uid, sessId, exId, updates);
      },
      async createExerciseInLibrarySession(uid, sessId, exerciseName, order) {
        await this.ensureCopy();
        if (isClientPlanEdit) return clientPlanContentService.createExercise(clientId, programId, weekKey, sessId, exerciseName?.trim?.() || exerciseName || 'Ejercicio', order ?? undefined);
        if (isClientEdit) return clientSessionContentService.createExercise(effectiveSessionId, { title: exerciseName?.trim?.() || exerciseName, name: exerciseName?.trim?.() || exerciseName }, order ?? 0);
        return libraryService.createExerciseInLibrarySession(uid, sessId, exerciseName, order);
      },
      async getLibrarySessionById(uid, sessId) {
        if (isClientPlanEdit) {
          const planContent = await clientPlanContentService.getClientPlanSessionContent(clientId, programId, weekKey, sessId);
          return planContent ? { ...planContent.session, exercises: planContent.exercises || [] } : null;
        }
        if (isClientEdit) return clientSessionContentService.getClientSessionContent(effectiveSessionId);
        return libraryService.getLibrarySessionById(uid, sessId);
      },
      async updateLibrarySessionExerciseOrder(uid, sessId, orders) {
        await this.ensureCopy();
        if (isClientPlanEdit) {
          for (const { exerciseId, order } of orders) {
            await clientPlanContentService.updateExercise(clientId, programId, weekKey, sessId, exerciseId, { order });
          }
          return;
        }
        if (isClientEdit) return clientSessionContentService.updateExerciseOrder(effectiveSessionId, orders.map(({ exerciseId, order }) => ({ exerciseId, order })));
        return libraryService.updateLibrarySessionExerciseOrder(uid, sessId, orders.map((o) => ({ exerciseId: o.exerciseId, order: o.order })));
      }
    };
  }, [isClientEdit, isClientPlanEdit, clientSessionId, sessionId, ensureClientCopy, clientId, programId, weekKey]);

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

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    // Check if dragging from available to session - open configuration modal for new exercise
    if (activeId.startsWith('available-') && overId === 'session-list') {
      const exerciseData = active.data.current.exercise;
      
      // Create a draft exercise for the modal
      const library = availableLibraries.find(l => l.id === exerciseData.libraryId);
      const exerciseFromLib = library && library[exerciseData.name];
      
      const newExerciseDraft = {
        id: 'new',
        primary: {
          [exerciseData.libraryId]: exerciseData.name
        },
        alternatives: {},
        measures: exerciseFromLib?.measures || [],
        objectives: exerciseFromLib?.objectives || [],
      };
      
      setSelectedExercise(newExerciseDraft);
      setExerciseDraft(JSON.parse(JSON.stringify(newExerciseDraft)));
      setIsCreatingExercise(true);
      setExerciseSets([]);
      setOriginalExerciseSets([]);
      setUnsavedSetChanges({});
      setNumberOfSetsForNewExercise(3);
      setNewExerciseDefaultSetValues({});
      setIsExerciseModalOpen(true);
      return;
    }

    // Check if reordering within session
    if (activeId.startsWith('session-') && overId.startsWith('session-')) {
      const activeIndex = exercises.findIndex(ex => ex.dragId === activeId);
      const overIndex = exercises.findIndex(ex => ex.dragId === overId);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        const newExercises = arrayMove(exercises, activeIndex, overIndex);
        setExercises(newExercises);
        // TODO: Update order in Firestore
      }
    }
  };

  const addExerciseToSession = async (exerciseData) => {
    if (!user || !sessionId || !exerciseData.libraryId || !exerciseData.name) return;

    try {
      const nextOrder = exercises.length;
      const library = availableLibraries.find(l => l.id === exerciseData.libraryId);
      const exerciseFromLib = library && library[exerciseData.name];

      if (isClientEdit) {
        await ensureClientCopy();
        const payload = {
          primary: { [exerciseData.libraryId]: exerciseData.name },
          alternatives: {},
          measures: exerciseFromLib?.measures || [],
          objectives: exerciseFromLib?.objectives || []
        };
        await clientSessionContentService.createExercise(clientSessionId, payload, nextOrder);
      } else {
        const exercisesRef = collection(
          firestore,
          'creator_libraries',
          user.uid,
          'sessions',
          sessionId,
          'exercises'
        );
        const newExercise = {
          primary: { [exerciseData.libraryId]: exerciseData.name },
          alternatives: {},
          measures: exerciseFromLib?.measures || [],
          objectives: exerciseFromLib?.objectives || [],
          order: nextOrder,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        };
        await addDoc(exercisesRef, newExercise);
      }

      // Reload session
      const sessionData = await contentApi.getLibrarySessionById(user.uid, sessionId);
      const sessionExercises = (sessionData.exercises || []).map(ex => ({
        ...ex,
        dragId: `session-${ex.id}`,
        isInSession: true
      }));
      setExercises(sessionExercises);

      // Remove from available
      await loadExercisesFromLibrary(selectedLibraryId);
    } catch (err) {
      console.error('Error adding exercise:', err);
      alert('Error al agregar el ejercicio');
    }
  };

  const handleDeleteExercise = (exercise) => {
    setExerciseToDelete(exercise);
    setIsDeleteModalOpen(true);
    setDeleteConfirmation('');
  };

  const handleConfirmDelete = async () => {
    if (!exerciseToDelete || !deleteConfirmation.trim() || !user || !sessionId) return;

    const exerciseName = exerciseToDelete.name || 
      (exerciseToDelete.primary ? Object.values(exerciseToDelete.primary)[0] : '');

    if (deleteConfirmation.trim() !== exerciseName) return;

    try {
      setIsDeleting(true);

      if (isClientPlanEdit && clientId && programId && weekKey) {
        await clientPlanContentService.deleteExercise(clientId, programId, weekKey, sessionId, exerciseToDelete.id);
      } else if (isClientEdit) {
        await clientSessionContentService.deleteExercise(clientSessionId, exerciseToDelete.id);
      } else {
        const exerciseRef = doc(
          firestore,
          'creator_libraries',
          user.uid,
          'sessions',
          sessionId,
          'exercises',
          exerciseToDelete.id
        );
        await deleteDoc(exerciseRef);
      }

      // Reload
      const sessionData = await contentApi.getLibrarySessionById(user.uid, sessionId);
      const sessionExercises = (sessionData.exercises || []).map(ex => ({
        ...ex,
        dragId: `session-${ex.id}`,
        isInSession: true
      }));
      setExercises(sessionExercises);
      await loadExercisesFromLibrary(selectedLibraryId);

      setIsDeleteModalOpen(false);
      setExerciseToDelete(null);
      setDeleteConfirmation('');
    } catch (err) {
      console.error('Error deleting exercise:', err);
      alert('Error al eliminar el ejercicio');
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper function to get library icon from exercise
  const getExerciseLibraryIcon = (exercise) => {
    if (exercise.libraryIcon) {
      return exercise.libraryIcon;
    }
    if (exercise.primary && typeof exercise.primary === 'object') {
      const libraryId = Object.keys(exercise.primary)[0];
      const icon = libraryIcons[libraryId];
      // If icon is a URL string, return it; if it's an icon ID, return it for SVG rendering
      return icon || null;
    }
    return null;
  };

  const getExerciseDisplayName = (exercise) => {
    if (exercise.name) return exercise.name;
    if (exercise.primary) {
      const values = Object.values(exercise.primary);
      return values[0] || 'Ejercicio sin nombre';
    }
    return 'Ejercicio sin nombre';
  };

  // Check if library exercise is incomplete (only true when we have loaded and it's incomplete)
  const isLibraryExerciseIncomplete = (libraryId, exerciseName) => {
    if (!libraryId || !exerciseName) return false;
    const key = getLibraryExerciseKey(libraryId, exerciseName);
    // Only show incomplete when we've loaded completeness and it's false; unknown = don't show tag
    return libraryExerciseCompleteness[key] === false;
  };

  // Check if a session exercise is incomplete (no data, or library ref incomplete when known)
  const isSessionExerciseIncomplete = (ex) => {
    if (!ex) return true;
    const hasPrimary = ex.primary && typeof ex.primary === 'object' && Object.values(ex.primary || {}).length > 0;
    if (!hasPrimary) return true;
    const measures = Array.isArray(ex.measures) ? ex.measures : [];
    const objectives = Array.isArray(ex.objectives) ? ex.objectives : [];
    if (measures.length === 0 || objectives.length === 0) return true;
    const primaryRef = getPrimaryReferences(ex)[0];
    if (primaryRef && isLibraryExerciseIncomplete(primaryRef.libraryId, primaryRef.exerciseName)) return true;
    return false;
  };

  // Computed values for modal (from ProgramDetailScreen pattern)
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
  const draftCustomMeasureLabels = activeExerciseForModal?.customMeasureLabels && typeof activeExerciseForModal.customMeasureLabels === 'object'
    ? activeExerciseForModal.customMeasureLabels
    : {};
  const draftCustomObjectiveLabels = activeExerciseForModal?.customObjectiveLabels && typeof activeExerciseForModal.customObjectiveLabels === 'object'
    ? activeExerciseForModal.customObjectiveLabels
    : {};
  const primaryLibraryReferences = activeExerciseForModal ? getPrimaryReferences(activeExerciseForModal) : [];
  const primaryLibraryReference = primaryLibraryReferences.length > 0 ? primaryLibraryReferences[0] : null;
  const isPrimaryLibraryIncomplete = primaryLibraryReference
    ? isLibraryExerciseIncomplete(primaryLibraryReference.libraryId, primaryLibraryReference.exerciseName)
    : false;

  const getPrimaryExerciseName = () => {
    if (!activeExerciseForModal) return 'Sin ejercicio';
    const primary = activeExerciseForModal.primary;
    if (!primary || typeof primary !== 'object') return 'Sin ejercicio';
    const values = Object.values(primary);
    if (values.length === 0 || !values[0]) return 'Sin ejercicio';
    return values[0];
  };

  const getMeasureDisplayName = (measure) => {
    if (draftCustomMeasureLabels[measure]) return draftCustomMeasureLabels[measure];
    if (measure === 'reps') return 'Repeticiones';
    if (measure === 'weight') return 'Peso';
    return measure;
  };

  const getObjectiveDisplayName = (objective) => {
    if (draftCustomObjectiveLabels[objective]) return draftCustomObjectiveLabels[objective];
    if (objective === 'reps') return 'Repeticiones';
    if (objective === 'intensity') return 'Intensidad';
    if (objective === 'previous') return 'Anterior';
    return objective;
  };

  const handleExerciseClick = async (exercise) => {
    if (isEditMode) {
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
      
      // Load sets/series
      if (user && sessionId && exercise.id) {
        try {
          const setsData = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, exercise.id);
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
        } catch (err) {
          console.error('Error loading sets:', err);
          setExerciseSets([]);
          setOriginalExerciseSets([]);
          setUnsavedSetChanges({});
        }
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

  const handleCloseExerciseModal = () => {
    // When creating and form is valid, offer to save before closing
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
    setExerciseDraft(null);
    setIsCreatingExercise(false);
    setExerciseSets([]);
    setOriginalExerciseSets([]);
    setUnsavedSetChanges({});
    setNumberOfSetsForNewExercise(3);
    setNewExerciseDefaultSetValues({});
    setShowPerSetCards(false);
    setExpandedSeries({});
    setIsAlternativesEditMode(false);
    setAppliedPresetId(null);
    setIsPresetSelectorOpen(false);
    setIsMeasuresObjectivesEditorOpen(false);
  };

  // Cmd/Ctrl+Enter in exercise modal creates exercise when valid
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

  // Set handlers (adapted from ProgramDetailScreen for library sessions)
  const handleToggleSeriesExpansion = (setId) => {
    setExpandedSeries(prev => ({
      ...prev,
      [setId]: !prev[setId]
    }));
  };

  const parseIntensityForDisplay = (value) => {
    if (!value || value === null || value === undefined || value === '') {
      return '';
    }
    const strValue = String(value);
    if (strValue.includes('/10')) {
      return strValue.replace('/10', '').trim();
    }
    return strValue;
  };

  const formatRepsValue = (value) => {
    let cleaned = value.replace(/[^0-9-]/g, '');
    cleaned = cleaned.replace(/-+/g, '-');
    cleaned = cleaned.replace(/^-+/, '');
    if (cleaned === '') return '';
    const parts = cleaned.split('-');
    if (parts.length === 1) return parts[0];
    if (cleaned.endsWith('-') && parts.length === 2 && parts[1] === '') return cleaned;
    if (parts.length > 2) return `${parts[0]}-${parts[1]}`;
    return cleaned;
  };

  const handleUpdateSetValue = (setIndex, objectiveField, value) => {
    if (!currentExerciseId || !user || !sessionId) return;

    const set = exerciseSets[setIndex];
    if (!set || !set.id) return;

    let processedValue = value;
    if (objectiveField === 'intensity') {
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

    const updatedSets = [...exerciseSets];
    const originalSet = originalExerciseSets.find(s => s.id === set.id);
    
    let valueToStore = processedValue === '' ? null : processedValue;
    if (objectiveField === 'intensity' && processedValue !== '') {
      valueToStore = `${processedValue}/10`;
    }
    
    updatedSets[setIndex] = {
      ...updatedSets[setIndex],
      [objectiveField]: valueToStore
    };
    setExerciseSets(updatedSets);
    
    let setHasChanges = false;
    if (originalSet) {
      for (const field of ['reps', 'intensity']) {
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
    setNewExerciseDefaultSetValues(prev => ({
      ...prev,
      [field]: stored
    }));
    // When creating with 0 sets, create N sets with current defaults (including this field)
    if (isCreatingExercise && exerciseSets.length === 0 && (numberOfSetsForNewExercise || 0) >= 1) {
      const fields = (draftObjectives.filter(o => o !== 'previous').length)
        ? draftObjectives.filter(o => o !== 'previous')
        : ['reps', 'intensity'];
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
      setOriginalExerciseSets(JSON.parse(JSON.stringify(newSets)));
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
    const fields = (draftObjectives.filter(o => o !== 'previous').length)
      ? draftObjectives.filter(o => o !== 'previous')
      : ['reps', 'intensity'];
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
      setOriginalExerciseSets(JSON.parse(JSON.stringify(newSets)));
      const unsaved = {};
      newSets.forEach(s => { unsaved[s.id] = false; });
      setUnsavedSetChanges(unsaved);
      return;
    }

    const current = exerciseSets.length;
    if (target === current) return;
    if (target > current) {
      setNumberOfSetsForNewExercise(target);
      (async () => {
        for (let i = 0; i < target - current; i++) {
          await handleCreateSet();
        }
        const data = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
        const defaultReps = newExerciseDefaultSetValues.reps != null && newExerciseDefaultSetValues.reps !== '' ? newExerciseDefaultSetValues.reps : null;
        const defaultIntensity = newExerciseDefaultSetValues.intensity != null && newExerciseDefaultSetValues.intensity !== '' ? newExerciseDefaultSetValues.intensity : null;
        if (defaultReps !== null || defaultIntensity !== null) {
          for (const set of data) {
            await contentApi.updateSetInLibraryExercise(user.uid, sessionId, currentExerciseId, set.id, {
              reps: defaultReps ?? set.reps,
              intensity: defaultIntensity ?? set.intensity
            });
          }
        }
        const updated = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
        setExerciseSets(updated);
        setOriginalExerciseSets(JSON.parse(JSON.stringify(updated)));
        setUnsavedSetChanges({});
      })();
    } else {
      if (!window.confirm(`Se eliminarán ${current - target} serie(s). ¿Continuar?`)) return;
      setNumberOfSetsForNewExercise(target);
      const toRemove = exerciseSets.slice(-(current - target));
      (async () => {
        for (const s of toRemove) {
          await handleDeleteSet(s, { skipConfirm: true });
        }
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
    setOriginalExerciseSets(JSON.parse(JSON.stringify(newSets)));
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

    if (!currentExerciseId) return;

    const setIndex = exerciseSets.findIndex(s => s.id === setId);
    if (setIndex === -1) return;

    const set = exerciseSets[setIndex];
    const originalSet = originalExerciseSets.find(s => s.id === setId);
    
    if (!set || !originalSet) return;

    const updateData = {};
    let hasChanges = false;
    
    for (const field of ['reps', 'intensity']) {
      const current = set[field];
      const original = originalSet[field];
      const currentNormalized = current === null || current === undefined || current === '' ? null : String(current);
      const originalNormalized = original === null || original === undefined || original === '' ? null : String(original);
      if (currentNormalized !== originalNormalized) {
        if (field === 'intensity' && current !== null && current !== '') {
          updateData[field] = current;
        } else {
          updateData[field] = current === null || current === '' ? null : current;
        }
        hasChanges = true;
      }
    }

    if (!hasChanges) return;

    try {
      setIsSavingSetChanges(true);
      await contentApi.updateSetInLibraryExercise(user.uid, sessionId, currentExerciseId, setId, updateData);
      
      const setsData = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
      setExerciseSets(setsData);
      setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
      setUnsavedSetChanges(prev => {
        const newState = { ...prev };
        delete newState[setId];
        return newState;
      });
    } catch (err) {
      console.error('Error saving set changes:', err);
      alert('Error al guardar los cambios de la serie');
    } finally {
      setIsSavingSetChanges(false);
    }
  };

  const handleCreateSet = async () => {
    if (!user || !sessionId) return;

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

    if (!currentExerciseId) return;

    try {
      setIsCreatingSet(true);
      const newSet = await contentApi.createSetInLibraryExercise(user.uid, sessionId, currentExerciseId);
      
      const setsData = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
      setExerciseSets(setsData);
      setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
      setUnsavedSetChanges({});
      
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
    if (!setToDuplicate || !currentExerciseId || !user || !sessionId) return;

    try {
      const newSet = await handleCreateSet();
      if (!newSet || !newSet.id) return;

      const updateData = {
        reps: setToDuplicate.reps || null,
        intensity: setToDuplicate.intensity || null,
      };

      await contentApi.updateSetInLibraryExercise(user.uid, sessionId, currentExerciseId, newSet.id, updateData);

      const setsData = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
      setExerciseSets(setsData);
      setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
      setUnsavedSetChanges({});
    } catch (err) {
      console.error('Error duplicando serie:', err);
      alert('Error al duplicar la serie. Por favor, intenta de nuevo.');
    }
  };

  const handleDeleteSet = async (set, options = {}) => {
    if (!user || !sessionId || !set || !set.id) return;

    if (!options.skipConfirm && !window.confirm('¿Estás seguro de que quieres eliminar esta serie?')) return;

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

    if (!currentExerciseId) return;

    try {
      await contentApi.deleteSetFromLibraryExercise(user.uid, sessionId, currentExerciseId, set.id);
      
      const setsData = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
      setExerciseSets(setsData);
      setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
      setUnsavedSetChanges({});
    } catch (err) {
      console.error('Error deleting set:', err);
      alert('Error al eliminar la serie. Por favor, intenta de nuevo.');
    }
  };

  const handleEditSeries = async () => {
    if (isSeriesEditMode) {
      await handleSaveSeriesOrder();
    } else {
      setOriginalSeriesOrder(JSON.parse(JSON.stringify(exerciseSets)));
      setIsSeriesEditMode(true);
    }
  };

  const handleSaveSeriesOrder = async () => {
    if (!user || !sessionId || !currentExerciseId) return;

    try {
      setIsUpdatingSeriesOrder(true);
      const updates = exerciseSets.map((set, index) => ({
        setId: set.id,
        order: index
      }));
      
      // Update each set's order
      await Promise.all(
        updates.map(({ setId, order }) =>
          contentApi.updateSetInLibraryExercise(user.uid, sessionId, currentExerciseId, setId, { order })
        )
      );
      
      const setsData = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
      setExerciseSets(setsData);
      setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
      setIsSeriesEditMode(false);
    } catch (err) {
      console.error('Error saving series order:', err);
      alert('Error al guardar el orden de las series');
      setExerciseSets(originalSeriesOrder);
    } finally {
      setIsUpdatingSeriesOrder(false);
    }
  };

  const handleDragEndSeries = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIndex = exerciseSets.findIndex(s => s.id === active.id);
    const overIndex = exerciseSets.findIndex(s => s.id === over.id);

    if (activeIndex !== -1 && overIndex !== -1) {
      const newOrder = arrayMove(exerciseSets, activeIndex, overIndex);
      setExerciseSets(newOrder);
    }
  };

  const canSaveCreatingExercise = () => {
    if (!isCreatingExercise || !exerciseDraft) return false;
    const hasPrimary = exerciseDraft.primary && Object.values(exerciseDraft.primary || {}).length > 0;
    const hasSets = exerciseSets.length > 0 || (numberOfSetsForNewExercise >= 1);
    const measures = Array.isArray(exerciseDraft.measures) ? exerciseDraft.measures : [];
    const objectives = Array.isArray(exerciseDraft.objectives) ? exerciseDraft.objectives : [];
    const hasData = measures.length > 0 && objectives.length > 0;
    return hasPrimary && hasSets && hasData;
  };

  const handleSaveCreatingExercise = async () => {
    if (!canSaveCreatingExercise() || !user || !sessionId) return;

    try {
      const primaryValues = Object.values(exerciseDraft.primary || {});
      if (primaryValues.length === 0 || !primaryValues[0]) {
        alert('Debes seleccionar un ejercicio principal');
        return;
      }

      const primaryExerciseName = primaryValues[0];
      const nextOrder = exercises.length;

      const newExercise = await contentApi.createExerciseInLibrarySession(
        user.uid,
        sessionId,
        primaryExerciseName,
        nextOrder
      );

      const updateData = {
        primary: exerciseDraft.primary,
        alternatives: exerciseDraft.alternatives || {},
        measures: exerciseDraft.measures || [],
        objectives: exerciseDraft.objectives || [],
        name: deleteField(),
        title: deleteField()
      };
      
      await contentApi.updateExerciseInLibrarySession(user.uid, sessionId, newExercise.id, updateData);

      let setsToCreate = exerciseSets;
      if (setsToCreate.length === 0 && numberOfSetsForNewExercise >= 1) {
        const fields = (draftObjectives.filter(o => o !== 'previous').length)
          ? draftObjectives.filter(o => o !== 'previous')
          : ['reps', 'intensity'];
        const defaultSet = {};
        fields.forEach(o => {
          const v = newExerciseDefaultSetValues[o];
          defaultSet[o] = v != null && v !== '' ? v : null;
        });
        const count = Math.max(1, Math.min(20, Math.floor(numberOfSetsForNewExercise) || 1));
        setsToCreate = Array.from({ length: count }, (_, i) => ({ order: i, title: `Serie ${i + 1}`, ...defaultSet }));
      }
      for (let i = 0; i < setsToCreate.length; i++) {
        const set = setsToCreate[i];
        await contentApi.createSetInLibraryExercise(user.uid, sessionId, newExercise.id, i);
        
        const updateSetData = {};
        if (set.reps !== null && set.reps !== undefined && set.reps !== '') {
          updateSetData.reps = set.reps;
        }
        if (set.intensity !== null && set.intensity !== undefined && set.intensity !== '') {
          updateSetData.intensity = set.intensity;
        }
        
        if (Object.keys(updateSetData).length > 0) {
          const createdSets = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, newExercise.id);
          const createdSet = createdSets[createdSets.length - 1];
          if (createdSet) {
            await contentApi.updateSetInLibraryExercise(user.uid, sessionId, newExercise.id, createdSet.id, updateSetData);
          }
        }
      }

      // Reload exercises
      const sessionData = await contentApi.getLibrarySessionById(user.uid, sessionId);
      const sessionExercises = (sessionData.exercises || []).map(ex => ({
        ...ex,
        dragId: `session-${ex.id}`,
        isInSession: true
      }));
      setExercises(sessionExercises);
      await loadExercisesFromLibrary(selectedLibraryId);

      setIsExerciseModalOpen(false);
      setIsCreatingExercise(false);
      setSelectedExercise(null);
      setExerciseDraft(null);
      setExerciseSets([]);
      setOriginalExerciseSets([]);
      setUnsavedSetChanges({});
    } catch (err) {
      console.error('Error creating exercise:', err);
      alert('Error al crear el ejercicio. Por favor, intenta de nuevo.');
    }
  };

  // Handlers for exercise configuration (adapted from ProgramDetailScreen for library sessions)
  const handleEditPrimary = async () => {
    if (!user) return;
    if (!isCreatingExercise && !currentExerciseId) return;
    
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
    if (!libraryId) return;
    
    try {
      setIsLoadingExercisesFromLibrary(true);
      setSelectedLibraryForExercise(libraryId);
      
      const library = await libraryService.getLibraryById(libraryId);
      if (library) {
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
    if (!selectedLibraryForExercise || !exerciseName) return;

    try {
      if (libraryExerciseModalMode === 'primary') {
        const primaryUpdate = { [selectedLibraryForExercise]: exerciseName };
        
        setExerciseDraft(prev => ({
          ...prev,
          primary: primaryUpdate
        }));
        setSelectedExercise(prev => ({
          ...prev,
          primary: primaryUpdate
        }));
      } else if (libraryExerciseModalMode === 'add-alternative') {
        const currentAlternatives = JSON.parse(JSON.stringify(draftAlternatives));
        if (!currentAlternatives[selectedLibraryForExercise]) {
          currentAlternatives[selectedLibraryForExercise] = [];
        }
        if (!currentAlternatives[selectedLibraryForExercise].includes(exerciseName)) {
          currentAlternatives[selectedLibraryForExercise].push(exerciseName);
        }
        
        setExerciseDraft(prev => ({
          ...prev,
          alternatives: currentAlternatives
        }));
        setSelectedExercise(prev => ({
          ...prev,
          alternatives: currentAlternatives
        }));
      } else if (libraryExerciseModalMode === 'edit-alternative' && alternativeToEdit) {
        const currentAlternatives = JSON.parse(JSON.stringify(draftAlternatives));
        if (currentAlternatives[alternativeToEdit.libraryId] && 
            Array.isArray(currentAlternatives[alternativeToEdit.libraryId])) {
          currentAlternatives[alternativeToEdit.libraryId][alternativeToEdit.index] = exerciseName;
        }
        
        setExerciseDraft(prev => ({
          ...prev,
          alternatives: currentAlternatives
        }));
        setSelectedExercise(prev => ({
          ...prev,
          alternatives: currentAlternatives
        }));
      }

      if (!isCreatingExercise && currentExerciseId) {
        const updateData = {};
        if (libraryExerciseModalMode === 'primary') {
          updateData.primary = { [selectedLibraryForExercise]: exerciseName };
        } else if (libraryExerciseModalMode === 'add-alternative' || libraryExerciseModalMode === 'edit-alternative') {
          updateData.alternatives = exerciseDraft.alternatives;
        }
        
        await contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updateData);
        
        // Reload exercise
        const sessionData = await contentApi.getLibrarySessionById(user.uid, sessionId);
        const updatedEx = sessionData.exercises?.find(ex => ex.id === currentExerciseId);
        if (updatedEx) {
          setSelectedExercise(updatedEx);
          setExerciseDraft(JSON.parse(JSON.stringify(updatedEx)));
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
    if (!isCreatingExercise && !currentExerciseId) return;
    
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
    if (!user || !sessionId) return;

    try {
      const currentAlternatives = JSON.parse(JSON.stringify(draftAlternatives));
      if (currentAlternatives[libraryId] && Array.isArray(currentAlternatives[libraryId])) {
        currentAlternatives[libraryId] = currentAlternatives[libraryId].filter((_, i) => i !== index);
        
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
          return;
        }

        if (!currentExerciseId) return;

        await contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, {
          alternatives: currentAlternatives
        });

        const sessionData = await contentApi.getLibrarySessionById(user.uid, sessionId);
        const updatedEx = sessionData.exercises?.find(ex => ex.id === currentExerciseId);
        if (updatedEx) {
          setSelectedExercise(updatedEx);
          setExerciseDraft(JSON.parse(JSON.stringify(updatedEx)));
        }
      }
    } catch (err) {
      console.error('Error deleting alternative:', err);
      alert('Error al eliminar la alternativa. Por favor, intenta de nuevo.');
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
      await contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates);
      const sessionData = await contentApi.getLibrarySessionById(user.uid, sessionId);
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
            await contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates);
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
          await contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates);
          const sessionData = await contentApi.getLibrarySessionById(user.uid, sessionId);
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
      contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates).catch((err) => console.error('Error updating exercise:', err));
    }
  };

  // SortableSeriesCard component (from ProgramDetailScreen)
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
        <div
          className="exercise-series-card-header"
          onClick={() => onToggleExpansion(set.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleExpansion(set.id);
            }
          }}
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
        </div>
        
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

  // Get all unique implements from available exercises
  const allUniqueImplements = useMemo(() => {
    const implementsSet = new Set();
    availableExercises.forEach(exercise => {
      // Exercises from library have structure { name, data, ... }
      const implementsData = exercise.data?.implements || exercise.implements;
      if (implementsData && Array.isArray(implementsData)) {
        implementsData.forEach(impl => {
          if (impl && typeof impl === 'string') {
            implementsSet.add(impl);
          }
        });
      }
    });
    return Array.from(implementsSet).sort();
  }, [availableExercises]);

  // Filtered exercises based on search query, muscle filters, and implement filters
  const filteredAvailableExercises = useMemo(() => {
    let exercises = availableExercises;
    
    // Filter by search query if provided
    if (searchQuery.trim()) {
      exercises = exercises.filter(exercise => 
        exercise.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Filter by muscles if any are selected
    if (selectedMuscles.size > 0) {
      exercises = exercises.filter(exercise => {
        // Exercises from library have structure { name, data, ... }
        const muscleActivation = exercise.data?.muscle_activation || exercise.muscle_activation;
        if (!muscleActivation || typeof muscleActivation !== 'object') {
          return false;
        }
        const exerciseMuscles = Object.keys(muscleActivation);
        return Array.from(selectedMuscles).some(muscle => exerciseMuscles.includes(muscle));
      });
    }
    
    // Filter by implements if any are selected
    if (selectedImplements.size > 0) {
      exercises = exercises.filter(exercise => {
        // Exercises from library have structure { name, data, ... }
        const implementsData = exercise.data?.implements || exercise.implements;
        if (!implementsData || !Array.isArray(implementsData)) {
          return false;
        }
        return Array.from(selectedImplements).some(impl => 
          implementsData.includes(impl)
        );
      });
    }
    
    // Already sorted by name in loadExercisesFromLibrary
    return exercises;
  }, [availableExercises, searchQuery, selectedMuscles, selectedImplements]);

  // Filter modal handlers
  const handleOpenFilter = () => {
    setTempSelectedMuscles(new Set(selectedMuscles));
    setTempSelectedImplements(new Set(selectedImplements));
    setIsFilterModalVisible(true);
  };

  const handleCloseFilter = () => {
    setIsFilterModalVisible(false);
  };

  const handleToggleMuscle = (muscle) => {
    setTempSelectedMuscles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(muscle)) {
        newSet.delete(muscle);
      } else {
        newSet.add(muscle);
      }
      return newSet;
    });
  };

  const handleToggleImplement = (implement) => {
    setTempSelectedImplements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(implement)) {
        newSet.delete(implement);
      } else {
        newSet.add(implement);
      }
      return newSet;
    });
  };

  const handleClearFilter = () => {
    setTempSelectedMuscles(new Set());
    setTempSelectedImplements(new Set());
  };

  const handleApplyFilter = () => {
    setSelectedMuscles(new Set(tempSelectedMuscles));
    setSelectedImplements(new Set(tempSelectedImplements));
    setIsFilterModalVisible(false);
  };

  const handleClearAllFilters = () => {
    setSelectedMuscles(new Set());
    setSelectedImplements(new Set());
    setSearchQuery('');
  };

  const activeExercise = activeId 
    ? [...exercises, ...availableExercises].find(ex => ex.dragId === activeId)
    : null;

  if (loading) {
    return (
      <DashboardLayout 
        screenName={session?.title || 'Sesión'}
        showBackButton={true}
        backPath={backPath}
      >
        <div className="library-session-detail-container">
          <div className="library-session-detail-loading">Cargando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !session) {
    return (
      <DashboardLayout 
        screenName="Sesión"
        showBackButton={true}
        backPath={backPath}
      >
        <div className="library-session-detail-container">
          <div className="library-session-detail-error">
            <p>{error || 'Sesión no encontrada'}</p>
            <button onClick={() => navigate(backPath)} className="back-button">
              Volver a Contenido
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      screenName={session.title}
      showBackButton={true}
      backPath={backPath}
      headerBackgroundImage={session.image_url || null}
      headerImageIcon={
        <button
          type="button"
          onClick={() => setIsMediaPickerOpen(true)}
          aria-label="Cambiar imagen de la sesión"
          title="Cambiar imagen"
        >
          {session.image_url ? (
            <img src={session.image_url} alt="" />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      }
    >
      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelect={handleHeaderImageSelect}
        creatorId={user?.uid}
        accept="image/*"
      />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="library-session-detail-container">
          {(isClientEdit || isClientPlanEdit) && (
            <div className="library-session-client-edit-banner">
              <span className="library-session-client-edit-banner-text">
                {isClientPlanEdit ? (
                  <>Editando sesión de la semana solo para <strong>{clientName}</strong>. Los cambios solo afectan a esta semana para este cliente.</>
                ) : (
                  <>Editando sesión solo para <strong>{clientName}</strong>. Los cambios no afectan la biblioteca ni otros clientes.</>
                )}
              </span>
              {isClientPlanEdit && clientId && programId && weekKey && session && (
                <div className="library-session-client-plan-actions">
                  <label className="library-session-client-plan-day-label">
                    Día de la semana:
                    <select
                      value={session.dayIndex != null ? session.dayIndex : 0}
                      onChange={async (e) => {
                        const dayIndex = parseInt(e.target.value, 10);
                        try {
                          await clientPlanContentService.updateSession(clientId, programId, weekKey, sessionId, { dayIndex });
                          setSession((prev) => (prev ? { ...prev, dayIndex } : null));
                        } catch (err) {
                          console.error('Error updating day:', err);
                          alert('Error al cambiar el día.');
                        }
                      }}
                      className="library-session-client-plan-day-select"
                    >
                      <option value={0}>Lunes</option>
                      <option value={1}>Martes</option>
                      <option value={2}>Miércoles</option>
                      <option value={3}>Jueves</option>
                      <option value={4}>Viernes</option>
                      <option value={5}>Sábado</option>
                      <option value={6}>Domingo</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="library-session-client-edit-revert library-session-client-plan-delete"
                    onClick={async () => {
                      if (!window.confirm('¿Quitar esta sesión de la semana para este cliente? No se borra del plan ni de la biblioteca.')) return;
                      try {
                        await clientPlanContentService.deleteSession(clientId, programId, weekKey, sessionId);
                        navigate(backPath);
                      } catch (err) {
                        console.error('Error deleting from week:', err);
                        alert('Error al quitar la sesión.');
                      }
                    }}
                  >
                    Eliminar de esta semana
                  </button>
                </div>
              )}
              {isClientEdit && hasClientCopy && (
                <button
                  type="button"
                  className="library-session-client-edit-revert"
                  onClick={async () => {
                    if (!window.confirm('¿Restablecer esta sesión al contenido de la biblioteca? Se perderán los cambios personalizados para este cliente.')) return;
                    try {
                      await clientSessionContentService.deleteClientSessionContent(clientSessionId);
                      hasClientCopyRef.current = false;
                      setHasClientCopy(false);
                      const lib = await libraryService.getLibrarySessionById(user.uid, sessionId);
                      if (lib) {
                        setSession(lib);
                        setExercises((lib.exercises || []).map(ex => ({ ...ex, dragId: `session-${ex.id}`, isInSession: true })));
                      }
                    } catch (err) {
                      console.error('Error reverting to library:', err);
                      alert('Error al restablecer. Intenta de nuevo.');
                    }
                  }}
                >
                  Restablecer a la biblioteca
                </button>
              )}
            </div>
          )}
          <div className="library-session-detail-body">
          {/* Sidebar - Available Exercises */}
          <div className="library-session-sidebar">
            <div className="library-session-sidebar-header">
              <h3 className="library-session-sidebar-title">Ejercicios Disponibles</h3>
              <select
                className="library-session-library-select"
                value={selectedLibraryId}
                onChange={(e) => setSelectedLibraryId(e.target.value)}
              >
                {availableLibraries.map((library) => (
                  <option key={library.id} value={library.id}>
                    {library.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Box */}
            <div className="library-session-search-container">
              <div className="library-session-search-input-container">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="library-session-search-icon">
                  <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <input
                  type="text"
                  className="library-session-search-input"
                  placeholder="Buscar ejercicios..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Filter Button */}
            <div className="library-session-filter-container">
              <button
                className={`library-session-filter-button ${(selectedMuscles.size > 0 || selectedImplements.size > 0) ? 'active' : ''}`}
                onClick={handleOpenFilter}
              >
                <span className="library-session-filter-button-text">
                  Filtros
                  {(selectedMuscles.size > 0 || selectedImplements.size > 0) && (
                    <span className="library-session-filter-badge">
                      {' '}({selectedMuscles.size + selectedImplements.size})
                    </span>
                  )}
                </span>
              </button>
            </div>

            {/* Active Filters Display */}
            {(selectedMuscles.size > 0 || selectedImplements.size > 0) && (
              <div className="library-session-active-filters">
                <div className="library-session-active-filters-scroll">
                  {selectedMuscles.size > 0 && Array.from(selectedMuscles).sort().map(muscle => (
                    <div
                      key={muscle}
                      className="library-session-active-filter-chip"
                      onClick={handleOpenFilter}
                    >
                      <span className="library-session-active-filter-chip-text">{getMuscleDisplayName(muscle)}</span>
                    </div>
                  ))}
                  {selectedImplements.size > 0 && Array.from(selectedImplements).sort().map(implement => (
                    <div
                      key={implement}
                      className="library-session-active-filter-chip"
                      onClick={handleOpenFilter}
                    >
                      <span className="library-session-active-filter-chip-text">{implement}</span>
                    </div>
                  ))}
                  <div
                    className="library-session-clear-all-filters-button"
                    onClick={handleClearAllFilters}
                  >
                    <span className="library-session-clear-all-filters-text">Limpiar todo</span>
                  </div>
                </div>
              </div>
            )}
            
            <div className="library-session-sidebar-content">
              {filteredAvailableExercises.length === 0 ? (
                <div className="library-session-empty-state">
                  <p>
                    {searchQuery.trim() || selectedMuscles.size > 0 || selectedImplements.size > 0
                      ? 'No se encontraron ejercicios'
                      : 'No hay ejercicios disponibles en esta biblioteca'}
                  </p>
                </div>
              ) : (
                <div className="draggable-exercises-list">
                  {filteredAvailableExercises.map((exercise) => (
                    <DraggableExercise
                      key={exercise.dragId}
                      exercise={exercise}
                      libraryTitle={exercise.libraryTitle}
                      libraryIcon={exercise.libraryIcon}
                      isInSession={false}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main Area - Session Exercises */}
          <div className="library-session-main">
            <div className="library-session-main-header">
              <div>
                <h2 className="library-session-main-title">Ejercicios en la Sesión</h2>
                <p className="library-session-main-subtitle">
                  Arrastra ejercicios desde el panel izquierdo o reorganiza los existentes
                </p>
              </div>
              <button
                className={`library-session-edit-button ${isEditMode ? 'active' : ''}`}
                onClick={() => setIsEditMode(!isEditMode)}
              >
                {isEditMode ? 'Guardar Orden' : 'Editar'}
              </button>
            </div>

            <DropZone
              id="session-list"
              className={`library-session-exercises-container ${exercises.length === 0 ? 'empty' : ''}`}
            >
              {exercises.length === 0 ? (
                <div className="library-session-dropzone">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" opacity="0.3">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M19 11H5M12 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <p>Arrastra ejercicios aquí para agregarlos a la sesión</p>
                </div>
              ) : (
                <SortableContext
                  items={exercises.map(ex => ex.dragId)}
                  strategy={verticalListSortingStrategy}
                >
                  {exercises.map((exercise, index) => (
                    <DraggableExercise
                      key={exercise.dragId}
                      exercise={{
                        ...exercise,
                        name: getExerciseDisplayName(exercise)
                      }}
                      libraryIcon={getExerciseLibraryIcon(exercise)}
                      isInSession={true}
                      isIncomplete={isSessionExerciseIncomplete(exercise)}
                      onDelete={isEditMode ? handleDeleteExercise : null}
                      isEditMode={isEditMode}
                      onClick={handleExerciseClick}
                    />
                  ))}
                </SortableContext>
              )}
            </DropZone>
          </div>
          </div>
        </div>

        <DragOverlay>
          {activeExercise ? (
            <div className="draggable-exercise dragging-overlay">
              <div className="draggable-exercise-content">
                <div className="draggable-exercise-icon">
                  {(() => {
                    const icon = activeExercise.libraryIcon || getExerciseLibraryIcon(activeExercise);
                    if (icon) {
                      return typeof icon === 'string' && icon.startsWith('http') ? (
                        <img 
                          src={icon} 
                          alt={activeExercise.libraryTitle || 'Library icon'} 
                          className="draggable-exercise-icon-image"
                        />
                      ) : (
                        renderIconSVG(icon, 20)
                      );
                    }
                    return (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    );
                  })()}
                </div>
                <div className="draggable-exercise-info">
                  <div className="draggable-exercise-name">
                    {activeExercise.name || getExerciseDisplayName(activeExercise)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setExerciseToDelete(null);
          setDeleteConfirmation('');
        }}
        title={exerciseToDelete ? getExerciseDisplayName(exerciseToDelete) : 'Eliminar ejercicio'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre del ejercicio:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={exerciseToDelete ? getExerciseDisplayName(exerciseToDelete) : 'Nombre del ejercicio'}
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${deleteConfirmation.trim() !== (exerciseToDelete ? getExerciseDisplayName(exerciseToDelete) : '') ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDelete}
              disabled={deleteConfirmation.trim() !== (exerciseToDelete ? getExerciseDisplayName(exerciseToDelete) : '') || isDeleting}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción es irreversible. El ejercicio se eliminará permanentemente de esta sesión.
          </p>
        </div>
      </Modal>

      {/* Exercise Modal - Full Configuration */}
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
          
          <div className="exercise-modal-main-content">
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
                                      <span className="exercise-horizontal-card-name">
                                        {typeof alternativeName === 'string'
                                          ? alternativeName
                                          : alternativeName?.name || alternativeName?.title || `Alternativa ${index + 1}`}
                                        {(() => {
                                          const alternativeKeyName = typeof alternativeName === 'string'
                                            ? alternativeName
                                            : alternativeName?.name || alternativeName?.title || alternativeName?.id;
                                          return isLibraryExerciseIncomplete(libraryId, alternativeKeyName) && (
                                            <span
                                              className="exercise-incomplete-icon-small exercise-incomplete-icon-inline"
                                              title="Esta alternativa de la biblioteca está incompleta"
                                            >
                                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                              </svg>
                                            </span>
                                          );
                                        })()}
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
            
            {/* Right Side - Sets Panel */}
            <div className="exercise-modal-right-panel">
              <div className="exercise-sets-panel-header">
                <h3 className="exercise-sets-panel-title">Series</h3>
                {isCreatingExercise && (
                  <span className="one-on-one-modal-section-badge">Requerido</span>
                )}
              </div>
              
              <div className="exercise-sets-panel-content">
                {/* Series number card always visible */}
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
                  <button
                    type="button"
                    className="sets-panel-toggle-detail"
                    onClick={() => setShowPerSetCards(prev => !prev)}
                  >
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
                      <button 
                        className={`exercise-action-pill ${isSeriesEditMode ? 'exercise-action-pill-disabled' : ''}`}
                        onClick={handleCreateSet}
                        disabled={isSeriesEditMode || isCreatingSet}
                      >
                        <span className="exercise-action-icon">+</span>
                        <span className="exercise-action-text">Agregar Serie</span>
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
                          <div className="sets-detail-list">
                            {exerciseSets.map((set, setIndex) => {
                              const objectivesFields = (draftObjectives || []).filter(obj => ['reps', 'intensity'].includes(obj));
                              return (
                                <SortableSeriesCard
                                  key={set.id}
                                  set={set}
                                  setIndex={setIndex}
                                  isSeriesEditMode={true}
                                  isExpanded={true}
                                  onToggleExpansion={() => {}}
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
                              {((draftObjectives || []).filter(o => o !== 'previous').length
                                ? (draftObjectives || []).filter(o => o !== 'previous')
                                : ['reps', 'intensity']
                              ).map((field) => (
                                <th key={field} className="sets-detail-th">
                                  {getObjectiveDisplayName(field)}
                                </th>
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
                                          <input
                                            type="text"
                                            className="exercise-series-input exercise-series-intensity-input sets-detail-input"
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
                                          className="exercise-series-input sets-detail-input"
                                          placeholder="--"
                                          value={set[field] !== undefined && set[field] !== null ? String(set[field]) : ''}
                                          onChange={(e) => handleUpdateSetValue(setIndex, field, e.target.value)}
                                        />
                                      )}
                                    </td>
                                  ))}
                                  <td className="sets-detail-td sets-detail-td-actions">
                                    <button
                                      type="button"
                                      className="sets-detail-action-btn"
                                      onClick={() => handleDuplicateSet(set)}
                                      title="Duplicar"
                                    >
                                      ⧉
                                    </button>
                                    {unsavedSetChanges[set.id] && (
                                      <button
                                        type="button"
                                        className="sets-detail-action-btn sets-detail-save"
                                        onClick={() => handleSaveSetChanges(set.id)}
                                        disabled={isSavingSetChanges}
                                      >
                                        {isSavingSetChanges ? '…' : 'Guardar'}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="sets-detail-action-btn sets-detail-delete"
                                      onClick={() => handleDeleteSet(set)}
                                      title="Eliminar"
                                    >
                                      ×
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {isSeriesEditMode && (
                      <p className="sets-detail-drag-hint">Arrastra las filas para cambiar el orden.</p>
                    )}
                  </>
                ) : null}
                </>
                )}
                
                {isCreatingExercise && (
                  <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <Button
                      title="Crear Ejercicio (⌘↵)"
                      onClick={handleSaveCreatingExercise}
                      disabled={!canSaveCreatingExercise()}
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
                  ? {
                      measures: p.measures || [],
                      objectives: p.objectives || [],
                      customMeasureLabels: p.customMeasureLabels || {},
                      customObjectiveLabels: p.customObjectiveLabels || {},
                    }
                  : { measures: draftMeasures, objectives: draftObjectives, customMeasureLabels: draftCustomMeasureLabels, customObjectiveLabels: draftCustomObjectiveLabels };
              })()
            : {
                measures: draftMeasures,
                objectives: draftObjectives,
                customMeasureLabels: draftCustomMeasureLabels,
                customObjectiveLabels: draftCustomObjectiveLabels,
              }
        }
        onSave={handleMeasuresObjectivesEditorSave}
        onChange={handleMeasuresObjectivesEditorChange}
        mode={editorModalMode}
        initialPresetName={
          editorModalMode === 'edit_preset' && presetBeingEditedId
            ? (presetsList.find((p) => p.id === presetBeingEditedId)?.name || '')
            : ''
        }
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
                      <span className="library-exercise-selection-item-name">{library.title || library.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="library-exercise-selection-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 className="library-exercise-selection-step-title">Paso 2: Selecciona un ejercicio</h4>
                <button
                  className="library-exercise-selection-back-button"
                  onClick={() => {
                    setSelectedLibraryForExercise(null);
                    setExercisesFromSelectedLibrary([]);
                  }}
                >
                  ← Volver
                </button>
              </div>
              {isLoadingExercisesFromLibrary ? (
                <div className="library-exercise-selection-loading">
                  <p>Cargando ejercicios...</p>
                </div>
              ) : exercisesFromSelectedLibrary.length === 0 ? (
                <div className="library-exercise-selection-empty">
                  <p>No hay ejercicios en esta biblioteca.</p>
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
                      {isLibraryExerciseIncomplete(selectedLibraryForExercise, exercise.name) && (
                        <span
                          className="exercise-incomplete-icon-small"
                          title="Este ejercicio de la biblioteca está incompleto"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Filter Modal */}
      <Modal
        isOpen={isFilterModalVisible}
        onClose={handleCloseFilter}
        title="Filtrar Ejercicios"
      >
        <div className="filter-modal-content">
          {/* Muscle Filter Section */}
          <div className="filter-section">
            <h3 className="filter-section-title">Músculos</h3>
            <div className="muscle-silhouette-container">
              <MuscleSilhouetteSVG
                selectedMuscles={tempSelectedMuscles}
                onMuscleClick={handleToggleMuscle}
              />
            </div>
            
            {/* Selected Muscles List */}
            {tempSelectedMuscles.size > 0 && (
              <div className="selected-items-container">
                {Array.from(tempSelectedMuscles).sort().map(muscle => (
                  <div
                    key={muscle}
                    className="filter-chip"
                    onClick={() => handleToggleMuscle(muscle)}
                  >
                    <span className="filter-chip-text">
                      {getMuscleDisplayName(muscle)}
                    </span>
                    <span className="filter-chip-remove">×</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Implement Filter Section */}
          {allUniqueImplements.length > 0 && (
            <div className="filter-section">
              <h3 className="filter-section-title">Implementos</h3>
              <div className="implements-container">
                {allUniqueImplements.map(implement => {
                  const isSelected = tempSelectedImplements.has(implement);
                  return (
                    <div
                      key={implement}
                      className={`implement-chip ${isSelected ? 'implement-chip-selected' : ''}`}
                      onClick={() => handleToggleImplement(implement)}
                    >
                      <span className={`implement-chip-text ${isSelected ? 'implement-chip-text-selected' : ''}`}>
                        {implement}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Filter Actions */}
        <div className="filter-modal-actions">
          <button
            className={`filter-clear-button ${tempSelectedMuscles.size === 0 && tempSelectedImplements.size === 0 ? 'filter-button-disabled' : ''}`}
            onClick={handleClearFilter}
            disabled={tempSelectedMuscles.size === 0 && tempSelectedImplements.size === 0}
          >
            <span className={`filter-clear-button-text ${tempSelectedMuscles.size === 0 && tempSelectedImplements.size === 0 ? 'filter-button-text-disabled' : ''}`}>
              Limpiar
            </span>
          </button>
          <button
            className="filter-apply-button"
            onClick={handleApplyFilter}
          >
            <span className="filter-apply-button-text">Aplicar</span>
          </button>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default LibrarySessionDetailScreen;
