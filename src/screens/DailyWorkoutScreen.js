import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ImageBackground,
  Image,
  useWindowDimensions,
  Animated,
  FlatList,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import workoutProgressService from '../data-management/workoutProgressService';
import sessionManager from '../services/sessionManager';
import localCourseCache from '../data-management/localCourseCache';
import hybridDataService from '../services/hybridDataService';
import exerciseLibraryService from '../services/exerciseLibraryService';
import tutorialManager from '../services/tutorialManager';
import sessionService from '../services/sessionService';
import TutorialOverlay from '../components/TutorialOverlay';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import SvgFire from '../components/icons/vectors_fig/Environment/Fire';
import logger from '../utils/logger.js';
import { isWeb } from '../utils/platform';

// Custom hook for streak data management
const useStreakData = (userId, courseId) => {
  const [streak, setStreak] = React.useState(0);
  const [sessionsThisWeek, setSessionsThisWeek] = React.useState(0);
  const [minimumSessions, setMinimumSessions] = React.useState(3);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadStreakData = async () => {
      try {
        setIsLoading(true);
        
        // Load streak data and course settings in parallel
        const [progressResult, courseDataResult] = await Promise.all([
          sessionService.getCourseProgress(userId, courseId),
          workoutProgressService.getCourseDataForWorkout(courseId)
        ]);

        // Update streak data
        const progress = progressResult;
        setStreak(progress?.weeklyStreak?.currentStreak || 0);
        setSessionsThisWeek(progress?.weeklyStreak?.sessionsCompletedThisWeek || 0);

        // Update minimum sessions
        const courseData = courseDataResult;
        setMinimumSessions(courseData?.courseData?.programSettings?.minimumSessionsPerWeek || 3);
        
      } catch (error) {
        logger.error('❌ Error loading streak data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (userId && courseId) {
      loadStreakData();
    }
  }, [userId, courseId]);

  return { streak, sessionsThisWeek, minimumSessions, isLoading };
};

const DailyWorkoutScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { course } = route.params;
  const { user: contextUser } = useAuth();
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);
  // Track failed image loads to show fallbacks
  const [failedImages, setFailedImages] = React.useState(new Set());
  
  // Memoized streak display component - SMALLER for overlay
  // Moved inside component to access styles
  const StreakDisplay = React.memo(({ streak, sessionsThisWeek, minimumSessions }) => {
    const isStreakActive = streak > 0;
    const flameOpacity = isStreakActive ? 0.9 : 0.4;
    
    return (
      <>
        <View style={styles.fireIconContainer}>
          {/* Base flame - largest, darkest */}
          <SvgFire 
            width={60}
            height={60}
            stroke="#000000"
            strokeWidth={0.3}
            fill="#E64A11"
            style={[styles.fireBase, { opacity: flameOpacity }]}
          />
          
          {/* Middle flame - medium size, orange */}
          <SvgFire 
            width={20}
            height={20}
            stroke="#D5C672"
            strokeWidth={0.5}
            fill="#D5C672"
            style={[styles.fireMiddle, { transform: [{ scaleX: -1 }], opacity: flameOpacity }]}
          />
          
          {/* Inner flame - smallest, brightest */}
          <SvgFire 
            width={8}
            height={8}
            stroke="#FFFFFF"
            strokeWidth={0.5}
            fill="#FFFFFF"
            style={[styles.fireInner, { opacity: flameOpacity }]}
          />
        </View>
        <Text style={styles.streakNumber}>
          {streak}
        </Text>
      </>
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
          logger.log('⚠️ DailyWorkoutScreen: Using fallback Firebase user (AuthContext failed)');
          setFallbackUser(firebaseUser);
        }
      });
    }
  }, [contextUser]);
  
  const user = contextUser || fallbackUser;
  
  // Unified session state - single source of truth
  const [sessionState, setSessionState] = useState({
    session: null,
    workout: null,
    index: 0,
    isManual: false,
    allSessions: [],
    progress: null,
    isLoading: true,
    error: null
  });
  
  // UI state
  const [courseMetadata, setCourseMetadata] = useState(null);
  const [previewSessionId, setPreviewSessionId] = useState(null);
  const [isChangingSession, setIsChangingSession] = useState(false);
  
  // Tutorial state
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialData, setTutorialData] = useState([]);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);
  
  // Use consolidated streak data hook
  const { streak, sessionsThisWeek, minimumSessions, isLoading: streakLoading } = useStreakData(user?.uid, course?.courseId);
  
  // Cache for service calls to prevent redundant requests
  const serviceCache = useRef({
    courses: null,
    courseData: null,
    lastFetch: 0
  });
  
  // Scroll tracking for pagination indicator
  const scrollX = new Animated.Value(0);
  const mainSwipeRef = useRef(null);

  // Reset scroll position to show correct pagination indicator
  const resetScrollPosition = () => {
    if (mainSwipeRef.current) {
      mainSwipeRef.current.scrollTo({ x: 0, animated: false });
      scrollX.setValue(0);
    }
  };

  // Scroll handler for pagination indicator
  const onMainScroll = (event) => {
    // Update the animated value for pagination indicators
    scrollX.setValue(event.nativeEvent.contentOffset.x);
  };

  useEffect(() => {
    loadCourseMetadata();
    
    // Only load normal session state if no session is pre-selected
    // Skip if user is not yet available
    if (!route.params?.selectedSessionId) {
      if (user?.uid) {
        loadSessionState();
      } else {
        logger.log('⏭️ Waiting for user to be available before loading session state...');
      }
    } else {
      logger.log('⏭️ Skipping normal session load - session pre-selected from CourseStructure');
    }
  }, [user?.uid]); // Re-run when user becomes available

  // Handle pre-selected session from CourseStructureScreen
  useEffect(() => {
    if (route.params?.selectedSessionId && user?.uid) {
      const { selectedSessionId, selectedModuleId, selectedSessionIndex } = route.params;
      
      logger.log('📍 Session pre-selected from CourseStructure:', {
        selectedSessionId,
        selectedModuleId,
        selectedSessionIndex
      });
      
      // Find the session object from allSessions or load it
      const handlePreSelectedSession = async () => {
        try {
          // If we already have allSessions loaded, use them
          let allSessions = sessionState.allSessions;
          
          if (!allSessions || allSessions.length === 0) {
            // Need to load session state first to get all sessions
            logger.log('📥 Loading session state to get all sessions...');
            const initialState = await sessionService.getCurrentSession(
              user.uid,
              course.courseId
            );
            allSessions = initialState.allSessions || [];
            // Update state with loaded sessions (but don't select yet)
            setSessionState(prev => ({
              ...prev,
              allSessions: allSessions,
              isLoading: false
            }));
          }
          
          // Find the selected session
          const selectedSession = allSessions.find(s => 
            (s.id === selectedSessionId) || (s.sessionId === selectedSessionId)
          );
          
          if (selectedSession) {
            logger.log('✅ Found pre-selected session, selecting it...');
            await handleSelectSession(selectedSession, selectedSessionIndex);
            
            // Clear params after successful selection to prevent re-selection on back navigation
            navigation.setParams({ 
              selectedSessionId: undefined,
              selectedModuleId: undefined,
              selectedSessionIndex: undefined
            });
          } else {
            logger.warn('⚠️ Pre-selected session not found in allSessions, loading normally');
            // Clear params and load normally
            navigation.setParams({ 
              selectedSessionId: undefined,
              selectedModuleId: undefined,
              selectedSessionIndex: undefined
            });
            loadSessionState();
          }
        } catch (error) {
          logger.error('❌ Error handling pre-selected session:', error);
          // Clear params and fallback to normal load
          navigation.setParams({ 
            selectedSessionId: undefined,
            selectedModuleId: undefined,
            selectedSessionIndex: undefined
          });
          loadSessionState();
        }
      };
      
      handlePreSelectedSession();
    }
  }, [route.params?.selectedSessionId, user?.uid]);

  // Refresh data when screen comes into focus
  // On web, this runs on mount since there's no focus event
  const webLoadCalledRef = React.useRef(false);
  
  React.useEffect(() => {
    if (isWeb && !webLoadCalledRef.current) {
      // On web, load once on mount
      if (!sessionState.isManual && user?.uid && course?.courseId) {
        webLoadCalledRef.current = true;
        loadSessionState();
      }
    }
    // On native, this would be handled by useFocusEffect which doesn't work on web
    // The web wrapper ensures fresh data on navigation
  }, [isWeb, user?.uid, course?.courseId, sessionState.isManual]);

  // Load session state using single service
  const loadSessionState = async (options = {}) => {
    try {
      logger.log('🎯 Loading session state...');
      
      // Safety check: ensure user and course are available
      if (!user?.uid) {
        logger.error('❌ Cannot load session state: user not available');
        return;
      }
      
      if (!course?.courseId) {
        logger.error('❌ Cannot load session state: course not available');
        return;
      }
      
      setSessionState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const newState = await sessionService.getCurrentSession(
        user.uid, 
        course.courseId, 
        options
      );
      
      setSessionState(newState);
      
      // Check for tutorials after session is loaded
      if (newState.session && !newState.error) {
        await checkForTutorials();
      }
      
      logger.log('✅ Session state loaded successfully');
      
    } catch (error) {
      logger.error('❌ Error loading session state:', error);
      setSessionState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error.message 
      }));
    }
  };

  // Load course metadata using hybrid system with caching
  const loadCourseMetadata = async () => {
    try {
      logger.log('🔄 Loading course metadata using hybrid system...');
      
      // Check cache first (5 minute TTL)
      const now = Date.now();
      const cacheAge = now - serviceCache.current.lastFetch;
      const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
      
      let courses = serviceCache.current.courses;
      
      if (!courses || cacheAge > CACHE_TTL) {
        logger.log('📥 Fetching fresh course data from hybrid system...');
        courses = await hybridDataService.loadCourses();
        serviceCache.current.courses = courses;
        serviceCache.current.lastFetch = now;
      } else {
        logger.log('✅ Using cached course data');
      }
      
      const courseMeta = courses.find(c => c.id === course.courseId);
      
      if (courseMeta) {
        setCourseMetadata(courseMeta);
        logger.log('✅ Course metadata loaded:', courseMeta.title);
      } else {
        logger.log('⚠️ Course metadata not found in hybrid cache');
      }
      
    } catch (error) {
      logger.error('❌ Error loading course metadata:', error);
    }
  };

  // Preload images for better performance (optimized)
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


  const handleViewExercises = () => {
    if (sessionState.workout) {
      // Pass the current session state to WorkoutExercises
      navigation.navigate('WorkoutExercises', { 
        course: course,
        sessionData: sessionState.session,
        workoutData: sessionState.workout,
        sessionState: sessionState // Pass the entire session state
      });
    }
  };

  // Debug function to check course storage
  const debugCourseStorage = async () => {
    try {
      logger.log('🔍 DEBUG: Checking course storage...');
      
      // Check if course exists in AsyncStorage
      const storageKey = `course_${course.courseId}`;
      const storedData = await AsyncStorage.getItem(storageKey);
      
      if (storedData) {
        const courseData = JSON.parse(storedData);
        logger.log('✅ Course found in AsyncStorage:', {
          courseId: courseData.courseId,
          downloadedAt: courseData.downloadedAt,
          expiresAt: courseData.expiresAt,
          modulesCount: courseData.courseData?.modules?.length || 0,
          size_mb: courseData.size_mb
        });
      } else {
        logger.log('❌ Course NOT found in AsyncStorage');
      }
      
      // Check hybrid cache
      const courses = await hybridDataService.loadCourses();
      const courseMeta = courses.find(c => c.id === course.courseId);
      if (courseMeta) {
        logger.log('✅ Course found in hybrid cache:', courseMeta.title);
      } else {
        logger.log('❌ Course NOT found in hybrid cache');
      }
      
    } catch (error) {
      logger.error('❌ Debug error:', error);
    }
  };

  // Handle session selection
  const handleSelectSession = async (session, sessionIndex) => {
    try {
      logger.log('🔄 Starting session selection for:', session.title);
      setIsChangingSession(true);
      logger.log('📍 User selected session:', session.title, 'at index:', sessionIndex);
      logger.log('🔄 isChangingSession set to true');
      
      // DON'T clear preview state yet - keep it for loading overlay
      // setPreviewSessionId(null);
      logger.log('🔄 Keeping previewSessionId for loading overlay:', previewSessionId);
      
      // Show loading state immediately
      setSessionState(prev => ({ ...prev, isLoading: true, error: null }));
      logger.log('🔄 Session state loading set to true');
      
      // Use single service to select session
      const newState = await sessionService.selectSession(
        user.uid,
        course.courseId,
        session.sessionId || session.id,
        sessionIndex
      );
      
      setSessionState(newState);
      
      // Clear preview state after successful load
      setPreviewSessionId(null);
      logger.log('🔄 previewSessionId cleared after successful load');
      
      // Scroll back to session image card (first card)
      if (mainSwipeRef.current) {
        mainSwipeRef.current.scrollTo({ x: 0, animated: true });
      }
      
      logger.log('✅ Session selected successfully');
      
    } catch (error) {
      logger.error('❌ Error selecting session:', error);
      setSessionState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Error al cambiar la sesión: ' + error.message 
      }));
      // Clear preview state on error too
      setPreviewSessionId(null);
      logger.log('🔄 previewSessionId cleared after error');
      Alert.alert('Error', 'No se pudo cambiar la sesión');
    } finally {
      setIsChangingSession(false);
      logger.log('🔄 isChangingSession set to false');
    }
  };

  const handleNextWorkout = async () => {
    try {
      logger.log('⏭️ Moving to next workout...');
      
      // Use single service to move to next workout
      const newState = await sessionService.moveToNextWorkout(
        user.uid,
        course.courseId,
        sessionState.workout?.sessionId
      );
      
      setSessionState(newState);
      logger.log('✅ Next workout loaded');
      
    } catch (error) {
      logger.error('❌ Failed to move to next workout:', error);
      alert('Error al cargar el siguiente entrenamiento. Inténtalo de nuevo.');
    }
  };

  // Render session card for list
  const renderSessionCard = ({ item: session, index }) => {
    const sessionId = session.sessionId || session.id;
    const isCurrentSession = sessionId === (sessionState.session?.sessionId || sessionState.session?.id);
    const isPreviewSession = sessionId === previewSessionId;
    const isLoadingThisCard = isChangingSession && isPreviewSession;
    
    // Debug logging
    if (isLoadingThisCard) {
      logger.log('🔄 Loading overlay should be visible for session:', session.title);
    }
    
    return (
      <TouchableOpacity 
        style={[
          styles.sessionListCard,
          isPreviewSession && styles.selectedSessionCard,
          isChangingSession && styles.disabledCard
        ]}
        onPress={() => {
          // If card is already in preview mode, select it
          if (isPreviewSession) {
            handleSelectSession(session, index);
          } else {
            // Otherwise, show preview
            setPreviewSessionId(sessionId);
          }
        }}
        disabled={isChangingSession}
        activeOpacity={0.7}
      >
        {/* Session Thumbnail */}
        {session.image_url && !failedImages.has(`session-${session.id}`) ? (
          <ExpoImage
            source={{ uri: session.image_url }}
            style={styles.sessionThumbnail}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={(error) => {
              logger.error('❌ Error loading session thumbnail:', {
                sessionId: session.id,
                imageUrl: session.image_url,
                error: error?.message || error
              });
              setFailedImages(prev => new Set(prev).add(`session-${session.id}`));
            }}
          />
        ) : (
          <View style={styles.sessionThumbnailPlaceholder}>
            <Text style={styles.sessionThumbnailPlaceholderText}>{index + 1}</Text>
          </View>
        )}
        
        {/* Session Info */}
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionListTitle} numberOfLines={2}>
            {session.title || `Sesión ${index + 1}`}
          </Text>
        </View>
        
        
        {/* Current Session Indicator - Only show "Actual" badge */}
        {isCurrentSession && (
          <TouchableOpacity 
            style={styles.currentBadge}
            onPress={() => {
              if (mainSwipeRef.current) {
                mainSwipeRef.current.scrollTo({ x: 0, animated: true });
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.currentBadgeText}>Actual</Text>
          </TouchableOpacity>
        )}
        
        {/* Preview Session Arrow */}
        {isPreviewSession && !isCurrentSession && (
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>→</Text>
          </View>
        )}
        
        {/* Loading Overlay */}
        {isLoadingThisCard && (
          <View style={styles.cardLoadingOverlay}>
            <ActivityIndicator size="large" color="rgba(191, 168, 77, 1)" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Check for tutorials to show
  const checkForTutorials = async () => {
    if (!user?.uid || !course?.courseId) return;

    try {
      logger.log('🎬 Checking for daily workout screen tutorials...');
      const tutorials = await tutorialManager.getTutorialsForScreen(
        user.uid, 
        'dailyWorkout',
        course.courseId  // Pass programId for program-specific tutorials
      );
      
      if (tutorials.length > 0) {
        logger.log('📚 Found tutorials to show:', tutorials.length);
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
      } else {
        logger.log('✅ No tutorials to show for daily workout screen');
      }
    } catch (error) {
      logger.error('❌ Error checking for tutorials:', error);
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
          'dailyWorkout', 
          currentTutorial.videoUrl,
          course.courseId  // Pass programId for program-specific tutorials
        );
        logger.log('✅ Tutorial marked as completed');
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  };



    return (
      <SafeAreaView style={styles.container}>
        {/* Fixed Header with Back Button */}
        <FixedWakeHeader 
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <WakeHeaderContent style={styles.content}>
            {/* Spacer for fixed header */}
            <WakeHeaderSpacer />

          {/* Main Swipeable Container */}
          <View style={styles.workoutSection}>
            <ScrollView
              ref={mainSwipeRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.mainSwipeContainer}
              contentContainerStyle={styles.mainSwipeContent}
              snapToInterval={screenWidth - 48 + 15} // Card width + margin
              snapToAlignment="start"
              decelerationRate="fast"
              onScroll={onMainScroll}
              scrollEventThrottle={16}
            >
              {/* CARD 1: Session Image Card with Streak Overlay */}
            <TouchableOpacity 
              style={[
                  styles.sessionImageCard, 
                  sessionState.workout?.image_url && styles.sessionImageCardNoBorder
              ]} 
              onPress={sessionState.workout ? handleViewExercises : undefined}
              disabled={!sessionState.workout}
                activeOpacity={0.9}
            >
            {sessionState.isLoading ? (
                <View style={styles.cardLoadingContainer}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.cardLoadingText}>Cargando entrenamiento...</Text>
              </View>
            ) : sessionState.error ? (
                <View style={styles.cardErrorContainer}>
                  <Text style={styles.cardErrorText}>{sessionState.error}</Text>
                    <TouchableOpacity style={styles.cardRetryButton} onPress={() => loadSessionState({ forceRefresh: true })}>
                    <Text style={styles.cardRetryButtonText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : sessionState.workout ? (
                <>
                  {sessionState.workout.image_url && !failedImages.has(`workout-${sessionState.workout.id}`) ? (
                      <View style={styles.sessionImageContainer}>
                      <ExpoImage
                        source={{ uri: sessionState.workout.image_url }}
                          style={styles.sessionImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={200}
                        onError={(error) => {
                          logger.error('❌ Error loading workout image:', {
                            workoutId: sessionState.workout.id,
                            imageUrl: sessionState.workout.image_url,
                            error: error?.message || error
                          });
                          setFailedImages(prev => new Set(prev).add(`workout-${sessionState.workout.id}`));
                        }}
                      />
                        {/* Session Title Overlay - Bottom Left */}
                        <View style={styles.sessionTitleOverlay}>
                          <Text style={styles.sessionTitleText}>
                          {sessionState.workout.title}
                      </Text>
                          <Text style={styles.sessionModuleText}>
                          {sessionState.workout.moduleTitle || 'Módulo'}
                      </Text>
                    </View>
                        
                        {/* Streak Overlay - Bottom Right */}
                        <View style={styles.streakOverlay}>
                          <View style={styles.streakIconAndNumber}>
                            <StreakDisplay 
                              streak={streak} 
                              sessionsThisWeek={sessionsThisWeek} 
                              minimumSessions={minimumSessions} 
                            />
                          </View>
                          <Text style={styles.streakOverlayLabel}>Racha</Text>
                    </View>
                    </View>
                  ) : (
                      <View style={styles.sessionTitleOverlay}>
                        <Text style={styles.sessionTitleText}>
                        {sessionState.workout.title}
                    </Text>
                        <Text style={styles.sessionModuleText}>
                        {sessionState.workout.moduleTitle || 'Módulo'}
                    </Text>
                  </View>
                )}
                
                {/* Show message if session has no exercises */}
                {sessionState.workout.exercises && sessionState.workout.exercises.length === 0 && (
                  <View style={styles.noExercisesContainer}>
                    <Text style={styles.noExercisesText}>
                      Esta sesión no tiene ejercicios asignados
                    </Text>
                  </View>
                )}
                </>
              ) : (
                <View style={styles.cardNoWorkoutContainer}>
                  <Text style={{ color: '#ffffff', fontSize: 18, textAlign: 'center', marginBottom: 20 }}>
                    ¡Felicidades! Has completado todas las sesiones de este curso.
                                </Text>
                  <TouchableOpacity 
                    style={{ 
                      backgroundColor: 'rgba(191, 168, 77, 0.72)', 
                      paddingHorizontal: 20, 
                      paddingVertical: 10, 
                      borderRadius: 12,
                      borderWidth: 0.2,
                      borderColor: '#ffffff'
                    }} 
                      onPress={() => loadSessionState({ forceRefresh: true })}
                  >
                    <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>
                      Reintentar
                                  </Text>
                    </TouchableOpacity>
                  </View>
                )}
            </TouchableOpacity>
            
              {/* CARD 2: All Sessions + Programa Combined */}
              <View style={styles.programAndSessionsContainer}>
                {/* All Sessions List at Top */}
                <View style={styles.allSessionsCard}>
                  <Text style={styles.allSessionsTitle}>
                    Sesiones {sessionState.workout?.moduleTitle || 'Módulo'}
                  </Text>
                  <FlatList
                    data={sessionState.allSessions.filter(session => 
                      session.moduleId === sessionState.workout?.moduleId
                    )}
                    renderItem={renderSessionCard}
                    keyExtractor={(item, index) => item.id || item.sessionId || `session-${index}`}
                    showsVerticalScrollIndicator={true}
                    initialNumToRender={5}
                    maxToRenderPerBatch={5}
                    windowSize={5}
                    removeClippedSubviews={true}
                    style={{ overflow: 'visible' }}
                    contentContainerStyle={{ overflow: 'visible' }}
                    getItemLayout={(data, index) => ({
                      length: 100,
                      offset: 100 * index,
                      index
                    })}
                  />
                              </View>
                
                {/* Programa Card at Bottom */}
            <TouchableOpacity 
                  style={styles.programCard}
                  onPress={() => navigation.navigate('CourseStructure', { course })}
                    activeOpacity={0.7}
                  >
                  <Text style={styles.programCardText}>Programa</Text>
            </TouchableOpacity>
              </View>
            </ScrollView>
            
            {/* Pagination Indicators - MainScreen Style (2 dots) */}
            <View style={styles.paginationContainer}>
              {[0, 1].map((index) => {
                const cardWidth = screenWidth - 48;
                const inputRange = [
                  (index - 1) * cardWidth,
                  index * cardWidth,
                  (index + 1) * cardWidth,
                ];
                
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
          </View>
          <BottomSpacer />
          </WakeHeaderContent>
        </ScrollView>

      {/* Tutorial Overlay */}
      <TutorialOverlay
        visible={tutorialVisible}
        tutorialData={tutorialData}
        onClose={() => setTutorialVisible(false)}
        onComplete={handleTutorialComplete}
      />
    </SafeAreaView>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    overflow: 'visible',
  },
  scrollView: {
    flex: 1,
  },
  contentScrollContent: {
    flexGrow: 1,
  },
  content: {
    paddingBottom: 20,
    overflow: 'visible',
  },
  // Main swipeable container styles
  mainSwipeContainer: {
    marginBottom: 15,
    overflow: 'visible',
  },
  mainSwipeContent: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    overflow: 'visible',
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  courseTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
    marginRight: 12,
  },
  courseBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  courseBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  workoutSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#cccccc',
    fontSize: 16,
    fontWeight: '400',
    marginTop: 12,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '400',
    fontWeight: '600',
  },
  // Session Image Card (Card 1) - TALLER with streak overlay
  sessionImageCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    height: Math.max(700, screenHeight * 0.82), // TALLER: 80% of screen height, min 700px
    width: screenWidth - Math.max(48, screenWidth * 0.12),
    overflow: 'hidden',
    position: 'relative',
    marginRight: 15, // Space between cards
  },
  sessionImageCardNoBorder: {
    borderWidth: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  sessionImageContainer: {
    flex: 1,
    position: 'relative',
  },
  sessionImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    opacity: 0.8,
  },
  sessionTitleOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 100, // Make room for streak on right
  },
  sessionTitleText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  sessionModuleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Streak Overlay - Bottom Right
  streakOverlay: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)', // Same as library cards but with 0.2 opacity
    borderRadius: Math.max(12, screenWidth * 0.04), // Same responsive border radius
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)', // Same border color
    shadowColor: 'rgba(255, 255, 255, 0.4)', // Same shadow color
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    padding: 12,
    minWidth: 80,
    gap: 4,
  },
  streakOverlayLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  streakIconAndNumber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Combined Programa + Sessions Card (Card 2)
  programAndSessionsContainer: {
    width: screenWidth - Math.max(48, screenWidth * 0.12),
    height: Math.max(700, screenHeight * 0.82),
    overflow: 'visible',
  },
  // Programa Card at Bottom - Half height, full width
  programCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    height: Math.max(60, screenHeight * 0.075), // Half of original height
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15, // Space between Sessions and Programa
  },
  programCardText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  // All Sessions Card Below Programa
  allSessionsCard: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    padding: Math.max(20, screenWidth * 0.05),
    overflow: 'visible',
  },
  allSessionsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
    paddingLeft: 20, // Add left padding
  },
  // Session List Card styles
  sessionListCard: {
    backgroundColor: '#3a3a3a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible', // Changed from 'hidden' to allow shadow to render
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6, // Same as program cards in library
    paddingHorizontal: 6, // Same as program cards in library
    marginBottom: 12,
    position: 'relative', // Added to ensure proper positioning context
  },
  selectedSessionCard: {
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    backgroundColor: 'transparent', // Remove background fill
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  disabledCard: {
    opacity: 0.5,
  },
  cardLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Increased opacity for better visibility
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Math.max(12, screenWidth * 0.04),
    zIndex: 1000, // Ensure it's above other elements
    elevation: 10, // Android elevation
  },
  sessionThumbnail: {
    width: 70,
    height: 70,
    borderRadius: 8,
    marginRight: 12,
  },
  sessionThumbnailPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: '#555555',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sessionThumbnailPlaceholderText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
  },
  sessionInfo: {
    flex: 1,
    marginRight: 8,
  },
  sessionListTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  sessionModule: {
    fontSize: 14,
    fontWeight: '400',
    color: '#ffffff',
    opacity: 0.8,
  },
  currentBadge: {
    backgroundColor: 'rgba(191, 168, 77, 0.8)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    alignSelf: 'center', // Center vertically in the card
  },
  currentBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  previewBadge: {
    backgroundColor: 'rgba(191, 168, 77, 0.8)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    alignSelf: 'center',
  },
  previewBadgeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  selectSessionButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectSessionButtonCurrent: {
    backgroundColor: '#555555',
    opacity: 0.5,
  },
  selectSessionButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 14,
    fontWeight: '600',
  },
  selectSessionButtonTextCurrent: {
    color: '#999999',
  },
  // Pagination container
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  workoutCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  workoutTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 24,
  },
  
  // Exercise List Styles
  exercisesContainer: {
    marginBottom: 24,
  },
  
  exercisesTitle: {
    fontSize: 16,
    fontWeight: '400',
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  
  exerciseCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  
  exerciseNumber: {
    width: 32,
    height: 32,
    backgroundColor: '#007AFF',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  
  exerciseNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  
  exerciseInfo: {
    flex: 1,
  },
  
  exerciseName: {
    fontSize: 16,
    fontWeight: '400',
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    lineHeight: 20,
  },
  
  exerciseDetails: {
    marginBottom: 8,
  },
  
  exerciseDetail: {
    fontSize: 14,
    color: '#B0B0B0',
    marginBottom: 4,
  },
  
  exerciseNotes: {
    fontSize: 13,
    fontWeight: '400',
    color: '#888888',
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 8,
  },
  
  setDetail: {
    fontSize: 13,
    fontWeight: '400',
    color: '#B0B0B0',
    marginLeft: 12,
    marginBottom: 2,
  },
  
  exerciseMuscles: {
    fontSize: 12,
    color: '#4A90E2',
    marginTop: 6,
    fontWeight: '500',
  },
  
  exerciseImplements: {
    fontSize: 12,
    color: '#F39C12',
    marginTop: 2,
    fontWeight: '500',
  },
  
  startWorkoutButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  startWorkoutButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  noWorkoutContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  noWorkoutText: {
    color: '#cccccc',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  noWorkoutSubtext: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
  },
  noExercisesContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    marginTop: 16,
  },
  noExercisesText: {
    color: '#ff6b6b',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  noExercisesSubtext: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
  },
  nextWorkoutButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 16,
  },
  nextWorkoutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '400',
    fontWeight: '600',
  },
  progressContainer: {
    marginTop: 16,
    marginBottom: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressText: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '500',
  },
  progressPercentage: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '700',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#3a3a3a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 3,
  },
  // Keep these for StreakDisplay component positioning (used in overlay now)
  streakNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
    justifyContent: 'center',
    width: '100%',
    paddingRight: 10,
  },
  fireIconContainer: {
    position: 'relative',
    width: 50, // Smaller for overlay
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fireBase: {
    position: 'absolute',
    bottom: 0,
  },
  fireMiddle: {
    position: 'absolute',
    bottom: 6,
  },
  fireInner: {
    position: 'absolute',
    bottom: 8,
  },
  streakNumber: {
    fontSize: 32, // Smaller for overlay
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 10,
  },
    streakLabel: {
    fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
      opacity: 1,
    textAlign: 'center',
    },
  // Card state styles
  cardLoadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLoadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  cardErrorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  cardErrorText: {
    color: '#ff6b6b',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  cardRetryButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.72)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 0.2,
    borderColor: '#ffffff',
  },
  cardRetryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  cardNoWorkoutContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: Math.max(500, screenHeight * 0.6), // Responsive height: 60% of screen height, min 500px
  },
  cardNoWorkoutText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  cardNoWorkoutSubtext: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
  },
  noExercisesContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  noExercisesText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default DailyWorkoutScreen;
