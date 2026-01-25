import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
  ImageBackground,
  Image,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Text from '../components/Text';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { getStorage } from '../utils/platform';
import { isWeb } from '../utils/platform';
import { auth } from '../config/firebase';
import firestoreService from '../services/firestoreService';
import purchaseService from '../services/purchaseService';
import workoutProgressService from '../data-management/workoutProgressService';
import simpleCourseCache from '../data-management/simpleCourseCache';
import courseDownloadService from '../data-management/courseDownloadService';
import hybridDataService from '../services/hybridDataService';
import purchaseEventManager from '../services/purchaseEventManager';
import updateEventManager from '../services/updateEventManager';
import tutorialManager from '../services/tutorialManager';
import consolidatedDataService from '../services/consolidatedDataService';
import TutorialOverlay from '../components/TutorialOverlay';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import BottomSpacer from '../components/BottomSpacer';
import libraryImage from '../assets/images/library.jpg';
import assetBundleService from '../services/assetBundleService';

import logger from '../utils/logger.js';
import { trackScreenView } from '../services/monitoringService';

// Responsive dimensions - keep original mobile proportions
// Cards should be larger - make them about 85% of screen width
const CARD_SPACING = 0; // No spacing - cards overlap for 3D carousel effect

const MainScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // Calculate card dimensions based on current screen size
  const CARD_MARGIN = screenWidth * 0.1; // 7.5% of screen width for margins on each side (15% total)
  const CARD_WIDTH = screenWidth - (CARD_MARGIN * 2); // Card width = 85% of screen width
  const CARD_HEIGHT = Math.max(500, screenHeight * 0.65); // 68% of screen height, min 500
  
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
      paddingBottom: Math.max(100, screenHeight * 0.15), // Extra padding to ensure pagination is visible
    },
    contentWrapper: {
      flex: 1,
    },
    userSection: {
      marginBottom: Math.max(-60, screenHeight * -0.08), // Space between title and cards - less space
      paddingTop: 0,
      marginTop: 0,
    },
    cardsSection: {
      flex: 1,
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
      overflow: 'visible', // Ensure pagination indicators are not clipped
      marginTop: Math.max(80, screenHeight * 0.12), // Push cards and pagination down
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
      paddingBottom: Math.max(60, screenHeight * 0.1), // Account for bottom menu
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
      paddingBottom: Math.max(30, screenHeight * 0.04), // 4% of screen height, min 30
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
      color: '#ff4444',
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
      backgroundColor: 'rgba(255, 68, 68, 0.8)',
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
      borderColor: 'rgba(191, 168, 77, 0.3)',
      backgroundColor: 'rgba(191, 168, 77, 0.2)',
    },
    trialBadgeText: {
      color: 'rgba(191, 168, 77, 1)',
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    // Navigation buttons
  }), [screenWidth, screenHeight, CARD_WIDTH, CARD_HEIGHT]);
  
  const { user: contextUser } = useAuth();
  // CRITICAL: Use Firebase auth directly as fallback if AuthContext user isn't available yet
  // This handles the case where Firebase has restored auth from IndexedDB but AuthContext hasn't updated
  const user = contextUser || auth.currentUser;
  const [userProfile, setUserProfile] = useState({
    displayName: '',
    username: '',
    email: '',
    phoneNumber: '',
    gender: '',
  });
  const [purchasedCourses, setPurchasedCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Tutorial state
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialData, setTutorialData] = useState([]);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [downloadedCourses, setDownloadedCourses] = useState({});
  const [hasPendingUpdates, setHasPendingUpdates] = useState(false);
  const [cachedCourseData, setCachedCourseData] = useState(null);
  const [libraryImageUri, setLibraryImageUri] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // Get the first name from displayName
  const getFirstName = () => {
    // Check auth.currentUser first for most up-to-date data
    const currentUser = auth.currentUser;
    const displayName = currentUser?.displayName || userProfile?.displayName || user?.displayName;
    
    if (displayName && displayName.trim()) {  // Check for non-empty string
      return displayName.split(' ')[0];  // Get first word (first name)
    }
    // Fallback to email prefix
    return user?.email?.split('@')[0] || 'Usuario';
  };
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef(null);

  // Load library card image from local bundle (preferred) or Firestore URL (fallback)
  useEffect(() => {
    let isMounted = true;

    const loadLibraryImage = async () => {
      try {
        // Prefer local file downloaded once per version; otherwise keep bundled fallback
        const localPath = assetBundleService.getLibraryLocalPath();
        if (isMounted && localPath) {
          setLibraryImageUri(localPath);
          logger.log('✅ Loaded library image from local asset bundle:', localPath);
          return;
        }
        logger.log('ℹ️ Using bundled library image fallback (no local asset yet)');
      } catch (error) {
        logger.error('❌ Error loading library image from app_resources:', error);
      }
    };

    loadLibraryImage();

    return () => {
      isMounted = false;
    };
  }, []);

  // Get platform-specific storage
  const storage = getStorage();

  // Save selected card index to storage
  const saveSelectedCardIndex = async (index) => {
    try {
      await storage.setItem('selectedCardIndex', index.toString());
    } catch (error) {
      // Handle error silently
    }
  };

  // Load selected card index from storage
  const loadSelectedCardIndex = async () => {
    try {
      const savedIndex = await storage.getItem('selectedCardIndex');
      return savedIndex ? parseInt(savedIndex, 10) : 0;
    } catch (error) {
      return 0;
    }
  };

  // Cache course data to reduce database reads
  const cacheCourseData = async (courses) => {
    try {
      const cacheData = {
        courses,
        timestamp: Date.now(),
        userId: user?.uid
      };
      await storage.setItem('cachedCourseData', JSON.stringify(cacheData));
      setCachedCourseData(cacheData);
    } catch (error) {
      logger.error('Error caching course data:', error);
    }
  };

  // Load cached course data
  const loadCachedCourseData = async () => {
    try {
      const cached = await storage.getItem('cachedCourseData');
      if (cached) {
        const cacheData = typeof cached === 'string' ? JSON.parse(cached) : cached;
        // Check if cache is for current user and not too old (24 hours)
        const isCurrentUser = cacheData.userId === user?.uid;
        const isNotExpired = Date.now() - cacheData.timestamp < 24 * 60 * 60 * 1000;
        
        if (isCurrentUser && isNotExpired) {
          setCachedCourseData(cacheData);
          return cacheData.courses;
        }
      }
    } catch (error) {
      logger.error('Error loading cached course data:', error);
    }
    return null;
  };

  // Track if we've attempted to load courses
  const coursesLoadAttemptedRef = useRef(false);
  
  useEffect(() => {
    // Track screen view
    trackScreenView('MainScreen');
    
    if (user?.uid && !coursesLoadAttemptedRef.current) {
      coursesLoadAttemptedRef.current = true;
      logger.log('🔄 User available, starting course loading...');
      
      // Initialize hybrid system with callbacks, but add timeout
      const initPromise = initializeHybridSystem();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('initializeHybridSystem timeout after 10s')), 10000)
      );
      
      Promise.race([initPromise, timeoutPromise])
        .then(() => {
          logger.log('✅ initializeHybridSystem completed successfully');
        })
        .catch((error) => {
          logger.error('❌ Error in initializeHybridSystem (or timeout), falling back to loadCoursesFromCache:', error);
          // Fallback: Load courses directly if initialization fails or times out
          loadCoursesFromCache();
        });
    }
  }, [user?.uid]);
  
  // CRITICAL: Ensure courses are loaded when user becomes available
  // This is a fallback in case initializeHybridSystem doesn't complete or user wasn't available initially
  useEffect(() => {
    if (user?.uid && !coursesLoadAttemptedRef.current) {
      // If we have a user but haven't attempted to load courses yet, load them
      coursesLoadAttemptedRef.current = true;
      logger.log('🔄 User available, loading courses (fallback useEffect)...');
      loadCoursesFromCache();
    }
  }, [user?.uid]);

  // Handle refresh parameter from navigation (e.g., after purchase)
  useEffect(() => {
    logger.log('🔍 MainScreen route params:', route?.params);
    if (route?.params?.refresh && user?.uid) {
      logger.log('🔄 Refresh requested after purchase, reloading courses...');
      refreshCoursesFromDatabase();
      // Clear the refresh param to avoid repeated refreshes
      navigation.setParams({ refresh: undefined });
    }
  }, [route?.params?.refresh]);


  // Listen for purchase events and auto-refresh
  useEffect(() => {
    const unsubscribe = purchaseEventManager.subscribe((courseId) => {
      logger.log('🛒 Purchase event received for course:', courseId);
      if (user?.uid) {
        logger.log('🔄 Auto-refreshing courses after purchase...');
        // Clear consolidated cache to ensure fresh data
        consolidatedDataService.clearUserCache(user.uid);
        refreshCoursesFromDatabase();
      }
    });

    return unsubscribe; // Cleanup on unmount
  }, [user?.uid]);

  useEffect(() => {
    const unsubscribe = purchaseEventManager.subscribeReady((courseId) => {
      logger.log('🎉 Purchase ready event received for course:', courseId);
      if (user?.uid) {
        logger.log('🔄 Refreshing courses after Firestore confirmation...');
        consolidatedDataService.clearUserCache(user.uid);
        refreshCoursesFromDatabase();
      }
    });

    return unsubscribe;
  }, [user?.uid]);

  // Listen for update completion events
  useEffect(() => {
    const unsubscribe = updateEventManager.subscribe((courseId) => {
      logger.log('🔄 Update completed for course:', courseId);
      setHasPendingUpdates(true);
    });

    return unsubscribe; // Cleanup on unmount
  }, []);

  // Initialize hybrid system (clear old cache, etc.)
  const initializeHybridSystem = async () => {
    try {
      logger.log('🔄 initializeHybridSystem: Starting initialization...');
      await hybridDataService.initialize();
      logger.log('✅ initializeHybridSystem: Hybrid service initialized');
      
      // Set up UI refresh callbacks for version updates
      logger.log('🔧 CALLBACK SETUP: Setting up UI update callbacks...');
      courseDownloadService.setUIUpdateCallbacks(
        (courseId, newVersion, status) => {
          logger.debug('🔄 UI REFRESH: Update completed for course:', courseId, 'version:', newVersion, 'status:', status);
          logger.debug('🔍 UI REFRESH DEBUG: Current downloadedCourses keys:', Object.keys(downloadedCourses));
          
          // Force a complete refresh of courses to ensure UI updates
          setDownloadedCourses(prev => {
            logger.debug('🔍 UI REFRESH DEBUG: Previous state keys:', Object.keys(prev));
            logger.debug('🔍 UI REFRESH DEBUG: Course exists in prev?', !!prev[courseId]);
            
            if (prev[courseId]) {
              const newState = {
                ...prev,
                [courseId]: { 
                  ...prev[courseId], 
                  status: status,
                  downloaded_version: newVersion,
                  lastUpdated: Date.now() // Force re-render
                }
              };
              logger.debug('✅ UI REFRESH DEBUG: New state created for course:', courseId, 'status:', status);
              return newState;
            } else {
              logger.debug('⚠️ UI REFRESH: Course not found in downloadedCourses:', courseId);
              return prev;
            }
          });
          
          // Also trigger a refresh of courses from database to ensure consistency
          setTimeout(() => {
            logger.debug('🔄 UI REFRESH: Triggering database refresh for consistency...');
            refreshCoursesFromDatabase();
          }, 100);
          
          logger.debug('✅ UI REFRESH: Course status updated directly in state');
        },
        (courseId, error, status) => {
          logger.debug('❌ UI REFRESH: Update failed for course:', courseId, 'error:', error.message, 'status:', status);
          
          // Direct state update - instant UI refresh
          setDownloadedCourses(prev => {
            if (prev[courseId]) {
              return {
                ...prev,
                [courseId]: { ...prev[courseId], status: status }
              };
            } else {
              logger.debug('⚠️ UI REFRESH: Course not found in downloadedCourses:', courseId);
              return prev;
            }
          });
          
          logger.debug('✅ UI REFRESH: Course status updated directly in state');
        }
      );
      
      // Load courses WITHOUT triggering tutorials
      logger.log('🔄 initializeHybridSystem: Loading courses without tutorials...');
      await loadCoursesFromCacheWithoutTutorials();
      logger.log('✅ initializeHybridSystem: Courses loaded successfully');
    } catch (error) {
      logger.error('❌ Error initializing hybrid system:', error);
      logger.error('❌ Error details:', error.message, error.stack);
      // Fallback to regular course loading
      logger.log('🔄 Falling back to loadCoursesFromCache...');
      await loadCoursesFromCache();
    }
  };

  // Track previous user ID to detect changes
  const previousUserIdRef = useRef(null);

  // Update userProfile immediately when component mounts or user changes
  // Check auth.currentUser directly to get the latest displayName
  useEffect(() => {
    // Get current user from auth.currentUser as source of truth
    const currentUser = auth.currentUser;
    const currentUserId = currentUser?.uid || user?.uid;
    
    // If user ID has changed, clear profile data immediately to prevent stale data
    if (previousUserIdRef.current !== null && previousUserIdRef.current !== currentUserId) {
      logger.log('🔄 User ID changed - clearing stale user profile data:', {
        previousUserId: previousUserIdRef.current,
        currentUserId: currentUserId
      });
      setUserProfile({
        displayName: '',
        username: '',
        email: '',
        phoneNumber: '',
        gender: '',
      });
    }
    
    if (currentUserId) {
      // Always use auth.currentUser as source of truth, fallback to user from context
      setUserProfile(prev => ({
        ...prev,
        displayName: currentUser?.displayName || user?.displayName || prev.displayName || '',
        email: currentUser?.email || user?.email || prev.email || '',
      }));
      previousUserIdRef.current = currentUserId;
    } else {
      // No user, clear profile
      setUserProfile({
        displayName: '',
        username: '',
        email: '',
        phoneNumber: '',
        gender: '',
      });
      previousUserIdRef.current = null;
    }
  }, [user?.uid, user]);

  // Load user profile data using hybrid system
  useEffect(() => {
    const loadUserProfile = async () => {
      // Always use auth.currentUser as source of truth
      const currentUser = auth.currentUser;
      const currentUserId = currentUser?.uid || user?.uid;
      
      // Verify we're loading for the correct user - prevent loading stale data
      if (!currentUserId) {
        logger.log('⚠️ No user ID available - skipping profile load');
        return;
      }
      
      // Double-check that user ID hasn't changed during async operation
      if (previousUserIdRef.current && previousUserIdRef.current !== currentUserId) {
        logger.log('⚠️ User ID changed during profile load - aborting to prevent stale data');
        return;
      }
      
      logger.log('📊 Loading user profile for:', currentUserId);
      try {
        const userData = await hybridDataService.loadUserProfile(currentUserId);
        
        // Final check: verify user hasn't changed during async load
        const finalCurrentUser = auth.currentUser;
        const finalUserId = finalCurrentUser?.uid || user?.uid;
        if (finalUserId !== currentUserId) {
          logger.log('⚠️ User ID changed during profile load - discarding results');
          return;
        }
        
        if (userData) {
          logger.log('✅ User profile loaded successfully:', {
            displayName: userData?.displayName,
            username: userData?.username,
            email: userData?.email
          });
          setUserProfile({
            displayName: userData?.displayName || finalCurrentUser?.displayName || user?.displayName || '',
            username: userData?.username || '',
            email: userData?.email || finalCurrentUser?.email || user?.email || '',
            phoneNumber: userData?.phoneNumber || '',
            gender: userData?.gender || '',
          });
        } else {
          // If no Firestore data yet, use Firebase Auth data as fallback
          logger.log('ℹ️ No Firestore data - using Firebase Auth data');
          setUserProfile({
            displayName: finalCurrentUser?.displayName || user?.displayName || '',
            username: '',
            email: finalCurrentUser?.email || user?.email || '',
            phoneNumber: '',
            gender: '',
          });
        }
      } catch (error) {
        logger.error('❌ Error loading user profile:', error);
        // On error, still set Firebase Auth data as fallback
        const fallbackUser = auth.currentUser || user;
        setUserProfile({
          displayName: fallbackUser?.displayName || '',
          username: '',
          email: fallbackUser?.email || '',
          phoneNumber: '',
          gender: '',
        });
      }
    };

    loadUserProfile();
  }, [user]);

  // Load saved scroll position when screen loads or data changes
  useEffect(() => {
    if (!loading && purchasedCourses.length > 0) {
      // Load the saved card index
      loadSelectedCardIndex().then((savedIndex) => {
        const cards = getSwipeableCards();
        const maxIndex = Math.max(0, cards.length - 1);
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
        logger.debug('⏰ 7s TIMEOUT: Clearing any stuck updating status...');
        setDownloadedCourses(prev => {
          const updated = { ...prev };
          let hasChanges = false;
          
          Object.keys(updated).forEach(courseId => {
            if (updated[courseId]?.status === 'updating') {
              logger.debug('🔄 TIMEOUT: Clearing stuck updating status for course:', courseId);
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

  // Refresh courses when MainScreen comes into focus (only if updates completed)
  // This ensures "actualizando" status is cleared after program updates complete
  const focusEffectCallback = React.useCallback(() => {
    if (user?.uid && hasPendingUpdates) {
      logger.log('🔄 MainScreen focused - refreshing due to completed updates...');
      // Clear consolidated cache to ensure fresh data
      consolidatedDataService.clearUserCache(user.uid);
      // Refresh courses from database
      refreshCoursesFromDatabase();
      
      // Clear the pending updates flag
      updateEventManager.clearPendingUpdates();
      setHasPendingUpdates(false);
    } else {
      logger.log('⏭️ MainScreen focused - no pending updates, skipping refresh');
    }
  }, [user?.uid, hasPendingUpdates]);

  // Use platform-specific focus effect
  // On web, we'll use useEffect; on native, use useFocusEffect
  if (!isWeb) {
    useFocusEffect(focusEffectCallback);
  } else {
    // On web, check location pathname
    React.useEffect(() => {
      if (typeof window !== 'undefined' && window.location.pathname === '/') {
        focusEffectCallback();
      }
    }, [focusEffectCallback]);
  }

  // Load courses using consolidated service with fallback (Phase 1 optimization)
  const loadCoursesFromCache = async () => {
    try {
      setLoading(true);
      setError(null);
      
      logger.log('🔄 Loading courses using consolidated service...');
      logger.log('🔄 User ID:', user?.uid);
      
      if (!user?.uid) {
        logger.error('❌ No user ID available, cannot load courses');
        setLoading(false);
        return;
      }
      
      // Try consolidated service first
      let courses = [];
      let downloadedData = {};
      
      try {
        logger.log('🔄 Calling consolidatedDataService.getUserCoursesWithDetails...');
        const result = await consolidatedDataService.getUserCoursesWithDetails(user.uid);
        courses = result.courses || [];
        downloadedData = result.downloadedData || {};
        logger.log(`✅ Loaded ${courses.length} courses with consolidated service`);
      } catch (consolidatedError) {
        logger.error('⚠️ Consolidated service failed:', consolidatedError);
        logger.warn('⚠️ Consolidated service failed, trying direct loading...', consolidatedError.message);
        logger.error('⚠️ Error stack:', consolidatedError.stack);
        
        // Fallback: Direct Firestore loading
        try {
          logger.log('🔄 Trying direct Firestore loading...');
          const purchasedCourses = await purchaseService.getUserPurchasedCourses(user.uid);
          logger.log('📚 Direct loading: Found', purchasedCourses.length, 'purchased courses');
          
          // Get course details directly from Firestore
          courses = [];
          for (const purchased of purchasedCourses) {
            try {
              const courseId = purchased.courseId || purchased.id;
              if (!courseId) {
                logger.warn('⚠️ Purchased course missing courseId:', purchased);
                continue;
              }
              const courseDetails = await firestoreService.getCourse(courseId);
              if (courseDetails) {
                courses.push({
                  ...courseDetails,
                  courseId: courseDetails.id,
                  purchasedAt: purchased.purchasedAt
                });
              }
            } catch (courseError) {
              logger.warn('⚠️ Failed to load course details for:', purchased.courseId, courseError);
            }
          }
          
          // Set downloaded data to empty (will be loaded on demand)
          downloadedData = {};
          logger.log(`✅ Fallback loaded ${courses.length} courses directly`);
        } catch (fallbackError) {
          logger.error('❌ Fallback loading also failed:', fallbackError);
          throw fallbackError;
        }
      }
      
      logger.log('📚 Final courses count:', courses.length);
      
      if (courses.length > 0) {
        // Update cache with fresh data
        try {
          await simpleCourseCache.updateCache(user.uid, courses);
          await cacheCourseData(courses);
        } catch (cacheError) {
          logger.warn('⚠️ Error updating cache:', cacheError);
          // Continue anyway - cache errors are not critical
        }
        
        // Set courses and downloaded data
        setPurchasedCourses(courses);
        setDownloadedCourses(downloadedData);
        setError(null);
        logger.log('✅ Courses set in state, loading should complete');
      } else {
        // No active courses, but still show the library card
        logger.log('ℹ️ No courses found, showing empty state');
        setPurchasedCourses([]);
        setDownloadedCourses({});
        setError(null);
      }
      
    } catch (error) {
      logger.error('❌ Error loading courses:', error);
      logger.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      setError('Error al cargar tus cursos. Inténtalo de nuevo.');
    } finally {
      logger.log('🔄 Setting loading to false...');
      setLoading(false);
      // Check for tutorials after loading is complete
      try {
        await checkForTutorials();
      } catch (tutorialError) {
        logger.warn('⚠️ Error checking tutorials:', tutorialError);
      }
    }
  };

  // Load courses WITHOUT triggering tutorials (for initialization)
  const loadCoursesFromCacheWithoutTutorials = async () => {
    try {
      setLoading(true);
      setError(null);
      
      logger.log('🔄 Loading courses using consolidated service (no tutorials)...');
      
      // Use consolidated service to get all course data in one call
      const { courses, downloadedData } = await consolidatedDataService.getUserCoursesWithDetails(user.uid);
      
      if (courses.length > 0) {
        // Update cache with fresh data
        await simpleCourseCache.updateCache(user.uid, courses);
        await cacheCourseData(courses);
        
        // Set courses and downloaded data
        setPurchasedCourses(courses);
        setDownloadedCourses(downloadedData);
        setError(null);
        
        logger.log(`✅ Loaded ${courses.length} courses with consolidated service (no tutorials)`);
      } else {
        // No active courses, but still show the library card
        setPurchasedCourses([]);
        setDownloadedCourses({});
        setError(null);
      }
      
    } catch (error) {
      logger.error('❌ Error loading courses:', error);
      setError('Error al cargar tus cursos. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
      // NO tutorial check here - this is for initialization only
    }
  };

  // Check for tutorials to show
  const checkForTutorials = async () => {
    if (!user?.uid) return;

    try {
      logger.log('🎬 Checking for main screen tutorials...');
      const tutorials = await tutorialManager.getTutorialsForScreen(user.uid, 'mainScreen');
      
      if (tutorials.length > 0) {
        logger.log('📚 Found tutorials to show:', tutorials.length);
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
      } else {
        logger.log('✅ No tutorials to show for main screen');
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
        logger.log('✅ Tutorial marked as completed');
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  };

  // Pull-to-refresh handler (uses same logic but with separate refreshing state)
  const onRefresh = async () => {
    if (!user?.uid) return;
    
    setRefreshing(true);
    setError(null);
    
    try {
      logger.log('🔄 Pull-to-refresh: Refreshing courses from database...');
      
      // Ensure callbacks are set up
      courseDownloadService.setUIUpdateCallbacks(
        (courseId, newVersion, status) => {
          setDownloadedCourses(prev => {
            if (prev[courseId]) {
              return {
                ...prev,
                [courseId]: { 
                  ...prev[courseId], 
                  status: status,
                  downloaded_version: newVersion,
                  lastUpdated: Date.now()
                }
              };
            }
            return prev;
          });
        },
        (courseId, error, status) => {
          setDownloadedCourses(prev => {
            if (prev[courseId]) {
              return {
                ...prev,
                [courseId]: { ...prev[courseId], status: status }
              };
            }
            return prev;
          });
        }
      );
      
      // Clear consolidated cache to force fresh data
      consolidatedDataService.clearUserCache(user.uid);
      
      // OPTIMIZED: Run sync and get courses in parallel (they're independent operations)
      const [_, coursesResult] = await Promise.all([
        hybridDataService.syncCourses(user.uid),
        consolidatedDataService.getUserCoursesWithDetails(user.uid)
      ]);
      const { courses, downloadedData } = coursesResult;
      
      logger.log('✅ Pull-to-refresh: Fresh courses loaded:', courses.length);
      
      if (courses.length > 0) {
        // Update cache with fresh data
        await simpleCourseCache.updateCache(user.uid, courses);
        await cacheCourseData(courses);
        
        // Display fresh courses
        setPurchasedCourses(courses);
        setDownloadedCourses(downloadedData);
        setError(null);
      } else {
        // No active courses, but still show the library card
        setPurchasedCourses([]);
        setDownloadedCourses({});
        setError(null);
      }
      
    } catch (error) {
      logger.error('❌ Error refreshing courses (pull-to-refresh):', error);
      if (error.message.includes('offline') || error.message.includes('unavailable')) {
        setError('Sin conexión. Mostrando cursos guardados...');
      } else {
        setError('Error de conexión. Verifica tu internet e inténtalo de nuevo.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const refreshCoursesFromDatabase = async () => {
    try {
      setLoading(true);
      setError(null);
      
      logger.log('🔄 Force refreshing courses from database...');
      
      // Ensure callbacks are set up
      logger.debug('🔧 CALLBACK SETUP: Setting up callbacks in refreshCoursesFromDatabase...');
      courseDownloadService.setUIUpdateCallbacks(
        (courseId, newVersion, status) => {
          logger.debug('🔄 UI REFRESH: Update completed for course:', courseId, 'version:', newVersion, 'status:', status);
          logger.debug('🔍 UI REFRESH DEBUG: Current downloadedCourses keys:', Object.keys(downloadedCourses));
          
          // Force a complete refresh of courses to ensure UI updates
          setDownloadedCourses(prev => {
            logger.debug('🔍 UI REFRESH DEBUG: Previous state keys:', Object.keys(prev));
            logger.debug('🔍 UI REFRESH DEBUG: Course exists in prev?', !!prev[courseId]);
            
            if (prev[courseId]) {
              const newState = {
                ...prev,
                [courseId]: { 
                  ...prev[courseId], 
                  status: status,
                  downloaded_version: newVersion,
                  lastUpdated: Date.now() // Force re-render
                }
              };
              logger.debug('✅ UI REFRESH DEBUG: New state created for course:', courseId, 'status:', status);
              return newState;
            } else {
              logger.debug('⚠️ UI REFRESH: Course not found in downloadedCourses:', courseId);
              return prev;
            }
          });
          
          // Also trigger a refresh of courses from database to ensure consistency
          setTimeout(() => {
            logger.debug('🔄 UI REFRESH: Triggering database refresh for consistency...');
            refreshCoursesFromDatabase();
          }, 100);
          
          logger.debug('✅ UI REFRESH: Course status updated directly in state');
        },
        (courseId, error, status) => {
          logger.debug('❌ UI REFRESH: Update failed for course:', courseId, 'error:', error.message, 'status:', status);
          
          // Direct state update - instant UI refresh
          setDownloadedCourses(prev => {
            if (prev[courseId]) {
              return {
                ...prev,
                [courseId]: { ...prev[courseId], status: status }
              };
            } else {
              logger.debug('⚠️ UI REFRESH: Course not found in downloadedCourses:', courseId);
              return prev;
            }
          });
          
          logger.debug('✅ UI REFRESH: Course status updated directly in state');
        }
      );
      
      // Clear consolidated cache to force fresh data
      consolidatedDataService.clearUserCache(user.uid);
      
      // OPTIMIZED: Run sync and get courses in parallel (they're independent operations)
      const [_, coursesResult] = await Promise.all([
        hybridDataService.syncCourses(user.uid),
        consolidatedDataService.getUserCoursesWithDetails(user.uid)
      ]);
      const { courses, downloadedData } = coursesResult;
      
      logger.log('✅ Fresh courses loaded:', courses.length);
      
      if (courses.length > 0) {
        // Update cache with fresh data
        await simpleCourseCache.updateCache(user.uid, courses);
        await cacheCourseData(courses);
        
        // Display fresh courses
        setPurchasedCourses(courses);
        setDownloadedCourses(downloadedData);
        setError(null);
      } else {
        // No active courses, but still show the library card
        setPurchasedCourses([]);
        setDownloadedCourses({});
        setError(null);
      }
      
    } catch (error) {
      logger.error('❌ Error refreshing courses:', error);
      if (error.message.includes('offline') || error.message.includes('unavailable')) {
        setError('Sin conexión. Mostrando cursos guardados...');
        await loadCoursesFromCache();
      } else {
        setError('Error de conexión. Verifica tu internet e inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
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
        logger.warn('⚠️ Error parsing trial expiration:', error);
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

  // Modal functions for version system
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
  
  const retryUpdate = async (courseId) => {
    try {
      // Clear failed status and retry
      await firestoreService.updateUserCourseVersionStatus(user.uid, courseId, {
        update_status: 'updating'
      });
      
      // Reload courses to trigger update
      await loadCoursesFromCache();
      
    } catch (error) {
      logger.error('❌ Error retrying update:', error);
    }
  };

  // TEST: Manual callback trigger for debugging
  const testCallback = () => {
    logger.debug('🧪 TEST: Manually triggering callback...');
    if (courseDownloadService.onUpdateComplete) {
      courseDownloadService.onUpdateComplete('NJ1EEO8wryjFBpMmahcE', '2025-02', 'ready');
    } else {
      logger.debug('❌ TEST: Callback not set');
    }
  };

  // Create swipeable card data
  const getSwipeableCards = () => {
    const cards = [];
    
    // Add course cards
    purchasedCourses.forEach((courseData, index) => {
      // Ensure we have a valid courseId
      const courseId = courseData.courseId || courseData.id || `unknown_${index}`;
      cards.push({
        id: `course_${courseId}`,
        type: 'course',
        data: {
          courseDetails: courseData, // Wrap course data in courseDetails
          downloadedCourse: downloadedCourses[courseId]
        },
        index: index
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
            // Preload next 2 images
            preloadPromises.push(
              ExpoImage.prefetch(card.data.downloadedCourse.imageUrl, {
                cachePolicy: 'memory-disk'
              })
            );
          }
        }
      });
      
      if (preloadPromises.length > 0) {
        Promise.all(preloadPromises).catch(error => {
          logger.log('⚠️ Image preload failed:', error);
        });
      }
    } catch (error) {
      logger.log('⚠️ Error in image preloading:', error);
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
      const cards = getSwipeableCards();
      preloadNextImages(index, cards);
    }
  };

  // Render pagination indicators - native driver compatible
  const renderPaginationIndicators = () => {
    const cards = getSwipeableCards();
    const cardWidth = CARD_WIDTH; // No spacing
    
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        {cards.map((_, index) => {
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
      
      // FIX: Log when image is missing for debugging
      if (!imageUrl) {
        logger.warn(`⚠️ No image URL found for course ${course.id || course.courseId || 'unknown'}`);
      } else {
        logger.log(`🖼️ Course ${course.id || course.courseId || 'unknown'} has image URL:`, imageUrl);
      }
      
      // Render based on status
      logger.debug('🎨 RENDERING CARD:', course.id, 'status:', courseStatus, 'downloadedData:', !!downloadedCourse);
      
      if (courseStatus === 'updating') {
        logger.debug('🔄 RENDERING UPDATING CARD:', course.id, 'status:', courseStatus);
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
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.updatingText}>Actualizando programa</Text>
                </View>
                <View style={styles.cardOverlay}>
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
                <ActivityIndicator size="large" color="#FFA500" />
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
                  <Text style={styles.failedText}>Error en actualización</Text>
                </View>
                <View style={styles.cardOverlay}>
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
      return (
        <Animated.View style={[
          styles.swipeableCard, 
          cardStyle,
          imageUrl && {
            borderWidth: 0,
          }
        ]}>
          {imageUrl ? (
            <View style={styles.cardContentWithImage}>
              <ExpoImage
                source={{ uri: imageUrl }}
                style={styles.cardBackgroundImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                priority="high"
                recyclingKey={course.id || course.courseId || 'unknown'}
              />
              <TouchableOpacity
                style={styles.cardOverlay}
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
    } else if (item.type === 'library') {
      logger.log('📚 Rendering library card with image:', libraryImageUri || libraryImage);
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
    <SafeAreaView style={styles.container}>
      {/* Fixed Header */}
      <FixedWakeHeader />
      
      {/* Fixed Bottom Spacer - Prevents tab bar overlap */}
      <BottomSpacer />
      
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
        <View style={styles.contentWrapper}>
          {/* Spacer for fixed header */}
          <WakeHeaderSpacer />

          {/* User Greeting Section */}
          <View style={styles.userSection}>
            <Text style={styles.greeting}>
              Hola, <Text style={styles.username}>{getFirstName()}</Text>
            </Text>
          </View>

          {/* Swipeable Cards Section */}
          <View style={styles.cardsSection}>
            {loading ? (
              <LoadingSpinner 
                size="large" 
                text="Cargando programas..." 
                containerStyle={styles.loadingContainer}
              />
            ) : error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={refreshCoursesFromDatabase}>
                  <Text style={styles.retryButtonText}>Reintentar</Text>
                </TouchableOpacity>
                
              </View>
            ) : (
              <View style={styles.swipeableContainer}>
                <View style={{ flex: 1, position: 'relative', overflow: 'visible' }}>
                    <View style={styles.cardsAndPaginationWrapper}>
                      <Animated.FlatList
                        ref={flatListRef}
                        data={getSwipeableCards()}
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
                        getItemLayout={(data, index) => ({
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
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      
      {/* Tutorial Overlay */}
      <TutorialOverlay
        visible={tutorialVisible}
        tutorialData={tutorialData}
        onClose={() => setTutorialVisible(false)}
        onComplete={handleTutorialComplete}
      />
    </SafeAreaView>
  );
};

// Export both default and named for web wrapper compatibility
export default MainScreen;
export { MainScreen as MainScreenBase };
