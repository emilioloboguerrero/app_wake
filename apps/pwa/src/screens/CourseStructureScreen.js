import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  Animated,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import workoutProgressService from '../data-management/workoutProgressService';
import { STALE_TIMES, GC_TIMES } from '../config/queryConfig';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import SvgChevronLeft from '../components/icons/vectors_fig/Arrow/ChevronLeft';
import logger from '../utils/logger.js';
import WakeLoader from '../components/WakeLoader';

const ExerciseList = ({ exercises, styles }) => {
  const resolvedExercises = useMemo(() =>
    exercises.map((exercise, index) => {
      let title = exercise.name || `Exercise ${exercise.id}`;
      if (!exercise.name && exercise.primary && typeof exercise.primary === 'object') {
        const firstKey = Object.keys(exercise.primary)[0];
        if (firstKey) title = exercise.primary[firstKey];
      }
      return { id: exercise.id, title, index };
    }),
    [exercises]
  );

  return (
    <>
      {resolvedExercises.map((exercise) => (
        <View key={exercise.id} style={styles.exerciseItem}>
          <Text style={styles.exerciseText}>• {exercise.title}</Text>
        </View>
      ))}
    </>
  );
};

const CourseStructureScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { course } = route.params;
  const { user } = useAuth();
  const [expandedModules, setExpandedModules] = useState({});
  const [expandedSessions, setExpandedSessions] = useState({});
  const moduleAnimsRef = useRef(new Map());
  const sessionAnimsRef = useRef(new Map());

  const getOrCreateAnim = (mapRef, id, isExpanded) => {
    if (!mapRef.current.has(id)) {
      mapRef.current.set(id, {
        expand: new Animated.Value(isExpanded ? 1 : 0),
        chevron: new Animated.Value(isExpanded ? 1 : 0),
      });
    }
    return mapRef.current.get(id);
  };

  const runExpandAnim = (mapRef, id, toExpanded) => {
    const anim = getOrCreateAnim(mapRef, id, !toExpanded);
    Animated.parallel([
      Animated.timing(anim.expand, { toValue: toExpanded ? 1 : 0, duration: 220, useNativeDriver: false }),
      Animated.timing(anim.chevron, { toValue: toExpanded ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#1a1a1a',
      overflow: 'visible',
    },
    scrollView: {
      flex: 1,
      overflow: 'visible',
    },
    content: {
      paddingBottom: 20, // Normal padding
      overflow: 'visible',
    },
    titleSection: {
      paddingTop: 0,
      marginTop: 0,
      marginBottom: Math.max(20, screenHeight * 0.03), // Match ProfileScreen
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      color: '#ffffff',
      fontSize: 16,
      marginTop: 16,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    errorText: {
      color: '#ff6b6b',
      fontSize: 16,
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
      fontSize: 14,
      fontWeight: '600',
    },
    courseTitle: {
      fontSize: Math.min(screenWidth * 0.08, 32), // Match ProfileScreen responsive sizing
      fontWeight: '600', // Match ProfileScreen weight
      color: '#ffffff',
      textAlign: 'left',
      paddingLeft: screenWidth * 0.12, // Match ProfileScreen padding
      marginBottom: 20,
    },
    moduleContainer: {
      backgroundColor: '#2a2a2a',
      borderRadius: Math.max(12, screenWidth * 0.04), // Responsive border radius
      marginBottom: Math.max(15, screenHeight * 0.02), // Match ProfileScreen spacing
      marginHorizontal: Math.max(24, screenWidth * 0.06), // Match ProfileScreen margins
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      shadowColor: 'rgba(255, 255, 255, 0.4)',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 2,
      elevation: 2,
      overflow: 'visible',
    },
    moduleHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Math.max(16, screenHeight * 0.02), // Responsive padding
      paddingHorizontal: Math.max(20, screenWidth * 0.05), // Responsive padding
    },
    moduleTitle: {
      fontSize: Math.min(screenWidth * 0.05, 20), // Responsive font size
      fontWeight: '600',
      color: '#ffffff',
      flex: 1,
    },
    moduleContent: {
      paddingHorizontal: Math.max(20, screenWidth * 0.05), // Responsive padding
      paddingBottom: Math.max(20, screenHeight * 0.025), // Responsive padding
    },
    sessionContainer: {
      backgroundColor: '#3a3a3a',
      borderRadius: Math.max(8, screenWidth * 0.02), // Responsive border radius
      marginBottom: Math.max(12, screenHeight * 0.015), // Match ProfileScreen spacing
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.2)',
      shadowColor: 'rgba(255, 255, 255, 0.4)',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 2,
      elevation: 2,
      overflow: 'visible',
    },
    sessionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Math.max(12, screenHeight * 0.015), // Responsive padding
      paddingHorizontal: Math.max(16, screenWidth * 0.04), // Responsive padding
    },
    sessionTitle: {
      fontSize: Math.min(screenWidth * 0.04, 16), // Responsive font size
      fontWeight: '500',
      color: '#ffffff',
      flex: 1,
    },
    sessionContent: {
      paddingHorizontal: Math.max(16, screenWidth * 0.04), // Responsive padding
      paddingBottom: Math.max(16, screenHeight * 0.02), // Responsive padding
    },
    exerciseItem: {
      paddingVertical: Math.max(8, screenHeight * 0.01), // Responsive padding
      paddingLeft: Math.max(8, screenWidth * 0.02), // Responsive padding
    },
    exerciseText: {
      fontSize: Math.min(screenWidth * 0.035, 14), // Responsive font size
      color: '#cccccc',
    },
    noContentContainer: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    noContentText: {
      fontSize: 16,
      color: '#999999',
      textAlign: 'center',
    },
    startSessionButton: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderRadius: Math.max(12, screenWidth * 0.04),
      paddingVertical: Math.max(12, screenHeight * 0.015),
      paddingHorizontal: Math.max(16, screenWidth * 0.04),
      marginTop: Math.max(16, screenHeight * 0.02),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    startSessionButtonText: {
      color: 'rgba(255, 255, 255, 1)',
      fontSize: Math.min(screenWidth * 0.04, 16),
      fontWeight: '600',
    },
  }), [screenWidth, screenHeight]);

  const structureEnabled = !!course.courseId && !!user?.uid;
  const { data: courseQueryData, isLoading: loading, isError, refetch } = useQuery({
    queryKey: ['programs', 'structure', course.courseId, user?.uid],
    queryFn: () => workoutProgressService.getCourseDataForWorkout(course.courseId, user?.uid),
    enabled: structureEnabled,
    staleTime: STALE_TIMES.programStructure,
    gcTime: GC_TIMES.programStructure,
  });

  const courseData = courseQueryData?.courseData ?? null;
  const error = isError ? 'Error al cargar la estructura del curso' : null;

  const toggleModule = (moduleId) => {
    setExpandedModules(prev => {
      const next = !prev[moduleId];
      runExpandAnim(moduleAnimsRef, moduleId, next);
      return { ...prev, [moduleId]: next };
    });
  };

  const toggleSession = (sessionId) => {
    setExpandedSessions(prev => {
      const next = !prev[sessionId];
      runExpandAnim(sessionAnimsRef, sessionId, next);
      return { ...prev, [sessionId]: next };
    });
  };


  const calculateGlobalSessionIndex = (targetModuleId, targetSessionIndex) => {
    if (!courseData?.modules) return targetSessionIndex;
    
    let globalIndex = 0;
    for (const module of courseData.modules) {
      if (module.id === targetModuleId) {
        // Found the target module, add the session index within it
        globalIndex += targetSessionIndex;
        break;
      } else {
        // Add all sessions from this module to the global count
        if (module.sessions) {
          globalIndex += module.sessions.length;
        }
      }
    }
    return globalIndex;
  };

  const handleSessionPress = (session, sessionIndex, moduleId) => {
    // Calculate global session index across all modules
    const globalSessionIndex = calculateGlobalSessionIndex(moduleId, sessionIndex);
    
    // Navigate to DailyWorkout with session pre-selected
    navigation.navigate('DailyWorkout', {
      course: course,
      selectedSessionId: session.id || session.sessionId,
      selectedModuleId: moduleId,
      selectedSessionIndex: globalSessionIndex
    });
  };

  const renderSession = (session, sessionIndex, moduleId) => {
    const isExpanded = expandedSessions[session.id];
    const anim = getOrCreateAnim(sessionAnimsRef, session.id, isExpanded);
    const chevronRotate = anim.chevron.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '270deg'] });

    return (
      <View key={session.id || sessionIndex} style={styles.sessionContainer}>
        <TouchableOpacity
          style={styles.sessionHeader}
          onPress={() => toggleSession(session.id)}
        >
          <Text style={styles.sessionTitle}>{session.title}</Text>
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <SvgChevronLeft width={20} height={20} stroke="#ffffff" />
          </Animated.View>
        </TouchableOpacity>

        <Animated.View style={{ maxHeight: anim.expand.interpolate({ inputRange: [0, 1], outputRange: [0, 800] }), opacity: anim.expand, overflow: 'hidden' }}>
          <View style={styles.sessionContent}>
            {session.exercises && session.exercises.length > 0 ? (
              <>
                <ExerciseList exercises={session.exercises} styles={styles} />
                <TouchableOpacity
                  style={styles.startSessionButton}
                  onPress={() => handleSessionPress(session, sessionIndex, moduleId)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.startSessionButtonText}>Iniciar Sesión</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.noContentText}>No hay ejercicios</Text>
            )}
          </View>
        </Animated.View>
      </View>
    );
  };

  const renderModule = (module, moduleIndex) => {
    const isExpanded = expandedModules[module.id];
    const anim = getOrCreateAnim(moduleAnimsRef, module.id, isExpanded);
    const chevronRotate = anim.chevron.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '270deg'] });

    return (
      <View key={module.id || moduleIndex} style={styles.moduleContainer}>
        <TouchableOpacity
          style={styles.moduleHeader}
          onPress={() => toggleModule(module.id)}
        >
          <Text style={styles.moduleTitle}>{module.title}</Text>
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <SvgChevronLeft width={24} height={24} stroke="#ffffff" />
          </Animated.View>
        </TouchableOpacity>

        <Animated.View style={{ maxHeight: anim.expand.interpolate({ inputRange: [0, 1], outputRange: [0, 2000] }), opacity: anim.expand, overflow: 'hidden' }}>
          <View style={styles.moduleContent}>
            {module.sessions && module.sessions.length > 0 ? (
              module.sessions.map((session, sessionIndex) =>
                renderSession(session, sessionIndex, module.id)
              )
            ) : (
              <Text style={styles.noContentText}>No hay sesiones</Text>
            )}
          </View>
        </Animated.View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
        <FixedWakeHeader 
          title="Estructura del Curso" 
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <WakeHeaderContent>
          <WakeHeaderSpacer />
          <View style={styles.loadingContainer}>
            <WakeLoader size={80} />
          </View>
        </WakeHeaderContent>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
        <FixedWakeHeader 
          title="Estructura del Curso" 
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <WakeHeaderContent>
          <WakeHeaderSpacer />
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={refetch}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        </WakeHeaderContent>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader 
        title="Estructura del Curso" 
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <WakeHeaderContent style={styles.content}>
          <WakeHeaderSpacer />
          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.courseTitle}>{courseData?.title || course.title}</Text>
          </View>

          {/* Modules */}
          {courseData?.modules && courseData.modules.length > 0 ? (
            courseData.modules.map((module, moduleIndex) => 
              renderModule(module, moduleIndex)
            )
          ) : (
            <View style={styles.noContentContainer}>
              <Text style={styles.noContentText}>No hay módulos disponibles</Text>
            </View>
          )}
          <BottomSpacer />
        </WakeHeaderContent>
      </ScrollView>
    </SafeAreaView>
  );
};

export default CourseStructureScreen;
