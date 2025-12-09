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
  ImageBackground,
} from 'react-native';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import SvgCloudOff from '../components/icons/vectors_fig/File/Cloud_Off';
import firestoreService from '../services/firestoreService';
import logger from '../utils/logger.js';
const BrowseByCreatorScreen = ({ navigation, route }) => {
  const { creators, courses } = route.params;
  const [selectedCreator, setSelectedCreator] = useState(null);
  const [creatorCourses, setCreatorCourses] = useState([]);
  const [courseImageLoadingStates, setCourseImageLoadingStates] = useState({});
  const [creatorNames, setCreatorNames] = useState({});
  const [creatorImages, setCreatorImages] = useState({});

  useEffect(() => {
    fetchCreatorNames();
  }, []);

  const fetchCreatorNames = async () => {
    try {
      const names = {};
      const images = {};
      
      for (const creatorId of creators) {
        try {
          const userData = await firestoreService.getUser(creatorId);
          names[creatorId] = userData?.displayName || 'No disponible';
          images[creatorId] = userData?.image_url || null;
        } catch (error) {
          names[creatorId] = 'No disponible';
          images[creatorId] = null;
        }
      }
      
      setCreatorNames(names);
      setCreatorImages(images);
    } catch (error) {
      logger.error('Error fetching creator names:', error);
    }
  };

  const handleCreatorSelect = (creatorId) => {
    setSelectedCreator(creatorId);
    
    // Filter courses by selected creator
    const filtered = courses.filter(course => course.creator_id === creatorId);
    setCreatorCourses(filtered);
  };

  const handleCoursePress = (course) => {
    navigation.navigate('CourseDetail', { course });
  };

  const handleCourseImageLoadStart = (courseId) => {
    setCourseImageLoadingStates(prev => ({
      ...prev,
      [courseId]: true
    }));
  };

  const handleCourseImageLoad = (courseId) => {
    setCourseImageLoadingStates(prev => ({
      ...prev,
      [courseId]: false
    }));
  };

  const handleCourseImageError = (courseId) => {
    setCourseImageLoadingStates(prev => ({
      ...prev,
      [courseId]: false
    }));
  };

  const renderCreatorCard = (creatorId) => {
    const creatorName = creatorNames[creatorId] || 'No disponible';
    const creatorImage = creatorImages[creatorId];
    
    return (
      <TouchableOpacity
        key={creatorId}
        style={[
          styles.creatorCard,
          creatorImage && {
            borderWidth: 0,
          }
        ]}
        onPress={() => handleCreatorSelect(creatorId)}
      >
        {creatorImage ? (
          <ImageBackground
            source={{ uri: creatorImage }}
            style={styles.creatorImageBackground}
            imageStyle={styles.creatorImage}
            resizeMode="cover"
          >
            <View style={styles.creatorImageOverlay}>
              <View style={styles.creatorInfo}>
                <Text style={styles.creatorName}>{creatorName}</Text>
              </View>
            </View>
          </ImageBackground>
        ) : (
          <View style={styles.creatorInfo}>
            <View style={styles.creatorIconContainer}>
              <SvgCloudOff 
                width={40} 
                height={40} 
                stroke="#ffffff" 
                strokeWidth={1.5} 
              />
            </View>
            <Text style={styles.creatorName}>{creatorName}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderCourseCard = (course, index) => {
    const isCourseImageLoading = courseImageLoadingStates[course.id] === true;
    
    return (
      <TouchableOpacity
        key={course.id || index}
        style={[
          styles.courseCard,
          course.image_url && {
            borderWidth: 0,
          }
        ]}
        onPress={() => handleCoursePress(course)}
      >
        {course.image_url ? (
          <ImageBackground
            source={{ uri: course.image_url }}
            style={styles.courseImageBackground}
            imageStyle={styles.courseImage}
            resizeMode="cover"
            onLoadStart={() => handleCourseImageLoadStart(course.id)}
            onLoad={() => handleCourseImageLoad(course.id)}
            onError={() => handleCourseImageError(course.id)}
          >
            <View style={styles.courseImageOverlay}>
              <View style={styles.courseInfo}>
                <Text style={styles.courseName}>
                  {course.title || `Programa ${index + 1}`}
                </Text>
                <Text style={styles.courseDiscipline}>
                  {course.discipline || 'General'}
                </Text>
              </View>
            </View>
            {isCourseImageLoading && (
              <View style={styles.courseImageLoadingOverlay}>
                <SvgCloudOff 
                  width={40} 
                  height={40} 
                  stroke="#ffffff" 
                  strokeWidth={1.5} 
                />
              </View>
            )}
          </ImageBackground>
        ) : (
          <View style={styles.courseInfo}>
            <View style={styles.courseIconContainer}>
              <SvgCloudOff 
                width={40} 
                height={40} 
                stroke="#ffffff" 
                strokeWidth={1.5} 
              />
            </View>
            <Text style={styles.courseName}>
              {course.title || `Programa ${index + 1}`}
            </Text>
            <Text style={styles.courseDiscipline}>
              {course.discipline || 'General'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed Header with Back Button */}
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={() => selectedCreator ? setSelectedCreator(null) : navigation.goBack()}
      />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Spacer for fixed header */}
          <WakeHeaderSpacer />

          {/* Title */}
          <Text style={styles.screenTitle}>
            {selectedCreator ? (creatorNames[selectedCreator] || 'No disponible') : 'Creadores'}
          </Text>

          {/* Content */}
          {!selectedCreator ? (
            // Show list of creators
            <View style={styles.creatorsSection}>
              <View style={styles.creatorsContainer}>
                {creators.map((creatorId) => renderCreatorCard(creatorId))}
              </View>
            </View>
          ) : (
            // Show courses by selected creator
            <View style={styles.coursesSection}>
              <View style={styles.coursesContainer}>
                {creatorCourses.map((course, index) => renderCourseCard(course, index))}
              </View>

              {creatorCourses.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    Este creador no tiene cursos disponibles.
                  </Text>
                </View>
              )}
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
    paddingTop: 0,
    paddingBottom: 80,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
    marginLeft: 20,
    marginBottom: 30,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#cccccc',
    textAlign: 'center',
    marginBottom: 20,
  },
  creatorsSection: {
    flex: 1,
  },
  creatorsContainer: {
    gap: 15,
  },
  creatorCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#3a3a3a',
    height: 170,
    overflow: 'hidden',
  },
  creatorInfo: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
    height: 170,
  },
  creatorName: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
  },
  creatorImageBackground: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  creatorImage: {
    borderRadius: 12,
    opacity: 1,
  },
  creatorImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
  },
  creatorIconContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -20 }, { translateY: -20 }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorStats: {
    fontSize: 14,
    fontWeight: '400',
    color: '#cccccc',
  },
  coursesSection: {
    flex: 1,
  },
  coursesContainer: {
    gap: 15,
  },
  courseCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#3a3a3a',
    height: 170,
    overflow: 'hidden',
  },
  courseInfo: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
    height: 170,
  },
  courseName: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
  },
  courseDiscipline: {
    fontSize: 14,
    fontWeight: '400',
    color: '#cccccc',
    marginTop: 4,
  },
  courseImageBackground: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  courseImage: {
    borderRadius: 12,
    opacity: 1,
  },
  courseImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
  },
  courseImageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(85, 85, 85, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  courseIconContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -20 }, { translateY: -20 }],
    alignItems: 'center',
    justifyContent: 'center',
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
  difficultyBadge: {
    backgroundColor: '#007AFF20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  difficultyBadgeText: {
    color: '#007AFF',
    fontSize: 11,
    fontWeight: '500',
  },
  courseDescription: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    marginBottom: 12,
  },
  courseFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  courseDuration: {
    color: '#999999',
    fontSize: 12,
    fontWeight: '400',
  },
  viewDetailsText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '400',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#cccccc',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default BrowseByCreatorScreen;
