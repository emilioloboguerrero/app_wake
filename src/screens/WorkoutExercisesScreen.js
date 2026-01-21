import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import sessionManager from '../services/sessionManager';
import sessionService from '../services/sessionService';
import workoutProgressService from '../data-management/workoutProgressService';
import exerciseLibraryService from '../services/exerciseLibraryService';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import { Image as ExpoImage } from 'expo-image';

import logger from '../utils/logger.js';

// Field name translation function (copied from WorkoutExecutionScreen)
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
    'intensity': 'Intensidad',
    'previous': 'Anterior'
  };
  return fieldNames[field] || field.charAt(0).toUpperCase() + field.slice(1);
};

// Calculate even gaps between columns (copied from WorkoutExecutionScreen)
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
  
  return { evenGap };
};

const WorkoutExercisesScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { course, sessionData, workoutData, sessionState } = route.params || {};
  const { user: contextUser } = useAuth();
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );
  
  // Memoized Exercise Item Component for better performance
  // Moved inside component to access styles
  const ExerciseItem = React.memo(({ exercise, index, isExpanded, onToggleExpansion }) => {
    // Get objectives from the first set to determine what fields to show
    const firstSet = exercise.sets?.[0];
    const objectivesFields = firstSet ? Object.keys(firstSet).filter(field => {
      const skipFields = [
        'id', 'order', 'notes', 'description', 'title', 'name',
        'created_at', 'updated_at', 'createdAt', 'updatedAt',
        'type', 'status', 'category', 'tags', 'metadata'
      ];
      return !skipFields.includes(field) && firstSet[field] !== undefined && firstSet[field] !== null && firstSet[field] !== '';
    }).sort() : [];

    // Calculate even gaps for proper spacing
    const { evenGap } = firstSet ? calculateEvenGaps(firstSet) : { evenGap: 8 };

    return (
      <View style={styles.exerciseCardWrapper}>
      <View style={styles.exerciseCardContainer}>
        <TouchableOpacity 
          style={styles.exerciseCard}
          onPress={() => onToggleExpansion(index)}
          activeOpacity={0.7}
        >
          <Text style={styles.exerciseNumber}>{index + 1}</Text>
          <View style={styles.exerciseContent}>
            <Text style={styles.exerciseTitle}>{exercise.name}</Text>
            <Text style={styles.exerciseInfo}>
              {exercise.sets ? exercise.sets.length : 0} series
            </Text>
          </View>
        </TouchableOpacity>
        
        {/* Expanded Objectives Section */}
        {isExpanded && (
          <View style={styles.setsContainer}>
            {/* Headers row */}
            <View style={styles.setTrackingRow}>
              <View style={styles.setNumberSpace} />
              <View style={styles.setInputsContainer}>
                {objectivesFields.map((field, fieldIndex) => {
                  const fieldName = getFieldDisplayName(field);
                  const fieldValue = firstSet[field]?.toString() || '';
                  const placeholderText = fieldValue !== undefined && fieldValue !== null && fieldValue !== '' ? fieldValue.toString() : 'NO DATA';
                  const titleWidth = fieldName.length * 8;
                  const contentWidth = placeholderText.length * 8;
                  const maxWidth = Math.max(titleWidth, contentWidth);
                  const extraWidth = objectivesFields.length === 2 ? 20 : 0;
                  const minWidth = objectivesFields.length === 2 ? 80 : 60;
                  const boxWidth = Math.max(maxWidth + 16 + extraWidth, minWidth);
                  
                  return (
                    <View key={field} style={[styles.inputGroup, { 
                      width: boxWidth, 
                      marginLeft: fieldIndex === 0 ? evenGap : 0,
                      marginRight: fieldIndex < objectivesFields.length - 1 ? evenGap : 0 
                    }]}>
                      <Text style={styles.headerLabel} numberOfLines={1} ellipsizeMode="tail">
                        {fieldName}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
            
            {/* Data rows */}
            {exercise.sets?.map((set, setIndex) => (
              <View key={setIndex} style={styles.setTrackingRow}>
                <View style={styles.setNumberContainer}>
                  <Text style={styles.setNumber}>{setIndex + 1}</Text>
                </View>
                <View style={styles.setInputsContainer}>
                  {objectivesFields.map((field, fieldIndex) => {
                    const fieldName = getFieldDisplayName(field);
                    const fieldValue = set[field]?.toString() || '';
                    const placeholderText = fieldValue !== undefined && fieldValue !== null && fieldValue !== '' ? fieldValue.toString() : 'NO DATA';
                    const titleWidth = fieldName.length * 8;
                    const contentWidth = placeholderText.length * 8;
                    const maxWidth = Math.max(titleWidth, contentWidth);
                    const extraWidth = objectivesFields.length === 2 ? 20 : 0;
                    const minWidth = objectivesFields.length === 2 ? 80 : 60;
                    const boxWidth = Math.max(maxWidth + 16 + extraWidth, minWidth);
                    
                    return (
                      <View key={field} style={[styles.inputGroup, { 
                        width: boxWidth, 
                        marginLeft: fieldIndex === 0 ? evenGap : 0,
                        marginRight: fieldIndex < objectivesFields.length - 1 ? evenGap : 0 
                      }]}>
                        <Text style={styles.objectiveValue}>
                          {set[field]?.toString() || '--'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
  });
  
  // FALLBACK: If AuthContext doesn't have user, check Firebase directly
  const [fallbackUser, setFallbackUser] = React.useState(null);
  React.useEffect(() => {
    if (!contextUser) {
      // Try to get user directly from Firebase as fallback
      import('../config/firebase').then(({ auth }) => {
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
          logger.log('⚠️ WorkoutExercisesScreen: Using fallback Firebase user (AuthContext failed)');
          setFallbackUser(firebaseUser);
        }
      });
    }
  }, [contextUser]);
  
  const user = contextUser || fallbackUser;
  
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedExercises, setExpandedExercises] = useState({});

  // Handle exercise expansion
  const handleToggleExpansion = (exerciseIndex) => {
    setExpandedExercises(prev => ({
      ...prev,
      [exerciseIndex]: !prev[exerciseIndex]
    }));
  };

  // Cache for service calls to prevent redundant requests
  const serviceCache = useRef({
    courseData: null,
    sessionData: null,
    lastFetch: 0
  });

  useEffect(() => {
    // Use passed data but still resolve exercises for muscle activation
    if (workoutData && sessionData) {
      logger.log('✅ Using passed workout data, but resolving exercises for muscle activation:', workoutData.title);
      
      // Resolve exercises to get muscle activation data
      const resolveExercises = async () => {
        try {
          const resolvedExercises = await Promise.all(
            workoutData.exercises.map(async (exercise) => {
              try {
                // Resolve primary exercise data from library
                logger.log(`🔍 WorkoutExercisesScreen: Resolving exercise:`, exercise.primary);
                const primaryExerciseData = await exerciseLibraryService.resolvePrimaryExercise(exercise.primary);
                logger.log(`🔍 WorkoutExercisesScreen: Got resolved data:`, {
                  title: primaryExerciseData.title,
                  muscle_activation: primaryExerciseData.muscle_activation,
                  implements: primaryExerciseData.implements ?? null,
                  hasImplements: Array.isArray(primaryExerciseData.implements),
                  implementsLength: Array.isArray(primaryExerciseData.implements)
                    ? primaryExerciseData.implements.length
                    : 'n/a',
                });
                
                // Extract libraryId from primary reference
                const libraryId = Object.keys(exercise.primary)[0];
                
                return {
                  id: exercise.id,
                  name: primaryExerciseData.title,
                  description: primaryExerciseData.description,
                  video_url: primaryExerciseData.video_url,
                  muscle_activation: primaryExerciseData.muscle_activation,
                  implements: Array.isArray(primaryExerciseData.implements)
                    ? primaryExerciseData.implements
                    : [],
                  libraryId: libraryId, // Include libraryId for proper exercise identification
                  sets: exercise.sets || [],
                  objectives: exercise.objectives || [],
                  measures: exercise.measures || [],
                  order: exercise.order || 0,
                  // Keep original references for alternatives (not used yet)
                  primary: exercise.primary,
                  alternatives: exercise.alternatives || {}
                };
              } catch (error) {
                logger.error('❌ Error resolving exercise:', exercise.primary, error);
                
                // Extract libraryId from primary reference even in error case
                const libraryId = exercise.primary ? Object.keys(exercise.primary)[0] : 'unknown';
                
                // Return fallback data if resolution fails
                return {
                  id: exercise.id,
                  name: exercise.primary || 'Exercise',
                  description: 'Exercise description not available',
                  video_url: null,
                  muscle_activation: {}, // Empty muscle activation as fallback
                  implements: [],
                  libraryId: libraryId, // Include libraryId even in error case
                  sets: exercise.sets || [],
                  objectives: exercise.objectives || [],
                  measures: exercise.measures || [],
                  order: exercise.order || 0,
                  primary: exercise.primary,
                  alternatives: exercise.alternatives || {}
                };
              }
            })
          );
          
          const resolvedWorkout = {
            ...workoutData,
            exercises: resolvedExercises
          };
          
          logger.log('✅ Workout created with', resolvedWorkout.exercises.length, 'exercises');
          
          // Debug: Log the workout object structure
          logger.log('🔍 WorkoutExercisesScreen: Created workout object:', {
            hasWorkout: !!resolvedWorkout,
            hasExercises: !!resolvedWorkout?.exercises,
            exercisesLength: resolvedWorkout?.exercises?.length,
            firstExerciseHasMuscleActivation: !!resolvedWorkout?.exercises?.[0]?.muscle_activation,
            firstExerciseMuscleActivationKeys: resolvedWorkout?.exercises?.[0]?.muscle_activation
              ? Object.keys(resolvedWorkout.exercises[0].muscle_activation)
              : 'none',
            firstExerciseStructure: resolvedWorkout?.exercises?.[0]
              ? Object.keys(resolvedWorkout.exercises[0])
              : 'no exercises',
            firstExerciseImplements: resolvedWorkout?.exercises?.[0]?.implements ?? null,
            firstExerciseHasImplements: Array.isArray(resolvedWorkout?.exercises?.[0]?.implements)
              ? resolvedWorkout.exercises[0].implements.length
              : 'not-array-or-missing',
          });
          
          setTodayWorkout(resolvedWorkout);
          setLoading(false);
          setError(null);
          
          // Preload images
          preloadImages(resolvedWorkout);
        } catch (error) {
          logger.error('❌ Error resolving exercises:', error);
          setError('Error loading workout exercises');
          setLoading(false);
        }
      };
      
      resolveExercises();
    } else {
      // Fallback to fetching if no data passed
      fetchTodayWorkout();
    }
  }, [workoutData, sessionData]);

  // Preload images for better performance
  const preloadImages = async (workoutData) => {
    try {
      const imageUrls = [];
      
      // Collect all image URLs
      if (workoutData?.image_url) {
        imageUrls.push(workoutData.image_url);
      }
      
      if (workoutData?.exercises) {
        const exerciseImages = workoutData.exercises
          .map(exercise => exercise.image_url)
          .filter(Boolean);
        imageUrls.push(...exerciseImages);
      }
      
      if (imageUrls.length > 0) {
        logger.log('🖼️ Preloading images in parallel...');
        // Preload all images in parallel for maximum speed
        await Promise.all(imageUrls.map(url => ExpoImage.prefetch(url)));
        logger.log('✅ All images preloaded');
      }
    } catch (error) {
      logger.error('❌ Error preloading images:', error);
    }
  };

  const fetchTodayWorkout = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        setError('Usuario no autenticado');
        return;
      }

      logger.log('🏋️ Getting today\'s workout for course:', course.courseId);
      const totalStartTime = Date.now();

      // Check cache first (5 minute TTL)
      const now = Date.now();
      const cacheAge = now - serviceCache.current.lastFetch;
      const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
      
      let courseData = serviceCache.current.courseData;
      let sessionData = serviceCache.current.sessionData;
      
      if (!courseData || cacheAge > CACHE_TTL) {
        logger.log('📥 Fetching fresh course data...');
        const userId = user?.uid || null;
        courseData = await workoutProgressService.getCourseDataForWorkout(course.courseId, userId);
        serviceCache.current.courseData = courseData;
        serviceCache.current.lastFetch = now;
      } else {
        logger.log('✅ Using cached course data');
      }
      
      // Get session data using new session service
      if (!sessionData || cacheAge > CACHE_TTL) {
        logger.log('📥 Fetching fresh session data...');
        const sessionStartTime = Date.now();
        
        // Use new session service to get current session
        // Don't force refresh to respect manual selections
        const sessionState = await sessionService.getCurrentSession(user.uid, course.courseId);
        
        // Convert to expected format for compatibility
        sessionData = {
          nextSession: sessionState.workout,
          sessionState: sessionState
        };
        
        const sessionTime = Date.now() - sessionStartTime;
        logger.log(`⏱️ Session data fetch took ${sessionTime}ms`);
        
        serviceCache.current.sessionData = sessionData;
      } else {
        logger.log('✅ Using cached session data');
      }
      
      if (!courseData) {
        setError('No se pudo cargar la información del curso');
        return;
      }
      
      // Check if we have course structure
      if (!courseData.courseData || !courseData.courseData.modules) {
        setError('El curso no tiene contenido disponible. Contacta al creador del curso.');
        return;
      }
      
      const nextSession = sessionData.nextSession;

      if (!nextSession) {
        setError('¡Felicidades! Has completado todas las sesiones de este curso.');
        return;
      }
      
      logger.log('🎯 Next session to do:', nextSession.title);
      
      // Check if session has exercises
      if (!nextSession.exercises || nextSession.exercises.length === 0) {
        logger.log('⚠️ Session has no exercises, showing empty workout:', nextSession);
        // Create workout with no exercises but show the session
        const todayWorkout = {
          id: nextSession.id,
          title: nextSession.title || 'Sesión de entrenamiento',
          description: nextSession.description || '',
          moduleId: nextSession.moduleId,
          moduleTitle: nextSession.moduleTitle || 'Módulo',
          sessionId: nextSession.id,
          image_url: nextSession.image_url,
          exercises: [] // Empty exercises array
        };
        
        setTodayWorkout(todayWorkout);
        setError(null);
        logger.log('✅ Empty workout created for session without exercises');
        return;
      }
      
      // Create workout from session data with optimized exercise library resolution
      const exerciseResolutionStartTime = Date.now();
      
      // Resolve all exercises in parallel for better performance
      const resolvedExercises = await Promise.all(
        nextSession.exercises.map(async (exercise) => {
          try {
            // Resolve primary exercise data from library
            logger.log(`🔍 WorkoutExercisesScreen: Resolving exercise:`, exercise.primary);
            const primaryExerciseData = await exerciseLibraryService.resolvePrimaryExercise(exercise.primary);
            logger.log(`🔍 WorkoutExercisesScreen: Got resolved data:`, {
              title: primaryExerciseData.title,
              muscle_activation: primaryExerciseData.muscle_activation,
              implements: primaryExerciseData.implements ?? null,
              hasImplements: Array.isArray(primaryExerciseData.implements),
              implementsLength: Array.isArray(primaryExerciseData.implements)
                ? primaryExerciseData.implements.length
                : 'n/a',
            });
            
            // Extract libraryId from primary reference
            const libraryId = Object.keys(exercise.primary)[0];
            
            return {
              id: exercise.id,
              name: primaryExerciseData.title,
              description: primaryExerciseData.description,
              video_url: primaryExerciseData.video_url,
              muscle_activation: primaryExerciseData.muscle_activation,
              implements: Array.isArray(primaryExerciseData.implements)
                ? primaryExerciseData.implements
                : [],
              libraryId: libraryId, // Include libraryId for proper exercise identification
              sets: exercise.sets || [],
              objectives: exercise.objectives || [],
              measures: exercise.measures || [],
              order: exercise.order || 0,
              // Keep original references for alternatives (not used yet)
              primary: exercise.primary,
              alternatives: exercise.alternatives || {}
            };
          } catch (error) {
            logger.error('❌ Error resolving exercise:', exercise.primary, error);
            
            // Extract libraryId from primary reference even in error case
            const libraryId = exercise.primary ? Object.keys(exercise.primary)[0] : 'unknown';
            
            // Return fallback data if resolution fails
            return {
              id: exercise.id,
              name: exercise.primary || 'Exercise',
              description: 'Exercise description not available',
              video_url: null,
              muscle_activation: {}, // Empty muscle activation as fallback
              libraryId: libraryId, // Include libraryId even in error case
              sets: exercise.sets || [],
              objectives: exercise.objectives || [],
              measures: exercise.measures || [],
              order: exercise.order || 0,
              primary: exercise.primary,
              alternatives: exercise.alternatives || {}
            };
          }
        })
      );
      
      const exerciseResolutionTime = Date.now() - exerciseResolutionStartTime;
      logger.log(`⏱️ Exercise resolution took ${exerciseResolutionTime}ms`);
      
      const todayWorkout = {
        id: nextSession.id,
        title: nextSession.title || 'Sesión de entrenamiento',
        description: nextSession.description || '',
        moduleId: nextSession.moduleId,
        moduleTitle: nextSession.moduleTitle || 'Módulo',
        sessionId: nextSession.id,
        image_url: nextSession.image_url,
        exercises: resolvedExercises
      };
      
      logger.log('✅ Workout created with', todayWorkout.exercises.length, 'exercises');
      
      // Debug: Log the workout object structure
      logger.log('🔍 WorkoutExercisesScreen: Created workout object:', {
        hasWorkout: !!todayWorkout,
        hasExercises: !!todayWorkout?.exercises,
        exercisesLength: todayWorkout?.exercises?.length,
        firstExerciseHasMuscleActivation: !!todayWorkout?.exercises?.[0]?.muscle_activation,
        firstExerciseMuscleActivationKeys: todayWorkout?.exercises?.[0]?.muscle_activation
          ? Object.keys(todayWorkout.exercises[0].muscle_activation)
          : 'none',
        firstExerciseStructure: todayWorkout?.exercises?.[0]
          ? Object.keys(todayWorkout.exercises[0])
          : 'no exercises',
        firstExerciseImplements: todayWorkout?.exercises?.[0]?.implements ?? null,
        firstExerciseHasImplements: Array.isArray(todayWorkout?.exercises?.[0]?.implements)
          ? todayWorkout.exercises[0].implements.length
          : 'not-array-or-missing',
      });
      
      setTodayWorkout(todayWorkout);
      setError(null);
      logger.log('✅ Today\'s workout loaded successfully:', todayWorkout);
      
      // Preload images for better performance (async, non-blocking)
      preloadImages(todayWorkout).catch(error => 
        logger.error('❌ Error preloading images:', error)
      );
      
      const totalTime = Date.now() - totalStartTime;
      logger.log(`🚀 TOTAL WORKOUT LOADING TIME: ${totalTime}ms`);
      
    } catch (error) {
      logger.error('❌ Error fetching today\'s workout:', error);
      setError('Error al cargar el entrenamiento: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartWorkout = async () => {
    try {
      logger.log('🚀 Starting workout:', todayWorkout.id);
      
      // Start workout session using sessionManager
      const session = await sessionManager.startSession(
        user.uid,
        course.courseId,
        todayWorkout.sessionId,
        todayWorkout.title
      );
      
      logger.log('✅ Workout session started:', session.sessionId);
      
      // Navigate to warmup screen first
      navigation.navigate('Warmup', {
        course: course,
        workout: todayWorkout,
        sessionId: session.sessionId
      });
      
    } catch (error) {
      logger.error('❌ Failed to start workout:', error);
      alert('Error al iniciar el entrenamiento. Inténtalo de nuevo.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <FixedWakeHeader 
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
          title="Ejercicios de Hoy"
        />
        <View style={styles.loadingContainer}>
          <LoadingSpinner />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <FixedWakeHeader 
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
          title="Ejercicios de Hoy"
        />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top background filler to cover notch/status bar behind header */}
      <View style={styles.topBackground} />
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        title="Ejercicios de Hoy"
      />
      
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={{ overflow: 'visible' }}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <WakeHeaderSpacer />

          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.screenTitle}>
              {todayWorkout ? todayWorkout.title : 'Ejercicios de Hoy'}
            </Text>
            {todayWorkout && todayWorkout.moduleTitle && (
              <Text style={styles.moduleTitle}>
                {todayWorkout.moduleTitle}
              </Text>
            )}
          </View>


          {/* Exercises List */}
          {todayWorkout.exercises && todayWorkout.exercises.length > 0 ? (
            <View style={styles.exercisesContainer}>
              {todayWorkout.exercises.map((exercise, index) => (
                <ExerciseItem 
                  key={exercise.id || index} 
                  exercise={exercise} 
                  index={index}
                  isExpanded={expandedExercises[index] || false}
                  onToggleExpansion={handleToggleExpansion}
                />
              ))}
            </View>
          ) : (
            <View style={styles.noExercisesContainer}>
              <Text style={styles.noExercisesText}>NO HAY EJERCICIOS</Text>
              <Text style={styles.noExercisesSubtext}>
                Esta sesión no tiene ejercicios configurados
              </Text>
            </View>
          )}

        </View>
      </ScrollView>
      
      {/* Start Workout Button - Fixed at bottom */}
      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity 
          style={[
            styles.primaryButton, 
            (!todayWorkout?.exercises || todayWorkout.exercises.length === 0) && styles.primaryButtonDisabled
          ]} 
          onPress={handleStartWorkout}
          disabled={!todayWorkout?.exercises || todayWorkout.exercises.length === 0}
        >
          <Text style={[
            styles.primaryButtonText,
            (!todayWorkout?.exercises || todayWorkout.exercises.length === 0) && styles.primaryButtonTextDisabled
          ]}>
            Comenzar
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  topBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: '#1a1a1a',
    zIndex: 0,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingTop: 0,
    paddingBottom: 100,
  },
  titleSection: {
    marginBottom: Math.max(24, screenHeight * 0.03),
  },
  screenTitle: {
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  moduleTitle: {
    fontSize: Math.min(screenWidth * 0.05, 18),
    fontWeight: '400',
    color: '#cccccc',
    opacity: 0.8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 16,
  },
  exercisesContainer: {
    marginBottom: 24,
  },
  noExercisesContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  noExercisesText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  noExercisesSubtext: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  exerciseCardWrapper: {
    marginBottom: Math.max(12, screenHeight * 0.015),
  },
  exerciseCardContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  exerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Math.max(16, screenWidth * 0.04),
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
  exerciseTitle: {
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  exerciseInfo: {
    fontSize: Math.min(screenWidth * 0.035, 14),
    color: '#cccccc',
    opacity: 0.7,
  },
  setsContainer: {
    paddingHorizontal: Math.max(16, screenWidth * 0.04),
    paddingBottom: Math.max(16, screenWidth * 0.04),
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  setTrackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  setNumberSpace: {
    width: Math.max(32, screenWidth * 0.08),
    marginRight: 12,
  },
  setNumberContainer: {
    width: Math.max(32, screenWidth * 0.08),
    height: Math.max(32, screenWidth * 0.08),
    borderRadius: Math.max(16, screenWidth * 0.04),
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  setNumber: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 14),
    fontWeight: '600',
  },
  setInputsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputGroup: {
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: Math.min(screenWidth * 0.03, 12),
    fontWeight: '500',
    color: '#cccccc',
    marginBottom: 4,
  },
  objectiveValue: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    color: '#ffffff',
  },
  bottomButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingBottom: Math.max(20, screenHeight * 0.025),
    paddingTop: Math.max(16, screenHeight * 0.02),
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  primaryButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderRadius: Math.max(12, screenWidth * 0.04),
    paddingVertical: Math.max(16, screenHeight * 0.02),
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#666666',
    opacity: 0.5,
  },
  primaryButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.05, 18),
    fontWeight: '700',
  },
  primaryButtonTextDisabled: {
    color: '#999999',
  },
});

export default WorkoutExercisesScreen;
