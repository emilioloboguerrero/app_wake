import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { getMondayWeek, formatWeekDisplay } from '../utils/weekCalculation';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import MuscleSilhouette from '../components/MuscleSilhouette';
import WeeklyMuscleVolumeCard from '../components/WeeklyMuscleVolumeCard';
import MuscleVolumeStats from '../components/MuscleVolumeStats';
import WeeklyVolumeTrendChart from '../components/WeeklyVolumeTrendChart';
import SvgChevronDown from '../components/icons/vectors_fig/Arrow/ChevronDown';
import SvgChevronRight from '../components/icons/vectors_fig/Arrow/ChevronRight';
import muscleVolumeInfoService from '../services/muscleVolumeInfoService';
import logger from '../utils/logger';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const WeeklyVolumeHistoryScreen = ({ navigation }) => {
  const { user } = useAuth();
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
    loadAvailableWeeks();
    const currentWeekKey = getMondayWeek();
    setCurrentWeek(currentWeekKey);
    
    // Debug: Log what week October 18th should be
    const testDate = new Date(2025, 9, 18); // October 18, 2025 (month is 0-indexed)
    const testWeek = getMondayWeek(testDate);
    logger.log('🔍 DEBUG: October 18, 2025 should be in week:', testWeek);
    logger.log('🔍 DEBUG: Current week calculation:', currentWeekKey);
    logger.log('🔍 DEBUG: Current week display:', formatWeekDisplay(currentWeekKey));
  }, []);

  useEffect(() => {
    if (selectedWeek) {
      loadWeeklyData(selectedWeek);
    }
  }, [selectedWeek]);

  const loadAvailableWeeks = async () => {
    try {
      setLoading(true);
      const userDocRef = doc(firestore, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const weeklyMuscleVolumeData = data.weeklyMuscleVolume || {};
        setWeeklyMuscleVolume(weeklyMuscleVolumeData);
        
        // Get all weeks with data
        const weeksWithData = Object.keys(weeklyMuscleVolumeData)
          .filter(week => Object.keys(weeklyMuscleVolumeData[week]).length > 0);
        
        // Add current week if not already present
        const currentWeekKey = getMondayWeek();
        const allWeeks = [...new Set([...weeksWithData, currentWeekKey])];
        
        // Sort them (oldest first, newest last)
        const weeks = allWeeks.sort((a, b) => a.localeCompare(b));
        
        setAvailableWeeks(weeks);
        
        // Set current week as default, fallback to newest if current week not available
        if (weeks.includes(currentWeekKey)) {
          setSelectedWeek(currentWeekKey);
        } else if (weeks.length > 0) {
          setSelectedWeek(weeks[weeks.length - 1]); // Last item (newest)
        }
        
        logger.log('✅ Available weeks loaded:', weeks);
        logger.log('🔍 DEBUG: Weeks with data:', weeksWithData);
        logger.log('🔍 DEBUG: Current week key:', currentWeekKey);
      } else {
        // Even if no data exists, include current week
        const currentWeekKey = getMondayWeek();
        setAvailableWeeks([currentWeekKey]);
        setSelectedWeek(currentWeekKey);
        logger.log('✅ No data found, showing current week:', currentWeekKey);
      }
    } catch (error) {
      logger.error('❌ Error loading available weeks:', error);
      // Fallback: include current week
      const currentWeekKey = getMondayWeek();
      setAvailableWeeks([currentWeekKey]);
      setSelectedWeek(currentWeekKey);
      logger.log('✅ Error fallback, showing current week:', currentWeekKey);
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
      <SafeAreaView style={styles.container}>
        <FixedWakeHeader 
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.loadingContainer}>
          <WakeHeaderSpacer />
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Cargando historial...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (availableWeeks.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <FixedWakeHeader 
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <View style={styles.emptyContainer}>
          <WakeHeaderSpacer />
          <Text style={styles.emptyTitle}>No hay datos de volumen</Text>
          <Text style={styles.emptyText}>
            Completa algunos entrenamientos para ver tu historial de volumen semanal.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <WakeHeaderSpacer />
          
          {/* Title */}
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
              <ActivityIndicator size="small" color="rgba(191, 168, 77, 1)" />
              <Text style={styles.weekLoadingText}>Cargando semana...</Text>
            </View>
          )}
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

const styles = StyleSheet.create({
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
    paddingBottom: Math.max(100, screenHeight * 0.12), // Added bottom padding for desliza overlay
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

export default WeeklyVolumeHistoryScreen;