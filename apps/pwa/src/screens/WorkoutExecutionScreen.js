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
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
  Dimensions,
  Animated,
  Easing,
  Modal,
  Pressable,
  Alert,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  TouchableWithoutFeedback,
  Vibration,
  PanResponder,
} from 'react-native';

// Essential hooks and utilities - keep as direct imports (lightweight)
import { useAuth } from '../contexts/AuthContext';
import { useVideo } from '../contexts/VideoContext';
import { isWeb, isPWA } from '../utils/platform';
import logger from '../utils/logger.js';
import VideoCardWebWrapper from '../components/VideoCardWebWrapper';
import VideoOverlayWebWrapper from '../components/VideoOverlayWebWrapper';
import { detectVideoSource, getEmbedUrl } from '../utils/videoUtils';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStyles, confirmModalStyles, createLoadingOverlayStyles } from './WorkoutExecutionScreen.styles';
import { useAccentFromImage } from '../hooks/hoy/useAccentFromImage';

// Gesture handler and video - expo-video (VideoView + useVideoPlayer) with custom overlay UI on all platforms
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { VideoView, useVideoPlayer } from 'expo-video';
import WakeLoader from '../components/WakeLoader';

// Firebase - keep as direct imports (lightweight)
import { auth } from '../config/firebase';

// ============================================================================
// LAZY LOADERS - Services (loaded only when needed)
// ============================================================================
const getSessionManager = () => {
  const startTime = performance.now();
  try {
    const service = require('../services/sessionManager').default;
    const duration = performance.now() - startTime;
    // Only log if slow (performance issue)
    if (duration > 50) {
    }
    return service;
  } catch (error) {
    logger.error(`[ERROR] sessionManager failed:`, error);
    throw error;
  }
};

const getSessionService = () => {
  const startTime = performance.now();
  try {
    const service = require('../services/sessionService').default;
    const duration = performance.now() - startTime;
    if (duration > 50) {
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
  try {
    const service = require('../services/tutorialManager').default;
    const duration = performance.now() - startTime;
    if (duration > 50) {
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
    return {
      getExerciseVideoPath: () => null, // Return null to use fallback URL
      getSessionImagePath: () => null,
      getProgramImagePath: () => null,
    };
  }
  
  const startTime = performance.now();
  try {
    const service = require('../services/programMediaService').default;
    const duration = performance.now() - startTime;
    if (duration > 50) {
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
  try {
    const service = require('../services/videoCacheService').default;
    const duration = performance.now() - startTime;
    if (duration > 50) {
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
  try {
    const service = require('../services/objectivesInfoService').default;
    const duration = performance.now() - startTime;
    if (duration > 50) {
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
  try {
    const service = require('../services/exerciseLibraryService').default;
    const duration = performance.now() - startTime;
    if (duration > 50) {
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] exerciseLibraryService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getOneRepMaxService = () => {
  const startTime = performance.now();
  try {
    const service = require('../services/oneRepMaxService').default;
    const duration = performance.now() - startTime;
    if (duration > 50) {
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
  try {
    const service = require('../services/appResourcesService').default;
    const duration = performance.now() - startTime;
    if (duration > 50) {
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
  try {
    const service = require('../services/assetBundleService').default;
    const duration = performance.now() - startTime;
    if (duration > 50) {
    }
    return service;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(`[TIMING] [ERROR] assetBundleService failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
};

const getMonitoringService = () => {
  const noop = () => {};
  return { trackScreenView: noop, trackWorkoutStarted: noop, trackWorkoutCompleted: noop };
};

// ============================================================================
// COMPONENTS - Direct imports (like working screens: MainScreen, CourseDetailScreen)
// ============================================================================
// Components are imported directly since they no longer block (Dimensions.get moved inside)
import TutorialOverlay from '../components/TutorialOverlay';
import ExerciseDetailModal from '../components/ExerciseDetailModal';
import { FixedWakeHeader, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import MuscleSilhouetteSVG from '../components/MuscleSilhouetteSVG';
import analyticsService from '../services/analyticsService';

// ============================================================================
// ICONS - Direct imports (like working screens)
// ============================================================================
import SvgPlay from '../components/icons/SvgPlay';
import SvgVolumeMax from '../components/icons/SvgVolumeMax';
import SvgVolumeOff from '../components/icons/SvgVolumeOff';
import SvgArrowReload from '../components/icons/SvgArrowReload';
import SvgListChecklist from '../components/icons/SvgListChecklist';
import SvgTimer from '../components/icons/vectors_fig/Calendar/Timer';
import SvgArrowLeftRight from '../components/icons/SvgArrowLeftRight';
import SvgPlus from '../components/icons/SvgPlus';
import SvgMinus from '../components/icons/SvgMinus';
import SvgInfo from '../components/icons/SvgInfo';
import SvgEditPencil from '../components/icons/SvgEditPencil';
import SvgChartLine from '../components/icons/SvgChartLine';
import SvgDragVertical from '../components/icons/SvgDragVertical';
import SvgSearchMagnifyingGlass from '../components/icons/vectors_fig/Interface/SearchMagnifyingGlass';
import SvgChevronLeft from '../components/icons/vectors_fig/Arrow/ChevronLeft';
import SvgFileRemove from '../components/icons/vectors_fig/File/FileRemove';
import SvgFileUpload from '../components/icons/vectors_fig/File/FileUpload';
import SvgCamera from '../components/icons/vectors_fig/System/Camera';
import VideoExchangeOverlay from '../components/videoExchange/VideoExchangeOverlay.web';
// SvgCamera used inside the Notas y videos modal and the register modal.
import Svg, { Defs, G, Text as SvgText, Filter, FeGaussianBlur } from 'react-native-svg';
import { wakeAlert } from '../utils/wakeAlert';

// ============================================================================
// LAZY LOADERS - Constants (loaded only when needed)
// ============================================================================
const getMuscleConstants = () => {
  const startTime = performance.now();
  try {
    const constants = require('../constants/muscles');
    const duration = performance.now() - startTime;
    if (duration > 50) {
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

// Merge in-flight input values (typed but not yet flushed to setData via blur)
// over a setData snapshot. Used at every persistence point so a value that never
// fired onBlur — row unmounted, app backgrounded, iOS PWA swallowed the blur — is
// still saved instead of silently dropped.
const mergeSetData = (base, pending) => {
  const keys = pending ? Object.keys(pending) : [];
  if (keys.length === 0) return base;
  const next = { ...base };
  keys.forEach(key => {
    if (pending[key]) next[key] = { ...next[key], ...pending[key] };
  });
  return next;
};

const listInputWrapperStyle = { flex: 1, minWidth: 0 };
// List view set input: keeps value in local state while focused and flushes to parent on blur.
// Prevents parent setData updates on every keystroke, which was causing full re-renders and input blur.
// Freeze on touch/pointer down (before focus) so viewport resize from keyboard doesn't trigger
// dimension-driven re-renders that dismiss the keyboard on iOS PWA.
const ListViewSetInputField = memo(({ exerciseIndex, setIndex, field, savedValue, updateSetData, style, placeholderText, listViewInputJustFocusedRef, restoreListViewModelScroll, freezeDimsForListInput, unfreezeDimsForListInput, pendingInputRef }) => {
  const [localValue, setLocalValue] = useState(null);
  const isEditing = localValue !== null;
  const displayValue = isEditing ? localValue : savedValue;
  // Mirror each keystroke into a screen-level ref synchronously (no re-render, so
  // it can't dismiss the keyboard). Persistence points read this, so the value is
  // safe even if onBlur never fires. Cleared once committed to setData on blur.
  const writePending = useCallback((value) => {
    if (!pendingInputRef) return;
    const key = `${exerciseIndex}_${setIndex}`;
    if (!pendingInputRef.current) pendingInputRef.current = {};
    pendingInputRef.current[key] = { ...pendingInputRef.current[key], [field]: value };
  }, [pendingInputRef, exerciseIndex, setIndex, field]);
  const clearPending = useCallback(() => {
    if (!pendingInputRef?.current) return;
    const key = `${exerciseIndex}_${setIndex}`;
    if (pendingInputRef.current[key]) delete pendingInputRef.current[key][field];
  }, [pendingInputRef, exerciseIndex, setIndex, field]);
  const onPointerDown = useCallback(() => {
    if (freezeDimsForListInput) freezeDimsForListInput();
  }, [freezeDimsForListInput]);
  const onFocus = useCallback(() => {
    if (freezeDimsForListInput) freezeDimsForListInput();
    setLocalValue(savedValue);
    if (listViewInputJustFocusedRef) listViewInputJustFocusedRef.current = true;
    if (restoreListViewModelScroll && !isPWA()) {
      [100, 300, 600].forEach((delayMs) => setTimeout(restoreListViewModelScroll, delayMs));
    }
    setTimeout(() => { if (listViewInputJustFocusedRef) listViewInputJustFocusedRef.current = false; }, 800);
  }, [freezeDimsForListInput, savedValue, listViewInputJustFocusedRef, restoreListViewModelScroll]);
  const onBlur = useCallback(() => {
    if (unfreezeDimsForListInput) unfreezeDimsForListInput();
    const final = localValue !== null ? localValue : savedValue;
    if (final !== savedValue) updateSetData(exerciseIndex, setIndex, field, final);
    // Committed to setData (or unchanged) — drop the in-flight copy so it can't
    // later shadow an edit made through another path (e.g. the set-detail modal).
    clearPending();
    setLocalValue(null);
  }, [unfreezeDimsForListInput, localValue, savedValue, exerciseIndex, setIndex, field, updateSetData, clearPending]);
  return (
    <View style={listInputWrapperStyle} onPointerDown={onPointerDown} onTouchStart={onPointerDown}>
      <TextInput
        style={style}
        value={displayValue}
        onChangeText={(value) => { setLocalValue(value); writePending(value); }}
        onFocus={onFocus}
        onBlur={onBlur}
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

// List view exercise card: at module level so re-renders (e.g. from useWindowDimensions when keyboard opens) do not remount rows and dismiss the focused input.
const SKIP_SET_FIELDS = ['id','order','notes','description','title','name','created_at','updated_at','createdAt','updatedAt','type','status','category','tags','metadata'];

const ExerciseItem = memo(({ exercise, exerciseIndex, isExpanded, onToggleExpansion, onOpenSwapModal, onAddSet, onRemoveSet, onSelectSet, setData, currentExerciseIndex, currentSetIndex, lastSavedKey, renderSetHeaders, renderSetInputFields, styles, accentColor }) => {
  const expandAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const chevronAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(expandAnim, { toValue: isExpanded ? 1 : 0, duration: 220, useNativeDriver: false }),
      Animated.timing(chevronAnim, { toValue: isExpanded ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [isExpanded]);

  const chevronRotate = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '270deg'] });

  const isExerciseDone = exercise.sets?.every((set, setIndex) => {
    const key = `${exerciseIndex}_${setIndex}`;
    const data = setData[key] || {};
    const measurableFields = Object.keys(set).filter(f => !SKIP_SET_FIELDS.includes(f));
    return measurableFields.some(f => data[f] !== undefined && data[f] !== null && data[f] !== '');
  }) ?? false;

  return (
    <View key={`exercise-${exerciseIndex}-${exercise.id}`} style={styles.exerciseListItem}>
      <TouchableOpacity
        style={styles.exerciseCard}
        onPress={() => onToggleExpansion(exerciseIndex)}
      >
        <Text style={[
          styles.exerciseNumber,
          exerciseIndex === currentExerciseIndex && accentColor && { color: accentColor },
        ]}>{exerciseIndex + 1}</Text>
        <View style={styles.exerciseContent}>
          <Text
            className="exercise-title"
            style={[
              styles.exerciseItemTitle,
              exerciseIndex === currentExerciseIndex && accentColor && { color: accentColor },
            ]}
          >
            {exercise.name}
          </Text>
        </View>
        {isExerciseDone && Platform.OS === 'web' && (
          <div className="wake-exercise-done-badge">✓</div>
        )}
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <SvgChevronLeft
            width={20}
            height={20}
            stroke={
              exerciseIndex === currentExerciseIndex && accentColor
                ? accentColor
                : 'rgba(255, 255, 255, 0.6)'
            }
          />
        </Animated.View>
      </TouchableOpacity>

      <Animated.View style={{
        maxHeight: expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 800] }),
        opacity: expandAnim,
        overflow: 'hidden',
      }}>
        <View style={styles.setsContainer}>
          <View style={styles.exerciseControlsRow}>
            <TouchableOpacity
              style={styles.swapExerciseButton}
              onPress={() => onOpenSwapModal(exerciseIndex)}
            >
              <Text style={styles.swapExerciseButtonText}>Reemplazar</Text>
              <SvgArrowLeftRight width={16} height={16} color="#ffffff" />
            </TouchableOpacity>
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
          <View style={styles.setTrackingRow}>
            <View style={styles.setNumberSpace} />
            <View style={styles.setInputsContainer}>
              {exercise.sets?.[0] && renderSetHeaders(exercise.sets[0])}
            </View>
          </View>
          {exercise.sets?.map((set, setIndex) => {
            const key = `${exerciseIndex}_${setIndex}`;
            const currentSetData = setData[key] || {};
            const isCurrentSet = exerciseIndex === currentExerciseIndex && setIndex === currentSetIndex;
            const justSaved = Platform.OS === 'web' && lastSavedKey === key;
            return (
              <TouchableOpacity
                key={`set-${exerciseIndex}-${setIndex}-${set.id || setIndex}`}
                className={justSaved ? 'set-row wake-set-saved' : 'set-row'}
                style={[styles.setTrackingRow, isCurrentSet && styles.setTrackingRowActive]}
                onPress={() => onSelectSet(exerciseIndex, setIndex)}
                activeOpacity={1}
              >
                {isCurrentSet && (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.activeSetIndicator,
                      { backgroundColor: accentColor || 'rgba(255, 255, 255, 0.9)' },
                    ]}
                  />
                )}
                <View style={styles.setNumberContainer}>
                  <Text style={[
                    styles.setNumber,
                    !isCurrentSet && styles.setNumberInactive,
                  ]}>{setIndex + 1}</Text>
                </View>
                <View style={styles.setInputsContainer}>
                  {renderSetInputFields(exerciseIndex, setIndex, set, currentSetData)}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
});

// Add-exercise modal card: defined at module level so it keeps a stable identity and does not remount on parent re-renders (fixes video re-render on play/pause tap).
const AddExerciseCard = memo(({ exercise, index, isExpanded, onCardTap, onVideoTap, onAddExercise, isVideoPaused, isMuted, toggleMute, videoPlayer, styles }) => {
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
          {exercise.video_url && (detectVideoSource(exercise.video_url, exercise.video_source) === 'youtube' || detectVideoSource(exercise.video_url, exercise.video_source) === 'vimeo') && Platform.OS === 'web' ? (
            <VideoCardWebWrapper>
              <View style={styles.addExerciseVideoWrapper}>
                <iframe
                  src={getEmbedUrl(exercise.video_url, detectVideoSource(exercise.video_url, exercise.video_source))}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  title="Exercise video"
                />
              </View>
            </VideoCardWebWrapper>
          ) : exercise.video_url ? (
            <VideoCardWebWrapper>
              <TouchableOpacity
                style={styles.addExerciseVideoWrapper}
                onPress={onVideoTap}
                activeOpacity={1}
              >
                <VideoView
                  player={videoPlayer}
                  style={styles.addExerciseVideo}
                  contentFit="cover"
                  fullscreenOptions={{ allowed: false }}
                  allowsPictureInPicture={false}
                  nativeControls={false}
                  showsTimecodes={false}
                  playsInline
                />
                {isVideoPaused && (
                  <VideoOverlayWebWrapper pointerEvents="none">
                    <View style={styles.addExerciseVideoDimmingLayer} pointerEvents="none" />
                  </VideoOverlayWebWrapper>
                )}
                {isVideoPaused && (
                  <VideoOverlayWebWrapper>
                    <View style={styles.addExerciseVideoPauseOverlay}>
                      <SvgPlay width={48} height={48} />
                    </View>
                  </VideoOverlayWebWrapper>
                )}
                {isVideoPaused && (
                  <VideoOverlayWebWrapper>
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
                  </VideoOverlayWebWrapper>
                )}
              </TouchableOpacity>
            </VideoCardWebWrapper>
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

// Custom hook for set data management (consolidated state)
const useSetData = (workout, routeCheckpoint, setCurrentExerciseIndex) => {
  const [setData, setSetData] = useState({});
  const [setValidationErrors, setSetValidationErrors] = useState({});
  
  // Simple validation function
  const validateInput = (value) => {
    if (!value || value.trim() === '') return true; // Empty is valid
    const numValue = parseFloat(value);
    return !isNaN(numValue) && numValue >= 0; // Must be a positive number
  };
  
  // Initialize set data structure based on measures or database fields.
  // When resuming from a checkpoint, merge checkpoint values into the template
  // so that (a) every set key exists with the correct field names and
  // (b) user-entered data from the checkpoint is preserved.
  useEffect(() => {
    if (workout?.exercises && Object.keys(setData).length === 0) {
      let isMounted = true;
      const timeoutId = setTimeout(() => {
        if (!isMounted) return;

        // Build the remapped checkpoint data first (if resuming)
        let checkpointData = null;
        if (routeCheckpoint?.completedSets && Object.keys(routeCheckpoint.completedSets).length > 0) {
          const cpExercises = routeCheckpoint.exercises || [];
          const currentExercises = workout.exercises || [];
          const oldToNew = new Map();
          cpExercises.forEach((cpEx, oldIdx) => {
            if (!cpEx?.exerciseId) return;
            const newIdx = currentExercises.findIndex(
              e => (e.id || e.exerciseId) === cpEx.exerciseId
            );
            if (newIdx !== -1) oldToNew.set(oldIdx, newIdx);
          });
          checkpointData = {};
          Object.entries(routeCheckpoint.completedSets).forEach(([key, value]) => {
            const [exIdxStr, setIdxStr] = key.split('_');
            const oldExIdx = parseInt(exIdxStr, 10);
            const newExIdx = oldToNew.has(oldExIdx) ? oldToNew.get(oldExIdx) : oldExIdx;
            checkpointData[`${newExIdx}_${setIdxStr}`] = value;
          });

          // Remap current exercise index if exercises were reordered
          const oldCurEx = routeCheckpoint.currentExerciseIndex;
          if (typeof oldCurEx === 'number' && oldToNew.has(oldCurEx)) {
            setCurrentExerciseIndex(oldToNew.get(oldCurEx));
          }
        }

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

              // Merge checkpoint data over the template (preserves user-entered values)
              if (checkpointData && checkpointData[key]) {
                const cpValues = checkpointData[key];
                Object.keys(setFields).forEach(field => {
                  if (cpValues[field] !== undefined && cpValues[field] !== '') {
                    setFields[field] = cpValues[field];
                  }
                });
              }

              initialSetData[key] = setFields;
            });
          }
        });

        if (isMounted) {
          startTransition(() => {
            setSetData(initialSetData);
          });
        }
      }, 0);

      return () => {
        isMounted = false;
        clearTimeout(timeoutId);
      };
    }
  }, [workout]); // eslint-disable-line react-hooks/exhaustive-deps
  
  const updateSetData = useCallback((exerciseIndex, setIndex, field, value) => {
    const key = `${exerciseIndex}_${setIndex}`;
    
    // Validate the input
    const isValid = validateInput(value);
    
    // Update validation errors
    setSetValidationErrors(prev => ({
      ...prev,
      [`${key}_${field}`]: !isValid
    }));
    
    // Update local state immediately for UI responsiveness
    setSetData(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
    
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
  const windowDims = useWindowDimensions();
  const listInputFocusedRef = useRef(false);
  const frozenDimsRef = useRef(null);
  const effectiveDims = (isPWA() && listInputFocusedRef.current && frozenDimsRef.current)
    ? frozenDimsRef.current
    : windowDims;
  const screenWidth = effectiveDims.width;
  const screenHeight = effectiveDims.height;
  const freezeDimsForListInput = useCallback(() => {
    listInputFocusedRef.current = true;
    if (isPWA()) frozenDimsRef.current = Dimensions.get('window');
  }, []);
  const unfreezeDimsForListInput = useCallback(() => {
    listInputFocusedRef.current = false;
    if (isPWA()) frozenDimsRef.current = null;
  }, []);
  const insets = useSafeAreaInsets();

  // Track if component is mounted for setTimeout cleanup
  const isMountedRef = useRef(true);
  
  // Refs to store functions so they can be called before they're defined
  const handleNextSetRef = useRef(null);
  const loadAlternativesRef = useRef(null);
  const handleCompleteWorkoutRef = useRef(null);
  const confirmEndWorkoutRef = useRef(null);
  const loadAvailableExercisesRef = useRef(null);
  const executeEndWorkoutRef = useRef(null);

  // ─── Checkpoint refs (session interruption recovery) ───────────────────────
  const checkpointApiTimerRef = useRef(null);
  const checkpointNotesTimerRef = useRef(null);
  const saveCheckpointRef = useRef(null);
  // Set when the user voluntarily discards or successfully completes. Gates the
  // unmount checkpoint flush so it can't resurrect a just-cleared checkpoint.
  const sessionEndedRef = useRef(false);
  // Holds set-input values typed but not yet flushed to setData on blur, keyed by
  // `${exerciseIndex}_${setIndex}` → { field: value }. Merged into setData at every
  // persistence point so an un-flushed weight is never lost.
  const pendingInputRef = useRef({});
  // Timestamp captured at component mount — used to measure recovery render time (D1).
  const recoveryMountTsRef = useRef(performance.now());
  // Guards workout.session_interrupted so it fires at most once per hidden/pagehide
  // transition. Reset when the page becomes visible again (D2).
  const interruptedFiredRef = useRef(false);

  // Ref for focus effect timeout tracking (must be at top level, not inside conditional)
  const focusTimeoutIdsRef = useRef([]);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Create styles with dimensions and insets - memoized to prevent recalculation on every render
  const styles = useMemo(() => {
    const stylesStartTime = performance.now();
    const stylesResult = createStyles(screenWidth, screenHeight, insets);
    const stylesDuration = performance.now() - stylesStartTime;
    // Only log if slow (performance issue)
    if (stylesDuration > 200) {
    }
    return stylesResult;
  }, [screenWidth, screenHeight, insets]);
  
  // Create loading overlay styles - memoized to prevent recalculation on every render
  const loadingOverlayStyles = useMemo(() => {
    const loadingStylesStartTime = performance.now();
    const loadingStylesResult = createLoadingOverlayStyles(screenWidth, screenHeight);
    const loadingStylesDuration = performance.now() - loadingStylesStartTime;
    // Only log if slow (performance issue)
    if (loadingStylesDuration > 200) {
    }
    return loadingStylesResult;
  }, [screenWidth, screenHeight]);
  
  // Create confirmation modal styles - memoized to prevent recalculation on every render
  const confirmModalStylesObj = useMemo(() => {
    return confirmModalStyles(screenWidth, screenHeight);
  }, [screenWidth, screenHeight]);
  
  // Lazy load services - only load when actually needed
  const servicesStartTime = performance.now();
  
  const { getMuscleDisplayName } = getMuscleConstants();
  const sessionManager = getSessionManager();
  const sessionService = getSessionService();
  const objectivesInfoService = getObjectivesInfoService();
  const tutorialManager = getTutorialManager();
  const exerciseLibraryService = getExerciseLibraryService();
  const oneRepMaxService = getOneRepMaxService();
  
  // programMediaService - Skip on web, lazy load on native
  const programMediaServiceRef = useRef(null);
  const getProgramMediaServiceLazy = () => {
    if (!programMediaServiceRef.current) {
      programMediaServiceRef.current = getProgramMediaService();
    }
    return programMediaServiceRef.current;
  };
  
  const videoCacheService = getVideoCacheService();
  const appResourcesService = getAppResourcesService();
  const assetBundleService = getAssetBundleService();
  const { trackScreenView, trackWorkoutStarted, trackWorkoutCompleted } = getMonitoringService();
  
  const servicesDuration = performance.now() - servicesStartTime;
  // Only log if slow (performance issue)
  if (servicesDuration > 500) {
  }
  
  const { course: routeCourse, workout: initialWorkout, sessionId, checkpoint: routeCheckpointFromParams, reopenCompletionId } = route.params;
  const { user } = useAuth();
  const { isMuted, toggleMute } = useVideo();

  // Self-recovery from the durable checkpoint. When this screen is (re)mounted
  // without route state — a PWA reload after the OS backgrounded the tab, or an
  // ErrorBoundary "Reintentar" remount — the in-memory route params are gone but
  // the localStorage checkpoint is not. Falling back to it restores the user's
  // place and entered sets instead of dropping them at exercise 1 (or rendering
  // a blank "No hay ejercicios" screen). Match userId + session so we never
  // resurrect a stale or foreign checkpoint over a genuine fresh start.
  const localCheckpoint = useMemo(() => {
    if (routeCheckpointFromParams) return null;
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem('wake_session_checkpoint');
      if (!raw) return null;
      const cp = JSON.parse(raw);
      if (!cp || !cp.exercises) return null;
      if (cp.savedAt && Date.now() - new Date(cp.savedAt).getTime() > 24 * 60 * 60 * 1000) return null;
      const uid = (user && user.uid) || auth.currentUser?.uid;
      if (uid && cp.userId && cp.userId !== uid) return null;
      // If the full route workout is still present this is a same-session remount
      // (ErrorBoundary retry). Only restore when the checkpoint is for that same
      // session — never graft a different session's progress onto a fresh start.
      const routeSessionId = sessionId || initialWorkout?.id;
      if (initialWorkout?.exercises?.length && routeSessionId && cp.sessionId && cp.sessionId !== routeSessionId) {
        return null;
      }
      return cp;
    } catch {
      return null;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const routeCheckpoint = routeCheckpointFromParams || localCheckpoint;

  // When recovering from localStorage after a reload, route.params.course is gone
  // too — rebuild a minimal course from the checkpoint so completion (which needs
  // courseId) still works instead of erroring out at the finish line.
  const course = routeCourse || (routeCheckpoint?.courseId
    ? { courseId: routeCheckpoint.courseId, id: routeCheckpoint.courseId, title: routeCheckpoint.sessionName || '' }
    : null);
  
  // Build workout from checkpoint if restoring an interrupted session.
  // Prefer the full initialWorkout (fetched from the program tree on resume) so
  // exercise details — videos, objectives, muscle activation, measures — are present.
  // Only fall back to checkpoint stubs when the full workout is unavailable.
  const restoredWorkout = useMemo(() => {
    if (!routeCheckpoint?.exercises) return null;
    if (initialWorkout?.exercises?.length) {
      return {
        ...initialWorkout,
        id: initialWorkout.id || routeCheckpoint.sessionId,
        name: initialWorkout.name || initialWorkout.title || routeCheckpoint.sessionName,
      };
    }
    return {
      ...initialWorkout,
      id: routeCheckpoint.sessionId,
      name: routeCheckpoint.sessionName,
      exercises: routeCheckpoint.exercises.map(ex => ({
        id: ex.exerciseId,
        exerciseId: ex.exerciseId,
        name: ex.exerciseName,
        sets: ex.sets,
      })),
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Local workout state that can be modified
  const useStateBatchStartTime = performance.now();

  const [workout, setWorkout] = useState(restoredWorkout || initialWorkout);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(routeCheckpoint?.currentExerciseIndex || 0);
  const [currentSetIndex, setCurrentSetIndex] = useState(routeCheckpoint?.currentSetIndex || 0);
  const [loading, setLoading] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [currentView, setCurrentView] = useState(0); // 0 = sheet closed, 1 = sheet open (exercise list)
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  // Whether the user has ever opened the exercise-list drawer (persisted). Until they
  // have, a subtle pull-down hint pulses on the closed lid at the start of each set.
  const [hasEverOpenedDrawer, setHasEverOpenedDrawer] = useState(() => {
    try { return localStorage.getItem('wake_exercise_drawer_opened_v2') === 'true'; } catch { return false; }
  });
  const [expandedExercises, setExpandedExercises] = useState({}); // Track which exercises are expanded
  const [isMenuVisible, setIsMenuVisible] = useState(false); // Menu visibility state
  const [isSetInputVisible, setIsSetInputVisible] = useState(false); // Set input popup visibility
  const [currentSetInputData, setCurrentSetInputData] = useState({}); // Current set input data
  const [lastSavedKey, setLastSavedKey] = useState(null); // Web: track last saved set key for flash animation
  const savedKeyTimerRef = useRef(null);
  const [showPostSave, setShowPostSave] = useState(false); // Web: triggers post-save animations
  const postSaveTimerRef = useRef(null);
  const [isSwapModalVisible, setIsSwapModalVisible] = useState(false); // Swap exercise modal visibility
  const [currentSwapExerciseIndex, setCurrentSwapExerciseIndex] = useState(null); // Which exercise is being swapped
  const [alternativeExercises, setAlternativeExercises] = useState([]); // Loaded alternative exercises
  const [loadingAlternatives, setLoadingAlternatives] = useState(false); // Loading state for alternatives
  const [creatorName, setCreatorName] = useState(''); // Creator name for suggestions
  const [oneRepMaxEstimates, setOneRepMaxEstimates] = useState({}); // 1RM estimates for weight suggestions
  const [sessionNotes, setSessionNotes] = useState('');
  const [isNotesModalVisible, setIsNotesModalVisible] = useState(false);

  // Accent color extracted from session/program image — drives current-exercise/set highlight
  // and primary action buttons (Registrar + timer). Falls back to default white styling on native
  // or when extraction fails.
  const accentImageUrl = workout?.image_url || workout?.imageUrl || course?.image_url || course?.imageUrl || null;
  const accent = useAccentFromImage(accentImageUrl);
  const accentColor = accent?.accent || null;
  const accentTextColor = accent?.accentText || '#1a1a1a';

  // Video-exchange submission + history overlay (one-on-one only, web only)
  const [videoSubmitTarget, setVideoSubmitTarget] = useState(null); // { exerciseKey, exerciseName } | null
  const isOneOnOneCourse = course?.deliveryType === 'one_on_one';
  const courseCreatorId = course?.creator_id || course?.creatorId || course?.creator?.id || null;
  const canSendVideoToCoach = !!(isWeb && isOneOnOneCourse && courseCreatorId && user?.uid);
  const handleRequestSendVideo = useCallback((exercise) => {
    if (!canSendVideoToCoach) return;
    setVideoSubmitTarget({
      exerciseKey: exercise?.id || exercise?.exerciseId || exercise?.name || '',
      exerciseName: exercise?.name || exercise?.exerciseName || 'Ejercicio',
    });
  }, [canSendVideoToCoach]);
  
  const useStateBatchDuration = performance.now() - useStateBatchStartTime;
  if (useStateBatchDuration > 50) {
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
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
    player.loop = true;
    player.muted = isMuted;
        }
      }, 0);
      // Store timeout ID for cleanup (though callback cleanup is limited)
      // The timeout will be cleared if component unmounts before it executes
      return () => clearTimeout(timeoutId);
    }
  }, [isMuted]);
  
  // Add exercise modal video state: single player, source set via replace() after VideoView mounts (so _mountedVideos is non-empty on web)
  const [addExerciseModalVideoUri, setAddExerciseModalVideoUri] = useState('');
  const addExerciseModalVideoPlayer = useVideoPlayer('', addExerciseModalVideoPlayerCallback);
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
  
  // Objective info modal state
  const useStateStartTime1 = performance.now();
  const [isObjectiveInfoModalVisible, setIsObjectiveInfoModalVisible] = useState(false);
  
  // Confirmation modal state for web (wakeAlert doesn't work well on web)
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState(null);
  const useStateDuration1 = performance.now() - useStateStartTime1;
  if (useStateDuration1 > 10) {
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
  
  // Timer modal: visibility, total elapsed, rest countdown, selected duration (not started yet)
  const [isTimerModalVisible, setIsTimerModalVisible] = useState(false);
  const [totalElapsedSeconds, setTotalElapsedSeconds] = useState(0);
  const [restSecondsRemaining, setRestSecondsRemaining] = useState(0);
  const [isRestPaused, setIsRestPaused] = useState(false);
  const [selectedRestSeconds, setSelectedRestSeconds] = useState(0);
  const [customRestMinutes, setCustomRestMinutes] = useState(1);
  const [customRestSeconds, setCustomRestSeconds] = useState(0);
  const timerIntervalRef = useRef(null);
  const isRestPausedRef = useRef(false);
  const timerJustEndedRef = useRef(false);
  const [showTimerEndedObjectivesModal, setShowTimerEndedObjectivesModal] = useState(false);
  const [timerEndedPulse, setTimerEndedPulse] = useState(false);
  const minutesScrollRef = useRef(null);
  const secondsScrollRef = useRef(null);
  const TIMER_PICKER_ITEM_HEIGHT = 44;
  const TIMER_PICKER_VISIBLE_ITEMS = 3;
  
  // TEST VERSION 8: Re-enable useSetData hook
  // Use consolidated set data management
  const { setData, setValidationErrors, updateSetData: updateSetDataLocal, hasValidationErrors, setSetData } = useSetData(workout, routeCheckpoint, setCurrentExerciseIndex);

  // ─── Recovery visibility ───────────────────────────────────────────────────
  // Record when a session is resumed and, critically, whether recovery had to
  // fall back to the durable localStorage checkpoint (i.e. route state was lost
  // to a reload / boundary remount). Lets us see this failure class on PostHog.
  useEffect(() => {
    if (!routeCheckpoint) return;
    try {
      const completed = routeCheckpoint.completedSets
        ? Object.keys(routeCheckpoint.completedSets).length : 0;
      // D1: compute enrichment props for this recovery event.
      const cpExIdx = routeCheckpoint.currentExerciseIndex ?? 0;
      const cpSetIdx = routeCheckpoint.currentSetIndex ?? 0;
      const inProgressKey = `${cpExIdx}_${cpSetIdx}`;
      const inProgressEntry = routeCheckpoint.completedSets?.[inProgressKey];
      const inProgressHasData = inProgressEntry && typeof inProgressEntry === 'object'
        && Object.values(inProgressEntry).some(v => v !== '' && v !== null && v !== undefined);
      const lostCurrentSetProgress = !inProgressHasData;
      const recoveryTrigger = routeCheckpointFromParams
        ? 'route'
        : (typeof document !== 'undefined' && document.visibilityState !== 'visible'
          ? 'visibility'
          : 'reload');
      const recoveryRenderMs = Math.round(performance.now() - recoveryMountTsRef.current);
      analyticsService.track('workout.session_recovered', {
        source: routeCheckpointFromParams ? 'route' : 'localStorage',
        course_id: routeCheckpoint.courseId || course?.courseId || null,
        session_id: routeCheckpoint.sessionId || null,
        exercise_index: routeCheckpoint.currentExerciseIndex ?? null,
        completed_sets: completed,
        had_full_workout: !!initialWorkout?.exercises?.length,
        age_seconds: routeCheckpoint.savedAt
          ? Math.round((Date.now() - new Date(routeCheckpoint.savedAt).getTime()) / 1000) : null,
        recovery_render_ms: recoveryRenderMs,
        current_set_empty_on_recovery: lostCurrentSetProgress,
        trigger: recoveryTrigger,
      });
    } catch { /* never throw from analytics */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Record when we mount with nothing renderable — route params lost on reload
  // AND no usable checkpoint. This is the blank-screen / lost-data case users
  // reported; with self-recovery above it should be rare, so any volume here is
  // a real signal worth alerting on.
  const emptyStateTrackedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (workout?.exercises?.length) return;
    if (emptyStateTrackedRef.current) return;
    emptyStateTrackedRef.current = true;
    try {
      analyticsService.track('workout.recovery_failed', {
        reason: 'no_workout_on_mount',
        had_route_workout: !!initialWorkout?.exercises?.length,
        had_route_checkpoint: !!routeCheckpointFromParams,
        had_local_checkpoint: !!localCheckpoint,
        course_id: course?.courseId || null,
      });
    } catch { /* never throw from analytics */ }
  }, [loading, workout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Defensive: a restored index can exceed a freshly-loaded or checkpoint-rebuilt
  // workout if the program changed under the user. Clamp so we resume at the last
  // valid exercise instead of falling through to the empty-state guard.
  useEffect(() => {
    const exs = workout?.exercises;
    if (!exs?.length) return;
    if (currentExerciseIndex > exs.length - 1) {
      setCurrentExerciseIndex(exs.length - 1);
      setCurrentSetIndex(0);
    }
  }, [workout, currentExerciseIndex]);
  
  // TEST VERSION 7: Re-enable swap modal video player
  // Swap modal video player callback - memoized
  const swapModalVideoPlayerCallback = useCallback((player) => {
    if (player) {
      // Defer video operations to avoid blocking
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
    player.loop = true;
    player.muted = isMuted;
        }
      }, 0);
      // Store timeout ID for cleanup (though callback cleanup is limited)
      return () => clearTimeout(timeoutId);
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
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
      player.muted = true; // Start muted
        }
      }, 0);
      // Store timeout ID for cleanup (though callback cleanup is limited)
      return () => clearTimeout(timeoutId);
    }
  }, []);
  
  // Intensity video state
  const intensityVideoPlayer = useVideoPlayer('', intensityVideoPlayerCallback);
  const [intensityVideoUri, setIntensityVideoUri] = useState('');
  const [isIntensityVideoPaused, setIsIntensityVideoPaused] = useState(true);
  const [currentIntensity, setCurrentIntensity] = useState(null);
  const [selectedIntensity, setSelectedIntensity] = useState(null);
  const [remoteIntensityVideos, setRemoteIntensityVideos] = useState({});
  const intensityAnimsRef = useRef(new Map());

  const getOrCreateIntensityAnim = (intensity) => {
    if (!intensityAnimsRef.current.has(intensity)) {
      intensityAnimsRef.current.set(intensity, new Animated.Value(0));
    }
    return intensityAnimsRef.current.get(intensity);
  };

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
    let isMounted = true;
    // Defer state update to avoid blocking commit phase
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        startTransition(() => {
    setRemoteIntensityVideos({});
        });
      }
    }, 0);
    const effectDuration = performance.now() - effectStartTime;
    if (effectDuration > 50) {
    }
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);
  
  // Expanded card state (null = current exercise, number = alternative index)
  const [expandedCardIndex, setExpandedCardIndex] = useState(null); // null means current exercise is expanded
  const [videoUri, setVideoUri] = useState(null); // Current video URI
  const [videoSourceType, setVideoSourceType] = useState(null); // 'upload' | 'youtube' | 'vimeo'
  const [isVideoPaused, setIsVideoPaused] = useState(true); // Video pause state - start paused, wait for tutorial
  const [canStartVideo, setCanStartVideo] = useState(false); // Flag to control when video can start
  const [videoLoadFailed, setVideoLoadFailed] = useState(false); // Exercise video failed to load (network) — show inline retry
  const videoFailTrackedRef = useRef(new Set()); // dedupe video_load_failed events per exercise
  
  // TEST VERSION 7: Re-enable main video player
  // Video player callback - memoized to prevent recreation
  const videoPlayerCallback = useCallback((player) => {
    if (player) {
      // Defer video operations to avoid blocking
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
      player.loop = false;
      player.muted = isMuted;
      player.volume = 1.0;
        }
      }, 0);
      // Store timeout ID for cleanup (though callback cleanup is limited)
      return () => clearTimeout(timeoutId);
    }
  }, [isMuted]);
  
  // Main exercise video.
  // On web (PWA): plain <video> element bound to the URL via src — browser
  // handles buffering, range requests, decoder lifecycle. No orchestration.
  // On native: expo-video useVideoPlayer + VideoView (unchanged).
  const isExternalVideo = videoSourceType === 'youtube' || videoSourceType === 'vimeo';
  const nativeVideoUri = isExternalVideo ? null : videoUri;
  const memoizedVideoUri = useDeferredValue(nativeVideoUri);
  const videoPlayer = useVideoPlayer('', videoPlayerCallback);
  const mainVideoRef = useRef(null);
  const scrollViewRef = useRef(null); // Main ScrollView reference for view switching
  const lastScrollXRef = useRef(0); // [LIST-INPUT-DEBUG] track horizontal scroll to detect reset on re-render
  const listViewInputJustFocusedRef = useRef(false); // [LIST-INPUT-DEBUG] set when input in list view focuses (to restore scroll after re-render)
  // [LIST-INPUT-DEBUG] Log render when on list view or right after list input focus (to see scroll state after focus-triggered re-render)
  if (currentView === 1 || listViewInputJustFocusedRef.current) {
    const lx = lastScrollXRef.current;
    const expectedListX = screenWidth;
    const isAtList = Math.abs(lx - expectedListX) < 20;
  }
  // Animation values for set input modal
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalTranslateY = useRef(new Animated.Value(300)).current;

  // Animation values for notes bottom sheet modal
  const notesModalOpacity = useRef(new Animated.Value(0)).current;
  const notesModalTranslateY = useRef(new Animated.Value(500)).current;

  // Timer modal: workout start time (set when screen mounts so total time tracks entire session)
  const workoutStartTimeRef = useRef(null);
  // Animation values for timer modal (same pattern as set input modal)
  const timerModalOpacity = useRef(new Animated.Value(0)).current;
  const timerModalTranslateY = useRef(new Animated.Value(300)).current;
  
  // Animation values for swap modal
  const swapModalOpacity = useRef(new Animated.Value(0)).current;
  const swapModalTranslateY = useRef(new Animated.Value(800)).current;

  // Top-anchored sheet (exercise list drawer). The card sits below the FixedWakeHeader
  // with all four corners rounded; height + horizontal margin animate together so the
  // closed lid matches the videoCard width and the expanded sheet goes near full-width
  // and tall. Closed = compact lid (exercise name + bottom grabber).
  const CLOSED_LID_HEIGHT = 76;
  const CLOSED_HORIZONTAL_MARGIN = Math.max(48, screenWidth * 0.12) / 2;
  const EXPANDED_HORIZONTAL_MARGIN = 8;
  const sheetTopOffset = useMemo(() => {
    const isIOSDevice = isWeb && typeof navigator !== 'undefined'
      ? /iPhone|iPad|iPod/.test(navigator.userAgent || '')
      : Platform.OS === 'ios';
    const baseExtra = isIOSDevice ? 0 : 24;
    const browserExtra = isWeb && !isPWA() ? 34 : 0;
    return (insets?.top || 0) + 32 + baseExtra + browserExtra + 12;
  }, [insets?.top]);
  const sheetHeight = Math.max(
    CLOSED_LID_HEIGHT + 200,
    Math.round(screenHeight - sheetTopOffset - 32)
  );
  const sheetHeightAnim = useRef(new Animated.Value(CLOSED_LID_HEIGHT)).current;
  const sheetMarginAnim = useRef(new Animated.Value(CLOSED_HORIZONTAL_MARGIN)).current;
  const sheetBackdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetDragStartHeightRef = useRef(CLOSED_LID_HEIGHT);
  // Pull-down hint pulse for the closed lid (native driver: transform only).
  const lidPulseAnim = useRef(new Animated.Value(0)).current;
  
  // Simple scroll position tracking for pagination
  const scrollX = useRef(new Animated.Value(0)).current;
  const topCardScrollX = useRef(new Animated.Value(0)).current; // For top card pagination
  
  // Debounced save timer ref
  const saveTimerRef = useRef(null);
  // Track all timeout IDs for cleanup on unmount
  const allTimeoutIdsRef = useRef([]);
  
  // Service cache for alternative exercises (5 minute TTL)
  const serviceCache = useRef({
    alternatives: new Map(),
    lastFetch: 0,
    ttl: 5 * 60 * 1000 // 5 minutes
  });
  
  // Video preloading cache
  const videoPreloadCache = useRef(new Set());

  // ─── Session checkpoint (interruption recovery) ─────────────────────────
  const buildCheckpoint = useCallback(() => {
    const currentUser = user || auth.currentUser;
    if (!currentUser || !course || !workout) return null;
    const startTime = workoutStartTimeRef.current || Date.now();
    const effectiveSetData = mergeSetData(setData, pendingInputRef.current);
    return {
      version: 1,
      userId: currentUser.uid,
      courseId: course.courseId || course.id,
      sessionId: sessionId || workout.id || '',
      sessionName: workout.name || workout.title || '',
      startedAt: new Date(startTime).toISOString(),
      savedAt: new Date().toISOString(),
      currentExerciseIndex,
      currentSetIndex,
      exercises: (workout.exercises || []).map(ex => ({
        exerciseId: ex.id || ex.exerciseId || '',
        exerciseName: ex.name || '',
        sets: (ex.sets || []).map(s => ({
          reps: s.reps || null,
          weight: s.weight || null,
          intensity: s.intensity || null,
        })),
      })),
      completedSets: Object.fromEntries(
        Object.entries(effectiveSetData).filter(([, v]) =>
          v && typeof v === 'object' && Object.values(v).some(val => val !== '' && val !== null && val !== undefined)
        )
      ),
      userNotes: sessionNotes,
      elapsedSeconds: totalElapsedSeconds,
    };
  }, [user, course, workout, sessionId, currentExerciseIndex, currentSetIndex, setData, sessionNotes, totalElapsedSeconds]);

  const saveCheckpointToLocalStorage = useCallback(() => {
    try {
      const cp = buildCheckpoint();
      if (cp) localStorage.setItem('wake_session_checkpoint', JSON.stringify(cp));
    } catch { /* fire-and-forget */ }
  }, [buildCheckpoint]);

  // Keep a ref to the latest save function so unmount/pagehide handlers always
  // flush with fresh state (closures captured by event listeners would otherwise
  // use stale setData).
  useEffect(() => {
    saveCheckpointRef.current = saveCheckpointToLocalStorage;
  }, [saveCheckpointToLocalStorage]);

  const debouncedApiCheckpoint = useCallback(() => {
    if (checkpointApiTimerRef.current) clearTimeout(checkpointApiTimerRef.current);
    checkpointApiTimerRef.current = setTimeout(() => {
      const cp = buildCheckpoint();
      if (!cp) return;
      import('../utils/apiClient.js').then(mod => {
        const client = mod.default || mod.apiClient;
        client.post('/workout/session/checkpoint', cp, { idempotent: true });
      });
    }, 10_000);
  }, [buildCheckpoint]);

  // Write initial checkpoint once setData is populated (not just on workout load,
  // because setData initialization is deferred with setTimeout)
  const setDataReady = Object.keys(setData).length > 0;
  useEffect(() => {
    if (workout?.exercises?.length && setDataReady) {
      saveCheckpointToLocalStorage();
    }
  }, [setDataReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Checkpoint on visibility change / pagehide (localStorage only, no API)
  useEffect(() => {
    if (!isWeb) return;
    const onVisChange = () => {
      // Skip once the session is finished/discarded — otherwise backgrounding
      // the app right after completion resurrects a just-cleared checkpoint and
      // the recovery banner reappears for an already-saved session. Mirrors the
      // guard on the unmount flush below.
      if (sessionEndedRef.current) return;
      if (document.visibilityState === 'hidden') {
        saveCheckpointToLocalStorage();
        // Cancel any pending API-checkpoint timer so it can't fire with a
        // stale closure after the tab has been backgrounded for hours.
        if (checkpointApiTimerRef.current) {
          clearTimeout(checkpointApiTimerRef.current);
          checkpointApiTimerRef.current = null;
        }
        // D2: fire workout.session_interrupted at most once per hidden transition.
        if (!interruptedFiredRef.current) {
          interruptedFiredRef.current = true;
          try {
            const cp = buildCheckpoint();
            analyticsService.track('workout.session_interrupted', {
              course_id: cp?.courseId ?? null,
              session_id: cp?.sessionId ?? null,
              trigger: 'visibility',
              exercise_index: cp?.currentExerciseIndex ?? null,
              completed_sets: cp?.completedSets ? Object.keys(cp.completedSets).length : 0,
              elapsed_seconds: cp?.elapsedSeconds ?? null,
            });
          } catch { /* never throw from analytics */ }
        }
      } else if (document.visibilityState === 'visible') {
        // Reset the guard so the next backgrounding fires the event again.
        interruptedFiredRef.current = false;
      }
    };
    const onPageHide = () => {
      if (sessionEndedRef.current) return;
      saveCheckpointToLocalStorage();
      if (checkpointApiTimerRef.current) {
        clearTimeout(checkpointApiTimerRef.current);
        checkpointApiTimerRef.current = null;
      }
      // D2: fire workout.session_interrupted at most once per pagehide (guard shared
      // with visibilitychange so a simultaneous hidden + pagehide pair fires once).
      if (!interruptedFiredRef.current) {
        interruptedFiredRef.current = true;
        try {
          const cp = buildCheckpoint();
          analyticsService.track('workout.session_interrupted', {
            course_id: cp?.courseId ?? null,
            session_id: cp?.sessionId ?? null,
            trigger: 'pagehide',
            exercise_index: cp?.currentExerciseIndex ?? null,
            completed_sets: cp?.completedSets ? Object.keys(cp.completedSets).length : 0,
            elapsed_seconds: cp?.elapsedSeconds ?? null,
          });
        } catch { /* never throw from analytics */ }
      }
    };
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('pagehide', onPageHide);
      if (checkpointApiTimerRef.current) clearTimeout(checkpointApiTimerRef.current);
      if (checkpointNotesTimerRef.current) clearTimeout(checkpointNotesTimerRef.current);
    };
  }, [saveCheckpointToLocalStorage, buildCheckpoint]);

  // Debounced checkpoint on notes change (2s)
  useEffect(() => {
    if (!sessionNotes) return;
    if (checkpointNotesTimerRef.current) clearTimeout(checkpointNotesTimerRef.current);
    checkpointNotesTimerRef.current = setTimeout(() => {
      saveCheckpointToLocalStorage();
    }, 2000);
  }, [sessionNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush checkpoint on unmount. SPA back-nav (including iOS edge-swipe) unmounts
  // the component without firing pagehide/visibilitychange, so the other handlers
  // alone aren't enough. Skip when the user explicitly discarded or completed —
  // otherwise the flush resurrects a just-cleared checkpoint and the recovery
  // modal reappears on Hoy / DailyWorkout.
  useEffect(() => {
    return () => {
      if (sessionEndedRef.current) return;
      if (saveCheckpointRef.current) saveCheckpointRef.current();
    };
  }, []);

  // Restore non-setData state from checkpoint (notes, timer, position).
  // setData restoration is handled in the initialization effect above to avoid
  // the race condition where deferred init would overwrite restored values.
  useEffect(() => {
    if (!routeCheckpoint) return;
    if (routeCheckpoint.userNotes) {
      setSessionNotes(routeCheckpoint.userNotes);
    }
    if (routeCheckpoint.elapsedSeconds) {
      setTotalElapsedSeconds(routeCheckpoint.elapsedSeconds);
    }
    if (routeCheckpoint.startedAt) {
      workoutStartTimeRef.current = new Date(routeCheckpoint.startedAt).getTime();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Kick off byte-level preload for upcoming exercises. On web this attaches a
  // hidden <video preload="auto"> per URL inside videoCacheService so the
  // browser HTTP cache is warm before the real player mounts. We preload the
  // current exercise too because users can land here without going through
  // Warmup (skip-warmup, session recovery, deep link).
  const preloadNextVideo = useCallback(() => {
    if (!workout?.exercises) return;
    const candidates = [
      workout.exercises[currentExerciseIndex],
      workout.exercises[currentExerciseIndex + 1],
    ];
    for (const ex of candidates) {
      const videoUrl = ex?.video_url;
      if (!videoUrl || videoPreloadCache.current.has(videoUrl)) continue;
      videoCacheService.preloadVideo(videoUrl);
      videoPreloadCache.current.add(videoUrl);
    }
  }, [workout, currentExerciseIndex]);

  // Track render completion - only log warnings when slow
  useEffect(() => {
    const effectStartTime = performance.now();
    
    // Track React commit phase completion - only log if slow
    if (typeof requestAnimationFrame !== 'undefined') {
      const beforeRAF = performance.now();
      requestAnimationFrame(() => {
        const commitTime = performance.now();
        const rafDelay = commitTime - beforeRAF;
        const mountTime = commitTime - effectStartTime;
        // Only log if slow (performance issue)
        if (rafDelay > 50) {
        }
        if (mountTime > 2000) {
        }
        
        // Track paint - only log if slow
        const beforePaintRAF = performance.now();
        requestAnimationFrame(() => {
          const paintTime = performance.now();
          const paintRAFDelay = paintTime - beforePaintRAF;
          // Only log if slow (performance issue)
          if (paintRAFDelay > 50) {
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
    
    // Start workout timer when user enters the screen (for total time in timer modal)
    if (workoutStartTimeRef.current == null) {
      workoutStartTimeRef.current = Date.now();
    }
    
    // Track screen view and workout start with timing
    const trackStartTime = performance.now();
    trackScreenView('WorkoutExecutionScreen');
    const trackScreenViewDuration = performance.now() - trackStartTime;
    if (trackScreenViewDuration > 10) {
    }
    
    const trackWorkoutStartTime = performance.now();
    trackWorkoutStarted(course?.id, course?.difficulty);
    const trackWorkoutDuration = performance.now() - trackWorkoutStartTime;
    if (trackWorkoutDuration > 10) {
    }
    
    // Call async function and track when it actually completes
    const asyncStartTime = performance.now();
    initializeWorkout()
      .then(() => {
        const asyncDuration = performance.now() - asyncStartTime;
        if (asyncDuration > 5000) {
        }
      })
      .catch((error) => {
        const asyncDuration = performance.now() - asyncStartTime;
        logger.error(`[ASYNC] [ERROR] initializeWorkout() failed after ${asyncDuration.toFixed(2)}ms:`, error);
      });
    
    const effectDuration = performance.now() - effectStartTime;
    if (effectDuration > 200) {
    }
  }, []);

  // TEST VERSION 9: Re-enable useEffect(focus/web)
  // Handle screen focus changes - pause videos when screen loses focus
  // On web, use useEffect instead of useFocusEffect (React Router doesn't have NavigationContainer)
  if (isWeb) {
    useEffect(() => {
      const effectStartTime = performance.now();
      // Screen is focused
      
      return () => {
        const cleanupStartTime = performance.now();
        // Clear any pending timeouts
        focusTimeoutIdsRef.current.forEach(id => clearTimeout(id));
        focusTimeoutIdsRef.current = [];
        
        let isMounted = true;
        // Screen loses focus - pause all videos
        // CRITICAL: Defer video operations to avoid blocking React commit phase
        // Use setTimeout(0) to schedule after React's commit phase completes
        const timeoutId1 = setTimeout(() => {
          if (!isMounted) return;
          const deferredStartTime = performance.now();
          try {
            // Pause the plain <video> element (web main player).
            if (mainVideoRef.current) {
              try { mainVideoRef.current.pause(); } catch (_) {}
              try { mainVideoRef.current.muted = true; } catch (_) {}
            }
            const timeoutId2 = setTimeout(() => {
              if (isMounted && isMountedRef.current) {
                startTransition(() => {
                  setIsVideoPaused(true);
                });
              }
            }, 0);
            focusTimeoutIdsRef.current.push(timeoutId2);
          } catch (error) {
          }
          
          try {
            if (swapModalVideoPlayer) {
              swapModalVideoPlayer.pause();
              swapModalVideoPlayer.muted = true; // Mute as extra safety
            }
          } catch (error) {
          }
          
          try {
            if (addExerciseModalVideoPlayer) {
              addExerciseModalVideoPlayer.pause();
              addExerciseModalVideoPlayer.muted = true; // Mute as extra safety
            }
          } catch (error) {
          }
          const deferredDuration = performance.now() - deferredStartTime;
          if (deferredDuration > 50) {
          }
        }, 0);
        focusTimeoutIdsRef.current.push(timeoutId1);
        
        const cleanupDuration = performance.now() - cleanupStartTime;
        
        return () => {
          isMounted = false;
          focusTimeoutIdsRef.current.forEach(id => clearTimeout(id));
          focusTimeoutIdsRef.current = [];
        };
      };
      const effectDuration = performance.now() - effectStartTime;
    }, [videoPlayer, swapModalVideoPlayer, addExerciseModalVideoPlayer]);
  } else {
    // TEST MODE: useFocusEffect commented out (native only, not relevant for web test)
    /* TEST VERSION 1: useFocusEffect disabled
    // Native: use useFocusEffect
  useFocusEffect(
    useCallback(() => {
      // Screen is focused
      
      return () => {
        // Screen loses focus - pause all videos
          // CRITICAL: Defer video operations to avoid blocking React commit phase
          setTimeout(() => {
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
        }
        
        try {
          if (swapModalVideoPlayer) {
            swapModalVideoPlayer.pause();
            swapModalVideoPlayer.muted = true; // Mute as extra safety
          }
        } catch (error) {
        }
        
        try {
          if (addExerciseModalVideoPlayer) {
            addExerciseModalVideoPlayer.pause();
            addExerciseModalVideoPlayer.muted = true; // Mute as extra safety
          }
        } catch (error) {
        }
          }, 0);
      };
    }, [videoPlayer, swapModalVideoPlayer, addExerciseModalVideoPlayer])
  );
    */
  }

  // Track timeout IDs for tutorial-related setTimeout calls
  const tutorialTimeoutIdsRef = useRef([]);
  
  // Check for tutorials to show
  const checkForTutorials = async () => {
    if (!user?.uid || !course?.courseId) {
      // No user/course, allow video to start immediately
      // CRITICAL: Defer state updates to prevent blocking re-renders
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
          startTransition(() => {
      setCanStartVideo(true);
      setIsVideoPaused(false);
          });
        }
      }, 0);
      tutorialTimeoutIdsRef.current.push(timeoutId);
      return;
    }

    try {
      const tutorials = await tutorialManager.getTutorialsForScreen(
        user.uid, 
        'workoutExecution',
        course.courseId  // Pass programId for program-specific tutorials
      );
      
      if (tutorials.length > 0) {
        // Defer state updates to prevent blocking re-renders
        const timeoutId = setTimeout(() => {
          if (isMountedRef.current) {
            startTransition(() => {
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
            });
          }
        }, 0);
        tutorialTimeoutIdsRef.current.push(timeoutId);
        // Keep video paused while tutorial is showing
      } else {
        // No tutorials - bypass tutorial system entirely
        // Defer state updates to prevent blocking re-renders
        const timeoutId = setTimeout(() => {
          if (isMountedRef.current) {
            startTransition(() => {
        setCanStartVideo(true);
        setIsVideoPaused(false);
            });
          }
        }, 0);
        tutorialTimeoutIdsRef.current.push(timeoutId);
      }
    } catch (error) {
      logger.error('❌ Error checking for tutorials:', error);
      // On error, allow video to start anyway
      // Defer state updates to prevent blocking re-renders
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
          startTransition(() => {
      setCanStartVideo(true);
      setIsVideoPaused(false);
          });
        }
      }, 0);
      tutorialTimeoutIdsRef.current.push(timeoutId);
    }
  };
  
  // Cleanup tutorial timeouts on unmount
  useEffect(() => {
    return () => {
      tutorialTimeoutIdsRef.current.forEach(id => clearTimeout(id));
      tutorialTimeoutIdsRef.current = [];
    };
  }, []);

  // Handle tutorial completion
  const handleTutorialComplete = useCallback(async () => {
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
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  }, [user?.uid, course?.courseId, tutorialData, currentTutorialIndex]);

  // Handle tutorial close - allow video to start when tutorial is closed
  const handleTutorialClose = useCallback(() => {
    // Defer state updates to prevent blocking re-renders
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        startTransition(() => {
    setTutorialVisible(false);
    // Allow video to start after tutorial is closed
    setCanStartVideo(true);
    setIsVideoPaused(false);
        });
      }
    }, 0);
    tutorialTimeoutIdsRef.current.push(timeoutId);
  }, []);

  // TEST VERSION 7: Re-enable useEffect(videoUri) to test programMediaService lazy loading
  // Simple video loading - prefer local path, fallback to remote URL (non-blocking)
  // CRITICAL: Defer state update to prevent blocking re-renders
  useEffect(() => {
    const effectStartTime = performance.now();
    let isMounted = true;
    const timeoutIds = [];
    
    const currentExercise = workout?.exercises?.[currentExerciseIndex];
    if (!currentExercise) {
      // Defer state update to avoid blocking commit phase
      const timeoutId = setTimeout(() => {
        if (isMounted) {
          startTransition(() => {
      setVideoUri(null);
          });
        }
      }, 0);
      timeoutIds.push(timeoutId);
      const effectDuration = performance.now() - effectStartTime;
      return () => {
        isMounted = false;
        timeoutIds.forEach(id => clearTimeout(id));
      };
    }

    // Fire the preload synchronously: it's just attaching a hidden <video> on
    // web (cheap, non-blocking). Deferring it via setTimeout cost real load
    // time on the next exercise's first byte.
    preloadNextVideo();

    // Defer state update to avoid blocking commit phase
    const timeoutId1 = setTimeout(() => {
      if (!isMounted) return;
      // Lazy load programMediaService only when actually needed (deferred require)
      const programMediaService = getProgramMediaServiceLazy();
    // Try to get local path first (synchronous, fast), fallback to remote URL immediately
      const localPath = programMediaService?.getExerciseVideoPath(
      course?.courseId,
      currentExercise.primary,
      currentExercise.video_url
      ) || null;

      // Use startTransition to mark as non-urgent
      if (isMounted) {
        const resolvedUrl = localPath || currentExercise.video_url || null;
        const sourceType = detectVideoSource(currentExercise.video_url, currentExercise.video_source);
        startTransition(() => {
          setVideoUri(resolvedUrl);
          setVideoSourceType(sourceType);
        });
      }
    }, 0);
    timeoutIds.push(timeoutId1);
    
    const effectDuration = performance.now() - effectStartTime;
    if (effectDuration > 100) {
    }
    
    return () => {
      isMounted = false;
      timeoutIds.forEach(id => clearTimeout(id));
    };
  }, [currentExerciseIndex, workout, preloadNextVideo, course]);

  // Native only: push URI into the persistent player via replace() on change.
  // On web the plain <video> element binds src directly, so this is skipped.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!videoPlayer) return;
    let isMounted = true;
    const timeoutId = setTimeout(() => {
      if (!isMounted) return;
      try {
        videoPlayer.replace(memoizedVideoUri || '');
      } catch (error) {
        logger.error('❌ Error replacing video source:', error);
      }
    }, 0);
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [memoizedVideoUri, videoPlayer]);

  // Sync video mute state.
  // Web: HTML <video> element (mainVideoRef) — direct property set.
  // Native: expo-video player.
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (mainVideoRef.current) {
        try { mainVideoRef.current.muted = isMuted; } catch (_) {}
      }
      return;
    }
    if (!videoPlayer) return;
    let isMounted = true;
    const timeoutId = setTimeout(() => {
      if (!isMounted) return;
      try { videoPlayer.muted = isMuted; } catch (_) {}
    }, 0);
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [isMuted, videoPlayer]);

  // Auto-play intensity video when card is expanded and video URI is set
  useEffect(() => {
    if (!selectedIntensity || !intensityVideoUri || !intensityVideoPlayer || isIntensityVideoPaused) {
      return;
    }

    let isMounted = true;
    const timeoutIds = [];

    // Defer play to allow video to load after replace()
    // Use a longer delay to ensure video is ready to play
    const playTimeoutId = setTimeout(() => {
      if (!isMounted) return;
      try {
        if (intensityVideoPlayer && selectedIntensity && intensityVideoUri && !isIntensityVideoPaused) {
          intensityVideoPlayer.play().catch(error => {
            // If play fails (video not ready), retry after a short delay
            if (!isMounted) return;
            const retryTimeoutId = setTimeout(() => {
              if (isMounted) {
                try {
                  intensityVideoPlayer.play();
                } catch (retryError) {
                  logger.error('❌ Error retrying intensity video play:', retryError);
                }
              }
            }, 300);
            timeoutIds.push(retryTimeoutId);
          });
        }
      } catch (error) {
        logger.error('❌ Error auto-playing intensity video:', error);
      }
    }, 300); // Delay to let video load after replace()
    timeoutIds.push(playTimeoutId);

    return () => {
      isMounted = false;
      timeoutIds.forEach(id => clearTimeout(id));
    };
  }, [selectedIntensity, intensityVideoUri, intensityVideoPlayer, isIntensityVideoPaused]);

  // Sync video with pause state.
  // Web: drive the HTML <video> element directly via mainVideoRef.
  // Native: expo-video player with deferred play/pause to avoid commit-phase blocking.
  useEffect(() => {
    if (Platform.OS === 'web') {
      const el = mainVideoRef.current;
      if (!el || !videoUri || !canStartVideo) return;
      if (isVideoPaused) {
        try { el.pause(); } catch (_) {}
      } else {
        const p = el.play();
        if (p && typeof p.catch === 'function') {
          p.catch(error => {
            if (error?.name !== 'AbortError') {
              logger.error('❌ Error playing video:', error.message);
            }
          });
        }
      }
      return;
    }

    let syncTimeoutId = null;
    let videoTimeoutId = null;
    syncTimeoutId = setTimeout(() => {
      const effectStartTime = performance.now();
      if (!videoUri) return;
      if (!videoPlayer) return;

      if (canStartVideo) {
        // Use a small delay to avoid race conditions with video loading
        const timeoutStartTime = performance.now();
        videoTimeoutId = setTimeout(() => {
        const timeoutExecutionTime = performance.now();
        const timeoutDelay = timeoutExecutionTime - timeoutStartTime;
        if (timeoutDelay > 200) {
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
          }
          
          if (isVideoPaused && isCurrentlyPlaying) {
            const pauseStartTime = performance.now();
        videoPlayer.pause();
            const pauseDuration = performance.now() - pauseStartTime;
            if (pauseDuration > 50) {
            }
          } else if (!isVideoPaused && !isCurrentlyPlaying) {
            const playStartTime = performance.now();
            // Use async play() with error handling to prevent AbortError from breaking the app
            const playPromise = videoPlayer.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  const playDuration = performance.now() - playStartTime;
                })
                .catch(error => {
                  const playDuration = performance.now() - playStartTime;
                  logger.error(`[VIDEO] [ERROR] Video play() rejected after ${playDuration.toFixed(2)}ms:`, error);
                  // AbortError is expected when play() is interrupted by pause()
                  // This is normal behavior and shouldn't break the app
                  if (error.name === 'AbortError') {
      } else {
                    logger.error('❌ Error playing video:', error.message);
                  }
                });
            }
          }
        } catch (error) {
          const errorTime = performance.now();
          logger.error(`[VIDEO] [ERROR] Video sync error at ${errorTime.toFixed(2)}ms:`, error);
        }
      }, 150); // Small delay to let video player initialize and avoid race conditions

    }
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
  const onScrollListener = useCallback((e) => {
    const x = e.nativeEvent.contentOffset.x;
    const prev = lastScrollXRef.current;
    lastScrollXRef.current = x;
    const viewIndex = screenWidth > 0 ? Math.round(x / screenWidth) : -1;
    const isListVisible = viewIndex === 1;
    if (Math.abs(x - prev) > 5 || listViewInputJustFocusedRef.current) {
    }
  }, [screenWidth]);
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false, listener: onScrollListener }
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

  // Bottom sheet open/close — height animation (non-native driver so the card stays
  // bottom-anchored with all four corners rounded throughout the transition).
  const openSheet = useCallback(() => {
    if (!hasEverOpenedDrawer) {
      setHasEverOpenedDrawer(true);
      try { localStorage.setItem('wake_exercise_drawer_opened_v2', 'true'); } catch {}
    }
    setIsSheetOpen(true);
    setCurrentView(1);
    Animated.parallel([
      Animated.spring(sheetHeightAnim, { toValue: sheetHeight, useNativeDriver: false, bounciness: 0, speed: 16 }),
      Animated.spring(sheetMarginAnim, { toValue: EXPANDED_HORIZONTAL_MARGIN, useNativeDriver: false, bounciness: 0, speed: 16 }),
      Animated.timing(sheetBackdropOpacity, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start();
  }, [hasEverOpenedDrawer, sheetHeightAnim, sheetMarginAnim, sheetBackdropOpacity, sheetHeight, EXPANDED_HORIZONTAL_MARGIN]);

  // Bridge refs: closeSheet is defined here but handleSaveEditMode lives lower in
  // the file. Using refs lets closeSheet commit pending edits without a forward ref.
  const isEditModeRef = useRef(isEditMode);
  useEffect(() => { isEditModeRef.current = isEditMode; }, [isEditMode]);
  const handleSaveEditModeRef = useRef(null);

  const closeSheet = useCallback(() => {
    if (isEditModeRef.current && handleSaveEditModeRef.current) {
      handleSaveEditModeRef.current();
    }
    setIsSheetOpen(false);
    setCurrentView(0);
    Animated.parallel([
      Animated.spring(sheetHeightAnim, { toValue: CLOSED_LID_HEIGHT, useNativeDriver: false, bounciness: 0, speed: 16 }),
      Animated.spring(sheetMarginAnim, { toValue: CLOSED_HORIZONTAL_MARGIN, useNativeDriver: false, bounciness: 0, speed: 16 }),
      Animated.timing(sheetBackdropOpacity, { toValue: 0, duration: 180, useNativeDriver: false }),
    ]).start();
  }, [sheetHeightAnim, sheetMarginAnim, sheetBackdropOpacity, CLOSED_HORIZONTAL_MARGIN]);

  const sheetPanResponder = useMemo(() => PanResponder.create({
    // Don't capture the start — let nested Pressable receive taps. Only take over on clear vertical movement.
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => {
      sheetHeightAnim.stopAnimation((v) => { sheetDragStartHeightRef.current = v; });
    },
    onPanResponderMove: (_, g) => {
      // Card is top-anchored and grows downward. Drag down (g.dy > 0) → grow (open).
      // Drag up (g.dy < 0) → shrink (close).
      const next = Math.max(CLOSED_LID_HEIGHT, Math.min(sheetHeight, sheetDragStartHeightRef.current + g.dy));
      sheetHeightAnim.setValue(next);
      const t = (next - CLOSED_LID_HEIGHT) / (sheetHeight - CLOSED_LID_HEIGHT);
      sheetBackdropOpacity.setValue(Math.max(0, Math.min(1, t)));
    },
    onPanResponderRelease: (_, g) => {
      const projected = sheetDragStartHeightRef.current + g.dy;
      const midpoint = (CLOSED_LID_HEIGHT + sheetHeight) / 2;
      const fastOpen = g.vy > 0.4;
      const fastClose = g.vy < -0.4;
      const shouldOpen = fastOpen || (!fastClose && projected > midpoint);
      if (shouldOpen) openSheet(); else closeSheet();
    },
    onPanResponderTerminate: () => closeSheet(),
  }), [sheetHeightAnim, sheetBackdropOpacity, sheetHeight, openSheet, closeSheet]);

  // Pull-down hint: until the user has ever opened the drawer, nudge the closed lid
  // down and back at the start of each new set to invite the slide-down gesture.
  useEffect(() => {
    if (hasEverOpenedDrawer || isSheetOpen) return;
    lidPulseAnim.setValue(0);
    // Wait for the screen/set to settle, then nudge a few times so it's noticeable.
    const anim = Animated.sequence([
      Animated.delay(700),
      Animated.loop(
        Animated.sequence([
          Animated.timing(lidPulseAnim, { toValue: 1, duration: 750, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: false }),
          Animated.timing(lidPulseAnim, { toValue: 0, duration: 950, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: false }),
        ]),
        { iterations: 2 }
      ),
    ]);
    anim.start();
    return () => { anim.stop(); lidPulseAnim.setValue(0); };
  }, [currentExerciseIndex, currentSetIndex, hasEverOpenedDrawer, isSheetOpen, lidPulseAnim]);

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
      if (!isMountedRef.current) return;
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
        
        if (hasData && isMountedRef.current) {
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
          
          if (isMountedRef.current) {
            await sessionManager.addExerciseData(
              currentExercise.id,
              currentExercise.name,
              allSets
            );
          }
        }
      } catch (error) {
        logger.error('❌ Error debounced-saving set data:', error);
      }
    }, 2000); // 2 second delay
  }, [workout, setData]);
  
  // Cleanup all timeouts on unmount (save timer + all other timeouts)
  useEffect(() => {
    return () => {
      // Clear all tracked timeouts
      allTimeoutIdsRef.current.forEach(id => clearTimeout(id));
      allTimeoutIdsRef.current = [];
      // Clear save timer
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

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
    // Selecting from the list closes the bottom sheet so the user lands on detail view.
    closeSheet();
  }, [closeSheet]);

  const toggleExerciseExpansion = useCallback((exerciseIndex) => {
    setExpandedExercises(prev => ({
      ...prev,
      [exerciseIndex]: !prev[exerciseIndex]
    }));
  }, []);

  const handleSelectSet = useCallback((exerciseIndex, setIndex) => {
    setCurrentExerciseIndex(exerciseIndex);
    setCurrentSetIndex(setIndex);
  }, []);

  // Restore horizontal scroll to list view (page 1). Only scroll; never call setCurrentView(1) here so we avoid re-renders that unmount the focused input (fixes keyboard closing on mobile PWA).
  // No-op: legacy hook from when the list lived in a horizontal pager.
  // The list now renders inside a bottom-sheet drawer, so there is no
  // horizontal scroll position to restore on input focus.
  const restoreListViewModelScroll = useCallback(() => {}, []);

  const getFieldDisplayName = useCallback((field, exercise = null) => {
    if (exercise?.customMeasureLabels?.[field]) return exercise.customMeasureLabels[field];
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
      'intensity': 'RPE (/10)',
      'previous': 'Anterior'
    };
    return fieldNames[field] || field.charAt(0).toUpperCase() + field.slice(1);
  }, []);

  const calculateEvenGaps = useCallback((set) => {
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
      const titleWidth = fieldName.length * 6.5;
      const contentWidth = placeholderText.length * 6.5;
      const maxWidth = Math.max(titleWidth, contentWidth);
      const extraWidth = fieldsToShow.length === 2 ? 12 : 0;
      const minWidth = fieldsToShow.length === 2 ? 68 : 50;
      const boxWidth = Math.max(maxWidth + 10 + extraWidth, minWidth);
      totalBoxWidth += boxWidth;
    });
    
    // Calculate available space (container width - padding)
    const containerWidth = 300; // Approximate available width
    const padding = 40; // Left padding (setNumber) + right padding
    const availableSpace = containerWidth - padding;
    
    // Calculate even gaps with minimum 8px
    const numberOfGaps = fieldsToShow.length + 1; // Gaps between boxes + gaps at borders
    const totalGapSpace = availableSpace - totalBoxWidth;
    const evenGap = Math.max(totalGapSpace / numberOfGaps, 4);
    
    return { evenGap, totalBoxWidth };
  }, [getFieldDisplayName]);

  // Leave the session without discarding: persist a checkpoint (which now folds
  // in any value typed but not yet flushed on blur) so the user can resume from
  // Hoy / DailyWorkout. Gives a frustrated user a safe exit that isn't "discard".
  const handleExitKeepProgress = useCallback(() => {
    try { saveCheckpointToLocalStorage(); } catch {}
    navigation.goBack();
  }, [saveCheckpointToLocalStorage, navigation]);

  const handleDiscardWorkout = useCallback(async () => {
    // Use custom modal on web, wakeAlert on native
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

            // Mark session as ended BEFORE clearing so the unmount cleanup
            // (which fires after navigation.goBack) won't re-write the checkpoint.
            sessionEndedRef.current = true;
            // Cancel the current session and clear local data
            await sessionManager.cancelSession();
            try { localStorage.removeItem('wake_session_checkpoint'); } catch {}
            if (checkpointApiTimerRef.current) {
              clearTimeout(checkpointApiTimerRef.current);
              checkpointApiTimerRef.current = null;
            }
            import('../utils/apiClient.js').then(mod => {
              const client = mod.default || mod.apiClient;
              client.delete('/workout/session/active').catch(() => {});
            });

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
      // Native: Use wakeAlert
      wakeAlert(
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

                // Mark session as ended BEFORE clearing so the unmount cleanup
                // (which fires after navigation.goBack) won't re-write the checkpoint.
                sessionEndedRef.current = true;
                // Cancel the current session and clear local data
                await sessionManager.cancelSession();
                try { localStorage.removeItem('wake_session_checkpoint'); } catch {}
                if (checkpointApiTimerRef.current) {
                  clearTimeout(checkpointApiTimerRef.current);
                  checkpointApiTimerRef.current = null;
                }
                import('../utils/apiClient.js').then(mod => {
                  const client = mod.default || mod.apiClient;
                  client.delete('/workout/session/active').catch(() => {});
                });

                // Navigate back to daily workout screen
                navigation.goBack();

              } catch (error) {
                logger.error('❌ Error discarding workout:', error);
                wakeAlert('Error', 'No se pudo descartar el entrenamiento.');
              }
            },
          },
        ]
      );
    }
  }, [isWeb, navigation]);

  const handleOpenSetInput = useCallback(() => {
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
  }, [workout, currentExerciseIndex, currentSetIndex, setData]);

  const handleSaveSetData = useCallback(async () => {
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
      await sessionManager.addExerciseData(currentExercise.id, currentExercise.name, allSets);

      // Animate modal out, then trigger the saved-row sweep once it's gone
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

        if (Platform.OS === 'web') {
          // Row sweep on the saved set
          if (savedKeyTimerRef.current) clearTimeout(savedKeyTimerRef.current);
          setLastSavedKey(key);
          savedKeyTimerRef.current = setTimeout(() => setLastSavedKey(null), 700);

          // Button sweep + objectives cascade
          if (postSaveTimerRef.current) clearTimeout(postSaveTimerRef.current);
          setShowPostSave(true);
          postSaveTimerRef.current = setTimeout(() => setShowPostSave(false), 1600);
        }

        // Checkpoint after every set save so rapid back-to-back saves all persist.
        saveCheckpointToLocalStorage();
        debouncedApiCheckpoint();

        // Automatically move to next set using ref
        if (handleNextSetRef.current) {
          handleNextSetRef.current();
        }
      });

    } catch (error) {
      logger.error('❌ Error saving set data:', error);
      // Always dismiss the modal so the UI never gets stuck on a failed save.
      Animated.parallel([
        Animated.timing(modalOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(modalTranslateY, { toValue: 300, duration: 200, useNativeDriver: true }),
      ]).start();
      setIsSetInputVisible(false);
      setCurrentSetInputData({});
      wakeAlert('Error', 'No se pudo guardar los datos de la serie. Inténtalo de nuevo.');
    }
  }, [currentExerciseIndex, currentSetIndex, currentSetInputData, workout, setData, saveCheckpointToLocalStorage, debouncedApiCheckpoint]);

  const handleCancelSetInput = useCallback(() => {
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
  }, []);

  const handleCloseNotesModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(notesModalOpacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(notesModalTranslateY, {
        toValue: 500,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start(() => setIsNotesModalVisible(false));
  }, []);

  useEffect(() => {
    if (!isNotesModalVisible) return;
    notesModalTranslateY.setValue(500);
    notesModalOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(notesModalOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(notesModalTranslateY, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isNotesModalVisible]);

  // Timer modal: open (same animation as set input modal)
  const handleOpenTimerModal = useCallback(() => {
    if (workoutStartTimeRef.current == null) {
      workoutStartTimeRef.current = Date.now();
    }
    setTotalElapsedSeconds(Math.floor((Date.now() - workoutStartTimeRef.current) / 1000));
    setIsTimerModalVisible(true);
    Animated.parallel([
      Animated.timing(timerModalOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(timerModalTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [timerModalOpacity, timerModalTranslateY]);

  const handleCloseTimerModal = useCallback(() => {
    setShowTimerEndedObjectivesModal(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    Animated.parallel([
      Animated.timing(timerModalOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(timerModalTranslateY, {
        toValue: 300,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsTimerModalVisible(false);
    });
  }, [timerModalOpacity, timerModalTranslateY]);

  const updateSelectedFromCustom = useCallback((min, sec) => {
    const total = Math.max(0, (min || 0) * 60 + (sec || 0));
    setSelectedRestSeconds(total);
  }, []);

  const startRestCountdown = useCallback(() => {
    if (selectedRestSeconds > 0) {
      setIsRestPaused(false);
      setRestSecondsRemaining(selectedRestSeconds);

      // Schedule push notification for when rest ends (web only)
      if (Platform.OS === 'web') {
        const endAt = new Date(Date.now() + selectedRestSeconds * 1000);
        const exerciseName = workout?.exercises?.[currentExerciseIndex]?.name || 'tu ejercicio';
        import('../services/notificationService.web.js').then((mod) => {
          mod.scheduleRestTimerNotification({
            endAtIso: endAt.toISOString(),
            metadata: { exerciseName, durationMs: selectedRestSeconds * 1000 },
          });
        }).catch(() => {});
      }
    }
  }, [selectedRestSeconds, workout, currentExerciseIndex]);

  isRestPausedRef.current = isRestPaused;

  const pauseRestCountdown = useCallback(() => {
    setIsRestPaused(true);
  }, []);

  const resumeRestCountdown = useCallback(() => {
    setIsRestPaused(false);
  }, []);

  const discardRestCountdown = useCallback(() => {
    setIsRestPaused(false);
    setRestSecondsRemaining(0);
  }, []);

  const handleMinutesScroll = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / TIMER_PICKER_ITEM_HEIGHT);
    const min = Math.max(0, Math.min(15, index));
    setCustomRestMinutes(min);
    updateSelectedFromCustom(min, customRestSeconds);
  }, [customRestSeconds, updateSelectedFromCustom]);

  const handleSecondsScroll = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / TIMER_PICKER_ITEM_HEIGHT);
    const sec = Math.max(0, Math.min(59, index));
    setCustomRestSeconds(sec);
    updateSelectedFromCustom(customRestMinutes, sec);
  }, [customRestMinutes, updateSelectedFromCustom]);

  // Reset paused state when rest finishes
  useEffect(() => {
    if (restSecondsRemaining === 0) setIsRestPaused(false);
  }, [restSecondsRemaining]);

  // When timer ends (countdown hit 0), show objectives modal + pulse
  useEffect(() => {
    if (restSecondsRemaining === 0 && timerJustEndedRef.current) {
      timerJustEndedRef.current = false;
      setShowTimerEndedObjectivesModal(true);
      if (Platform.OS === 'web') {
        setTimerEndedPulse(true);
        setTimeout(() => setTimerEndedPulse(false), 1800);
      }
    }
  }, [restSecondsRemaining]);

  // When timer modal opens, default to 3 minutes selected
  useEffect(() => {
    if (!isTimerModalVisible) return;
    setSelectedRestSeconds(180);
    setCustomRestMinutes(3);
    setCustomRestSeconds(0);
  }, [isTimerModalVisible]);

  // When timer modal opens, scroll custom pickers to current values
  useEffect(() => {
    if (!isTimerModalVisible) return;
    const t = setTimeout(() => {
      minutesScrollRef.current?.scrollTo({ y: 3 * TIMER_PICKER_ITEM_HEIGHT, animated: false });
      secondsScrollRef.current?.scrollTo({ y: 0 * TIMER_PICKER_ITEM_HEIGHT, animated: false });
    }, 100);
    return () => clearTimeout(t);
  }, [isTimerModalVisible]);

  // Session timer: tick total elapsed every second for the whole session, so the
  // header readout stays live even when the rest-timer modal is closed. Recomputes
  // from the start ref (set on mount / restored from checkpoint) so reloads keep counting.
  useEffect(() => {
    const tick = () => {
      const start = workoutStartTimeRef.current;
      if (start != null) {
        setTotalElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Timer modal: tick total time and rest countdown every second when modal is visible
  useEffect(() => {
    if (!isTimerModalVisible) return;
    const tick = () => {
      const start = workoutStartTimeRef.current;
      if (start != null) {
        setTotalElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      }
      setRestSecondsRemaining((prev) => {
        if (prev <= 0) return 0;
        if (isRestPausedRef.current) return prev;
        const next = prev - 1;
        if (next === 0) {
          timerJustEndedRef.current = true;
          if (Platform.OS !== 'web') {
            try { Vibration.vibrate(200); } catch (_) {}
          }
        }
        return next;
      });
    };
    tick(); // immediate first update
    timerIntervalRef.current = setInterval(tick, 1000);
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isTimerModalVisible]);

  // Swap exercise handlers - OPTIMIZED with cache pre-check
  const handleOpenSwapModal = useCallback((exerciseIndex) => {
    setCurrentSwapExerciseIndex(exerciseIndex);
    
    // Pre-check cache before showing modal
    const exercise = workout.exercises[exerciseIndex];
    const cacheKey = `${exerciseIndex}_${exercise.id}`;
    const cached = serviceCache.current.alternatives.get(cacheKey);
    const now = Date.now();
    const isCached = cached && (now - cached.timestamp) < serviceCache.current.ttl;
    
    if (isCached) {
      // Data is cached - show modal with data immediately (no loading state)
      setAlternativeExercises(cached.data);
      setCreatorName(cached.creatorName);
      setLoadingAlternatives(false);
      
      // Load current exercise video immediately
      if (exercise?.video_url) {
        setSwapModalVideoUri(exercise.video_url);
        const exSource = detectVideoSource(exercise.video_url, exercise.video_source);
        if (exSource !== 'youtube' && exSource !== 'vimeo') {
          const timeoutId = setTimeout(() => {
            if (isMountedRef.current) {
              swapModalVideoPlayer.replace(exercise.video_url);
              setIsSwapModalVideoPaused(false);
            }
          }, 50);
          allTimeoutIdsRef.current.push(timeoutId);
        }
      }
    } else {
      // Not cached - show loading state
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
    if (!isCached && loadAlternativesRef.current) {
      loadAlternativesRef.current(exerciseIndex);
    }
  }, [workout, swapModalOpacity, swapModalTranslateY]);

  // Store loadAlternatives in ref so it can be called before it's defined
  const loadAlternatives = useCallback(async (exerciseIndex) => {
    try {
      const exercise = workout.exercises[exerciseIndex];
      const alternatives = exercise.alternatives || {};
      
      // Check cache first
      const cacheKey = `${exerciseIndex}_${exercise.id}`;
      const cached = serviceCache.current.alternatives.get(cacheKey);
      const now = Date.now();
      
      if (cached && (now - cached.timestamp) < serviceCache.current.ttl) {
        setAlternativeExercises(cached.data);
        setCreatorName(cached.creatorName);
        
        // Load video after alternatives are loaded
        const currentExercise = workout.exercises[exerciseIndex];
        if (currentExercise?.video_url) {
          setSwapModalVideoUri(currentExercise.video_url);
          const curSource = detectVideoSource(currentExercise.video_url, currentExercise.video_source);
          if (curSource !== 'youtube' && curSource !== 'vimeo') {
            const timeoutId = setTimeout(() => {
              if (isMountedRef.current) {
                swapModalVideoPlayer.replace(currentExercise.video_url);
                setIsSwapModalVideoPaused(false);
              }
            }, 50);
            allTimeoutIdsRef.current.push(timeoutId);
          }
        }
        return;
      }
      
      // Get creator name from the first library document
      const firstLibraryId = Object.keys(alternatives)[0];
      let creatorName = '';
      if (firstLibraryId) {
        try {
          const libraryData = await exerciseLibraryService.getLibraryDocument(firstLibraryId);
          creatorName = libraryData?.creator_name || firstLibraryId;
        } catch (error) {
          logger.error('❌ Error fetching creator name:', error);
          creatorName = firstLibraryId;
        }
      }
      
      // Load all alternative exercises from all libraries - OPTIMIZED with Promise.all
      const alternativeExercisePromises = [];
      
      // alternatives shape: { [libId]: [valueOrId, ...] } — values may be a stable
      // exerciseId (post-migration) or a legacy display name. The /exercises/:libraryId/:id
      // endpoint accepts both and returns a hydrated displayName.
      for (const [libraryId, alternativeValues] of Object.entries(alternatives)) {
        if (!Array.isArray(alternativeValues)) continue;
        for (const idOrName of alternativeValues) {
          if (typeof idOrName !== 'string' || !idOrName.trim()) continue;

          const exercisePromise = exerciseLibraryService.getExerciseData(libraryId, idOrName)
            .then(exerciseData => ({
              id: idOrName,
              name: exerciseData.displayName || idOrName,
              description: exerciseData.description,
              video_url: exerciseData.video_url,
              muscle_activation: exerciseData.muscle_activation,
              libraryId: libraryId
            }))
            .catch(error => {
              logger.error(`❌ Error loading alternative exercise ${idOrName}:`, error);
              return null;
            });

          alternativeExercisePromises.push(exercisePromise);
        }
      }
      
      // Execute all fetches in parallel
      const loadStartTime = Date.now();
      const alternativeExercisesRaw = await Promise.all(alternativeExercisePromises);
      const loadTime = Date.now() - loadStartTime;
      
      // Filter out null values (failed exercises)
      const alternativeExercisesList = alternativeExercisesRaw.filter(ex => ex !== null);
      
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
        const curSource = detectVideoSource(currentExercise.video_url, currentExercise.video_source);
        if (curSource !== 'youtube' && curSource !== 'vimeo') {
          // Load video in background without blocking UI
          const timeoutId = setTimeout(() => {
            if (isMountedRef.current) {
              swapModalVideoPlayer.replace(currentExercise.video_url);
              setIsSwapModalVideoPaused(false);
            }
          }, 50);
          allTimeoutIdsRef.current.push(timeoutId);
        }
      }
    } catch (error) {
      logger.error('❌ Error loading alternatives:', error);
      setAlternativeExercises([]);
    } finally {
      setLoadingAlternatives(false);
    }
  }, [workout]);

  // Store loadAlternatives in ref so it can be called before it's defined
  useEffect(() => {
    loadAlternativesRef.current = loadAlternatives;
  }, [loadAlternatives]);

  const handleCloseSwapModal = useCallback(() => {
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
      // Release the player's source so it stops holding the video buffer
      // (frees the iOS decoder slot for the main player).
      try { swapModalVideoPlayer?.replace(''); } catch (_) {}
    });
  }, [swapModalOpacity, swapModalTranslateY, swapModalVideoPlayer]);

  // Swap modal video tap handler
  const handleSwapModalVideoTap = useCallback(() => {
    if (isSwapModalVideoPaused) {
      swapModalVideoPlayer.play();
      setIsSwapModalVideoPaused(false);
    } else {
      swapModalVideoPlayer.pause();
      setIsSwapModalVideoPaused(true);
    }
  }, [isSwapModalVideoPaused, swapModalVideoPlayer]);

  // Add exercise modal card tap handler - match swap modal: set URI, expand, then replace() after short delay so VideoView has mounted
  const handleAddExerciseCardTap = useCallback((exercise, index) => {
    // If clicking the same card that's already expanded, collapse it
    if (expandedAddExerciseIndex === index) {
      setExpandedAddExerciseIndex(null);
      setAddExerciseModalVideoUri('');
      setIsAddExerciseModalVideoPaused(true);
      return;
    }
    
    // Expand the clicked card immediately (same as swap modal handleCardTap)
    setExpandedAddExerciseIndex(index);
    if (exercise?.video_url) {
      setAddExerciseModalVideoUri(exercise.video_url);
      const exSource = detectVideoSource(exercise.video_url, exercise.video_source);
      if (exSource !== 'youtube' && exSource !== 'vimeo') {
        const timeoutId = setTimeout(() => {
          if (isMountedRef.current && exercise?.video_url) {
            try {
              addExerciseModalVideoPlayer.replace(exercise.video_url);
              addExerciseModalVideoPlayer.play();
              setIsAddExerciseModalVideoPaused(false);
            } catch (e) {
              if (e?.name !== 'AbortError') logger.error('Add exercise modal replace error:', e);
            }
          }
        }, 100); // Same delay as swap modal so VideoView has mounted
        allTimeoutIdsRef.current.push(timeoutId);
      }
    } else {
      setAddExerciseModalVideoUri('');
    }
  }, [expandedAddExerciseIndex, addExerciseModalVideoPlayer]);

  // Release the add-exercise modal player's source when the modal closes so
  // it stops holding the video buffer and frees the iOS decoder slot for the
  // main exercise player.
  useEffect(() => {
    if (isAddExerciseModalVisible) return;
    if (!addExerciseModalVideoPlayer) return;
    try { addExerciseModalVideoPlayer.replace(''); } catch (_) {}
  }, [isAddExerciseModalVisible, addExerciseModalVideoPlayer]);

  // Add exercise modal video tap handler
  const handleAddExerciseModalVideoTap = useCallback(() => {
    if (isAddExerciseModalVideoPaused) {
      addExerciseModalVideoPlayer.play();
      setIsAddExerciseModalVideoPaused(false);
    } else {
      addExerciseModalVideoPlayer.pause();
      setIsAddExerciseModalVideoPaused(true);
    }
  }, [isAddExerciseModalVideoPaused, addExerciseModalVideoPlayer]);

  // Intensity video tap handler
  const handleIntensityVideoTap = useCallback((intensity) => {
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
  }, [intensityVideoMap, isIntensityVideoPaused, intensityVideoPlayer]);

  // Handle intensity card press - expand/collapse video
  const handleIntensityCardPress = useCallback((intensity) => {
    if (selectedIntensity === intensity) {
      Animated.timing(getOrCreateIntensityAnim(intensity), { toValue: 0, duration: 200, useNativeDriver: true }).start();
      setSelectedIntensity(null);
      intensityVideoPlayer.pause();
      setIsIntensityVideoPaused(true);
    } else {
      if (selectedIntensity != null) {
        Animated.timing(getOrCreateIntensityAnim(selectedIntensity), { toValue: 0, duration: 200, useNativeDriver: true }).start();
      }
      Animated.timing(getOrCreateIntensityAnim(intensity), { toValue: 1, duration: 200, useNativeDriver: true }).start();
      setSelectedIntensity(intensity);
      const videoUri = intensityVideoMap[intensity];
      setIntensityVideoUri(videoUri);
      setCurrentIntensity(intensity);
      intensityVideoPlayer.replace(videoUri);
      setIsIntensityVideoPaused(false);
    }
  }, [selectedIntensity, intensityVideoMap, intensityVideoPlayer]);

  // Toggle intensity video play/pause
  const toggleIntensityVideo = useCallback(() => {
    if (isIntensityVideoPaused) {
      intensityVideoPlayer.play();
      setIsIntensityVideoPaused(false);
    } else {
      intensityVideoPlayer.pause();
      setIsIntensityVideoPaused(true);
    }
  }, [isIntensityVideoPaused, intensityVideoPlayer]);

  // Handle card tap (current exercise or alternative) - OPTIMIZED with lazy video loading
  const handleCardTap = useCallback((exercise, index) => {
    // If clicking the same card that's already expanded, do nothing
    if (expandedCardIndex === index) {
      return;
    }
    
    // Expand the clicked card immediately
    setExpandedCardIndex(index);
    
    // OPTIMIZED: Only load video when card is actually expanded (lazy loading)
    if (exercise?.video_url) {
      setSwapModalVideoUri(exercise.video_url);
      const exSource = detectVideoSource(exercise.video_url, exercise.video_source);
      if (exSource !== 'youtube' && exSource !== 'vimeo') {
        // Load video completely in background without blocking UI
        const timeoutId = setTimeout(() => {
          if (isMountedRef.current && exercise?.video_url) {
            swapModalVideoPlayer.replace(exercise.video_url);
            setIsSwapModalVideoPaused(false);
          }
        }, 100); // Slightly longer delay to ensure card expansion completes first
        allTimeoutIdsRef.current.push(timeoutId);
      }
    }
  }, [expandedCardIndex, swapModalVideoPlayer]);

  // Objective info modal handlers
  const handleObjectiveCardPress = useCallback((objective) => {
    try {
      // Show the objective info modal (same pop-up as Repeticiones, etc.). "Anterior" has its own
      // title/description in objectivesInfoService, so no special-case — use the shared info modal.
      const info = objectivesInfoService.getObjectiveInfo(objective);
      if (info) {
        setSelectedObjectiveInfo(info);
        setIsObjectiveInfoModalVisible(true);
      }
    } catch (error) {
      logger.error('❌ Error in handleObjectiveCardPress:', error);
    }
  }, []);

  const handleCloseObjectiveInfoModal = useCallback(() => {
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
  }, [intensityVideoPlayer]);

  const handleViewExerciseProgress = useCallback(async () => {
    try {
      const currentExercise = workout?.exercises?.[currentExerciseIndex];
      if (!currentExercise) {
        logger.error('❌ Cannot show exercise progress - no current exercise');
        return;
      }

      // Extract libraryId and the library exercise id (post-migration shape).
      // history keys are stored as `${libId}_${libraryExerciseId}` — the value of
      // primary[libId] (which is a stable id post-migration, or a name pre-migration).
      const libraryId = currentExercise.primary ? Object.keys(currentExercise.primary)[0] : '';
      const libraryExerciseId = libraryId && currentExercise.primary ? currentExercise.primary[libraryId] : '';
      const exerciseName = currentExercise.name;

      if (!libraryId || !libraryExerciseId) {
        logger.error('❌ Missing exercise data for exercise progress:', { libraryId, exerciseName });
        return;
      }

      // Create exercise key — same shape the server uses when writing history.
      const exerciseKey = `${libraryId}_${libraryExerciseId}`;
      
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
          const estimates = await oneRepMaxService.getEstimatesForUser(user.uid);
          const estimate = estimates[exerciseKey];
          
          // Update with estimate data if available
          basicExerciseData.currentEstimate = estimate?.current || null;
          basicExerciseData.lastUpdated = estimate?.lastUpdated || null;
        } catch (error) {
          logger.error('❌ Error fetching estimates for exercise progress modal:', error);
          // Continue with basic data (no estimates)
        }
      }

      // Store the exercise data for the modal
      setModalExerciseData(basicExerciseData);
      
      // Show the modal with exercise data
      setIsExerciseDetailModalVisible(true);
    } catch (error) {
      logger.error('❌ Error in handleViewExerciseProgress:', error);
    }
  }, [workout, currentExerciseIndex, user?.uid]);

  const handleCloseExerciseDetailModal = useCallback(() => {
    setIsExerciseDetailModalVisible(false);
    setModalExerciseData(null);
  }, []);

  const handleSwapExercise = useCallback((selectedExercise) => {
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
            
            // Add current exercise back to its original library — use the stable
            // libraryExerciseId (the value of primary[libId], which is an id post-migration)
            // so refs survive renames.
            const currentLibraryExerciseId = currentLibraryId && currentExercise.primary
              ? currentExercise.primary[currentLibraryId] : null;
            if (currentLibraryId && currentLibraryExerciseId) {
              if (!newAlternatives[currentLibraryId]) {
                newAlternatives[currentLibraryId] = [];
              }
              if (!newAlternatives[currentLibraryId].includes(currentLibraryExerciseId)) {
                newAlternatives[currentLibraryId].push(currentLibraryExerciseId);
              }
            }

            // Remove selected exercise from its library — selectedExercise.id is the
            // stable id when the picker came from the post-migration exercisesById map.
            const selectedValue = selectedExercise.id || selectedExercise.name;
            if (newAlternatives[selectedExercise.libraryId]) {
              newAlternatives[selectedExercise.libraryId] = newAlternatives[selectedExercise.libraryId]
                .filter(v => v !== selectedValue && v !== selectedExercise.name);
            }

            return {
              ...exercise,
              name: selectedExercise.name,
              description: selectedExercise.description,
              video_url: selectedExercise.video_url,
              primary: { [selectedExercise.libraryId]: selectedValue },
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
                } else {
                  logger.error('❌ Error playing video after swap:', error.message);
                }
              });
            }
          }
        }
      }

      // Close modal
      handleCloseSwapModal();

    } catch (error) {
      logger.error('❌ Error swapping exercise:', error);
      wakeAlert('Error', 'No se pudo cambiar el ejercicio. Inténtalo de nuevo.');
    }
  }, [currentSwapExerciseIndex, workout, videoPlayer, swapModalVideoPlayer]);

  // Add/Remove set functions
  const addSet = useCallback((exerciseIndex) => {
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
    
  }, [workout, setData]);

  const removeSet = useCallback((exerciseIndex) => {
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

  }, [workout, currentExerciseIndex, currentSetIndex, setData]);

  // Edit mode system functions
  const handleToggleEditMode = useCallback(() => {
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
      
    } else {
      // Enter edit mode
      setEditingExercises([...workout.exercises]);
      setIsEditMode(true);
    }
  }, [isEditMode, workout, dragAnimatedValues]);

  const handleSaveEditMode = useCallback(() => {
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
      
    } catch (error) {
      logger.error('❌ Error saving edit mode:', error);
      // Force exit edit mode even if there's an error
      setIsEditMode(false);
      setEditingExercises([]);
      setIsAddExerciseModalVisible(false);
      setAvailableExercises([]);
      setLoadingAvailableExercises(false);
    }
  }, [editingExercises, dragAnimatedValues]);

  // Bridge: closeSheet (defined earlier) calls this when the user dismisses the
  // sheet while in edit mode, so unsaved reorders/adds are committed instead of lost.
  useEffect(() => { handleSaveEditModeRef.current = handleSaveEditMode; }, [handleSaveEditMode]);

  const handleCancelEditMode = useCallback(() => {
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
    
  }, [dragAnimatedValues]);

  const handleOpenAddExerciseModal = useCallback(() => {
    try {
      setIsAddExerciseModalVisible(true);
      if (loadAvailableExercisesRef.current) {
        loadAvailableExercisesRef.current();
      }
    } catch (error) {
      logger.error('❌ Error opening add exercise modal:', error);
      wakeAlert('Error', 'No se pudo abrir la lista de ejercicios.');
    }
  }, []);

  const handleAddExerciseInEdit = useCallback((selectedExercise) => {
    // Write the stable libraryExerciseId in primary so refs survive renames.
    const primaryValue = selectedExercise.id || selectedExercise.name;
    const newExercise = {
      id: `added_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: selectedExercise.name,
      description: selectedExercise.description,
      video_url: selectedExercise.video_url,
      muscle_activation: selectedExercise.muscle_activation,
      libraryId: selectedExercise.libraryId,
      primary: { [selectedExercise.libraryId]: primaryValue },
      alternatives: {},
      order: editingExercises.length,
      measures: ["reps", "weight", "intensity"],
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
  }, [editingExercises]);

  const handleRemoveExerciseInEdit = useCallback((exerciseIndex) => {
    wakeAlert(
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
  }, [editingExercises]);

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
    } catch (error) {
      logger.error('❌ Error updating set data order:', error);
      // Don't update setData if there's an error
    }
  };

  // Drag and drop handlers
  const handlePanGesture = useCallback((event, index) => {
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
  }, [draggedIndex, dragAnimatedValues]);

  const handlePanStateChange = useCallback((event, index) => {
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
        // Calculate drop position and reorder
        const dropIndex = calculateDropIndex(translationY, index);
        if (dropIndex !== null && dropIndex !== index) {
          reorderExercises(index, dropIndex);
        } else {
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
  }, [draggedIndex, dropZoneIndex, dragAnimatedValues]);

  const calculateDropIndex = (translationY, currentIndex) => {
    const cardHeight = 80; // Approximate card height
    const dragDistance = Math.abs(translationY);
    const direction = translationY > 0 ? 1 : -1;
    
    if (dragDistance < cardHeight * 0.3) {
      return null; // Not enough movement
    }
    
    // Calculate how many positions to move based on drag distance
    const positionsToMove = Math.floor(dragDistance / cardHeight);
    let targetIndex = currentIndex + (direction * positionsToMove);
    
    // Clamp target index to valid range (0 to editingExercises.length)
    targetIndex = Math.max(0, Math.min(targetIndex, editingExercises.length));
    
    // Don't allow dropping at the same position
    if (targetIndex === currentIndex) {
      return null;
    }
    
    return targetIndex;
  };

  const reorderExercises = (fromIndex, toIndex) => {
    setEditingExercises(prev => {
      const newExercises = [...prev];
      const [movedExercise] = newExercises.splice(fromIndex, 1);
      newExercises.splice(toIndex, 0, movedExercise);
      return newExercises;
    });
  };

  const handleDragStart = useCallback((index) => {
    setDraggedIndex(index);
  }, []);

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
        } else {
          // Current exercise was removed, go to first exercise
          setCurrentExerciseIndex(0);
          setCurrentSetIndex(0);
        }
      }
    } catch (error) {
      logger.error('❌ Error adjusting current indices:', error);
      // Reset to safe state
      setCurrentExerciseIndex(0);
      setCurrentSetIndex(0);
    }
  };

  const loadAvailableExercises = useCallback(async () => {
    try {
      setLoadingAvailableExercises(true);
      
      // Get available libraries from course
      const availableLibraries = course.availableLibraries || [];
      
      if (availableLibraries.length === 0) {
        setAvailableExercises([]);
        setLoadingAvailableExercises(false);
        return;
      }

      // Load exercises from all available libraries
      const exerciseEntries = [];

      for (const libraryId of availableLibraries) {
        try {
          const libraryData = await exerciseLibraryService.getLibraryDocument(libraryId);
          if (libraryData) {
            // API returns { id, creator_name, title, exercises (legacy name-keyed), exercisesById (new id-keyed) }.
            // Prefer the post-migration id-keyed map so picker items expose stable ids.
            const idMap = libraryData.exercisesById && typeof libraryData.exercisesById === 'object'
              ? libraryData.exercisesById : null;
            if (idMap && Object.keys(idMap).length > 0) {
              Object.entries(idMap).forEach(([exerciseId, exerciseData]) => {
                if (!exerciseData || typeof exerciseData !== 'object') return;
                exerciseEntries.push({
                  id: exerciseId,
                  name: exerciseData.displayName || exerciseId,
                  description: exerciseData.description || '',
                  video_url: exerciseData.video_url || '',
                  muscle_activation: exerciseData.muscle_activation || {},
                  implements: Array.isArray(exerciseData.implements) ? exerciseData.implements : [],
                  libraryId: libraryId
                });
              });
            } else {
              // Legacy fallback: iterate top-level name-keyed entries (unmigrated libraries).
              const exercises = libraryData.exercises || libraryData;
              Object.entries(exercises).forEach(([exerciseName, exerciseData]) => {
                if (typeof exerciseData === 'object' && exerciseData !== null && exerciseName !== 'creator_name' && exerciseName !== 'creator_id' && exerciseName !== 'created_at' && exerciseName !== 'id' && exerciseName !== 'exercises' && exerciseName !== 'exercisesById') {
                  exerciseEntries.push({
                    id: null,
                    name: exerciseName,
                    description: exerciseData.description || '',
                    video_url: exerciseData.video_url || '',
                    muscle_activation: exerciseData.muscle_activation || {},
                    implements: Array.isArray(exerciseData.implements) ? exerciseData.implements : [],
                    libraryId: libraryId
                  });
                }
              });
            }
          }
        } catch (error) {
          logger.error(`❌ Error loading library ${libraryId}:`, error);
        }
      }

      const availableExercises = exerciseEntries;
      
      // Log first exercise to debug
      if (availableExercises.length > 0) {
      }
      
      setAvailableExercises(availableExercises);
      
    } catch (error) {
      logger.error('❌ Error loading available exercises:', error);
      setAvailableExercises([]);
    } finally {
      setLoadingAvailableExercises(false);
    }
  }, [course]);

  // Store loadAvailableExercises in ref so it can be called before it's defined
  useEffect(() => {
    loadAvailableExercisesRef.current = loadAvailableExercises;
  }, [loadAvailableExercises]);

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
  const handleOpenFilter = useCallback(() => {
    // Remember that add exercise modal was open
    setWasAddExerciseModalOpen(isAddExerciseModalVisible);
    // Close add exercise modal and open filter modal
    setIsAddExerciseModalVisible(false);
    setTempSelectedMuscles(new Set(selectedMuscles));
    setTempSelectedImplements(new Set(selectedImplements));
    setIsFilterModalVisible(true);
  }, [isAddExerciseModalVisible, selectedMuscles, selectedImplements]);

  const handleCloseFilter = useCallback(() => {
    setIsFilterModalVisible(false);
    // Reopen add exercise modal if it was open before
    if (wasAddExerciseModalOpen) {
      // Small delay to ensure smooth transition
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
          setIsAddExerciseModalVisible(true);
          setWasAddExerciseModalOpen(false);
        }
      }, 100);
      allTimeoutIdsRef.current.push(timeoutId);
    }
  }, [wasAddExerciseModalOpen]);

  const handleToggleMuscle = useCallback((muscle) => {
    setTempSelectedMuscles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(muscle)) {
        newSet.delete(muscle);
      } else {
        newSet.add(muscle);
      }
      return newSet;
    });
  }, []);

  const handleToggleImplement = useCallback((implement) => {
    setTempSelectedImplements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(implement)) {
        newSet.delete(implement);
      } else {
        newSet.add(implement);
      }
      return newSet;
    });
  }, []);

  const handleClearFilter = useCallback(() => {
    setTempSelectedMuscles(new Set());
    setTempSelectedImplements(new Set());
  }, []);

  const handleApplyFilter = useCallback(() => {
    setSelectedMuscles(new Set(tempSelectedMuscles));
    setSelectedImplements(new Set(tempSelectedImplements));
    setIsFilterModalVisible(false);
    // Reopen add exercise modal if it was open before
    if (wasAddExerciseModalOpen) {
      // Small delay to ensure smooth transition
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
          setIsAddExerciseModalVisible(true);
          setWasAddExerciseModalOpen(false);
        }
      }, 100);
      allTimeoutIdsRef.current.push(timeoutId);
    }
  }, [tempSelectedMuscles, tempSelectedImplements, wasAddExerciseModalOpen]);

  const handleClearAllFilters = useCallback(() => {
    setSelectedMuscles(new Set());
    setSelectedImplements(new Set());
    setTempSelectedMuscles(new Set());
    setTempSelectedImplements(new Set());
  }, []);

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

  const handleEndWorkout = useCallback(async () => {
    
    // Check for validation errors first
    if (hasValidationErrors()) {
      wakeAlert(
        'Datos Inválidos',
        'Hay campos con datos inválidos. Por favor corrige los errores antes de finalizar el entrenamiento.',
        [{ text: 'OK' }]
      );
      return;
    }

    const isCompleted = checkAllExercisesCompleted();
    
    if (!isCompleted) {
      // Show warning for incomplete workout
      
      // Use web-compatible confirmation on web, wakeAlert on native
      if (isWeb) {
        setConfirmModalConfig({
          title: 'Entrenamiento Incompleto',
          message: '¿Finalizar aunque no esté completo?',
          onConfirm: () => {
            setConfirmModalVisible(false);
            confirmEndWorkout();
          },
          onCancel: () => {
            setConfirmModalVisible(false);
          },
          confirmText: 'Finalizar',
          cancelText: 'Cancelar',
          isDestructive: true,
        });
        setConfirmModalVisible(true);
        return;
      }
      
      // Native: Use wakeAlert
      wakeAlert(
        'Entrenamiento Incompleto',
        'No has completado todos los ejercicios de esta sesión. ¿Estás seguro de que quieres finalizar y guardar el entrenamiento de todas formas?',
        [
          {
            text: 'Cancelar',
            style: 'cancel',
            onPress: () => {},
          },
          {
            text: 'Finalizar de Todas Formas',
            style: 'destructive',
            onPress: () => {
              confirmEndWorkout();
            },
          },
        ]
      );
    } else {
      // Workout is complete, proceed normally
      if (confirmEndWorkoutRef.current) {
        confirmEndWorkoutRef.current();
      }
    }
  }, [workout, setData, user, course, navigation]);

  const confirmEndWorkout = useCallback(() => {
    
      // Use web-compatible confirmation on web, wakeAlert on native
      if (isWeb) {
        setConfirmModalConfig({
          title: 'Finalizar Entrenamiento',
          message: '¿Guardar y finalizar?',
          onConfirm: async () => {
            setConfirmModalVisible(false);
            if (executeEndWorkoutRef.current) {
              await executeEndWorkoutRef.current();
            }
          },
          onCancel: () => {
            setConfirmModalVisible(false);
          },
          confirmText: 'Finalizar',
          cancelText: 'Cancelar',
        });
        setConfirmModalVisible(true);
        return;
      }
    
    // Native: Use wakeAlert
    wakeAlert(
      'Finalizar Entrenamiento',
      '¿Estás seguro de que quieres finalizar y guardar este entrenamiento?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
          onPress: () => {},
        },
        {
          text: 'Finalizar',
          onPress: async () => {
            if (executeEndWorkoutRef.current) {
              await executeEndWorkoutRef.current();
            }
          },
        },
      ]
    );
  }, [isWeb]);

  // Store confirmEndWorkout in ref so it can be called before it's defined
  useEffect(() => {
    confirmEndWorkoutRef.current = confirmEndWorkout;
  }, [confirmEndWorkout]);

  const executeEndWorkout = useCallback(async () => {
                 try {
                   setIsSavingWorkout(true);

                   // Get user from useAuth hook, fallback to Firebase auth.currentUser if needed
                   const currentUser = user || auth.currentUser;
                   // Fold in any value typed but not yet flushed on blur so the final
                   // save can't drop the last set the user was editing.
                   const effectiveSetData = mergeSetData(setData, pendingInputRef.current);

                   if (currentUser?.uid && course?.courseId) {
                     // Save only exercises that have actual user data before completing
                     for (let exerciseIndex = 0; exerciseIndex < workout.exercises.length; exerciseIndex++) {
                       const exercise = workout.exercises[exerciseIndex];
                       const allSets = [];
                       let hasAnyData = false;

                       for (let setIndex = 0; setIndex < exercise.sets.length; setIndex++) {
                         const setKey = `${exerciseIndex}_${setIndex}`;
                         const currentSetData = effectiveSetData[setKey] || {};
                         allSets.push(currentSetData);
                         const hasReps = currentSetData.reps && currentSetData.reps !== '' && (!isNaN(parseFloat(currentSetData.reps)) || String(currentSetData.reps).trim().toUpperCase() === 'AMRAP');
                         const hasWeight = currentSetData.weight && currentSetData.weight !== '' && !isNaN(parseFloat(currentSetData.weight));
                         const hasDuration = currentSetData.duration && currentSetData.duration !== '' && !isNaN(parseFloat(currentSetData.duration));
                         if (hasReps || hasWeight || hasDuration) hasAnyData = true;
                       }

                       if (hasAnyData) {
                         await sessionManager.addExerciseData(exercise.id, exercise.name, allSets);
                       }
                     }
                     
                     // Complete the session using new session manager
                    // Update workout with actual set data for muscle volume calculation
                    
                    const workoutWithSetData = {
                      ...workout,
                      exercises: workout.exercises.map((exercise, exerciseIndex) => {
                        const setsWithData = exercise.sets.map((set, setIndex) => {
                          const key = `${exerciseIndex}_${setIndex}`;
                          const actualSetData = effectiveSetData[key] || {};

                          return {
                            ...set,
                            weight: actualSetData.weight || '',
                            reps: actualSetData.reps || '',
                            intensity: actualSetData.intensity || '',
                            plannedIntensity: set.intensity || '',
                            rir: actualSetData.rir || '',
                            time: actualSetData.time || '',
                            distance: actualSetData.distance || '',
                            pace: actualSetData.pace || '',
                            heart_rate: actualSetData.heart_rate || '',
                            calories: actualSetData.calories || '',
                            rest_time: actualSetData.rest_time || '',
                            duration: actualSetData.duration || ''
                          };
                        });
                        return { ...exercise, sets: setsWithData };
                      }).filter((exercise) => {
                        // Only include exercises where at least one set has actual data
                        return exercise.sets.some(s => {
                          const hasReps = s.reps && s.reps !== '' && (!isNaN(parseFloat(s.reps)) || String(s.reps).trim().toUpperCase() === 'AMRAP');
                          const hasWeight = s.weight && s.weight !== '' && !isNaN(parseFloat(s.weight));
                          const hasTime = s.time && s.time !== '' && !isNaN(parseFloat(s.time));
                          const hasDistance = s.distance && s.distance !== '' && !isNaN(parseFloat(s.distance));
                          const hasDuration = s.duration && s.duration !== '' && !isNaN(parseFloat(s.duration));
                          return hasReps || hasWeight || hasTime || hasDistance || hasDuration;
                        });
                      })
                    };
                    
                    // Guard: if the user recorded set data but nothing survived
                    // filtering, abort instead of saving an empty session.
                    // This catches index-alignment bugs on the resume path.
                    if (
                      workoutWithSetData.exercises.length === 0 &&
                      Object.values(effectiveSetData).some(v => v && (v.reps || v.weight || v.time || v.distance || v.duration))
                    ) {
                      logger.error('❌ completeSession aborted: setData present but all exercises filtered out', {
                        setDataKeys: Object.keys(effectiveSetData).length,
                        workoutExerciseCount: workout.exercises?.length,
                      });
                      wakeAlert(
                        'Error al guardar',
                        'No pudimos alinear los datos de la sesión. Cierra y vuelve a abrir el entrenamiento para reintentar.'
                      );
                      return;
                    }

                    const result = await sessionService.completeSession(
                      currentUser.uid,
                      course.courseId,
                      workoutWithSetData,
                      { plannedWorkout: workout, userNotes: sessionNotes, replacesCompletionId: reopenCompletionId || null }
                    );
                     
                     if (result) {
                       // Mark session as ended BEFORE clearing so the unmount cleanup
                       // (which fires when navigating to WorkoutCompletion) won't
                       // re-write the checkpoint.
                       sessionEndedRef.current = true;
                       // Clear checkpoint on successful completion
                       try { localStorage.removeItem('wake_session_checkpoint'); } catch {}
                       sessionManager.cancelPendingCheckpoint();
                       if (checkpointApiTimerRef.current) {
                         clearTimeout(checkpointApiTimerRef.current);
                         checkpointApiTimerRef.current = null;
                       }
                       import('../utils/apiClient.js').then(mod => {
                         const client = mod.default || mod.apiClient;
                         client.delete('/workout/session/active');
                       });

                       const { sessionData, stats, sessionMuscleVolumes, personalRecords = [] } = result;
                       
                       // Navigate to completion screen with session data
                       try {
                         navigation.navigate('WorkoutCompletion', {
                           course: course,
                           workout: workout,
                           sessionData: sessionData,
                           localStats: stats,
                           personalRecords: personalRecords,
                           sessionMuscleVolumes: sessionMuscleVolumes
                         });
                       } catch (navError) {
                         logger.error('❌ Navigation error:', navError);
                         wakeAlert('Error', 'No se pudo navegar a la pantalla de finalización.');
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
                         wakeAlert('Error', 'No se encontró una sesión activa para finalizar.');
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
                      wakeAlert('Error', 'No se pudo finalizar el entrenamiento: datos de usuario o curso faltantes.');
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
                     wakeAlert('Error', 'No se pudo finalizar el entrenamiento. Inténtalo de nuevo.');
                   }
                 } finally {
                   setIsSavingWorkout(false);
                 }
  }, [workout, setData, user, course, navigation, isWeb]);

  // Store executeEndWorkout in ref so it can be called before it's defined
  useEffect(() => {
    executeEndWorkoutRef.current = executeEndWorkout;
  }, [executeEndWorkout]);

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
    const exerciseForLabel = exercise || getCurrentExercise();

    return fieldsToShow.map((field, fieldIndex) => {
      const fieldName = getFieldDisplayName(field, exerciseForLabel);
      const fieldValue = set[field]?.toString() || '';
      const placeholderText = fieldValue !== undefined && fieldValue !== null && fieldValue !== '' ? fieldValue.toString() : '--';
      const titleWidth = fieldName.length * 6.5;
      const contentWidth = placeholderText.length * 6.5;
      const maxWidth = Math.max(titleWidth, contentWidth);
      const extraWidth = fieldsToShow.length === 2 ? 12 : 0;
      const minWidth = fieldsToShow.length === 2 ? 68 : 50;
      const boxWidth = Math.max(maxWidth + 10 + extraWidth, minWidth);

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
      const fieldName = getFieldDisplayName(field, exercise);
      const objectiveValue = set[field];
      const placeholderText = objectiveValue?.toString() || '--';
      const titleWidth = fieldName.length * 6.5;
      const contentWidth = placeholderText.length * 6.5;
      const maxWidth = Math.max(titleWidth, contentWidth);
      const extraWidth = fieldsToShow.length === 2 ? 12 : 0;
      const minWidth = fieldsToShow.length === 2 ? 68 : 50;
      const boxWidth = Math.max(maxWidth + 10 + extraWidth, minWidth);
      const savedValue = currentSetData[field] || '';
      
      return (
        <View key={`${exerciseIndex}_${setIndex}_${field}`} style={[styles.inputGroup, { 
          width: boxWidth, 
          marginLeft: fieldIndex === 0 ? evenGap : 0,
          marginRight: fieldIndex < fieldsToShow.length - 1 ? evenGap : 0 
        }]}>
          <ListViewSetInputField
            exerciseIndex={exerciseIndex}
            setIndex={setIndex}
            field={field}
            savedValue={savedValue}
            updateSetData={updateSetData}
            style={[
              styles.setInput,
              setValidationErrors[`${exerciseIndex}_${setIndex}_${field}`] && styles.setInputError
            ]}
            placeholderText={placeholderText}
            listViewInputJustFocusedRef={listViewInputJustFocusedRef}
            restoreListViewModelScroll={restoreListViewModelScroll}
            freezeDimsForListInput={freezeDimsForListInput}
            unfreezeDimsForListInput={unfreezeDimsForListInput}
            pendingInputRef={pendingInputRef}
          />
        </View>
      );
    });
  }, [workout, setValidationErrors, updateSetData, restoreListViewModelScroll, freezeDimsForListInput, unfreezeDimsForListInput, pendingInputRef]);

  // Render function for FlatList exercise items
  const renderExerciseItem = useCallback(({ item: exercise, index: exerciseIndex }) => {
    const isExpanded = expandedExercises[exerciseIndex];
    return (
      <ExerciseItem
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
        lastSavedKey={lastSavedKey}
        renderSetHeaders={renderSetHeaders}
        renderSetInputFields={renderSetInputFields}
        styles={styles}
        accentColor={accentColor}
      />
    );
  }, [
    expandedExercises,
    toggleExerciseExpansion,
    handleOpenSwapModal,
    addSet,
    removeSet,
    handleSelectSet,
    setData,
    currentExerciseIndex,
    currentSetIndex,
    lastSavedKey,
    renderSetHeaders,
    renderSetInputFields,
    styles,
    accentColor,
  ]);

  // Key extractor for FlatList
  const keyExtractor = useCallback((item, index) => {
    return `exercise-${index}-${item.id || item.name || index}`;
  }, []);

  // List header component (rendered inside the bottom-sheet drawer — no fixed-header spacer needed)
  const ListHeaderComponent = useMemo(() => (
    <>
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
          <View style={styles.editModeControls}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsNotesModalVisible(true)}
              accessibilityLabel="Notas de la sesión"
            >
              <SvgEditPencil width={18} height={18} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.editButton}
              onPress={handleToggleEditMode}
            >
              <Text style={styles.editButtonText}>Editar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </>
  ), [
    workout?.title,
    workout?.name,
    isEditMode,
    handleOpenAddExerciseModal,
    handleSaveEditMode,
    handleToggleEditMode,
    setIsNotesModalVisible,
  ]);

  // List footer component
  const ListFooterComponent = useMemo(() => (
    <TouchableOpacity
      style={[
        styles.endWorkoutButton,
        checkAllExercisesCompleted() && styles.endWorkoutButtonActive,
        hasValidationErrors() && styles.endWorkoutButtonDisabled,
        isEditMode && styles.endWorkoutButtonDisabled
      ]}
      {...(checkAllExercisesCompleted() && Platform.OS === 'web' ? { className: 'wake-finalizar-glow' } : {})}
      onPress={() => {
        if (!isEditMode) {
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
  ), [
    checkAllExercisesCompleted,
    hasValidationErrors,
    isEditMode,
    isSavingWorkout,
    handleEndWorkout,
  ]);

  const renderExerciseListView = () => {
    // Edit mode: Use ScrollView for drag-and-drop functionality
    if (isEditMode) {
      return (
        <ScrollView style={styles.exerciseListView} showsVerticalScrollIndicator={false}>
          <View style={styles.exerciseListContent}>
            <View style={styles.exerciseListTitleSection}>
              <Text style={styles.exerciseListTitle}>
                {workout?.title || workout?.name || 'Ejercicios de la Sesión'}
              </Text>
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
            </View>
            
            <View style={styles.editModeExerciseList}>
              {editingExercises.map((exercise, exerciseIndex) => {
                const isDragging = draggedIndex === exerciseIndex;
                const showDropLineAbove = dropZoneIndex === exerciseIndex && dropZoneIndex !== draggedIndex;
                const showDropLineBelow = dropZoneIndex === exerciseIndex + 1 && dropZoneIndex !== draggedIndex && dropZoneIndex !== editingExercises.length;
                
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
              
              {dropZoneIndex === editingExercises.length && draggedIndex !== null && (
                <View style={styles.dropLine} />
              )}
            </View>
            
            <TouchableOpacity 
              style={[
                styles.endWorkoutButton,
                styles.endWorkoutButtonDisabled
              ]}
              disabled={true}
            >
              <Text style={[
                styles.endWorkoutButtonText,
                styles.endWorkoutButtonTextDisabled
              ]}>
                Terminar y guardar
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }

    // Normal mode: Use FlatList for virtualization
    return (
      <FlatList
        style={styles.exerciseListView}
        contentContainerStyle={styles.exerciseListContent}
        data={workout?.exercises || []}
        renderItem={renderExerciseItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={5}
        updateCellsBatchingPeriod={50}
        getItemLayout={(data, index) => {
          // Estimate item height - collapsed: ~80px, expanded: ~300px
          // Using average height for better performance
          const estimatedHeight = expandedExercises[index] ? 300 : 80;
          return {
            length: estimatedHeight,
            offset: estimatedHeight * index,
            index,
          };
        }}
      />
    );
  };

  const initializeWorkout = async () => {
    try {
      setLoading(true);

      const currentUser = user || auth.currentUser;

      // Run all initialization in parallel: previousData, 1RM estimates, session start, tutorials
      // Each promise catches independently so one failure doesn't break the others
      const [, estimates, , ] = await Promise.all([
        enrichPreviousData().catch(() => {}),
        currentUser?.uid
          ? oneRepMaxService.getEstimatesForUser(currentUser.uid).catch(() => ({}))
          : Promise.resolve({}),
        startWorkoutSession(currentUser).catch(err => {
          logger.error('Error starting workout session:', err);
        }),
        checkForTutorials().catch(() => {}),
      ]);
      setOneRepMaxEstimates(estimates || {});

      async function startWorkoutSession(resolvedUser) {
        let session = await sessionManager.getCurrentSession();

        // Discard stale session from a different course/workout
        if (session && session.courseId && session.courseId !== course.courseId) {
          session = null;
        }

        if (!session) {
          const currentUserForSession = resolvedUser || user || auth.currentUser;
          if (!currentUserForSession?.uid) return;
          const sessionIdValue = workout.sessionId || sessionId;

          session = await sessionManager.startSession(
            currentUserForSession.uid,
            course.courseId,
            sessionIdValue,
            workout.title || 'Workout Session'
          );
        }

        setSessionData(session);
      }

    } catch (error) {
      logger.error('Error initializing workout:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch previousData from exerciseHistory via a single batch call, then
  // attach to exercises via setWorkout so React re-renders with the data.
  const enrichPreviousData = async () => {
    if (!workout?.exercises?.length) return;

    // Build history keys: ${libraryId}_${primaryValue}. Post-migration primary[libId]
    // is a stable exerciseId; pre-migration it's the displayName. Either way the
    // history docs are keyed by the same value (rekeyed by the migration script).
    const keys = workout.exercises.map(ex => {
      const libraryId = ex.primary ? Object.keys(ex.primary)[0] : null;
      const primaryVal = libraryId ? ex.primary[libraryId] : ex.name;
      return libraryId && primaryVal ? `${libraryId}_${primaryVal}` : null;
    });

    const validKeys = keys.filter(Boolean);
    if (validKeys.length === 0) return;

    try {
      const apiClient = require('../utils/apiClient').default;
      const res = await apiClient.post('/workout/prs/batch-history', { keys: validKeys });
      const historyMap = res?.data ?? {};

      let changed = false;
      const updated = workout.exercises.map((exercise, i) => {
        const key = keys[i];
        if (!key) return exercise;

        const history = historyMap[key];
        const sessions = history?.sessions ?? history?.entries ?? [];
        if (sessions.length === 0) return exercise;

        // arrayUnion appends, so last element is the most recent session
        const latest = sessions[sessions.length - 1];
        const sets = latest?.sets ?? [];
        const bestSet = sets.reduce((best, s) => {
          const w = Number(s?.weight) || 0;
          return w > (Number(best?.weight) || 0) ? s : best;
        }, null);

        if (!bestSet) return exercise;

        changed = true;
        return {
          ...exercise,
          previousData: {
            bestSet,
            totalSets: sets.length,
            exerciseName: exercise.name,
            lastPerformed: latest.date ?? null,
          },
        };
      });

      if (changed) {
        setWorkout(prev => ({ ...prev, exercises: updated }));
      }
    } catch (error) {
      logger.error('Error fetching exercise history for previousData:', error);
    }
  };

  const getCurrentExercise = () => {
    const exs = workout?.exercises;
    if (!exs || exs.length === 0) return null;
    // Clamp: a restored index can momentarily exceed the loaded workout. Resolve
    // to the last valid exercise rather than returning undefined (blank screen).
    return exs[Math.min(currentExerciseIndex, exs.length - 1)];
  };

  const getCurrentSet = () => {
    const exercise = getCurrentExercise();
    if (!exercise?.sets || exercise.sets.length === 0) return null;
    return exercise.sets[Math.min(currentSetIndex, exercise.sets.length - 1)];
  };

  // Translate metric names to Spanish and capitalize first letter (optional exercise for custom objective labels)
  const translateMetric = (metric, exercise = null) => {
    if (!metric) return null;
    if (exercise?.customObjectiveLabels?.[metric]) return exercise.customObjectiveLabels[metric];
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
      'intensity': 'RPE'
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
      const previousData = workout.exercises[currentExerciseIndex]?.previousData;
      // Prefer bestSet (single summary of last performance); fallback to legacy per-set array if present
      const prevSetData = previousData?.bestSet || previousData?.sets?.[currentSetIndex];

      if (prevSetData && currentExercise.measures) {
        const parts = [];
        currentExercise.measures.forEach(m => {
          if (m === 'intensity') return;
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
    if (!course.weight_suggestions) return null;

    const exercise = workout?.exercises?.[currentExerciseIndex];
    if (!exercise || !exercise.sets || exercise.sets.length === 0) return null;
    const set = exercise.sets[currentSetIndex];

    // Duration-only holds (e.g. plank) have no weight suggestion.
    if (!set?.intensity) return null;
    const hasRepsOrSequence = (set.reps && set.reps !== '') || (Array.isArray(set.rep_sequence) && set.rep_sequence.length > 0);
    if (!hasRepsOrSequence) return null;

    const objectiveReps = oneRepMaxService.parseReps(set);
    const objectiveIntensity = oneRepMaxService.parseIntensity(set.intensity);
    if (!objectiveIntensity) return null;

    if (!exercise.primary || Object.keys(exercise.primary).length === 0) return null;
    const libraryId = Object.keys(exercise.primary)[0];
    const exerciseName = exercise.primary[libraryId];
    const exerciseKey = `${libraryId}_${exerciseName}`;

    const estimate = oneRepMaxEstimates?.[exerciseKey]?.current;
    if (!estimate) return null;

    return oneRepMaxService.calculateWeightSuggestion(
      estimate,
      objectiveReps,
      objectiveIntensity,
      exercise.muscle_activation
    );
  };

  // Simple validation - just check if it's a valid number
  const validateInput = (value) => {
    if (!value || value.trim() === '') return true; // Empty is valid
    const numValue = parseFloat(value);
    return !isNaN(numValue) && numValue >= 0; // Must be a positive number
  };

  const handleNextSet = useCallback(() => {
    const exercise = workout?.exercises?.[currentExerciseIndex];
    if (!exercise?.sets) return;

    if (currentSetIndex < exercise.sets.length - 1) {
      setCurrentSetIndex(currentSetIndex + 1);
    } else {
      // Move to next exercise
      if (currentExerciseIndex < workout.exercises.length - 1) {
        setCurrentExerciseIndex(currentExerciseIndex + 1);
        setCurrentSetIndex(0);
        saveCheckpointToLocalStorage();
      } else {
        // Workout completed - use ref to avoid temporal dead zone
        if (handleCompleteWorkoutRef.current) {
          handleCompleteWorkoutRef.current();
        }
      }
    }
  }, [workout, currentExerciseIndex, currentSetIndex, saveCheckpointToLocalStorage]);

  // Store handleNextSet in ref so it can be called before it's defined
  useEffect(() => {
    handleNextSetRef.current = handleNextSet;
  }, [handleNextSet]);

  const handlePreviousSet = useCallback(() => {
    if (currentSetIndex > 0) {
      setCurrentSetIndex(currentSetIndex - 1);
    } else if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex(currentExerciseIndex - 1);
      const prevExercise = workout.exercises[currentExerciseIndex - 1];
      setCurrentSetIndex(prevExercise.sets ? prevExercise.sets.length - 1 : 0);
    }
  }, [workout, currentExerciseIndex, currentSetIndex]);

  const handleCompleteWorkout = useCallback(async () => {
    // Legacy path: delegate to the unified end‑workout flow so that
    // session history, exercise history, last performance and 1RM updates
    // all go through the same pipeline as the explicit "Finalizar" button.
    try {
      if (executeEndWorkoutRef.current) {
        await executeEndWorkoutRef.current();
      } else {
      }
    } catch (error) {
      logger.error('❌ Error in handleCompleteWorkout (delegated):', error);
      wakeAlert('Error', 'Error al completar el entrenamiento. Inténtalo de nuevo.');
    }
  }, []);

  // Store handleCompleteWorkout in ref so it can be called before it's defined
  useEffect(() => {
    handleCompleteWorkoutRef.current = handleCompleteWorkout;
  }, [handleCompleteWorkout]);

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

  // Exercise video failed to load (distinct from the benign interrupted-play
  // AbortError). Surface it on PostHog — deduped per exercise so a retry loop
  // can't spam — so we can see how often coaches' videos fail for real users.
  const trackVideoLoadFailed = useCallback((stage) => {
    const ex = getCurrentExercise();
    const key = `${stage}:${ex?.id || ex?.exerciseId || videoUri || ''}`;
    if (videoFailTrackedRef.current.has(key)) return;
    videoFailTrackedRef.current.add(key);
    try {
      analyticsService.track('workout.video_load_failed', {
        stage,
        exercise_id: ex?.id || ex?.exerciseId || null,
        exercise_name: ex?.name || null,
        video_url: videoUri || null,
      });
    } catch { /* never throw from analytics */ }
  }, [videoUri]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inline retry for a failed exercise video — re-fetch the source without
  // remounting the screen (so entered sets are never lost to a video error).
  const handleVideoReload = useCallback(() => {
    setVideoLoadFailed(false);
    const el = mainVideoRef.current;
    if (!el) return;
    try {
      el.load();
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }, []);

  // Video tap handler
  const handleVideoTap = useCallback(() => {
    setIsVideoPaused(!isVideoPaused);
  }, [isVideoPaused]);

  // Video restart handler
  const handleVideoRestart = useCallback(() => {
    if (Platform.OS === 'web') {
      const el = mainVideoRef.current;
      if (!el) return;
      try {
        el.currentTime = 0;
        const p = el.play();
        if (p && typeof p.catch === 'function') {
          p.catch(error => {
            if (error?.name !== 'AbortError') {
              logger.error('❌ Error playing video on restart:', error.message);
            }
          });
        }
      } catch (_) {}
      setIsVideoPaused(false);
      return;
    }
    if (videoPlayer) {
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current) {
          videoPlayer.currentTime = 0;
          const playPromise = videoPlayer.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              if (error.name !== 'AbortError') {
                logger.error('❌ Error playing video on restart:', error.message);
              }
            });
          }
          startTransition(() => {
            setIsVideoPaused(false);
          });
        }
      }, 0);
      allTimeoutIdsRef.current.push(timeoutId);
    }
  }, [videoPlayer]);

  const renderSetInfo = () => {
    const set = getCurrentSet();
    if (!set) return null;

    return (
      <View style={styles.setInfoCard}>
        <Text style={styles.setTitle}>
          Serie {currentSetIndex + 1} de {workout.exercises[currentExerciseIndex].sets.length}
        </Text>
        
        {/* Duration (for holds like plank) */}
        {set.duration != null && set.duration !== '' && (
          <View style={styles.setDetailRow}>
            <Text style={styles.setDetailLabel}>Duración:</Text>
            <Text style={styles.setDetailValue}>{set.duration}s</Text>
          </View>
        )}

        {/* Reps — show the `reps` anchor only. rep_sequence encodes a
            multi-week microcycle (W1→W4) the subscriber can't navigate
            yet (no week-aware UI), so the array is intentionally hidden
            here. Coaches read it via the dashboard. */}
        {set.reps && (
          <View style={styles.setDetailRow}>
            <Text style={styles.setDetailLabel}>Repeticiones:</Text>
            <Text style={styles.setDetailValue}>{String(set.reps)}</Text>
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

  // TEST VERSION 2: Early returns re-enabled (simple conditionals, shouldn't block)
  // Early returns after all hooks
  if (loading) {
    return (
      <View style={styles.container}>
        <FixedWakeHeader />
        <View style={styles.simpleLoadingContainer}>
          <WakeLoader />
        </View>
      </View>
    );
  }

  if (!currentExercise || !currentSet) {
    return (
      <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
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

  // TEST VERSION: 13 - Enabling JSX rendering
  const TEST_VERSION = 14;
  const TEST_MODE_ENABLED = false; // Set to false to enable full render
  
  // TEST MODE: If enabled, only render test button
  if (TEST_MODE_ENABLED) {
  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
        {/* TEST VERSION 1: Test Button Only */}
      <TouchableOpacity 
          style={{
            position: 'absolute',
            bottom: 40,
            left: 0,
            right: 0,
            alignSelf: 'center',
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 40,
            paddingVertical: 15,
            borderRadius: 25,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        onPress={() => {
            wakeAlert('Test Version', `Version ${TEST_VERSION}`);
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
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      {(() => {
        const headerStartTime = performance.now();
        return null;
      })()}
      {/* Progress bar — exercise position in session */}
      {isWeb && workout?.exercises?.length > 0 && (
        <div className="workout-progress-track">
          <div
            className="workout-progress-fill"
            style={{ width: `${((currentExerciseIndex + 1) / workout.exercises.length) * 100}%` }}
          />
        </div>
      )}

      {/* Fixed Header without Back Button */}
      <FixedWakeHeader
        showMenuButton={true}
        onMenuPress={() => {
          setIsMenuVisible(true);
        }}
        sessionElapsedSeconds={totalElapsedSeconds}
      />

      {/* Post-save ring+check overlay (web only) */}
      {isWeb && showPostSave && React.createElement('div', { className: 'wake-set-overlay' },
        React.createElement('svg', { width: 70, height: 70, viewBox: '0 0 60 60' },
          React.createElement('circle', { className: 'wake-ring', cx: 30, cy: 30, r: 20 }),
          React.createElement('path', { className: 'wake-check', d: 'M 22 30 L 28 36 L 39 22' })
        )
      )}

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
                handleEndWorkout();
              }}
            >
              <View style={styles.menuOptionContent}>
                <SvgFileUpload width={20} height={20} color="#ffffff" />
                <Text style={styles.menuOptionText}>Guardar y Subir Entrenamiento</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuOption}
              onPress={() => {
                setIsMenuVisible(false);
                handleExitKeepProgress();
              }}
            >
              <View style={styles.menuOptionContent}>
                <SvgFileUpload width={20} height={20} color="#ffffff" style={{ opacity: 0.7, transform: [{ rotate: '180deg' }] }} />
                <Text style={styles.menuOptionText}>Salir y continuar después</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuOptionLast}
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
                const currentExerciseForLabel = workout?.exercises?.[currentExerciseIndex];
                const fieldLabel = getFieldDisplayName(field, currentExerciseForLabel);
                return (
                <View key={`input-field-${currentExerciseIndex}-${currentSetIndex}-${field}`} style={styles.setInputField}>
                  <Text style={styles.setInputFieldLabel}>
                    {fieldLabel}
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
                    placeholder={`Ingresa ${fieldLabel.toLowerCase()}`}
                    placeholderTextColor="rgba(255, 255, 255, 0.5)"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    blurOnSubmit={true}
                  />
                </View>
                );
                })}
                <View style={styles.setInputModalNotesCard}>
                  <Text style={styles.setInputModalNotesTitle}>Notas de la sesión</Text>
                  <TextInput
                    style={styles.setInputModalNotesInput}
                    value={sessionNotes}
                    onChangeText={setSessionNotes}
                    placeholder="Añade notas para esta sesión (opcional)"
                    placeholderTextColor="rgba(255, 255, 255, 0.4)"
                    multiline
                    numberOfLines={3}
                  />
                </View>
                {canSendVideoToCoach && (
                  <TouchableOpacity
                    style={styles.setInputVideoButton}
                    onPress={() => {
                      const ex = workout?.exercises?.[currentExerciseIndex];
                      if (!ex) return;
                      handleCancelSetInput();
                      handleRequestSendVideo(ex);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.setInputVideoIconWrap}>
                      <SvgCamera width={16} height={16} stroke="rgba(255,255,255,0.9)" strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.setInputVideoTitle}>Enviar video al coach</Text>
                      <Text style={styles.setInputVideoSubtitle}>
                        {workout?.exercises?.[currentExerciseIndex]?.name || 'Ejercicio'}
                      </Text>
                    </View>
                    <Text style={styles.setInputVideoChevron}>›</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
              
              <View style={styles.setInputModalFooter}>
                {(() => {
                  const isSaveDisabled = !Object.values(currentSetInputData).some(val => val && val.trim() !== '' && !isNaN(parseFloat(val)));
                  return (
                    <TouchableOpacity
                      style={[
                        styles.saveSetButton,
                        accentColor && !isSaveDisabled && { backgroundColor: accentColor },
                        isSaveDisabled && styles.saveSetButtonDisabled
                      ]}
                      onPress={handleSaveSetData}
                      disabled={isSaveDisabled}
                    >
                      <Text style={[
                        styles.saveSetButtonText,
                        accentColor && !isSaveDisabled && { color: accentTextColor },
                        isSaveDisabled && styles.saveSetButtonTextDisabled
                      ]}>
                        Registrar: serie {currentSetIndex + 1} de {getCurrentExercise()?.sets?.length || 0}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            </KeyboardAvoidingView>
              </Animated.View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>
      
      {/* Timer Modal */}
      <Modal
        animationType="none"
        transparent={true}
        visible={isTimerModalVisible}
        onRequestClose={handleCloseTimerModal}
      >
        <TouchableWithoutFeedback onPress={handleCloseTimerModal} accessible={false}>
          <Animated.View style={[styles.timerModalOverlay, { opacity: timerModalOpacity }]}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} accessible={false}>
              <Animated.View style={[styles.timerModal, { transform: [{ translateY: timerModalTranslateY }] }]}>
                <View style={styles.timerModalHeader}>
                  {showTimerEndedObjectivesModal ? (
                    <>
                      <View style={styles.timerModalHeaderEnded}>
                        <Text style={styles.timerModalTitle} numberOfLines={2}>
                          {workout?.exercises?.[currentExerciseIndex]?.name || 'Ejercicio'}
                        </Text>
                        <Text style={styles.timerModalSerieLabel}>
                          Serie {currentSetIndex + 1} de {workout?.exercises?.[currentExerciseIndex]?.sets?.length || 0}
                        </Text>
                      </View>
                      <TouchableOpacity style={styles.timerModalCloseButton} onPress={handleCloseTimerModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Text style={styles.timerModalCloseButtonText}>✕</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={styles.timerModalTitle}>Descanso</Text>
                      <View style={styles.timerModalHeaderRight}>
                        <Text style={styles.timerTotalLabel}>Total</Text>
                        <Text style={styles.timerTotalValue}>
                          {String(Math.floor(totalElapsedSeconds / 60)).padStart(2, '0')}:{String(totalElapsedSeconds % 60).padStart(2, '0')}
                        </Text>
                        <TouchableOpacity style={styles.timerModalCloseButton} onPress={handleCloseTimerModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                          <Text style={styles.timerModalCloseButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
                <View style={styles.timerModalContent}>
                  {showTimerEndedObjectivesModal ? (
                    <>
                      <ScrollView style={styles.timerEndedObjectivesListScroll} showsVerticalScrollIndicator={false}>
                        <View style={styles.timerObjectiveGrid}>
                          {(() => {
                            const currentExercise = workout?.exercises?.[currentExerciseIndex];
                            const objectives = currentExercise?.objectives || [];
                            const sortedObjectives = [...objectives].sort((a, b) => {
                              const order = ['reps', 'previous'];
                              const aIndex = order.indexOf(a.toLowerCase());
                              const bIndex = order.indexOf(b.toLowerCase());
                              if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                              if (aIndex !== -1) return -1;
                              if (bIndex !== -1) return 1;
                              return 0;
                            });
                            const suggestion = getWeightSuggestion();
                            const hasWeightSuggestion = suggestion !== null;
                            const items = [];
                            if (hasWeightSuggestion) {
                              items.push({ label: 'Peso Sugerido', value: `${suggestion}kg` });
                            }
                            sortedObjectives.forEach((objective) => {
                              if (objective === 'notes') {
                                const setNote = currentExercise?.sets?.[currentSetIndex]?.notes;
                                const exerciseNote = currentExercise?.notes;
                                const noteText = (typeof setNote === 'string' && setNote.trim()) || (typeof exerciseNote === 'string' && exerciseNote.trim()) || '';
                                if (!noteText) return;
                                items.push({ label: 'NOTA', value: noteText, onPress: () => {
                                  setSelectedObjectiveInfo({ title: 'Nota del coach', description: noteText });
                                  setIsObjectiveInfoModalVisible(true);
                                } });
                                return;
                              }
                              const baseLabel = translateMetric(objective, currentExercise) || 'Objetivo';
                              items.push({
                                label: baseLabel.toUpperCase(),
                                value: getMetricValueForCard(objective),
                              });
                            });
                            const isOddCount = items.length % 2 === 1;
                            return items.map((item, index) => {
                              const isLastAndOdd = isOddCount && index === items.length - 1;
                              const Cell = item.onPress ? TouchableOpacity : View;
                              return (
                                <Cell
                                  key={`obj-card-${index}`}
                                  style={[styles.timerObjectiveCard, isLastAndOdd && styles.timerObjectiveCardFullWidth]}
                                  {...(item.onPress ? { onPress: item.onPress, activeOpacity: 0.7 } : {})}
                                >
                                  <Text style={styles.timerObjectiveCardLabel} numberOfLines={1}>{item.label}</Text>
                                  <Text style={styles.timerObjectiveCardValue} numberOfLines={item.onPress ? 2 : 1} adjustsFontSizeToFit minimumFontScale={item.onPress ? 0.6 : 0.75}>{item.value}</Text>
                                </Cell>
                              );
                            });
                          })()}
                        </View>
                      </ScrollView>
                      <TouchableOpacity
                        style={[styles.timerPrimaryBtn, styles.timerPrimaryBtnResume]}
                        onPress={handleCloseTimerModal}
                      >
                        <Text style={[styles.timerPrimaryBtnText, styles.timerPrimaryBtnTextResume]}>Continuar</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                  <View style={styles.timerRestHero} {...(timerEndedPulse && Platform.OS === 'web' ? { className: 'wake-timer-ended' } : {})}>
                    <View style={styles.timerRestHeroHollowWrap}>
                        {(() => {
                          const isActive = restSecondsRemaining > 0 || selectedRestSeconds > 0;
                          const timeStr = restSecondsRemaining > 0
                            ? `${Math.floor(restSecondsRemaining / 60)}:${String(restSecondsRemaining % 60).padStart(2, '0')}`
                            : selectedRestSeconds > 0
                              ? `${Math.floor(selectedRestSeconds / 60)}:${String(selectedRestSeconds % 60).padStart(2, '0')}`
                              : '0:00';
                          const timerFontSize = Math.min(screenWidth * 0.5, 120);
                          const svgW = 320;
                          const svgH = 240;
                          const centerX = svgW / 2;
                          const centerY = svgH / 2;
                          const baselineY = centerY + timerFontSize * 0.2;
                          const scaleTransform = `translate(${centerX}, ${centerY}) scale(1, 1.5) translate(${-centerX}, ${-centerY})`;
                          const outlineStroke = isActive ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.7)';
                          const glowStroke = isActive ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.95)';
                          return (
                            <Svg
                              width="100%"
                              height={svgH}
                              viewBox={`0 0 ${svgW} ${svgH}`}
                              preserveAspectRatio="xMidYMid meet"
                              style={styles.timerRestHeroSvg}
                            >
                              <Defs>
                                <Filter id="timerGlow" x="-50%" y="-50%" width="200%" height="200%">
                                  <FeGaussianBlur in="SourceGraphic" stdDeviation={28} />
                                </Filter>
                              </Defs>
                              <G transform={scaleTransform}>
                                <SvgText
                                  x={centerX}
                                  y={baselineY}
                                  textAnchor="middle"
                                  fill="transparent"
                                  stroke={glowStroke}
                                  strokeWidth={3.5}
                                  fontSize={timerFontSize}
                                  fontWeight={isActive ? '800' : '700'}
                                  fontFamily="System"
                                  filter="url(#timerGlow)"
                                >
                                  {timeStr}
                                </SvgText>
                                <SvgText
                                  x={centerX}
                                  y={baselineY}
                                  textAnchor="middle"
                                  fill="transparent"
                                  stroke={outlineStroke}
                                  strokeWidth={1.2}
                                  fontSize={timerFontSize}
                                  fontWeight={isActive ? '800' : '700'}
                                  fontFamily="System"
                                >
                                  {timeStr}
                                </SvgText>
                              </G>
                            </Svg>
                          );
                        })()}
                    </View>
                  </View>
                  {restSecondsRemaining === 0 && (
                    <>
                      <View style={styles.timerDurationRow}>
                        <View style={styles.timerCustomColumn}>
                          <View style={styles.timerCustomCard}>
                            <View style={styles.timerPickerRow}>
                          <View style={styles.timerPickerColumn}>
                            <ScrollView
                              ref={minutesScrollRef}
                              style={styles.timerPickerScroll}
                              contentContainerStyle={styles.timerPickerContent}
                              showsVerticalScrollIndicator={false}
                              snapToInterval={TIMER_PICKER_ITEM_HEIGHT}
                              snapToAlignment="center"
                              decelerationRate="fast"
                              onMomentumScrollEnd={handleMinutesScroll}
                            >
                              {Array.from({ length: 16 }, (_, i) => (
                                <TouchableOpacity
                                  key={`min-${i}`}
                                  style={styles.timerPickerItem}
                                  onPress={() => {
                                    setCustomRestMinutes(i);
                                    updateSelectedFromCustom(i, customRestSeconds);
                                    minutesScrollRef.current?.scrollTo({ y: i * TIMER_PICKER_ITEM_HEIGHT, animated: true });
                                  }}
                                >
                                  <Text style={[styles.timerPickerItemText, customRestMinutes === i && styles.timerPickerItemTextSelected]}>{i}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                            <Text style={styles.timerPickerUnit}>min</Text>
                          </View>
                          <View style={styles.timerPickerColumn}>
                            <ScrollView
                              ref={secondsScrollRef}
                              style={styles.timerPickerScroll}
                              contentContainerStyle={styles.timerPickerContent}
                              showsVerticalScrollIndicator={false}
                              snapToInterval={TIMER_PICKER_ITEM_HEIGHT}
                              snapToAlignment="center"
                              decelerationRate="fast"
                              onMomentumScrollEnd={handleSecondsScroll}
                            >
                              {Array.from({ length: 60 }, (_, i) => (
                                <TouchableOpacity
                                  key={`sec-${i}`}
                                  style={styles.timerPickerItem}
                                  onPress={() => {
                                    setCustomRestSeconds(i);
                                    updateSelectedFromCustom(customRestMinutes, i);
                                    secondsScrollRef.current?.scrollTo({ y: i * TIMER_PICKER_ITEM_HEIGHT, animated: true });
                                  }}
                                >
                                  <Text style={[styles.timerPickerItemText, customRestSeconds === i && styles.timerPickerItemTextSelected]}>{String(i).padStart(2, '0')}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                            <Text style={styles.timerPickerUnit}>seg</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    </View>
                    </>
                  )}
                  {restSecondsRemaining > 0 && !isRestPaused ? (
                    <TouchableOpacity
                      style={[styles.timerPrimaryBtn, styles.timerPrimaryBtnStop]}
                      onPress={pauseRestCountdown}
                    >
                      <Text style={[styles.timerPrimaryBtnText, styles.timerPrimaryBtnTextStop]}>Pausa</Text>
                    </TouchableOpacity>
                  ) : restSecondsRemaining > 0 && isRestPaused ? (
                    <View style={styles.timerPausedButtonsRow}>
                      <TouchableOpacity
                        style={[styles.timerPrimaryBtn, styles.timerPrimaryBtnResume]}
                        onPress={resumeRestCountdown}
                      >
                        <Text style={[styles.timerPrimaryBtnText, styles.timerPrimaryBtnTextResume]}>Continuar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.timerPrimaryBtn, styles.timerPrimaryBtnDiscard]}
                        onPress={discardRestCountdown}
                      >
                        <Text style={[styles.timerPrimaryBtnText, styles.timerPrimaryBtnTextDiscard]}>Descartar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.timerPrimaryBtn,
                        selectedRestSeconds === 0 && styles.timerPrimaryBtnDisabled,
                      ]}
                      onPress={startRestCountdown}
                      disabled={selectedRestSeconds === 0}
                    >
                      <Text
                        style={[
                          styles.timerPrimaryBtnText,
                          selectedRestSeconds === 0 && styles.timerPrimaryBtnTextDisabled,
                        ]}
                      >
                        Iniciar descanso
                      </Text>
                    </TouchableOpacity>
                  )}
                    </>
                  )}
                </View>
              </Animated.View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>
      
      {/* Detail content (no longer a horizontal pager — list lives in a bottom sheet) */}
      <KeyboardAvoidingView style={{flex: 1}} behavior="padding" keyboardVerticalOffset={0}>
        <View style={styles.scrollContainer}>
            {/* Exercise Detail View */}
        <View style={styles.viewContainer}>
              {(() => {
                const innerScrollStartTime = performance.now();
                return null;
              })()}
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContentContainer}
                showsVerticalScrollIndicator={false}
              >
                <WakeHeaderContent style={styles.content}>
                  {/* Single in-flow spacer derived from the live lid position so the
                      gap below the lid stays consistent across devices/safe-area timing. */}
                  <View style={{ height: sheetTopOffset + CLOSED_LID_HEIGHT + 4 }} />

              {/* Swipeable Top Cards */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                onScroll={onTopCardScroll}
                scrollEventThrottle={16}
                style={styles.topCardsContainer}
                contentContainerStyle={styles.topCardsContent}
                snapToInterval={screenWidth - Math.max(48, screenWidth * 0.12) + 15}
                snapToAlignment="start"
                decelerationRate="fast"
              >
                {/* First Card - Video */}
                {(() => {
                  const videoCardStartTime = performance.now();
                  return null;
                })()}
                <View
                  style={[styles.videoCard, videoUri && styles.videoCardNoBorder]}
                >
                  {videoUri && (videoSourceType === 'youtube' || videoSourceType === 'vimeo') && Platform.OS === 'web' ? (
                  <VideoCardWebWrapper>
                    <View style={styles.videoContainer}>
                      <iframe
                        src={getEmbedUrl(videoUri, videoSourceType)}
                        style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
                        allow="autoplay; encrypted-media"
                        allowFullScreen
                        title="Exercise video"
                      />
                    </View>
                  </VideoCardWebWrapper>
                  ) : videoUri ? (
                  <VideoCardWebWrapper>
                  <TouchableOpacity
                      style={styles.videoContainer}
                      onPress={handleVideoTap}
                      activeOpacity={1}
                    >
                      {Platform.OS === 'web' ? (
                        <video
                          ref={mainVideoRef}
                          src={videoUri}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12, backgroundColor: '#000' }}
                          autoPlay
                          loop
                          muted={isMuted}
                          playsInline
                          preload="auto"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            logger.error('[VIDEO] [ERROR] <video> error:', e?.nativeEvent || e);
                            trackVideoLoadFailed('execution');
                            setVideoLoadFailed(true);
                          }}
                          onLoadedData={() => setVideoLoadFailed(false)}
                        />
                      ) : (
                      <VideoView
                        player={videoPlayer}
                        style={styles.video}
                        contentFit="cover"
                        fullscreenOptions={{ allowed: false }}
                        allowsPictureInPicture={false}
                        nativeControls={false}
                        showsTimecodes={false}
                        playsInline
                      />
                      )}
                      {videoLoadFailed && (
                        <VideoOverlayWebWrapper>
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600', marginBottom: 12, textAlign: 'center' }}>No pudimos cargar el video</Text>
                            <TouchableOpacity onPress={handleVideoReload} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.85)' }}>
                              <Text style={{ color: '#1a1a1a', fontSize: 13, fontWeight: '700' }}>Reintentar</Text>
                            </TouchableOpacity>
                          </View>
                        </VideoOverlayWebWrapper>
                      )}
                      {isVideoPaused && (
                        <VideoOverlayWebWrapper pointerEvents="none">
                          <View style={styles.videoDimmingLayer} pointerEvents="none" />
                        </VideoOverlayWebWrapper>
                      )}
                      {isVideoPaused && (
                        <VideoOverlayWebWrapper>
                          <View style={styles.pauseOverlay}>
                            <SvgPlay width={48} height={48} />
                          </View>
                        </VideoOverlayWebWrapper>
                      )}

                      {/* Volume icon overlay - only show when paused */}
                      {isVideoPaused && (
                        <VideoOverlayWebWrapper>
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
                        </VideoOverlayWebWrapper>
                      )}

                      {/* Restart icon overlay - only show when paused */}
                      {isVideoPaused && (
                        <VideoOverlayWebWrapper>
                        <View style={styles.restartIconContainer}>
                    <TouchableOpacity
                            style={styles.restartIconButton}
                            onPress={handleVideoRestart}
                            activeOpacity={0.7}
                          >
                            <SvgArrowReload width={24} height={24} color="white" />
                    </TouchableOpacity>
                        </View>
                        </VideoOverlayWebWrapper>
                      )}
                    </TouchableOpacity>
                  </VideoCardWebWrapper>
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
                    return null;
                  })()}
                  <View style={styles.muscleSilhouetteWrapper}>
                    <View style={styles.muscleSilhouetteContainerCard}>
                      {muscleVolumesForCurrentExercise && Object.keys(muscleVolumesForCurrentExercise).length > 0 ? (
                        <MuscleSilhouetteSVG
                          muscleVolumes={muscleVolumesForCurrentExercise}
                          useWorkoutExecutionColors={true}
                          accentRgb={accent ? [accent.accentR, accent.accentG, accent.accentB] : null}
                          height={
                            currentExercise?.implements && currentExercise.implements.length > 0
                              ? Math.max(260, screenHeight * 0.32)
                              : Math.max(320, screenHeight * 0.40)
                          }
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

                  {/* Implements section: only show when exercise has implements */}
                  {currentExercise?.implements && currentExercise.implements.length > 0 ? (
                    <>
                      <View style={{ 
                        width: '100%', 
                        height: Math.max(20, screenHeight * 0.04), 
                        flexShrink: 0,
                        flexGrow: 0,
                      }} />
                      <View style={styles.implementsSection}>
                        <Text style={[styles.instructionsTitle, styles.implementsSubtitle]}>
                          Implementos
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.implementsRow}
                        >
                          {currentExercise.implements.map((impl, index) => (
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
                          ))}
                        </ScrollView>
                      </View>
                    </>
                  ) : null}
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
                  
                  let _cardIdx = 0;
                  return (
                    <>
                      {/* Weight Suggestion Card FIRST (if available) */}
                      {hasWeightSuggestion && (() => {
                        const hasInfo = objectivesInfoService.hasInfo('weight_suggestion');
                        const _idx = _cardIdx++;
                        return (
                          <TouchableOpacity
                            key="weight-suggestion"
                            style={styles.horizontalCard}
                            onPress={() => handleObjectiveCardPress('weight_suggestion')}
                            disabled={!hasInfo}
                            activeOpacity={hasInfo ? 0.7 : 1}
                            {...(isWeb && showPostSave ? { className: `wake-obj-cascade wake-obj-i${_idx}` } : {})}
                          >
                            <Text style={styles.metricTitle}>PESO SUGERIDO</Text>
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
                        const currentExercise = workout?.exercises?.[currentExerciseIndex];
                        // Notes objective: render only when content exists; tap opens modal with the note text
                        if (objective === 'notes') {
                          const setNote = currentExercise?.sets?.[currentSetIndex]?.notes;
                          const exerciseNote = currentExercise?.notes;
                          const noteText = (typeof setNote === 'string' && setNote.trim()) || (typeof exerciseNote === 'string' && exerciseNote.trim()) || '';
                          if (!noteText) return null;
                          const _idx = _cardIdx++;
                          return (
                            <TouchableOpacity
                              key={`objective-${currentExerciseIndex}-${index}-notes`}
                              style={styles.horizontalCard}
                              onPress={() => {
                                setSelectedObjectiveInfo({ title: 'Nota del coach', description: noteText });
                                setIsObjectiveInfoModalVisible(true);
                              }}
                              activeOpacity={0.7}
                              {...(isWeb && showPostSave ? { className: `wake-obj-cascade wake-obj-i${_idx}` } : {})}
                            >
                              <Text style={styles.metricTitle}>NOTA</Text>
                              <Text style={styles.metricValue} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
                                {noteText}
                              </Text>
                              <View style={styles.infoIconContainer}>
                                <SvgInfo width={14} height={14} color="rgba(255, 255, 255, 0.6)" />
                              </View>
                            </TouchableOpacity>
                          );
                        }
                        const hasInfo = objectivesInfoService.hasInfo(objective);
                        const _idx = _cardIdx++;
                        return (
                          <TouchableOpacity
                            key={`objective-${currentExerciseIndex}-${index}-${objective}`}
                            style={styles.horizontalCard}
                            onPress={() => handleObjectiveCardPress(objective)}
                            disabled={!hasInfo}
                            activeOpacity={hasInfo ? 0.7 : 1}
                            {...(isWeb && showPostSave ? { className: `wake-obj-cascade wake-obj-i${_idx}` } : {})}
                          >
                            <Text style={styles.metricTitle}>
                              {(translateMetric(objective, currentExercise) || 'Objetivo').toUpperCase()}
                            </Text>
                            <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                              {getMetricValueForCard(objective)}
                            </Text>
                            {objective === 'previous' && (() => {
                              const prevData = currentExercise?.previousData;
                              const prevSet = prevData?.bestSet || prevData?.sets?.[currentSetIndex];
                              const rpe = prevSet?.intensity ? parseFloat(prevSet.intensity) : null;
                              if (!rpe || rpe < 1 || rpe > 10) return null;
                              return (
                                <Text style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                                  RPE: {rpe}
                                </Text>
                              );
                            })()}

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
                        {...(isWeb && showPostSave ? { className: `wake-obj-cascade wake-obj-i${_cardIdx}` } : {})}
                      >
                        <Text style={styles.metricTitle}>PROGRESO</Text>
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
                        accentColor && !isEditMode && { backgroundColor: accentColor },
                        isEditMode && styles.inputSetButtonDisabled
                      ]}
                      onPress={handleOpenSetInput}
                      disabled={isEditMode}
                      {...(isWeb && showPostSave ? { className: 'wake-btn-sweep' } : {})}
          >
                      <Text style={[
                        styles.inputSetButtonText,
                        accentColor && !isEditMode && { color: accentTextColor },
                        isEditMode && styles.inputSetButtonTextDisabled
                      ]}>
                        Registrar: serie {currentSetIndex + 1} de {workout?.exercises?.[currentExerciseIndex]?.sets?.length || 0}
                      </Text>
                    </TouchableOpacity>

                    {/* Timer Button - opens timer modal */}
                    <TouchableOpacity
                      style={[
                        styles.timerButton,
                        accentColor && { backgroundColor: accentColor },
                      ]}
                      onPress={handleOpenTimerModal}
                      accessibilityLabel="Abrir cronómetro de descanso"
                    >
                      <SvgTimer width={24} height={24} color={accentColor ? accentTextColor : '#1a1a1a'} />
                    </TouchableOpacity>
                  </View>
                </WakeHeaderContent>
                  <BottomSpacer />
              </ScrollView>
        </View>
        </View>
      </KeyboardAvoidingView>

      {/* Bottom-sheet drawer: exercise list. Closed = handle bar visible; open = full-height sheet. */}
      <Animated.View
        pointerEvents={isSheetOpen ? 'auto' : 'none'}
        style={[styles.bottomSheetBackdrop, { opacity: sheetBackdropOpacity }]}
      >
        <Pressable style={{ flex: 1 }} onPress={closeSheet} />
      </Animated.View>
      <Animated.View
        style={[
          styles.bottomSheet,
          {
            top: sheetTopOffset,
            height: sheetHeightAnim,
            left: sheetMarginAnim,
            right: sheetMarginAnim,
            transform: [{ translateY: lidPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }) }],
          },
        ]}
      >
        {isSheetOpen ? (
          <>
            <View style={styles.bottomSheetContent}>
              {renderExerciseListView()}
            </View>
            <View
              style={styles.bottomSheetFooter}
              {...sheetPanResponder.panHandlers}
            >
              <Pressable
                onPress={closeSheet}
                style={styles.bottomSheetFooterPressable}
                accessibilityRole="button"
                accessibilityLabel="Cerrar lista de ejercicios"
              >
                <View style={styles.bottomSheetFooterGrabber} />
              </Pressable>
            </View>
          </>
        ) : (
          <View
            style={styles.bottomSheetHandleArea}
            {...sheetPanResponder.panHandlers}
          >
            <Pressable
              onPress={openSheet}
              style={styles.bottomSheetHandlePressable}
              accessibilityRole="button"
              accessibilityLabel="Abrir lista de ejercicios"
            >
              <Text
                style={styles.bottomSheetTitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {workout?.exercises?.[currentExerciseIndex]?.name || 'Ejercicio'}
              </Text>
              <View style={styles.bottomSheetGrabber} />
            </Pressable>
          </View>
        )}
      </Animated.View>

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
                      {swapModalVideoUri && (detectVideoSource(swapModalVideoUri) === 'youtube' || detectVideoSource(swapModalVideoUri) === 'vimeo') && Platform.OS === 'web' ? (
                        <View style={styles.swapModalVideoContainer}>
                          <iframe
                            src={getEmbedUrl(swapModalVideoUri)}
                            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
                            allow="autoplay; encrypted-media"
                            allowFullScreen
                            title="Exercise video"
                          />
                        </View>
                      ) : swapModalVideoUri ? (
                        <TouchableOpacity
                          style={styles.swapModalVideoContainer}
                          onPress={handleSwapModalVideoTap}
                          activeOpacity={1}
                        >
                          <VideoView
                            player={swapModalVideoPlayer}
                            style={styles.swapModalVideo}
                            contentFit="cover"
                            fullscreenOptions={{ allowed: false }}
                            allowsPictureInPicture={false}
                            nativeControls={false}
                            showsTimecodes={false}
                            playsInline
                          />
                          {isSwapModalVideoPaused && (
                            <View style={styles.swapModalDimmingLayer} pointerEvents="none" />
                          )}
                          {isSwapModalVideoPaused && (
                            <View style={styles.swapModalPauseOverlay}>
                              <SvgPlay width={48} height={48} />
                            </View>
                          )}
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
                  <WakeLoader size={80} />
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
                              style={styles.swapModalVideo}
                              contentFit="cover"
                              fullscreenOptions={{ allowed: false }}
                              allowsPictureInPicture={false}
                              nativeControls={false}
                              showsTimecodes={false}
                              playsInline
                            />
                            {isSwapModalVideoPaused && (
                              <View style={styles.swapModalDimmingLayer} pointerEvents="none" />
                            )}
                            {isSwapModalVideoPaused && (
                              <View style={styles.swapModalPauseOverlay}>
                                <SvgPlay width={48} height={48} />
                              </View>
                            )}
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
                            <Animated.View style={{ transform: [{ rotate: getOrCreateIntensityAnim(intensity).interpolate({ inputRange: [0, 1], outputRange: ['180deg', '270deg'] }) }] }}>
                              <SvgChevronLeft width={20} height={20} stroke="#ffffff" />
                            </Animated.View>
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
                              position: 'relative',
                            }}>
                              <VideoView
                                player={intensityVideoPlayer}
                                style={{ width: '100%', height: '100%' }}
                                contentFit="cover"
                                fullscreenOptions={{ allowed: false }}
                                allowsPictureInPicture={false}
                                nativeControls={false}
                                showsTimecodes={false}
                                playsInline
                              />
                              {isIntensityVideoPaused && (
                                <View
                                  style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                    zIndex: 1,
                                  }}
                                  pointerEvents="none"
                                />
                              )}
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
                                    zIndex: 2,
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
      
      {/* Confirmation Modal for Web (wakeAlert doesn't work well on web) */}
      {confirmModalVisible && confirmModalConfig && (
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
      )}

      {/* Notas y videos — unified session sheet */}
      <Modal
        visible={isNotesModalVisible}
        transparent={true}
        animationType="none"
        onRequestClose={handleCloseNotesModal}
      >
        <TouchableWithoutFeedback onPress={handleCloseNotesModal} accessible={false}>
          <Animated.View style={[styles.notesBottomSheetOverlay, { opacity: notesModalOpacity }]}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} accessible={false}>
              <Animated.View style={[styles.notesBottomSheet, { transform: [{ translateY: notesModalTranslateY }] }]}>
                <View style={styles.notesBottomSheetHeader}>
                  <Text style={styles.notesBottomSheetTitle}>
                    {canSendVideoToCoach ? 'Notas y videos' : 'Notas de la sesión'}
                  </Text>
                  <TouchableOpacity style={styles.notesBottomSheetClose} onPress={handleCloseNotesModal}>
                    <Text style={styles.notesBottomSheetCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.nvSheetScroll}
                  contentContainerStyle={styles.nvSheetScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Notes section */}
                  <Text style={styles.nvSectionLabel}>Notas de la sesión</Text>
                  <TextInput
                    style={styles.nvNotesInput}
                    value={sessionNotes}
                    onChangeText={setSessionNotes}
                    placeholder="Ej: Buen ritmo, último set pesado…"
                    placeholderTextColor="rgba(255, 255, 255, 0.35)"
                    multiline
                    numberOfLines={4}
                  />

                  {/* Video section — one-on-one + web only */}
                  {canSendVideoToCoach && (
                    <>
                      <View style={styles.nvSectionDivider} />

                      <Text style={styles.nvSectionLabel}>Videos al coach</Text>

                      <TouchableOpacity
                        style={styles.nvSendVideoButton}
                        onPress={() => {
                          handleCloseNotesModal();
                          setVideoSubmitTarget({ exerciseKey: null, exerciseName: null });
                        }}
                        activeOpacity={0.85}
                      >
                        <View style={styles.nvSendVideoIcon}>
                          <SvgCamera width={16} height={16} stroke="rgba(255,255,255,0.95)" strokeWidth={1.8} />
                        </View>
                        <Text style={styles.nvSendVideoLabel}>Enviar video al coach</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={styles.notesBottomSheetButton}
                  onPress={handleCloseNotesModal}
                  activeOpacity={0.8}
                >
                  <Text style={styles.notesBottomSheetButtonText}>Listo</Text>
                </TouchableOpacity>
              </Animated.View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Loading Overlay for Workout Completion */}
      <Modal
        visible={isSavingWorkout}
        transparent={true}
        animationType="fade"
      >
        <View style={loadingOverlayStyles.overlay}>
          <View style={loadingOverlayStyles.loadingContent}>
            <WakeLoader size={80} />
            <Text style={loadingOverlayStyles.loadingText}>Guardando entrenamiento</Text>
          </View>
        </View>
      </Modal>

      {/* Exercise Detail Modal - Use startTransition for non-urgent rendering */}
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
        <View style={[
          styles.addExerciseModalContainer,
          isWeb && { minHeight: '100vh', height: '100%', display: 'flex', flexDirection: 'column' }
        ]}>
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
              <WakeLoader size={80} />
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
                  videoPlayer={addExerciseModalVideoPlayer}
                  styles={styles}
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
      {isWeb && VideoExchangeOverlay && canSendVideoToCoach && (
        <VideoExchangeOverlay
          open={!!videoSubmitTarget}
          mode="submit"
          userId={user?.uid}
          creatorId={courseCreatorId}
          exerciseKey={videoSubmitTarget?.exerciseKey}
          exerciseName={videoSubmitTarget?.exerciseName}
          exercises={workout?.exercises || []}
          onClose={() => setVideoSubmitTarget(null)}
        />
      )}
      {/* TEST VERSION 1: End of original return statement - All code above is disabled when TEST_MODE_ENABLED is true */}
    </SafeAreaView>
  );
};

export default WorkoutExecutionScreen;
