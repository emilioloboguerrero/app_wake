 import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';

// Create animated component ONCE outside the component to prevent re-creation
const AnimatedKeyboardAwareScrollView = Animated.createAnimatedComponent(KeyboardAwareScrollView);
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut, updateProfile } from 'firebase/auth';
import { auth } from '../config/firebase';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import firestoreService from '../services/firestoreService';
import logger from '../utils/logger';
import hybridDataService from '../services/hybridDataService';
import profilePictureService from '../services/profilePictureService';
import SvgChevronRight from '../components/icons/vectors_fig/Arrow/ChevronRight';
import SvgCamera from '../components/icons/vectors_fig/System/Camera';
import { FixedWakeHeader, WakeHeaderSpacer } from '../components/WakeHeader';
import citiesData from '../../assets/data/cities_data.json';

import { validateForm, validateInput, sanitizeInput } from '../utils/validation.js';
import { trackUserRegistration } from '../services/monitoringService';
import { 
  validateDisplayName, 
  validateUsername as validateUsernameFormat,
  validatePhoneNumber,
  validateGender
} from '../utils/inputValidation';
const firestore = getFirestore();
// Cities data structure: { countryCode: [city1, city2, ...] }
const CITIES_DATA = citiesData;

// Gender options for modal
const GENDER_OPTIONS = [
  { label: 'Masculino', value: 'male' },
  { label: 'Femenino', value: 'female' },
  { label: 'Otro', value: 'other' },
];

// Objective options for selection
const OBJECTIVE_OPTIONS = [
  'Definir',
  'Ganar masa muscular',
  'Mejorar desempeño',
  'Salud general',
  'Otro',
];

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const OnboardingScreen = ({ navigation, route, onComplete }) => {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  // Match Wake header background max height (see FixedWakeHeader)
  const headerHeightBase = Math.max(60, screenHeight * 0.08);
  const wakeHeaderBgHeight = headerHeightBase + Math.max(0, insets.top - 20);
  const [loading, setLoading] = useState(false);
  // Measure animated header to offset content precisely under it
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(0);
  const [availableDisciplines, setAvailableDisciplines] = useState([]);
  const [disciplinesLoading, setDisciplinesLoading] = useState(true);
  
  // Animation values for logo
  const scrollY = useRef(new Animated.Value(0)).current;
  
  // Logo animation interpolations
  const logoScale = scrollY.interpolate({
    inputRange: [0, 300], // Adjust scroll distance as needed
    outputRange: [3, 1], // Start 3x size, end at 0.8x to match header size
    extrapolate: 'clamp',
  });

  const logoTranslateY = scrollY.interpolate({
    inputRange: [0, 300],
    outputRange: [40, 0], // Start higher, move to top
    extrapolate: 'clamp',
  });
  
  // Check if user signed in with Apple
  const isAppleUser = user?.providerData?.some(provider => provider.providerId === 'apple.com') || false;
  const hasAppleProvidedData = isAppleUser && (user?.displayName || user?.email);

  // Form state - pre-fill with Apple-provided data if available
  const [formData, setFormData] = useState({
    profilePicture: null, // Profile picture URI
    displayName: user?.displayName || '',
    username: '',
    phoneNumber: '',
    email: user?.email || '',
    birthDate: null, // No default date
    gender: '',
    country: '',
    city: '',
    bodyweight: '', // Weight in kg
    height: '', // Height in cm
    // Removed: objectives and interests; collected later
  });

  const [errors, setErrors] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempBirthDate, setTempBirthDate] = useState(new Date()); // Current date as default for picker
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  // Removed: objectives/interests state
  
  // Username validation state
  const [usernameValidating, setUsernameValidating] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const usernameCheckTimeout = useRef(null);
  
  const scrollViewRef = useRef(null);

  // Load available disciplines from database
  useEffect(() => {
    const loadDisciplines = async () => {
      try {
        setDisciplinesLoading(true);
        const disciplines = await hybridDataService.loadAvailableDisciplines(user?.uid);
        setAvailableDisciplines(disciplines || []);
      } catch (error) {
        logger.error('Error loading disciplines:', error);
        setAvailableDisciplines([]);
      } finally {
        setDisciplinesLoading(false);
      }
    };
    
    loadDisciplines();
  }, [user]);

  // Validate username uniqueness
  const validateUsername = async (username) => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    
    setUsernameValidating(true);
    try {
      // Query Firestore to check if username exists
      const usersQuery = query(
        collection(firestore, 'users'),
        where('username', '==', username.toLowerCase())
      );
      const querySnapshot = await getDocs(usersQuery);
      
      if (querySnapshot.empty) {
        setUsernameAvailable(true); // Username is available
      } else {
        setUsernameAvailable(false); // Username is taken
      }
    } catch (error) {
      logger.error('Error validating username:', error);
      setUsernameAvailable(null);
    } finally {
      setUsernameValidating(false);
    }
  };

  // Handle profile picture selection
  const handleProfilePictureSelect = async () => {
    try {
      const imageUri = await profilePictureService.pickImage();
      if (imageUri) {
        setFormData(prev => ({
          ...prev,
          profilePicture: imageUri
        }));
      }
    } catch (error) {
      logger.error('Error selecting profile picture:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen. Inténtalo de nuevo.');
    }
  };

  const handleInputChange = (field, value) => {
    let processedValue = value;
    
    // Convert username to lowercase
    if (field === 'username') {
      processedValue = value.toLowerCase();
    }
    
    // Format phone number input
    if (field === 'phoneNumber') {
      // Remove all non-digit characters except + at the beginning
      let cleanValue = value.replace(/[^\d+]/g, '');
      
      // Ensure it starts with +57 or 57 for Colombian numbers
      if (cleanValue.length > 0 && !cleanValue.startsWith('+57') && !cleanValue.startsWith('57')) {
        if (cleanValue.startsWith('3')) {
          cleanValue = '+57' + cleanValue;
        } else if (cleanValue.startsWith('+')) {
          // Keep as is if it starts with +
        } else {
          cleanValue = '+57' + cleanValue;
        }
      }
      
      // Format with spaces: +57 3XX XXX XXXX
      if (cleanValue.length > 3) {
        const countryCode = cleanValue.substring(0, 3);
        const number = cleanValue.substring(3);
        if (number.length > 0) {
          const formattedNumber = number.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
          processedValue = countryCode + ' ' + formattedNumber;
        } else {
          processedValue = countryCode + ' ' + number;
        }
      } else {
        processedValue = cleanValue;
      }
    }
    
    setFormData(prev => ({
      ...prev,
      [field]: processedValue
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
    
    // Real-time phone number validation
    if (field === 'phoneNumber' && processedValue.trim()) {
      const phoneRegex = /^(\+57|57)?[\s\-]?[3][0-9]{2}[\s\-]?[0-9]{3}[\s\-]?[0-9]{4}$/;
      const cleanPhone = processedValue.replace(/[\s\-]/g, '');
      
      if (!phoneRegex.test(processedValue) || cleanPhone.length < 10) {
        setErrors(prev => ({
          ...prev,
          phoneNumber: 'Por favor ingresa un número de teléfono válido (ej: 300 123 4567)'
        }));
      } else {
        setErrors(prev => ({
          ...prev,
          phoneNumber: null
        }));
      }
    }
    
    // Debounced username validation
    if (field === 'username') {
      setUsernameAvailable(null);
      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
      
      usernameCheckTimeout.current = setTimeout(() => {
        validateUsername(value);
      }, 500);
    }
  };

  // Removed: objectives/interests handlers

  const COUNTRY_OPTIONS = [
    { label: 'Colombia', value: 'colombia' },
    // Future countries can be added here:
    // { label: 'México', value: 'mexico' },
    // { label: 'Argentina', value: 'argentina' },
  ];

  const getCitiesForCountry = (countryValue) => {
    return CITIES_DATA[countryValue] || [];
  };

  const handleCountrySelect = (countryValue) => {
    setFormData(prev => ({
      ...prev,
      country: countryValue,
      city: ''
    }));
    setShowCountryDropdown(false);
    if (errors.country) {
      setErrors(prev => ({ ...prev, country: null }));
    }
  };

  const getCountryLabel = (value) => {
    const c = COUNTRY_OPTIONS.find(c => c.value === value);
    return c ? c.label : 'Selecciona tu país...';
  };

  const handleDateChange = (event, selectedDate) => {
    if (selectedDate) {
      setTempBirthDate(selectedDate); // Update temporary date without saving
    }
  };

  const handleSaveDate = () => {
    setFormData(prev => ({
      ...prev,
      birthDate: tempBirthDate
    }));
    
    // Clear error when date is selected
    if (errors.birthDate) {
      setErrors(prev => ({
        ...prev,
        birthDate: null
      }));
    }
    
    setShowDatePicker(false); // Close the picker
  };

  const handleOpenDatePicker = () => {
    setTempBirthDate(formData.birthDate); // Initialize with current date
    setShowDatePicker(true);
  };

  const handleGenderSelect = (genderValue) => {
    setFormData(prev => ({
      ...prev,
      gender: genderValue
    }));
    setShowGenderModal(false);
    
    // Clear error when gender is selected
    if (errors.gender) {
      setErrors(prev => ({
        ...prev,
        gender: null
      }));
    }
  };

  const handleCitySelect = (cityValue) => {
    setFormData(prev => ({
      ...prev,
      city: cityValue
    }));
    setShowCityDropdown(false);
    setCitySearchQuery('');
    
    // Clear error when city is selected
    if (errors.city) {
      setErrors(prev => ({
        ...prev,
        city: null
      }));
    }
  };

  // Filter cities based on search query
  const getFilteredCities = () => {
    const list = getCitiesForCountry(formData.country);
    if (!citySearchQuery) return list;
    return list.filter(city => 
      city.toLowerCase().includes(citySearchQuery.toLowerCase())
    );
  };

  // Filter countries based on search query
  const getFilteredCountries = () => {
    if (!countrySearchQuery) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter(option => 
      option.label.toLowerCase().includes(countrySearchQuery.toLowerCase())
    );
  };

  const getGenderLabel = (value) => {
    const genderOptions = {
      'male': 'Masculino',
      'female': 'Femenino',
      'other': 'Otro'
    };
    return genderOptions[value] || 'Selecciona tu género...';
  };

  const isFormComplete = () => {
    // Check if displayName is provided (either from form or Apple)
    const hasDisplayName = formData.displayName.trim() || (hasAppleProvidedData && user?.displayName);
    
    return (
      hasDisplayName &&
      formData.username.trim() &&
      formData.username.trim().length >= 3 &&
      usernameAvailable === true &&
      formData.country &&
      formData.city.trim() &&
      formData.birthDate instanceof Date &&
      formData.gender &&
      formData.bodyweight.trim() &&
      formData.height.trim()
    );
  };

  const validateForm = () => {
    const newErrors = {};

    // Required fields - displayName is optional if provided by Apple
    if (!formData.displayName.trim() && !hasAppleProvidedData) {
      newErrors.displayName = 'El nombre completo es requerido';
    }
    if (!formData.username.trim()) {
      newErrors.username = 'El usuario es requerido';
    } else if (formData.username.trim().length < 3) {
      newErrors.username = 'El usuario debe tener al menos 3 caracteres';
    } else if (!usernameAvailable) {
      newErrors.username = 'Este usuario no está disponible';
    }
    if (!formData.country) {
      newErrors.country = 'El país es requerido';
    }
    if (!formData.city.trim()) {
      newErrors.city = 'La ciudad es requerida';
    }
    if (!formData.birthDate || !(formData.birthDate instanceof Date)) {
      newErrors.birthDate = 'La fecha de nacimiento es requerida';
    }
    if (!formData.gender) {
      newErrors.gender = 'La selección de género es requerida';
    }
    if (!formData.bodyweight.trim()) {
      newErrors.bodyweight = 'El peso es requerido';
    } else {
      const weight = parseFloat(formData.bodyweight);
      if (isNaN(weight) || weight < 30 || weight > 300) {
        newErrors.bodyweight = 'Por favor ingresa un peso válido (30-300 kg)';
      }
    }
    if (!formData.height.trim()) {
      newErrors.height = 'La estatura es requerida';
    } else {
      const height = parseFloat(formData.height);
      if (isNaN(height) || height < 100 || height > 250) {
        newErrors.height = 'Por favor ingresa una estatura válida (100-250 cm)';
      }
    }
    // Removed objectives/interests validation

    // Validate age (must be at least 13 years old)
    if (formData.birthDate instanceof Date) {
      const age = calculateAge(formData.birthDate);
      if (age < 13) {
        newErrors.birthDate = 'Debes tener al menos 13 años';
      }
      if (age > 120) {
        newErrors.birthDate = 'Por favor ingresa una fecha válida';
      }
    }

    // Validate phone number if provided
    if (formData.phoneNumber && formData.phoneNumber.trim()) {
      const phoneRegex = /^(\+57|57)?[\s\-]?[3][0-9]{2}[\s\-]?[0-9]{3}[\s\-]?[0-9]{4}$/;
      const cleanPhone = formData.phoneNumber.replace(/[\s\-]/g, '');
      
      if (!phoneRegex.test(formData.phoneNumber) || cleanPhone.length < 10) {
        newErrors.phoneNumber = 'Por favor ingresa un número de teléfono válido (ej: 300 123 4567)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateAge = (birthDate) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert('Error de Validación', 'Por favor corrige los errores e intenta de nuevo.');
      return;
    }

    setLoading(true);
    
    try {
      // Validate inputs before processing
      try {
        // Only validate displayName if it was manually entered (not from Apple)
        const displayNameToValidate = formData.displayName.trim() || (hasAppleProvidedData && user?.displayName ? user.displayName : '');
        if (!hasAppleProvidedData || formData.displayName.trim()) {
          validateDisplayName(displayNameToValidate);
        }
        validateUsernameFormat(formData.username);
        if (formData.phoneNumber?.trim()) {
          validatePhoneNumber(formData.phoneNumber);
        }
        validateGender(formData.gender);
      } catch (validationError) {
        Alert.alert('Error de Validación', validationError.message);
        setLoading(false);
        return;
      }
      
      const age = calculateAge(formData.birthDate);
      
      // Format birth date as YYYY-MM-DD string for storage
      const birthDateString = formData.birthDate.toISOString().split('T')[0];
      
      // Prepare user data for Firestore - only include non-undefined values
      const userData = {};
      
      // Required fields - sanitized
      // Use displayName from form, or fall back to Apple-provided displayName
      const finalDisplayName = formData.displayName?.trim() || (hasAppleProvidedData && user?.displayName ? user.displayName : '');
      if (finalDisplayName) userData.displayName = sanitizeInput.text(finalDisplayName);
      if (formData.username?.trim()) userData.username = sanitizeInput.text(formData.username.trim().toLowerCase());
      // Use email from form, or fall back to Apple-provided email
      const finalEmail = formData.email || (hasAppleProvidedData && user?.email ? user.email : '');
      if (finalEmail) userData.email = sanitizeInput.html(finalEmail).toLowerCase();
      if (birthDateString) userData.birthDate = birthDateString;
      if (age !== undefined && age !== null) userData.age = age;
      if (formData.gender) userData.gender = sanitizeInput.text(formData.gender);
      if (formData.country) userData.country = sanitizeInput.text(formData.country);
      if (formData.city?.trim()) userData.city = sanitizeInput.text(formData.city.trim());
      if (formData.bodyweight?.trim()) userData.bodyweight = parseFloat(formData.bodyweight.trim());
      if (formData.height?.trim()) userData.height = parseFloat(formData.height.trim());
      // Removed: objectives/interests persistence
      
      // Optional fields - only add if they have values
      if (formData.phoneNumber?.trim()) {
        userData.phoneNumber = sanitizeInput.numeric(formData.phoneNumber.trim());
      }
      
      // Upload profile picture if provided
      if (formData.profilePicture) {
        try {
          const profilePictureUrl = await profilePictureService.uploadProfilePicture(user.uid, formData.profilePicture);
          userData.profilePictureUrl = profilePictureUrl;
          userData.profilePicturePath = `profiles/${user.uid}/profile.jpg`;
        } catch (error) {
          logger.error('Error uploading profile picture:', error);
          // Continue without profile picture rather than failing the entire onboarding
        }
      }
      
      // System fields: mark base profile done, keep new onboarding flow pending
      userData.profileCompleted = true;
      userData.onboardingCompleted = false;
      
      // Track user registration
      trackUserRegistration();
      
      // Initialize general tutorials
      userData.generalTutorials = {
        mainScreen: false,
        library: false,
        profile: false,
        community: false
      };

      logger.debug('📝 Saving user data:', userData);

      // Update Firebase Auth displayName with full name
      if (formData.displayName?.trim()) {
        try {
          await updateProfile(auth.currentUser, {
            displayName: formData.displayName.trim()
          });
          // Reload user to propagate changes to AuthContext
          await auth.currentUser.reload();
          logger.debug('✅ Firebase Auth displayName updated to:', formData.displayName.trim());
        } catch (profileError) {
          logger.warn('⚠️ Failed to update Firebase Auth displayName:', profileError);
          // Continue anyway, not critical
        }
      }

      // Update user document in Firestore using hybrid service
      // Cache profile completion status locally for offline access
      try {
        await AsyncStorage.setItem(`onboarding_status_${user.uid}`, JSON.stringify({
          onboardingCompleted: false,
          profileCompleted: true,
          cachedAt: Date.now()
        }));
        logger.debug('💾 Profile completion status cached locally');
      } catch (cacheError) {
        logger.warn('⚠️ Failed to cache profile completion status:', cacheError);
        // Continue anyway - Firestore update is more important
      }

      await hybridDataService.updateUserProfile(user.uid, userData);

      logger.debug('✅ Onboarding completed successfully');
      
      // Trigger AppNavigator to re-check user profile
      if (onComplete) {
        onComplete();
      }

    } catch (error) {
      logger.error('Error completing onboarding:', error);
      Alert.alert('Error', 'No se pudo guardar tu información. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOnboarding = async () => {
    Alert.alert(
      'Cancelar Onboarding',
      '¿Estás seguro de que quieres cancelar? Esto te llevará de vuelta a la pantalla de inicio de sesión.',
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await signOut(auth);
              logger.debug('✅ User signed out successfully');
            } catch (error) {
              logger.error('Error signing out:', error);
              Alert.alert('Error', 'No se pudo cerrar sesión. Por favor intenta de nuevo.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Animated Logo */}
      <Animated.View style={[
        styles.animatedLogoContainer,
        {
          top: screenHeight * 0.03, // Align with other headers (no extra offset)
          transform: [
            { scale: logoScale },
            { translateY: logoTranslateY }
          ]
        }
      ]}
      onLayout={({ nativeEvent }) => {
        // Calculate the expanded logo height: 3x scale of 60px = 180px
        // Plus container padding: 15px top + 15px bottom = 30px
        // Plus top offset: screenHeight * 0.03
        const expandedLogoHeight = 60 * 3; // 180px
        const containerPadding = 30; // paddingVertical: 15 * 2
        const topOffset = screenHeight * 0.03;
        const totalHeight = topOffset + expandedLogoHeight + containerPadding + 50; // Small buffer
        
        setMeasuredHeaderHeight(totalHeight);
      }}>
        <Image 
          source={require('../../assets/wake-logo-new.png')} 
          style={styles.animatedLogo}
          resizeMode="contain"
        />
      </Animated.View>
      
      <AnimatedKeyboardAwareScrollView
        ref={scrollViewRef}
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollViewNormal}
        enableOnAndroid={true}
        extraScrollHeight={20}
          enableResetScrollToCoords={false}
      >
        <View style={styles.content}>
          {/* Start content right below the measured animated header */}
          <View style={{ height: measuredHeaderHeight || Math.max(100, screenHeight * 0.18) }} />
          

          {/* Profile Picture and Name/Username Row */}
          <View style={styles.section}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Perfil</Text>
              <View style={styles.profileRow}>
              {/* Profile Picture - Square */}
              <View style={styles.profilePictureWrapper}>
                <TouchableOpacity 
                  style={styles.profilePictureContainer}
                  onPress={handleProfilePictureSelect}
                  activeOpacity={0.7}
                >
                  {formData.profilePicture ? (
                    <Image 
                      source={{ uri: formData.profilePicture }} 
                      style={styles.profilePicturePreview}
                    />
                  ) : (
                    <View style={styles.profilePicturePlaceholder}>
                      <SvgCamera width={32} height={32} stroke="rgba(255, 255, 255, 0.5)" />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Name and Username Fields */}
              <View style={styles.nameFieldsWrapper}>
                <View style={styles.inputFieldsContainer}>
                  <TextInput
                    style={[
                      styles.input, 
                      errors.displayName && styles.inputError,
                      (formData.displayName.trim() || (hasAppleProvidedData && user?.displayName)) && styles.inputSuccess,
                      hasAppleProvidedData && user?.displayName && styles.inputDisabled
                    ]}
                    value={formData.displayName || (hasAppleProvidedData && user?.displayName ? user.displayName : '') || ''}
                    onChangeText={(value) => handleInputChange('displayName', value)}
                    placeholder="Nombre Completo"
                    placeholderTextColor="#777"
                    autoCapitalize="words"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    editable={!hasAppleProvidedData || !user?.displayName || !!formData.displayName.trim()}
                  />
                  {hasAppleProvidedData && user?.displayName && !formData.displayName.trim() && (
                    <Text style={styles.helperText}>Proporcionado por Apple</Text>
                  )}
                  {errors.displayName && <Text style={styles.errorText}>{errors.displayName}</Text>}

                  <TextInput
                    style={[
                      styles.input, 
                      errors.username && styles.inputError,
                      usernameAvailable && styles.inputSuccess
                    ]}
                    value={formData.username}
                    onChangeText={(value) => handleInputChange('username', value)}
                    placeholder="Usuario"
                    placeholderTextColor="#777"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
                
                {/* Username validation messages - separate from input fields for centering */}
                <View style={styles.usernameValidationContainer}>
                  {usernameValidating && (
                    <View style={styles.validationContainer}>
                      <ActivityIndicator size="small" color="#888" />
                      <Text style={styles.validationText}>Verificando disponibilidad...</Text>
                    </View>
                  )}
                  {!usernameValidating && usernameAvailable === true && formData.username.length >= 3 && (
                    <Text style={styles.successText}>✓ Usuario disponible</Text>
                  )}
                  {!usernameValidating && usernameAvailable === false && (
                    <Text style={styles.errorText}>Este usuario ya está en uso</Text>
                  )}
                  {errors.username && <Text style={styles.errorText}>{errors.username}</Text>}
                </View>
              </View>
            </View>
            </View>
          </View>

          {/* Personal Information */}
          <View style={styles.section}>
            {/* Bodyweight and Height */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Peso y Estatura</Text>
              <View style={styles.bodyweightHeightRow}>
                <View style={styles.bodyweightHeightField}>
                  <TextInput
                    style={[
                      styles.input, 
                      errors.bodyweight && styles.inputError,
                      formData.bodyweight.trim() && styles.inputSuccess
                    ]}
                    value={formData.bodyweight}
                    onChangeText={(value) => handleInputChange('bodyweight', value)}
                    placeholder="Peso (kg)"
                    placeholderTextColor="#777"
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  {errors.bodyweight && <Text style={styles.errorText}>{errors.bodyweight}</Text>}
                </View>
                
                <View style={styles.bodyweightHeightField}>
                  <TextInput
                    style={[
                      styles.input, 
                      errors.height && styles.inputError,
                      formData.height.trim() && styles.inputSuccess
                    ]}
                    value={formData.height}
                    onChangeText={(value) => handleInputChange('height', value)}
                    placeholder="Estatura (cm)"
                    placeholderTextColor="#777"
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  {errors.height && <Text style={styles.errorText}>{errors.height}</Text>}
                </View>
              </View>
            </View>
            {/* Gender Selection */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Género</Text>
              <View style={[
                styles.input,
                errors.gender && styles.inputError,
                formData.gender && styles.inputSuccess
              ]}>
                <TouchableOpacity
                  style={[
                    styles.dropdownButton,
                    showGenderModal && styles.dropdownButtonExpanded
                  ]}
                  onPress={() => setShowGenderModal(!showGenderModal)}
                >
                  <Text style={[
                    styles.dropdownButtonText,
                    !formData.gender && styles.placeholderText,
                    showGenderModal && styles.dropdownButtonTextSelected
                  ]}>
                    {getGenderLabel(formData.gender)}
                  </Text>
                  <View style={[
                    styles.dropdownChevron,
                    showGenderModal && styles.dropdownChevronRotated
                  ]}>
                    <SvgChevronRight 
                      width={20} 
                      height={20} 
                      stroke={formData.gender ? 'rgba(191, 168, 77, 1)' : '#ffffff'} 
                      strokeWidth={2} 
                    />
                  </View>
                </TouchableOpacity>
                
                {showGenderModal && (
                  <View style={styles.genderDropdownExpanded}>
                    {GENDER_OPTIONS.map((option, index) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.dropdownOption,
                          formData.gender === option.value && styles.dropdownOptionSelected,
                          index === GENDER_OPTIONS.length - 1 && styles.dropdownOptionLast
                        ]}
                        onPress={() => handleGenderSelect(option.value)}
                      >
                        <Text style={[
                          styles.dropdownOptionText,
                          formData.gender === option.value && styles.dropdownOptionTextSelected
                        ]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              
              {errors.gender && <Text style={styles.errorText}>{errors.gender}</Text>}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Fecha de Nacimiento</Text>
              <View style={[
                styles.input, 
                errors.birthDate && styles.inputError,
                formData.birthDate instanceof Date && styles.inputSuccess
              ]}>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={handleOpenDatePicker}
                >
                  <Text style={[
                    styles.datePickerText,
                    (!formData.birthDate && !showDatePicker) && styles.placeholderText
                  ]}>
                    {showDatePicker 
                      ? (tempBirthDate || new Date()).toLocaleDateString('es-ES')
                      : (formData.birthDate ? formData.birthDate.toLocaleDateString('es-ES') : 'Selecciona tu fecha de nacimiento')
                    }
                  </Text>
                  {!showDatePicker && (
                    <View style={styles.dropdownChevron}>
                      <SvgChevronRight 
                        width={20} 
                        height={20} 
                        stroke={formData.birthDate ? 'rgba(191, 168, 77, 1)' : '#ffffff'} 
                        strokeWidth={2} 
                      />
                    </View>
                  )}
                  {showDatePicker && (
                    <TouchableOpacity
                      style={styles.datePickerSaveButtonTopRight}
                      onPress={handleSaveDate}
                    >
                      <Text style={styles.datePickerSaveTextTopRight}>Guardar</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
                
                {showDatePicker && (
                  <View style={styles.datePickerExpandedContent}>
                    <DateTimePicker
                      testID="dateTimePicker"
                      value={tempBirthDate || new Date()}
                      mode="date"
                      display="inline"
                      onChange={handleDateChange}
                      maximumDate={new Date()}
                      minimumDate={new Date(1900, 0, 1)}
                      textColor="#ffffff"
                      themeVariant="dark"
                      accentColor="rgba(191, 168, 77, 1)"
                    />
                  </View>
                )}
              </View>
              {errors.birthDate && <Text style={styles.errorText}>{errors.birthDate}</Text>}
            </View>

            {/* Country Selection */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>País</Text>
              <View style={[
                styles.input,
                errors.country && styles.inputError,
                formData.country && styles.inputSuccess
              ]}>
                {!showCountryDropdown ? (
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => setShowCountryDropdown(true)}
                  >
                    <Text style={[
                      styles.dropdownButtonText,
                      !formData.country && styles.placeholderText
                    ]}>
                      {formData.country ? getCountryLabel(formData.country) : 'Selecciona tu país...'}
                    </Text>
                    <View style={styles.dropdownChevron}>
                      <SvgChevronRight 
                        width={20} 
                        height={20} 
                        stroke={formData.country ? 'rgba(191, 168, 77, 1)' : '#ffffff'} 
                        strokeWidth={2} 
                      />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.dropdownButton}>
                    {/* Search input replaces the button text */}
                    <TextInput
                      style={styles.citySearchInputInline}
                      value={countrySearchQuery}
                      onChangeText={setCountrySearchQuery}
                      placeholder="Buscar país..."
                      placeholderTextColor="#777"
                      autoCapitalize="words"
                      autoFocus={true}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    <TouchableOpacity
                      style={styles.dropdownChevron}
                      onPress={() => {
                        setShowCountryDropdown(false);
                        setCountrySearchQuery('');
                      }}
                    >
                      <View style={styles.dropdownChevronRotated}>
                        <SvgChevronRight 
                          width={20} 
                          height={20} 
                          stroke="#ffffff" 
                          strokeWidth={2} 
                        />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {showCountryDropdown && (
                  <ScrollView style={styles.countryDropdownExpanded}>
                    {getFilteredCountries().map((option, index) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.dropdownOption,
                          formData.country === option.value && styles.dropdownOptionSelected,
                          index === getFilteredCountries().length - 1 && styles.dropdownOptionLast
                        ]}
                        onPress={() => handleCountrySelect(option.value)}
                      >
                        <Text style={[
                          styles.dropdownOptionText,
                          formData.country === option.value && styles.dropdownOptionTextSelected
                        ]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {getFilteredCountries().length === 0 && (
                      <View style={styles.dropdownOption}>
                        <Text style={styles.dropdownOptionText}>
                          No se encontraron países
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                )}
              </View>
              {errors.country && <Text style={styles.errorText}>{errors.country}</Text>}
            </View>

            {/* City Selection */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Ciudad</Text>
              <View style={[
                styles.input,
                errors.city && styles.inputError,
                formData.city.trim() && styles.inputSuccess
              ]}>
                {!showCityDropdown ? (
                  <TouchableOpacity
                    style={[
                      styles.dropdownButton,
                      !formData.country && styles.inputDisabled
                    ]}
                    onPress={() => formData.country && setShowCityDropdown(true)}
                    disabled={!formData.country}
                  >
                    <Text style={[
                      styles.dropdownButtonText,
                      (!formData.city || !formData.country) && styles.placeholderText
                    ]}>
                      {formData.city || (!formData.country ? 'Primero selecciona un país' : 'Selecciona tu ciudad...')}
                    </Text>
                    <View style={styles.dropdownChevron}>
                      <SvgChevronRight 
                        width={20} 
                        height={20} 
                        stroke={formData.city ? 'rgba(191, 168, 77, 1)' : '#ffffff'} 
                        strokeWidth={2} 
                      />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.dropdownButton}>
                    {/* Search input replaces the button text */}
                    <TextInput
                      style={styles.citySearchInputInline}
                      value={citySearchQuery}
                      onChangeText={setCitySearchQuery}
                      placeholder="Buscar ciudad..."
                      placeholderTextColor="#777"
                      autoCapitalize="words"
                      autoFocus={true}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    <TouchableOpacity
                      style={styles.dropdownChevron}
                      onPress={() => {
                        setShowCityDropdown(false);
                        setCitySearchQuery('');
                      }}
                    >
                      <View style={styles.dropdownChevronRotated}>
                        <SvgChevronRight 
                          width={20} 
                          height={20} 
                          stroke="#ffffff" 
                          strokeWidth={2} 
                        />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {showCityDropdown && (
                  <ScrollView 
                    style={styles.cityDropdownExpanded}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                  >
                    {getFilteredCities().map((city, index) => (
                      <TouchableOpacity
                        key={city}
                        style={[
                          styles.dropdownOption,
                          formData.city === city && styles.dropdownOptionSelected,
                          index === getFilteredCities().length - 1 && styles.dropdownOptionLast
                        ]}
                        onPress={() => handleCitySelect(city)}
                      >
                        <Text style={[
                          styles.dropdownOptionText,
                          formData.city === city && styles.dropdownOptionTextSelected
                        ]}>
                          {city}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {getFilteredCities().length === 0 && (
                      <View style={styles.dropdownOption}>
                        <Text style={styles.dropdownOptionText}>
                          No se encontraron ciudades
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                )}
              </View>
              
              {errors.city && <Text style={styles.errorText}>{errors.city}</Text>}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={[
                  styles.input, 
                  errors.phoneNumber && styles.inputError,
                  formData.phoneNumber.trim() && styles.inputSuccess
                ]}
                value={formData.phoneNumber}
                onChangeText={(value) => handleInputChange('phoneNumber', value)}
                placeholder="Ingresa tu número de teléfono"
                placeholderTextColor="#777"
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              {errors.phoneNumber && <Text style={styles.errorText}>{errors.phoneNumber}</Text>}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled, styles.inputSuccess]}
                value={formData.email}
                editable={false}
                placeholderTextColor="#777"
              />
              {hasAppleProvidedData && user?.email && (
                <Text style={styles.helperText}>Proporcionado por Apple</Text>
              )}
            </View>

            {/* Objectives removed for now */}
          </View>

          {/* Interests removed for now */}

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton, 
              (loading || !isFormComplete()) && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={loading || !isFormComplete()}
          >
            <Text style={[
              styles.submitButtonText,
              (loading || !isFormComplete()) && styles.submitButtonTextDisabled
            ]}>
              {loading ? 'Guardando...' : 'Completar Perfil'}
            </Text>
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelOnboarding}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>
              Cancelar
            </Text>
          </TouchableOpacity>
        </View>
      </AnimatedKeyboardAwareScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  animatedLogoContainer: {
    position: 'absolute',
    // top: now set dynamically with insets.top + 10
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    backgroundColor: '#1a1a1a',
    paddingVertical: 15,
    paddingHorizontal: 24,
  },
  animatedLogo: {
    width: 120,
    height: 60,
  },
  logoSpacer: {
    height: Math.max(80, Math.min(200, screenHeight * 0.16)),
  },
  scrollView: {
    flex: 1,
  },
  scrollViewNormal: {
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 20,
  },
  titleSection: {
    marginBottom: 30,
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 20,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#cccccc',
    textAlign: 'center',
    marginBottom: 30,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 8,
    marginLeft: 20,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#cccccc',
    marginBottom: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 8,
    marginLeft: 20,
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    fontWeight: '400',
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  profilePictureWrapper: {
    width: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameFieldsWrapper: {
    flex: 1,
    gap: 0,
  },
  inputFieldsContainer: {
    gap: 28,
  },
  usernameValidationContainer: {
    marginTop: 4,
  },
  profilePictureContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 65,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
    height: 130,
  },
  profilePicturePreview: {
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  profilePicturePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePicturePlaceholderText: {
    fontSize: 32,
    marginBottom: 8,
    color: '#ffffff',
  },
  profilePicturePlaceholderLabel: {
    fontSize: 14,
    color: '#cccccc',
    fontWeight: '400',
  },
  bodyweightHeightRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bodyweightHeightField: {
    flex: 1,
  },
  inputDisabled: {
    backgroundColor: '#1f1f1f',
    color: '#888',
    // Preserve shadow effects from base input style
  },
  inputError: {
    borderColor: '#ff4444',
    borderWidth: 1,
    shadowColor: 'rgba(255, 68, 68, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  inputSuccess: {
    borderColor: 'rgba(191, 168, 77, 0.7)',
    borderWidth: 1,
    shadowColor: 'rgba(191, 168, 77, 0.8)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: '400',
    marginTop: 5,
  },
  successText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 12,
    fontWeight: '400',
    marginTop: 5,
  },
  helperText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '400',
    marginTop: 5,
    fontStyle: 'italic',
  },
  validationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  validationText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '400',
    marginLeft: 8,
  },
  datePickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  datePickerExpandedContent: {
    marginTop: 10,
  },
  datePickerSaveButtonTopRight: {
    backgroundColor: 'rgba(191, 168, 77, 0)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  datePickerSaveTextTopRight: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 16,
    fontWeight: '600',
  },
  datePickerText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '400',
  },
  datePickerSaveButtonContainer: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 10,
  },
  datePickerSaveButton: {
    backgroundColor: 'rgba(191, 168, 77, 0)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  datePickerSaveText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 16,
    fontWeight: '600',
  },
  placeholderText: {
    color: '#777',
  },
  dropdownContainer: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    overflow: 'visible',
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownButtonExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  dropdownButtonSelected: {
    borderColor: 'rgba(191, 168, 77, 0.7)',
    borderWidth: 1,
    shadowColor: 'rgba(191, 168, 77, 0.8)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  dropdownButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '400',
  },
  dropdownButtonTextSelected: {
    color: 'rgba(191, 168, 77, 1)',
  },
  dropdownChevron: {
    // No rotation - SvgChevronRight already points right
  },
  dropdownChevronRotated: {
    transform: [{ rotate: '90deg' }],
  },
  dropdownOptions: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    overflow: 'visible',
  },
  dropdownOptionsContainer: {
    backgroundColor: '#2a2a2a',
  },
  citySearchContainer: {
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  citySearchInputInline: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
  },
  citySearchClose: {
    padding: 5,
    marginLeft: 10,
  },
  dropdownOptionsScrollable: {
    backgroundColor: '#2a2a2a',
    maxHeight: 180,
    borderRadius: 12,
    overflow: 'visible',
  },
  cityDropdownExpanded: {
    backgroundColor: '#2a2a2a',
    marginTop: 10,
    maxHeight: 180,
    overflow: 'hidden',
  },
  countryDropdownExpanded: {
    backgroundColor: '#2a2a2a',
    marginTop: 10,
    maxHeight: 180,
    overflow: 'hidden',
  },
  genderDropdownExpanded: {
    backgroundColor: '#2a2a2a',
    marginTop: 10,
    maxHeight: 180,
    overflow: 'hidden',
  },
  dropdownOption: {
    padding: 15,
    borderBottomWidth: 0.2,
    borderBottomColor: '#ffffff',
  },
  dropdownOptionLast: {
    borderBottomWidth: 0,
  },
  dropdownOptionSelected: {
    // No background highlight for selected options
  },
  dropdownOptionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '400',
  },
  dropdownOptionTextSelected: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '400',
    marginTop: 12,
  },
  disciplinesContainer: {
    gap: 12,
  },
  disciplineCard: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 12,
    borderWidth: 0.2,
    borderColor: '#ffffff',
  },
  disciplineCardSelected: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    borderColor: 'rgba(191, 168, 77, 1)',
    borderWidth: 1.5,
  },
  disciplineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  disciplineNameSelected: {
    color: 'rgba(191, 168, 77, 1)',
  },
  disciplineDescription: {
    fontSize: 14,
    fontWeight: '400',
    color: '#cccccc',
  },
  disciplineDescriptionSelected: {
    color: '#ffffff',
  },
  submitButton: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
    height: Math.max(50, screenHeight * 0.06), // Match WorkoutExercisesScreen.js
    width: Math.max(200, screenWidth * 0.5), // Match WorkoutExercisesScreen.js
    borderRadius: Math.max(12, screenWidth * 0.04), // Match WorkoutExercisesScreen.js
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    alignSelf: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 18,
    fontWeight: '600',
  },
  submitButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    height: Math.max(50, screenHeight * 0.06), // Match submitButton height
    width: Math.max(200, screenWidth * 0.5), // Match submitButton width
    borderRadius: Math.max(12, screenWidth * 0.04), // Match submitButton border radius
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 40,
    alignSelf: 'center',
  },
  cancelButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    fontWeight: '500',
  },
  objectiveHeader: {
    padding: 15,
    borderBottomWidth: 0.2,
    borderBottomColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  objectiveHeaderText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  objectiveCloseButton: {
    padding: 5,
  },
  objectiveOptions: {
    backgroundColor: '#2a2a2a',
  },
  objectiveOption: {
    padding: 15,
    borderBottomWidth: 0.2,
    borderBottomColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  objectiveOptionLast: {
    borderBottomWidth: 0,
  },
  objectiveOptionSelected: {
    backgroundColor: 'rgba(191, 168, 77, 0.2)',
  },
  objectiveOptionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '400',
  },
  objectiveOptionTextSelected: {
    color: 'rgba(191, 168, 77, 1)',
    fontWeight: '600',
  },
  objectiveCheckmark: {
    color: 'rgba(191, 168, 77, 1)',
    fontSize: 16,
    fontWeight: '600',
  },
  otherObjectiveContainer: {
    padding: 15,
    borderTopWidth: 0.2,
    borderTopColor: '#ffffff',
  },
  otherObjectiveInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: 'rgba(255, 255, 255, 0.4)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
});

export default OnboardingScreen;
