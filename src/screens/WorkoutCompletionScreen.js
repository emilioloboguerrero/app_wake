import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
  Modal,
  Image,
  Pressable,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import tutorialManager from '../services/tutorialManager';
import TutorialOverlay from '../components/TutorialOverlay';
import completionPhrases from '../../assets/data/completionPhrases.json';
import hybridDataService from '../services/hybridDataService';
import logger from '../utils/logger.js';
import SvgChampion from '../components/icons/SvgChampion';
import WeeklyMuscleVolumeCard from '../components/WeeklyMuscleVolumeCard';
import MuscleSilhouette from '../components/MuscleSilhouette';
import MuscleSilhouetteSVG from '../components/MuscleSilhouetteSVG';
import { shouldTrackMuscleVolume } from '../constants/muscles';
import { getMondayWeek } from '../utils/weekCalculation';
import { doc, getDoc } from 'firebase/firestore';
import { firestore, auth } from '../config/firebase';
import muscleVolumeInfoService from '../services/muscleVolumeInfoService';
import SvgShareIOsExport from '../components/icons/vectors_fig/Communication/ShareIOsExport';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import oneRepMaxService from '../services/oneRepMaxService';

const WorkoutCompletionScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { course, workout, sessionData, localStats, personalRecords, sessionMuscleVolumes } = route.params || {};
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [completionStats, setCompletionStats] = useState(null);
  const [randomPhrase, setRandomPhrase] = useState('');
  const [weeklyMuscleVolumes, setWeeklyMuscleVolumes] = useState(null);
  const [lastWeekMuscleVolumes, setLastWeekMuscleVolumes] = useState(null);
  
  // Muscle volume info modal state
  const [isMuscleVolumeInfoModalVisible, setIsMuscleVolumeInfoModalVisible] = useState(false);
  const [selectedMuscleVolumeInfo, setSelectedMuscleVolumeInfo] = useState(null);
  
  // Scroll tracking for pagination indicator
  const scrollX = useRef(new Animated.Value(0)).current;
  
  logger.log('WorkoutCompletionScreen: Received', personalRecords?.length || 0, 'personal records');
  logger.log('Personal records data:', personalRecords);
  logger.log('WorkoutCompletionScreen: Received session muscle volumes:', sessionMuscleVolumes);
  
  // Tutorial state
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialData, setTutorialData] = useState([]);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);
  
  // Share modal state
  const [isShareModalVisible, setIsShareModalVisible] = useState(false);
  const shareScrollX = useRef(new Animated.Value(0)).current;
  const shareOption1Ref = useRef(null);
  const shareOption2Ref = useRef(null);
  const [isSharing, setIsSharing] = useState(false);
  const [currentShareCardIndex, setCurrentShareCardIndex] = useState(0);
  const [fullscreenCardIndex, setFullscreenCardIndex] = useState(null);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [username, setUsername] = useState('');
  
  // Scroll handler for pagination indicator
  const onMuscleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }
  );
  
  // Scroll handler for share modal carousel
  const onShareScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: shareScrollX } } }],
    { 
      useNativeDriver: false,
      listener: (event) => {
        const cardWidth = screenWidth - Math.max(80, screenWidth * 0.2) + 15;
        const scrollX = event.nativeEvent.contentOffset.x;
        const index = Math.round(scrollX / cardWidth);
        setCurrentShareCardIndex(index);
      }
    }
  );

  // Muscle volume info modal handlers
  const handleMuscleVolumeInfoPress = (metricKey) => {
    const info = muscleVolumeInfoService.getMuscleVolumeInfo(metricKey);
    if (info) {
      setSelectedMuscleVolumeInfo(info);
      setIsMuscleVolumeInfoModalVisible(true);
    }
  };

  const handleCloseMuscleVolumeInfoModal = () => {
    setIsMuscleVolumeInfoModalVisible(false);
    setSelectedMuscleVolumeInfo(null);
  };

  // Get random phrase from completion phrases
  const getRandomPhrase = () => {
    const randomIndex = Math.floor(Math.random() * completionPhrases.phrases.length);
    return completionPhrases.phrases[randomIndex];
  };

  // Get discipline-specific metric(s) - SIMPLIFIED
  const getDisciplineMetrics = (discipline, stats) => {
    logger.log('🔍 getDisciplineMetrics called with:', { discipline, stats });
    
    // Calculate volume from exercises if available
    const calculateVolume = () => {
      if (!stats?.exercises) return 0;
      
      logger.log('🔍 Exercise data for volume calculation:', stats.exercises);
      
      let totalVolume = 0;
      stats.exercises.forEach((exercise, exerciseIndex) => {
        logger.log(`🔍 Exercise ${exerciseIndex}:`, exercise);
        if (exercise.sets) {
          exercise.sets.forEach((set, setIndex) => {
            logger.log(`🔍 Set ${setIndex}:`, set);
            const weight = parseFloat(set.weight) || 0;
            const reps = parseInt(set.reps) || 0;
            const setVolume = weight * reps;
            logger.log(`🔍 Set volume: ${weight} × ${reps} = ${setVolume}`);
            totalVolume += setVolume;
          });
        }
      });
      
      logger.log('🔍 Total calculated volume:', totalVolume);
      return totalVolume;
    };
    
    // Simple mapping based on discipline name
    if (discipline && discipline.toLowerCase().includes('fuerza')) {
      // Volume metric removed - now handled by muscle volume cards above
      return [];
    }
    
    if (discipline && discipline.toLowerCase().includes('running')) {
      return [{ 
        metric: 'avgPace', 
        label: 'Ritmo Promedio', 
        unit: 'min/km',
        value: stats.avgPace || 0
      }];
    }
    
    if (discipline && discipline.toLowerCase().includes('hyrox')) {
      return [{ 
        metric: 'avgPace', 
        label: 'Ritmo Promedio', 
        unit: 'min/km',
        value: stats.avgPace || 0
      }];
    }
    
    if (discipline && discipline.toLowerCase().includes('hybrid')) {
      return [
        { 
          metric: 'avgPace', 
          label: 'Ritmo Promedio', 
          unit: 'min/km',
          value: stats.avgPace || 0
        }
      ];
    }
    
    logger.log('⚠️ No metrics found for discipline:', discipline);
    return [];
  };

  useEffect(() => {
    // Set random phrase when component mounts
    setRandomPhrase(getRandomPhrase());
    initializeCompletionScreen();
    
    // Get user from useAuth hook, fallback to Firebase auth.currentUser if needed
    const currentUser = user || auth.currentUser;
    
    logger.log('🔍 WorkoutCompletionScreen useEffect - User check:', {
      userFromHook: !!user,
      userUidFromHook: user?.uid,
      firebaseCurrentUser: !!auth.currentUser,
      firebaseCurrentUserUid: auth.currentUser?.uid,
      currentUserToUse: !!currentUser,
      currentUserUid: currentUser?.uid,
      courseDiscipline: course?.discipline,
      shouldTrackVolume: shouldTrackMuscleVolume(course?.discipline),
      hasSessionMuscleVolumes: !!sessionMuscleVolumes,
      sessionMuscleVolumesKeys: sessionMuscleVolumes ? Object.keys(sessionMuscleVolumes) : []
    });
    
    // Fetch weekly muscle volumes if discipline supports it
    if (shouldTrackMuscleVolume(course?.discipline) && currentUser?.uid) {
      logger.log('📊 Fetching weekly muscle volumes...');
      fetchWeeklyMuscleVolumes();
    } else {
      logger.log('⚠️ Skipping weekly muscle volumes fetch:', {
        shouldTrack: shouldTrackMuscleVolume(course?.discipline),
        hasUser: !!currentUser?.uid
      });
    }
    
    // Fetch user display name
    if (currentUser?.uid) {
      fetchUserDisplayName();
    }
  }, []);
  
  const fetchUserDisplayName = async () => {
    try {
      const userDocRef = doc(firestore, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserDisplayName(data.displayName || '');
        setUsername(data.username || data.displayName || '');
      }
    } catch (error) {
      logger.error('Error fetching user display name:', error);
    }
  };
  
  const fetchWeeklyMuscleVolumes = async () => {
    try {
      // Get user from useAuth hook, fallback to Firebase auth.currentUser if needed
      const currentUser = user || auth.currentUser;
      if (!currentUser?.uid) {
        logger.error('❌ Cannot fetch weekly muscle volumes - no user available');
        setWeeklyMuscleVolumes({});
        setLastWeekMuscleVolumes({});
        return;
      }
      
      const currentWeek = getMondayWeek();
      logger.log('📊 Fetching weekly muscle volumes for user:', currentUser.uid, 'week:', currentWeek);
      const userDocRef = doc(firestore, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const weekData = data.weeklyMuscleVolume?.[currentWeek] || {};
        setWeeklyMuscleVolumes(weekData);
        logger.log('✅ Weekly muscle volumes fetched for completion screen:', weekData);
        
        // Derive last week volumes by inspecting all weeks and picking the entry prior to current
        const allWeeks = data.weeklyMuscleVolume ? Object.keys(data.weeklyMuscleVolume) : [];
        if (allWeeks.length > 0) {
          // Sort keys consistently; keys are date-like strings, string sort works for YYYY-MM-DD formats
          const sorted = allWeeks.slice().sort();
          const currentIndex = sorted.indexOf(currentWeek);
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : (currentIndex === -1 && sorted.length >= 2 ? sorted.length - 2 : -1);
          if (prevIndex >= 0) {
            const prevKey = sorted[prevIndex];
            const prevWeekData = data.weeklyMuscleVolume?.[prevKey] || {};
            setLastWeekMuscleVolumes(prevWeekData);
            logger.log('📆 Last week muscle volumes fetched for comparison:', prevKey, prevWeekData);
          } else {
            setLastWeekMuscleVolumes({});
          }
        } else {
          setLastWeekMuscleVolumes({});
        }
      } else {
        setWeeklyMuscleVolumes({});
        setLastWeekMuscleVolumes({});
      }
    } catch (error) {
      logger.error('❌ Error fetching weekly muscle volumes:', error);
      setWeeklyMuscleVolumes({});
      setLastWeekMuscleVolumes({});
    }
  };

  // Check for tutorials to show
  const checkForTutorials = async () => {
    if (!user?.uid || !course?.courseId) return;

    try {
      logger.log('🎬 Checking for workout completion screen tutorials...');
      const tutorials = await tutorialManager.getTutorialsForScreen(
        user.uid, 
        'workoutCompletion',
        course.courseId  // Pass programId for program-specific tutorials
      );
      
      if (tutorials.length > 0) {
        logger.log('📚 Found tutorials to show:', tutorials.length);
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
      } else {
        logger.log('✅ No tutorials to show for workout completion screen');
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
          'workoutCompletion', 
          currentTutorial.videoUrl,
          course.courseId  // Pass programId for program-specific tutorials
        );
        logger.log('✅ Tutorial marked as completed');
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  };

  const initializeCompletionScreen = async () => {
    try {
      setLoading(true);
      
      logger.log('📊 Initializing completion screen with params:', { 
        course: course?.courseId, 
        workout: workout?.id, 
        hasSessionData: !!sessionData,
        hasLocalStats: !!localStats 
      });
      
      logger.log('📊 Course discipline:', course?.discipline);
      logger.log('📊 Course object keys:', Object.keys(course || {}));
      logger.log('📊 Course object:', course);
      logger.log('📊 Local stats:', localStats);
      
      if (sessionData && localStats) {
        logger.log('📊 Using passed session data:', sessionData.sessionId);
        logger.log('📊 Using passed local stats:', localStats);
        
        // SIMPLE: Just use course.discipline directly
        let discipline = course?.discipline;
        
        // If discipline is not in course object, try to get it from course metadata
        if (!discipline && course?.courseId) {
          try {
            const courses = await hybridDataService.loadCourses();
            const courseMeta = courses.find(c => c.id === course.courseId);
            discipline = courseMeta?.discipline;
            logger.log('📊 Discipline from metadata:', discipline);
          } catch (error) {
            logger.log('❌ Error loading course metadata:', error);
          }
        }
        
        logger.log('📊 Final discipline:', discipline);
        
        const statsWithDiscipline = {
          ...localStats,
          discipline: discipline
        };
        
        logger.log('📊 Stats with discipline:', statsWithDiscipline);
        setCompletionStats(statsWithDiscipline);
      } else {
        logger.log('❌ No session data or local stats provided');
        setCompletionStats({ error: 'No session data available' });
      }
      
      // Check for tutorials after stats are loaded
      await checkForTutorials();
      
    } catch (error) {
      logger.error('❌ Error initializing completion screen:', error);
      setCompletionStats({ error: 'Failed to load session data' });
    } finally {
      setLoading(false);
    }
  };

  const calculateDisciplineStats = (session, discipline) => {
    if (!session?.exercises || session.exercises.length === 0) {
      return { error: 'No workout data available' };
    }

    const baseStats = {
      totalSets: session.summary?.total_sets || 0,
      totalExercises: session.summary?.total_exercises || 0,
      duration: session.duration_minutes || 0,
      completedAt: session.completed_at
    };

    // Discipline-specific calculations
    switch (discipline?.toLowerCase()) {
      case 'fuerza e hipertrofia':
      case 'fuerza':
      case 'hipertrofia':
        return calculateStrengthStats(session.exercises, baseStats);
      
      case 'running':
      case 'cardio':
        return calculateCardioStats(session.exercises, baseStats);
      
      case 'natación':
      case 'swimming':
        return calculateSwimmingStats(session.exercises, baseStats);
      
      case 'ciclismo':
      case 'cycling':
        return calculateCyclingStats(session.exercises, baseStats);
      
      default:
        return calculateGenericStats(session.exercises, baseStats);
    }
  };

  const calculateStrengthStats = (exercises, baseStats) => {
    let totalVolume = 0;
    let totalReps = 0;
    let maxWeight = 0;
    let totalWeight = 0;
    const exerciseVolumes = {};

    exercises.forEach(exercise => {
      const exerciseName = exercise.exercise_name || 'Unknown Exercise';
      let exerciseVolume = 0;
      
      exercise.sets.forEach(set => {
        const reps = set.performance?.reps || 0;
        const weight = set.performance?.weight || set.performance?.weight_kg || 0;
        
        if (reps > 0 && weight > 0) {
          const volume = reps * weight;
          totalVolume += volume;
          totalReps += reps;
          totalWeight += weight;
          maxWeight = Math.max(maxWeight, weight);
          exerciseVolume += volume;
        }
      });
      
      if (exerciseVolume > 0) {
        exerciseVolumes[exerciseName] = exerciseVolume;
      }
    });

    return {
      ...baseStats,
      discipline: 'Fuerza e Hipertrofia',
      stats: {
        totalVolume: Math.round(totalVolume),
        totalReps,
        averageWeight: totalReps > 0 ? Math.round(totalWeight / totalReps) : 0,
        maxWeight,
        exerciseVolumes: Object.entries(exerciseVolumes)
          .map(([name, volume]) => ({ name, volume }))
          .sort((a, b) => b.volume - a.volume)
      }
    };
  };

  const calculateCardioStats = (exercises, baseStats) => {
    let totalDistance = 0;
    let totalTime = 0;
    let averagePace = 0;
    let maxHeartRate = 0;
    let totalCalories = 0;

    exercises.forEach(exercise => {
      exercise.sets.forEach(set => {
        const distance = set.performance?.distance || 0;
        const time = set.performance?.time || set.performance?.time_seconds || 0;
        const pace = set.performance?.pace || 0;
        const heartRate = set.performance?.heart_rate || 0;
        const calories = set.performance?.calories || 0;
        
        totalDistance += distance;
        totalTime += time;
        totalCalories += calories;
        maxHeartRate = Math.max(maxHeartRate, heartRate);
        
        if (pace > 0) {
          averagePace = averagePace === 0 ? pace : (averagePace + pace) / 2;
        }
      });
    });

    return {
      ...baseStats,
      discipline: 'Running/Cardio',
      stats: {
        totalDistance: Math.round(totalDistance * 100) / 100,
        totalTime: Math.round(totalTime),
        averagePace: Math.round(averagePace * 100) / 100,
        maxHeartRate,
        totalCalories
      }
    };
  };

  const calculateSwimmingStats = (exercises, baseStats) => {
    let totalDistance = 0;
    let totalTime = 0;
    let totalLaps = 0;
    let averagePace = 0;

    exercises.forEach(exercise => {
      exercise.sets.forEach(set => {
        const distance = set.performance?.distance || 0;
        const time = set.performance?.time || set.performance?.time_seconds || 0;
        const pace = set.performance?.pace || 0;
        const laps = set.performance?.laps || 0;
        
        totalDistance += distance;
        totalTime += time;
        totalLaps += laps;
        
        if (pace > 0) {
          averagePace = averagePace === 0 ? pace : (averagePace + pace) / 2;
        }
      });
    });

    return {
      ...baseStats,
      discipline: 'Natación',
      stats: {
        totalDistance: Math.round(totalDistance * 100) / 100,
        totalTime: Math.round(totalTime),
        totalLaps,
        averagePace: Math.round(averagePace * 100) / 100
      }
    };
  };

  const calculateCyclingStats = (exercises, baseStats) => {
    let totalDistance = 0;
    let totalTime = 0;
    let averageSpeed = 0;
    let maxSpeed = 0;
    let totalCalories = 0;

    exercises.forEach(exercise => {
      exercise.sets.forEach(set => {
        const distance = set.performance?.distance || 0;
        const time = set.performance?.time || set.performance?.time_seconds || 0;
        const speed = set.performance?.speed || 0;
        const calories = set.performance?.calories || 0;
        
        totalDistance += distance;
        totalTime += time;
        totalCalories += calories;
        maxSpeed = Math.max(maxSpeed, speed);
        
        if (speed > 0) {
          averageSpeed = averageSpeed === 0 ? speed : (averageSpeed + speed) / 2;
        }
      });
    });

    return {
      ...baseStats,
      discipline: 'Ciclismo',
      stats: {
        totalDistance: Math.round(totalDistance * 100) / 100,
        totalTime: Math.round(totalTime),
        averageSpeed: Math.round(averageSpeed * 100) / 100,
        maxSpeed,
        totalCalories
      }
    };
  };

  const calculateGenericStats = (exercises, baseStats) => {
    let totalReps = 0;
    let totalTime = 0;
    let totalCalories = 0;

    exercises.forEach(exercise => {
      exercise.sets.forEach(set => {
        const reps = set.performance?.reps || 0;
        const time = set.performance?.time || set.performance?.time_seconds || 0;
        const calories = set.performance?.calories || 0;
        
        totalReps += reps;
        totalTime += time;
        totalCalories += calories;
      });
    });

    return {
      ...baseStats,
      discipline: 'General',
      stats: {
        totalReps,
        totalTime: Math.round(totalTime),
        totalCalories
      }
    };
  };

  const handleFinishWorkout = () => {
    // Simply navigate to main screen - session completion is handled by workout screen
    navigation.navigate('MainScreen');
  };

  const handleSharePress = () => {
    setCurrentShareCardIndex(0); // Reset to first card when opening modal
    setIsShareModalVisible(true);
  };

  const handleShareCard = async () => {
    try {
      setIsSharing(true);
      
      // Get the ref for the current card based on tracked index
      const currentCardRef = currentShareCardIndex === 0 ? shareOption1Ref : shareOption2Ref;
      
      if (!currentCardRef.current) {
        logger.error('Card ref not available');
        setIsSharing(false);
        return;
      }
      
      // Capture the card as an image
      const uri = await currentCardRef.current.capture();
      logger.log('Card captured:', uri);
      
      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        logger.error('Sharing is not available on this device');
        setIsSharing(false);
        return;
      }
      
      // Share the image using native share sheet
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Compartir sesión',
      });
      
      logger.log('Image shared successfully');
    } catch (error) {
      logger.error('Error sharing card:', error);
    } finally {
      setIsSharing(false);
    }
  };

  // Create styles with dimensions - memoized to prevent recalculation on every render
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#1a1a1a',
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 24,
      paddingBottom: 40,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      color: '#cccccc',
      fontSize: 16,
      fontWeight: '400',
      marginTop: 12,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    errorText: {
      color: '#ff4444',
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
      marginBottom: 20,
    },
    header: {
      alignItems: 'center',
      marginBottom: 32,
    },
    randomPhrase: {
      fontSize: 28,
      fontWeight: '600',
      color: '#ffffff',
      textAlign: 'center',
      marginBottom: 16,
    },
    exerciseVolumeCard: {
      backgroundColor: '#2a2a2a',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    exerciseVolumeName: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 8,
    },
    exerciseVolumeValue: {
      color: '#bfa84d',
      fontSize: 20,
      fontWeight: '700',
    },
    shareButton: {
      backgroundColor: 'rgba(191, 168, 77, 0.2)',
      paddingHorizontal: Math.max(18, screenWidth * 0.04),
      height: Math.max(50, screenHeight * 0.06),
      borderRadius: Math.max(12, screenWidth * 0.04),
      alignItems: 'center',
      justifyContent: 'center',
    },
    finishButton: {
      backgroundColor: 'rgba(191, 168, 77, 0.2)',
      height: Math.max(50, screenHeight * 0.06), // Match WorkoutExecutionScreen endWorkoutButton
      width: Math.max(280, screenWidth * 0.7), // Match WorkoutExecutionScreen endWorkoutButton width
      borderRadius: Math.max(12, screenWidth * 0.04), // Match WorkoutExecutionScreen
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center', // Match WorkoutExecutionScreen
      marginTop: Math.max(24, screenHeight * 0.03), // Match WorkoutExecutionScreen
      marginBottom: Math.max(20, screenHeight * 0.025), // Match WorkoutExecutionScreen
    },
    finishButtonText: {
      color: '#bfa84d',
      fontSize: Math.min(screenWidth * 0.045, 18),
      fontWeight: '600',
    },
    shareButtonText: {
      color: '#bfa84d',
      fontSize: Math.min(screenWidth * 0.045, 18),
      fontWeight: '600',
    },
    muscleCardsScrollContainer: {
      paddingHorizontal: Math.max(20, screenWidth * 0.05),
      gap: 0,
      overflow: 'visible',
    },
    muscleCardFirst: {
      // Card width = screenWidth - (container padding on both sides)
      // containerPadding = Math.max(20, screenWidth * 0.05) * 2
      width: screenWidth - (Math.max(20, screenWidth * 0.05) * 2),
      marginRight: 15, // Space between cards
      overflow: 'visible',
    },
    muscleCardSecond: {
      // Card width = screenWidth - (container padding on both sides)
      // containerPadding = Math.max(20, screenWidth * 0.05) * 2
      width: screenWidth - (Math.max(20, screenWidth * 0.05) * 2),
      overflow: 'visible',
    },
    paginationContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Math.max(16, screenHeight * 0.02),
      marginBottom: Math.max(8, screenHeight * 0.01),
      gap: 0, // Remove gap - spacing handled by marginHorizontal on dots
    },
    paginationDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#ffffff',
    },
    paginationDotActive: {
      width: 24,
      backgroundColor: '#bfa84d',
    },
    muscleVolumeInfoModalContent: {
      backgroundColor: '#2a2a2a',
      borderRadius: Math.max(12, screenWidth * 0.04),
      width: Math.max(350, screenWidth * 0.9),
      maxWidth: 400,
      height: Math.max(500, screenHeight * 0.7),
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.1)',
      overflow: 'hidden',
    },
    muscleVolumeInfoScrollView: {
      flex: 1,
      paddingHorizontal: Math.max(24, screenWidth * 0.06),
    },
    muscleVolumeInfoModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    muscleVolumeInfoModalTitle: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.055, 22),
      fontWeight: '600',
      flex: 1,
      textAlign: 'left',
      paddingLeft: Math.max(25, screenWidth * 0.06),
      paddingTop: Math.max(25, screenHeight * 0.03),
    },
    muscleVolumeInfoCloseButton: {
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
    muscleVolumeInfoCloseButtonText: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.04, 16),
      fontWeight: '600',
    },
    muscleVolumeInfoModalDescription: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.04, 16),
      fontWeight: '400',
      lineHeight: Math.max(24, screenHeight * 0.03),
      opacity: 0.9,
      marginBottom: Math.max(20, screenHeight * 0.025),
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
      marginBottom: Math.max(12, screenHeight * 0.015),
    },
    disclaimerContainer: {
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
    },
    shareModalContainer: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
    },
    shareModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Math.max(24, screenWidth * 0.06),
      paddingTop: Math.max(20, screenHeight * 0.025),
      paddingBottom: Math.max(16, screenHeight * 0.02),
    },
    shareModalTitle: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.055, 22),
      fontWeight: '600',
      flex: 1,
    },
    shareModalCloseButton: {
      width: Math.max(30, screenWidth * 0.075),
      height: Math.max(30, screenWidth * 0.075),
      borderRadius: Math.max(15, screenWidth * 0.037),
      backgroundColor: '#44454B',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: Math.max(12, screenWidth * 0.03),
    },
    shareModalCloseButtonText: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.04, 16),
      fontWeight: '600',
    },
    shareCarouselContainer: {
      flex: 1,
      overflow: 'visible',
    },
    shareCarouselContent: {
      paddingHorizontal: Math.max(40, screenWidth * 0.1),
      gap: 0,
      overflow: 'visible',
    },
    shareOptionCard: {
      width: screenWidth - Math.max(80, screenWidth * 0.2), // Account for container padding - smaller cards
      marginRight: 8, // Space between cards - reduced for closer spacing
      backgroundColor: '#1a1a1a',
      borderRadius: Math.max(12, screenWidth * 0.04),
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      shadowColor: 'rgba(255, 255, 255, 0.4)',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    shareCardTopLeft: {
      position: 'absolute',
      top: Math.max(20, screenHeight * 0.025),
      left: Math.max(20, screenWidth * 0.05),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    shareCardLogo: {
      width: Math.min(screenWidth * 0.15, 60),
      height: Math.min(screenWidth * 0.15, 60),
    },
    shareCardUsername: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.035, 14),
      fontWeight: '500',
      opacity: 0.7,
    },
    shareCardSessionName: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.045, 18),
      fontWeight: '600',
    },
    shareCardProgramName: {
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: Math.min(screenWidth * 0.04, 16),
      fontWeight: '400',
    },
    shareCardDate: {
      color: 'rgba(255, 255, 255, 0.5)',
      fontSize: Math.min(screenWidth * 0.03, 12),
      fontWeight: '400',
    },
    shareCardMuscleWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
    },
    shareCardMuscleBackground: {
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
      borderRadius: Math.max(20, screenWidth * 0.05),
      padding: Math.max(20, screenWidth * 0.05),
      alignItems: 'center',
      justifyContent: 'center',
      width: Math.min(screenWidth * 0.75, 400),
      height: 360,
    },
    shareCardBottomLeft: {
      position: 'absolute',
      bottom: Math.max(40, screenHeight * 0.05),
      left: Math.max(20, screenWidth * 0.05),
      alignItems: 'flex-start',
    },
    shareCardSetsNumber: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.15, 60),
      fontWeight: '700',
      lineHeight: Math.min(screenWidth * 0.15, 60),
    },
    shareCardSetsLabel: {
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: Math.min(screenWidth * 0.035, 14),
      fontWeight: '500',
      marginTop: 4,
    },
    shareCardBottomRight: {
      position: 'absolute',
      bottom: Math.max(40, screenHeight * 0.05),
      right: Math.max(20, screenWidth * 0.05),
      alignItems: 'flex-end',
      justifyContent: 'center',
      height: Math.min(screenWidth * 0.15, 60) + Math.min(screenWidth * 0.035, 14) + 4,
    },
    shareOptionText: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.05, 20),
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 20,
    },
    shareOptionComingSoon: {
      color: 'rgba(255, 255, 255, 0.6)',
      fontSize: Math.min(screenWidth * 0.06, 24),
      fontWeight: '500',
    },
    cardFullscreenButton: {
      position: 'absolute',
      top: Math.max(20, screenHeight * 0.025),
      right: Math.max(20, screenWidth * 0.05),
      width: Math.max(40, screenWidth * 0.1),
      height: Math.max(40, screenWidth * 0.1),
      borderRadius: Math.max(20, screenWidth * 0.05),
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    shareModalButtonsContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Math.max(24, screenWidth * 0.06),
      paddingBottom: 0,
      paddingTop: 10,
      marginTop: 0,
    },
    shareModalButton: {
      backgroundColor: 'rgba(191, 168, 77, 0.2)',
      height: Math.max(50, screenHeight * 0.06),
      paddingHorizontal: Math.max(32, screenWidth * 0.08),
      borderRadius: Math.max(12, screenWidth * 0.04),
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      minWidth: Math.max(200, screenWidth * 0.5),
    },
    shareModalButtonDisabled: {
      opacity: 0.5,
    },
    shareModalButtonText: {
      color: '#bfa84d',
      fontSize: Math.min(screenWidth * 0.045, 18),
      fontWeight: '600',
    },
    fullscreenContainer: {
      flex: 1,
      backgroundColor: '#000000',
      justifyContent: 'center',
      alignItems: 'center',
    },
    fullscreenTopLeft: {
      position: 'absolute',
      top: Math.max(80, screenHeight * 0.1),
      left: Math.max(40, screenWidth * 0.08),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    fullscreenSessionName: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.055, 22),
      fontWeight: '600',
    },
    fullscreenProgramName: {
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: Math.min(screenWidth * 0.05, 20),
      fontWeight: '400',
    },
    fullscreenDate: {
      color: 'rgba(255, 255, 255, 0.5)',
      fontSize: Math.min(screenWidth * 0.035, 14),
      fontWeight: '400',
    },
    fullscreenMuscleWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
    },
    fullscreenMuscleBackground: {
      backgroundColor: 'rgba(0, 0, 0, 0.4)', // Lighter overlay to match regular view brightness
      borderRadius: Math.max(20, screenWidth * 0.05),
      padding: Math.max(20, screenWidth * 0.05),
      alignItems: 'center',
      justifyContent: 'center',
      width: Math.min(screenWidth * 0.85, 500),
      height: 420,
    },
    fullscreenBottomLeft: {
      position: 'absolute',
      bottom: Math.max(60, screenHeight * 0.07),
      left: Math.max(40, screenWidth * 0.08),
      alignItems: 'flex-start',
    },
    fullscreenSetsNumber: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.18, 72),
      fontWeight: '700',
      lineHeight: Math.min(screenWidth * 0.18, 72),
    },
    fullscreenSetsLabel: {
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: Math.min(screenWidth * 0.04, 16),
      fontWeight: '500',
      marginTop: 8,
    },
    fullscreenBottomRight: {
      position: 'absolute',
      bottom: Math.max(60, screenHeight * 0.07),
      right: Math.max(40, screenWidth * 0.08),
      alignItems: 'flex-end',
      justifyContent: 'center',
      height: Math.min(screenWidth * 0.18, 72) + Math.min(screenWidth * 0.04, 16) + 8, // Match height of sets number + label + margin
    },
    fullscreenLogo: {
      width: Math.min(screenWidth * 0.2, 80),
      height: Math.min(screenWidth * 0.2, 80),
    },
    top3RMContainer: {
      alignItems: 'flex-end',
    },
    top3RMExercise: {
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: Math.min(screenWidth * 0.035, 14),
      fontWeight: '400',
      textAlign: 'right',
      marginTop: 4,
    },
    top3RMValue: {
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: Math.min(screenWidth * 0.05, 20),
      fontWeight: '400',
    },
    fullscreenUsername: {
      color: '#ffffff',
      fontSize: Math.min(screenWidth * 0.04, 16),
      fontWeight: '500',
      opacity: 0.7,
    },
    // Muscle Volume Section Wrapper - breaks out of content padding
    muscleVolumeSectionWrapper: {
      marginHorizontal: -24, // Break out of content padding
      marginBottom: Math.max(8, screenHeight * 0.01),
      marginTop: Math.max(8, screenHeight * 0.01),
      overflow: 'visible',
    },
    muscleVolumeSection: {
      overflow: 'visible',
    },
    // Actions Row for buttons
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      paddingHorizontal: Math.max(24, screenWidth * 0.06),
    },
  }), [screenWidth, screenHeight]);

  const renderExerciseVolumeCard = (exercise) => (
    <View style={styles.exerciseVolumeCard}>
      <Text style={styles.exerciseVolumeName}>{exercise.name}</Text>
      <Text style={styles.exerciseVolumeValue}>
        {exercise.volume} kg
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <FixedWakeHeader />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Calculando estadísticas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!completionStats || completionStats.error) {
    return (
      <SafeAreaView style={styles.container}>
        <FixedWakeHeader />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No se pudieron calcular las estadísticas</Text>
          <TouchableOpacity style={styles.finishButton} onPress={handleFinishWorkout}>
            <Text style={styles.finishButtonText}>Finalizar Entrenamiento</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FixedWakeHeader />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <WakeHeaderContent style={styles.content}>
          <WakeHeaderSpacer />
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.randomPhrase}>{randomPhrase}</Text>
          </View>

          {/* Personal Records Section (only show if PRs exist) */}
          {personalRecords && personalRecords.length > 0 && (
            <View style={styles.personalRecordsSection}>
              <View style={styles.personalRecordsTitleContainer}>
                <SvgChampion width={28} height={28} color="rgba(191, 168, 77, 1)" />
                <Text style={styles.personalRecordsTitle}>Nuevos Récords Personales</Text>
              </View>
              {personalRecords.map((pr, index) => (
                <View key={`pr-${index}`} style={styles.prCard}>
                  <Text style={styles.prExerciseName}>{pr.exerciseName}</Text>
                  <Text style={styles.prDetails}>
                    {pr.achievedWith.weight}kg × {pr.achievedWith.reps} reps (serie {pr.achievedWith.setNumber})
                  </Text>
                </View>
              ))}
            </View>
          )}

            {/* Muscle Volume Section (show if discipline supports it) */}
            {/* Muscle Volume Section (show if discipline supports it) */}
            {(() => {
              const shouldShow = shouldTrackMuscleVolume(course?.discipline);
              const hasWeeklyVolumes = !!weeklyMuscleVolumes && Object.keys(weeklyMuscleVolumes).length > 0;
              const hasSessionVolumes = !!sessionMuscleVolumes && Object.keys(sessionMuscleVolumes).length > 0;
              
              logger.log('🔍 Volume card render check:', {
                shouldTrack: shouldShow,
                hasWeeklyVolumes,
                hasSessionVolumes,
                weeklyVolumesKeys: weeklyMuscleVolumes ? Object.keys(weeklyMuscleVolumes) : [],
                sessionVolumesKeys: sessionMuscleVolumes ? Object.keys(sessionMuscleVolumes) : [],
                courseDiscipline: course?.discipline,
                willShow: shouldShow && (hasWeeklyVolumes || hasSessionVolumes)
              });
              
              // Show if discipline supports it AND we have either weekly volumes OR session volumes
              // The WeeklyMuscleVolumeCard can work with just sessionMuscleVolumes
              // MuscleSilhouette needs weeklyMuscleVolumes, but we can still show WeeklyMuscleVolumeCard
              if (!shouldShow) return null;
              if (!hasWeeklyVolumes && !hasSessionVolumes) return null;
              
              // Calculate card width to match MainScreen pattern
              // Card width = screenWidth - (padding on both sides)
              // paddingHorizontal in muscleCardsScrollContainer is Math.max(20, screenWidth * 0.05) on each side
              const containerPadding = Math.max(20, screenWidth * 0.05) * 2; // Both sides
              const cardWidth = screenWidth - containerPadding; // Actual card width
              const cardSpacing = 15; // marginRight between cards
              const snapInterval = cardWidth + cardSpacing; // Card width + spacing
              
              return (
              <View style={styles.muscleVolumeSectionWrapper}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={snapInterval}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  contentContainerStyle={styles.muscleCardsScrollContainer}
                  style={styles.muscleVolumeSection}
                  onScroll={onMuscleScroll}
                  scrollEventThrottle={16}
                >
                  {/* CARD 1: Muscle Silhouette - Only show if we have weekly volumes */}
                  {hasWeeklyVolumes && (
                    <View style={styles.muscleCardFirst}>
                      <MuscleSilhouette 
                        muscleVolumes={weeklyMuscleVolumes} 
                        showCurrentWeekLabel={true}
                        availableWeeks={[getMondayWeek()]}
                        selectedWeek={getMondayWeek()}
                        currentWeek={getMondayWeek()}
                        onWeekChange={() => {}}
                        isReadOnly={true}
                        onInfoPress={handleMuscleVolumeInfoPress}
                      />
                    </View>
                  )}
                  
                  {/* CARD 2: Weekly Sets List - Show if we have session volumes */}
                  {hasSessionVolumes && (
                    <View style={styles.muscleCardSecond}>
                      <WeeklyMuscleVolumeCard 
                        userId={(user || auth.currentUser)?.uid} 
                        sessionMuscleVolumes={sessionMuscleVolumes} 
                        showCurrentWeekLabel={true}
                        onInfoPress={handleMuscleVolumeInfoPress}
                      />
                    </View>
                  )}
                </ScrollView>
                
                {/* Pagination Indicators - Only show if we have multiple cards */}
                {(hasWeeklyVolumes && hasSessionVolumes) && (
                <View style={styles.paginationContainer}>
                  {[0, 1].map((index) => {
                    // Use the same snapInterval for inputRange calculation
                    const inputRange = [
                      (index - 1) * snapInterval,
                      index * snapInterval,
                      (index + 1) * snapInterval,
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
                        style={[
                          styles.paginationDot,
                          {
                            opacity: opacity,
                            transform: [{ scale: scale }],
                            marginHorizontal: 4, // 4px on each side = 8px total between dots
                          }
                        ]}
                      />
                    );
                  })}
                </View>
                )}
              </View>
              );
            })()}

          {/* Indicators Row */}
          <View style={styles.indicatorsRow}>
            {/* Discipline-Specific Metrics */}
            {(() => {
              logger.log('🔍 Debug - completionStats:', completionStats);
              logger.log('🔍 Debug - discipline:', completionStats?.discipline);
              
              const metrics = getDisciplineMetrics(completionStats?.discipline, completionStats);
              logger.log('🔍 Debug - metrics:', metrics);
              
              if (!metrics || metrics.length === 0) {
                logger.log('⚠️ No metrics found for discipline:', completionStats?.discipline);
                // Return null instead of debug info - no discipline metrics to show
                return null;
              }
              
              return metrics.map((metric, index) => (
                <View key={index} style={styles.disciplineMetric}>
                  <Text style={styles.metricValue}>{metric.value} {metric.unit}</Text>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                </View>
              ));
            })()}
          </View>


          {/* Finish Button */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.finishButton} onPress={handleFinishWorkout}>
              <Text style={styles.finishButtonText}>Finalizar Entrenamiento</Text>
            </TouchableOpacity>
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

      {/* Muscle Volume Info Modal */}
      <Modal
        visible={isMuscleVolumeInfoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseMuscleVolumeInfoModal}
      >
        <View style={styles.muscleVolumeInfoModalOverlay}>
          <TouchableOpacity 
            style={styles.muscleVolumeInfoModalBackdrop}
            activeOpacity={1}
            onPress={handleCloseMuscleVolumeInfoModal}
          />
          <View style={styles.muscleVolumeInfoModalContent}>
            <View style={styles.muscleVolumeInfoModalHeader}>
              <Text style={styles.muscleVolumeInfoModalTitle}>
                {selectedMuscleVolumeInfo?.title || ''}
              </Text>
              <TouchableOpacity 
                style={styles.muscleVolumeInfoCloseButton}
                onPress={handleCloseMuscleVolumeInfoModal}
              >
                <Text style={styles.muscleVolumeInfoCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.muscleVolumeInfoScrollContainer}>
              <ScrollView 
                style={styles.muscleVolumeInfoScrollView}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.muscleVolumeInfoModalDescription}>
                  {selectedMuscleVolumeInfo?.description || ''}
                </Text>
                
                {/* Disclaimers Section */}
                {selectedMuscleVolumeInfo?.disclaimers && selectedMuscleVolumeInfo.disclaimers.length > 0 && (
                  <View style={styles.disclaimersSection}>
                    <Text style={styles.disclaimersTitle}>Importante:</Text>
                    {selectedMuscleVolumeInfo.disclaimers.map((disclaimer, index) => (
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
      
      {/* Share Modal - Swipeable Options */}
      <Modal
        visible={isShareModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsShareModalVisible(false)}
      >
        <SafeAreaView style={styles.shareModalContainer}>
          <View style={styles.shareModalHeader}>
            <Text style={styles.shareModalTitle}>Compartir sesión</Text>
            <TouchableOpacity 
              style={styles.shareModalCloseButton}
              onPress={() => setIsShareModalVisible(false)}
            >
              <Text style={styles.shareModalCloseButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.shareCarouselContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={screenWidth - Math.max(80, screenWidth * 0.2) + 8}
              snapToAlignment="start"
              decelerationRate="fast"
              contentContainerStyle={styles.shareCarouselContent}
              onScroll={onShareScroll}
              scrollEventThrottle={16}
              pagingEnabled={false}
            >
              {/* Option 1 Card */}
              {(() => {
                const cardWidth = screenWidth - Math.max(80, screenWidth * 0.2) + 8;
                const inputRange = [
                  (0 - 1) * cardWidth,
                  0 * cardWidth,
                  (0 + 1) * cardWidth,
                ];
                
                const scale = shareScrollX.interpolate({
                  inputRange,
                  outputRange: [0.92, 1.0, 0.92],
                  extrapolate: 'clamp',
                });
                
                const opacity = shareScrollX.interpolate({
                  inputRange,
                  outputRange: [0.75, 1.0, 0.75],
                  extrapolate: 'clamp',
                });
                
                return (
                  <Animated.View style={{ transform: [{ scale }], opacity, width: cardWidth - 8 }}>
                    <ViewShot ref={shareOption1Ref} options={{ format: 'png', quality: 1.0 }}>
                      <View style={styles.shareOptionCard}>
                        {/* Top Left - Logo, Username */}
                        <View style={styles.shareCardTopLeft}>
                          <View style={styles.shareCardTopLeftLeft}>
                            <Image 
                              source={require('../../assets/Isotipo WAKE (negativo).png')}
                              style={styles.shareCardLogo}
                              resizeMode="contain"
                            />
                            {username ? (
                              <Text style={styles.shareCardUsername}>@{username}</Text>
                            ) : null}
                          </View>
                          <View style={styles.shareCardTopLeftRight}>
                            {(() => {
                              const sessionName = workout?.name || workout?.title || workout?.workoutName || sessionData?.workoutName || null;
                              return sessionName ? (
                                <Text style={styles.shareCardSessionName}>{sessionName}</Text>
                              ) : null;
                            })()}
                            {(() => {
                              const programName = course?.name || course?.title || course?.courseName || null;
                              return programName ? (
                                <Text style={styles.shareCardProgramName}>{programName}</Text>
                              ) : null;
                            })()}
                            {(() => {
                              let dateText = null;
                              if (sessionData?.date) {
                                const date = new Date(sessionData.date);
                                dateText = date.toLocaleDateString('es-ES', { 
                                  day: 'numeric', 
                                  month: 'short',
                                  year: 'numeric'
                                });
                              } else if (sessionData?.timestamp) {
                                const date = new Date(sessionData.timestamp);
                                dateText = date.toLocaleDateString('es-ES', { 
                                  day: 'numeric', 
                                  month: 'short',
                                  year: 'numeric'
                                });
                              } else {
                                const date = new Date();
                                dateText = date.toLocaleDateString('es-ES', { 
                                  day: 'numeric', 
                                  month: 'short',
                                  year: 'numeric'
                                });
                              }
                              return dateText ? (
                                <Text style={styles.shareCardDate}>{dateText}</Text>
                              ) : null;
                            })()}
                          </View>
                        </View>
                        
                        {/* Muscle Silhouette - Centered */}
                        <View style={styles.shareCardMuscleWrapper}>
                          {sessionMuscleVolumes && Object.keys(sessionMuscleVolumes).length > 0 ? (
                            <View style={styles.shareCardMuscleBackground}>
                              <View style={{ width: '100%', height: 330 }}>
                                <MuscleSilhouetteSVG muscleVolumes={sessionMuscleVolumes} enhanced={true} />
                              </View>
                            </View>
                          ) : (
                            <Text style={styles.shareOptionText}>No muscle data available</Text>
                          )}
                        </View>
                        
                        {/* Bottom Left - Total Sets */}
                        <View style={styles.shareCardBottomLeft}>
                          <Text style={styles.shareCardSetsNumber}>
                            {(() => {
                              let totalSets = 0;
                              if (sessionData?.exercises) {
                                sessionData.exercises.forEach(exercise => {
                                  if (exercise.sets) {
                                    totalSets += exercise.sets.length;
                                  }
                                });
                              }
                              return totalSets || sessionData?.summary?.total_sets || 0;
                            })()}
                          </Text>
                          <Text style={styles.shareCardSetsLabel}>Series</Text>
                        </View>
                        
                        {/* Bottom Right - Top 2 RM Sets */}
                        <View style={styles.shareCardBottomRight}>
                          {(() => {
                            const allSetsWithRM = [];
                            if (sessionData?.exercises) {
                              sessionData.exercises.forEach((exercise, exerciseIndex) => {
                                if (exercise.sets) {
                                  exercise.sets.forEach((set, setIndex) => {
                                    const performance = set.performance || {};
                                    let actualWeight = parseFloat(performance.weight || performance.weight_kg || set.weight || 0);
                                    let actualReps = parseInt(performance.reps || set.reps || 0);
                                    let intensity = set.intensity || set.objective?.intensity || exercise.intensity;
                                    
                                    if (actualWeight > 0 && actualReps > 0) {
                                      let objectiveIntensity = null;
                                      if (intensity) {
                                        objectiveIntensity = oneRepMaxService.parseIntensity(intensity);
                                      }
                                      if (!objectiveIntensity) {
                                        objectiveIntensity = 7;
                                      }
                                      
                                      const rmEstimate = oneRepMaxService.calculate1RM(actualWeight, actualReps, objectiveIntensity);
                                      let exerciseName = 'Exercise';
                                      if (exercise.name) {
                                        exerciseName = exercise.name;
                                      } else if (exercise.primary && Object.keys(exercise.primary).length > 0) {
                                        const libraryId = Object.keys(exercise.primary)[0];
                                        exerciseName = exercise.primary[libraryId];
                                      }
                                      allSetsWithRM.push({
                                        exerciseName: exerciseName,
                                        weight: actualWeight,
                                        reps: actualReps,
                                        rmEstimate: rmEstimate,
                                      });
                                    }
                                  });
                                }
                              });
                            }
                            
                            const exerciseMap = {};
                            allSetsWithRM.forEach(set => {
                              const exerciseName = set.exerciseName;
                              if (!exerciseMap[exerciseName] || set.rmEstimate > exerciseMap[exerciseName].rmEstimate) {
                                exerciseMap[exerciseName] = set;
                              }
                            });
                            
                            const top2Sets = Object.values(exerciseMap)
                              .sort((a, b) => b.rmEstimate - a.rmEstimate)
                              .slice(0, 2);
                            
                            if (top2Sets.length === 0) return null;
                            
                            return (
                              <View style={styles.top3RMContainer}>
                                {top2Sets.map((set, index) => (
                                  <View key={index} style={styles.top3RMItem}>
                                    <Text style={styles.top3RMValue}>{set.reps} × {set.weight}kg</Text>
                                    <Text style={styles.top3RMExercise}>{set.exerciseName}</Text>
                                  </View>
                                ))}
                              </View>
                            );
                          })()}
                        </View>
                      </View>
                    </ViewShot>
                  </Animated.View>
                );
              })()}
              
              {/* Option 2 Card */}
              {(() => {
                const cardWidth = screenWidth - Math.max(80, screenWidth * 0.2) + 8;
                const inputRange = [
                  (1 - 1) * cardWidth,
                  1 * cardWidth,
                  (1 + 1) * cardWidth,
                ];
                
                const scale = shareScrollX.interpolate({
                  inputRange,
                  outputRange: [0.92, 1.0, 0.92],
                  extrapolate: 'clamp',
                });
                
                const opacity = shareScrollX.interpolate({
                  inputRange,
                  outputRange: [0.75, 1.0, 0.75],
                  extrapolate: 'clamp',
                });
                
                return (
                  <Animated.View style={{ transform: [{ scale }], opacity, width: cardWidth - 8 }}>
                    <ViewShot ref={shareOption2Ref} options={{ format: 'png', quality: 1.0 }}>
                      <View style={[styles.shareOptionCard, styles.shareOptionCardLast]}>
                        <View style={styles.shareOptionCardCentered}>
                          <Text style={styles.shareOptionComingSoon}>Proximamente...</Text>
                        </View>
                      </View>
                    </ViewShot>
                  </Animated.View>
                );
              })()}
            </ScrollView>
          </View>
          
          {/* Share Button */}
          <View style={styles.shareModalActionsRow}>
            <TouchableOpacity 
              style={[styles.shareModalButton, (isSharing || currentShareCardIndex === 1) && styles.shareModalButtonDisabled]} 
              onPress={handleShareCard}
              disabled={isSharing || currentShareCardIndex === 1}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color="rgba(191, 168, 77, 1)" />
              ) : (
                <Text style={styles.shareModalButtonText}>Compartir</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
      
      {/* Fullscreen Card Modal */}
      <Modal
        visible={fullscreenCardIndex !== null}
        transparent={false}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          logger.log('Closing fullscreen, reopening share modal');
          setFullscreenCardIndex(null);
          setIsShareModalVisible(true);
        }}
      >
        <View style={styles.fullscreenCardContainer}>
          <TouchableOpacity 
            activeOpacity={1}
            onPress={() => {
              logger.log('Tapping to close fullscreen');
              setFullscreenCardIndex(null);
              setIsShareModalVisible(true);
            }}
            style={styles.fullscreenCardContent}
          >
            {fullscreenCardIndex === 0 ? (
              <View style={styles.fullscreenCard}>
                {/* Top Left - Logo, Session Name, Program Name, and Username */}
                <View style={styles.fullscreenTopLeft}>
                  <View style={styles.fullscreenTopLeftLeft}>
                    <Image 
                      source={require('../../assets/Isotipo WAKE (negativo).png')}
                      style={styles.fullscreenLogo}
                      resizeMode="contain"
                    />
                    {username ? (
                      <Text style={styles.fullscreenUsername}>@{username}</Text>
                    ) : null}
                  </View>
                  <View style={styles.fullscreenTopLeftRight}>
                    {(() => {
                      const sessionName = workout?.name || workout?.title || workout?.workoutName || sessionData?.workoutName || null;
                      logger.log('🔍 Session name check:', { workout, sessionName });
                      return sessionName ? (
                        <Text style={styles.fullscreenSessionName}>{sessionName}</Text>
                      ) : null;
                    })()}
                    {(() => {
                      const programName = course?.name || course?.title || course?.courseName || null;
                      logger.log('🔍 Program name check:', { course, programName });
                      return programName ? (
                        <Text style={styles.fullscreenProgramName}>{programName}</Text>
                      ) : null;
                    })()}
                    {(() => {
                      // Get date from sessionData
                      let dateText = null;
                      if (sessionData?.date) {
                        const date = new Date(sessionData.date);
                        dateText = date.toLocaleDateString('es-ES', { 
                          day: 'numeric', 
                          month: 'short',
                          year: 'numeric'
                        });
                      } else if (sessionData?.timestamp) {
                        const date = new Date(sessionData.timestamp);
                        dateText = date.toLocaleDateString('es-ES', { 
                          day: 'numeric', 
                          month: 'short',
                          year: 'numeric'
                        });
                      } else {
                        // Use current date as fallback
                        const date = new Date();
                        dateText = date.toLocaleDateString('es-ES', { 
                          day: 'numeric', 
                          month: 'short',
                          year: 'numeric'
                        });
                      }
                      return dateText ? (
                        <Text style={styles.fullscreenDate}>{dateText}</Text>
                      ) : null;
                    })()}
                  </View>
                </View>
                
                {/* Muscle Silhouette - Centered */}
                <View style={styles.fullscreenMuscleWrapper}>
                  {sessionMuscleVolumes && Object.keys(sessionMuscleVolumes).length > 0 ? (
                    <View style={styles.fullscreenMuscleBackground}>
                      <View style={{ width: '100%', height: 330 }}>
                        <MuscleSilhouetteSVG muscleVolumes={sessionMuscleVolumes} enhanced={true} />
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.fullscreenCardText}>No muscle data available</Text>
                  )}
                </View>
                
                {/* Bottom Left - Total Sets */}
                <View style={styles.fullscreenBottomLeft}>
                  <Text style={styles.fullscreenSetsNumber}>
                    {(() => {
                      let totalSets = 0;
                      if (sessionData?.exercises) {
                        sessionData.exercises.forEach(exercise => {
                          if (exercise.sets) {
                            totalSets += exercise.sets.length;
                          }
                        });
                      }
                      return totalSets || sessionData?.summary?.total_sets || 0;
                    })()}
                  </Text>
                  <Text style={styles.fullscreenSetsLabel}>Series</Text>
                </View>
                
                {/* Bottom Right - Top 3 RM Sets */}
                <View style={styles.fullscreenBottomRight}>
                  {(() => {
                    // Calculate RM estimates for all sets
                    const allSetsWithRM = [];
                    logger.log('🔍 Calculating top 3 RM sets. sessionData:', sessionData);
                    
                    if (sessionData?.exercises) {
                      logger.log('🔍 Found exercises:', sessionData.exercises.length);
                      sessionData.exercises.forEach((exercise, exerciseIndex) => {
                        logger.log(`🔍 Exercise ${exerciseIndex}:`, exercise.name || 'No name', 'sets:', exercise.sets?.length);
                        if (exercise.sets) {
                          exercise.sets.forEach((set, setIndex) => {
                            logger.log(`  🔍 Set ${setIndex}:`, set);
                            
                            // Try multiple ways to get weight and reps
                            const performance = set.performance || {};
                            let actualWeight = parseFloat(performance.weight || performance.weight_kg || set.weight || 0);
                            let actualReps = parseInt(performance.reps || set.reps || 0);
                            
                            // Try to get intensity from multiple locations
                            let intensity = set.intensity || set.objective?.intensity || exercise.intensity;
                            
                            logger.log(`  🔍 Set data: weight=${actualWeight}, reps=${actualReps}, intensity=${intensity}`);
                            logger.log(`  🔍 Set object keys:`, Object.keys(set));
                            
                            // If we have weight and reps, try to calculate RM even without intensity
                            // Use a default intensity of 7/10 if not available
                            if (actualWeight > 0 && actualReps > 0) {
                              let objectiveIntensity = null;
                              if (intensity) {
                                objectiveIntensity = oneRepMaxService.parseIntensity(intensity);
                                logger.log(`  🔍 Parsed intensity: ${objectiveIntensity}`);
                              }
                              
                              // If no intensity or couldn't parse, use default of 7
                              if (!objectiveIntensity) {
                                objectiveIntensity = 7;
                                logger.log(`  🔍 Using default intensity: 7`);
                              }
                              
                              const rmEstimate = oneRepMaxService.calculate1RM(actualWeight, actualReps, objectiveIntensity);
                              
                              // Get exercise name from primary field if available
                              let exerciseName = 'Exercise';
                              if (exercise.name) {
                                exerciseName = exercise.name;
                              } else if (exercise.primary && Object.keys(exercise.primary).length > 0) {
                                const libraryId = Object.keys(exercise.primary)[0];
                                exerciseName = exercise.primary[libraryId];
                              }
                              
                              logger.log(`  ✅ Adding set: ${exerciseName}, RM=${rmEstimate}, weight=${actualWeight}, reps=${actualReps}`);
                              allSetsWithRM.push({
                                exerciseName: exerciseName,
                                weight: actualWeight,
                                reps: actualReps,
                                rmEstimate: rmEstimate,
                              });
                            }
                          });
                        }
                      });
                    }
                    
                    logger.log('🔍 Total sets with RM:', allSetsWithRM.length);
                    
                    // Group sets by exercise name and keep only the highest RM for each exercise
                    const exerciseMap = {};
                    allSetsWithRM.forEach(set => {
                      const exerciseName = set.exerciseName;
                      if (!exerciseMap[exerciseName] || set.rmEstimate > exerciseMap[exerciseName].rmEstimate) {
                        exerciseMap[exerciseName] = set;
                      }
                    });
                    
                    // Convert to array and sort by RM estimate, then get top 2
                    const top3Sets = Object.values(exerciseMap)
                      .sort((a, b) => b.rmEstimate - a.rmEstimate)
                      .slice(0, 2);
                    
                    logger.log('🔍 Top 3 sets (one per exercise):', top3Sets);
                    
                    if (top3Sets.length === 0) {
                      logger.log('⚠️ No top 3 sets to display');
                      return (
                        <View style={styles.top3RMContainer}>
                          <Text style={styles.top3RMExercise}>No RM data available</Text>
                        </View>
                      );
                    }
                    
                    return (
                      <View style={styles.top3RMContainer}>
                        {top3Sets.map((set, index) => (
                          <View key={index} style={styles.top3RMItem}>
                            <Text style={styles.top3RMValue}>{set.reps} × {set.weight}kg</Text>
                            <Text style={styles.top3RMExercise}>{set.exerciseName}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </View>
              </View>
            ) : fullscreenCardIndex === 1 ? (
              <View style={styles.fullscreenCard}>
                <Text style={styles.fullscreenCardText}>Option 2 - Fullscreen</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default WorkoutCompletionScreen;
