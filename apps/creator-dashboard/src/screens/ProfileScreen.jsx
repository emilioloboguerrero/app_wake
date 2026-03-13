import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ScreenSkeleton from '../components/ScreenSkeleton';
import ErrorBoundary from '../components/ErrorBoundary';
import Input from '../components/Input';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { getUser, updateUser, isUsernameTaken } from '../services/firestoreService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import profilePictureService from '../services/profilePictureService';
import cardService from '../services/cardService';
import authService from '../services/authService';
import { updateProfile } from 'firebase/auth';
import { auth } from '../config/firebase';
import { GetCountries, GetState, GetCity } from 'react-country-state-city';
import logger from '../utils/logger';
import './ProfileScreen.css';

const ProfileScreen = () => {
  const { user, refreshUserData, isCreator } = useAuth();
  const navigate = useNavigate();
  const queryClientHook = useQueryClient();

  const { data: userData, isLoading: loading } = useQuery({
    queryKey: queryKeys.user.detail(user?.uid),
    queryFn: () => getUser(user.uid),
    enabled: !!user?.uid,
    ...cacheConfig.userProfile,
  });

  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState(null);
  
  const [originalValues, setOriginalValues] = useState(null);
  
  const [creatorCards, setCreatorCards] = useState([]);
  
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [citySearchQuery, setCitySearchQuery] = useState('');
  
  const [usernameValidating, setUsernameValidating] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const usernameCheckTimeout = useRef(null);
  
  const fileInputRef = useRef(null);
  const storyListRef = useRef(null);
  
  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardMedia, setNewCardMedia] = useState(null);
  const [newCardMediaPreview, setNewCardMediaPreview] = useState(null);
  const [newCardMediaType, setNewCardMediaType] = useState(null);
  const [isCardUploading, setIsCardUploading] = useState(false);
  const [cardUploadProgress, setCardUploadProgress] = useState(0);
  const cardMediaInputRef = useRef(null);

  // Detect card type (same logic as CreatorProfileScreen)
  const detectCardType = (rawValue) => {
    if (!rawValue || typeof rawValue !== 'string') {
      return 'text';
    }

    const value = rawValue.trim();
    if (value.startsWith('http')) {
      const videoRegex = /\.(mp4|mov|m4v|webm|m3u8)(\?|$)/i;
      const imageRegex = /\.(png|jpg|jpeg|webp|gif)(\?|$)/i;

      if (videoRegex.test(value) || value.includes('youtube') || value.includes('vimeo')) {
        return 'video';
      }
      if (imageRegex.test(value)) {
        return 'image';
      }
      return 'link';
    }
    return 'text';
  };

  const [countries, setCountries] = useState([]);
  const [citiesCache, setCitiesCache] = useState({}); // Cache cities by country code
  const [loadingCities, setLoadingCities] = useState(false);

  useEffect(() => {
    const loadCountries = async () => {
      try {
        const allCountries = await GetCountries() || [];
        const formatted = allCountries.map(country => ({
          value: country.iso2,
          label: country.name,
          name: country.name
        })).sort((a, b) => a.label.localeCompare(b.label));
        setCountries(formatted);
      } catch (error) {
        logger.error('Error loading countries:', error);
      }
    };
    loadCountries();
  }, []);

  useEffect(() => {
    const loadCities = async () => {
      if (!country) {
        return;
      }

      // Check cache first
      if (citiesCache[country]) {
        return; // Already cached
      }

      setLoadingCities(true);
      try {
        const allCountries = await GetCountries() || [];
        const countryObj = allCountries.find(c => c.iso2 === country);
        
        if (!countryObj) {
          setLoadingCities(false);
          return;
        }
        
        const states = await GetState(countryObj.id) || [];
        
        const allCountryCities = [];
        
        if (states.length > 0) {
          for (const state of states) {
            try {
              const stateCities = await GetCity(countryObj.id, state.id) || [];
              allCountryCities.push(...stateCities);
            } catch (error) {
              logger.warn(`Error loading cities for state ${state.name}:`, error);
            }
          }
        } else {
          try {
            const directCities = await GetCity(countryObj.id, 0) || [];
            allCountryCities.push(...directCities);
          } catch (error) {
            logger.warn('Could not get cities directly:', error);
          }
        }
        
        // Cache the cities for this country (even if empty, to avoid re-fetching)
        setCitiesCache(prev => ({
          ...prev,
          [country]: allCountryCities
        }));
      } catch (error) {
        logger.error('Error loading cities:', error);
        // Cache empty array to prevent re-fetching on error
        setCitiesCache(prev => ({
          ...prev,
          [country]: []
        }));
      } finally {
        setLoadingCities(false);
      }
    };
    loadCities();
  }, [country, citiesCache]);

  const getFilteredCountries = () => {
    if (!countrySearchQuery.trim()) return countries;
    const searchLower = countrySearchQuery.toLowerCase();
    return countries.filter(c => 
      c.label.toLowerCase().includes(searchLower) ||
      c.name.toLowerCase().includes(searchLower)
    );
  };

  const filteredCities = useMemo(() => {
    if (!country) return [];
    
    const countryCities = citiesCache[country] || [];
    
    if (countryCities.length === 0) return [];
    
    const searchLower = citySearchQuery.toLowerCase();
    
    if (!searchLower) {
      // Return top 100 cities if no search query (for performance)
      return countryCities.slice(0, 100).map(city => city.name);
    }
    
    return countryCities
      .filter(city => city.name.toLowerCase().includes(searchLower))
      .map(city => city.name)
      .slice(0, 50); // Limit results for performance
  }, [citiesCache, country, citySearchQuery]);

  const getCountryLabel = (value) => {
    if (!value) return '';
    const countryObj = countries.find(c => c.value === value);
    return countryObj ? countryObj.label : value;
  };

  const validateUsername = async (username) => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    
    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }
    
    usernameCheckTimeout.current = setTimeout(async () => {
      setUsernameValidating(true);
      try {
        const isTaken = await isUsernameTaken(username, user.uid);
        
        setUsernameAvailable(!isTaken);
      } catch (error) {
        logger.error('Error validating username:', error);
        setUsernameAvailable(null);
      } finally {
        setUsernameValidating(false);
      }
    }, 500);
  };

  // Sync form fields when userData from React Query changes
  useEffect(() => {
    const data = userData;
    if (!user || !data) return;
    {
      // Set form fields
      const initialDisplayName = user.displayName || data?.name || '';
      const initialName = data?.name || user.displayName || '';
      const initialUsername = data?.username || '';
      const initialEmail = user.email || '';
      const initialGender = data?.gender || '';
      const initialCity = data?.city || data?.location || '';
      const initialCountry = data?.country || '';
      const initialHeight = data?.height || '';
      const initialWeight = data?.weight || '';
      let initialBirthDate = '';

      if (data?.birthDate) {
        const date = data.birthDate.toDate ? data.birthDate.toDate() : new Date(data.birthDate);
        initialBirthDate = date.toISOString().split('T')[0];
      }

      setDisplayName(initialDisplayName);
      setName(initialName);
      setUsername(initialUsername);
      setEmail(initialEmail);
        setGender(initialGender);
        setCity(initialCity);
        setCountry(initialCountry);
        setHeight(initialHeight);
        setWeight(initialWeight);
        setBirthDate(initialBirthDate);
        
        setOriginalValues({
          displayName: initialDisplayName,
          name: initialName,
          username: initialUsername,
          gender: initialGender,
          city: initialCity,
          country: initialCountry,
          height: initialHeight,
          weight: initialWeight,
          birthDate: initialBirthDate,
          profilePictureUrl: user.photoURL || data?.profilePictureUrl || null
        });
        
        if (user.photoURL || data?.profilePictureUrl) {
          setProfilePicturePreview(user.photoURL || data.profilePictureUrl);
        }
        
      if (isCreator) {
        const cardsMap = data?.cards || {};
        const parsedCards = Object.entries(cardsMap).map(([title, value]) => ({
          id: title,
          title,
          value,
          type: detectCardType(value),
        }));
        setCreatorCards(parsedCards);
      }
    }
  }, [userData, user, isCreator]);

  useEffect(() => {
    if (username && username !== userData?.username) {
      validateUsername(username);
    }
    return () => {
      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
    };
  }, [username]);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen');
      return;
    }

    setProfilePicture(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setProfilePicturePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleProfilePictureUpload = async () => {
    if (!profilePicture || !user) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);

      await profilePictureService.uploadProfilePicture(
        user.uid,
        profilePicture,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      await refreshUserData();
      await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.detail(user.uid) });
      const updatedPhotoURL = auth.currentUser?.photoURL || userData?.profilePictureUrl;

      if (updatedPhotoURL) {
        setProfilePicturePreview(updatedPhotoURL);
      }

      if (originalValues) {
        setOriginalValues({
          ...originalValues,
          profilePictureUrl: updatedPhotoURL
        });
      }
      
      setProfilePicture(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      alert('Foto de perfil actualizada correctamente');
    } catch (error) {
      logger.error('Error uploading profile picture:', error);
      let errorMessage = 'Error al subir la foto de perfil. Por favor intenta de nuevo.';
      
      if (error.code === 'storage/unauthorized') {
        errorMessage = 'No tienes permiso para subir archivos. Verifica tu autenticación.';
      } else if (error.code === 'storage/canceled') {
        errorMessage = 'La subida fue cancelada.';
      } else if (error.code === 'storage/unknown') {
        errorMessage = 'Error desconocido al subir el archivo.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCountrySelect = (countryValue) => {
    setCountry(countryValue);
    setShowCountryDropdown(false);
    setCountrySearchQuery('');
    setCity('');
    setCitySearchQuery('');
  };

  const handleCitySelect = (selectedCity) => {
    setCity(selectedCity);
    setShowCityDropdown(false);
    setCitySearchQuery('');
  };

  const hasChanges = () => {
    if (!originalValues) return false;
    
    return (
      displayName !== originalValues.displayName ||
      name !== originalValues.name ||
      username !== originalValues.username ||
      gender !== originalValues.gender ||
      city !== originalValues.city ||
      country !== originalValues.country ||
      height !== originalValues.height ||
      weight !== originalValues.weight ||
      birthDate !== originalValues.birthDate ||
      profilePicture !== null
    );
  };

  const handleCancel = () => {
    if (!originalValues) return;
    
    setDisplayName(originalValues.displayName);
    setName(originalValues.name);
    setUsername(originalValues.username);
    setGender(originalValues.gender);
    setCity(originalValues.city);
    setCountry(originalValues.country);
    setHeight(originalValues.height);
    setWeight(originalValues.weight);
    setBirthDate(originalValues.birthDate);
    setProfilePicture(null);
    setProfilePicturePreview(originalValues.profilePictureUrl);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    setUsernameAvailable(null);
  };

  const handleCardMediaSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      alert('Por favor selecciona una imagen o video');
      return;
    }

    setNewCardMedia(file);
    setNewCardMediaType(file.type.startsWith('image/') ? 'image' : 'video');
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setNewCardMediaPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleAddCard = async () => {
    if (!user || !newCardTitle.trim()) {
      alert('Por favor ingresa un título para la tarjeta');
      return;
    }

    if (!newCardMedia) {
      alert('Por favor selecciona una imagen o video');
      return;
    }

    try {
      setIsCardUploading(true);
      setCardUploadProgress(0);

      let cardValue = '';

      if (newCardMediaType === 'image' && newCardMedia) {
        const imageUrl = await cardService.uploadCardImage(
          user.uid,
          newCardMedia,
          (progress) => {
            setCardUploadProgress(progress);
          }
        );
        cardValue = imageUrl;
      } else if (newCardMediaType === 'video' && newCardMedia) {
        const videoUrl = await cardService.uploadCardVideo(
          user.uid,
          newCardMedia,
          (progress) => {
            setCardUploadProgress(progress);
          }
        );
        cardValue = videoUrl;
      }

      // Update Firestore with new card
      const currentCards = userData?.cards || {};
      const updatedCards = {
        ...currentCards,
        [newCardTitle.trim()]: cardValue
      };

      await updateUser(user.uid, { cards: updatedCards });

      await refreshUserData();
      await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.detail(user.uid) });

      const parsedCards = Object.entries(updatedCards).map(([title, value]) => ({
        id: title,
        title,
        value,
        type: detectCardType(value),
      }));
      setCreatorCards(parsedCards);

      setNewCardTitle('');
      setNewCardMedia(null);
      setNewCardMediaPreview(null);
      setNewCardMediaType(null);
      if (cardMediaInputRef.current) {
        cardMediaInputRef.current.value = '';
      }
      setIsAddCardModalOpen(false);

      alert('Tarjeta agregada correctamente');
    } catch (error) {
      logger.error('Error adding card:', error);
      alert(error.message || 'Error al agregar la tarjeta. Por favor intenta de nuevo.');
    } finally {
      setIsCardUploading(false);
      setCardUploadProgress(0);
    }
  };

  const handleCloseAddCardModal = () => {
    setIsAddCardModalOpen(false);
    setNewCardTitle('');
    setNewCardMedia(null);
    setNewCardMediaPreview(null);
    setNewCardMediaType(null);
    if (cardMediaInputRef.current) {
      cardMediaInputRef.current.value = '';
    }
  };

  const handleSignOut = async () => {
    try {
      await authService.signOutUser();
      navigate('/login');
    } catch (error) {
      logger.error('Error signing out:', error);
      alert('Error al cerrar sesión. Por favor intenta de nuevo.');
    }
  };

  const handleSave = async () => {
    if (!user) return;

    // Validate username if changed
    if (username !== (userData?.username || '') && usernameAvailable === false) {
      alert('El nombre de usuario no está disponible. Por favor elige otro.');
      return;
    }

    try {
      setSaving(true);

      if (displayName !== user.displayName) {
        await updateProfile(auth.currentUser, {
          displayName: displayName
        });
      }

      const updateData = {};
      
      if (name !== (userData?.name || '')) {
        updateData.name = name;
      }
      
      if (username !== (userData?.username || '')) {
        updateData.username = username.toLowerCase();
      }
      
      if (gender !== (userData?.gender || '')) {
        updateData.gender = gender;
      }
      
      if (city !== (userData?.city || userData?.location || '')) {
        updateData.city = city;
      }
      
      if (country !== (userData?.country || '')) {
        updateData.country = country;
      }
      
      if (height !== (userData?.height || '')) {
        updateData.height = height;
      }
      
      if (weight !== (userData?.weight || '')) {
        updateData.weight = weight;
      }
      
      if (birthDate) {
        const date = new Date(birthDate);
        if (date.toString() !== 'Invalid Date') {
          updateData.birthDate = date;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await updateUser(user.uid, updateData);
      }

      await refreshUserData();
      await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.detail(user.uid) });

      setProfilePicture(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      alert('Perfil actualizado correctamente');
    } catch (error) {
      logger.error('Error saving profile:', error);
      alert('Error al guardar el perfil. Por favor intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const Layout = DashboardLayout;

  if (loading) {
    return (
      <Layout screenName="Perfil">
        <ScreenSkeleton />
      </Layout>
    );
  }

  return (
    <ErrorBoundary>
    <Layout screenName="Perfil">
      <div className="profile-screen">
        <div className="profile-content">
          {/* Single Scrollable Card */}
          <div className="profile-section profile-section-scrollable">
            <div className="profile-section-header">
              <h3 className="profile-section-title">Información Personal</h3>
              {hasChanges() && (
                <div className="profile-section-actions">
                  <button
                    className="profile-cancel-button"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                  <Button
                    title="Guardar"
                    onClick={handleSave}
                    loading={saving}
                    disabled={saving || (username && username.length >= 3 && usernameAvailable === false)}
                  />
                </div>
              )}
            </div>
            <div className="profile-form-scrollable">
              {/* Profile Picture and Name/Username Row */}
              <div className="profile-name-row">
                <div className="profile-picture-inline">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <div 
                    className="profile-picture-inline-container"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {profilePicturePreview ? (
                      <img 
                        src={profilePicturePreview} 
                        alt="Profile" 
                        className="profile-picture-inline-image"
                      />
                    ) : (
                      <div className="profile-picture-inline-placeholder">
                        {displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  {profilePicture && (
                    <button
                      className="profile-picture-upload-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleProfilePictureUpload();
                      }}
                      disabled={isUploading}
                    >
                      {isUploading ? `Subiendo... ${Math.round(uploadProgress)}%` : 'Subir'}
                    </button>
                  )}
                </div>
                <div className="profile-name-fields">
                  <div className="profile-field-card">
                    <label className="profile-field-card-label">Nombre</label>
                    <Input
                      placeholder="Nombre completo"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="profile-field-card">
                    <label className="profile-field-card-label">Usuario</label>
                    <div className="username-input-wrapper">
                      <Input
                        placeholder="Nombre de usuario"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      />
                      {usernameValidating && (
                        <span className="username-checking">Verificando...</span>
                      )}
                      {!usernameValidating && username && username.length >= 3 && usernameAvailable === true && (
                        <span className="username-available">✓ Disponible</span>
                      )}
                      {!usernameValidating && username && username.length >= 3 && usernameAvailable === false && (
                        <span className="username-taken">✗ No disponible</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Email Field */}
              <div className="profile-field-card">
                <label className="profile-field-card-label">Correo electrónico</label>
                <Input
                  placeholder="Correo electrónico"
                  value={email}
                  onChange={() => {}}
                  disabled={true}
                />
              </div>

              {/* Gender and Birth Date Row */}
              <div className="profile-form-row">
                <div className="profile-form-field">
                  <label className="profile-form-label">Género</label>
                  <select
                    className="profile-form-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">Seleccionar</option>
                    <option value="male">Masculino</option>
                    <option value="female">Femenino</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div className="profile-form-field">
                  <label className="profile-form-label">Fecha de Nacimiento</label>
                  <input
                    type="date"
                    className="profile-date-input"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Height and Weight Row */}
              <div className="profile-form-row">
                <div className="profile-form-field">
                  <label className="profile-form-label">Altura (cm)</label>
                  <div className="profile-number-input-wrapper">
                    <Input
                      type="number"
                      placeholder="Altura"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                    />
                    <div className="profile-number-spinner">
                      <button
                        type="button"
                        className="profile-spinner-button profile-spinner-up"
                        onClick={() => setHeight(prev => String((parseFloat(prev) || 0) + 1))}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)"/>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="profile-spinner-button profile-spinner-down"
                        onClick={() => setHeight(prev => String(Math.max(0, (parseFloat(prev) || 0) - 1)))}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="profile-form-field">
                  <label className="profile-form-label">Peso (kg)</label>
                  <div className="profile-number-input-wrapper">
                    <Input
                      type="number"
                      placeholder="Peso"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                    />
                    <div className="profile-number-spinner">
                      <button
                        type="button"
                        className="profile-spinner-button profile-spinner-up"
                        onClick={() => setWeight(prev => String((parseFloat(prev) || 0) + 1))}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)"/>
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="profile-spinner-button profile-spinner-down"
                        onClick={() => setWeight(prev => String(Math.max(0, (parseFloat(prev) || 0) - 1)))}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Country and City Row */}
              <div className="profile-form-row">
                <div className="profile-form-field">
                  <label className="profile-form-label">País</label>
                  <div className="profile-dropdown-container">
                    {!showCountryDropdown ? (
                      <div
                        className="profile-dropdown-button"
                        onClick={() => setShowCountryDropdown(true)}
                      >
                        <span className={country ? 'profile-dropdown-text' : 'profile-dropdown-placeholder'}>
                          {country ? getCountryLabel(country) : 'Selecciona tu país...'}
                        </span>
                        <span className="profile-dropdown-chevron profile-dropdown-chevron-right">›</span>
                      </div>
                    ) : (
                      <div className="profile-dropdown-button profile-dropdown-active">
                        <input
                          type="text"
                          className="profile-dropdown-search"
                          value={countrySearchQuery}
                          onChange={(e) => setCountrySearchQuery(e.target.value)}
                          placeholder="Buscar país..."
                          autoFocus
                        />
                        <span 
                          className="profile-dropdown-chevron profile-dropdown-chevron-down"
                          onClick={() => {
                            setShowCountryDropdown(false);
                            setCountrySearchQuery('');
                          }}
                        >
                          ›
                        </span>
                      </div>
                    )}
                    {showCountryDropdown && (
                      <div className="profile-dropdown-list">
                        {getFilteredCountries().map((option) => (
                          <div
                            key={option.value}
                            className={`profile-dropdown-option ${country === option.value ? 'profile-dropdown-option-selected' : ''}`}
                            onClick={() => handleCountrySelect(option.value)}
                          >
                            {option.label}
                          </div>
                        ))}
                        {getFilteredCountries().length === 0 && (
                          <div className="profile-dropdown-option">
                            No se encontraron países
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="profile-form-field">
                  <label className="profile-form-label">Ciudad</label>
                  <div className="profile-dropdown-container">
                    {!showCityDropdown ? (
                      <div
                        className={`profile-dropdown-button ${!country ? 'profile-dropdown-disabled' : ''}`}
                        onClick={() => country && setShowCityDropdown(true)}
                      >
                        <span className={city ? 'profile-dropdown-text' : 'profile-dropdown-placeholder'}>
                          {city || (!country ? 'Primero selecciona un país' : 'Selecciona tu ciudad...')}
                        </span>
                        <span className="profile-dropdown-chevron profile-dropdown-chevron-right">›</span>
                      </div>
                    ) : (
                      <div className="profile-dropdown-button profile-dropdown-active">
                        <input
                          type="text"
                          className="profile-dropdown-search"
                          value={citySearchQuery}
                          onChange={(e) => setCitySearchQuery(e.target.value)}
                          placeholder="Buscar ciudad..."
                          autoFocus
                        />
                        <span 
                          className="profile-dropdown-chevron profile-dropdown-chevron-down"
                          onClick={() => {
                            setShowCityDropdown(false);
                            setCitySearchQuery('');
                          }}
                        >
                          ›
                        </span>
                      </div>
                    )}
                    {showCityDropdown && (
                      <div className="profile-dropdown-list">
                        {filteredCities.map((cityOption) => (
                          <div
                            key={cityOption}
                            className={`profile-dropdown-option ${city === cityOption ? 'profile-dropdown-option-selected' : ''}`}
                            onClick={() => handleCitySelect(cityOption)}
                          >
                            {cityOption}
                          </div>
                        ))}
                        {filteredCities.length === 0 && (
                          <div className="profile-dropdown-option">
                            No se encontraron ciudades
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Story Cards Section - Only for creators */}
          {isCreator && (
            <div className="profile-section profile-story-cards-section">
              <div className="profile-story-cards-header">
                <h3 className="profile-section-title">Mis Historias</h3>
                <button
                  className="profile-add-card-button"
                  onClick={() => setIsAddCardModalOpen(true)}
                >
                  <span className="profile-add-card-icon">+</span>
                </button>
              </div>
              {creatorCards.length > 0 && (
                <div className="profile-story-cards-container">
                  <div 
                    className="profile-story-cards-list"
                    ref={storyListRef}
                  >
                    {creatorCards.map((card, index) => (
                      <div
                        key={card.id || index}
                        className="profile-story-card-wrapper"
                      >
                        {card.title && (
                          <div className="profile-story-card-title-wrapper">
                            <h4 className="profile-story-card-title">{card.title}</h4>
                          </div>
                        )}
                        <div className={`profile-story-card profile-story-card-${card.type}`}>
                          {card.type === 'image' && card.value && (
                            <img 
                              src={card.value} 
                              alt={card.title || 'Story'}
                              className="profile-story-card-image"
                            />
                          )}
                          {card.type === 'video' && card.value && (
                            <video 
                              src={card.value}
                              className="profile-story-card-video"
                              controls
                              playsInline
                            />
                          )}
                          {(card.type === 'text' || card.type === 'link') && (
                            <div className="profile-story-card-text-content">
                              <p className="profile-story-card-text">
                                {card.value}
                              </p>
                              {card.type === 'link' && (
                                <a 
                                  href={card.value} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="profile-story-card-link"
                                >
                                  Abrir enlace
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Card Modal - Only for creators */}
      {isCreator && (
        <Modal
          isOpen={isAddCardModalOpen}
          onClose={handleCloseAddCardModal}
          title="Agregar Nueva Historia"
        >
        <div className="add-card-modal-content">
          <div className="add-card-form">
            <div className="add-card-field">
              <Input
                placeholder="Título de tu historia"
                value={newCardTitle}
                onChange={(e) => setNewCardTitle(e.target.value)}
                type="text"
              />
            </div>

            <div className="add-card-field">
              <div 
                className={`add-card-media-preview ${newCardMediaPreview ? 'has-media' : ''}`}
                onClick={() => cardMediaInputRef.current?.click()}
              >
                {newCardMediaPreview ? (
                  newCardMediaType === 'video' ? (
                    <video src={newCardMediaPreview} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <img src={newCardMediaPreview} alt="Preview" />
                  )
                ) : (
                  <div className="add-card-upload-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p>Haz clic para subir imagen o video</p>
                  </div>
                )}
              </div>
              <input
                ref={cardMediaInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleCardMediaSelect}
                style={{ display: 'none' }}
              />
              {isCardUploading && (
                <div className="add-card-upload-progress">
                  <div className="add-card-progress-bar">
                    <div 
                      className="add-card-progress-fill" 
                      style={{ width: `${cardUploadProgress}%` }}
                    />
                  </div>
                  <p>{Math.round(cardUploadProgress)}%</p>
                </div>
              )}
            </div>

            <div className="add-card-actions">
              <Button
                title="Agregar"
                onClick={handleAddCard}
                loading={isCardUploading}
                disabled={
                  isCardUploading ||
                  !newCardTitle.trim() ||
                  !newCardMedia
                }
              />
            </div>
          </div>
        </div>
      </Modal>
      )}

      {/* Logout Button */}
      <div className="profile-logout-section">
        <button className="profile-logout-button" onClick={handleSignOut}>
          Cerrar Sesión
        </button>
      </div>
    </Layout>
    </ErrorBoundary>
  );
};

export default ProfileScreen;
