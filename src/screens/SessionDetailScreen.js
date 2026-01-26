import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FixedWakeHeader } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import SvgInfo from '../components/icons/SvgInfo';
import { useAuth } from '../contexts/AuthContext';
import logger from '../utils/logger.js';

const SessionDetailScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerHeight = Platform.OS === 'web' ? 32 : Math.max(40, Math.min(44, screenHeight * 0.055));
  const safeAreaTop = Platform.OS === 'web' ? 0 : Math.max(0, insets.top - 8);
  const headerTotalHeight = headerHeight + safeAreaTop;
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );
  
  const { sessionId, sessionName, date, sessionData } = route.params;
  const { user } = useAuth();
  const [session, setSession] = useState(sessionData);

  useEffect(() => {
    if (sessionData) {
      setSession(sessionData);
    }
  }, [sessionData]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  const handleExercisePress = async (exerciseKey, exerciseData) => {
    // Extract libraryId and exerciseName from the exerciseKey
    const [libraryId, exerciseName] = exerciseKey.split('_');
    
    // Try to load current estimate data if available
    let currentEstimate = null;
    let lastUpdated = null;
    
    try {
      // Import oneRepMaxService dynamically to avoid circular dependencies
      const oneRepMaxService = require('../services/oneRepMaxService').default;
      const allEstimates = await oneRepMaxService.getEstimatesForUser(user.uid);
      
      if (allEstimates && allEstimates[exerciseKey]) {
        currentEstimate = allEstimates[exerciseKey].current;
        lastUpdated = allEstimates[exerciseKey].lastUpdated;
        logger.log('✅ Loaded current estimate for exercise:', exerciseName, currentEstimate);
      } else {
        logger.log('📊 No current estimate found for exercise:', exerciseName);
      }
    } catch (error) {
      logger.error('❌ Error loading current estimate:', error);
      // Continue with null values - the screen will handle this gracefully
    }
    
    // Navigate to ExerciseDetail screen
    navigation.navigate('ExerciseDetail', {
      exerciseKey,
      exerciseName,
      libraryId,
      currentEstimate,
      lastUpdated,
    });
  };

  const renderSetInfo = (set, setIndex) => {
    const reps = set.reps || '-';
    const weight = set.weight || '-';
    
    return (
      <View key={setIndex} style={styles.setRow}>
        <Text style={styles.setNumber}>{setIndex + 1}</Text>
        <Text style={styles.setData}>{reps}</Text>
        <Text style={styles.setData}>{weight}kg</Text>
      </View>
    );
  };

  const renderExerciseCard = (exerciseKey, exerciseData) => {
    const sets = exerciseData.sets || [];
    
    return (
      <View key={exerciseKey} style={styles.exerciseCard}>
        <TouchableOpacity 
          style={styles.exerciseHeader}
          onPress={() => handleExercisePress(exerciseKey, exerciseData)}
          activeOpacity={0.7}
        >
          <Text style={styles.exerciseName}>{exerciseData.exerciseName}</Text>
          <SvgInfo width={16} height={16} color="rgba(255, 255, 255, 0.6)" />
        </TouchableOpacity>
        
        {sets.length > 0 ? (
          <View style={styles.setsContainer}>
            {/* Header Row */}
            <View style={styles.headerRow}>
              <Text style={styles.headerText}>Serie</Text>
              <Text style={styles.headerText}>Reps</Text>
              <Text style={styles.headerText}>Peso</Text>
            </View>
            
            {/* Sets Rows */}
            {sets.map((set, index) => renderSetInfo(set, index))}
          </View>
        ) : (
          <Text style={styles.noSetsText}>No se registraron series</Text>
        )}
      </View>
    );
  };

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <FixedWakeHeader 
          showBackButton={true}
          onBackPress={handleBackPress}
        />
        <View style={[styles.loadingContainer, { marginTop: headerTotalHeight }]}>
          <ActivityIndicator size="large" color="rgba(191, 168, 77, 1)" />
          <Text style={styles.loadingText}>Cargando sesión...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const exercises = session.exercises || {};
  const exerciseKeys = Object.keys(exercises);

  return (
    <SafeAreaView style={styles.container}>
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={handleBackPress}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Spacer for fixed header - matches header height */}
          <View style={{ height: headerTotalHeight }} />
          {/* Session Header */}
          <View style={styles.sessionHeader}>
            <Text style={styles.sessionName}>{sessionName}</Text>
            <View style={styles.sessionDateTime}>
              <Text style={styles.sessionDate}>{formatDate(date)}</Text>
              <Text style={styles.sessionTime}>{formatTime(date)}</Text>
            </View>
          </View>
          
          {/* Session Stats */}
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{exerciseKeys.length}</Text>
              <Text style={styles.statLabel}>Ejercicios</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {Object.values(exercises).reduce((total, exercise) => 
                  total + (exercise.sets?.length || 0), 0
                )}
              </Text>
              <Text style={styles.statLabel}>Series</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {session.duration ? (
                  <>
                    <Text style={styles.durationNumber}>{Math.round(session.duration / 60)}</Text>
                    <Text style={styles.durationUnit}>min</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.durationNumber}>0</Text>
                    <Text style={styles.durationUnit}>min</Text>
                  </>
                )}
              </Text>
              <Text style={styles.statLabel}>Duración</Text>
            </View>
          </View>
          
          {/* Exercises List */}
          <View style={styles.exercisesList}>
            {exerciseKeys.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No hay ejercicios registrados</Text>
              </View>
            ) : (
              exerciseKeys.map(exerciseKey => 
                renderExerciseCard(exerciseKey, exercises[exerciseKey])
              )
            )}
          </View>
          <BottomSpacer />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingBottom: Math.max(40, screenHeight * 0.05),
    paddingTop: 0, // No extra padding - spacer handles it
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  sessionName: {
    fontSize: Math.min(screenWidth * 0.07, 28),
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
    flex: 1,
    paddingLeft: 0, // Removed padding - content already has horizontal padding
  },
  sessionDateTime: {
    alignItems: 'flex-end',
  },
  sessionDate: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: Math.max(2, screenHeight * 0.002),
  },
  sessionTime: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    color: '#ffffff',
    opacity: 0.7,
  },
  statsCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
    marginBottom: Math.max(20, screenHeight * 0.025),
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '700',
    color: 'rgba(191, 168, 77, 1)',
    marginBottom: Math.max(4, screenHeight * 0.005),
  },
  statLabel: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    color: '#ffffff',
    opacity: 0.7,
  },
  durationNumber: {
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '700',
    color: 'rgba(191, 168, 77, 1)',
  },
  durationUnit: {
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '500',
    color: 'rgba(191, 168, 77, 1)',
  },
  exercisesList: {
    gap: Math.max(16, screenWidth * 0.04),
  },
  exerciseCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  exerciseName: {
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  setsContainer: {
    gap: Math.max(4, screenHeight * 0.005),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: Math.max(4, screenHeight * 0.005),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: Math.max(4, screenHeight * 0.005),
  },
  headerText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: Math.max(2, screenHeight * 0.002),
  },
  setNumber: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
  },
  setData: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
  },
  noSetsText: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    color: '#ffffff',
    opacity: 0.7,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: Math.max(20, screenHeight * 0.025),
  },
  emptyContainer: {
    paddingVertical: Math.max(40, screenHeight * 0.05),
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    color: '#ffffff',
    opacity: 0.7,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: Math.min(screenWidth * 0.04, 16),
    color: '#ffffff',
    opacity: 0.7,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Math.max(12, screenHeight * 0.015),
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    opacity: 0.7,
  },
});

export { SessionDetailScreen as SessionDetailScreenBase };
export default SessionDetailScreen;
