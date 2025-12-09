import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import UserDashboardLayout from '../components/UserDashboardLayout';
import Input from '../components/Input';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { getUser, updateUser } from '../services/firestoreService';
import profilePictureService from '../services/profilePictureService';
import cardService from '../services/cardService';
import authService from '../services/authService';
import { updateProfile } from 'firebase/auth';
import { auth, firestore } from '../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
// Cities data structure matches mobile app: { countryName: [city1, city2, ...] }
// For web app, we'll use a simplified structure that matches the mobile app pattern
const CITIES_DATA = {
  'colombia': ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Cúcuta', 'Bucaramanga', 'Pereira', 'Santa Marta', 'Ibagué', 'Pasto', 'Manizales', 'Neiva', 'Villavicencio', 'Armenia', 'Valledupar', 'Montería', 'Sincelejo', 'Popayán', 'Tunja']
};
import './ProfileScreen.css';

const ProfileScreen = () => {
  const { user, refreshUserData, isCreator } = useAuth();
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  // Form fields
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
  
  // Original values for change detection
  const [originalValues, setOriginalValues] = useState(null);
  
  // Creator cards
  const [creatorCards, setCreatorCards] = useState([]);
  
  // Dropdown states
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [citySearchQuery, setCitySearchQuery] = useState('');
  
  // Username validation
  const [usernameValidating, setUsernameValidating] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const usernameCheckTimeout = useRef(null);
  
  const fileInputRef = useRef(null);
  const storyListRef = useRef(null);
  const [storyActiveIndex, setStoryActiveIndex] = useState(0);
  
  // Add card modal state
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

  // Get country options
  const getCountryOptions = () => {
    const countryLabels = {
      'colombia': 'Colombia',
      'mexico': 'México',
      'argentina': 'Argentina',
      'spain': 'España',
      'usa': 'Estados Unidos'
    };
    const countries = Object.keys(CITIES_DATA).map(key => ({
      value: key,
      label: countryLabels[key] || key.charAt(0).toUpperCase() + key.slice(1)
    }));
    return countries.sort((a, b) => a.label.localeCompare(b.label));
  };

  // Get filtered countries
  const getFilteredCountries = () => {
    const countries = getCountryOptions();
    if (!countrySearchQuery.trim()) return countries;
    return countries.filter(c => 
      c.label.toLowerCase().includes(countrySearchQuery.toLowerCase())
    );
  };

  // Get city options for selected country
  const getCityOptions = () => {
    if (!country) return [];
    return CITIES_DATA[country] || [];
  };

  // Get filtered cities
  const getFilteredCities = () => {
    const cities = getCityOptions();
    if (!citySearchQuery.trim()) return cities;
    return cities.filter(c => 
      c.toLowerCase().includes(citySearchQuery.toLowerCase())
    );
  };

  // Get country label
  const getCountryLabel = (value) => {
    const country = getCountryOptions().find(c => c.value === value);
    return country ? country.label : value.charAt(0).toUpperCase() + value.slice(1);
  };

  // Validate username uniqueness
  const validateUsername = async (username) => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    
    // Clear existing timeout
    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }
    
    // Debounce the check
    usernameCheckTimeout.current = setTimeout(async () => {
      setUsernameValidating(true);
      try {
        const usersQuery = query(
          collection(firestore, 'users'),
          where('username', '==', username.toLowerCase())
        );
        const querySnapshot = await getDocs(usersQuery);
        
        // Check if username is taken by another user
        const isTaken = !querySnapshot.empty && 
          querySnapshot.docs.some(doc => doc.id !== user.uid);
        
        setUsernameAvailable(!isTaken);
      } catch (error) {
        console.error('Error validating username:', error);
        setUsernameAvailable(null);
      } finally {
        setUsernameValidating(false);
      }
    }, 500);
  };

  useEffect(() => {
    const loadUserData = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        const data = await getUser(user.uid);
        setUserData(data);
        
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
        
        // Handle birthDate
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
        
        // Store original values for change detection
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
        
        // Set profile picture preview
        if (user.photoURL || data?.profilePictureUrl) {
          setProfilePicturePreview(user.photoURL || data.profilePictureUrl);
        }
        
        // Parse and set creator cards (only for creators)
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
      } catch (error) {
        console.error('Error loading user data:', error);
        alert('Error al cargar los datos del perfil');
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [user, isCreator]);

  // Validate username when it changes
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
    
    // Create preview
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

      // Refresh user data to get updated photoURL
      await refreshUserData();
      
      // Get updated user data
      await refreshUserData();
      const updatedData = await getUser(user.uid);
      const updatedPhotoURL = auth.currentUser?.photoURL || updatedData?.profilePictureUrl;
      
      // Update profile picture preview
      if (updatedPhotoURL) {
        setProfilePicturePreview(updatedPhotoURL);
      }
      
      // Update original values to reflect the uploaded picture
      if (originalValues) {
        setOriginalValues({
          ...originalValues,
          profilePictureUrl: updatedPhotoURL
        });
      }
      
      // Clear the file input
      setProfilePicture(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      alert('Foto de perfil actualizada correctamente');
    } catch (error) {
      console.error('Error uploading profile picture:', error);
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
    // Reset city when country changes
    if (city && !CITIES_DATA[countryValue]?.includes(city)) {
      setCity('');
    }
  };

  const handleCitySelect = (selectedCity) => {
    setCity(selectedCity);
    setShowCityDropdown(false);
    setCitySearchQuery('');
  };

  // Check if there are changes
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
    
    // Reset all fields to original values
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
    
    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Reset username validation
    setUsernameAvailable(null);
  };

  // Handle card media file select
  const handleCardMediaSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      alert('Por favor selecciona una imagen o video');
      return;
    }

    setNewCardMedia(file);
    setNewCardMediaType(file.type.startsWith('image/') ? 'image' : 'video');
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setNewCardMediaPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Handle add card
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

      // Refresh user data
      await refreshUserData();
      const updatedData = await getUser(user.uid);
      setUserData(updatedData);

      // Parse and update cards
      const parsedCards = Object.entries(updatedCards).map(([title, value]) => ({
        id: title,
        title,
        value,
        type: detectCardType(value),
      }));
      setCreatorCards(parsedCards);

      // Reset form
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
      console.error('Error adding card:', error);
      alert(error.message || 'Error al agregar la tarjeta. Por favor intenta de nuevo.');
    } finally {
      setIsCardUploading(false);
      setCardUploadProgress(0);
    }
  };

  // Handle close add card modal
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

  // Handle sign out
  const handleSignOut = async () => {
    try {
      await authService.signOutUser();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
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

      // Update Firebase Auth displayName if changed
      if (displayName !== user.displayName) {
        await updateProfile(auth.currentUser, {
          displayName: displayName
        });
      }

      // Prepare Firestore update data
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

      // Update Firestore if there are changes
      if (Object.keys(updateData).length > 0) {
        await updateUser(user.uid, updateData);
      }

      // Refresh user data
      await refreshUserData();
      
      // Refresh user data
      await refreshUserData();
      
      // Reload user data to get updated values
      const updatedData = await getUser(user.uid);
      setUserData(updatedData);
      
      // Update original values after save
      const newDisplayName = auth.currentUser?.displayName || updatedData?.name || '';
      const newName = updatedData?.name || auth.currentUser?.displayName || '';
      const newUsername = updatedData?.username || '';
      const newGender = updatedData?.gender || '';
      const newCity = updatedData?.city || updatedData?.location || '';
      const newCountry = updatedData?.country || '';
      const newHeight = updatedData?.height || '';
      const newWeight = updatedData?.weight || '';
      let newBirthDate = '';
      if (updatedData?.birthDate) {
        const date = updatedData.birthDate.toDate ? updatedData.birthDate.toDate() : new Date(updatedData.birthDate);
        newBirthDate = date.toISOString().split('T')[0];
      }
      const newProfilePictureUrl = auth.currentUser?.photoURL || updatedData?.profilePictureUrl || null;
      
      setOriginalValues({
        displayName: newDisplayName,
        name: newName,
        username: newUsername,
        gender: newGender,
        city: newCity,
        country: newCountry,
        height: newHeight,
        weight: newWeight,
        birthDate: newBirthDate,
        profilePictureUrl: newProfilePictureUrl
      });
      
      // Update profile picture preview
      if (newProfilePictureUrl) {
        setProfilePicturePreview(newProfilePictureUrl);
      }
      
      // Clear profile picture state
      setProfilePicture(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      alert('Perfil actualizado correctamente');
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Error al guardar el perfil. Por favor intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const Layout = isCreator ? DashboardLayout : UserDashboardLayout;

  if (loading) {
    return (
      <Layout screenName="Perfil">
        <div className="profile-screen-loading">
          <p>Cargando perfil...</p>
        </div>
      </Layout>
    );
  }

  return (
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
                        {getFilteredCities().map((cityOption) => (
                          <div
                            key={cityOption}
                            className={`profile-dropdown-option ${city === cityOption ? 'profile-dropdown-option-selected' : ''}`}
                            onClick={() => handleCitySelect(cityOption)}
                          >
                            {cityOption}
                          </div>
                        ))}
                        {getFilteredCities().length === 0 && (
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
  );
};

export default ProfileScreen;
