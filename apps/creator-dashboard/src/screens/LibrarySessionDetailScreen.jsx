import logger from '../utils/logger';
import { useToast } from '../contexts/ToastContext';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, cacheConfig } from '../config/queryClient';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ShimmerSkeleton from '../components/ui/ShimmerSkeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import { FullScreenError, GlowingEffect, AnimatedList, ScrollProgress } from '../components/ui';
import { extractAccentFromImage } from '../components/events/eventFieldComponents';
import MediaPickerModal from '../components/MediaPickerModal';
import MediaDropZone from '../components/ui/MediaDropZone';
import Modal from '../components/Modal';
import Button from '../components/Button';
import MeasuresObjectivesEditorModal from '../components/MeasuresObjectivesEditorModal';
import libraryService from '../services/libraryService';
import measureObjectivePresetsService from '../services/measureObjectivePresetsService';
import clientSessionContentService from '../services/clientSessionContentService';
import clientPlanContentService from '../services/clientPlanContentService';
import programPlanContentService from '../services/programPlanContentService';
import plansService from '../services/plansService';
import propagationService from '../services/propagationService';
import PropagateChangesModal from '../components/PropagateChangesModal';
import PropagateNavigateModal from '../components/PropagateNavigateModal';
import { ProgressiveRevealProvider } from '../contexts/ProgressiveRevealContext';
import { Revealable, RevealProgressBar } from '../components/guide';
import EditScopeInfoModal from '../components/EditScopeInfoModal';
import '../components/PropagateChangesModal.css';
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
import MuscleSilhouetteSVG from '../components/MuscleSilhouetteSVG';
import { ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis } from 'recharts';
import ExpandableExerciseCard from '../components/biblioteca/ExpandableExerciseCard';
import SessionVolumeDrawer from '../components/SessionVolumeDrawer';
import './LibrarySessionDetailScreen.css';
import './ProgramDetailScreen.css';
import './SharedScreenLayout.css';
import useConfirm from '../hooks/useConfirm';

// Stable reference for empty array props (avoids new [] on every render)
const EMPTY_ARRAY = [];

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
    .map(([libraryId, value]) => {
      const exerciseName = typeof value === 'string' ? value : (value?.name || value?.title || value?.id || '');
      return { libraryId, exerciseName };
    })
    .filter(({ libraryId, exerciseName }) => Boolean(libraryId) && Boolean(exerciseName));
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
const DraggableExercise = ({ exercise, libraryTitle, isInSession = false, isIncomplete = false, onDelete, isEditMode, onClick, onAdd }) => {
  const [addAnimating, setAddAnimating] = useState(false);
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

  const nameOrTitle = (exercise.name && typeof exercise.name === 'string' && exercise.name.trim()) ? exercise.name.trim() : (exercise.title && typeof exercise.title === 'string' && exercise.title.trim()) ? exercise.title.trim() : '';
  const rawPrimaryName = exercise.primary && typeof exercise.primary === 'object' ? Object.values(exercise.primary)[0] : undefined;
  const primaryStr = typeof rawPrimaryName === 'string' ? rawPrimaryName : (rawPrimaryName && typeof rawPrimaryName === 'object' ? (rawPrimaryName.name || rawPrimaryName.title || rawPrimaryName.id) : null);
  const primaryDisplay = (primaryStr != null && String(primaryStr).trim()) ? String(primaryStr).trim() : '';
  const exerciseName = (nameOrTitle && nameOrTitle.toLowerCase() !== 'ejercicio') ? nameOrTitle : primaryDisplay || nameOrTitle || 'Ejercicio';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`draggable-exercise ${isDragging ? 'dragging' : ''} ${isInSession ? 'exercise-in-session' : 'exercise-available'}`}
      {...attributes}
      {...listeners}
      onClick={onClick ? () => onClick(exercise) : undefined}
    >
      <GlowingEffect spread={40} proximity={80} borderWidth={1} disabled={isDragging} />
      <div className="draggable-exercise-content">
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
      {!isInSession && onAdd && (
        <button
          className={`draggable-exercise-add${addAnimating ? ' adding' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setAddAnimating(true);
            onAdd(exercise);
          }}
          title="Agregar a la sesión"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
};

const CLIENT_EDIT_STORAGE_KEY = 'creator_librarySession_clientEditContext';

function getStoredClientEditContext(sessId) {
  if (!sessId || typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(CLIENT_EDIT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data[sessId] || null;
  } catch {
    return null;
  }
}

function setStoredClientEditContext(sessId, ctx) {
  if (!sessId || typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    const raw = window.sessionStorage.getItem(CLIENT_EDIT_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    if (ctx) {
      data[sessId] = ctx;
    } else {
      delete data[sessId];
    }
    window.sessionStorage.setItem(CLIENT_EDIT_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    logger.warn('[LibrarySessionDetail] could not persist client-edit context', e);
  }
}

const LibrarySessionDetailScreen = () => {
  const params = useParams();
  const { sessionId, planId: planInstancePlanId, moduleId: planInstanceModuleId } = params;
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmModal } = useConfirm();
  const queryClient = useQueryClient();
  const isPlanInstanceEdit = Boolean(planInstancePlanId && planInstanceModuleId && sessionId && location.pathname.includes('/plans/') && location.pathname.includes('/edit'));
  const backPath = isPlanInstanceEdit ? `/plans/${planInstancePlanId}` : (location.state?.returnTo || '/biblioteca?domain=entrenamiento&tab=sesiones');
  const backState = location.state?.returnState ?? {};
  const editScope = location.state?.editScope;
  const clientSessionId = location.state?.clientSessionId;
  const clientId = location.state?.clientId;
  const clientName = location.state?.clientName || 'Cliente';
  const programName = location.state?.programName || 'Programa';
  const programId = location.state?.programId;
  const weekKey = location.state?.weekKey;
  const isClientEdit = editScope === 'client' && clientSessionId;
  const isClientPlanEdit = editScope === 'client_plan' && clientId && programId && weekKey;
  const isProgramPlanEdit = editScope === 'program_plan' && programId && weekKey;

  // Persist client-edit context (ref + sessionStorage) so we don't overwrite with library when location.state is lost or component remounts
  const clientEditContextRef = useRef({
    editScope: null,
    clientSessionId: null,
    clientId: null,
    programId: null,
    programName: null,
    weekKey: null
  });
  const storedContext = sessionId ? getStoredClientEditContext(sessionId) : null;

  if (editScope && (clientSessionId || clientId || programId)) {
    const nextCtx = {
      editScope,
      clientSessionId: clientSessionId ?? clientEditContextRef.current.clientSessionId,
      clientId: clientId ?? clientEditContextRef.current.clientId,
      programId: programId ?? clientEditContextRef.current.programId,
      programName: programName ?? clientEditContextRef.current.programName,
      weekKey: weekKey ?? clientEditContextRef.current.weekKey
    };
    clientEditContextRef.current = nextCtx;
    if (sessionId) setStoredClientEditContext(sessionId, nextCtx);
  }

  // Effective client-edit values: location.state -> ref -> sessionStorage (survives remounts and state loss)
  // Use sessionStorage fallback when: editScope is present OR location.state is null (page reload).
  // Skip sessionStorage only when location.state exists but has no editScope (explicit navigation from library).
  const isPageReload = location.state == null;
  const useStoredFallback = !!(editScope || clientEditContextRef.current.editScope || isPageReload);
  const effectiveClientSessionId = clientSessionId ?? clientEditContextRef.current.clientSessionId ?? (useStoredFallback ? storedContext?.clientSessionId : null);
  const effectiveClientId = clientId ?? clientEditContextRef.current.clientId ?? (useStoredFallback ? storedContext?.clientId : null);
  const effectiveProgramId = programId ?? clientEditContextRef.current.programId ?? (useStoredFallback ? storedContext?.programId : null);
  const effectiveProgramName = programName ?? clientEditContextRef.current.programName ?? (useStoredFallback ? storedContext?.programName : null) ?? 'Programa';
  const effectiveWeekKey = weekKey ?? clientEditContextRef.current.weekKey ?? (useStoredFallback ? storedContext?.weekKey : null);
  const effectiveEditScope = editScope ?? clientEditContextRef.current.editScope ?? (useStoredFallback ? storedContext?.editScope : null);
  const effectiveIsClientEdit = (effectiveEditScope === 'client') && !!effectiveClientSessionId;
  const effectiveIsClientPlanEdit = (effectiveEditScope === 'client_plan') && !!effectiveClientId && !!effectiveProgramId && !!effectiveWeekKey;
  const effectiveIsProgramPlanEdit = (effectiveEditScope === 'program_plan') && !!effectiveProgramId && !!effectiveWeekKey;

  // Unified plan-content editing: both client_plan and program_plan use the same data flow,
  // just different services. We create a thin adapter so all call sites use the same signature.
  const effectiveIsAnyPlanContentEdit = effectiveIsClientPlanEdit || effectiveIsProgramPlanEdit;
  const planContentApi = useMemo(() => {
    if (effectiveIsProgramPlanEdit) {
      const s = programPlanContentService;
      const pid = effectiveProgramId;
      return {
        getSessionContent: (wk, sid) => s.getSessionContent(pid, wk, sid),
        getExercisesBySession: (wk, sid) => s.getExercisesBySession(pid, wk, sid),
        getSetsByExercise: (wk, sid, eid) => s.getSetsByExercise(pid, wk, sid, eid),
        updateSet: (wk, sid, eid, setId, data) => s.updateSet(pid, wk, sid, eid, setId, data),
        addSetToExercise: (wk, sid, eid, order) => s.addSetToExercise(pid, wk, sid, eid, order),
        deleteSet: (wk, sid, eid, setId) => s.deleteSet(pid, wk, sid, eid, setId),
        updateSession: (wk, sid, updates) => s.updateSession(pid, wk, sid, updates),
        updateExercise: (wk, sid, eid, updates) => s.updateExercise(pid, wk, sid, eid, updates),
        createExercise: (wk, sid, name, order) => s.createExercise(pid, wk, sid, name, order),
        deleteExercise: (wk, sid, eid) => s.deleteExercise(pid, wk, sid, eid),
      };
    }
    if (effectiveIsClientPlanEdit) {
      const s = clientPlanContentService;
      const cid = effectiveClientId;
      const pid = effectiveProgramId;
      return {
        getSessionContent: (wk, sid) => s.getClientPlanSessionContent(cid, pid, wk, sid),
        getExercisesBySession: (wk, sid) => s.getExercisesBySession(cid, pid, wk, sid),
        getSetsByExercise: (wk, sid, eid) => s.getSetsByExercise(cid, pid, wk, sid, eid),
        updateSet: (wk, sid, eid, setId, data) => s.updateSet(cid, pid, wk, sid, eid, setId, data),
        addSetToExercise: (wk, sid, eid, order) => s.addSetToExercise(cid, pid, wk, sid, eid, order),
        deleteSet: (wk, sid, eid, setId) => s.deleteSet(cid, pid, wk, sid, eid, setId),
        updateSession: (wk, sid, updates) => s.updateSession(cid, pid, wk, sid, updates),
        updateExercise: (wk, sid, eid, updates) => s.updateExercise(cid, pid, wk, sid, eid, updates),
        createExercise: (wk, sid, name, order) => s.createExercise(cid, pid, wk, sid, name, order),
        deleteExercise: (wk, sid, eid) => s.deleteExercise(cid, pid, wk, sid, eid),
      };
    }
    return null;
  }, [effectiveIsClientPlanEdit, effectiveIsProgramPlanEdit, effectiveClientId, effectiveProgramId]);

  const hasClientCopyRef = useRef(false);
  const [hasClientCopy, setHasClientCopy] = useState(false);
  const [showScopeInfo, setShowScopeInfo] = useState(false);
  const [exercises, setExercises] = useState([]);
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;
  const [availableLibraries, setAvailableLibraries] = useState([]);
  const availableLibrariesRef = useRef(availableLibraries);
  availableLibrariesRef.current = availableLibraries;
  const [availableExercises, setAvailableExercises] = useState([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState('');
  const isEditMode = true;
  const [activeId, setActiveId] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscles, setSelectedMuscles] = useState(new Set()); // Applied muscle filter
  const [tempSelectedMuscles, setTempSelectedMuscles] = useState(new Set()); // Temporary selection in filter modal
  const [selectedImplements, setSelectedImplements] = useState(new Set()); // Applied implement filter
  const [tempSelectedImplements, setTempSelectedImplements] = useState(new Set()); // Temporary selection in filter modal
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [exerciseToDelete, setExerciseToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // Exercise Configuration Modal State (matching ProgramDetailScreen)
  const [isAlternativesEditMode, setIsAlternativesEditMode] = useState(false);
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [exerciseDraft, setExerciseDraft] = useState(null);
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [isSavingNewExercise, setIsSavingNewExercise] = useState(false);
  const [libraryTitles, setLibraryTitles] = useState({}); // Map: libraryId -> library title
  const [libraryDataCache, setLibraryDataCache] = useState({}); // Map: libraryId -> full library data
  const libraryDataCacheRef = useRef(libraryDataCache);
  libraryDataCacheRef.current = libraryDataCache;
  const [libraryExerciseCompleteness, setLibraryExerciseCompleteness] = useState({}); // Map: libraryId::exerciseName -> boolean
  
  const [isLibraryExerciseModalOpen, setIsLibraryExerciseModalOpen] = useState(false);
  const [libraryExerciseModalMode, setLibraryExerciseModalMode] = useState(null); // 'primary', 'add-alternative', 'edit-alternative'
  const [availableLibrariesForSelection, setAvailableLibrariesForSelection] = useState([]);
  const [selectedLibraryForExercise, setSelectedLibraryForExercise] = useState(null);
  const [exercisesFromSelectedLibrary, setExercisesFromSelectedLibrary] = useState([]);
  const [isLoadingLibrariesForSelection, setIsLoadingLibrariesForSelection] = useState(false);
  const [isLoadingExercisesFromLibrary, setIsLoadingExercisesFromLibrary] = useState(false);
  const [alternativeToEdit, setAlternativeToEdit] = useState(null); // { libraryId, index } for editing alternatives
  const [libraryPickerLibrarySearch, setLibraryPickerLibrarySearch] = useState('');
  const [libraryPickerExerciseSearch, setLibraryPickerExerciseSearch] = useState('');
  const [isSavingLibraryExerciseChoice, setIsSavingLibraryExerciseChoice] = useState(false);
  const [pickerActiveExerciseId, setPickerActiveExerciseId] = useState(null); // which exercise card has the picker open
  const [pickerMode, setPickerMode] = useState(null); // 'primary' | 'add-alternative'

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
  const volumeCardsRowRef = useRef(null);
  const [volumeCanScrollLeft, setVolumeCanScrollLeft] = useState(false);
  const [volumeCanScrollRight, setVolumeCanScrollRight] = useState(false);

  const updateVolumeChevronState = useCallback(() => {
    const el = volumeCardsRowRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const threshold = 4;
    setVolumeCanScrollLeft(scrollLeft > threshold);
    setVolumeCanScrollRight(scrollLeft < scrollWidth - clientWidth - threshold);
  }, []);

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
  const [optimisticSetsCount, setOptimisticSetsCount] = useState(null); // When adding sets to existing exercise, show this until API completes
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);

  // Auto-save set changes (debounced)
  const pendingSetSavesRef = useRef(new Set());
  const saveSetTimeoutRef = useRef(null);
  const saveSetChangesRef = useRef(null);

  // Debounce timer for measures/objectives editor onChange API calls
  const measuresChangeTimerRef = useRef(null);

  // Propagate changes modal (library session only)
  const [isPropagateModalOpen, setIsPropagateModalOpen] = useState(false);
  const [isNavigateModalOpen, setIsNavigateModalOpen] = useState(false);
  const [propagateAffectedCount, setPropagateAffectedCount] = useState(0);
  const [propagateAffectedUsers, setPropagateAffectedUsers] = useState([]);
  const [propagateAffectedPrograms, setPropagateAffectedPrograms] = useState([]);
  const [isPropagating, setIsPropagating] = useState(false);
  const [hasMadeChanges, setHasMadeChanges] = useState(false);

  // Library usage count (how many programs/plans reference this session)
  const [libraryUsageCount, setLibraryUsageCount] = useState(0);

  // New: expandable exercise cards + volume drawer + settings panel
  const [expandedExerciseIds, setExpandedExerciseIds] = useState(new Set());
  const [isVolumeDrawerOpen, setIsVolumeDrawerOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [newlyAddedIds, setNewlyAddedIds] = useState(new Set());
  const initialLoadAnimatedRef = useRef(false);

  // Live sets map: exerciseId -> sets[] — fed by ExpandableExerciseCard children AND bulk preload for volume
  const [liveSetsMap, setLiveSetsMap] = useState({});
  const [volumeDataLoading, setVolumeDataLoading] = useState(true);
  const handleSetsChanged = useCallback((exerciseId, newSets) => {
    setLiveSetsMap(prev => {
      if (prev[exerciseId] === newSets) return prev;
      return { ...prev, [exerciseId]: newSets };
    });
  }, []);

  // Accent color extraction from session image
  const [accentRgb, setAccentRgb] = useState(null);

  const toggleExerciseExpand = useCallback((id) => {
    setExpandedExerciseIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Memoized callbacks for ExpandableExerciseCard ──────────────────────────
  const handleExerciseUpdated = useCallback(() => {
    setHasMadeChanges(true);
    queryClient.invalidateQueries({ queryKey: ['library', 'session', sessionId] });
  }, [sessionId, queryClient]);

  const handleCardEditPrimary = useCallback((ex) => {
    setSelectedExercise(ex);
    setExerciseDraft(JSON.parse(JSON.stringify(ex)));
    setPickerActiveExerciseId(ex.id);
    setPickerMode('primary');
    setSelectedLibraryForExercise(null);
    setExercisesFromSelectedLibrary([]);
    setAvailableLibrariesForSelection(availableLibraries);
  }, [availableLibraries]);

  const handleCardAddAlternative = useCallback((ex) => {
    setSelectedExercise(ex);
    setExerciseDraft(JSON.parse(JSON.stringify(ex)));
    setPickerActiveExerciseId(ex.id);
    setPickerMode('add-alternative');
    setSelectedLibraryForExercise(null);
    setExercisesFromSelectedLibrary([]);
    setAvailableLibrariesForSelection(availableLibraries);
  }, [availableLibraries]);

  const ensureClientCopy = useCallback(async () => {
    if (!effectiveIsClientEdit || hasClientCopyRef.current || !user || !sessionId) return;
    try {
      const lib = await libraryService.getLibrarySessionById(user.uid, sessionId);
      if (lib) {
        await clientSessionContentService.copyFromLibrary(user.uid, effectiveClientSessionId, sessionId, lib);
        hasClientCopyRef.current = true;
        setHasClientCopy(true);
      }
    } catch (err) {
      logger.error('Error ensuring client copy:', err);
      throw err;
    }
  }, [effectiveIsClientEdit, effectiveClientSessionId, user, sessionId]);

  const contentApi = useMemo(() => {
    const effectiveSessionId = effectiveIsClientEdit ? effectiveClientSessionId : sessionId;
    const markLibraryChanged = () => setHasMadeChanges(true);
    const planId = planInstancePlanId;
    const moduleId = planInstanceModuleId;
    return {
      async ensureCopy() {
        if (effectiveIsClientEdit) await ensureClientCopy();
      },
      async updateSetInLibraryExercise(uid, sessId, exId, setId, data) {
        await this.ensureCopy();
        if (isPlanInstanceEdit && planId && moduleId) { const r = await plansService.updateSet(planId, moduleId, sessId, exId, setId, data); setHasMadeChanges(true); return r; }
        if (effectiveIsAnyPlanContentEdit) return planContentApi.updateSet(effectiveWeekKey, sessId, exId, setId, data);
        if (effectiveIsClientEdit) return clientSessionContentService.updateSetInExercise(effectiveSessionId, exId, setId, data);
        const result = await libraryService.updateSetInLibraryExercise(uid, sessId, exId, setId, data);
        markLibraryChanged();
        return result;
      },
      async createSetInLibraryExercise(uid, sessId, exId, order = null) {
        await this.ensureCopy();
        if (isPlanInstanceEdit && planId && moduleId) { const r = await plansService.createSet(planId, moduleId, sessId, exId, order); setHasMadeChanges(true); return r; }
        if (effectiveIsAnyPlanContentEdit) return planContentApi.addSetToExercise(effectiveWeekKey, sessId, exId, order ?? undefined);
        if (effectiveIsClientEdit) return clientSessionContentService.addSetToExercise(effectiveSessionId, exId, { order: order ?? 0, title: `Serie ${(order ?? 0) + 1}` });
        const result = await libraryService.createSetInLibraryExercise(uid, sessId, exId, order);
        markLibraryChanged();
        return result;
      },
      async deleteSetFromLibraryExercise(uid, sessId, exId, setId) {
        await this.ensureCopy();
        if (isPlanInstanceEdit && planId && moduleId) { const r = await plansService.deleteSet(planId, moduleId, sessId, exId, setId); setHasMadeChanges(true); return r; }
        if (effectiveIsAnyPlanContentEdit) return planContentApi.deleteSet(effectiveWeekKey, sessId, exId, setId);
        if (effectiveIsClientEdit) return clientSessionContentService.deleteSet(effectiveSessionId, exId, setId);
        const result = await libraryService.deleteSetFromLibraryExercise(uid, sessId, exId, setId);
        markLibraryChanged();
        return result;
      },
      async getSetsByLibraryExercise(uid, sessId, exId) {
        if (isPlanInstanceEdit && planId && moduleId) return plansService.getSetsByExercise(planId, moduleId, sessId, exId);
        if (effectiveIsAnyPlanContentEdit) return planContentApi.getSetsByExercise(effectiveWeekKey, sessId, exId);
        if (effectiveIsClientEdit) return clientSessionContentService.getSetsForExercise(effectiveSessionId, exId);
        return libraryService.getSetsByLibraryExercise(uid, sessId, exId);
      },
      async updateLibrarySession(uid, sessId, updates) {
        await this.ensureCopy();
        if (isPlanInstanceEdit && planId && moduleId) { const r = await plansService.updateSession(planId, moduleId, sessId, updates); setHasMadeChanges(true); return r; }
        if (effectiveIsAnyPlanContentEdit) return planContentApi.updateSession(effectiveWeekKey, sessId, updates);
        if (effectiveIsClientEdit) return clientSessionContentService.updateSession(effectiveSessionId, updates);
        const result = await libraryService.updateLibrarySession(uid, sessId, updates);
        markLibraryChanged();
        return result;
      },
      async updateExerciseInLibrarySession(uid, sessId, exId, updates) {
        await this.ensureCopy();
        if (isPlanInstanceEdit && planId && moduleId) { const r = await plansService.updateExercise(planId, moduleId, sessId, exId, updates); setHasMadeChanges(true); return r; }
        if (effectiveIsAnyPlanContentEdit) return planContentApi.updateExercise(effectiveWeekKey, sessId, exId, updates);
        if (effectiveIsClientEdit) return clientSessionContentService.updateExercise(effectiveSessionId, exId, updates);
        const result = await libraryService.updateExerciseInLibrarySession(uid, sessId, exId, updates);
        markLibraryChanged();
        return result;
      },
      async createExerciseInLibrarySession(uid, sessId, exerciseName, order) {
        await this.ensureCopy();
        if (isPlanInstanceEdit && planId && moduleId) { const r = await plansService.createExercise(planId, moduleId, sessId, exerciseName?.trim?.() || exerciseName || 'Ejercicio', order); setHasMadeChanges(true); return r; }
        if (effectiveIsAnyPlanContentEdit) return planContentApi.createExercise(effectiveWeekKey, sessId, exerciseName?.trim?.() || exerciseName || 'Ejercicio', order ?? undefined);
        if (effectiveIsClientEdit) return clientSessionContentService.createExercise(effectiveSessionId, { title: exerciseName?.trim?.() || exerciseName, name: exerciseName?.trim?.() || exerciseName }, order ?? 0);
        const result = await libraryService.createExerciseInLibrarySession(uid, sessId, exerciseName, order);
        markLibraryChanged();
        return result;
      },
      async getLibrarySessionById(uid, sessId) {
        if (isPlanInstanceEdit && planId && moduleId) {
          const sessions = await plansService.getSessionsByModule(planId, moduleId);
          const sessionDoc = sessions.find((s) => s.id === sessId) || null;
          if (!sessionDoc) return null;
          const planExercises = await plansService.getExercisesBySession(planId, moduleId, sessId);
          const exercisesWithSets = await Promise.all(
            planExercises.map(async (ex) => {
              const sets = await plansService.getSetsByExercise(planId, moduleId, sessId, ex.id);
              return { ...ex, sets: sets || [] };
            })
          );
          return { ...sessionDoc, exercises: exercisesWithSets };
        }
        if (effectiveIsAnyPlanContentEdit) {
          const planContent = await planContentApi.getSessionContent(effectiveWeekKey, sessId);
          if (!planContent) return null;
          const sessionFromPlan = planContent.session;
          const exercises = planContent.exercises || [];
          let sessionData = { ...sessionFromPlan, exercises };
          const sourceLibId = sessionFromPlan.source_library_session_id ?? sessionFromPlan.librarySessionRef;
          if (sourceLibId && uid) {
            try {
              const libSession = await libraryService.getLibrarySessionById(uid, sourceLibId);
              if (libSession) {
                sessionData = {
                  ...sessionData,
                  image_url: sessionData.image_url ?? libSession.image_url ?? null,
                  title: sessionData.title ?? libSession.title ?? sessionData.title
                };
              }
            } catch (err) {
              logger.warn('[LibrarySessionDetail] getLibrarySessionById: could not load library session for metadata', sourceLibId, err);
            }
          }
          return sessionData;
        }
        if (effectiveIsClientEdit) return clientSessionContentService.getClientSessionContent(effectiveSessionId);
        return libraryService.getLibrarySessionById(uid, sessId);
      },
      async updateLibrarySessionExerciseOrder(uid, sessId, orders) {
        await this.ensureCopy();
        if (isPlanInstanceEdit && planId && moduleId) {
          for (const { exerciseId, order } of orders) {
            await plansService.updateExercise(planId, moduleId, sessId, exerciseId, { order });
          }
          setHasMadeChanges(true);
          return;
        }
        if (effectiveIsAnyPlanContentEdit) {
          for (const { exerciseId, order } of orders) {
            await planContentApi.updateExercise(effectiveWeekKey, sessId, exerciseId, { order });
          }
          return;
        }
        if (effectiveIsClientEdit) return clientSessionContentService.updateExerciseOrder(effectiveSessionId, orders.map(({ exerciseId, order }) => ({ exerciseId, order })));
        const result = await libraryService.updateLibrarySessionExerciseOrder(uid, sessId, orders.map((o) => ({ exerciseId: o.exerciseId, order: o.order })));
        markLibraryChanged();
        return result;
      }
    };
  }, [effectiveIsClientEdit, effectiveIsClientPlanEdit, effectiveIsProgramPlanEdit, effectiveIsAnyPlanContentEdit, planContentApi, effectiveClientSessionId, sessionId, ensureClientCopy, effectiveClientId, effectiveProgramId, effectiveWeekKey, isPlanInstanceEdit, planInstancePlanId, planInstanceModuleId]);

  const handleCardDeleteAlternative = useCallback((exercise, libraryId, index) => {
    if (!user || !sessionId) return;
    const currentAlts = JSON.parse(JSON.stringify(exercise.alternatives || {}));
    if (!currentAlts[libraryId] || !Array.isArray(currentAlts[libraryId])) return;
    currentAlts[libraryId] = currentAlts[libraryId].filter((_, i) => i !== index);
    if (currentAlts[libraryId].length === 0) delete currentAlts[libraryId];
    setExercises(prev => prev.map(ex => ex.id === exercise.id
      ? { ...ex, alternatives: currentAlts }
      : ex
    ));
    contentApi.updateExerciseInLibrarySession(user.uid, sessionId, exercise.id, { alternatives: currentAlts })
      .then(() => setHasMadeChanges(true))
      .catch((err) => {
        logger.error('Error deleting alternative:', err);
        showToast('No pudimos eliminar la alternativa. Intenta de nuevo.', 'error');
      });
  }, [user, sessionId, contentApi, showToast]);

  const handlePickerSelect = useCallback((exercise, ex, exerciseName, mode) => {
    if (!selectedLibraryForExercise || !exerciseName || !user || !sessionId) return;
    const libId = selectedLibraryForExercise;
    let apiUpdatePayload = null;

    if (mode === 'primary') {
      const primaryUpdate = { [libId]: exerciseName };
      apiUpdatePayload = { primary: primaryUpdate };
      setExercises(prev => prev.map(e => e.id === exercise.id
        ? { ...e, primary: primaryUpdate, dragId: e.dragId || `session-${e.id}`, isInSession: true }
        : e
      ));
    } else if (mode === 'add-alternative') {
      const currentAlts = JSON.parse(JSON.stringify(exercise.alternatives || {}));
      if (!currentAlts[libId]) currentAlts[libId] = [];
      if (!currentAlts[libId].includes(exerciseName)) currentAlts[libId].push(exerciseName);
      apiUpdatePayload = { alternatives: currentAlts };
      setExercises(prev => prev.map(e => e.id === exercise.id
        ? { ...e, alternatives: currentAlts, dragId: e.dragId || `session-${e.id}`, isInSession: true }
        : e
      ));
    }

    if (apiUpdatePayload) {
      contentApi.updateExerciseInLibrarySession(user.uid, sessionId, exercise.id, apiUpdatePayload)
        .then(() => setHasMadeChanges(true))
        .catch((err) => {
          logger.error('Error updating exercise:', err);
          showToast('No pudimos guardar el cambio. Intenta de nuevo.', 'error');
        });
    }

    setPickerActiveExerciseId(null);
    setPickerMode(null);
    setSelectedLibraryForExercise(null);
    setExercisesFromSelectedLibrary([]);
    setAvailableLibrariesForSelection([]);
  }, [user, sessionId, selectedLibraryForExercise, contentApi, showToast]);

  const handleOpenPresetSelector = useCallback((ex) => {
    setSelectedExercise(ex);
    setExerciseDraft(JSON.parse(JSON.stringify(ex)));
    setIsPresetSelectorOpen(true);
  }, []);

  const handleOpenMeasuresEditor = useCallback((ex) => {
    setSelectedExercise(ex);
    setExerciseDraft(JSON.parse(JSON.stringify(ex)));
    setEditorModalMode('exercise');
    setPresetBeingEditedId(null);
    setIsMeasuresObjectivesEditorOpen(true);
  }, []);

  const handleHeaderImageSelect = async (item) => {
    if (!sessionId || !user) return;
    try {
      if (isPlanInstanceEdit && planInstancePlanId && planInstanceModuleId) {
        await plansService.updateSession(planInstancePlanId, planInstanceModuleId, sessionId, { image_url: item.url });
      } else if (effectiveIsAnyPlanContentEdit) {
        await planContentApi.updateSession(effectiveWeekKey, sessionId, { image_url: item.url });
      } else if (effectiveIsClientEdit) {
        await clientSessionContentService.updateSession(effectiveClientSessionId, { image_url: item.url });
      } else {
        await libraryService.updateLibrarySession(user.uid, sessionId, { image_url: item.url });
        setHasMadeChanges(true);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.library.sessions(user.uid) });
      queryClient.setQueryData(
        ['library', 'session', sessionId, { isPlanInstanceEdit, planInstancePlanId, planInstanceModuleId, effectiveEditScope, effectiveClientSessionId, effectiveClientId, effectiveProgramId, effectiveWeekKey }],
        (old) => old ? { ...old, session: { ...old.session, image_url: item.url } } : old
      );
    } catch (err) {
      logger.error('Error updating session image:', err);
      showToast('No pudimos actualizar la imagen. Intenta de nuevo.', 'error');
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

  const { data: sessionQueryData, isLoading: loading, error: loadError } = useQuery({
    queryKey: ['library', 'session', sessionId, { isPlanInstanceEdit, planInstancePlanId, planInstanceModuleId, effectiveEditScope, effectiveClientSessionId, effectiveClientId, effectiveProgramId, effectiveWeekKey }],
    queryFn: async () => {
      if (!user || !sessionId) return null;
      if (isPlanInstanceEdit && planInstancePlanId && planInstanceModuleId) {
        const sessionData = await plansService.getSessionById(planInstancePlanId, planInstanceModuleId, sessionId);
        if (!sessionData) return null;
        return { session: sessionData, editMode: 'planInstance' };
      }

      // Resolve effective client-edit context from ref/sessionStorage
      const effClientSessionId = effectiveClientSessionId;
      const effClientId = effectiveClientId;
      const effProgramId = effectiveProgramId;
      const effWeekKey = effectiveWeekKey;
      const effEditScope = effectiveEditScope;
      const effIsClientEdit = (effEditScope === 'client') && !!effClientSessionId;
      const effIsClientPlanEdit = (effEditScope === 'client_plan') && !!effClientId && !!effProgramId && !!effWeekKey;
      const effIsProgramPlanEdit = (effEditScope === 'program_plan') && !!effProgramId && !!effWeekKey;
      const effIsAnyPlanContentEdit = effIsClientPlanEdit || effIsProgramPlanEdit;

      if (effIsAnyPlanContentEdit) {
        const planContent = effIsProgramPlanEdit
          ? await programPlanContentService.getSessionContent(effProgramId, effWeekKey, sessionId)
          : await clientPlanContentService.getClientPlanSessionContent(effClientId, effProgramId, effWeekKey, sessionId);
        if (planContent?.session) {
          let exercises = planContent.exercises || [];
          const sessionFromPlan = planContent.session;
          const sourceLibId = sessionFromPlan.source_library_session_id ?? sessionFromPlan.librarySessionRef;
          let libSession = null;
          if (sourceLibId && user?.uid) {
            try {
              libSession = await libraryService.getLibrarySessionById(user.uid, sourceLibId);
              if (libSession?.exercises?.length && exercises.length === 0) {
                exercises = libSession.exercises;
              }
            } catch (err) {
              logger.warn('[LibrarySessionDetail] fallback: could not load exercises from library', sourceLibId, err);
            }
          }
          const clientSession = {
            ...sessionFromPlan,
            exercises,
            image_url: sessionFromPlan.image_url ?? libSession?.image_url ?? null,
            title: sessionFromPlan.title ?? libSession?.title ?? sessionFromPlan.title
          };
          return { session: clientSession, editMode: 'clientPlan' };
        }
      }

      if (effIsClientEdit) {
        const clientContent = await clientSessionContentService.getClientSessionContent(effClientSessionId);
        if (clientContent) {
          return { session: clientContent, editMode: 'client', hasCopy: true };
        }
      }

      const libSession = await libraryService.getLibrarySessionById(user.uid, sessionId);
      return { session: libSession, editMode: 'library' };
    },
    enabled: !!user && !!sessionId,
    staleTime: (effectiveIsClientEdit || effectiveIsAnyPlanContentEdit || isPlanInstanceEdit) ? 30 * 1000 : 5 * 60 * 1000,
    gcTime: (effectiveIsClientEdit || effectiveIsAnyPlanContentEdit || isPlanInstanceEdit) ? 60 * 1000 : 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: librariesData } = useQuery({
    queryKey: queryKeys.library.libraries(user?.uid),
    queryFn: () => libraryService.getLibrariesByCreator(user.uid),
    enabled: !!user?.uid,
    ...cacheConfig.libraries,
  });

  const session = sessionQueryData?.session ?? null;
  const error = loadError?.message ?? (!loading && sessionQueryData === null ? 'Esta sesión no existe o fue eliminada' : null);

  // Extract accent color from session image
  useEffect(() => {
    if (!session?.image_url) { setAccentRgb(null); return; }
    return extractAccentFromImage(session.image_url, setAccentRgb);
  }, [session?.image_url]);

  const accentStyle = useMemo(() => {
    if (!accentRgb) return {};
    const [r, g, b] = accentRgb;
    return {
      '--accent': `rgb(${r},${g},${b})`,
      '--accent-r': r,
      '--accent-g': g,
      '--accent-b': b,
    };
  }, [accentRgb]);

  const [localDefaultTemplate, setLocalDefaultTemplate] = useState(null);
  const sessionDefaultTemplate = localDefaultTemplate ?? session?.defaultDataTemplate ?? null;

  const handleAddObjective = useCallback((ex, key, label, applyToAll) => {
    if (!user || !sessionId) return;
    const customLabels = { ...(ex.customObjectiveLabels || sessionDefaultTemplate?.customObjectiveLabels || {}), [key]: label };
    if (applyToAll) {
      const tpl = sessionDefaultTemplate || {};
      const newObjectives = [...(tpl.objectives || []).filter(o => o !== key), key];
      if (!newObjectives.includes('previous')) newObjectives.push('previous');
      const templateUpdate = { ...tpl, objectives: newObjectives, customObjectiveLabels: { ...(tpl.customObjectiveLabels || {}), [key]: label } };
      setLocalDefaultTemplate(templateUpdate);
      setExercises(prev => prev.map(e => {
        const exObj = e.objectives?.length > 0 ? e.objectives : (tpl.objectives || []);
        const updated = [...exObj.filter(o => o !== key), key];
        if (!updated.includes('previous')) updated.push('previous');
        return { ...e, objectives: updated, customObjectiveLabels: { ...(e.customObjectiveLabels || tpl.customObjectiveLabels || {}), [key]: label } };
      }));
      contentApi.updateLibrarySession(user.uid, sessionId, { defaultDataTemplate: templateUpdate })
        .then(() => setHasMadeChanges(true))
        .catch(err => { logger.error('Error updating session template:', err); showToast('No pudimos guardar los cambios.', 'error'); });
      setExercises(prev => {
        prev.forEach(e => {
          contentApi.updateExerciseInLibrarySession(user.uid, sessionId, e.id, { objectives: [...((e.objectives?.length > 0 ? e.objectives : (tpl.objectives || [])).filter(o => o !== key)), key, ...(!((e.objectives?.length > 0 ? e.objectives : (tpl.objectives || [])).filter(o => o !== key)).includes('previous') ? ['previous'] : [])], customObjectiveLabels: { ...(e.customObjectiveLabels || tpl.customObjectiveLabels || {}), [key]: label } }).catch(() => {});
        });
        return prev;
      });
    } else {
      const currentObjectives = ex.objectives?.length > 0 ? ex.objectives : (sessionDefaultTemplate?.objectives || []);
      const newObjectives = [...currentObjectives.filter(o => o !== key), key];
      if (!newObjectives.includes('previous')) newObjectives.push('previous');
      const updates = { objectives: newObjectives, customObjectiveLabels: customLabels };
      setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, ...updates } : e));
      contentApi.updateExerciseInLibrarySession(user.uid, sessionId, ex.id, updates)
        .then(() => setHasMadeChanges(true))
        .catch(err => { logger.error('Error adding objective:', err); showToast('No pudimos guardar los cambios.', 'error'); });
    }
  }, [user, sessionId, sessionDefaultTemplate, contentApi, showToast]);

  const handleRemoveObjective = useCallback((ex, objectiveKey, applyToAll) => {
    if (!user || !sessionId) return;
    if (applyToAll) {
      const tpl = sessionDefaultTemplate || {};
      const newObjectives = (tpl.objectives || []).filter(o => o !== objectiveKey);
      const newLabels = { ...(tpl.customObjectiveLabels || {}) };
      delete newLabels[objectiveKey];
      const templateUpdate = { ...tpl, objectives: newObjectives, customObjectiveLabels: newLabels };
      setLocalDefaultTemplate(templateUpdate);
      setExercises(prev => prev.map(e => {
        const exObj = e.objectives?.length > 0 ? e.objectives : (tpl.objectives || []);
        const updated = exObj.filter(o => o !== objectiveKey);
        const labels = { ...(e.customObjectiveLabels || tpl.customObjectiveLabels || {}) };
        delete labels[objectiveKey];
        return { ...e, objectives: updated, customObjectiveLabels: labels };
      }));
      contentApi.updateLibrarySession(user.uid, sessionId, { defaultDataTemplate: templateUpdate })
        .then(() => setHasMadeChanges(true))
        .catch(err => { logger.error('Error updating session template:', err); showToast('No pudimos guardar los cambios.', 'error'); });
      setExercises(prev => {
        prev.forEach(e => {
          const exObj = e.objectives?.length > 0 ? e.objectives : (tpl.objectives || []);
          const labels = { ...(e.customObjectiveLabels || tpl.customObjectiveLabels || {}) };
          delete labels[objectiveKey];
          contentApi.updateExerciseInLibrarySession(user.uid, sessionId, e.id, { objectives: exObj.filter(o => o !== objectiveKey), customObjectiveLabels: labels }).catch(() => {});
        });
        return prev;
      });
    } else {
      const currentObjectives = ex.objectives?.length > 0 ? ex.objectives : (sessionDefaultTemplate?.objectives || []);
      const newObjectives = currentObjectives.filter(o => o !== objectiveKey);
      const newLabels = { ...(ex.customObjectiveLabels || sessionDefaultTemplate?.customObjectiveLabels || {}) };
      delete newLabels[objectiveKey];
      const updates = { objectives: newObjectives, customObjectiveLabels: newLabels };
      setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, ...updates } : e));
      contentApi.updateExerciseInLibrarySession(user.uid, sessionId, ex.id, updates)
        .then(() => setHasMadeChanges(true))
        .catch(err => { logger.error('Error removing objective:', err); showToast('No pudimos guardar los cambios.', 'error'); });
    }
  }, [user, sessionId, sessionDefaultTemplate, contentApi, showToast]);

  const handleAddMeasure = useCallback((ex, key, label, applyToAll) => {
    if (!user || !sessionId) return;
    const customLabels = { ...(ex.customMeasureLabels || sessionDefaultTemplate?.customMeasureLabels || {}), [key]: label };
    if (applyToAll) {
      const tpl = sessionDefaultTemplate || {};
      const newMeasures = [...(tpl.measures || []).filter(m => m !== key), key];
      const templateUpdate = { ...tpl, measures: newMeasures, customMeasureLabels: { ...(tpl.customMeasureLabels || {}), [key]: label } };
      setLocalDefaultTemplate(templateUpdate);
      setExercises(prev => prev.map(e => {
        const exMeasures = e.measures?.length > 0 ? e.measures : (tpl.measures || []);
        return { ...e, measures: [...exMeasures.filter(m => m !== key), key], customMeasureLabels: { ...(e.customMeasureLabels || tpl.customMeasureLabels || {}), [key]: label } };
      }));
      contentApi.updateLibrarySession(user.uid, sessionId, { defaultDataTemplate: templateUpdate })
        .then(() => setHasMadeChanges(true))
        .catch(err => { logger.error('Error updating session template:', err); showToast('No pudimos guardar los cambios.', 'error'); });
      setExercises(prev => {
        prev.forEach(e => {
          const exMeasures = e.measures?.length > 0 ? e.measures : (tpl.measures || []);
          contentApi.updateExerciseInLibrarySession(user.uid, sessionId, e.id, { measures: [...exMeasures.filter(m => m !== key), key], customMeasureLabels: { ...(e.customMeasureLabels || tpl.customMeasureLabels || {}), [key]: label } }).catch(() => {});
        });
        return prev;
      });
    } else {
      const currentMeasures = ex.measures?.length > 0 ? ex.measures : (sessionDefaultTemplate?.measures || []);
      const newMeasures = [...currentMeasures.filter(m => m !== key), key];
      const updates = { measures: newMeasures, customMeasureLabels: customLabels };
      setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, ...updates } : e));
      contentApi.updateExerciseInLibrarySession(user.uid, sessionId, ex.id, updates)
        .then(() => setHasMadeChanges(true))
        .catch(err => { logger.error('Error adding measure:', err); showToast('No pudimos guardar los cambios.', 'error'); });
    }
  }, [user, sessionId, sessionDefaultTemplate, contentApi, showToast]);

  const handleRemoveMeasure = useCallback((ex, measureKey, applyToAll) => {
    if (!user || !sessionId) return;
    if (applyToAll) {
      const tpl = sessionDefaultTemplate || {};
      const newMeasures = (tpl.measures || []).filter(m => m !== measureKey);
      const newLabels = { ...(tpl.customMeasureLabels || {}) };
      delete newLabels[measureKey];
      const templateUpdate = { ...tpl, measures: newMeasures, customMeasureLabels: newLabels };
      setLocalDefaultTemplate(templateUpdate);
      setExercises(prev => prev.map(e => {
        const exMeasures = e.measures?.length > 0 ? e.measures : (tpl.measures || []);
        const labels = { ...(e.customMeasureLabels || tpl.customMeasureLabels || {}) };
        delete labels[measureKey];
        return { ...e, measures: exMeasures.filter(m => m !== measureKey), customMeasureLabels: labels };
      }));
      contentApi.updateLibrarySession(user.uid, sessionId, { defaultDataTemplate: templateUpdate })
        .then(() => setHasMadeChanges(true))
        .catch(err => { logger.error('Error updating session template:', err); showToast('No pudimos guardar los cambios.', 'error'); });
      setExercises(prev => {
        prev.forEach(e => {
          const exMeasures = e.measures?.length > 0 ? e.measures : (tpl.measures || []);
          const labels = { ...(e.customMeasureLabels || tpl.customMeasureLabels || {}) };
          delete labels[measureKey];
          contentApi.updateExerciseInLibrarySession(user.uid, sessionId, e.id, { measures: exMeasures.filter(m => m !== measureKey), customMeasureLabels: labels }).catch(() => {});
        });
        return prev;
      });
    } else {
      const currentMeasures = ex.measures?.length > 0 ? ex.measures : (sessionDefaultTemplate?.measures || []);
      const newMeasures = currentMeasures.filter(m => m !== measureKey);
      const newLabels = { ...(ex.customMeasureLabels || sessionDefaultTemplate?.customMeasureLabels || {}) };
      delete newLabels[measureKey];
      const updates = { measures: newMeasures, customMeasureLabels: newLabels };
      setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, ...updates } : e));
      contentApi.updateExerciseInLibrarySession(user.uid, sessionId, ex.id, updates)
        .then(() => setHasMadeChanges(true))
        .catch(err => { logger.error('Error removing measure:', err); showToast('No pudimos guardar los cambios.', 'error'); });
    }
  }, [user, sessionId, sessionDefaultTemplate, contentApi, showToast]);

  // Editable session title
  const [localTitle, setLocalTitle] = useState(null);
  const titleSaveTimerRef = useRef(null);
  const effectiveTitle = localTitle ?? session?.title ?? '';

  // Sync localTitle when session data loads for the first time
  useEffect(() => {
    if (session?.title && localTitle === null) {
      setLocalTitle(null); // keep using session.title until user edits
    }
  }, [session?.title]);

  // Sync local override when session data loads/changes
  useEffect(() => {
    if (session?.defaultDataTemplate) {
      setLocalDefaultTemplate(null); // clear override, use server data
    }
  }, [session?.defaultDataTemplate]);

  const sessionDataSeededRef = useRef(false);
  useEffect(() => {
    if (!sessionQueryData || sessionDataSeededRef.current) return;
    sessionDataSeededRef.current = true;
    const { session: s, hasCopy } = sessionQueryData;
    if (!s) return;
    if (hasCopy !== undefined) {
      hasClientCopyRef.current = hasCopy;
      setHasClientCopy(hasCopy);
    }
    const seededExercises = (s.exercises || []).map((ex) => ({ ...ex, dragId: `session-${ex.id}`, isInSession: true }));
    console.log('[seedSession] Seeding', seededExercises.length, 'exercises from', sessionQueryData.editMode, { exercises: seededExercises.map(e => ({ id: e.id, title: e.title || e.name, setsCount: e.sets?.length })) });
    setExercises(seededExercises);
    // Mark initial load stagger as done after animation duration
    setTimeout(() => { initialLoadAnimatedRef.current = true; }, seededExercises.length * 50 + 420);
    // Seed liveSetsMap from already-loaded sets so volume card is accurate immediately
    const initialSetsMap = {};
    seededExercises.forEach(ex => {
      if (ex.id && Array.isArray(ex.sets) && ex.sets.length > 0) {
        initialSetsMap[ex.id] = ex.sets;
      }
    });
    if (Object.keys(initialSetsMap).length > 0) {
      setLiveSetsMap(initialSetsMap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionQueryData]);

  // Seed libraries from separate query (long-lived cache, independent of session)
  const librariesSeededRef = useRef(false);
  useEffect(() => {
    if (!librariesData || librariesSeededRef.current) return;
    librariesSeededRef.current = true;
    setAvailableLibraries(librariesData);
    const libCache = {};
    librariesData.forEach(lib => {
      if (lib.id) libCache[lib.id] = lib;
    });
    if (Object.keys(libCache).length > 0) {
      setLibraryDataCache(prev => ({ ...prev, ...libCache }));
    }
    setVolumeDataLoading(false);
    if (librariesData.length > 0) {
      setSelectedLibraryId(librariesData[0].id);
      loadExercisesFromLibrary(librariesData[0].id, librariesData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [librariesData]);

  const loadExercisesFromLibrary = useCallback((libraryId, libraries = null) => {
    if (!libraryId) return;

    try {
      const libs = libraries || availableLibrariesRef.current;
      const library = libs.find(l => l.id === libraryId);
      if (!library) return;

      const exercisesList = libraryService.getExercisesFromLibrary(library);

      // Get exercise IDs that are already in session (read from ref to avoid dependency)
      const currentExercises = exercisesRef.current;
      const sessionExerciseIds = new Set();
      currentExercises.forEach(ex => {
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
          isInSession: false
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setAvailableExercises(available);
    } catch (err) {
      logger.error('Error loading exercises from library:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedLibraryId) {
      loadExercisesFromLibrary(selectedLibraryId);
    }
  }, [selectedLibraryId, loadExercisesFromLibrary]);

  // Stable fingerprint of primary references — only changes when exercises are added/removed or primary refs change
  const exercisePrimaryFingerprint = useMemo(() => {
    return exercises.map(ex => {
      const refs = getPrimaryReferences(ex);
      return refs.map(r => `${r.libraryId}::${r.exerciseName}`).join('|');
    }).join(',');
  }, [exercises]);

  // Load library completeness for all session exercises on initial load so "Incompleto" tag shows immediately
  useEffect(() => {
    const currentExercises = exercisesRef.current;
    if (!currentExercises || currentExercises.length === 0) return;
    const referenceLibrariesMap = {};
    currentExercises.forEach((ex) => {
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
            // Use cached/available library data to avoid redundant fetches
            const libraryData = libraryDataCacheRef.current[libraryId]
              || availableLibrariesRef.current.find(l => l.id === libraryId)
              || await libraryService.getLibraryById(libraryId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercisePrimaryFingerprint]);

  // Auto-seed session template from first preset when none exists
  const templateSeededRef = useRef(false);
  useEffect(() => {
    if (templateSeededRef.current || !user?.uid || !sessionId) return;
    if (sessionDefaultTemplate) { templateSeededRef.current = true; return; }
    if (!sessionQueryData) return;
    templateSeededRef.current = true;
    const DEFAULT_TEMPLATE = {
      measures: ['reps', 'weight'],
      objectives: ['reps', 'intensity', 'previous'],
      customMeasureLabels: {},
      customObjectiveLabels: {},
    };
    measureObjectivePresetsService.list(user.uid).then(presets => {
      let template;
      if (!presets || presets.length === 0) {
        template = DEFAULT_TEMPLATE;
      } else {
        const preset = presets[0];
        const objectives = Array.isArray(preset.objectives) && preset.objectives.includes('previous')
          ? preset.objectives
          : [...(preset.objectives || []), 'previous'];
        template = {
          measures: preset.measures?.length > 0 ? preset.measures : DEFAULT_TEMPLATE.measures,
          objectives: objectives.length > 0 ? objectives : DEFAULT_TEMPLATE.objectives,
          customMeasureLabels: preset.customMeasureLabels || {},
          customObjectiveLabels: preset.customObjectiveLabels || {},
        };
      }
      setLocalDefaultTemplate(template);
      contentApi.updateLibrarySession(user.uid, sessionId, { defaultDataTemplate: template })
        .then(() => setHasMadeChanges(true))
        .catch(err => logger.error('Error auto-seeding session template:', err));
    }).catch(() => {});
  }, [user?.uid, sessionId, sessionDefaultTemplate, sessionQueryData, contentApi]);

  const handleTitleChange = useCallback((newTitle) => {
    setLocalTitle(newTitle);
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = setTimeout(() => {
      if (!user || !sessionId || !contentApi) return;
      contentApi.updateLibrarySession(user.uid, sessionId, { title: newTitle.trim() || 'Sin título' })
        .then(() => {
          setHasMadeChanges(true);
          queryClient.invalidateQueries({ queryKey: queryKeys.library.sessions(user.uid) });
        })
        .catch((err) => {
          logger.error('Error saving session title:', err);
          showToast('No pudimos guardar el nombre. Intenta de nuevo.', 'error');
        });
    }, 500);
  }, [user, sessionId, contentApi, queryClient, showToast]);

  useEffect(() => {
    if (isPresetSelectorOpen && user?.uid) {
      measureObjectivePresetsService.list(user.uid).then(setPresetsList).catch((err) => {
        logger.error('Error loading presets:', err);
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
    // Collapse all expanded exercise cards during drag
    setExpandedExerciseIds(new Set());
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    // Dragging from available to session — add directly (no modal)
    if (activeId.startsWith('available-') && overId === 'session-list') {
      const exerciseData = active.data.current.exercise;
      addExerciseToSession(exerciseData);
      return;
    }

    // Check if reordering within session
    if (activeId.startsWith('session-') && overId.startsWith('session-')) {
      const activeIndex = exercises.findIndex(ex => ex.dragId === activeId);
      const overIndex = exercises.findIndex(ex => ex.dragId === overId);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        const newExercises = arrayMove(exercises, activeIndex, overIndex);
        setExercises(newExercises);
        if (user && sessionId && contentApi?.updateLibrarySessionExerciseOrder) {
          try {
            const orders = newExercises.map((ex, index) => ({
              exerciseId: ex.id,
              order: index
            }));
            await contentApi.updateLibrarySessionExerciseOrder(user.uid, sessionId, orders);
            setHasMadeChanges(true);
          } catch (err) {
            logger.error('Error updating exercise order:', err);
            showToast('No pudimos guardar el orden. Intenta de nuevo.', 'error');
          }
        }
      }
    }
  };

  const addExerciseToSession = async (exerciseData) => {
    if (!user || !sessionId || !exerciseData.libraryId || !exerciseData.name) return;

    const nextOrder = exercises.length;
    const library = availableLibraries.find(l => l.id === exerciseData.libraryId);
    const exerciseFromLib = library && library[exerciseData.name];

    const tpl = sessionDefaultTemplate || {};
    const newExercisePayload = {
      primary: { [exerciseData.libraryId]: exerciseData.name },
      alternatives: {},
      measures: exerciseFromLib?.measures?.length > 0 ? exerciseFromLib.measures : (tpl.measures || []),
      objectives: exerciseFromLib?.objectives?.length > 0 ? exerciseFromLib.objectives : (tpl.objectives || []),
      customMeasureLabels: exerciseFromLib?.customMeasureLabels || tpl.customMeasureLabels || {},
      customObjectiveLabels: exerciseFromLib?.customObjectiveLabels || tpl.customObjectiveLabels || {},
      ...(exerciseFromLib?.defaultSetValues ? { defaultSetValues: exerciseFromLib.defaultSetValues } : {}),
      order: nextOrder,
    };

    // Optimistic: add placeholder to exercises list
    const placeholderId = `pending-${Date.now()}`;
    const optimisticExercise = {
      ...newExercisePayload,
      id: placeholderId,
      dragId: `session-${placeholderId}`,
      isInSession: true,
    };
    setExercises(prev => [...prev, optimisticExercise]);

    // Auto-expand the newly added card + mark as new for animation
    setExpandedExerciseIds(prev => new Set([...prev, placeholderId]));
    setNewlyAddedIds(prev => new Set([...prev, placeholderId]));

    try {
      let createdExercise;
      if (isPlanInstanceEdit && planInstancePlanId && planInstanceModuleId) {
        createdExercise = await plansService.createExercise(planInstancePlanId, planInstanceModuleId, sessionId, newExercisePayload.primary ? Object.values(newExercisePayload.primary)[0] : 'Ejercicio', nextOrder);
        const realExId = createdExercise?.id || createdExercise?.exerciseId;
        if (realExId) {
          await plansService.updateExercise(planInstancePlanId, planInstanceModuleId, sessionId, realExId, newExercisePayload);
        }
      } else if (effectiveIsAnyPlanContentEdit) {
        createdExercise = await planContentApi.createExercise(effectiveWeekKey, sessionId, newExercisePayload.primary ? Object.values(newExercisePayload.primary)[0] : 'Ejercicio', nextOrder);
      } else if (effectiveIsClientEdit) {
        await ensureClientCopy();
        createdExercise = await clientSessionContentService.createExercise(effectiveClientSessionId, newExercisePayload, nextOrder);
      } else {
        createdExercise = await libraryService.addExerciseToLibrarySession(user.uid, sessionId, newExercisePayload);
        setHasMadeChanges(true);
      }

      // Replace placeholder with real ID and transfer expanded state
      if (createdExercise?.id || createdExercise?.exerciseId) {
        const realId = createdExercise.id || createdExercise.exerciseId;
        setExercises(prev => prev.map(ex => ex.id === placeholderId
          ? { ...ex, id: realId }
          : ex
        ));
        setExpandedExerciseIds(prev => {
          const n = new Set(prev);
          if (n.has(placeholderId)) { n.delete(placeholderId); n.add(realId); }
          return n;
        });
        // Clear animation flag — don't transfer to realId, animation already played
        setNewlyAddedIds(prev => {
          const n = new Set(prev);
          n.delete(placeholderId);
          return n;
        });
      }

      // Remove from available
      loadExercisesFromLibrary(selectedLibraryId);
    } catch (err) {
      // Rollback: remove placeholder
      setExercises(prev => prev.filter(ex => ex.id !== placeholderId));
      logger.error('Error adding exercise:', err);
      showToast('No pudimos agregar el ejercicio. Intenta de nuevo.', 'error');
    }
  };

  const handleDeleteExercise = (exercise) => {
    setExerciseToDelete(exercise);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!exerciseToDelete || !user || !sessionId) return;

    const deletedId = exerciseToDelete.id;

    // Snapshot for rollback
    const previousExercises = exercises;

    // Optimistic: remove from UI, expanded state, and liveSetsMap immediately
    setExercises(prev => prev.filter(ex => ex.id !== deletedId));
    setExpandedExerciseIds(prev => {
      if (!prev.has(deletedId)) return prev;
      const next = new Set(prev);
      next.delete(deletedId);
      return next;
    });
    setLiveSetsMap(prev => {
      if (!(deletedId in prev)) return prev;
      const next = { ...prev };
      delete next[deletedId];
      return next;
    });
    setIsDeleteModalOpen(false);
    setExerciseToDelete(null);

    try {
      if (isPlanInstanceEdit && planInstancePlanId && planInstanceModuleId) {
        await plansService.deleteExercise(planInstancePlanId, planInstanceModuleId, sessionId, deletedId);
      } else if (effectiveIsAnyPlanContentEdit) {
        await planContentApi.deleteExercise(effectiveWeekKey, sessionId, deletedId);
      } else if (effectiveIsClientEdit) {
        await clientSessionContentService.deleteExercise(effectiveClientSessionId, deletedId);
      } else {
        await libraryService.deleteLibrarySessionExercise(user.uid, sessionId, deletedId);
        setHasMadeChanges(true);
      }

      // Refresh available exercises since we removed one from the session
      if (selectedLibraryId) loadExercisesFromLibrary(selectedLibraryId);
    } catch (err) {
      // Rollback: restore previous exercises list
      logger.error('Error deleting exercise:', err);
      showToast('No pudimos eliminar el ejercicio. Intenta de nuevo.', 'error');
      setExercises(previousExercises);
    }
  };

  const getExerciseDisplayName = (exercise) => {
    const fromNameOrTitle = exercise?.name || exercise?.title;
    const nameOrTitleStr = (fromNameOrTitle && typeof fromNameOrTitle === 'string' && fromNameOrTitle.trim()) ? fromNameOrTitle.trim() : '';
    let primaryStr = '';
    if (exercise?.primary && typeof exercise.primary === 'object') {
      const values = Object.values(exercise.primary);
      const first = values[0];
      if (typeof first === 'string' && first.trim()) primaryStr = first.trim();
      else if (first && typeof first === 'object') primaryStr = first.name || first.title || first.id || '';
      else if (first != null) primaryStr = String(first);
    }
    if (nameOrTitleStr && nameOrTitleStr.toLowerCase() !== 'ejercicio') return nameOrTitleStr;
    if (primaryStr) return primaryStr;
    if (nameOrTitleStr) return nameOrTitleStr;
    return 'Ejercicio sin nombre';
  };

  // Check if library exercise is incomplete (only true when we have loaded and it's incomplete)
  const isLibraryExerciseIncomplete = (libraryId, exerciseName) => {
    if (!libraryId || !exerciseName) return false;
    const key = getLibraryExerciseKey(libraryId, exerciseName);
    // Only show incomplete when we've loaded completeness and it's false; unknown = don't show tag
    return libraryExerciseCompleteness[key] === false;
  };

  // Check if a session exercise is missing its own required config
  const isSessionExerciseIncomplete = (ex) => {
    if (!ex) return true;
    const hasPrimary = ex.primary && typeof ex.primary === 'object' && Object.values(ex.primary || {}).length > 0;
    if (!hasPrimary) return true;
    const measures = Array.isArray(ex.measures) ? ex.measures : [];
    const objectives = Array.isArray(ex.objectives) ? ex.objectives : [];
    if (measures.length === 0 || objectives.length === 0) return true;
    // No alternatives configured
    const alts = ex.alternatives && typeof ex.alternatives === 'object' && !Array.isArray(ex.alternatives) ? ex.alternatives : {};
    if (Object.keys(alts).length === 0) return true;
    // No sets — use liveSetsMap for up-to-date data, fall back to exercise snapshot
    const sets = liveSetsMap[ex.id] || ex.sets || [];
    if (sets.length === 0) return true;
    // Sets exist but objective fields are empty (excluding 'previous')
    const objectiveKeys = objectives.filter(o => o !== 'previous');
    if (objectiveKeys.length > 0) {
      const allSetsEmpty = sets.every(s =>
        objectiveKeys.every(key => s[key] == null || s[key] === '')
      );
      if (allSetsEmpty) return true;
    }
    return false;
  };

  // Check if the underlying library exercise is missing details (video, muscles, implements)
  const isLibraryExerciseMissingDetails = (ex) => {
    const primaryRef = getPrimaryReferences(ex)[0];
    if (!primaryRef) return false;
    return isLibraryExerciseIncomplete(primaryRef.libraryId, primaryRef.exerciseName);
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
              logger.error(`Error fetching library ${libraryId}:`, error);
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
          const cached = liveSetsMap[exercise.id];
          const setsData = cached?.length > 0
            ? cached
            : await contentApi.getSetsByLibraryExercise(user.uid, sessionId, exercise.id);
          console.log('[openExercise] Sets loaded for', exercise.id, { source: cached?.length > 0 ? 'cache' : 'api', count: setsData.length, sets: setsData.map(s => ({ id: s.id, reps: s.reps, intensity: s.intensity })) });
          setExerciseSets(setsData);
          setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
          setUnsavedSetChanges({});
          setNumberOfSetsForNewExercise(setsData.length > 0 ? setsData.length : 3);
          const objectivesForDefaults = (exercise.objectives || []).filter(o => o !== 'previous').length ? (exercise.objectives || []).filter(o => o !== 'previous') : ['reps', 'intensity'];
          if (exercise.defaultSetValues && typeof exercise.defaultSetValues === 'object' && Object.keys(exercise.defaultSetValues).length > 0) {
            const loaded = {};
            objectivesForDefaults.forEach(o => {
              const v = exercise.defaultSetValues[o];
              loaded[o] = v != null && v !== '' ? v : '';
            });
            setNewExerciseDefaultSetValues(loaded);
          } else if (setsData.length > 0 && setsData[0]) {
            const first = setsData[0];
            const fallback = {};
            objectivesForDefaults.forEach(o => {
              const v = first[o];
              fallback[o] = v != null && v !== '' ? v : '';
            });
            setNewExerciseDefaultSetValues(fallback);
          } else {
            setNewExerciseDefaultSetValues({});
          }
        } catch (err) {
          logger.error('Error loading sets:', err);
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
      logger.error('Error opening exercise modal:', error);
      showToast('No pudimos abrir el ejercicio. Intenta de nuevo.', 'error');
    }
  };

  const handleCloseExerciseModal = () => {
    // Flush any pending debounced set saves so we send them before clearing state (saves run in background; we only notify on failure)
    const pendingIds = Array.from(pendingSetSavesRef.current);
    pendingSetSavesRef.current.clear();
    if (saveSetTimeoutRef.current) {
      clearTimeout(saveSetTimeoutRef.current);
      saveSetTimeoutRef.current = null;
    }
    console.log('[closeExercise] Flushing', pendingIds.length, 'pending saves on close:', pendingIds, { currentExerciseId, exerciseSets: exerciseSets.map(s => ({ id: s.id, reps: s.reps, intensity: s.intensity })) });
    pendingIds.forEach((id) => saveSetChangesRef.current?.(id));

    // Persist default set values before clearing (for existing exercise only)
    if (currentExerciseId && currentExerciseId !== 'new' && user && sessionId && newExerciseDefaultSetValues && Object.keys(newExerciseDefaultSetValues).length > 0) {
      const sanitized = Object.fromEntries(
        Object.entries(newExerciseDefaultSetValues).map(([k, v]) => [k, v === undefined ? null : v])
      );
      contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, { defaultSetValues: sanitized }).catch((err) => logger.error('Error saving default set values:', err));
    }

    setIsExerciseModalOpen(false);
    setSelectedExercise(null);
    setExerciseDraft(null);
    setIsCreatingExercise(false);
    setExerciseSets([]);
    setOriginalExerciseSets([]);
    setUnsavedSetChanges({});
    setNumberOfSetsForNewExercise(3);
    setOptimisticSetsCount(null);
    setNewExerciseDefaultSetValues({});
    setShowPerSetCards(false);
    setExpandedSeries({});
    setIsAlternativesEditMode(false);
    setAppliedPresetId(null);
    setIsPresetSelectorOpen(false);
    setIsMeasuresObjectivesEditorOpen(false);
  };

  // Cmd/Ctrl+Enter in exercise modal creates exercise when valid
  const canSaveCreatingExerciseRef = useRef(null);
  const handleSaveCreatingExerciseRef = useRef(null);
  useEffect(() => {
    if (!isExerciseModalOpen || !isCreatingExercise) return;
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSaveCreatingExerciseRef.current?.() && !isSavingNewExercise) {
        e.preventDefault();
        handleSaveCreatingExerciseRef.current?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExerciseModalOpen, isCreatingExercise, isSavingNewExercise]);

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
    const fieldsToCheck = (draftObjectives || []).filter(o => o !== 'previous').length ? (draftObjectives || []).filter(o => o !== 'previous') : ['reps', 'intensity'];
    if (originalSet) {
      for (const field of fieldsToCheck) {
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
    if (setHasChanges && set.id) scheduleSetSave(set.id);
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
      setOptimisticSetsCount(target);
      // Optimistic: append placeholder sets so the list updates immediately
      const objectiveFields = (draftObjectives || []).filter(o => o !== 'previous').length ? (draftObjectives || []).filter(o => o !== 'previous') : ['reps', 'intensity'];
      const defaultSet = {};
      objectiveFields.forEach(o => {
        const v = newExerciseDefaultSetValues[o];
        defaultSet[o] = v != null && v !== '' ? (o === 'intensity' && !String(v).endsWith('/10') ? `${String(v).replace(/\/10$/, '')}/10` : v) : null;
      });
      const placeholders = Array.from({ length: target - current }, (_, i) => ({
        id: `pending-add-${Date.now()}-${i}`,
        order: current + i,
        title: `Serie ${current + i + 1}`,
        ...defaultSet
      }));
      setExerciseSets(prev => [...prev, ...placeholders]);
      setOriginalExerciseSets(prev => [...prev, ...placeholders.map(p => ({ ...p }))]);
      setUnsavedSetChanges(prev => ({ ...prev, ...Object.fromEntries(placeholders.map(p => [p.id, false])) }));
      (async () => {
        try {
          for (let i = 0; i < target - current; i++) {
            await handleCreateSet();
          }
          const data = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
          const defaultPayload = {};
          objectiveFields.forEach(o => {
            const v = newExerciseDefaultSetValues[o];
            if (v != null && v !== '') defaultPayload[o] = o === 'intensity' && !String(v).endsWith('/10') ? `${String(v).replace(/\/10$/, '')}/10` : v;
          });
          if (Object.keys(defaultPayload).length > 0) {
            for (const set of data) {
              const update = {};
              objectiveFields.forEach(o => { update[o] = defaultPayload[o] ?? set[o] ?? null; });
              await contentApi.updateSetInLibraryExercise(user.uid, sessionId, currentExerciseId, set.id, update);
            }
          }
          const updated = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
          setExerciseSets(updated);
          setOriginalExerciseSets(JSON.parse(JSON.stringify(updated)));
          setUnsavedSetChanges({});
        } catch (err) {
          logger.error('Error adding sets:', err);
          setExerciseSets(exerciseSets);
          setOriginalExerciseSets(JSON.parse(JSON.stringify(originalExerciseSets)));
          setUnsavedSetChanges(unsavedSetChanges);
          showToast('No pudimos añadir series. Intenta de nuevo.', 'error');
        } finally {
          setOptimisticSetsCount(null);
        }
      })();
    } else {
      setNumberOfSetsForNewExercise(target);
      const toRemove = exerciseSets.slice(-(current - target));
      const toRemoveIds = new Set(toRemove.map(s => s.id));
      // Optimistic: remove sets from list immediately
      setExerciseSets(prev => prev.filter(s => !toRemoveIds.has(s.id)));
      setOriginalExerciseSets(prev => prev.filter(s => !toRemoveIds.has(s.id)));
      setUnsavedSetChanges(prev => {
        const next = { ...prev };
        toRemove.forEach(s => { delete next[s.id]; });
        return next;
      });
      (async () => {
        try {
          for (const s of toRemove) {
            await contentApi.deleteSetFromLibraryExercise(user.uid, sessionId, currentExerciseId, s.id);
          }
        } catch (err) {
          logger.error('Error deleting sets:', err);
          const refetched = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
          setExerciseSets(refetched);
          setOriginalExerciseSets(JSON.parse(JSON.stringify(refetched)));
          setUnsavedSetChanges({});
          showToast('No pudimos eliminar series. Intenta de nuevo.', 'error');
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
    updatedSets.forEach(s => { if (s.id) scheduleSetSave(s.id); });
  };

  const handleSaveSetChanges = async (setId) => {
    if (!user || !sessionId) { console.log('[saveSet] SKIP: no user or sessionId'); return; }
    if (setId && setId.startsWith('pending-add-')) { console.log('[saveSet] SKIP: pending-add set', setId); return; }

    if (isCreatingExercise) {
      console.log('[saveSet] SKIP: isCreatingExercise, buffering locally', setId);
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

    if (!currentExerciseId) { console.log('[saveSet] SKIP: no currentExerciseId'); return; }

    const setIndex = exerciseSets.findIndex(s => s.id === setId);
    if (setIndex === -1) { console.log('[saveSet] SKIP: set not found in exerciseSets', setId, 'available:', exerciseSets.map(s => s.id)); return; }

    const set = exerciseSets[setIndex];
    const originalSet = originalExerciseSets.find(s => s.id === setId);

    if (!set || !originalSet) { console.log('[saveSet] SKIP: set or originalSet null', { set: !!set, originalSet: !!originalSet }); return; }

    const updateData = {};
    let hasChanges = false;
    const fieldsToSave = (draftObjectives || []).filter(o => o !== 'previous').length ? (draftObjectives || []).filter(o => o !== 'previous') : ['reps', 'intensity'];
    console.log('[saveSet] Diffing set', setId, { fieldsToSave, current: Object.fromEntries(fieldsToSave.map(f => [f, set[f]])), original: Object.fromEntries(fieldsToSave.map(f => [f, originalSet[f]])) });
    for (const field of fieldsToSave) {
      const current = set[field];
      const original = originalSet[field];
      const currentNormalized = current === null || current === undefined || current === '' ? null : String(current);
      const originalNormalized = original === null || original === undefined || original === '' ? null : String(original);
      if (currentNormalized !== originalNormalized) {
        if (field === 'intensity' && current != null && current !== '') {
          updateData[field] = current;
        } else {
          updateData[field] = (current === null || current === undefined || current === '') ? null : current;
        }
        hasChanges = true;
      }
    }

    if (!hasChanges) { console.log('[saveSet] SKIP: no changes detected for', setId); return; }

    try {
      setIsSavingSetChanges(true);
      console.log('[saveSet] SAVING', { setId, exerciseId: currentExerciseId, sessionId, updateData, editScope: effectiveEditScope, isClientPlan: effectiveIsClientPlanEdit, isProgramPlan: effectiveIsProgramPlanEdit });
      await contentApi.updateSetInLibraryExercise(user.uid, sessionId, currentExerciseId, setId, updateData);
      console.log('[saveSet] SUCCESS', setId);
      // Optimistic success: update "saved" baseline from current state (no refetch, no notification)
      setOriginalExerciseSets(prev => prev.map(s => s.id === setId ? { ...exerciseSets[setIndex] } : s));
      setUnsavedSetChanges(prev => {
        const newState = { ...prev };
        delete newState[setId];
        return newState;
      });
    } catch (err) {
      console.error('[saveSet] FAILED', setId, err);
      logger.error('Error saving set changes:', err);
      setUnsavedSetChanges(prev => ({ ...prev, [setId]: true }));
      showToast('Los cambios no se pudieron guardar. Puedes volver a editar para reintentar.', 'error');
    } finally {
      setIsSavingSetChanges(false);
    }
  };

  saveSetChangesRef.current = handleSaveSetChanges;

  const scheduleSetSave = useCallback((setId) => {
    if (!setId) return;
    pendingSetSavesRef.current.add(setId);
    if (saveSetTimeoutRef.current) clearTimeout(saveSetTimeoutRef.current);
    saveSetTimeoutRef.current = setTimeout(() => {
      const ids = Array.from(pendingSetSavesRef.current);
      pendingSetSavesRef.current.clear();
      saveSetTimeoutRef.current = null;
      console.log('[scheduleSetSave] Flushing', ids.length, 'pending saves:', ids);
      ids.forEach((id) => {
        saveSetChangesRef.current?.(id);
      });
    }, 600);
  }, []);

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
      const newSet = await contentApi.createSetInLibraryExercise(user.uid, sessionId, currentExerciseId, exerciseSets.length);

      const setsData = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
      setExerciseSets(setsData);
      setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
      setUnsavedSetChanges({});
      
      return newSet;
    } catch (err) {
      logger.error('Error creating set:', err);
      showToast('No pudimos crear la serie. Intenta de nuevo.', 'error');
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
      logger.error('Error duplicando serie:', err);
      showToast('No pudimos duplicar la serie. Intenta de nuevo.', 'error');
    }
  };

  const handleDeleteSet = async (set, options = {}) => {
    if (!user || !sessionId || !set || !set.id) return;

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

    if (set.id.startsWith('pending-add-')) {
      setExerciseSets(prev => prev.filter(s => s.id !== set.id));
      setOriginalExerciseSets(prev => prev.filter(s => s.id !== set.id));
      setUnsavedSetChanges(prev => { const next = { ...prev }; delete next[set.id]; return next; });
      return;
    }

    if (!currentExerciseId) return;

    const setId = set.id;
    setExerciseSets(prev => prev.filter(s => s.id !== setId));
    setOriginalExerciseSets(prev => prev.filter(s => s.id !== setId));
    setUnsavedSetChanges(prev => { const next = { ...prev }; delete next[setId]; return next; });

    try {
      await contentApi.deleteSetFromLibraryExercise(user.uid, sessionId, currentExerciseId, setId);
    } catch (err) {
      logger.error('Error deleting set:', err);
      const setsData = await contentApi.getSetsByLibraryExercise(user.uid, sessionId, currentExerciseId);
      setExerciseSets(setsData);
      setOriginalExerciseSets(JSON.parse(JSON.stringify(setsData)));
      setUnsavedSetChanges({});
      showToast('No pudimos eliminar la serie. Intenta de nuevo.', 'error');
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
      logger.error('Error saving series order:', err);
      showToast('No pudimos guardar el orden de las series. Intenta de nuevo.', 'error');
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
  canSaveCreatingExerciseRef.current = canSaveCreatingExercise;

  const handleSaveCreatingExercise = async () => {
    if (!canSaveCreatingExercise() || !user || !sessionId) return;

    const primaryValues = Object.values(exerciseDraft.primary || {});
    if (primaryValues.length === 0 || !primaryValues[0]) {
      showToast('Debes seleccionar un ejercicio principal', 'error');
      return;
    }

    const primaryExerciseName = primaryValues[0];
    const nextOrder = exercises.length;

    const updateData = {
      primary: exerciseDraft.primary,
      alternatives: exerciseDraft.alternatives || {},
      measures: exerciseDraft.measures || [],
      objectives: exerciseDraft.objectives || [],
      customMeasureLabels: exerciseDraft.customMeasureLabels && typeof exerciseDraft.customMeasureLabels === 'object' ? exerciseDraft.customMeasureLabels : {},
      customObjectiveLabels: exerciseDraft.customObjectiveLabels && typeof exerciseDraft.customObjectiveLabels === 'object' ? exerciseDraft.customObjectiveLabels : {},
    };

    // Build sets to create
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

    // Optimistic: add exercise to list immediately
    const placeholderId = `pending-create-${Date.now()}`;
    const optimisticExercise = {
      ...updateData,
      id: placeholderId,
      order: nextOrder,
      sets: setsToCreate,
      dragId: `session-${placeholderId}`,
      isInSession: true,
    };
    setExercises(prev => [...prev, optimisticExercise]);

    // Close modal immediately
    setIsExerciseModalOpen(false);
    setIsCreatingExercise(false);
    setSelectedExercise(null);
    setExerciseDraft(null);
    setExerciseSets([]);
    setOriginalExerciseSets([]);
    setUnsavedSetChanges({});
    loadExercisesFromLibrary(selectedLibraryId);

    // Server calls in background
    setIsSavingNewExercise(true);
    try {
      const newExercise = await contentApi.createExerciseInLibrarySession(
        user.uid, sessionId, primaryExerciseName, nextOrder
      );
      const realId = newExercise.id || newExercise.exerciseId;

      await contentApi.updateExerciseInLibrarySession(user.uid, sessionId, realId, updateData);

      const isLibMode = !effectiveIsClientEdit && !effectiveIsAnyPlanContentEdit && !isPlanInstanceEdit;
      if (isLibMode && setsToCreate.length > 0) {
        // Parallel: create all sets, then update all with values
        const createdSets = await Promise.all(
          setsToCreate.map((_, i) =>
            contentApi.createSetInLibraryExercise(user.uid, sessionId, realId, i)
          )
        );
        const updatePromises = createdSets.map((createdSet, i) => {
          const set = setsToCreate[i];
          const setRealId = createdSet?.id || createdSet?.setId;
          const updateSetData = {};
          if (set.reps != null && set.reps !== '') updateSetData.reps = set.reps;
          if (set.intensity != null && set.intensity !== '') updateSetData.intensity = set.intensity;
          Object.keys(set).forEach(k => {
            if (!['id', 'order', 'title', 'reps', 'intensity'].includes(k) && set[k] != null && set[k] !== '') {
              updateSetData[k] = set[k];
            }
          });
          if (Object.keys(updateSetData).length > 0 && setRealId) {
            return contentApi.updateSetInLibraryExercise(user.uid, sessionId, realId, setRealId, updateSetData);
          }
        });
        await Promise.all(updatePromises.filter(Boolean));
      } else {
        for (let i = 0; i < setsToCreate.length; i++) {
          const set = setsToCreate[i];
          const createdSet = await contentApi.createSetInLibraryExercise(user.uid, sessionId, realId, i);
          const setRealId = createdSet?.id || createdSet?.setId;
          const updateSetData = {};
          if (set.reps != null && set.reps !== '') updateSetData.reps = set.reps;
          if (set.intensity != null && set.intensity !== '') updateSetData.intensity = set.intensity;
          Object.keys(set).forEach(k => {
            if (!['id', 'order', 'title', 'reps', 'intensity'].includes(k) && set[k] != null && set[k] !== '') {
              updateSetData[k] = set[k];
            }
          });
          if (Object.keys(updateSetData).length > 0 && setRealId) {
            await contentApi.updateSetInLibraryExercise(user.uid, sessionId, realId, setRealId, updateSetData);
          }
        }
      }

      // Replace placeholder with real ID (keep original dragId to avoid React remount)
      setExercises(prev => prev.map(ex => ex.id === placeholderId
        ? { ...ex, id: realId }
        : ex
      ));
      setHasMadeChanges(true);
    } catch (err) {
      // Rollback: remove placeholder
      setExercises(prev => prev.filter(ex => ex.id !== placeholderId));
      logger.error('Error creating exercise:', err);
      showToast('No pudimos crear el ejercicio. Intenta de nuevo.', 'error');
    } finally {
      setIsSavingNewExercise(false);
    }
  };
  handleSaveCreatingExerciseRef.current = handleSaveCreatingExercise;

  // Handlers for exercise configuration (adapted from ProgramDetailScreen for library sessions)
  const handleEditPrimary = () => {
    if (!user) return;
    if (!isCreatingExercise && !currentExerciseId) return;

    setLibraryExerciseModalMode('primary');
    setAlternativeToEdit(null);
    setSelectedLibraryForExercise(null);
    setExercisesFromSelectedLibrary([]);
    setAvailableLibrariesForSelection(availableLibraries);
    setIsLibraryExerciseModalOpen(true);
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
      logger.error('Error loading exercises from library:', err);
      showToast('No pudimos cargar los ejercicios de la biblioteca. Intenta de nuevo.', 'error');
    } finally {
      setIsLoadingExercisesFromLibrary(false);
    }
  };

  const handleSelectExercise = async (exerciseName) => {
    if (!selectedLibraryForExercise || !exerciseName) return;

    let apiUpdatePayload = null;

    try {
      setIsSavingLibraryExerciseChoice(true);

      if (libraryExerciseModalMode === 'primary') {
        const primaryUpdate = { [selectedLibraryForExercise]: exerciseName };
        apiUpdatePayload = { primary: primaryUpdate };
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
        apiUpdatePayload = { alternatives: currentAlternatives };
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
        apiUpdatePayload = { alternatives: currentAlternatives };
        setExerciseDraft(prev => ({
          ...prev,
          alternatives: currentAlternatives
        }));
        setSelectedExercise(prev => ({
          ...prev,
          alternatives: currentAlternatives
        }));
      }

      // Optimistic: update exercises list from local draft state
      if (currentExerciseId) {
        setExercises(prev => prev.map(ex => ex.id === currentExerciseId
          ? { ...ex, ...apiUpdatePayload, dragId: ex.dragId || `session-${ex.id}`, isInSession: true }
          : ex
        ));
      }

      handleCloseLibraryExerciseModal();

      // Fire-and-forget server call
      if (!isCreatingExercise && currentExerciseId && apiUpdatePayload) {
        contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, apiUpdatePayload)
          .then(() => setHasMadeChanges(true))
          .catch((err) => {
            logger.error('Error updating exercise:', err);
            showToast('No pudimos guardar el cambio de ejercicio. Intenta de nuevo.', 'error');
          });
      }
    } catch (err) {
      logger.error('Error updating exercise:', err);
      showToast('No pudimos actualizar el ejercicio. Intenta de nuevo.', 'error');
    } finally {
      setIsSavingLibraryExerciseChoice(false);
    }
  };

  const handleCloseLibraryExerciseModal = () => {
    setIsLibraryExerciseModalOpen(false);
    setLibraryExerciseModalMode(null);
    setSelectedLibraryForExercise(null);
    setExercisesFromSelectedLibrary([]);
    setAvailableLibrariesForSelection([]);
    setAlternativeToEdit(null);
    setLibraryPickerLibrarySearch('');
    setLibraryPickerExerciseSearch('');
    setIsSavingLibraryExerciseChoice(false);
  };

  const handleOpenPropagateModal = async () => {
    if (!user?.uid || !sessionId) return;
    try {
      // Use already-fetched details if available
      if (!detailsFetchedRef.current) {
        const { users, programs, programCount } = await propagationService.getAffectedDetailsForLibrarySession(user.uid, sessionId);
        setPropagateAffectedUsers(users);
        setPropagateAffectedPrograms(programs);
        setPropagateAffectedCount(users.length);
        setLibraryUsageCount(prev => prev || programCount || 0);
        detailsFetchedRef.current = true;
      }
      setIsPropagateModalOpen(true);
    } catch (err) {
      logger.error('Error finding affected users:', err);
      showToast('No pudimos comprobar usuarios afectados. Intenta de nuevo.', 'error');
    }
  };

  // Fetch library usage count + affected count only after first mutation (deferred — saves ~67 Firestore reads on view-only visits)
  useEffect(() => {
    if (!hasMadeChanges) return;
    if (!user?.uid || !sessionId || effectiveIsClientEdit || effectiveIsAnyPlanContentEdit || isPlanInstanceEdit) return;
    propagationService.findAffectedByLibrarySession(user.uid, sessionId)
      .then(({ affectedUserIds, programCount }) => {
        setLibraryUsageCount(programCount || affectedUserIds.length);
        setPropagateAffectedCount(affectedUserIds.length);
      })
      .catch((err) => console.error('[Propagation] Error fetching affected:', err));
  }, [user?.uid, sessionId, effectiveIsClientEdit, effectiveIsAnyPlanContentEdit, isPlanInstanceEdit, hasMadeChanges]);

  // Fetch plan affected count on mount (plan instance edit only)
  const [planAffectedCount, setPlanAffectedCount] = useState(0);
  useEffect(() => {
    if (!isPlanInstanceEdit || !planInstancePlanId) return;
    propagationService.findAffectedByPlan(planInstancePlanId)
      .then(({ affectedUserIds }) => setPlanAffectedCount(affectedUserIds?.length ?? 0))
      .catch(() => {});
  }, [isPlanInstanceEdit, planInstancePlanId]);

  // Eagerly fetch affected details (users + programs) once changes are made and references exist
  const detailsFetchedRef = useRef(false);
  useEffect(() => {
    if (!hasMadeChanges || libraryUsageCount === 0 || !user?.uid || !sessionId) return;
    if (detailsFetchedRef.current) return;
    detailsFetchedRef.current = true;
    propagationService.getAffectedDetailsForLibrarySession(user.uid, sessionId)
      .then(({ users, programs }) => {
        setPropagateAffectedUsers(users);
        setPropagateAffectedPrograms(programs);
      })
      .catch((err) => logger.warn('Error fetching affected details:', err));
  }, [hasMadeChanges, libraryUsageCount, user?.uid, sessionId]);

  // Block browser close/refresh when unpropagated changes
  useEffect(() => {
    const shouldBlock = !effectiveIsClientEdit && !effectiveIsAnyPlanContentEdit && !isPlanInstanceEdit && hasMadeChanges && libraryUsageCount > 0;
    const handler = (e) => {
      if (shouldBlock) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    if (shouldBlock) {
      window.addEventListener('beforeunload', handler);
    }
    return () => window.removeEventListener('beforeunload', handler);
  }, [effectiveIsClientEdit, effectiveIsAnyPlanContentEdit, isPlanInstanceEdit, hasMadeChanges, libraryUsageCount]);

  const handleBack = () => {
    const navState = hasMadeChanges ? { ...backState, sessionChanged: true } : backState;
    if (effectiveIsClientEdit || effectiveIsAnyPlanContentEdit) {
      if (sessionId) setStoredClientEditContext(sessionId, null);
      navigate(backPath, { state: navState });
      return;
    }
    if (isPlanInstanceEdit && hasMadeChanges) {
      navigate(backPath, { state: { ...backState, planHasChanges: true, sessionChanged: true } });
      return;
    }
    if (hasMadeChanges && libraryUsageCount > 0) {
      setIsNavigateModalOpen(true);
    } else {
      navigate(backPath, { state: navState });
    }
  };

  const handleNavigatePropagate = () => {
    handlePropagate();
    setIsNavigateModalOpen(false);
    navigate(backPath, { state: { ...backState, sessionChanged: true } });
  };

  const handleNavigateLeaveWithoutPropagate = () => {
    setIsNavigateModalOpen(false);
    setHasMadeChanges(false);
    navigate(backPath, { state: backState });
  };

  const handlePropagate = async (mode = 'all') => {
    if (!user?.uid || !sessionId) return;
    setHasMadeChanges(false);
    if (mode === 'forward_only') {
      showToast('Los cambios solo se aplicaran a nuevas asignaciones.', 'success');
      libraryService.propagateLibrarySession(sessionId, mode).catch(() => {});
      return;
    }
    showToast('Propagando cambios...', 'info', 10000);
    libraryService.propagateLibrarySession(sessionId, mode)
      .then((result) => {
        const count = result?.updatedCount ?? 0;
        showToast(count > 0 ? `Cambios propagados a ${count} sesion(es).` : 'No habia sesiones para actualizar.', 'success');
      })
      .catch((err) => {
        logger.error('Error propagating:', err);
        setHasMadeChanges(true);
        showToast('Error al propagar.', 'error', 6000, {
          action: { label: 'Reintentar', onClick: () => handlePropagate(mode) },
        });
      });
  };

  const handleAddAlternative = () => {
    if (!user) return;
    if (!isCreatingExercise && !currentExerciseId) return;

    setLibraryExerciseModalMode('add-alternative');
    setAlternativeToEdit(null);
    setSelectedLibraryForExercise(null);
    setExercisesFromSelectedLibrary([]);
    setAvailableLibrariesForSelection(availableLibraries);
    setIsLibraryExerciseModalOpen(true);
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

        // Optimistic update
        setExerciseDraft(prev => ({ ...prev, alternatives: currentAlternatives }));
        setSelectedExercise(prev => prev ? { ...prev, alternatives: currentAlternatives } : null);
        setExercises(prev => prev.map(ex => ex.id === currentExerciseId
          ? { ...ex, alternatives: currentAlternatives }
          : ex
        ));

        // Fire-and-forget
        contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, {
          alternatives: currentAlternatives
        })
          .then(() => setHasMadeChanges(true))
          .catch((err) => {
            logger.error('Error deleting alternative:', err);
            showToast('No pudimos eliminar la alternativa. Intenta de nuevo.', 'error');
          });
      }
    } catch (err) {
      logger.error('Error deleting alternative:', err);
      showToast('No pudimos eliminar la alternativa. Intenta de nuevo.', 'error');
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
    // Optimistic update
    setExerciseDraft((prev) => ({ ...prev, ...updates }));
    setSelectedExercise((prev) => (prev ? { ...prev, ...updates } : null));
    setExercises(prev => prev.map(ex => ex.id === currentExerciseId ? { ...ex, ...updates } : ex));
    setAppliedPresetId(preset.id);
    setIsPresetSelectorOpen(false);
    // Fire-and-forget
    contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates)
      .then(() => setHasMadeChanges(true))
      .catch((err) => {
        logger.error('Error applying preset:', err);
        showToast('No pudimos aplicar la plantilla. Intenta de nuevo.', 'error');
      });
  };

  const handleMeasuresObjectivesEditorSave = async (data) => {
    // Cancel any pending debounced onChange API call
    if (measuresChangeTimerRef.current) { clearTimeout(measuresChangeTimerRef.current); measuresChangeTimerRef.current = null; }
    const rawObjectives = data.objectives || [];
    const objectives = rawObjectives.includes('previous') ? rawObjectives : [...rawObjectives, 'previous'];
    const updates = {
      measures: data.measures || [],
      objectives,
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
        logger.error('Error creating preset:', err);
        showToast('No pudimos crear la plantilla. Intenta de nuevo.', 'error');
        return;
      }
    } else if (editorModalMode === 'edit_preset' && presetBeingEditedId && data.name) {
      try {
        await measureObjectivePresetsService.update(user.uid, presetBeingEditedId, { name: data.name, ...updates });
        setPresetsList((prev) => prev.map((p) => (p.id === presetBeingEditedId ? { ...p, name: data.name, ...updates } : p)));
        if (appliedPresetId === presetBeingEditedId) {
          setExerciseDraft((prev) => ({ ...prev, ...updates }));
          setSelectedExercise((prev) => (prev ? { ...prev, ...updates } : null));
          setExercises(prev => prev.map(ex => ex.id === currentExerciseId ? { ...ex, ...updates } : ex));
          if (!isCreatingExercise && currentExerciseId && user && sessionId) {
            contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates)
              .then(() => setHasMadeChanges(true))
              .catch((err) => logger.error('Error updating exercise from preset:', err));
          }
        }
      } catch (err) {
        logger.error('Error updating preset:', err);
        showToast('No pudimos guardar la plantilla. Intenta de nuevo.', 'error');
        return;
      }
    } else if (editorModalMode === 'exercise') {
      if (currentExerciseId) {
        // Editing a specific exercise
        setExerciseDraft((prev) => ({ ...prev, ...updates }));
        setSelectedExercise((prev) => (prev ? { ...prev, ...updates } : null));
        setExercises(prev => prev.map(ex => ex.id === currentExerciseId ? { ...ex, ...updates } : ex));
        if (!isCreatingExercise && user && sessionId) {
          contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates)
            .then(() => setHasMadeChanges(true))
            .catch((err) => {
              logger.error('Error updating exercise:', err);
              showToast('No pudimos guardar los cambios. Intenta de nuevo.', 'error');
            });
        }
      } else if (user && sessionId) {
        // No exercise open — saving session default template
        setLocalDefaultTemplate(updates);
        contentApi.updateLibrarySession(user.uid, sessionId, { defaultDataTemplate: updates })
          .then(() => setHasMadeChanges(true))
          .catch((err) => {
            logger.error('Error saving session template:', err);
            showToast('No pudimos guardar el formato. Intenta de nuevo.', 'error');
            setLocalDefaultTemplate(null);
          });
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
    // Also update parent exercises array so ExpandableExerciseCard gets fresh props
    if (currentExerciseId) {
      setExercises(prev => prev.map(ex => ex.id === currentExerciseId ? { ...ex, ...updates } : ex));
    }
    setAppliedPresetId(null);
    // Debounce the API call to avoid firing on every keystroke
    if (!isCreatingExercise && currentExerciseId && user && sessionId) {
      if (measuresChangeTimerRef.current) clearTimeout(measuresChangeTimerRef.current);
      measuresChangeTimerRef.current = setTimeout(() => {
        contentApi.updateExerciseInLibrarySession(user.uid, sessionId, currentExerciseId, updates).catch((err) => logger.error('Error updating exercise:', err));
      }, 400);
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

  // Stable exercise IDs string — only changes when exercises are added/removed
  const exerciseIdsKey = useMemo(() => exercises.map(e => e.id).join(','), [exercises]);

  // Load library data for session exercises (for planned volume muscle_activation)
  useEffect(() => {
    const currentExercises = exercisesRef.current;
    if (!user || !currentExercises?.length) {
      setVolumeDataLoading(false);
      return;
    }
    const libraryIds = new Set();
    currentExercises.forEach((ex) => {
      const refs = getPrimaryReferences(ex);
      refs.forEach(({ libraryId }) => {
        if (libraryId) libraryIds.add(libraryId);
      });
    });
    // Filter out already-cached libraries
    const toLoad = Array.from(libraryIds).filter(id => !libraryDataCacheRef.current[id]);
    if (toLoad.length === 0) {
      setVolumeDataLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          toLoad.map(async (libraryId) => {
            try {
              const lib = await libraryService.getLibraryById(libraryId);
              return { libraryId, lib };
            } catch (err) {
              logger.warn('[LibrarySessionDetail] Failed to load library for volume:', libraryId, err);
              return { libraryId, lib: null };
            }
          })
        );
        if (cancelled) return;
        const updates = {};
        results.forEach(({ libraryId, lib }) => {
          if (lib) updates[libraryId] = lib;
        });
        if (Object.keys(updates).length > 0) {
          setLibraryDataCache(prev => ({ ...prev, ...updates }));
        }
      } finally {
        if (!cancelled) setVolumeDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, exerciseIdsKey]);

  // Planned muscle volume (effective sets per muscle), assuming user completes every set with intensity >= 7
  const plannedMuscleVolumes = useMemo(() => {
    const parsePlannedIntensity = (val) => {
      if (val == null || val === '') return null;
      const s = String(val).trim().replace(/\s+/g, '');
      const match = s.match(/^(\d+)\/10$/) || s.match(/^(\d+)$/);
      if (!match) return null;
      const n = parseInt(match[1], 10);
      return n >= 1 && n <= 10 ? n : null;
    };
    const muscleSets = {};
    exercises.forEach((exercise) => {
      const refs = getPrimaryReferences(exercise);
      const primary = refs[0];
      if (!primary?.libraryId || !primary?.exerciseName) return;
      const library = libraryDataCache[primary.libraryId];
      const exerciseData = library?.[primary.exerciseName];
      const muscleActivation = exerciseData?.muscle_activation;
      if (!muscleActivation || typeof muscleActivation !== 'object') return;
      // Use live sets from children if available, fall back to exercise.sets from initial load
      const sets = liveSetsMap[exercise.id] || exercise.sets || [];
      let effectiveSets = 0;
      sets.forEach((set) => {
        const intensity = parsePlannedIntensity(set.intensity);
        if (intensity != null && intensity >= 7) effectiveSets++;
      });
      if (effectiveSets <= 0) return;
      Object.entries(muscleActivation).forEach(([muscle, pct]) => {
        const num = typeof pct === 'string' ? parseFloat(pct) : pct;
        if (!Number.isNaN(num)) {
          muscleSets[muscle] = (muscleSets[muscle] || 0) + effectiveSets * (num / 100);
        }
      });
    });
    Object.keys(muscleSets).forEach((m) => {
      muscleSets[m] = Math.round(muscleSets[m] * 10) / 10;
    });
    return muscleSets;
  }, [exercises, libraryDataCache, liveSetsMap]);

  const top3PlannedVolumes = useMemo(
    () =>
      Object.entries(plannedMuscleVolumes)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3),
    [plannedMuscleVolumes]
  );

  // Normalized 0-1 volumes for heatmap SVG (like biblioteca session cards)
  const normalizedMuscleVolumes = useMemo(() => {
    const entries = Object.entries(plannedMuscleVolumes);
    if (!entries.length) return {};
    const max = Math.max(...entries.map(([, v]) => v), 1);
    const normalized = {};
    entries.forEach(([m, v]) => { normalized[m] = v / max; });
    return normalized;
  }, [plannedMuscleVolumes]);

  useEffect(() => {
    if (Object.keys(plannedMuscleVolumes).length === 0) return;
    const el = volumeCardsRowRef.current;
    if (!el) return;
    const t = setTimeout(updateVolumeChevronState, 50);
    return () => clearTimeout(t);
  }, [plannedMuscleVolumes, updateVolumeChevronState]);

  useEffect(() => {
    const el = volumeCardsRowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateVolumeChevronState);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateVolumeChevronState]);

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
        backState={backState}
      >
        <div className="library-session-detail-container">
          {/* Settings card skeleton */}
          <div className="lsd-skeleton-settings">
            <ShimmerSkeleton width="36px" height="36px" borderRadius="8px" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <ShimmerSkeleton width="120px" height="13px" borderRadius="4px" />
              <ShimmerSkeleton width="200px" height="10px" borderRadius="4px" />
            </div>
            <ShimmerSkeleton width="18px" height="18px" borderRadius="4px" />
          </div>

          {/* Body: sidebar + main */}
          <div className="library-session-detail-body">
            {/* Sidebar skeleton */}
            <div className="lsd-skeleton-sidebar">
              <div className="lsd-skeleton-sidebar-tabs">
                <ShimmerSkeleton width="70px" height="28px" borderRadius="6px" />
                <ShimmerSkeleton width="90px" height="28px" borderRadius="6px" />
                <ShimmerSkeleton width="60px" height="28px" borderRadius="6px" />
              </div>
              <div className="lsd-skeleton-sidebar-search">
                <ShimmerSkeleton width="100%" height="32px" borderRadius="8px" />
              </div>
              <div className="lsd-skeleton-sidebar-list">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="lsd-skeleton-sidebar-item">
                    <ShimmerSkeleton width={`${55 + (i % 3) * 15}%`} height="14px" borderRadius="4px" />
                  </div>
                ))}
              </div>
            </div>

            {/* Main area skeleton */}
            <div className="lsd-skeleton-main">
              <div className="lsd-skeleton-main-header">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <ShimmerSkeleton width="200px" height="22px" borderRadius="6px" />
                  <ShimmerSkeleton width="140px" height="13px" borderRadius="4px" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <ShimmerSkeleton width="100px" height="32px" borderRadius="8px" />
                  <ShimmerSkeleton width="32px" height="32px" borderRadius="8px" />
                </div>
              </div>
              <div className="lsd-skeleton-main-exercises">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="lsd-skeleton-exercise-row">
                    <ShimmerSkeleton width={`${45 + (i % 4) * 10}%`} height="14px" borderRadius="4px" />
                    <ShimmerSkeleton width="60px" height="10px" borderRadius="4px" />
                  </div>
                ))}
              </div>
            </div>

            {/* Volume panel skeleton */}
            <div className="lsd-skeleton-volume">
              <div className="lsd-skeleton-volume-header">
                <ShimmerSkeleton width="130px" height="14px" borderRadius="4px" />
              </div>
              <div className="lsd-skeleton-volume-body">
                <div className="lsd-vol-skel-silhouette" />
                <div className="lsd-vol-skel-rows">
                  {[100, 80, 60, 45, 30].map((w, i) => (
                    <div key={i} className="lsd-vol-skel-row">
                      <div className="lsd-vol-skel-label" />
                      <div className="lsd-vol-skel-bar-wrap">
                        <div className="lsd-vol-skel-bar" style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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
        backState={backState}
      >
        <FullScreenError
          title="No se pudo cargar la sesion"
          message={error || 'Esta sesión no existe o fue eliminada'}
          onRetry={() => navigate(0)}
        />
      </DashboardLayout>
    );
  }

  return (
    <ErrorBoundary>
    <ProgressiveRevealProvider screenKey="session-detail">
    <ScrollProgress />
    <DashboardLayout
      screenName={effectiveTitle || session.title}
      showBackButton={true}
      backPath={backPath}
      backState={backState}
      onBack={handleBack}
      headerRight={hasMadeChanges && (
        (!effectiveIsClientEdit && !effectiveIsAnyPlanContentEdit && !isPlanInstanceEdit && libraryUsageCount > 0) ||
        (isPlanInstanceEdit && planAffectedCount > 0)
      ) ? (
        <div className="library-session-propagate-group">
          <button
            type="button"
            className="library-session-propagate-button"
            onClick={isPlanInstanceEdit ? () => {
              setHasMadeChanges(false);
              showToast('Propagando cambios...', 'info', 10000);
              propagationService.propagatePlan(planInstancePlanId)
                .then((result) => {
                  showToast(result.propagated > 0 ? `Cambios propagados a ${result.propagated} copia(s).` : 'No habia copias para actualizar.', 'success');
                })
                .catch((err) => {
                  logger.error('Error propagating plan:', err);
                  setHasMadeChanges(true);
                  showToast('Error al propagar.', 'error', 6000, {
                    action: { label: 'Reintentar', onClick: () => document.querySelector('.library-session-propagate-button')?.click() },
                  });
                });
            } : handleOpenPropagateModal}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isPropagating ? 'Propagando...' : isPlanInstanceEdit ? `Propagar plan a ${planAffectedCount} cliente(s)` : 'Propagar cambios'}
          </button>
          <button
            type="button"
            className="library-session-propagate-dismiss"
            onClick={() => setHasMadeChanges(false)}
            title="Descartar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      ) : null}
    >
      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelect={handleHeaderImageSelect}
        creatorId={user?.uid}
        accept="image/*"
      />
      <PropagateChangesModal
        isOpen={isPropagateModalOpen}
        onClose={() => setIsPropagateModalOpen(false)}
        type="library_session"
        itemName={session?.title}
        affectedCount={propagateAffectedCount}
        affectedUsers={propagateAffectedUsers}
        affectedPrograms={propagateAffectedPrograms}
        programCount={libraryUsageCount}
        isPropagating={isPropagating}
        onPropagate={handlePropagate}
      />
      <PropagateNavigateModal
        isOpen={isNavigateModalOpen}
        onClose={() => setIsNavigateModalOpen(false)}
        type="library_session"
        itemName={session?.title}
        affectedCount={propagateAffectedCount}
        affectedUsers={propagateAffectedUsers}
        affectedPrograms={propagateAffectedPrograms}
        programCount={libraryUsageCount}
        isPropagating={isPropagating}
        onPropagate={handleNavigatePropagate}
        onLeaveWithoutPropagate={handleNavigateLeaveWithoutPropagate}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={`library-session-detail-container ${(effectiveIsClientEdit || effectiveIsAnyPlanContentEdit || isPlanInstanceEdit) ? 'library-session-detail-container-has-banner' : ''} ${accentRgb ? 'has-accent' : ''}`} style={accentStyle}>
          {isPlanInstanceEdit && (
            <div className="library-session-client-edit-banner esim-clickable" role="button" tabIndex={0} onClick={() => setShowScopeInfo(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowScopeInfo(true); }}>
              <svg className="library-session-client-only-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 16V12M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="library-session-client-edit-banner-text">
                Editando solo esta semana del plan. Los cambios no afectan la biblioteca ni otras semanas.
              </span>
            </div>
          )}
          {(effectiveIsClientEdit || effectiveIsAnyPlanContentEdit) && !isPlanInstanceEdit && (
            <div className="library-session-client-only-banner esim-clickable" role="button" tabIndex={0} onClick={(e) => { if (!e.target.closest('.library-session-client-edit-revert')) setShowScopeInfo(true); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowScopeInfo(true); }}>
              <svg className="library-session-client-only-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 16V12M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="library-session-client-only-text">
                {effectiveIsProgramPlanEdit
                  ? `Editando solo para este programa (${effectiveProgramName})`
                  : `Editando solo para ${clientName}`}
              </span>
              {effectiveIsClientEdit && hasClientCopy && (
                <button
                  type="button"
                  className="library-session-client-edit-revert"
                  onClick={async () => {
                    const ok = await confirm('¿Restablecer esta sesion al contenido de la biblioteca? Se perderan los cambios personalizados para este cliente.');
                    if (!ok) return;
                    try {
                      await clientSessionContentService.deleteClientSessionContent(effectiveClientSessionId);
                      hasClientCopyRef.current = false;
                      setHasClientCopy(false);
                      if (sessionId) setStoredClientEditContext(sessionId, null);
                      sessionDataSeededRef.current = false;
                      queryClient.invalidateQueries({ queryKey: queryKeys.library.sessions(user.uid) });
                    } catch (err) {
                      logger.error('Error reverting to library:', err);
                      showToast('No pudimos restablecer la sesion. Intenta de nuevo.', 'error');
                    }
                  }}
                >
                  Restablecer a la biblioteca
                </button>
              )}
            </div>
          )}
          <EditScopeInfoModal
            isOpen={showScopeInfo}
            onClose={() => setShowScopeInfo(false)}
            scope={isPlanInstanceEdit ? 'plan-instance' : effectiveIsAnyPlanContentEdit ? 'session-client-plan' : 'session-client'}
            clientName={clientName}
          />

          {/* Session Settings Card — full width, expandable */}
          <Revealable step="session-header">
          <div className="lsd-glow-wrap lsd-glow-wrap--settings">
            <GlowingEffect spread={40} proximity={120} borderWidth={1} />
          <div className={`library-session-settings-card ${isSettingsPanelOpen ? 'library-session-settings-card--expanded' : ''} ${(!session.image_url || !sessionDefaultTemplate) && !isSettingsPanelOpen ? 'library-session-settings-card--nudge' : ''}`}>
            {/* Marquee overlay — only when collapsed + missing items */}
            {!isSettingsPanelOpen && (!session.image_url || !sessionDefaultTemplate) && (
              <button type="button" className="lss-nudge-bar" onClick={() => setIsSettingsPanelOpen(true)}>
                <div className="lss-nudge-marquee-track">
                  {Array.from({ length: 6 }).map((_, repeatIdx) => (
                    <span key={repeatIdx} className="lss-nudge-marquee-content">
                      {!session.image_url && (
                        <span>Añade una portada para que tus usuarios reconozcan esta sesión</span>
                      )}
                      {!session.image_url && !sessionDefaultTemplate && (
                        <span className="lss-nudge-marquee-dot">·</span>
                      )}
                      {!sessionDefaultTemplate && (
                        <span>Escoge qué datos registran tus usuarios en cada serie</span>
                      )}
                      <span className="lss-nudge-marquee-dot">·</span>
                    </span>
                  ))}
                </div>
              </button>
            )}

            {/* Normal bar — hidden when marquee is showing */}
            {(isSettingsPanelOpen || (session.image_url && sessionDefaultTemplate)) && (
              <button
                type="button"
                className="library-session-settings-card-bar"
                onClick={() => setIsSettingsPanelOpen(prev => !prev)}
              >
                <div className="library-session-settings-card-bar-left">
                  {session.image_url && (
                    <img src={session.image_url} alt="" className="library-session-settings-card-thumb" />
                  )}
                  <div className="library-session-settings-card-meta">
                    <span className="library-session-settings-card-label">Ajustes de sesión</span>
                    {!isSettingsPanelOpen && (
                      <div className="library-session-settings-card-pills">
                        {exercises.length > 0 && (
                          <span className="library-session-settings-card-pill">{exercises.length} {exercises.length === 1 ? 'ejercicio' : 'ejercicios'}</span>
                        )}
                        {!effectiveIsClientEdit && !effectiveIsAnyPlanContentEdit && !isPlanInstanceEdit && libraryUsageCount > 0 && (
                          <span className="library-session-settings-card-pill">
                            {libraryUsageCount} {libraryUsageCount === 1 ? 'programa' : 'programas'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <svg className={`library-session-settings-card-chevron ${isSettingsPanelOpen ? 'library-session-settings-card-chevron--open' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}

            {/* Expandable body — animated via CSS grid */}
            <div className="lss-expand-wrapper">
              <div className="lss-expand-inner">
                {/* Session title — editable */}
                <div className="lss-title-row">
                  <label className="lss-title-label" htmlFor="lss-title-input">Nombre</label>
                  <input
                    id="lss-title-input"
                    type="text"
                    className="lss-title-input"
                    value={effectiveTitle}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Nombre de la sesión"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="lss-expanded">
                {/* Card 1: Image */}
                <div className="lsd-glow-wrap lsd-glow-wrap--card lsd-glow-wrap--image">
                  <GlowingEffect spread={40} proximity={100} borderWidth={1} />
                <MediaDropZone onSelect={handleHeaderImageSelect} accept="image/*">
                <div className="lss-card lss-card-image" onClick={() => setIsMediaPickerOpen(true)}>
                  {session.image_url ? (
                    <img src={session.image_url} alt="" className="lss-card-image-img" />
                  ) : (
                    <div className="lss-card-image-empty">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span>Agregar portada</span>
                    </div>
                  )}
                  <div className="lss-card-image-hover">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Cambiar
                  </div>
                </div>
                </MediaDropZone>
                </div>

                {/* Card 2: Usage chart */}
                <div className="lsd-glow-wrap lsd-glow-wrap--card lsd-glow-wrap--chart">
                  <GlowingEffect spread={40} proximity={100} borderWidth={1} />
                <div className="lss-card lss-card-chart">
                  <div className="lss-card-header">
                    <h4 className="lss-card-title">Alcance</h4>
                  </div>
                  <div className="lss-chart-stats">
                    <div className="lss-chart-stat">
                      <span className="lss-chart-stat-num">{libraryUsageCount || 0}</span>
                      <span className="lss-chart-stat-label">{libraryUsageCount === 1 ? 'programa' : 'programas'}</span>
                    </div>
                    <div className="lss-chart-stat">
                      <span className="lss-chart-stat-num">{propagateAffectedCount || 0}</span>
                      <span className="lss-chart-stat-label">{propagateAffectedCount === 1 ? 'usuario' : 'usuarios'}</span>
                    </div>
                  </div>
                  <div className="lss-chart-line">
                    <ResponsiveContainer width="100%" height={100}>
                      <LineChart data={[
                        { name: 'Ene', v: 0 },
                        { name: 'Feb', v: Math.max(1, Math.round((libraryUsageCount || 0) * 0.2)) },
                        { name: 'Mar', v: Math.max(1, Math.round((libraryUsageCount || 0) * 0.4)) },
                        { name: 'Abr', v: Math.max(1, Math.round((libraryUsageCount || 0) * 0.5)) },
                        { name: 'May', v: Math.max(1, Math.round((libraryUsageCount || 0) * 0.7)) },
                        { name: 'Hoy', v: libraryUsageCount || 0 },
                      ]}>
                        <defs>
                          <linearGradient id="lss-line-grad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
                            <stop offset="100%" stopColor="rgba(255,255,255,0.4)" />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)' }} />
                        <YAxis hide />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="lss-chart-tooltip">
                                {payload[0].payload.name}: {payload[0].value}
                              </div>
                            );
                          }}
                        />
                        <Line type="monotone" dataKey="v" stroke="url(#lss-line-grad)" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: 'rgba(255,255,255,0.8)' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                </div>
                </div>
              </div>
            </div>
          </div>
          </div>
          </Revealable>

          <div className="library-session-detail-body">
          {/* Sidebar - Available Exercises */}
          <Revealable step="available-exercises">
          <div className="lsd-glow-wrap lsd-glow-wrap--sidebar">
            <GlowingEffect spread={40} proximity={120} borderWidth={1} />
          <div className="library-session-sidebar">
            {/* Library tabs */}
            <div className="library-session-sidebar-tabs">
              {availableLibraries.map((library) => (
                <button
                  key={library.id}
                  className={`library-session-sidebar-tab ${selectedLibraryId === library.id ? 'active' : ''}`}
                  onClick={() => setSelectedLibraryId(library.id)}
                >
                  <span>{library.title}</span>
                </button>
              ))}
            </div>

            {/* Search + Filter inline */}
            <div className="library-session-search-row">
              <div className="library-session-search-input-container">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="library-session-search-icon">
                  <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <input
                  type="text"
                  className="library-session-search-input"
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                className={`library-session-filter-icon-btn ${(selectedMuscles.size > 0 || selectedImplements.size > 0) ? 'active' : ''}`}
                onClick={handleOpenFilter}
                title="Filtrar por músculo o implemento"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {(selectedMuscles.size > 0 || selectedImplements.size > 0) && (
                  <span className="library-session-filter-icon-badge">{selectedMuscles.size + selectedImplements.size}</span>
                )}
              </button>
            </div>

            {/* Active Filters (compact chips) */}
            {(selectedMuscles.size > 0 || selectedImplements.size > 0) && (
              <div className="library-session-active-filters">
                <div className="library-session-active-filters-scroll">
                  {Array.from(selectedMuscles).sort().map(muscle => (
                    <span key={muscle} className="library-session-active-filter-chip" onClick={handleOpenFilter}>
                      {getMuscleDisplayName(muscle)}
                    </span>
                  ))}
                  {Array.from(selectedImplements).sort().map(impl => (
                    <span key={impl} className="library-session-active-filter-chip" onClick={handleOpenFilter}>
                      {impl}
                    </span>
                  ))}
                  <button className="library-session-clear-filters-btn" onClick={handleClearAllFilters}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </button>
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
                  <AnimatedList stagger={40} initialDelay={0}>
                    {filteredAvailableExercises.map((exercise) => (
                      <DraggableExercise
                        key={exercise.dragId}
                        exercise={exercise}
                        libraryTitle={exercise.libraryTitle}
                        isInSession={false}
                        onAdd={addExerciseToSession}
                      />
                    ))}
                  </AnimatedList>
                </div>
              )}
            </div>
          </div>
          </div>
          </Revealable>

          {/* Main Area - Session Exercises */}
          <Revealable step="session-exercises">
          <div className="lsd-glow-wrap lsd-glow-wrap--main">
            <GlowingEffect spread={40} proximity={120} borderWidth={1} />
          <div className="library-session-main">
            <DropZone
              id="session-list"
              className={`library-session-exercises-container ${exercises.length === 0 ? 'empty' : ''} ${activeId && String(activeId).startsWith('available-') ? 'lsd-drop-active' : ''}`}
            >
              {exercises.length === 0 ? (
                <div className="library-session-dropzone">
                  <div className="lsd-dropzone-icon-wrap">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" opacity="0.25">
                      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <p>Arrastra ejercicios aquí</p>
                </div>
              ) : (
                <SortableContext
                  items={exercises.map(ex => ex.dragId)}
                  strategy={verticalListSortingStrategy}
                >
                  {exercises.map((exercise, idx) => (
                    <div
                      key={exercise.dragId}
                      className={newlyAddedIds.has(exercise.id) ? 'lsd-exercise-new' : (!initialLoadAnimatedRef.current ? 'lsd-exercise-enter' : '')}
                      style={{ '--enter-delay': `${idx * 50}ms` }}
                    >
                    <ExpandableExerciseCard
                      exercise={exercise}
                      sessionId={sessionId}
                      userId={user?.uid}
                      contentApi={contentApi}
                      isExpanded={expandedExerciseIds.has(exercise.id)}
                      onToggleExpand={toggleExerciseExpand}
                      sessionDefaultTemplate={sessionDefaultTemplate}
                      libraryTitles={libraryTitles}
                      libraryExerciseCompleteness={libraryExerciseCompleteness}
                      onExerciseUpdated={handleExerciseUpdated}
                      onEditPrimary={handleCardEditPrimary}
                      onAddAlternative={handleCardAddAlternative}
                      onDeleteAlternative={(libraryId, index) => handleCardDeleteAlternative(exercise, libraryId, index)}
                      pickerLibraries={pickerActiveExerciseId === exercise.id ? availableLibrariesForSelection : EMPTY_ARRAY}
                      pickerIsLoadingLibraries={pickerActiveExerciseId === exercise.id && isLoadingLibrariesForSelection}
                      onPickerSelectLibrary={handleSelectLibrary}
                      pickerExercises={pickerActiveExerciseId === exercise.id ? exercisesFromSelectedLibrary : EMPTY_ARRAY}
                      pickerIsLoadingExercises={pickerActiveExerciseId === exercise.id && isLoadingExercisesFromLibrary}
                      pickerSelectedLibraryId={pickerActiveExerciseId === exercise.id ? selectedLibraryForExercise : null}
                      onPickerSelect={(ex, exerciseName, mode) => handlePickerSelect(exercise, ex, exerciseName, mode)}
                      pickerIsSaving={pickerActiveExerciseId === exercise.id && isSavingLibraryExerciseChoice}
                      isLibraryMode={!effectiveIsClientEdit && !effectiveIsAnyPlanContentEdit && !isPlanInstanceEdit}
                      onOpenPresetSelector={handleOpenPresetSelector}
                      onOpenMeasuresEditor={handleOpenMeasuresEditor}
                      onAddObjective={handleAddObjective}
                      onRemoveObjective={handleRemoveObjective}
                      onAddMeasure={handleAddMeasure}
                      onRemoveMeasure={handleRemoveMeasure}
                      onSetsChanged={handleSetsChanged}
                      isEditMode={isEditMode}
                      onDelete={isEditMode ? handleDeleteExercise : null}
                      isIncomplete={isSessionExerciseIncomplete(exercise)}
                      isMissingLibraryDetails={isLibraryExerciseMissingDetails(exercise)}
                      showToast={showToast}
                      accentRgb={accentRgb}
                    />
                    </div>
                  ))}
                </SortableContext>
              )}
            </DropZone>
          </div>
          </div>
          </Revealable>

          {/* Volume Panel — always visible right column */}
          <div className="lsd-glow-wrap lsd-glow-wrap--volume">
            <GlowingEffect spread={40} proximity={120} borderWidth={1} />
          <div className="library-session-volume-panel">
            <div className="library-session-volume-panel-header">
              <h3 className="library-session-volume-panel-title">Volumen planificado</h3>
            </div>
            <div className="library-session-volume-panel-body">
              {volumeDataLoading && exercises.length > 0 ? (
                <div className="library-session-volume-panel-skeleton" aria-busy="true">
                  <div className="lsd-vol-skel-silhouette" />
                  <div className="lsd-vol-skel-rows">
                    {[100, 80, 60, 45, 30].map((w, i) => (
                      <div key={i} className="lsd-vol-skel-row">
                        <div className="lsd-vol-skel-label" />
                        <div className="lsd-vol-skel-bar-wrap">
                          <div className="lsd-vol-skel-bar" style={{ width: `${w}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : Object.keys(plannedMuscleVolumes).length === 0 ? (
                <div className="library-session-volume-panel-empty">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" opacity="0.2">
                    <rect x="3" y="12" width="4" height="9" rx="1" stroke="currentColor" strokeWidth="2"/>
                    <rect x="10" y="7" width="4" height="14" rx="1" stroke="currentColor" strokeWidth="2"/>
                    <rect x="17" y="3" width="4" height="18" rx="1" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  <p>Añade ejercicios con series para ver el volumen por músculo.</p>
                </div>
              ) : (() => {
                const volumeEntries = Object.entries(plannedMuscleVolumes).sort(([, a], [, b]) => b - a);
                const maxSets = volumeEntries[0]?.[1] || 1;
                return (
                  <>
                    {/* Muscle silhouette — normalized 0-1 for heatmap */}
                    <div className="library-session-volume-panel-silhouette">
                      <MuscleSilhouetteSVG muscleVolumes={normalizedMuscleVolumes} accentRgb={accentRgb} />
                    </div>

                    {/* All muscles — sets list */}
                    <div className="library-session-volume-panel-list">
                      {volumeEntries.map(([muscle, sets], i) => (
                        <div key={muscle} className="library-session-volume-panel-row" style={{ '--row-i': i }}>
                          <span className="library-session-volume-panel-muscle">{getMuscleDisplayName(muscle)}</span>
                          <div className="library-session-volume-panel-bar-wrap">
                            <div className="library-session-volume-panel-bar" style={{ width: `${Math.min(100, (sets / maxSets) * 100)}%` }} />
                          </div>
                          <span className="library-session-volume-panel-sets">{Number(sets).toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
          </div>
          </div>
        </div>

        <DragOverlay>
          {activeExercise ? (
            <div className="draggable-exercise dragging-overlay lsd-drag-overlay" style={accentStyle}>
              <div className="draggable-exercise-content">
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

      {/* Delete Exercise from Session Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setExerciseToDelete(null);
        }}
        title="¿Eliminar ejercicio de la sesión?"
        containerClassName="propagate-modal-container"
        contentClassName="propagate-modal-content-wrapper"
      >
        <div className="propagate-modal-content">
          <div className="propagate-modal-intro-wrap">
            <p className="propagate-modal-intro">
              {exerciseToDelete ? (
                <>
                  <strong>{getExerciseDisplayName(exerciseToDelete)}</strong> se quitará de esta sesión. Esta acción no se puede deshacer.
                </>
              ) : (
                'El ejercicio se quitará de esta sesión. Esta acción no se puede deshacer.'
              )}
            </p>
          </div>
          <div className="propagate-modal-footer">
            <button
              type="button"
              className="propagate-modal-btn propagate-modal-btn-dont"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setExerciseToDelete(null);
              }}
              disabled={isDeleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="propagate-modal-btn propagate-modal-btn-propagate"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Eliminando…' : 'Eliminar de la sesión'}
            </button>
          </div>
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
              logger.error('Error extracting exercise title:', error);
            }
          }
          return source.name || source.title || `Ejercicio ${source.id?.slice(0, 8) || ''}`;
        })()}
        extraWide={true}
      >
        <div className="exercise-modal-layout">
          {isCreatingExercise && !canSaveCreatingExercise() && (
            <div className="create-exercise-requirements-summary" style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '8px' }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <p className="one-on-one-field-note" style={{ margin: 0 }}>
                          Ejercicios alternativos que pueden reemplazar al ejercicio principal
                        </p>
                        <button
                          type="button"
                          className="exercise-alternatives-add-btn"
                          onClick={handleAddAlternative}
                        >
                          <span className="exercise-alternatives-add-btn-icon">+</span>
                          <span className="exercise-alternatives-add-btn-text">Agregar alternativa</span>
                        </button>
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
                                      <button
                                        type="button"
                                        className="exercise-horizontal-card-delete"
                                        onClick={() => handleDeleteAlternative(libraryId, index)}
                                        title="Quitar alternativa"
                                        aria-label="Quitar alternativa"
                                      >
                                        <span className="exercise-horizontal-card-delete-icon">−</span>
                                      </button>
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
            <div className={`exercise-modal-right-panel ${showPerSetCards ? 'exercise-modal-right-panel-per-set' : ''}`}>
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
                      <button type="button" className="sets-panel-number-btn" onClick={() => syncSetsCountToNumber((isCreatingExercise ? numberOfSetsForNewExercise : (optimisticSetsCount ?? exerciseSets.length)) - 1)} aria-label="Menos series">−</button>
                      <input type="number" min={1} max={20} className="sets-panel-number-input" value={isCreatingExercise ? numberOfSetsForNewExercise : (optimisticSetsCount ?? exerciseSets.length)} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) syncSetsCountToNumber(Math.max(1, Math.min(20, v))); }} />
                      <button type="button" className="sets-panel-number-btn" onClick={() => syncSetsCountToNumber((isCreatingExercise ? numberOfSetsForNewExercise : (optimisticSetsCount ?? exerciseSets.length)) + 1)} aria-label="Más series">+</button>
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
                        <input type="text" className="exercise-series-input sets-panel-glass-input" placeholder={obj === 'reps' ? '8-12' : '--'} value={newExerciseDefaultSetValues[obj] != null && newExerciseDefaultSetValues[obj] !== '' ? String(newExerciseDefaultSetValues[obj]) : ''} onChange={(e) => handleUpdateNewExerciseDefaultValue(obj, e.target.value)} />
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
                              const objectivesFields = (draftObjectives || []).filter(obj => obj !== 'previous').length ? (draftObjectives || []).filter(obj => obj !== 'previous') : ['reps', 'intensity'];
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
const objectivesFields = (draftObjectives || []).filter(obj => obj !== 'previous').length ? (draftObjectives || []).filter(obj => obj !== 'previous') : ['reps', 'intensity'];
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
                      title={isSavingNewExercise ? 'Creando...' : 'Crear Ejercicio (⌘↵)'}
                      onClick={handleSaveCreatingExercise}
                      disabled={!canSaveCreatingExercise() || isSavingNewExercise}
                      loading={isSavingNewExercise}
                      style={{ width: '100%' }}
                    />
                  </div>
                )}

                {!isCreatingExercise && (
                  <div style={{ marginTop: 'auto', paddingTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <Button
                      title="Guardar y cerrar"
                      onClick={handleCloseExerciseModal}
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

      {/* Library/Exercise Selection Modal - two-panel (libraries left, exercises right) */}
      <Modal
        isOpen={isLibraryExerciseModalOpen}
        onClose={handleCloseLibraryExerciseModal}
        title={(() => {
          if (libraryExerciseModalMode === 'primary') return 'Seleccionar Ejercicio Principal';
          if (libraryExerciseModalMode === 'add-alternative') return 'Agregar Alternativa';
          if (libraryExerciseModalMode === 'edit-alternative') return 'Editar Alternativa';
          return 'Seleccionar Ejercicio';
        })()}
        containerClassName="library-picker-modal-container"
        contentClassName="library-picker-modal-content-wrapper"
      >
        <div className="library-picker-modal-layout">
          {isSavingLibraryExerciseChoice && (
            <div className="library-picker-saving-overlay" aria-live="polite">
              <div className="library-picker-saving-content">
                <div className="library-picker-saving-spinner" />
                <p className="library-picker-saving-text">Guardando...</p>
              </div>
            </div>
          )}
          <div className="library-picker-modal-left">
            <div className="library-picker-modal-left-header">
              <h3 className="library-picker-modal-left-title">Bibliotecas</h3>
              {availableLibrariesForSelection.length > 0 && (
                <div className="library-picker-search-wrap">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="library-picker-search-icon" aria-hidden="true">
                    <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    type="text"
                    className="library-picker-search-input"
                    placeholder="Buscar biblioteca..."
                    value={libraryPickerLibrarySearch}
                    onChange={(e) => setLibraryPickerLibrarySearch(e.target.value)}
                  />
                </div>
              )}
            </div>
            {isLoadingLibrariesForSelection ? (
              <div className="library-picker-loading">
                <p>Cargando...</p>
              </div>
            ) : availableLibrariesForSelection.length === 0 ? (
              <div className="library-picker-empty">
                <p>No tienes bibliotecas. Crea una primero.</p>
              </div>
            ) : (() => {
              const libQuery = (libraryPickerLibrarySearch || '').trim().toLowerCase();
              const filteredLibraries = libQuery
                ? availableLibrariesForSelection.filter((lib) => (lib.title || lib.id || '').toLowerCase().includes(libQuery))
                : availableLibrariesForSelection;
              return filteredLibraries.length === 0 ? (
                <div className="library-picker-empty">
                  <p>Ninguna biblioteca coincide.</p>
                </div>
              ) : (
                <div className="library-picker-modal-libraries">
                  {filteredLibraries.map((library) => (
                    <button
                      key={library.id}
                      type="button"
                    className={`library-picker-library-item ${selectedLibraryForExercise === library.id ? 'library-picker-library-item-selected' : ''}`}
                    onClick={() => handleSelectLibrary(library.id)}
                    disabled={isSavingLibraryExerciseChoice}
                  >
                      <span className="library-picker-library-item-name">{library.title || library.id}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="library-picker-modal-right">
            <div className="library-picker-modal-right-header">
              <h3 className="library-picker-modal-right-title">Ejercicios</h3>
              <p className="library-picker-modal-right-hint">
                {selectedLibraryForExercise
                  ? 'Elige un ejercicio para usarlo como principal o como alternativa.'
                  : 'Selecciona una biblioteca a la izquierda.'}
              </p>
              {selectedLibraryForExercise && exercisesFromSelectedLibrary.length > 0 && (
                <div className="library-picker-search-wrap">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="library-picker-search-icon" aria-hidden="true">
                    <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    type="text"
                    className="library-picker-search-input"
                    placeholder="Buscar ejercicio..."
                    value={libraryPickerExerciseSearch}
                    onChange={(e) => setLibraryPickerExerciseSearch(e.target.value)}
                  />
                </div>
              )}
            </div>
            {!selectedLibraryForExercise ? (
              <div className="library-picker-empty">
                <p>Selecciona una biblioteca para ver sus ejercicios.</p>
              </div>
            ) : isLoadingExercisesFromLibrary ? (
              <div className="library-picker-loading">
                <p>Cargando ejercicios...</p>
              </div>
            ) : exercisesFromSelectedLibrary.length === 0 ? (
              <div className="library-picker-empty">
                <p>No hay ejercicios en esta biblioteca.</p>
              </div>
            ) : (() => {
              const exQuery = (libraryPickerExerciseSearch || '').trim().toLowerCase();
              const filteredExercises = exQuery
                ? exercisesFromSelectedLibrary.filter((ex) => (ex.name || '').toLowerCase().includes(exQuery))
                : exercisesFromSelectedLibrary;
              return filteredExercises.length === 0 ? (
                <div className="library-picker-empty">
                  <p>Ningún ejercicio coincide.</p>
                </div>
              ) : (
                <div className="library-picker-exercises-list">
                  {filteredExercises.map((exercise) => (
                    <button
                      key={exercise.name}
                      type="button"
                      className="library-picker-exercise-item"
                      onClick={() => handleSelectExercise(exercise.name)}
                      disabled={isSavingLibraryExerciseChoice}
                    >
                      <span className="library-picker-exercise-item-name">{exercise.name}</span>
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
              );
            })()}
          </div>
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
      <RevealProgressBar />
    </DashboardLayout>
    {ConfirmModal}
    </ProgressiveRevealProvider>
    </ErrorBoundary>
  );
};

export default LibrarySessionDetailScreen;
