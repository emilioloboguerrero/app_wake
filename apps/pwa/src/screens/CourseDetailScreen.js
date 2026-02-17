import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppState } from 'react-native';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
  Animated,
  ImageBackground,
  Modal,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import Text from '../components/Text';
import { useAuth } from '../contexts/AuthContext';
import { useVideo } from '../contexts/VideoContext';
import SvgPlay from '../components/icons/SvgPlay';
import SvgVolumeMax from '../components/icons/SvgVolumeMax';
import SvgVolumeOff from '../components/icons/SvgVolumeOff';
import SvgArrowReload from '../components/icons/SvgArrowReload';
import firestoreService from '../services/firestoreService';
import purchaseService from '../services/purchaseService';
import { isAdmin, isCreator } from '../utils/roleHelper';
import hybridDataService from '../services/hybridDataService';
import courseDownloadService from '../data-management/courseDownloadService';
import purchaseEventManager from '../services/purchaseEventManager';
import consolidatedDataService from '../services/consolidatedDataService';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import LoadingSpinner from '../components/LoadingSpinner';
import EpaycoWebView from '../components/EpaycoWebView';
import BookCallSlotModal from '../components/BookCallSlotModal';
import { getBookingForUser } from '../services/callBookingService';
import logger from '../utils/logger.js';
import { firestore, auth } from '../config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import profilePictureService from '../services/profilePictureService';
import { isWeb } from '../utils/platform';
import VideoCardWebWrapper from '../components/VideoCardWebWrapper';
import VideoOverlayWebWrapper from '../components/VideoOverlayWebWrapper';

const CourseDetailScreen = ({ navigation, route }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { course } = route.params;
  const { user, loading: authLoading } = useAuth();
  const { isMuted, toggleMute } = useVideo();
  
  // Log auth state changes for debugging
  useEffect(() => {
    logger.log(`🔐 [CourseDetailScreen] Auth state changed - user.uid=${user?.uid}, authLoading=${authLoading}`);
  }, [user?.uid, authLoading]);
  
  // Create styles with current dimensions - memoized to prevent recalculation
  const styles = useMemo(
    () => createStyles(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [userOwnsCourse, setUserOwnsCourse] = useState(false);
  const [checkingOwnership, setCheckingOwnership] = useState(true); // Start as true, will be cleared when user loads or timeout
  const [userRole, setUserRole] = useState('user');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  // Track failed image loads to show fallbacks
  const [failedImages, setFailedImages] = useState(new Set());
  const scrollX = useRef(new Animated.Value(0)).current;
  const [showTopGradient, setShowTopGradient] = useState(false);
  const [showModulesTopGradient, setShowModulesTopGradient] = useState(false); // Modules top gradient visibility
  const [processingPurchase, setProcessingPurchase] = useState(false); // Processing purchase flag
  const processingPurchaseRef = useRef(false); // Fix #8: Use ref for timeout
  const firestoreListenerRef = useRef(null); // Firestore listener reference
  const postPurchaseFlowTriggeredRef = useRef(false); // Prevent duplicate post-purchase flow
  const pendingPostPurchaseRef = useRef(false); // Track pending post-purchase flow
  const postPurchaseTimeoutRef = useRef(null); // Timeout handler for post-purchase flow
  const postPurchaseTimeoutSecondRef = useRef(null); // Second timeout handler (10s fallback)
  const readyNotificationSentRef = useRef(false); // Track purchase ready notification
  const successAlertShownRef = useRef(false); // Track if success alert has been shown
  
  // Video player state
  const [videoUri, setVideoUri] = useState(null);
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [creatorProfileImage, setCreatorProfileImage] = useState(null);
  const [creatorDisplayName, setCreatorDisplayName] = useState('');
  const [userCourseEntry, setUserCourseEntry] = useState(null);
  const [userTrialHistory, setUserTrialHistory] = useState(null);
  const [ownershipReady, setOwnershipReady] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [checkoutURL, setCheckoutURL] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [mercadoPagoEmail, setMercadoPagoEmail] = useState('');
  const [emailModalError, setEmailModalError] = useState('');
  const [showBookCallModal, setShowBookCallModal] = useState(false);
  const [userCallBooking, setUserCallBooking] = useState(null);

  const trialConfig = course?.free_trial || {};
  const trialDurationDays = trialConfig?.duration_days || 0;
  const isTrialFeatureEnabled = Boolean(trialConfig?.active && trialDurationDays > 0);

  const trialStatus = useMemo(() => {
    const hasConsumed = Boolean(
      userTrialHistory?.consumed ||
      userCourseEntry?.trial_consumed
    );

    const isTrialCourse = userCourseEntry?.is_trial === true;
    const expiresAt = userCourseEntry?.trial_expires_at ||
      userCourseEntry?.expires_at ||
      null;

    let isActive = false;
    let isExpired = false;

    if (isTrialCourse && expiresAt) {
      try {
        const expirationTime = new Date(expiresAt).getTime();
        const now = Date.now();
        isActive = expirationTime > now;
        isExpired = expirationTime <= now;
      } catch (error) {
        logger.warn('⚠️ Error parsing trial expiration date:', error);
      }
    }

    return {
      hasConsumed,
      isTrialCourse,
      expiresAt,
      isActive,
      isExpired,
    };
  }, [userCourseEntry, userTrialHistory]);

  const canShowTrialCta = isTrialFeatureEnabled &&
    !trialStatus.hasConsumed &&
    !trialStatus.isTrialCourse &&
    !userOwnsCourse;
  
  const creatorId = useMemo(() => {
    return (
      course?.creator_id ||
      course?.creatorId ||
      course?.creator?.id ||
      null
    );
  }, [course]);

  const isOneOnOne = useMemo(
    () => (course?.deliveryType || course?.delivery_type) === 'one_on_one',
    [course?.deliveryType, course?.delivery_type]
  );
  
  // Initialize video player
  const videoPlayer = useVideoPlayer(videoUri, (player) => {
    if (player) {
      player.loop = false;
      player.muted = isMuted;
      player.volume = 1.0;
    }
  });

  // Define functions with useCallback before using them in effects
  // Note: handlePostPurchaseFlow needs to be defined first as it's used by checkCourseOwnership
  
  const fetchUserRole = React.useCallback(async () => {
    const effectiveUser = user || auth.currentUser;
    if (!effectiveUser?.uid) return;

    try {
      const userDoc = await firestoreService.getUser(effectiveUser.uid);
      if (userDoc?.role) {
        setUserRole(userDoc.role);
      }
    } catch (error) {
      logger.error('Error fetching user role:', error);
    }
  }, [user?.uid]);

  const fetchCourseModules = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      logger.debug('🔍 Fetching modules for course:', course.id);
      // Fix: Modules can be fetched even without user (for public course details)
      const coursesModules = await firestoreService.getCourseModules(course.id, user?.uid);
      
      logger.debug('✅ Modules fetched:', coursesModules.length);
      setModules(coursesModules);
    } catch (error) {
      logger.error('❌ Error fetching course modules:', error);
      setError('Error al cargar los módulos del curso.');
      // Fix: Still set modules to empty array on error to prevent infinite loading
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, [course.id, user?.uid]);

  // Post-purchase flow: sync cache, notify, download, and show success
  // Define BEFORE checkCourseOwnership so it can be used
  const handlePostPurchaseFlow = React.useCallback(async () => {
    // Prevent duplicate execution
    if (postPurchaseFlowTriggeredRef.current) {
      logger.log('⏭️ Post-purchase flow already triggered, skipping duplicate...');
      return;
    }
    
    logger.log('🔄 Starting post-purchase flow...');
    
    // Mark as triggered immediately to prevent duplicates
    postPurchaseFlowTriggeredRef.current = true;
    
    try {
      // CRITICAL: Use effectiveUser (from context or Firebase auth) to ensure we have user data
      // This matches the pattern used in handlePurchaseCourse
      const effectiveUser = user || auth.currentUser;
      
      if (!effectiveUser?.uid) {
        logger.error('❌ Post-purchase flow: No user available');
        throw new Error('User not available for post-purchase flow');
      }

      if (postPurchaseTimeoutRef.current) {
        clearTimeout(postPurchaseTimeoutRef.current);
        postPurchaseTimeoutRef.current = null;
      }
      if (postPurchaseTimeoutSecondRef.current) {
        clearTimeout(postPurchaseTimeoutSecondRef.current);
        postPurchaseTimeoutSecondRef.current = null;
      }

      pendingPostPurchaseRef.current = false;
      
      // FIX: Clear ALL caches before syncing to ensure fresh data
      consolidatedDataService.clearUserCache(effectiveUser.uid);
      consolidatedDataService.clearAllCache();
      
      // Sync courses to update cache with new purchase
      logger.log('📦 Force syncing courses...');
      await hybridDataService.syncCourses(effectiveUser.uid);
      
      // FIX: Also clear consolidated cache again after sync
      consolidatedDataService.clearUserCache(effectiveUser.uid);
      
      // FIX: Wait a moment for cache to update, then download
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Notify MainScreen about the purchase
      logger.log('📢 Notifying purchase complete...');
      purchaseEventManager.notifyPurchaseComplete(course.id);
      
      // Download the purchased course data
      logger.log('📥 Downloading purchased course...');
      try {
        // CRITICAL: Pass userId to downloadCourse for proper version checking and week change detection
        await courseDownloadService.downloadCourse(course.id, effectiveUser.uid);
        logger.log('✅ Course downloaded successfully');
      } catch (downloadError) {
        logger.error('❌ Error downloading course:', downloadError);
        // Continue even if download fails - user can retry later
      }
      
      // Set ownership state
      setUserOwnsCourse(true);
      setProcessingPurchase(false);
      setOwnershipReady(true);
      // Fix #8: Update ref when setting state
      processingPurchaseRef.current = false;
      postPurchaseFlowTriggeredRef.current = false;
      
      logger.log('✅ Post-purchase flow completed, showing success alert...');
      
      // Show success message - use setTimeout to ensure it shows after state updates
      setTimeout(() => {
        logger.log('📢 Displaying Alert.alert now...');
        try {
          Alert.alert(
            '¡Compra exitosa!', 
            'Tu programa ha sido agregado a tu biblioteca. ¡Disfruta tu entrenamiento!',
            [
              {
                text: 'Ir a Página Principal',
                onPress: () => {
                  logger.log('📱 User chose: Navigate to MainScreen');
                  navigation.navigate('MainScreen');
                }
              },
              {
                text: 'Aceptar',
                onPress: () => {
                  logger.log('✅ User chose: Aceptar (staying on page)');
                },
                style: 'cancel'
              }
            ]
          );
          logger.log('✅ Alert.alert called successfully');
        } catch (alertError) {
          logger.error('❌ Error showing alert:', alertError);
        }
      }, 200);
    } catch (error) {
      logger.error('❌ Error in post-purchase flow:', error);
      setProcessingPurchase(false);
      // Fix #8: Update ref when setting state
      processingPurchaseRef.current = false;
      postPurchaseFlowTriggeredRef.current = false;
      pendingPostPurchaseRef.current = false;
      
      Alert.alert(
        'Error',
        'Hubo un problema al procesar tu compra. El programa debería estar disponible en breve.',
        [
          {
            text: 'Aceptar',
            style: 'cancel'
          },
          {
            text: 'Ir a Página Principal',
            onPress: () => {
              navigation.navigate('MainScreen');
            }
          }
        ]
      );
    }
  }, [user, course.id, navigation]);

  const checkCourseOwnership = React.useCallback(async () => {
    // Get user from context or Firebase auth as fallback
    const effectiveUser = user || auth.currentUser;
    
    // Fix: Set checkingOwnership to false if user is not available to prevent infinite loading
    if (!effectiveUser?.uid) {
      logger.log('⚠️ [checkCourseOwnership] User not available (context or Firebase), skipping ownership check');
      setCheckingOwnership(false);
      return;
    }
    
    logger.log(`🔍 [checkCourseOwnership] START - Checking ownership for course: ${course.id}, user: ${effectiveUser.uid} (fromContext=${!!user}, fromFirebase=${!!auth.currentUser && !user})`);
    
    try {
      setCheckingOwnership(true);
      logger.log(`🔍 [checkCourseOwnership] Calling getUserCourseState for course: ${course.id}`);
      const courseState = await purchaseService.getUserCourseState(effectiveUser.uid, course.id);
      logger.log(`🔍 [checkCourseOwnership] getUserCourseState result:`, {
        ownsCourse: courseState.ownsCourse,
        hasCourseData: !!courseState.courseData,
        courseData: courseState.courseData,
        hasTrialHistory: !!courseState.trialHistory,
        trialHistory: courseState.trialHistory
      });
      
      const isProcessing = processingPurchaseRef.current || pendingPostPurchaseRef.current;
      logger.log(`🔍 [checkCourseOwnership] Processing state: isProcessing=${isProcessing}, processingPurchaseRef=${processingPurchaseRef.current}, pendingPostPurchaseRef=${pendingPostPurchaseRef.current}`);
      
      // If we're processing a purchase and course is now owned, trigger post-purchase flow
      if (isProcessing && courseState.ownsCourse && !postPurchaseFlowTriggeredRef.current) {
        logger.log('✅ Course ownership confirmed during purchase processing - triggering post-purchase flow');
        handlePostPurchaseFlow();
        // Fix: Set checkingOwnership to false before returning
        setCheckingOwnership(false);
        return;
      }
      
      // If processing, defer UI update but still check ownership
      if (isProcessing) {
        logger.log('⏳ Ownership check during purchase processing - course owned:', courseState.ownsCourse);
        // Fix: Set checkingOwnership to false before returning
        setCheckingOwnership(false);
        return;
      }

      logger.log(`🔍 [checkCourseOwnership] Setting state - ownsCourse=${courseState.ownsCourse}, isProcessing=${isProcessing}`);
      setUserCourseEntry(courseState.courseData);
      setUserTrialHistory(courseState.trialHistory);
      setUserOwnsCourse(courseState.ownsCourse);
      
      // Set ownershipReady to true if user owns course and not processing purchase
      // This ensures button shows "Ya tienes este programa" correctly
      // Reuse isProcessing variable already declared above
      const shouldBeReady = courseState.ownsCourse && !isProcessing;
      setOwnershipReady(shouldBeReady);
      
      // Log ownership state for debugging
      logger.log(`✅ [checkCourseOwnership] State updated: userOwnsCourse=${courseState.ownsCourse}, ownershipReady=${shouldBeReady}, shouldBeReady calculation: ownsCourse(${courseState.ownsCourse}) && !isProcessing(${!isProcessing}) = ${shouldBeReady}`);
      if (courseState.courseData) {
        logger.log(`📋 [checkCourseOwnership] Course data details:`, {
          status: courseState.courseData.status,
          is_trial: courseState.courseData.is_trial,
          expires_at: courseState.courseData.expires_at,
          expires_at_parsed: courseState.courseData.expires_at ? new Date(courseState.courseData.expires_at).toISOString() : null,
          isCourseEntryActive_result: purchaseService.isCourseEntryActive(courseState.courseData)
        });
      }
    } catch (error) {
      logger.error('Error checking course ownership:', error);
      // On error, assume user doesn't own course to be safe
      setUserOwnsCourse(false);
      setOwnershipReady(false);
    } finally {
      setCheckingOwnership(false);
    }
  }, [user?.uid, course.id, handlePostPurchaseFlow]); // Note: We check auth.currentUser inside the function

  useEffect(() => {
    logger.log(`🚀 [CourseDetailScreen] Component mounted/updated - course.id=${course.id}, user.uid=${user?.uid}`);
    fetchCourseModules();
    fetchUserRole();
    
    // Safety timeout: Clear loading states after 10 seconds to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      logger.warn('⚠️ Safety timeout: Clearing loading states after 10s');
      setLoading(false);
      setCheckingOwnership(false);
    }, 10000);
    
    return () => {
      clearTimeout(safetyTimeout);
    };
  }, [fetchCourseModules, fetchUserRole, course.id, user?.uid]);
  
  // Separate effect to check ownership when user becomes available
  // This is critical because user might not be loaded when component first mounts
  // AuthContext may take time to restore user from IndexedDB (checks at 0ms, 100ms, 500ms, 1000ms)
  useEffect(() => {
    logger.log(`👤 [CourseDetailScreen] User effect triggered - user.uid=${user?.uid}, authLoading=${authLoading}, course.id=${course.id}, checkingOwnership=${checkingOwnership}`);
    
    // Check Firebase auth directly as fallback (in case AuthContext hasn't updated yet)
    const firebaseUser = auth.currentUser;
    logger.log(`👤 [CourseDetailScreen] Firebase auth.currentUser: ${firebaseUser?.uid || 'null'}`);
    
    // Use user from context if available, otherwise fallback to Firebase auth
    const effectiveUser = user || firebaseUser;
    
    if (effectiveUser?.uid && course.id) {
      logger.log(`👤 [CourseDetailScreen] User available (uid=${effectiveUser.uid}, fromContext=${!!user}, fromFirebase=${!!firebaseUser && !user}) - checking ownership for course: ${course.id}`);
      // If user from context is not available but Firebase has it, update the check
      if (!user && firebaseUser) {
        logger.log(`⚠️ [CourseDetailScreen] User found in Firebase but not in context - AuthContext may not have updated yet`);
      }
      checkCourseOwnership();
      // Fetch role when we have a user (context or Firebase) so admin/creator see correct button even before context loads
      fetchUserRole();
    } else if (!authLoading) {
      // Auth has finished loading - wait a bit more for IndexedDB restore (up to 2 seconds)
      // This handles the case where AuthContext delay checks haven't completed yet
      if (!effectiveUser?.uid) {
        logger.log(`⏳ [CourseDetailScreen] Auth finished loading but no user yet - waiting 2s for IndexedDB restore before clearing checkingOwnership`);
        const timeout = setTimeout(() => {
          const finalFirebaseUser = auth.currentUser;
          const finalEffectiveUser = user || finalFirebaseUser;
          if (!finalEffectiveUser?.uid) {
            logger.log(`✅ [CourseDetailScreen] After 2s wait, still no user - user is not logged in, clearing checkingOwnership`);
            setCheckingOwnership(false);
          } else {
            logger.log(`✅ [CourseDetailScreen] User became available during 2s wait (uid=${finalEffectiveUser.uid}) - checking ownership`);
            checkCourseOwnership();
            fetchUserRole();
          }
        }, 2000);
        
        return () => clearTimeout(timeout);
      }
    } else {
      logger.log(`⏳ [CourseDetailScreen] Auth still loading (authLoading=${authLoading}) - waiting for auth to finish before checking ownership`);
    }
  }, [user?.uid, course.id, checkCourseOwnership, fetchUserRole, authLoading, checkingOwnership]);

  useEffect(() => {
    let isMounted = true;

    const loadCreatorProfileImage = async () => {
      if (!creatorId) {
        if (isMounted) {
          setCreatorProfileImage(null);
          setCreatorDisplayName('');
        }
        return;
      }

      try {
        const creatorDoc = await firestoreService.getUser(creatorId);
        if (!isMounted) {
          return;
        }

        let imageUrl =
          creatorDoc?.profilePictureUrl ||
          creatorDoc?.image_url ||
          creatorDoc?.imageUrl ||
          null;

        if (!imageUrl) {
          try {
            imageUrl = await profilePictureService.getProfilePictureUrl(creatorId);
          } catch (imageError) {
            logger.error('Error loading creator profile picture from service:', imageError);
          }
        }

        setCreatorProfileImage(imageUrl);
        const name =
          creatorDoc?.displayName ||
          creatorDoc?.display_name ||
          creatorDoc?.name ||
          '';
        setCreatorDisplayName(name);
      } catch (error) {
        if (isMounted) {
          logger.error('❌ Error fetching creator profile image:', {
            creatorId,
            error: error?.message || error
          });
          setCreatorProfileImage(null);
          setCreatorDisplayName('');
          // Mark as failed to prevent retry attempts
          if (creatorId) {
            setFailedImages(prev => new Set(prev).add(`creator-${creatorId}`));
          }
        }
      }
    };

    loadCreatorProfileImage();

    return () => {
      isMounted = false;
    };
  }, [creatorId]);

  // Fetch user's call booking for this course (one-on-one, user doesn't own yet) to show "Manejar reserva" vs "Agendar"
  const clientUserId = user?.uid || auth.currentUser?.uid;
  useEffect(() => {
    if (!isOneOnOne || userOwnsCourse || !creatorId || !course?.id || !clientUserId) {
      setUserCallBooking(null);
      return;
    }
    let isMounted = true;
    getBookingForUser(creatorId, clientUserId, course.id)
      .then((booking) => {
        if (isMounted) setUserCallBooking(booking);
      })
      .catch(() => {
        if (isMounted) setUserCallBooking(null);
      });
    return () => { isMounted = false; };
  }, [isOneOnOne, userOwnsCourse, creatorId, course?.id, clientUserId]);

useEffect(() => {
  readyNotificationSentRef.current = false;
  successAlertShownRef.current = false; // Reset alert flag when course changes
}, [course.id]);

// Show alert when button changes to "¡Ya tienes este programa!" (same trigger)
useEffect(() => {
  // Show alert when both userOwnsCourse and ownershipReady are true (same condition as button)
  if (userOwnsCourse && ownershipReady && processingPurchase && !successAlertShownRef.current) {
    successAlertShownRef.current = true;
    
    logger.log('📢 Button shows "¡Ya tienes este programa!" - showing success alert');
    
    // Small delay to ensure UI has updated
    setTimeout(() => {
      Alert.alert(
        '¡Compra exitosa!', 
        'Tu programa ha sido agregado a tu biblioteca. ¡Disfruta tu entrenamiento!',
        [
          {
            text: 'Ir a Página Principal',
            onPress: () => {
              logger.log('📱 User chose: Navigate to MainScreen');
              navigation.navigate('MainScreen');
            }
          },
          {
            text: 'Aceptar',
            onPress: () => {
              logger.log('✅ User chose: Aceptar (staying on page)');
            },
            style: 'cancel'
          }
        ]
      );
      
      // Clean up processing state
      processingPurchaseRef.current = false;
      pendingPostPurchaseRef.current = false;
      setProcessingPurchase(false);
    }, 300);
  }
}, [userOwnsCourse, ownershipReady, processingPurchase, navigation]);

useEffect(() => {
  return () => {
    if (postPurchaseTimeoutRef.current) {
      clearTimeout(postPurchaseTimeoutRef.current);
      postPurchaseTimeoutRef.current = null;
    }
  };
}, []);

  // Re-check ownership when screen comes into focus (handles expiration case)
  // On web, use useEffect. On native, useFocusEffect is handled by wrapper
  React.useEffect(() => {
    // On web, run the check on mount
    const effectiveUser = user || auth.currentUser;
    if (isWeb && effectiveUser?.uid) {
      checkCourseOwnership().then(async () => {
        if (processingPurchaseRef.current || pendingPostPurchaseRef.current) {
          logger.log('💳 Screen mounted while processing purchase - checking if course was assigned...');
          const courseState = await purchaseService.getUserCourseState(effectiveUser.uid, course.id);
          if (courseState.ownsCourse && !postPurchaseFlowTriggeredRef.current) {
            logger.log('✅ Course found on mount - triggering post-purchase flow');
            handlePostPurchaseFlow();
          }
        }
      });
    }
  }, [user?.uid, course.id, checkCourseOwnership, handlePostPurchaseFlow]);

  // Safety check: Re-verify ownership after initial check completes
  // This catches cases where the initial check might have failed or been skipped
  React.useEffect(() => {
    const effectiveUser = user || auth.currentUser;
    if (!checkingOwnership && !userOwnsCourse && effectiveUser?.uid && course.id && !processingPurchase) {
      // Double-check ownership after a delay to catch any missed updates
      const safetyCheckTimeout = setTimeout(async () => {
        try {
          const courseState = await purchaseService.getUserCourseState(effectiveUser.uid, course.id);
          if (courseState.ownsCourse && !userOwnsCourse) {
            logger.log('🔍 Safety check: User actually owns course, updating state');
            setUserOwnsCourse(true);
            setOwnershipReady(true);
          }
        } catch (error) {
          logger.debug('Safety check ownership error (non-critical):', error);
        }
      }, 3000); // Check after 3 seconds
      
      return () => clearTimeout(safetyCheckTimeout);
    }
  }, [checkingOwnership, userOwnsCourse, user?.uid, course.id, processingPurchase]);

  // Fix #7: Set up Firestore real-time listener for course ownership (optimized)
  // This will automatically set up when user becomes available
  useEffect(() => {
    // Get user from context or Firebase auth as fallback
    const effectiveUser = user || auth.currentUser;
    
    if (!effectiveUser?.uid || !course.id) {
      logger.log(`⚠️ [Firestore Listener Setup] Skipping - effectiveUser.uid=${effectiveUser?.uid}, course.id=${course.id}, contextUser=${user?.uid}, firebaseUser=${auth.currentUser?.uid}`);
      // Clean up any existing listener if user becomes unavailable
      if (firestoreListenerRef.current) {
        logger.log(`🧹 [Firestore Listener Setup] Cleaning up listener - user became unavailable`);
        firestoreListenerRef.current();
        firestoreListenerRef.current = null;
      }
      return;
    }

    logger.log(`🔍 [Firestore Listener Setup] Setting up listener for course: ${course.id}, user: ${effectiveUser.uid} (fromContext=${!!user}, fromFirebase=${!!auth.currentUser && !user})`);
    
    // Set up real-time listener on user document
    const userDocRef = doc(firestore, 'users', effectiveUser.uid);
    
    logger.log(`🔍 [Firestore Listener Setup] Creating onSnapshot listener...`);
    firestoreListenerRef.current = onSnapshot(
      userDocRef,
      (snapshot) => {
        logger.log(`🔔 [Firestore Listener] Snapshot received for user: ${effectiveUser.uid}`);
        if (snapshot.exists()) {
          const userData = snapshot.data();
          const userCourses = userData?.courses || {};
          logger.log(`🔍 [Firestore Listener] User has ${Object.keys(userCourses).length} courses in userData.courses`);
          const courseData = userCourses[course.id];
          logger.log(`🔍 [Firestore Listener] Looking for course ${course.id} in userCourses, found: ${!!courseData}`);

          // Fix #7: Only process if course data exists (filter in callback)
          if (!courseData) {
            // Course not in user's courses - ensure state reflects this
            logger.log(`🔍 [Firestore Listener] No course data found for course: ${course.id}, current userOwnsCourse=${userOwnsCourse}`);
            if (userOwnsCourse) {
              logger.log('🔄 [Firestore Listener] Course removed from user courses - updating state to false');
              setUserOwnsCourse(false);
              setOwnershipReady(false);
            }
            return;
          }
          
          logger.log(`🔍 [Firestore Listener] Course data found for course: ${course.id}`);

          // Use the same ownership check logic as checkCourseOwnership for consistency
          // This properly handles trials (is_trial === true) and null expiration dates
          logger.log(`🔍 [Firestore Listener] Course data found:`, {
            status: courseData.status,
            is_trial: courseData.is_trial,
            expires_at: courseData.expires_at,
            expires_at_parsed: courseData.expires_at ? new Date(courseData.expires_at).toISOString() : null,
            expires_at_now_comparison: courseData.expires_at ? new Date(courseData.expires_at) > new Date() : 'null'
          });
          const ownsCourse = purchaseService.isCourseEntryActive(courseData);
          logger.log(`🔍 [Firestore Listener] isCourseEntryActive result: ${ownsCourse}`);

          // Fix: Always sync ownership state when course is owned
          // This ensures the button shows correctly even if user already owns the course
          if (ownsCourse) {
            if (!readyNotificationSentRef.current) {
              readyNotificationSentRef.current = true;
              purchaseEventManager.notifyPurchaseReady(course.id);
            }

            // Always update state when course is owned (regardless of current state)
            // This ensures the button shows "Ya tienes este programa" correctly
            // Only skip if we're currently processing a purchase (let post-purchase flow handle it)
            const isProcessingPurchase = processingPurchaseRef.current || pendingPostPurchaseRef.current;
            if (!isProcessingPurchase) {
              // Not processing purchase - user already owns, so always set both states to true
              // This fixes the issue where button shows "Comprar" instead of "Ya tienes este programa"
              // Always update, even if state appears correct, to ensure UI reflects ownership
              if (!userOwnsCourse || !ownershipReady) {
                logger.log(`✅ Course ownership confirmed via Firestore listener (sync): userOwnsCourse=${userOwnsCourse} -> true, ownershipReady=${ownershipReady} -> true`);
              } else {
                logger.log(`✅ Course ownership already set via Firestore listener: userOwnsCourse=${userOwnsCourse}, ownershipReady=${ownershipReady}`);
              }
              // Always set both states to ensure button shows correctly
              setUserOwnsCourse(true);
              setOwnershipReady(true);
            }
            
            // If we're processing a purchase, trigger post-purchase flow
            // Check if we're processing AND course is owned AND haven't triggered yet
            const shouldTrigger = isProcessingPurchase && !postPurchaseFlowTriggeredRef.current;
            
            logger.log(`🔍 Firestore listener check: ownsCourse=${ownsCourse}, userOwnsCourse=${userOwnsCourse}, ownershipReady=${ownershipReady}, isProcessing=${isProcessingPurchase}, alreadyTriggered=${postPurchaseFlowTriggeredRef.current}, shouldTrigger=${shouldTrigger}`);
            
            if (shouldTrigger) {
              logger.log('🔄 Purchase detected via Firestore listener, triggering post-purchase flow...');
              handlePostPurchaseFlow();
              return;
            }
          } else {
            // Course is not owned - ensure state reflects this
            logger.log(`❌ [Firestore Listener] Course NOT owned - ownsCourse=${ownsCourse}, current userOwnsCourse=${userOwnsCourse}`);
            if (userOwnsCourse) {
              logger.log('🔄 [Firestore Listener] Course ownership expired or inactive - updating state to false');
              setUserOwnsCourse(false);
              setOwnershipReady(false);
            }
          }
        }
      },
      (error) => {
        logger.error('Error in Firestore listener:', error);
      }
    );

    // Cleanup listener on unmount
    return () => {
      if (firestoreListenerRef.current) {
        firestoreListenerRef.current();
        firestoreListenerRef.current = null;
      }
    };
  }, [user?.uid, course.id, userOwnsCourse, ownershipReady, handlePostPurchaseFlow]); // Note: We check auth.currentUser inside the effect

  // Handle screen focus changes - pause video when screen loses focus
  // Only needed on native - on web, browser handles this
  React.useEffect(() => {
    if (isWeb) return; // Skip on web

    // On native, set up focus/blur handling
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        logger.log('🛑 App went to background - pausing video');
        try {
          if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.muted = true;
            setIsVideoPaused(true);
          }
        } catch (error) {
          logger.log('⚠️ Error pausing video player:', error.message);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [videoPlayer]);

  // Set video URI when course data is available
  useEffect(() => {
    if (course?.video_intro_url) {
      setVideoUri(course.video_intro_url);
    } else if (course?.image_url) {
      setVideoUri(null); // Fallback to image
    }
  }, [course]);

  // Sync video player with pause state
  useEffect(() => {
    if (videoPlayer) {
      if (isVideoPaused) {
        videoPlayer.pause();
      } else {
        videoPlayer.play();
      }
    }
  }, [isVideoPaused, videoPlayer]);


  // Video tap handler
  const handleVideoTap = () => {
    setIsVideoPaused(!isVideoPaused);
  };

  // Video restart handler
  const handleVideoRestart = () => {
    if (videoPlayer) {
      videoPlayer.currentTime = 0;
      videoPlayer.play();
      setIsVideoPaused(false);
    }
  };

  // Determine which purchase flow to use
  const shouldUseFreeFlow = () => {
    // Get effective user (from context or Firebase auth)
    const effectiveUser = user || auth.currentUser;
    
    // Debug logging
    logger.debug('🔍 DEBUG shouldUseFreeFlow:');
    logger.debug('  - course.status:', course.status);
    logger.debug('  - userRole:', userRole);
    logger.debug('  - isAdmin(userRole):', isAdmin(userRole));
    logger.debug('  - isCreator(userRole):', isCreator(userRole));
    logger.debug('  - course.status !== "published":', course.status !== 'published');
    logger.debug('  - creatorId:', creatorId);
    logger.debug('  - effectiveUser.uid:', effectiveUser?.uid);
    logger.debug('  - isOwnProgram:', creatorId && effectiveUser?.uid && creatorId === effectiveUser.uid);
    
    // Use free flow if:
    // 1. Program is in draft state (not published) - free for everyone
    // 2. User is admin - free for all programs
    // 3. User is creator AND this is their own program - free for creators' own programs
    const isDraft = course.status !== 'published';
    const isAdminUser = isAdmin(userRole);
    const isCreatorUser = isCreator(userRole);
    const isOwnProgram = creatorId && effectiveUser?.uid && creatorId === effectiveUser.uid;
    const isCreatorOwnProgram = isCreatorUser && isOwnProgram;
    
    const shouldUseFree = isDraft || isAdminUser || isCreatorOwnProgram;
    
    logger.debug('  - shouldUseFreeFlow result:', shouldUseFree);
    logger.debug('  - Breakdown: isDraft=', isDraft, ', isAdminUser=', isAdminUser, ', isCreatorOwnProgram=', isCreatorOwnProgram);
    
    return shouldUseFree;
  };

  const handlePurchaseCourse = async () => {
    // Get effective user (from context or Firebase auth)
    const effectiveUser = user || auth.currentUser;
    
    if (!effectiveUser?.uid) {
      Alert.alert('Error', 'Debes iniciar sesión para comprar cursos');
      return;
    }

    if (userOwnsCourse) {
      Alert.alert('Ya tienes este curso', 'Este curso ya está en tu biblioteca');
      return;
    }

    // Check free flow FIRST (for draft programs, admin users, or creators' own programs)
    // This ensures draft programs always use local assignment, regardless of platform
    if (shouldUseFreeFlow()) {
      try {
        if (postPurchaseTimeoutRef.current) {
          clearTimeout(postPurchaseTimeoutRef.current);
          postPurchaseTimeoutRef.current = null;
        }
        if (postPurchaseTimeoutSecondRef.current) {
          clearTimeout(postPurchaseTimeoutSecondRef.current);
          postPurchaseTimeoutSecondRef.current = null;
        }
        pendingPostPurchaseRef.current = false;
        processingPurchaseRef.current = false;
        readyNotificationSentRef.current = false;
        setProcessingPurchase(false);

        setOwnershipReady(false);
        setPurchasing(true);

        // Use the free flow (for draft programs, admin users, or creators' own programs)
        const isDraft = course.status !== 'published';
        const isAdminUser = isAdmin(userRole);
        const isCreatorUser = isCreator(userRole);
        const isOwnProgram = creatorId && effectiveUser?.uid && creatorId === effectiveUser.uid;
        const isCreatorOwnProgram = isCreatorUser && isOwnProgram;
        
        logger.debug(`🆓 Using free flow - isDraft=${isDraft}, isAdmin=${isAdminUser}, isCreatorOwnProgram=${isCreatorOwnProgram}`);
        
        const result = await purchaseService.grantFreeAccess(effectiveUser.uid, course.id);
        
        if (result.success) {
          // Do the same operations as the old purchase system
          logger.debug('✅ Processing free access, syncing data...');
          
          // Sync courses to update cache with new purchase
          await hybridDataService.syncCourses(effectiveUser.uid);
          
          // Notify MainScreen about the purchase
          purchaseEventManager.notifyPurchaseComplete(course.id);
          
          // Download the purchased course data
          logger.debug('📥 Downloading purchased course...');
          try {
            // CRITICAL: Pass userId to downloadCourse for proper version checking and week change detection
            await courseDownloadService.downloadCourse(course.id, effectiveUser.uid);
            logger.debug('✅ Course downloaded successfully');
          } catch (downloadError) {
            logger.error('❌ Error downloading course:', downloadError);
            // Continue even if download fails - user can retry later
          }
          
          // Show appropriate message based on who got access
          let alertTitle = '¡Acceso Otorgado!';
          let alertMessage = 'Tienes acceso gratuito a este programa. ¡Disfruta tu entrenamiento!';
          
          if (isCreatorOwnProgram) {
            alertTitle = '¡Programa Agregado!';
            alertMessage = 'Tu programa ha sido agregado a tu biblioteca. ¡Disfruta tu entrenamiento!';
          } else if (isAdminUser) {
            alertTitle = '¡Acceso Admin Otorgado!';
            alertMessage = 'Tienes acceso administrativo a este programa.';
          }
          
          Alert.alert(
            alertTitle,
            alertMessage,
            [
              {
                text: 'Ir a Página Principal',
                onPress: () => navigation.navigate('MainScreen')
              },
              {
                text: 'Aceptar',
                onPress: () => {
                  // Stay on current screen (just close alert)
                },
                style: 'cancel'
              }
            ]
          );
          setUserOwnsCourse(true);
        } else {
          Alert.alert('Error', result.error);
        }
      } catch (error) {
        logger.error('Error granting free access:', error);
        Alert.alert('Error', 'Error al otorgar acceso gratuito');
      } finally {
        setPurchasing(false);
      }
      return; // Exit early - free flow handled
    }


    // Regular purchase flow - open payment modal
    try {
      setPurchasing(true);
      setProcessingPurchase(true);
      processingPurchaseRef.current = true;
      pendingPostPurchaseRef.current = true;
      postPurchaseFlowTriggeredRef.current = false;
      readyNotificationSentRef.current = false;
      successAlertShownRef.current = false;

      logger.log('💳 Preparing purchase for course:', course.id);
      logger.log('🔍 [handlePurchaseCourse] User details:', {
        userId: effectiveUser.uid,
        userEmail: effectiveUser.email,
        courseId: course.id,
      });
      
      // Prepare purchase (creates payment preference)
      const purchaseResult = await purchaseService.preparePurchase(effectiveUser.uid, course.id);
      
      logger.log('🔍 [handlePurchaseCourse] Purchase result:', {
        success: purchaseResult.success,
        requiresAlternateEmail: purchaseResult.requiresAlternateEmail,
        error: purchaseResult.error,
        checkoutURL: purchaseResult.checkoutURL,
      });
      
      if (!purchaseResult.success) {
        // Handle special case: requires alternate email for subscription
        if (purchaseResult.requiresAlternateEmail) {
          logger.warn('⚠️ [handlePurchaseCourse] Requires alternate email - showing email modal');
          setPurchasing(false);
          setProcessingPurchase(false);
          processingPurchaseRef.current = false;
          pendingPostPurchaseRef.current = false;
          // Show email input modal
          setMercadoPagoEmail(effectiveUser.email || '');
          setEmailModalError('');
          setShowEmailModal(true);
          return;
        } else {
          logger.error('❌ [handlePurchaseCourse] Purchase failed:', purchaseResult.error);
          Alert.alert('Error', purchaseResult.error || 'Error al preparar el pago');
        }
        setPurchasing(false);
        setProcessingPurchase(false);
        processingPurchaseRef.current = false;
        pendingPostPurchaseRef.current = false;
        return;
      }

      // Open payment modal with checkout URL
      setCheckoutURL(purchaseResult.checkoutURL);
      setShowPaymentModal(true);
      setPurchasing(false);
      
    } catch (error) {
      logger.error('❌ Error preparing purchase:', error);
      Alert.alert('Error', 'Error al preparar el pago. Intenta de nuevo.');
      setPurchasing(false);
      setProcessingPurchase(false);
      processingPurchaseRef.current = false;
      pendingPostPurchaseRef.current = false;
    }
  };


  // Handle email submission for Mercado Pago subscription
  const handleEmailSubmit = async () => {
    // Get effective user (from context or Firebase auth)
    const effectiveUser = user || auth.currentUser;
    
    if (!effectiveUser?.uid) {
      Alert.alert('Error', 'Debes iniciar sesión para comprar cursos');
      setShowEmailModal(false);
      return;
    }

    if (!mercadoPagoEmail || !mercadoPagoEmail.trim()) {
      setEmailModalError('Por favor ingresa tu correo de Mercado Pago');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(mercadoPagoEmail.trim())) {
      setEmailModalError('Por favor ingresa un correo electrónico válido');
      return;
    }

    setEmailModalError('');
    setShowEmailModal(false);
    
    // Retry purchase with the provided email
    try {
      setPurchasing(true);
      setProcessingPurchase(true);
      processingPurchaseRef.current = true;
      pendingPostPurchaseRef.current = true;
      postPurchaseFlowTriggeredRef.current = false;
      readyNotificationSentRef.current = false;
      successAlertShownRef.current = false;

      logger.log('💳 Retrying purchase with Mercado Pago email:', mercadoPagoEmail.trim());
      
      // Call prepareSubscription directly with the provided email
      const subscriptionResult = await purchaseService.prepareSubscription(
        effectiveUser.uid,
        course.id,
        mercadoPagoEmail.trim()
      );

      if (!subscriptionResult.success) {
        if (subscriptionResult.requiresAlternateEmail) {
          // Still requires alternate email - show modal again
          setShowEmailModal(true);
          setEmailModalError(subscriptionResult.error || 'Este correo no es válido para Mercado Pago. Por favor intenta con otro.');
        } else {
          Alert.alert('Error', subscriptionResult.error || 'Error al preparar el pago');
        }
        setPurchasing(false);
        setProcessingPurchase(false);
        processingPurchaseRef.current = false;
        pendingPostPurchaseRef.current = false;
        return;
      }

      // Success - open payment modal
      setCheckoutURL(subscriptionResult.checkoutURL);
      setShowPaymentModal(true);
      setPurchasing(false);
    } catch (error) {
      logger.error('❌ Error retrying purchase with email:', error);
      Alert.alert('Error', 'Error al preparar el pago. Intenta de nuevo.');
      setPurchasing(false);
      setProcessingPurchase(false);
      processingPurchaseRef.current = false;
      pendingPostPurchaseRef.current = false;
    }
  };

  const handleStartTrial = async () => {
    if (!user?.uid) {
      Alert.alert('Error', 'Debes iniciar sesión para iniciar la prueba gratuita');
      return;
    }

    if (!isTrialFeatureEnabled || !canShowTrialCta) {
      return;
    }

    try {
      if (postPurchaseTimeoutRef.current) {
        clearTimeout(postPurchaseTimeoutRef.current);
        postPurchaseTimeoutRef.current = null;
      }
      if (postPurchaseTimeoutSecondRef.current) {
        clearTimeout(postPurchaseTimeoutSecondRef.current);
        postPurchaseTimeoutSecondRef.current = null;
      }
      pendingPostPurchaseRef.current = false;
      processingPurchaseRef.current = false;
      readyNotificationSentRef.current = false;
      setProcessingPurchase(false);

      setPurchasing(true);

      const result = await purchaseService.startLocalTrial(
        user.uid,
        course.id,
        trialDurationDays
      );

      if (!result.success) {
        Alert.alert('No se pudo iniciar la prueba', result.error || 'Intenta de nuevo más tarde.');
        return;
      }

      await hybridDataService.syncCourses(user.uid);
      purchaseEventManager.notifyPurchaseComplete(course.id);

      try {
        await courseDownloadService.downloadCourse(course.id);
      } catch (downloadError) {
        logger.error('❌ Error downloading course after starting trial:', downloadError);
      }

      await checkCourseOwnership();

      Alert.alert(
        'Prueba iniciada',
        `Tienes ${trialDurationDays} días para explorar este programa.`,
        [
          {
            text: 'Ir a Página Principal',
            onPress: () => navigation.navigate('MainScreen')
          },
          {
            text: 'Aceptar',
            style: 'cancel'
          }
        ]
      );
    } catch (error) {
      logger.error('❌ Error starting trial:', error);
      Alert.alert('Error', 'No pudimos iniciar la prueba gratuita. Intenta de nuevo.');
    } finally {
      setPurchasing(false);
    }
  };



  const schedulePostPurchaseFlow = React.useCallback(() => {
    if (!pendingPostPurchaseRef.current) {
      return;
    }

    if (postPurchaseTimeoutRef.current) {
      return;
    }

    processingPurchaseRef.current = true;
    postPurchaseFlowTriggeredRef.current = true;
    setProcessingPurchase(true);

    postPurchaseTimeoutRef.current = setTimeout(() => {
      postPurchaseTimeoutRef.current = null;
      handlePostPurchaseFlow();
    }, 3000);
  }, [handlePostPurchaseFlow]);


  // Handle payment success
  const handlePaymentSuccess = () => {
    logger.log('✅ Payment successful, waiting for course assignment...');
    setShowPaymentModal(false);
    setCheckoutURL(null);
    // Post-purchase flow will be triggered by Firestore listener
  };

  // Handle payment error
  const handlePaymentError = () => {
    logger.log('❌ Payment failed or cancelled');
    setShowPaymentModal(false);
    setCheckoutURL(null);
    setProcessingPurchase(false);
    processingPurchaseRef.current = false;
    pendingPostPurchaseRef.current = false;
    Alert.alert('Pago cancelado', 'El pago fue cancelado. Puedes intentar de nuevo cuando quieras.');
  };

  const renderPurchaseButton = () => {
    if (checkingOwnership) {
      return (
        <TouchableOpacity style={[styles.primaryButton, styles.disabledButton]} disabled>
          <ActivityIndicator size="small" color="#ffffff" />
          <Text style={styles.primaryButtonText}>Verificando...</Text>
        </TouchableOpacity>
      );
    }

    if (processingPurchase) {
      return (
        <TouchableOpacity style={[styles.primaryButton, styles.disabledButton]} disabled>
          <ActivityIndicator size="small" color="#ffffff" />
          <Text style={styles.primaryButtonText}>
            Procesando compra...
          </Text>
        </TouchableOpacity>
      );
    }

    // Show "Ya tienes este programa" if user owns course
    // Fix: Check userOwnsCourse first - if true, always show owned button (don't check ownershipReady for display)
    if (userOwnsCourse) {
      if (!ownershipReady) {
        return (
          <TouchableOpacity style={[styles.primaryButton, styles.disabledButton]} disabled>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.primaryButtonText}>Actualizando acceso...</Text>
          </TouchableOpacity>
        );
      }

      return (
        <TouchableOpacity style={[styles.primaryButton, styles.ownedButton]} disabled>
          <Text style={styles.primaryButtonText}>¡Ya tienes este programa!</Text>
        </TouchableOpacity>
      );
    }

    if (shouldUseFreeFlow()) {
      return (
        <TouchableOpacity 
          style={[styles.primaryButton, purchasing && styles.disabledButton]} 
          onPress={handlePurchaseCourse}
          disabled={purchasing}
        >
          {purchasing ? (
            <>
              <ActivityIndicator size="small" color="rgba(191, 168, 77, 1)" style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>Procesando acceso...</Text>
            </>
          ) : (
            <Text style={styles.primaryButtonText}>Probar</Text>
          )}
        </TouchableOpacity>
      );
    }

    if (canShowTrialCta) return null;

    if (isOneOnOne) {
      const hasUpcomingBooking = userCallBooking && new Date(userCallBooking.slotEndUtc) > new Date();
      return (
        <TouchableOpacity
          style={[styles.primaryButton, purchasing && styles.disabledButton]}
          onPress={() => setShowBookCallModal(true)}
          disabled={purchasing}
        >
          <Text style={styles.primaryButtonText}>{hasUpcomingBooking ? 'Manejar reserva' : 'Agendar llamada'}</Text>
        </TouchableOpacity>
      );
    }

    const purchaseButtonText = course.price ? `Comprar - ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(course.price)}` : 'Comprar';
    return (
      <TouchableOpacity 
        style={[styles.primaryButton, purchasing && styles.disabledButton]} 
        onPress={handlePurchaseCourse}
        disabled={purchasing}
      >
        {purchasing ? (
          <>
            <ActivityIndicator size="small" color="rgba(191, 168, 77, 1)" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Procesando compra...</Text>
          </>
        ) : (
          <Text style={styles.primaryButtonText}>
            {purchaseButtonText}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderModuleCard = (module, index) => (
    <View key={module.id || index} style={styles.moduleCard}>
      <View style={styles.moduleHeader}>
        <View style={styles.moduleNumber}>
          <Text style={styles.moduleNumberText}>{index + 1}</Text>
        </View>
        <View style={styles.moduleInfo}>
          <Text style={styles.moduleTitle}>{module.title || `Módulo ${index + 1}`}</Text>
          <Text style={styles.moduleDescription}>
            {module.description || 'Descripción del módulo no disponible'}
          </Text>
        </View>
      </View>
    </View>
  );


  // Render pagination indicators - MainScreen style (native driver compatible)
  const renderPaginationIndicators = () => {
    const cards = [0, 1]; // Image card and Info stack cards
    const cardWidth = screenWidth - 48;
    const gap = 15;
    const pageWidth = cardWidth + gap;
    
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
        {cards.map((_, index) => {
          const inputRange = [
            (index - 1) * pageWidth,
            index * pageWidth,
            (index + 1) * pageWidth,
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

  // Show loading spinner while loading modules
  // Only show "Verificando acceso" if we're actually checking (user is available)
  // If user is not available, don't block the UI - show the screen with purchase button
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
        <FixedWakeHeader 
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <LoadingSpinner 
          size="large" 
          text="Cargando programa..." 
          containerStyle={styles.loadingContainer}
        />
      </SafeAreaView>
    );
  }
  
  // Only show "Verificando acceso" if user is available and we're checking
  // If user is not logged in, skip this and show the purchase button
  if (checkingOwnership && user?.uid) {
    return (
      <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
        <FixedWakeHeader 
          showBackButton={true}
          onBackPress={() => navigation.goBack()}
        />
        <LoadingSpinner 
          size="large" 
          text="Verificando acceso..." 
          containerStyle={styles.loadingContainer}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
      {/* Fixed Header with Back Button */}
      <FixedWakeHeader 
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
        profileImageUrl={creatorProfileImage}
        onProfilePress={
          creatorId
            ? () => navigation.navigate('CreatorProfile', {
                creatorId,
                imageUrl: creatorProfileImage,
              })
            : null
        }
      />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <WakeHeaderContent style={styles.content}>
          {/* Spacer for fixed header */}
          <WakeHeaderSpacer />

          {/* Program Title Section - Same position as MainScreen */}
          <View style={styles.titleSection}>
            <Text style={styles.programTitle}>
                  {course.title || 'Programa sin título'}
                </Text>
          </View>

          {/* Swipeable Cards Container */}
          <View style={styles.swipeableCardsContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const cardWidth = screenWidth - 48;
                const gap = 15;
                const pageWidth = cardWidth + gap;
                const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
                setCurrentCardIndex(index);
              }}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: false }
              )}
              scrollEventThrottle={16}
              style={styles.horizontalScrollView}
              contentContainerStyle={{ gap: 15, overflow: 'visible' }}
                snapToInterval={screenWidth - 33}
              snapToAlignment="start"
              decelerationRate="fast"
            >
              {/* Card 1: Video Card */}
              <View
                style={[
                  styles.imageCardContainer,
                  (videoUri || course?.image_url) && styles.imageCardNoBorder
                ]}
              >
                {videoUri ? (
                  <VideoCardWebWrapper>
                  <TouchableOpacity 
                    style={styles.videoContainer}
                    onPress={handleVideoTap}
                    activeOpacity={1}
                  >
                    <VideoView
                      player={videoPlayer}
                      style={styles.video}
                      contentFit="cover"
                      fullscreenOptions={{ allowed: false }}
                      allowsPictureInPicture={false}
                      nativeControls={false}
                      showsTimecodes={false}
                      playsInline
                    />
                    {isVideoPaused && (
                      <VideoOverlayWebWrapper pointerEvents="none">
                        <View style={styles.videoDimmingLayer} pointerEvents="none" />
                      </VideoOverlayWebWrapper>
                    )}
                    {isVideoPaused && (
                      <VideoOverlayWebWrapper>
                        <View style={styles.pauseOverlay}>
                          <SvgPlay width={48} height={48} />
                        </View>
                      </VideoOverlayWebWrapper>
                    )}
                    {isVideoPaused && (
                      <VideoOverlayWebWrapper>
                        <View style={styles.volumeIconContainer}>
                        <TouchableOpacity 
                          style={styles.volumeIconButton}
                          onPress={toggleMute}
                          activeOpacity={0.7}
                        >
                          {isMuted ? (
                            <SvgVolumeOff width={24} height={24} color="white" />
                          ) : (
                            <SvgVolumeMax width={24} height={24} color="white" />
                          )}
                        </TouchableOpacity>
                        </View>
                      </VideoOverlayWebWrapper>
                    )}
                    {isVideoPaused && (
                      <VideoOverlayWebWrapper>
                        <View style={styles.restartIconContainer}>
                        <TouchableOpacity 
                          style={styles.restartIconButton}
                          onPress={handleVideoRestart}
                          activeOpacity={0.7}
                        >
                          <SvgArrowReload width={24} height={24} color="white" />
                        </TouchableOpacity>
                        </View>
                      </VideoOverlayWebWrapper>
                    )}
                  </TouchableOpacity>
                  </VideoCardWebWrapper>
                ) : course?.image_url && !failedImages.has(`course-${course.id}`) ? (
                  <ImageBackground
                    source={{ uri: course.image_url }}
                    style={styles.imageCardBackground}
                    imageStyle={styles.imageCardImageStyle}
                    onError={(error) => {
                      logger.error('❌ Error loading course image:', {
                        courseId: course.id,
                        imageUrl: course.image_url,
                        error: error?.message || error
                      });
                      setFailedImages(prev => new Set(prev).add(`course-${course.id}`));
                    }}
                  >
                  </ImageBackground>
                ) : (
                  <View style={styles.imageCardFallback}>
                    <Text style={styles.imageCardFallbackText}>No media available</Text>
                  </View>
                )}
              </View>

              {/* Card 2: Info Cards Stack */}
              <View style={styles.infoCardsStackContainer}>
                {/* Description Card */}
                <View style={styles.descriptionCard}>
                  {/* Top gradient - only show when scrolled */}
                  {showTopGradient && <View style={styles.topGradient} />}
                  
                  {/* Fixed Title */}
                  <Text style={styles.descriptionTitle}>Descripción</Text>
                  
                  <ScrollView 
                    style={styles.descriptionScrollView}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                    onScroll={(event) => {
                      const scrollY = event.nativeEvent.contentOffset.y;
                      setShowTopGradient(scrollY > 10);
                    }}
                    scrollEventThrottle={16}
                  >
                    <Text style={styles.descriptionText}>
                      {course.description || 'Descripción del programa no disponible'}
                    </Text>
                  </ScrollView>
                  
                  {/* Scroll indicator */}
                  <View style={styles.scrollIndicator}>
                    <Text style={styles.scrollIndicatorText}>Desliza</Text>
                  </View>
                </View>

                {/* Discipline and Duration Cards */}
                <View style={styles.infoCardsRow}>
                  <View style={styles.infoCard}>
                    <Text style={styles.infoCardText} numberOfLines={1} ellipsizeMode="tail">
                      {course.discipline || 'General'}
                    </Text>
                  </View>
                  <View style={styles.infoCard}>
                    <Text style={styles.infoCardText} numberOfLines={1} ellipsizeMode="tail">
                      {course.duration || 'No especificada'}
                    </Text>
                  </View>
                </View>

                {/* Modules Card */}
                <View style={styles.modulesCard}>
                  {/* Top gradient - only show when scrolled */}
                  {showModulesTopGradient && <View style={styles.topGradient} />}
                  
                  {/* Fixed Title */}
                  <Text style={styles.modulesTitle}>Módulos</Text>
                  
                  <ScrollView 
                    style={styles.modulesScrollView}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                    onScroll={(event) => {
                      const scrollY = event.nativeEvent.contentOffset.y;
                      setShowModulesTopGradient(scrollY > 10);
                    }}
                    scrollEventThrottle={16}
                  >
                    {modules.length > 0 ? (
                      modules.map((module, index) => (
                        <View key={module.id || index} style={styles.simpleModuleItem}>
                          <Text style={styles.simpleModuleText} numberOfLines={1} ellipsizeMode="tail">
                            {module.title || `Módulo ${index + 1}`}{module.description ? `: ${module.description}` : ''}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <View style={styles.simpleModuleItem}>
                        <Text style={styles.simpleModuleText}>
                          No hay módulos disponibles para este programa
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                  
                  {/* Scroll indicator */}
                  <View style={styles.scrollIndicator}>
                    <Text style={styles.scrollIndicatorText}>Desliza</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
            
            {/* Animated Card Indicators */}
            {renderPaginationIndicators()}
          </View>



          {/* Action Buttons */}
          <View style={styles.actionsSection}>
            {renderPurchaseButton()}
          </View>

          <BottomSpacer />
        </WakeHeaderContent>
      </ScrollView>

      {/* Email Input Modal for Mercado Pago */}
      <Modal
        visible={showEmailModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowEmailModal(false);
          setEmailModalError('');
          setMercadoPagoEmail('');
        }}
      >
        <Pressable
          style={styles.emailModalOverlay}
          onPress={() => {
            setShowEmailModal(false);
            setEmailModalError('');
            setMercadoPagoEmail('');
          }}
        >
          <Pressable style={styles.emailModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.emailModalTitle}>Correo de Mercado Pago</Text>
            <Text style={styles.emailModalDescription}>
              Necesitamos el correo de tu cuenta de Mercado Pago para procesar la suscripción.
            </Text>
            
            <TextInput
              style={[styles.emailModalInput, emailModalError && styles.emailModalInputError]}
              placeholder="correo@mercadopago.com"
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              value={mercadoPagoEmail}
              onChangeText={(text) => {
                setMercadoPagoEmail(text);
                setEmailModalError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={true}
            />
            
            {emailModalError ? (
              <Text style={styles.emailModalErrorText}>{emailModalError}</Text>
            ) : null}
            
            <View style={styles.emailModalButtons}>
              <TouchableOpacity
                style={[styles.emailModalButton, styles.emailModalButtonCancel]}
                onPress={() => {
                  setShowEmailModal(false);
                  setEmailModalError('');
                  setMercadoPagoEmail('');
                }}
              >
                <Text style={styles.emailModalButtonCancelText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.emailModalButton, styles.emailModalButtonSubmit]}
                onPress={handleEmailSubmit}
                disabled={purchasing}
              >
                {purchasing ? (
                  <ActivityIndicator size="small" color="rgba(191, 168, 77, 1)" />
                ) : (
                  <Text style={styles.emailModalButtonSubmitText}>Continuar</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Book call slot modal (one-on-one) */}
      <BookCallSlotModal
        visible={showBookCallModal}
        onClose={() => setShowBookCallModal(false)}
        creatorId={creatorId}
        creatorName={creatorDisplayName || undefined}
        courseId={course?.id}
        clientUserId={clientUserId}
        existingBooking={userCallBooking && new Date(userCallBooking.slotEndUtc) > new Date() ? userCallBooking : undefined}
        onSuccess={() => {
          getBookingForUser(creatorId, clientUserId, course?.id).then(setUserCallBooking);
          Alert.alert('¡Listo!', 'Tu reserva ha sido actualizada.');
        }}
      />

      {/* Payment Modal */}
      <EpaycoWebView
        visible={showPaymentModal}
        checkoutURL={checkoutURL}
        onClose={() => {
          setShowPaymentModal(false);
          setCheckoutURL(null);
          if (!userOwnsCourse) {
            setProcessingPurchase(false);
            processingPurchaseRef.current = false;
            pendingPostPurchaseRef.current = false;
          }
        }}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentError={handlePaymentError}
      />
    </SafeAreaView>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    overflow: 'visible',
  },
  scrollView: {
    flex: 1,
    overflow: 'visible',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    overflow: 'visible',
  },
  titleSection: {
    marginBottom: Math.max(-60, screenHeight * -0.08), // Same as MainScreen userSection
    paddingTop: 0,
    marginTop: 0,
  },
  programTitle: {
    fontSize: Math.min(screenWidth * 0.08, 32), // Same as MainScreen greeting
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
    paddingLeft: screenWidth * 0.06, // Reduced from 12% to 6% of screen width
  },
  infoCardsContainer: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 15,
  },
  infoCardText: {
    fontSize: Math.max(18, screenHeight * 0.022), // 2.2% of screen height, min 18px
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  swipeableCardsContainer: {
    marginBottom: 20,
    marginTop: Math.max(60, screenHeight * 0.08), // Move cards much lower to avoid covering title
    overflow: 'visible',
  },
  horizontalScrollView: {
    height: Math.max(500, screenHeight * 0.63), // Match taller image card height
    overflow: 'visible',
  },
  swipeableCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: Math.max(20, screenWidth * 0.05), // 5% of screen width, min 20px
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    height: Math.max(200, screenHeight * 0), // 25% of screen height, min 200px - Reduced
    width: screenWidth - 48, // Account for horizontal padding
    zIndex: 1,
  },
  // New layout styles
  imageCardContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    height: Math.max(500, screenHeight * 0.63), // Made taller: 70% of screen height, min 550px
    width: screenWidth - Math.max(48, screenWidth * 0.12),
    overflow: 'hidden',
    position: 'relative',
  },
  imageCardNoBorder: {
    borderWidth: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  imageCardBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageCardImageStyle: {
    borderRadius: Math.max(12, screenWidth * 0.04),
    opacity: 0.8,
  },
  imageCardFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333333',
  },
  imageCardFallbackText: {
    color: '#cccccc',
    fontSize: 16,
    textAlign: 'center',
  },
  // Video styles - match WarmupScreen: no position on container so overlays position relative to imageCardContainer
  videoContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  /* Wrapper at zIndex 0; global CSS [data-video-card] video forces <video> element to z-index -1 so overlays paint on top */
  videoWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: Math.max(12, screenWidth * 0.04),
  },
  videoDimmingLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 10,
  },
  pauseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  volumeIconContainer: {
    position: 'absolute',
    top: Math.max(12, screenHeight * 0.015),
    right: Math.max(12, screenWidth * 0.03),
    zIndex: 10,
  },
  volumeIconButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: Math.max(16, screenWidth * 0.04),
    padding: Math.max(8, screenWidth * 0.02),
    minWidth: Math.max(32, screenWidth * 0.08),
    minHeight: Math.max(32, screenWidth * 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  restartIconContainer: {
    position: 'absolute',
    top: Math.max(60, screenHeight * 0.075),
    right: Math.max(12, screenWidth * 0.03),
    zIndex: 10,
  },
  restartIconButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: Math.max(16, screenWidth * 0.04),
    padding: Math.max(8, screenWidth * 0.02),
    minWidth: Math.max(32, screenWidth * 0.08),
    minHeight: Math.max(32, screenWidth * 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCardsStackContainer: {
    width: screenWidth - Math.max(48, screenWidth * 0.12),
    height: Math.max(550, screenHeight * 0.70), // Match taller image card height
    gap: Math.max(15, screenHeight * 0.02),
    overflow: 'visible', // Ensure shadows are not clipped
  },
  descriptionCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    flex: 1,
    overflow: 'visible', // Changed from 'hidden' to match other cards
    padding: Math.max(20, screenWidth * 0.05),
    position: 'relative',
  },
  infoCardsRow: {
    flexDirection: 'row',
    gap: Math.max(15, screenHeight * 0.02),
    height: Math.max(60, screenHeight * 0.07), // Same as original infoCard height
    overflow: 'visible', // Ensure shadows are not clipped
  },
  infoCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    flex: 1,
    height: Math.max(60, screenHeight * 0.07),
    paddingVertical: Math.max(15, screenHeight * 0.018),
    paddingHorizontal: Math.max(20, screenWidth * 0.05),
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCardText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  modulesCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    flex: 1,
    overflow: 'visible', // Changed from 'hidden' to match other cards
    padding: Math.max(20, screenWidth * 0.05),
    position: 'relative',
  },
  descriptionScrollView: {
    flex: 1,
    paddingBottom: 20, // Add padding to prevent text from being covered by overlay
  },
  descriptionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 20,
  },
  descriptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ffffff',
    lineHeight: 22,
  },
  // Gradient and scroll indicator styles (copied from WorkoutExecutionScreen)
  topGradient: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    height: 25,
    backgroundColor: 'rgba(42, 42, 42, 0.9)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    zIndex: 1,
  },
  scrollIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 35,
    backgroundColor: 'rgba(42, 42, 42, 0.9)',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
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
  modulesScrollView: {
    flex: 1,
    paddingBottom: 20, // Add padding to prevent text from being covered by overlay
  },
  noModulesText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 50,
  },
  modulesTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 20,
  },
  simpleModuleItem: {
    marginBottom: 12,
  },
  simpleModuleText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ffffff',
    lineHeight: 22,
  },
  courseInfoSection: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  courseTitleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  courseTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
    marginRight: 12,
    lineHeight: 30,
  },
  disciplineBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  disciplineBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  difficultyBadge: {
    backgroundColor: '#007AFF20',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  difficultyBadgeText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '500',
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  durationLabel: {
    color: '#cccccc',
    fontSize: 16,
    fontWeight: '500',
    marginRight: 12,
  },
  durationValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  creatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  creatorLabel: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '500',
    marginRight: 8,
  },
  creatorValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  descriptionContainer: {
    marginTop: 4,
  },
  descriptionLabel: {
    color: '#cccccc',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  modulesSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
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
    fontWeight: '600',
  },
  modulesContainer: {
    gap: 12,
  },
  modulesCount: {
    color: '#cccccc',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  moduleCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  moduleNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    marginTop: 2,
  },
  moduleNumberText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  moduleInfo: {
    flex: 1,
  },
  moduleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  moduleDescription: {
    color: '#cccccc',
    fontSize: 14,
    lineHeight: 20,
  },
  noModulesContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  noModulesText: {
    color: '#cccccc',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  noModulesSubtext: {
    color: '#999999',
    fontSize: 14,
    textAlign: 'center',
  },
  actionsSection: {
    gap: 12,
    marginTop: 10,
  },
  primaryButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    height: Math.max(50, screenHeight * 0.06), // Match WorkoutExercisesScreen.js
    width: Math.max(280, screenWidth * 0.7), // Increased width to fit "Procesando compra..." text
    borderRadius: Math.max(12, screenWidth * 0.04), // Match WorkoutExercisesScreen.js
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  buttonTextContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  buttonPriceText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
  },
  trialPriceText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.9,
  },
  disabledButton: {
    backgroundColor: '#666666',
    opacity: 0.7,
  },
  ownedButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 18,
    fontWeight: '700',
  },
  infoButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#007AFF',
    height: Math.max(50, screenHeight * 0.06),
    width: Math.max(280, screenWidth * 0.7),
    borderRadius: Math.max(12, screenWidth * 0.04),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Math.max(15, screenHeight * 0.02),
  },
  infoButtonText: {
    color: '#007AFF',
    fontSize: 18,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: Math.max(20, screenWidth * 0.05),
    borderTopRightRadius: Math.max(20, screenWidth * 0.05),
    padding: Math.max(24, screenWidth * 0.06),
    width: '100%',
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.06, 24),
    fontWeight: '600',
  },
  modalCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  modalScrollView: {
    maxHeight: Math.max(400, screenHeight * 0.5),
  },
  modalInfoSection: {
    marginBottom: Math.max(20, screenHeight * 0.025),
  },
  modalInfoLabel: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
    marginBottom: Math.max(8, screenHeight * 0.01),
    opacity: 0.8,
  },
  modalInfoValue: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '400',
    lineHeight: Math.max(24, screenHeight * 0.03),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  // Catalog Info Modal Styles
  catalogInfoModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catalogInfoModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  catalogInfoModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    width: Math.max(350, screenWidth * 0.9),
    maxWidth: 400,
    height: Math.max(400, screenHeight * 0.6),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
    padding: Math.max(24, screenWidth * 0.06),
  },
  catalogInfoScrollContainer: {
    flex: 1,
    position: 'relative',
  },
  catalogInfoScrollView: {
    flex: 1,
  },
  catalogInfoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  catalogInfoModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.06, 24),
    fontWeight: '600',
  },
  catalogInfoCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogInfoCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  catalogInfoModalDescription: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '400',
    lineHeight: Math.max(24, screenHeight * 0.03),
    textAlign: 'left',
  },
  // Email Modal Styles
  emailModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emailModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    width: Math.max(350, screenWidth * 0.9),
    maxWidth: 500,
    padding: Math.max(24, screenWidth * 0.06),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  emailModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.06, 24),
    fontWeight: '600',
    marginBottom: Math.max(12, screenHeight * 0.015),
    textAlign: 'center',
  },
  emailModalDescription: {
    color: '#cccccc',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '400',
    lineHeight: Math.max(22, screenHeight * 0.027),
    marginBottom: Math.max(20, screenHeight * 0.025),
    textAlign: 'center',
  },
  emailModalInput: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: Math.max(8, screenWidth * 0.02),
    padding: Math.max(12, screenWidth * 0.03),
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    marginBottom: Math.max(8, screenHeight * 0.01),
  },
  emailModalInputError: {
    borderColor: '#ff4444',
  },
  emailModalErrorText: {
    color: '#ff4444',
    fontSize: Math.min(screenWidth * 0.035, 14),
    marginBottom: Math.max(12, screenHeight * 0.015),
    textAlign: 'center',
  },
  emailModalButtons: {
    flexDirection: 'row',
    gap: Math.max(12, screenWidth * 0.03),
    marginTop: Math.max(16, screenHeight * 0.02),
  },
  emailModalButton: {
    flex: 1,
    height: Math.max(50, screenHeight * 0.06),
    borderRadius: Math.max(12, screenWidth * 0.04),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailModalButtonCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  emailModalButtonCancelText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '600',
  },
  emailModalButtonSubmit: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191, 168, 77, 1)',
  },
  emailModalButtonSubmitText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '700',
  },
});

export default CourseDetailScreen;
export { CourseDetailScreen as CourseDetailScreenBase };