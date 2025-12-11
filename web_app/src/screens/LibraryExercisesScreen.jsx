import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import MuscleSilhouetteSVG from '../components/MuscleSilhouetteSVG';
import libraryService from '../services/libraryService';
import { firestore } from '../config/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
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
import './LibraryExercisesScreen.css';

const LibraryExercisesScreen = () => {
  const { libraryId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [library, setLibrary] = useState(null);
  const [allExercises, setAllExercises] = useState([]); // Store all exercises
  const [exercises, setExercises] = useState([]); // Filtered exercises
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [selectedMuscles, setSelectedMuscles] = useState(new Set()); // Applied filter
  const [tempSelectedMuscles, setTempSelectedMuscles] = useState(new Set()); // Temporary selection in modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [exerciseToDelete, setExerciseToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [exerciseViewMode, setExerciseViewMode] = useState('video'); // 'video' or 'muscles'
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isVideoEditMode, setIsVideoEditMode] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMuscleEditMode, setIsMuscleEditMode] = useState(false);
  const [editingMuscles, setEditingMuscles] = useState(new Set());
  const [muscleEffectiveSets, setMuscleEffectiveSets] = useState({});
  const [isEffectiveSetsInfoModalOpen, setIsEffectiveSetsInfoModalOpen] = useState(false);
  const [muscleLabelsScrollProgress, setMuscleLabelsScrollProgress] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  const [selectedImplements, setSelectedImplements] = useState(new Set());
  const [isImplementsEditMode, setIsImplementsEditMode] = useState(false);
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

        // Find the newly created exercise and open it
        const newExercise = exercisesList.find(ex => ex.name === newExerciseName.trim());
        if (newExercise) {
          setSelectedExercise(newExercise);
          setIsExerciseModalOpen(true);
          setExerciseViewMode('video'); // Default to video view
          setIsVideoPlaying(false); // Reset video playing state
          setIsMuscleEditMode(false); // Reset muscle edit mode
          setEditingMuscles(new Set()); // Reset editing muscles
          setMuscleEffectiveSets({}); // Reset effective sets
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
    // Initialize temp selection with current applied filter
    setTempSelectedMuscles(new Set(selectedMuscles));
    setIsFilterModalOpen(true);
  };

  const handleCloseFilterModal = () => {
    // Reset temp selection when closing without applying
    setTempSelectedMuscles(new Set(selectedMuscles));
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
  };

  const handleApplyFilter = () => {
    // Apply the temporary selection to the actual filter
    setSelectedMuscles(new Set(tempSelectedMuscles));
    setIsFilterModalOpen(false);
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
      
      // Close modal and exit edit mode if no exercises left
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
      setIsExerciseModalOpen(true);
      setExerciseViewMode('video'); // Default to video view
      setIsVideoPlaying(false); // Reset video playing state
      setIsMuscleEditMode(false); // Reset muscle edit mode
      setEditingMuscles(new Set()); // Reset editing muscles
      setMuscleEffectiveSets({}); // Reset effective sets
      setIsImplementsEditMode(false); // Reset implements edit mode
      // Load existing implements
      const existingImplements = exercise.data?.implements || [];
      setSelectedImplements(new Set(existingImplements));
    }
  };

  const handleCloseExerciseModal = () => {
    setIsExerciseModalOpen(false);
    setSelectedExercise(null);
    setIsVideoEditMode(false);
    setIsVideoPlaying(false);
    setIsMuscleEditMode(false);
    setEditingMuscles(new Set());
    setMuscleEffectiveSets({});
    setIsImplementsEditMode(false);
    setSelectedImplements(new Set());
    // Reset scroll progress when closing modal
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
    }
  };

  const handleSaveImplements = async () => {
    if (!selectedExercise || !libraryId) {
      return;
    }

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

  // Filter exercises based on selected muscles
  useEffect(() => {
    if (selectedMuscles.size === 0) {
      setExercises(allExercises);
      return;
    }

    const filtered = allExercises.filter(exercise => {
      if (!exercise.data?.muscle_activation) return false;
      const exerciseMuscles = Object.keys(exercise.data.muscle_activation);
      // Check if any selected muscle is in the exercise's muscle_activation
      return Array.from(selectedMuscles).some(muscle => exerciseMuscles.includes(muscle));
    });
    
    setExercises(filtered);
  }, [selectedMuscles, allExercises]);

  if (loading) {
    return (
      <DashboardLayout 
        screenName={library?.title || 'Biblioteca'}
        showBackButton={true}
        backPath="/libraries"
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
        screenName="Biblioteca"
        showBackButton={true}
        backPath="/libraries"
      >
        <div className="library-exercises-content">
          <div className="library-exercises-error">
            <p>{error || 'Biblioteca no encontrada'}</p>
            <button onClick={() => navigate('/libraries')} className="back-button">
              Volver a Bibliotecas
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      screenName={library.title}
      showBackButton={true}
      backPath="/libraries"
    >
      <div className="library-exercises-content">
        <div className="library-exercises-legend">
          <div className="library-exercises-legend-item">
            <div className="exercise-incomplete-icon-small">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="library-exercises-legend-text">Ejercicio incompleto</span>
          </div>
        </div>
        <div className="library-exercises-actions">
          <button
            className={`library-action-pill ${isEditMode ? 'library-action-pill-disabled' : ''}`}
            onClick={handleAddExercise}
            disabled={isEditMode}
          >
            <span className="library-action-icon">+</span>
          </button>
          <button
            className={`library-action-pill ${isEditMode ? 'library-action-pill-disabled' : ''}`}
            onClick={handleFilter}
            disabled={isEditMode}
          >
            <span className="library-action-text">Filtrar</span>
          </button>
          <button
            className="library-action-pill"
            onClick={handleToggleEditMode}
          >
            <span className="library-action-text">{isEditMode ? 'Guardar' : 'Editar'}</span>
          </button>
        </div>

        {exercises.length === 0 ? (
          <div className="library-exercises-empty">
            <p>No hay ejercicios en esta biblioteca. Agrega un ejercicio para comenzar.</p>
          </div>
        ) : (
          <div className="library-exercises-list">
            {exercises.map((exercise, index) => (
              <div
                key={exercise.name || index}
                className={`exercise-card ${isEditMode ? 'exercise-card-edit-mode' : ''}`}
                onClick={() => handleExerciseClick(exercise)}
                style={{ cursor: isEditMode ? 'default' : 'pointer' }}
              >
                {isEditMode && (
                  <button
                    className="exercise-delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteExercise(exercise);
                    }}
                  >
                    <span className="exercise-delete-icon">−</span>
                  </button>
                )}
                {!isEditMode && isExerciseIncomplete(exercise) && (
                  <div className="exercise-incomplete-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18.9199 17.1583L19.0478 15.5593C19.08 15.1564 19.2388 14.7743 19.5009 14.4667L20.541 13.2449C21.1527 12.527 21.1526 11.4716 20.5409 10.7538L19.5008 9.53271C19.2387 9.2251 19.0796 8.84259 19.0475 8.43972L18.9204 6.84093C18.8453 5.9008 18.0986 5.15403 17.1585 5.07901L15.5594 4.95108C15.1566 4.91893 14.7746 4.76143 14.467 4.49929L13.246 3.45879C12.5282 2.84707 11.4718 2.84707 10.754 3.45879L9.53285 4.49883C9.22525 4.76097 8.84274 4.91981 8.43987 4.95196L6.84077 5.07957M18.9208 17.159C18.8458 18.0991 18.0993 18.8457 17.1591 18.9207M17.1586 18.9197L15.5595 19.0473C15.1567 19.0795 14.7744 19.2376 14.4667 19.4997L13.246 20.5407C12.5282 21.1525 11.4717 21.1525 10.7539 20.5408L9.53316 19.5008C9.22555 19.2386 8.84325 19.0798 8.44038 19.0477L6.84077 18.9197M6.84173 18.9207C5.90159 18.8457 5.15505 18.0991 5.08003 17.159L4.9521 15.5594C4.91995 15.1565 4.76111 14.7742 4.49898 14.4666L3.45894 13.2459C2.84721 12.5281 2.84693 11.4715 3.45865 10.7537L4.49963 9.53301C4.76176 9.22541 4.91908 8.84311 4.95122 8.44024L5.07915 6.84063M5.08003 6.84158C5.15505 5.90145 5.9016 5.15491 6.84173 5.07989" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
                <div className="exercise-card-header">
                  <h3 className="exercise-card-title">{exercise.name}</h3>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter Modal */}
      <Modal
        isOpen={isFilterModalOpen}
        onClose={handleCloseFilterModal}
        title="Filtrar por Músculos"
      >
        <div className="filter-modal-content">
          <div className="filter-modal-body">
            <div className="filter-muscle-silhouette-container">
              <MuscleSilhouetteSVG
                selectedMuscles={tempSelectedMuscles}
                onMuscleClick={handleToggleMuscle}
              />
            </div>
            <div className="filter-selected-muscles-list">
              <ul className="filter-muscles-list">
                {Array.from(tempSelectedMuscles).sort().map(muscle => (
                  <li key={muscle} className="filter-muscle-item">
                    <span className="filter-muscle-name">{MUSCLE_DISPLAY_NAMES[muscle] || muscle}</span>
                    <button
                      className="filter-muscle-remove"
                      onClick={() => handleToggleMuscle(muscle)}
                      aria-label="Eliminar músculo"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="filter-modal-actions">
            <button
              className="filter-clear-button"
              onClick={handleClearFilter}
              disabled={tempSelectedMuscles.size === 0}
            >
              Limpiar
            </button>
            <button
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

      {/* Exercise Detail Modal */}
      <Modal
        isOpen={isExerciseModalOpen}
        onClose={handleCloseExerciseModal}
        title={selectedExercise?.name || 'Ejercicio'}
      >
        <div className="exercise-modal-content">
          <div className="exercise-modal-body">
            {/* Left Side - Inputs */}
            <div className="exercise-modal-left">
              {/* Implements Selection Card */}
              <div className="exercise-implements-card">
                <div className="exercise-implements-header">
                  <label className="exercise-section-title">Implementos</label>
                </div>
                {!isImplementsEditMode ? (
                  <div className="exercise-implements-actions-overlay">
                    <button
                      className="exercise-video-action-pill"
                      onClick={() => {
                        // Ensure we have the latest implements from the exercise data
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
                    <div className="exercise-implements-edit-buttons">
                      <button
                        className="exercise-video-action-pill exercise-video-cancel-pill"
                        onClick={() => {
                          // Reset to original values
                          const existingImplements = selectedExercise?.data?.implements || [];
                          setSelectedImplements(new Set(existingImplements));
                          setIsImplementsEditMode(false);
                        }}
                      >
                        <span className="exercise-video-action-text">Cancelar</span>
                      </button>
                      <button
                        className="exercise-video-action-pill exercise-video-save-pill"
                        onClick={handleSaveImplements}
                      >
                        <span className="exercise-video-action-text">Guardar</span>
                      </button>
                    </div>
                  </div>
                )}
                <div className="exercise-implements-content">
                  {isImplementsEditMode ? (
                    <div className="exercise-implements-grid">
                      {IMPLEMENTS_LIST.map(implement => (
                        <button
                          key={implement}
                          type="button"
                          className={`exercise-implement-chip ${selectedImplements.has(implement) ? 'exercise-implement-chip-selected' : ''}`}
                          onClick={() => handleToggleImplement(implement)}
                        >
                          {implement}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="exercise-implements-display">
                      {selectedImplements.size > 0 ? (
                        <div className="exercise-implements-list">
                          {Array.from(selectedImplements).map(implement => (
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
              {isMuscleEditMode && (
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
                                
                                // Check if trying to reach 1.0 and another muscle is already 1.0
                                const newValue = parseFloat((currentValue + 0.1).toFixed(1));
                                if (newValue >= 1.0) {
                                  let hasOtherOne = false;
                                  editingMuscles.forEach(m => {
                                    if (m !== muscle) {
                                      const mValue = parseFloat(muscleEffectiveSets[m] || 0);
                                      if (mValue === 1.0) {
                                        hasOtherOne = true;
                                      }
                                    }
                                  });
                                  return hasOtherOne;
                                }
                                return false;
                              })()}
                              onClick={() => {
                                const currentValue = parseFloat(muscleEffectiveSets[muscle] || 0);
                                
                                // Calculate new value
                                const newValue = parseFloat((currentValue + 0.1).toFixed(1));
                                
                                // If trying to set to 1.0, check if another muscle is already 1.0
                                if (newValue >= 1.0) {
                                  let hasOtherOne = false;
                                  editingMuscles.forEach(m => {
                                    if (m !== muscle) {
                                      const mValue = parseFloat(muscleEffectiveSets[m] || 0);
                                      if (mValue === 1.0) {
                                        hasOtherOne = true;
                                      }
                                    }
                                  });
                                  
                                  if (hasOtherOne) {
                                    // Can't set to 1.0 if another muscle is already 1.0
                                    return;
                                  }
                                }
                                
                                // Increment by 0.1, cap at 1.0
                                const finalValue = Math.min(1.0, newValue);
                                handleEffectiveSetsChange(muscle, String(finalValue.toFixed(1)));
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)"/>
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="exercise-effective-sets-spinner-button exercise-effective-sets-spinner-down"
                              disabled={(() => {
                                const currentValue = parseFloat(muscleEffectiveSets[muscle] || 0);
                                return currentValue <= 0;
                              })()}
                              onClick={() => {
                                const currentValue = parseFloat(muscleEffectiveSets[muscle] || 0);
                                if (currentValue > 0) {
                                  handleEffectiveSetsChange(muscle, String(Math.max(0, (currentValue - 0.1).toFixed(1))));
                                }
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
                  </div>
                  {/* Presets Section */}
                  <div className="exercise-presets-section">
                    <label className="exercise-section-title">Predeterminados</label>
                    <div className="exercise-presets-wrapper">
                      <div className="exercise-presets-container">
                        <div className="exercise-presets-scroll">
                          {Object.keys(EXERCISE_PRESETS).map(presetKey => {
                            const preset = EXERCISE_PRESETS[presetKey];
                            return (
                              <button
                                key={presetKey}
                                className="exercise-preset-item"
                                onClick={() => handleApplyPreset(presetKey)}
                              >
                                <span className="exercise-preset-name">{preset.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Side - Toggle between Muscles and Video */}
            <div className="exercise-modal-right">
              {/* Tab Indicator Header */}
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

              {/* Content Area */}
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
                              <div 
                                className="exercise-video-progress-fill"
                                style={{ width: `${videoUploadProgress}%` }}
                              />
                            </div>
                            <span className="exercise-video-progress-text">
                              {videoUploadProgress}%
                            </span>
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
                              <div 
                                className="exercise-video-progress-fill"
                                style={{ width: `${videoUploadProgress}%` }}
                              />
                            </div>
                            <span className="exercise-video-progress-text">
                              {videoUploadProgress}%
                            </span>
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
                            onMuscleClick={() => {}} // Read-only
                          />
                        </div>
                            <div className="exercise-muscles-labels-wrapper">
                              <div 
                                className="exercise-muscles-labels-container"
                                ref={muscleLabelsContainerRef}
                                onScroll={(e) => {
                                  const element = e.target;
                                  if (element) {
                                    setMuscleLabelsScrollProgress({
                                      scrollLeft: element.scrollLeft || 0,
                                      scrollWidth: element.scrollWidth || 0,
                                      clientWidth: element.clientWidth || 0
                                    });
                                  }
                                }}
                              >
                          <div className="exercise-muscles-labels-scroll">
                            {Object.keys(selectedExercise.data.muscle_activation).sort().map(muscle => (
                              <div key={muscle} className="exercise-muscle-label-item">
                                <span className="exercise-muscle-label-name">
                                  {MUSCLE_DISPLAY_NAMES[muscle] || muscle}
                                </span>
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
                                      left: `${Math.max(0, Math.min(100 - (muscleLabelsScrollProgress.clientWidth / muscleLabelsScrollProgress.scrollWidth) * 100, 
                                        ((muscleLabelsScrollProgress.scrollWidth - muscleLabelsScrollProgress.clientWidth) > 0 
                                          ? (muscleLabelsScrollProgress.scrollLeft / (muscleLabelsScrollProgress.scrollWidth - muscleLabelsScrollProgress.clientWidth)) * (100 - (muscleLabelsScrollProgress.clientWidth / muscleLabelsScrollProgress.scrollWidth) * 100)
                                          : 0)))}%`
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                            <div className="exercise-muscles-actions-overlay">
                              <button
                                className="exercise-muscle-edit-button"
                                onClick={handleStartMuscleEdit}
                              >
                                <span className="exercise-video-action-text">Editar</span>
                              </button>
                        </div>
                      </>
                    ) : (
                      <div className="exercise-no-muscles">
                        <p>No hay información de músculos disponible</p>
                            <div className="exercise-muscles-actions-overlay">
                              <button
                                className="exercise-muscle-edit-button"
                                onClick={handleStartMuscleEdit}
                              >
                                <span className="exercise-video-action-text">Editar</span>
                              </button>
                            </div>
                      </div>
                    )}
                      </>
                    ) : (
                      <>
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
                              const element = e.target;
                              if (element) {
                                setMuscleLabelsScrollProgress({
                                  scrollLeft: element.scrollLeft || 0,
                                  scrollWidth: element.scrollWidth || 0,
                                  clientWidth: element.clientWidth || 0
                                });
                              }
                            }}
                          >
                            <div className="exercise-muscles-labels-scroll">
                              {Array.from(editingMuscles).sort().map(muscle => (
                                <div key={muscle} className="exercise-muscle-label-item">
                                  <span className="exercise-muscle-label-name">
                                    {MUSCLE_DISPLAY_NAMES[muscle] || muscle}
                                  </span>
                                  <button
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
                            const leftPosition = scrollableWidth > 0 
                              ? Math.max(0, Math.min(maxLeft, (muscleLabelsScrollProgress.scrollLeft / scrollableWidth) * maxLeft))
                              : 0;
                            
                            return (
                              <div className="exercise-muscles-labels-scroll-indicator">
                                <div 
                                  className="exercise-muscles-labels-scroll-indicator-bar"
                                  style={{
                                    width: `${barWidth}%`,
                                    left: `${leftPosition}%`
                                  }}
                                />
                              </div>
                            );
                          })()}
                        </div>
                        <div className="exercise-muscles-actions-overlay">
                          <button
                            className="exercise-video-action-pill exercise-video-cancel-pill"
                            onClick={handleCancelMuscleEdit}
                          >
                            <span className="exercise-video-action-text">Cancelar</span>
                          </button>
                          <button
                            className="exercise-video-action-pill exercise-video-save-pill"
                            onClick={handleSaveMuscles}
                          >
                            <span className="exercise-video-action-text">Guardar</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
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
    </DashboardLayout>
  );
};

export default LibraryExercisesScreen;

