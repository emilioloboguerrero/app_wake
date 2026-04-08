import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../utils/apiClient';
import { ASSET_BASE } from '../config/assets';
import logger from '../utils/logger';
import countries from '../data/countries.json';
import cities from '../data/cities.json';
import AuroraBackground from './onboarding/components/AuroraBackground';
import DatePicker from '../components/DatePicker';
import './CompleteProfileScreen.css';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
  { value: 'other', label: 'Otro' },
];

const ease = [0.22, 1, 0.36, 1];

const CompleteProfileScreen = () => {
  const navigate = useNavigate();
  const { user, refreshUserData, isCreator } = useAuth();

  const [username, setUsername] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const usernameTimerRef = useRef(null);
  const photoInputRef = useRef(null);

  useEffect(() => {
    if (isCreator) navigate('/onboarding', { replace: true });
  }, [isCreator, navigate]);

  useEffect(() => {
    if (user?.email && !username) {
      const prefix = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (prefix.length >= 3) {
        setUsername(prefix);
        checkUsername(prefix);
      }
    }
  }, [user]);

  const checkUsername = useCallback(async (value) => {
    const normalized = value.toLowerCase().trim();
    if (!normalized || normalized.length < 3) { setUsernameAvailable(null); return; }
    if (!/^[a-z0-9_-]+$/.test(normalized)) {
      setUsernameAvailable(null);
      setErrors(prev => ({ ...prev, username: 'Solo letras, numeros, guiones y guiones bajos' }));
      return;
    }
    setCheckingUsername(true);
    try {
      const { data } = await apiClient.get(`/creator/check-username/${normalized}`);
      setUsernameAvailable(data.available);
      if (!data.available) {
        setErrors(prev => ({ ...prev, username: 'Este username ya esta en uso' }));
      } else {
        setErrors(prev => { const n = { ...prev }; delete n.username; return n; });
      }
    } catch { setUsernameAvailable(null); }
    finally { setCheckingUsername(false); }
  }, []);

  const handleUsernameChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setUsername(val);
    setUsernameAvailable(null);
    setErrors(prev => { const n = { ...prev }; delete n.username; return n; });
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    if (val.length >= 3) {
      usernameTimerRef.current = setTimeout(() => checkUsername(val), 500);
    }
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErrors(prev => ({ ...prev, photo: 'Selecciona una imagen valida' })); return; }
    if (file.size > 5 * 1024 * 1024) { setErrors(prev => ({ ...prev, photo: 'La imagen no debe superar 5MB' })); return; }
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setErrors(prev => { const n = { ...prev }; delete n.photo; return n; });
  };

  const handleSubmit = async () => {
    setFormError(null);
    const errs = {};
    if (!username.trim() || username.length < 3) errs.username = 'Username debe tener al menos 3 caracteres';
    else if (!/^[a-z0-9_-]+$/.test(username)) errs.username = 'Solo letras, numeros, guiones y guiones bajos';
    else if (usernameAvailable === false) errs.username = 'Este username ya esta en uso';
    if (!birthDate) {
      errs.birthDate = 'Fecha de nacimiento es requerida';
    } else {
      const age = (Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 13) errs.birthDate = 'Debes tener al menos 13 anos';
    }
    if (!gender) errs.gender = 'Selecciona tu genero';
    if (!country) errs.country = 'Selecciona un pais';
    if (!city) errs.city = 'Selecciona una ciudad';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setIsLoading(true);
    try {
      await apiClient.post('/creator/register', {
        displayName: user?.displayName || username,
        username: username.toLowerCase(),
        birthDate,
        gender,
        country,
        city,
      });

      if (photo) {
        try {
          const { data: uploadData } = await apiClient.post('/creator/profile/upload-url', { contentType: photo.type });
          if (uploadData?.signedUrl) {
            await fetch(uploadData.signedUrl, { method: 'PUT', headers: { 'Content-Type': photo.type }, body: photo });
            await apiClient.post('/creator/profile/upload-url/confirm', { storagePath: uploadData.storagePath });
          }
        } catch (photoErr) {
          logger.error('[CompleteProfile] Photo upload failed (non-blocking):', photoErr);
        }
      }

      await refreshUserData();
      navigate('/onboarding', { replace: true });
    } catch (error) {
      setIsLoading(false);
      if (error.code === 'CONFLICT') {
        setErrors({ username: 'Este username ya esta en uso' });
      } else {
        logger.error('[CompleteProfile] Error:', error);
        setFormError(error.message || 'Algo salio mal. Intenta de nuevo');
      }
    }
  };

  const filteredCities = country ? (cities[country] || []) : [];
  const clearField = (field) => setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });

  return (
    <div className="cp-root">
      <AuroraBackground />
      <div className="cp-grid" />

      {/* Left — branding */}
      <div className="cp-left">
        <motion.div
          className="cp-left-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.15 }}
        >
          <img
            src={`${ASSET_BASE}wake-logo-new.png`}
            alt="Wake"
            className="cp-logo"
          />
          <h1 className="cp-headline">Cuentanos sobre ti</h1>
        </motion.div>
      </div>

      {/* Right — form */}
      <motion.div
        className="cp-right"
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease, delay: 0.25 }}
      >
        <div className="cp-form-scroll">
          {/* Error */}
          <AnimatePresence>
            {formError && (
              <motion.div
                className="cp-error"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                {formError}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Photo — centered at top */}
          <motion.div
            className="cp-photo-section"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease, delay: 0.3 }}
          >
            <div className="cp-photo-ring" onClick={() => photoInputRef.current?.click()}>
              {photoPreview ? (
                <img src={photoPreview} alt="" className="cp-photo-img" />
              ) : (
                <div className="cp-photo-empty">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
                  </svg>
                </div>
              )}
              <div className="cp-photo-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoSelect} />
            </div>
            <span className="cp-photo-label">Foto de perfil</span>
            {errors.photo && <span className="cp-inline-error">{errors.photo}</span>}
          </motion.div>

          {/* Fields grid */}
          <div className="cp-fields">
            {/* Username */}
            <motion.div className="cp-field cp-field--full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.35 }}>
              <label className="cp-label">Username</label>
              <div className={`cp-input-wrap${errors.username ? ' cp-input-wrap--error' : usernameAvailable === true ? ' cp-input-wrap--ok' : ''}`}>
                <input className="cp-input" type="text" placeholder="tu_username" value={username} onChange={handleUsernameChange} disabled={isLoading} autoComplete="off" />
              </div>
              {checkingUsername && <span className="cp-status">verificando...</span>}
              {!checkingUsername && usernameAvailable === true && <span className="cp-status cp-status--ok">disponible</span>}
              {errors.username && <span className="cp-inline-error">{errors.username}</span>}
            </motion.div>

            {/* Birth date */}
            <motion.div className="cp-field" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.4 }}>
              <label className="cp-label">Fecha de nacimiento</label>
              <DatePicker
                value={birthDate}
                onChange={(e) => { setBirthDate(e.target.value); clearField('birthDate'); }}
                error={errors.birthDate}
                disabled={isLoading}
                placeholder="dd/mm/aa"
              />
            </motion.div>

            {/* Gender */}
            <motion.div className="cp-field" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.4 }}>
              <label className="cp-label">Genero</label>
              <div className="cp-pills">
                {GENDER_OPTIONS.map((g) => (
                  <button key={g.value} type="button" className={`cp-pill${gender === g.value ? ' cp-pill--active' : ''}`} onClick={() => { setGender(g.value); clearField('gender'); }} disabled={isLoading}>
                    {g.label}
                  </button>
                ))}
              </div>
              {errors.gender && <span className="cp-inline-error">{errors.gender}</span>}
            </motion.div>

            {/* Country */}
            <motion.div className="cp-field" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.45 }}>
              <label className="cp-label">Pais</label>
              <div className={`cp-input-wrap${errors.country ? ' cp-input-wrap--error' : ''}`}>
                <select className="cp-input cp-select" value={country} onChange={(e) => { setCountry(e.target.value); setCity(''); clearField('country'); clearField('city'); }} disabled={isLoading}>
                  <option value="">Selecciona</option>
                  {countries.map((c) => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
                </select>
              </div>
              {errors.country && <span className="cp-inline-error">{errors.country}</span>}
            </motion.div>

            {/* City */}
            <motion.div className="cp-field" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.45 }}>
              <label className="cp-label">Ciudad</label>
              <div className={`cp-input-wrap${errors.city ? ' cp-input-wrap--error' : ''}`}>
                <select className="cp-input cp-select" value={city} onChange={(e) => { setCity(e.target.value); clearField('city'); }} disabled={isLoading || !country}>
                  <option value="">{country ? 'Selecciona' : 'Pais primero'}</option>
                  {filteredCities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {errors.city && <span className="cp-inline-error">{errors.city}</span>}
            </motion.div>

          </div>

          {/* CTA */}
          <motion.button
            className="cp-cta"
            onClick={handleSubmit}
            disabled={isLoading}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease, delay: 0.55 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            {isLoading ? <span className="cp-spinner" /> : 'Continuar'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default CompleteProfileScreen;
