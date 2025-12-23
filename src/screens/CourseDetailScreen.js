import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  ImageBackground,
  Modal,
  Pressable,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import Text from '../components/Text';
import { useAuth } from '../contexts/AuthContext';
import { useVideo } from '../contexts/VideoContext';
import SvgPlay from '../components/icons/SvgPlay';
import SvgVolumeMax from '../components/icons/SvgVolumeMax';
import SvgVolumeOff from '../components/icons/SvgVolumeOff';
import SvgArrowReload from '../components/icons/SvgArrowReload';
import SvgCircleHelp from '../components/icons/SvgCircleHelp';
import firestoreService from '../services/firestoreService';
import purchaseService from '../services/purchaseService';
import iapService from '../services/iapService';
import { isAdmin, isCreator } from '../utils/roleHelper';
import hybridDataService from '../services/hybridDataService';
import courseDownloadService from '../data-management/courseDownloadService';
import purchaseEventManager from '../services/purchaseEventManager';
import consolidatedDataService from '../services/consolidatedDataService';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import logger from '../utils/logger.js';
import { firestore, auth } from '../config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import profilePictureService from '../services/profilePictureService';
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const CourseDetailScreen = ({ navigation, route }) => {
  const { course } = route.params;
  const { user } = useAuth();
  const { isMuted, toggleMute } = useVideo();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [userOwnsCourse, setUserOwnsCourse] = useState(false);
  const [checkingOwnership, setCheckingOwnership] = useState(true);
  const [userRole, setUserRole] = useState('user');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
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
  const [userCourseEntry, setUserCourseEntry] = useState(null);
  const [userTrialHistory, setUserTrialHistory] = useState(null);
  const [ownershipReady, setOwnershipReady] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

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
  
  // Initialize video player
  const videoPlayer = useVideoPlayer(videoUri, (player) => {
    if (player) {
      player.loop = false;
      player.muted = isMuted;
      player.volume = 1.0;
    }
  });

  useEffect(() => {
    fetchCourseModules();
    checkCourseOwnership();
    fetchUserRole();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadCreatorProfileImage = async () => {
      if (!creatorId) {
        if (isMounted) {
          setCreatorProfileImage(null);
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
      } catch (error) {
        if (isMounted) {
          logger.error('Error fetching creator profile image:', error);
          setCreatorProfileImage(null);
        }
      }
    };

    loadCreatorProfileImage();

    return () => {
      isMounted = false;
    };
  }, [creatorId]);

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

  // Handle app state changes - only cancel if app truly goes to background
  // Don't cancel on 'inactive' as that's normal during IAP payment modal
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      // Only cancel if app truly goes to background (user switched apps)
      // 'inactive' is normal during IAP payment modal - don't cancel then
      if (nextAppState === 'background' && purchasing) {
        logger.log('📱 App went to background during purchase, resetting purchase state...');
        iapService.cancelPurchase();
        setPurchasing(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [purchasing]);

  // Re-check ownership when screen comes into focus (handles expiration case)
  useFocusEffect(
    React.useCallback(() => {
      if (user?.uid) {
        // Check ownership when screen is focused
        checkCourseOwnership().then(async () => {
          // After checking ownership, see if we need to trigger post-purchase flow
          // This handles the case where user navigated away during payment and came back
          if (processingPurchaseRef.current || pendingPostPurchaseRef.current) {
            logger.log('💳 Screen focused while processing purchase - checking if course was assigned...');
            
            // Check if course is now owned
            const courseState = await purchaseService.getUserCourseState(user.uid, course.id);
            if (courseState.ownsCourse && !postPurchaseFlowTriggeredRef.current) {
              logger.log('✅ Course found after screen focus - triggering post-purchase flow');
              handlePostPurchaseFlow();
            }
          }
        });
      }
    }, [user?.uid, course.id, checkCourseOwnership, handlePostPurchaseFlow])
  );

  // Post-purchase flow: sync cache, notify, download, and show success
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
      consolidatedDataService.clearUserCache(user.uid);
      consolidatedDataService.clearAllCache();
      
      // Sync courses to update cache with new purchase
      logger.log('📦 Force syncing courses...');
      await hybridDataService.syncCourses(user.uid);
      
      // FIX: Also clear consolidated cache again after sync
      consolidatedDataService.clearUserCache(user.uid);
      
      // FIX: Wait a moment for cache to update, then download
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Notify MainScreen about the purchase
      logger.log('📢 Notifying purchase complete...');
      purchaseEventManager.notifyPurchaseComplete(course.id);
      
      // Download the purchased course data
      logger.log('📥 Downloading purchased course...');
      try {
        await courseDownloadService.downloadCourse(course.id);
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
            text: 'Revisar',
            onPress: () => {
              // Refresh ownership status
              checkCourseOwnership();
            }
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
  }, [user?.uid, course.id, navigation, checkCourseOwnership]);

  // Fix #7: Set up Firestore real-time listener for course ownership (optimized)
  useEffect(() => {
    if (!user?.uid || !course.id) return;

    // Set up real-time listener on user document
    const userDocRef = doc(firestore, 'users', user.uid);
    
    firestoreListenerRef.current = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data();
          const userCourses = userData?.courses || {};
          const courseData = userCourses[course.id];

          // Fix #7: Only process if course data exists (filter in callback)
          if (!courseData) {
            // Course not in user's courses - skip
            return;
          }

          const isActive = courseData.status === 'active';
          const isNotExpired = new Date(courseData.expires_at) > new Date();
          const ownsCourse = isActive && isNotExpired;

          // Only trigger if ownership changed
          if (ownsCourse) {
            if (!readyNotificationSentRef.current) {
              readyNotificationSentRef.current = true;
              purchaseEventManager.notifyPurchaseReady(course.id);
            }

            const ownershipChanged = !userOwnsCourse;
            if (ownershipChanged) {
              logger.log('✅ Course assigned via Firestore listener');
              setUserOwnsCourse(true);
              setOwnershipReady(true); // Fix: Also set ownershipReady so button updates correctly
            }
            
            // If we're processing a purchase, trigger post-purchase flow
            // Check if we're processing AND course is owned AND haven't triggered yet
            const isProcessingPurchase = processingPurchaseRef.current || pendingPostPurchaseRef.current;
            const shouldTrigger = isProcessingPurchase && !postPurchaseFlowTriggeredRef.current;
            
            logger.log(`🔍 Firestore listener check: ownsCourse=${ownsCourse}, isProcessing=${isProcessingPurchase}, alreadyTriggered=${postPurchaseFlowTriggeredRef.current}, shouldTrigger=${shouldTrigger}`);
            
            if (shouldTrigger) {
              logger.log('🔄 Purchase detected via Firestore listener, triggering post-purchase flow...');
              handlePostPurchaseFlow();
              return;
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
  }, [user?.uid, course.id, userOwnsCourse, handlePostPurchaseFlow]);

  // Handle screen focus changes - pause video when screen loses focus
  useFocusEffect(
    React.useCallback(() => {
      // Screen is focused
      logger.log('🎬 CourseDetail screen focused');
      
      return () => {
        // Screen loses focus - pause video
        logger.log('🛑 CourseDetail screen lost focus - pausing video');
        try {
          if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.muted = true; // Mute as extra safety
            setIsVideoPaused(true); // Update local state
          }
        } catch (error) {
          logger.log('⚠️ Error pausing video player:', error.message);
        }
      };
    }, [videoPlayer])
  );

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

  const fetchUserRole = async () => {
    if (!user?.uid) return;
    
    try {
      console.log('🔍 DEBUG fetchUserRole:');
      console.log('  - user.uid:', user.uid);
      
      const userDoc = await firestoreService.getUser(user.uid);
      console.log('  - userDoc:', userDoc);
      console.log('  - userDoc.role:', userDoc?.role);
      
      if (userDoc && userDoc.role) {
        setUserRole(userDoc.role);
        console.log('  - Set userRole to:', userDoc.role);
      } else {
        console.log('  - No role found, keeping default:', userRole);
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  };

  const checkCourseOwnership = async () => {
    if (!user?.uid) return;
    
    try {
      setCheckingOwnership(true);
      const courseState = await purchaseService.getUserCourseState(user.uid, course.id);
      
      const isProcessing = processingPurchaseRef.current || pendingPostPurchaseRef.current;
      
      // If we're processing a purchase and course is now owned, trigger post-purchase flow
      if (isProcessing && courseState.ownsCourse && !postPurchaseFlowTriggeredRef.current) {
        logger.log('✅ Course ownership confirmed during purchase processing - triggering post-purchase flow');
        handlePostPurchaseFlow();
        return;
      }
      
      // If processing, defer UI update but still check ownership
      if (isProcessing) {
        logger.log('⏳ Ownership check during purchase processing - course owned:', courseState.ownsCourse);
        // Don't update UI yet, but don't return - let the post-purchase flow handle it
        return;
      }

      setUserCourseEntry(courseState.courseData);
      setUserTrialHistory(courseState.trialHistory);
      setUserOwnsCourse(courseState.ownsCourse);
      setOwnershipReady(courseState.ownsCourse && !processingPurchaseRef.current && !pendingPostPurchaseRef.current);
    } catch (error) {
      console.error('Error checking course ownership:', error);
    } finally {
      setCheckingOwnership(false);
    }
  };

  const fetchCourseModules = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Fetching modules for course:', course.id);
      const coursesModules = await firestoreService.getCourseModules(course.id, user?.uid);
      
      console.log('✅ Modules fetched:', coursesModules.length);
      setModules(coursesModules);
    } catch (error) {
      console.error('❌ Error fetching course modules:', error);
      setError('Error al cargar los módulos del curso.');
    } finally {
      setLoading(false);
    }
  };

  // Determine which purchase flow to use
  const shouldUseFreeFlow = () => {
    // Debug logging
    console.log('🔍 DEBUG shouldUseFreeFlow:');
    console.log('  - course.status:', course.status);
    console.log('  - userRole:', userRole);
    console.log('  - isAdmin(userRole):', isAdmin(userRole));
    console.log('  - course.status !== "published":', course.status !== 'published');
    
    // Use free flow if:
    // 1. Program is in draft state (not published)
    // 2. User is admin
    const shouldUseFree = course.status !== 'published' || isAdmin(userRole);
    console.log('  - shouldUseFreeFlow result:', shouldUseFree);
    
    return shouldUseFree;
  };

  const handlePurchaseCourse = async () => {
    if (!user?.uid) {
      Alert.alert('Error', 'Debes iniciar sesión para comprar cursos');
      return;
    }

    if (userOwnsCourse) {
      Alert.alert('Ya tienes este curso', 'Este curso ya está en tu biblioteca');
      return;
    }

    // Check free flow FIRST (for draft programs or admin/creator users)
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

        // Use the free flow (for draft programs or admin/creator users)
        console.log('🆓 Using free flow - Program is draft or user is admin/creator');
        
        const result = await purchaseService.grantFreeAccess(user.uid, course.id);
        
        if (result.success) {
          // Do the same operations as the old purchase system
          console.log('✅ Processing free access, syncing data...');
          
          // Sync courses to update cache with new purchase
          await hybridDataService.syncCourses(user.uid);
          
          // Notify MainScreen about the purchase
          purchaseEventManager.notifyPurchaseComplete(course.id);
          
          // Download the purchased course data
          console.log('📥 Downloading purchased course...');
          try {
            await courseDownloadService.downloadCourse(course.id);
            console.log('✅ Course downloaded successfully');
          } catch (downloadError) {
            console.error('❌ Error downloading course:', downloadError);
            // Continue even if download fails - user can retry later
          }
          
          Alert.alert(
            '¡Acceso Otorgado!',
            'Tienes acceso gratuito a este programa. ¡Disfruta tu entrenamiento!',
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
        console.error('Error granting free access:', error);
        Alert.alert('Error', 'Error al otorgar acceso gratuito');
      } finally {
        setPurchasing(false);
      }
      return; // Exit early - free flow handled
    }

    // Handle IAP purchases
    if (course.iap_product_id) {
      await handleIAPPurchase();
      return;
    }

    // Unified system: Catalog only - no purchases, no redirects
    // Library serves as catalog only for all platforms
    setPurchasing(false);
    setShowInfoModal(true);
  };

  const handleIAPPurchase = async () => {
    if (!user?.uid) {
      Alert.alert('Error', 'Debes iniciar sesión para comprar');
      return;
    }

    if (userOwnsCourse) {
      Alert.alert('Ya tienes este curso', 'Este curso ya está en tu biblioteca');
      return;
    }

    if (!course.iap_product_id) {
      Alert.alert('Error', 'Este programa no está disponible para compra');
      return;
    }

    try {
      // Check if purchase is stuck and reset if needed
      const purchaseState = iapService.getPurchaseState();
      logger.log('📊 Purchase state before starting:', purchaseState);
      
      if (purchaseState.purchaseInProgress) {
        logger.warn('⚠️ Purchase appears to be stuck, resetting...');
        iapService.cancelPurchase();
      }

      setPurchasing(true);

      // Initialize IAP connection
      logger.log('🔄 Initializing IAP...');
      const initResult = await iapService.initialize();
      if (!initResult.success) {
        throw new Error('Error inicializando compras: ' + (initResult.error || 'Unknown error'));
      }

      // Get product from App Store
      logger.log('🔄 Fetching product:', course.iap_product_id);
      const productsResult = await iapService.getProducts([course.iap_product_id]);
      
      if (!productsResult.success || productsResult.products.length === 0) {
        // Get app info for detailed error message
        const appInfo = await iapService.getAppInfo();
        
        let errorMessage = 'El producto no está disponible.\n\n';
        errorMessage += '✅ IAP está conectado correctamente\n';
        errorMessage += '✅ Cuenta de sandbox detectada\n';
        errorMessage += '❌ Producto no encontrado en sandbox\n\n';
        errorMessage += '⚠️ PROBLEMA COMÚN:\n';
        errorMessage += 'Si la versión de la app está "Developer Rejected"\n';
        errorMessage += 'los productos IAP NO se sincronizan a sandbox.\n\n';
        errorMessage += 'SOLUCIÓN:\n';
        errorMessage += '1. Crea una NUEVA versión (ej: 1.1.10)\n';
        errorMessage += '2. Asocia el producto con la nueva versión\n';
        errorMessage += '3. Guarda la versión\n';
        errorMessage += '4. Espera 2-24 horas para sincronización\n\n';
        errorMessage += 'VERIFICA EN APP STORE CONNECT:\n\n';
        errorMessage += `1. Product ID exacto:\n   "${course.iap_product_id}"\n`;
        errorMessage += `   (Debe coincidir EXACTAMENTE)\n\n`;
        errorMessage += `2. Bundle ID:\n   ${appInfo.bundleId}\n\n`;
        errorMessage += `3. Versión de app:\n   ${appInfo.version} (Build ${appInfo.buildNumber})\n`;
        errorMessage += `   ⚠️ Estado: Verifica que NO esté "Rejected"\n\n`;
        errorMessage += '4. El producto DEBE estar asociado con esta versión:\n';
        errorMessage += '   App Store Connect → Tu App → Versiones\n';
        errorMessage += '   → Encuentra versión ' + appInfo.version + '\n';
        errorMessage += '   → "In-App Purchases and Subscriptions"\n';
        errorMessage += '   → Tu producto DEBE estar listado ahí\n\n';
        errorMessage += '5. Estado del producto:\n';
        errorMessage += '   Debe ser "Ready to Submit" (verde)\n';
        errorMessage += '   NO "Draft" o "Waiting for Review"\n\n';
        errorMessage += '6. Tiempo de espera:\n';
        errorMessage += '   Si acabas de crear/asociar el producto,\n';
        errorMessage += '   espera 2-24 horas para sincronización\n\n';
        
        if (productsResult.responseCode !== undefined) {
          const codeName = iapService.getResponseCodeName(productsResult.responseCode);
          errorMessage += `Código de respuesta: ${codeName} (${productsResult.responseCode})\n`;
          errorMessage += 'Esto significa: La solicitud fue exitosa pero el producto no está disponible.\n';
        }
        
        Alert.alert(
          'Producto no disponible',
          errorMessage,
          [
            {
              text: 'Verificar en App Store Connect',
              onPress: () => {
                // Could open App Store Connect URL if needed
                logger.log('💡 User should check App Store Connect');
              }
            },
            {
              text: 'Entendido',
              style: 'cancel'
            }
          ]
        );
        setPurchasing(false);
        return;
      }
      
      // Product found - store user and course info for receipt verification
      const product = productsResult.products[0];
      logger.log('✅ Product found:', product.productId, product.title, product.price);

      // Store purchase info for the listener
      iapService.setPendingPurchase(course.iap_product_id, {
        userId: user.uid,
        courseId: course.id
      });

      // Purchase the product
      logger.log('🔄 Initiating purchase...');
      const purchaseResult = await iapService.purchaseProduct(course.iap_product_id);

      if (!purchaseResult.success) {
        iapService.clearPendingPurchase(course.iap_product_id);
        throw new Error(purchaseResult.error || 'Error al realizar la compra');
      }

      // Purchase is now in progress - verify the latest purchase after a delay
      // This handles cases where the listener doesn't fire
      setTimeout(async () => {
        try {
          logger.log('🔄 Verifying purchase after delay...');
          
          // Verify the latest purchase for this product
          const verifyResult = await iapService.verifyLatestPurchase(
        course.iap_product_id,
        user.uid,
        course.id
      );

          if (verifyResult.success) {
            logger.log('✅ Purchase verified successfully');
            
            // Wait a moment for Firestore to update
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Check ownership and sync
        await checkCourseOwnership();
        await hybridDataService.syncCourses(user.uid);
        purchaseEventManager.notifyPurchaseComplete(course.id);
        
        try {
          await courseDownloadService.downloadCourse(course.id);
        } catch (downloadError) {
          logger.error('❌ Error downloading course:', downloadError);
        }

        Alert.alert(
          '¡Compra Exitosa!',
          'Tu programa ha sido agregado a tu biblioteca. ¡Disfruta tu entrenamiento!',
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
          } else {
            logger.error('❌ Purchase verification failed:', verifyResult.error);
            Alert.alert(
              'Error',
              'No se pudo verificar la compra. Por favor contacta soporte si el problema persiste.'
            );
          }
        } catch (error) {
          logger.error('❌ Error in purchase verification timeout:', error);
          Alert.alert('Error', 'Ocurrió un error al procesar la compra.');
        } finally {
          setPurchasing(false);
        }
      }, 2000);

    } catch (error) {
      logger.error('❌ Error in IAP purchase:', error);
      Alert.alert('Error', error.message || 'Error al procesar la compra');
      setPurchasing(false);
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


  // Handle info button press
  const handleInfoButtonPress = () => {
    // Always show info modal for all users
    // No redirect functionality - library serves as catalog only
    setShowInfoModal(true);
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

    // Show loading indicator while processing purchase
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

    // Check if this is an IAP course
    const isIAPCourse = course.iap_product_id;

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

    // IAP course - show purchase button
    if (isIAPCourse) {
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
            <Text style={styles.primaryButtonText}>Comprar con Apple</Text>
          )}
        </TouchableOpacity>
      );
    }

    if (canShowTrialCta) {
      // Unified system: Catalog only - no trial buttons, no redirects
      // Library serves as catalog only for all platforms
      return null;
    }

    // Web-only course - show info button
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
          <SvgCircleHelp 
            width={24} 
            height={24} 
            color="rgba(191, 168, 77, 1)" 
          />
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

  return (
    <SafeAreaView style={styles.container}>
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
        <View style={styles.content}>
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
              contentContainerStyle={{ gap: 15 }}
                snapToInterval={screenWidth - 33}
              snapToAlignment="start"
              decelerationRate="fast"
            >
              {/* Card 1: Video Card */}
              <View style={[
                styles.imageCardContainer,
                (videoUri || course?.image_url) && styles.imageCardNoBorder
              ]}>
                {videoUri ? (
                  <TouchableOpacity 
                    style={styles.videoContainer}
                    onPress={handleVideoTap}
                    activeOpacity={1}
                  >
                    <VideoView 
                      player={videoPlayer}
                      style={[styles.video, { opacity: 0.7 }]}
                      contentFit="cover"
                      fullscreenOptions={{ allowed: false }}
                      allowsPictureInPicture={false}
                      nativeControls={false}
                      showsTimecodes={false}
                    />
                    
                    {/* Play icon overlay when paused */}
                    {isVideoPaused && (
                      <View style={styles.pauseOverlay}>
                        <SvgPlay width={48} height={48} />
                      </View>
                    )}
                    
                    {/* Volume icon overlay - only show when paused */}
                    {isVideoPaused && (
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
                    )}
                    
                    {/* Restart icon overlay - only show when paused */}
                    {isVideoPaused && (
                      <View style={styles.restartIconContainer}>
                        <TouchableOpacity 
                          style={styles.restartIconButton}
                          onPress={handleVideoRestart}
                          activeOpacity={0.7}
                        >
                          <SvgArrowReload width={24} height={24} color="white" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                ) : course?.image_url ? (
                  <ImageBackground
                    source={{ uri: course.image_url }}
                    style={styles.imageCardBackground}
                    imageStyle={styles.imageCardImageStyle}
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
                            {module.title || `Módulo ${index + 1}`}: {module.description || 'Descripción del módulo no disponible'}
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
        </View>
      </ScrollView>

      {/* Catalog Info Modal */}
      <Modal
        visible={showInfoModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <View style={styles.catalogInfoModalOverlay}>
          <TouchableOpacity 
            style={styles.catalogInfoModalBackdrop}
            activeOpacity={1}
            onPress={() => setShowInfoModal(false)}
          />
          <View style={styles.catalogInfoModalContent}>
            <View style={styles.catalogInfoModalHeader}>
              <Text style={styles.catalogInfoModalTitle}>Información</Text>
              <TouchableOpacity 
                style={styles.catalogInfoCloseButton}
                onPress={() => setShowInfoModal(false)}
              >
                <Text style={styles.catalogInfoCloseButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.catalogInfoScrollContainer}>
              <ScrollView 
                style={styles.catalogInfoScrollView}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.catalogInfoModalDescription}>
                  Wake te permite acceder a programas de entrenamiento que ya has adquirido previamente.{'\n\n'}
                  La aplicación no procesa pagos ni suscripciones.{'\n\n'}
                  Una vez realizada la compra, solo debes iniciar sesión en la app para acceder a tu biblioteca.
                </Text>
              </ScrollView>
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
    overflow: 'visible',
  },
  scrollView: {
    flex: 1,
    overflow: 'visible',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 80,
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
    height: Math.max(500, screenHeight * 0.60), // Match taller image card height
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
    height: Math.max(500, screenHeight * 0.60), // Made taller: 55% of screen height, min 450px
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
  // Video styles
  videoContainer: {
    flex: 1,
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
    borderRadius: Math.max(12, screenWidth * 0.04),
  },
  pauseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  volumeIconContainer: {
    position: 'absolute',
    top: Math.max(12, screenHeight * 0.015),
    right: Math.max(12, screenWidth * 0.03),
    zIndex: 5,
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
    zIndex: 5,
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
    height: Math.max(500, screenHeight * 0.6), // Match taller image card height
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
});

export default CourseDetailScreen;
