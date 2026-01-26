import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import exerciseHistoryService from '../services/exerciseHistoryService';
import { FixedWakeHeader } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import logger from '../utils/logger.js';
import { getMondayWeek, isDateInWeek } from '../utils/weekCalculation';

// Pagination constants
const PAGE_SIZE = 20; // Number of sessions to load per page

const SessionsScreen = ({ navigation }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Calculate header height to match FixedWakeHeader
  const headerHeight = Math.max(60, screenHeight * 0.08); // 8% of screen height, min 60
  const headerTotalHeight = headerHeight + Math.max(0, insets.top - 20);
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );
  const { user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [resolvedUserId, setResolvedUserId] = useState(null); // Handles web auth race
  const lastDocRef = useRef(null); // Track last document for pagination
  const userResolveTimerRef = useRef(null);

  const loadSessions = useCallback(async (isInitialLoad = false) => {
    // Resolve user from context or Firebase auth (web can lag context)
    const resolvedUser = user || auth.currentUser || (resolvedUserId ? { uid: resolvedUserId } : null);
    const userId = resolvedUser?.uid;

    // Don't try to load if auth is still loading or user is not available
    if (authLoading || !userId) {
      if (!authLoading) {
        logger.log('⚠️ SessionsScreen: Cannot load sessions - user not available');
      }
      if (isInitialLoad) {
        setLoading(false);
        setHasMore(false);
      }
      return;
    }
    
    try {
      if (isInitialLoad) {
        setLoading(true);
        setSessions([]); // Clear existing sessions on initial load
        lastDocRef.current = null; // Reset pagination
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }
      
      logger.log('📊 Loading sessions for user:', userId, { isInitialLoad, hasLastDoc: !!lastDocRef.current });
      
      // Get paginated session history
      const result = await exerciseHistoryService.getSessionHistoryPaginated(
        userId,
        PAGE_SIZE,
        lastDocRef.current
      );
      
      logger.log('📊 Paginated result received:', {
        sessionsCount: Object.keys(result.sessions || {}).length,
        hasMore: result.hasMore,
        hasLastDoc: !!result.lastDoc
      });
      
      const newSessions = Object.values(result.sessions || {});
      
      logger.log('📊 Session history received:', {
        count: newSessions.length,
        hasMore: result.hasMore
      });
      
      // Convert to array and sort by date (newest first) - should already be sorted, but ensure
      const sortedNewSessions = newSessions.sort((a, b) => {
        const dateA = a.completedAt ? new Date(a.completedAt) : new Date(0);
        const dateB = b.completedAt ? new Date(b.completedAt) : new Date(0);
        return dateB - dateA; // Descending order (newest first)
      });
      
      // Append new sessions to existing ones (for pagination)
      // Use functional update to avoid dependency on sessions.length
      if (isInitialLoad) {
        setSessions(sortedNewSessions);
      } else {
        setSessions(prev => {
          const combined = [...prev, ...sortedNewSessions];
          logger.log('✅ Sessions loaded (pagination):', {
            newCount: sortedNewSessions.length,
            previousCount: prev.length,
            totalCount: combined.length,
            hasMore: result.hasMore
          });
          return combined;
        });
      }
      
      // Update pagination state
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);
      
      if (isInitialLoad) {
        logger.log('✅ Sessions loaded (initial):', {
          newCount: sortedNewSessions.length,
          totalCount: sortedNewSessions.length,
          hasMore: result.hasMore
        });
      }
    } catch (error) {
      logger.error('❌ Error loading sessions:', error);
      logger.error('❌ Error details:', {
        message: error.message,
        stack: error.stack
      });
      if (isInitialLoad) {
        setSessions([]); // Set empty array on error for initial load
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user?.uid, authLoading]);

  // Load more sessions when reaching end of list
  const loadMoreSessions = useCallback(() => {
    // Only load more if user is available, not already loading, and has more to load
    if (!authLoading && user?.uid && !loadingMore && hasMore && !loading) {
      logger.log('📊 Loading more sessions...');
      loadSessions(false);
    } else {
      logger.log('📊 Load more skipped:', {
        authLoading,
        hasUser: !!user?.uid,
        loadingMore,
        hasMore,
        loading
      });
    }
  }, [authLoading, user?.uid, loadingMore, hasMore, loading, loadSessions]);

  useEffect(() => {
    logger.log('📊 SessionsScreen useEffect triggered:', {
      authLoading,
      hasUser: !!user,
      userId: user?.uid
    });
    
    // Wait for auth to finish loading before attempting to load sessions
    if (!authLoading) {
      if (user?.uid) {
        logger.log('📊 SessionsScreen: Auth ready, loading sessions...');
        loadSessions(true); // Initial load
      } else {
        logger.log('📊 SessionsScreen: Auth ready but no user, stopping loading');
        setLoading(false);
      }
    } else {
      logger.log('📊 SessionsScreen: Auth still loading, waiting...');
    }
  }, [user?.uid, authLoading, loadSessions]);

  // Fallback: poll auth.currentUser a few times if context user is missing (web race condition)
  useEffect(() => {
    if (!authLoading && !user?.uid && !resolvedUserId) {
      let attempts = 0;
      userResolveTimerRef.current = setInterval(() => {
        attempts += 1;
        const current = auth.currentUser;
        if (current?.uid) {
          logger.log('📊 SessionsScreen: Resolved user from auth.currentUser:', current.uid);
          setResolvedUserId(current.uid);
          clearInterval(userResolveTimerRef.current);
          loadSessions(true);
        } else if (attempts >= 5) {
          clearInterval(userResolveTimerRef.current);
          logger.log('⚠️ SessionsScreen: Unable to resolve user from auth.currentUser after retries');
          setLoading(false);
          setHasMore(false);
        }
      }, 300);
      return () => clearInterval(userResolveTimerRef.current);
    }
    return undefined;
  }, [authLoading, user?.uid, resolvedUserId, loadSessions]);

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

  const renderSessionCard = ({ item: session }) => {
    const exerciseCount = getExerciseCount(session);
    const totalSets = getTotalSets(session);
    
    return (
      <TouchableOpacity
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

      <FlatList
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        data={sessions}
        keyExtractor={(item) => item.completionDocId || item.sessionId || item.id || `session-${item.completedAt}`}
        renderItem={renderSessionCard}
        ItemSeparatorComponent={() => <View style={styles.sessionSeparator} />}
        ListHeaderComponent={() => (
          <>
            {/* Spacer for fixed header - matches header height */}
            <View style={{ height: headerTotalHeight }} />
            {/* Title */}
            <Text style={styles.title}>Sesiones</Text>
            
            {/* Sets Comparison Card */}
            {sessions.length > 0 && renderSetsComparison()}
          </>
        )}
        ListEmptyComponent={() => (
          loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="rgba(191, 168, 77, 1)" />
              <Text style={styles.loadingText}>Cargando sesiones...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No hay sesiones</Text>
              <Text style={styles.emptyDescription}>
                Completa tu primer entrenamiento para ver tus sesiones aquí.
              </Text>
            </View>
          )
        )}
        ListFooterComponent={() => (
          <>
            {loadingMore && (
              <View style={styles.loadMoreContainer}>
                <ActivityIndicator size="small" color="rgba(191, 168, 77, 1)" />
                <Text style={styles.loadMoreText}>Cargando más sesiones...</Text>
              </View>
            )}
            {!loadingMore && !hasMore && sessions.length > 0 && (
              <View style={styles.loadMoreContainer}>
                <Text style={styles.loadMoreText}>No hay más sesiones</Text>
              </View>
            )}
            <BottomSpacer />
          </>
        )}
        onEndReached={loadMoreSessions}
        onEndReachedThreshold={0.5} // Trigger when 50% from bottom
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true} // Optimize performance
        maxToRenderPerBatch={10} // Render 10 items per batch
        windowSize={10} // Keep 10 screens worth of items in memory
        initialNumToRender={PAGE_SIZE} // Initial render count
        getItemLayout={useMemo(() => {
          // Calculate item height: card padding + content + separator
          const cardPadding = Math.max(20, screenWidth * 0.05) * 2; // top + bottom
          const cardContent = Math.max(60, screenHeight * 0.08); // estimated content height
          const separatorHeight = Math.max(8, screenHeight * 0.015);
          const itemHeight = cardPadding + cardContent + separatorHeight;
          
          return (data, index) => ({
            length: itemHeight,
            offset: itemHeight * index,
            index,
          });
        }, [screenWidth, screenHeight])}
      />
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
  loadMoreContainer: {
    paddingVertical: Math.max(20, screenHeight * 0.025),
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    opacity: 0.7,
    marginTop: Math.max(8, screenHeight * 0.01),
  },
  sessionSeparator: {
    height: Math.max(8, screenHeight * 0.015),
  },
});

export { SessionsScreen as SessionsScreenBase };
export default SessionsScreen;
