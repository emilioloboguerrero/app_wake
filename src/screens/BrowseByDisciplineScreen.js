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
  Alert,
} from 'react-native';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import disciplineImagesService from '../services/disciplineImagesService';
import SvgCloudOff from '../components/icons/vectors_fig/File/Cloud_Off';
import logger from '../utils/logger.js';
const BrowseByDisciplineScreen = ({ navigation, route }) => {
  const { disciplines, courses } = route.params;
  const [selectedDiscipline, setSelectedDiscipline] = useState(null);
  const [disciplineCourses, setDisciplineCourses] = useState([]);
  const [disciplineImages, setDisciplineImages] = useState({});
  const [loadingImages, setLoadingImages] = useState(true);
  const [imageLoadingStates, setImageLoadingStates] = useState({});
  const [courseImageLoadingStates, setCourseImageLoadingStates] = useState({});

  useEffect(() => {
    loadDisciplineImages();
  }, []);

  const loadDisciplineImages = async () => {
    try {
      setLoadingImages(true);
      const images = await disciplineImagesService.getDisciplineImages();
      setDisciplineImages(images);
      
    } catch (error) {
      logger.error('Error loading discipline images:', error);
    } finally {
      setLoadingImages(false);
    }
  };

  const handleImageLoad = (discipline) => {
    setImageLoadingStates(prev => ({
      ...prev,
      [discipline]: false
    }));
  };

  const handleImageError = (discipline) => {
    setImageLoadingStates(prev => ({
      ...prev,
      [discipline]: false
    }));
  };

  const handleImageLoadStart = (discipline) => {
    setImageLoadingStates(prev => ({
      ...prev,
      [discipline]: true
    }));
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

  const handleDisciplineSelect = (discipline) => {
    setSelectedDiscipline(discipline);
    
    // Filter courses by selected discipline
    const filtered = courses.filter(course => course.discipline === discipline);
    setDisciplineCourses(filtered);
  };

  const handleCoursePress = (course) => {
    navigation.navigate('CourseDetail', { course });
  };

  const renderDisciplineCard = (discipline) => {
    // Extract the first word from the discipline name (before dash, space, etc.)
    const firstWord = discipline.split(/[\s\-–—]/)[0].toLowerCase().trim();
    
    // Try multiple variations to find the image
    const imageUrl = disciplineImages[discipline] || 
                    disciplineImages[discipline.toLowerCase()] || 
                    disciplineImages[discipline.toUpperCase()] ||
                    disciplineImages[firstWord] ||
                    disciplineImages[firstWord.toUpperCase()];
    
    const isImageLoading = imageLoadingStates[discipline] === true;
    
    return (
      <TouchableOpacity
        key={discipline}
        style={[
          styles.disciplineCard,
          imageUrl && {
            borderWidth: 0,
          }
        ]}
        onPress={() => handleDisciplineSelect(discipline)}
      >
        {imageUrl ? (
          <ImageBackground
            source={{ uri: imageUrl }}
            style={styles.disciplineImageBackground}
            imageStyle={styles.disciplineImage}
            resizeMode="cover"
            onLoadStart={() => handleImageLoadStart(discipline)}
            onLoad={() => handleImageLoad(discipline)}
            onError={() => handleImageError(discipline)}
          >
            <View style={styles.disciplineImageOverlay}>
              <View style={styles.disciplineInfo}>
                <Text style={styles.disciplineName}>{discipline}</Text>
              </View>
            </View>
          </ImageBackground>
        ) : (
          <View style={styles.disciplineInfo}>
            <View style={styles.disciplineIconContainer}>
              <SvgCloudOff 
                width={40} 
                height={40} 
                stroke="#ffffff" 
                strokeWidth={1.5} 
              />
            </View>
            <Text style={styles.disciplineName}>{discipline}</Text>
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
                <Text style={styles.courseCreator}>
                  Por {course.creatorName || 'Creador no especificado'}
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
            <Text style={styles.courseCreator}>
              Por {course.creatorName || 'Creador no especificado'}
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
        onBackPress={() => selectedDiscipline ? setSelectedDiscipline(null) : navigation.goBack()}
      />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Spacer for fixed header */}
          <WakeHeaderSpacer />

          {/* Title */}
          <Text style={styles.screenTitle}>
            {selectedDiscipline ? selectedDiscipline : 'Disciplinas'}
          </Text>

          {/* Content */}
          {!selectedDiscipline ? (
            // Show list of disciplines
            <View style={styles.disciplinesSection}>
              <View style={styles.disciplinesContainer}>
                {disciplines.map((discipline) => renderDisciplineCard(discipline))}
              </View>
            </View>
          ) : (
            // Show courses by selected discipline
            <View style={styles.coursesSection}>
              <View style={styles.coursesContainer}>
                {disciplineCourses.map((course, index) => renderCourseCard(course, index))}
              </View>

              {disciplineCourses.length === 0 && (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    No hay cursos disponibles para esta disciplina.
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
  disciplinesSection: {
    flex: 1,
  },
  disciplinesContainer: {
    gap: 15,
  },
  disciplineCard: {
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
  disciplineInfo: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
    height: 170,
  },
  disciplineIconContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -20 }, { translateY: -20 }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  disciplineImageBackground: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  disciplineImage: {
    borderRadius: 12,
    opacity: 1,
  },
  disciplineImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
  },
  disciplineName: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
  },
  disciplineStats: {
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
  courseCreator: {
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

export default BrowseByDisciplineScreen;
