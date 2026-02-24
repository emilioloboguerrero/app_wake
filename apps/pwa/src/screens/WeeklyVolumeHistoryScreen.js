import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Animated,
  Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc } from 'firebase/firestore';
import { firestore, auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { getMondayWeek, formatWeekDisplay, getWeeksBetween } from '../utils/weekCalculation';
import { FixedWakeHeader, getGapAfterHeader } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import MuscleSilhouette from '../components/MuscleSilhouette';
import WeeklyMuscleVolumeCard from '../components/WeeklyMuscleVolumeCard';
import MuscleVolumeStats from '../components/MuscleVolumeStats';
import WeeklyVolumeTrendChart from '../components/WeeklyVolumeTrendChart';
import SvgChevronDown from '../components/icons/vectors_fig/Arrow/ChevronDown';
import SvgChevronRight from '../components/icons/vectors_fig/Arrow/ChevronRight';
import muscleVolumeInfoService from '../services/muscleVolumeInfoService';
import logger from '../utils/logger';
import WakeLoader from '../components/WakeLoader';

const WeeklyVolumeHistoryScreen = ({ navigation }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerHeight = Platform.OS === 'web' ? 32 : Math.max(40, Math.min(44, screenHeight * 0.055));
  const safeAreaTopForSpacer = Platform.OS === 'web' ? Math.max(0, insets.top) : Math.max(0, insets.top - 8);
  const headerTotalHeight = headerHeight + safeAreaTopForSpacer;
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );
  const { user: contextUser } = useAuth();
  // Fallback to Firebase auth when AuthContext user isn't ready yet (e.g. web/IndexedDB restore)
  const user = contextUser || auth.currentUser;
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [weeklyVolumes, setWeeklyVolumes] = useState({});
  const [weeklyMuscleVolume, setWeeklyMuscleVolume] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [isWeekSelectorVisible, setIsWeekSelectorVisible] = useState(false);
  
  // Muscle volume info modal state
  const [isMuscleVolumeInfoModalVisible, setIsMuscleVolumeInfoModalVisible] = useState(false);
  const [selectedMuscleVolumeInfo, setSelectedMuscleVolumeInfo] = useState(null);
  
  // Scroll tracking for pagination indicator
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const currentWeekKey = getMondayWeek();
    setCurrentWeek(currentWeekKey);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    loadAvailableWeeks();
  }, [user?.uid]);

  useEffect(() => {
    if (selectedWeek) {
      loadWeeklyData(selectedWeek);
    }
  }, [selectedWeek]);

  // Log user/id when volume section is shown (to verify userId is passed correctly to WeeklyMuscleVolumeCard)
  useEffect(() => {
    if (selectedWeek && user) {
      logger.log('[WeeklyVolumeHistoryScreen] User for volume card:', { hasUser: true, uid: user.uid });
    } else if (selectedWeek) {
      logger.warn('[WeeklyVolumeHistoryScreen] Volume section visible but no user:', { selectedWeek });
    }
  }, [selectedWeek, user]);

  const loadAvailableWeeks = async () => {
    if (!user?.uid) {
      logger.warn('[WeeklyVolumeHistoryScreen] loadAvailableWeeks skipped – no user');
      return;
    }
    try {
      setLoading(true);
      const userDocRef = doc(firestore, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      const currentWeekKey = getMondayWeek();
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const weeklyMuscleVolumeData = data.weeklyMuscleVolume || {};
        setWeeklyMuscleVolume(weeklyMuscleVolumeData);
        
        // Get all weeks with data
        const weeksWithData = Object.keys(weeklyMuscleVolumeData)
          .filter(week => Object.keys(weeklyMuscleVolumeData[week]).length > 0);
        
        // Generate all weeks from the first week with data (or 12 weeks ago) to current week
        let startDate;
        if (weeksWithData.length > 0) {
          // Find the earliest week with data
          const sortedWeeksWithData = weeksWithData.sort((a, b) => a.localeCompare(b));
          const firstWeekWithData = sortedWeeksWithData[0];
          // Parse the first week to get its start date
          const [year, weekWithW] = firstWeekWithData.split('-');
          const week = weekWithW.replace('W', '');
          const jan1 = new Date(year, 0, 1);
          const jan1Day = jan1.getDay();
          const daysToFirstMonday = jan1Day === 0 ? 1 : 8 - jan1Day;
          const firstMonday = new Date(jan1);
          firstMonday.setDate(jan1.getDate() + daysToFirstMonday);
          const weekStart = new Date(firstMonday);
          weekStart.setDate(firstMonday.getDate() + (parseInt(week) - 1) * 7);
          startDate = weekStart;
        } else {
          // If no data, show last 12 weeks
          startDate = new Date();
          startDate.setDate(startDate.getDate() - (12 * 7));
        }
        
        // Generate all weeks from start date to current week
        const allWeeks = getWeeksBetween(startDate, new Date());
        
        // Sort newest first so current week appears at top of week selector
        const weeks = [...allWeeks].sort((a, b) => b.localeCompare(a));
        
        setAvailableWeeks(weeks);
        
        // Set current week as default
        setSelectedWeek(currentWeekKey);
        
        logger.log('✅ Available weeks loaded:', weeks.length, 'weeks');
        logger.log('🔍 DEBUG: Weeks with data:', weeksWithData.length);
        logger.log('🔍 DEBUG: Current week key:', currentWeekKey);
      } else {
        // Even if no data exists, show last 12 weeks
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (12 * 7));
        const allWeeks = getWeeksBetween(startDate, new Date());
        const weeks = [...allWeeks].sort((a, b) => b.localeCompare(a));
        setAvailableWeeks(weeks);
        setSelectedWeek(currentWeekKey);
        logger.log('✅ No data found, showing last 12 weeks:', weeks.length);
      }
    } catch (error) {
      logger.error('❌ Error loading available weeks:', error);
      // Fallback: show last 12 weeks
      const currentWeekKey = getMondayWeek();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (12 * 7));
      const allWeeks = getWeeksBetween(startDate, new Date());
      const weeks = [...allWeeks].sort((a, b) => b.localeCompare(a));
      setAvailableWeeks(weeks);
      setSelectedWeek(currentWeekKey);
      logger.log('✅ Error fallback, showing last 12 weeks:', weeks.length);
    } finally {
      setLoading(false);
    }
  };

  const loadWeeklyData = async (week) => {
    try {
      setLoadingWeek(true);
      const userDocRef = doc(firestore, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const weekData = data.weeklyMuscleVolume?.[week] || {};
        setWeeklyVolumes(weekData);
        logger.log('✅ Weekly data loaded for week:', week, weekData);
      } else {
        setWeeklyVolumes({});
      }
    } catch (error) {
      logger.error('❌ Error loading weekly data:', error);
      setWeeklyVolumes({});
    } finally {
      setLoadingWeek(false);
    }
  };

  // Scroll handler for pagination indicator
  const onMuscleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
        <FixedWakeHeader 
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <View style={{ height: headerTotalHeight }} />
          <View style={{ marginTop: getGapAfterHeader() }}>
            <WakeLoader size={80} />
            <Text style={styles.loadingText}>Cargando historial...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (availableWeeks.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
        <FixedWakeHeader 
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.emptyContainer}>
          <View style={{ height: headerTotalHeight }} />
          <View style={{ marginTop: getGapAfterHeader() }}>
            <Text style={styles.emptyTitle}>No hay datos de volumen</Text>
            <Text style={styles.emptyText}>
              Completa algunos entrenamientos para ver tu historial de volumen semanal.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Spacer for fixed header - matches header height */}
          <View style={{ height: headerTotalHeight }} />
          <View style={{ marginTop: getGapAfterHeader(), paddingTop: Math.max(48, screenHeight * 0.1) }}>
          <Text style={styles.title}>Historial de Volumen</Text>

          {/* Weekly Volume Trend Chart */}
          <WeeklyVolumeTrendChart weeklyMuscleVolume={weeklyMuscleVolume} />

          {/* Muscle Volume Stats */}
          <MuscleVolumeStats weeklyMuscleVolume={weeklyMuscleVolume} />

          {/* Muscle Volume Section */}
          {selectedWeek && (
            <View style={styles.muscleVolumeSectionWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={screenWidth - Math.max(40, screenWidth * 0.1) + 15}
                snapToAlignment="start"
                decelerationRate="fast"
                contentContainerStyle={styles.muscleCardsScrollContainer}
                style={styles.muscleVolumeSection}
                onScroll={onMuscleScroll}
                scrollEventThrottle={16}
              >
                {/* CARD 1: Muscle Silhouette */}
                <View style={styles.muscleCardFirst}>
                  <MuscleSilhouette 
                    muscleVolumes={weeklyVolumes} 
                    weekDisplayName={selectedWeek ? formatWeekDisplay(selectedWeek) : formatWeekDisplay(currentWeek)}
                    availableWeeks={availableWeeks}
                    selectedWeek={selectedWeek}
                    currentWeek={currentWeek}
                    onWeekChange={setSelectedWeek}
                    onInfoPress={handleMuscleVolumeInfoPress}
                  />
                </View>
                
                {/* CARD 2: Weekly Sets List */}
                <View style={styles.muscleCardSecond}>
                  <WeeklyMuscleVolumeCard 
                    userId={user?.uid} 
                    selectedWeek={selectedWeek}
                    weekDisplayName={selectedWeek ? formatWeekDisplay(selectedWeek) : formatWeekDisplay(currentWeek)}
                    onInfoPress={handleMuscleVolumeInfoPress}
                  />
                </View>
              </ScrollView>
              
              {/* Pagination Indicators */}
              <View style={styles.paginationContainer}>
                {[0, 1].map((index) => {
                  const cardWidth = screenWidth - Math.max(40, screenWidth * 0.1) + 15;
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
          )}

          {loadingWeek && (
            <View style={styles.weekLoadingContainer}>
              <WakeLoader size={40} />
              <Text style={styles.weekLoadingText}>Cargando semana...</Text>
            </View>
          )}
          <BottomSpacer />
          </View>
        </View>
      </ScrollView>

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
    overflow: 'visible',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 0, // No extra padding - spacer handles it
    paddingBottom: 40,
    overflow: 'visible',
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#cccccc',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
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
  weekLoadingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  weekLoadingText: {
    color: '#cccccc',
    fontSize: 14,
    marginLeft: 8,
  },
  // Muscle Volume Section Styles (reused from WorkoutCompletionScreen)
  muscleVolumeSectionWrapper: {
    marginHorizontal: -24,
    marginBottom: Math.max(20, screenHeight * 0.025),
    overflow: 'visible',
  },
  muscleVolumeSection: {
    overflow: 'visible',
  },
  muscleCardsScrollContainer: {
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    gap: 0,
    overflow: 'visible',
  },
  muscleCardFirst: {
    width: screenWidth - Math.max(40, screenWidth * 0.1),
    marginRight: 15,
    overflow: 'visible',
  },
  muscleCardSecond: {
    width: screenWidth - Math.max(40, screenWidth * 0.1),
    overflow: 'visible',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  // Muscle Volume Info Modal Styles
  muscleVolumeInfoModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  muscleVolumeInfoModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  muscleVolumeInfoModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    width: Math.max(350, screenWidth * 0.9),
    maxWidth: 400,
    height: Math.max(500, screenHeight * 0.7),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
  },
  muscleVolumeInfoScrollContainer: {
    flex: 1,
    position: 'relative',
  },
  muscleVolumeInfoScrollView: {
    flex: 1,
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
  },
  muscleVolumeInfoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
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
  disclaimersSection: {
    marginTop: Math.max(20, screenHeight * 0.025),
    paddingTop: Math.max(16, screenHeight * 0.02),
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
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
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  scrollIndicator: {
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
    paddingBottom: 8,
  },
  scrollIndicatorText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
  },
});

export { WeeklyVolumeHistoryScreen as WeeklyVolumeHistoryScreenBase };
export default WeeklyVolumeHistoryScreen;