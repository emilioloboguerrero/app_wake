import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import SvgPlay from '../components/icons/SvgPlay';
import SvgVolumeMax from '../components/icons/SvgVolumeMax';
import SvgVolumeOff from '../components/icons/SvgVolumeOff';
import { useVideo } from '../contexts/VideoContext';
import { useAuth } from '../contexts/AuthContext';
import tutorialManager from '../services/tutorialManager';
import TutorialOverlay from '../components/TutorialOverlay';
import warmupData from '../../assets/data/warmup_data.json';
import assetBundleService from '../services/assetBundleService';
import logger from '../utils/logger';
import { isWeb } from '../utils/platform';
const WarmupScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { course, workout, sessionId } = route.params;
  const { user } = useAuth();
  const { isMuted, toggleMute } = useVideo();
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#1a1a1a',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    content: {
      flex: 1,
      paddingTop: 0, // Reduced padding to move content higher
      paddingBottom: 20, // Normal padding
    },
    titleSection: {
      marginBottom: 0,
    },
    title: {
      fontSize: Math.min(screenWidth * 0.08, 32), // Match ProfileScreen responsive sizing
      fontWeight: '600', // Match ProfileScreen weight
      color: '#ffffff',
      textAlign: 'left',
      paddingLeft: screenWidth * 0.12, // Match ProfileScreen padding
      marginBottom: 20,
    },
    buttonContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
    },
    skipWarmupButton: {
      backgroundColor: 'transparent',
      borderRadius: Math.max(8, screenWidth * 0.02), // Responsive border radius
      paddingVertical: Math.max(8, screenHeight * 0.01), // Responsive padding
      paddingHorizontal: Math.max(16, screenWidth * 0.04), // Responsive padding
      marginTop: Math.max(8, screenHeight * 0.01), // Responsive margin
    },
    skipWarmupButtonText: {
      fontSize: Math.min(screenWidth * 0.035, 14), // Responsive font size
      fontWeight: '500',
      color: 'rgba(191, 168, 77, 0.72)',
      textAlign: 'center',
    },
    warmupContent: {
      flex: 1,
      paddingBottom: 20,
      paddingHorizontal: Math.max(24, screenWidth * 0.06), // Match ProfileScreen margins
    },
    videoCard: {
      height: Math.max(420, screenHeight * 0.54), // Slightly taller video card
      backgroundColor: '#1a1a1a',
      borderRadius: Math.max(12, screenWidth * 0.04), // Responsive border radius
      overflow: 'hidden',
      position: 'relative',
      marginBottom: Math.max(20, screenHeight * 0.025), // Responsive margin
    },
    videoContainer: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    video: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    videoPlaceholder: {
      flex: 1,
      backgroundColor: '#2A2A2A',
      justifyContent: 'center',
      alignItems: 'center',
    },
    videoPlaceholderText: {
      fontSize: 24,
      color: '#666666',
      fontWeight: '500',
    },
    restDisplay: {
      flex: 1,
      backgroundColor: '#1a1a1a',
      justifyContent: 'center',
      alignItems: 'center',
    },
    restText: {
      fontSize: Math.min(screenWidth * 0.08, 32), // Responsive font size
      color: '#ffffff',
      fontWeight: '700',
      textAlign: 'center',
    },
    videoDimmingLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    pauseOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    exerciseNameContainer: {
      position: 'absolute',
      bottom: 16,
      left: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    exerciseNameText: {
      fontSize: Math.min(screenWidth * 0.07, 28), // Responsive font size
      fontWeight: '600',
      color: '#ffffff',
    },
    timerSection: {
      paddingVertical: 0,
    },
    timerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Math.max(20, screenWidth * 0.05), // Responsive gap
    },
    circularTimer: {
      width: Math.max(160, screenWidth * 0.4), // Responsive width
      height: Math.max(160, screenWidth * 0.4), // Responsive height
      borderRadius: Math.max(80, screenWidth * 0.2), // Responsive border radius
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      shadowColor: 'rgba(255, 255, 255, 0.4)',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 2,
      elevation: 2,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#2a2a2a',
    },
    timerText: {
      fontSize: Math.min(screenWidth * 0.1, 40), // Responsive font size
      color: '#ffffff',
      fontWeight: '700',
      marginBottom: Math.max(4, screenHeight * 0.005), // Responsive margin
    },
    timerLabel: {
      fontSize: Math.min(screenWidth * 0.04, 16), // Responsive font size
      color: '#ffffff',
      fontWeight: '500',
      textAlign: 'center',
    },
    skipButton: {
      backgroundColor: 'rgba(191, 168, 77, 0.2)',
      paddingVertical: Math.max(12, screenHeight * 0.015), // Responsive padding
      paddingHorizontal: 0,
      borderRadius: Math.max(12, screenWidth * 0.04), // Responsive border radius
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
      width: Math.max(150, screenWidth * 0.375), // Responsive width
    },
    skipButtonText: {
      fontSize: Math.min(screenWidth * 0.04, 16), // Responsive font size
      fontWeight: '600',
      color: 'rgba(191, 168, 77, 1)',
      textAlign: 'center',
      numberOfLines: 1,
    },
    // Volume icon styles
    volumeIconContainer: {
      position: 'absolute',
      top: 12,
      right: 12,
      zIndex: 5,
    },
    volumeIconButton: {
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      borderRadius: 16,
      padding: 8,
      minWidth: 32,
      minHeight: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }), [screenWidth, screenHeight]);
  
  // Debug: Log the workout object received
  logger.log('🔍 WarmupScreen: Received workout object:', {
    hasWorkout: !!workout,
    hasExercises: !!workout?.exercises,
    exercisesLength: workout?.exercises?.length,
    firstExerciseHasMuscleActivation: !!workout?.exercises?.[0]?.muscle_activation,
    firstExerciseMuscleActivationKeys: workout?.exercises?.[0]?.muscle_activation ? Object.keys(workout.exercises[0].muscle_activation) : 'none',
    firstExerciseStructure: workout?.exercises?.[0] ? Object.keys(workout.exercises[0]) : 'no exercises'
  });
  
  // Timer state
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  
  // Tutorial state
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialData, setTutorialData] = useState([]);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);
  const [localVideoSource, setLocalVideoSource] = useState(null);
  
  // Timer ref to avoid recreation
  const timerRef = useRef(null);
  
  // Memoized current exercise
  const currentExercise = useMemo(() => 
    warmupData.warmup.exercises[currentExerciseIndex], 
    [currentExerciseIndex]
  );

  // Resolve current video source: prefer local bundle path (downloaded once per version),
  // fall back to bundled asset if local bundle is not available.
  const videoSource = useMemo(() => localVideoSource, [localVideoSource]);

  // Update video source whenever the current exercise changes
  useEffect(() => {
    if (!currentExercise || !currentExercise.video) {
      setLocalVideoSource(null);
      return;
    }

    const fileName = currentExercise.video; // e.g. "cardio.mp4"
    const logicalKey = fileName.replace('.mp4', ''); // e.g. "cardio"

    // Use bundled preset videos only (cloud downloads disabled)
    const fallbackMap = {
      'cardio.mp4': require('../../assets/videos/warmup/bici_preset.mp4'),
      'circulos_adelante.mp4': require('../../assets/videos/warmup/c_adelante_preset.mp4'),
      'circulos_atras.mp4': require('../../assets/videos/warmup/c_atras_preset.mp4'),
      'zancadas.mp4': require('../../assets/videos/warmup/zanca_preset.mp4'),
      'balanceo_derecha.mp4': require('../../assets/videos/warmup/p_derecha_preset.mp4'),
      'balanceo_izquierda.mp4': require('../../assets/videos/warmup/p_izq_preset.mp4'),
      // Generic fallback to avoid blanks if a new filename appears
      default: require('../../assets/videos/warmup/bici_preset.mp4'),
    };

    setLocalVideoSource(fallbackMap[fileName] || fallbackMap.default);
  }, [currentExercise]);
  
  // Video player setup - memoized callback to avoid recreation
  const videoPlayerCallback = useCallback((player) => {
    if (player) {
      player.loop = true;
      player.muted = isMuted;
      player.volume = 1.0;
      logger.log('Video player initialized with volume');
      // Don't auto-play, let the timer control it
    }
  }, [isMuted]);
  
  const videoPlayer = useVideoPlayer(videoSource, videoPlayerCallback);

  // Memoized utility functions
  const getExerciseDuration = useCallback((index) => {
    const exercise = warmupData.warmup.exercises[index];
    if (!exercise) return 0;
    
    const duration = exercise.duration;
    if (duration.includes('min')) {
      return parseInt(duration) * 60; // Convert minutes to seconds
    } else if (duration.includes('s')) {
      return parseInt(duration); // Already in seconds
    }
    return 0;
  }, []);

  const formatTime = useCallback((seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  const getFirstWord = useCallback((text) => {
    return text ? text.split(' ')[0] : '';
  }, []);

  // Debug video source
  useEffect(() => {
    logger.log('Video source changed:', videoSource);
    logger.log('Current exercise:', currentExercise);
  }, [videoSource, currentExercise]);

  // Track if component is mounted for setTimeout cleanup
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Sync video with timer state - memoized callback
  const syncVideoWithTimer = useCallback(() => {
    if (videoPlayer) {
      try {
        logger.log('Video sync - isActive:', isActive, 'isResting:', isResting);
        if (isActive && !isResting) {
          logger.log('Playing video');
          videoPlayer.play();
          // Add a small delay to ensure video starts
          const timeoutId = setTimeout(() => {
            if (isMountedRef.current) {
              logger.log('Video should be playing now');
            }
          }, 100);
          // Note: This timeout is in a callback, cleanup is handled by component unmount check
          return () => clearTimeout(timeoutId);
        } else {
          logger.log('Pausing video');
          videoPlayer.pause();
        }
      } catch (error) {
        // Video player might be invalid, ignore error
        logger.log('Video player operation error (safe to ignore):', error.message);
      }
    } else {
      logger.log('Video player not available');
    }
  }, [isActive, isResting, videoPlayer]);

  useEffect(() => {
    syncVideoWithTimer();
  }, [syncVideoWithTimer]);

  // Sync video mute state
  useEffect(() => {
    if (videoPlayer) {
      videoPlayer.muted = isMuted;
    }
  }, [isMuted, videoPlayer]);
  
  // Initialize timer with first exercise
  useEffect(() => {
    setTimeLeft(getExerciseDuration(0));
    // Don't start automatically - wait for tutorial to complete
    setIsActive(false);
    
    // Check for tutorials after warmup initializes
    checkForTutorials();
  }, [getExerciseDuration]);
  
  // Check for tutorials to show
  const checkForTutorials = async () => {
    if (!user?.uid || !course?.courseId) return;

    try {
      logger.log('🎬 Checking for warmup screen tutorials...');
      const tutorials = await tutorialManager.getTutorialsForScreen(
        user.uid, 
        'warmup',
        course.courseId  // Pass programId for program-specific tutorials
      );
      
      if (tutorials.length > 0) {
        logger.log('📚 Found tutorials to show:', tutorials.length);
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
        // Keep warmup paused while tutorial is showing
      } else {
        logger.log('✅ No tutorials to show for warmup screen');
        // No tutorials, start warmup immediately
        setIsActive(true);
      }
    } catch (error) {
      logger.error('❌ Error checking for tutorials:', error);
      // On error, start warmup anyway
      setIsActive(true);
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
          'warmup', 
          currentTutorial.videoUrl,
          course.courseId  // Pass programId for program-specific tutorials
        );
        logger.log('✅ Tutorial marked as completed');
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  };

  // Handle tutorial close - start warmup when tutorial is closed
  const handleTutorialClose = () => {
    setTutorialVisible(false);
    // Start warmup after tutorial is closed
    logger.log('🎬 Tutorial closed, starting warmup...');
    setIsActive(true);
  };
  
  // Optimized timer logic using useRef to avoid recreation
  useEffect(() => {
    if (!isActive) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    
    // Clear existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (isResting) {
            // Rest finished, go to next exercise
            setIsResting(false);
            const nextIndex = currentExerciseIndex + 1;
            if (nextIndex >= warmupData.warmup.exercises.length) {
              // All exercises done, stop timer and navigate
              setIsActive(false);
              // Use setTimeout to navigate after render cycle
              setTimeout(() => {
                // Debug: log workout implements before navigating
                logger.log('🔧 WarmupScreen navigating to WorkoutExecution with workout:', {
                  hasWorkout: !!workout,
                  hasExercises: !!workout?.exercises,
                  exercisesLength: workout?.exercises?.length,
                  firstExerciseImplements: workout?.exercises?.[0]?.implements ?? null,
                  firstExerciseHasImplements: Array.isArray(workout?.exercises?.[0]?.implements)
                    ? workout.exercises[0].implements.length
                    : 'not-array-or-missing',
                });
                navigation.navigate('WorkoutExecution', { course, workout, sessionId });
              }, 0);
              return 0;
            }
            setCurrentExerciseIndex(nextIndex);
            return getExerciseDuration(nextIndex);
          } else {
            // Exercise finished, go to rest
            setIsResting(true);
            return 10; // 10 second rest
          }
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, currentExerciseIndex, isResting, getExerciseDuration, navigation, course, workout, sessionId]);

  // Handle screen focus changes - pause video when screen loses focus
  // On web, browser handles this automatically when tab is hidden
  useEffect(() => {
    if (isWeb) {
      // On web, handle visibility change
      const handleVisibilityChange = () => {
        if (document.hidden) {
          logger.log('🛑 Warmup page hidden - pausing video and stopping warmup');
          setIsActive(false);
          try {
            if (videoPlayer) {
              videoPlayer.pause();
              videoPlayer.muted = true;
            }
          } catch (error) {
            logger.log('⚠️ Error pausing video player:', error.message);
          }
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
    // On native, this would be handled by useFocusEffect which doesn't work on web
  }, [isWeb, videoPlayer]);
  
  // Memoized event handlers
  const selectExercise = useCallback((index) => {
    setCurrentExerciseIndex(index);
    setIsResting(false);
    setTimeLeft(getExerciseDuration(index));
    setIsActive(true); // Start playing immediately when selecting new exercise
    // Don't reset state - keep the warmup started state
  }, [getExerciseDuration]);
  
  const startTimer = useCallback(() => {
    setIsActive(true);
  }, []);
  
  const skipExercise = useCallback(() => {
    if (isResting) {
      // Skip rest, go to next exercise
      setIsResting(false);
      const nextIndex = currentExerciseIndex + 1;
      if (nextIndex >= warmupData.warmup.exercises.length) {
        // All exercises done, navigate to workout execution
        setTimeout(() => {
          logger.log('🔧 WarmupScreen skipExercise navigating to WorkoutExecution with workout:', {
            hasWorkout: !!workout,
            hasExercises: !!workout?.exercises,
            exercisesLength: workout?.exercises?.length,
            firstExerciseImplements: workout?.exercises?.[0]?.implements ?? null,
            firstExerciseHasImplements: Array.isArray(workout?.exercises?.[0]?.implements)
              ? workout.exercises[0].implements.length
              : 'not-array-or-missing',
          });
          navigation.navigate('WorkoutExecution', { course, workout, sessionId });
        }, 0);
        return;
      }
      setCurrentExerciseIndex(nextIndex);
      setTimeLeft(getExerciseDuration(nextIndex));
    } else {
      // Skip current exercise, go to rest
      setIsResting(true);
      setTimeLeft(10);
    }
  }, [isResting, currentExerciseIndex, getExerciseDuration, navigation, course, workout, sessionId]);

  const finishWarmup = useCallback(() => {
    setTimeout(() => {
      logger.log('🔧 WarmupScreen finishWarmup navigating to WorkoutExecution with workout:', {
        hasWorkout: !!workout,
        hasExercises: !!workout?.exercises,
        exercisesLength: workout?.exercises?.length,
        firstExerciseImplements: workout?.exercises?.[0]?.implements ?? null,
        firstExerciseHasImplements: Array.isArray(workout?.exercises?.[0]?.implements)
          ? workout.exercises[0].implements.length
          : 'not-array-or-missing',
      });
      navigation.navigate('WorkoutExecution', { course, workout, sessionId });
    }, 0);
  }, [navigation, course, workout, sessionId]);

  const skipEntireWarmup = useCallback(() => {
    // Stop all warmup processes
    setIsActive(false); // Stop timer
    if (videoPlayer) {
      try {
        videoPlayer.pause(); // Stop video
      } catch (error) {
        // Video player might be invalid, ignore error
        logger.log('Video player pause error (safe to ignore):', error.message);
      }
    }
    
    // Navigate immediately to workout execution
    logger.log('🔧 WarmupScreen skipEntireWarmup navigating to WorkoutExecution with workout:', {
      hasWorkout: !!workout,
      hasExercises: !!workout?.exercises,
      exercisesLength: workout?.exercises?.length,
      firstExerciseImplements: workout?.exercises?.[0]?.implements ?? null,
      firstExerciseHasImplements: Array.isArray(workout?.exercises?.[0]?.implements)
        ? workout.exercises[0].implements.length
        : 'not-array-or-missing',
    });
    navigation.navigate('WorkoutExecution', { course, workout, sessionId });
  }, [videoPlayer, navigation, course, workout, sessionId]);

  const togglePause = useCallback(() => {
    setIsActive(!isActive);
  }, [isActive]);

  // Memoized computed values
  const isLastExerciseFinished = useMemo(() => {
    return currentExerciseIndex >= warmupData.warmup.exercises.length - 1 && 
           isResting && 
           timeLeft <= 0;
  }, [currentExerciseIndex, isResting, timeLeft]);

  const buttonText = useMemo(() => {
    if (isLastExerciseFinished) {
      return 'Terminar';
    }
    if (isActive) {
      return 'Saltar';
    }
    return 'Continuar';
  }, [isLastExerciseFinished, isActive]);

  const buttonAction = useMemo(() => {
    if (isLastExerciseFinished) {
      return finishWarmup;
    }
    return isActive ? skipExercise : startTimer;
  }, [isLastExerciseFinished, isActive, finishWarmup, skipExercise, startTimer]);

  const handleButtonPress = useCallback(() => {
    buttonAction();
  }, [buttonAction]);

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      {/* Fixed Header with Back Button */}
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <WakeHeaderContent style={styles.content}>
          {/* Spacer for fixed header */}
          <WakeHeaderSpacer />

          {/* Title Section */}
          <View style={styles.titleSection}>
          <Text style={styles.title}>Calentamiento</Text>
        </View>
        
        {/* Warmup Content Area */}
        <View style={styles.warmupContent}>
          {/* Single Large Video Card */}
          <View style={styles.videoCard}>
            {/* Video component or Rest display */}
            {isResting ? (
              <View style={styles.restDisplay}>
                <Text style={styles.restText}>Descanso</Text>
              </View>
            ) : videoSource ? (
              <TouchableOpacity 
                style={styles.videoContainer}
                onPress={togglePause}
                activeOpacity={1}
              >
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
                {!isActive && (
                  <View style={styles.videoDimmingLayer} pointerEvents="none" />
                )}
                {!isActive && (
                  <View style={styles.pauseOverlay}>
                    <SvgPlay width={48} height={48} />
                  </View>
                )}
                {!isActive && (
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
              </TouchableOpacity>
            ) : (
              <View style={styles.videoPlaceholder}>
                <Text style={styles.videoPlaceholderText}>Video no disponible</Text>
              </View>
            )}
            
            {/* Exercise name in bottom left corner - only show during exercises */}
            {!isResting && (
              <View style={styles.exerciseNameContainer}>
                <Text style={styles.exerciseNameText}>
                  {currentExercise?.name}
                </Text>
              </View>
            )}
          </View>
          
          {/* Timer Section - positioned below video card */}
          <View style={styles.timerSection}>
            <View style={styles.timerContainer}>
              <TouchableOpacity style={styles.circularTimer} onPress={togglePause}>
                <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
                <Text style={styles.timerLabel}>
                  {!isActive ? 'Pausa' : (isResting ? 'Descanso' : getFirstWord(currentExercise?.name || ''))}
                </Text>
              </TouchableOpacity>
              
              <View style={styles.buttonContainer}>
                <TouchableOpacity 
                  style={styles.skipButton}
                  onPress={handleButtonPress}
                >
                  <Text style={styles.skipButtonText}>
                    {buttonText}
                  </Text>
                </TouchableOpacity>
                
                {/* Skip Warmup Button - Centered under main button */}
                <TouchableOpacity 
                  style={styles.skipWarmupButton}
                  onPress={skipEntireWarmup}
                >
                  <Text style={styles.skipWarmupButtonText}>Omitir Calentamiento</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </WakeHeaderContent>
      </ScrollView>

      {/* Tutorial Overlay */}
      <TutorialOverlay
        visible={tutorialVisible}
        tutorialData={tutorialData}
        onClose={handleTutorialClose}
        onComplete={handleTutorialComplete}
      />
    </SafeAreaView>
  );
};

export default WarmupScreen;
