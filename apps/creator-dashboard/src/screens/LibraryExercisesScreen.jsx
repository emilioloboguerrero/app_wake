import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import MuscleSilhouetteSVG from '../components/MuscleSilhouetteSVG';
import libraryService from '../services/libraryService';
import { firestore } from '../config/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { LIBRARY_ICONS, getIconById, renderIconSVG } from '../utils/libraryIcons.jsx';
import './LibraryExercisesScreen.css';
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

// List of possible implements
const IMPLEMENTS_LIST = [
  'Peso Corporal',
  'Banco',
  'Banco Inclinado',
  'Pesas Rusas',
  'Bandas de Resistencia',
  'Barra',
  'Barra Z',
  'Mancuernas',
  'Cable',
  'Máquina Smith',
  'Máquina',
  'Lastre',
  'Paralelas',
  'TRX',
  'Otro'
];

// Exercise presets (muscle activation values in 0-100 range, will be converted to 0.0-1.0 for UI)
const EXERCISE_PRESETS = {
  'horizontal_push': {
    name: 'Empuje Horizontal',
    muscles: {
      pecs: 100,
      front_delts: 28,
      triceps: 45
    }
  },
  'incline_press': {
    name: 'Press Inclinado',
    muscles: {
      pecs: 100,
      front_delts: 38,
      triceps: 33
    }
  },
  'vertical_push': {
    name: 'Empuje Vertical',
    muscles: {
      front_delts: 100,
      side_delts: 35,
      triceps: 28,
      traps: 23
    }
  },
  'horizontal_pull': {
    name: 'Tirón Horizontal',
    muscles: {
      lats: 100,
      rhomboids: 45,
      rear_delts: 35,
      biceps: 28,
      traps: 23
    }
  },
  'vertical_pull': {
    name: 'Tirón Vertical',
    muscles: {
      lats: 100,
      biceps: 45,
      rear_delts: 28,
      rhomboids: 23
    }
  },
  'hip_hinge': {
    name: 'Bisagra de Cadera',
    muscles: {
      hamstrings: 100,
      glutes: 65,
      lower_back: 45,
      traps: 23
    }
  },
  'squat': {
    name: 'Sentadilla',
    muscles: {
      quads: 100,
      glutes: 55,
      hamstrings: 35,
      calves: 23
    }
  },
  'lunge_split': {
    name: 'Zancada/División',
    muscles: {
      quads: 100,
      glutes: 45,
      hamstrings: 33,
      calves: 23
    }
  },
  'bicep_isolation': {
    name: 'Aislamiento de Bíceps',
    muscles: {
      biceps: 100,
      forearms: 35
    }
  },
  'tricep_isolation': {
    name: 'Aislamiento de Tríceps',
    muscles: {
      triceps: 100,
      forearms: 23
    }
  },
  'lateral_raise': {
    name: 'Elevación Lateral',
    muscles: {
      side_delts: 100,
      front_delts: 23,
      traps: 18
    }
  },
  'face_pull': {
    name: 'Tirón Facial',
    muscles: {
      rear_delts: 100,
      rhomboids: 45,
      traps: 35,
      biceps: 23
    }
  },
  'calf_raise': {
    name: 'Elevación de Gemelos',
    muscles: {
      calves: 100
    }
  },
  'leg_curl': {
    name: 'Curl de Pierna',
    muscles: {
      hamstrings: 100,
      glutes: 23
    }
  },
  'leg_extension': {
    name: 'Extensión de Pierna',
    muscles: {
      quads: 100
    }
  },
  'abdominal_crunch': {
    name: 'Abdominales',
    muscles: {
      abs: 100,
      obliques: 23
    }
  }
};

const LibraryExercisesScreen = () => {
  const { libraryId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const backPath = location.state?.returnTo || '/content';
  const backState = location.state?.returnState ?? {};
  const [library, setLibrary] = useState(null);
  const [allExercises, setAllExercises] = useState([]); // Store all exercises
  const [exercises, setExercises] = useState([]); // Filtered exercises
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedMuscles, setSelectedMuscles] = useState(new Set()); // Applied filter
  const [tempSelectedMuscles, setTempSelectedMuscles] = useState(new Set()); // Temporary selection in modal
  const [filterSelectedImplements, setFilterSelectedImplements] = useState(new Set()); // Applied implement filter
  const [tempFilterSelectedImplements, setTempFilterSelectedImplements] = useState(new Set()); // Temporary in filter modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [exerciseToDelete, setExerciseToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [exerciseViewMode, setExerciseViewMode] = useState('video'); // 'video' or 'muscles'
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isVideoEditMode, setIsVideoEditMode] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMuscleEditMode, setIsMuscleEditMode] = useState(false);
  const [isSavingMuscles, setIsSavingMuscles] = useState(false);
  const [editingMuscles, setEditingMuscles] = useState(new Set());
  const [muscleEffectiveSets, setMuscleEffectiveSets] = useState({});
  const [isEffectiveSetsInfoModalOpen, setIsEffectiveSetsInfoModalOpen] = useState(false);
  const [isSavingImplements, setIsSavingImplements] = useState(false);
  const [muscleLabelsScrollProgress, setMuscleLabelsScrollProgress] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  const [selectedImplements, setSelectedImplements] = useState(new Set());
  const [isImplementsEditMode, setIsImplementsEditMode] = useState(false);
  const [customImplementInput, setCustomImplementInput] = useState('');
  const [isIconSelectorModalOpen, setIsIconSelectorModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const muscleLabelsContainerRef = useRef(null);

  useEffect(() => {
    const loadLibrary = async () => {
      if (!user || !libraryId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const libraryData = await libraryService.getLibraryById(libraryId);
        if (!libraryData) {
          setError('Biblioteca no encontrada');
          return;
        }

        setLibrary(libraryData);
        
        // Extract exercises from library data
        const exerciseList = libraryService.getExercisesFromLibrary(libraryData);
        // Sort exercises by name
        exerciseList.sort((a, b) => a.name.localeCompare(b.name));
        setAllExercises(exerciseList);
        setExercises(exerciseList);
      } catch (err) {
        console.error('Error loading library:', err);
        setError('Error al cargar la biblioteca');
      } finally {
        setLoading(false);
      }
    };

    loadLibrary();
  }, [user, libraryId]);

  const handleToggleEditMode = () => {
    setIsEditMode(prev => !prev);
  };

  const handleAddExercise = () => {
    setIsAddExerciseModalOpen(true);
    setNewExerciseName('');
  };

  const handleCloseAddExerciseModal = () => {
    setIsAddExerciseModalOpen(false);
    setNewExerciseName('');
  };

  const handleCreateExercise = async () => {
    if (!newExerciseName.trim() || !libraryId) {
      return;
    }

    // Check if exercise name already exists
    const exerciseExists = allExercises.some(
      ex => ex.name.toLowerCase() === newExerciseName.trim().toLowerCase()
    );

    if (exerciseExists) {
      alert('Ya existe un ejercicio con ese nombre. Por favor, elige otro nombre.');
      return;
    }

    try {
      setIsCreatingExercise(true);
      setError(null);

      // Create new exercise with empty data structure
      const libraryDocRef = doc(firestore, 'exercises_library', libraryId);
      await updateDoc(libraryDocRef, {
        [newExerciseName.trim()]: {
          muscle_activation: {},
          implements: [],
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        },
        updated_at: serverTimestamp()
      });

      // Reload library data
      const updatedLibrary = await libraryService.getLibraryById(libraryId);
      if (updatedLibrary) {
        setLibrary(updatedLibrary);
        const exercisesList = libraryService.getExercisesFromLibrary(updatedLibrary);
        // Sort exercises by name
        exercisesList.sort((a, b) => a.name.localeCompare(b.name));
        setAllExercises(exercisesList);
        setExercises(exercisesList);

        // Find the newly created exercise and select it (detail shows in right panel)
        const newExercise = exercisesList.find(ex => ex.name === newExerciseName.trim());
        if (newExercise) {
          setSelectedExercise(newExercise);
          setExerciseViewMode('video');
          setIsVideoPlaying(false);
          setIsMuscleEditMode(false);
          setEditingMuscles(new Set());
          setMuscleEffectiveSets({});
          setSelectedImplements(new Set(newExercise.data?.implements || []));
        }
      }

      // Close add exercise modal
      handleCloseAddExerciseModal();
    } catch (err) {
      console.error('Error creating exercise:', err);
      setError('Error al crear el ejercicio');
      alert('Error al crear el ejercicio. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingExercise(false);
    }
  };

  const handleFilter = () => {
    setTempSelectedMuscles(new Set(selectedMuscles));
    setTempFilterSelectedImplements(new Set(filterSelectedImplements));
    setIsFilterModalOpen(true);
  };

  const handleCloseFilterModal = () => {
    setTempSelectedMuscles(new Set(selectedMuscles));
    setTempFilterSelectedImplements(new Set(filterSelectedImplements));
    setIsFilterModalOpen(false);
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

  const handleClearFilter = () => {
    setTempSelectedMuscles(new Set());
    setTempFilterSelectedImplements(new Set());
  };

  const handleApplyFilter = () => {
    setSelectedMuscles(new Set(tempSelectedMuscles));
    setFilterSelectedImplements(new Set(tempFilterSelectedImplements));
    setIsFilterModalOpen(false);
  };

  const handleToggleImplementFilter = (implement) => {
    setTempFilterSelectedImplements(prev => {
      const next = new Set(prev);
      if (next.has(implement)) next.delete(implement);
      else next.add(implement);
      return next;
    });
  };

  const handleDeleteExercise = (exercise) => {
    setExerciseToDelete(exercise);
    setIsDeleteModalOpen(true);
    setDeleteConfirmation('');
  };

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setExerciseToDelete(null);
    setDeleteConfirmation('');
  };

  const handleConfirmDelete = async () => {
    if (!exerciseToDelete || !deleteConfirmation.trim() || !libraryId) {
      return;
    }

    // Verify the confirmation matches the exercise name
    if (deleteConfirmation.trim() !== exerciseToDelete.name) {
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);
      
      await libraryService.deleteExercise(libraryId, exerciseToDelete.name);
      
      // Reload library data
      const libraryData = await libraryService.getLibraryById(libraryId);
      if (!libraryData) {
        setError('Biblioteca no encontrada');
        return;
      }

      setLibrary(libraryData);
      
      // Extract exercises from library data
      const exerciseList = libraryService.getExercisesFromLibrary(libraryData);
      // Sort exercises by name
      exerciseList.sort((a, b) => a.name.localeCompare(b.name));
      setAllExercises(exerciseList);
      setExercises(exerciseList);
      if (exerciseToDelete && selectedExercise?.name === exerciseToDelete.name) {
        handleClearSelection();
      }
      handleCloseDeleteModal();
      if (exerciseList.length === 0) {
        setIsEditMode(false);
      }
    } catch (err) {
      console.error('Error deleting exercise:', err);
      setError('Error al eliminar el ejercicio');
      alert('Error al eliminar el ejercicio. Por favor, intenta de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const isExerciseIncomplete = (exercise) => {
    if (!exercise || !exercise.data) return true;
    
    const hasVideo = !!(exercise.data.video_url || exercise.data.video);
    const hasMuscles = !!(exercise.data.muscle_activation && Object.keys(exercise.data.muscle_activation).length > 0);
    const hasImplements = !!(exercise.data.implements && Array.isArray(exercise.data.implements) && exercise.data.implements.length > 0);
    
    return !hasVideo || !hasMuscles || !hasImplements;
  };

  const handleExerciseClick = (exercise) => {
    if (!isEditMode) {
      setSelectedExercise(exercise);
      setExerciseViewMode('video');
      setIsVideoPlaying(false);
      setIsMuscleEditMode(false);
      setEditingMuscles(new Set());
      setMuscleEffectiveSets({});
      setIsImplementsEditMode(false);
      const existingImplements = exercise.data?.implements || [];
      setSelectedImplements(new Set(existingImplements));
      setMuscleLabelsScrollProgress({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
    }
  };

  const handleClearSelection = () => {
    setSelectedExercise(null);
    setIsVideoEditMode(false);
    setIsVideoPlaying(false);
    setIsMuscleEditMode(false);
    setEditingMuscles(new Set());
    setMuscleEffectiveSets({});
    setIsImplementsEditMode(false);
    setSelectedImplements(new Set());
    setMuscleLabelsScrollProgress({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  };

  const handleVideoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !selectedExercise || !libraryId) {
      return;
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      alert('Por favor, selecciona un archivo de video válido');
      return;
    }

    // Validate file size (e.g., max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      alert('El archivo es demasiado grande. El tamaño máximo es 100MB');
      return;
    }

    // Verify user is the creator of the library
    if (!library || !user || library.creator_id !== user.uid) {
      alert('Solo el creador de la biblioteca puede subir videos.');
      return;
    }

    try {
      setIsUploadingVideo(true);
      setVideoUploadProgress(0);

      // Upload video to Firebase Storage and update Firestore
      // Pass a progress callback to update the progress state
      const videoURL = await libraryService.uploadExerciseVideo(
        libraryId,
        selectedExercise.name,
        file,
        (progress) => {
          // Update progress as upload progresses
          setVideoUploadProgress(Math.round(progress));
        }
      );

      // Construct video path (same as in uploadExerciseVideo)
      const sanitizedExerciseName = selectedExercise.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileExtension = file.name.split('.').pop() || 'mp4';
      const videoPath = `exercises_library/${libraryId}/${sanitizedExerciseName}/video.${fileExtension}`;

      // Update selected exercise immediately with new video URL (optimistic update)
      setSelectedExercise(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          data: {
            ...prev.data,
            video_url: videoURL,
            video_path: videoPath
          }
        };
      });

      // Also update the exercises list
      setAllExercises(prev => prev.map(ex => 
        ex.name === selectedExercise.name 
          ? { ...ex, data: { ...ex.data, video_url: videoURL } }
          : ex
      ));
      setExercises(prev => prev.map(ex => 
        ex.name === selectedExercise.name 
          ? { ...ex, data: { ...ex.data, video_url: videoURL } }
          : ex
      ));

      // Reload library data in the background to ensure consistency
      const libraryData = await libraryService.getLibraryById(libraryId);
      if (libraryData) {
      setLibrary(libraryData);
      
        // Update selected exercise with fresh data from server
      const exerciseList = libraryService.getExercisesFromLibrary(libraryData);
      const updatedExercise = exerciseList.find(ex => ex.name === selectedExercise.name);
      if (updatedExercise) {
        setSelectedExercise(updatedExercise);
        }

        // Update exercises list with fresh data
        exerciseList.sort((a, b) => a.name.localeCompare(b.name));
        setAllExercises(exerciseList);
        setExercises(exerciseList);
      }

      setVideoUploadProgress(100);
    } catch (err) {
      console.error('Error uploading video:', err);
      
      // Show more specific error message
      let errorMessage = 'Error al subir el video. Por favor, intenta de nuevo.';
      
      if (err.code) {
        switch (err.code) {
          case 'storage/unauthorized':
            errorMessage = 'No tienes permiso para subir videos. Contacta al administrador.';
            break;
          case 'storage/canceled':
            errorMessage = 'La subida fue cancelada.';
            break;
          case 'storage/unknown':
            errorMessage = 'Error desconocido al subir el video. Verifica tu conexión.';
            break;
          case 'storage/quota-exceeded':
            errorMessage = 'Se ha excedido la cuota de almacenamiento.';
            break;
          case 'storage/unauthenticated':
            errorMessage = 'Debes iniciar sesión para subir videos.';
            break;
          default:
            errorMessage = `Error: ${err.message || err.code}`;
        }
      } else if (err.message) {
        errorMessage = `Error: ${err.message}`;
      }
      
      alert(errorMessage);
    } finally {
      setIsUploadingVideo(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleVideoDelete = async () => {
    if (!selectedExercise || !libraryId) {
      return;
    }

    if (!window.confirm('¿Estás seguro de que quieres eliminar el video de este ejercicio?')) {
      return;
    }

    try {
      // Update selected exercise immediately (optimistic update)
      setSelectedExercise(prev => {
        if (!prev) return prev;
        const { video_url, video_path, ...restData } = prev.data;
        return {
          ...prev,
          data: restData
        };
      });

      // Also update the exercises list immediately
      setAllExercises(prev => prev.map(ex => 
        ex.name === selectedExercise.name 
          ? { ...ex, data: (() => {
              const { video_url, video_path, ...restData } = ex.data;
              return restData;
            })() }
          : ex
      ));
      setExercises(prev => prev.map(ex => 
        ex.name === selectedExercise.name 
          ? { ...ex, data: (() => {
              const { video_url, video_path, ...restData } = ex.data;
              return restData;
            })() }
          : ex
      ));

      // Delete video from Storage and Firestore
      await libraryService.deleteExerciseVideo(libraryId, selectedExercise.name);

      // Reload library data in the background to ensure consistency
      const libraryData = await libraryService.getLibraryById(libraryId);
      if (libraryData) {
        setLibrary(libraryData);
        
        // Update selected exercise with fresh data from server
        const exerciseList = libraryService.getExercisesFromLibrary(libraryData);
        const updatedExercise = exerciseList.find(ex => ex.name === selectedExercise.name);
        if (updatedExercise) {
          setSelectedExercise(updatedExercise);
        }

        // Update exercises list with fresh data
        exerciseList.sort((a, b) => a.name.localeCompare(b.name));
        setAllExercises(exerciseList);
        setExercises(exerciseList);
      }
    } catch (err) {
      console.error('Error deleting video:', err);
      alert('Error al eliminar el video. Por favor, intenta de nuevo.');
      
      // On error, refetch to restore correct state
      try {
        const libraryData = await libraryService.getLibraryById(libraryId);
        if (libraryData) {
          setLibrary(libraryData);
          const exerciseList = libraryService.getExercisesFromLibrary(libraryData);
          const updatedExercise = exerciseList.find(ex => ex.name === selectedExercise.name);
          if (updatedExercise) {
            setSelectedExercise(updatedExercise);
          }
          exerciseList.sort((a, b) => a.name.localeCompare(b.name));
          setAllExercises(exerciseList);
          setExercises(exerciseList);
        }
      } catch (refetchError) {
        console.error('Error refetching after delete failure:', refetchError);
      }
    }
  };

  const handleToggleEditingMuscle = (muscle) => {
    setEditingMuscles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(muscle)) {
        newSet.delete(muscle);
        // Remove from effective sets when removing muscle
        setMuscleEffectiveSets(prevSets => {
          const newSets = { ...prevSets };
          delete newSets[muscle];
          return newSets;
        });
      } else {
        newSet.add(muscle);
        // Add to effective sets - get from muscle_activation (0-100) and divide by 100
        setMuscleEffectiveSets(prevSets => ({
          ...prevSets,
          [muscle]: prevSets[muscle] !== undefined 
            ? prevSets[muscle] 
            : (selectedExercise?.data?.muscle_activation?.[muscle] !== undefined && selectedExercise?.data?.muscle_activation?.[muscle] !== null
              ? ((selectedExercise.data.muscle_activation[muscle] / 100).toFixed(1))
              : '')
        }));
      }
      return newSet;
    });
  };

  const handleEffectiveSetsChange = (muscle, value) => {
    // Validate value is between 0 and 1
    const numValue = parseFloat(value);
    
    if (value === '' || value === null || value === undefined) {
      // Allow empty values (treated as 0)
      setMuscleEffectiveSets(prev => {
        const newSets = { ...prev };
        newSets[muscle] = '';
        return newSets;
      });
      return;
    }
    
    if (isNaN(numValue) || numValue < 0 || numValue > 1) {
      // Invalid value, don't update
      return;
    }
    
    // Check constraint: only one muscle can be 1.0
    setMuscleEffectiveSets(prev => {
      const newSets = { ...prev };
      
      // If trying to set to 1.0, check if another muscle is already 1.0
      if (numValue === 1.0) {
        let hasOtherOne = false;
        editingMuscles.forEach(m => {
          if (m !== muscle) {
            const mValue = parseFloat(prev[m] || 0);
            if (mValue === 1.0) {
              hasOtherOne = true;
            }
          }
        });
        
        if (hasOtherOne) {
          // Can't set to 1.0 if another muscle is already 1.0
          return prev;
        }
      }
      
      // Valid update (value is between 0 and 1)
      newSets[muscle] = value;
      return newSets;
    });
  };

  const handleStartMuscleEdit = () => {
    if (selectedExercise?.data?.muscle_activation) {
      const muscles = new Set(Object.keys(selectedExercise.data.muscle_activation));
      setEditingMuscles(muscles);
      
      // Initialize effective sets from muscle_activation values (0-100) divided by 100
      const effectiveSets = {};
      muscles.forEach(muscle => {
        // Get from muscle_activation in database (0-100), divide by 100 to get effective sets (0.0-1.0)
        const dbValue = selectedExercise.data?.muscle_activation?.[muscle];
        if (dbValue !== undefined && dbValue !== null) {
          // Convert from 0-100 range to 0.0-1.0 range for display
          const effectiveSetsValue = (dbValue / 100).toFixed(1);
          effectiveSets[muscle] = effectiveSetsValue;
        } else {
          effectiveSets[muscle] = '';
        }
      });
      setMuscleEffectiveSets(effectiveSets);
    } else {
      setEditingMuscles(new Set());
      setMuscleEffectiveSets({});
    }
    setIsMuscleEditMode(true);
    // Reset scroll progress when entering edit mode
    setTimeout(() => {
      if (muscleLabelsContainerRef.current) {
        const el = muscleLabelsContainerRef.current;
        setMuscleLabelsScrollProgress({
          scrollLeft: el.scrollLeft || 0,
          scrollWidth: el.scrollWidth || 0,
          clientWidth: el.clientWidth || 0
        });
      }
    }, 0);
  };

  const handleApplyPreset = (presetKey) => {
    const preset = EXERCISE_PRESETS[presetKey];
    if (!preset) return;

    // Set the muscles from the preset
    const presetMuscles = new Set(Object.keys(preset.muscles));
    setEditingMuscles(presetMuscles);

    // Convert preset values (0-100) to effective sets (0.0-1.0) for UI
    const effectiveSets = {};
    Object.keys(preset.muscles).forEach(muscle => {
      const dbValue = preset.muscles[muscle]; // Value in 0-100 range
      const uiValue = (dbValue / 100).toFixed(1); // Convert to 0.0-1.0 range
      effectiveSets[muscle] = uiValue;
    });
    setMuscleEffectiveSets(effectiveSets);
  };

  const handleCancelMuscleEdit = () => {
    // Reset to original values from database
    if (selectedExercise?.data?.muscle_activation) {
      const muscles = new Set(Object.keys(selectedExercise.data.muscle_activation));
      setEditingMuscles(muscles);
      
      // Reset effective sets from muscle_activation values (0-100) divided by 100
      const effectiveSets = {};
      muscles.forEach(muscle => {
        // Get from muscle_activation in database (0-100), divide by 100 to get effective sets (0.0-1.0)
        const dbValue = selectedExercise.data?.muscle_activation?.[muscle];
        if (dbValue !== undefined && dbValue !== null) {
          // Convert from 0-100 range to 0.0-1.0 range for display
          const effectiveSetsValue = (dbValue / 100).toFixed(1);
          effectiveSets[muscle] = effectiveSetsValue;
        } else {
          effectiveSets[muscle] = '';
        }
      });
      setMuscleEffectiveSets(effectiveSets);
    } else {
      setEditingMuscles(new Set());
      setMuscleEffectiveSets({});
    }
    setIsMuscleEditMode(false);
  };

  const handleSaveMuscles = async () => {
    if (!selectedExercise || !libraryId) {
      return;
    }

    setIsSavingMuscles(true);
    try {
      // Convert Set to object with activation values
      // Store effective sets (0.0-1.0) as muscle_activation values (0-100)
      const muscleActivation = {};
      editingMuscles.forEach(muscle => {
        const value = muscleEffectiveSets[muscle];
        if (value !== undefined && value !== '' && value !== null) {
          const numValue = parseFloat(value);
          if (!isNaN(numValue) && numValue >= 0 && numValue <= 1) {
            // Convert from 0.0-1.0 range to 0-100 range for storage
            muscleActivation[muscle] = Math.round(numValue * 100);
          } else {
            // If invalid, keep existing value or default to 0
            muscleActivation[muscle] = selectedExercise.data?.muscle_activation?.[muscle] || 0;
          }
        } else {
          // If no value provided, keep existing value or default to 0
          muscleActivation[muscle] = selectedExercise.data?.muscle_activation?.[muscle] || 0;
        }
      });

      await libraryService.updateExercise(libraryId, selectedExercise.name, {
        muscle_activation: muscleActivation
      });

      // Reload library data
      const libraryData = await libraryService.getLibraryById(libraryId);
      if (!libraryData) {
        setError('Biblioteca no encontrada');
        return;
      }

      setLibrary(libraryData);
      
      // Update selected exercise
      const exerciseList = libraryService.getExercisesFromLibrary(libraryData);
      const updatedExercise = exerciseList.find(ex => ex.name === selectedExercise.name);
      if (updatedExercise) {
        setSelectedExercise(updatedExercise);
        // Update effective sets display to reflect saved values (convert from 0-100 to 0.0-1.0)
        if (updatedExercise.data?.muscle_activation) {
          const updatedEffectiveSets = {};
          Object.keys(updatedExercise.data.muscle_activation).forEach(muscle => {
            const dbValue = updatedExercise.data.muscle_activation[muscle];
            if (dbValue !== undefined && dbValue !== null) {
              updatedEffectiveSets[muscle] = (dbValue / 100).toFixed(1);
            }
          });
          setMuscleEffectiveSets(updatedEffectiveSets);
        }
      }

      setIsMuscleEditMode(false);
    } catch (err) {
      console.error('Error saving muscles:', err);
      alert('Error al guardar los músculos. Por favor, intenta de nuevo.');
    } finally {
      setIsSavingMuscles(false);
    }
  };

  const handleSaveImplements = async () => {
    if (!selectedExercise || !libraryId) {
      return;
    }

    setIsSavingImplements(true);
    try {
      // Convert Set to array
      const implementsArray = Array.from(selectedImplements);

      await libraryService.updateExercise(libraryId, selectedExercise.name, {
        implements: implementsArray
      });

      // Reload library data
      const libraryData = await libraryService.getLibraryById(libraryId);
      if (!libraryData) {
        setError('Biblioteca no encontrada');
        return;
      }

      setLibrary(libraryData);
      
      // Update exercises list
      const exerciseList = libraryService.getExercisesFromLibrary(libraryData);
      exerciseList.sort((a, b) => a.name.localeCompare(b.name));
      setAllExercises(exerciseList);
      
      // Apply current filter to exercises list
      if (selectedMuscles.size === 0) {
        setExercises(exerciseList);
      } else {
        const filtered = exerciseList.filter(exercise => {
          if (!exercise.data?.muscle_activation) return false;
          const exerciseMuscles = Object.keys(exercise.data.muscle_activation);
          return Array.from(selectedMuscles).some(muscle => exerciseMuscles.includes(muscle));
        });
        setExercises(filtered);
      }
      
      // Update selected exercise
      const updatedExercise = exerciseList.find(ex => ex.name === selectedExercise.name);
      if (updatedExercise) {
        setSelectedExercise(updatedExercise);
        // Update selected implements display
        const existingImplements = updatedExercise.data?.implements || [];
        setSelectedImplements(new Set(existingImplements));
      }

      setIsImplementsEditMode(false);
    } catch (err) {
      console.error('Error saving implements:', err);
      alert('Error al guardar los implementos. Por favor, intenta de nuevo.');
    } finally {
      setIsSavingImplements(false);
    }
  };

  const handleToggleImplement = (implement) => {
    if (!isImplementsEditMode) return;
    
    setSelectedImplements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(implement)) {
        newSet.delete(implement);
      } else {
        newSet.add(implement);
      }
      return newSet;
    });
  };

  const handleAddCustomImplement = () => {
    const name = customImplementInput.trim();
    if (!name) return;
    const alreadyExists = implementsListForEdit.some(i => (i || '').toLowerCase() === name.toLowerCase());
    if (alreadyExists) {
      setCustomImplementInput('');
      return;
    }
    setSelectedImplements(prev => new Set([...prev, name]));
    setCustomImplementInput('');
  };

  // Exercise and wellness SVG icons
  const LIBRARY_ICONS = [
    // Strength Training
    { id: 'dumbbell', name: 'Mancuernas', path: 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.86 2.71 4.29l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29l-1.43-1.43z' },
    { id: 'barbell', name: 'Barra', path: 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.86 2.71 4.29l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29l-1.43-1.43z' },
    { id: 'weight', name: 'Peso', path: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    
    // Cardio
    { id: 'running', name: 'Correr', path: 'M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z' },
    { id: 'bike', name: 'Bicicleta', path: 'M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm11.5-7C13.7 13.5 12 15.2 12 17.5s1.7 4 3.5 4 3.5-1.7 3.5-4-1.7-3.5-3.5-3.5zm0 5.5c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zM10.2 5.5l2.8 3-1.4 1.4-5.5-5.9L7 3.5l3.2 2z' },
    { id: 'swim', name: 'Natación', path: 'M22 15c0-1.66-1.34-3-3-3s-3 1.34-3 3 1.34 3 3 3 3-1.34 3-3zm-5.3-3.7c1.2 0 2.1-.9 2.1-2.1s-.9-2.1-2.1-2.1-2.1.9-2.1 2.1.9 2.1 2.1 2.1zm-4.9-2c1.2 0 2.1-.9 2.1-2.1s-.9-2.1-2.1-2.1-2.1.9-2.1 2.1.9 2.1 2.1 2.1zm-4.9-2c1.2 0 2.1-.9 2.1-2.1s-.9-2.1-2.1-2.1-2.1.9-2.1 2.1.9 2.1 2.1 2.1zM22 7c0-1.66-1.34-3-3-3s-3 1.34-3 3 1.34 3 3 3 3-1.34 3-3z' },
    
    // Yoga/Wellness
    { id: 'yoga', name: 'Yoga', path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
    { id: 'meditation', name: 'Meditación', path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z' },
    { id: 'heart', name: 'Bienestar', path: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' },
    
    // Sports
    { id: 'basketball', name: 'Baloncesto', path: 'M17.09 11l2.5-2.5c.39-.39.39-1.02 0-1.41l-3.18-3.18c-.39-.39-1.02-.39-1.41 0L12 8.09 8.5 5.59c-.39-.39-1.02-.39-1.41 0L3.91 8.77c-.39.39-.39 1.02 0 1.41L6.41 12l-2.5 2.5c-.39.39-.39 1.02 0 1.41l3.18 3.18c.39.39 1.02.39 1.41 0L12 15.91l3.5 2.5c.39.39 1.02.39 1.41 0l3.18-3.18c.39-.39.39-1.02 0-1.41L17.09 11z' },
    { id: 'soccer', name: 'Fútbol', path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' },
    { id: 'tennis', name: 'Tenis', path: 'M19.5 8c-1.65 0-3 1.35-3 3s1.35 3 3 3 3-1.35 3-3-1.35-3-3-3zm-16 0c-1.65 0-3 1.35-3 3s1.35 3 3 3 3-1.35 3-3-1.35-3-3-3zm2 3c0 .55-.45 1-1 1s-1-.45-1-1 .45-1 1-1 1 .45 1 1zm14 0c0 .55-.45 1-1 1s-1-.45-1-1 .45-1 1-1 1 .45 1 1zM12 5.5c1.38 0 2.5 1.12 2.5 2.5 0 .84-.41 1.58-1.04 2.03L13 11h-2l-.46-1.03C9.91 9.58 9.5 8.84 9.5 8c0-1.38 1.12-2.5 2.5-2.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z' },
    { id: 'boxing', name: 'Boxeo', path: 'M14.5 2.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5S12.17 1 13 1s1.5.67 1.5 1.5zM12 4.5c-1.38 0-2.5-1.12-2.5-2.5S10.62-.5 12-.5s2.5 1.12 2.5 2.5S13.38 4.5 12 4.5zm0 2c-1.38 0-2.5-1.12-2.5-2.5S10.62 1.5 12 1.5s2.5 1.12 2.5 2.5S13.38 6.5 12 6.5z' },
    
    // Body Parts
    { id: 'arms', name: 'Brazos', path: 'M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z' },
    { id: 'legs', name: 'Piernas', path: 'M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.516 6.516 0 0 1 9.5 16 6.5 6.5 0 0 1 3 9.5 6.5 6.5 0 0 1 9.5 3m0 2C7.01 5 5 7.01 5 9.5S7.01 14 9.5 14 14 11.99 14 9.5 11.99 5 9.5 5z' },
    { id: 'core', name: 'Core', path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z' },
    
    // Equipment
    { id: 'kettlebell', name: 'Pesa Rusa', path: 'M16 2c-1.1 0-2 .9-2 2v1.17c1.85.47 3.35 1.95 3.83 3.83H20c0-2.21-1.79-4-4-4zM4.27 5C4.1 5.32 4 5.65 4 6c0 1.1.9 2 2 2h.09C6.24 7.93 6 8.42 6 9v11c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V9c0-.58-.24-1.07-.09-1.5H16c1.1 0 2-.9 2-2 0-.35-.1-.68-.27-1C17.34 4.68 16.8 4 16 4H8c-.8 0-1.34.68-1.73 1z' },
    { id: 'resistance', name: 'Bandas', path: 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.86 2.71 4.29l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29l-1.43-1.43z' },
    { id: 'machine', name: 'Máquina', path: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H4v-4h11v4zm0-5H4V9h11v4zm5 5h-4V9h4v9z' },
    
    // Health/Wellness
    { id: 'pulse', name: 'Ritmo Cardíaco', path: 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z' },
    { id: 'leaf', name: 'Naturaleza', path: 'M17 8C8 10 5.9 16.17 3.82 21.34l5.71.98c.5-1.5 1.67-3.97 3.29-6.15C14.14 14.81 16.07 12.5 19 12.5V8z' },
    { id: 'fire', name: 'Intensidad', path: 'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z' },
    { id: 'star', name: 'Destacado', path: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z' },
    { id: 'target', name: 'Objetivo', path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z' },
    
    // General
    { id: 'trophy', name: 'Logro', path: 'M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 13.63 21 11.55 21 9V7c0-1.1-.9-2-2-2zM5 9V7h2v3.82C5.84 10.4 5 9.3 5 9zm14 0c0 1.3-.84 2.4-2 2.82V7h2v2z' },
    { id: 'chart', name: 'Progreso', path: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z' },
    { id: 'calendar', name: 'Programa', path: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z' },
  ];

  const handleIconSelect = async (iconId) => {
    if (!libraryId || !user || !library || library.creator_id !== user.uid) {
      alert('Solo el creador de la biblioteca puede cambiar el ícono.');
      return;
    }

    try {
      await libraryService.updateLibrary(libraryId, { icon: iconId });
      
      // Update library state immediately
      setLibrary(prev => ({
        ...prev,
        icon: iconId
      }));
      
      setIsIconSelectorModalOpen(false);
    } catch (err) {
      console.error('Error updating icon:', err);
      alert('Error al actualizar el ícono. Por favor, intenta de nuevo.');
    }
  };

  const getIconById = (iconId) => {
    return LIBRARY_ICONS.find(icon => icon.id === iconId);
  };

  const renderIcon = (iconId, size = 24) => {
    const icon = getIconById(iconId);
    if (!icon) return null;
    
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d={icon.path} fill="currentColor"/>
      </svg>
    );
  };

  // Get all unique muscles from all exercises
  const allMuscles = useMemo(() => {
    const musclesSet = new Set();
    allExercises.forEach(exercise => {
      if (exercise.data?.muscle_activation) {
        Object.keys(exercise.data.muscle_activation).forEach(muscle => {
          musclesSet.add(muscle);
        });
      }
    });
    return Array.from(musclesSet).sort();
  }, [allExercises]);

  // All unique implements from library exercises (for filter modal), sorted alphabetically
  const allUniqueImplements = useMemo(() => {
    const set = new Set();
    allExercises.forEach(ex => {
      const impl = ex.data?.implements;
      if (Array.isArray(impl)) impl.forEach(i => set.add(i));
    });
    return Array.from(set).sort((a, b) => (a || '').localeCompare(b || '', 'es'));
  }, [allExercises]);

  // Sorted list for implement picker: default list + library customs + currently selected (so new custom tags appear)
  const implementsListForEdit = useMemo(() => {
    const set = new Set(IMPLEMENTS_LIST);
    allUniqueImplements.forEach(i => set.add(i));
    selectedImplements.forEach(i => set.add(i));
    return Array.from(set).sort((a, b) => (a || '').localeCompare(b || '', 'es'));
  }, [allUniqueImplements, selectedImplements]);

  // Filter exercises based on selected muscles and selected implements
  useEffect(() => {
    let list = allExercises;
    if (selectedMuscles.size > 0) {
      list = list.filter(exercise => {
        if (!exercise.data?.muscle_activation) return false;
        const exerciseMuscles = Object.keys(exercise.data.muscle_activation);
        return Array.from(selectedMuscles).some(muscle => exerciseMuscles.includes(muscle));
      });
    }
    if (filterSelectedImplements.size > 0) {
      list = list.filter(exercise => {
        if (!exercise.data?.implements || !Array.isArray(exercise.data.implements)) return false;
        return Array.from(filterSelectedImplements).some(impl => exercise.data.implements.includes(impl));
      });
    }
    setExercises(list);
  }, [selectedMuscles, filterSelectedImplements, allExercises]);

  // Sidebar list: exercises filtered by search query (name)
  const sidebarExercises = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter(ex => (ex.name || '').toLowerCase().includes(q));
  }, [exercises, searchQuery]);

  if (loading) {
    return (
      <DashboardLayout 
        screenName={library?.title || 'Entrenamiento'}
        showBackButton={true}
        backPath={backPath}
        backState={backState}
      >
        <div className="library-exercises-content">
          <div className="library-exercises-loading">
            <p>Cargando...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !library) {
    return (
      <DashboardLayout 
        screenName="Entrenamiento"
        showBackButton={true}
        backPath={backPath}
        backState={backState}
      >
        <div className="library-exercises-content">
          <div className="library-exercises-error">
            <p>{error || 'Biblioteca no encontrada'}</p>
            <button onClick={() => navigate(backPath, { state: backState })} className="back-button">
              Volver a Contenido
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const currentIcon = library?.icon ? getIconById(library.icon) : null;

  return (
    <DashboardLayout 
      screenName={library.title}
      showBackButton={true}
      backPath={backPath}
      backState={backState}
      headerIcon={currentIcon ? (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d={currentIcon.path} fill="currentColor"/>
        </svg>
      ) : null}
      onHeaderEditClick={() => setIsIconSelectorModalOpen(true)}
    >
      <div className="library-exercises-content">
        <div className="library-exercises-body">
          {/* Left sidebar - exercise list (same style as session edit / planificación) */}
          <div className="library-exercises-sidebar">
            <div className="library-exercises-sidebar-header">
              <h3 className="library-exercises-sidebar-title">Ejercicios</h3>
              <div className="library-exercises-sidebar-actions">
                <button
                  className={`library-exercises-sidebar-pill ${isEditMode ? 'library-exercises-sidebar-pill-disabled' : ''}`}
                  onClick={handleAddExercise}
                  disabled={isEditMode}
                  title="Nuevo ejercicio"
                >
                  <span className="library-exercises-sidebar-pill-icon">+</span>
                </button>
                <button
                  className={`library-exercises-sidebar-pill ${isEditMode ? 'library-exercises-sidebar-pill-disabled' : ''}`}
                  onClick={handleFilter}
                  disabled={isEditMode}
                >
                  <span className="library-exercises-sidebar-pill-text">Filtrar</span>
                </button>
                <button
                  className="library-exercises-sidebar-pill"
                  onClick={handleToggleEditMode}
                >
                  <span className="library-exercises-sidebar-pill-text">{isEditMode ? 'Guardar' : 'Editar'}</span>
                </button>
              </div>
            </div>

            <div className="library-exercises-search-container">
              <div className="library-exercises-search-input-container">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="library-exercises-search-icon">
                  <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <input
                  type="text"
                  className="library-exercises-search-input"
                  placeholder="Buscar ejercicios..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {(selectedMuscles.size > 0 || filterSelectedImplements.size > 0) && (
              <div className="library-exercises-active-filters">
                <div className="library-exercises-active-filters-scroll">
                  {Array.from(selectedMuscles).sort().map(muscle => (
                    <div key={`m-${muscle}`} className="library-exercises-filter-chip" onClick={handleFilter}>
                      <span>{MUSCLE_DISPLAY_NAMES[muscle] || muscle}</span>
                    </div>
                  ))}
                  {Array.from(filterSelectedImplements).sort().map(implement => (
                    <div key={`i-${implement}`} className="library-exercises-filter-chip" onClick={handleFilter}>
                      <span>{implement}</span>
                    </div>
                  ))}
                  <button type="button" className="library-exercises-clear-filters" onClick={() => { setSelectedMuscles(new Set()); setTempSelectedMuscles(new Set()); setFilterSelectedImplements(new Set()); setTempFilterSelectedImplements(new Set()); }}>
                    Limpiar
                  </button>
                </div>
              </div>
            )}

            <div className="library-exercises-sidebar-content">
              {sidebarExercises.length === 0 ? (
                <div className="library-exercises-sidebar-empty">
                  <p>
                    {searchQuery.trim() || selectedMuscles.size > 0 || filterSelectedImplements.size > 0
                      ? 'No se encontraron ejercicios'
                      : 'No hay ejercicios. Agrega uno para comenzar.'}
                  </p>
                </div>
              ) : (
                <div className="library-exercises-sidebar-list">
                  {sidebarExercises.map((exercise) => (
                    <button
                      key={exercise.name}
                      type="button"
                      className={`library-exercises-sidebar-item ${selectedExercise?.name === exercise.name ? 'library-exercises-sidebar-item-selected' : ''} ${isEditMode ? 'library-exercises-sidebar-item-edit' : ''}`}
                      onClick={() => {
                        if (isEditMode) return;
                        handleExerciseClick(exercise);
                      }}
                    >
                      {isEditMode && (
                        <span
                          className="library-exercises-sidebar-item-delete"
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDeleteExercise(exercise); }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDeleteExercise(exercise); } }}
                          aria-label="Eliminar"
                        >
                          −
                        </span>
                      )}
                      {!isEditMode && isExerciseIncomplete(exercise) && (
                        <span className="library-exercises-sidebar-item-incomplete" title="Ejercicio incompleto">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                      )}
                      <span className="library-exercises-sidebar-item-name">{exercise.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right main - exercise detail (video, muscles, implements) */}
          <div className="library-exercises-main">
            {!selectedExercise ? (
              <div className="library-exercises-main-empty">
                <svg className="library-exercises-main-empty-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"/>
                </svg>
                <p className="library-exercises-main-empty-text">Selecciona un ejercicio de la lista para ver y editar su contenido</p>
                <button type="button" className="library-exercises-main-empty-button" onClick={handleAddExercise}>
                  + Nuevo ejercicio
                </button>
              </div>
            ) : (
              <>
                <div className="library-exercises-main-header">
                  <div className="library-exercises-main-header-title-wrap">
                    <h2 className="library-exercises-main-title">{selectedExercise.name}</h2>
                    {isExerciseIncomplete(selectedExercise) && (
                      <span className="library-exercises-main-incomplete-tag" title="Falta video, músculos o implementos">Incompleto</span>
                    )}
                  </div>
                  <button type="button" className="library-exercises-main-close" onClick={handleClearSelection} title="Cerrar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                <div className="library-exercises-main-content">
                  {/* Same structure as former exercise modal body: implements + video/muscles */}
                  <div className="exercise-modal-content exercise-modal-content-inline">
                    <div className="exercise-modal-body">
                      <div className="exercise-modal-left">
                        {/* Implements card - same as before */}
                        <div className="exercise-implements-card">
                          <div className="exercise-implements-header">
                            <label className="exercise-section-title">Implementos</label>
                          </div>
                          {!isImplementsEditMode ? (
                            <div className="exercise-implements-actions-overlay">
                              <button
                                className="exercise-video-action-pill"
                                onClick={() => {
                                  const currentImplements = selectedExercise?.data?.implements || [];
                                  setSelectedImplements(new Set(currentImplements));
                                  setIsImplementsEditMode(true);
                                }}
                              >
                                <span className="exercise-video-action-text">Editar</span>
                              </button>
                            </div>
                          ) : (
                            <div className="exercise-implements-actions-overlay">
                              <button
                                className="exercise-video-action-pill exercise-video-save-pill"
                                onClick={handleSaveImplements}
                                disabled={isSavingImplements}
                              >
                                <span className="exercise-video-action-text">{isSavingImplements ? 'Guardando...' : 'Guardar'}</span>
                              </button>
                            </div>
                          )}
                          <div className="exercise-implements-content">
                            {isImplementsEditMode ? (
                              <div className="exercise-implements-grid">
                                {implementsListForEdit.map(implement => (
                                  <button
                                    key={implement}
                                    type="button"
                                    className={`exercise-implement-chip ${selectedImplements.has(implement) ? 'exercise-implement-chip-selected' : ''}`}
                                    onClick={() => handleToggleImplement(implement)}
                                  >
                                    {implement}
                                  </button>
                                ))}
                                <div className="exercise-implements-add-custom">
                                  <input
                                    type="text"
                                    className="exercise-implements-custom-input"
                                    placeholder="Añadir implemento personalizado"
                                    value={customImplementInput}
                                    onChange={(e) => setCustomImplementInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomImplement())}
                                    aria-label="Nombre del implemento personalizado"
                                  />
                                  <button
                                    type="button"
                                    className="exercise-implements-add-custom-btn"
                                    onClick={handleAddCustomImplement}
                                    disabled={!customImplementInput.trim()}
                                  >
                                    Añadir
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="exercise-implements-display">
                                {selectedImplements.size > 0 ? (
                                  <div className="exercise-implements-list">
                                    {Array.from(selectedImplements).sort((a, b) => (a || '').localeCompare(b || '', 'es')).map(implement => (
                                      <span key={implement} className="exercise-implement-tag">
                                        {implement}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="exercise-implements-empty">No hay implementos seleccionados</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Effective sets card - always visible (read-only when not editing) */}
                        <div className="exercise-effective-sets-card">
                          <div className="exercise-effective-sets-header">
                            <label className="exercise-section-title">Series Efectivas por Grupo Muscular</label>
                            <button
                              className="exercise-effective-sets-info-button"
                              onClick={() => setIsEffectiveSetsInfoModalOpen(true)}
                              aria-label="Información sobre series efectivas"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="12" cy="12" r="10" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="2" fill="none"/>
                                <path d="M12 16V12" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="2" strokeLinecap="round"/>
                                <circle cx="12" cy="8" r="1" fill="rgba(255, 255, 255, 0.6)"/>
                              </svg>
                            </button>
                          </div>
                          <div className="exercise-effective-sets-scroll">
                            {isMuscleEditMode ? (
                              <>
                              {Array.from(editingMuscles).sort().map(muscle => (
                                <div key={muscle} className="exercise-effective-sets-item">
                                  <span className="exercise-effective-sets-muscle-name">
                                    {MUSCLE_DISPLAY_NAMES[muscle] || muscle}
                                  </span>
                                  <div className="exercise-effective-sets-input-wrapper">
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      max="1"
                                      className="exercise-effective-sets-input"
                                      placeholder="0"
                                      value={muscleEffectiveSets[muscle] || ''}
                                      onChange={(e) => handleEffectiveSetsChange(muscle, e.target.value)}
                                    />
                                    <div className="exercise-effective-sets-arrows">
                                      <button
                                        type="button"
                                        className="exercise-effective-sets-spinner-button exercise-effective-sets-spinner-up"
                                        disabled={(() => {
                                          const currentValue = parseFloat(muscleEffectiveSets[muscle] || 0);
                                          if (currentValue >= 1.0) return true;
                                          const newValue = parseFloat((currentValue + 0.1).toFixed(1));
                                          if (newValue >= 1.0) {
                                            let hasOtherOne = false;
                                            editingMuscles.forEach(m => {
                                              if (m !== muscle) {
                                                const mValue = parseFloat(muscleEffectiveSets[m] || 0);
                                                if (mValue === 1.0) hasOtherOne = true;
                                              }
                                            });
                                            return hasOtherOne;
                                          }
                                          return false;
                                        })()}
                                        onClick={() => {
                                          const currentValue = parseFloat(muscleEffectiveSets[muscle] || 0);
                                          const newValue = parseFloat((currentValue + 0.1).toFixed(1));
                                          if (newValue >= 1.0) {
                                            let hasOtherOne = false;
                                            editingMuscles.forEach(m => {
                                              if (m !== muscle && parseFloat(muscleEffectiveSets[m] || 0) === 1.0) hasOtherOne = true;
                                            });
                                            if (hasOtherOne) return;
                                          }
                                          handleEffectiveSetsChange(muscle, String(Math.min(1.0, newValue).toFixed(1)));
                                        }}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                          <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)"/>
                                        </svg>
                                      </button>
                                      <button
                                        type="button"
                                        className="exercise-effective-sets-spinner-button exercise-effective-sets-spinner-down"
                                        disabled={parseFloat(muscleEffectiveSets[muscle] || 0) <= 0}
                                        onClick={() => {
                                          const currentValue = parseFloat(muscleEffectiveSets[muscle] || 0);
                                          if (currentValue > 0) handleEffectiveSetsChange(muscle, String(Math.max(0, (currentValue - 0.1).toFixed(1))));
                                        }}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                          <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {editingMuscles.size === 0 && (
                                <div className="exercise-no-muscles-selected">
                                  <p>Haz clic en el cuerpo para seleccionar músculos</p>
                                </div>
                              )}
                              </>
                            ) : (
                              <>
                              {selectedExercise?.data?.muscle_activation && Object.keys(selectedExercise.data.muscle_activation).length > 0 ? (
                                Object.keys(selectedExercise.data.muscle_activation).sort().map(muscle => {
                                  const dbValue = selectedExercise.data.muscle_activation[muscle];
                                  const displayValue = dbValue != null ? (dbValue / 100).toFixed(1) : '—';
                                  return (
                                    <div key={muscle} className="exercise-effective-sets-item exercise-effective-sets-item-readonly">
                                      <span className="exercise-effective-sets-muscle-name">
                                        {MUSCLE_DISPLAY_NAMES[muscle] || muscle}
                                      </span>
                                      <span className="exercise-effective-sets-value-readonly">{displayValue}</span>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="exercise-no-muscles-selected">
                                  <p>No hay series efectivas definidas. Haz clic en &quot;Músculos&quot; y luego en &quot;Editar&quot; para configurarlas.</p>
                                </div>
                              )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="exercise-modal-right">
                        <div className="exercise-tab-header">
                          <div className="exercise-tab-indicator-container">
                            <div
                              className="exercise-tab-indicator"
                              style={{
                                transform: exerciseViewMode === 'video' ? 'translateX(0)' : 'translateX(calc(100% + 2px))',
                              }}
                            />
                          </div>
                          <button
                            className={`exercise-tab-button ${exerciseViewMode === 'video' ? 'exercise-tab-button-active' : ''}`}
                            onClick={() => setExerciseViewMode('video')}
                          >
                            Video
                          </button>
                          <button
                            className={`exercise-tab-button ${exerciseViewMode === 'muscles' ? 'exercise-tab-button-active' : ''}`}
                            onClick={() => setExerciseViewMode('muscles')}
                          >
                            Músculos
                          </button>
                        </div>

                        <div className={`exercise-modal-right-content ${exerciseViewMode === 'video' ? 'exercise-modal-right-content-video' : ''}`}>
                          {exerciseViewMode === 'video' ? (
                            <div className="exercise-video-view">
                              {selectedExercise?.data?.video_url || selectedExercise?.data?.video ? (
                                <div className="exercise-video-container">
                                  <video
                                    className="exercise-video-player"
                                    src={selectedExercise.data.video_url || selectedExercise.data.video}
                                    controls={!isVideoEditMode}
                                    style={{ pointerEvents: isVideoEditMode ? 'none' : 'auto' }}
                                    onPlay={() => setIsVideoPlaying(true)}
                                    onPause={() => setIsVideoPlaying(false)}
                                    onEnded={() => setIsVideoPlaying(false)}
                                  />
                                  {!isVideoEditMode && !isVideoPlaying ? (
                                    <div className="exercise-video-actions-overlay">
                                      <button
                                        className="exercise-video-action-pill"
                                        onClick={() => setIsVideoEditMode(true)}
                                        disabled={isUploadingVideo}
                                      >
                                        <span className="exercise-video-action-text">Editar</span>
                                      </button>
                                    </div>
                                  ) : !isVideoEditMode ? null : (
                                    <div className="exercise-video-edit-overlay">
                                      <div className="exercise-video-edit-buttons">
                                        <div className="exercise-video-edit-row">
                                          <div className="exercise-video-action-group">
                                            <label className="exercise-video-action-pill">
                                              <input
                                                type="file"
                                                accept="video/*"
                                                onChange={handleVideoUpload}
                                                disabled={isUploadingVideo}
                                                style={{ display: 'none' }}
                                              />
                                              <span className="exercise-video-action-text">
                                                {isUploadingVideo ? 'Subiendo...' : 'Cambiar'}
                                              </span>
                                            </label>
                                            {isUploadingVideo && (
                                              <div className="exercise-video-progress">
                                                <div className="exercise-video-progress-bar">
                                                  <div className="exercise-video-progress-fill" style={{ width: `${videoUploadProgress}%` }} />
                                                </div>
                                                <span className="exercise-video-progress-text">{videoUploadProgress}%</span>
                                              </div>
                                            )}
                                          </div>
                                          <button
                                            className="exercise-video-action-pill exercise-video-delete-pill"
                                            onClick={handleVideoDelete}
                                            disabled={isUploadingVideo}
                                          >
                                            <span className="exercise-video-action-text">Eliminar</span>
                                          </button>
                                        </div>
                                        <button
                                          className="exercise-video-action-pill exercise-video-save-pill"
                                          onClick={() => setIsVideoEditMode(false)}
                                          disabled={isUploadingVideo}
                                        >
                                          <span className="exercise-video-action-text">Guardar</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="exercise-no-video">
                                  <p>No hay video disponible para este ejercicio</p>
                                  <div className="exercise-video-upload-group">
                                    <label className="exercise-video-upload-button">
                                      <input
                                        type="file"
                                        accept="video/*"
                                        onChange={handleVideoUpload}
                                        disabled={isUploadingVideo}
                                        style={{ display: 'none' }}
                                      />
                                      {isUploadingVideo ? 'Subiendo...' : 'Subir Video'}
                                    </label>
                                    {isUploadingVideo && (
                                      <div className="exercise-video-progress">
                                        <div className="exercise-video-progress-bar">
                                          <div className="exercise-video-progress-fill" style={{ width: `${videoUploadProgress}%` }} />
                                        </div>
                                        <span className="exercise-video-progress-text">{videoUploadProgress}%</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="exercise-muscles-view">
                              {!isMuscleEditMode ? (
                                <>
                                  {selectedExercise?.data?.muscle_activation ? (
                                    <>
                                      <div className="exercise-muscle-silhouette-wrapper">
                                        <MuscleSilhouetteSVG
                                          selectedMuscles={new Set(Object.keys(selectedExercise.data.muscle_activation))}
                                          onMuscleClick={() => {}}
                                        />
                                      </div>
                                      <div className="exercise-muscles-labels-wrapper">
                                        <div
                                          className="exercise-muscles-labels-container"
                                          ref={muscleLabelsContainerRef}
                                          onScroll={(e) => {
                                            const el = e.target;
                                            if (el) setMuscleLabelsScrollProgress({ scrollLeft: el.scrollLeft || 0, scrollWidth: el.scrollWidth || 0, clientWidth: el.clientWidth || 0 });
                                          }}
                                        >
                                          <div className="exercise-muscles-labels-scroll">
                                            {Object.keys(selectedExercise.data.muscle_activation).sort().map(muscle => (
                                              <div key={muscle} className="exercise-muscle-label-item">
                                                <span className="exercise-muscle-label-name">{MUSCLE_DISPLAY_NAMES[muscle] || muscle}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                        {muscleLabelsScrollProgress.scrollWidth > muscleLabelsScrollProgress.clientWidth && muscleLabelsScrollProgress.scrollWidth > 0 && (
                                          <div className="exercise-muscles-labels-scroll-indicator">
                                            <div
                                              className="exercise-muscles-labels-scroll-indicator-bar"
                                              style={{
                                                width: `${Math.min(100, (muscleLabelsScrollProgress.clientWidth / muscleLabelsScrollProgress.scrollWidth) * 100)}%`,
                                                left: `${(muscleLabelsScrollProgress.scrollWidth - muscleLabelsScrollProgress.clientWidth) > 0
                                                  ? (muscleLabelsScrollProgress.scrollLeft / (muscleLabelsScrollProgress.scrollWidth - muscleLabelsScrollProgress.clientWidth)) * (100 - Math.min(100, (muscleLabelsScrollProgress.clientWidth / muscleLabelsScrollProgress.scrollWidth) * 100))
                                                  : 0}%`
                                              }}
                                            />
                                          </div>
                                        )}
                                      </div>
                                      <div className="exercise-muscles-actions-overlay">
                                        <button className="exercise-muscle-edit-button" onClick={handleStartMuscleEdit}>
                                          <span className="exercise-video-action-text">Editar</span>
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="exercise-no-muscles">
                                      <p>No hay información de músculos disponible</p>
                                      <div className="exercise-muscles-actions-overlay">
                                        <button className="exercise-muscle-edit-button" onClick={handleStartMuscleEdit}>
                                          <span className="exercise-video-action-text">Editar</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="exercise-muscles-view-edit-row">
                                    <div className="exercise-muscles-view-left">
                                      <div className="exercise-muscle-silhouette-wrapper">
                                        <MuscleSilhouetteSVG
                                          selectedMuscles={editingMuscles}
                                          onMuscleClick={handleToggleEditingMuscle}
                                        />
                                      </div>
                                      <div className="exercise-muscles-labels-wrapper">
                                        <div
                                          className="exercise-muscles-labels-container"
                                          ref={muscleLabelsContainerRef}
                                          onScroll={(e) => {
                                            const el = e.target;
                                            if (el) setMuscleLabelsScrollProgress({ scrollLeft: el.scrollLeft || 0, scrollWidth: el.scrollWidth || 0, clientWidth: el.clientWidth || 0 });
                                          }}
                                        >
                                          <div className="exercise-muscles-labels-scroll">
                                            {Array.from(editingMuscles).sort().map(muscle => (
                                              <div key={muscle} className="exercise-muscle-label-item">
                                                <span className="exercise-muscle-label-name">{MUSCLE_DISPLAY_NAMES[muscle] || muscle}</span>
                                                <button
                                                  type="button"
                                                  className="exercise-muscle-remove-button"
                                                  onClick={() => handleToggleEditingMuscle(muscle)}
                                                  aria-label="Eliminar músculo"
                                                >
                                                  ×
                                                </button>
                                              </div>
                                            ))}
                                            {editingMuscles.size === 0 && (
                                              <div className="exercise-no-muscles-selected">
                                                <p>Haz clic en el cuerpo para seleccionar músculos</p>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        {muscleLabelsScrollProgress.scrollWidth > muscleLabelsScrollProgress.clientWidth && muscleLabelsScrollProgress.scrollWidth > 0 && (() => {
                                          const scrollableWidth = muscleLabelsScrollProgress.scrollWidth - muscleLabelsScrollProgress.clientWidth;
                                          const barWidth = Math.min(100, (muscleLabelsScrollProgress.clientWidth / muscleLabelsScrollProgress.scrollWidth) * 100);
                                          const maxLeft = 100 - barWidth;
                                          const leftPosition = scrollableWidth > 0 ? Math.max(0, Math.min(maxLeft, (muscleLabelsScrollProgress.scrollLeft / scrollableWidth) * maxLeft)) : 0;
                                          return (
                                            <div className="exercise-muscles-labels-scroll-indicator">
                                              <div className="exercise-muscles-labels-scroll-indicator-bar" style={{ width: `${barWidth}%`, left: `${leftPosition}%` }} />
                                            </div>
                                          );
                                        })()}
                                      </div>
                                      <div className="exercise-muscles-actions-overlay">
                                        <button className="exercise-video-action-pill exercise-video-cancel-pill" onClick={handleCancelMuscleEdit}>
                                          <span className="exercise-video-action-text">Cancelar</span>
                                        </button>
                                        <button className="exercise-video-action-pill exercise-video-save-pill" onClick={handleSaveMuscles} disabled={isSavingMuscles}>
                                          <span className="exercise-video-action-text">{isSavingMuscles ? 'Guardando...' : 'Guardar'}</span>
                                        </button>
                                      </div>
                                    </div>
                                    <div className="exercise-presets-in-muscles-card">
                                      <label className="exercise-section-title">Predeterminados</label>
                                      <div className="exercise-presets-scroll-vertical">
                                        {Object.keys(EXERCISE_PRESETS).map(presetKey => {
                                          const preset = EXERCISE_PRESETS[presetKey];
                                          return (
                                            <button
                                              key={presetKey}
                                              type="button"
                                              className="exercise-preset-item exercise-preset-item-vertical"
                                              onClick={() => handleApplyPreset(presetKey)}
                                            >
                                              <span className="exercise-preset-name">{preset.name}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filter Modal - same structure as PWA WorkoutExecutionScreen filter modal */}
      <Modal
        isOpen={isFilterModalOpen}
        onClose={handleCloseFilterModal}
        title="Filtrar Ejercicios"
        containerClassName="filter-modal-modal"
      >
        <div className="filter-modal-container">
          <div className="filter-modal-content">
            <div className="filter-modal-body">
              {/* Left: Muscle silhouette (same height as the two right cards combined) */}
              <div className="filter-modal-column filter-muscles-column">
                <div className="filter-muscle-silhouette-container">
                  <MuscleSilhouetteSVG
                    selectedMuscles={tempSelectedMuscles}
                    onMuscleClick={handleToggleMuscle}
                  />
                </div>
              </div>

              {/* Right: Two cards for selected músculos and implementos */}
              <div className="filter-modal-column filter-cards-column">
                {/* Músculos card - selected values, fixed size and scrollable */}
                <div className="filter-card filter-card-muscles-selected">
                  <h3 className="filter-card-title">Músculos seleccionados</h3>
                  <div className="filter-card-scroll">
                    {tempSelectedMuscles.size > 0 ? (
                      Array.from(tempSelectedMuscles).sort().map(muscle => (
                        <button
                          key={muscle}
                          type="button"
                          className="filter-chip"
                          onClick={() => handleToggleMuscle(muscle)}
                        >
                          <span className="filter-chip-text">{MUSCLE_DISPLAY_NAMES[muscle] || muscle}</span>
                          <span className="filter-chip-remove" aria-hidden>×</span>
                        </button>
                      ))
                    ) : (
                      <p className="filter-card-empty">Ningún músculo seleccionado</p>
                    )}
                  </div>
                </div>

                {/* Implementos card - selectable chips, scrollable */}
                <div className="filter-card">
                  <h3 className="filter-card-title">Implementos</h3>
                  <div className="filter-card-scroll">
                    {allUniqueImplements.length > 0 ? (
                      allUniqueImplements.map(implement => {
                        const isSelected = tempFilterSelectedImplements.has(implement);
                        return (
                          <button
                            key={implement}
                            type="button"
                            className={`filter-implement-chip ${isSelected ? 'filter-implement-chip-selected' : ''}`}
                            onClick={() => handleToggleImplementFilter(implement)}
                          >
                            <span className={isSelected ? 'filter-implement-chip-text-selected' : 'filter-implement-chip-text'}>
                              {implement}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="filter-card-empty">No hay implementos en la biblioteca</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="filter-modal-actions">
            <button
              type="button"
              className="filter-clear-button"
              onClick={handleClearFilter}
              disabled={tempSelectedMuscles.size === 0 && tempFilterSelectedImplements.size === 0}
            >
              Limpiar
            </button>
            <button
              type="button"
              className="filter-apply-button"
              onClick={handleApplyFilter}
            >
              Aplicar
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Exercise Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        title={exerciseToDelete?.name || 'Eliminar ejercicio'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre del ejercicio:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={exerciseToDelete?.name || 'Nombre del ejercicio'}
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${deleteConfirmation.trim() !== exerciseToDelete?.name ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDelete}
              disabled={deleteConfirmation.trim() !== exerciseToDelete?.name || isDeleting}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción es irreversible. El ejercicio se eliminará permanentemente de esta biblioteca.
          </p>
        </div>
      </Modal>

      {/* Effective Sets Info Modal */}
      <Modal
        isOpen={isEffectiveSetsInfoModalOpen}
        onClose={() => setIsEffectiveSetsInfoModalOpen(false)}
        title="Series Efectivas por Grupo Muscular"
      >
        <div className="exercise-effective-sets-info-modal-content">
          <p>
            Cada ejercicio tiene un músculo principal (mover primario) y algunos músculos secundarios (movers secundarios).
          </p>
          <p>
            El objetivo de esta herramienta es poder registrar el volumen correcto para todos los músculos involucrados en el ejercicio.
          </p>
          <p>
            Por ejemplo, el press de banca es principalmente un ejercicio de pecho, pero también requiere fuerza de deltoides frontales y tríceps. Por lo tanto, podría contribuir con 1 serie para pectorales, 0.3 para tríceps y 0.2 para deltoides frontales.
          </p>
        </div>
      </Modal>

      {/* Add Exercise Modal */}
      <Modal
        isOpen={isAddExerciseModalOpen}
        onClose={handleCloseAddExerciseModal}
        title="Nuevo ejercicio"
      >
        <div className="modal-library-content">
          <Input
            placeholder="Nombre del ejercicio"
            value={newExerciseName}
            onChange={(e) => setNewExerciseName(e.target.value)}
            type="text"
            light={true}
          />
          <p className="exercise-name-warning-text">
            ⚠️ No podrás cambiar este nombre más tarde. Asegúrate de elegir el nombre correcto.
          </p>
          <div className="modal-actions">
            <Button
              title="Crear"
              onClick={handleCreateExercise}
              disabled={!newExerciseName.trim() || isCreatingExercise}
              loading={isCreatingExercise}
            />
          </div>
        </div>
      </Modal>

      {/* Icon Selector Modal */}
      <Modal
        isOpen={isIconSelectorModalOpen}
        onClose={() => setIsIconSelectorModalOpen(false)}
        title="Seleccionar Ícono"
      >
        <div className="icon-selector-modal-content">
          <div className="icon-selector-grid">
            {LIBRARY_ICONS.map((icon) => (
              <button
                key={icon.id}
                className={`icon-selector-item ${(library?.icon === icon.id) ? 'icon-selector-item-selected' : ''}`}
                onClick={() => handleIconSelect(icon.id)}
                title={icon.name}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d={icon.path} fill="currentColor"/>
                </svg>
              </button>
            ))}
          </div>
          <div className="icon-selector-actions">
            <Button
              title="Cerrar"
              onClick={() => setIsIconSelectorModalOpen(false)}
            />
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default LibraryExercisesScreen;

