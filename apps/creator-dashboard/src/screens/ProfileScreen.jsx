import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import Input from '../components/Input';
import { GlowingEffect, ShimmerSkeleton } from '../components/ui';
import { queryKeys, cacheConfig } from '../config/queryClient';
import profilePictureService from '../services/profilePictureService';
import userPreferencesService from '../services/userPreferencesService';
import authService from '../services/authService';
import apiClient from '../utils/apiClient';
import useAutoSave from '../hooks/useAutoSave';
import { useToast } from '../contexts/ToastContext';
import { GetCountries, GetState, GetCity } from 'react-country-state-city';
import logger from '../utils/logger';
import './ProfileScreen.css';

const ProfileScreen = () => {
  const { user, refreshUserData, isCreator } = useAuth();
  const navigate = useNavigate();
  const queryClientHook = useQueryClient();
  const { showToast } = useToast();

  const { data: userData, isLoading: loading } = useQuery({
    queryKey: queryKeys.user.detail(user?.uid),
    queryFn: () => apiClient.get('/users/me').then((r) => r.data),
    enabled: !!user?.uid,
    ...cacheConfig.userProfile,
  });

  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

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

  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [citySearchQuery, setCitySearchQuery] = useState('');

  const fileInputRef = useRef(null);

  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  // Instagram
  const [instagramInput, setInstagramInput] = useState('');

  // Nav preferences
  const [navEventos, setNavEventos] = useState(true);
  const [navDisponibilidad, setNavDisponibilidad] = useState(true);

  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const allCountries = (await GetCountries()) || [];
      return allCountries
        .map((c) => ({
          value: c.iso2,
          label: c.name,
          name: c.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    staleTime: Infinity,
  });

  const { data: citiesList = [], isLoading: loadingCities } = useQuery({
    queryKey: ['cities', country],
    queryFn: async () => {
      const allCountries = (await GetCountries()) || [];
      const countryObj = allCountries.find((c) => c.iso2 === country);
      if (!countryObj) return [];

      const states = (await GetState(countryObj.id)) || [];
      const allCities = [];

      if (states.length > 0) {
        for (const state of states) {
          try {
            const stateCities = (await GetCity(countryObj.id, state.id)) || [];
            allCities.push(...stateCities);
          } catch {
            console.error(`Error loading cities for state ${state.name}`);
          }
        }
      } else {
        try {
          const directCities = (await GetCity(countryObj.id, 0)) || [];
          allCities.push(...directCities);
        } catch {
          console.error('Could not get cities directly');
        }
      }

      return allCities;
    },
    enabled: !!country,
    staleTime: Infinity,
  });

  // Debounced username availability check
  useEffect(() => {
    const savedUsername = originalValues?.username ?? '';
    if (username === savedUsername) {
      setUsernameAvailable(null);
      return;
    }
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingUsername(true);
      try {
        const data = await apiClient.get(`/creator/username-check?username=${encodeURIComponent(username)}`);
        setUsernameAvailable(data.available);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setIsCheckingUsername(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [username, originalValues]);

  const { data: navPrefsData, isSuccess: navPrefsLoaded } = useQuery({
    queryKey: ['navPreferences', user?.uid],
    queryFn: () => userPreferencesService.getNavPreferences(),
    enabled: !!user?.uid,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!navPrefsData) return;
    setNavEventos(navPrefsData.eventos !== false);
    setNavDisponibilidad(navPrefsData.disponibilidad !== false);
  }, [navPrefsData]);

  const getFilteredCountries = useMemo(() => {
    if (!countrySearchQuery.trim()) return countries;
    const searchLower = countrySearchQuery.toLowerCase();
    return countries.filter(
      (c) =>
        c.label.toLowerCase().includes(searchLower) || c.name.toLowerCase().includes(searchLower)
    );
  }, [countries, countrySearchQuery]);

  const filteredCities = useMemo(() => {
    if (!country || citiesList.length === 0) return [];

    const searchLower = citySearchQuery.toLowerCase();

    if (!searchLower) {
      return citiesList.slice(0, 100).map((c) => c.name);
    }

    return citiesList
      .filter((c) => c.name.toLowerCase().includes(searchLower))
      .map((c) => c.name)
      .slice(0, 50);
  }, [citiesList, country, citySearchQuery]);

  const getCountryLabel = (value) => {
    if (!value) return '';
    const countryObj = countries.find((c) => c.value === value);
    return countryObj ? countryObj.label : value;
  };

  // Sync form fields when userData from React Query changes
  useEffect(() => {
    const data = userData;
    if (!user || !data) return;

    const initialDisplayName = data?.displayName || user.displayName || '';
    const initialName = data?.displayName || user.displayName || '';
    const initialUsername = data?.username || '';
    const initialEmail = data?.email || user.email || '';
    const initialGender = data?.gender || '';
    const initialCity = data?.city || '';
    const initialCountry = data?.country || '';
    const initialHeight = data?.height || '';
    const initialWeight = data?.weight || '';
    const initialBirthDate = data?.birthDate || '';

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
      profilePictureUrl: data?.profilePictureUrl || null,
    });

    if (data?.profilePictureUrl) {
      setProfilePicturePreview(data.profilePictureUrl);
    }
  }, [userData, user]);

  const processImageFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Por favor selecciona una imagen válida', 'error');
      return;
    }
    setProfilePicture(file);
    const reader = new FileReader();
    reader.onload = (e) => setProfilePicturePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (event) => processImageFile(event.target.files[0]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDraggingOver(true); };
  const handleDragLeave = () => setIsDraggingOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    processImageFile(e.dataTransfer?.files?.[0]);
  };

  const handleProfilePictureUpload = async () => {
    if (!profilePicture || !user) return;
    try {
      setIsUploading(true);
      setUploadProgress(0);

      const newPhotoURL = await profilePictureService.uploadProfilePicture(
        user.uid,
        profilePicture,
        (progress) => setUploadProgress(progress)
      );

      await refreshUserData();
      await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.detail(user.uid) });

      if (newPhotoURL) setProfilePicturePreview(newPhotoURL);
      if (originalValues) setOriginalValues({ ...originalValues, profilePictureUrl: newPhotoURL });

      setProfilePicture(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      showToast('Foto actualizada con éxito', 'success');
    } catch (error) {
      logger.error('Error uploading profile picture:', error);
      let errorMessage = 'Error al subir la foto. Intenta de nuevo.';
      if (error.code === 'storage/unauthorized') errorMessage = 'Sin permiso para subir archivos.';
      else if (error.code === 'storage/canceled') errorMessage = 'Subida cancelada.';
      else if (error.message) errorMessage = error.message;
      showToast(errorMessage, 'error');
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
    autoSaveTrigger({ ...getFormSnapshot(), country: countryValue, city: '' });
  };

  const handleCitySelect = (selectedCity) => {
    setCity(selectedCity);
    setShowCityDropdown(false);
    setCitySearchQuery('');
    autoSaveTrigger({ ...getFormSnapshot(), city: selectedCity });
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

  const handleSignOut = async () => {
    try {
      await authService.signOutUser();
      navigate('/login');
    } catch (error) {
      logger.error('Error signing out:', error);
      showToast('Error al cerrar sesión. Intenta de nuevo.', 'error');
    }
  };

  const saveProfile = useCallback(async (snapshot) => {
    if (!user) return;

    const updateData = {};

    if (snapshot.name.trim() !== (userData?.displayName || '')) updateData.displayName = snapshot.name.trim();
    if (snapshot.username.trim() !== (userData?.username || '')) updateData.username = snapshot.username.trim().toLowerCase();
    if (snapshot.gender !== (userData?.gender || '')) updateData.gender = snapshot.gender;
    if (snapshot.city.trim() !== (userData?.city || '')) updateData.city = snapshot.city.trim();
    if (snapshot.country.trim() !== (userData?.country || '')) updateData.country = snapshot.country.trim();
    if (String(snapshot.height) !== String(userData?.height || ''))
      updateData.height = parseFloat(snapshot.height) || null;
    if (String(snapshot.weight) !== String(userData?.weight || ''))
      updateData.weight = parseFloat(snapshot.weight) || null;
    if (snapshot.birthDate && snapshot.birthDate !== (userData?.birthDate || ''))
      updateData.birthDate = snapshot.birthDate;

    if (Object.keys(updateData).length === 0) return;

    await apiClient.patch('/users/me', updateData);

    await refreshUserData();
    await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.detail(user.uid) });

    setProfilePicture(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [user, userData, refreshUserData, queryClientHook]);

  const { trigger: autoSaveTrigger, flush: autoSaveFlush, isSaving: isAutoSaving } = useAutoSave(
    saveProfile,
    { delay: 800, successMessage: 'Identidad guardada', errorMessage: 'No se pudo guardar' }
  );

  const getFormSnapshot = useCallback(() => ({
    name,
    username,
    gender,
    city,
    country,
    height,
    weight,
    birthDate,
  }), [name, username, gender, city, country, height, weight, birthDate]);

  const handleSave = async () => {
    if (!user) return;
    try {
      setSaving(true);
      await autoSaveFlush(getFormSnapshot());
    } catch (error) {
      logger.error('Error saving profile:', error);
      if (error?.code === 'CONFLICT' && error?.field === 'username') {
        showToast('Ese usuario ya está tomado. Elige otro.', 'error');
      } else {
        showToast('Error al guardar el perfil. Intenta de nuevo.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // Instagram
  const feedId = userData?.instagramBeholdFeedId;

  const handleInstagramSave = async () => {
    if (!instagramInput.trim()) return;
    try {
      await apiClient.patch('/users/me', { instagramBeholdFeedId: instagramInput.trim() });
      await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.detail(user.uid) });
      showToast('Instagram conectado', 'success');
    } catch (error) {
      logger.error('Error saving Instagram feed ID:', error);
      showToast('No se pudo conectar Instagram', 'error');
    }
  };

  // Nav toggles
  const handleNavToggle = async (key, value) => {
    const next = { eventos: navEventos, disponibilidad: navDisponibilidad, [key]: value };
    if (key === 'eventos') setNavEventos(value);
    else setNavDisponibilidad(value);
    try {
      await userPreferencesService.setNavPreferences(next);
      showToast('Preferencias guardadas', 'success');
    } catch (error) {
      logger.error('Error saving nav preferences:', error);
      showToast('No se pudieron guardar las preferencias', 'error');
      if (key === 'eventos') setNavEventos(!value);
      else setNavDisponibilidad(!value);
    }
  };

  if (loading) {
    return (
      <DashboardLayout screenName="Perfil">
        <div className="profile-screen">
          <div className="profile-content">
            <div className="profile-card profile-card--loading">
              <GlowingEffect />
              <ShimmerSkeleton width="96px" height="96px" borderRadius="50%" />
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ShimmerSkeleton height="14px" width="55%" />
                <ShimmerSkeleton height="44px" />
                <ShimmerSkeleton height="44px" />
                <ShimmerSkeleton height="44px" width="75%" />
              </div>
            </div>
            <div className="profile-card profile-card--loading">
              <GlowingEffect />
              <ShimmerSkeleton height="14px" width="40%" />
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ShimmerSkeleton height="88px" />
              </div>
            </div>
            <div className="profile-card profile-card--loading">
              <GlowingEffect />
              <ShimmerSkeleton height="14px" width="35%" />
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ShimmerSkeleton height="44px" />
                <ShimmerSkeleton height="44px" />
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Perfil">
        <div className="profile-screen">
          <div className="profile-content">

            {/* ── Section 1: Foto de perfil ─────────────────── */}
            <div className="profile-card" style={{ animationDelay: '0ms' }}>
              <GlowingEffect />
              <p className="profile-card__label">Foto de perfil</p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              <div className="profile-photo-area">
                <div
                  className={`profile-drop-zone${isDraggingOver ? ' profile-drop-zone--over' : ''}${profilePicturePreview ? ' profile-drop-zone--has-image' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                >
                  {profilePicturePreview ? (
                    <>
                      <img src={profilePicturePreview} alt="Foto de perfil" className="profile-drop-zone__image" />
                      <div className="profile-drop-zone__overlay">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                        <span>Cambiar foto</span>
                      </div>
                    </>
                  ) : (
                    <div className="profile-drop-zone__empty">
                      <div className="profile-drop-zone__icon-wrap">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <p className="profile-drop-zone__title">Ponle cara a tu marca</p>
                      <p className="profile-drop-zone__hint">Arrastra una imagen o haz clic para seleccionar</p>
                    </div>
                  )}
                </div>

                {profilePicture && (
                  <div className="profile-photo-actions">
                    {isUploading ? (
                      <div className="profile-upload-progress">
                        <div className="profile-upload-progress__track">
                          <div className="profile-upload-progress__fill" style={{ width: `${Math.round(uploadProgress)}%` }} />
                        </div>
                        <span className="profile-upload-progress__label">Subiendo… {Math.round(uploadProgress)}%</span>
                      </div>
                    ) : (
                      <button className="profile-btn-primary" onClick={handleProfilePictureUpload} disabled={isUploading}>
                        Guardar foto
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 2: Identidad ──────────────────────── */}
            <div className="profile-card" style={{ animationDelay: '60ms' }}>
              <GlowingEffect />
              <div className="profile-card__header">
                <p className="profile-card__label">Identidad</p>
                {hasChanges() && (
                  <button className="profile-btn-ghost" onClick={handleCancel} disabled={saving}>
                    Cancelar
                  </button>
                )}
              </div>

              <div className="profile-fields">
                <div className="profile-field">
                  <label className="profile-field__label">Nombre</label>
                  <Input
                    placeholder="Nombre completo"
                    value={name}
                    onChange={(e) => { setName(e.target.value); autoSaveTrigger({ ...getFormSnapshot(), name: e.target.value }); }}
                  />
                </div>

                <div className="profile-field">
                  <label className="profile-field__label">Usuario</label>
                  <div className="profile-username-wrap">
                    <Input
                      placeholder="tu_usuario"
                      value={username}
                      onChange={(e) => { const v = e.target.value.toLowerCase(); setUsername(v); autoSaveTrigger({ ...getFormSnapshot(), username: v }); }}
                    />
                    {isCheckingUsername && <span className="profile-username-badge profile-username-badge--checking">Verificando…</span>}
                    {!isCheckingUsername && usernameAvailable === true && <span className="profile-username-badge profile-username-badge--ok">✓ Disponible</span>}
                    {!isCheckingUsername && usernameAvailable === false && <span className="profile-username-badge profile-username-badge--taken">✗ No disponible</span>}
                  </div>
                </div>

                <div className="profile-field">
                  <label className="profile-field__label">Correo electrónico</label>
                  <Input placeholder="Correo electrónico" value={email} onChange={() => {}} disabled />
                </div>

                <div className="profile-form-row">
                  <div className="profile-form-field">
                    <label className="profile-form-label">Género</label>
                    <select className="profile-form-select" value={gender} onChange={(e) => { setGender(e.target.value); autoSaveTrigger({ ...getFormSnapshot(), gender: e.target.value }); }}>
                      <option value="">Seleccionar</option>
                      <option value="male">Masculino</option>
                      <option value="female">Femenino</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                  <div className="profile-form-field">
                    <label className="profile-form-label">Fecha de nacimiento</label>
                    <input type="date" className="profile-date-input" value={birthDate} onChange={(e) => { setBirthDate(e.target.value); autoSaveTrigger({ ...getFormSnapshot(), birthDate: e.target.value }); }} />
                  </div>
                </div>

                <div className="profile-form-row">
                  <div className="profile-form-field">
                    <label className="profile-form-label">Altura (cm)</label>
                    <div className="profile-number-input-wrapper">
                      <Input type="number" placeholder="Altura" value={height} onChange={(e) => { setHeight(e.target.value); autoSaveTrigger({ ...getFormSnapshot(), height: e.target.value }); }} />
                      <div className="profile-number-spinner">
                        <button type="button" className="profile-spinner-button" onClick={() => { const v = String((parseFloat(height) || 0) + 1); setHeight(v); autoSaveTrigger({ ...getFormSnapshot(), height: v }); }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)"/></svg>
                        </button>
                        <button type="button" className="profile-spinner-button" onClick={() => { const v = String(Math.max(0, (parseFloat(height) || 0) - 1)); setHeight(v); autoSaveTrigger({ ...getFormSnapshot(), height: v }); }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="profile-form-field">
                    <label className="profile-form-label">Peso (kg)</label>
                    <div className="profile-number-input-wrapper">
                      <Input type="number" placeholder="Peso" value={weight} onChange={(e) => { setWeight(e.target.value); autoSaveTrigger({ ...getFormSnapshot(), weight: e.target.value }); }} />
                      <div className="profile-number-spinner">
                        <button type="button" className="profile-spinner-button" onClick={() => { const v = String((parseFloat(weight) || 0) + 1); setWeight(v); autoSaveTrigger({ ...getFormSnapshot(), weight: v }); }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 12 12)"/></svg>
                        </button>
                        <button type="button" className="profile-spinner-button" onClick={() => { const v = String(Math.max(0, (parseFloat(weight) || 0) - 1)); setWeight(v); autoSaveTrigger({ ...getFormSnapshot(), weight: v }); }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M19 9L12 16L5 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="profile-form-row">
                  <div className="profile-form-field">
                    <label className="profile-form-label">País</label>
                    <div className="profile-dropdown-container">
                      {!showCountryDropdown ? (
                        <div className="profile-dropdown-button" onClick={() => setShowCountryDropdown(true)}>
                          <span className={country ? 'profile-dropdown-text' : 'profile-dropdown-placeholder'}>{country ? getCountryLabel(country) : 'Selecciona tu país…'}</span>
                          <span className="profile-dropdown-chevron profile-dropdown-chevron-right">›</span>
                        </div>
                      ) : (
                        <div className="profile-dropdown-button profile-dropdown-active">
                          <input type="text" className="profile-dropdown-search" value={countrySearchQuery} onChange={(e) => setCountrySearchQuery(e.target.value)} placeholder="Buscar país…" autoFocus />
                          <span className="profile-dropdown-chevron profile-dropdown-chevron-down" onClick={() => { setShowCountryDropdown(false); setCountrySearchQuery(''); }}>›</span>
                        </div>
                      )}
                      {showCountryDropdown && (
                        <div className="profile-dropdown-list">
                          {getFilteredCountries.map((option) => (
                            <div key={option.value} className={`profile-dropdown-option${country === option.value ? ' profile-dropdown-option-selected' : ''}`} onClick={() => handleCountrySelect(option.value)}>{option.label}</div>
                          ))}
                          {getFilteredCountries.length === 0 && <div className="profile-dropdown-option">No se encontraron países</div>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="profile-form-field">
                    <label className="profile-form-label">Ciudad</label>
                    <div className="profile-dropdown-container">
                      {!showCityDropdown ? (
                        <div className={`profile-dropdown-button${!country ? ' profile-dropdown-disabled' : ''}`} onClick={() => country && setShowCityDropdown(true)}>
                          <span className={city ? 'profile-dropdown-text' : 'profile-dropdown-placeholder'}>{city || (!country ? 'Primero selecciona un país' : 'Selecciona tu ciudad…')}</span>
                          <span className="profile-dropdown-chevron profile-dropdown-chevron-right">›</span>
                        </div>
                      ) : (
                        <div className="profile-dropdown-button profile-dropdown-active">
                          <input type="text" className="profile-dropdown-search" value={citySearchQuery} onChange={(e) => setCitySearchQuery(e.target.value)} placeholder="Buscar ciudad…" autoFocus />
                          <span className="profile-dropdown-chevron profile-dropdown-chevron-down" onClick={() => { setShowCityDropdown(false); setCitySearchQuery(''); }}>›</span>
                        </div>
                      )}
                      {showCityDropdown && (
                        <div className="profile-dropdown-list">
                          {filteredCities.map((cityOption) => (
                            <div key={cityOption} className={`profile-dropdown-option${city === cityOption ? ' profile-dropdown-option-selected' : ''}`} onClick={() => handleCitySelect(cityOption)}>{cityOption}</div>
                          ))}
                          {filteredCities.length === 0 && <div className="profile-dropdown-option">No se encontraron ciudades</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {isAutoSaving && !hasChanges() && (
                  <p className="profile-autosave-indicator">Guardando…</p>
                )}
                {hasChanges() && (
                  <button className="profile-btn-primary profile-btn-primary--full" onClick={handleSave} disabled={saving || isAutoSaving}>
                    {saving || isAutoSaving ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Section 3: Instagram ──────────────────────── */}
            <div className="profile-card" style={{ animationDelay: '120ms' }}>
              <GlowingEffect />
              <p className="profile-card__label">Instagram</p>

              {feedId ? (
                <div className="profile-instagram-connected">
                  <div className="profile-instagram-id">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>
                    </svg>
                    <span className="profile-instagram-id__text">{feedId}</span>
                  </div>
                  <div className="profile-instagram-grid">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="profile-instagram-tile" />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="profile-instagram-setup">
                  <p className="profile-instagram-hint">
                    Conecta tu feed de Behold.so para mostrarlo en tu perfil público.
                  </p>
                  <div className="profile-instagram-input-row">
                    <input
                      className="profile-text-input"
                      placeholder="Feed ID de Behold.so"
                      value={instagramInput}
                      onChange={(e) => setInstagramInput(e.target.value)}
                    />
                    <button className="profile-btn-primary" onClick={handleInstagramSave} disabled={!instagramInput.trim()}>
                      Guardar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Section 4: Navegación ─────────────────────── */}
            <div className="profile-card" style={{ animationDelay: '180ms' }}>
              <GlowingEffect />
              <p className="profile-card__label">Navegación</p>
              <p className="profile-card__sub">Elige qué secciones aparecen en tu menú lateral.</p>

              <div className="profile-nav-toggles">
                <div className="profile-nav-toggle-row">
                  <div className="profile-nav-toggle-info">
                    <span className="profile-nav-toggle-name">Mostrar Eventos</span>
                    <span className="profile-nav-toggle-desc">Sección de eventos en el menú</span>
                  </div>
                  {navPrefsLoaded ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={navEventos}
                      className={`profile-toggle${navEventos ? ' profile-toggle--on' : ''}`}
                      onClick={() => handleNavToggle('eventos', !navEventos)}
                    >
                      <span className="profile-toggle__thumb" />
                    </button>
                  ) : (
                    <ShimmerSkeleton width="40px" height="22px" borderRadius="11px" />
                  )}
                </div>

                <div className="profile-nav-toggle-divider" />

                <div className="profile-nav-toggle-row">
                  <div className="profile-nav-toggle-info">
                    <span className="profile-nav-toggle-name">Mostrar Disponibilidad</span>
                    <span className="profile-nav-toggle-desc">Gestión de horarios en el menú</span>
                  </div>
                  {navPrefsLoaded ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={navDisponibilidad}
                      className={`profile-toggle${navDisponibilidad ? ' profile-toggle--on' : ''}`}
                      onClick={() => handleNavToggle('disponibilidad', !navDisponibilidad)}
                    >
                      <span className="profile-toggle__thumb" />
                    </button>
                  ) : (
                    <ShimmerSkeleton width="40px" height="22px" borderRadius="11px" />
                  )}
                </div>
              </div>
            </div>

            {/* ── Logout ────────────────────────────────────── */}
            <div className="profile-logout-section">
              <button className="profile-logout-button" onClick={handleSignOut}>
                Cerrar sesión
              </button>
            </div>

          </div>
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default ProfileScreen;
