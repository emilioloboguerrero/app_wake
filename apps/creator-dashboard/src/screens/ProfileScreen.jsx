import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import ErrorBoundary from '../components/ErrorBoundary';
import Input from '../components/Input';
import { GlowingEffect, ShimmerSkeleton } from '../components/ui';
import ContextualHint from '../components/hints/ContextualHint';
import { InlineError, FullScreenError } from '../components/ui/ErrorStates';
import { queryKeys, cacheConfig } from '../config/queryClient';
import authService from '../services/authService';
import apiClient from '../utils/apiClient';
import useAutoSave from '../hooks/useAutoSave';
import { useToast } from '../contexts/ToastContext';
import { GetCountries, GetState, GetCity } from 'react-country-state-city';
import logger from '../utils/logger';
import InstagramCarousel from '../components/creator/InstagramCarousel';
import MediaPickerModal from '../components/MediaPickerModal';
import './ProfileScreen.css';

const useDebouncedValue = (value, delay) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};

const ProfileScreen = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClientHook = useQueryClient();
  const { showToast } = useToast();

  const { data: userData, isLoading: loading, isError: profileError, refetch: refetchProfile } = useQuery({
    queryKey: queryKeys.user.detail(user?.uid),
    queryFn: () => apiClient.get('/users/me').then((r) => r.data),
    enabled: !!user?.uid,
    ...cacheConfig.userProfile,
  });

  // ── Form state ──
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');

  // Photo
  const [profilePicturePreview, setProfilePicturePreview] = useState(null);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);

  // Instagram
  const [instagramInput, setInstagramInput] = useState('');

  // Nav preferences
  const [navEventos, setNavEventos] = useState(true);
  const [navDisponibilidad, setNavDisponibilidad] = useState(true);

  // Dropdowns
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [citySearchQuery, setCitySearchQuery] = useState('');

  // Link copy feedback
  const [linkCopied, setLinkCopied] = useState(false);

  const [originalValues, setOriginalValues] = useState(null);

  // ── Countries & cities ──
  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const allCountries = (await GetCountries()) || [];
      return allCountries
        .map((c) => ({ value: c.iso2, label: c.name, name: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    staleTime: Infinity,
  });

  const { data: citiesList = [] } = useQuery({
    queryKey: ['cities', country],
    queryFn: async () => {
      const allCountries = (await GetCountries()) || [];
      const countryObj = allCountries.find((c) => c.iso2 === country);
      if (!countryObj) return [];
      const states = (await GetState(countryObj.id)) || [];
      if (states.length > 0) {
        const cityArrays = await Promise.all(
          states.map((state) => GetCity(countryObj.id, state.id).catch(() => []))
        );
        return cityArrays.flat();
      }
      try { return (await GetCity(countryObj.id, 0)) || []; }
      catch { return []; }
    },
    enabled: !!country,
    staleTime: Infinity,
  });

  // Username availability
  const debouncedUsername = useDebouncedValue(username, 600);
  const savedUsername = originalValues?.username ?? '';
  const shouldCheckUsername = !!debouncedUsername && debouncedUsername.length >= 3 && debouncedUsername !== savedUsername;

  const { data: usernameCheckData, isFetching: isCheckingUsername } = useQuery({
    queryKey: ['username-check', debouncedUsername],
    queryFn: () => apiClient.get(`/creator/username-check?username=${encodeURIComponent(debouncedUsername)}`),
    enabled: shouldCheckUsername,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  const usernameAvailable = shouldCheckUsername ? (usernameCheckData?.data?.available ?? null) : null;

  // Nav prefs from profile
  useEffect(() => {
    if (!userData) return;
    const prefs = userData.creatorNavPreferences;
    setNavEventos(prefs?.eventos !== false);
    setNavDisponibilidad(prefs?.disponibilidad !== false);
  }, [userData]);

  // Sync form on data load
  useEffect(() => {
    if (!user || !userData) return;
    const d = userData;

    const vals = {
      name: d.displayName || user.displayName || '',
      username: d.username || '',
      country: d.country || '',
      city: d.city || '',
      profilePictureUrl: d.profilePictureUrl || null,
    };

    setName(vals.name);
    setUsername(vals.username);
    setCountry(vals.country);
    setCity(vals.city);
    setOriginalValues(vals);

    if (d.profilePictureUrl) setProfilePicturePreview(d.profilePictureUrl);
  }, [userData, user]);

  // ── Filtered dropdowns ──
  const filteredCountries = useMemo(() => {
    if (!countrySearchQuery.trim()) return countries;
    const q = countrySearchQuery.toLowerCase();
    return countries.filter((c) => c.label.toLowerCase().includes(q));
  }, [countries, countrySearchQuery]);

  const filteredCities = useMemo(() => {
    if (!country || citiesList.length === 0) return [];
    const q = citySearchQuery.toLowerCase();
    if (!q) return citiesList.slice(0, 100).map((c) => c.name);
    return citiesList.filter((c) => c.name.toLowerCase().includes(q)).map((c) => c.name).slice(0, 50);
  }, [citiesList, country, citySearchQuery]);

  const getCountryLabel = (value) => {
    if (!value) return '';
    const c = countries.find((c) => c.value === value);
    return c ? c.label : value;
  };

  // ── Auto-save ──
  const getFormSnapshot = useCallback(() => ({
    name, username, country, city,
  }), [name, username, country, city]);

  const saveProfile = useCallback(async (snapshot) => {
    if (!user) return;
    const updateData = {};

    if (snapshot.name.trim() !== (userData?.displayName || '')) updateData.displayName = snapshot.name.trim();
    const newUsername = snapshot.username.trim().toLowerCase();
    if (newUsername !== (userData?.username || '')) {
      if (usernameAvailable === false || isCheckingUsername) return;
      updateData.username = newUsername;
    }
    if (snapshot.country.trim() !== (userData?.country || '')) updateData.country = snapshot.country.trim();
    if (snapshot.city.trim() !== (userData?.city || '')) updateData.city = snapshot.city.trim();

    if (Object.keys(updateData).length === 0) return;
    await apiClient.patch('/users/me', updateData);
    await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.detail(user.uid) });
  }, [user, userData, queryClientHook, usernameAvailable, isCheckingUsername]);

  const { trigger: autoSaveTrigger, isSaving: isAutoSaving } = useAutoSave(
    saveProfile,
    { delay: 800, successMessage: 'Cambios guardados', errorMessage: 'No pudimos guardar los cambios.' }
  );

  // ── Handlers ──
  const handleMediaPickerSelect = async (item) => {
    setIsMediaPickerOpen(false);
    if (!item?.url || !user) return;
    try {
      setSavingPhoto(true);
      setProfilePicturePreview(item.url);
      await apiClient.patch('/users/me', { profilePictureUrl: item.url });
      await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.detail(user.uid) });
      if (originalValues) setOriginalValues({ ...originalValues, profilePictureUrl: item.url });
      showToast('Foto actualizada', 'success');
    } catch (error) {
      logger.error('Error updating profile picture:', error);
      setProfilePicturePreview(originalValues?.profilePictureUrl || null);
      showToast('No pudimos actualizar la foto.', 'error');
    } finally {
      setSavingPhoto(false);
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

  const handleCopyLink = async () => {
    const link = `wake.co/${username || 'tu_usuario'}`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      showToast('No se pudo copiar el link', 'error');
    }
  };

  const handleNavToggle = async (key, value) => {
    const next = { eventos: navEventos, disponibilidad: navDisponibilidad, [key]: value };
    if (key === 'eventos') setNavEventos(value);
    else setNavDisponibilidad(value);
    try {
      await apiClient.patch('/users/me', { creatorNavPreferences: next });
      await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.detail(user.uid) });
      showToast('Preferencias guardadas', 'success');
    } catch (error) {
      logger.error('Error saving nav preferences:', error);
      showToast('No se pudieron guardar las preferencias', 'error');
      if (key === 'eventos') setNavEventos(!value);
      else setNavDisponibilidad(!value);
    }
  };

  const handleInstagramSave = async () => {
    if (!instagramInput.trim()) return;
    try {
      await apiClient.patch('/users/me', { beholdFeedId: instagramInput.trim() });
      await queryClientHook.invalidateQueries({ queryKey: queryKeys.user.detail(user.uid) });
      showToast('Instagram conectado', 'success');
    } catch (error) {
      logger.error('Error saving Instagram feed ID:', error);
      showToast('No se pudo conectar Instagram', 'error');
    }
  };

  const handleSignOut = async () => {
    try {
      await authService.signOutUser();
      navigate('/login');
    } catch (error) {
      logger.error('Error signing out:', error);
      showToast('Error al cerrar sesion. Intenta de nuevo.', 'error');
    }
  };

  const feedId = userData?.beholdFeedId;
  const navPrefsLoaded = !!userData;
  const publicLink = `wake.co/${username || 'tu_usuario'}`;

  // ── Loading ──
  if (loading) {
    return (
      <DashboardLayout screenName="Perfil">
        <div className="profile-screen">
          <div className="profile-content">
            <div className="profile-card profile-card--identity profile-card--loading">
              <GlowingEffect />
              <ShimmerSkeleton height="12px" width="35%" />
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <ShimmerSkeleton width="72px" height="72px" borderRadius="50%" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <ShimmerSkeleton height="44px" />
                  </div>
                </div>
                <ShimmerSkeleton height="44px" />
              </div>
            </div>
            <div className="profile-card profile-card--location profile-card--loading">
              <GlowingEffect />
              <ShimmerSkeleton height="12px" width="45%" />
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ShimmerSkeleton height="44px" />
                <ShimmerSkeleton height="44px" />
              </div>
            </div>
            <div className="profile-card profile-card--prefs profile-card--loading">
              <GlowingEffect />
              <ShimmerSkeleton height="12px" width="35%" />
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ShimmerSkeleton height="36px" />
                <ShimmerSkeleton height="36px" />
              </div>
            </div>
            <div className="profile-card profile-card--account profile-card--loading">
              <GlowingEffect />
              <ShimmerSkeleton height="12px" width="30%" />
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ShimmerSkeleton height="44px" />
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (profileError) {
    return (
      <DashboardLayout screenName="Perfil">
        <div className="profile-screen">
          <FullScreenError
            title="No pudimos cargar tu perfil"
            message="Revisa tu conexion e intenta de nuevo."
            onRetry={refetchProfile}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <ErrorBoundary>
      <DashboardLayout screenName="Perfil">
        <div className="profile-screen">
          <div className="profile-content">

            {/* ── 1. Identidad publica ── */}
            <div className="profile-card profile-card--identity" style={{ animationDelay: '0ms' }}>
              <GlowingEffect />
              <p className="profile-card__label">Identidad publica</p>

              <div className="profile-fields">
                {/* Photo + name row */}
                <div className="profile-identity-row" data-tutorial="profile-photo">
                  <div
                    className="profile-avatar"
                    onClick={() => setIsMediaPickerOpen(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsMediaPickerOpen(true); }}
                  >
                    {profilePicturePreview ? (
                      <img src={profilePicturePreview} alt="" className="profile-avatar__img" />
                    ) : (
                      <div className="profile-avatar__placeholder">
                        {(name || 'C').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="profile-avatar__hover">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                    </div>
                    {savingPhoto && <div className="profile-avatar__saving" />}
                  </div>
                  <div className="profile-identity-info">
                    <div className="profile-field">
                      <label className="profile-field__label">Nombre</label>
                      <Input
                        placeholder="Tu nombre completo"
                        value={name}
                        onChange={(e) => { setName(e.target.value); autoSaveTrigger({ ...getFormSnapshot(), name: e.target.value }); }}
                      />
                    </div>
                  </div>
                </div>

                {/* Username + link */}
                <div className="profile-field" data-tutorial="profile-link">
                  <label className="profile-field__label">Usuario</label>
                  <div className="profile-username-wrap">
                    <Input
                      placeholder="tu_usuario"
                      value={username}
                      onChange={(e) => { const v = e.target.value.toLowerCase(); setUsername(v); autoSaveTrigger({ ...getFormSnapshot(), username: v }); }}
                    />
                    {isCheckingUsername && <span className="profile-username-badge profile-username-badge--checking">Verificando...</span>}
                    {!isCheckingUsername && usernameAvailable === true && <span className="profile-username-badge profile-username-badge--ok">Disponible</span>}
                  </div>
                  {!isCheckingUsername && usernameAvailable === false && (
                    <InlineError message="Ese nombre de usuario ya esta en uso." field="username" />
                  )}
                  <div className="profile-link-row">
                    <span className="profile-link-row__url">{publicLink}</span>
                    <button
                      className={`profile-link-row__copy${linkCopied ? ' profile-link-row__copy--done' : ''}`}
                      onClick={handleCopyLink}
                      type="button"
                    >
                      {linkCopied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 2. Ubicacion + Redes ── */}
            <div className="profile-card profile-card--location" style={{ animationDelay: '60ms' }}>
              <GlowingEffect />
              <p className="profile-card__label">Ubicacion y redes</p>

              <div className="profile-fields">
                <div className="profile-form-row">
                  <div className="profile-form-field">
                    <label className="profile-form-label">Pais</label>
                    <div className="profile-dropdown-container">
                      {!showCountryDropdown ? (
                        <div className="profile-dropdown-button" onClick={() => setShowCountryDropdown(true)}>
                          <span className={country ? 'profile-dropdown-text' : 'profile-dropdown-placeholder'}>{country ? getCountryLabel(country) : 'Selecciona...'}</span>
                          <span className="profile-dropdown-chevron">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                          </span>
                        </div>
                      ) : (
                        <div className="profile-dropdown-button profile-dropdown-active">
                          <input type="text" className="profile-dropdown-search" value={countrySearchQuery} onChange={(e) => setCountrySearchQuery(e.target.value)} placeholder="Buscar pais..." autoFocus />
                          <span className="profile-dropdown-chevron" onClick={() => { setShowCountryDropdown(false); setCountrySearchQuery(''); }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
                          </span>
                        </div>
                      )}
                      {showCountryDropdown && (
                        <div className="profile-dropdown-list">
                          {filteredCountries.map((option) => (
                            <div key={option.value} className={`profile-dropdown-option${country === option.value ? ' profile-dropdown-option-selected' : ''}`} onClick={() => handleCountrySelect(option.value)}>{option.label}</div>
                          ))}
                          {filteredCountries.length === 0 && <div className="profile-dropdown-option profile-dropdown-option--empty">No se encontraron paises</div>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="profile-form-field">
                    <label className="profile-form-label">Ciudad</label>
                    <div className="profile-dropdown-container">
                      {!showCityDropdown ? (
                        <div className={`profile-dropdown-button${!country ? ' profile-dropdown-disabled' : ''}`} onClick={() => country && setShowCityDropdown(true)}>
                          <span className={city ? 'profile-dropdown-text' : 'profile-dropdown-placeholder'}>{city || (!country ? 'Primero selecciona un pais' : 'Selecciona...')}</span>
                          <span className="profile-dropdown-chevron">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                          </span>
                        </div>
                      ) : (
                        <div className="profile-dropdown-button profile-dropdown-active">
                          <input type="text" className="profile-dropdown-search" value={citySearchQuery} onChange={(e) => setCitySearchQuery(e.target.value)} placeholder="Buscar ciudad..." autoFocus />
                          <span className="profile-dropdown-chevron" onClick={() => { setShowCityDropdown(false); setCitySearchQuery(''); }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
                          </span>
                        </div>
                      )}
                      {showCityDropdown && (
                        <div className="profile-dropdown-list">
                          {filteredCities.map((cityOption) => (
                            <div key={cityOption} className={`profile-dropdown-option${city === cityOption ? ' profile-dropdown-option-selected' : ''}`} onClick={() => handleCitySelect(cityOption)}>{cityOption}</div>
                          ))}
                          {filteredCities.length === 0 && <div className="profile-dropdown-option profile-dropdown-option--empty">No se encontraron ciudades</div>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="profile-field">
                  <label className="profile-field__label">Instagram</label>
                  {feedId ? (
                    <div className="profile-instagram-connected">
                      <div className="profile-instagram-id">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                          <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.5"/>
                          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5"/>
                          <circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>
                        </svg>
                        <span className="profile-instagram-id__text">Conectado</span>
                      </div>
                      <InstagramCarousel feedId={feedId} />
                    </div>
                  ) : (
                    <div className="profile-instagram-setup">
                      <p className="profile-instagram-hint">
                        Conecta tu Instagram para mostrar tu feed en tu perfil publico.
                      </p>
                      <div className="profile-instagram-input-row">
                        <input
                          className="profile-text-input"
                          placeholder="Feed ID de Behold.so"
                          value={instagramInput}
                          onChange={(e) => setInstagramInput(e.target.value)}
                        />
                        <button className="profile-btn-sm" onClick={handleInstagramSave} disabled={!instagramInput.trim()}>
                          Conectar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 4. Preferencias ── */}
            <div className="profile-card profile-card--prefs" style={{ animationDelay: '180ms' }} data-tutorial="profile-nav">
              <GlowingEffect />
              <p className="profile-card__label">Preferencias</p>
              <p className="profile-card__sub">Escoge que secciones quieres ver en tu menu.</p>

              <div className="profile-nav-toggles">
                <div className="profile-nav-toggle-row">
                  <div className="profile-nav-toggle-info">
                    <span className="profile-nav-toggle-name">Eventos</span>
                    <span className="profile-nav-toggle-desc">Seccion de eventos en el menu</span>
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
                    <span className="profile-nav-toggle-name">Disponibilidad</span>
                    <span className="profile-nav-toggle-desc">Gestion de horarios en el menu</span>
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

            {/* ── 5. Cuenta ── */}
            <div className="profile-card profile-card--account" style={{ animationDelay: '240ms' }}>
              <GlowingEffect />
              <p className="profile-card__label">Cuenta</p>

              <div className="profile-fields">
                <div className="profile-field">
                  <label className="profile-field__label">Correo electronico</label>
                  <Input placeholder="Correo" value={user?.email || ''} onChange={() => {}} disabled />
                </div>

                <button className="profile-logout-button" onClick={handleSignOut}>
                  Cerrar sesion
                </button>

                <button
                  className="profile-delete-account-button"
                  onClick={() => {
                    const subject = encodeURIComponent('Solicitud de eliminación de cuenta');
                    const body = encodeURIComponent(`Hola,\n\nQuiero solicitar la eliminación de mi cuenta de Wake.\n\nCorreo: ${user?.email || ''}\nID: ${user?.uid || ''}\n\nEntiendo que esta acción es permanente e irreversible.`);
                    window.open(`mailto:emilioloboguerrero@gmail.com?subject=${subject}&body=${body}`, '_blank');
                  }}
                >
                  Solicitar eliminación de cuenta
                </button>
              </div>
            </div>

          </div>
          {isAutoSaving && (
            <p className="profile-autosave-indicator">Guardando...</p>
          )}
        </div>
        <ContextualHint screenKey="profile" />
        <MediaPickerModal
          isOpen={isMediaPickerOpen}
          onClose={() => setIsMediaPickerOpen(false)}
          onSelect={handleMediaPickerSelect}
          accept="image/*"
        />
      </DashboardLayout>
    </ErrorBoundary>
  );
};

export default ProfileScreen;
