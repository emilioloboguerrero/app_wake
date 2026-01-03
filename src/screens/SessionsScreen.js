import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import exerciseHistoryService from '../services/exerciseHistoryService';
import { FixedWakeHeader } from '../components/WakeHeader';
import logger from '../utils/logger.js';
import { getMondayWeek, isDateInWeek } from '../utils/weekCalculation';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const SessionsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  // Calculate header height to match FixedWakeHeader
  const headerHeight = Math.max(60, screenHeight * 0.08); // 8% of screen height, min 60
  const headerTotalHeight = headerHeight + Math.max(0, insets.top - 20);
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    if (!user?.uid) {
      logger.warn('⚠️ SessionsScreen: Cannot load sessions - user not available');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      logger.log('📊 Loading sessions for user:', user.uid);
      
      // Get all session history
      const sessionHistory = await exerciseHistoryService.getAllSessionHistory(user.uid);
      
      logger.log('📊 Session history received:', {
        isObject: typeof sessionHistory === 'object',
        isArray: Array.isArray(sessionHistory),
        keysCount: Object.keys(sessionHistory || {}).length,
        firstSession: sessionHistory && Object.keys(sessionHistory).length > 0 ? Object.values(sessionHistory)[0] : null
      });
      
      // Convert to array and sort by date (newest first)
      const sessionsArray = Object.values(sessionHistory || {}).sort((a, b) => {
        const dateA = a.completedAt ? new Date(a.completedAt) : new Date(0);
        const dateB = b.completedAt ? new Date(b.completedAt) : new Date(0);
        return dateB - dateA; // Descending order (newest first)
      });
      
      logger.log('📊 Sessions array after sorting:', {
        length: sessionsArray.length,
        firstSessionDate: sessionsArray[0]?.completedAt,
        lastSessionDate: sessionsArray[sessionsArray.length - 1]?.completedAt
      });
      
      setSessions(sessionsArray);
      logger.log('✅ Sessions loaded:', sessionsArray.length, 'sessions');
    } catch (error) {
      logger.error('❌ Error loading sessions:', error);
      logger.error('❌ Error details:', {
        message: error.message,
        stack: error.stack
      });
      setSessions([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (user?.uid) {
      loadSessions();
    } else {
      setLoading(false);
    }
  }, [user?.uid, loadSessions]);

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

  const getExerciseCount = (session) => {
    return Object.keys(session.exercises || {}).length;
  };

  const getTotalSets = (session) => {
    let totalSets = 0;
    Object.values(session.exercises || {}).forEach(exercise => {
      totalSets += exercise.sets?.length || 0;
    });
    return totalSets;
  };

  // Calculate sets per session comparison between current week and previous week
  const calculateSetsComparison = (sessions) => {
    if (!sessions || sessions.length === 0) {
      return {
        currentWeekAverage: 0,
        previousWeekAverage: 0,
        percentageChange: 0,
        trend: 'stable'
      };
    }

    const currentWeek = getMondayWeek();
    
    // Calculate previous week (7 days before current week's Monday)
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const currentMonday = new Date(now.getFullYear(), now.getMonth(), diff);
    currentMonday.setHours(0, 0, 0, 0);
    
    const previousMonday = new Date(currentMonday);
    previousMonday.setDate(previousMonday.getDate() - 7);
    const previousWeek = getMondayWeek(previousMonday);

    // Filter sessions for current week and previous week
    const currentWeekSessions = sessions.filter(session => {
      const sessionDate = new Date(session.completedAt);
      return isDateInWeek(sessionDate, currentWeek);
    });

    const previousWeekSessions = sessions.filter(session => {
      const sessionDate = new Date(session.completedAt);
      return isDateInWeek(sessionDate, previousWeek);
    });

    // Calculate average sets per session for each week
    const currentWeekTotalSets = currentWeekSessions.reduce((sum, session) => {
      return sum + getTotalSets(session);
    }, 0);
    const currentWeekAverage = currentWeekSessions.length > 0
      ? Math.round((currentWeekTotalSets / currentWeekSessions.length) * 10) / 10
      : 0;

    const previousWeekTotalSets = previousWeekSessions.reduce((sum, session) => {
      return sum + getTotalSets(session);
    }, 0);
    const previousWeekAverage = previousWeekSessions.length > 0
      ? Math.round((previousWeekTotalSets / previousWeekSessions.length) * 10) / 10
      : 0;

    // Calculate percentage change
    const percentageChange = previousWeekAverage > 0
      ? Math.round(((currentWeekAverage - previousWeekAverage) / previousWeekAverage) * 100)
      : (currentWeekAverage > 0 ? 100 : 0);

    // Determine trend
    let trend = 'stable';
    if (percentageChange > 5) trend = 'up';
    else if (percentageChange < -5) trend = 'down';

    return {
      currentWeekAverage,
      previousWeekAverage,
      percentageChange,
      trend,
      currentWeekSessionCount: currentWeekSessions.length,
      previousWeekSessionCount: previousWeekSessions.length
    };
  };

  // Render sets comparison card
  const renderSetsComparison = () => {
    const comparison = calculateSetsComparison(sessions);
    
    return (
      <View style={styles.tendenciesCard}>
        <View style={styles.tendenciesHeader}>
          <Text style={styles.tendenciesTitle}>Series por Sesión</Text>
          <Text style={styles.tendenciesSubtitle}>Semana actual vs. semana anterior</Text>
        </View>
        
        <View style={styles.tendenciesContent}>
          <View style={styles.tendenciesMain}>
            <Text style={styles.tendenciesNumber}>{comparison.currentWeekAverage}</Text>
            <Text style={styles.tendenciesUnit}>series</Text>
          </View>
          
          <View style={styles.tendenciesChange}>
            <View style={styles.tendenciesChangeRow}>
              <Text
                style={[
                  styles.tendenciesPercentage,
                  comparison.trend === 'up' && styles.tendenciesPercentageUp,
                  comparison.trend === 'down' && styles.tendenciesPercentageDown
                ]}
              >
                {comparison.percentageChange > 0 ? '+' : ''}{comparison.percentageChange}%
              </Text>
              {comparison.trend === 'up' && (
                <Text style={[styles.tendenciesArrow, styles.tendenciesArrowUp]}>↑</Text>
              )}
              {comparison.trend === 'down' && (
                <Text style={[styles.tendenciesArrow, styles.tendenciesArrowDown]}>↓</Text>
              )}
            </View>
            <Text style={styles.tendenciesChangeLabel}>
              vs. semana anterior
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const handleSessionPress = (session) => {
    navigation.navigate('SessionDetail', {
      sessionId: session.completionDocId || session.sessionId,
      sessionName: session.sessionName || session.courseName || 'Sesión',
      date: session.completedAt,
      sessionData: session
    });
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  const renderSessionCard = (session) => {
    const exerciseCount = getExerciseCount(session);
    const totalSets = getTotalSets(session);
    
    return (
      <TouchableOpacity
        key={session.completionDocId || session.sessionId}
        style={styles.sessionCard}
        onPress={() => handleSessionPress(session)}
        activeOpacity={0.7}
      >
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionName}>{session.sessionName || 'Sesión'}</Text>
          <Text style={styles.sessionDate}>{formatDate(session.completedAt)}</Text>
        </View>
        
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionStats}>
            {exerciseCount} ejercicio{exerciseCount !== 1 ? 's' : ''} • {totalSets} series
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <FixedWakeHeader 
        showBackButton
        onBackPress={handleBackPress}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Spacer for fixed header - matches header height */}
          <View style={{ height: headerTotalHeight }} />
          {/* Title */}
          <Text style={styles.title}>Sesiones</Text>
          
          {/* Sets Comparison Card */}
          {sessions.length > 0 && renderSetsComparison()}
          
          {/* Sessions List */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="rgba(191, 168, 77, 1)" />
              <Text style={styles.loadingText}>Cargando sesiones...</Text>
            </View>
          ) : sessions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No hay sesiones</Text>
              <Text style={styles.emptyDescription}>
                Completa tu primer entrenamiento para ver tus sesiones aquí.
              </Text>
            </View>
          ) : (
            <View style={styles.sessionsList}>
              {sessions.map(renderSessionCard)}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingTop: 0, // No extra padding - spacer handles it
    paddingBottom: Math.max(40, screenHeight * 0.05),
  },
  title: {
    fontSize: Math.min(screenWidth * 0.07, 28),
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
    paddingLeft: Math.max(24, screenWidth * 0.06),
    marginTop: 0, // No margin - spacer positions it correctly
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  loadingContainer: {
    paddingVertical: Math.max(60, screenHeight * 0.075),
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    marginTop: Math.max(12, screenHeight * 0.015),
    opacity: 0.7,
  },
  emptyContainer: {
    paddingVertical: Math.max(60, screenHeight * 0.075),
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.05, 20),
    fontWeight: '600',
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  emptyDescription: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: Math.max(24, screenHeight * 0.03),
  },
  sessionsList: {
    gap: Math.max(12, screenWidth * 0.03),
  },
  sessionCard: {
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
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  sessionName: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    flex: 1,
    marginRight: Math.max(12, screenWidth * 0.03),
  },
  sessionDate: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '500',
  },
  sessionInfo: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  sessionTime: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    opacity: 0.7,
  },
  sessionStats: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    opacity: 0.7,
  },
  tendenciesCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    padding: Math.max(20, screenWidth * 0.05),
    marginBottom: Math.max(20, screenHeight * 0.025),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  tendenciesHeader: {
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  tendenciesTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
    marginBottom: Math.max(4, screenHeight * 0.005),
  },
  tendenciesSubtitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    opacity: 0.7,
  },
  tendenciesContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tendenciesMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tendenciesNumber: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.08, 32),
    fontWeight: '700',
    marginRight: Math.max(8, screenWidth * 0.02),
  },
  tendenciesUnit: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    opacity: 0.7,
  },
  tendenciesChange: {
    alignItems: 'flex-end',
  },
  tendenciesChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Math.max(4, screenHeight * 0.005),
  },
  tendenciesPercentage: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    marginRight: Math.max(4, screenWidth * 0.01),
  },
  tendenciesPercentageUp: {
    color: '#4ade80',
  },
  tendenciesPercentageDown: {
    color: '#f87171',
  },
  tendenciesArrow: {
    fontSize: Math.min(screenWidth * 0.04, 16),
  },
  tendenciesArrowUp: {
    color: '#4ade80',
  },
  tendenciesArrowDown: {
    color: '#f87171',
  },
  tendenciesChangeLabel: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.035, 14),
    opacity: 0.7,
  },
});

export { SessionsScreen as SessionsScreenBase };
export default SessionsScreen;
