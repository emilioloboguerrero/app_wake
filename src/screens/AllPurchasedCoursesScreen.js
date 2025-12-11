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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import purchaseService from '../services/purchaseService';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import SvgChevronRight from '../components/icons/vectors_fig/Arrow/ChevronRight';
import logger from '../utils/logger.js';
const AllPurchasedCoursesScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.uid) {
      fetchAllCourses();
    }
  }, [user]);

  // Refresh when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (user?.uid) {
        logger.log('🔄 AllPurchasedCoursesScreen focused - refreshing...');
        fetchAllCourses();
      }
    }, [user?.uid])
  );

  const fetchAllCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      logger.log('📚 Fetching ALL purchased courses for user:', user.uid);
      // includeInactive = true to get all courses including expired/completed
      const courses = await purchaseService.getUserPurchasedCourses(user.uid, true);
      logger.log('✅ Fetched all courses:', courses.length, courses);
      setAllCourses(courses);
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

    return (
      <View key={purchaseData.id || index} style={styles.courseCardWrapper}>
        <View style={styles.courseCardContainer}>
          <TouchableOpacity
            style={styles.courseCard}
            onPress={() => handleCoursePress(purchaseData)}
          >
            <View style={styles.courseImagePlaceholder}>
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

  const categorizedCourses = {
    active: allCourses.filter(course => course.isActive),
    completed: allCourses.filter(course => course.isCompleted),
    expired: allCourses.filter(course => course.isExpired)
  };

  return (
    <SafeAreaView style={styles.container}>
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
        <View style={styles.content}>
          {/* Spacer for fixed header */}
          <WakeHeaderSpacer />

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
              <View style={styles.categorySection}>
                <Text style={styles.categoryTitle}>Activos ({categorizedCourses.active.length})</Text>
                {categorizedCourses.active.length > 0 ? (
                  categorizedCourses.active.map((purchaseData, index) => renderCourseCard(purchaseData, index))
                ) : (
                  <Text style={styles.emptySectionText}>No hay programas activos</Text>
                )}
              </View>

              {/* Expirados Section */}
              <View style={styles.categorySection}>
                <Text style={styles.categoryTitle}>Expirados ({categorizedCourses.expired.length})</Text>
                {categorizedCourses.expired.length > 0 ? (
                  categorizedCourses.expired.map((purchaseData, index) => renderCourseCard(purchaseData, index))
                ) : (
                  <Text style={styles.emptySectionText}>No hay programas expirados</Text>
                )}
              </View>
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
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 80,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
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
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
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
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
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
    backgroundColor: '#007AFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  disciplineBadgeText: {
    color: '#ffffff',
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
    color: '#007AFF',
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
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
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
    shadowColor: 'rgba(191, 168, 77, 0.72)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  exploreButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AllPurchasedCoursesScreen;
