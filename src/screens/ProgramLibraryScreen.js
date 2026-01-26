import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
  Image,
  Modal,
} from 'react-native';
import Text from '../components/Text';
import TextInput from '../components/TextInput';
// import { PanGestureHandler } from 'react-native-gesture-handler'; // Temporarily disabled
import { useAuth } from '../contexts/AuthContext';
import firestoreService from '../services/firestoreService';
import { isAdmin, isCreator } from '../utils/roleHelper';
import { auth } from '../config/firebase';
import hybridDataService from '../services/hybridDataService';
import purchaseService from '../services/purchaseService';
import tutorialManager from '../services/tutorialManager';
import TutorialOverlay from '../components/TutorialOverlay';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import LoadingSpinner from '../components/LoadingSpinner';
import { KeyboardAvoidingView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import SvgChevronLeft from '../components/icons/vectors_fig/Arrow/ChevronLeft';
import SvgChevronRight from '../components/icons/vectors_fig/Arrow/ChevronRight';
import SvgSearchMagnifyingGlass from '../components/icons/vectors_fig/Interface/SearchMagnifyingGlass';
import SvgCloudOff from '../components/icons/vectors_fig/File/Cloud_Off';
import SvgInfo from '../components/icons/SvgInfo';
import logger from '../utils/logger.js';
const ProgramLibraryScreen = ({ navigation }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user: contextUser } = useAuth();
  
  // FALLBACK: If AuthContext doesn't have user, check Firebase directly
  const [fallbackUser, setFallbackUser] = React.useState(null);
  const [userRole, setUserRole] = React.useState('user');
  
  React.useEffect(() => {
    logger.log(`🔐 [ProgramLibraryScreen] Auth state - contextUser.uid=${contextUser?.uid}, auth.currentUser.uid=${auth.currentUser?.uid}`);
    
    if (!contextUser) {
      // Try to get user directly from Firebase as fallback
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        logger.log('⚠️ [ProgramLibraryScreen] Using fallback Firebase user (AuthContext failed)');
        setFallbackUser(firebaseUser);
      }
    }
  }, [contextUser]);
  
  const user = contextUser || fallbackUser;
  
  // Fetch user role when user becomes available
  React.useEffect(() => {
    const fetchUserRole = async () => {
      const effectiveUser = user || auth.currentUser;
      if (!effectiveUser?.uid) {
        logger.log('⚠️ [ProgramLibraryScreen] No user available for role fetch');
        return;
      }
      
      try {
        logger.log(`🔍 [ProgramLibraryScreen] Fetching user role for uid=${effectiveUser.uid}`);
        const userDoc = await firestoreService.getUser(effectiveUser.uid);
        const role = userDoc?.role || 'user';
        logger.log(`✅ [ProgramLibraryScreen] User role fetched: ${role} (uid=${effectiveUser.uid})`);
        setUserRole(role);
      } catch (error) {
        logger.error('❌ [ProgramLibraryScreen] Error fetching user role:', error);
        setUserRole('user'); // Default to user on error
      }
    };
    
    fetchUserRole();
  }, [user?.uid]);
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );
  
  // Consolidated state management
  const [state, setState] = useState({
    courses: [],
    filteredCourses: [],
    loading: true,
    error: null,
    searchQuery: '',
    creators: [],
    disciplines: [],
    courseModules: {},
    swipedCourses: {}
  });
  
  // Use ref for image loading states to prevent re-renders
  const imageLoadingStatesRef = useRef({});
  // Tutorial state
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialData, setTutorialData] = useState([]);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);
  
  // Info modal state
  const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
  
  // Module cache with TTL (5 minutes)
  const moduleCache = useRef(new Map());
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // Debounced search timer
  const searchTimeoutRef = useRef(null);

  // Check for tutorials to show (defined before fetchCourses since fetchCourses calls it)
  const checkForTutorials = useCallback(async () => {
    const effectiveUser = user || auth.currentUser;
    if (!effectiveUser?.uid) {
      logger.log('⚠️ [ProgramLibraryScreen] No user available for tutorials check');
      return;
    }

    try {
      logger.log(`🎬 [ProgramLibraryScreen] Checking for library screen tutorials for user: ${effectiveUser.uid}`);
      const tutorials = await tutorialManager.getTutorialsForScreen(effectiveUser.uid, 'library');
      
      if (tutorials.length > 0) {
        logger.log('📚 Found tutorials to show:', tutorials.length);
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
      } else {
        logger.log('✅ No tutorials to show for library screen');
      }
    } catch (error) {
      logger.error('❌ [ProgramLibraryScreen] Error checking for tutorials:', error);
    }
  }, [user?.uid]);

  // Define fetchCourses BEFORE useEffect so it can be called
  const fetchCourses = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      // Get effective user (from context or Firebase auth)
      const effectiveUser = user || auth.currentUser;
      
      logger.log(`🔍 [ProgramLibraryScreen] Loading courses - effectiveUser.uid=${effectiveUser?.uid}, userRole=${userRole}, contextUser.uid=${contextUser?.uid}, fallbackUser.uid=${fallbackUser?.uid}`);
      
      if (!effectiveUser?.uid) {
        logger.log('⚠️ [ProgramLibraryScreen] No user available, showing error');
        setState(prev => ({
          ...prev,
          courses: [],
          filteredCourses: [],
          loading: false,
          error: 'Debes iniciar sesión para ver tus programas.'
        }));
        return;
      }
      
      logger.log(`🔍 [ProgramLibraryScreen] Loading all courses for user: ${effectiveUser.uid}, role: ${userRole}`);
      const allCourses = await firestoreService.getCourses(effectiveUser.uid);
      logger.log(`📚 [ProgramLibraryScreen] Total courses fetched: ${allCourses.length}`);
      
      // Filter courses based on user role
      let filteredCourses;
      if (isAdmin(userRole)) {
        // Admins see ALL programs (published + drafts)
        logger.log('👑 [ProgramLibraryScreen] Admin user - showing all programs (published + drafts)');
        filteredCourses = allCourses;
      } else if (isCreator(userRole)) {
        // Creators see published programs + their own drafts
        logger.log(`🎨 [ProgramLibraryScreen] Creator user - showing published + own drafts (uid=${effectiveUser.uid})`);
        filteredCourses = allCourses.filter(course => {
          const isPublished = course.status === 'published';
          const isOwnDraft = course.status !== 'published' && course.creator_id === effectiveUser.uid;
          return isPublished || isOwnDraft;
        });
        logger.log(`📚 [ProgramLibraryScreen] Creator filtered courses: ${filteredCourses.length} (published + own drafts)`);
      } else {
        // Regular users see only published courses
        logger.log('👤 [ProgramLibraryScreen] Regular user - showing only published programs');
        filteredCourses = allCourses.filter(course => course.status === 'published');
      }
      
      logger.log(`✅ [ProgramLibraryScreen] Filtered courses: ${filteredCourses.length} (total: ${allCourses.length})`);
      
      // Transform to match expected format
      const coursesData = filteredCourses.map(course => ({
        id: course.id,
        courseId: course.id,
        title: course.title || 'Programa sin título',
        image_url: course.image_url || null,
        discipline: course.discipline || 'General',
        creator_id: course.creator_id || null,
        creatorName: course.creatorName || course.creator_name || 'Creador no especificado',
        description: course.description || null,
        difficulty: course.difficulty || null,
        duration: course.duration || null,
        price: course.price || null,
        access_duration: course.access_duration || null,
        ...course // Include any other properties
      }));
      
      logger.log(`✅ [ProgramLibraryScreen] Courses loaded: ${coursesData.length} (role=${userRole})`);
      
      // Log sample of courses with their status
      const sampleCourses = coursesData.slice(0, 3).map(c => ({
        id: c.id,
        title: c.title,
        status: c.status,
        creator_id: c.creator_id,
        isOwnDraft: c.status !== 'published' && c.creator_id === effectiveUser.uid
      }));
      logger.log('📊 [ProgramLibraryScreen] Sample courses:', sampleCourses);
      
      setState(prev => ({
        ...prev,
        courses: coursesData,
        filteredCourses: coursesData,
        creators: [], // No longer needed
        disciplines: [], // No longer needed
        loading: false,
        error: coursesData.length === 0 ? 'No hay programas disponibles en este momento.' : null
      }));
      
      // Check for tutorials after loading is complete
      await checkForTutorials();
      
    } catch (error) {
      logger.error('❌ Error loading courses:', error);
      logger.error('❌ Error details:', error.message);
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Error al cargar tus programas. Inténtalo de nuevo.'
      }));
    }
  }, [user?.uid, userRole]); // Added userRole to dependencies so it refetches when role changes

  useEffect(() => {
    // Get effective user (from context or Firebase auth)
    const effectiveUser = user || auth.currentUser;
    
    logger.log(`🔄 [ProgramLibraryScreen] useEffect triggered - effectiveUser.uid=${effectiveUser?.uid}, userRole=${userRole}`);
    
    // Check if user is available, or wait for it to become available
    if (effectiveUser?.uid) {
      logger.log(`✅ [ProgramLibraryScreen] User available, fetching courses...`);
      fetchCourses();
    } else {
      logger.log(`⏳ [ProgramLibraryScreen] User not available yet, waiting...`);
      // On web, user might not be available immediately
      // Set loading to false with empty state if no user after a delay
      const timeoutId = setTimeout(() => {
        const finalUser = user || auth.currentUser;
        if (!finalUser?.uid) {
          logger.log(`⚠️ [ProgramLibraryScreen] Timeout: User still not available after delay`);
          setState(prev => ({
            ...prev,
            loading: false,
            error: 'Debes iniciar sesión para ver tus programas.'
          }));
        }
      }, 2000); // Wait 2 seconds for user to load
      
      return () => clearTimeout(timeoutId);
    }
    
    // Cleanup search timeout on unmount
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [user?.uid, userRole, fetchCourses]); // Added userRole and fetchCourses to dependencies

  // Debounced search function
  const debouncedSearch = useCallback((query) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      if (query.trim() === '') {
        setState(prev => ({ ...prev, filteredCourses: prev.courses }));
      } else {
        const filtered = state.courses.filter(course =>
          course.title?.toLowerCase().includes(query.toLowerCase()) ||
          course.description?.toLowerCase().includes(query.toLowerCase()) ||
          course.discipline?.toLowerCase().includes(query.toLowerCase()) ||
          course.creator_id?.toLowerCase().includes(query.toLowerCase())
        );
        setState(prev => ({ ...prev, filteredCourses: filtered }));
      }
    }, 300); // 300ms debounce delay
  }, [state.courses]);

  // Handle search input changes
  const handleSearchChange = useCallback((query) => {
    setState(prev => ({ ...prev, searchQuery: query }));
    debouncedSearch(query);
  }, [debouncedSearch]);

  const fetchCourseModules = useCallback(async (courseId) => {
    // Check cache first
    const cached = moduleCache.current.get(courseId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      logger.log('✅ Using cached modules for course:', courseId);
      return cached.data;
    }
    
    // Check if already in state
    if (state.courseModules[courseId]) {
      return state.courseModules[courseId];
    }
    
    try {
      logger.log('🔄 Fetching modules for course:', courseId);
      const modules = await firestoreService.getCourseModules(courseId, user?.uid);
      
      // Cache the modules
      moduleCache.current.set(courseId, {
        data: modules,
        timestamp: Date.now()
      });
      
      // Update state
      setState(prev => ({
        ...prev,
        courseModules: { ...prev.courseModules, [courseId]: modules }
      }));
      
      return modules;
    } catch (error) {
      logger.error('Error fetching course modules:', error);
      return [];
    }
  }, [state.courseModules]);

  const handleCoursePress = useCallback((course) => {
    navigation.navigate('CourseDetail', { course });
  }, [navigation]);

  const handleImageLoadStart = useCallback((courseId) => {
    // Use ref to avoid triggering re-renders
    imageLoadingStatesRef.current[courseId] = true;
  }, []);

  const handleImageLoad = useCallback((courseId) => {
    // Use ref to avoid triggering re-renders
    imageLoadingStatesRef.current[courseId] = false;
  }, []);

  const handleImageError = useCallback((courseId) => {
    // Use ref to avoid triggering re-renders
    imageLoadingStatesRef.current[courseId] = false;
  }, []);

  const handleSwipeRight = useCallback(async (course) => {
    const modules = await fetchCourseModules(course.id);
    setState(prev => ({
      ...prev,
      swipedCourses: { ...prev.swipedCourses, [course.id]: true }
    }));
  }, [fetchCourseModules]);

  const handleSwipeLeft = useCallback((courseId) => {
    setState(prev => ({
      ...prev,
      swipedCourses: { ...prev.swipedCourses, [courseId]: false }
    }));
  }, []);

  const handleRefresh = async () => {
    try {
      logger.log('🔄 Refreshing courses from database...');
      
      // Reload courses directly from database
      await fetchCourses();
      
    } catch (error) {
      logger.error('❌ Error refreshing courses:', error);
      await fetchCourses();
    }
  };

  // Handle tutorial completion
  const handleTutorialComplete = async () => {
    if (!user?.uid || tutorialData.length === 0) return;

    try {
      const currentTutorial = tutorialData[currentTutorialIndex];
      if (currentTutorial) {
        await tutorialManager.markTutorialCompleted(
          user.uid, 
          'library', 
          currentTutorial.videoUrl
        );
        logger.log('✅ Tutorial marked as completed');
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  };

  const renderModulesView = useCallback((course) => {
    const modules = state.courseModules[course.id] || [];
    
    return (
      <View style={styles.modulesContainer}>
        <View style={styles.modulesHeader}>
          <TouchableOpacity 
            style={styles.backToProgram}
            onPress={() => handleSwipeLeft(course.id)}
          >
            <SvgChevronLeft width={24} height={24} stroke="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.modulesTitle}>Módulos del Programa</Text>
        </View>
        
        <ScrollView style={styles.modulesList} showsVerticalScrollIndicator={false}>
          {modules.length > 0 ? (
            modules.map((module, index) => (
              <View key={module.id || index} style={styles.moduleCard}>
                <View style={styles.moduleHeader}>
                  <View style={styles.moduleNumber}>
                    <Text style={styles.moduleNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.moduleTitle}>{module.title || `Módulo ${index + 1}`}</Text>
                </View>
                <Text style={styles.moduleDescription}>
                  {module.description || 'Descripción del módulo no disponible'}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.noModulesContainer}>
              <Text style={styles.noModulesText}>No hay módulos disponibles</Text>
              <Text style={styles.noModulesSubtext}>Este programa aún no tiene módulos configurados</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }, [state.courseModules, handleSwipeLeft]); // Added handleSwipeLeft to dependencies

  const renderCourseCard = useCallback((course, index) => {
    const isSwipedRight = state.swipedCourses[course.id];
    
    return (
      <View key={course.id || index} style={styles.courseCardWrapper}>
        <View style={styles.courseCardContainer}>
          {isSwipedRight ? (
            renderModulesView(course)
          ) : (
            <TouchableOpacity
              style={styles.courseCard}
              onPress={() => handleCoursePress(course)}
            >
              <View style={styles.courseImagePlaceholder}>
                {course.image_url ? (
                  <Image
                    key={`img-${course.id}`}
                    source={{ uri: course.image_url }}
                    style={styles.courseImage}
                    resizeMode="cover"
                    onLoadStart={() => handleImageLoadStart(course.id)}
                    onLoad={() => handleImageLoad(course.id)}
                    onError={() => handleImageError(course.id)}
                  />
                ) : (
                  <View style={styles.courseImageFallback}>
                    <SvgCloudOff 
                      width={32} 
                      height={32} 
                      stroke="#ffffff" 
                      strokeWidth={1.5} 
                    />
                  </View>
                )}
              </View>
              <View style={styles.courseContent}>
                <Text style={styles.courseTitle}>
                  {course.title || `Programa ${index + 1}`}
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
          )}
        </View>
      </View>
    );
  }, [state.swipedCourses, handleCoursePress, handleImageLoadStart, handleImageLoad, handleImageError, renderModulesView]); // Removed state.imageLoadingStates to prevent infinite loop

  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed Header with Back Button */}
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView style={{flex: 1}} behavior="padding" keyboardVerticalOffset={0}>
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <WakeHeaderContent style={styles.content}>
          {/* Spacer for fixed header */}
          <WakeHeaderSpacer />

          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.screenTitle}>Biblioteca</Text>
            <TouchableOpacity 
              style={styles.infoIconButton}
              onPress={() => setIsInfoModalVisible(true)}
            >
              <SvgInfo 
                width={20} 
                height={20} 
                color="#ffffff" 
                opacity={0.7}
              />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          {state.courses.length > 0 && (
            <View style={styles.searchContainer}>
              <View style={styles.searchInputContainer}>
                <SvgSearchMagnifyingGlass 
                  width={18} 
                  height={18} 
                  stroke="#ffffff" 
                  strokeWidth={1} 
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar programas"
                  placeholderTextColor="#ffffff"
                  value={state.searchQuery}
                  onChangeText={handleSearchChange}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  blurOnSubmit={true}
                  editable={state.courses.length > 0}
                />
              </View>
            </View>
          )}

          {/* Programs Section */}
          <View style={styles.recentSection}>
            
            {state.loading ? (
              <LoadingSpinner 
                size="large" 
                text="Cargando programas..." 
                containerStyle={styles.programsLoadingContainer}
              />
            ) : state.error ? (
              <View style={styles.programsErrorContainer}>
                <Text style={styles.programsErrorText}>{state.error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
                  <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.coursesContainer}>
                  {state.filteredCourses.map((course, index) => renderCourseCard(course, index))}
                </View>

              </>
            )}

            {/* Empty State */}
            {!state.loading && !state.error && state.filteredCourses.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {state.searchQuery ? `No se encontraron programas para "${state.searchQuery}"` : 'No hay programas disponibles en este momento.'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {state.searchQuery ? 'Intenta con otros términos de búsqueda' : '¡Pronto agregaremos más contenido!'}
                </Text>
              </View>
            )}
          </View>
          <BottomSpacer />
        </WakeHeaderContent>
      </ScrollView>
      </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
      
      {/* Tutorial Overlay */}
      <TutorialOverlay
        visible={tutorialVisible}
        tutorialData={tutorialData}
        onClose={() => setTutorialVisible(false)}
        onComplete={handleTutorialComplete}
      />
      
      {/* Info Modal */}
      <Modal
        visible={isInfoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsInfoModalVisible(false)}
      >
        <View style={styles.infoModalOverlay}>
          <TouchableOpacity 
            style={styles.infoModalBackdrop}
            activeOpacity={1}
            onPress={() => setIsInfoModalVisible(false)}
          />
          <View style={styles.infoModalContent}>
            <View style={styles.infoModalHeader}>
              <Text style={styles.infoModalTitle}>Información</Text>
              <TouchableOpacity 
                style={styles.infoModalCloseButton}
                onPress={() => setIsInfoModalVisible(false)}
              >
                <Text style={styles.infoModalCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.infoModalScrollContainer}>
              <ScrollView 
                style={styles.infoModalScrollView}
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.infoModalDescription}>
                  Esta sección muestra todos los programas publicados disponibles.{'\n\n'}
                  Puedes explorar y comprar programas directamente desde aquí.
                </Text>
              </ScrollView>
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
  },
  content: {
    paddingBottom: 20, // Normal padding
  },
  titleSection: {
    paddingTop: 0,
    marginTop: 0,
    marginBottom: Math.max(20, screenHeight * 0.03), // Match ProfileScreen
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: screenWidth * 0.12, // Match left padding
  },
  screenTitle: {
    fontSize: Math.min(screenWidth * 0.08, 32), // Match ProfileScreen responsive sizing
    fontWeight: '600', // Match ProfileScreen weight
    color: '#ffffff',
    textAlign: 'left',
    paddingLeft: screenWidth * 0.12, // Match ProfileScreen padding
    marginBottom: 20,
    flex: 1,
  },
  infoIconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  searchContainer: {
    marginBottom: 15,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04), // Responsive border radius
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    paddingHorizontal: Math.max(20, screenWidth * 0.05), // Responsive padding
    paddingVertical: Math.max(16, screenHeight * 0.02), // Responsive padding
    marginHorizontal: Math.max(24, screenWidth * 0.06), // Match ProfileScreen margins
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: '#cccccc',
    fontSize: 16,
    marginTop: 15,
  },
  programsLoadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    minHeight: 120,
  },
  programsLoadingText: {
    color: '#cccccc',
    fontSize: 16,
    marginTop: 15,
  },
  programsErrorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    minHeight: 150,
  },
  programsErrorText: {
    color: '#cccccc',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorText: {
    color: '#cccccc',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    width: Math.max(200, screenWidth * 0.5),
    height: Math.max(44, screenHeight * 0.055),
    borderRadius: Math.max(12, screenWidth * 0.04),
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  retryButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 15,
    paddingLeft: screenWidth * 0.12, // Match Biblioteca title padding
  },
  recentSection: {
    marginBottom: Math.max(15, screenHeight * 0.02), // Match ProfileScreen spacing
  },
  statsContainer: {
    marginBottom: 20,
  },
  statsText: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
  },
  coursesContainer: {
    gap: 15, // Match spacing between browse cards and search bar
  },
  courseCardWrapper: {
  },
  courseCardContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04), // Responsive border radius
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    marginHorizontal: Math.max(24, screenWidth * 0.06), // Match ProfileScreen margins
  },
  courseCard: {
    flexDirection: 'row',
    paddingVertical: 6, // Reduced padding to bring image closer to border
    paddingHorizontal: 6, // Reduced padding to bring image closer to border
    alignItems: 'center',
    minHeight: Math.max(55, screenHeight * 0.07), // Match ProfileScreen card height
  },
  courseImagePlaceholder: {
    width: 70, // Fixed size to match original
    height: 70, // Fixed size to match original
    backgroundColor: '#555555',
    borderRadius: 8, // Fixed border radius
    marginRight: 12, // Fixed margin to match original
    overflow: 'hidden',
  },
  courseImage: {
    width: '100%',
    height: '100%',
  },
  courseImageFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#555555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  courseImageFallbackText: {
    fontSize: 24,
    color: '#ffffff',
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
  courseContent: {
    flex: 1,
  },
  courseArrow: {
    marginLeft: 2,
    marginRight: 10,
  },
  courseHeader: {
    marginBottom: 15,
  },
  courseTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  courseTitle: {
    fontSize: 15, // Fixed size to match original
    color: '#ffffff',
    marginBottom: 8, // Fixed margin to match original
    fontWeight: '600', // Match ProfileScreen weight
  },
  courseInfo: {
    fontSize: 12, // Fixed size to match original
    fontWeight: '400',
    color: '#ffffff',
    opacity: 0.8,
  },
  disciplineBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  disciplineBadgeText: {
    color: '#ffffff',
    fontSize: 12,
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
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
  },
  durationLabel: {
    color: '#cccccc',
    fontSize: 14,
    marginRight: 8,
  },
  durationValue: {
    color: '#ffffff',
    fontSize: 16,
  },
  courseDescription: {
    color: '#cccccc',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 15,
  },
  courseFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  courseCreator: {
    color: '#999999',
    fontSize: 12,
    fontStyle: 'italic',
  },
  modulesButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modulesButtonText: {
    color: '#ffffff',
    fontSize: 12,
  },
  // Modules view styles
  modulesContainer: {
    padding: 20,
    minHeight: 300,
  },
  modulesHeader: {
    marginBottom: 20,
  },
  backToProgram: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6, // Slightly rounded corners
  },
  modulesTitle: {
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'center',
  },
  modulesList: {
    maxHeight: 250,
  },
  moduleCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  moduleNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  moduleNumberText: {
    color: '#ffffff',
    fontSize: 14,
  },
  moduleTitle: {
    fontSize: 16,
    color: '#ffffff',
    flex: 1,
  },
  moduleDescription: {
    color: '#cccccc',
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 42,
  },
  noModulesContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  noModulesText: {
    color: '#cccccc',
    fontSize: 16,
    marginBottom: 5,
  },
  noModulesSubtext: {
    color: '#999999',
    fontSize: 13,
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
  },
  emptyText: {
    color: '#cccccc',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 22,
  },
  emptySubtext: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Info Modal Styles
  infoModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  infoModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(16, screenWidth * 0.04),
    width: Math.max(350, screenWidth * 0.9),
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'hidden',
  },
  infoModalScrollContainer: {
    maxHeight: Math.max(400, screenHeight * 0.5),
  },
  infoModalScrollView: {
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingBottom: Math.max(24, screenWidth * 0.06),
  },
  infoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
    paddingHorizontal: Math.max(24, screenWidth * 0.06),
    paddingTop: Math.max(24, screenWidth * 0.06),
  },
  infoModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.055, 22),
    fontWeight: '600',
    flex: 1,
  },
  infoModalCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Math.max(12, screenWidth * 0.03),
  },
  infoModalCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  infoModalDescription: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    lineHeight: Math.max(24, screenHeight * 0.03),
    opacity: 0.9,
  },
});

// Export both default and named for web wrapper compatibility
export default ProgramLibraryScreen;
export { ProgramLibraryScreen as ProgramLibraryScreenBase };