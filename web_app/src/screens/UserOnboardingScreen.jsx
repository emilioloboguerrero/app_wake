import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { updateUser, getUser } from '../services/firestoreService';
import { updateProfile } from 'firebase/auth';
import { auth } from '../config/firebase';
import profilePictureService from '../services/profilePictureService';
import Input from '../components/Input';
import Button from '../components/Button';
import DatePicker from '../components/DatePicker';
import { GetCountries, GetState, GetCity, GetAllCities } from 'react-country-state-city';
import './UserOnboardingScreen.css';

const GENDER_OPTIONS = [
  { label: 'Masculino', value: 'male' },
  { label: 'Femenino', value: 'female' },
  { label: 'Otro', value: 'other' },
];

const UserOnboardingScreen = () => {
  const navigate = useNavigate();
  const { user, refreshUserData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const fileInputRef = useRef(null);
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState(null);

  // Check if user signed in with Apple
  const isAppleUser = user?.providerData?.some(provider => provider.providerId === 'apple.com') || false;
  const hasAppleProvidedData = isAppleUser && (user?.displayName || user?.email);

  const [formData, setFormData] = useState({
    profilePicture: null,
    displayName: user?.displayName || '',
    username: '',
    phoneNumber: '',
    email: user?.email || '',
    birthDate: '',
    gender: '',
    country: '',
    city: '',
    bodyweight: '',
    height: '',
  });

  const [errors, setErrors] = useState({});
  const [showGenderDropdown, setShowGenderDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [countrySearchQuery, setCountrySearchQuery] = useState('');

  // Load existing user data if available
  useEffect(() => {
    const loadUserData = async () => {
      if (user) {
        try {
          const userData = await getUser(user.uid);
          if (userData) {
            setFormData(prev => ({
              ...prev,
              displayName: userData.displayName || prev.displayName,
              username: userData.username || prev.username,
              phoneNumber: userData.phoneNumber || prev.phoneNumber,
              email: userData.email || prev.email,
              birthDate: userData.birthDate || prev.birthDate,
              gender: userData.gender || prev.gender,
              country: userData.country || prev.country,
              city: userData.city || prev.city,
              bodyweight: userData.bodyweight?.toString() || prev.bodyweight,
              height: userData.height?.toString() || prev.height,
            }));
          }
        } catch (error) {
          console.error('Error loading user data:', error);
        }
      }
    };
    loadUserData();
  }, [user]);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.displayName?.trim()) {
      newErrors.displayName = 'El nombre es requerido';
    }
    
    if (!formData.username?.trim()) {
      newErrors.username = 'El nombre de usuario es requerido';
    } else if (formData.username.length < 3) {
      newErrors.username = 'El nombre de usuario debe tener al menos 3 caracteres';
    }
    
    if (formData.email && !validateEmail(formData.email)) {
      newErrors.email = 'Correo electrónico no válido';
    }
    
    if (formData.phoneNumber && formData.phoneNumber.length < 10) {
      newErrors.phoneNumber = 'Número de teléfono no válido';
    }
    
    if (!formData.birthDate) {
      newErrors.birthDate = 'La fecha de nacimiento es requerida';
    } else {
      const birthDate = new Date(formData.birthDate);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      if (age < 13 || age > 120) {
        newErrors.birthDate = 'Debes tener entre 13 y 120 años';
      }
    }
    
    if (!formData.gender) {
      newErrors.gender = 'El género es requerido';
    }
    
    if (!formData.country) {
      newErrors.country = 'El país es requerido';
    }
    
    if (!formData.city?.trim()) {
      newErrors.city = 'La ciudad es requerida';
    }
    
    if (formData.bodyweight && (parseFloat(formData.bodyweight) < 20 || parseFloat(formData.bodyweight) > 300)) {
      newErrors.bodyweight = 'Peso no válido (20-300 kg)';
    }
    
    if (formData.height && (parseFloat(formData.height) < 100 || parseFloat(formData.height) > 250)) {
      newErrors.height = 'Altura no válida (100-250 cm)';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('La imagen es demasiado grande. Por favor selecciona una imagen menor a 10MB.');
        return;
      }
      setProfilePicture(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicturePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      alert('Por favor corrige los errores antes de continuar');
      return;
    }

    setLoading(true);
    
    try {
      const userData = {};
      
      // Required fields
      if (formData.displayName?.trim()) {
        userData.displayName = formData.displayName.trim();
      }
      if (formData.username?.trim()) {
        userData.username = formData.username.trim().toLowerCase();
      }
      if (formData.email) {
        userData.email = formData.email.toLowerCase();
      }
      if (formData.birthDate) {
        userData.birthDate = formData.birthDate;
        const birthDate = new Date(formData.birthDate);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        userData.age = age;
      }
      if (formData.gender) {
        userData.gender = formData.gender;
      }
      if (formData.country) {
        userData.country = formData.country;
      }
      if (formData.city?.trim()) {
        userData.city = formData.city.trim();
      }
      if (formData.bodyweight?.trim()) {
        userData.bodyweight = parseFloat(formData.bodyweight.trim());
      }
      if (formData.height?.trim()) {
        userData.height = parseFloat(formData.height.trim());
      }
      
      // Optional fields
      if (formData.phoneNumber?.trim()) {
        userData.phoneNumber = formData.phoneNumber.trim();
      }
      
      // Upload profile picture if provided
      if (profilePicture) {
        try {
          setUploading(true);
          const profilePictureUrl = await profilePictureService.uploadProfilePicture(
            user.uid,
            profilePicture,
            (progress) => setUploadProgress(progress)
          );
          userData.profilePictureUrl = profilePictureUrl;
          userData.profilePicturePath = `profiles/${user.uid}/profile.jpg`;
        } catch (error) {
          console.error('Error uploading profile picture:', error);
          alert('Error al subir la foto de perfil. Continuando sin foto...');
        } finally {
          setUploading(false);
          setUploadProgress(0);
        }
      }
      
      // System fields: mark base profile done, keep onboarding flow pending
      userData.profileCompleted = true;
      userData.onboardingCompleted = false;
      
      // Initialize general tutorials
      userData.generalTutorials = {
        mainScreen: false,
        library: false,
        profile: false,
        community: false
      };

      // Update Firebase Auth displayName
      if (formData.displayName?.trim()) {
        try {
          await updateProfile(auth.currentUser, {
            displayName: formData.displayName.trim()
          });
          await auth.currentUser.reload();
        } catch (profileError) {
          console.warn('Failed to update Firebase Auth displayName:', profileError);
        }
      }

      // Update user document in Firestore
      await updateUser(user.uid, userData);
      
      // Refresh user data
      await refreshUserData();
      
      // Navigate to questions onboarding
      navigate('/user/onboarding/questions', { replace: true });
    } catch (error) {
      console.error('Error completing profile:', error);
      alert('Error al guardar tu información. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // Countries and cities state with caching
  const [countries, setCountries] = useState([]);
  const [citiesCache, setCitiesCache] = useState({}); // Cache cities by country code
  const [loadingCities, setLoadingCities] = useState(false);

  // Load countries on mount
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
        console.error('Error loading countries:', error);
      }
    };
    loadCountries();
  }, []);

  // Load cities for selected country (with caching)
  useEffect(() => {
    const loadCities = async () => {
      if (!formData.country) {
        return;
      }

      // Check cache first
      if (citiesCache[formData.country]) {
        return; // Already cached
      }

      setLoadingCities(true);
      try {
        // Get country ID from countries list
        const allCountries = await GetCountries() || [];
        const countryObj = allCountries.find(c => c.iso2 === formData.country);
        
        if (!countryObj) {
          console.error('Country not found:', formData.country);
          setLoadingCities(false);
          return;
        }
        
        console.log(`Loading cities for ${countryObj.name} (ID: ${countryObj.id})`);
        
        // Get all states for this country
        const states = await GetState(countryObj.id) || [];
        console.log(`Found ${states.length} states for ${countryObj.name}`);
        
        // Get cities for each state
        const allCountryCities = [];
        
        if (states.length > 0) {
          // If country has states, get cities from each state
          for (const state of states) {
            try {
              const stateCities = await GetCity(countryObj.id, state.id) || [];
              allCountryCities.push(...stateCities);
            } catch (error) {
              console.warn(`Error loading cities for state ${state.name} (${state.id}):`, error);
            }
          }
        } else {
          // If country has no states, try to get cities directly
          // Some countries might have cities without states
          console.log(`No states found for ${countryObj.name}, trying alternative approach...`);
          
          // Try getting cities with state ID 0 or null
          try {
            const directCities = await GetCity(countryObj.id, 0) || [];
            allCountryCities.push(...directCities);
            console.log(`Found ${directCities.length} cities directly`);
          } catch (error) {
            console.warn('Could not get cities directly:', error);
          }
        }
        
        console.log(`Total cities loaded for ${countryObj.name}: ${allCountryCities.length}`);
        
        // Cache the cities for this country (even if empty, to avoid re-fetching)
        setCitiesCache(prev => ({
          ...prev,
          [formData.country]: allCountryCities
        }));
      } catch (error) {
        console.error('Error loading cities:', error);
        // Cache empty array to prevent re-fetching on error
        setCitiesCache(prev => ({
          ...prev,
          [formData.country]: []
        }));
      } finally {
        setLoadingCities(false);
      }
    };
    loadCities();
  }, [formData.country, citiesCache]);

  // Get filtered cities - memoized and instant (uses cache)
  const filteredCities = useMemo(() => {
    if (!formData.country) return [];
    
    // Get cities from cache
    const countryCities = citiesCache[formData.country] || [];
    
    if (countryCities.length === 0) return [];
    
    const searchLower = citySearchQuery.toLowerCase();
    
    if (!searchLower) {
      // Return top 100 cities if no search query (for performance)
      return countryCities.slice(0, 100).map(city => city.name);
    }
    
    // Filter by search query
    return countryCities
      .filter(city => city.name.toLowerCase().includes(searchLower))
      .map(city => city.name)
      .slice(0, 50); // Limit results for performance
  }, [citiesCache, formData.country, citySearchQuery]);

  // Get filtered countries for dropdown
  const filteredCountries = useMemo(() => {
    if (!countrySearchQuery) return countries;
    const searchLower = countrySearchQuery.toLowerCase();
    return countries.filter(c => 
      c.label.toLowerCase().includes(searchLower) ||
      c.name.toLowerCase().includes(searchLower)
    );
  }, [countries, countrySearchQuery]);

  // Calculate form completion progress
  const requiredFields = hasAppleProvidedData 
    ? ['displayName', 'username', 'birthDate', 'gender', 'country', 'city']
    : ['displayName', 'username', 'email', 'birthDate', 'gender', 'country', 'city'];
  
  const completedFields = requiredFields.filter(field => {
    const value = formData[field];
    return value && value.toString().trim() !== '';
  }).length;
  
  const progress = requiredFields.length > 0 ? (completedFields / requiredFields.length) * 100 : 0;

  return (
    <div className="user-onboarding-container">
      <div className="user-onboarding-content">
        {/* Header */}
        <div className="onboarding-header">
          <img 
            src="/wake-logo-new.png" 
            alt="Wake Logo" 
            className="onboarding-logo"
          />
          <h1 className="onboarding-title">Completa tu perfil</h1>
          <p className="onboarding-subtitle">Solo necesitamos algunos datos básicos para comenzar</p>
          
          {/* Progress Bar */}
          <div className="progress-indicator">
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="progress-text">{completedFields} de {requiredFields.length} campos completados</span>
          </div>
        </div>

        <div className="onboarding-form">
          {/* Section 1: Profile Picture & Basic Info */}
          <div className="form-section-group">
            <h2 className="section-title">Información básica</h2>
            
            {/* Profile Picture */}
            <div className="form-section profile-picture-section">
              <label className="form-label">
                Foto de perfil
                <span className="optional-badge">Opcional</span>
              </label>
              <div 
                className={`profile-picture-upload ${profilePicturePreview ? 'has-image' : ''}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {profilePicturePreview ? (
                  <img src={profilePicturePreview} alt="Preview" />
                ) : (
                  <div className="upload-placeholder">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <p>Agregar foto</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              {uploading && (
                <div className="upload-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p>{Math.round(uploadProgress)}%</p>
                </div>
              )}
            </div>

            {/* Display Name */}
            <div className="form-section">
              <label className="form-label">
                Nombre completo
                <span className="required-badge">*</span>
              </label>
              <Input
                placeholder="Ej: Juan Pérez"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                error={errors.displayName}
              />
              {errors.displayName && <span className="error-text">{errors.displayName}</span>}
            </div>

            {/* Username */}
            <div className="form-section">
              <label className="form-label">
                Nombre de usuario
                <span className="required-badge">*</span>
              </label>
              <Input
                placeholder="Ej: juanperez"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                error={errors.username}
              />
              <p className="field-hint">Solo letras, números y guiones bajos</p>
              {errors.username && <span className="error-text">{errors.username}</span>}
            </div>

            {/* Email */}
            <div className="form-section">
              <label className="form-label">
                Correo electrónico
                {hasAppleProvidedData ? (
                  <span className="optional-badge">Opcional</span>
                ) : (
                  <span className="required-badge">*</span>
                )}
              </label>
              <Input
                type="email"
                placeholder="correo@ejemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                error={errors.email}
                disabled={hasAppleProvidedData}
              />
              {errors.email && <span className="error-text">{errors.email}</span>}
            </div>

            {/* Phone Number */}
            <div className="form-section">
              <label className="form-label">Teléfono</label>
              <Input
                type="tel"
                placeholder="300 123 4567"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value.replace(/\D/g, '') })}
                error={errors.phoneNumber}
              />
              {errors.phoneNumber && <span className="error-text">{errors.phoneNumber}</span>}
            </div>
          </div>

          {/* Section 2: Personal Details */}
          <div className="form-section-group">
            <h2 className="section-title">Datos personales</h2>

            {/* Birth Date */}
            <div className="form-section">
              <label className="form-label">
                Fecha de nacimiento
                <span className="required-badge">*</span>
              </label>
              <DatePicker
                value={formData.birthDate}
                onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                error={errors.birthDate}
                max={new Date(new Date().setFullYear(new Date().getFullYear() - 13)).toISOString().split('T')[0]}
                placeholder="Selecciona tu fecha de nacimiento"
              />
              {errors.birthDate && <span className="error-text">{errors.birthDate}</span>}
            </div>

            {/* Gender */}
            <div className="form-section">
              <label className="form-label">
                Género
                <span className="required-badge">*</span>
              </label>
              <div className="dropdown-container">
                <div 
                  className={`dropdown-input-with-arrow ${formData.gender ? 'has-value' : ''} ${errors.gender ? 'has-error' : ''}`}
                  onClick={() => setShowGenderDropdown(!showGenderDropdown)}
                >
                  <span className={formData.gender ? '' : 'placeholder'}>
                    {formData.gender ? GENDER_OPTIONS.find(g => g.value === formData.gender)?.label : 'Selecciona tu género'}
                  </span>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {showGenderDropdown && (
                  <>
                    <div className="dropdown-overlay" onClick={() => setShowGenderDropdown(false)} />
                    <div className="dropdown-menu">
                      {GENDER_OPTIONS.map(option => (
                        <div
                          key={option.value}
                          className="dropdown-item"
                          onClick={() => {
                            setFormData({ ...formData, gender: option.value });
                            setShowGenderDropdown(false);
                          }}
                        >
                          {option.label}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {errors.gender && <span className="error-text">{errors.gender}</span>}
            </div>

            {/* Country */}
            <div className="form-section">
              <label className="form-label">
                País
                <span className="required-badge">*</span>
              </label>
              <div className="dropdown-container">
                <div className={`dropdown-input-with-arrow ${formData.country ? 'has-value' : ''} ${errors.country ? 'has-error' : ''}`}>
                  <input
                    type="text"
                    className="dropdown-input-field"
                    placeholder="Busca y selecciona tu país"
                    value={countrySearchQuery || (formData.country ? countries.find(c => c.value === formData.country)?.label : '')}
                    onChange={(e) => {
                      setCountrySearchQuery(e.target.value);
                      setShowCountryDropdown(true);
                    }}
                    onFocus={() => setShowCountryDropdown(true)}
                  />
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {showCountryDropdown && filteredCountries.length > 0 && (
                  <>
                    <div className="dropdown-overlay" onClick={() => setShowCountryDropdown(false)} />
                    <div className="dropdown-menu">
                      {filteredCountries.map(country => (
                        <div
                          key={country.value}
                          className="dropdown-item"
                          onClick={() => {
                            setFormData({ ...formData, country: country.value, city: '' });
                            setCountrySearchQuery('');
                            setCitySearchQuery('');
                            setShowCountryDropdown(false);
                            setShowCityDropdown(false);
                          }}
                        >
                          {country.label}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {errors.country && <span className="error-text">{errors.country}</span>}
            </div>

            {/* City */}
            <div className="form-section">
              <label className="form-label">
                Ciudad
                <span className="required-badge">*</span>
              </label>
              <div className="dropdown-container">
                <div className={`dropdown-input-with-arrow ${formData.city ? 'has-value' : ''} ${errors.city ? 'has-error' : ''} ${!formData.country ? 'disabled' : ''}`}>
                  <input
                    type="text"
                    className="dropdown-input-field"
                    placeholder={formData.country ? "Busca y selecciona tu ciudad" : "Primero selecciona un país"}
                    value={citySearchQuery || formData.city || ''}
                    onChange={(e) => {
                      setCitySearchQuery(e.target.value);
                      setFormData({ ...formData, city: e.target.value });
                      if (formData.country) {
                        setShowCityDropdown(true);
                      }
                    }}
                    onFocus={() => {
                      if (formData.country) {
                        setShowCityDropdown(true);
                      }
                    }}
                    disabled={!formData.country}
                  />
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {showCityDropdown && formData.country && (
                  <>
                    <div className="dropdown-overlay" onClick={() => setShowCityDropdown(false)} />
                    <div className="dropdown-menu city-dropdown">
                      {loadingCities || !citiesCache[formData.country] ? (
                        <div className="dropdown-item">Cargando ciudades...</div>
                      ) : filteredCities.length > 0 ? (
                        filteredCities.map(city => (
                          <div
                            key={city}
                            className="dropdown-item"
                            onClick={() => {
                              setFormData({ ...formData, city: city });
                              setCitySearchQuery('');
                              setShowCityDropdown(false);
                            }}
                          >
                            {city}
                          </div>
                        ))
                      ) : (
                        <div className="dropdown-item">
                          {citySearchQuery ? 'No se encontraron ciudades' : 'No hay ciudades disponibles'}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              {errors.city && <span className="error-text">{errors.city}</span>}
            </div>
          </div>

          {/* Section 3: Physical Stats (Optional) */}
          <div className="form-section-group">
            <h2 className="section-title">Medidas físicas</h2>
            <p className="section-description">Estos datos nos ayudan a personalizar tus entrenamientos</p>

            <div className="form-row">
              {/* Bodyweight */}
              <div className="form-section form-section-half">
                <label className="form-label">Peso (kg)</label>
                <Input
                  type="number"
                  placeholder="70"
                  value={formData.bodyweight}
                  onChange={(e) => setFormData({ ...formData, bodyweight: e.target.value })}
                  error={errors.bodyweight}
                  min="20"
                  max="300"
                />
                {errors.bodyweight && <span className="error-text">{errors.bodyweight}</span>}
              </div>

              {/* Height */}
              <div className="form-section form-section-half">
                <label className="form-label">Altura (cm)</label>
                <Input
                  type="number"
                  placeholder="175"
                  value={formData.height}
                  onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                  error={errors.height}
                  min="100"
                  max="250"
                />
                {errors.height && <span className="error-text">{errors.height}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="onboarding-actions">
          <Button
            title="Continuar"
            onClick={handleSubmit}
            loading={loading || uploading}
            disabled={loading || uploading}
            active={!loading && !uploading}
          />
          <p className="action-hint">Los campos marcados con * son obligatorios</p>
        </div>
      </div>
    </div>
  );
};

export default UserOnboardingScreen;

