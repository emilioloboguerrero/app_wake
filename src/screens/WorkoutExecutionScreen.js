// ============================================================================
// LAZY LOADING IMPORTS - All services and components loaded on-demand
// ============================================================================
// This prevents blocking operations during module initialization on web
// Following recommendations from WORKOUT_EXECUTION_WEB_FREEZING_FIX.md

import React, { useState, useEffect, useRef, useCallback, useMemo, memo, startTransition, useDeferredValue } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
  Animated,
  Modal,
  Pressable,
  Alert,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';

// Essential hooks and utilities - keep as direct imports (lightweight)
import { useAuth } from '../contexts/AuthContext';
import { useVideo } from '../contexts/VideoContext';
import { isWeb } from '../utils/platform';
import logger from '../utils/logger.js';
import { useFocusEffect } from '@react-navigation/native';

// Gesture handler and video - keep as direct imports (needed for hooks)
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { VideoView, useVideoPlayer } from 'expo-video';

// Firebase - keep as direct imports (lightweight)
import { firestore, auth } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';

// ============================================================================
// LAZY LOADERS - Services (loaded only when needed)
// ============================================================================
const getSessionManager = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading sessionManager...');
  logger.debug(`[TIMING] [CHECKPOINT] Before sessionManager require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/sessionManager').default;
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After sessionManager require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: sessionManager took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] sessionManager failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getSessionService = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading sessionService...');
  logger.debug(`[TIMING] [CHECKPOINT] Before sessionService require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/sessionService').default;
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After sessionService require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: sessionService took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] sessionService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getTutorialManager = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading tutorialManager...');
  logger.debug(`[TIMING] [CHECKPOINT] Before tutorialManager require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/tutorialManager').default;
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After tutorialManager require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: tutorialManager took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] tutorialManager failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getProgramMediaService = () => {
  // FIX: Skip programMediaService on web - FileSystem import blocks on web
  // programMediaService uses expo-file-system/legacy which doesn't work on web
  // This prevents the synchronous require() from blocking the main thread
  if (isWeb) {
    logger.debug('[LAZY] Skipping programMediaService on web (FileSystem not supported)');
    return {
      getExerciseVideoPath: () => null, // Return null to use fallback URL
      getSessionImagePath: () => null,
      getProgramImagePath: () => null,
    };
  }
  
  const startTime = performance.now();
  logger.debug('[LAZY] Loading programMediaService...');
  logger.debug(`[TIMING] [CHECKPOINT] Before programMediaService require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/programMediaService').default;
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After programMediaService require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: programMediaService took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] programMediaService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getVideoCacheService = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading videoCacheService...');
  logger.debug(`[TIMING] [CHECKPOINT] Before videoCacheService require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/videoCacheService').default;
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After videoCacheService require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: videoCacheService took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] videoCacheService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getObjectivesInfoService = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading objectivesInfoService...');
  logger.debug(`[TIMING] [CHECKPOINT] Before objectivesInfoService require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/objectivesInfoService').default;
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After objectivesInfoService require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: objectivesInfoService took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] objectivesInfoService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getExerciseLibraryService = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading exerciseLibraryService...');
  logger.debug(`[TIMING] [CHECKPOINT] Before exerciseLibraryService require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/exerciseLibraryService').default;
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After exerciseLibraryService require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: exerciseLibraryService took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] exerciseLibraryService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getExerciseHistoryService = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading exerciseHistoryService...');
  logger.debug(`[TIMING] [CHECKPOINT] Before exerciseHistoryService require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/exerciseHistoryService').default;
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After exerciseHistoryService require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: exerciseHistoryService took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] exerciseHistoryService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getOneRepMaxService = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading oneRepMaxService...');
  logger.debug(`[TIMING] [CHECKPOINT] Before oneRepMaxService require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/oneRepMaxService').default;
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After oneRepMaxService require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: oneRepMaxService took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] oneRepMaxService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getAppResourcesService = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading appResourcesService...');
  logger.debug(`[TIMING] [CHECKPOINT] Before appResourcesService require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/appResourcesService').default;
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After appResourcesService require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: appResourcesService took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] appResourcesService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getAssetBundleService = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading assetBundleService...');
  logger.debug(`[TIMING] [CHECKPOINT] Before assetBundleService require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/assetBundleService').default;
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After assetBundleService require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: assetBundleService took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] assetBundleService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getMonitoringService = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading monitoringService...');
  logger.debug(`[TIMING] [CHECKPOINT] Before monitoringService require() - ${startTime.toFixed(2)}ms`);
  try {
    const service = require('../services/monitoringService');
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After monitoringService require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: monitoringService took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] monitoringService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

// ============================================================================
// COMPONENTS - Direct imports (like working screens: MainScreen, CourseDetailScreen)
// ============================================================================
// Components are imported directly since they no longer block (Dimensions.get moved inside)
import TutorialOverlay from '../components/TutorialOverlay';
import ExerciseDetailModal from '../components/ExerciseDetailModal';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import MuscleSilhouetteSVG from '../components/MuscleSilhouetteSVG';

// ============================================================================
// ICONS - Direct imports (like working screens)
// ============================================================================
import SvgPlay from '../components/icons/SvgPlay';
import SvgVolumeMax from '../components/icons/SvgVolumeMax';
import SvgVolumeOff from '../components/icons/SvgVolumeOff';
import SvgArrowReload from '../components/icons/SvgArrowReload';
import SvgListChecklist from '../components/icons/SvgListChecklist';
import SvgArrowLeftRight from '../components/icons/SvgArrowLeftRight';
import SvgPlus from '../components/icons/SvgPlus';
import SvgMinus from '../components/icons/SvgMinus';
import SvgInfo from '../components/icons/SvgInfo';
import SvgChartLine from '../components/icons/SvgChartLine';
import SvgDragVertical from '../components/icons/SvgDragVertical';
import SvgSearchMagnifyingGlass from '../components/icons/vectors_fig/Interface/SearchMagnifyingGlass';
import SvgChevronLeft from '../components/icons/vectors_fig/Arrow/ChevronLeft';
import SvgFileRemove from '../components/icons/vectors_fig/File/FileRemove';
import SvgFileUpload from '../components/icons/vectors_fig/File/FileUpload';

// ============================================================================
// LAZY LOADERS - Constants (loaded only when needed)
// ============================================================================
const getMuscleConstants = () => {
  const startTime = performance.now();
  logger.debug('[LAZY] Loading muscle constants...');
  logger.debug(`[TIMING] [CHECKPOINT] Before muscle constants require() - ${startTime.toFixed(2)}ms`);
  try {
    const constants = require('../constants/muscles');
    const duration = performance.now() - startTime;
    logger.debug(`[TIMING] [CHECKPOINT] After muscle constants require() - took ${duration.toFixed(2)}ms`);
    if (duration > 50) {
      logger.warn(`[TIMING] ⚠️ SLOW: muscle constants took ${duration.toFixed(2)}ms (threshold: 50ms)`);
    }
    return constants;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] muscle constants failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

// ============================================================================
// Module-level code - moved inside component to avoid blocking
// ============================================================================
// Dimensions.get('window') moved inside component to prevent blocking

// Component definitions (ExerciseItem, SetInputField, useSetData) will be defined inside WorkoutExecutionScreen
// after lazy loading setup to access lazy-loaded icons

// Memoized Set Input Field Component
const SetInputField = memo(({ field, fieldIndex, fieldName, placeholderText, savedValue, isValid, onChangeText, boxWidth, evenGap, fieldsToShow }) => {
  return (
    <View key={fieldIndex} style={[styles.inputGroup, { 
      width: boxWidth, 
      marginLeft: fieldIndex === 0 ? evenGap : 0,
      marginRight: fieldIndex < fieldsToShow.length - 1 ? evenGap : 0 
    }]}>
      <TextInput
        style={[
          styles.setInput,
          !isValid && styles.setInputError
        ]}
        value={savedValue}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholder={placeholderText}
        placeholderTextColor="rgba(255, 255, 255, 0.5)"
        numberOfLines={1}
      />
    </View>
  );
});

// Stable input handler to prevent re-renders
const createStableInputHandler = (exerciseIndex, setIndex, field, updateSetData) => {
  return (value) => {
    updateSetData(exerciseIndex, setIndex, field, value);
  };
};

// Custom hook for set data management (consolidated state)
const useSetData = (workout) => {
  const [setData, setSetData] = useState({});
  const [setValidationErrors, setSetValidationErrors] = useState({});
  
  // Simple validation function
  const validateInput = (value) => {
    if (!value || value.trim() === '') return true; // Empty is valid
    const numValue = parseFloat(value);
    return !isNaN(numValue) && numValue >= 0; // Must be a positive number
  };
  
  // Initialize set data structure based on measures or database fields
  // CRITICAL: Defer this expensive operation to avoid blocking React commit phase
  useEffect(() => {
    const effectStartTime = performance.now();
    logger.debug(`[EFFECT] [CHECKPOINT] useEffect(useSetData initialization) started - ${effectStartTime.toFixed(2)}ms`);
    if (workout?.exercises && Object.keys(setData).length === 0) {
      // Defer expensive data initialization to avoid blocking paint
      setTimeout(() => {
        const deferredStartTime = performance.now();
      const initialSetData = {};
      workout.exercises.forEach((exercise, exerciseIndex) => {
        if (exercise.sets) {
          exercise.sets.forEach((set, setIndex) => {
            const key = `${exerciseIndex}_${setIndex}`;
            const setFields = {};
            
            if (exercise.measures && exercise.measures.length > 0) {
              exercise.measures.forEach(field => {
                setFields[field] = '';
              });
            } else {
              Object.keys(set).forEach(field => {
                const skipFields = [
                  'id', 'order', 'notes', 'description', 'title', 'name',
                  'created_at', 'updated_at', 'createdAt', 'updatedAt',
                  'type', 'status', 'category', 'tags', 'metadata'
                ];
                
                if (!skipFields.includes(field)) {
                  setFields[field] = '';
                }
              });
            }
            
            initialSetData[key] = setFields;
          });
        }
      });
        
        // Use startTransition to mark this as non-urgent
        startTransition(() => {
      setSetData(initialSetData);
        });
        
        const deferredDuration = performance.now() - deferredStartTime;
        logger.debug(`[EFFECT] [CHECKPOINT] useEffect(useSetData initialization) deferred work completed - took ${deferredDuration.toFixed(2)}ms`);
        if (deferredDuration > 50) {
          logger.warn(`[EFFECT] ⚠️ SLOW: Deferred useSetData initialization took ${deferredDuration.toFixed(2)}ms`);
        }
      }, 0);
    }
    const effectDuration = performance.now() - effectStartTime;
    logger.debug(`[EFFECT] [CHECKPOINT] useEffect(useSetData initialization) completed - took ${effectDuration.toFixed(2)}ms`);
    if (effectDuration > 50) {
      logger.warn(`[EFFECT] ⚠️ SLOW: useEffect(useSetData initialization) took ${effectDuration.toFixed(2)}ms`);
    }
  }, [workout]);
  
  const updateSetData = useCallback((exerciseIndex, setIndex, field, value) => {
    const key = `${exerciseIndex}_${setIndex}`;
    
    // 🔍 VOLUME DEBUG: Log setData updates
    logger.log('🔍 VOLUME DEBUG: updateSetData called:', {
      exerciseIndex,
      setIndex,
      field,
      value,
      key
    });
    
    // Validate the input
    const isValid = validateInput(value);
    
    // Update validation errors
    setSetValidationErrors(prev => ({
      ...prev,
      [`${key}_${field}`]: !isValid
    }));
    
    // Update local state immediately for UI responsiveness
    setSetData(prev => {
      const newSetData = {
        ...prev,
        [key]: {
          ...prev[key],
          [field]: value
        }
      };
      
      // 🔍 VOLUME DEBUG: Log the updated setData
      logger.log('🔍 VOLUME DEBUG: setData updated:', {
        key,
        field,
        value,
        previousData: prev[key],
        newData: newSetData[key],
        allSetDataKeys: Object.keys(newSetData)
      });
      
      return newSetData;
    });
    
    return { isValid, key };
  }, [validateInput]);
  
  const hasValidationErrors = useCallback(() => {
    return Object.values(setValidationErrors).some(error => error === true);
  }, [setValidationErrors]);
  
  return {
    setData,
    setValidationErrors,
    updateSetData,
    hasValidationErrors,
    setSetData // Expose setSetData for addSet/removeSet functions
  };
};

const WorkoutExecutionScreen = ({ navigation, route }) => {
  // ============================================================================
  // COMPREHENSIVE DEBUGGING SYSTEM - Performance & Timing Tracking
  // ============================================================================
  const componentStartTime = performance.now();
  const renderCountRef = useRef(0);
  const componentMountTimeRef = useRef(null);
  
  logger.debug(`[FREEZE DEBUG] 🟢 Component function started at ${componentStartTime.toFixed(2)}ms`);
  logger.debug(`[RENDER] [CHECKPOINT] Component function entry`);
  
  // Track render count
  renderCountRef.current += 1;
  const currentRenderCount = renderCountRef.current;
  logger.debug(`[RENDER] Render #${currentRenderCount}`);
  if (currentRenderCount > 20) {
    logger.error(`[RENDER LOOP] ⚠️ WARNING: Too many renders detected! Render count: ${currentRenderCount}`);
  }
  
  // Use hook for reactive dimensions that update on orientation change
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // Create styles with dimensions
  const stylesStartTime = performance.now();
  logger.debug(`[TIMING] [CHECKPOINT] Before createStyles() - ${stylesStartTime.toFixed(2)}ms`);
  const styles = createStyles(screenWidth, screenHeight);
  const stylesDuration = performance.now() - stylesStartTime;
  logger.debug(`[TIMING] [CHECKPOINT] After createStyles() - took ${stylesDuration.toFixed(2)}ms`);
  if (stylesDuration > 200) {
    logger.warn(`[TIMING] ⚠️ SLOW: createStyles took ${stylesDuration.toFixed(2)}ms (threshold: 200ms)`);
  }
  
  const loadingStylesStartTime = performance.now();
  logger.debug(`[TIMING] [CHECKPOINT] Before createLoadingOverlayStyles() - ${loadingStylesStartTime.toFixed(2)}ms`);
  const loadingOverlayStyles = createLoadingOverlayStyles(screenWidth, screenHeight);
  const loadingStylesDuration = performance.now() - loadingStylesStartTime;
  logger.debug(`[TIMING] [CHECKPOINT] After createLoadingOverlayStyles() - took ${loadingStylesDuration.toFixed(2)}ms`);
  if (loadingStylesDuration > 200) {
    logger.warn(`[TIMING] ⚠️ SLOW: createLoadingOverlayStyles took ${loadingStylesDuration.toFixed(2)}ms (threshold: 200ms)`);
  }
  
  // TEST VERSION 6: Testing remaining services ONE AT A TIME
  // Lazy load services - only load when actually needed
  logger.debug(`[TIMING] [CHECKPOINT] Starting lazy service loading...`);
  const servicesStartTime = performance.now();
  
  // TEST VERSION 6: Load services that worked in v5
  const { getMuscleDisplayName } = getMuscleConstants();
  const sessionManager = getSessionManager();
  const sessionService = getSessionService();
  const objectivesInfoService = getObjectivesInfoService();
  const tutorialManager = getTutorialManager();
  const exerciseLibraryService = getExerciseLibraryService();
  const exerciseHistoryService = getExerciseHistoryService();
  const oneRepMaxService = getOneRepMaxService();
  
  // TEST VERSION 7: programMediaService - FIXED: Skip on web, lazy load on native
  // FIX: getProgramMediaService() now checks isWeb and skips require() on web
  // This prevents the FileSystem import from blocking the main thread on web
  const programMediaServiceRef = useRef(null);
  const getProgramMediaServiceLazy = () => {
    if (!programMediaServiceRef.current) {
      logger.debug('[LAZY] Loading programMediaService on-demand...');
      programMediaServiceRef.current = getProgramMediaService();
    }
    return programMediaServiceRef.current;
  };
  
  // TEST VERSION 6: assetBundleService works - testing monitoringService now (LAST SERVICE)
  const videoCacheService = getVideoCacheService();
  const appResourcesService = getAppResourcesService();
  const assetBundleService = getAssetBundleService();
  const { trackScreenView, trackWorkoutStarted, trackWorkoutCompleted } = getMonitoringService();
  
  // ✅ ALL SERVICES ENABLED - Testing complete for service layer
  
  const servicesDuration = performance.now() - servicesStartTime;
  logger.debug(`[TIMING] [CHECKPOINT] Services loaded - total time: ${servicesDuration.toFixed(2)}ms`);
  if (servicesDuration > 500) {
    logger.warn(`[TIMING] ⚠️ SLOW: Service loading took ${servicesDuration.toFixed(2)}ms (threshold: 500ms)`);
  }
  
  // Components and icons are now imported directly (no longer lazy loaded)
  // This matches the pattern used in working screens (MainScreen, CourseDetailScreen)
  // Components have been fixed to not block (Dimensions.get moved inside)
  
  const routeParamsStartTime = performance.now();
  logger.debug(`[TIMING] [CHECKPOINT] Before route.params extraction - ${routeParamsStartTime.toFixed(2)}ms`);
  const { course, workout: initialWorkout, sessionId } = route.params;
  const routeParamsDuration = performance.now() - routeParamsStartTime;
  logger.debug(`[FREEZE DEBUG] 🟡 Route params extracted - took ${routeParamsDuration.toFixed(2)}ms`);
  
  const useAuthStartTime = performance.now();
  logger.debug(`[TIMING] [CHECKPOINT] Before useAuth() - ${useAuthStartTime.toFixed(2)}ms`);
  const { user } = useAuth();
  const useAuthDuration = performance.now() - useAuthStartTime;
  logger.debug(`[FREEZE DEBUG] 🟡 useAuth completed - took ${useAuthDuration.toFixed(2)}ms`);
  if (useAuthDuration > 50) {
    logger.warn(`[TIMING] ⚠️ SLOW: useAuth took ${useAuthDuration.toFixed(2)}ms (threshold: 50ms)`);
  }
  
  const useVideoStartTime = performance.now();
  logger.debug(`[TIMING] [CHECKPOINT] Before useVideo() - ${useVideoStartTime.toFixed(2)}ms`);
  const { isMuted, toggleMute } = useVideo();
  const useVideoDuration = performance.now() - useVideoStartTime;
  logger.debug(`[FREEZE DEBUG] 🟡 useVideo completed - took ${useVideoDuration.toFixed(2)}ms`);
  if (useVideoDuration > 50) {
    logger.warn(`[TIMING] ⚠️ SLOW: useVideo took ${useVideoDuration.toFixed(2)}ms (threshold: 50ms)`);
  }
  
  // TEST VERSION 13: Restore ExerciseItem component from git history
  const ExerciseItem = memo(({ exercise, exerciseIndex, isExpanded, onToggleExpansion, onOpenSwapModal, onAddSet, onRemoveSet, onSelectSet, setData, currentExerciseIndex, currentSetIndex, renderSetHeaders, renderSetInputFields }) => {
    return (
      <View key={`exercise-${exerciseIndex}-${exercise.id}`} style={styles.exerciseListItem}>
        <TouchableOpacity 
          style={styles.exerciseCard}
          onPress={() => onToggleExpansion(exerciseIndex)}
        >
          <Text style={styles.exerciseNumber}>{exerciseIndex + 1}</Text>
          <View style={styles.exerciseContent}>
            <Text style={styles.exerciseItemTitle}>
              {exercise.name}
            </Text>
          </View>
          <SvgChevronLeft 
            width={20} 
            height={20} 
            stroke="#007AFF" 
            style={[styles.exerciseItemArrow, !isExpanded && styles.arrowRight, isExpanded && styles.arrowDown]}
          />
        </TouchableOpacity>
        
        {/* Set tracking for this exercise - only show if expanded */}
        {isExpanded && (
          <View style={styles.setsContainer}>
            {/* Control Buttons Row */}
            <View style={styles.exerciseControlsRow}>
              {/* Swap Exercise Button */}
              <TouchableOpacity 
                style={styles.swapExerciseButton}
                onPress={() => onOpenSwapModal(exerciseIndex)}
              >
                <Text style={styles.swapExerciseButtonText}>Reemplazar</Text>
                <SvgArrowLeftRight width={16} height={16} color="#ffffff" />
              </TouchableOpacity>
              
              {/* Add/Remove Set Buttons */}
              <View style={styles.setControlButtons}>
                <TouchableOpacity 
                  style={styles.setControlButton}
                  onPress={() => onAddSet(exerciseIndex)}
                >
                  <SvgPlus width={16} height={16} color="#ffffff" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[
                    styles.setControlButton,
                    exercise.sets.length <= 1 && styles.setControlButtonDisabled
                  ]}
                  onPress={() => onRemoveSet(exerciseIndex)}
                  disabled={exercise.sets.length <= 1}
                >
                  <SvgMinus width={16} height={16} color={exercise.sets.length <= 1 ? "#666666" : "#ffffff"} />
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Headers row */}
            <View style={styles.setTrackingRow}>
              <View style={styles.setNumberSpace} />
              <View style={styles.setInputsContainer}>
                {exercise.sets?.[0] && renderSetHeaders(exercise.sets[0])}
              </View>
            </View>
            
            {/* Data rows */}
            {exercise.sets?.map((set, setIndex) => {
              const key = `${exerciseIndex}_${setIndex}`;
              const currentSetData = setData[key] || {};
              const isCurrentSet = exerciseIndex === currentExerciseIndex && setIndex === currentSetIndex;
              
              return (
                <View key={`set-${exerciseIndex}-${setIndex}-${set.id || setIndex}`} style={styles.setTrackingRow}>
                  {isCurrentSet && <View style={styles.currentSetOverlay} />}
                  <TouchableOpacity 
                    style={styles.setNumberContainer}
                    onPress={() => onSelectSet(exerciseIndex, setIndex)}
                  >
                    <Text style={styles.setNumber}>{setIndex + 1}</Text>
                  </TouchableOpacity>
                  <View style={styles.setInputsContainer}>
                    {renderSetInputFields(exerciseIndex, setIndex, set, currentSetData)}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  });
  // Debug: Log the workout object received
  logger.log('🔍 WorkoutExecutionScreen: Received workout object:', {
    hasWorkout: !!initialWorkout,
    hasExercises: !!initialWorkout?.exercises,
    exercisesLength: initialWorkout?.exercises?.length,
    firstExerciseHasMuscleActivation: !!initialWorkout?.exercises?.[0]?.muscle_activation,
    firstExerciseMuscleActivationKeys: initialWorkout?.exercises?.[0]?.muscle_activation
      ? Object.keys(initialWorkout.exercises[0].muscle_activation)
      : 'none',
    firstExerciseStructure: initialWorkout?.exercises?.[0]
      ? Object.keys(initialWorkout.exercises[0])
      : 'no exercises',
    firstExerciseImplements: initialWorkout?.exercises?.[0]?.implements ?? null,
    firstExerciseHasImplements: Array.isArray(initialWorkout?.exercises?.[0]?.implements)
      ? initialWorkout.exercises[0].implements.length
      : 'not-array-or-missing',
  });
  
  // Local workout state that can be modified
  logger.debug(`[TIMING] [CHECKPOINT] Starting useState declarations...`);
  const useStateBatchStartTime = performance.now();
  
  const [workout, setWorkout] = useState(initialWorkout);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [currentView, setCurrentView] = useState(0); // 0 = exercise detail, 1 = exercise list
  const [expandedExercises, setExpandedExercises] = useState({}); // Track which exercises are expanded
  const [isMenuVisible, setIsMenuVisible] = useState(false); // Menu visibility state
  const [isSetInputVisible, setIsSetInputVisible] = useState(false); // Set input popup visibility
  const [currentSetInputData, setCurrentSetInputData] = useState({}); // Current set input data
  const [isSwapModalVisible, setIsSwapModalVisible] = useState(false); // Swap exercise modal visibility
  const [currentSwapExerciseIndex, setCurrentSwapExerciseIndex] = useState(null); // Which exercise is being swapped
  const [alternativeExercises, setAlternativeExercises] = useState([]); // Loaded alternative exercises
  const [loadingAlternatives, setLoadingAlternatives] = useState(false); // Loading state for alternatives
  const [creatorName, setCreatorName] = useState(''); // Creator name for suggestions
  const [oneRepMaxEstimates, setOneRepMaxEstimates] = useState({}); // 1RM estimates for weight suggestions
  
  const useStateBatchDuration = performance.now() - useStateBatchStartTime;
  logger.debug(`[TIMING] [CHECKPOINT] First batch of useState completed - took ${useStateBatchDuration.toFixed(2)}ms`);
  if (useStateBatchDuration > 50) {
    logger.warn(`[TIMING] ⚠️ SLOW: First useState batch took ${useStateBatchDuration.toFixed(2)}ms (threshold: 50ms)`);
  }
  
  // Edit modal system state
  // Edit mode state - integrated into main screen
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingExercises, setEditingExercises] = useState([]); // Local copy for editing
  const [isAddExerciseModalVisible, setIsAddExerciseModalVisible] = useState(false);
  const [availableExercises, setAvailableExercises] = useState([]);
  const [loadingAvailableExercises, setLoadingAvailableExercises] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter state
  const [selectedMuscles, setSelectedMuscles] = useState(new Set()); // Applied muscle filter
  const [tempSelectedMuscles, setTempSelectedMuscles] = useState(new Set()); // Temporary selection in filter modal
  const [selectedImplements, setSelectedImplements] = useState(new Set()); // Applied implement filter
  const [tempSelectedImplements, setTempSelectedImplements] = useState(new Set()); // Temporary selection in filter modal
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [wasAddExerciseModalOpen, setWasAddExerciseModalOpen] = useState(false); // Track if add exercise modal was open before opening filter
  
  // TEST VERSION 7: Re-enable add exercise modal video player
  // Add exercise modal video player callback - memoized
  const addExerciseModalVideoPlayerCallback = useCallback((player) => {
    if (player) {
      // Defer video operations to avoid blocking
      setTimeout(() => {
    player.loop = true;
    player.muted = isMuted;
      }, 0);
    }
  }, [isMuted]);
  
  // Add exercise modal video state
  const addExerciseModalVideoPlayer = useVideoPlayer('', addExerciseModalVideoPlayerCallback);
  const [addExerciseModalVideoUri, setAddExerciseModalVideoUri] = useState('');
  const [expandedAddExerciseIndex, setExpandedAddExerciseIndex] = useState(null);
  const [isAddExerciseModalVideoPaused, setIsAddExerciseModalVideoPaused] = useState(true);
  
  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropZoneIndex, setDropZoneIndex] = useState(null);
  const dragAnimatedValues = useRef({}).current;
  const cardPositions = useRef({}).current;
  
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
        if (!exercise.muscle_activation || typeof exercise.muscle_activation !== 'object') {
          return false;
        }
        const exerciseMuscles = Object.keys(exercise.muscle_activation);
        return Array.from(selectedMuscles).some(muscle => exerciseMuscles.includes(muscle));
      });
    }
    
    // Filter by implements if any are selected
    if (selectedImplements.size > 0) {
      exercises = exercises.filter(exercise => {
        if (!exercise.implements || !Array.isArray(exercise.implements)) {
          return false;
        }
        return Array.from(selectedImplements).some(impl => 
          exercise.implements.includes(impl)
        );
      });
    }
    
    // Filter out exercises that are already in the routine
    // Use editingExercises when in edit mode, workout.exercises otherwise
    const currentExercises = isEditMode ? editingExercises : (workout?.exercises || []);
    const currentExerciseNames = new Set(currentExercises.map(ex => ex.name));
    exercises = exercises.filter(exercise => 
      !currentExerciseNames.has(exercise.name)
    );
    
    // Sort exercises alphabetically by name
    return exercises.sort((a, b) => a.name.localeCompare(b.name));
  }, [availableExercises, searchQuery, selectedMuscles, selectedImplements, workout?.exercises, isEditMode, editingExercises]);
  
  // Memoized exercise card component for better performance
  const addExerciseCardStartTime = performance.now();
  logger.debug(`[TIMING] [CHECKPOINT] Before AddExerciseCard memo() - ${addExerciseCardStartTime.toFixed(2)}ms`);
  const AddExerciseCard = memo(({ exercise, index, isExpanded, onCardTap, onVideoTap, onAddExercise, isVideoPaused, isMuted, toggleMute }) => {
    const renderStartTime = performance.now();
    logger.debug(`[RENDER] [CHECKPOINT] AddExerciseCard render started - ${renderStartTime.toFixed(2)}ms`);
    return (
    <TouchableOpacity
      key={`${exercise.libraryId}_${exercise.name}`}
      style={[
        isExpanded ? styles.addExerciseExpandedCard : styles.addExerciseCard,
        isExpanded ? styles.addExerciseExpandedCardBorder : styles.addExerciseCardBorder
      ]}
      onPress={() => onCardTap(exercise, index)}
    >
      {isExpanded ? (
        <View style={styles.addExerciseVideoContainer}>
          {exercise.video_url ? (
            <TouchableOpacity 
              style={styles.addExerciseVideoWrapper}
              onPress={onVideoTap}
              activeOpacity={1}
            >
              <VideoView 
                player={addExerciseModalVideoPlayer}
                style={[styles.addExerciseVideo, { opacity: 0.7 }]}
                contentFit="cover"
                fullscreenOptions={{ allowed: false }}
                allowsPictureInPicture={false}
                nativeControls={false}
                showsTimecodes={false}
              />
              
              {/* Play icon overlay */}
              {isVideoPaused && (
                <View style={styles.addExerciseVideoPauseOverlay}>
                  <SvgPlay width={48} height={48} />
                </View>
              )}
              
              {/* Volume icon overlay - only show when paused */}
              {isVideoPaused && (
                <TouchableOpacity
                  style={styles.addExerciseVideoVolumeOverlay}
                  onPress={toggleMute}
                >
                  {isMuted ? (
                    <SvgVolumeOff width={24} height={24} color="#ffffff" />
                  ) : (
                    <SvgVolumeMax width={24} height={24} color="#ffffff" />
                  )}
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.addExerciseVideoPlaceholder}>
              <Text style={styles.addExerciseVideoPlaceholderText}>Sin video</Text>
            </View>
          )}
        </View>
      ) : null}
      
      <View style={styles.addExerciseCardContent}>
        <View style={styles.addExerciseContent}>
          <Text style={isExpanded ? styles.addExerciseExpandedName : styles.addExerciseName}>
            {exercise.name}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.addExerciseButton}
          onPress={() => onAddExercise(exercise)}
        >
          <Text style={styles.addExerciseButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
    );
  });
  const addExerciseCardDuration = performance.now() - addExerciseCardStartTime;
  logger.debug(`[TIMING] [CHECKPOINT] AddExerciseCard memo completed - took ${addExerciseCardDuration.toFixed(2)}ms`);
  if (addExerciseCardDuration > 100) {
    logger.warn(`[TIMING] ⚠️ SLOW: AddExerciseCard memo took ${addExerciseCardDuration.toFixed(2)}ms (threshold: 100ms)`);
  }
  
  // Objective info modal state
  const useStateStartTime1 = performance.now();
  logger.debug(`[TIMING] [CHECKPOINT] Before useState(isObjectiveInfoModalVisible) - ${useStateStartTime1.toFixed(2)}ms`);
  const [isObjectiveInfoModalVisible, setIsObjectiveInfoModalVisible] = useState(false);
  
  // Confirmation modal state for web (Alert.alert doesn't work well on web)
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState(null);
  const useStateDuration1 = performance.now() - useStateStartTime1;
  if (useStateDuration1 > 10) {
    logger.warn(`[TIMING] ⚠️ SLOW: useState(isObjectiveInfoModalVisible) took ${useStateDuration1.toFixed(2)}ms`);
  }
  const [selectedObjectiveInfo, setSelectedObjectiveInfo] = useState(null);
  
  // Tutorial state
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialData, setTutorialData] = useState([]);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);
  
  // Workout completion loading state
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);
  const [isExerciseDetailModalVisible, setIsExerciseDetailModalVisible] = useState(false);
  const [modalExerciseData, setModalExerciseData] = useState(null);
  
  // TEST VERSION 8: Re-enable useSetData hook
  // Use consolidated set data management
  const { setData, setValidationErrors, updateSetData: updateSetDataLocal, hasValidationErrors, setSetData } = useSetData(workout);
  
  // TEST VERSION 7: Re-enable swap modal video player
  // Swap modal video player callback - memoized
  const swapModalVideoPlayerCallback = useCallback((player) => {
    if (player) {
      // Defer video operations to avoid blocking
      setTimeout(() => {
    player.loop = true;
    player.muted = isMuted;
      }, 0);
    }
  }, [isMuted]);
  
  // Swap modal video player
  const swapModalVideoPlayer = useVideoPlayer('', swapModalVideoPlayerCallback);
  const [swapModalVideoUri, setSwapModalVideoUri] = useState('');
  const [isSwapModalVideoPaused, setIsSwapModalVideoPaused] = useState(false);

  // TEST VERSION 7: Re-enable intensity video player
  // Intensity video player callback - memoized
  const intensityVideoPlayerCallback = useCallback((player) => {
    if (player) {
      // Defer video operations to avoid blocking
      setTimeout(() => {
      player.muted = true; // Start muted
      }, 0);
    }
  }, []);
  
  // Intensity video state
  const intensityVideoPlayer = useVideoPlayer('', intensityVideoPlayerCallback);
  const [intensityVideoUri, setIntensityVideoUri] = useState('');
  const [isIntensityVideoPaused, setIsIntensityVideoPaused] = useState(true);
  const [currentIntensity, setCurrentIntensity] = useState(null);
  const [selectedIntensity, setSelectedIntensity] = useState(null);
  const [remoteIntensityVideos, setRemoteIntensityVideos] = useState({});

  // Intensity video mapping (compressed preset videos as safe fallback)
  // These are used only if Firebase download fails or hasn't completed yet
  // Preset videos are ~90% smaller than originals, reducing app bundle size
  const intensityVideoMap = useMemo(() => ({
    // Use bundled preset videos only (cloud downloads disabled)
    7: require('../../assets/videos/warmup/7_de_10_preset.mp4'),
    8: require('../../assets/videos/warmup/8_de_10_preset.mp4'),
    9: require('../../assets/videos/warmup/9_de_10_preset.mp4'),
    10: require('../../assets/videos/warmup/10_de_10_preset.mp4'),
  }), []);

  // TEST VERSION 9: Re-enable useEffect(setRemoteIntensityVideos)
  // Disable remote intensity loading; rely solely on bundled presets
  useEffect(() => {
    const effectStartTime = performance.now();
    logger.debug(`[EFFECT] [CHECKPOINT] useEffect(setRemoteIntensityVideos) started - ${effectStartTime.toFixed(2)}ms`);
    // Defer state update to avoid blocking commit phase
    setTimeout(() => {
      startTransition(() => {
    setRemoteIntensityVideos({});
      });
    }, 0);
    const effectDuration = performance.now() - effectStartTime;
    logger.debug(`[EFFECT] [CHECKPOINT] useEffect(setRemoteIntensityVideos) completed - took ${effectDuration.toFixed(2)}ms`);
    if (effectDuration > 50) {
      logger.warn(`[EFFECT] ⚠️ SLOW: useEffect(setRemoteIntensityVideos) took ${effectDuration.toFixed(2)}ms (threshold: 50ms)`);
    }
  }, []);
  
  // Expanded card state (null = current exercise, number = alternative index)
  const [expandedCardIndex, setExpandedCardIndex] = useState(null); // null means current exercise is expanded
  const [videoUri, setVideoUri] = useState(null); // Current video URI
  const [isVideoPaused, setIsVideoPaused] = useState(true); // Video pause state - start paused, wait for tutorial
  const [canStartVideo, setCanStartVideo] = useState(false); // Flag to control when video can start
  
  // TEST VERSION 7: Re-enable main video player
  // Video player callback - memoized to prevent recreation
  const videoPlayerCallback = useCallback((player) => {
    if (player) {
      // Defer video operations to avoid blocking
      setTimeout(() => {
      player.loop = false;
      player.muted = isMuted;
      player.volume = 1.0;
      logger.log('Video player initialized with volume');
      }, 0);
    }
  }, [isMuted]);
  
  // Video player for workout videos - memoized URI to prevent unnecessary re-initialization
  const memoizedVideoUri = useDeferredValue(videoUri);
  const videoPlayer = useVideoPlayer(memoizedVideoUri, videoPlayerCallback);
  const scrollViewRef = useRef(null); // Main ScrollView reference for view switching
  
  // Animation values for set input modal
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalTranslateY = useRef(new Animated.Value(300)).current;
  
  // Animation values for swap modal
  const swapModalOpacity = useRef(new Animated.Value(0)).current;
  const swapModalTranslateY = useRef(new Animated.Value(800)).current;
  
  // Simple scroll position tracking for pagination
  const scrollX = useRef(new Animated.Value(0)).current;
  const topCardScrollX = useRef(new Animated.Value(0)).current; // For top card pagination
  
  // Debounced save timer ref
  const saveTimerRef = useRef(null);
  
  // Service cache for alternative exercises (5 minute TTL)
  const serviceCache = useRef({
    alternatives: new Map(),
    lastFetch: 0,
    ttl: 5 * 60 * 1000 // 5 minutes
  });
  
  // Video preloading cache
  const videoPreloadCache = useRef(new Set());

  // Video preloading function
  const preloadNextVideo = useCallback(async () => {
    if (!workout?.exercises) return;
    
    const nextExerciseIndex = currentExerciseIndex + 1;
    if (nextExerciseIndex < workout.exercises.length) {
      const nextExercise = workout.exercises[nextExerciseIndex];
      const videoUrl = nextExercise?.video_url;
      
      if (videoUrl && !videoPreloadCache.current.has(videoUrl)) {
        try {
          logger.log('🎬 Preloading next exercise video:', nextExercise.name);
          await videoCacheService.preloadVideo(videoUrl);
          videoPreloadCache.current.add(videoUrl);
          logger.log('✅ Video preloaded successfully:', videoUrl);
        } catch (error) {
          logger.error('❌ Error preloading video:', error);
        }
      }
    }
  }, [workout, currentExerciseIndex]);

  // TEST VERSION 12: Re-enable useEffect(render completion tracking)
  // Track render completion
  useEffect(() => {
    const effectStartTime = performance.now();
    const totalTime = effectStartTime - componentStartTime;
    logger.debug(`[RENDER] [CHECKPOINT] Component fully mounted - total time: ${totalTime.toFixed(2)}ms`);
    if (totalTime > 2000) {
      logger.error(`[RENDER] ⚠️ CRITICAL: Component mount took ${totalTime.toFixed(2)}ms (threshold: 2000ms)`);
    }
    componentMountTimeRef.current = totalTime;
    
    // Track React commit phase completion with more granular timing
    if (typeof requestAnimationFrame !== 'undefined') {
      const beforeRAF = performance.now();
      requestAnimationFrame(() => {
        const commitTime = performance.now();
        const rafDelay = commitTime - beforeRAF;
        logger.debug(`[RENDER] [CHECKPOINT] React commit phase completed - ${commitTime.toFixed(2)}ms (${(commitTime - effectStartTime).toFixed(2)}ms after mount, RAF delay: ${rafDelay.toFixed(2)}ms)`);
        if (rafDelay > 50) {
          logger.warn(`[RENDER] ⚠️ SLOW: requestAnimationFrame delay was ${rafDelay.toFixed(2)}ms (expected ~16ms)`);
        }
        
        // Track paint with timing
        const beforePaintRAF = performance.now();
        requestAnimationFrame(() => {
          const paintTime = performance.now();
          const paintRAFDelay = paintTime - beforePaintRAF;
          logger.debug(`[PAINT] [CHECKPOINT] Browser paint completed - ${paintTime.toFixed(2)}ms (${(paintTime - commitTime).toFixed(2)}ms after commit, RAF delay: ${paintRAFDelay.toFixed(2)}ms)`);
          if (paintRAFDelay > 50) {
            logger.warn(`[PAINT] ⚠️ SLOW: Paint requestAnimationFrame delay was ${paintRAFDelay.toFixed(2)}ms (expected ~16ms)`);
          }
        });
      });
    }
  }, []);
    
  // TEST VERSION 9: Re-enable PerformanceObserver useEffect
  // PerformanceObserver for LONG TASK detection (non-blocking, runs in background)
  useEffect(() => {
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              logger.error(`[RENDER] 🔴 LONG TASK detected: ${entry.duration.toFixed(2)}ms`, {
                name: entry.name,
                startTime: entry.startTime.toFixed(2),
                duration: entry.duration.toFixed(2),
                entryType: entry.entryType
              });
            }
          }
        });
        observer.observe({ entryTypes: ['longtask', 'measure'] });
      } catch (e) {
        // PerformanceObserver not supported
      }
    }
  }, []);

  // TEST VERSION 9: Re-enable useEffect(initializeWorkout)
  useEffect(() => {
    const effectStartTime = performance.now();
    logger.debug(`[EFFECT] [CHECKPOINT] useEffect(initializeWorkout) started - ${effectStartTime.toFixed(2)}ms`);
    
    // Track screen view and workout start with timing
    const trackStartTime = performance.now();
    trackScreenView('WorkoutExecutionScreen');
    const trackScreenViewDuration = performance.now() - trackStartTime;
    if (trackScreenViewDuration > 10) {
      logger.warn(`[EFFECT] ⚠️ SLOW: trackScreenView took ${trackScreenViewDuration.toFixed(2)}ms`);
    }
    
    const trackWorkoutStartTime = performance.now();
    trackWorkoutStarted(course?.id, course?.difficulty);
    const trackWorkoutDuration = performance.now() - trackWorkoutStartTime;
    if (trackWorkoutDuration > 10) {
      logger.warn(`[EFFECT] ⚠️ SLOW: trackWorkoutStarted took ${trackWorkoutDuration.toFixed(2)}ms`);
    }
    
    // Call async function and track when it actually completes
    const asyncStartTime = performance.now();
    logger.debug(`[ASYNC] [CHECKPOINT] initializeWorkout() called - ${asyncStartTime.toFixed(2)}ms`);
    initializeWorkout()
      .then(() => {
        const asyncDuration = performance.now() - asyncStartTime;
        logger.debug(`[ASYNC] [CHECKPOINT] initializeWorkout() completed - took ${asyncDuration.toFixed(2)}ms`);
        if (asyncDuration > 5000) {
          logger.warn(`[ASYNC] ⚠️ SLOW: initializeWorkout() took ${asyncDuration.toFixed(2)}ms (threshold: 5000ms)`);
        }
      })
      .catch((error) => {
        const asyncDuration = performance.now() - asyncStartTime;
        logger.error(`[ASYNC] [ERROR] initializeWorkout() failed after ${asyncDuration.toFixed(2)}ms:`, error);
      });
    
    logger.log('🚀 WorkoutExecutionScreen initialized, screenWidth:', screenWidth);
    const effectDuration = performance.now() - effectStartTime;
    logger.debug(`[EFFECT] [CHECKPOINT] useEffect(initializeWorkout) setup completed - took ${effectDuration.toFixed(2)}ms (async work continues)`);
    if (effectDuration > 200) {
      logger.warn(`[EFFECT] ⚠️ SLOW: useEffect(initializeWorkout) setup took ${effectDuration.toFixed(2)}ms (threshold: 200ms)`);
    }
  }, []);


  // TEST VERSION 9: Re-enable useEffect(focus/web)
  // Handle screen focus changes - pause videos when screen loses focus
  // On web, use useEffect instead of useFocusEffect (React Router doesn't have NavigationContainer)
  if (isWeb) {
    useEffect(() => {
      const effectStartTime = performance.now();
      logger.debug(`[EFFECT] [CHECKPOINT] useEffect(focus/web) started - ${effectStartTime.toFixed(2)}ms`);
      // Screen is focused
      logger.log('🎬 WorkoutExecution screen focused (web)');
      
      return () => {
        const cleanupStartTime = performance.now();
        logger.debug(`[EFFECT] [CHECKPOINT] useEffect(focus/web) cleanup started - ${cleanupStartTime.toFixed(2)}ms`);
        // Screen loses focus - pause all videos
        // CRITICAL: Defer video operations to avoid blocking React commit phase
        // Use setTimeout(0) to schedule after React's commit phase completes
        setTimeout(() => {
          const deferredStartTime = performance.now();
          logger.log('🛑 WorkoutExecution screen lost focus - pausing all videos (web)');
          try {
            if (videoPlayer) {
              // Only pause if video is actually playing to avoid unnecessary operations
              try {
                videoPlayer.pause();
              } catch (error) {
                // Ignore pause errors - video might already be paused
                logger.log('⚠️ Error pausing main video player (safe to ignore):', error.message);
              }
              videoPlayer.muted = true; // Mute as extra safety
              // Defer state update to avoid blocking
              setTimeout(() => {
                startTransition(() => {
                  setIsVideoPaused(true); // Update local state
                });
              }, 0);
            }
          } catch (error) {
            logger.log('⚠️ Error accessing video player:', error.message);
          }
          
          try {
            if (swapModalVideoPlayer) {
              swapModalVideoPlayer.pause();
              swapModalVideoPlayer.muted = true; // Mute as extra safety
            }
          } catch (error) {
            logger.log('⚠️ Error pausing swap modal video player:', error.message);
          }
          
          try {
            if (addExerciseModalVideoPlayer) {
              addExerciseModalVideoPlayer.pause();
              addExerciseModalVideoPlayer.muted = true; // Mute as extra safety
            }
          } catch (error) {
            logger.log('⚠️ Error pausing add exercise modal video player:', error.message);
          }
          const deferredDuration = performance.now() - deferredStartTime;
          if (deferredDuration > 50) {
            logger.warn(`[EFFECT] ⚠️ SLOW: Deferred video cleanup took ${deferredDuration.toFixed(2)}ms`);
          }
        }, 0);
        const cleanupDuration = performance.now() - cleanupStartTime;
        logger.debug(`[EFFECT] [CHECKPOINT] useEffect(focus/web) cleanup completed - took ${cleanupDuration.toFixed(2)}ms (video ops deferred)`);
      };
      const effectDuration = performance.now() - effectStartTime;
      logger.debug(`[EFFECT] [CHECKPOINT] useEffect(focus/web) setup completed - took ${effectDuration.toFixed(2)}ms`);
    }, [videoPlayer, swapModalVideoPlayer, addExerciseModalVideoPlayer]);
  } else {
    // TEST MODE: useFocusEffect commented out (native only, not relevant for web test)
    /* TEST VERSION 1: useFocusEffect disabled
    // Native: use useFocusEffect
  useFocusEffect(
    useCallback(() => {
      // Screen is focused
      logger.log('🎬 WorkoutExecution screen focused');
      
      return () => {
        // Screen loses focus - pause all videos
          // CRITICAL: Defer video operations to avoid blocking React commit phase
          setTimeout(() => {
        logger.log('🛑 WorkoutExecution screen lost focus - pausing all videos');
        try {
          if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.muted = true; // Mute as extra safety
              // Defer state update to avoid blocking
              setTimeout(() => {
                startTransition(() => {
            setIsVideoPaused(true); // Update local state
                });
              }, 0);
          }
        } catch (error) {
          logger.log('⚠️ Error pausing main video player:', error.message);
        }
        
        try {
          if (swapModalVideoPlayer) {
            swapModalVideoPlayer.pause();
            swapModalVideoPlayer.muted = true; // Mute as extra safety
          }
        } catch (error) {
          logger.log('⚠️ Error pausing swap modal video player:', error.message);
        }
        
        try {
          if (addExerciseModalVideoPlayer) {
            addExerciseModalVideoPlayer.pause();
            addExerciseModalVideoPlayer.muted = true; // Mute as extra safety
          }
        } catch (error) {
          logger.log('⚠️ Error pausing add exercise modal video player:', error.message);
        }
          }, 0);
      };
    }, [videoPlayer, swapModalVideoPlayer, addExerciseModalVideoPlayer])
  );
    */
  }

  // Check for tutorials to show
  const checkForTutorials = async () => {
    if (!user?.uid || !course?.courseId) {
      // No user/course, allow video to start immediately
      // CRITICAL: Defer state updates to prevent blocking re-renders
      logger.log('🎬 No user/course data, allowing video to start immediately');
      setTimeout(() => {
        startTransition(() => {
      setCanStartVideo(true);
      setIsVideoPaused(false);
        });
      }, 0);
      return;
    }

    try {
      logger.log('🎬 Checking for workout execution screen tutorials...');
      const tutorials = await tutorialManager.getTutorialsForScreen(
        user.uid, 
        'workoutExecution',
        course.courseId  // Pass programId for program-specific tutorials
      );
      
      logger.log('🎬 Tutorials from manager:', tutorials);
      
      if (tutorials.length > 0) {
        logger.log('📚 Found tutorials to show:', tutorials.length);
        // Defer state updates to prevent blocking re-renders
        setTimeout(() => {
          startTransition(() => {
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
          });
        }, 0);
        // Keep video paused while tutorial is showing
      } else {
        logger.log('✅ No tutorials to show for workout execution screen - bypassing tutorial system');
        // No tutorials - bypass tutorial system entirely
        // Defer state updates to prevent blocking re-renders
        setTimeout(() => {
          startTransition(() => {
        setCanStartVideo(true);
        setIsVideoPaused(false);
          });
        }, 0);
        logger.log('🎬 Set video states after no tutorials:', { canStartVideo: true, isVideoPaused: false });
      }
    } catch (error) {
      logger.error('❌ Error checking for tutorials:', error);
      // On error, allow video to start anyway
      // Defer state updates to prevent blocking re-renders
      setTimeout(() => {
        startTransition(() => {
      setCanStartVideo(true);
      setIsVideoPaused(false);
        });
      }, 0);
    }
  };

  // Handle tutorial completion
  const handleTutorialComplete = async () => {
    if (!user?.uid || !course?.courseId || tutorialData.length === 0) return;

    try {
      const currentTutorial = tutorialData[currentTutorialIndex];
      if (currentTutorial) {
        await tutorialManager.markTutorialCompleted(
          user.uid, 
          'workoutExecution', 
          currentTutorial.videoUrl,
          course.courseId  // Pass programId for program-specific tutorials
        );
        logger.log('✅ Tutorial marked as completed');
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  };

  // Handle tutorial close - allow video to start when tutorial is closed
  const handleTutorialClose = () => {
    // Defer state updates to prevent blocking re-renders
    setTimeout(() => {
      startTransition(() => {
    setTutorialVisible(false);
    // Allow video to start after tutorial is closed
    logger.log('🎬 Tutorial closed, allowing exercise video to start...');
    setCanStartVideo(true);
    setIsVideoPaused(false);
      });
    }, 0);
  };

  // TEST VERSION 7: Re-enable useEffect(videoUri) to test programMediaService lazy loading
  // Simple video loading - prefer local path, fallback to remote URL (non-blocking)
  // CRITICAL: Defer state update to prevent blocking re-renders
  useEffect(() => {
    const effectStartTime = performance.now();
    logger.debug(`[EFFECT] [CHECKPOINT] useEffect(videoUri) started - ${effectStartTime.toFixed(2)}ms`);
    const currentExercise = workout?.exercises?.[currentExerciseIndex];
    if (!currentExercise) {
      // Defer state update to avoid blocking commit phase
      setTimeout(() => {
        startTransition(() => {
      setVideoUri(null);
        });
      }, 0);
      const effectDuration = performance.now() - effectStartTime;
      logger.debug(`[EFFECT] [CHECKPOINT] useEffect(videoUri) completed early (no exercise) - took ${effectDuration.toFixed(2)}ms`);
      return;
    }

    // Defer state update to avoid blocking commit phase
    setTimeout(() => {
      // Lazy load programMediaService only when actually needed (deferred require)
      const programMediaService = getProgramMediaServiceLazy();
    // Try to get local path first (synchronous, fast), fallback to remote URL immediately
      const localPath = programMediaService?.getExerciseVideoPath(
      course?.courseId,
      currentExercise.primary,
      currentExercise.video_url
      ) || null;
      
      // Use startTransition to mark as non-urgent
      startTransition(() => {
    setVideoUri(localPath || currentExercise.video_url || null);
      });
    
      // Preload next video for better UX (also defer)
      setTimeout(() => {
    preloadNextVideo();
      }, 0);
    }, 0);
    
    const effectDuration = performance.now() - effectStartTime;
    logger.debug(`[EFFECT] [CHECKPOINT] useEffect(videoUri) completed - took ${effectDuration.toFixed(2)}ms`);
    if (effectDuration > 100) {
      logger.warn(`[EFFECT] ⚠️ SLOW: useEffect(videoUri) took ${effectDuration.toFixed(2)}ms (threshold: 100ms)`);
    }
  }, [currentExerciseIndex, workout, preloadNextVideo, course]);

  // Sync video mute state
  useEffect(() => {
    const effectStartTime = performance.now();
    logger.debug(`[EFFECT] [CHECKPOINT] useEffect(videoMute) started - ${effectStartTime.toFixed(2)}ms`);
    // CRITICAL: Defer video operations to avoid blocking React commit phase
    if (videoPlayer) {
      setTimeout(() => {
        const deferredStartTime = performance.now();
        try {
      videoPlayer.muted = isMuted;
        } catch (error) {
          logger.log('⚠️ Error setting video mute state:', error.message);
        }
        const deferredDuration = performance.now() - deferredStartTime;
        if (deferredDuration > 50) {
          logger.warn(`[EFFECT] ⚠️ SLOW: Deferred video mute took ${deferredDuration.toFixed(2)}ms`);
        }
      }, 0);
    }
    const effectDuration = performance.now() - effectStartTime;
    logger.debug(`[EFFECT] [CHECKPOINT] useEffect(videoMute) completed - took ${effectDuration.toFixed(2)}ms (mute op deferred)`);
    if (effectDuration > 50) {
      logger.warn(`[EFFECT] ⚠️ SLOW: useEffect(videoMute) took ${effectDuration.toFixed(2)}ms (threshold: 50ms)`);
    }
  }, [isMuted, videoPlayer]);

  // Auto-play intensity video when card is expanded and video URI is set
  useEffect(() => {
    if (!selectedIntensity || !intensityVideoUri || !intensityVideoPlayer || isIntensityVideoPaused) {
      return;
    }

    // Defer play to allow video to load after replace()
    // Use a longer delay to ensure video is ready to play
    const playTimeoutId = setTimeout(() => {
      try {
        if (intensityVideoPlayer && selectedIntensity && intensityVideoUri && !isIntensityVideoPaused) {
          intensityVideoPlayer.play().catch(error => {
            // If play fails (video not ready), retry after a short delay
            logger.warn('⚠️ Intensity video play failed, retrying...', error);
            setTimeout(() => {
              try {
                intensityVideoPlayer.play();
              } catch (retryError) {
                logger.error('❌ Error retrying intensity video play:', retryError);
              }
            }, 300);
          });
          logger.log('🎬 Intensity video auto-played:', selectedIntensity);
        }
      } catch (error) {
        logger.error('❌ Error auto-playing intensity video:', error);
      }
    }, 300); // Delay to let video load after replace()

    return () => {
      clearTimeout(playTimeoutId);
    };
  }, [selectedIntensity, intensityVideoUri, intensityVideoPlayer, isIntensityVideoPaused]);

  // TEST VERSION 11: Re-enable useEffect(videoSync)
  // Sync video with pause state - only if tutorial is complete
  // CRITICAL: Defer entire effect to avoid blocking commit phase
  useEffect(() => {
    let syncTimeoutId = null;
    let videoTimeoutId = null;
    
    // Defer all video sync logic to avoid blocking React commit phase
    syncTimeoutId = setTimeout(() => {
      const effectStartTime = performance.now();
      logger.debug(`[EFFECT] [CHECKPOINT] useEffect(videoSync) started - ${effectStartTime.toFixed(2)}ms`);
      // Skip if video URI is not set yet (video is still loading)
      if (!videoUri) {
        logger.log('🎬 Video sync effect skipped: no video URI');
        const effectDuration = performance.now() - effectStartTime;
        logger.debug(`[EFFECT] [CHECKPOINT] useEffect(videoSync) skipped early - took ${effectDuration.toFixed(2)}ms`);
        return;
      }

      // Skip if video player is not ready
      if (!videoPlayer) {
        logger.log('🎬 Video sync effect skipped: no video player');
        const effectDuration = performance.now() - effectStartTime;
        logger.debug(`[EFFECT] [CHECKPOINT] useEffect(videoSync) skipped (no player) - took ${effectDuration.toFixed(2)}ms`);
        return;
      }

    logger.log('🎬 Video sync effect triggered:', { 
      hasVideoPlayer: !!videoPlayer, 
      canStartVideo, 
      isVideoPaused,
      hasVideoUri: !!videoUri 
    });
    
      if (canStartVideo) {
        // Use a small delay to avoid race conditions with video loading
        const timeoutStartTime = performance.now();
        logger.debug(`[VIDEO] [CHECKPOINT] Setting video sync timeout - ${timeoutStartTime.toFixed(2)}ms`);
        videoTimeoutId = setTimeout(() => {
        const timeoutExecutionTime = performance.now();
        const timeoutDelay = timeoutExecutionTime - timeoutStartTime;
        logger.debug(`[VIDEO] [CHECKPOINT] Video sync timeout executed - ${timeoutExecutionTime.toFixed(2)}ms (delay: ${timeoutDelay.toFixed(2)}ms, expected ~150ms)`);
        if (timeoutDelay > 200) {
          logger.warn(`[VIDEO] ⚠️ SLOW: Video sync timeout delay was ${timeoutDelay.toFixed(2)}ms (expected ~150ms)`);
        }
        try {
          // Check current playing state to avoid unnecessary operations
          // Note: videoPlayer.playing might not be available, so we'll handle errors gracefully
          const stateCheckStartTime = performance.now();
          let isCurrentlyPlaying = false;
          try {
            isCurrentlyPlaying = videoPlayer.playing || false;
          } catch (e) {
            // Property might not exist, default to false
            isCurrentlyPlaying = false;
          }
          const stateCheckDuration = performance.now() - stateCheckStartTime;
          if (stateCheckDuration > 10) {
            logger.warn(`[VIDEO] ⚠️ SLOW: Video state check took ${stateCheckDuration.toFixed(2)}ms`);
          }
          
          if (isVideoPaused && isCurrentlyPlaying) {
            const pauseStartTime = performance.now();
            logger.debug(`[VIDEO] [CHECKPOINT] Pausing video - ${pauseStartTime.toFixed(2)}ms`);
            logger.log('🎬 Pausing video (was playing)');
        videoPlayer.pause();
            const pauseDuration = performance.now() - pauseStartTime;
            logger.debug(`[VIDEO] [CHECKPOINT] Video paused - took ${pauseDuration.toFixed(2)}ms`);
            if (pauseDuration > 50) {
              logger.warn(`[VIDEO] ⚠️ SLOW: Video pause took ${pauseDuration.toFixed(2)}ms`);
            }
          } else if (!isVideoPaused && !isCurrentlyPlaying) {
            const playStartTime = performance.now();
            logger.debug(`[VIDEO] [CHECKPOINT] Playing video - ${playStartTime.toFixed(2)}ms`);
            logger.log('🎬 Playing video (was paused)');
            // Use async play() with error handling to prevent AbortError from breaking the app
            const playPromise = videoPlayer.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  const playDuration = performance.now() - playStartTime;
                  logger.debug(`[VIDEO] [CHECKPOINT] Video play() resolved - took ${playDuration.toFixed(2)}ms`);
                })
                .catch(error => {
                  const playDuration = performance.now() - playStartTime;
                  logger.error(`[VIDEO] [ERROR] Video play() rejected after ${playDuration.toFixed(2)}ms:`, error);
                  // AbortError is expected when play() is interrupted by pause()
                  // This is normal behavior and shouldn't break the app
                  if (error.name === 'AbortError') {
                    logger.log('ℹ️ Video play() was interrupted (expected behavior)');
      } else {
                    logger.error('❌ Error playing video:', error.message);
                  }
                });
            }
            const playInitDuration = performance.now() - playStartTime;
            logger.debug(`[VIDEO] [CHECKPOINT] Video play() initiated - took ${playInitDuration.toFixed(2)}ms`);
          } else {
            logger.log('🎬 Video already in desired state:', { 
              isVideoPaused, 
              isCurrentlyPlaying 
            });
          }
        } catch (error) {
          const errorTime = performance.now();
          logger.error(`[VIDEO] [ERROR] Video sync error at ${errorTime.toFixed(2)}ms:`, error);
          logger.log('⚠️ Error syncing video state (safe to ignore):', error.message);
        }
      }, 150); // Small delay to let video player initialize and avoid race conditions

    } else {
      logger.log('🎬 Video not ready:', { 
          reason: !canStartVideo ? 'tutorial blocking' : 'unknown'
        });
        const effectDuration = performance.now() - effectStartTime;
        logger.debug(`[EFFECT] [CHECKPOINT] useEffect(videoSync) skipped (not ready) - took ${effectDuration.toFixed(2)}ms`);
      }
      
      // Final checkpoint for effect setup
      const effectSetupDuration = performance.now() - effectStartTime;
      logger.debug(`[EFFECT] [CHECKPOINT] useEffect(videoSync) setup completed - took ${effectSetupDuration.toFixed(2)}ms`);
    }, 0); // Defer entire effect to avoid blocking commit phase
    
    // Return cleanup function to clear timeouts
    return () => {
      if (syncTimeoutId) {
        clearTimeout(syncTimeoutId);
      }
      if (videoTimeoutId) {
        clearTimeout(videoTimeoutId);
      }
    };
  }, [isVideoPaused, videoPlayer, canStartVideo, videoUri]);

  // Simple scroll handler for pagination
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }
  );

  // Scroll handler for top cards
  const onTopCardScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: topCardScrollX } } }],
    { useNativeDriver: false }
  );

  const onMomentumScrollEnd = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newView = Math.round(offsetX / screenWidth);
    setCurrentView(newView);
  };

  // Render pagination indicators - exact copy from MainScreen
  // Render pagination indicators for top cards - MainScreen style
  const renderTopCardPaginationIndicators = () => {
    const cards = [0, 1]; // Two top cards
    const cardWidth = screenWidth - 48;
    const gap = 15;
    const pageWidth = cardWidth + gap;
    
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        {cards.map((_, index) => {
          const inputRange = [
            (index - 1) * pageWidth,
            index * pageWidth,
            (index + 1) * pageWidth,
          ];
          
          // Use only native driver compatible properties
          const opacity = topCardScrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1.0, 0.3],
            extrapolate: 'clamp',
          });
          
          const scale = topCardScrollX.interpolate({
            inputRange,
            outputRange: [0.8, 1.3, 0.8],
            extrapolate: 'clamp',
          });
          
          return (
            <Animated.View
              key={index}
              style={{
                width: 6,
                height: 6,
                backgroundColor: '#ffffff',
                borderRadius: 3,
                marginHorizontal: 3,
                opacity: opacity,
                transform: [{ scale: scale }],
              }}
            />
          );
        })}
      </View>
    );
  };

  // Render pagination indicators - MainScreen style (native driver compatible)
  const renderPaginationIndicators = () => {
    const views = [0, 1]; // Detail view and List view
    const viewWidth = screenWidth;
    
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        {views.map((_, index) => {
          const inputRange = [
            (index - 1) * viewWidth,
            index * viewWidth,
            (index + 1) * viewWidth,
          ];
          
          // Use only native driver compatible properties
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.3, 1.0, 0.3],
            extrapolate: 'clamp',
          });
          
          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.8, 1.3, 0.8],
            extrapolate: 'clamp',
          });
          
          return (
            <Animated.View
              key={index}
              style={{
                width: 8,
                height: 8,
                backgroundColor: '#ffffff',
                borderRadius: 4,
                marginHorizontal: 4,
                opacity: opacity,
                transform: [{ scale: scale }],
              }}
            />
          );
        })}
      </View>
    );
  };

  // Debounced save function - saves data after 2 seconds of inactivity
  const debouncedSave = useCallback(async (exerciseIndex, setIndex, field, value) => {
    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    
    // Set new timer
    saveTimerRef.current = setTimeout(async () => {
      try {
        const currentExercise = workout.exercises[exerciseIndex];
        const currentSet = currentExercise.sets[setIndex];
        const key = `${exerciseIndex}_${setIndex}`;
        const currentSetData = setData[key] || {};
        
        // Check if this is a complete set (has at least one measurable field)
        let measurableFields = [];
        
        if (currentExercise.measures && currentExercise.measures.length > 0) {
          measurableFields = currentExercise.measures;
        } else {
          measurableFields = Object.keys(currentSet).filter(field => {
            const skipFields = [
              'id', 'order', 'notes', 'description', 'title', 'name',
              'created_at', 'updated_at', 'createdAt', 'updatedAt',
              'type', 'status', 'category', 'tags', 'metadata'
            ];
            return !skipFields.includes(field);
          });
        }
        
        const hasData = measurableFields.some(fieldName => {
          const fieldValue = fieldName === field ? value : currentSetData[fieldName];
          return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
        });
        
        if (hasData) {
          // Prepare metrics for session manager
          const metrics = Object.keys({...currentSetData, [field]: value}).reduce((acc, key) => {
            const val = key === field ? value : currentSetData[key];
            if (val !== '' && val !== null && val !== undefined) {
              const numValue = parseFloat(val);
              acc[key] = isNaN(numValue) ? val : numValue;
            }
            return acc;
          }, {});
          
          // Get all sets for this exercise
          const allSets = [];
          for (let i = 0; i < currentExercise.sets.length; i++) {
            const setKey = `${exerciseIndex}_${i}`;
            const currentSetData = setData[setKey] || {};
            const setMetrics = Object.keys(currentSetData).reduce((acc, key) => {
              const val = currentSetData[key];
              if (val !== '' && val !== null && val !== undefined) {
                const numValue = parseFloat(val);
                acc[key] = isNaN(numValue) ? val : numValue;
              }
              return acc;
            }, {});
            allSets.push(setMetrics);
          }
          
          await sessionManager.addExerciseData(
            currentExercise.id,
            currentExercise.name,
            allSets
          );
          logger.log('✅ Exercise data debounced-saved:', allSets);
        }
      } catch (error) {
        logger.error('❌ Error debounced-saving set data:', error);
      }
    }, 2000); // 2 second delay
  }, [workout, setData]);

  const updateSetData = async (exerciseIndex, setIndex, field, value) => {
    // Use consolidated set data management
    const { isValid, key } = updateSetDataLocal(exerciseIndex, setIndex, field, value);
    
    // Use debounced save for database operations (preserves data saving functionality)
    if (isValid && !hasValidationErrors()) {
      debouncedSave(exerciseIndex, setIndex, field, value);
    }
  };

  // Memoized callbacks for better performance
  const selectExercise = useCallback((exerciseIndex) => {
    setCurrentExerciseIndex(exerciseIndex);
    setCurrentSetIndex(0);
    // Switch back to exercise detail view (index 0)
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ x: 0, animated: true });
    }
  }, []);

  const toggleExerciseExpansion = useCallback((exerciseIndex) => {
    setExpandedExercises(prev => ({
      ...prev,
      [exerciseIndex]: !prev[exerciseIndex]
    }));
  }, []);

  const handleSelectSet = useCallback((exerciseIndex, setIndex) => {
    setCurrentExerciseIndex(exerciseIndex);
    setCurrentSetIndex(setIndex);
    // Switch back to exercise detail view
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ x: 0, animated: true });
    }
  }, []);

  const getFieldDisplayName = (field) => {
    const fieldNames = {
      'reps': 'Reps',
      'weight': 'Peso (kg)',
      'rir': 'RIR',
      'time': 'Tiempo (min)',
      'distance': 'Distancia (km)',
      'pace': 'Ritmo (min/km)',
      'speed': 'Velocidad (km/h)',
      'heart_rate': 'FC (bpm)',
      'calories': 'Calorías',
      'rest_time': 'Descanso (seg)',
      'sets': 'Series',
      'duration': 'Duración (min)',
      'previous': 'Anterior'
    };
    return fieldNames[field] || field.charAt(0).toUpperCase() + field.slice(1);
  };

  const calculateEvenGaps = (set) => {
    const skipFields = [
      'id', 'order', 'notes', 'description', 'title', 'name',
      'created_at', 'updated_at', 'createdAt', 'updatedAt',
      'type', 'status', 'category', 'tags', 'metadata'
    ];
    
    const measurableFields = Object.keys(set).filter(field => 
      !skipFields.includes(field)
    );
    
    const fieldsToShow = measurableFields.sort().slice(0, 3);
    
    // Calculate total width needed for all boxes
    let totalBoxWidth = 0;
    fieldsToShow.forEach(field => {
      const fieldName = getFieldDisplayName(field);
      const fieldValue = set[field]?.toString() || '';
      const placeholderText = fieldValue !== undefined && fieldValue !== null && fieldValue !== '' ? fieldValue.toString() : 'NO DATA';
      const titleWidth = fieldName.length * 8;
      const contentWidth = placeholderText.length * 8;
      const maxWidth = Math.max(titleWidth, contentWidth);
      const extraWidth = fieldsToShow.length === 2 ? 20 : 0; // 20px extra for 2 metrics
      const minWidth = fieldsToShow.length === 2 ? 80 : 60; // Higher minimum for 2 metrics
      const boxWidth = Math.max(maxWidth + 16 + extraWidth, minWidth);
      totalBoxWidth += boxWidth;
    });
    
    // Calculate available space (container width - padding)
    const containerWidth = 300; // Approximate available width
    const padding = 40; // Left padding (setNumber) + right padding
    const availableSpace = containerWidth - padding;
    
    // Calculate even gaps with minimum 8px
    const numberOfGaps = fieldsToShow.length + 1; // Gaps between boxes + gaps at borders
    const totalGapSpace = availableSpace - totalBoxWidth;
    const evenGap = Math.max(totalGapSpace / numberOfGaps, 8); // Minimum 8px gap
    
    return { evenGap, totalBoxWidth };
  };

  const handleDiscardWorkout = async () => {
    // Use custom modal on web, Alert.alert on native
    if (isWeb) {
      setConfirmModalConfig({
        title: 'Descartar Entrenamiento',
        message: '¿Estás seguro de que quieres salir y descartar este entrenamiento? Todo el progreso no guardado se perderá.',
        cancelText: 'Cancelar',
        confirmText: 'Descartar',
        isDestructive: true,
        onCancel: () => {
          setConfirmModalVisible(false);
          setConfirmModalConfig(null);
        },
        onConfirm: async () => {
          setConfirmModalVisible(false);
          setConfirmModalConfig(null);
          try {
            logger.log('🗑️ Discarding workout...');
            
            // Cancel the current session and clear local data
            await sessionManager.cancelSession();
            
            logger.log('✅ Workout discarded successfully');
            
            // Navigate back to daily workout screen
            navigation.goBack();
            
          } catch (error) {
            logger.error('❌ Error discarding workout:', error);
            // Show error using modal on web
            setConfirmModalConfig({
              title: 'Error',
              message: 'No se pudo descartar el entrenamiento.',
              hideCancel: true,
              confirmText: 'OK',
              onConfirm: () => {
                setConfirmModalVisible(false);
                setConfirmModalConfig(null);
              }
            });
            setConfirmModalVisible(true);
          }
        }
      });
      setConfirmModalVisible(true);
    } else {
      // Native: Use Alert.alert
      Alert.alert(
        'Descartar Entrenamiento',
        '¿Estás seguro de que quieres salir y descartar este entrenamiento? Todo el progreso no guardado se perderá.',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
          },
          {
            text: 'Descartar',
            style: 'destructive',
            onPress: async () => {
              try {
                logger.log('🗑️ Discarding workout...');
                
                // Cancel the current session and clear local data
                await sessionManager.cancelSession();
                
                logger.log('✅ Workout discarded successfully');
                
                // Navigate back to daily workout screen
                navigation.goBack();
                
              } catch (error) {
                logger.error('❌ Error discarding workout:', error);
                Alert.alert('Error', 'No se pudo descartar el entrenamiento.');
              }
            },
          },
        ]
      );
    }
  };


  const handleOpenSetInput = () => {
    const currentExercise = workout.exercises[currentExerciseIndex];
    const currentSet = currentExercise.sets[currentSetIndex];
    
    // Initialize input data with current set data or empty values
    const inputData = {};
    
    if (currentExercise?.measures && currentExercise.measures.length > 0) {
      // Use measures array directly
      currentExercise.measures.forEach(field => {
        inputData[field] = setData[`${currentExerciseIndex}_${currentSetIndex}`]?.[field] || '';
      });
    } else {
      // Fallback to old method
    Object.keys(currentSet).forEach(field => {
      const skipFields = [
        'id', 'order', 'notes', 'description', 'title', 'name',
        'created_at', 'updated_at', 'createdAt', 'updatedAt',
        'type', 'status', 'category', 'tags', 'metadata'
      ];
      
      if (!skipFields.includes(field)) {
        inputData[field] = setData[`${currentExerciseIndex}_${currentSetIndex}`]?.[field] || '';
      }
    });
    }
    
    setCurrentSetInputData(inputData);
    setIsSetInputVisible(true);
    
    // Animate modal in
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleSaveSetData = async () => {
    try {
      const key = `${currentExerciseIndex}_${currentSetIndex}`;
      
      // Update local state
      setSetData(prev => ({
        ...prev,
        [key]: { ...prev[key], ...currentSetInputData }
      }));
      
      // Get current exercise and set info
      const currentExercise = workout.exercises[currentExerciseIndex];
      const currentSet = currentExercise.sets[currentSetIndex];
      
      // Get all sets for this exercise - SIMPLE FIX
      const allSets = [];
      for (let i = 0; i < currentExercise.sets.length; i++) {
        const setKey = `${currentExerciseIndex}_${i}`;
        const currentSetData = setData[setKey] || {};
        
        // If this is the current set, merge with new input data
        const setMetrics = i === currentSetIndex 
          ? { ...currentSetData, ...currentSetInputData }
          : currentSetData;
          
        allSets.push(setMetrics);
      }
      
      // Add exercise data to session manager
      await sessionManager.addExerciseData(
        currentExercise.id,
        currentExercise.name,
        allSets
      );
      logger.log('✅ Exercise data saved to session:', allSets);
      
      // Animate modal out
      Animated.parallel([
        Animated.timing(modalOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(modalTranslateY, {
          toValue: 300,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsSetInputVisible(false);
        setCurrentSetInputData({});
        
        // Automatically move to next set
        handleNextSet();
      });
      
    } catch (error) {
      logger.error('❌ Error saving set data:', error);
      Alert.alert('Error', 'No se pudo guardar los datos de la serie. Inténtalo de nuevo.');
    }
  };

  const handleCancelSetInput = () => {
    // Animate modal out
    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslateY, {
        toValue: 300,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsSetInputVisible(false);
      setCurrentSetInputData({});
    });
  };

  // Swap exercise handlers - OPTIMIZED with cache pre-check
  const handleOpenSwapModal = (exerciseIndex) => {
    setCurrentSwapExerciseIndex(exerciseIndex);
    
    // Pre-check cache before showing modal
    const exercise = workout.exercises[exerciseIndex];
    const cacheKey = `${exerciseIndex}_${exercise.id}`;
    const cached = serviceCache.current.alternatives.get(cacheKey);
    const now = Date.now();
    const isCached = cached && (now - cached.timestamp) < serviceCache.current.ttl;
    
    if (isCached) {
      // Data is cached - show modal with data immediately (no loading state)
      logger.log('⚡ Cache hit! Showing swap modal with cached data');
      setAlternativeExercises(cached.data);
      setCreatorName(cached.creatorName);
      setLoadingAlternatives(false);
      
      // Load current exercise video immediately
      if (exercise?.video_url) {
        setSwapModalVideoUri(exercise.video_url);
        setTimeout(() => {
          swapModalVideoPlayer.replace(exercise.video_url);
          setIsSwapModalVideoPaused(false);
        }, 50);
      }
    } else {
      // Not cached - show loading state
      logger.log('📥 Cache miss - loading alternatives...');
      setLoadingAlternatives(true);
      setAlternativeExercises([]);
    }
    
    // Show modal immediately
    setIsSwapModalVisible(true);
    
    // Animate modal in immediately
    Animated.parallel([
      Animated.timing(swapModalOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(swapModalTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Load alternatives if not cached
    if (!isCached) {
      loadAlternatives(exerciseIndex);
    }
  };

  const loadAlternatives = async (exerciseIndex) => {
    try {
      const exercise = workout.exercises[exerciseIndex];
      const alternatives = exercise.alternatives || {};
      
      // Check cache first
      const cacheKey = `${exerciseIndex}_${exercise.id}`;
      const cached = serviceCache.current.alternatives.get(cacheKey);
      const now = Date.now();
      
      if (cached && (now - cached.timestamp) < serviceCache.current.ttl) {
        logger.log('✅ Using cached alternatives for exercise:', exerciseIndex);
        setAlternativeExercises(cached.data);
        setCreatorName(cached.creatorName);
        
        // Load video after alternatives are loaded
        const currentExercise = workout.exercises[exerciseIndex];
        if (currentExercise?.video_url) {
          setSwapModalVideoUri(currentExercise.video_url);
          setTimeout(() => {
            swapModalVideoPlayer.replace(currentExercise.video_url);
            setIsSwapModalVideoPaused(false);
          }, 50);
        }
        return;
      }
      
      // Get creator name from the first library document
      const firstLibraryId = Object.keys(alternatives)[0];
      let creatorName = '';
      if (firstLibraryId) {
        try {
          // Get the library document to extract creator_name
          const libraryDocRef = doc(firestore, 'exercises_library', firstLibraryId);
          const libraryDoc = await getDoc(libraryDocRef);
          
          if (libraryDoc.exists()) {
            const libraryData = libraryDoc.data();
            creatorName = libraryData.creator_name || firstLibraryId;
          } else {
            creatorName = firstLibraryId;
          }
        } catch (error) {
          logger.error('❌ Error fetching creator name:', error);
          creatorName = firstLibraryId;
        }
      }
      
      // Load all alternative exercises from all libraries - OPTIMIZED with Promise.all
      const alternativeExercisePromises = [];
      
      for (const [libraryId, exerciseNames] of Object.entries(alternatives)) {
        for (const exerciseName of exerciseNames) {
          // Skip empty or invalid exercise names
          if (!exerciseName || exerciseName.trim() === '') {
            logger.log('⏭️ Skipping empty exercise name in library:', libraryId);
            continue;
          }
          
          // Create promise for each exercise
          const exercisePromise = exerciseLibraryService.getExerciseData(libraryId, exerciseName)
            .then(exerciseData => ({
              name: exerciseName,
              description: exerciseData.description,
              video_url: exerciseData.video_url,
              muscle_activation: exerciseData.muscle_activation,
              libraryId: libraryId
            }))
            .catch(error => {
              logger.error(`❌ Error loading alternative exercise ${exerciseName}:`, error);
              // Return null on error so we can filter it out
              return null;
            });
          
          alternativeExercisePromises.push(exercisePromise);
        }
      }
      
      // Execute all fetches in parallel
      logger.log('🔄 Loading', alternativeExercisePromises.length, 'alternatives in parallel...');
      const loadStartTime = Date.now();
      const alternativeExercisesRaw = await Promise.all(alternativeExercisePromises);
      const loadTime = Date.now() - loadStartTime;
      
      // Filter out null values (failed exercises)
      const alternativeExercisesList = alternativeExercisesRaw.filter(ex => ex !== null);
      logger.log(`✅ All alternatives loaded in ${loadTime}ms (${alternativeExercisesList.length} valid out of ${alternativeExercisesRaw.length})`);
      
      // Cache the results
      serviceCache.current.alternatives.set(cacheKey, {
        data: alternativeExercisesList,
        creatorName: creatorName,
        timestamp: now
      });
      
      setAlternativeExercises(alternativeExercisesList);
      setCreatorName(creatorName);
      
      // OPTIMIZED: Only load current exercise video, not alternatives
      // Alternative videos will load lazily when user expands their cards
      const currentExercise = workout.exercises[exerciseIndex];
      if (currentExercise?.video_url) {
        setSwapModalVideoUri(currentExercise.video_url);
        // Load video in background without blocking UI
        setTimeout(() => {
          swapModalVideoPlayer.replace(currentExercise.video_url);
          setIsSwapModalVideoPaused(false);
        }, 50);
      }
    } catch (error) {
      logger.error('❌ Error loading alternatives:', error);
      setAlternativeExercises([]);
    } finally {
      setLoadingAlternatives(false);
    }
  };

  const handleCloseSwapModal = () => {
    // Animate modal out
    Animated.parallel([
      Animated.timing(swapModalOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(swapModalTranslateY, {
        toValue: 800,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsSwapModalVisible(false);
      setCurrentSwapExerciseIndex(null);
      setAlternativeExercises([]);
      setCreatorName('');
      setSwapModalVideoUri('');
      setIsSwapModalVideoPaused(false);
      setExpandedCardIndex(null);
    });
  };

  // Swap modal video tap handler
  const handleSwapModalVideoTap = () => {
    if (isSwapModalVideoPaused) {
      swapModalVideoPlayer.play();
      setIsSwapModalVideoPaused(false);
    } else {
      swapModalVideoPlayer.pause();
      setIsSwapModalVideoPaused(true);
    }
  };

  // Add exercise modal card tap handler
  const handleAddExerciseCardTap = (exercise, index) => {
    // If clicking the same card that's already expanded, collapse it
    if (expandedAddExerciseIndex === index) {
      setExpandedAddExerciseIndex(null);
      setAddExerciseModalVideoUri('');
      setIsAddExerciseModalVideoPaused(true);
      return;
    }
    
    // Expand the clicked card immediately
    setExpandedAddExerciseIndex(index);
    
    // Load video when card is expanded (lazy loading)
    if (exercise?.video_url) {
      logger.log('🎬 Lazy loading video for expanded add exercise card:', exercise.name);
      setAddExerciseModalVideoUri(exercise.video_url);
      
      // Load video completely in background without blocking UI
      setTimeout(() => {
        addExerciseModalVideoPlayer.replace(exercise.video_url);
        setIsAddExerciseModalVideoPaused(true);
      }, 100); // Slightly longer delay to ensure card expansion completes first
    }
  };

  // Add exercise modal video tap handler
  const handleAddExerciseModalVideoTap = () => {
    if (isAddExerciseModalVideoPaused) {
      addExerciseModalVideoPlayer.play();
      setIsAddExerciseModalVideoPaused(false);
    } else {
      addExerciseModalVideoPlayer.pause();
      setIsAddExerciseModalVideoPaused(true);
    }
  };

  // Intensity video tap handler
  const handleIntensityVideoTap = (intensity) => {
    // Load the selected intensity video:
    // Use bundled preset only (cloud/remote/local download disabled)
    const videoUri = intensityVideoMap[intensity];
    setIntensityVideoUri(videoUri);
    setCurrentIntensity(intensity);
    intensityVideoPlayer.replace(videoUri);
    
    // Toggle play/pause
    if (isIntensityVideoPaused) {
      intensityVideoPlayer.play();
      setIsIntensityVideoPaused(false);
    } else {
      intensityVideoPlayer.pause();
      setIsIntensityVideoPaused(true);
    }
  };

  // Handle intensity card press - expand/collapse video
  const handleIntensityCardPress = (intensity) => {
    if (selectedIntensity === intensity) {
      // Collapse the card
      setSelectedIntensity(null);
      intensityVideoPlayer.pause();
      setIsIntensityVideoPaused(true);
    } else {
      // Expand the card and load video (bundled preset only)
      setSelectedIntensity(intensity);
      const videoUri = intensityVideoMap[intensity];
      setIntensityVideoUri(videoUri);
      setCurrentIntensity(intensity);
      intensityVideoPlayer.replace(videoUri);
      // Play will be handled by useEffect when video is ready
      setIsIntensityVideoPaused(false);
    }
  };

  // Toggle intensity video play/pause
  const toggleIntensityVideo = () => {
    if (isIntensityVideoPaused) {
      intensityVideoPlayer.play();
      setIsIntensityVideoPaused(false);
    } else {
      intensityVideoPlayer.pause();
      setIsIntensityVideoPaused(true);
    }
  };

  // Handle card tap (current exercise or alternative) - OPTIMIZED with lazy video loading
  const handleCardTap = (exercise, index) => {
    // If clicking the same card that's already expanded, do nothing
    if (expandedCardIndex === index) {
      return;
    }
    
    // Expand the clicked card immediately
    setExpandedCardIndex(index);
    
    // OPTIMIZED: Only load video when card is actually expanded (lazy loading)
    if (exercise?.video_url) {
      logger.log('🎬 Lazy loading video for expanded card:', exercise.name);
      setSwapModalVideoUri(exercise.video_url);
      
      // Load video completely in background without blocking UI
      setTimeout(() => {
        if (exercise?.video_url) {
          swapModalVideoPlayer.replace(exercise.video_url);
          setIsSwapModalVideoPaused(false);
        }
      }, 100); // Slightly longer delay to ensure card expansion completes first
    }
  };

  // Objective info modal handlers
  const handleObjectiveCardPress = async (objective) => {
    try {
      logger.log('🔍 handleObjectiveCardPress called with objective:', objective);
      
      // Special handling for "previous" - show exercise history in ExerciseDetailModal
      if (objective === 'previous') {
        logger.log('🔍 Opening exercise history for "previous" objective');
        const currentExercise = workout?.exercises?.[currentExerciseIndex];
        if (!currentExercise) {
          logger.error('❌ Cannot show exercise history - no current exercise');
          return;
        }

        // Extract libraryId and exerciseName
        const libraryId = currentExercise.primary ? Object.keys(currentExercise.primary)[0] : '';
        const exerciseName = currentExercise.name;
        
        logger.log('🔍 Exercise data:', { libraryId, exerciseName, currentExercise });
        
        if (!libraryId || !exerciseName) {
          logger.error('❌ Missing exercise data for exercise history:', { libraryId, exerciseName });
          return;
        }

        // Create exercise key
        const exerciseKey = `${libraryId}_${exerciseName}`;
        logger.log('🔍 Exercise key:', exerciseKey);
        
        // Store basic exercise data first (needed for modal)
        const basicExerciseData = {
          exerciseKey,
          exerciseName,
          libraryId,
          currentEstimate: null,
          lastUpdated: null
        };
        
        // Fetch current estimate for this exercise if user is available
        if (user?.uid) {
          try {
            logger.log('🔍 Fetching estimates for user:', user.uid);
            const estimates = await oneRepMaxService.getEstimatesForUser(user.uid);
            const estimate = estimates[exerciseKey];
            logger.log('🔍 Estimate data:', estimate);
            
            // Update with estimate data if available
            basicExerciseData.currentEstimate = estimate?.current || null;
            basicExerciseData.lastUpdated = estimate?.lastUpdated || null;
          } catch (error) {
            logger.error('❌ Error fetching estimates for exercise history modal:', error);
            // Continue with basic data (no estimates)
          }
        } else {
          logger.warn('⚠️ Cannot fetch estimates - user not available');
        }
        
        logger.log('🔍 Setting modal exercise data:', basicExerciseData);
        // Store the exercise data for the modal
        setModalExerciseData(basicExerciseData);
        
        logger.log('🔍 Opening ExerciseDetailModal');
        // Show the ExerciseDetailModal with exercise history
        setIsExerciseDetailModalVisible(true);
        return;
      }

      // For other objectives, show the info modal with description
      const info = objectivesInfoService.getObjectiveInfo(objective);
      if (info) {
        setSelectedObjectiveInfo(info);
        setIsObjectiveInfoModalVisible(true);
      }
    } catch (error) {
      logger.error('❌ Error in handleObjectiveCardPress:', error);
    }
  };

  const handleCloseObjectiveInfoModal = () => {
    // Pause intensity video if playing
    if (intensityVideoPlayer?.playing) {
      intensityVideoPlayer.pause();
      setIsIntensityVideoPaused(true);
    }
    
    // Reset intensity video state
    setIntensityVideoUri('');
    setCurrentIntensity(null);
    setSelectedIntensity(null);
    
    setIsObjectiveInfoModalVisible(false);
    setSelectedObjectiveInfo(null);
  };

  const handleViewExerciseProgress = async () => {
    try {
      logger.log('🔍 handleViewExerciseProgress called');
      const currentExercise = workout?.exercises?.[currentExerciseIndex];
      if (!currentExercise) {
        logger.error('❌ Cannot show exercise progress - no current exercise');
        return;
      }

      // Extract libraryId and exerciseName
      const libraryId = currentExercise.primary ? Object.keys(currentExercise.primary)[0] : '';
      const exerciseName = currentExercise.name;
      
      logger.log('🔍 Exercise data:', { libraryId, exerciseName, currentExercise });
      
      if (!libraryId || !exerciseName) {
        logger.error('❌ Missing exercise data for exercise progress:', { libraryId, exerciseName });
        return;
      }

      // Create exercise key
      const exerciseKey = `${libraryId}_${exerciseName}`;
      logger.log('🔍 Exercise key:', exerciseKey);
      
      // Store basic exercise data first (needed for modal)
      const basicExerciseData = {
        exerciseKey,
        exerciseName,
        libraryId,
        currentEstimate: null,
        lastUpdated: null
      };
      
      // Fetch current estimate for this exercise if user is available
      if (user?.uid) {
        try {
          logger.log('🔍 Fetching estimates for user:', user.uid);
          const estimates = await oneRepMaxService.getEstimatesForUser(user.uid);
          const estimate = estimates[exerciseKey];
          logger.log('🔍 Estimate data:', estimate);
          
          // Update with estimate data if available
          basicExerciseData.currentEstimate = estimate?.current || null;
          basicExerciseData.lastUpdated = estimate?.lastUpdated || null;
        } catch (error) {
          logger.error('❌ Error fetching estimates for exercise progress modal:', error);
          // Continue with basic data (no estimates)
        }
      } else {
        logger.warn('⚠️ Cannot fetch estimates - user not available');
      }
      
      logger.log('🔍 Setting modal exercise data:', basicExerciseData);
      // Store the exercise data for the modal
      setModalExerciseData(basicExerciseData);
      
      logger.log('🔍 Opening ExerciseDetailModal');
      // Show the modal with exercise data
      setIsExerciseDetailModalVisible(true);
    } catch (error) {
      logger.error('❌ Error in handleViewExerciseProgress:', error);
    }
  };

  const handleCloseExerciseDetailModal = () => {
    setIsExerciseDetailModalVisible(false);
    setModalExerciseData(null);
  };

  const handleSwapExercise = (selectedExercise) => {
    if (currentSwapExerciseIndex === null) return;

    try {
      const currentExercise = workout.exercises[currentSwapExerciseIndex];
      
      // Create new workout with swapped exercise
      const updatedWorkout = {
        ...workout,
        exercises: workout.exercises.map((exercise, index) => {
          if (index === currentSwapExerciseIndex) {
            // Get current exercise's original library
            const currentLibraryId = currentExercise.primary ? Object.keys(currentExercise.primary)[0] : '';
            
            // Create new alternatives object
            const newAlternatives = { ...exercise.alternatives };
            
            // Add current exercise back to its original library
            if (currentLibraryId) {
              if (!newAlternatives[currentLibraryId]) {
                newAlternatives[currentLibraryId] = [];
              }
              // Only add if not already there
              if (!newAlternatives[currentLibraryId].includes(currentExercise.name)) {
                newAlternatives[currentLibraryId].push(currentExercise.name);
              }
            }
            
            // Remove selected exercise from its library
            if (newAlternatives[selectedExercise.libraryId]) {
              newAlternatives[selectedExercise.libraryId] = newAlternatives[selectedExercise.libraryId]
                .filter(name => name !== selectedExercise.name);
            }
            
            return {
              ...exercise,
              name: selectedExercise.name,
              description: selectedExercise.description,
              video_url: selectedExercise.video_url,
              primary: { [selectedExercise.libraryId]: selectedExercise.name },
              alternatives: newAlternatives
            };
          }
          return exercise;
        })
      };

      // Update workout state
      setWorkout(updatedWorkout);

      // Update video if we're currently viewing this exercise
      if (currentExerciseIndex === currentSwapExerciseIndex) {
        setVideoUri(selectedExercise.video_url);
        if (videoPlayer) {
          videoPlayer.currentTime = 0;
          if (!isVideoPaused) {
            const playPromise = videoPlayer.play();
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                if (error.name === 'AbortError') {
                  logger.log('ℹ️ Video play() was interrupted (expected behavior)');
                } else {
                  logger.error('❌ Error playing video after swap:', error.message);
                }
              });
            }
          }
        }
      }

      logger.log('✅ Exercise swapped successfully:', {
        from: currentExercise.name,
        to: selectedExercise.name
      });

      // Close modal
      handleCloseSwapModal();

    } catch (error) {
      logger.error('❌ Error swapping exercise:', error);
      Alert.alert('Error', 'No se pudo cambiar el ejercicio. Inténtalo de nuevo.');
    }
  };

  // Add/Remove set functions
  const addSet = (exerciseIndex) => {
    const exercise = workout.exercises[exerciseIndex];
    const lastSet = exercise.sets[exercise.sets.length - 1]; // Use last set for inheritance
    
    // Create new set inheriting objectives from last set
    const newSet = {};
    Object.keys(lastSet).forEach(field => {
      // Inherit objective values (reps, intensity) from last set
      if (field === 'reps' || field === 'intensity') {
        newSet[field] = lastSet[field] || '';
      } else {
        // Other fields start empty
        newSet[field] = '';
      }
    });
    
    const updatedWorkout = {
      ...workout,
      exercises: workout.exercises.map((exercise, index) => {
        if (index === exerciseIndex) {
          return {
            ...exercise,
            sets: [...exercise.sets, newSet]
          };
        }
        return exercise;
      })
    };
    setWorkout(updatedWorkout);
    
    // Initialize setData for new set with inherited objectives
    const newSetIndex = exercise.sets.length; // New set will be at this index
    const newSetKey = `${exerciseIndex}_${newSetIndex}`;
    const newSetFields = {};
    
    if (exercise.measures && exercise.measures.length > 0) {
      exercise.measures.forEach(field => {
        // All user input fields start empty - setData represents user input, not objectives
        newSetFields[field] = '';
      });
    } else {
      // Fallback: Use last set as template for field names but start all user input empty
      Object.keys(lastSet).forEach(field => {
        const skipFields = [
          'id', 'order', 'notes', 'description', 'title', 'name',
          'created_at', 'updated_at', 'createdAt', 'updatedAt',
          'type', 'status', 'category', 'tags', 'metadata'
        ];
        
        if (!skipFields.includes(field)) {
          // All user input fields start empty - setData represents user input, not objectives
          newSetFields[field] = '';
        }
      });
    }
    
    setSetData(prev => ({
      ...prev,
      [newSetKey]: newSetFields
    }));
    
    logger.log('✅ Set added to exercise:', exerciseIndex);
  };

  const removeSet = (exerciseIndex) => {
    const exercise = workout.exercises[exerciseIndex];
    if (exercise.sets.length <= 1) return; // Don't remove last set

    const lastSetIndex = exercise.sets.length - 1;

    const updatedWorkout = {
      ...workout,
      exercises: workout.exercises.map((exercise, index) => {
        if (index === exerciseIndex) {
          return {
            ...exercise,
            sets: exercise.sets.slice(0, -1) // Remove last set
          };
        }
        return exercise;
      })
    };
    setWorkout(updatedWorkout);

    // Clean up set data for removed set
    const removedSetKey = `${exerciseIndex}_${lastSetIndex}`;
    setSetData(prev => {
      const newSetData = { ...prev };
      delete newSetData[removedSetKey];
      return newSetData;
    });

    // Adjust current set index if needed
    if (exerciseIndex === currentExerciseIndex && currentSetIndex >= lastSetIndex) {
      setCurrentSetIndex(Math.max(0, lastSetIndex - 1));
    }

    logger.log('✅ Set removed from exercise:', exerciseIndex);
  };

  // Edit mode system functions
  const handleToggleEditMode = () => {
    if (isEditMode) {
      // Exit edit mode
      setIsEditMode(false);
      setEditingExercises([]);
      setIsAddExerciseModalVisible(false);
      setAvailableExercises([]);
      setLoadingAvailableExercises(false);
      setSearchQuery('');
      
      // Reset add exercise modal video state
      setExpandedAddExerciseIndex(null);
      setAddExerciseModalVideoUri('');
      setIsAddExerciseModalVideoPaused(true);
      
      // Reset drag state
      setDraggedIndex(null);
      setDropZoneIndex(null);
      // Reset all animated values
      Object.values(dragAnimatedValues).forEach(animatedValue => {
        if (animatedValue) {
          animatedValue.setValue(0);
        }
      });
      
      logger.log('✅ Exited edit mode');
    } else {
      // Enter edit mode
      setEditingExercises([...workout.exercises]);
      setIsEditMode(true);
      logger.log('✅ Entered edit mode');
    }
  };

  const handleSaveEditMode = () => {
    try {
      // Update exercise order field for each exercise
      const exercisesWithOrder = editingExercises.map((exercise, index) => ({
        ...exercise,
        order: index + 1
      }));
      
      // Apply changes to workout
      setWorkout(prev => ({
        ...prev,
        exercises: exercisesWithOrder
      }));
      
      // Update exercise order in set data
      updateSetDataOrder();
      
      // Reset current indices if needed
      adjustCurrentIndicesAfterReorder();
      
          // Exit edit mode and cleanup
          setIsEditMode(false);
          setEditingExercises([]);
          setIsAddExerciseModalVisible(false);
          setAvailableExercises([]);
          setLoadingAvailableExercises(false);
          setSearchQuery('');
          
          // Reset add exercise modal video state
          setExpandedAddExerciseIndex(null);
          setAddExerciseModalVideoUri('');
          setIsAddExerciseModalVideoPaused(true);
          
          // Reset drag state
          setDraggedIndex(null);
          setDropZoneIndex(null);
          // Reset all animated values
          Object.values(dragAnimatedValues).forEach(animatedValue => {
            if (animatedValue) {
              animatedValue.setValue(0);
            }
          });
      
      logger.log('✅ Edit mode saved successfully');
    } catch (error) {
      logger.error('❌ Error saving edit mode:', error);
      // Force exit edit mode even if there's an error
      setIsEditMode(false);
      setEditingExercises([]);
      setIsAddExerciseModalVisible(false);
      setAvailableExercises([]);
      setLoadingAvailableExercises(false);
    }
  };

  const handleCancelEditMode = () => {
    // Simply exit edit mode without applying changes
    setIsEditMode(false);
    setEditingExercises([]);
    setIsAddExerciseModalVisible(false);
    setAvailableExercises([]);
    setLoadingAvailableExercises(false);
    setSearchQuery('');
    
    // Reset add exercise modal video state
    setExpandedAddExerciseIndex(null);
    setAddExerciseModalVideoUri('');
    setIsAddExerciseModalVideoPaused(true);
    
    // Reset drag state
    setDraggedIndex(null);
    setDropZoneIndex(null);
    // Reset all animated values
    Object.values(dragAnimatedValues).forEach(animatedValue => {
      if (animatedValue) {
        animatedValue.setValue(0);
      }
    });
    
    logger.log('✅ Edit mode cancelled');
  };

  const handleOpenAddExerciseModal = () => {
    try {
      logger.log('➕ Opening add exercise modal');
      setIsAddExerciseModalVisible(true);
      loadAvailableExercises();
    } catch (error) {
      logger.error('❌ Error opening add exercise modal:', error);
      Alert.alert('Error', 'No se pudo abrir la lista de ejercicios.');
    }
  };

  const handleAddExerciseInEdit = (selectedExercise) => {
    const newExercise = {
      id: `added_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: selectedExercise.name,
      description: selectedExercise.description,
      video_url: selectedExercise.video_url,
      muscle_activation: selectedExercise.muscle_activation,
      libraryId: selectedExercise.libraryId,
      primary: { [selectedExercise.libraryId]: selectedExercise.name },
      alternatives: {},
      order: editingExercises.length,
      measures: ["reps", "weight"],
      objectives: ["reps", "intensity"],
      sets: [{
        id: `set_${Date.now()}`,
        title: "Serie 1",
        order: 1,
        reps: "10",
        intensity: "10/10",
        weight: ""
      }]
    };

    setEditingExercises(prev => [...prev, newExercise]);
    setIsAddExerciseModalVisible(false);
    setSearchQuery('');
  };

  const handleRemoveExerciseInEdit = (exerciseIndex) => {
    Alert.alert(
      'Eliminar Ejercicio',
      '¿Estás seguro de que quieres eliminar este ejercicio?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Eliminar', 
          style: 'destructive', 
          onPress: () => {
            setEditingExercises(prev => prev.filter((_, index) => index !== exerciseIndex));
          }
        }
      ]
    );
  };

  const moveExerciseUp = (index) => {
    if (index > 0) {
      setEditingExercises(prev => {
        const newExercises = [...prev];
        [newExercises[index], newExercises[index - 1]] = [newExercises[index - 1], newExercises[index]];
        return newExercises;
      });
    }
  };

  const moveExerciseDown = (index) => {
    if (index < editingExercises.length - 1) {
      setEditingExercises(prev => {
        const newExercises = [...prev];
        [newExercises[index], newExercises[index + 1]] = [newExercises[index + 1], newExercises[index]];
        return newExercises;
      });
    }
  };

  const updateSetDataOrder = () => {
    try {
      // Reorganize set data to match new exercise order
      const newSetData = {};
      
      editingExercises.forEach((exercise, newIndex) => {
        // Find original index of this exercise
        const originalIndex = workout.exercises.findIndex(ex => ex.id === exercise.id);
        
        if (originalIndex !== -1) {
          // Copy set data from original index to new index
          Object.keys(setData).forEach(key => {
            if (key.startsWith(`${originalIndex}_`)) {
              const setIndex = key.split('_')[1];
              const newKey = `${newIndex}_${setIndex}`;
              newSetData[newKey] = setData[key];
            }
          });
        }
      });
      
      setSetData(newSetData);
      logger.log('✅ Set data order updated successfully');
    } catch (error) {
      logger.error('❌ Error updating set data order:', error);
      // Don't update setData if there's an error
    }
  };

  // Drag and drop handlers
  const handlePanGesture = (event, index) => {
    if (draggedIndex === index) {
      const { translationY } = event.nativeEvent;
      if (dragAnimatedValues[index]) {
        dragAnimatedValues[index].setValue(translationY);
      }
      
      // Update drop zone indicator during drag
      const dropIndex = calculateDropIndex(translationY, index);
      setDropZoneIndex(dropIndex);
      
      // Animate other cards to make space
      animateOtherCards(index, dropIndex);
    }
  };

  const handlePanStateChange = (event, index) => {
    const { state, translationY } = event.nativeEvent;
    
    switch (state) {
      case State.BEGAN:
        setDraggedIndex(index);
        setDropZoneIndex(null);
        // Initialize animated value for this card if it doesn't exist
        if (!dragAnimatedValues[index]) {
          dragAnimatedValues[index] = new Animated.Value(0);
        }
        break;
        
      case State.ACTIVE:
        // Update drag offset for this specific card
        if (dragAnimatedValues[index]) {
          dragAnimatedValues[index].setValue(translationY);
        }
        break;
        
      case State.END:
      case State.CANCELLED:
        logger.log('🎯 Drag ended:', { index, translationY });
        // Calculate drop position and reorder
        const dropIndex = calculateDropIndex(translationY, index);
        if (dropIndex !== null && dropIndex !== index) {
          logger.log('🔄 Triggering reorder:', { from: index, to: dropIndex });
          reorderExercises(index, dropIndex);
        } else {
          logger.log('❌ No reorder needed:', { dropIndex, index });
        }
        
        // Reset drag state
        setDraggedIndex(null);
        setDropZoneIndex(null);
        
        // Reset all card animations
        Object.keys(dragAnimatedValues).forEach(key => {
          if (dragAnimatedValues[key]) {
            Animated.timing(dragAnimatedValues[key], {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start();
          }
        });
        break;
    }
  };

  const calculateDropIndex = (translationY, currentIndex) => {
    const cardHeight = 80; // Approximate card height
    const dragDistance = Math.abs(translationY);
    const direction = translationY > 0 ? 1 : -1;
    
    logger.log('🔍 Drag calculation:', {
      translationY,
      dragDistance,
      direction,
      currentIndex,
      threshold: cardHeight * 0.3
    });
    
    if (dragDistance < cardHeight * 0.3) {
      logger.log('❌ Not enough movement for reorder');
      return null; // Not enough movement
    }
    
    // Calculate how many positions to move based on drag distance
    const positionsToMove = Math.floor(dragDistance / cardHeight);
    let targetIndex = currentIndex + (direction * positionsToMove);
    
    // Clamp target index to valid range (0 to editingExercises.length)
    targetIndex = Math.max(0, Math.min(targetIndex, editingExercises.length));
    
    // Don't allow dropping at the same position
    if (targetIndex === currentIndex) {
      logger.log('❌ Cannot drop at same position');
      return null;
    }
    
    logger.log('✅ Valid drop index:', targetIndex, 'positions moved:', positionsToMove);
    return targetIndex;
  };

  const reorderExercises = (fromIndex, toIndex) => {
    logger.log('🔄 Reordering exercises:', { fromIndex, toIndex });
    setEditingExercises(prev => {
      const newExercises = [...prev];
      const [movedExercise] = newExercises.splice(fromIndex, 1);
      newExercises.splice(toIndex, 0, movedExercise);
      logger.log('✅ Exercise reordered:', {
        movedExercise: movedExercise.name,
        newOrder: newExercises.map(ex => ex.name)
      });
      return newExercises;
    });
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const animateOtherCards = (draggedIndex, dropIndex) => {
    if (dropIndex === null) {
      // Reset all cards to original positions
      Object.keys(dragAnimatedValues).forEach(key => {
        if (parseInt(key) !== draggedIndex && dragAnimatedValues[key]) {
          dragAnimatedValues[key].setValue(0);
        }
      });
      return;
    }

    const cardHeight = 80; // Same as in calculateDropIndex
    const startIndex = Math.min(draggedIndex, dropIndex);
    const endIndex = Math.max(draggedIndex, dropIndex);
    const direction = dropIndex > draggedIndex ? -1 : 1;

    // Animate cards in the affected range
    for (let i = startIndex; i <= endIndex; i++) {
      if (i !== draggedIndex && dragAnimatedValues[i]) {
        if (i < draggedIndex && dropIndex > draggedIndex) {
          // Cards above dragged card move up
          dragAnimatedValues[i].setValue(direction * cardHeight);
        } else if (i > draggedIndex && dropIndex < draggedIndex) {
          // Cards below dragged card move down
          dragAnimatedValues[i].setValue(direction * cardHeight);
        } else {
          // Reset other cards
          dragAnimatedValues[i].setValue(0);
        }
      }
    }
  };

  const adjustCurrentIndicesAfterReorder = () => {
    try {
      // Find new index of current exercise
      const currentExercise = workout.exercises[currentExerciseIndex];
      if (currentExercise) {
        const newIndex = editingExercises.findIndex(ex => ex.id === currentExercise.id);
        if (newIndex !== -1) {
          setCurrentExerciseIndex(newIndex);
          logger.log('✅ Current exercise index updated to:', newIndex);
        } else {
          // Current exercise was removed, go to first exercise
          setCurrentExerciseIndex(0);
          setCurrentSetIndex(0);
          logger.log('✅ Current exercise was removed, reset to first exercise');
        }
      }
    } catch (error) {
      logger.error('❌ Error adjusting current indices:', error);
      // Reset to safe state
      setCurrentExerciseIndex(0);
      setCurrentSetIndex(0);
    }
  };

  const loadAvailableExercises = async () => {
    try {
      setLoadingAvailableExercises(true);
      
      // Get available libraries from course
      const availableLibraries = course.availableLibraries || [];
      logger.log('📚 Loading exercises from libraries:', availableLibraries);
      
      if (availableLibraries.length === 0) {
        logger.log('📚 No available libraries found, setting empty exercises array');
        setAvailableExercises([]);
        setLoadingAvailableExercises(false);
        return;
      }

      // Load exercises from all available libraries
      const exercisePromises = [];
      
      for (const libraryId of availableLibraries) {
        try {
          const libraryDocRef = doc(firestore, 'exercises_library', libraryId);
          const libraryDoc = await getDoc(libraryDocRef);
          
          if (libraryDoc.exists()) {
            const libraryData = libraryDoc.data();
            
            Object.entries(libraryData).forEach(([exerciseName, exerciseData]) => {
              if (exerciseName !== 'creator_name' && exerciseName !== 'creator_id' && exerciseName !== 'created_at') {
                exercisePromises.push({
                  name: exerciseName,
                  description: exerciseData.description || '',
                  video_url: exerciseData.video_url || '',
                  muscle_activation: exerciseData.muscle_activation || {},
                  implements: exerciseData.implements || [],
                  libraryId: libraryId
                });
              }
            });
          }
        } catch (error) {
          logger.error(`❌ Error loading library ${libraryId}:`, error);
        }
      }

      const availableExercises = await Promise.all(exercisePromises);
      
      // Log first exercise to debug
      if (availableExercises.length > 0) {
        logger.log('🔍 First exercise data:', availableExercises[0]);
      }
      
      setAvailableExercises(availableExercises);
      
      logger.log('✅ Loaded available exercises:', availableExercises.length);
    } catch (error) {
      logger.error('❌ Error loading available exercises:', error);
      setAvailableExercises([]);
    } finally {
      setLoadingAvailableExercises(false);
    }
  };

  // Get all unique implements from available exercises
  const allUniqueImplements = useMemo(() => {
    const implementsSet = new Set();
    availableExercises.forEach(exercise => {
      if (exercise.implements && Array.isArray(exercise.implements)) {
        exercise.implements.forEach(impl => {
          if (impl && typeof impl === 'string') {
            implementsSet.add(impl);
          }
        });
      }
    });
    return Array.from(implementsSet).sort();
  }, [availableExercises]);

  // Filter modal handlers
  const handleOpenFilter = () => {
    // Remember that add exercise modal was open
    setWasAddExerciseModalOpen(isAddExerciseModalVisible);
    // Close add exercise modal and open filter modal
    setIsAddExerciseModalVisible(false);
    setTempSelectedMuscles(new Set(selectedMuscles));
    setTempSelectedImplements(new Set(selectedImplements));
    setIsFilterModalVisible(true);
  };

  const handleCloseFilter = () => {
    setIsFilterModalVisible(false);
    // Reopen add exercise modal if it was open before
    if (wasAddExerciseModalOpen) {
      // Small delay to ensure smooth transition
      setTimeout(() => {
        setIsAddExerciseModalVisible(true);
        setWasAddExerciseModalOpen(false);
      }, 100);
    }
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
    // Reopen add exercise modal if it was open before
    if (wasAddExerciseModalOpen) {
      // Small delay to ensure smooth transition
      setTimeout(() => {
        setIsAddExerciseModalVisible(true);
        setWasAddExerciseModalOpen(false);
      }, 100);
    }
  };

  const handleClearAllFilters = () => {
    setSelectedMuscles(new Set());
    setSelectedImplements(new Set());
    setTempSelectedMuscles(new Set());
    setTempSelectedImplements(new Set());
  };

  const checkAllExercisesCompleted = () => {
    if (!workout?.exercises) return false;
    
    return workout.exercises.every((exercise, exerciseIndex) => {
      if (!exercise.sets) return false;
      
      return exercise.sets.every((set, setIndex) => {
        const key = `${exerciseIndex}_${setIndex}`;
        const currentSetData = setData[key] || {};
        
        // Check if at least one measurable field has data
        const measurableFields = Object.keys(set).filter(field => {
          const skipFields = [
            'id', 'order', 'notes', 'description', 'title', 'name',
            'created_at', 'updated_at', 'createdAt', 'updatedAt',
            'type', 'status', 'category', 'tags', 'metadata'
          ];
          return !skipFields.includes(field);
        });
        
        return measurableFields.some(field => {
          const value = currentSetData[field];
          return value !== undefined && value !== null && value !== '';
        });
      });
    });
  };

  const handleEndWorkout = async () => {
    logger.log('🔍 handleEndWorkout called');
    
    // Check for validation errors first
    if (hasValidationErrors()) {
      logger.log('❌ Validation errors detected');
      Alert.alert(
        'Datos Inválidos',
        'Hay campos con datos inválidos. Por favor corrige los errores antes de finalizar el entrenamiento.',
        [{ text: 'OK' }]
      );
      return;
    }

    const isCompleted = checkAllExercisesCompleted();
    logger.log('🔍 Workout completion status:', { isCompleted, hasValidationErrors: hasValidationErrors() });
    
    if (!isCompleted) {
      // Show warning for incomplete workout
      logger.log('⚠️ Workout incomplete - showing confirmation dialog');
      
      // Use web-compatible confirmation on web, Alert.alert on native
      if (isWeb) {
        setConfirmModalConfig({
          title: 'Entrenamiento Incompleto',
          message: '¿Finalizar aunque no esté completo?',
          onConfirm: () => {
            logger.log('✅ User confirmed incomplete workout - proceeding');
            setConfirmModalVisible(false);
            confirmEndWorkout();
          },
          onCancel: () => {
            logger.log('❌ User cancelled incomplete workout');
            setConfirmModalVisible(false);
          },
          confirmText: 'Finalizar',
          cancelText: 'Cancelar',
          isDestructive: true,
        });
        setConfirmModalVisible(true);
        return;
      }
      
      // Native: Use Alert.alert
      Alert.alert(
        'Entrenamiento Incompleto',
        'No has completado todos los ejercicios de esta sesión. ¿Estás seguro de que quieres finalizar y guardar el entrenamiento de todas formas?',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
            onPress: () => logger.log('❌ User cancelled incomplete workout'),
          },
          {
            text: 'Finalizar de Todas Formas',
            style: 'destructive',
            onPress: () => {
              logger.log('✅ User confirmed incomplete workout - proceeding');
              confirmEndWorkout();
            },
          },
        ]
      );
    } else {
      // Workout is complete, proceed normally
      logger.log('✅ Workout complete - proceeding to confirmation');
      confirmEndWorkout();
    }
  };

  const confirmEndWorkout = () => {
    logger.log('🔍 confirmEndWorkout called - showing confirmation dialog');
    
      // Use web-compatible confirmation on web, Alert.alert on native
      if (isWeb) {
        setConfirmModalConfig({
          title: 'Finalizar Entrenamiento',
          message: '¿Guardar y finalizar?',
          onConfirm: async () => {
            logger.log('✅ User confirmed workout completion - starting save process');
            setConfirmModalVisible(false);
            await executeEndWorkout();
          },
          onCancel: () => {
            logger.log('❌ User cancelled workout completion');
            setConfirmModalVisible(false);
          },
          confirmText: 'Finalizar',
          cancelText: 'Cancelar',
        });
        setConfirmModalVisible(true);
        return;
      }
    
    // Native: Use Alert.alert
    Alert.alert(
      'Finalizar Entrenamiento',
      '¿Estás seguro de que quieres finalizar y guardar este entrenamiento?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
          onPress: () => logger.log('❌ User cancelled workout completion'),
        },
        {
          text: 'Finalizar',
          onPress: async () => {
            logger.log('✅ User confirmed workout completion - starting save process');
            await executeEndWorkout();
          },
        },
      ]
    );
  };

  const executeEndWorkout = async () => {
                 try {
                   setIsSavingWorkout(true);
                   logger.log('🏁 Ending workout...');
                   
                   // Get user from useAuth hook, fallback to Firebase auth.currentUser if needed
                   const currentUser = user || auth.currentUser;
                   logger.log('🔍 User check:', {
                     userFromHook: !!user,
                     userUidFromHook: user?.uid,
                     firebaseCurrentUser: !!auth.currentUser,
                     firebaseCurrentUserUid: auth.currentUser?.uid,
                     currentUserToUse: !!currentUser,
                     currentUserUid: currentUser?.uid
                   });
                   
                   if (currentUser?.uid && course?.courseId) {
                     // Save all current exercise data before completing
                     logger.log('💾 Saving all current exercise data...');
                     for (let exerciseIndex = 0; exerciseIndex < workout.exercises.length; exerciseIndex++) {
                       const exercise = workout.exercises[exerciseIndex];
                       const allSets = [];
                       
                       for (let setIndex = 0; setIndex < exercise.sets.length; setIndex++) {
                         const setKey = `${exerciseIndex}_${setIndex}`;
                         const currentSetData = setData[setKey] || {};
                         allSets.push(currentSetData);
                       }
                       
                       await sessionManager.addExerciseData(exercise.id, exercise.name, allSets);
                     }
                     logger.log('✅ All exercise data saved');
                     
                     // Calculate and update 1RM estimates
                     logger.log('🔢 Calculating 1RM estimates after session...');
                     let personalRecords = [];
                     try {
                       personalRecords = await oneRepMaxService.updateEstimatesAfterSession(
                         currentUser.uid,
                         workout.exercises,
                         setData
                       );
                       logger.log('✅ 1RM estimates updated successfully');
                       logger.log('Personal records achieved:', personalRecords.length);
                     } catch (error) {
                       logger.error('❌ Error updating 1RM estimates (continuing anyway):', error);
                       // Don't block session completion on 1RM error
                     }
                     
                    // Complete the session using new session manager
                    // Update workout with actual set data for muscle volume calculation
                    
                    // 🔍 VOLUME DEBUG: Log complete setData before creating workoutWithSetData
                    logger.log('🔍 VOLUME DEBUG: Complete setData before workout completion:', {
                      setDataKeys: Object.keys(setData),
                      setDataValues: Object.entries(setData).map(([key, value]) => ({
                        key,
                        value,
                        hasIntensity: !!value.intensity,
                        intensityValue: value.intensity
                      }))
                    });
                    
                    const workoutWithSetData = {
                      ...workout,
                      exercises: workout.exercises.map((exercise, exerciseIndex) => ({
                        ...exercise,
                        sets: exercise.sets.map((set, setIndex) => {
                          const key = `${exerciseIndex}_${setIndex}`;
                          const actualSetData = setData[key] || {};
                          
                          const processedSet = {
                            ...set,
                            // Use actual user data, but preserve template values for intensity
                            weight: actualSetData.weight || '',
                            reps: actualSetData.reps || '',
                            intensity: actualSetData.intensity || set.intensity || '', // ✅ Preserve template intensity
                            rir: actualSetData.rir || '', // ✅ Add RIR if available
                            // Add any other fields that might be present
                            time: actualSetData.time || '',
                            distance: actualSetData.distance || '',
                            pace: actualSetData.pace || '',
                            heart_rate: actualSetData.heart_rate || '',
                            calories: actualSetData.calories || '',
                            rest_time: actualSetData.rest_time || '',
                            duration: actualSetData.duration || ''
                          };
                          
                          // 🔍 VOLUME DEBUG: Log each processed set
                          logger.log('🔍 VOLUME DEBUG: Processed set:', {
                            exerciseIndex,
                            setIndex,
                            key,
                            originalSet: set,
                            actualSetData,
                            processedSet,
                            hasReps: !!(processedSet.reps && processedSet.reps !== ''),
                            hasWeight: !!(processedSet.weight && processedSet.weight !== ''),
                            hasIntensity: !!(processedSet.intensity && processedSet.intensity !== ''),
                            intensityValue: processedSet.intensity
                          });
                          
                          return processedSet;
                        })
                      }))
                    };
                    
                    // 🔍 VOLUME DEBUG: Log final workoutWithSetData
                    logger.log('🔍 VOLUME DEBUG: Final workoutWithSetData:', {
                      workoutTitle: workoutWithSetData.title,
                      exercisesCount: workoutWithSetData.exercises.length,
                      exercises: workoutWithSetData.exercises.map((exercise, index) => ({
                        exerciseIndex: index,
                        exerciseName: exercise.name,
                        setsCount: exercise.sets.length,
                        sets: exercise.sets.map((set, setIndex) => ({
                          setIndex,
                          reps: set.reps,
                          weight: set.weight,
                          intensity: set.intensity,
                          hasData: !!(set.reps || set.weight),
                          hasIntensity: !!(set.intensity && set.intensity !== '')
                        }))
                      }))
                    });
                    
                    logger.log('💪 Passing workout with actual set data to session service');
                    const result = await sessionService.completeSession(
                      currentUser.uid, 
                      course.courseId, 
                      workoutWithSetData
                    );
                     
                     logger.log('🔍 Session completion result:', { 
                       hasResult: !!result,
                       resultKeys: result ? Object.keys(result) : null,
                       resultType: typeof result
                     });
                     
                     if (result) {
                       const { sessionData, stats, sessionMuscleVolumes } = result;
                       
                       logger.log('✅ Workout completed successfully!');
                       logger.log('💪 Session muscle volumes:', sessionMuscleVolumes);
                       logger.log('🔍 Navigation object:', {
                         hasNavigation: !!navigation,
                         hasNavigate: !!(navigation && typeof navigation.navigate === 'function'),
                         navigationType: typeof navigation
                       });
                       
                       // Navigate to completion screen with session data
                       logger.log('🧭 Navigating to WorkoutCompletion with data:', {
                         hasCourse: !!course,
                         hasWorkout: !!workout,
                         hasSessionData: !!sessionData,
                         hasStats: !!stats,
                         personalRecordsCount: personalRecords?.length || 0,
                         hasSessionMuscleVolumes: !!sessionMuscleVolumes,
                         courseId: course?.courseId,
                         workoutId: workout?.id
                       });
                       
                       try {
                         navigation.navigate('WorkoutCompletion', {
                           course: course,
                           workout: workout,
                           sessionData: sessionData,
                           localStats: stats,
                           personalRecords: personalRecords,
                           sessionMuscleVolumes: sessionMuscleVolumes
                         });
                         logger.log('✅ Navigation.navigate() called successfully');
                       } catch (navError) {
                         logger.error('❌ Navigation error:', navError);
                         Alert.alert('Error', 'No se pudo navegar a la pantalla de finalización.');
                       }
                     } else {
                       logger.error('❌ No session found to complete - result is falsy');
                       if (isWeb) {
                         // Use modal for errors on web
                         setConfirmModalConfig({
                           title: 'Error',
                           message: 'No se encontró una sesión activa para finalizar.',
                           onConfirm: () => setConfirmModalVisible(false),
                           onCancel: () => setConfirmModalVisible(false),
                           confirmText: 'OK',
                           cancelText: '',
                           hideCancel: true,
                         });
                         setConfirmModalVisible(true);
                       } else {
                         Alert.alert('Error', 'No se encontró una sesión activa para finalizar.');
                       }
                     }
                  } else {
                    const currentUser = user || auth.currentUser;
                    logger.error('❌ Missing user or course data:', {
                      userFromHook: !!user,
                      userUidFromHook: user?.uid,
                      firebaseCurrentUser: !!auth.currentUser,
                      firebaseCurrentUserUid: auth.currentUser?.uid,
                      currentUserToUse: !!currentUser,
                      currentUserUid: currentUser?.uid,
                      hasCourse: !!course,
                      hasCourseId: !!course?.courseId
                    });
                    if (isWeb) {
                      // Use modal for errors on web
                      setConfirmModalConfig({
                        title: 'Error',
                        message: 'No se pudo finalizar: faltan datos de usuario o curso.',
                        onConfirm: () => setConfirmModalVisible(false),
                        onCancel: () => setConfirmModalVisible(false),
                        confirmText: 'OK',
                        cancelText: '',
                        hideCancel: true,
                      });
                      setConfirmModalVisible(true);
                    } else {
                      Alert.alert('Error', 'No se pudo finalizar el entrenamiento: datos de usuario o curso faltantes.');
                    }
                  }
                 } catch (error) {
                   logger.error('❌ Error ending workout:', error);
                   logger.error('❌ Error details:', {
                     message: error?.message,
                     stack: error?.stack,
                     name: error?.name
                   });
                   if (isWeb) {
                     // Use modal for errors on web
                     setConfirmModalConfig({
                       title: 'Error',
                       message: 'No se pudo finalizar el entrenamiento. Inténtalo de nuevo.',
                       onConfirm: () => setConfirmModalVisible(false),
                       onCancel: () => setConfirmModalVisible(false),
                       confirmText: 'OK',
                       cancelText: '',
                       hideCancel: true,
                     });
                     setConfirmModalVisible(true);
                   } else {
                     Alert.alert('Error', 'No se pudo finalizar el entrenamiento. Inténtalo de nuevo.');
                   }
                 } finally {
                   setIsSavingWorkout(false);
                 }
  };


  const renderSetHeaders = (set, exercise) => {
    const currentExercise = getCurrentExercise();
    let fieldsToShow = [];
    
    // For list view: Use MEASURES (actual data fields)
    if (currentExercise?.measures && currentExercise.measures.length > 0) {
      fieldsToShow = currentExercise.measures.slice(0, 3);
    } else {
      // Fallback: Parse from set object
      const skipFields = [
        'id', 'order', 'notes', 'description', 'title', 'name',
        'created_at', 'updated_at', 'createdAt', 'updatedAt',
        'type', 'status', 'category', 'tags', 'metadata'
      ];
      
      const measurableFields = Object.keys(set).filter(field => 
        !skipFields.includes(field)
      );

      const sortedFields = measurableFields.sort();
      fieldsToShow = sortedFields.slice(0, 3);
    }
    
    const { evenGap } = calculateEvenGaps(set);

    return fieldsToShow.map((field, fieldIndex) => {
      const fieldName = getFieldDisplayName(field);
      const fieldValue = set[field]?.toString() || '';
      const placeholderText = fieldValue !== undefined && fieldValue !== null && fieldValue !== '' ? fieldValue.toString() : '--';
      const titleWidth = fieldName.length * 8;
      const contentWidth = placeholderText.length * 8;
      const maxWidth = Math.max(titleWidth, contentWidth);
      const extraWidth = fieldsToShow.length === 2 ? 20 : 0; // 20px extra for 2 metrics
      const minWidth = fieldsToShow.length === 2 ? 80 : 60; // Higher minimum for 2 metrics
      const boxWidth = Math.max(maxWidth + 16 + extraWidth, minWidth);
      
      return (
        <View key={field} style={[styles.inputGroup, { 
          width: boxWidth, 
          marginLeft: fieldIndex === 0 ? evenGap : 0,
          marginRight: fieldIndex < fieldsToShow.length - 1 ? evenGap : 0 
        }]}>
          <Text style={styles.headerLabel} numberOfLines={1} ellipsizeMode="tail">
            {fieldName}
          </Text>
        </View>
      );
    });
  };

  const renderSetInputFields = useCallback((exerciseIndex, setIndex, set, currentSetData) => {
    const exercise = workout.exercises[exerciseIndex];
    let fieldsToShow = [];
    
    // For list view: Use MEASURES (actual data fields)
    // This shows the input fields for weight, reps, rir, etc.
    if (exercise?.measures && exercise.measures.length > 0) {
      fieldsToShow = exercise.measures.slice(0, 3);
    } else {
      // Fallback: Parse from set object
    const skipFields = [
      'id', 'order', 'notes', 'description', 'title', 'name',
      'created_at', 'updated_at', 'createdAt', 'updatedAt',
      'type', 'status', 'category', 'tags', 'metadata'
    ];
    
    const measurableFields = Object.keys(set).filter(field => 
      !skipFields.includes(field)
    );

    const sortedFields = measurableFields.sort();
      fieldsToShow = sortedFields.slice(0, 3);
    }

    const { evenGap } = calculateEvenGaps(set);

    return fieldsToShow.map((field, fieldIndex) => {
      const fieldName = getFieldDisplayName(field);
      const objectiveValue = set[field];
      const placeholderText = objectiveValue?.toString() || '--';
      const titleWidth = fieldName.length * 8;
      const contentWidth = placeholderText.length * 8;
      const maxWidth = Math.max(titleWidth, contentWidth);
      const extraWidth = fieldsToShow.length === 2 ? 20 : 0; // 20px extra for 2 metrics
      const minWidth = fieldsToShow.length === 2 ? 80 : 60;
      const boxWidth = Math.max(maxWidth + 16 + extraWidth, minWidth);
      const savedValue = currentSetData[field] || '';
      
      return (
        <View key={`${exerciseIndex}_${setIndex}_${field}`} style={[styles.inputGroup, { 
          width: boxWidth, 
          marginLeft: fieldIndex === 0 ? evenGap : 0,
          marginRight: fieldIndex < fieldsToShow.length - 1 ? evenGap : 0 
        }]}>
          <TextInput
            style={[
              styles.setInput,
              setValidationErrors[`${exerciseIndex}_${setIndex}_${field}`] && styles.setInputError
            ]}
            value={savedValue}
            onChangeText={(value) => updateSetData(exerciseIndex, setIndex, field, value)}
            keyboardType="numeric"
            placeholder={placeholderText}
            placeholderTextColor="rgba(255, 255, 255, 0.5)"
            numberOfLines={1}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            blurOnSubmit={true}
          />
        </View>
      );
    });
  }, [workout, setValidationErrors, updateSetData]);

  const renderExerciseListView = () => {
    return (
      <ScrollView style={styles.exerciseListView} showsVerticalScrollIndicator={false}>
        <View style={styles.exerciseListContent}>
          {/* Spacer for fixed header */}
          <WakeHeaderSpacer />
          
          {/* Exercise Title Section with Edit Button */}
          <View style={styles.exerciseListTitleSection}>
            <Text style={styles.exerciseListTitle}>
              {workout?.title || workout?.name || 'Ejercicios de la Sesión'}
            </Text>
            {isEditMode ? (
              <View style={styles.editModeControls}>
                <TouchableOpacity 
                  style={styles.addExerciseButton}
                  onPress={handleOpenAddExerciseModal}
                >
                  <Text style={styles.addExerciseButtonText}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.saveButton}
                  onPress={handleSaveEditMode}
                >
                  <Text style={styles.saveButtonText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                style={styles.editButton}
                onPress={handleToggleEditMode}
              >
                <Text style={styles.editButtonText}>Editar</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {isEditMode ? (
            // Edit mode: Show simplified exercise cards with drag functionality
            <View style={styles.editModeExerciseList}>
              {editingExercises.map((exercise, exerciseIndex) => {
                const isDragging = draggedIndex === exerciseIndex;
                const showDropLineAbove = dropZoneIndex === exerciseIndex && dropZoneIndex !== draggedIndex;
                const showDropLineBelow = dropZoneIndex === exerciseIndex + 1 && dropZoneIndex !== draggedIndex && dropZoneIndex !== editingExercises.length;
                
                // Initialize animated value for this card if it doesn't exist
                if (!dragAnimatedValues[exerciseIndex]) {
                  dragAnimatedValues[exerciseIndex] = new Animated.Value(0);
                }
                
                const animatedStyle = {
                  transform: [
                    { translateY: dragAnimatedValues[exerciseIndex] },
                    { scale: isDragging ? 1.05 : 1 },
                  ],
                  opacity: isDragging ? 0.8 : 1,
                  zIndex: isDragging ? 1000 : 1,
                };
                
                return (
                  <View key={`exercise-container-${exerciseIndex}-${exercise.id}`}>
                    {/* Drop line above this card */}
                    {showDropLineAbove && (
                      <View style={styles.dropLine} />
                    )}
                    
                    <Animated.View 
                      style={[
                        styles.editModeExerciseCard,
                        isDragging && styles.editModeExerciseCardActive,
                        animatedStyle
                      ]}
                    >
                      <View style={styles.editModeExerciseCardContent}>
                        <PanGestureHandler
                          key={`drag-handle-${exerciseIndex}-${exercise.id}`}
                          onGestureEvent={(event) => handlePanGesture(event, exerciseIndex)}
                          onHandlerStateChange={(event) => handlePanStateChange(event, exerciseIndex)}
                          onActivated={() => handleDragStart(exerciseIndex)}
                        >
                          <Animated.View>
                            <TouchableOpacity 
                              style={styles.dragHandle}
                              activeOpacity={0.7}
                            >
                              <SvgDragVertical width={20} height={20} />
                            </TouchableOpacity>
                          </Animated.View>
                        </PanGestureHandler>
                        
                        <View style={styles.editModeExerciseContent}>
                          <Text style={styles.editModeExerciseName}>{exercise.name}</Text>
                        </View>
                        
                        <TouchableOpacity 
                          style={styles.removeExerciseButton}
                          onPress={() => handleRemoveExerciseInEdit(exerciseIndex)}
                        >
                          <Text style={styles.removeExerciseButtonText}>-</Text>
                        </TouchableOpacity>
                      </View>
                    </Animated.View>
                  </View>
                );
              })}
              
              {/* Drop line below the last card */}
              {dropZoneIndex === editingExercises.length && draggedIndex !== null && (
                <View style={styles.dropLine} />
              )}
              
            </View>
          ) : (
            // Normal mode: Show full exercise items
            workout?.exercises?.map((exercise, exerciseIndex) => {
              const isExpanded = expandedExercises[exerciseIndex];
              return (
                <ExerciseItem
                  key={`exercise-${exerciseIndex}-${exercise.id}`}
                  exercise={exercise}
                  exerciseIndex={exerciseIndex}
                  isExpanded={isExpanded}
                  onToggleExpansion={toggleExerciseExpansion}
                  onOpenSwapModal={handleOpenSwapModal}
                  onAddSet={addSet}
                  onRemoveSet={removeSet}
                  onSelectSet={handleSelectSet}
                  setData={setData}
                  currentExerciseIndex={currentExerciseIndex}
                  currentSetIndex={currentSetIndex}
                  renderSetHeaders={renderSetHeaders}
                  renderSetInputFields={renderSetInputFields}
                />
              );
            })
          )}
          
          {/* End Workout Button */}
          <TouchableOpacity 
            style={[
              styles.endWorkoutButton,
              checkAllExercisesCompleted() && styles.endWorkoutButtonActive,
              hasValidationErrors() && styles.endWorkoutButtonDisabled,
              isEditMode && styles.endWorkoutButtonDisabled
            ]}
            onPress={() => {
              if (!isEditMode) {
                logger.log('🏋️ End workout button pressed');
                handleEndWorkout();
              }
            }}
            disabled={hasValidationErrors() || isSavingWorkout || isEditMode}
          >
            <Text style={[
              styles.endWorkoutButtonText,
              checkAllExercisesCompleted() && styles.endWorkoutButtonTextActive,
              hasValidationErrors() && styles.endWorkoutButtonTextDisabled,
              isSavingWorkout && styles.endWorkoutButtonTextLoading,
              isEditMode && styles.endWorkoutButtonTextDisabled
            ]}>
              {isSavingWorkout ? 'Guardando...' : 'Terminar y guardar'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  const initializeWorkout = async () => {
    const initStartTime = performance.now();
    logger.debug(`[ASYNC] [CHECKPOINT] initializeWorkout() function started - ${initStartTime.toFixed(2)}ms`);
    try {
      setLoading(true);
      
      logger.log('🏋️ Initializing workout with params:', { course: course?.courseId, workout: workout?.id, sessionId });
      logger.log('🏋️ Workout exercises:', workout?.exercises?.length || 0);
      
      // Load previous session data
      const loadDataStartTime = performance.now();
      logger.debug(`[ASYNC] [CHECKPOINT] About to call loadPreviousSessionData() - ${loadDataStartTime.toFixed(2)}ms`);
      await loadPreviousSessionData();
      const loadDataDuration = performance.now() - loadDataStartTime;
      logger.debug(`[ASYNC] [CHECKPOINT] loadPreviousSessionData() returned - took ${loadDataDuration.toFixed(2)}ms`);
      
      // Load 1RM estimates for weight suggestions
      if (user?.uid) {
        const oneRmStartTime = performance.now();
        logger.debug(`[ASYNC] [CHECKPOINT] About to load 1RM estimates - ${oneRmStartTime.toFixed(2)}ms`);
        logger.log('💪 Loading 1RM estimates for user:', user.uid);
        const estimates = await oneRepMaxService.getEstimatesForUser(user.uid);
        const oneRmDuration = performance.now() - oneRmStartTime;
        logger.debug(`[ASYNC] [CHECKPOINT] 1RM estimates loaded - took ${oneRmDuration.toFixed(2)}ms`);
        if (oneRmDuration > 2000) {
          logger.warn(`[ASYNC] ⚠️ SLOW: 1RM estimates took ${oneRmDuration.toFixed(2)}ms (threshold: 2000ms)`);
        }
        setOneRepMaxEstimates(estimates);
        logger.log('✅ 1RM estimates loaded:', Object.keys(estimates).length, 'exercises');
      }
      
      // Start workout session
      const sessionStartTime = performance.now();
      logger.debug(`[ASYNC] [CHECKPOINT] About to start workout session - ${sessionStartTime.toFixed(2)}ms`);
      await startWorkoutSession();
      const sessionDuration = performance.now() - sessionStartTime;
      logger.debug(`[ASYNC] [CHECKPOINT] Workout session started - took ${sessionDuration.toFixed(2)}ms`);
      if (sessionDuration > 2000) {
        logger.warn(`[ASYNC] ⚠️ SLOW: startWorkoutSession() took ${sessionDuration.toFixed(2)}ms (threshold: 2000ms)`);
      }
      
      async function startWorkoutSession() {
      // Check if there's already an active session
        let session = await sessionManager.getCurrentSession();
      
        if (!session) {
        // Start a new workout session if none exists
        logger.log('🏋️ Starting new workout session...');
          const sessionIdValue = workout.sessionId || sessionId;
          
          session = await sessionManager.startSession(
            user.uid,
          course.courseId, 
            sessionIdValue,
            workout.title || 'Workout Session'
        );
        logger.log('✅ New workout session started:', session.sessionId);
      } else {
        logger.log('✅ Using existing active session:', session.sessionId);
      }
      
      setSessionData(session);
      }
      
      // Check for tutorials after workout initializes
      await checkForTutorials();
      
    } catch (error) {
      const totalInitDuration = performance.now() - initStartTime;
      logger.error(`[ASYNC] [ERROR] initializeWorkout() failed after ${totalInitDuration.toFixed(2)}ms:`, error);
      logger.error('❌ Error initializing workout:', error);
    } finally {
      setLoading(false);
      const totalInitDuration = performance.now() - initStartTime;
      logger.debug(`[ASYNC] [CHECKPOINT] initializeWorkout() finished (finally block) - total time: ${totalInitDuration.toFixed(2)}ms`);
      if (totalInitDuration > 10000) {
        logger.warn(`[ASYNC] ⚠️ SLOW: initializeWorkout() took ${totalInitDuration.toFixed(2)}ms (threshold: 10000ms)`);
      }
    }
  };

  const loadPreviousSessionData = async () => {
    const asyncStartTime = performance.now();
    logger.debug(`[ASYNC] [CHECKPOINT] loadPreviousSessionData() started - ${asyncStartTime.toFixed(2)}ms`);
    try {
      logger.log('📖 Loading previous session data from exercise history...');
      
      // Check if user exists before proceeding
      if (!user?.uid) {
        logger.log('⚠️ No user found, skipping exercise history loading');
        const duration = performance.now() - asyncStartTime;
        logger.debug(`[ASYNC] [CHECKPOINT] loadPreviousSessionData() completed early (no user) - took ${duration.toFixed(2)}ms`);
        return;
      }
      
      if (!workout?.exercises || workout.exercises.length === 0) {
        logger.log('⚠️ No exercises found in workout');
        const duration = performance.now() - asyncStartTime;
        logger.debug(`[ASYNC] [CHECKPOINT] loadPreviousSessionData() completed early (no exercises) - took ${duration.toFixed(2)}ms`);
        return;
      }
      
      const exercisesCount = workout.exercises.length;
      logger.debug(`[ASYNC] [CHECKPOINT] Starting exercise history loading for ${exercisesCount} exercises (user: ${user.uid})`);
      
      // Load previous data for each exercise from exercise history
      const exerciseHistoryPromises = workout.exercises.map(async (exercise, index) => {
        const exerciseStartTime = performance.now();
        try {
          // Generate exercise key using libraryId and exercise name (same format as exercise history)
          const libraryId = Object.keys(exercise.primary)[0];
          const exerciseName = exercise.primary[libraryId];
          const exerciseKey = `${libraryId}_${exerciseName}`;
          
          logger.debug(`[ASYNC] [CHECKPOINT] Loading exercise history ${index + 1}/${exercisesCount}: ${exerciseKey} - ${exerciseStartTime.toFixed(2)}ms`);
          logger.log(`📊 Loading exercise history for: ${exerciseKey}`);
          
          // Double-check user exists before making the call
          if (!user?.uid) {
            logger.warn(`[ASYNC] ⚠️ User became null during exercise history loading for ${exerciseKey}`);
            return; // Skip this exercise
          }
          
          // Get exercise history with timeout protection
          const historyStartTime = performance.now();
          const exerciseHistoryData = await Promise.race([
            exerciseHistoryService.getExerciseHistory(user.uid, exerciseKey),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Exercise history request timeout')), 10000)
            )
          ]);
          const historyDuration = performance.now() - historyStartTime;
          logger.debug(`[ASYNC] [CHECKPOINT] Exercise history loaded for ${exerciseKey} - took ${historyDuration.toFixed(2)}ms`);
          
          const sessions = exerciseHistoryData.sessions || [];
          
          if (sessions.length > 0) {
            // Get the most recent session data (first in array since they're sorted by date descending)
            const mostRecentSession = sessions[0];
            
            logger.log(`✅ Found exercise history for ${exerciseKey}:`, {
              sessionCount: sessions.length,
              mostRecentDate: mostRecentSession.date,
              setsCount: mostRecentSession.sets?.length || 0
            });
            
            // Attach previous data to exercise
            exercise.previousData = {
              sets: mostRecentSession.sets || [],
              exerciseName: exerciseName,
              lastPerformed: mostRecentSession.date
            };
          } else {
            logger.log(`ℹ️ No exercise history found for ${exerciseKey}`);
          }
          
          const exerciseDuration = performance.now() - exerciseStartTime;
          logger.debug(`[ASYNC] [CHECKPOINT] Exercise history ${index + 1}/${exercisesCount} completed - took ${exerciseDuration.toFixed(2)}ms`);
          if (exerciseDuration > 2000) {
            logger.warn(`[ASYNC] ⚠️ SLOW: Exercise history ${index + 1} took ${exerciseDuration.toFixed(2)}ms (threshold: 2000ms)`);
          }
        } catch (error) {
          const exerciseDuration = performance.now() - exerciseStartTime;
          logger.error(`[ASYNC] [ERROR] Exercise history ${index + 1}/${exercisesCount} failed after ${exerciseDuration.toFixed(2)}ms:`, error);
          logger.error(`❌ Error loading exercise history for exercise:`, error);
        }
      });
      
      // Wait for all exercise history queries to complete
      const promiseAllStartTime = performance.now();
      logger.debug(`[ASYNC] [CHECKPOINT] Waiting for Promise.all() - ${promiseAllStartTime.toFixed(2)}ms`);
      await Promise.all(exerciseHistoryPromises);
      const promiseAllDuration = performance.now() - promiseAllStartTime;
      logger.debug(`[ASYNC] [CHECKPOINT] Promise.all() completed - took ${promiseAllDuration.toFixed(2)}ms`);
      if (promiseAllDuration > 5000) {
        logger.warn(`[ASYNC] ⚠️ SLOW: Promise.all() took ${promiseAllDuration.toFixed(2)}ms (threshold: 5000ms)`);
      }
      
      logger.log('✅ Exercise history loading completed');
      const totalDuration = performance.now() - asyncStartTime;
      logger.debug(`[ASYNC] [CHECKPOINT] loadPreviousSessionData() completed - total time: ${totalDuration.toFixed(2)}ms`);
      if (totalDuration > 10000) {
        logger.warn(`[ASYNC] ⚠️ SLOW: loadPreviousSessionData() took ${totalDuration.toFixed(2)}ms (threshold: 10000ms)`);
      }
      
    } catch (error) {
      const totalDuration = performance.now() - asyncStartTime;
      logger.error(`[ASYNC] [ERROR] loadPreviousSessionData() failed after ${totalDuration.toFixed(2)}ms:`, error);
      logger.error('❌ Error loading previous session data:', error);
      // Continue without previous data - not critical
    }
  };

  const getCurrentExercise = () => {
    if (!workout?.exercises || workout.exercises.length === 0) return null;
    return workout.exercises[currentExerciseIndex];
  };

  const getCurrentSet = () => {
    const exercise = getCurrentExercise();
    if (!exercise?.sets || exercise.sets.length === 0) return null;
    return exercise.sets[currentSetIndex];
  };

  // Translate metric names to Spanish and capitalize first letter
  const translateMetric = (metric) => {
    if (!metric) return null; // Handle undefined/null metrics
    
    const translations = {
      'weight': 'Peso',
      'reps': 'Repeticiones',
      'rir': 'RIR',
      'duration': 'Duración',
      'distance': 'Distancia',
      'heart_rate': 'Frecuencia Cardíaca',
      'holdTime': 'Tiempo de Mantenimiento',
      'range': 'Rango',
      'pace': 'Ritmo',
      'time': 'Tiempo',
      'calories': 'Calorías',
      'previous': 'Anterior',
      'intensity': 'Intensidad'
    };
    
    const translated = translations[metric.toLowerCase()] || metric;
    return translated.charAt(0).toUpperCase() + translated.slice(1);
  };

  // Get metric value for display cards (handles "previous" specially)
  const getMetricValueForCard = (metricName) => {
    if (!metricName) return '--';
    
    const currentExercise = workout?.exercises?.[currentExerciseIndex];
    if (!currentExercise) return '--';
    
    // Special handling for "previous"
    if (metricName.toLowerCase() === 'previous') {
      const prevSetData = workout.exercises[currentExerciseIndex]?.previousData?.sets?.[currentSetIndex];
      
      if (prevSetData && currentExercise.measures) {
        const parts = [];
        currentExercise.measures.forEach(m => {
          const val = prevSetData[m];
          if (val) {
            let str = val.toString();
            if (m.toLowerCase().includes('weight')) str += 'kg';
            parts.push(str);
          }
        });
        return parts.length > 0 ? parts.join('×') : '--';
      }
      return '--';
    }
    
    // Normal metric - get from current set
    const value = currentExercise.sets?.[currentSetIndex]?.[metricName];
    if (!value) return '--';
    
    const unit = getMetricUnit(metricName);
    return unit ? `${value}${unit}` : value.toString();
  };

  // Get unit for metric
  const getMetricUnit = (metric) => {
    const units = {
      'weight': 'kg',
      'reps': '',
      'rir': '',
      'duration': 'min',
      'distance': 'km',
      'heart_rate': 'bpm',
      'holdTime': 'seg',
      'range': '%',
      'pace': '/km',
      'time': 'min',
      'calories': 'cal'
    };
    
    return units[metric] || '';
  };

  // Get weight suggestion for current set (if available)
  const getWeightSuggestion = () => {
    logger.log('💪 getWeightSuggestion: Checking availability...');
    
    // Check 1: Program has weight suggestions enabled
    if (!course.weight_suggestions) {
      logger.log('  ⏭️ weight_suggestions not enabled in course');
      return null;
    }
    
    // Check 2: Discipline is Fuerza - Hipertrofia (case-insensitive, flexible matching)
    const disciplineStr = course.discipline?.toLowerCase().replace(/\s+/g, '-') || '';
    const isFuerzaHipertrofia = disciplineStr.includes('fuerza') && disciplineStr.includes('hipertrofia');
    
    if (!isFuerzaHipertrofia) {
      logger.log('  ⏭️ Discipline is not Fuerza - Hipertrofia:', course.discipline);
      return null;
    }
    
    logger.log('  ✅ Discipline check passed:', course.discipline);
    
    const exercise = workout.exercises[currentExerciseIndex];
    const set = exercise.sets[currentSetIndex];
    
    logger.log('  📋 Current exercise:', exercise.name);
    logger.log('  📋 Current set:', currentSetIndex + 1);
    
    // Check 3: Set has reps and intensity
    if (!set.reps || !set.intensity) {
      logger.log('  ⏭️ Set missing reps or intensity:', { reps: set.reps, intensity: set.intensity });
      return null;
    }
    
    // Parse objectives
    const objectiveReps = oneRepMaxService.parseReps(set.reps);
    const objectiveIntensity = oneRepMaxService.parseIntensity(set.intensity);
    
    logger.log('  🔢 Parsed objectives:', { objectiveReps, objectiveIntensity });
    
    if (!objectiveIntensity) {
      logger.log('  ⏭️ Invalid intensity format');
      return null;
    }
    
    // Get 1RM estimate for this exercise
    const libraryId = Object.keys(exercise.primary)[0];
    const exerciseName = exercise.primary[libraryId];
    const exerciseKey = `${libraryId}_${exerciseName}`;
    
    logger.log('  🔑 Exercise key:', exerciseKey);
    
    const estimate = oneRepMaxEstimates[exerciseKey]?.current;
    
    logger.log('  💾 1RM estimate from DB:', estimate);
    
    if (!estimate) {
      logger.log('  ⏭️ No 1RM estimate found for this exercise');
      return null;
    }
    
    // Calculate suggestion
    const suggestion = oneRepMaxService.calculateWeightSuggestion(
      estimate,
      objectiveReps,
      objectiveIntensity,
      exercise.muscle_activation
    );
    
    logger.log('  ✅ Weight suggestion calculated:', suggestion);
    return suggestion;
  };

  // Simple validation - just check if it's a valid number
  const validateInput = (value) => {
    if (!value || value.trim() === '') return true; // Empty is valid
    const numValue = parseFloat(value);
    return !isNaN(numValue) && numValue >= 0; // Must be a positive number
  };

  const handleNextSet = () => {
    const exercise = workout?.exercises?.[currentExerciseIndex];
    if (!exercise?.sets) return;

    if (currentSetIndex < exercise.sets.length - 1) {
      setCurrentSetIndex(currentSetIndex + 1);
    } else {
      // Move to next exercise
      if (currentExerciseIndex < workout.exercises.length - 1) {
        setCurrentExerciseIndex(currentExerciseIndex + 1);
        setCurrentSetIndex(0);
      } else {
        // Workout completed
        handleCompleteWorkout();
      }
    }
  };

  const handlePreviousSet = () => {
    if (currentSetIndex > 0) {
      setCurrentSetIndex(currentSetIndex - 1);
    } else if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex(currentExerciseIndex - 1);
      const prevExercise = workout.exercises[currentExerciseIndex - 1];
      setCurrentSetIndex(prevExercise.sets ? prevExercise.sets.length - 1 : 0);
    }
  };

  const handleCompleteWorkout = async () => {
    try {
      logger.log('🏁 Completing workout session...');
      
      if (user?.uid && course?.courseId) {
        // Get current session data
        const currentSession = await sessionManager.getCurrentSession();
        if (currentSession) {
          // Complete the session using new session service
          const result = await sessionService.completeSession(
            user.uid, 
            course.courseId, 
            currentSession
          );
          
          if (result) {
            logger.log('✅ Workout completed successfully!');
            
            // Navigate back to daily workout screen
            navigation.navigate('DailyWorkout', { course });
          } else {
            alert('No se encontró una sesión activa para completar.');
          }
        } else {
          alert('No se pudo completar el entrenamiento: datos de usuario o curso faltantes.');
        }
      }
      
    } catch (error) {
      logger.error('❌ Error completing workout:', error);
      alert('Error al completar el entrenamiento. Inténtalo de nuevo.');
    }
  };

  const renderExerciseInfo = () => {
    const exercise = workout?.exercises?.[currentExerciseIndex];
    if (!exercise) return null;

    return (
      <View style={styles.exerciseInfoCard}>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        
        {/* Exercise Description */}
        {exercise.description && (
          <Text style={styles.exerciseDescription}>{exercise.description}</Text>
        )}
        
        {/* Muscles Targeted */}
        {exercise.muscles && exercise.muscles.length > 0 && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Músculos:</Text>
            <Text style={styles.infoValue}>{exercise.muscles.join(', ')}</Text>
          </View>
        )}
        
        {/* Equipment Needed */}
        {exercise.implements && exercise.implements.length > 0 && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Equipos:</Text>
            <Text style={styles.infoValue}>{exercise.implements.join(', ')}</Text>
          </View>
        )}
        
        {/* Video URL */}
        {exercise.video_url && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Video:</Text>
            <Text style={styles.infoValue}>Disponible</Text>
          </View>
        )}
      </View>
    );
  };

  // Video tap handler
  const handleVideoTap = () => {
    setIsVideoPaused(!isVideoPaused);
  };

  // Video restart handler
  const handleVideoRestart = () => {
    if (videoPlayer) {
      // Defer video operations to avoid blocking
      setTimeout(() => {
      videoPlayer.currentTime = 0;
        const playPromise = videoPlayer.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            if (error.name === 'AbortError') {
              logger.log('ℹ️ Video play() was interrupted (expected behavior)');
            } else {
              logger.error('❌ Error playing video on restart:', error.message);
            }
          });
        }
        // Defer state update to avoid blocking
        startTransition(() => {
      setIsVideoPaused(false);
        });
      }, 0);
    }
  };

  const renderSetInfo = () => {
    const set = getCurrentSet();
    if (!set) return null;

    return (
      <View style={styles.setInfoCard}>
        <Text style={styles.setTitle}>
          Serie {currentSetIndex + 1} de {workout.exercises[currentExerciseIndex].sets.length}
        </Text>
        
        {/* Reps */}
        {set.reps && (
          <View style={styles.setDetailRow}>
            <Text style={styles.setDetailLabel}>Repeticiones:</Text>
            <Text style={styles.setDetailValue}>{set.reps}</Text>
          </View>
        )}
        
        {/* Weight */}
        {set.weight && (
          <View style={styles.setDetailRow}>
            <Text style={styles.setDetailLabel}>Peso:</Text>
            <Text style={styles.setDetailValue}>{set.weight} kg</Text>
          </View>
        )}
        
        {/* RIR (Reps in Reserve) */}
        {set.rir && (
          <View style={styles.setDetailRow}>
            <Text style={styles.setDetailLabel}>RIR:</Text>
            <Text style={styles.setDetailValue}>{set.rir}</Text>
          </View>
        )}
        
        {/* Rest Time */}
        {set.rest_time && (
          <View style={styles.setDetailRow}>
            <Text style={styles.setDetailLabel}>Descanso:</Text>
            <Text style={styles.setDetailValue}>{set.rest_time} seg</Text>
          </View>
        )}
        
        {/* Notes */}
        {set.notes && (
          <View style={styles.setDetailRow}>
            <Text style={styles.setDetailLabel}>Notas:</Text>
            <Text style={styles.setDetailValue}>{set.notes}</Text>
          </View>
        )}
      </View>
    );
  };


  const currentExercise = getCurrentExercise();
  const currentSet = getCurrentSet();

  // Debug: log implements for current exercise
  logger.log('🔧 WorkoutExecutionScreen current exercise implements:', {
    index: currentExerciseIndex,
    name: currentExercise?.name,
    rawImplements: currentExercise?.implements ?? null,
    isArray: Array.isArray(currentExercise?.implements),
    length: Array.isArray(currentExercise?.implements)
      ? currentExercise.implements.length
      : 'n/a',
  });

  // Build muscle activation volumes for current exercise (for silhouette)
  const muscleVolumesForCurrentExercise = useMemo(() => {
    if (!currentExercise?.muscle_activation) return {};
    
    // currentExercise.muscle_activation is expected to be a map: muscleKey -> percentage (0-100)
    // For the silhouette, we normalize percentages to an approximate "sets" value.
    // 0-100% → 0-20 sets (100 / 5 = 20) to align with color thresholds.
    const volumes = {};
    Object.entries(currentExercise.muscle_activation).forEach(([muscle, pct]) => {
      const numeric = typeof pct === 'number' ? pct : parseFloat(pct);
      if (!isNaN(numeric) && numeric > 0) {
        volumes[muscle] = numeric / 5;
      }
    });
    return volumes;
  }, [currentExercise]);


  logger.log('🏋️ Render check:', { 
    loading, 
    currentExercise: currentExercise?.name, 
    currentSet: currentSet?.id,
    workoutExercises: workout?.exercises?.length,
    currentExerciseIndex,
    currentSetIndex
  });

  // TEST VERSION 2: Early returns re-enabled (simple conditionals, shouldn't block)
  // Early returns after all hooks
  if (loading) {
    logger.log('🔄 WorkoutExecutionScreen: Loading state');
    return (
      <View style={styles.container}>
        <FixedWakeHeader />
        <View style={styles.simpleLoadingContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Inicializando entrenamiento...</Text>
        </View>
      </View>
    );
  }

  if (!currentExercise || !currentSet) {
    logger.log('❌ WorkoutExecutionScreen: No exercise or set available');
    return (
      <SafeAreaView style={styles.container}>
        <FixedWakeHeader />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No hay ejercicios disponibles</Text>
          <Text style={styles.errorSubtext}>
            Ejercicios: {workout?.exercises?.length || 0}
          </Text>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  logger.log('🏋️ About to render WorkoutExecutionScreen main content');
  
  // Final checkpoint before render
  const renderStartTime = performance.now();
  const totalComponentTime = renderStartTime - componentStartTime;
  logger.debug(`[RENDER] [CHECKPOINT] About to return JSX - total component time so far: ${totalComponentTime.toFixed(2)}ms`);
  if (totalComponentTime > 1000) {
    logger.warn(`[RENDER] ⚠️ SLOW: Component took ${totalComponentTime.toFixed(2)}ms before render (threshold: 1000ms)`);
  }
  
  // Track mount time on first render
  if (!componentMountTimeRef.current && renderCountRef.current === 1) {
    componentMountTimeRef.current = totalComponentTime;
    logger.debug(`[RENDER] [CHECKPOINT] First render mount time: ${componentMountTimeRef.current.toFixed(2)}ms`);
  }
  
  logger.debug(`[JSX] [CHECKPOINT] Starting JSX return statement - ${performance.now().toFixed(2)}ms`);
  const jsxStartTime = performance.now();
  
  // Track paint events
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      const paintTime = performance.now();
      logger.debug(`[PAINT] [CHECKPOINT] First paint frame - ${paintTime.toFixed(2)}ms (${(paintTime - jsxStartTime).toFixed(2)}ms after JSX start)`);
    });
  }
  
  // TEST VERSION: 13 - Enabling JSX rendering
  const TEST_VERSION = 14;
  const TEST_MODE_ENABLED = false; // Set to false to enable full render
  
  // TEST MODE: If enabled, only render test button
  if (TEST_MODE_ENABLED) {
  return (
    <SafeAreaView style={styles.container}>
        {/* TEST VERSION 1: Test Button Only */}
      <TouchableOpacity 
          style={{
            position: 'absolute',
            bottom: 40,
            left: 0,
            right: 0,
            alignSelf: 'center',
            backgroundColor: '#BFA84D',
            paddingHorizontal: 40,
            paddingVertical: 15,
            borderRadius: 25,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        onPress={() => {
            logger.debug(`[TEST BUTTON] ✅ Button cadl: ${TEST_VERSION}`);
            logger.debug(`[TEST BUTTON] Current time: ${performance.now().toFixed(2)}ms`);
            Alert.alert('Test Version', `Version ${TEST_VERSION}`);
            logger.debug(`[TEST BUTTON] ✅ Alert.alert called`);
          }}
        >
          <Text style={{ color: '#1a1a1a', fontSize: 18, fontWeight: 'bold' }}>
            Test v{TEST_VERSION}
          </Text>
      </TouchableOpacity>
      </SafeAreaView>
    );
  }
  
  // TEST MODE: Original code below (disabled via conditional above)
  // TEST VERSION 1: Everything below is disabled - Minimal test
  // To re-enable, set TEST_MODE_ENABLED to false above
  
  return (
    <SafeAreaView style={styles.container}>
      {(() => {
        const headerStartTime = performance.now();
        logger.debug(`[JSX] [CHECKPOINT] Rendering FixedWakeHeader - ${headerStartTime.toFixed(2)}ms`);
        return null;
      })()}
      {/* Fixed Header without Back Button */}
      <FixedWakeHeader 
        showMenuButton={true}
        onMenuPress={() => {
          logger.log('🏋️ Three-dot menu pressed');
          setIsMenuVisible(true);
        }}
      />
      
      {/* Menu Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isMenuVisible}
        onRequestClose={() => setIsMenuVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setIsMenuVisible(false)}
        >
          <View style={styles.menuModal}>
            <TouchableOpacity
              style={styles.menuOption}
              onPress={() => {
                setIsMenuVisible(false);
                handleDiscardWorkout();
              }}
            >
              <View style={styles.menuOptionContent}>
                <SvgFileRemove width={20} height={20} color="#ffffff" />
                <Text style={styles.menuOptionText}>Salir y Descartar Entrenamiento</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuOptionLast}
              onPress={() => {
                setIsMenuVisible(false);
                handleEndWorkout();
              }}
            >
              <View style={styles.menuOptionContent}>
                <SvgFileUpload width={20} height={20} color="#ffffff" />
                <Text style={styles.menuOptionText}>Guardar y Subir Entrenamiento</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
      
      {/* Set Input Modal */}
      <Modal
        animationType="none"
        transparent={true}
        visible={isSetInputVisible}
        onRequestClose={handleCancelSetInput}
      >
        <TouchableWithoutFeedback onPress={handleCancelSetInput} accessible={false}>
          <Animated.View style={[styles.setInputModalOverlay, { opacity: modalOpacity }]}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} accessible={false}>
              <Animated.View style={[
                styles.setInputModal, 
                { 
                  transform: [{ translateY: modalTranslateY }]
                }
              ]}>
            <KeyboardAvoidingView style={{flex: 1}} behavior="padding" keyboardVerticalOffset={0}>
              <View style={styles.setInputModalHeader}>
                <Text style={styles.setInputModalTitle}>
                  Serie {currentSetIndex + 1} - {workout?.exercises?.[currentExerciseIndex]?.name}
                </Text>
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={handleCancelSetInput}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView 
                style={styles.setInputModalContent}
                contentContainerStyle={{flexGrow: 1, paddingBottom: 300}}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
              {Object.keys(currentSetInputData).map((field) => {
                const fieldValue = currentSetInputData[field] || '';
                const isInvalid = fieldValue !== '' && (fieldValue.trim() === '' || isNaN(parseFloat(fieldValue)) || parseFloat(fieldValue) < 0);
                
                return (
                <View key={`input-field-${currentExerciseIndex}-${currentSetIndex}-${field}`} style={styles.setInputField}>
                  <Text style={styles.setInputFieldLabel}>
                    {getFieldDisplayName(field)}
                  </Text>
                  <TextInput
                      style={[
                        styles.setInputFieldInput,
                        isInvalid && styles.setInputFieldInputError
                      ]}
                      value={fieldValue}
                    onChangeText={(value) => setCurrentSetInputData(prev => ({
                      ...prev,
                      [field]: value
                    }))}
                    keyboardType="numeric"
                    placeholder={`Ingresa ${getFieldDisplayName(field).toLowerCase()}`}
                    placeholderTextColor="rgba(255, 255, 255, 0.5)"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    blurOnSubmit={true}
                  />
                </View>
                );
                })}
              </ScrollView>
              
              <View style={styles.setInputModalFooter}>
                <TouchableOpacity 
                  style={[
                    styles.saveSetButton,
                    !Object.values(currentSetInputData).some(val => val && val.trim() !== '' && !isNaN(parseFloat(val))) && styles.saveSetButtonDisabled
                  ]}
                  onPress={handleSaveSetData}
                  disabled={!Object.values(currentSetInputData).some(val => val && val.trim() !== '' && !isNaN(parseFloat(val)))}
                >
                  <Text style={[
                    styles.saveSetButtonText,
                    !Object.values(currentSetInputData).some(val => val && val.trim() !== '' && !isNaN(parseFloat(val))) && styles.saveSetButtonTextDisabled
                  ]}>
                    Registrar: serie {currentSetIndex + 1} de {getCurrentExercise()?.sets?.length || 0}
                  </Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
              </Animated.View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>
      
      {/* Swipeable Content */}
      {(() => {
        const swipeableStartTime = performance.now();
        logger.debug(`[JSX] [CHECKPOINT] Rendering Swipeable Content section - ${swipeableStartTime.toFixed(2)}ms`);
        return null;
      })()}
      <KeyboardAvoidingView style={{flex: 1}} behavior="padding" keyboardVerticalOffset={0}>
        {(() => {
          const scrollViewStartTime = performance.now();
          logger.debug(`[JSX] [CHECKPOINT] Rendering main ScrollView - ${scrollViewStartTime.toFixed(2)}ms`);
          return null;
        })()}
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={16}
          style={styles.scrollContainer}
        >
            {/* Exercise Detail View */}
        <View style={styles.viewContainer}>
              {(() => {
                const innerScrollStartTime = performance.now();
                logger.debug(`[JSX] [CHECKPOINT] Rendering inner ScrollView - ${innerScrollStartTime.toFixed(2)}ms`);
                return null;
              })()}
              <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                <View style={styles.content}>
                  {/* Spacer for fixed header */}
                  {(() => {
                    const spacerStartTime = performance.now();
                    logger.debug(`[JSX] [CHECKPOINT] Rendering WakeHeaderSpacer - ${spacerStartTime.toFixed(2)}ms`);
                    return null;
                  })()}
                  <WakeHeaderSpacer />
                  
              {/* Exercise Title Section */}
              <View style={styles.exerciseTitleSection}>
                <TouchableOpacity
                  onPress={() => {
                    // Navigate to list view (index 1)
                    if (scrollViewRef.current) {
                      scrollViewRef.current.scrollTo({ x: screenWidth, animated: true });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text 
                    style={styles.exerciseTitle}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {workout?.exercises?.[currentExerciseIndex]?.name || 
                     'Ejercicio'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              {/* Swipeable Top Cards */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                onScroll={onTopCardScroll}
                scrollEventThrottle={16}
                style={styles.topCardsContainer}
                contentContainerStyle={{ gap: 15 }}
                snapToInterval={screenWidth - 33}
                snapToAlignment="start"
                decelerationRate="fast"
              >
                {/* First Card - Video */}
                {(() => {
                  const videoCardStartTime = performance.now();
                  logger.debug(`[JSX] [CHECKPOINT] Rendering Video Card - ${videoCardStartTime.toFixed(2)}ms`);
                  return null;
                })()}
                <View style={[styles.videoCard, videoUri && styles.videoCardNoBorder]}>
                  {videoUri ? (
                  <TouchableOpacity 
                      style={styles.videoContainer}
                      onPress={handleVideoTap}
                      activeOpacity={1}
                    >
                      {(() => {
                        const videoViewStartTime = performance.now();
                        logger.debug(`[JSX] [CHECKPOINT] Rendering VideoView component - ${videoViewStartTime.toFixed(2)}ms`);
                        logger.debug(`[VIDEO] [CHECKPOINT] VideoView props:`, {
                          hasPlayer: !!videoPlayer,
                          videoUri: videoUri?.substring(0, 50) || 'null',
                          isVideoPaused,
                          canStartVideo
                        });
                        return null;
                      })()}
                      <VideoView 
                        player={videoPlayer}
                        style={[styles.video, { opacity: 0.7 }]}
                        contentFit="cover"
                        fullscreenOptions={{ allowed: false }}
                        allowsPictureInPicture={false}
                        nativeControls={false}
                        showsTimecodes={false}
                        onLoadStart={() => {
                          const loadStartTime = performance.now();
                          logger.debug(`[VIDEO] [CHECKPOINT] VideoView onLoadStart - ${loadStartTime.toFixed(2)}ms`);
                        }}
                        onLoad={() => {
                          const loadTime = performance.now();
                          logger.debug(`[VIDEO] [CHECKPOINT] VideoView onLoad - ${loadTime.toFixed(2)}ms`);
                        }}
                        onError={(error) => {
                          const errorTime = performance.now();
                          logger.error(`[VIDEO] [ERROR] VideoView onError at ${errorTime.toFixed(2)}ms:`, error);
                        }}
                      />
                      
                      {/* Play icon overlay */}
                      {isVideoPaused && (
                        <View style={styles.pauseOverlay}>
                          <SvgPlay width={48} height={48} />
                        </View>
                      )}
                      
                      {/* Volume icon overlay - only show when paused */}
                      {isVideoPaused && (
                        <View style={styles.volumeIconContainer}>
                  <TouchableOpacity 
                            style={styles.volumeIconButton}
                            onPress={toggleMute}
                            activeOpacity={0.7}
                          >
                            {isMuted ? (
                              <SvgVolumeOff width={24} height={24} color="white" />
                            ) : (
                              <SvgVolumeMax width={24} height={24} color="white" />
                            )}
                  </TouchableOpacity>
                        </View>
                      )}
                  
                      {/* Restart icon overlay - only show when paused */}
                      {isVideoPaused && (
                        <View style={styles.restartIconContainer}>
                    <TouchableOpacity 
                            style={styles.restartIconButton}
                            onPress={handleVideoRestart}
                            activeOpacity={0.7}
                          >
                            <SvgArrowReload width={24} height={24} color="white" />
                    </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.videoPlaceholder}>
                      <Text style={styles.videoPlaceholderText}>Video no disponible</Text>
                    </View>
                  )}
                </View>
                
                {/* Second Card - Muscle Activation + Implements */}
                <View style={styles.exerciseTitleCard}>
                  {/* Inner content wrapper with padding */}
                  <View style={styles.exerciseTitleCardContent}>
                    {/* Title */}
                    <Text style={styles.instructionsTitle}>Activación muscular</Text>
                  
                  {/* Muscle silhouette with spacing wrapper */}
                  {(() => {
                    const muscleStartTime = performance.now();
                    logger.debug(`[JSX] [CHECKPOINT] Rendering MuscleSilhouetteSVG section - ${muscleStartTime.toFixed(2)}ms`);
                    return null;
                  })()}
                  <View style={styles.muscleSilhouetteWrapper}>
                    <View style={styles.muscleSilhouetteContainerCard}>
                      {muscleVolumesForCurrentExercise && Object.keys(muscleVolumesForCurrentExercise).length > 0 ? (
                        <MuscleSilhouetteSVG
                          muscleVolumes={muscleVolumesForCurrentExercise}
                          useWorkoutExecutionColors={true}
                          height={Math.max(300, screenHeight * 0.38)}
                        />
                      ) : (
                        <View style={styles.muscleEmptyState}>
                          <Text style={styles.muscleEmptyText}>
                            No hay datos de activación muscular para este ejercicio.
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Spacer between muscle silhouette and implements */}
                  <View style={{ 
                    width: '100%', 
                    height: Math.max(20, screenHeight * 0.04), 
                    flexShrink: 0,
                    flexGrow: 0,
                  }} />

                  {/* Implements section (horizontal, styled like "Editar" pill) */}
                  <View style={styles.implementsSection}>
                    <Text style={[styles.instructionsTitle, styles.implementsSubtitle]}>
                      Implementos
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.implementsRow}
                    >
                      {currentExercise?.implements && currentExercise.implements.length > 0 ? (
                        currentExercise.implements.map((impl, index) => (
                          <View
                            key={`${impl}-${index}`}
                            style={[
                              styles.implementsPillContainer,
                              index > 0 && { marginLeft: 10 },
                            ]}
                          >
                            <View style={styles.editButton}>
                              <Text style={styles.editButtonText}>
                                {impl}
                              </Text>
                            </View>
                          </View>
                        ))
                      ) : (
                        <View style={styles.muscleEmptyStateInline}>
                          <Text style={styles.muscleEmptyTextInline}>Sin implementos</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                  </View>
                </View>
              </ScrollView>
              
              {/* Top Cards Pagination Indicators */}
              <View style={styles.topCardsIndicator}>
                {renderTopCardPaginationIndicators()}
      </View>
      
              {/* Objetivos Section */}
              <View style={styles.objetivosSection}>
                <Text style={styles.objetivosTitle}>Objetivos</Text>
              </View>
              
              {/* Dynamic Horizontal Cards Layout */}
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalCardsContainer}
                style={styles.horizontalCardsScrollView}
              >
                {(() => {
                  // Calculate weight suggestion once
                  const suggestion = getWeightSuggestion();
                  const hasWeightSuggestion = suggestion !== null;
                  
                  logger.log('DEBUG: Objectives array:', workout?.exercises?.[currentExerciseIndex]?.objectives);
                  logger.log('DEBUG: Measures array:', workout?.exercises?.[currentExerciseIndex]?.measures);
                  logger.log('DEBUG: Has weight suggestion:', hasWeightSuggestion);
                  
                  // Get all objectives (no filtering)
                  const objectives = workout?.exercises?.[currentExerciseIndex]?.objectives || [];
                  
                  // Sort objectives in specific order: reps, previous, then the rest
                  const sortedObjectives = [...objectives].sort((a, b) => {
                    const order = ['reps', 'previous'];
                    const aIndex = order.indexOf(a.toLowerCase());
                    const bIndex = order.indexOf(b.toLowerCase());
                    
                    // If both are in the priority list, sort by their order
                    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                    // If only a is in the priority list, a comes first
                    if (aIndex !== -1) return -1;
                    // If only b is in the priority list, b comes first
                    if (bIndex !== -1) return 1;
                    // Otherwise, maintain original order
                    return 0;
                  });
                  
                  logger.log('DEBUG: Sorted objectives:', sortedObjectives);
                  
                  return (
                    <>
                      {/* Weight Suggestion Card FIRST (if available) */}
                      {hasWeightSuggestion && (() => {
                        const hasInfo = objectivesInfoService.hasInfo('weight_suggestion');
                        return (
                          <TouchableOpacity
                            key="weight-suggestion"
                            style={styles.horizontalCard}
                            onPress={() => handleObjectiveCardPress('weight_suggestion')}
                            disabled={!hasInfo}
                            activeOpacity={hasInfo ? 0.7 : 1}
                          >
                            <Text style={styles.metricTitle}>Peso Sugerido</Text>
                            <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{suggestion}kg</Text>
                            
                            {/* Info icon indicator */}
                            {hasInfo && (
                              <View style={styles.infoIconContainer}>
                                <SvgInfo width={14} height={14} color="rgba(255, 255, 255, 0.6)" />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })()}
                      
                      {/* Objectives Cards (sorted: reps, previous, then rest) */}
                      {sortedObjectives.map((objective, index) => {
                        const hasInfo = objectivesInfoService.hasInfo(objective);
                        return (
                          <TouchableOpacity
                            key={`objective-${currentExerciseIndex}-${index}-${objective}`}
                            style={styles.horizontalCard}
                            onPress={() => handleObjectiveCardPress(objective)}
                            disabled={!hasInfo}
                            activeOpacity={hasInfo ? 0.7 : 1}
                          >
                            <Text style={styles.metricTitle}>
                              {translateMetric(objective) || 'Objetivo'}
                            </Text>
                            <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                              {getMetricValueForCard(objective)}
                            </Text>
                            
                            {/* Info icon indicator */}
                            {hasInfo && (
                              <View style={styles.infoIconContainer}>
                                <SvgInfo width={14} height={14} color="rgba(255, 255, 255, 0.6)" />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                      
                      {/* Progreso Card */}
                      <TouchableOpacity
                        key="progreso-card"
                        style={styles.horizontalCard}
                        onPress={handleViewExerciseProgress}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.metricTitle}>Progreso</Text>
                        <View style={styles.metricValueContainer}>
                          <SvgChartLine width={28} height={28} color="#ffffff" strokeWidth={2} />
                        </View>
                        
                        {/* Info icon indicator */}
                        <View style={styles.infoIconContainer}>
                          <SvgInfo width={14} height={14} color="rgba(255, 255, 255, 0.6)" />
                        </View>
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </ScrollView>
                  
                  {/* Button Container */}
                  <View style={styles.buttonContainer}>
                    {/* Simple Set Input Button */}
                    <TouchableOpacity 
                      style={[
                        styles.inputSetButton,
                        isEditMode && styles.inputSetButtonDisabled
                      ]}
                      onPress={handleOpenSetInput}
                      disabled={isEditMode}
          >
                      <Text style={[
                        styles.inputSetButtonText,
                        isEditMode && styles.inputSetButtonTextDisabled
                      ]}>
                        Registrar: serie {currentSetIndex + 1} de {workout?.exercises?.[currentExerciseIndex]?.sets?.length || 0}
                      </Text>
                    </TouchableOpacity>
                    
                    {/* List Screen Button */}
          <TouchableOpacity 
                      style={styles.listScreenButton}
                      onPress={() => {
                        // Switch to list view (index 1)
                        if (scrollViewRef.current) {
                          scrollViewRef.current.scrollTo({ x: screenWidth, animated: true });
                        }
                      }}
                    >
                      <SvgListChecklist width={24} height={24} color="rgba(191, 168, 77, 1)" />
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
        </View>
            
            {/* Exercise List View */}
        <View style={styles.viewContainer}>
              {renderExerciseListView()}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
      
      {/* Animated Pagination Indicators */}
      <View style={styles.screenIndicator}>
        {renderPaginationIndicators()}
      </View>

      {/* Swap Exercise Modal */}
      <Modal
        visible={isSwapModalVisible}
        transparent={true}
        animationType="none"
        onRequestClose={handleCloseSwapModal}
      >
        <Animated.View 
          style={[
            styles.swapModalOverlay,
            { opacity: swapModalOpacity }
          ]}
        >
          <Pressable 
            style={styles.swapModalBackdrop}
            onPress={handleCloseSwapModal}
          />
          <Animated.View 
            style={[
              styles.swapModalContainer,
              { transform: [{ translateY: swapModalTranslateY }] }
            ]}
          >
            <View style={styles.swapModalHeader}>
              <Text style={styles.swapModalTitle}>Reemplazos</Text>
          <TouchableOpacity 
                style={styles.swapModalCloseButton}
                onPress={handleCloseSwapModal}
          >
                <Text style={styles.swapModalCloseButtonText}>✕</Text>
          </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.swapModalContent}>
              {/* Current Exercise Section */}
              <View style={styles.currentExerciseSection}>
                <Text style={styles.currentExerciseLabel}>Actual</Text>
          <TouchableOpacity 
                  style={[
                    expandedCardIndex === null ? styles.expandedExerciseCard : styles.compactExerciseCard,
                    expandedCardIndex === null ? styles.expandedCardBorder : styles.compactCardBorder
                  ]}
                  onPress={() => handleCardTap(workout?.exercises?.[currentSwapExerciseIndex], null)}
                >
                  {expandedCardIndex === null ? (
                    <View style={styles.currentExerciseVideoContainer}>
                      {swapModalVideoUri ? (
                        <TouchableOpacity 
                          style={styles.swapModalVideoContainer}
                          onPress={handleSwapModalVideoTap}
                          activeOpacity={1}
                        >
                          <VideoView 
                            player={swapModalVideoPlayer}
                            style={[styles.swapModalVideo, { opacity: 0.7 }]}
                            contentFit="cover"
                            fullscreenOptions={{ allowed: false }}
                            allowsPictureInPicture={false}
                            nativeControls={false}
                            showsTimecodes={false}
                          />
                          
                          {/* Play icon overlay */}
                          {isSwapModalVideoPaused && (
                            <View style={styles.swapModalPauseOverlay}>
                              <SvgPlay width={48} height={48} />
                            </View>
                          )}
                          
                          {/* Volume icon overlay - only show when paused */}
                          {isSwapModalVideoPaused && (
                            <TouchableOpacity
                              style={styles.swapModalVolumeOverlay}
                              onPress={() => toggleMute()}
                            >
                              {isMuted ? (
                                <SvgVolumeOff width={24} height={24} color="#ffffff" />
                              ) : (
                                <SvgVolumeMax width={24} height={24} color="#ffffff" />
                              )}
          </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.currentExerciseVideoPlaceholder}>
                          <Text style={styles.currentExerciseVideoPlaceholderText}>Sin video</Text>
        </View>
                      )}
      </View>
                  ) : null}
                  <View style={styles.exerciseNameContainer}>
                    <Text style={expandedCardIndex === null ? styles.currentExerciseName : styles.alternativeExerciseName}>
                      {workout?.exercises?.[currentSwapExerciseIndex]?.name || 'Ejercicio'}
                    </Text>
                    <TouchableOpacity 
                      style={styles.swapIconButton}
                      onPress={() => handleSwapExercise(workout?.exercises?.[currentSwapExerciseIndex])}
                      activeOpacity={0.7}
                    >
                      <SvgArrowLeftRight width={20} height={20} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={styles.swapModalSubtitle}>
                <Text style={styles.sugerenciasText}>Sugerencias de </Text>
                <Text style={styles.creatorNameText}>{creatorName}</Text>
              </Text>
              
              {loadingAlternatives ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.loadingText}>Cargando alternativas...</Text>
                </View>
              ) : alternativeExercises.length > 0 ? (
                alternativeExercises.map((exercise, index) => (
                  <TouchableOpacity 
                    key={`alternative-${index}-${exercise.libraryId}-${exercise.name}`}
                    style={[
                      expandedCardIndex === index ? styles.expandedExerciseCard : styles.compactExerciseCard,
                      expandedCardIndex === index ? styles.expandedCardBorder : styles.compactCardBorder
                    ]}
                    onPress={() => handleCardTap(exercise, index)}
                  >
                    {expandedCardIndex === index ? (
                      <View style={styles.currentExerciseVideoContainer}>
                        {exercise.video_url ? (
                          <TouchableOpacity 
                            style={styles.swapModalVideoContainer}
                            onPress={handleSwapModalVideoTap}
                            activeOpacity={1}
                          >
                            <VideoView 
                              player={swapModalVideoPlayer}
                              style={[styles.swapModalVideo, { opacity: 0.7 }]}
                              contentFit="cover"
                              fullscreenOptions={{ allowed: false }}
                              allowsPictureInPicture={false}
                              nativeControls={false}
                              showsTimecodes={false}
                            />
                            
                            {/* Play icon overlay */}
                            {isSwapModalVideoPaused && (
                              <View style={styles.swapModalPauseOverlay}>
                                <SvgPlay width={48} height={48} />
                              </View>
                            )}
                            
                            {/* Volume icon overlay - only show when paused */}
                            {isSwapModalVideoPaused && (
                              <TouchableOpacity
                                style={styles.swapModalVolumeOverlay}
                                onPress={() => toggleMute()}
                              >
                                {isMuted ? (
                                  <SvgVolumeOff width={24} height={24} color="#ffffff" />
                                ) : (
                                  <SvgVolumeMax width={24} height={24} color="#ffffff" />
                                )}
                              </TouchableOpacity>
                            )}
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.currentExerciseVideoPlaceholder}>
                            <Text style={styles.currentExerciseVideoPlaceholderText}>Sin video</Text>
                          </View>
                        )}
                      </View>
                    ) : null}
                    <View style={styles.exerciseNameContainer}>
                      <Text style={expandedCardIndex === index ? styles.currentExerciseName : styles.alternativeExerciseName}>
                        {exercise.name}
                      </Text>
                      <TouchableOpacity 
                        style={styles.swapIconButton}
                        onPress={() => handleSwapExercise(exercise)}
                        activeOpacity={0.7}
                      >
                        <SvgArrowLeftRight width={20} height={20} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.noAlternativesContainer}>
                  <Text style={styles.noAlternativesText}>
                    No hay ejercicios alternativos disponibles
                  </Text>
        </View>
              )}
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>
      
      {/* Objective Info Modal */}
      <Modal
        visible={isObjectiveInfoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseObjectiveInfoModal}
      >
        <View style={styles.objectiveInfoModalOverlay}>
          <TouchableOpacity 
            style={styles.objectiveInfoModalBackdrop}
            activeOpacity={1}
            onPress={handleCloseObjectiveInfoModal}
          />
          <View style={styles.objectiveInfoModalContent}>
            <View style={styles.objectiveInfoModalHeader}>
              <Text style={styles.objectiveInfoModalTitle}>
                {selectedObjectiveInfo?.title || ''}
              </Text>
              <TouchableOpacity 
                style={styles.objectiveInfoCloseButton}
                onPress={handleCloseObjectiveInfoModal}
              >
                <Text style={styles.objectiveInfoCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.objectiveInfoScrollContainer}>
              <ScrollView 
                style={styles.objectiveInfoScrollView}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.objectiveInfoModalDescription}>
                  {selectedObjectiveInfo?.description || ''}
                </Text>
                
                {/* Intensity Cards Section */}
                {selectedObjectiveInfo?.title === 'Intensidad' && selectedObjectiveInfo?.hasVideos && (
                  <View style={styles.intensityVideoSection}>
                     <Text style={{
                       color: '#ffffff',
                       fontSize: 16,
                       fontWeight: '600',
                       marginBottom: 10,
                       textAlign: 'left',
                     }}>Cómo debe verse la última repetición para cada intensidad</Text>
                     
                     <Text style={{
                       color: 'rgba(255, 255, 255, 0.8)',
                       fontSize: 14,
                       fontWeight: '400',
                       marginBottom: 16,
                       textAlign: 'left',
                       fontStyle: 'italic',
                     }}>Nota: Las series con intensidad menor a 6 son series de aproximación y su volumen no cuenta para el crecimiento muscular</Text>
                    
                    <View style={styles.intensityCardsContainer}>
                      {[7, 8, 9, 10].map(intensity => (
                        <TouchableOpacity
                          key={intensity}
                          style={{
                            backgroundColor: '#3a3a3a',
                            borderRadius: Math.max(12, screenWidth * 0.04),
                            paddingVertical: Math.max(16, screenHeight * 0.02),
                            paddingHorizontal: Math.max(24, screenWidth * 0.06),
                            marginBottom: Math.max(12, screenHeight * 0.015),
                            flexDirection: 'column',
                            alignItems: 'center',
                            borderWidth: 1,
                            borderColor: 'rgba(255, 255, 255, 0.2)',
                            shadowColor: 'rgba(255, 255, 255, 0.4)',
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 1,
                            shadowRadius: 2,
                            elevation: 2,
                          }}
                          onPress={() => handleIntensityCardPress(intensity)}
                        >
                          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                            <Text style={{color: '#ffffff', fontSize: Math.min(screenWidth * 0.05, 20), fontWeight: '600', textAlign: 'center'}}>{intensity}/10</Text>
                            <SvgChevronLeft 
                              width={20} 
                              height={20} 
                              stroke="#ffffff" 
                              style={[selectedIntensity === intensity ? {transform: [{ rotate: '270deg' }]} : {transform: [{ rotate: '180deg' }]}]}
                            />
                          </View>
                          
                          {/* Video Container - Show when expanded */}
                          {selectedIntensity === intensity && (
                            <View style={{
                              width: '85%',
                              height: 250,
                              borderRadius: Math.max(12, screenWidth * 0.04),
                              overflow: 'hidden',
                              alignSelf: 'center',
                              marginTop: 8,
                            }}>
                              <VideoView 
                                player={intensityVideoPlayer}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  opacity: 0.7,
                                }}
                                contentFit="cover"
                                fullscreenOptions={{ allowed: false }}
                                allowsPictureInPicture={false}
                                nativeControls={false}
                                showsTimecodes={false}
                              />
                              
                              {/* Play/Pause overlay */}
                              {isIntensityVideoPaused && (
                                <TouchableOpacity
                                  style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                  }}
                                  onPress={() => toggleIntensityVideo()}
                                >
                                  <SvgPlay width={48} height={48} />
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                
                {/* Disclaimers Section */}
                {selectedObjectiveInfo?.disclaimers && selectedObjectiveInfo.disclaimers.length > 0 && (
                  <View style={styles.disclaimersSection}>
                    <Text style={styles.disclaimersTitle}>Importante:</Text>
                    {selectedObjectiveInfo.disclaimers.map((disclaimer, index) => (
                      <Text key={index} style={styles.disclaimerText}>
                        • {disclaimer}
                      </Text>
                    ))}
                  </View>
                )}
              </ScrollView>
              
              {/* Scroll indicator */}
              <View style={styles.scrollIndicator}>
                <Text style={styles.scrollIndicatorText}>Desliza</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Tutorial Overlay - Use startTransition for non-urgent rendering */}
      {(() => {
        const tutorialStartTime = performance.now();
        logger.debug(`[JSX] [CHECKPOINT] Rendering TutorialOverlay - ${tutorialStartTime.toFixed(2)}ms`);
        return null;
      })()}
      {tutorialVisible && tutorialData && tutorialData.length > 0 && (
        <React.Suspense fallback={null}>
      <TutorialOverlay
        visible={tutorialVisible}
        tutorialData={tutorialData}
        onClose={handleTutorialClose}
        onComplete={handleTutorialComplete}
      />
        </React.Suspense>
      )}
      
      {/* Confirmation Modal for Web (Alert.alert doesn't work well on web) */}
      {confirmModalVisible && confirmModalConfig && (() => {
        const confirmModalStylesObj = confirmModalStyles(screenWidth, screenHeight);
        return (
          <Modal
            visible={confirmModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {
              confirmModalConfig?.onCancel?.();
            }}
          >
            <View style={confirmModalStylesObj.confirmModalOverlay}>
              <TouchableOpacity 
                style={confirmModalStylesObj.confirmModalBackdrop}
                activeOpacity={1}
                onPress={() => confirmModalConfig?.onCancel?.()}
              />
              <View style={confirmModalStylesObj.confirmModalContent}>
                <Text style={confirmModalStylesObj.confirmModalTitle}>{confirmModalConfig.title}</Text>
                <Text style={confirmModalStylesObj.confirmModalMessage}>{confirmModalConfig.message}</Text>
                <View style={confirmModalStylesObj.confirmModalButtons}>
                  {!confirmModalConfig.hideCancel && (
                    <TouchableOpacity
                      style={[confirmModalStylesObj.confirmModalButton, confirmModalStylesObj.confirmModalButtonCancel]}
                      onPress={() => confirmModalConfig?.onCancel?.()}
                      activeOpacity={0.7}
                    >
                      <Text style={confirmModalStylesObj.confirmModalButtonTextCancel}>
                        {confirmModalConfig.cancelText || 'Cancelar'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      confirmModalStylesObj.confirmModalButton,
                      confirmModalConfig.hideCancel && { flex: 1 },
                      confirmModalConfig.isDestructive 
                        ? confirmModalStylesObj.confirmModalButtonDestructive 
                        : confirmModalStylesObj.confirmModalButtonConfirm
                    ]}
                    onPress={() => confirmModalConfig?.onConfirm?.()}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      confirmModalStylesObj.confirmModalButtonText,
                      confirmModalConfig.isDestructive && confirmModalStylesObj.confirmModalButtonTextDestructive
                    ]}>
                      {confirmModalConfig.confirmText || 'Confirmar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* Loading Overlay for Workout Completion */}
      <Modal
        visible={isSavingWorkout}
        transparent={true}
        animationType="fade"
      >
        <View style={loadingOverlayStyles.overlay}>
          <View style={loadingOverlayStyles.loadingContent}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={loadingOverlayStyles.loadingText}>Guardando entrenamiento</Text>
            <Text style={loadingOverlayStyles.loadingSubtext}>
              Calculando volúmenes y actualizando progreso...
            </Text>
          </View>
        </View>
      </Modal>

      {/* Exercise Detail Modal - Use startTransition for non-urgent rendering */}
      {(() => {
        const exerciseModalStartTime = performance.now();
        logger.debug(`[JSX] [CHECKPOINT] Rendering ExerciseDetailModal - ${exerciseModalStartTime.toFixed(2)}ms`);
        logger.debug(`[JSX] [CHECKPOINT] Modal visibility state:`, {
          isExerciseDetailModalVisible,
          hasModalExerciseData: !!modalExerciseData,
          modalExerciseData
        });
        return null;
      })()}
      {isExerciseDetailModalVisible && modalExerciseData && (
        <React.Suspense fallback={null}>
      <ExerciseDetailModal
        visible={isExerciseDetailModalVisible}
        onClose={handleCloseExerciseDetailModal}
        exerciseKey={modalExerciseData?.exerciseKey || ''}
        exerciseName={modalExerciseData?.exerciseName || ''}
        libraryId={modalExerciseData?.libraryId || ''}
        currentEstimate={modalExerciseData?.currentEstimate || null}
        lastUpdated={modalExerciseData?.lastUpdated || null}
      />
        </React.Suspense>
      )}


      {/* Add Exercise Modal */}
      <Modal
        visible={isAddExerciseModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setIsAddExerciseModalVisible(false);
          setSearchQuery('');
          setExpandedAddExerciseIndex(null);
          setAddExerciseModalVideoUri('');
          setIsAddExerciseModalVideoPaused(true);
          setWasAddExerciseModalOpen(false);
        }}
      >
        <View style={styles.addExerciseModalContainer}>
          <View style={styles.addExerciseModalHeader}>
            <Text style={styles.addExerciseModalTitle}>Agregar Ejercicio</Text>
            <View style={styles.addExerciseModalHeaderActions}>
              <TouchableOpacity
                style={[
                  styles.filterButton,
                  (selectedMuscles.size > 0 || selectedImplements.size > 0) && styles.filterButtonActive
                ]}
                onPress={handleOpenFilter}
              >
                <Text style={[
                  styles.filterButtonText,
                  (selectedMuscles.size > 0 || selectedImplements.size > 0) && styles.filterButtonTextActive
                ]}>
                  Filtros
                  {(selectedMuscles.size > 0 || selectedImplements.size > 0) && (
                    <Text style={styles.filterButtonBadge}>
                      {' '}({selectedMuscles.size + selectedImplements.size})
                    </Text>
                  )}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                setIsAddExerciseModalVisible(false);
                setSearchQuery('');
                setExpandedAddExerciseIndex(null);
                setAddExerciseModalVideoUri('');
                setIsAddExerciseModalVideoPaused(true);
                setWasAddExerciseModalOpen(false);
              }} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Active Filters Display */}
          {(selectedMuscles.size > 0 || selectedImplements.size > 0) && (
            <View style={styles.activeFiltersContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.activeFiltersScroll}>
                {selectedMuscles.size > 0 && Array.from(selectedMuscles).sort().map(muscle => (
                  <TouchableOpacity
                    key={muscle}
                    style={styles.activeFilterChip}
                    onPress={handleOpenFilter}
                  >
                    <Text style={styles.activeFilterChipText}>{getMuscleDisplayName(muscle)}</Text>
                  </TouchableOpacity>
                ))}
                {selectedImplements.size > 0 && Array.from(selectedImplements).sort().map(implement => (
                  <TouchableOpacity
                    key={implement}
                    style={styles.activeFilterChip}
                    onPress={handleOpenFilter}
                  >
                    <Text style={styles.activeFilterChipText}>{implement}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.clearAllFiltersButton}
                  onPress={handleClearAllFilters}
                >
                  <Text style={styles.clearAllFiltersButtonText}>Limpiar todo</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
          
          {/* Search Box */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <SvgSearchMagnifyingGlass 
                width={18} 
                height={18} 
                stroke="#ffffff" 
                strokeWidth={1} 
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar ejercicios..."
                placeholderTextColor="#ffffff"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                blurOnSubmit={true}
              />
            </View>
          </View>
          
          <ScrollView style={styles.addExerciseModalContent}>
            {loadingAvailableExercises ? (
              <ActivityIndicator size="large" color="#BFA84D" />
            ) : filteredAvailableExercises.length > 0 ? (
              filteredAvailableExercises.map((exercise, index) => (
                <AddExerciseCard
                  key={`${exercise.libraryId}_${exercise.name}`}
                  exercise={exercise}
                  index={index}
                  isExpanded={expandedAddExerciseIndex === index}
                  onCardTap={handleAddExerciseCardTap}
                  onVideoTap={handleAddExerciseModalVideoTap}
                  onAddExercise={handleAddExerciseInEdit}
                  isVideoPaused={isAddExerciseModalVideoPaused}
                  isMuted={isMuted}
                  toggleMute={toggleMute}
                />
              ))
            ) : (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateText}>
                  {searchQuery.trim() ? 'No se encontraron ejercicios' : 'No hay ejercicios para añadir'}
                </Text>
                <Text style={styles.emptyStateSubtext}>
                  {searchQuery.trim() 
                    ? `No hay ejercicios que coincidan con "${searchQuery}"`
                    : 'No hay ejercicios disponibles en las librerías configuradas'
                  }
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Filter Modal */}
      <Modal
        visible={isFilterModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseFilter}
        onDismiss={() => {
          // Reopen add exercise modal if it was open before
          if (wasAddExerciseModalOpen) {
            setIsAddExerciseModalVisible(true);
            setWasAddExerciseModalOpen(false);
          }
        }}
      >
        <View style={styles.filterModalContainer}>
          <View style={styles.filterModalHeader}>
            <Text style={styles.filterModalTitle}>Filtrar Ejercicios</Text>
            <TouchableOpacity onPress={handleCloseFilter} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.filterModalContent}>
            {/* Muscle Filter Section */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Músculos</Text>
              <View style={styles.muscleSilhouetteContainer}>
                <MuscleSilhouetteSVG
                  selectedMuscles={tempSelectedMuscles}
                  onMuscleClick={handleToggleMuscle}
                  height={330}
                />
              </View>
              
              {/* Selected Muscles List */}
              {tempSelectedMuscles.size > 0 && (
                <View style={styles.selectedItemsContainer}>
                  {Array.from(tempSelectedMuscles).sort().map(muscle => (
                    <TouchableOpacity
                      key={muscle}
                      style={styles.filterChip}
                      onPress={() => handleToggleMuscle(muscle)}
                    >
                      <Text style={styles.filterChipText}>
                        {getMuscleDisplayName(muscle)}
                      </Text>
                      <Text style={styles.filterChipRemove}>×</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Implement Filter Section */}
            {allUniqueImplements.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Implementos</Text>
                <View style={styles.implementsContainer}>
                  {allUniqueImplements.map(implement => {
                    const isSelected = tempSelectedImplements.has(implement);
                    return (
                      <TouchableOpacity
                        key={implement}
                        style={[
                          styles.implementChip,
                          isSelected && styles.implementChipSelected
                        ]}
                        onPress={() => handleToggleImplement(implement)}
                      >
                        <Text style={[
                          styles.implementChipText,
                          isSelected && styles.implementChipTextSelected
                        ]}>
                          {implement}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Filter Actions */}
          <View style={styles.filterModalActions}>
            <TouchableOpacity
              style={[
                styles.filterClearButton,
                tempSelectedMuscles.size === 0 && tempSelectedImplements.size === 0 && styles.filterButtonDisabled
              ]}
              onPress={handleClearFilter}
              disabled={tempSelectedMuscles.size === 0 && tempSelectedImplements.size === 0}
            >
              <Text style={[
                styles.filterClearButtonText,
                tempSelectedMuscles.size === 0 && tempSelectedImplements.size === 0 && styles.filterButtonTextDisabled
              ]}>
                Limpiar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.filterApplyButton}
              onPress={handleApplyFilter}
            >
              <Text style={styles.filterApplyButtonText}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {(() => {
        const jsxEndTime = performance.now();
        const jsxDuration = jsxEndTime - jsxStartTime;
        logger.debug(`[JSX] [CHECKPOINT] JSX return statement completed - ${jsxEndTime.toFixed(2)}ms (took ${jsxDuration.toFixed(2)}ms)`);
        if (jsxDuration > 100) {
          logger.warn(`[JSX] ⚠️ SLOW: JSX rendering took ${jsxDuration.toFixed(2)}ms (threshold: 100ms)`);
        }
        return null;
      })()}
      {/* TEST VERSION 1: End of original return statement - All code above is disabled when TEST_MODE_ENABLED is true */}
    </SafeAreaView>
  );
};

// Styles function - takes screenWidth and screenHeight as parameters
// This allows styles to be defined at module level while using dimensions from component
const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  swipeWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
      scrollContainer: {
        flex: 1,
  },
  swipeContainer: {
    flex: 1,
    flexDirection: 'row',
    width: screenWidth * 2, // Two screens side by side
  },
  viewContainer: {
    width: screenWidth,
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingTop: Math.max(10, screenHeight * 0.012),
    paddingBottom: Math.max(80, screenHeight * 0.1),
  },
      exerciseTitleSection: {
        marginBottom: Math.max(10, screenHeight * 0.012),
        paddingTop: 0,
        marginTop: Math.max(-15, screenHeight * -0.02)
      },
      exerciseTitle: {
        fontSize: Math.min(screenWidth * 0.08, 32),
        color: '#ffffff',
        fontWeight: '600',
        textAlign: 'left',
        paddingLeft: Math.max(24, screenWidth * 0.06),
      },
      exerciseTitleCard: {
        backgroundColor: '#2a2a2a',
        borderRadius: Math.max(12, screenWidth * 0.04),
        padding: 0, // Match videoCard padding
        marginBottom: 0, // Match videoCard margin
        marginTop: 0, // Match videoCard margin (removed negative margin)
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        shadowColor: 'rgba(255, 255, 255, 0.4)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 2,
        elevation: 2,
        height: Math.max(480, screenHeight * 0.60), // Match videoCard height: 62% of screen height, min 480px
        width: screenWidth - Math.max(48, screenWidth * 0.12), // Match videoCard width
        overflow: 'hidden', // Match videoCard overflow
        position: 'relative', // Match videoCard position
        flexDirection: 'column',
        justifyContent: 'flex-start',
      },
      exerciseTitleCardContent: {
        paddingTop: Math.max(20, screenWidth * 0.05),
        paddingHorizontal: Math.max(20, screenWidth * 0.05),
        paddingBottom: Math.max(10, screenWidth * 0.025),
        width: '100%',
        height: '100%',
      },
      exerciseTitleCardNoPadding: {
        backgroundColor: '#44454B',
        borderRadius: 12,
        padding: 0,
        marginBottom: 0,
        marginTop: 10,
        borderWidth: 0,
        borderColor: 'transparent',
        height: 250, // ← MODIFY THIS LINE TO CHANGE CARD HEIGHT
        width: screenWidth - 48, // Full width minus padding
        overflow: 'hidden',
      },
      video: {
        flex: 1,
        width: '100%',
        height: '100%',
      },
      videoContainer: {
        flex: 1,
        width: '100%',
        height: '100%',
      },
      videoErrorText: {
        fontSize: 16,
        color: '#ffffff',
        textAlign: 'center',
        marginTop: 100,
      },
      videoLoadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#333333',
      },
      videoLoadingText: {
        fontSize: 14,
        color: '#ffffff',
        marginTop: 10,
        opacity: 0.8,
      },
      videoPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#333333',
      },
      videoPlaceholderText: {
        fontSize: 16,
        color: '#ffffff',
        opacity: 0.6,
      },
      instructionsTitle: {
        fontSize: Math.min(screenWidth * 0.05, 20),
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: Math.max(12, screenHeight * 0.015),
      },
      objetivosSection: {
        marginTop: Math.max(-20, screenHeight * -0.025),
        marginBottom: Math.max(15, screenHeight * 0.02),
        paddingLeft: Math.max(24, screenWidth * 0.06),
      },
      objetivosTitle: {
        fontSize: Math.min(screenWidth * 0.05, 20),
        fontWeight: '600',
        color: '#ffffff',
        marginLeft: 0,
      },
      exerciseDescriptionText: {
        fontSize: Math.min(screenWidth * 0.035, 14),
        color: '#ffffff',
        lineHeight: Math.max(22, screenHeight * 0.03),
        textAlign: 'left',
        fontWeight: '500',
      },
      descriptionScrollView: {
        flex: 1,
        paddingBottom: 20, // Add padding to prevent text from being covered
      },
      topGradient: {
    position: 'absolute',
        top: 40,
    left: 0,
    right: 0,
        height: 25,
        backgroundColor: 'rgba(42, 42, 42, 0.9)',
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        zIndex: 1,
      },
      scrollIndicator: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 35,
        backgroundColor: 'rgba(42, 42, 42, 0.9)',
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
    alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 8,
        paddingBottom: 8,
      },
      scrollIndicatorText: {
        fontSize: 11,
        fontWeight: '500',
        color: '#ffffff',
        textAlign: 'center',
      },
      topCardsContainer: {
        marginBottom: Math.max(5, screenHeight * 0.006),
        overflow: 'visible',
      },
      topCardsIndicator: {
    alignItems: 'center',
        marginBottom: Math.max(15, screenHeight * 0.018),
      },
      horizontalCardsScrollView: {
        marginBottom: Math.max(15, screenHeight * 0.018),
        overflow: 'visible',
      },
      horizontalCardsContainer: {
        flexDirection: 'row',
        gap: Math.max(10, screenWidth * 0.025),
        overflow: 'visible',
      },
      horizontalCard: {
        minWidth: Math.max(140, screenWidth * 0.35),
        maxWidth: Math.max(160, screenWidth * 0.4),
        backgroundColor: '#2a2a2a',
        borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        shadowColor: 'rgba(255, 255, 255, 0.4)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 2,
        elevation: 2,
        height: Math.max(80, screenHeight * 0.1),
        justifyContent: 'center',
        alignItems: 'center',
        padding: Math.max(15, screenWidth * 0.04),
        paddingRight: Math.max(25, screenWidth * 0.06), // Extra padding for info icon
      },
      metricTitle: {
        fontSize: Math.min(screenWidth * 0.03, 12),
        fontWeight: '500',
        color: '#ffffff',
        opacity: 0.8,
        textAlign: 'center',
        marginBottom: Math.max(4, screenHeight * 0.005),
      },
      metricValue: {
        fontSize: Math.min(screenWidth * 0.06, 24),
        fontWeight: '600',
        color: '#ffffff',
        textAlign: 'center',
      },
      metricValueContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Math.max(4, screenHeight * 0.005),
      },
      exerciseInfoText: {
        fontSize: 16,
        color: '#ffffff',
        textAlign: 'center',
      },
  screenIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingTop: Math.max(10, screenHeight * 0.012),
    paddingBottom: Math.max(15, screenHeight * 0.018),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Math.max(120, screenHeight * 0.15), // Add space to account for header
  },
  simpleLoadingContainer: {
    position: 'absolute',
    top: Math.max(300, screenHeight * 0.4), // Fixed position from top
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#cccccc',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    marginTop: Math.max(12, screenHeight * 0.015),
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
  },
  errorText: {
    color: '#ff4444',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Math.max(10, screenHeight * 0.012),
  },
  errorSubtext: {
    color: '#cccccc',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  backButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(12, screenHeight * 0.015),
    borderRadius: Math.max(8, screenWidth * 0.02),
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  exerciseInfoCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
    marginBottom: Math.max(20, screenHeight * 0.025),
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  exerciseName: {
    fontSize: Math.min(screenWidth * 0.06, 24),
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  exerciseDescription: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    color: '#cccccc',
    lineHeight: Math.max(22, screenHeight * 0.03),
    marginBottom: Math.max(16, screenHeight * 0.02),
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  infoLabel: {
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '600',
    color: '#888888',
    width: Math.max(80, screenWidth * 0.2),
  },
  infoValue: {
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '400',
    color: '#ffffff',
    flex: 1,
  },
  setInfoCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
    marginBottom: Math.max(24, screenHeight * 0.03),
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  setTitle: {
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '700',
    color: '#007AFF',
    textAlign: 'center',
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  setDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Math.max(8, screenHeight * 0.01),
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  setDetailLabel: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '500',
    color: '#cccccc',
  },
  setDetailValue: {
    fontSize: Math.min(screenWidth * 0.045, 18),
    color: '#ffffff',
    fontWeight: '600',
  },
  navigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Math.max(12, screenWidth * 0.03),
  },
  navButton: {
    flex: 1,
    paddingVertical: Math.max(16, screenHeight * 0.02),
    borderRadius: Math.max(12, screenWidth * 0.04),
    alignItems: 'center',
  },
  previousButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#666666',
  },
  nextButton: {
    backgroundColor: '#007AFF',
  },
  disabledButton: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    color: '#ffffff',
  },
  // Exercise List View Styles
  exerciseListView: {
    flex: 1,
  },
  exerciseListContent: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingTop: Math.max(10, screenHeight * 0.012), // Match main content padding

    paddingBottom: Math.max(100, screenHeight * 0.12), // Account for swipe indicator
  },
  exerciseListTitleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(10, screenHeight * 0.012),
    paddingTop: 0,
    marginTop: 0,
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
  },
  exerciseListTitle: {
    fontSize: Math.min(screenWidth * 0.08, 32),
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'left',
    flex: 1,
  },
  editButtonSection: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    marginBottom: Math.max(15, screenHeight * 0.018),
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  editButtonActive: {
    backgroundColor: '#ff6b6b',
  },

  // Edit Mode Controls Styles
  editModeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // Edit Mode Exercise Card Styles
  editModeExerciseList: {
    // No padding - cards are in the same container as normal exercises
  },
  editModeExerciseCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    marginBottom: Math.max(16, screenHeight * 0.02),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
  },
  editModeExerciseCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    minHeight: Math.max(60, screenHeight * 0.075),
  },
  editModeExerciseCardActive: {
    opacity: 0.8,
    transform: [{ scale: 1.02 }],
  },
  dropLine: {
    height: 3,
    backgroundColor: '#ffffff',
    marginVertical: Math.max(4, screenHeight * 0.005),
    borderRadius: 2,
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  dragHandle: {
    marginRight: Math.max(16, screenWidth * 0.04),
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModeExerciseContent: {
    flex: 1,
    marginRight: 15,
  },
  editModeExerciseName: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    color: '#ffffff',
  },
  removeExerciseButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeExerciseButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Edit Modal Styles
  editModalContainer: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  editModalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
  },
  editModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  editModalContent: {
    flex: 1,
    padding: 20,
  },
  editExerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    marginVertical: 5,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  dragHandleText: {
    color: '#666',
    fontSize: 16,
  },
  editExerciseContent: {
    flex: 1,
  },
  editExerciseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  editExerciseInfo: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  exerciseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  moveButton: {
    backgroundColor: '#444',
    padding: 8,
    borderRadius: 6,
  },
  moveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    padding: Math.max(8, screenWidth * 0.02),
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: Math.min(screenWidth * 0.05, 20),
    color: '#ffffff',
    fontWeight: '600',
  },

  // Add Exercise Modal Styles
  addExerciseModalContainer: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  addExerciseModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingLeft: Math.max(30, screenWidth * 0.12),
  },
  addExerciseModalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addExerciseModalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
  },
  searchContainer: {
    marginBottom: 15,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    paddingVertical: Math.max(12, screenHeight * 0.015),
    marginHorizontal: Math.max(20, screenWidth * 0.05),
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.8,
  },
  addExerciseModalContent: {
    flex: 1,
    padding: 20,
  },
  addExerciseCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    marginBottom: Math.max(16, screenHeight * 0.02),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
  },
  addExerciseCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    minHeight: Math.max(60, screenHeight * 0.075),
  },
  addExerciseContent: {
    flex: 1,
    marginRight: 15,
  },
  addExerciseName: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    color: '#ffffff',
  },
  addExerciseButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 40,
    minHeight: 32,
  },
  addExerciseButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  addExerciseExpandedCard: {
    backgroundColor: '#3a3a3a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(12, screenWidth * 0.03),
    flexDirection: 'column',
    marginBottom: Math.max(12, screenHeight * 0.015),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  addExerciseExpandedCardBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  addExerciseCardBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  addExerciseVideoContainer: {
    width: '85%',
    height: 430, // Same height as swap modal
    borderRadius: Math.max(12, screenWidth * 0.04),
    marginBottom: Math.max(12, screenHeight * 0.015),
    overflow: 'hidden',
    alignSelf: 'center',
  },
  addExerciseVideoWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  addExerciseVideo: {
    width: '100%',
    height: '100%',
  },
  addExerciseVideoPauseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  addExerciseVideoVolumeOverlay: {
    position: 'absolute',
    top: Math.max(12, screenHeight * 0.015),
    right: Math.max(12, screenWidth * 0.03),
    width: Math.max(40, screenWidth * 0.1),
    height: Math.max(40, screenWidth * 0.1),
    borderRadius: Math.max(20, screenWidth * 0.05),
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addExerciseVideoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#666666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addExerciseVideoPlaceholderText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.025, 10),
    fontWeight: '500',
    textAlign: 'center',
  },
  addExerciseExpandedName: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  exerciseOption: {
    backgroundColor: '#2a2a2a',
    marginVertical: 5,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  exerciseOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Filter Button Styles
  filterButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Math.max(8, screenWidth * 0.02),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderColor: '#BFA84D',
  },
  filterButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#BFA84D',
  },
  filterButtonBadge: {
    color: '#BFA84D',
  },
  activeFiltersContainer: {
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeFiltersScroll: {
    flexDirection: 'row',
  },
  activeFilterChip: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Math.max(8, screenWidth * 0.02),
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#BFA84D',
  },
  activeFilterChipText: {
    color: '#BFA84D',
    fontSize: 12,
    fontWeight: '500',
  },
  clearAllFiltersButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Math.max(8, screenWidth * 0.02),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  clearAllFiltersButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  // Filter Modal Styles
  filterModalContainer: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingLeft: Math.max(30, screenWidth * 0.12),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterModalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
  },
  filterModalContent: {
    flex: 1,
    padding: 20,
  },
  filterSection: {
    marginBottom: 30,
  },
  filterSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 15,
  },
  muscleSilhouetteContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  selectedItemsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Math.max(8, screenWidth * 0.02),
    borderWidth: 1,
    borderColor: '#BFA84D',
    gap: 8,
  },
  filterChipText: {
    color: '#BFA84D',
    fontSize: 14,
    fontWeight: '500',
  },
  filterChipRemove: {
    color: '#BFA84D',
    fontSize: 18,
    fontWeight: 'bold',
  },
  implementsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  implementChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Math.max(8, screenWidth * 0.02),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  implementChipSelected: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderColor: '#BFA84D',
  },
  implementChipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  implementChipTextSelected: {
    color: '#BFA84D',
  },
  filterModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    gap: 12,
  },
  filterClearButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 14,
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterClearButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  filterApplyButton: {
    flex: 1,
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    paddingVertical: 14,
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: '#BFA84D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterApplyButtonText: {
    color: '#BFA84D',
    fontSize: 16,
    fontWeight: '600',
  },
  filterButtonDisabled: {
    opacity: 0.5,
  },
  filterButtonTextDisabled: {
    opacity: 0.5,
  },
  exerciseOptionDescription: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  exerciseListItem: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    marginBottom: Math.max(16, screenHeight * 0.02),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
  },
  exerciseCard: {
    flexDirection: 'row',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    alignItems: 'center',
    minHeight: Math.max(60, screenHeight * 0.075),
  },
  exerciseNumber: {
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '700',
    color: '#ffffff',
    marginRight: Math.max(16, screenWidth * 0.04),
    alignSelf: 'center',
  },
  exerciseContent: {
    flex: 1,
  },
  exerciseItemTitle: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    color: '#ffffff',
  },
  exerciseInfo: {
    fontSize: Math.min(screenWidth * 0.03, 12),
    fontWeight: '400',
    color: '#ffffff',
    opacity: 0.8,
  },
  exerciseItemArrow: {
    // Styles for the SVG icon
  },
  arrowButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowRight: {
    transform: [{ rotate: '180deg' }], // ChevronLeft rotated 180deg = pointing right
  },
  arrowDown: {
    transform: [{ rotate: '270deg' }], // ChevronLeft rotated 270deg = pointing down
  },
  setsContainer: {
    paddingTop: 0,
    paddingBottom: Math.max(16, screenHeight * 0.02),
  },
  setTrackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    paddingVertical: Math.max(4, screenHeight * 0.005),
    position: 'relative',
  },
  currentSetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    zIndex: 1,
    pointerEvents: 'none',
  },
  setNumberSpace: {
    width: Math.max(20, screenWidth * 0.05),
    marginRight: Math.max(20, screenWidth * 0.05),
    marginLeft: Math.max(26, screenWidth * 0.065),
  },
  setNumber: {
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    color: '#ffffff',
    marginRight: Math.max(20, screenWidth * 0.05),
    minWidth: Math.max(20, screenWidth * 0.05),
    textAlign: 'left',
  },
  setNumberContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Math.max(8, screenHeight * 0.01),
    paddingHorizontal: Math.max(4, screenWidth * 0.01),
    marginLeft: Math.max(26, screenWidth * 0.065),
  },
  setInputsContainer: {
    flexDirection: 'row',
    flex: 1,
    paddingRight: Math.max(20, screenWidth * 0.05),
  },
  inputGroup: {
    // No padding - boxes should touch each other
  },
  headerLabel: {
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  setInput: {
    backgroundColor: '#3a3a3a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    borderRadius: Math.max(8, screenWidth * 0.02),
    paddingHorizontal: Math.max(8, screenWidth * 0.02),
    paddingVertical: Math.max(6, screenHeight * 0.007),
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    textAlign: 'center',
    flex: 1,
  },
  setInputError: {
    borderColor: '#ff4444',
    borderWidth: 2,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  previousValue: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    color: '#ffffff',
    textAlign: 'left',
    flex: 1,
    paddingVertical: Math.max(6, screenHeight * 0.007),
    paddingHorizontal: Math.max(8, screenWidth * 0.02),
    textAlignVertical: 'center',
  },
  // Left Menu Button Styles (moved to WakeHeader component)
  // Removed - menu button is now integrated in WakeHeader
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingTop: Math.max(100, screenHeight * 0.12), // Position below header
    paddingLeft: Math.max(24, screenWidth * 0.06),
  },
  menuModal: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    paddingVertical: Math.max(8, screenHeight * 0.01),
    minWidth: Math.max(300, screenWidth * 0.5),
    width: 'auto',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuOption: {
    paddingVertical: Math.max(16, screenHeight * 0.02),
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
  },
  menuOptionLast: {
    paddingVertical: Math.max(16, screenHeight * 0.02),
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    // No border for the last item
  },
  menuOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Math.max(12, screenWidth * 0.03),
  },
  menuOptionText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.037, 15),
    fontWeight: '500',
    flex: 1,
  },
  // Set Input Button Styles
  inputSetButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderRadius: Math.max(12, screenWidth * 0.04),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    marginBottom: Math.max(16, screenHeight * 0.02),
    alignItems: 'center',
    borderWidth: 0.2,
    borderColor: '#ffffff',
    // Shadow removed - was causing offset bottom shadow
    shadowOpacity: 0,
    elevation: 0,
  },
  inputSetButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  // Set Input Modal Styles
  setInputModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  setInputModal: {
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: Math.max(20, screenWidth * 0.05),
    borderTopRightRadius: Math.max(20, screenWidth * 0.05),
    maxHeight: '90%',
    minHeight: '80%',
  },
  setInputModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(16, screenHeight * 0.02),
  },
  setInputModalTitle: {
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  setInputModalContent: {
    flex: 1,
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(16, screenHeight * 0.02),
  },
  setInputField: {
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  setInputFieldLabel: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  setInputFieldInput: {
    backgroundColor: '#3a3a3a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    borderRadius: Math.max(8, screenWidth * 0.02),
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    paddingVertical: Math.max(12, screenHeight * 0.015),
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
  },
  setInputFieldInputError: {
    borderColor: '#ff4444',
    borderWidth: 2,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  setInputModalFooter: {
    flexDirection: 'row',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    paddingBottom: Math.max(40, screenHeight * 0.05),
    justifyContent: 'center',
  },
  cancelSetButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666666',
    borderRadius: Math.max(8, screenWidth * 0.02),
    paddingVertical: Math.max(12, screenHeight * 0.015),
    alignItems: 'center',
  },
  cancelSetButtonText: {
    color: '#cccccc',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  saveSetButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderRadius: Math.max(12, screenWidth * 0.04),
    paddingVertical: Math.max(18, screenHeight * 0.022),
    paddingHorizontal: Math.max(40, screenWidth * 0.1),
    alignItems: 'center',
    borderColor: '#ffffff',
    minWidth: Math.max(200, screenWidth * 0.5),
    // Shadow removed - was causing offset bottom shadow
    shadowOpacity: 0,
    elevation: 0,
  },
  saveSetButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  saveSetButtonDisabled: {
    backgroundColor: '#666666',
    opacity: 0.6,
    shadowOpacity: 0,
  },
  saveSetButtonTextDisabled: {
    color: '#cccccc',
  },
  // Video card styles (from WarmupScreen)
  videoCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: 0,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    height: Math.max(480, screenHeight * 0.60), // Responsive height: 62% of screen height, min 500px
    overflow: 'hidden',
    position: 'relative',
    width: screenWidth - Math.max(48, screenWidth * 0.12),
  },
  videoCardNoBorder: {
    borderWidth: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
    borderRadius: Math.max(12, screenWidth * 0.04),
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
  },
  videoPlaceholderText: {
    color: '#cccccc',
    fontSize: Math.min(screenWidth * 0.04, 16),
    textAlign: 'center',
  },
  pauseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  volumeIconContainer: {
    position: 'absolute',
    top: Math.max(12, screenHeight * 0.015),
    right: Math.max(12, screenWidth * 0.03),
    zIndex: 5,
  },
  volumeIconButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: Math.max(16, screenWidth * 0.04),
    padding: Math.max(8, screenWidth * 0.02),
    minWidth: Math.max(32, screenWidth * 0.08),
    minHeight: Math.max(32, screenWidth * 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  restartIconContainer: {
    position: 'absolute',
    top: Math.max(60, screenHeight * 0.075),
    right: Math.max(12, screenWidth * 0.03),
    zIndex: 5,
  },
  restartIconButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: Math.max(16, screenWidth * 0.04),
    padding: Math.max(8, screenWidth * 0.02),
    minWidth: Math.max(32, screenWidth * 0.08),
    minHeight: Math.max(32, screenWidth * 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  // End Workout Button Styles
  endWorkoutButton: {
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    height: Math.max(50, screenHeight * 0.06), // Match purchase button height
    width: Math.max(280, screenWidth * 0.7), // Match purchase button width
    borderRadius: Math.max(12, screenWidth * 0.04),
    marginTop: Math.max(24, screenHeight * 0.03),
    marginBottom: Math.max(20, screenHeight * 0.025),
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    // Shadow removed - was causing offset bottom shadow
    shadowOpacity: 0,
    elevation: 0,
  },
  endWorkoutButtonActive: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    opacity: 1,
    // Shadow removed - was causing offset bottom shadow
    shadowOpacity: 0,
    elevation: 0,
  },
  endWorkoutButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
  },
  endWorkoutButtonText: {
    color: 'rgba(255, 68, 68, 0.8)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
  },
  endWorkoutButtonTextActive: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '700',
  },
  endWorkoutButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
  },
  endWorkoutButtonTextLoading: {
    color: 'rgba(191, 168, 77, 0.8)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
  },
  // Button container for horizontal layout
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Math.max(10, screenWidth * 0.025),
  },
  // Main save button
  inputSetButton: {
    flex: 1,
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderRadius: Math.max(12, screenWidth * 0.04),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow removed - was causing offset bottom shadow
    shadowOpacity: 0,
    elevation: 0,
  },
  inputSetButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    textAlign: 'center',
  },
  inputSetButtonDisabled: {
    backgroundColor: '#666666',
    opacity: 0.6,
    shadowOpacity: 0,
  },
  inputSetButtonTextDisabled: {
    color: '#cccccc',
  },
  // Small list screen button
  listScreenButton: {
    width: Math.max(60, screenWidth * 0.15),
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderRadius: Math.max(12, screenWidth * 0.04),
    paddingVertical: Math.max(14, screenHeight * 0.017),
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow removed - was causing offset bottom shadow
    shadowOpacity: 0,
    elevation: 0,
  },
  // Exercise controls row
  exerciseControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(12, screenHeight * 0.015),
    marginHorizontal: Math.max(16, screenWidth * 0.04),
  },
  // Swap exercise button
  swapExerciseButton: {
    backgroundColor: '#3a3a3a',
    borderRadius: Math.max(8, screenWidth * 0.02),
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    paddingVertical: Math.max(8, screenHeight * 0.01),
    flexDirection: 'row',
    alignItems: 'center',
    gap: Math.max(8, screenWidth * 0.02),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  swapExerciseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '600',
  },
  // Set control buttons
  setControlButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Math.max(8, screenWidth * 0.02),
  },
  setControlButton: {
    backgroundColor: '#3a3a3a',
    borderRadius: Math.max(8, screenWidth * 0.02),
    padding: Math.max(8, screenWidth * 0.02),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: Math.max(32, screenWidth * 0.08),
    minHeight: Math.max(32, screenWidth * 0.08),
  },
  setControlButtonDisabled: {
    backgroundColor: '#2a2a2a',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowOpacity: 0,
    elevation: 0,
  },
  // Swap modal styles
  swapModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  swapModalBackdrop: {
    flex: 1,
  },
  swapModalContainer: {
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: Math.max(20, screenWidth * 0.05),
    borderTopRightRadius: Math.max(20, screenWidth * 0.05),
    height: '90%',
    maxHeight: Math.max(800, screenHeight * 0.8),
  },
  swapModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(20, screenHeight * 0.025),
  },
  swapModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.06, 24),
    fontWeight: '600',
    paddingLeft: Math.max(20, screenWidth * 0.05),
  },
  swapModalCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapModalCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  swapModalContent: {
    flex: 1,
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingTop: Math.max(20, screenHeight * 0.025),
  },
  swapModalSubtitle: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    marginBottom: Math.max(18, screenHeight * 0.022),
    opacity: 1,
    paddingLeft: Math.max(20, screenWidth * 0.05),
  },
  sugerenciasText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
  },
  creatorNameText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  currentExerciseSection: {
    marginBottom: Math.max(24, screenHeight * 0.03),
  },
  currentExerciseLabel: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    marginBottom: Math.max(12, screenHeight * 0.015),
    opacity: 1,
    paddingLeft: Math.max(20, screenWidth * 0.05),
  },
  // Card styles
  expandedExerciseCard: {
    backgroundColor: '#3a3a3a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(12, screenWidth * 0.03),
    flexDirection: 'column',
    marginBottom: Math.max(12, screenHeight * 0.015),
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  compactExerciseCard: {
    backgroundColor: '#3a3a3a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    marginBottom: Math.max(12, screenHeight * 0.015),
    flexDirection: 'column',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  expandedCardBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  compactCardBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  exerciseNameContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  swapIconButton: {
    backgroundColor: '#44454B',
    borderRadius: Math.max(20, screenWidth * 0.05),
    width: Math.max(40, screenWidth * 0.1),
    height: Math.max(40, screenWidth * 0.1),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  currentExerciseVideoContainer: {
    width: '85%',
    height: 430, // Original height
    borderRadius: Math.max(12, screenWidth * 0.04),
    marginBottom: Math.max(12, screenHeight * 0.015),
    overflow: 'hidden',
    alignSelf: 'center',
  },
  currentExerciseVideo: {
    width: '100%',
    height: '100%',
  },
  currentExerciseVideoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#666666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentExerciseVideoPlaceholderText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.025, 10),
    fontWeight: '500',
    textAlign: 'center',
  },
  swapModalVideoContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  swapModalVideo: {
    width: '100%',
    height: '100%',
  },
  swapModalPauseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  swapModalVolumeOverlay: {
    position: 'absolute',
    top: Math.max(12, screenHeight * 0.015),
    right: Math.max(12, screenWidth * 0.03),
    width: Math.max(40, screenWidth * 0.1),
    height: Math.max(40, screenWidth * 0.1),
    borderRadius: Math.max(20, screenWidth * 0.05),
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentExerciseContent: {
    width: '100%',
  },
  currentExerciseName: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  alternativeExerciseContent: {
    flex: 1,
  },
  alternativeExerciseName: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Math.max(40, screenHeight * 0.05),
  },
  loadingText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    marginTop: Math.max(12, screenHeight * 0.015),
    opacity: 0.8,
  },
  noAlternativesContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Math.max(40, screenHeight * 0.05),
  },
  noAlternativesText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    opacity: 0.6,
    textAlign: 'center',
  },
  // Info icon container (top-right of objective cards)
  infoIconContainer: {
    position: 'absolute',
    top: Math.max(8, screenHeight * 0.01),
    right: Math.max(8, screenWidth * 0.02),
    zIndex: 10,
  },
  // Objective Info Modal Styles
  objectiveInfoModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  objectiveInfoModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  objectiveInfoModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    width: Math.max(350, screenWidth * 0.9),
    maxWidth: 400,
    height: Math.max(500, screenHeight * 0.7),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
  },
  
  objectiveInfoScrollContainer: {
    flex: 1,
    position: 'relative',
  },
  
  objectiveInfoScrollView: {
    flex: 1,
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
  },
  objectiveInfoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  objectiveInfoModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.055, 22),
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
    paddingLeft: Math.max(25, screenWidth * 0.06),
    paddingTop: Math.max(25, screenHeight * 0.03),
  },
  objectiveInfoCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Math.max(12, screenWidth * 0.03),
    marginRight: Math.max(10, screenWidth * 0.03),
    marginTop: Math.max(5, screenHeight * 0.01),
  },
  objectiveInfoCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  objectiveInfoModalDescription: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    lineHeight: Math.max(24, screenHeight * 0.03),
    opacity: 0.9,
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  disclaimersSection: {
    marginTop: Math.max(20, screenHeight * 0.025),
    paddingTop: Math.max(16, screenHeight * 0.02),
    paddingBottom: Math.max(100, screenHeight * 0.12), // Added bottom padding for desliza overlay
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  disclaimersTitle: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginBottom: Math.max(12, screenHeight * 0.015),
  },
  disclaimerText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '400',
    lineHeight: Math.max(20, screenHeight * 0.025),
    opacity: 0.8,
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  scrollIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 35,
    backgroundColor: 'rgba(42, 42, 42, 0.9)',
    borderBottomLeftRadius: Math.max(16, screenWidth * 0.04),
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  scrollIndicatorText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
  },
});

// Add loading overlay styles
// Confirmation Modal Styles - Simplified and improved UI
const confirmModalStyles = (screenWidth, screenHeight) => StyleSheet.create({
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
  },
  confirmModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  confirmModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(20, screenWidth * 0.05),
    padding: Math.max(32, screenWidth * 0.08),
    width: '100%',
    maxWidth: Math.min(screenWidth * 0.85, 360),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: 'rgba(255, 255, 255, 0.3)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 8,
    alignItems: 'center',
  },
  confirmModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.065, 26),
    fontWeight: '700',
    marginBottom: Math.max(20, screenHeight * 0.025),
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  confirmModalMessage: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '500',
    marginBottom: Math.max(32, screenHeight * 0.04),
    textAlign: 'center',
    lineHeight: Math.max(24, screenHeight * 0.03),
  },
  confirmModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Math.max(16, screenWidth * 0.04),
    width: '100%',
  },
  confirmModalButton: {
    flex: 1,
    paddingVertical: Math.max(12, screenHeight * 0.015),
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    borderRadius: Math.max(12, screenWidth * 0.03),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    minHeight: Math.max(44, screenHeight * 0.055),
  },
  confirmModalButtonCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  confirmModalButtonConfirm: {
    backgroundColor: 'rgba(191, 168, 77, 0.25)',
    borderColor: 'rgba(191, 168, 77, 0.7)',
  },
  confirmModalButtonDestructive: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderColor: 'rgba(255, 59, 48, 0.6)',
  },
  confirmModalButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
  },
  confirmModalButtonTextCancel: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
  },
  confirmModalButtonTextDestructive: {
    color: 'rgba(255, 59, 48, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
  },
});

const createLoadingOverlayStyles = (screenWidth, screenHeight) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(15, screenWidth * 0.04),
    padding: Math.max(30, screenWidth * 0.08),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginTop: 15,
  },
  loadingSubtext: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '400',
    marginTop: 8,
    textAlign: 'center',
  },
  
  // Intensity Cards - Exact copy of swap modal compactExerciseCard
  intensityVideoSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
  },
  
  intensityVideoTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  
  
  intensityCard: {
    backgroundColor: '#3a3a3a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    marginBottom: Math.max(12, screenHeight * 0.015),
    flexDirection: 'column',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  
  intensityCardExpanded: {
    // Expanded state - same as normal card
  },
  
  intensityCardLabel: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  
  intensityCardVideoContainer: {
    width: '85%',
    height: 250,
    borderRadius: Math.max(12, screenWidth * 0.04),
    overflow: 'hidden',
    alignSelf: 'center',
    marginTop: 8,
  },
  
  intensityCardVideo: {
    width: '100%',
    height: '100%',
    opacity: 0.7,
  },
  
  intensityVideoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },

  muscleSilhouetteWrapper: {
    width: '100%',
    marginBottom: 0,
    paddingBottom: 0,
    // GPU acceleration hints for better paint performance
    transform: [{ translateZ: 0 }], // Promote to GPU layer
  },
  // Muscle activation card styles
  muscleSilhouetteContainerCard: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
    paddingBottom: 0,
    // GPU acceleration hints for better paint performance
    transform: [{ translateZ: 0 }], // Promote to GPU layer
    height: Math.max(350, screenHeight * 0.42), // Match SVG height, responsive
    flexShrink: 0,
  },
  muscleEmptyState: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    minHeight: 280,
  },
  muscleEmptyText: {
    color: '#cccccc',
    fontSize: Math.min(screenWidth * 0.035, 14),
    textAlign: 'center',
  },
  muscleToImplementsSpacer: {
    width: '100%',
    height: Math.max(80, screenHeight * 0.1),
    flexShrink: 0,
    flexGrow: 0,
    backgroundColor: 'rgba(255, 0, 0, 0.2)', // Temporary - to verify it's rendering
  },
  // Implements section under silhouette
  implementsSection: {
    marginTop: 0,
    paddingTop: 0,
    width: '100%',
    marginBottom: 0,
    paddingBottom: 0,
    flexShrink: 0,
  },
  implementsSubtitle: {
    marginTop: 0,
    marginBottom: 12,
    paddingLeft: 0,
  },
  implementsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingRight: 8,
  },
  implementsPillContainer: {
    marginBottom: 0,
  },
  implementsPill: {
    // Override some spacing to reuse editButton visual style
    alignSelf: 'flex-start',
  },
  implementsPillText: {
    // Slight tweak if needed later (currently just inherit editButtonText)
  },
  muscleEmptyStateInline: {
    paddingHorizontal: Math.max(10, screenWidth * 0.025),
    paddingVertical: Math.max(6, screenHeight * 0.007),
  },
  muscleEmptyTextInline: {
    color: '#cccccc',
    fontSize: Math.min(screenWidth * 0.035, 14),
  },
});

export default WorkoutExecutionScreen;
