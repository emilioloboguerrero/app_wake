import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import workoutProgressService from '../data-management/workoutProgressService';
import exerciseLibraryService from '../services/exerciseLibraryService';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import SvgChevronDown from '../components/icons/vectors_fig/Arrow/ChevronDown';
import SvgChevronRight from '../components/icons/vectors_fig/Arrow/ChevronRight';

import logger from '../utils/logger.js';
// Component to handle async exercise resolution
const ExerciseList = ({ exercises }) => {
  const [resolvedExercises, setResolvedExercises] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resolveExercises = async () => {
      try {
        const resolved = await Promise.all(
          exercises.map(async (exercise, exerciseIndex) => {
            try {
              const primaryExerciseData = await exerciseLibraryService.resolvePrimaryExercise(exercise.primary);
              return {
                id: exercise.id,
                title: primaryExerciseData.title,
                index: exerciseIndex
              };
            } catch (error) {
              logger.error(`❌ Error resolving exercise ${exercise.id}:`, error);
              return {
                id: exercise.id,
                title: `Exercise ${exercise.id}`,
                index: exerciseIndex
              };
            }
          })
        );
        setResolvedExercises(resolved);
      } catch (error) {
        logger.error('❌ Error resolving exercises:', error);
      } finally {
        setLoading(false);
      }
    };

    resolveExercises();
  }, [exercises]);

  if (loading) {
    return (
      <View style={styles.exerciseItem}>
        <Text style={styles.exerciseText}>• Cargando ejercicios...</Text>
      </View>
    );
  }

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
  const [courseData, setCourseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedModules, setExpandedModules] = useState({});
  const [expandedSessions, setExpandedSessions] = useState({});
  
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
      backgroundColor: 'rgba(191, 168, 77, 0.2)',
      borderRadius: Math.max(12, screenWidth * 0.04),
      paddingVertical: Math.max(12, screenHeight * 0.015),
      paddingHorizontal: Math.max(16, screenWidth * 0.04),
      marginTop: Math.max(16, screenHeight * 0.02),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(191, 168, 77, 0.5)',
    },
    startSessionButtonText: {
      color: 'rgba(191, 168, 77, 1)',
      fontSize: Math.min(screenWidth * 0.04, 16),
      fontWeight: '600',
    },
  }), [screenWidth, screenHeight]);

  useEffect(() => {
    fetchCourseData();
  }, []);

  const fetchCourseData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await workoutProgressService.getCourseDataForWorkout(course.courseId);
      setCourseData(data.courseData);
      
    } catch (error) {
      logger.error('❌ Error fetching course data:', error);
      setError('Error al cargar la estructura del curso');
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = (moduleId) => {
    setExpandedModules(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }));
  };

  const toggleSession = (sessionId) => {
    setExpandedSessions(prev => ({
      ...prev,
      [sessionId]: !prev[sessionId]
    }));
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
    
    logger.log('📍 Navigating to session:', {
      sessionTitle: session.title,
      sessionId: session.id || session.sessionId,
      moduleId: moduleId,
      globalIndex: globalSessionIndex
    });
    
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
    
    return (
      <View key={session.id || sessionIndex} style={styles.sessionContainer}>
        <TouchableOpacity 
          style={styles.sessionHeader}
          onPress={() => toggleSession(session.id)}
        >
          <Text style={styles.sessionTitle}>{session.title}</Text>
          {isExpanded ? (
            <SvgChevronDown width={20} height={20} stroke="#ffffff" />
          ) : (
            <SvgChevronRight width={20} height={20} stroke="#ffffff" />
          )}
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.sessionContent}>
            {session.exercises && session.exercises.length > 0 ? (
              <>
                <ExerciseList exercises={session.exercises} />
                {/* Add button to navigate to workout */}
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
        )}
      </View>
    );
  };

  const renderModule = (module, moduleIndex) => {
    const isExpanded = expandedModules[module.id];
    
    return (
      <View key={module.id || moduleIndex} style={styles.moduleContainer}>
        <TouchableOpacity 
          style={styles.moduleHeader}
          onPress={() => toggleModule(module.id)}
        >
          <Text style={styles.moduleTitle}>{module.title}</Text>
          {isExpanded ? (
            <SvgChevronDown width={24} height={24} stroke="#ffffff" />
          ) : (
            <SvgChevronRight width={24} height={24} stroke="#ffffff" />
          )}
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.moduleContent}>
            {module.sessions && module.sessions.length > 0 ? (
              module.sessions.map((session, sessionIndex) => 
                renderSession(session, sessionIndex, module.id)
              )
            ) : (
              <Text style={styles.noContentText}>No hay sesiones</Text>
            )}
          </View>
        )}
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
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.loadingText}>Cargando estructura...</Text>
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
            <TouchableOpacity style={styles.retryButton} onPress={fetchCourseData}>
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
