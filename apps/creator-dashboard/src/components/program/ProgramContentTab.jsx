import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../config/queryClient';
import {
  useModules,
  useSessions,
  useCreateModule,
  useUpdateModuleOrder,
  useDeleteModule,
  useCreateSession,
  useUpdateSessionOrder,
} from '../../hooks/usePrograms';
import {
  useProgramRealtime,
  useModuleSessionsRealtime,
} from '../../hooks/useProgramRealtime';
import programService from '../../services/programService';
import libraryService from '../../services/libraryService';
import plansService from '../../services/plansService';
import logger from '../../utils/logger';
import Modal from '../Modal';
import Button from '../Button';
import Input from '../Input';
import './ProgramContentTab.css';
import debounce from 'lodash/debounce';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PlanningLibrarySidebar, { DRAG_TYPE_LIBRARY_SESSION } from '../PlanningLibrarySidebar';
import { Tree, TreeFolder, TreeFile } from '../ui/FileTree';
import ProgramWeeksGrid from '../ProgramWeeksGrid';
import WeekVolumeDrawer from '../WeekVolumeDrawer';
import { computePlannedMuscleVolumes, getPrimaryReferences } from '../../utils/plannedVolumeUtils';

const INCOMPLETE_ICON_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const DRAG_HANDLE_SVG = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="5" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="5" r="1.5" fill="currentColor"/>
    <circle cx="9" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="9" cy="19" r="1.5" fill="currentColor"/>
    <circle cx="15" cy="19" r="1.5" fill="currentColor"/>
  </svg>
);

const SortableModuleCard = ({ module, isModuleEditMode, onModuleClick, onDeleteModule, moduleIndex, isModuleIncomplete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: module.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
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
        <div className="module-incomplete-icon">{INCOMPLETE_ICON_SVG}</div>
      )}
      {isModuleEditMode && (
        <>
          <button
            className="module-delete-button"
            onClick={(e) => { e.stopPropagation(); onDeleteModule(module); }}
          >
            <span className="module-delete-icon">&minus;</span>
          </button>
          <div
            className="module-drag-handle"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            {DRAG_HANDLE_SVG}
          </div>
        </>
      )}
      <div className="module-card-header">
        <h3 className="module-card-title">{module.title || `Semana ${moduleNumber}`}</h3>
        {module.description && <p className="module-card-description">{module.description}</p>}
      </div>
      <div className="module-card-footer" />
    </div>
  );
};

const SortableSessionCard = ({ session, isSessionEditMode, onSessionClick, onDeleteSession, sessionIndex, isSessionIncomplete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: session.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const cardStyle = {
    ...style,
    ...(session.image_url ? {
      backgroundImage: `url(${session.image_url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    } : {}),
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
        <div className="session-incomplete-icon">{INCOMPLETE_ICON_SVG}</div>
      )}
      {isSessionEditMode && (
        <>
          <button
            className="session-delete-button"
            onClick={(e) => { e.stopPropagation(); onDeleteSession(session); }}
          >
            <span className="session-delete-icon">&minus;</span>
          </button>
          <div
            className="session-drag-handle"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            {DRAG_HANDLE_SVG}
          </div>
        </>
      )}
      <div className="session-card-header">
        <h3 className="session-card-title">
          {session.title || session.name || `Sesion ${session.id.slice(0, 8)}`}
          {!session.librarySessionRef && (
            <span className="session-desvinculado-badge">Desvinculado</span>
          )}
        </h3>
      </div>
    </div>
  );
};

const ProgramContentTab = ({
  program,
  programId,
  user,
  showToast,
  confirm,
  selectedModule,
  selectedSession,
  onModuleSelect,
  onSessionSelect,
  onNavigateToSession,
  contentPlanId,
  plans,
  onContentPlanChange,
  isSavingContentPlan,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // --- Internal state ---
  const [modules, setModules] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isModuleEditMode, setIsModuleEditMode] = useState(false);
  const [isSessionEditMode, setIsSessionEditMode] = useState(false);
  const [originalModulesOrder, setOriginalModulesOrder] = useState([]);
  const [originalSessionsOrder, setOriginalSessionsOrder] = useState([]);
  const [isUpdatingModuleOrder, setIsUpdatingModuleOrder] = useState(false);
  const [isUpdatingSessionOrder, setIsUpdatingSessionOrder] = useState(false);

  // Module CRUD state
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [isCopyModuleModalOpen, setIsCopyModuleModalOpen] = useState(false);
  const [copyModuleModalPage, setCopyModuleModalPage] = useState('biblioteca');
  const [libraryModules, setLibraryModules] = useState([]);
  const [isLoadingLibraryModules, setIsLoadingLibraryModules] = useState(false);
  const [moduleName, setModuleName] = useState('');
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [isDeleteModuleModalOpen, setIsDeleteModuleModalOpen] = useState(false);
  const [moduleToDelete, setModuleToDelete] = useState(null);
  const [deleteModuleConfirmation, setDeleteModuleConfirmation] = useState('');
  const [isDeletingModule, setIsDeletingModule] = useState(false);

  // Session CRUD state
  const [isCopySessionModalOpen, setIsCopySessionModalOpen] = useState(false);
  const [copySessionModalPage, setCopySessionModalPage] = useState('biblioteca');
  const [librarySessions, setLibrarySessions] = useState([]);
  const [isLoadingLibrarySessions, setIsLoadingLibrarySessions] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isDeleteSessionModalOpen, setIsDeleteSessionModalOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [deleteSessionConfirmation, setDeleteSessionConfirmation] = useState('');
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  // Grid state
  const [isAddingWeek, setIsAddingWeek] = useState(false);
  const [structureSearchQuery, setStructureSearchQuery] = useState('');
  const [activeDragSession, setActiveDragSession] = useState(null);

  // Week volume drawer state
  const [weekVolumeDrawerOpen, setWeekVolumeDrawerOpen] = useState(false);
  const [selectedWeekModuleIdForVolume, setSelectedWeekModuleIdForVolume] = useState('');
  const [weekVolumeLoading, setWeekVolumeLoading] = useState(false);
  const [weekVolumeMuscleVolumes, setWeekVolumeMuscleVolumes] = useState({});

  // Incomplete maps
  const [moduleIncompleteMap, setModuleIncompleteMap] = useState({});
  const [sessionIncompleteMap, setSessionIncompleteMap] = useState({});

  const isActivelyEditing = isModuleEditMode || isSessionEditMode;
  const isLowTicket = program?.deliveryType !== 'one_on_one';
  const showContenidoGrid = isLowTicket && !contentPlanId && !selectedModule && !selectedSession;

  // --- Mutation hooks ---
  const createModuleMutation = useCreateModule();
  const updateModuleOrderMutation = useUpdateModuleOrder();
  const deleteModuleMutation = useDeleteModule();
  const createSessionMutation = useCreateSession();
  const updateSessionOrderMutation = useUpdateSessionOrder();

  // --- Data fetching ---
  const { data: modulesData = [], isLoading: isLoadingModules } = useModules(programId, {
    isActive: isActivelyEditing,
    useCounts: true,
  });

  const { data: gridModulesData = [], isLoading: isLoadingGridModules } = useModules(programId, {
    useCounts: false,
    enabled: !!programId && showContenidoGrid,
  });

  const { data: sessionsData = [], isLoading: isLoadingSessions } = useSessions(
    programId,
    selectedModule?.id,
    { isActive: isActivelyEditing, enabled: !!selectedModule }
  );

  // Realtime listeners when editing
  useProgramRealtime(programId, isActivelyEditing);
  useModuleSessionsRealtime(programId, selectedModule?.id, isActivelyEditing && !!selectedModule);

  // --- DnD sensors ---
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const librarySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // --- Exercise completeness inline check ---
  const checkExerciseCompletenessInline = useCallback((exercise, sets) => {
    if (!exercise) return true;

    let hasPrimary = false;
    if (exercise.primary && typeof exercise.primary === 'object' && exercise.primary !== null) {
      try {
        const primaryValues = Object.values(exercise.primary);
        if (primaryValues.length > 0 && primaryValues[0]) hasPrimary = true;
      } catch (error) { /* ignore */ }
    }
    if (!hasPrimary) return true;

    const alternatives = exercise.alternatives && typeof exercise.alternatives === 'object' && exercise.alternatives !== null && !Array.isArray(exercise.alternatives)
      ? exercise.alternatives : {};
    const alternativesCount = Object.values(alternatives).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    if (alternativesCount === 0) return true;

    const hasMeasures = Array.isArray(exercise.measures) && exercise.measures.length > 0;
    if (!hasMeasures) return true;

    const objectives = Array.isArray(exercise.objectives) ? exercise.objectives : [];
    if (objectives.length === 0) return true;

    if (sets.length === 0) return true;

    const validObjectives = objectives.filter(obj => obj !== 'previous');
    if (validObjectives.length > 0) {
      const allSetsHaveData = sets.every(set =>
        validObjectives.some(obj => {
          const value = set[obj];
          return value !== null && value !== undefined && value !== '';
        })
      );
      if (!allSetsHaveData) return true;
    }

    return false;
  }, []);

  // --- Sorted modules ---
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

      const moduleStatuses = {};
      const modulesWithFlags = sortedModules.filter(m => m.isComplete !== undefined && m.isComplete !== null);
      modulesWithFlags.forEach(m => { moduleStatuses[m.id] = !m.isComplete; });

      if (Object.keys(moduleStatuses).length > 0) {
        setModuleIncompleteMap(prev => ({ ...prev, ...moduleStatuses }));
      }

      const modulesNeedingCheck = sortedModules.filter(m => m.isComplete === undefined || m.isComplete === null);
      if (modulesNeedingCheck.length > 0) {
        const checkModulesCompleteness = async () => {
          const moduleStatusesToCheck = {};
          for (const mod of modulesNeedingCheck) {
            try {
              const sessData = await programService.getSessionsByModule(programId, mod.id);
              const sorted = sessData.sort((a, b) => {
                const oA = a.order ?? Infinity;
                const oB = b.order ?? Infinity;
                return oA - oB;
              });
              let moduleIncomplete = false;
              for (const session of sorted) {
                const exercisesData = await programService.getExercisesBySession(programId, mod.id, session.id);
                if (exercisesData.length === 0) { moduleIncomplete = true; break; }
                const setsMap = {};
                await Promise.all(exercisesData.map(async (ex) => {
                  try {
                    setsMap[ex.id] = await programService.getSetsByExercise(programId, mod.id, session.id, ex.id);
                  } catch (err) { setsMap[ex.id] = []; }
                }));
                const hasIncomplete = exercisesData.some(ex => checkExerciseCompletenessInline(ex, setsMap[ex.id] || []));
                if (hasIncomplete) { moduleIncomplete = true; break; }
              }
              moduleStatusesToCheck[mod.id] = moduleIncomplete;
            } catch (err) {
              logger.error(`Error checking module ${mod.id} completeness:`, err);
              moduleStatusesToCheck[mod.id] = false;
            }
          }
          setModuleIncompleteMap(prev => ({ ...prev, ...moduleStatuses, ...moduleStatusesToCheck }));
        };
        checkModulesCompleteness();
      }
    }
  }, [sortedModules, programId, checkExerciseCompletenessInline]);

  // --- Sorted sessions ---
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

      const sessionStatuses = {};
      const sessionsWithFlags = sortedSessions.filter(s => s.isComplete !== undefined && s.isComplete !== null);
      sessionsWithFlags.forEach(s => { sessionStatuses[s.id] = !s.isComplete; });

      if (Object.keys(sessionStatuses).length > 0) {
        setSessionIncompleteMap(prev => ({ ...prev, ...sessionStatuses }));
      }

      const sessionsNeedingCheck = sortedSessions.filter(s => s.isComplete === undefined || s.isComplete === null);
      if (sessionsNeedingCheck.length > 0 && selectedModule) {
        const checkSessionsCompleteness = async () => {
          const sessionStatusesToCheck = {};
          await Promise.all(sessionsNeedingCheck.map(async (session) => {
            try {
              const exercisesData = await programService.getExercisesBySession(programId, selectedModule.id, session.id);
              if (exercisesData.length === 0) { sessionStatusesToCheck[session.id] = true; return; }
              const setsMap = {};
              await Promise.all(exercisesData.map(async (ex) => {
                try {
                  setsMap[ex.id] = await programService.getSetsByExercise(programId, selectedModule.id, session.id, ex.id);
                } catch (err) { setsMap[ex.id] = []; }
              }));
              const hasIncomplete = exercisesData.some(ex => checkExerciseCompletenessInline(ex, setsMap[ex.id] || []));
              sessionStatusesToCheck[session.id] = hasIncomplete;
            } catch (err) {
              logger.error(`Error checking session ${session.id} completeness:`, err);
              sessionStatusesToCheck[session.id] = false;
            }
          }));
          setSessionIncompleteMap(prev => ({ ...prev, ...sessionStatuses, ...sessionStatusesToCheck }));
          const allSessionStatuses = { ...sessionStatuses, ...sessionStatusesToCheck };
          const hasIncompleteSession = Object.values(allSessionStatuses).some(v => v === true);
          setModuleIncompleteMap(prev => ({ ...prev, [selectedModule.id]: hasIncompleteSession }));
        };
        checkSessionsCompleteness();
      } else if (Object.keys(sessionStatuses).length > 0 && selectedModule) {
        const hasIncompleteSession = Object.values(sessionStatuses).some(v => v === true);
        setModuleIncompleteMap(prev => ({ ...prev, [selectedModule.id]: hasIncompleteSession }));
      }
    }
  }, [sortedSessions, selectedModule, programId, checkExerciseCompletenessInline]);

  // --- Incomplete checkers (sync, use state maps) ---
  const isSessionIncomplete = (session) => {
    if (!session || !session.id) return false;
    return sessionIncompleteMap[session.id] === true;
  };

  const isModuleIncomplete = (module) => {
    if (!module || !module.id) return false;
    return moduleIncompleteMap[module.id] === true;
  };

  // --- Debounced order saves ---
  const debouncedSaveModuleOrder = useMemo(
    () => debounce(async (moduleOrders) => {
      try {
        await updateModuleOrderMutation.mutateAsync({ programId, moduleOrders });
      } catch (error) {
        logger.error('Error saving module order:', error);
        if (originalModulesOrder.length > 0) setModules([...originalModulesOrder]);
        showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
      }
    }, 1000),
    [programId, updateModuleOrderMutation, originalModulesOrder]
  );

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
        logger.error('Error saving session order:', error);
        if (originalSessionsOrder.length > 0) setSessions([...originalSessionsOrder]);
        showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
      }
    }, 1000),
    [programId, selectedModule, updateSessionOrderMutation, originalSessionsOrder]
  );

  // --- Week volume ---
  const weekVolumeWeekOptions = useMemo(
    () => (gridModulesData || []).map((mod, i) => ({ value: mod.id, label: `Semana ${i + 1}` })),
    [gridModulesData]
  );

  useEffect(() => {
    if (!weekVolumeDrawerOpen || !selectedWeekModuleIdForVolume || !user?.uid || !programId) {
      if (!weekVolumeDrawerOpen) setWeekVolumeMuscleVolumes({});
      return;
    }
    const mod = (gridModulesData || []).find((m) => m.id === selectedWeekModuleIdForVolume);
    const modSessions = mod?.sessions ?? [];
    if (modSessions.length === 0) { setWeekVolumeMuscleVolumes({}); return; }

    let cancelled = false;
    setWeekVolumeLoading(true);
    (async () => {
      try {
        const allExercises = [];
        const libraryIds = new Set();
        for (const session of modSessions) {
          const ref = session.librarySessionRef;
          if (ref) {
            const libSession = await libraryService.getLibrarySessionById(user.uid, ref);
            if (cancelled) return;
            if (libSession?.exercises?.length) {
              libSession.exercises.forEach((ex) => {
                allExercises.push(ex);
                getPrimaryReferences(ex).forEach(({ libraryId }) => { if (libraryId) libraryIds.add(libraryId); });
              });
            }
          } else {
            const programExercises = await programService.getExercisesBySession(programId, mod.id, session.id);
            if (cancelled) return;
            for (const ex of programExercises || []) {
              const setsData = await programService.getSetsByExercise(programId, mod.id, session.id, ex.id);
              if (cancelled) return;
              allExercises.push({ ...ex, sets: setsData || [] });
              getPrimaryReferences(ex).forEach(({ libraryId }) => { if (libraryId) libraryIds.add(libraryId); });
            }
          }
        }
        if (cancelled) return;
        const libraryDataCache = {};
        for (const libraryId of libraryIds) {
          const lib = await libraryService.getLibraryById(libraryId);
          if (cancelled) return;
          if (lib) libraryDataCache[libraryId] = lib;
        }
        if (cancelled) return;
        const volumes = computePlannedMuscleVolumes(allExercises, libraryDataCache);
        setWeekVolumeMuscleVolumes(volumes);
      } catch (err) {
        logger.warn('[ProgramContentTab] Week volume load failed:', err);
        if (!cancelled) setWeekVolumeMuscleVolumes({});
      } finally {
        if (!cancelled) setWeekVolumeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [weekVolumeDrawerOpen, selectedWeekModuleIdForVolume, user?.uid, programId, gridModulesData]);

  const openWeekVolumeDrawer = useCallback(() => {
    if ((gridModulesData || []).length > 0) {
      const currentExists = (gridModulesData || []).some((m) => m.id === selectedWeekModuleIdForVolume);
      if (!currentExists) setSelectedWeekModuleIdForVolume(gridModulesData[0].id);
    }
    setWeekVolumeDrawerOpen(true);
  }, [gridModulesData, selectedWeekModuleIdForVolume]);

  // --- Module handlers ---
  const handleModuleClick = useCallback((module) => {
    if (isModuleEditMode) return;
    onModuleSelect(module);
  }, [isModuleEditMode, onModuleSelect]);

  const handleAddModule = () => {
    setIsCopyModuleModalOpen(true);
    setCopyModuleModalPage('biblioteca');
    setModuleName('');
    if (libraryModules.length === 0) loadLibraryModules();
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

  const loadLibraryModules = async () => {
    if (!user) return;
    try {
      setIsLoadingLibraryModules(true);
      const mods = await libraryService.getModuleLibrary(user.uid);
      setLibraryModules(mods);
    } catch (error) {
      logger.error('Error loading library modules:', error);
      showToast('No pudimos cargar los modulos de la biblioteca', 'error');
    } finally {
      setIsLoadingLibraryModules(false);
    }
  };

  const handleCreateModule = async () => {
    if (!moduleName || !moduleName.trim() || !programId) return;
    try {
      await createModuleMutation.mutateAsync({ programId, moduleName: moduleName.trim() });
      if (isCopyModuleModalOpen) {
        handleCloseCopyModuleModal();
      } else {
        handleCloseModuleModal();
      }
    } catch (err) {
      logger.error('Error creating module:', err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    }
  };

  const handleSelectLibraryModule = async (libraryModuleId) => {
    if (!programId || !libraryModuleId) return;
    try {
      setIsCreatingModule(true);
      await programService.createModuleFromLibrary(programId, libraryModuleId);
      const freshModules = await programService.getModulesByProgram(programId);
      const sorted = freshModules.sort((a, b) => {
        const oA = a.order ?? Infinity;
        const oB = b.order ?? Infinity;
        return oA - oB;
      });
      setModules(sorted);
      handleCloseCopyModuleModal();
    } catch (err) {
      logger.error('Error creating module from library:', err);
      showToast(`No pudimos agregar el modulo. ${err.message || 'Intenta de nuevo.'}`, 'error');
    } finally {
      setIsCreatingModule(false);
    }
  };

  const handleEditModules = async () => {
    if (!isModuleEditMode) {
      setOriginalModulesOrder([...modules]);
      setIsModuleEditMode(true);
    } else {
      await handleSaveModuleOrder();
    }
  };

  const handleSaveModuleOrder = async () => {
    if (!programId) return;
    try {
      setIsUpdatingModuleOrder(true);
      const moduleOrders = modules.map((m, index) => ({ moduleId: m.id, order: index }));
      await debouncedSaveModuleOrder(moduleOrders);
      debouncedSaveModuleOrder.flush();
      setIsModuleEditMode(false);
      setOriginalModulesOrder([]);
    } catch (err) {
      logger.error('Error updating module order:', err);
      if (originalModulesOrder.length > 0) setModules([...originalModulesOrder]);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsUpdatingModuleOrder(false);
    }
  };

  const handleDragEndModules = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = modules.findIndex((m) => m.id === active.id);
    const newIndex = modules.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setModules(arrayMove(modules, oldIndex, newIndex));
  };

  const handleDeleteModule = async (module) => {
    if (module.libraryModuleRef && user) {
      try {
        const usageCheck = await libraryService.checkLibraryModuleUsage(user.uid, module.libraryModuleRef);
        if (usageCheck.inUse) {
          showToast(`No se puede eliminar este modulo. Esta siendo usado en ${usageCheck.count} programa(s).`, 'error');
          return;
        }
      } catch (error) {
        logger.error('Error checking library module usage:', error);
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
    if (!moduleToDelete || !deleteModuleConfirmation.trim() || !programId) return;
    const moduleTitle = moduleToDelete.title || moduleToDelete.name || `Modulo ${moduleToDelete.id?.slice(0, 8) || ''}`;
    if (deleteModuleConfirmation.trim() !== moduleTitle) return;

    try {
      setIsDeletingModule(true);
      await programService.deleteModule(programId, moduleToDelete.id);
      const freshModules = await programService.getModulesByProgram(programId);
      const sorted = freshModules.sort((a, b) => {
        const oA = a.order ?? Infinity;
        const oB = b.order ?? Infinity;
        return oA - oB;
      });
      setModules(sorted);
      if (selectedModule && selectedModule.id === moduleToDelete.id) {
        onModuleSelect(null);
        setSessions([]);
      }
      handleCloseDeleteModuleModal();
      if (freshModules.length === 0) setIsModuleEditMode(false);
    } catch (err) {
      logger.error('Error deleting module:', err);
      showToast(`No pudimos eliminar el modulo. ${err.message || 'Intenta de nuevo.'}`, 'error');
    } finally {
      setIsDeletingModule(false);
    }
  };

  // --- Session handlers ---
  const handleSessionClick = useCallback((session) => {
    if (isSessionEditMode) return;
    if (selectedModule) {
      onNavigateToSession(session, selectedModule);
      return;
    }
    onSessionSelect(session);
  }, [isSessionEditMode, selectedModule, onNavigateToSession, onSessionSelect]);

  const handleAddSession = () => {
    setIsCopySessionModalOpen(true);
    setCopySessionModalPage('biblioteca');
    setSessionName('');
    if (librarySessions.length === 0) loadLibrarySessions();
  };

  const loadLibrarySessions = async () => {
    if (!user) return;
    try {
      setIsLoadingLibrarySessions(true);
      const sess = await libraryService.getSessionLibrary(user.uid);
      setLibrarySessions(sess);
    } catch (error) {
      logger.error('Error loading library sessions:', error);
      showToast('No pudimos cargar las sesiones de la biblioteca', 'error');
    } finally {
      setIsLoadingLibrarySessions(false);
    }
  };

  const handleCloseCopySessionModal = () => {
    setIsCopySessionModalOpen(false);
    setCopySessionModalPage('biblioteca');
    setLibrarySessions([]);
    setSessionName('');
  };

  const handleSelectLibrarySession = async (librarySessionId) => {
    if (!programId || !selectedModule || !librarySessionId || !user) return;
    try {
      setIsCreatingSession(true);
      if (selectedModule.libraryModuleRef) {
        await libraryService.addSessionToLibraryModule(user.uid, selectedModule.libraryModuleRef, librarySessionId);
      }
      await programService.createSessionFromLibrary(programId, selectedModule.id, librarySessionId);
      const freshSessions = await programService.getSessionsByModule(programId, selectedModule.id);
      const sorted = freshSessions.sort((a, b) => {
        const oA = a.order ?? Infinity;
        const oB = b.order ?? Infinity;
        return oA - oB;
      });
      setSessions(sorted);
      handleCloseCopySessionModal();
    } catch (err) {
      logger.error('Error creating session from library:', err);
      showToast(`Error al agregar la sesion: ${err.message || 'Intenta de nuevo.'}`, 'error');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim() || !programId || !selectedModule) return;
    try {
      setIsCreatingSession(true);
      await programService.createSession(programId, selectedModule.id, sessionName.trim(), null, null);
      const freshSessions = await programService.getSessionsByModule(programId, selectedModule.id);
      const sorted = freshSessions.sort((a, b) => {
        const oA = a.order ?? Infinity;
        const oB = b.order ?? Infinity;
        return oA - oB;
      });
      setSessions(sorted);
      if (isCopySessionModalOpen) {
        handleCloseCopySessionModal();
      }
    } catch (err) {
      logger.error('Error creating session:', err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleEditSessions = async () => {
    if (!isSessionEditMode) {
      setOriginalSessionsOrder([...sessions]);
      setIsSessionEditMode(true);
    } else {
      await handleSaveSessionOrder();
    }
  };

  const handleSaveSessionOrder = async () => {
    if (!programId || !selectedModule) return;
    try {
      setIsUpdatingSessionOrder(true);
      const sessionOrders = sessions.map((s, index) => ({ sessionId: s.id, order: index }));
      await debouncedSaveSessionOrder(sessionOrders);
      debouncedSaveSessionOrder.flush();
      setIsSessionEditMode(false);
      setOriginalSessionsOrder([]);
    } catch (err) {
      logger.error('Error updating session order:', err);
      if (originalSessionsOrder.length > 0) setSessions([...originalSessionsOrder]);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsUpdatingSessionOrder(false);
    }
  };

  const handleDragEndSessions = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedModule) return;
    const oldIndex = sessions.findIndex((s) => s.id === active.id);
    const newIndex = sessions.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setSessions(arrayMove(sessions, oldIndex, newIndex));
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
    if (!sessionToDelete || !deleteSessionConfirmation.trim() || !programId || !selectedModule) return;
    const sessionTitle = sessionToDelete.title || sessionToDelete.name || `Sesion ${sessionToDelete.id?.slice(0, 8) || ''}`;
    if (deleteSessionConfirmation.trim() !== sessionTitle) return;

    try {
      setIsDeletingSession(true);
      await programService.deleteSession(programId, selectedModule.id, sessionToDelete.id);
      const freshSessions = await programService.getSessionsByModule(programId, selectedModule.id);
      const sorted = freshSessions.sort((a, b) => {
        const oA = a.order ?? Infinity;
        const oB = b.order ?? Infinity;
        return oA - oB;
      });
      setSessions(sorted);
      if (selectedSession && selectedSession.id === sessionToDelete.id) {
        onSessionSelect(null);
      }
      handleCloseDeleteSessionModal();
      if (freshSessions.length === 0) setIsSessionEditMode(false);
    } catch (err) {
      logger.error('Error deleting session:', err);
      showToast(`No pudimos eliminar la sesion. ${err.message || 'Intenta de nuevo.'}`, 'error');
    } finally {
      setIsDeletingSession(false);
    }
  };

  // --- Grid handlers ---
  const handleAddWeekForGrid = async () => {
    if (!programId) return;
    setIsAddingWeek(true);
    try {
      const nextNum = (gridModulesData?.length ?? 0) + 1;
      await programService.createModule(programId, `Semana ${nextNum}`, null);
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.withCounts(programId) });
    } catch (err) {
      showToast(err?.message || 'No pudimos agregar la semana. Intenta de nuevo.', 'error');
    } finally {
      setIsAddingWeek(false);
    }
  };

  const handleSessionClickFromGrid = useCallback((mod, sess) => {
    onNavigateToSession(sess, mod);
  }, [onNavigateToSession]);

  const handleLibraryDragStart = useCallback((event) => {
    const { active } = event;
    if (active?.data?.current?.type === DRAG_TYPE_LIBRARY_SESSION) {
      setActiveDragSession(active.data.current);
    }
  }, []);

  const handleLibraryDragEnd = useCallback(async (event) => {
    setActiveDragSession(null);
    const { active, over } = event;
    if (!active || !over) return;

    const dragData = active.data.current;
    const dropData = over.data.current;
    if (dragData?.type !== DRAG_TYPE_LIBRARY_SESSION || !dropData?.moduleId) return;

    const { librarySessionRef, title } = dragData;
    const { moduleId, slotIndex } = dropData;

    try {
      const libSession = await libraryService.getLibrarySessionById(user?.uid, librarySessionRef);
      const sessionTitle = libSession?.title || title || 'Sesion';
      const imageUrl = libSession?.image_url ?? null;

      const created = await programService.createSession(
        programId, moduleId, sessionTitle, null, imageUrl, librarySessionRef
      );

      if (created?.id && slotIndex >= 0 && slotIndex <= 6) {
        await programService.updateSessionOrder(programId, moduleId, [
          { sessionId: created.id, order: slotIndex },
        ]);
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.modules.withCounts(programId) });
    } catch (err) {
      showToast('No pudimos mover esa sesion. Intenta de nuevo.', 'error');
    }
  }, [programId, user?.uid, queryClient, showToast]);

  // --- Program structure tree data ---
  const [showOutline, setShowOutline] = useState(false);

  const treeElements = useMemo(() => {
    if (!modules.length) return [];
    return modules.map((mod, i) => {
      const moduleNumber = (mod.order != null ? mod.order : i) + 1;
      const moduleSessions = mod.sessions || mod._sessions || [];
      return {
        id: mod.id,
        name: mod.title || `Semana ${moduleNumber}`,
        type: 'folder',
        children: moduleSessions.map((s, si) => ({
          id: s.id,
          name: s.title || s.name || `Sesion ${si + 1}`,
          type: 'file',
        })),
      };
    });
  }, [modules]);

  const handleTreeSelect = useCallback((id) => {
    const mod = modules.find(m => m.id === id);
    if (mod) {
      onModuleSelect(mod);
      return;
    }
    for (const m of modules) {
      const moduleSessions = m.sessions || m._sessions || [];
      const sess = moduleSessions.find(s => s.id === id);
      if (sess) {
        onModuleSelect(m);
        onSessionSelect?.(sess);
        onNavigateToSession?.(m.id, sess.id);
        return;
      }
    }
  }, [modules, onModuleSelect, onSessionSelect, onNavigateToSession]);

  // --- RENDER ---

  // View 1: Selected module — show sessions list
  if (selectedModule) {
    return (
      <>
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
                  <button className="session-action-pill" onClick={handleEditSessions}>
                    <span className="session-action-text">{isSessionEditMode ? 'Guardar' : 'Editar'}</span>
                  </button>
                </div>
              )}
            </div>

            {isLoadingSessions ? (
              <div className="sessions-loading"><p>Cargando sesiones...</p></div>
            ) : sessions.length === 0 ? (
              <div className="sessions-empty">
                <p>No hay sesiones en este modulo. Agrega una para empezar a construir.</p>
              </div>
            ) : (
              <>
                {isSessionEditMode ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndSessions}>
                    <SortableContext items={sessions.map((s) => s.id)} strategy={verticalListSortingStrategy}>
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
                            <div className="session-incomplete-icon">{INCOMPLETE_ICON_SVG}</div>
                          )}
                          <div className="session-card-header">
                            <h3 className="session-card-title">
                              {session.title || session.name || `Sesion ${session.id.slice(0, 8)}`}
                              {!session.librarySessionRef && (
                                <span className="session-desvinculado-badge">Desvinculado</span>
                              )}
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

        {renderCopySessionModal()}
        {renderDeleteSessionModal()}
      </>
    );
  }

  // View 2: Content plan linked
  if (isLowTicket && contentPlanId) {
    const linkedPlan = plans.find((p) => p.id === contentPlanId);
    return (
      <div className="program-tab-content">
        <h1 className="program-page-title">Contenido</h1>
        <div className="program-section pd-content-plan-box">
          <p className="pd-content-plan-text">El contenido de este programa viene del plan de la biblioteca. Edita semanas y sesiones en el plan.</p>
          <button
            type="button"
            className="program-page__tab pd-content-plan-link-btn"
            onClick={() => navigate(`/plans/${contentPlanId}`, { state: { returnTo: location.pathname } })}
          >
            Ir al plan {linkedPlan?.title ? `"${linkedPlan.title}"` : ''}
          </button>
        </div>
      </div>
    );
  }

  // View 3: Weeks grid with library sidebar (low-ticket, no plan, no selection)
  if (showContenidoGrid) {
    return (
      <div className="program-tab-content">
        <h1 className="program-page-title">Contenido</h1>
        <p className="pd-drag-hint" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Arrastra sesiones desde tu biblioteca al dia que quieras.
        </p>
        <DndContext
          sensors={librarySensors}
          collisionDetection={pointerWithin}
          onDragStart={handleLibraryDragStart}
          onDragEnd={handleLibraryDragEnd}
        >
          <div className="plan-structure-layout client-program-planning-layout">
            <div className="plan-structure-sidebars client-program-planning-left">
              <PlanningLibrarySidebar
                creatorId={user?.uid}
                searchQuery={structureSearchQuery}
                onSearchChange={setStructureSearchQuery}
              />
            </div>
            <div className="plan-structure-main client-program-planning-main">
              {isLoadingGridModules ? (
                <div className="modules-loading"><p>Cargando semanas...</p></div>
              ) : (
                <ProgramWeeksGrid
                  programId={programId}
                  modules={gridModulesData}
                  onAddWeek={handleAddWeekForGrid}
                  onDeleteWeek={() => {
                    queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
                    queryClient.invalidateQueries({ queryKey: queryKeys.modules.withCounts(programId) });
                  }}
                  onSessionClick={handleSessionClickFromGrid}
                  onOpenWeekVolume={openWeekVolumeDrawer}
                  libraryService={libraryService}
                  plansService={plansService}
                  creatorId={user?.uid}
                  isAddingWeek={isAddingWeek}
                  queryClient={queryClient}
                  queryKeys={queryKeys}
                />
              )}
            </div>
          </div>
          <DragOverlay dropAnimation={{ duration: 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
            {activeDragSession ? (
              <div className="library-drag-overlay-card">
                {activeDragSession.image_url ? (
                  <img src={activeDragSession.image_url} alt="" className="library-drag-overlay-avatar library-drag-overlay-avatar--img" />
                ) : (
                  <div className="library-drag-overlay-avatar">
                    {activeDragSession.title?.charAt(0) || 'S'}
                  </div>
                )}
                <span className="library-drag-overlay-title">
                  {activeDragSession.title || 'Sesion'}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <WeekVolumeDrawer
          isOpen={weekVolumeDrawerOpen}
          onClose={() => setWeekVolumeDrawerOpen(false)}
          title="Volumen de la semana"
          subtitle="Series efectivas por musculo (intensidad mayor o igual a 7) para esta semana."
          weekOptions={weekVolumeWeekOptions}
          selectedWeekValue={selectedWeekModuleIdForVolume}
          onWeekChange={setSelectedWeekModuleIdForVolume}
          loading={weekVolumeLoading}
          plannedMuscleVolumes={weekVolumeMuscleVolumes}
          emptyMessage="Agrega sesiones con ejercicios (e intensidad mayor o igual a 7) a esta semana para ver el volumen por musculo."
          variant="card"
          weekSelectorStyle="list"
        />
        {renderCopyModuleModal()}
        {renderDeleteModuleModal()}
      </div>
    );
  }

  // View 4: Default — modules list (drill-down)
  return (
    <>
      <div className="program-tab-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 className="program-page-title" style={{ margin: 0 }}>Contenido</h1>
          {treeElements.length > 0 && !isModuleEditMode && (
            <button
              className="module-action-pill"
              onClick={() => setShowOutline(prev => !prev)}
              style={{ fontSize: '0.76rem' }}
            >
              {showOutline ? 'Ocultar estructura' : 'Ver estructura'}
            </button>
          )}
        </div>

        {showOutline && treeElements.length > 0 && !isModuleEditMode && (
          <div style={{
            marginBottom: 16,
            background: 'var(--surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 0',
            maxHeight: 240,
            overflow: 'auto',
          }}>
            <Tree
              elements={treeElements}
              initialSelectedId={selectedModule?.id}
              onSelect={handleTreeSelect}
            />
          </div>
        )}

        {modules.length === 0 && !isLoadingModules && (
          <p className="pd-empty-hint" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Este programa no tiene contenido todavia. Agrega una semana para empezar a construir.
          </p>
        )}
        <div className="program-section">
          <div className="program-section__header program-section__header--row">
            <h2 className="program-section__title">Modulos</h2>
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
            {isLoadingModules ? (
              <div className="modules-loading"><p>Cargando modulos...</p></div>
            ) : modules.length === 0 ? (
              <div className="modules-empty">
                <p>No tienes modulos. Crea uno para arrancar.</p>
              </div>
            ) : (
              <>
                {isModuleEditMode ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndModules}>
                    <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
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
                        <div key={module.id} className="module-card" onClick={() => handleModuleClick(module)}>
                          <div className="module-card-number">{moduleNumber}</div>
                          {isModuleIncomplete(module) && (
                            <div className="module-incomplete-icon">{INCOMPLETE_ICON_SVG}</div>
                          )}
                          <div className="module-card-header">
                            <h3 className="module-card-title">{module.title || `Semana ${moduleNumber}`}</h3>
                            {module.description && <p className="module-card-description">{module.description}</p>}
                          </div>
                          <div className="module-card-footer" />
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

      {renderCopyModuleModal()}
      {renderDeleteModuleModal()}
    </>
  );

  // --- Render helpers for modals ---

  function renderCopyModuleModal() {
    return (
      <>
        <Modal isOpen={isModuleModalOpen} onClose={handleCloseModuleModal} title="Nuevo modulo">
          <div className="modal-library-content">
            <Input
              placeholder="Nombre del modulo"
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

        <Modal isOpen={isCopyModuleModalOpen} onClose={handleCloseCopyModuleModal} title="Nuevo Modulo">
          <div className="anuncios-modal-content">
            <div className="anuncios-modal-body">
              <div className="anuncios-modal-left">
                <div className="anuncios-screens-list">
                  <label className="anuncios-screens-label">Opciones</label>
                  <div className="anuncios-screens-container">
                    <button
                      className={`anuncios-screen-item ${copyModuleModalPage === 'biblioteca' ? 'anuncios-screen-item-active' : ''}`}
                      onClick={() => {
                        setCopyModuleModalPage('biblioteca');
                        if (libraryModules.length === 0) loadLibraryModules();
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
              <div className="anuncios-modal-right">
                {copyModuleModalPage === 'crear' && (
                  <div className="edit-program-modal-right pd-modal-scroll-panel">
                    <div className="edit-program-input-group">
                      <label className="edit-program-input-label">Nombre del Modulo</label>
                      <Input
                        placeholder="Nombre del modulo"
                        value={moduleName || ''}
                        onChange={(e) => setModuleName(e.target.value || '')}
                        type="text"
                        light={true}
                      />
                    </div>
                    <div className="edit-program-modal-actions pd-modal-footer-actions">
                      <Button
                        title={isCreatingModule ? 'Creando...' : 'Crear'}
                        onClick={handleCreateModule}
                        disabled={!moduleName || !moduleName.trim() || isCreatingModule}
                        loading={isCreatingModule}
                      />
                    </div>
                  </div>
                )}
                {copyModuleModalPage === 'biblioteca' && (
                  <div className="copy-session-selection-section">
                    <div className="pd-modal-section-header-row">
                      <button
                        className="copy-session-item-button pd-modal-new-btn"
                        onClick={() => navigate('/library/modules/new')}
                      >
                        <span className="pd-modal-new-btn-icon">+</span>
                        <span>Nuevo Modulo</span>
                      </button>
                    </div>
                    {isLoadingLibraryModules ? (
                      <div className="copy-session-loading"><p>Cargando modulos de biblioteca...</p></div>
                    ) : libraryModules.length === 0 ? (
                      <div className="copy-session-empty"><p>No hay modulos guardados en tu biblioteca.</p></div>
                    ) : (
                      <div className="copy-session-list">
                        {libraryModules.map((libraryModule) => (
                          <div key={libraryModule.id} className="copy-session-item">
                            <div className="copy-session-item-info">
                              <h4 className="copy-session-item-name">
                                {libraryModule.title || `Modulo ${libraryModule.id?.slice(0, 8)}`}
                              </h4>
                              <p className="copy-session-item-module pd-copy-item-meta">
                                Modulo de biblioteca - {(libraryModule.sessionRefs || []).length} sesiones
                              </p>
                            </div>
                            <div className="pd-copy-item-actions">
                              <button
                                className="copy-session-item-button pd-copy-item-edit-btn"
                                onClick={() => navigate(`/library/modules/${libraryModule.id}/edit`)}
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
      </>
    );
  }

  function renderDeleteModuleModal() {
    return (
      <Modal
        isOpen={isDeleteModuleModalOpen}
        onClose={handleCloseDeleteModuleModal}
        title={moduleToDelete?.title || moduleToDelete?.name || 'Eliminar modulo'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">Para confirmar, escribe el nombre del modulo:</p>
          <div className="delete-input-button-row">
            <Input
              placeholder={(() => {
                if (!moduleToDelete) return 'Nombre del modulo';
                return moduleToDelete.title || moduleToDelete.name || `Modulo ${moduleToDelete.id?.slice(0, 8) || ''}`;
              })()}
              value={deleteModuleConfirmation}
              onChange={(e) => setDeleteModuleConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${(() => {
                if (!moduleToDelete) return true;
                const title = moduleToDelete.title || moduleToDelete.name || `Modulo ${moduleToDelete.id?.slice(0, 8) || ''}`;
                return deleteModuleConfirmation.trim() !== title;
              })() ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDeleteModule}
              disabled={(() => {
                if (!moduleToDelete) return true;
                const title = moduleToDelete.title || moduleToDelete.name || `Modulo ${moduleToDelete.id?.slice(0, 8) || ''}`;
                return deleteModuleConfirmation.trim() !== title || isDeletingModule;
              })()}
            >
              {isDeletingModule ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta accion es irreversible. Todo el contenido de este modulo se eliminara permanentemente.
          </p>
        </div>
      </Modal>
    );
  }

  function renderCopySessionModal() {
    return (
      <Modal isOpen={isCopySessionModalOpen} onClose={handleCloseCopySessionModal} title="Nueva Sesion">
        <div className="anuncios-modal-content">
          <div className="anuncios-modal-body">
            <div className="anuncios-modal-left">
              <div className="anuncios-screens-list">
                <label className="anuncios-screens-label">Opciones</label>
                <div className="anuncios-screens-container">
                  <button
                    className={`anuncios-screen-item ${copySessionModalPage === 'biblioteca' ? 'anuncios-screen-item-active' : ''}`}
                    onClick={() => {
                      setCopySessionModalPage('biblioteca');
                      if (librarySessions.length === 0) loadLibrarySessions();
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
            <div className="anuncios-modal-right">
              {copySessionModalPage === 'crear' && (
                <div className="edit-program-modal-right pd-modal-scroll-panel">
                  <div className="edit-program-input-group">
                    <label className="edit-program-input-label">Nombre de la Sesion</label>
                    <Input
                      placeholder="Nombre de la sesion"
                      value={sessionName}
                      onChange={(e) => setSessionName(e.target.value)}
                      type="text"
                      light={true}
                    />
                  </div>
                  <div className="edit-program-modal-actions pd-modal-footer-actions">
                    <Button
                      title={isCreatingSession ? 'Creando...' : 'Crear'}
                      onClick={handleCreateSession}
                      disabled={!sessionName.trim() || isCreatingSession}
                      loading={isCreatingSession}
                    />
                  </div>
                </div>
              )}
              {copySessionModalPage === 'biblioteca' && (
                <div className="copy-session-selection-section">
                  <div className="pd-modal-section-header-row">
                    <button
                      className="copy-session-item-button pd-modal-new-btn"
                      onClick={() => navigate('/library/sessions/new')}
                    >
                      <span className="pd-modal-new-btn-icon">+</span>
                      <span>Nueva Sesion</span>
                    </button>
                  </div>
                  {isLoadingLibrarySessions ? (
                    <div className="copy-session-loading"><p>Cargando sesiones de biblioteca...</p></div>
                  ) : librarySessions.length === 0 ? (
                    <div className="copy-session-empty"><p>No hay sesiones guardadas en tu biblioteca.</p></div>
                  ) : (
                    <div className="copy-session-list">
                      {librarySessions.map((librarySession) => (
                        <div key={librarySession.id} className="copy-session-item">
                          <div className="copy-session-item-info">
                            <h4 className="copy-session-item-name">
                              {librarySession.title || `Sesion ${librarySession.id?.slice(0, 8)}`}
                            </h4>
                          </div>
                          <div className="pd-copy-item-actions">
                            <button
                              className="copy-session-item-button pd-copy-item-edit-btn"
                              onClick={() => navigate(`/content/sessions/${librarySession.id}`, { state: { returnTo: location.pathname } })}
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
    );
  }

  function renderDeleteSessionModal() {
    return (
      <Modal
        isOpen={isDeleteSessionModalOpen}
        onClose={handleCloseDeleteSessionModal}
        title={sessionToDelete?.title || sessionToDelete?.name || 'Eliminar sesion'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">Para confirmar, escribe el nombre de la sesion:</p>
          <div className="delete-input-button-row">
            <Input
              placeholder={(() => {
                if (!sessionToDelete) return 'Nombre de la sesion';
                return sessionToDelete.title || sessionToDelete.name || `Sesion ${sessionToDelete.id?.slice(0, 8) || ''}`;
              })()}
              value={deleteSessionConfirmation}
              onChange={(e) => setDeleteSessionConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${(() => {
                if (!sessionToDelete) return true;
                const title = sessionToDelete.title || sessionToDelete.name || `Sesion ${sessionToDelete.id?.slice(0, 8) || ''}`;
                return deleteSessionConfirmation.trim() !== title;
              })() ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDeleteSession}
              disabled={(() => {
                if (!sessionToDelete) return true;
                const title = sessionToDelete.title || sessionToDelete.name || `Sesion ${sessionToDelete.id?.slice(0, 8) || ''}`;
                return deleteSessionConfirmation.trim() !== title || isDeletingSession;
              })()}
            >
              {isDeletingSession ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta accion es irreversible. Todo el contenido de esta sesion se eliminara permanentemente.
          </p>
        </div>
      </Modal>
    );
  }
};

export default ProgramContentTab;
