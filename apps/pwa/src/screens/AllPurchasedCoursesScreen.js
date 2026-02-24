import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { isWeb } from '../utils/platform';
import purchaseService from '../services/purchaseService';
import consolidatedDataService from '../services/consolidatedDataService';
import { auth } from '../config/firebase';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import LoadingSpinner from '../components/LoadingSpinner';
import SvgChevronRight from '../components/icons/vectors_fig/Arrow/ChevronRight';
import logger from '../utils/logger.js';
const AllPurchasedCoursesScreen = ({ navigation }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user: contextUser } = useAuth();
  const insets = useSafeAreaInsets();
  
  // CRITICAL: Use Firebase auth directly as fallback if AuthContext user isn't available yet
  // This handles the case where Firebase has restored auth from IndexedDB but AuthContext hasn't updated
  const user = contextUser || auth.currentUser;
  
  const headerHeight = Platform.OS === 'web' ? 32 : Math.max(40, Math.min(44, screenHeight * 0.055));
  const safeAreaTopForSpacer = Platform.OS === 'web' ? Math.max(0, insets.top) : Math.max(0, insets.top - 8);
  const headerTotalHeight = headerHeight + safeAreaTopForSpacer;
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.uid) {
      logger.log('🔄 AllPurchasedCoursesScreen: useEffect triggered, user.uid:', user.uid);
      fetchAllCourses();
    } else {
      logger.log('⚠️ AllPurchasedCoursesScreen: useEffect triggered but no user.uid');
    }
  }, [user]);

  // Refresh when screen comes into focus
  // On web, useFocusEffect doesn't work (no NavigationContainer), so we use useEffect instead
  const focusCallback = React.useCallback(() => {
    if (user?.uid) {
      logger.log('🔄 AllPurchasedCoursesScreen focused - refreshing...');
      fetchAllCourses();
    }
  }, [user?.uid]);

  // Use platform-specific focus effect
  // On web, we'll use useEffect; on native, use useFocusEffect
  // Note: isWeb is constant at module level, so conditional hook call is safe
  if (!isWeb) {
    useFocusEffect(focusCallback);
  } else {
    // On web, use useEffect since there's no NavigationContainer
    useEffect(() => {
      if (user?.uid) {
        focusCallback();
      }
    }, [user?.uid, focusCallback]);
  }

  const fetchAllCourses = async () => {
    try {
      logger.log('🚀 AllPurchasedCoursesScreen.fetchAllCourses: START');
      setLoading(true);
      setError(null);
      logger.log('📚 Fetching ALL purchased courses for user:', user.uid);
      
      // Get all courses (including inactive/expired) from purchaseService
      // This gives us the status information (isActive, isExpired, etc.)
      const allPurchasedCourses = await purchaseService.getUserPurchasedCourses(user.uid, true);
      logger.log('✅ AllPurchasedCoursesScreen: Fetched all purchased courses:', allPurchasedCourses.length);
      logger.log('📋 AllPurchasedCoursesScreen: Course data:', allPurchasedCourses);
      
      // Use the same service that MainScreen uses for consistency
      // This ensures we get the same data structure and course details
      const result = await consolidatedDataService.getUserCoursesWithDetails(user.uid);
      logger.log('✅ AllPurchasedCoursesScreen: Consolidated service result:', {
        coursesCount: result?.courses?.length || 0,
        hasDownloadedData: !!result?.downloadedData
      });
      
      // Use purchaseService data if available (it has status info)
      // Otherwise fallback to consolidated service
      let courses = [];
      if (allPurchasedCourses.length > 0) {
        logger.log('✅ AllPurchasedCoursesScreen: Using purchaseService courses');
        courses = allPurchasedCourses;
      } else if (result?.courses && result.courses.length > 0) {
        // Fallback: build course structure from consolidated service
        logger.log('⚠️ AllPurchasedCoursesScreen: purchaseService returned empty, using consolidated service data');
        const now = new Date();
        courses = result.courses.map(course => {
          // Try to get status from course data if available
          const isActive = course.status === 'active' || course.isActive === true;
          const expiresAt = course.expires_at || course.expiresAt;
          const isNotExpired = expiresAt ? new Date(expiresAt) > now : true;
          const isCancelled = course.status === 'cancelled';
          
          return {
            id: `${user.uid}-${course.id}`,
            courseId: course.id,
            courseData: {
              status: course.status || 'active',
              expires_at: expiresAt,
              purchased_at: course.purchased_at || new Date().toISOString()
            },
            courseDetails: course,
            isActive: isActive && isNotExpired,
            isExpired: !isNotExpired && !isCancelled,
            isCompleted: false,
            status: course.status || 'active',
            expires_at: expiresAt
          };
        });
      }
      
      logger.log('✅ AllPurchasedCoursesScreen: Final courses to display:', courses.length);
      logger.log('📋 AllPurchasedCoursesScreen: Course data structure:', courses.map(c => ({
        id: c.id,
        courseId: c.courseId,
        title: c.courseDetails?.title,
        isActive: c.isActive,
        isExpired: c.isExpired,
        isCompleted: c.isCompleted,
        status: c.status
      })));
      logger.log('💾 AllPurchasedCoursesScreen: Setting allCourses state with', courses.length, 'courses');
      setAllCourses(courses);
      logger.log('✅ AllPurchasedCoursesScreen: setAllCourses called, state should update');
    } catch (error) {
      logger.error('❌ Error fetching all purchased courses:', error);
      setError('Error al cargar tus cursos');
    } finally {
      setLoading(false);
    }
  };

  const handleCoursePress = (purchaseData) => {
    navigation.navigate('CourseDetail', { course: purchaseData.courseDetails });
  };

  const getStatusBadge = (purchase) => {
    if (purchase.isCompleted) {
      return { text: 'Completado', style: styles.completedBadge };
    } else if (purchase.isExpired) {
      return { text: 'Expirado', style: styles.expiredBadge };
    } else if (purchase.isActive) {
      return { text: 'Activo', style: styles.activeBadge };
    }
    return { text: 'Desconocido', style: styles.unknownBadge };
  };

  const renderCourseCard = (purchaseData, index) => {
    const course = purchaseData.courseDetails;
    const isOneOnOne = purchaseData.courseData?.deliveryType === 'one_on_one';

    return (
      <View key={purchaseData.id || index} style={styles.courseCardWrapper}>
        <View style={styles.courseCardContainer}>
          <TouchableOpacity
            style={styles.courseCard}
            onPress={() => handleCoursePress(purchaseData)}
          >
            <View style={styles.courseImagePlaceholder}>
              {isOneOnOne && (
                <View style={styles.oneOnOneBadge}>
                  <Text style={styles.oneOnOneBadgeText}>Asignado</Text>
                </View>
              )}
              {course.image_url ? (
                <Image
                  source={{ uri: course.image_url }}
                  style={styles.courseImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.courseImageFallback}>
                  <Text style={styles.fallbackText}>📚</Text>
                </View>
              )}
            </View>
            <View style={styles.courseContent}>
              <Text style={styles.courseTitle}>
                {course.title || 'Curso sin título'}
              </Text>
              <Text style={styles.courseInfo}>
                Por {course.creatorName || 'Creador no especificado'} | {course.discipline || 'General'}
              </Text>
            </View>
            <SvgChevronRight 
              width={20} 
              height={20} 
              stroke="#ffffff" 
              strokeWidth={2} 
              style={styles.courseArrow}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Categorize courses - ensure all courses are shown even if they don't match a category
  const categorizedCourses = React.useMemo(() => {
    logger.log('🔍 Categorizing courses, allCourses.length:', allCourses.length);
    logger.log('🔍 allCourses array:', allCourses);
    
    const active = allCourses.filter(course => course.isActive === true);
    const expired = allCourses.filter(course => course.isExpired === true);
    const completed = allCourses.filter(course => course.isCompleted === true);
    // Get uncategorized courses (fallback - show all courses that don't fit other categories)
    const uncategorized = allCourses.filter(course => 
      !course.isActive && !course.isExpired && !course.isCompleted
    );
    
    logger.log('🔍 AllPurchasedCoursesScreen - Course categorization:', {
      total: allCourses.length,
      active: active.length,
      expired: expired.length,
      completed: completed.length,
      uncategorized: uncategorized.length,
      courses: allCourses.map(c => ({
        title: c.courseDetails?.title,
        isActive: c.isActive,
        isExpired: c.isExpired,
        isCompleted: c.isCompleted,
        status: c.status
      }))
    });
    
    return { active, expired, completed, uncategorized };
  }, [allCourses]);

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      {/* Fixed Header with Back Button */}
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <WakeHeaderContent style={styles.content}>
          {/* Spacer for fixed header - matches header height */}
          <View style={{ height: headerTotalHeight }} />

          {/* Title */}
          <Text style={styles.screenTitle}>Todos mis programas</Text>

          {loading ? (
            <LoadingSpinner 
              size="large" 
              text="Cargando todos tus cursos..." 
              containerStyle={styles.loadingContainer}
            />
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchAllCourses}>
                <Text style={styles.retryButtonText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : allCourses.length > 0 ? (
            <View style={styles.coursesContainer}>
              {/* Activos Section */}
              {categorizedCourses.active.length > 0 && (
                <View style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>Activos ({categorizedCourses.active.length})</Text>
                  {categorizedCourses.active.map((purchaseData, index) => renderCourseCard(purchaseData, index))}
                </View>
              )}

              {/* Expirados Section */}
              {categorizedCourses.expired.length > 0 && (
                <View style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>Expirados ({categorizedCourses.expired.length})</Text>
                  {categorizedCourses.expired.map((purchaseData, index) => renderCourseCard(purchaseData, index))}
                </View>
              )}
              
              {/* Uncategorized Section - Show courses that don't fit other categories */}
              {categorizedCourses.uncategorized.length > 0 && (
                <View style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>Todos ({categorizedCourses.uncategorized.length})</Text>
                  {categorizedCourses.uncategorized.map((purchaseData, index) => renderCourseCard(purchaseData, index))}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No tienes ningún programa... todavía.</Text>
              <TouchableOpacity 
                style={styles.exploreButton} 
                onPress={() => navigation.navigate('Main', { screen: 'ProgramLibrary' })}
                activeOpacity={0.7}
                delayPressIn={0}
              >
                <Text style={styles.exploreButtonText}>Explorar biblioteca</Text>
              </TouchableOpacity>
            </View>
          )}
          <BottomSpacer />
        </WakeHeaderContent>
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
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 24,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
    marginTop: 0, // No margin - spacer positions it correctly
    marginBottom: 20,
    marginLeft: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: '#cccccc',
    fontSize: 16,
    fontWeight: '400',
    marginTop: 12,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '400',
    fontWeight: '600',
  },
  coursesContainer: {
    gap: 30,
  },
  summaryContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    alignItems: 'center',
  },
  summaryText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  summaryBreakdown: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
  },
  categorySection: {
    gap: 15,
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 5,
  },
  emptySectionText: {
    fontSize: 16,
    color: '#999999',
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  courseCardWrapper: {
  },
  courseCardContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 2px rgba(255,255,255,0.4)' } : { shadowColor: 'rgba(255, 255, 255, 0.4)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 2 }),
    elevation: 2,
    overflow: 'visible',
  },
  courseCard: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  courseImagePlaceholder: {
    width: 70,
    height: 70,
    backgroundColor: '#555555',
    borderRadius: 8,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  oneOnOneBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.4)',
    backgroundColor: 'rgba(52, 199, 89, 0.2)',
    zIndex: 5,
  },
  oneOnOneBadgeText: {
    color: 'rgba(52, 199, 89, 1)',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  courseImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  courseImageFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    fontSize: 24,
    color: '#ffffff',
  },
  courseContent: {
    flex: 1,
  },
  courseTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  courseInfo: {
    fontSize: 14,
    color: '#cccccc',
  },
  courseArrow: {
    marginLeft: 8,
  },
  inactiveCourseCard: {
    opacity: 0.7,
    backgroundColor: '#252525',
  },
  courseHeader: {
    marginBottom: 12,
  },
  courseTitleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  courseTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    marginRight: 12,
  },
  disciplineBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  disciplineBadgeText: {
    color: '#cccccc',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  activeBadge: {
    backgroundColor: '#28a745',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  completedBadge: {
    backgroundColor: '#6f42c1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  expiredBadge: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  unknownBadge: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  courseDescription: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    marginBottom: 12,
  },
  inactiveText: {
    color: '#999999',
  },
  courseFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  courseDuration: {
    color: '#999999',
    fontSize: 12,
    fontWeight: '400',
  },
  purchaseDate: {
    color: '#cccccc',
    fontSize: 12,
    fontWeight: '400',
    fontWeight: '500',
  },
  expirationInfo: {
    backgroundColor: '#dc354520',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  expirationText: {
    color: '#dc3545',
    fontSize: 12,
    fontWeight: '400',
    fontWeight: '500',
    textAlign: 'center',
  },
  completionInfo: {
    backgroundColor: '#6f42c120',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  completionText: {
    color: '#6f42c1',
    fontSize: 12,
    fontWeight: '400',
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 2px rgba(255,255,255,0.4)' } : { shadowColor: 'rgba(255, 255, 255, 0.4)', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 2 }),
    elevation: 2,
    overflow: 'visible',
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 50,
    textAlign: 'center',
  },
  emptyText: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  exploreButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 0,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 8px rgba(191,168,77,0.22)' } : { shadowColor: 'rgba(191, 168, 77, 0.72)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }),
    elevation: 8,
  },
  exploreButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 16,
    fontWeight: '600',
  },
});

// Export both default and named for web wrapper compatibility
export { AllPurchasedCoursesScreen as AllPurchasedCoursesScreenBase };
export default AllPurchasedCoursesScreen;
