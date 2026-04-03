import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Animated,
  Alert,
  ScrollView,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Text from '../components/Text';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { isWeb } from '../utils/platform';
import { auth } from '../config/firebase';
import courseDownloadService from '../data-management/courseDownloadService';
import apiClient from '../utils/apiClient';
import purchaseEventManager from '../services/purchaseEventManager';
import updateEventManager from '../services/updateEventManager';
import tutorialManager from '../services/tutorialManager';
import { getUpcomingBookingsForUser } from '../services/callBookingService';
import TutorialOverlay from '../components/TutorialOverlay';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import BottomSpacer from '../components/BottomSpacer';
import libraryImage from '../assets/images/library.jpg';
import logger from '../utils/logger.js';
import WakeLoader from '../components/WakeLoader';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, cacheConfig } from '../config/queryClient';
import { STALE_TIMES, GC_TIMES } from '../config/queryConfig';
import { useUserCourses } from '../hooks/workout/useUserCourses';

// Cards share no spacing — they overlap for the 3D carousel effect
const CARD_SPACING = 0;

const MainScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // On web, useWindowDimensions uses visualViewport and updates on scroll (address bar hide/show), causing bottom jump. Freeze height for bottom spacing.
  const stableHeightRef = useRef(null);
  if (Platform.OS === 'web' && stableHeightRef.current === null) {
    stableHeightRef.current = screenHeight;
  }
  const heightForBottomPadding = Platform.OS === 'web' ? (stableHeightRef.current ?? screenHeight) : screenHeight;

  // Card dimensions — recomputed only when screen size changes
  const CARD_MARGIN = useMemo(() => screenWidth * 0.1, [screenWidth]);
  const CARD_WIDTH = useMemo(() => screenWidth - CARD_MARGIN * 2, [screenWidth, CARD_MARGIN]);
  const CARD_HEIGHT = useMemo(() => Math.max(500, screenHeight * 0.62), [screenHeight]);

  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#1a1a1a',
    },
    content: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: 24,
    },
    contentWrapper: {
      // No flex: 1 — keeps header-to-content gap consistent (matches DailyWorkoutScreen). Flex was causing uneven spacing inside the screen on PWA.
    },
    userSection: {
      marginBottom: 12,
      paddingTop: 0,
      marginTop: 0,
    },
    cardsSection: {
      minHeight: CARD_HEIGHT + 80, // Reserve space for cards + pagination so we don't need flex on wrapper (consistent spacing on PWA)
    },
    swipeableContainer: {
      flex: 1,
      overflow: 'visible', // Ensure pagination indicators are not clipped
    },
    flatListContent: {
      paddingHorizontal: (screenWidth - CARD_WIDTH) / 2,
      alignItems: 'center',
    },
    cardsAndPaginationWrapper: {
      width: '100%',
      alignItems: 'center',
      overflow: 'visible',
      marginTop: 8, // Gap between greeting and cards
    },
    flatListStyle: {
      height: CARD_HEIGHT,
      width: '100%',
    },
    paginationContainer: {
      width: '100%',
      minHeight: 40,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 10, // Position exactly 10px below the card bottom
      paddingTop: 10,
      paddingBottom: 24,
      zIndex: 1000, // Very high z-index to ensure visibility above cards
      backgroundColor: 'transparent', // Ensure background doesn't hide anything
    },
    cardSeparator: {
      width: 0, // No separator - cards overlap
    },
    swipeableCard: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      // Cards will overlap naturally due to negative margins or transform
    },
    cardContent: {
      flex: 1,
      backgroundColor: '#2a2a2a',
      borderRadius: Math.max(12, screenWidth * 0.04), // 4% of screen width, min 12
      padding: Math.max(16, screenWidth * 0.05), // 5% of screen width, min 16
      paddingBottom: 24,
      borderWidth: 1,
      borderColor: '#3a3a3a',
      justifyContent: 'flex-end',
      alignItems: 'center',
      position: 'relative',
    },
    cardContentWithImage: {
      flex: 1,
      backgroundColor: '#2a2a2a',
      borderRadius: 16,
      borderWidth: 0, // No border when image is present
      overflow: 'hidden', // Ensure image respects border radius
      width: '100%',
      height: '100%',
      // No padding here - let cardOverlay handle positioning
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    cardTitle: {
      fontSize: 30,
      fontWeight: '600',
      color: '#ffffff',
      textAlign: 'center',
    },
    cardCreator: {
      fontSize: 16,
      fontWeight: '600',
      color: '#ffffff',
      textAlign: 'center',
      marginTop: 25,
    },
    cardBackgroundImage: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
      borderRadius: 16,
      opacity: 1, // Ensure 100% opacity
    },
    cardOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 40, // Match cardContent paddingBottom
      position: 'relative',
    },
    cardDescription: {
      color: '#cccccc',
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 16,
      flex: 1,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardDuration: {
      color: '#999999',
      fontSize: 12,
    },
    greeting: {
      fontSize: Math.min(screenWidth * 0.08, 32), // 8% of screen width, max 32
      fontWeight: '400',
      color: '#ffffff',
      textAlign: 'left',
      paddingLeft: screenWidth * 0.12, // 6% of screen width to match header
    },
    username: {
      fontSize: Math.min(screenWidth * 0.08, 32), // 8% of screen width, max 32
      fontWeight: '600',
      color: '#ffffff',
    },
    sectionTitle: {
      fontSize: 20,
      color: '#ffffff',
      marginBottom: 15,
    },
    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      flex: 1,
      minHeight: 300,
    },
    loadingText: {
      color: '#cccccc',
      fontSize: 16,
      marginTop: 12,
    },
    errorContainer: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    errorText: {
      color: 'rgba(224, 84, 84, 0.9)',
      fontSize: 16,
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
      textTransform: 'uppercase',
    },
    continueText: {
      color: '#007AFF',
      fontSize: 12,
    },
    // NEW: Version system styles
    updatingCard: {
      // Remove border, just change opacity
      opacity: 0.8,
    },
    failedCard: {
      // Remove border, just change opacity
      opacity: 0.7,
    },
    dimmedImage: {
      opacity: 0.5,
    },
    updatingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
      borderRadius: 16, // Match cardContentWithImage border radius
    },
    failedOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(224, 84, 84, 0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
      borderRadius: 16, // Match cardContentWithImage border radius
    },
    updatingText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      marginTop: 10,
      textAlign: 'center',
    },
    failedText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    trialBadge: {
      position: 'absolute',
      top: 20,
      right: 20,
      paddingHorizontal: 16,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.3)',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    trialBadgeText: {
      color: 'rgba(255, 255, 255, 1)',
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    // Upcoming call card (same style as DailyWorkoutScreen "no session today")
    upcomingCallRoot: {
      flex: 1,
      position: 'relative',
      overflow: 'hidden',
    },
    upcomingCallBgImage: {
      ...StyleSheet.absoluteFillObject,
    },
    upcomingCallBgFallback: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#1a1a2e',
    },
    upcomingCallOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    upcomingCallGlassWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 28,
    },
    upcomingCallGlassCard: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: Math.max(12, screenWidth * 0.04),
      maxWidth: '100%',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      shadowColor: 'rgba(255, 255, 255, 0.4)',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 2,
      elevation: 2,
      padding: 12,
      gap: 4,
    },
    upcomingCallGlassCardWeb: {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
    },
    upcomingCallGlassCardInner: {
      paddingVertical: 20,
      paddingHorizontal: 20,
      alignItems: 'center',
      gap: 6,
    },
    upcomingCallLabel: {
      fontSize: 22,
      fontWeight: '400',
      color: 'rgba(255, 255, 255, 0.95)',
      textAlign: 'center',
    },
    upcomingCallCreatorName: {
      fontSize: 22,
      fontWeight: '700',
      color: '#ffffff',
      textAlign: 'center',
      letterSpacing: 0.2,
    },
    upcomingCallDate: {
      fontSize: 15,
      fontWeight: '600',
      color: 'rgba(255, 255, 255, 0.9)',
      textAlign: 'center',
    },
    upcomingCallDaysLeft: {
      fontSize: 14,
      fontWeight: '600',
      color: 'rgba(255, 255, 255, 0.85)',
      textAlign: 'center',
    },
    // Navigation buttons
  }), [screenWidth, screenHeight, CARD_WIDTH, CARD_HEIGHT, heightForBottomPadding]);
  
  // Auth — prefer context; fall back to Firebase singleton for cases where context lags
  const { user: contextUser } = useAuth();
  const user = contextUser || auth.currentUser;
  const queryClientHook = useQueryClient();

  const { courses: purchasedCoursesFromHook, isLoading: coursesQueryLoading, error: coursesQueryError, refetch: refetchCourses } = useUserCourses(user?.uid);

  // React Query: user profile
  const { data: profileQueryData } = useQuery({
    queryKey: queryKeys.user.detail(user?.uid),
    queryFn: () => apiClient.get('/users/me').then(res => res.data),
    enabled: !!user?.uid,
    ...cacheConfig.userProfile,
  });

  // React Query: upcoming call bookings
  const { data: upcomingBookingsData } = useQuery({
    queryKey: ['bookings', 'upcoming', user?.uid],
    queryFn: () => getUpcomingBookingsForUser(user.uid),
    enabled: !!user?.uid,
    staleTime: STALE_TIMES.clientList, // TODO: staleTime uses clientList config for bookings — consider adding a dedicated bookings entry
    gcTime: GC_TIMES.clientList,
  });

  // Log auth state on mount for diagnostics
  useEffect(() => {
    if (!user?.uid) {
    }
  }, [user?.uid]);

  useEffect(() => {
    Animated.timing(screenAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    Animated.timing(greetAnim, { toValue: 1, duration: 420, delay: 100, useNativeDriver: true }).start();
  }, []);

  // Screen state
  const purchasedCourses = purchasedCoursesFromHook;
  const loading = coursesQueryLoading;
  const error = coursesQueryError;
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialData, setTutorialData] = useState([]);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [downloadedCourses, setDownloadedCourses] = useState({});
  const [hasPendingUpdates, setHasPendingUpdates] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Web: course ids whose card image has loaded — used to force re-render so mix-blend-mode repaints over the image
  const [cardImageLoadedIds, setCardImageLoadedIds] = useState(() => new Set());

  // Derive user profile from React Query data, falling back to auth state
  const userProfile = useMemo(() => {
    const currentUser = auth.currentUser;
    if (profileQueryData) {
      return {
        displayName: profileQueryData.displayName || currentUser?.displayName || user?.displayName || '',
        username: profileQueryData.username || '',
        email: profileQueryData.email || currentUser?.email || user?.email || '',
        phoneNumber: profileQueryData.phoneNumber || '',
        gender: profileQueryData.gender || '',
      };
    }
    return {
      displayName: currentUser?.displayName || user?.displayName || '',
      username: '',
      email: currentUser?.email || user?.email || '',
      phoneNumber: '',
      gender: '',
    };
  }, [profileQueryData, user?.uid]);

  // First name derived from profile data — stable across renders
  const firstName = useMemo(() => {
    const currentUser = auth.currentUser;
    const displayName = currentUser?.displayName || userProfile?.displayName || user?.displayName;
    if (displayName && displayName.trim()) {
      return displayName.split(' ')[0];
    }
    return user?.email?.split('@')[0] || 'Usuario';
  }, [userProfile?.displayName, user?.displayName, user?.email]);
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef(null);
  const cardEntranceAnim = useRef(new Animated.Value(0)).current;
  const screenAnim = useRef(new Animated.Value(0)).current;
  const greetAnim = useRef(new Animated.Value(0)).current;

  // Save selected card index to storage
  // Scroll position persistence — saves and restores the active card index across navigations
  const saveSelectedCardIndex = async (index) => {
    try {
      if (isWeb) {
        localStorage.setItem('selectedCardIndex', index.toString());
      } else {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem('selectedCardIndex', index.toString());
      }
    } catch (error) {
      // Handle error silently
    }
  };

  // Load selected card index from storage
  const loadSelectedCardIndex = async () => {
    try {
      if (isWeb) {
        const savedIndex = localStorage.getItem('selectedCardIndex');
        return savedIndex ? parseInt(savedIndex, 10) : 0;
      } else {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const savedIndex = await AsyncStorage.getItem('selectedCardIndex');
        return savedIndex ? parseInt(savedIndex, 10) : 0;
      }
    } catch (error) {
      return 0;
    }
  };

  // Derive upcoming call cards from React Query data
  const upcomingCallCards = useMemo(() => {
    if (!upcomingBookingsData || !Array.isArray(upcomingBookingsData)) return [];
    return upcomingBookingsData.map((booking) => {
      const course = purchasedCourses.find(
        (c) => (c.courseId || c.id) === booking.courseId
      ) || null;
      const creatorName = course?.creatorName || course?.creator_name || null;
      return { booking, course, creatorName };
    });
  }, [upcomingBookingsData, purchasedCourses]);

  // Handle refresh parameter from navigation (e.g., after purchase)
  useEffect(() => {
    if (route?.params?.refresh && user?.uid) {
      refreshCoursesFromDatabase();
      navigation.setParams({ refresh: undefined });
    }
  }, [route?.params?.refresh, user?.uid, navigation]);

  // Download callbacks — stable references, no stale closure bugs
  const onDownloadSuccess = useCallback((courseId, newVersion, status) => {
    setDownloadedCourses(prev => {
      if (!prev[courseId]) return prev;
      return { ...prev, [courseId]: { ...prev[courseId], status, downloaded_version: newVersion, lastUpdated: Date.now() } };
    });
  }, []);

  const onDownloadError = useCallback((courseId, _error, status) => {
    setDownloadedCourses(prev => {
      if (!prev[courseId]) return prev;
      return { ...prev, [courseId]: { ...prev[courseId], status } };
    });
  }, []);

  // Register download callbacks once on mount — prevents repeated registration and stale closures
  useEffect(() => {
    courseDownloadService.setUIUpdateCallbacks(onDownloadSuccess, onDownloadError);
  }, [onDownloadSuccess, onDownloadError]);

  // Debounce ref to prevent double refresh when both purchase events fire in sequence
  const purchaseRefreshTimerRef = useRef(null);

  // Purchase event listeners — both events fire at different points in the payment flow
  // Debounced so rapid back-to-back events only trigger one refresh
  useEffect(() => {
    const unsubscribe = purchaseEventManager.subscribe((courseId) => {
      if (user?.uid) {
        if (purchaseRefreshTimerRef.current) clearTimeout(purchaseRefreshTimerRef.current);
        purchaseRefreshTimerRef.current = setTimeout(() => { refreshCoursesFromDatabase(); }, 300);
      }
    });
    return unsubscribe;
  }, [user?.uid]);

  useEffect(() => {
    const unsubscribe = purchaseEventManager.subscribeReady((courseId) => {
      if (user?.uid) {
        if (purchaseRefreshTimerRef.current) clearTimeout(purchaseRefreshTimerRef.current);
        purchaseRefreshTimerRef.current = setTimeout(() => { refreshCoursesFromDatabase(); }, 300);
      }
    });
    return unsubscribe;
  }, [user?.uid]);

  // Listen for update completion events
  useEffect(() => {
    const unsubscribe = updateEventManager.subscribe(() => {
      setHasPendingUpdates(true);
    });

    return unsubscribe; // Cleanup on unmount
  }, []);

  // Card list — must be declared before any useEffect that uses it in a dep array
  const swipeableCards = useMemo(() => {
    const cards = [];

    // Add upcoming call cards first (one per scheduled call)
    upcomingCallCards.forEach((item, idx) => {
      cards.push({
        id: `upcoming_call_${item.booking.id}`,
        type: 'upcoming_call',
        data: item,
        index: idx,
      });
    });

    // Add course cards
    purchasedCourses.forEach((courseData, index) => {
      const courseId = courseData.courseId || courseData.id || `unknown_${index}`;
      cards.push({
        id: `course_${courseId}`,
        type: 'course',
        data: {
          courseDetails: courseData,
          downloadedCourse: downloadedCourses[courseId]
        },
        index: cards.length
      });
    });

    // Add library card at the end
    cards.push({
      id: 'library',
      type: 'library',
      data: null,
      index: cards.length
    });

    return cards;
  }, [upcomingCallCards, purchasedCourses, downloadedCourses]);

  useEffect(() => {
    if (!loading && swipeableCards.length > 0) {
      cardEntranceAnim.setValue(0);
      Animated.timing(cardEntranceAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    }
  }, [loading, swipeableCards.length]);

  // Load saved scroll position when screen loads or data changes
  useEffect(() => {
    if (!loading && purchasedCourses.length > 0) {
      // Load the saved card index
      loadSelectedCardIndex().then((savedIndex) => {
        const maxIndex = Math.max(0, swipeableCards.length - 1);
        const targetIndex = Math.min(savedIndex, maxIndex);
        
        setCurrentIndex(targetIndex);
        
        // Calculate scroll offset for the target index
        const cardWidth = CARD_WIDTH + CARD_SPACING;
        const targetOffset = targetIndex * cardWidth;
        
        // Set scroll position without animation
        scrollX.setValue(targetOffset);
        
        // Scroll to the saved position immediately when FlatList is ready
        if (flatListRef.current) {
          flatListRef.current.scrollToOffset({ 
            offset: targetOffset, 
            animated: false 
          });
        }
      });
    }
  }, [loading, purchasedCourses.length]);

  // Simple 7-second timeout to clear stuck updating status
  useEffect(() => {
    if (!loading && purchasedCourses.length > 0) {
      const updateTimeout = setTimeout(() => {
        setDownloadedCourses(prev => {
          const updated = { ...prev };
          let hasChanges = false;

          Object.keys(updated).forEach(courseId => {
            if (updated[courseId]?.status === 'updating') {
              updated[courseId] = {
                ...updated[courseId],
                status: 'ready',
                lastUpdated: Date.now()
              };
              hasChanges = true;
            }
          });
          
          return hasChanges ? updated : prev;
        });
      }, 7000); // 7 seconds
      
      return () => clearTimeout(updateTimeout);
    }
  }, [loading, purchasedCourses.length]);

  // Re-fetch courses when screen regains focus, but only after a confirmed program update
  const focusEffectCallback = React.useCallback(() => {
    if (user?.uid && hasPendingUpdates) {
      refreshCoursesFromDatabase();
      updateEventManager.clearPendingUpdates();
      setHasPendingUpdates(false);
    }
  }, [user?.uid, hasPendingUpdates]);

  // Focus handling — both hooks always exist to satisfy rules of hooks
  // On native, useFocusEffect fires on navigator focus; on web it receives a no-op
  useFocusEffect(isWeb ? React.useCallback(() => {}, []) : focusEffectCallback);
  // On web, fire when navigating to the root route
  React.useEffect(() => {
    if (isWeb && typeof window !== 'undefined' && window.location.pathname === '/') {
      focusEffectCallback();
    }
  }, [focusEffectCallback]);

  // Trigger a forced re-fetch — used after purchases and updates
  const loadCoursesFromCache = async () => {
    if (!user?.uid) return;
    try {
      await refetchCourses();
      await checkForTutorials();
    } catch (err) {
      logger.error('❌ Error loading courses:', err);
    }
  };

  // Check for tutorials to show
  const checkForTutorials = async () => {
    if (!user?.uid) return;

    try {
      const tutorials = await tutorialManager.getTutorialsForScreen(user.uid, 'mainScreen');

      if (tutorials.length > 0) {
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
      }
    } catch (error) {
      logger.error('❌ Error checking for tutorials:', error);
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
          'mainScreen',
          currentTutorial.videoUrl
        );
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  };

  // Pull-to-refresh handler
  const onRefresh = async () => {
    if (!user?.uid) return;
    setRefreshing(true);
    try {
      await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.courses(user.uid) });
      await queryClientHook.invalidateQueries({ queryKey: ['bookings', 'upcoming', user.uid] });
    } catch (err) {
      logger.error('❌ Error refreshing courses (pull-to-refresh):', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Force refresh — used after purchases, updates, and manual retry
  const refreshCoursesFromDatabase = async () => {
    try {
      await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.courses(user.uid) });
    } catch (err) {
      logger.error('❌ Error refreshing courses:', err);
    }
  };

  const getTrialMetadata = (course) => {
    const userCourseData = course?.userCourseData;
    const isTrial = userCourseData?.is_trial === true;

    if (!isTrial) {
      return { isTrial: false, isExpired: false, isActive: false, expiresAt: null };
    }

    const expiresAt = userCourseData?.trial_expires_at || userCourseData?.expires_at || null;
    let isExpired = false;
    let isActive = true;

    if (expiresAt) {
      try {
        const expirationTime = new Date(expiresAt).getTime();
        const now = Date.now();
        isExpired = expirationTime <= now;
        isActive = expirationTime > now;
      } catch (error) {
      }
    }

    return { isTrial: true, isExpired, isActive, expiresAt };
  };

  const handleCoursePress = (itemData) => {
    const course = itemData.courseDetails || itemData;
    const trialMetadata = getTrialMetadata(course);

    if (trialMetadata.isTrial && trialMetadata.isExpired) {
      navigation.navigate('CourseDetail', { course });
      return;
    }

    navigation.navigate('DailyWorkout', { course: course });
  };

  const handleLibraryPress = () => {
    navigation.navigate('ProgramLibrary');
  };

  // Alert dialogs shown when a course card is in updating or failed state
  const showUpdateInProgressModal = (course) => {
    Alert.alert(
      "Actualizando programa",
      `"${course.title}" se está actualizando con la última versión. Por favor espera un momento.`,
      [
        {
          text: "Entendido",
          style: "default"
        }
      ]
    );
  };
  
  const showUpdateFailedModal = (course) => {
    Alert.alert(
      "Error en actualización",
      `No se pudo actualizar "${course.title}". Verifica tu conexión a internet e inténtalo de nuevo.`,
      [
        {
          text: "Reintentar",
          onPress: () => retryUpdate(course.id)
        },
        {
          text: "Cancelar",
          style: "cancel"
        }
      ]
    );
  };
  
  const retryUpdate = async (_courseId) => {
    try {
      await loadCoursesFromCache();
    } catch (error) {
      logger.error('❌ Error retrying update:', error);
    }
  };

  // Optimized image preloading (Phase 1 optimization)
  const preloadNextImages = (currentIndex, cards) => {
    try {
      const nextIndices = [currentIndex + 1, currentIndex + 2];
      const preloadPromises = [];
      
      nextIndices.forEach(index => {
        if (index < cards.length) {
          const card = cards[index];
          if (card.type === 'course' && card.data?.downloadedCourse?.imageUrl) {
            preloadPromises.push(
              ExpoImage.prefetch(card.data.downloadedCourse.imageUrl, {
                cachePolicy: 'memory-disk'
              })
            );
          } else if (card.type === 'upcoming_call' && card.data?.course) {
            const uri = card.data.course?.image_url || card.data.course?.imageUrl;
            if (uri) {
              preloadPromises.push(
                ExpoImage.prefetch(uri, { cachePolicy: 'memory-disk' })
              );
            }
          }
        }
      });
      
      if (preloadPromises.length > 0) {
        Promise.all(preloadPromises).catch(() => {});
      }
    } catch (error) {
      // Image preloading is best-effort
    }
  };

  // Handle scroll events to update current index and preload images
  const handleScroll = (event) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const cardWidth = CARD_WIDTH; // No spacing, cards overlap
    const index = Math.round(contentOffsetX / cardWidth);
    
    if (index !== currentIndex) {
      setCurrentIndex(index);
      // Save the selected index
      saveSelectedCardIndex(index);
      
      // Preload next images for smoother scrolling
      preloadNextImages(index, swipeableCards);
    }
  };

  // Render pagination indicators - native driver compatible
  const renderPaginationIndicators = () => {
    const cardWidth = CARD_WIDTH;
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        {swipeableCards.map((_, index) => {
          const inputRange = [
            (index - 1) * cardWidth,
            index * cardWidth,
            (index + 1) * cardWidth,
          ];
          
          // Use only native driver compatible properties
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
    );
  };

  // Renders each card in the horizontal carousel — course, upcoming call, or library
  const renderSwipeableCard = ({ item, index }) => {
    const cardWidth = CARD_WIDTH; // No spacing, cards overlap
    const inputRange = [
      (index - 1) * cardWidth,
      index * cardWidth,
      (index + 1) * cardWidth,
    ];
    
    // Scale: side cards smaller, center card full size
    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.85, 1.0, 0.85], // Side cards 85% size, center card 100%
      extrapolate: 'clamp',
    });
    
    // Opacity: side cards more transparent (behind effect)
    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.5, 1.0, 0.5], // Side cards 50% opacity, center card 100%
      extrapolate: 'clamp',
    });
    
    // Calculate z-index based on distance from center
    // Center card should be in front, side cards behind
    // We'll use currentIndex state to determine which card is centered
    const distanceFromCenter = Math.abs(index - currentIndex);
    const cardZIndex = distanceFromCenter === 0 ? 10 : 
                       distanceFromCenter === 1 ? 5 : 0;
    
    // Cards stay centered - no translateX needed
    // The scale and opacity create the "behind" effect
    const cardStyle = {
      transform: [{ scale: scale }],
      opacity: opacity,
      alignSelf: 'center',
      // Use elevation for Android and zIndex for web - center card in front
      elevation: cardZIndex,
      zIndex: cardZIndex,
    };
    
    if (item.type === 'course') {
      const course = item.data?.courseDetails || item.data;
      const downloadedCourse = item.data?.downloadedCourse;
      const courseStatus = downloadedCourse?.status || 'ready';
      const trialMetadata = getTrialMetadata(course);
      
      // Ensure course exists
      if (!course) {
        logger.error('❌ Course data is undefined for item:', item);
        return null;
      }
      
      // Get creator name from downloaded course data if available
      const creatorName = downloadedCourse?.courseData?.creatorName || 
                         downloadedCourse?.courseData?.creator_name || 
                         course?.creatorName ||
                         course?.creator_name ||
                         'Desconocido';
      
      // FIX: Get image URL with improved fallback chain
      // Prioritize downloaded, then course data, with better fallback
      let imageUrl = null;
      if (downloadedCourse?.imageUrl) {
        imageUrl = downloadedCourse.imageUrl;
      } else if (course?.image_url) {
        imageUrl = course.image_url;
      } else if (course?.imageUrl) {
        imageUrl = course.imageUrl;
      } else if (downloadedCourse?.courseData?.image_url) {
        imageUrl = downloadedCourse.courseData.image_url;
      } else if (downloadedCourse?.courseData?.imageUrl) {
        imageUrl = downloadedCourse.courseData.imageUrl;
      }
      
      if (!imageUrl) {
      }

      // Web: per-pixel text color from image behind (mix-blend-mode: difference).
      // Each text pixel is blended with the image pixel directly behind it (dark behind → light text, light behind → dark text).
      // This is NOT "one color for all text" — that would require sampling the image (canvas/server). We use CSS blend for per-pixel.
      // Apply blend ONLY after image has loaded so the first blend paint uses the image as backdrop.
      const courseIdForCard = course.id || course.courseId;
      const imageLoadedForBlend = isWeb && cardImageLoadedIds.has(courseIdForCard);
      const textOverImageStyle =
        imageUrl && isWeb && imageLoadedForBlend ? { mixBlendMode: 'difference' } : null;
      const blendKey = imageLoadedForBlend ? 'blend-loaded' : 'blend-pending';
      
      if (courseStatus === 'updating') {
        return (
          <Animated.View style={[
            styles.swipeableCard, 
            cardStyle,
            styles.updatingCard
          ]}>
            {imageUrl ? (
              <TouchableOpacity
                style={styles.cardContentWithImage}
                onPress={() => showUpdateInProgressModal(course)}
              >
                <ExpoImage
                  source={{ uri: imageUrl }}
                  style={[styles.cardBackgroundImage, styles.dimmedImage]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <View style={styles.updatingOverlay}>
                  <WakeLoader />
                  <View style={textOverImageStyle}>
                    <Text style={styles.updatingText}>Actualizando programa</Text>
                  </View>
                </View>
                <View style={[styles.cardOverlay, imageUrl && isWeb && { isolation: 'isolate' }]}>
                  {trialMetadata.isTrial && (
                    <View style={styles.trialBadge}>
                      <Text style={styles.trialBadgeText}>Prueba</Text>
                    </View>
                  )}
                  <View style={textOverImageStyle}>
                    <Text style={styles.cardTitle}>
                      {course.title || 'Curso sin título'}
                    </Text>
                    <Text style={styles.cardCreator}>
                      {creatorName ? `Por ${creatorName}` : 'NO ESPECIFICADO'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.cardContent}
                onPress={() => showUpdateInProgressModal(course)}
              >
                {trialMetadata.isTrial && (
                  <View style={styles.trialBadge}>
                    <Text style={styles.trialBadgeText}>Prueba</Text>
                  </View>
                )}
                <WakeLoader />
                <Text style={styles.updatingText}>Actualizando programa</Text>
                <Text style={styles.cardTitle}>
                  {course.title || 'Curso sin título'}
                </Text>
                <Text style={styles.cardCreator}>
                  {creatorName ? `Por ${creatorName}` : 'NO ESPECIFICADO'}
                </Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        );
      }
      
      if (courseStatus === 'failed') {
        return (
          <Animated.View style={[
            styles.swipeableCard, 
            cardStyle,
            styles.failedCard
          ]}>
            {imageUrl ? ( 
              <TouchableOpacity
                style={styles.cardContentWithImage}
                onPress={() => showUpdateFailedModal(course)}
              >
                <ExpoImage
                  source={{ uri: imageUrl }}
                  style={[styles.cardBackgroundImage, styles.dimmedImage]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <View style={styles.failedOverlay}>
                  <View style={textOverImageStyle}>
                    <Text style={styles.failedText}>Error en actualización</Text>
                  </View>
                </View>
                <View style={[styles.cardOverlay, imageUrl && isWeb && { isolation: 'isolate' }]}>
                  {trialMetadata.isTrial && (
                    <View style={styles.trialBadge}>
                      <Text style={styles.trialBadgeText}>Prueba</Text>
                    </View>
                  )}
                  <View style={textOverImageStyle}>
                    <Text style={styles.cardTitle}>
                      {course.title || 'Curso sin título'}
                    </Text>
                    <Text style={styles.cardCreator}>
                      {creatorName ? `Por ${creatorName}` : 'NO ESPECIFICADO'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.cardContent}
                onPress={() => showUpdateFailedModal(course)}
              >
                {trialMetadata.isTrial && (
                  <View style={styles.trialBadge}>
                    <Text style={styles.trialBadgeText}>Prueba</Text>
                  </View>
                )}
                <Text style={styles.failedText}>Error en actualización</Text>
                <Text style={styles.cardTitle}>
                  {course.title || 'Curso sin título'}
                </Text>
                <Text style={styles.cardCreator}>
                  {creatorName ? `Por ${creatorName}` : 'NO ESPECIFICADO'}
                </Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        );
      }
      
      // Normal course card (ready status)
      // Web + image loaded: use background-image on container so blend backdrop is the image (avoids stacking/layer issues with ExpoImage).
      const useBackgroundImageForBlend = isWeb && imageLoadedForBlend && imageUrl;
      const cardContentStyle = [
        styles.cardContentWithImage,
        useBackgroundImageForBlend && {
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: 'cover',
          backgroundColor: 'transparent',
        },
      ];
      return (
        <Animated.View style={[
          styles.swipeableCard, 
          cardStyle,
          imageUrl && {
            borderWidth: 0,
          }
        ]}>
          {imageUrl ? (
            <View style={cardContentStyle}>
              {!useBackgroundImageForBlend && (
                <ExpoImage
                  source={{ uri: imageUrl }}
                  style={styles.cardBackgroundImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                  priority="high"
                  recyclingKey={course.id || course.courseId || 'unknown'}
                  onLoad={() => {
                    const id = course.id || course.courseId;
                    setCardImageLoadedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) return prev;
                      next.add(id);
                      return next;
                    });
                  }}
                />
              )}
              <TouchableOpacity
                style={[
                  styles.cardOverlay,
                  imageUrl && isWeb && { isolation: 'isolate' },
                  useBackgroundImageForBlend && { backgroundColor: 'transparent' },
                ]}
                onPress={() => handleCoursePress(item.data)}
              >
                {trialMetadata.isTrial && (
                  <View style={styles.trialBadge}>
                    <Text style={styles.trialBadgeText}>Prueba</Text>
                  </View>
                )}
                <View
                  key={blendKey}
                  style={[
                    textOverImageStyle,
                    useBackgroundImageForBlend && { backgroundColor: 'transparent' },
                  ]}
                  {...(isWeb && imageLoadedForBlend && { dataSet: { cardBlend: 'true', cardCourseId: courseIdForCard } })}
                >
                  <Text style={styles.cardTitle}>
                    {course.title || 'Curso sin título'}
                  </Text>
                  <Text style={styles.cardCreator}>
                    {creatorName ? `Por ${creatorName}` : 'NO ESPECIFICADO'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.cardContent}
              onPress={() => handleCoursePress(item.data)}
            >
              {trialMetadata.isTrial && (
                <View style={styles.trialBadge}>
                  <Text style={styles.trialBadgeText}>Prueba</Text>
                </View>
              )}
              <Text style={styles.cardTitle}>
                {course.title || 'Curso sin título'}
              </Text>
              <Text style={styles.cardCreator}>
                {creatorName ? `Por ${creatorName}` : 'NO ESPECIFICADO'}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      );
    } else if (item.type === 'upcoming_call') {
      const { booking, course, creatorName } = item.data || {};
      const imageUrl = course?.image_url || course?.imageUrl;
      const displayCreator = creatorName || 'Tu entrenador';
      const slotStart = booking?.slotStartUtc
        ? new Date(booking.slotStartUtc).toLocaleString('es-CO', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      const daysLeftText = (() => {
        if (!booking?.slotStartUtc) return null;
        const start = new Date(booking.slotStartUtc);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        start.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return null;
        if (diffDays === 0) return 'Hoy';
        if (diffDays === 1) return 'Mañana';
        return `En ${diffDays} días`;
      })();

      return (
        <Animated.View style={[styles.swipeableCard, cardStyle, { borderWidth: 0 }]}>
          <TouchableOpacity
            style={[styles.cardContentWithImage, styles.upcomingCallRoot]}
            onPress={() =>
              navigation.navigate('UpcomingCallDetail', {
                booking,
                course: course || undefined,
                creatorName: creatorName || undefined,
              })
            }
            activeOpacity={0.95}
          >
            <View style={StyleSheet.absoluteFill}>
              {imageUrl ? (
                <ExpoImage
                  source={{ uri: imageUrl }}
                  style={styles.upcomingCallBgImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={styles.upcomingCallBgFallback} />
              )}
              <View style={styles.upcomingCallOverlay} />
            </View>
            <View style={styles.upcomingCallGlassWrap}>
              <View
                style={[
                  styles.upcomingCallGlassCard,
                  isWeb && styles.upcomingCallGlassCardWeb,
                ]}
              >
                <View style={styles.upcomingCallGlassCardInner}>
                  <Text style={styles.upcomingCallLabel}>
                    Llamada con <Text style={styles.upcomingCallCreatorName}>{displayCreator}</Text>
                  </Text>
                  {slotStart ? (
                    <Text style={styles.upcomingCallDate}>{slotStart}</Text>
                  ) : null}
                  {daysLeftText ? (
                    <Text style={styles.upcomingCallDaysLeft}>{daysLeftText}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      );
    } else if (item.type === 'library') {
      return (
        <Animated.View style={[styles.swipeableCard, cardStyle]}>
          <View style={styles.cardContentWithImage}>
            <ExpoImage
              // Cloud/remote download disabled: always use bundled fallback
              source={libraryImage}
              style={styles.cardBackgroundImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              priority="high"
              recyclingKey="library"
            />
            <TouchableOpacity
              style={styles.cardOverlay}
              onPress={handleLibraryPress}
            >
              <Text style={styles.cardTitle}>
                Biblioteca
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      );
    }
    
    return null;
  };

  return (
    <Animated.View style={{ flex: 1, opacity: screenAnim }}>
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      <FixedWakeHeader />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ffffff"
            colors={['#ffffff']}
            progressBackgroundColor="#1a1a1a"
            title={refreshing ? "Actualizando..." : "Desliza para actualizar"}
            titleColor="#ffffff"
            progressViewOffset={120}
          />
        }
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        bounces={true}
        alwaysBounceVertical={true}
      >
        <WakeHeaderContent style={styles.contentWrapper}>
          <WakeHeaderSpacer />
          <Animated.View style={[styles.userSection, { opacity: greetAnim, transform: [{ translateY: greetAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
            <Text style={styles.greeting}>
              Hola, <Text style={styles.username}>{firstName}</Text>
            </Text>
          </Animated.View>

          {/* Swipeable Cards Section */}
          <View style={styles.cardsSection}>
            {loading ? (
              Platform.OS === 'web' ? (
                <View style={[styles.loadingContainer, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: CARD_MARGIN }]}>
                  {/* Main card skeleton */}
                  <div className="wake-skeleton" style={{ width: '100%', height: CARD_HEIGHT, borderRadius: 16 }} />
                  {/* Side ghost cards for carousel feel */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, width: '80%' }}>
                    <div className="wake-skeleton" style={{ flex: 2, height: 14, borderRadius: 4 }} />
                    <div className="wake-skeleton" style={{ flex: 1, height: 14, borderRadius: 4 }} />
                  </View>
                  {/* Pagination dots skeleton */}
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
                    {[1,2,3].map(i => (
                      <div key={i} className="wake-skeleton" style={{ width: i === 2 ? 10 : 6, height: i === 2 ? 10 : 6, borderRadius: '50%', opacity: i === 2 ? 1 : 0.4 }} />
                    ))}
                  </View>
                </View>
              ) : (
                <LoadingSpinner
                  size="large"
                  text="Cargando programas..."
                  containerStyle={styles.loadingContainer}
                />
              )
            ) : error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={refreshCoursesFromDatabase}>
                  <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
                
              </View>
            ) : (
              <Animated.View style={[styles.swipeableContainer, { opacity: cardEntranceAnim, transform: [{ translateY: cardEntranceAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
                <View style={{ flex: 1, position: 'relative', overflow: 'visible' }}>
                    <View style={styles.cardsAndPaginationWrapper}>
                      <Animated.FlatList
                        ref={flatListRef}
                        data={swipeableCards}
                        renderItem={renderSwipeableCard}
                        keyExtractor={(item, index) => item?.id || `item_${index}`}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        snapToInterval={CARD_WIDTH}
                        snapToAlignment="center"
                        decelerationRate="fast"
                        contentContainerStyle={styles.flatListContent}
                        ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
                        onScroll={Animated.event(
                          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                          { useNativeDriver: false } // Must be false for zIndex to work
                        )}
                        onScrollEndDrag={handleScroll}
                        onMomentumScrollEnd={handleScroll}
                        scrollEventThrottle={16}
                        style={styles.flatListStyle}
                        getItemLayout={(_data, index) => ({
                          length: CARD_WIDTH,
                          offset: CARD_WIDTH * index,
                          index,
                        })}
                        // Virtual scrolling optimizations
                        initialNumToRender={2}
                        maxToRenderPerBatch={3}
                        windowSize={5}
                        removeClippedSubviews={true}
                        updateCellsBatchingPeriod={50}
                      />
                      {/* Pagination indicators positioned directly below cards */}
                      <View style={styles.paginationContainer}>
                        {renderPaginationIndicators()}
                      </View>
                    </View>
                  </View>
              </Animated.View>
            )}
          </View>

          {/* Reserve space at bottom so content isn't hidden behind fixed tab bar */}
          <BottomSpacer />
        </WakeHeaderContent>
      </ScrollView>

      {/* Tutorial Overlay */}
      <TutorialOverlay
        visible={tutorialVisible}
        tutorialData={tutorialData}
        onClose={() => setTutorialVisible(false)}
        onComplete={handleTutorialComplete}
      />
    </SafeAreaView>
    </Animated.View>
  );
};

// Export both default and named for web wrapper compatibility
export default MainScreen;
export { MainScreen as MainScreenBase };
