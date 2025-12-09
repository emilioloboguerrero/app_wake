import React, { useState, useEffect, useRef } from 'react';
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
  Dimensions,
  Image,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';
import firestoreService from '../services/firestoreService';
import { auth, firestore } from '../config/firebase';
import { updateProfile } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import hybridDataService from '../services/hybridDataService';
import tutorialManager from '../services/tutorialManager';
import profilePictureService from '../services/profilePictureService';
import TutorialOverlay from '../components/TutorialOverlay';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import Settings from '../components/icons/vectors_fig/Interface/Settings';
import SvgChevronRight from '../components/icons/vectors_fig/Arrow/ChevronRight';
import SvgCamera from '../components/icons/vectors_fig/System/Camera';
import SvgChartLine from '../components/icons/SvgChartLine';
import SvgFileBlank from '../components/icons/SvgFileBlank';
import SvgCreditCard from '../components/icons/SvgCreditCard';

import logger from '../utils/logger.js';
import { validateDisplayName, validateUsername as validateUsernameFormat, validatePhoneNumber } from '../utils/inputValidation';
import LegalDocumentsWebView from '../components/LegalDocumentsWebView';
import InsightsModal from '../components/InsightsModal';
import { calculateExpirationDate } from '../utils/durationHelper';
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const ProfileScreen = ({ navigation }) => {
  
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  
  // Settings modal state
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  
  // Legal documents WebView state
  const [isLegalWebViewVisible, setIsLegalWebViewVisible] = useState(false);
  
  // Insights modal state
  const [isInsightsModalVisible, setIsInsightsModalVisible] = useState(false);
  const [isGenderDropdownOpen, setIsGenderDropdownOpen] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState(null);
  
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


  // Load user profile data when screen mounts (for display)
  useEffect(() => {
    const loadProfileForDisplay = async () => {
      if (user?.uid) {
        try {
          const userData = await hybridDataService.loadUserProfile(user.uid);
          if (userData) {
            setUserProfile({
              displayName: userData?.displayName || '',
              username: userData?.username || '',
              email: user?.email || '',
              phoneNumber: userData?.phoneNumber || '',
              gender: userData?.gender || '',
              bodyweight: userData?.bodyweight || null,
              height: userData?.height || null,
            });
            
            // Load profile picture if available
            if (userData?.profilePictureUrl) {
              setProfilePictureUrl(userData.profilePictureUrl);
            } else {
              // Try to load from cache/storage
              const cachedUrl = await profilePictureService.getProfilePictureUrl(user.uid);
              if (cachedUrl) {
                setProfilePictureUrl(cachedUrl);
              }
            }
          }
          
          // Check for tutorials after loading profile
          await checkForTutorials();
        } catch (error) {
          logger.error('Error loading profile for display:', error);
        }
      }
    };

    loadProfileForDisplay();
  }, [user]);

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

  // Load user's current interests and profile from hybrid system - ONLY when modals are opened
  const loadUserData = async () => {
    if (user?.uid) {
      try {
        const userData = await hybridDataService.loadUserProfile(user.uid);
        
        // Load profile data
        const profileData = {
          displayName: userData?.displayName || '',
          username: userData?.username || user?.email?.split('@')[0] || '',
          email: user?.email || '',
          phoneNumber: userData?.phoneNumber || '',
          gender: userData?.gender || '',
          bodyweight: userData?.bodyweight || null,
          height: userData?.height || null,
        };
        setUserProfile(profileData);
        setOriginalProfile(profileData);
      } catch (error) {
        logger.error('Error loading user data:', error);
      }
    }
  };


  // Check if profile has changed
  const hasProfileChanges = () => {
    const hasChanges = JSON.stringify(userProfile) !== JSON.stringify(originalProfile);
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

  // Check if username is available
  const checkUsernameAvailability = async (username) => {
    if (!username || username.length < 3) {
      setUsernameError('El usuario debe tener al menos 3 caracteres');
      return;
    }
    
    setIsCheckingUsername(true);
    setUsernameError('');
    
    try {
      // Query Firestore to check if username exists
      const usersQuery = query(
        collection(firestore, 'users'),
        where('username', '==', username)
      );
      const querySnapshot = await getDocs(usersQuery);
      
      if (querySnapshot.empty) {
        setUsernameError(''); // Username is available
      } else {
        setUsernameError('Este usuario ya está en uso');
      }
    } catch (error) {
      logger.error('Error checking username:', error);
      setUsernameError('Error al verificar disponibilidad');
    } finally {
      setIsCheckingUsername(false);
    }
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
    try {
      setLoading(true);
      const newPictureUrl = await profilePictureService.pickAndUploadProfilePicture(user.uid);
      
      if (newPictureUrl) {
        setProfilePictureUrl(newPictureUrl);
        Alert.alert('Éxito', 'Tu foto de perfil se ha actualizado correctamente.');
      }
    } catch (error) {
      console.error('Error changing profile picture:', error);
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
  const showSettingsModal = async () => {
    // Load data when modal opens
    await loadUserData();
    setIsSettingsModalVisible(true);
  };

  // Hide settings modal
  const hideSettingsModal = () => {
    setIsSettingsModalVisible(false);
  };

  // Save profile using hybrid system
  const saveProfile = async () => {
    try {
      setSettingsLoading(true);
      
      // Validate inputs before saving
      try {
        validateDisplayName(userProfile.displayName);
        validateUsernameFormat(userProfile.username);
        if (userProfile.phoneNumber?.trim()) {
          validatePhoneNumber(userProfile.phoneNumber);
        }
      } catch (validationError) {
        Alert.alert('Error de Validación', validationError.message);
        setSettingsLoading(false);
        return;
      }
      
      await hybridDataService.updateUserProfile(user.uid, {
        displayName: userProfile.displayName,
        username: userProfile.username,
        phoneNumber: userProfile.phoneNumber,
        gender: userProfile.gender,
        bodyweight: userProfile.bodyweight ? parseFloat(userProfile.bodyweight) : null,
        height: userProfile.height ? parseFloat(userProfile.height) : null,
      });

      // Keep Firebase Auth displayName in sync for greetings and other auth-dependent UI
      if (auth.currentUser && userProfile.displayName?.trim()) {
        try {
          await updateProfile(auth.currentUser, {
            displayName: userProfile.displayName.trim()
          });
          await auth.currentUser.reload();
          logger.log('✅ Firebase Auth displayName synced from profile settings');
        } catch (profileSyncError) {
          logger.warn('⚠️ Failed to sync Firebase Auth displayName from profile settings:', profileSyncError);
        }
      }

      setOriginalProfile({...userProfile}); // Update original to match current
      Alert.alert('Éxito', 'Tu perfil ha sido actualizado');
      hideSettingsModal();
      
      // Navigate back to Main tab to refresh profile data
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    } catch (error) {
      logger.error('Error saving profile:', error);
      Alert.alert('Error', 'No se pudo guardar el perfil');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await authService.signOutUser();
      Alert.alert('Éxito', 'Has cerrado sesión correctamente');
    } catch (error) {
      Alert.alert('Error', 'No se pudo cerrar sesión');
    }
  };

  // Check for tutorials to show
  const checkForTutorials = async () => {
    if (!user?.uid) return;

    try {
      logger.log('🎬 Checking for profile screen tutorials...');
      const tutorials = await tutorialManager.getTutorialsForScreen(user.uid, 'profile');
      
      if (tutorials.length > 0) {
        logger.log('📚 Found tutorials to show:', tutorials.length);
        setTutorialData(tutorials);
        setCurrentTutorialIndex(0);
        setTutorialVisible(true);
      } else {
        logger.log('✅ No tutorials to show for profile screen');
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
        logger.log('✅ Tutorial marked as completed');
      }
    } catch (error) {
      logger.error('❌ Error marking tutorial as completed:', error);
    }
  };


  return (
    <>
      <SafeAreaView style={styles.container}>
        {/* Fixed Header - No back button for main profile */}
        <FixedWakeHeader />
        
        {/* Fixed Bottom Spacer - Prevents tab bar overlap */}
        <BottomSpacer />

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
                    contentContainerStyle={{flexGrow: 1, paddingBottom: 300}}
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
                      userProfile.displayName !== originalProfile.displayName && styles.textInputChanged
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
                          userProfile.bodyweight !== originalProfile.bodyweight && styles.textInputChanged
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
                          userProfile.height !== originalProfile.height && styles.textInputChanged
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
                      userProfile.username !== originalProfile.username && !usernameError && styles.textInputChanged
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
                  {userProfile.username !== originalProfile.username && isCheckingUsername && (
                    <Text style={styles.checkingText}>Verificando disponibilidad...</Text>
                  )}
                  {userProfile.username !== originalProfile.username && usernameError && (
                    <Text style={styles.errorText}>{usernameError}</Text>
                  )}
                  {userProfile.username !== originalProfile.username && !usernameError && userProfile.username.length >= 3 && (
                    <Text style={styles.successText}>✓ Usuario disponible</Text>
                  )}
                </View>

                {/* Email */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      userProfile.email !== originalProfile.email && styles.textInputChanged
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
                      userProfile.phoneNumber !== originalProfile.phoneNumber && styles.textInputChanged
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
                      userProfile.gender !== originalProfile.gender && userProfile.gender && styles.dropdownButtonSelected
                    ]}
                    onPress={() => setIsGenderDropdownOpen(!isGenderDropdownOpen)}
                  >
                    <Text style={[
                      styles.dropdownButtonText,
                      !userProfile.gender && styles.dropdownPlaceholder,
                      userProfile.gender !== originalProfile.gender && userProfile.gender && styles.dropdownButtonTextSelected
                    ]}>
                      {userProfile.gender || 'Selecciona tu género'}
                    </Text>
                    <SvgChevronRight 
                      width={16} 
                      height={16} 
                      stroke={userProfile.gender !== originalProfile.gender && userProfile.gender ? 'rgba(191, 168, 77, 1)' : '#ffffff'}
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
              </View>
              
                  {/* Sign Out Button */}
                  <TouchableOpacity style={styles.signOutButtonInModal} onPress={handleSignOut}>
                    <Text style={styles.signOutTextInModal}>Cerrar Sesión</Text>
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
                    <Text style={[
                      styles.updateProfileButtonText,
                      !hasProfileChanges() && styles.updateProfileButtonTextDisabled
                    ]}>
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
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Spacer for fixed header */}
          <WakeHeaderSpacer />

          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.screenTitle}>Perfil</Text>
          </View>

          {/* User Profile Card */}
          <View style={styles.userProfileCard}>
            <View style={styles.profileInfoContainer}>
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
            </View>
          </View>

        {/* Pagos and Programs Section */}
        <View style={styles.interestsProgramsContainer}>
          <TouchableOpacity
            style={styles.smallCard}
            onPress={() => navigation.navigate('Subscriptions')}
          >
            <Text style={styles.smallCardTitle}>Suscripciones</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.smallCard} onPress={() => navigation.navigate('AllPurchasedCourses')}>
            <Text style={styles.smallCardTitle}>Programas</Text>
          </TouchableOpacity>
        </View>

        {/* Configuration Card */}
        <TouchableOpacity style={styles.configCard} onPress={showSettingsModal}>
          <Settings width={20} height={20} stroke="#ffffff" strokeWidth={2} style={styles.configIcon} />
          <Text style={styles.configCardTitle}>Configuración</Text>
        </TouchableOpacity>

        {/* Lab Card */}
        <TouchableOpacity style={styles.configCard} onPress={() => setIsInsightsModalVisible(true)}>
          <SvgChartLine width={20} height={20} color="#ffffff" strokeWidth={2} style={styles.configIcon} />
          <Text style={styles.configCardTitle}>Lab</Text>
        </TouchableOpacity>

        {/* Legal Card */}
        <TouchableOpacity style={styles.configCard} onPress={() => setIsLegalWebViewVisible(true)}>
          <SvgFileBlank width={20} height={20} color="#ffffff" strokeWidth={2} style={styles.configIcon} />
          <Text style={styles.configCardTitle}>Legal</Text>
        </TouchableOpacity>


        </View>
      </ScrollView>
      
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
        
        {/* Insights Modal */}
        <InsightsModal
          visible={isInsightsModalVisible}
          onClose={() => setIsInsightsModalVisible(false)}
          onNavigateToPRs={() => navigation.navigate('ExercisePanel')}
          onNavigateToVolume={() => navigation.navigate('WeeklyVolumeHistory')}
          onNavigateToSessions={() => navigation.navigate('Sessions')}
        />
      </SafeAreaView>
    </>
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
    flex: 1,
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
  configCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: Math.max(12, screenWidth * 0.04), // Responsive border radius
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    paddingVertical: Math.max(16, screenHeight * 0.02), // Responsive padding
    paddingHorizontal: Math.max(20, screenWidth * 0.05), // Responsive padding
    marginBottom: Math.max(15, screenHeight * 0.02), // Responsive margin
    marginHorizontal: Math.max(24, screenWidth * 0.06), // Responsive horizontal margin
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: Math.max(60, screenHeight * 0.075), // Responsive min height
  },
  configIcon: {
    marginRight: 12,
  },
  configCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
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
    backgroundColor: '#ff4444',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 20,
    marginHorizontal: 20,
    alignItems: 'center',
  },
  signOutTextInModal: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
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
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderColor: 'rgba(191, 168, 77, 0.72)',
  },
  disciplineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  disciplineNameSelected: {
    color: 'rgba(191, 168, 77, 1)',
  },
  updateInterestsButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
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
    color: 'rgba(191, 168, 77, 1)',
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
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    alignItems: 'center',
    width: 200,
  },
  updateProfileButtonDisabled: {
    backgroundColor: '#3a3a3a',
    opacity: 0.5,
  },
  updateProfileButtonText: {
    color: 'rgba(191, 168, 77, 1)',
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
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderColor: 'rgba(191, 168, 77, 0.72)',
  },
  genderOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
  },
  genderOptionTextSelected: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  // Username validation styles
  textInputError: {
    borderColor: '#ff4444',
    borderWidth: 1,
  },
  textInputChanged: {
    borderColor: 'rgba(191, 168, 77, 0.72)',
    borderWidth: 1,
    backgroundColor: 'rgba(191, 168, 77, 0.1)',
  },
  errorText: {
    fontSize: 12,
    color: '#ff4444',
    marginTop: 4,
  },
  successText: {
    fontSize: 12,
    color: 'rgba(191, 168, 77, 1)',
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
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderColor: 'rgba(191, 168, 77, 0.72)',
  },
  dropdownButtonTextSelected: {
    color: 'rgba(191, 168, 77, 1)',
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
  dropdownOptionSelected: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#ffffff',
  },
  dropdownOptionTextSelected: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  bodyweightHeightRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bodyweightHeightField: {
    flex: 1,
  },
});

export default ProfileScreen;
