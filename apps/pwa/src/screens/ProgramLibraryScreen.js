import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cacheConfig } from '../config/queryClient';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  PanResponder,
  useWindowDimensions,
  Image,
  Modal,
  Platform,
} from 'react-native';
import Text from '../components/Text';
import TextInput from '../components/TextInput';

import { useAuth } from '../contexts/AuthContext';
import apiService from '../services/apiService';
import profilePictureService from '../services/profilePictureService';
import { isAdmin, isCreator } from '../utils/roleHelper';
import { auth } from '../config/firebase';
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
import SvgFilter from '../components/icons/vectors_fig/Interface/FilterIcon';
import SvgCloudOff from '../components/icons/vectors_fig/File/Cloud_Off';
import SvgInfo from '../components/icons/SvgInfo';
import logger from '../utils/logger.js';
const LIBRARY_TAB_CONFIG = [
  { key: 'creators', title: 'Creadores' },
  { key: 'programs', title: 'Programas' },
];

const CreatorCard = React.memo(({ creator, onPress, styles }) => {
  const [imageUrl, setImageUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    profilePictureService.getProfilePictureUrl(creator.id).then((url) => {
      if (!cancelled && url) setImageUrl(url);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [creator.id]);
  return (
    <TouchableOpacity style={styles.creatorCardContainer} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.creatorCard}>
        <View style={styles.creatorImagePlaceholder}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.creatorImage} resizeMode="cover" />
          ) : (
            <View style={styles.creatorImageFallback}>
              <SvgCloudOff width={32} height={32} stroke="#ffffff" strokeWidth={1.5} />
            </View>
          )}
        </View>
        <View style={styles.creatorContent}>
          <Text style={styles.creatorName}>{creator.name || 'Creador'}</Text>
          {creator.discipline ? (
            <Text style={styles.creatorInfo}>{creator.discipline}</Text>
          ) : null}
        </View>
        <SvgChevronRight width={20} height={20} stroke="#ffffff" strokeWidth={2} style={styles.creatorArrow} />
      </View>
    </TouchableOpacity>
  );
});

const ProgramLibraryScreen = ({ navigation }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user: contextUser } = useAuth();
  
  const user = contextUser || auth.currentUser;
  const userId = user?.uid;

  const { data: userDoc } = useQuery({
    queryKey: ['user', userId],
    // TODO: no endpoint for getUser — GET /api/v1/users/me shape mismatch; callers expect Firestore field shapes
    queryFn: () => apiService.getUser(userId),
    enabled: !!userId,
    ...cacheConfig.userProfile,
  });
  const userRole = userDoc?.role || 'user';
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );
  
  // Library top menu: 0 = Creatores, 1 = Programas
  const [libraryTabIndex, setLibraryTabIndex] = useState(0);
  const libraryPagerRef = useRef(null);
  const lastScrollIndexRef = useRef(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollOffsetXRef = useRef(0);
  const swipeStartXRef = useRef(0);
  const creatorAnimsRef = useRef([]);
  const courseAnimsRef = useRef([]);

  // Keep scroll offset ref in sync for PanResponder-driven scroll
  useEffect(() => {
    const listenerId = scrollX.addListener(({ value }) => {
      scrollOffsetXRef.current = value;
    });
    return () => scrollX.removeListener(listenerId);
  }, [scrollX]);


  // Capture horizontal swipes anywhere below search (tab bar + pager) to scroll between pages
  const librarySwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onPanResponderGrant: () => {
          swipeStartXRef.current = scrollOffsetXRef.current;
        },
        onMoveShouldSetResponderCapture: (_, gestureState) => {
          const { dx, dy } = gestureState;
          const threshold = 12;
          return Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy);
        },
        onPanResponderMove: (_, gestureState) => {
          const pager = libraryPagerRef.current;
          if (!pager) return;
          const { dx } = gestureState;
          const x = Math.max(0, Math.min(screenWidth, swipeStartXRef.current - dx));
          pager.scrollTo({ x, animated: false });
          scrollOffsetXRef.current = x;
        },
        onPanResponderRelease: () => {
          const pager = libraryPagerRef.current;
          if (!pager) return;
          const x = scrollOffsetXRef.current;
          const page = Math.round(x / screenWidth);
          const target = Math.max(0, Math.min(page, LIBRARY_TAB_CONFIG.length - 1)) * screenWidth;
          pager.scrollTo({ x: target, animated: true });
          scrollOffsetXRef.current = target;
          const index = Math.round(target / screenWidth);
          lastScrollIndexRef.current = index;
          setLibraryTabIndex(index);
        },
      }),
    [screenWidth]
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

  // Tab bar content width (screen minus margins) for gradual indicator
  const tabBarMargin = useMemo(() => Math.max(24, screenWidth * 0.06), [screenWidth]);
  const tabIndicatorStep = useMemo(
    () => (screenWidth - 2 * tabBarMargin) / LIBRARY_TAB_CONFIG.length,
    [screenWidth, tabBarMargin]
  );

  // Unique creators derived from courses (for Creatores tab)
  const creatorsList = useMemo(() => {
    const seen = new Set();
    const list = [];
    (state.courses || []).forEach((course) => {
      const id = course.creator_id || course.creatorId;
      if (id && !seen.has(id)) {
        seen.add(id);
        list.push({
          id,
          name: course.creatorName || course.creator_name || 'Creador',
          discipline: course.discipline || null,
        });
      }
    });
    return list;
  }, [state.courses]);

  useEffect(() => {
    if (!creatorsList.length) return;
    creatorAnimsRef.current = creatorsList.map(() => new Animated.Value(0));
    Animated.stagger(80, creatorAnimsRef.current.map(anim =>
      Animated.timing(anim, { toValue: 1, duration: 420, useNativeDriver: true })
    )).start();
  }, [creatorsList.length]);

  useEffect(() => {
    if (!state.filteredCourses.length) return;
    courseAnimsRef.current = state.filteredCourses.map(() => new Animated.Value(0));
    Animated.stagger(80, courseAnimsRef.current.map(anim =>
      Animated.timing(anim, { toValue: 1, duration: 420, useNativeDriver: true })
    )).start();
  }, [state.filteredCourses.length]);

  // Check for tutorials to show (defined before fetchCourses since fetchCourses calls it)
  const checkForTutorials = useCallback(async () => {
    const effectiveUser = user || auth.currentUser;
    if (!effectiveUser?.uid) {
      return;
    }

    try {
      const tutorials = await tutorialManager.getTutorialsForScreen(effectiveUser.uid, 'library');

      if (tutorials.length > 0) {
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
      }
    } catch (error) {
      logger.error('❌ [ProgramLibraryScreen] Error checking for tutorials:', error);
    }
  }, [user?.uid]);

  const { data: fetchedCourses, isLoading: coursesLoading, isError: coursesError } = useQuery({
    queryKey: ['programs', 'library', userId, userRole],
    queryFn: async () => {
      // TODO: no endpoint for getCourses — no REST endpoint; courses are in the users/me courses map
      const allCourses = await apiService.getCourses(userId);
      let filtered;
      if (isAdmin(userRole)) {
        filtered = allCourses;
      } else if (isCreator(userRole)) {
        filtered = allCourses.filter(c => c.status === 'published' || (c.status !== 'published' && c.creator_id === userId));
      } else {
        filtered = allCourses.filter(c => c.status === 'published');
      }
      return filtered.map(course => ({
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
        ...course,
      }));
    },
    enabled: !!userId,
    ...cacheConfig.programStructure,
  });

  // Sync fetched courses into state and run tutorials once loaded
  useEffect(() => {
    if (coursesLoading) return;
    const coursesData = fetchedCourses ?? [];
    setState(prev => ({
      ...prev,
      courses: coursesData,
      filteredCourses: coursesData,
      loading: false,
      error: coursesError
        ? 'Error al cargar tus programas. Inténtalo de nuevo.'
        : coursesData.length === 0
          ? 'No hay programas disponibles en este momento.'
          : null,
    }));
    if (!coursesError && coursesData.length > 0) checkForTutorials();
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [fetchedCourses, coursesLoading, coursesError]);

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
      return cached.data;
    }
    
    // Check if already in state
    if (state.courseModules[courseId]) {
      return state.courseModules[courseId];
    }
    
    try {
      // TODO: no endpoint for getCourseModules — no matching REST endpoint
      const modules = await apiService.getCourseModules(courseId, user?.uid);
      
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

  const handleCreatorPress = useCallback((creator) => {
    navigation.navigate('CreatorProfile', { creatorId: creator.id });
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
        }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  };

  const renderCreatorCard = useCallback((creator, index) => {
    const anim = creatorAnimsRef.current[index];
    const animStyle = anim ? {
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
    } : {};
    return (
      <Animated.View key={creator.id} style={animStyle}>
        <CreatorCard
          creator={creator}
          onPress={() => handleCreatorPress(creator)}
          styles={styles}
        />
      </Animated.View>
    );
  }, [handleCreatorPress]);

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
    const isOneOnOne = course?.userCourseData?.deliveryType === 'one_on_one';
    const anim = courseAnimsRef.current[index];
    const animStyle = anim ? {
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
    } : {};

    return (
      <Animated.View key={course.id || index} style={[styles.courseCardWrapper, animStyle]}>
        <View style={styles.courseCardContainer}>
          {isSwipedRight ? (
            renderModulesView(course)
          ) : (
            <TouchableOpacity
              style={styles.courseCard}
              onPress={() => handleCoursePress(course)}
            >
              <View style={styles.courseImagePlaceholder}>
                {isOneOnOne && (
                  <View style={styles.oneOnOneBadge}>
                    <Text style={styles.oneOnOneBadgeText}>Asignado</Text>
                  </View>
                )}
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
      </Animated.View>
    );
  }, [state.swipedCourses, handleCoursePress, handleImageLoadStart, handleImageLoad, handleImageError, renderModulesView]); // Removed state.imageLoadingStates to prevent infinite loop

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      {/* Fixed Header with Back Button */}
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
          <View style={styles.libraryOuterContainer}>
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

          {/* Search bar + Filter button (above tab menu) */}
          <View style={styles.searchRowContainer}>
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
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => { /* Filter functionality to be implemented */ }}
              activeOpacity={0.7}
            >
              <View style={styles.filterIconWrapper}>
                <SvgFilter width={20} height={20} stroke="#ffffff" strokeWidth={1.5} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Wrapper: horizontal swipe anywhere (tab bar + content) scrolls between pages */}
          <View style={styles.librarySwipeArea} {...librarySwipeResponder.panHandlers}>
            {/* Library top menu: names only + subtle indicator */}
            <View style={styles.libraryTabBar}>
              <View style={styles.libraryTabHeaderContainer}>
                <Animated.View
                  style={[
                    styles.libraryTabIndicator,
                    {
                      width: tabIndicatorStep,
                      transform: [
                        {
                          translateX: scrollX.interpolate({
                            inputRange: [0, screenWidth],
                            outputRange: [0, tabIndicatorStep],
                            extrapolate: 'clamp',
                          }),
                        },
                      ],
                    },
                  ]}
                />
                {LIBRARY_TAB_CONFIG.map((tab, index) => {
                  const tabOpacity = scrollX.interpolate({
                    inputRange: [0, screenWidth],
                    outputRange: index === 0 ? [1, 0.45] : [0.45, 1],
                    extrapolate: 'clamp',
                  });
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      className={Platform.OS === 'web' ? `library-filter-pill${libraryTabIndex === index ? ' active' : ''}` : undefined}
                      style={styles.libraryTabButton}
                      activeOpacity={0.7}
                      onPress={() => {
                        lastScrollIndexRef.current = index;
                        setLibraryTabIndex(index);
                        if (libraryPagerRef.current) {
                          libraryPagerRef.current.scrollTo({ x: index * screenWidth, animated: true });
                        }
                      }}
                    >
                      <Animated.Text style={[styles.libraryTabTitle, { opacity: tabOpacity }]}>
                        {tab.title}
                      </Animated.Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Horizontal pager: Creatores first, then Programas */}
            <Animated.ScrollView
              ref={libraryPagerRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: false }
              )}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                const clamped = Math.max(0, Math.min(index, LIBRARY_TAB_CONFIG.length - 1));
                lastScrollIndexRef.current = clamped;
                setLibraryTabIndex(clamped);
              }}
              style={styles.libraryPager}
              contentContainerStyle={styles.libraryPagerContent}
            >
            {/* Page 0: Creatores */}
            <ScrollView
              style={[styles.libraryPage, { width: screenWidth }]}
              contentContainerStyle={styles.libraryPageContent}
              showsVerticalScrollIndicator={false}
            >
              {state.loading ? (
                <LoadingSpinner
                  size="large"
                  text="Cargando..."
                  containerStyle={styles.programsLoadingContainer}
                />
              ) : state.error ? (
                <View style={styles.programsErrorContainer}>
                  <Text style={styles.programsErrorText}>{state.error}</Text>
                  <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
                    <Text style={styles.retryButtonText}>Reintentar</Text>
                  </TouchableOpacity>
                </View>
              ) : creatorsList.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No hay creadores disponibles.</Text>
                  <Text style={styles.emptySubtext}>Los creadores aparecen cuando publican programas.</Text>
                </View>
              ) : (
                <View style={styles.creatorsContainer}>
                  {creatorsList.map((creator, index) => renderCreatorCard(creator, index))}
                </View>
              )}
              <BottomSpacer />
            </ScrollView>

            {/* Page 1: Programas */}
            <ScrollView
              style={[styles.libraryPage, { width: screenWidth }]}
              contentContainerStyle={styles.libraryPageContent}
              showsVerticalScrollIndicator={false}
            >
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
                <View style={styles.coursesContainer}>
                  {state.filteredCourses.map((course, index) => renderCourseCard(course, index))}
                </View>
              )}
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
              <BottomSpacer />
            </ScrollView>
          </Animated.ScrollView>
          </View>
        </WakeHeaderContent>
          </View>
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
  libraryOuterContainer: {
    flex: 1,
  },
  libraryPager: {
    flex: 1,
  },
  libraryPagerContent: {
    flexGrow: 0,
  },
  libraryPage: {
    width: undefined,
    flexGrow: 0,
    minHeight: screenHeight,
  },
  libraryPageContent: {
    paddingBottom: 20,
    flexGrow: 1,
    minHeight: screenHeight,
  },
  content: {
    paddingBottom: 20, // Normal padding
  },
  titleSection: {
    paddingTop: 0,
    marginTop: 0,
    marginBottom: Math.max(10, screenHeight * 0.015),
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
    marginBottom: 10,
    flex: 1,
  },
  infoIconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  librarySwipeArea: {
    flex: 1,
  },
  libraryTabBar: {
    marginBottom: 15,
    marginHorizontal: Math.max(24, screenWidth * 0.06),
  },
  libraryTabHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    paddingVertical: 8,
    minHeight: 44,
  },
  // Subtle tab indicator: thin underline (alternatives: dot, softer line, gold tint – tweak below)
  libraryTabIndicator: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  libraryTabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    zIndex: 1,
  },
  libraryTabTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  creatorsContainer: {
    gap: 15,
  },
  creatorCardContainer: {
    marginHorizontal: Math.max(24, screenWidth * 0.06),
  },
  creatorCard: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    minHeight: Math.max(55, screenHeight * 0.07),
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  creatorImagePlaceholder: {
    width: 70,
    height: 70,
    backgroundColor: '#555555',
    borderRadius: 8,
    marginRight: 12,
    overflow: 'hidden',
  },
  creatorImage: {
    width: '100%',
    height: '100%',
  },
  creatorImageFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#555555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorContent: {
    flex: 1,
  },
  creatorName: {
    fontSize: 15,
    color: '#ffffff',
    marginBottom: 4,
    fontWeight: '600',
  },
  creatorInfo: {
    fontSize: 12,
    fontWeight: '400',
    color: '#ffffff',
    opacity: 0.8,
  },
  creatorArrow: {
    marginLeft: 2,
    marginRight: 10,
  },
  searchRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    marginHorizontal: Math.max(24, screenWidth * 0.06),
    gap: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    paddingVertical: Math.max(10, screenHeight * 0.014),
  },
  filterButton: {
    alignSelf: 'stretch',
    width: Math.max(44, screenWidth * 0.11),
    minHeight: Math.max(44, screenHeight * 0.052),
    borderRadius: Math.max(12, screenWidth * 0.04),
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIconWrapper: {
    opacity: 0.65,
  },
  searchContainer: {
    marginBottom: 15,
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: Math.max(200, screenWidth * 0.5),
    height: Math.max(44, screenHeight * 0.055),
    borderRadius: Math.max(12, screenWidth * 0.04),
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  retryButtonText: {
    color: 'rgba(255, 255, 255, 1)',
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
  oneOnOneBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.4)',
    backgroundColor: 'rgba(52, 199, 89, 0.2)',
    zIndex: 5,
  },
  oneOnOneBadgeText: {
    color: 'rgba(52, 199, 89, 1)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    position: 'relative',
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