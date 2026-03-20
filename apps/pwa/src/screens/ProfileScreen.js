import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { STALE_TIMES, GC_TIMES } from '../config/queryConfig';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  TextInput,
  useWindowDimensions,
  Image,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WakeLoader from '../components/WakeLoader';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';
import apiService from '../services/apiService';
import purchaseService from '../services/purchaseService';
import * as nutritionFirestoreService from '../services/nutritionFirestoreService';
import { auth } from '../config/firebase';
import { updateProfile, EmailAuthProvider, GoogleAuthProvider } from 'firebase/auth';
import googleAuthService from '../services/googleAuthService';
import apiClient from '../utils/apiClient';
import tutorialManager from '../services/tutorialManager';
import profilePictureService from '../services/profilePictureService';
import TutorialOverlay from '../components/TutorialOverlay';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import Settings from '../components/icons/vectors_fig/Interface/Settings';
import SvgChevronRight from '../components/icons/vectors_fig/Arrow/ChevronRight';
import SvgCamera from '../components/icons/vectors_fig/System/Camera';
import SvgFileBlank from '../components/icons/SvgFileBlank';
import SvgCreditCard from '../components/icons/SvgCreditCard';
import SvgListChecklist from '../components/icons/SvgListChecklist';
import Heart01 from '../components/icons/vectors_fig/Interface/Heart01';

import logger from '../utils/logger.js';
import { validateDisplayName, validateUsername as validateUsernameFormat, validatePhoneNumber } from '../utils/inputValidation';
import LegalDocumentsWebView from '../components/LegalDocumentsWebView';
import { getAverageColorFromImageUrl } from '../utils/imageColorUtils';

const LinearGradient = Platform.OS !== 'web' ? require('react-native-linear-gradient').default : null;

const ProfileScreen = ({ navigation, onOpenReadinessModal }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);
  
  const { user: contextUser } = useAuth();
  const user = contextUser || auth.currentUser;
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true); // Start with true for initial profile load
  const [profileLoading, setProfileLoading] = useState(true); // Separate state for profile data loading
  
  // Settings modal state
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [isSignOutConfirmModalVisible, setIsSignOutConfirmModalVisible] = useState(false);
  
  // Delete account state
  const [isDeleteAccountModalVisible, setIsDeleteAccountModalVisible] = useState(false);
  const [isDeleteConfirmModalVisible, setIsDeleteConfirmModalVisible] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteAccountFeedback, setDeleteAccountFeedback] = useState('');
  const [selectedDeleteReason, setSelectedDeleteReason] = useState(null);
  const [showFinalDeleteButton, setShowFinalDeleteButton] = useState(false);
  const [wasSettingsModalOpen, setWasSettingsModalOpen] = useState(false); // Track if settings modal was open before opening delete modal

  // Preset deletion reasons
  const deletionReasons = [
    'Ya no uso la aplicación',
    'Encontré una alternativa mejor',
    'Problemas técnicos',
    'No me gusta el contenido',
    'Muy caro',
    'Otros'
  ];
  
  // Default program (pinned) state for + menu
  const [pinnedTrainingCourseId, setPinnedTrainingCourseId] = useState(null);
  const [pinnedTrainingTitle, setPinnedTrainingTitle] = useState('');
  const [pinnedNutritionAssignmentId, setPinnedNutritionAssignmentId] = useState(null);
  const [pinnedNutritionTitle, setPinnedNutritionTitle] = useState('');
  const [defaultTrainingPickerVisible, setDefaultTrainingPickerVisible] = useState(false);
  const [defaultNutritionPickerVisible, setDefaultNutritionPickerVisible] = useState(false);
  const [defaultTrainingOptions, setDefaultTrainingOptions] = useState([]);
  const [defaultNutritionOptions, setDefaultNutritionOptions] = useState([]);
  const [loadingPinned, setLoadingPinned] = useState(false);

  // Legal documents WebView state
  const [isLegalWebViewVisible, setIsLegalWebViewVisible] = useState(false);

  const [userRole, setUserRole] = useState(null);
  
  // Subscriptions info modal state
  const [isSubscriptionsInfoModalVisible, setIsSubscriptionsInfoModalVisible] = useState(false);
  const [isGenderDropdownOpen, setIsGenderDropdownOpen] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState(null);
  const [profileAverageColor, setProfileAverageColor] = useState(null);
  
  const [userProfile, setUserProfile] = useState({
    displayName: '',
    username: '',
    email: '',
    phoneNumber: '',
    gender: '',
    bodyweight: null,
    height: null,
  });
  const [originalProfile, setOriginalProfile] = useState({
    displayName: '',
    username: '',
    email: '',
    phoneNumber: '',
    gender: '',
    bodyweight: null,
    height: null,
  });

  // Tutorial state
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialData, setTutorialData] = useState([]);
  const [currentTutorialIndex, setCurrentTutorialIndex] = useState(0);

  // Debounce timer for username validation
  const usernameDebounceTimer = useRef(null);


  // Track previous user ID to detect changes
  const previousUserIdRef = useRef(null);
  const profileEntranceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (userProfile) {
      profileEntranceAnim.setValue(0);
      Animated.timing(profileEntranceAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [!!userProfile]);

  const { data: profileQueryData, isLoading: profileQueryLoading } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: () => apiClient.get('/users/me').then(r => r.data),
    enabled: !!user?.uid,
    staleTime: STALE_TIMES.userProfile,
    gcTime: GC_TIMES.userProfile,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const profileUpdateMutation = useMutation({
    mutationFn: (updates) => apiClient.patch('/users/me', updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
  });

  // Sync query data into form state and derived state
  useEffect(() => {
    if (profileQueryLoading) return;
    const currentUser = auth.currentUser || user;
    if (!profileQueryData) {
      setUserProfile({ displayName: currentUser?.displayName || '', username: '', email: currentUser?.email || '', phoneNumber: '', gender: '', bodyweight: null, height: null });
      setProfilePictureUrl(null);
      setProfileLoading(false);
      setLoading(false);
      return;
    }
    const userData = profileQueryData;
    logger.debug('✅ Profile loaded successfully');
    setUserRole(userData.role || 'user');
    setUserProfile({
      displayName: userData.displayName || '',
      username: userData.username || '',
      email: currentUser?.email || '',
      phoneNumber: userData.phoneNumber || '',
      gender: userData.gender || '',
      bodyweight: userData.weight || null,
      height: userData.height || null,
    });
    if (userData.profilePictureUrl) {
      setProfilePictureUrl(userData.profilePictureUrl);
    } else {
      profilePictureService.getProfilePictureUrl(user.uid).then(url => { if (url) setProfilePictureUrl(url); }).catch(() => {});
    }
    checkForTutorials();
    setProfileLoading(false);
    setLoading(false);
  }, [profileQueryData, profileQueryLoading]);

  // Extract average color from profile picture for gradient (web: canvas, native: no-op)
  useEffect(() => {
    if (!profilePictureUrl) {
      setProfileAverageColor(null);
      return;
    }
    let cancelled = false;
    getAverageColorFromImageUrl(profilePictureUrl).then((color) => {
      if (!cancelled && color) {
        setProfileAverageColor(color);
      } else if (!cancelled) {
        setProfileAverageColor(null);
      }
    });
    return () => { cancelled = true; };
  }, [profilePictureUrl]);

  // Ensure user has a display name (for existing users)
  const getUserName = () => {
    if (userProfile?.displayName) {
      return userProfile.displayName;
    }
    // Fallback to username if no display name
    if (user?.username) {
      return user.username;
    }
    // Fallback to email prefix for existing users
    return user?.email?.split('@')[0] || 'usuario';
  };

  // Get the actual username for display
  const getUsername = () => {
    if (userProfile?.username) {
      return userProfile.username;
    }
    // Fallback to Firebase Auth username
    if (user?.username) {
      return user.username;
    }
    // Fallback to email prefix
    return user?.email?.split('@')[0] || 'usuario';
  };

  // Sync profile form with cached query data — called when settings modal opens
  const syncProfileFromQueryData = () => {
    if (!profileQueryData) return;
    const userData = profileQueryData;
    const profileData = {
      displayName: (userData?.displayName || '').trim(),
      username: (userData?.username || user?.email?.split('@')[0] || '').trim(),
      email: (user?.email || '').trim(),
      phoneNumber: (userData?.phoneNumber || '').trim(),
      gender: (userData?.gender || '').trim(),
      bodyweight: userData?.weight ? (typeof userData.weight === 'number' ? userData.weight : parseFloat(userData.weight)) : null,
      height: userData?.height ? (typeof userData.height === 'number' ? userData.height : parseFloat(userData.height)) : null,
    };
    setUserProfile(profileData);
    setOriginalProfile({ ...profileData });
  };


  // Helper function to normalize values for comparison
  const normalizeValue = (value, isNumeric = false) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return null;
      // If it's a numeric field, try to convert to number
      if (isNumeric) {
        const num = parseFloat(trimmed);
        return isNaN(num) ? null : num;
      }
      return trimmed;
    }
    if (typeof value === 'number') {
      return isNaN(value) ? null : value;
    }
    return value;
  };

  // Helper function to compare two values (handles type mismatches)
  const valuesAreEqual = (val1, val2, isNumeric = false) => {
    const normalized1 = normalizeValue(val1, isNumeric);
    const normalized2 = normalizeValue(val2, isNumeric);
    return normalized1 === normalized2;
  };

  // Check if profile has changed
  const hasProfileChanges = () => {
    // Compare each field individually with normalization
    const displayNameChanged = !valuesAreEqual(userProfile.displayName, originalProfile.displayName);
    const usernameChanged = !valuesAreEqual(userProfile.username, originalProfile.username);
    const emailChanged = !valuesAreEqual(userProfile.email, originalProfile.email);
    const phoneNumberChanged = !valuesAreEqual(userProfile.phoneNumber, originalProfile.phoneNumber);
    const genderChanged = !valuesAreEqual(userProfile.gender, originalProfile.gender);
    const bodyweightChanged = !valuesAreEqual(userProfile.bodyweight, originalProfile.bodyweight, true);
    const heightChanged = !valuesAreEqual(userProfile.height, originalProfile.height, true);
    
    const hasChanges = displayNameChanged || usernameChanged || emailChanged || phoneNumberChanged || genderChanged || bodyweightChanged || heightChanged;
    const hasValidUsername = !usernameError && userProfile.username.length >= 3;
    return hasChanges && hasValidUsername;
  };

  // Update profile field
  const updateProfileField = (field, value) => {
    setUserProfile(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Check username uniqueness when username changes (with debouncing)
    if (field === 'username') {
      debouncedUsernameCheck(value);
    }
  };

  // Check if username is available (server validates on save — client only checks length)
  const checkUsernameAvailability = (username) => {
    if (!username || username.length < 3) {
      setUsernameError('El usuario debe tener al menos 3 caracteres');
      return;
    }
    setUsernameError('');
    setIsCheckingUsername(false);
  };

  // Debounced username validation
  const debouncedUsernameCheck = (username) => {
    // Clear existing timer
    if (usernameDebounceTimer.current) {
      clearTimeout(usernameDebounceTimer.current);
    }
    
    // Only validate if username is different from original
    if (username !== originalProfile.username) {
      // Set new timer for 500ms delay
      usernameDebounceTimer.current = setTimeout(() => {
        checkUsernameAvailability(username);
      }, 500);
    } else {
      // If same as original, clear any error
      setUsernameError('');
      setIsCheckingUsername(false);
    }
  };

  // Handle profile picture change
  const handleChangeProfilePicture = async () => {
    if (!user?.uid) {
      logger.warn('Profile picture change skipped: no user');
      Alert.alert('Error', 'No se pudo identificar tu sesión. Intenta cerrar sesión y volver a entrar.');
      return;
    }
    try {
      setLoading(true);
      const newPictureUrl = await profilePictureService.pickAndUploadProfilePicture(user.uid);
      
      if (newPictureUrl) {
        setProfilePictureUrl(newPictureUrl);
        Alert.alert('Éxito', 'Tu foto de perfil se ha actualizado correctamente.');
      }
    } catch (error) {
      logger.error('Error changing profile picture:', error);
      if (error.message.includes('Permission')) {
        Alert.alert(
          'Permiso necesario', 
          'Necesitamos acceso a tu galería de fotos para cambiar tu foto de perfil.'
        );
      } else {
        Alert.alert('Error', 'No se pudo cambiar la foto de perfil. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };



  // Show settings modal
  const showSettingsModal = () => {
    syncProfileFromQueryData();
    setIsSettingsModalVisible(true);
  };

  // Hide settings modal
  const hideSettingsModal = () => {
    setIsSettingsModalVisible(false);
  };

  // Load pinned default program ids when settings modal opens (read from cached profile query data)
  useEffect(() => {
    if (!isSettingsModalVisible) return;
    if (profileQueryData) {
      setPinnedTrainingCourseId(profileQueryData.pinnedTrainingCourseId || null);
      setPinnedNutritionAssignmentId(profileQueryData.pinnedNutritionAssignmentId || null);
    }
    setLoadingPinned(false);
  }, [isSettingsModalVisible, profileQueryData]);

  const openDefaultTrainingPicker = async () => {
    if (!user?.uid) return;
    setLoadingPinned(true);
    try {
      const courses = await purchaseService.getUserPurchasedCourses(user.uid, false);
      const active = Array.isArray(courses) ? courses : [];
      const options = active.map((c) => ({
        id: c.courseId || c.id,
        courseId: c.courseId || c.id,
        title: c.courseDetails?.title || c.title || 'Programa',
      }));
      setDefaultTrainingOptions(options);
      const pinned = options.find((o) => o.id === pinnedTrainingCourseId);
      if (pinned) setPinnedTrainingTitle(pinned.title);
      setDefaultTrainingPickerVisible(true);
    } catch (e) {
      logger.error('[Profile] load training options failed', e);
    } finally {
      setLoadingPinned(false);
    }
  };

  const openDefaultNutritionPicker = async () => {
    if (!user?.uid) return;
    setLoadingPinned(true);
    try {
      const assignments = await nutritionFirestoreService.getAssignmentsByUser(user.uid);
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const active = nutritionFirestoreService.getActiveAssignmentsForDate(assignments || [], todayStr);
      const options = active.map((a) => ({
        id: a.id,
        assignmentId: a.id,
        title: a.plan?.name || a.planId || 'Plan de alimentación',
      }));
      setDefaultNutritionOptions(options);
      const pinned = options.find((o) => o.id === pinnedNutritionAssignmentId);
      if (pinned) setPinnedNutritionTitle(pinned.title);
      setDefaultNutritionPickerVisible(true);
    } catch (e) {
      logger.error('[Profile] load nutrition options failed', e);
    } finally {
      setLoadingPinned(false);
    }
  };

  const onSelectDefaultTraining = async (item) => {
    setDefaultTrainingPickerVisible(false);
    if (!user?.uid) return;
    const id = item?.courseId ?? item?.id ?? null;
    const title = id ? (item?.title ?? '') : '';
    try {
      await apiClient.patch('/users/me', { pinnedTrainingCourseId: id });
      setPinnedTrainingCourseId(id);
      setPinnedTrainingTitle(title);
    } catch (e) {
      logger.error('[Profile] pinnedTrainingCourseId update failed', e);
      Alert.alert('Error', 'No se pudo guardar la preferencia.');
    }
  };

  const onSelectDefaultNutrition = async (item) => {
    setDefaultNutritionPickerVisible(false);
    if (!user?.uid) return;
    const id = item?.assignmentId ?? item?.id ?? null;
    const title = id ? (item?.title ?? '') : '';
    try {
      await apiClient.patch('/users/me', { pinnedNutritionAssignmentId: id });
      setPinnedNutritionAssignmentId(id);
      setPinnedNutritionTitle(title);
    } catch (e) {
      logger.error('[Profile] pinnedNutritionAssignmentId update failed', e);
      Alert.alert('Error', 'No se pudo guardar la preferencia.');
    }
  };

  // Save profile
  const saveProfile = async () => {
    // Validate inputs before saving
    try {
      validateDisplayName(userProfile.displayName);
      validateUsernameFormat(userProfile.username);
      if (userProfile.phoneNumber?.trim()) {
        validatePhoneNumber(userProfile.phoneNumber);
      }
    } catch (validationError) {
      Alert.alert('Error de Validación', validationError.message);
      return;
    }

    setSettingsLoading(true);
    try {
      await profileUpdateMutation.mutateAsync({
        displayName: (userProfile.displayName || '').trim(),
        username: (userProfile.username || '').trim(),
        phoneNumber: (userProfile.phoneNumber || '').trim(),
        gender: (userProfile.gender || '').trim(),
        weight: userProfile.bodyweight ? parseFloat(userProfile.bodyweight) : null,
        height: userProfile.height ? parseFloat(userProfile.height) : null,
      });

      // Keep Firebase Auth displayName in sync for greetings and other auth-dependent UI
      if (auth.currentUser && userProfile.displayName?.trim()) {
        try {
          await updateProfile(auth.currentUser, {
            displayName: userProfile.displayName.trim()
          });
          await auth.currentUser.reload();
          logger.debug('✅ Firebase Auth displayName synced from profile settings');
        } catch (profileSyncError) {
          logger.warn('⚠️ Failed to sync Firebase Auth displayName from profile settings:', profileSyncError);
        }
      }

      setOriginalProfile({...userProfile});
      if (Platform.OS !== 'web') Alert.alert('Éxito', 'Tu perfil ha sido actualizado');
      hideSettingsModal();

      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch (error) {
      logger.error('Error saving profile:', error);
      if (error?.code === 'CONFLICT' || error?.response?.status === 409) {
        Alert.alert('Error', 'Ese nombre de usuario ya está en uso.');
      } else {
        Alert.alert('Error', 'No se pudo guardar el perfil');
      }
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSignOut = () => {
    logger.debug('🔐 handleSignOut called - showing confirmation modal');
    setIsSignOutConfirmModalVisible(true);
  };

  const handleSignOutConfirm = async () => {
    logger.debug('🔐 User confirmed sign out');
    try {
      setIsSignOutConfirmModalVisible(false);
      // Close the settings modal first
      hideSettingsModal();
      
      // Sign out user
      await authService.signOutUser();
      logger.debug('🔐 Sign out successful');
      
      // On web/PWA, force full reload to /login so the app always shows the login screen
      if (typeof window !== 'undefined') {
        const loginPath = (process.env.EXPO_PUBLIC_BASE_PATH || '') + '/login';
        logger.debug('🌐 Web: reloading to /login');
        window.location.replace(loginPath);
        return;
      }
      // On native, AppNavigator handles navigation to Auth screen via auth state
    } catch (error) {
      logger.error('❌ Error signing out:', error);
      Alert.alert('Error', 'No se pudo cerrar sesión. Por favor intenta de nuevo.');
    }
  };

  const handleSignOutCancel = () => {
    logger.debug('🔐 Sign out cancelled');
    setIsSignOutConfirmModalVisible(false);
  };

  // Handle delete account request
  const handleDeleteAccountRequest = () => {
    logger.debug('🗑️ Delete account button pressed');
    // Remember that settings modal was open
    setWasSettingsModalOpen(isSettingsModalVisible);
    // Close settings modal and open delete account modal
    setIsSettingsModalVisible(false);
    setDeleteAccountFeedback('');
    setSelectedDeleteReason(null);
    setShowFinalDeleteButton(false);
    setDeletePassword('');
    // Small delay to ensure smooth transition
    setTimeout(() => {
      setIsDeleteAccountModalVisible(true);
    }, 100);
  };

  // Handle close delete account modal
  const handleCloseDeleteAccountModal = () => {
    setIsDeleteAccountModalVisible(false);
    setDeleteAccountFeedback('');
    setSelectedDeleteReason(null);
    setShowFinalDeleteButton(false);
    setDeletePassword('');
    // Reopen settings modal if it was open before
    if (wasSettingsModalOpen) {
      setTimeout(() => {
        setIsSettingsModalVisible(true);
        setWasSettingsModalOpen(false);
      }, 100);
    }
  };

  // Handle reason selection
  const handleReasonSelect = (reason) => {
    setSelectedDeleteReason(reason);
    if (reason !== 'Otros') {
      setDeleteAccountFeedback(reason);
    } else {
      setDeleteAccountFeedback(''); // Clear feedback when selecting "Otros" to show text input
    }
  };

  // Save feedback and proceed to final deletion step
  const handleSaveFeedbackAndProceed = async () => {
    // Validate feedback
    let feedbackToSave = '';
    if (selectedDeleteReason === 'Otros') {
      if (!deleteAccountFeedback.trim()) {
        Alert.alert('Campo requerido', 'Por favor, cuéntanos por qué deseas eliminar tu cuenta.');
        return;
      }
      feedbackToSave = deleteAccountFeedback.trim();
    } else if (selectedDeleteReason) {
      feedbackToSave = selectedDeleteReason;
    } else {
      Alert.alert('Campo requerido', 'Por favor, selecciona una razón para eliminar tu cuenta.');
      return;
    }

    if (!auth.currentUser) {
      Alert.alert('Error', 'No hay un usuario autenticado');
      return;
    }

    try {
      setDeleteAccountLoading(true);
      
      // TODO: no endpoint for saveAccountDeletionFeedback — no REST endpoint for account deletion feedback
      await apiService.saveAccountDeletionFeedback(
        auth.currentUser.uid,
        feedbackToSave
      );

      // Show final delete button
      setShowFinalDeleteButton(true);
    } catch (error) {
      logger.error('Error saving feedback:', error);
      Alert.alert('Error', 'No se pudo guardar el feedback. Por favor intenta de nuevo.');
    } finally {
      setDeleteAccountLoading(false);
    }
  };

  // Handle delete account confirmation
  const handleDeleteAccountConfirm = async () => {
    if (!auth.currentUser) {
      Alert.alert('Error', 'No hay un usuario autenticado');
      return;
    }

    if (!showFinalDeleteButton) {
      Alert.alert('Error', 'Por favor completa el feedback primero');
      return;
    }

    try {
      setDeleteAccountLoading(true);
      let credential = null;

      // Determine auth provider and get credential
      const providerId = auth.currentUser.providerData[0]?.providerId;
      
      if (providerId === 'password') {
        // Email/password authentication - need password
        if (!deletePassword.trim()) {
          Alert.alert('Error', 'Por favor ingresa tu contraseña para confirmar');
          setDeleteAccountLoading(false);
          return;
        }
        credential = EmailAuthProvider.credential(
          auth.currentUser.email,
          deletePassword
        );
      } else if (providerId === 'google.com') {
        // Google authentication - reauthenticate with Google
        try {
          const GoogleSigninModule = await googleAuthService.loadGoogleSignIn();
          await GoogleSigninModule.hasPlayServices({ showPlayServicesUpdateDialog: true });
          const signInResult = await GoogleSigninModule.signIn();
          const idToken = signInResult.data?.idToken || signInResult.idToken;
          if (idToken) {
            credential = GoogleAuthProvider.credential(idToken);
          } else {
            throw new Error('No se obtuvo el token de Google');
          }
        } catch (error) {
          logger.error('Google reauthentication error:', error);
          throw new Error('No se pudo reautenticar con Google. Por favor intenta de nuevo.');
        }
      } else if (providerId === 'apple.com') {
        // Apple authentication is no longer supported
        throw new Error('La autenticación con Apple ya no está disponible. Por favor contacta al soporte.');
      }

      // Delete the account
      await authService.deleteAccount(credential);
      
      // Close modals and clear all state
      setIsDeleteAccountModalVisible(false);
      setIsDeleteConfirmModalVisible(false);
      setDeletePassword('');
      setDeleteAccountFeedback('');
      setShowFinalDeleteButton(false);
      setWasSettingsModalOpen(false);
      
      // Show success message (user will be signed out automatically)
      Alert.alert(
        'Cuenta eliminada',
        'Tu cuenta ha sido eliminada permanentemente. Todos tus datos han sido eliminados.',
        [
          {
            text: 'Entendido',
            onPress: () => {
              // Navigation will be handled by AuthContext
            }
          }
        ]
      );
    } catch (error) {
      logger.error('Error deleting account:', error);
      
      let errorMessage = 'No se pudo eliminar la cuenta.';
      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Contraseña incorrecta. Por favor intenta de nuevo.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'Por seguridad, necesitas iniciar sesión nuevamente antes de eliminar tu cuenta.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Error', errorMessage);
      setDeletePassword('');
      // Don't reset showFinalDeleteButton or feedback on error - let user try again
    } finally {
      setDeleteAccountLoading(false);
    }
  };

  // Check for tutorials to show
  const checkForTutorials = async () => {
    if (!user?.uid) return;

    try {
      logger.debug('🎬 Checking for profile screen tutorials...');
      const tutorials = await tutorialManager.getTutorialsForScreen(user.uid, 'profile');
      
      if (tutorials.length > 0) {
        logger.debug('📚 Found tutorials to show:', tutorials.length);
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
      } else {
        logger.debug('✅ No tutorials to show for profile screen');
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
          'profile', 
          currentTutorial.videoUrl
        );
        logger.debug('✅ Tutorial marked as completed');
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  };



  const safeAreaTop = Platform.OS === 'web' ? 0 : Math.max(0, insets.top - 8);
  const headerHeight = Platform.OS === 'web' ? 32 : Math.max(40, Math.min(44, screenHeight * 0.055));
  const gradientHeight = headerHeight + safeAreaTop + 140;

  return (
    <>
      <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['left', 'right'] : ['bottom', 'left', 'right']}>
        {profileAverageColor && (
          <View
            style={[
              styles.profileGradientOverlay,
              {
                height: gradientHeight,
              },
            ]}
            pointerEvents="none"
          >
            {Platform.OS === 'web' ? (
              <View
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    backgroundImage: `linear-gradient(to bottom, ${profileAverageColor} 0%, rgba(26,26,26,0.6) 50%, transparent 100%)`,
                  },
                ]}
              />
            ) : LinearGradient ? (
              <LinearGradient
                colors={[profileAverageColor, 'rgba(26,26,26,0.6)', 'transparent']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
            ) : null}
          </View>
        )}
        <FixedWakeHeader backgroundColor={profileAverageColor ? 'transparent' : '#1a1a1a'} />

      {/* Settings Modal */}
      <Modal animationType="slide" transparent={true} visible={isSettingsModalVisible} onRequestClose={hideSettingsModal}>
        <TouchableWithoutFeedback onPress={hideSettingsModal} accessible={false}>
          <View style={styles.settingsModalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} accessible={false}>
              <View style={styles.settingsModal}>
                <KeyboardAvoidingView style={{flex: 1}} behavior="padding" keyboardVerticalOffset={0}>
                  <View style={styles.settingsModalHeader}>
                    <Text style={styles.settingsModalTitle}>Configuración de Perfil</Text>
                    <TouchableOpacity style={styles.closeButton} onPress={hideSettingsModal}>
                      <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <ScrollView 
                    style={styles.settingsModalContent}
                    contentContainerStyle={{flexGrow: 1, paddingBottom: 24}}
                    showsVerticalScrollIndicator={false} 
                    keyboardShouldPersistTaps="handled"
                  >
              <View style={styles.settingsForm}>
                {/* Display Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nombre Completo</Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      !valuesAreEqual(userProfile.displayName, originalProfile.displayName) && styles.textInputChanged
                    ]}
                    value={userProfile.displayName}
                    onChangeText={(value) => updateProfileField('displayName', value)}
                    placeholder="Ingresa tu nombre completo"
                    placeholderTextColor="#999999"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    blurOnSubmit={true}
                  />
                </View>

                {/* Bodyweight and Height */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Peso y Estatura</Text>
                  <View style={styles.bodyweightHeightRow}>
                    <View style={styles.bodyweightHeightField}>
                      <TextInput
                        style={[
                          styles.textInput,
                          !valuesAreEqual(userProfile.bodyweight, originalProfile.bodyweight, true) && styles.textInputChanged
                        ]}
                        value={userProfile.bodyweight?.toString() || ''}
                        onChangeText={(value) => updateProfileField('bodyweight', value)}
                        placeholder="Peso (kg)"
                        placeholderTextColor="#999999"
                        keyboardType="numeric"
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                        blurOnSubmit={true}
                      />
                    </View>
                    
                    <View style={styles.bodyweightHeightField}>
                      <TextInput
                        style={[
                          styles.textInput,
                          !valuesAreEqual(userProfile.height, originalProfile.height, true) && styles.textInputChanged
                        ]}
                        value={userProfile.height?.toString() || ''}
                        onChangeText={(value) => updateProfileField('height', value)}
                        placeholder="Estatura (cm)"
                        placeholderTextColor="#999999"
                        keyboardType="numeric"
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                        blurOnSubmit={true}
                      />
                    </View>
                  </View>
                </View>

                {/* Username */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Usuario</Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      usernameError && styles.textInputError,
                      !valuesAreEqual(userProfile.username, originalProfile.username) && !usernameError && styles.textInputChanged
                    ]}
                    value={userProfile.username}
                    onChangeText={(value) => updateProfileField('username', value)}
                    placeholder="Ingresa tu usuario único"
                    placeholderTextColor="#999999"
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    blurOnSubmit={true}
                  />
                  {!valuesAreEqual(userProfile.username, originalProfile.username) && isCheckingUsername && (
                    <Text style={styles.checkingText}>Verificando disponibilidad...</Text>
                  )}
                  {!valuesAreEqual(userProfile.username, originalProfile.username) && usernameError && (
                    <Text style={styles.errorText}>{usernameError}</Text>
                  )}
                  {!valuesAreEqual(userProfile.username, originalProfile.username) && !usernameError && userProfile.username.length >= 3 && (
                    <Text style={styles.successText}>✓ Usuario disponible</Text>
                  )}
                </View>

                {/* Email */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      !valuesAreEqual(userProfile.email, originalProfile.email) && styles.textInputChanged
                    ]}
                    value={userProfile.email}
                    onChangeText={(value) => updateProfileField('email', value)}
                    placeholder="Ingresa tu email"
                    placeholderTextColor="#999999"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    blurOnSubmit={true}
                  />
                </View>

                {/* Phone Number */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Número de Teléfono</Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      !valuesAreEqual(userProfile.phoneNumber, originalProfile.phoneNumber) && styles.textInputChanged
                    ]}
                    value={userProfile.phoneNumber}
                    onChangeText={(value) => updateProfileField('phoneNumber', value)}
                    placeholder="Ingresa tu número de teléfono"
                    placeholderTextColor="#999999"
                    keyboardType="phone-pad"
                    returnKeyType="done"
                    onSubmitEditing={saveProfile}
                  />
                </View>

                {/* Gender */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Género</Text>
                  <TouchableOpacity
                    style={[
                      styles.dropdownButton,
                      !valuesAreEqual(userProfile.gender, originalProfile.gender) && userProfile.gender && styles.dropdownButtonSelected
                    ]}
                    onPress={() => setIsGenderDropdownOpen(!isGenderDropdownOpen)}
                  >
                    <Text style={[
                      styles.dropdownButtonText,
                      !userProfile.gender && styles.dropdownPlaceholder,
                      !valuesAreEqual(userProfile.gender, originalProfile.gender) && userProfile.gender && styles.dropdownButtonTextSelected
                    ]}>
                      {userProfile.gender || 'Selecciona tu género'}
                    </Text>
                    <SvgChevronRight 
                      width={16} 
                      height={16} 
                      stroke={!valuesAreEqual(userProfile.gender, originalProfile.gender) && userProfile.gender ? 'rgba(255, 255, 255, 1)' : '#ffffff'}
                      style={[
                        styles.dropdownChevron,
                        isGenderDropdownOpen && styles.dropdownChevronRotated
                      ]}
                    />
                  </TouchableOpacity>
                  
                  {isGenderDropdownOpen && (
                    <View style={styles.dropdownOptions}>
                      {['Masculino', 'Femenino', 'Otro', 'Prefiero no decir'].map((option) => (
                        <TouchableOpacity
                          key={option}
                          style={[
                            styles.dropdownOption,
                            userProfile.gender === option && styles.dropdownOptionSelected
                          ]}
                          onPress={() => {
                            updateProfileField('gender', option);
                            setIsGenderDropdownOpen(false);
                          }}
                        >
                          <Text style={[
                            styles.dropdownOptionText,
                            userProfile.gender === option && styles.dropdownOptionTextSelected
                          ]}>
                            {option}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Default program for + menu */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Programa de entrenamiento por defecto</Text>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={openDefaultTrainingPicker}
                    disabled={loadingPinned}
                  >
                    <Text style={[styles.dropdownButtonText, !pinnedTrainingCourseId && styles.dropdownPlaceholder]}>
                      {pinnedTrainingCourseId ? (pinnedTrainingTitle || 'Programa seleccionado') : 'Automático (primero de la lista)'}
                    </Text>
                    <SvgChevronRight width={16} height={16} stroke="#ffffff" style={styles.dropdownChevron} />
                  </TouchableOpacity>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Plan de alimentación por defecto</Text>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={openDefaultNutritionPicker}
                    disabled={loadingPinned}
                  >
                    <Text style={[styles.dropdownButtonText, !pinnedNutritionAssignmentId && styles.dropdownPlaceholder]}>
                      {pinnedNutritionAssignmentId ? (pinnedNutritionTitle || 'Plan seleccionado') : 'Automático (activo hoy)'}
                    </Text>
                    <SvgChevronRight width={16} height={16} stroke="#ffffff" style={styles.dropdownChevron} />
                  </TouchableOpacity>
                </View>
              </View>
              
                  {/* Sign Out Button */}
                  <TouchableOpacity
                    className={Platform.OS === 'web' ? 'sign-out-btn' : undefined}
                    style={styles.signOutButtonInModal}
                    onPress={handleSignOut}
                  >
                    <Text style={styles.signOutTextInModal}>Cerrar Sesión</Text>
                  </TouchableOpacity>

                  {/* Delete Account Button */}
                  <TouchableOpacity 
                    style={styles.deleteAccountButtonInModal} 
                    onPress={handleDeleteAccountRequest}
                    activeOpacity={0.7}
                    delayPressIn={0}
                  >
                    <Text style={styles.deleteAccountTextInModal}>Eliminar Cuenta</Text>
                  </TouchableOpacity>
                </ScrollView>
                
                {/* Fixed Update Button */}
                <View style={styles.fixedUpdateButtonContainer}>
                  <TouchableOpacity 
                    style={[
                      styles.updateProfileButton,
                      !hasProfileChanges() && styles.updateProfileButtonDisabled
                    ]}
                    onPress={saveProfile}
                    disabled={settingsLoading || !hasProfileChanges()}
                  >
                    <Text 
                      style={[
                        styles.updateProfileButtonText,
                        !hasProfileChanges() && styles.updateProfileButtonTextDisabled
                      ]}
                      numberOfLines={1}
                    >
                      {settingsLoading ? 'Actualizando...' : 'Actualizar Perfil'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Default training program picker */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={defaultTrainingPickerVisible}
        onRequestClose={() => setDefaultTrainingPickerVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDefaultTrainingPickerVisible(false)} accessible={false}>
          <View style={styles.settingsModalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} accessible={false}>
              <View style={[styles.settingsModal, { maxHeight: '70%' }]}>
                <View style={styles.settingsModalHeader}>
                  <Text style={styles.settingsModalTitle}>Programa de entrenamiento por defecto</Text>
                  <TouchableOpacity style={styles.closeButton} onPress={() => setDefaultTrainingPickerVisible(false)}>
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.settingsModalContent} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    style={styles.dropdownOption}
                    onPress={() => onSelectDefaultTraining({ id: null, courseId: null, title: 'Automático' })}
                  >
                    <Text style={styles.dropdownOptionText}>Automático (primero de la lista)</Text>
                  </TouchableOpacity>
                  {defaultTrainingOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={styles.dropdownOption}
                      onPress={() => onSelectDefaultTraining(opt)}
                    >
                      <View style={styles.dropdownOptionRow}>
                        {pinnedTrainingCourseId === opt.id && (
                          <Text style={styles.dropdownOptionCheck}>✓</Text>
                        )}
                        <Text style={styles.dropdownOptionText}>{opt.title}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Default nutrition plan picker */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={defaultNutritionPickerVisible}
        onRequestClose={() => setDefaultNutritionPickerVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDefaultNutritionPickerVisible(false)} accessible={false}>
          <View style={styles.settingsModalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} accessible={false}>
              <View style={[styles.settingsModal, { maxHeight: '70%' }]}>
                <View style={styles.settingsModalHeader}>
                  <Text style={styles.settingsModalTitle}>Plan de alimentación por defecto</Text>
                  <TouchableOpacity style={styles.closeButton} onPress={() => setDefaultNutritionPickerVisible(false)}>
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.settingsModalContent} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    style={styles.dropdownOption}
                    onPress={() => onSelectDefaultNutrition({ id: null, assignmentId: null, title: 'Automático' })}
                  >
                    <Text style={styles.dropdownOptionText}>Automático (activo hoy)</Text>
                  </TouchableOpacity>
                  {defaultNutritionOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={styles.dropdownOption}
                      onPress={() => onSelectDefaultNutrition(opt)}
                    >
                      <View style={styles.dropdownOptionRow}>
                        {pinnedNutritionAssignmentId === opt.id && (
                          <Text style={styles.dropdownOptionCheck}>✓</Text>
                        )}
                        <Text style={styles.dropdownOptionText}>{opt.title}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Sign Out Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isSignOutConfirmModalVisible}
        onRequestClose={handleSignOutCancel}
      >
        <TouchableWithoutFeedback onPress={handleSignOutCancel} accessible={false}>
          <View style={styles.signOutConfirmModalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} accessible={false}>
              <View style={styles.signOutConfirmModalContent}>
                <Text style={styles.signOutConfirmModalTitle}>Cerrar Sesión</Text>
                <Text style={styles.signOutConfirmModalMessage}>
                  ¿Estás seguro de que deseas cerrar sesión?
                </Text>
                <View style={styles.signOutConfirmButtonsRow}>
                  <TouchableOpacity
                    style={styles.signOutConfirmCancelButton}
                    onPress={handleSignOutCancel}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.signOutConfirmCancelButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.signOutConfirmButton}
                    onPress={handleSignOutConfirm}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.signOutConfirmButtonText}>Cerrar Sesión</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDeleteAccountModalVisible}
        onRequestClose={() => {
          if (!deleteAccountLoading) {
            handleCloseDeleteAccountModal();
          }
        }}
      >
        <TouchableWithoutFeedback onPress={handleCloseDeleteAccountModal} accessible={false}>
          <View style={styles.settingsModalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} accessible={false}>
              <View style={styles.deleteModalContainer}>
                <KeyboardAvoidingView style={{flex: 1}} behavior="padding" keyboardVerticalOffset={0}>
                  <View style={styles.deleteModalHeader}>
                    <Text style={styles.deleteModalHeaderTitle}>Eliminar Cuenta</Text>
                    <TouchableOpacity onPress={handleCloseDeleteAccountModal} style={styles.closeButton}>
                      <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <ScrollView 
                    style={styles.deleteModalScrollView}
                    contentContainerStyle={{flexGrow: 1, paddingBottom: 24}}
                    showsVerticalScrollIndicator={false} 
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.deleteModalContent}>
              
              {!showFinalDeleteButton ? (
                <>
                  <Text style={styles.deleteModalMessage}>
                    Antes de proceder, nos gustaría saber por qué deseas eliminar tu cuenta. Esto nos ayuda a mejorar.
                  </Text>
                  
                  <View style={styles.reasonsContainer}>
                    {deletionReasons.map((reason, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.reasonOption,
                          selectedDeleteReason === reason && styles.reasonOptionSelected
                        ]}
                        onPress={() => handleReasonSelect(reason)}
                        disabled={deleteAccountLoading}
                      >
                        <View style={styles.reasonOptionContent}>
                          <View style={[
                            styles.radioButton,
                            selectedDeleteReason === reason && styles.radioButtonSelected
                          ]}>
                            {selectedDeleteReason === reason && (
                              <View style={styles.radioButtonInner} />
                            )}
                          </View>
                          <Text style={[
                            styles.reasonOptionText,
                            selectedDeleteReason === reason && styles.reasonOptionTextSelected
                          ]}>
                            {reason}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {selectedDeleteReason === 'Otros' && (
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>
                        Por favor, cuéntanos más:
                      </Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Describe tu razón..."
                        placeholderTextColor="#999999"
                        multiline
                        numberOfLines={4}
                        value={deleteAccountFeedback}
                        onChangeText={setDeleteAccountFeedback}
                        textAlignVertical="top"
                        autoCapitalize="sentences"
                        editable={!deleteAccountLoading}
                      />
                    </View>
                  )}

                  <View style={styles.fixedUpdateButtonContainer}>
                    <TouchableOpacity
                      style={[
                        styles.updateProfileButton,
                        (!selectedDeleteReason || (selectedDeleteReason === 'Otros' && !deleteAccountFeedback.trim()) || deleteAccountLoading) && styles.updateProfileButtonDisabled
                      ]}
                      onPress={handleSaveFeedbackAndProceed}
                      disabled={!selectedDeleteReason || (selectedDeleteReason === 'Otros' && !deleteAccountFeedback.trim()) || deleteAccountLoading}
                    >
                      <Text style={[
                        styles.updateProfileButtonText,
                        (!selectedDeleteReason || (selectedDeleteReason === 'Otros' && !deleteAccountFeedback.trim()) || deleteAccountLoading) && styles.updateProfileButtonTextDisabled
                      ]}>
                        {deleteAccountLoading ? 'Guardando...' : 'Continuar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.deleteModalMessage}>
                    Esta acción no se puede deshacer. Se eliminarán permanentemente:
                  </Text>
                  <View style={styles.deleteModalList}>
                    <Text style={styles.deleteModalListItem}>• Tu perfil y datos personales</Text>
                    <Text style={styles.deleteModalListItem}>• Tu historial de ejercicios</Text>
                    <Text style={styles.deleteModalListItem}>• Tu historial de sesiones</Text>
                    <Text style={styles.deleteModalListItem}>• Tu foto de perfil</Text>
                  </View>
                  <Text style={styles.deleteModalNote}>
                    Nota: Tus compras se conservarán por razones legales y contables.
                  </Text>
                  
                  {auth.currentUser?.providerData[0]?.providerId === 'password' && (
                    <TextInput
                      style={styles.deletePasswordInput}
                      placeholder="Ingresa tu contraseña para confirmar"
                      placeholderTextColor="#999999"
                      secureTextEntry
                      value={deletePassword}
                      onChangeText={setDeletePassword}
                      autoCapitalize="none"
                      editable={!deleteAccountLoading}
                    />
                  )}

                  <View style={styles.finalDeleteButtonsContainer}>
                    <TouchableOpacity
                      style={styles.deleteCancelButtonInModal}
                      onPress={handleCloseDeleteAccountModal}
                      disabled={deleteAccountLoading}
                    >
                      <Text style={styles.deleteCancelTextInModal}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.deleteAccountButtonInModal,
                        (deleteAccountLoading || (auth.currentUser?.providerData[0]?.providerId === 'password' && !deletePassword.trim())) && styles.deleteAccountButtonDisabled
                      ]}
                      onPress={() => {
                        Alert.alert(
                          'Última confirmación',
                          '¿Estás seguro de que deseas eliminar tu cuenta permanentemente? Esta acción no se puede deshacer.',
                          [
                            {
                              text: 'Cancelar',
                              style: 'cancel'
                            },
                            {
                              text: 'Eliminar',
                              style: 'destructive',
                              onPress: handleDeleteAccountConfirm
                            }
                          ]
                        );
                      }}
                      disabled={deleteAccountLoading || (auth.currentUser?.providerData[0]?.providerId === 'password' && !deletePassword.trim())}
                    >
                      <Text style={[
                        styles.deleteAccountTextInModal,
                        (auth.currentUser?.providerData[0]?.providerId === 'password' && !deletePassword.trim()) && styles.deleteAccountTextDisabled
                      ]}>
                        {deleteAccountLoading ? 'Eliminando...' : 'Eliminar Permanentemente'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
                    </View>
                  </ScrollView>
                </KeyboardAvoidingView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      
      {profileLoading ? (
        Platform.OS === 'web' ? (
          <View style={[styles.loadingContainer, { justifyContent: 'flex-start', paddingTop: 80, paddingHorizontal: 24, gap: 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <div className="wake-skeleton wake-skel-avatar" />
              <View style={{ flex: 1, gap: 8 }}>
                <div className="wake-skeleton wake-skel-row-lg" style={{ width: '60%' }} />
                <div className="wake-skeleton wake-skel-row-sm" style={{ width: '40%' }} />
              </View>
            </View>
            <div className="wake-skeleton wake-skel-card" style={{ width: '100%' }} />
            <div className="wake-skeleton wake-skel-card" style={{ width: '100%' }} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <div className="wake-skeleton wake-skel-card" style={{ flex: 1 }} />
              <div className="wake-skeleton wake-skel-card" style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <View style={styles.loadingContainer}>
            <WakeLoader />
          </View>
        )
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContentContainer}
          showsVerticalScrollIndicator={false}
        >
          <WakeHeaderContent style={styles.content}>
            {/* Spacer for fixed header */}
            <WakeHeaderSpacer />

            {/* Title Section */}
            <View style={styles.titleSection}>
              <Text style={styles.screenTitle}>Perfil</Text>
            </View>

          {/* User Profile Card */}
          <View style={styles.userProfileCard}>
            {onOpenReadinessModal ? (
              <TouchableOpacity
                style={styles.readinessIconButton}
                onPress={onOpenReadinessModal}
                activeOpacity={0.7}
                accessibilityLabel="Registro de bienestar"
              >
                <Heart01 width={20} height={20} stroke="#ffffff" strokeWidth={2} />
              </TouchableOpacity>
            ) : null}
            <Animated.View style={[styles.profileInfoContainer, { opacity: profileEntranceAnim, transform: [{ translateY: profileEntranceAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
              <TouchableOpacity 
                style={styles.profilePictureButton}
                onPress={handleChangeProfilePicture}
                activeOpacity={0.7}
              >
                {profilePictureUrl ? (
                  <Image 
                    source={{ uri: profilePictureUrl }} 
                    style={styles.profilePicture}
                  />
                ) : (
                  <>
                    <View style={styles.profilePicturePlaceholder}>
                      <Text style={styles.profilePicturePlaceholderText}>
                        {userProfile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
                      </Text>
                    </View>
                    <View style={styles.editIconOverlay}>
                      <SvgCamera width={16} height={16} stroke="#FFFFFF" strokeWidth={2} />
                    </View>
                  </>
                )}
              </TouchableOpacity>
              <View style={styles.profileTextContainer}>
                <Text style={styles.displayName}>
                  {userProfile?.displayName || user?.displayName || 'Usuario'}
                </Text>
                <Text style={styles.username}>
                  @{getUsername()}
                </Text>
              </View>
            </Animated.View>
          </View>

        {/* Programs and Subscriptions Section */}
        <View style={styles.programsSubscriptionsContainer}>
          <TouchableOpacity 
            className="profile-menu-row"
            style={styles.programCard} 
            onPress={() => navigation.navigate('AllPurchasedCourses')}
            activeOpacity={0.7}
          >
            <SvgListChecklist width={20} height={20} stroke="#ffffff" strokeWidth={2} style={styles.programCardIcon} />
            <Text style={styles.programCardTitle}>Programas</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            className="profile-menu-row"
            style={styles.subscriptionCard} 
            onPress={() => navigation.navigate('Subscriptions')}
            activeOpacity={0.7}
          >
            <SvgCreditCard width={20} height={20} stroke="#ffffff" strokeWidth={2} style={styles.subscriptionCardIcon} />
            <Text style={styles.subscriptionCardTitle}>Suscripciones</Text>
          </TouchableOpacity>
          </View>

        {/* Configuration and Legal Section */}
        <View style={styles.interestsProgramsContainer}>
          <TouchableOpacity className="profile-menu-row" style={styles.smallCard} onPress={showSettingsModal}>
            <Settings width={20} height={20} stroke="#ffffff" strokeWidth={2} style={styles.smallCardIcon} />
            <Text style={styles.smallCardTitle}>Configuración</Text>
          </TouchableOpacity>
          <TouchableOpacity className="profile-menu-row" style={styles.smallCard} onPress={() => setIsLegalWebViewVisible(true)}>
            <SvgFileBlank width={20} height={20} color="#ffffff" strokeWidth={2} style={styles.smallCardIcon} />
            <Text style={styles.smallCardTitle}>Legal</Text>
          </TouchableOpacity>
        </View>

        {/* Creator section */}
        {(userRole === 'creator' || userRole === 'admin') && (
          <View style={styles.creatorSectionContainer}>
            <TouchableOpacity
              className="profile-menu-row"
              style={styles.creatorEventsCard}
              onPress={() => navigation.navigate('CreatorEvents')}
              activeOpacity={0.7}
            >
              <View style={styles.creatorEventsIconWrap}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </View>
              <Text style={styles.creatorEventsTitle}>Mis Eventos</Text>
            </TouchableOpacity>
          </View>
        )}


        <BottomSpacer />
        </WakeHeaderContent>
      </ScrollView>
      )}
      
        {/* Tutorial Overlay */}
        <TutorialOverlay
          visible={tutorialVisible}
          tutorialData={tutorialData}
          onClose={() => setTutorialVisible(false)}
          onComplete={handleTutorialComplete}
        />
        
        {/* Legal Documents WebView */}
        <LegalDocumentsWebView
          visible={isLegalWebViewVisible}
          onClose={() => setIsLegalWebViewVisible(false)}
        />
        
        {/* Subscriptions Info Modal */}
        <Modal
          visible={isSubscriptionsInfoModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsSubscriptionsInfoModalVisible(false)}
        >
          <View style={styles.subscriptionsInfoModalOverlay}>
            <TouchableOpacity 
              style={styles.subscriptionsInfoModalBackdrop}
              activeOpacity={1}
              onPress={() => setIsSubscriptionsInfoModalVisible(false)}
            />
            <View style={styles.subscriptionsInfoModalContent}>
              <View style={styles.subscriptionsInfoModalHeader}>
                <Text style={styles.subscriptionsInfoModalTitle}>Información</Text>
                <TouchableOpacity 
                  style={styles.subscriptionsInfoCloseButton}
                  onPress={() => setIsSubscriptionsInfoModalVisible(false)}
                >
                  <Text style={styles.subscriptionsInfoCloseButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.subscriptionsInfoScrollContainer}>
                <ScrollView 
                  style={styles.subscriptionsInfoScrollView}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.subscriptionsInfoModalDescription}>
                    Las suscripciones y compras no se administran dentro de la app.{'\n\n'}
                    El acceso a los programas disponibles en tu biblioteca corresponde únicamente a contenido adquirido previamente.
                  </Text>
                </ScrollView>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
};

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  profileGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContentContainer: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  content: {
    // No flex: 1 — keeps header-to-content gap consistent (matches DailyWorkoutScreen). Flex was causing uneven spacing inside the screen on PWA.
  },
  titleSection: {
    paddingTop: 0,
    marginTop: 0,
    marginBottom: Math.max(20, screenHeight * 0.03), // Positive margin to push cards down
  },
  screenTitle: {
    fontSize: Math.min(screenWidth * 0.08, 32), // Match MainScreen responsive sizing
    fontWeight: '600', // Bold weight for profile title
    color: '#ffffff',
    textAlign: 'left',
    paddingLeft: screenWidth * 0.12, // Match MainScreen padding
    marginBottom: 20,
  },
  userProfileCard: {
    position: 'relative',
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04), // Responsive border radius
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'visible',
    padding: Math.max(12, screenWidth * 0.03), // Reduced padding
    marginBottom: Math.max(15, screenHeight * 0.02), // Responsive margin
    marginHorizontal: Math.max(24, screenWidth * 0.06), // Responsive horizontal margin
  },
  readinessIconButton: {
    position: 'absolute',
    top: Math.max(12, screenWidth * 0.03),
    right: Math.max(12, screenWidth * 0.03),
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    zIndex: 1,
  },
  programsSubscriptionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Math.max(15, screenHeight * 0.02), // Responsive margin
    marginHorizontal: Math.max(24, screenWidth * 0.06), // Responsive horizontal margin
  },
  programCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04), // Responsive border radius
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    padding: Math.max(12, screenWidth * 0.03), // Responsive padding
    width: '48%',
    minHeight: Math.max(55, screenHeight * 0.07), // Responsive min height
    justifyContent: 'center',
    alignItems: 'center',
  },
  programCardIcon: {
    marginBottom: 8,
  },
  programCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  subscriptionCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04), // Responsive border radius
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    padding: Math.max(12, screenWidth * 0.03), // Responsive padding
    width: '48%',
    minHeight: Math.max(55, screenHeight * 0.07), // Responsive min height
    justifyContent: 'center',
    alignItems: 'center',
  },
  subscriptionCardIcon: {
    marginBottom: 8,
  },
  subscriptionCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  interestsProgramsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Math.max(15, screenHeight * 0.02), // Responsive margin
    marginHorizontal: Math.max(24, screenWidth * 0.06), // Responsive horizontal margin
  },
  smallCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04), // Responsive border radius
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    padding: Math.max(12, screenWidth * 0.03), // Responsive padding
    width: '48%',
    minHeight: Math.max(55, screenHeight * 0.07), // Responsive min height
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  smallCardIcon: {
    marginBottom: 8,
  },
  displayName: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    fontWeight: '400',
    color: '#cccccc',
  },
  profileInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profilePictureButton: {
    position: 'relative',
    marginRight: 12,
  },
  profilePicture: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 0,
  },
  profilePicturePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  profilePicturePlaceholderText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#ffffff',
  },
  editIconOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  profileTextContainer: {
    flex: 1,
  },
  buttonContent: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 5,
  },
  buttonSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#ffffff',
    opacity: 0.8,
  },
  buttonArrow: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
  },
  // Interests Modal Styles
  interestsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  interestsModal: {
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  interestsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  interestsModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  closeButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#cccccc',
    fontWeight: '600',
  },
  interestsModalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  disciplinesContainer: {
    gap: 12,
  },
  updateButtonContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a2a',
  },
  fixedUpdateButtonContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#2a2a2a',
  },
  signOutButtonInModal: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 20,
    marginHorizontal: 20,
    marginBottom: 10,
    alignItems: 'center',
    alignSelf: 'center',
    width: '70%',
    maxWidth: 250,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  signOutTextInModal: {
    color: '#cccccc',
    fontSize: 14,
    fontWeight: '500',
  },
  deleteAccountButtonInModal: {
    backgroundColor: 'rgba(220, 53, 69, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 10,
    marginHorizontal: 20,
    marginBottom: 20,
    alignItems: 'center',
    alignSelf: 'center',
    width: '70%',
    maxWidth: 250,
    borderWidth: 1,
    borderColor: 'rgba(220, 53, 69, 0.5)',
  },
  deleteAccountTextInModal: {
    color: 'rgba(220, 53, 69, 0.9)',
    fontSize: 14,
    fontWeight: '500',
  },
  deleteAccountTextDisabled: {
    color: '#666666',
  },
  deleteCancelButtonInModal: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    alignItems: 'center',
    alignSelf: 'center',
    width: '70%',
    maxWidth: 250,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  deleteCancelTextInModal: {
    color: '#cccccc',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteAccountButtonDisabled: {
    opacity: 0.5,
  },
  finalDeleteButtonsContainer: {
    marginTop: 20,
    marginBottom: 30,
    gap: 8,
    alignItems: 'center',
  },
  // Delete Account Modal Styles
  deleteModalContainer: {
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '95%',
    minHeight: '80%',
  },
  deleteModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  deleteModalHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    paddingLeft: Math.max(20, screenWidth * 0.05),
  },
  deleteModalScrollView: {
    flex: 1,
  },
  deleteModalContent: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 24,
  },
  deleteModalTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#dc3545',
    marginBottom: 16,
    textAlign: 'center',
  },
  deleteModalMessage: {
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 12,
    lineHeight: 22,
  },
  deleteModalSubMessage: {
    fontSize: 15,
    color: '#cccccc',
    marginBottom: 16,
    fontWeight: '500',
  },
  deleteModalList: {
    marginBottom: 16,
    paddingLeft: 20,
  },
  deleteModalListItem: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 8,
    lineHeight: 20,
  },
  deleteModalNote: {
    fontSize: 13,
    color: '#999999',
    fontStyle: 'italic',
    marginBottom: 20,
    lineHeight: 18,
  },
  deleteFeedbackInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 20,
    minHeight: 120,
    maxHeight: 200,
  },
  deletePasswordInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 20,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  deleteModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteModalButtonCancel: {
    backgroundColor: '#3a3a3a',
  },
  deleteModalButtonContinue: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
  },
  deleteModalButtonConfirm: {
    backgroundColor: '#dc3545',
  },
  deleteModalButtonDisabled: {
    opacity: 0.5,
  },
  deleteModalButtonCancelText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteModalButtonContinueText: {
    color: 'rgba(255, 255, 255, 1)',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteModalButtonConfirmText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Sign Out Confirmation Modal Styles
  signOutConfirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  signOutConfirmModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  signOutConfirmModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
    textAlign: 'center',
  },
  signOutConfirmModalMessage: {
    fontSize: 14,
    color: '#cccccc',
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
  },
  signOutConfirmButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  signOutConfirmCancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: '#2a2a2a',
  },
  signOutConfirmCancelButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  signOutConfirmButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#ff4444',
  },
  signOutConfirmButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  // Reasons Selection Styles
  reasonsContainer: {
    marginTop: 20,
    marginBottom: 20,
    gap: 12,
  },
  reasonOption: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 0,
  },
  reasonOptionSelected: {
    backgroundColor: 'rgba(220, 53, 69, 0.2)',
    borderColor: '#dc3545',
  },
  reasonOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: '#dc3545',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#dc3545',
  },
  reasonOptionText: {
    fontSize: 16,
    color: '#ffffff',
    flex: 1,
  },
  reasonOptionTextSelected: {
    color: '#ffffff',
    fontWeight: '500',
  },
  otherReasonContainer: {
    marginTop: 20,
    marginBottom: 20,
  },
  disciplineCard: {
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
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  disciplineCardSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(255, 255, 255, 0.72)',
  },
  disciplineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  disciplineNameSelected: {
    color: 'rgba(255, 255, 255, 1)',
  },
  updateInterestsButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    alignItems: 'center',
    width: 200,
  },
  updateInterestsButtonDisabled: {
    backgroundColor: '#3a3a3a',
    opacity: 0.5,
  },
  updateInterestsButtonText: {
    color: 'rgba(255, 255, 255, 1)',
    fontSize: 16,
    fontWeight: '600',
  },
  updateInterestsButtonTextDisabled: {
    color: '#999999',
  },
  // Settings Modal Styles
  settingsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  settingsModal: {
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '95%',
    minHeight: '80%',
  },
  settingsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  settingsModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
    paddingLeft: Math.max(20, screenWidth * 0.05),
  },
  settingsModalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  settingsForm: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
    paddingLeft: Math.max(20, screenWidth * 0.05),
  },
  textInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#ffffff',
  },
  updateProfileButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 280,
  },
  updateProfileButtonDisabled: {
    backgroundColor: '#3a3a3a',
    opacity: 0.5,
  },
  updateProfileButtonText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '600',
  },
  updateProfileButtonTextDisabled: {
    color: '#999999',
  },
  genderContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genderOption: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  genderOptionSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(255, 255, 255, 0.72)',
  },
  genderOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
  },
  genderOptionTextSelected: {
    color: 'rgba(255, 255, 255, 1)',
    fontWeight: '600',
  },
  // Username validation styles
  textInputError: {
    borderColor: '#ff4444',
    borderWidth: 1,
  },
  textInputChanged: {
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  errorText: {
    fontSize: 12,
    color: '#ff4444',
    marginTop: 4,
  },
  successText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 1)',
    marginTop: 4,
  },
  checkingText: {
    fontSize: 12,
    color: '#999999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  // Dropdown styles
  dropdownButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#ffffff',
    flex: 1,
  },
  dropdownPlaceholder: {
    color: '#999999',
  },
  dropdownChevron: {
    marginLeft: 8,
    transform: [{ rotate: '0deg' }],
  },
  dropdownChevronRotated: {
    transform: [{ rotate: '90deg' }],
  },
  dropdownButtonSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(255, 255, 255, 0.72)',
  },
  dropdownButtonTextSelected: {
    color: 'rgba(255, 255, 255, 1)',
    fontWeight: '600',
  },
  dropdownOptions: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    marginTop: 4,
    overflow: 'visible',
  },
  dropdownOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.2,
    borderBottomColor: '#ffffff',
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownOptionCheck: {
    color: '#ffffff',
    fontSize: 16,
    marginRight: 10,
    fontWeight: '600',
  },
  dropdownOptionSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#ffffff',
  },
  dropdownOptionTextSelected: {
    color: 'rgba(255, 255, 255, 1)',
    fontWeight: '600',
  },
  bodyweightHeightRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bodyweightHeightField: {
    flex: 1,
  },
  creatorSectionContainer: {
    marginBottom: Math.max(15, screenHeight * 0.02),
    marginHorizontal: Math.max(24, screenWidth * 0.06),
  },
  creatorEventsCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    padding: Math.max(12, screenWidth * 0.03),
    minHeight: Math.max(55, screenHeight * 0.07),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  creatorEventsIconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorEventsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Subscriptions Info Modal Styles
  subscriptionsInfoModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subscriptionsInfoModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  subscriptionsInfoModalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04),
    width: Math.max(350, screenWidth * 0.9),
    maxWidth: 400,
    height: Math.max(350, screenHeight * 0.5),
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
  subscriptionsInfoScrollContainer: {
    flex: 1,
    position: 'relative',
  },
  subscriptionsInfoScrollView: {
    flex: 1,
  },
  subscriptionsInfoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.max(16, screenHeight * 0.02),
  },
  subscriptionsInfoModalTitle: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.06, 24),
    fontWeight: '600',
  },
  subscriptionsInfoCloseButton: {
    width: Math.max(30, screenWidth * 0.075),
    height: Math.max(30, screenWidth * 0.075),
    borderRadius: Math.max(15, screenWidth * 0.037),
    backgroundColor: '#44454B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionsInfoCloseButtonText: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    fontWeight: '600',
  },
  subscriptionsInfoModalDescription: {
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.045, 18),
    fontWeight: '400',
    lineHeight: Math.max(24, screenHeight * 0.03),
    textAlign: 'left',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  loadingText: {
    marginTop: Math.max(12, screenHeight * 0.015),
    color: '#ffffff',
    fontSize: Math.min(screenWidth * 0.04, 16),
    opacity: 0.7,
  },
});

// Export both default and named for web wrapper compatibility
export { ProfileScreen as ProfileScreenBase };
export default ProfileScreen;
