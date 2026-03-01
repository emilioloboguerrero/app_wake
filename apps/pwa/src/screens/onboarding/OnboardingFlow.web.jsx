import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Animated,
  useWindowDimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateProfile } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { auth } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import hybridDataService from '../../services/hybridDataService';
import profilePictureService from '../../services/profilePictureService';
import webStorageService from '../../services/webStorageService';
import logger from '../../utils/logger';
import { validateUsername as validateUsernameFormat } from '../../utils/inputValidation';
import _countriesRaw from '../../../assets/data/countries.json';
import citiesBundle from '../../../assets/data/cities.json';
import SvgStar from '../../components/icons/vectors_fig/Interface/Star';
import SvgBodyPartMuscleStrokeRounded from '../../components/icons/SvgBodyPartMuscleStrokeRounded';
import SvgFire from '../../components/icons/vectors_fig/Environment/Fire';
import SvgHeart01 from '../../components/icons/vectors_fig/Interface/Heart01';
import SvgChampion from '../../components/icons/SvgChampion';
import SvgCamera from '../../components/icons/vectors_fig/System/Camera';
import Svg, { G, Path } from 'react-native-svg';

// Logotipo WAKE (positivo) — vectors only from Logotipo-WAKE-_positivo_.svg
const LOGOTIPO_PATH_1 = 'M20306 27933 c-110 -37 -192 -147 -372 -498 -187 -365 -4626 -9726 -4666 -9840 -32 -89 -38 -121 -35 -167 4 -70 40 -121 106 -152 43 -19 62 -21 261 -20 228 0 302 9 510 60 288 71 470 185 662 414 90 107 349 491 458 680 101 175 132 238 268 555 274 639 859 1903 2279 4925 283 602 524 1103 535 1113 29 25 91 22 121 -5 15 -14 562 -1184 1412 -3018 763 -1647 1405 -3030 1427 -3073 51 -102 190 -331 296 -487 236 -347 590 -747 788 -889 149 -107 368 -201 589 -252 63 -14 140 -22 257 -26 150 -5 173 -3 236 16 82 25 125 62 144 122 16 54 0 132 -56 269 -51 126 -4615 9642 -4723 9850 -114 217 -172 310 -224 361 -77 75 -169 96 -273 62z';
const LOGOTIPO_PATH_2 = 'M1318 27780 c-129 -20 -208 -80 -248 -187 -25 -67 -25 -129 -1 -224 16 -60 3643 -9405 3797 -9782 127 -312 224 -456 343 -510 68 -32 188 -31 256 2 100 49 177 151 265 348 60 135 -61 -193 1250 3403 617 1691 1128 3085 1136 3098 31 48 111 53 151 9 13 -13 466 -1241 1133 -3072 612 -1677 1132 -3102 1157 -3165 64 -165 175 -392 227 -464 109 -153 234 -211 368 -172 67 19 141 81 200 169 47 70 135 251 201 417 228 573 3759 9671 3772 9720 27 100 24 185 -8 246 -53 103 -122 138 -267 137 -229 -3 -609 -146 -875 -331 -331 -229 -630 -576 -812 -942 -45 -90 -364 -933 -1148 -3035 -597 -1600 -1091 -2921 -1097 -2933 -14 -27 -57 -52 -88 -52 -31 0 -76 29 -89 57 -6 13 -506 1413 -1112 3111 -605 1698 -1120 3135 -1144 3193 -60 147 -139 302 -190 375 -100 141 -256 189 -402 124 -118 -52 -226 -217 -362 -555 -22 -55 -538 -1488 -1146 -3185 -609 -1697 -1113 -3097 -1121 -3112 -42 -80 -143 -57 -195 45 -82 159 -717 1870 -1840 4950 -192 527 -365 989 -384 1027 -190 376 -566 849 -818 1027 -259 182 -667 300 -909 263z';
const LOGOTIPO_PATH_3 = 'M37820 27756 c-133 -38 -214 -111 -260 -232 l-20 -55 0 -4923 -1 -4924 24 -65 c63 -172 189 -285 372 -332 148 -38 261 -40 2425 -38 2452 2 3297 11 3350 35 187 86 169 380 -41 678 -67 96 -222 248 -327 323 -176 126 -415 226 -627 262 -92 16 -246 17 -1861 15 -1178 0 -1769 2 -1787 9 -15 6 -36 25 -47 43 -20 33 -20 52 -20 1845 0 1105 4 1821 9 1836 6 14 20 35 32 46 l23 21 1122 0 c716 0 1159 4 1225 11 205 20 383 71 554 156 396 198 578 457 579 823 1 126 -12 170 -62 208 l-35 27 -1686 5 c-1378 4 -1690 7 -1709 18 -54 31 -52 -28 -52 1450 0 950 3 1378 11 1400 23 67 -142 62 1981 62 1272 0 1952 4 2008 10 367 45 699 276 860 598 58 116 81 213 87 367 9 216 -22 299 -121 324 -70 17 -5945 14 -6006 -3z';
const LOGOTIPO_PATH_4 = 'M27721 27729 c-60 -12 -127 -46 -151 -76 -11 -14 -28 -49 -38 -77 -16 -48 -17 -321 -20 -5041 -2 -3429 1 -5011 8 -5058 17 -111 55 -168 135 -204 37 -16 86 -18 580 -21 483 -3 547 -1 604 14 85 23 132 68 157 149 18 58 19 223 19 5070 0 4882 0 5012 -19 5079 -22 81 -60 124 -133 152 -44 17 -89 19 -573 20 -289 1 -545 -2 -569 -7z';
const LOGOTIPO_PATH_5 = 'M34735 27733 c-619 -43 -1207 -293 -1654 -706 -46 -43 -293 -333 -606 -712 -1784 -2159 -2662 -3209 -2907 -3472 -99 -107 -129 -153 -153 -237 -33 -113 0 -238 88 -333 24 -26 797 -956 1717 -2066 1175 -1419 1710 -2057 1799 -2146 200 -202 426 -386 667 -544 396 -260 821 -348 1349 -282 66 8 145 18 177 21 31 3 75 15 99 27 114 58 114 160 0 312 -21 28 -966 1148 -2099 2490 -2034 2406 -2062 2440 -2062 2482 0 38 8 51 88 146 48 58 962 1138 2032 2401 1070 1263 1958 2318 1973 2345 78 137 24 242 -138 270 -57 10 -252 12 -370 4z';

const CompletionLogo = ({ width = 480, height = 312 }) => (
  <Svg width={width} height={height} viewBox="0 0 4500 4500" preserveAspectRatio="xMidYMid meet">
    <G transform="translate(0,4500) scale(0.1,-0.1)" fill="#ffffff" stroke="none">
      <Path d={LOGOTIPO_PATH_1} />
      <Path d={LOGOTIPO_PATH_2} />
      <Path d={LOGOTIPO_PATH_3} />
      <Path d={LOGOTIPO_PATH_4} />
      <Path d={LOGOTIPO_PATH_5} />
    </G>
  </Svg>
);

const countriesList = (_countriesRaw || []).map(c => ({ label: c.name, value: c.iso2 }));

const firestore = getFirestore();
const TOTAL_STEPS = 12;

// SVG winding path — coordinate space 390×900
const PATH_D =
  'M 70,0 C 70,85 295,110 265,215 C 235,320 38,355 60,455 C 82,555 305,585 272,680 C 239,775 42,810 68,875 C 82,920 185,910 185,910';

// Ease approximation for tip animation (material standard curve)
const easeStandard = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ─── Date helpers ────────────────────────────────────────────────────────────
const calculateAge = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  const m = today.getMonth() + 1 - month;
  if (m < 0 || (m === 0 && today.getDate() < day)) age--;
  return age;
};

const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${day} ${months[month - 1]} ${year}`;
};

// Max birth date = 13 years ago; min = 120 years ago
const today = new Date();
const maxBirthDate = `${today.getFullYear() - 13}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const minBirthDate = `${today.getFullYear() - 120}-01-01`;

// ─── Question data ────────────────────────────────────────────────────────────
const ICON_COLOR = 'rgba(255,255,255,0.9)';
const Q1_OPTIONS = [
  { id: 'fat_loss', label: 'Perder grasa corporal', Icon: SvgStar },
  { id: 'muscle', label: 'Ganar músculo y fuerza', Icon: SvgBodyPartMuscleStrokeRounded },
  { id: 'performance', label: 'Mejorar mi rendimiento deportivo', Icon: SvgFire },
  { id: 'health', label: 'Sentirme más saludable y con más energía', Icon: SvgHeart01 },
  { id: 'event', label: 'Prepararme para un evento o competencia', Icon: SvgChampion },
];

const Q2_OPTIONS = [
  { id: 'beginner', label: 'Nunca he entrenado / estoy empezando' },
  { id: 'less_1yr', label: 'Menos de 1 año' },
  { id: '1_3yrs', label: '1 a 3 años' },
  { id: 'over_3yrs', label: 'Más de 3 años' },
];

const Q3_DAYS = [2, 3, 4, 5, '6+'];
const Q3_DURATIONS = [
  { id: 'under_45', label: 'Menos de 45 min' },
  { id: '45_60', label: '45–60 min' },
  { id: '60_90', label: '60–90 min' },
  { id: 'over_90', label: 'Más de 90 min' },
];

const Q4_OPTIONS = [
  { id: 'full_gym', label: 'Gimnasio completo', sub: 'Máquinas, pesas libres, todo disponible' },
  { id: 'home_gym', label: 'Gimnasio en casa', sub: 'Mancuernas, barra, rack' },
  { id: 'bodyweight', label: 'Peso corporal / básico', sub: 'Sin equipamiento o muy poco' },
  { id: 'mixed', label: 'Varía según el día', sub: 'A veces gimnasio, a veces casa' },
];

const Q5_OPTIONS = [
  { id: 'cut', label: 'Definirme', sub: 'Déficit calórico, bajar grasa' },
  { id: 'bulk', label: 'Ganar masa muscular', sub: 'Superávit calórico, ganar peso' },
  { id: 'maintain', label: 'Mantener mi peso actual', sub: 'Sin cambios de composición' },
  { id: 'energy', label: 'Mejorar energía y recuperación', sub: 'Comer mejor, rendir más' },
  { id: 'unsure', label: 'No tengo claro todavía', sub: 'Quiero aprender sobre nutrición' },
];

const Q6_OPTIONS = [
  { id: 'none', label: 'Ninguna en particular' },
  { id: 'veg', label: 'Vegetariano/a' },
  { id: 'vegan', label: 'Vegano/a' },
  { id: 'gluten', label: 'Sin gluten' },
  { id: 'lactose', label: 'Sin lácteos' },
  { id: 'other', label: 'Otra intolerancia' },
];

const Q7_SLEEP = [
  { id: 'under_6', label: '< 6h' },
  { id: '6_7', label: '6–7h' },
  { id: '7_8', label: '7–8h' },
  { id: 'over_8', label: '+8h' },
];
const Q7_STRESS = [
  { id: 'low', label: 'Bajo', sub: 'Mucho tiempo y energía disponibles' },
  { id: 'medium', label: 'Moderado', sub: 'Cargas normales de trabajo o estudio' },
  { id: 'high', label: 'Alto', sub: 'Mucha responsabilidad, poco tiempo' },
  { id: 'very_high', label: 'Muy alto', sub: 'Agotado la mayoría de los días' },
];

const LOADING_PHRASES = [
  'Personalizando tu experiencia…',
  'Configurando tu perfil…',
  'Analizando tus objetivos…',
  'Preparando tu plan…',
  'Armando tu espacio en el Lab…',
  'Casi listo…',
];

// ─── Main component ───────────────────────────────────────────────────────────
const OnboardingFlow = ({ onComplete, initialStep = 0 }) => {
  const { user } = useAuth();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const contentWidth = Math.min(screenWidth, 480);

  // ── Step navigation
  const [step, setStep] = useState(initialStep);
  const stepRef = useRef(initialStep);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // ── SVG line
  const progressPathRef = useRef(null);
  const [pathLength, setPathLength] = useState(0);
  const [tipPoint, setTipPoint] = useState({ x: 70, y: 0 });
  const animTipRef = useRef(null);

  // ── Profile form
  const [formData, setFormData] = useState({
    displayName: '',
    username: '',
    email: '',
    photoURL: null,
    photoPath: null,
    usernameStatus: 'idle', // idle | checking | available | taken | error
    birthDateStr: '',
    gender: null,
    country: '',
    city: '',
    bodyweight: '',
    height: '',
  });

  // ── Question answers
  const [answers, setAnswers] = useState({
    primaryGoal: null,
    trainingExperience: null,
    trainingDaysPerWeek: null,
    sessionDuration: null,
    equipment: null,
    nutritionGoal: null,
    dietaryRestrictions: [],
    sleepHours: null,
    stressLevel: null,
  });

  // ── UI state
  const [errors, setErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState(LOADING_PHRASES[0]);

  // ── Username debounce
  const usernameTimerRef = useRef(null);

  // ── goToStep (always latest via ref)
  const goToStepRef = useRef(null);
  goToStepRef.current = (nextStep, dir = 1) => {
    const prevStep = stepRef.current;
    // Animate out
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 130, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: dir * -28, duration: 130, useNativeDriver: true }),
    ]).start(() => {
      stepRef.current = nextStep;
      setStep(nextStep);
      slideAnim.setValue(dir * 28);
      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
      // Animate SVG tip
      animateTip(prevStep, nextStep);
    });
  };

  const goToStep = useCallback((nextStep, dir = 1) => {
    goToStepRef.current(nextStep, dir);
  }, []);

  // ── SVG tip animation
  const animateTip = (fromStep, toStep) => {
    if (animTipRef.current) cancelAnimationFrame(animTipRef.current);
    if (!progressPathRef.current || !pathLength) return;
    const startTime = performance.now();
    const duration = 700;
    const tick = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = easeStandard(t);
      const currentStep = fromStep + (toStep - fromStep) * eased;
      const drawn = pathLength * (currentStep / TOTAL_STEPS);
      try {
        const pt = progressPathRef.current.getPointAtLength(drawn);
        setTipPoint({ x: pt.x, y: pt.y });
      } catch (_) {}
      if (t < 1) animTipRef.current = requestAnimationFrame(tick);
    };
    animTipRef.current = requestAnimationFrame(tick);
  };

  // ── Init SVG path length
  useEffect(() => {
    if (progressPathRef.current) {
      const len = progressPathRef.current.getTotalLength();
      setPathLength(len);
      // Set initial tip based on initialStep
      if (initialStep > 0) {
        const pt = progressPathRef.current.getPointAtLength(len * (initialStep / TOTAL_STEPS));
        setTipPoint({ x: pt.x, y: pt.y });
      }
    }
    return () => {
      if (animTipRef.current) cancelAnimationFrame(animTipRef.current);
    };
  }, []);

  // ── Pre-fill from auth
  useEffect(() => {
    const u = user || auth.currentUser;
    if (!u) return;
    setFormData(prev => ({
      ...prev,
      displayName: u.displayName || '',
      email: u.email || '',
    }));
  }, []);

  // ── Step 11: loading + save
  useEffect(() => {
    if (step !== 11) return;
    let cancelled = false;
    let phraseIdx = 0;
    const interval = setInterval(() => {
      phraseIdx = (phraseIdx + 1) % LOADING_PHRASES.length;
      setLoadingPhrase(LOADING_PHRASES[phraseIdx]);
    }, 900);

    const minWait = new Promise(r => setTimeout(r, 4200));
    const savePromise = doSaveAll();

    Promise.all([minWait, savePromise]).then(() => {
      clearInterval(interval);
      if (!cancelled) goToStepRef.current(12, 1);
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step]);

  // ── Helpers
  const setField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));
  const setAnswer = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }));
  const clearError = (key) => setErrors(prev => ({ ...prev, [key]: null }));

  const getEffectiveUid = () => (user || auth.currentUser)?.uid ?? null;

  // ── Username check
  const scheduleUsernameCheck = (username) => {
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    if (!username || username.length < 3) {
      setField('usernameStatus', 'idle');
      return;
    }
    if (!validateUsernameFormat(username)) {
      setField('usernameStatus', 'error');
      return;
    }
    setField('usernameStatus', 'checking');
    usernameTimerRef.current = setTimeout(async () => {
      try {
        const uid = getEffectiveUid();
        const q = query(collection(firestore, 'users'), where('username', '==', username.toLowerCase()));
        const snap = await getDocs(q);
        const taken = snap.docs.some(d => d.id !== uid);
        setField('usernameStatus', taken ? 'taken' : 'available');
      } catch {
        setField('usernameStatus', 'error');
      }
    }, 350);
  };

  // ── Country/city helpers
  const getCityOptions = () => {
    if (!formData.country) return [];
    const all = citiesBundle[formData.country] || [];
    return all.slice(0, 200);
  };

  const getCountryLabel = (code) => {
    const c = countriesList.find(x => x.value === code);
    return c ? c.label : code;
  };

  // ── Step 1–3 validation
  const validateStep1 = () => {
    const e = {};
    if (!formData.displayName.trim()) e.displayName = 'Ingresa tu nombre';
    if (!formData.username.trim()) e.username = 'Ingresa un usuario';
    if (formData.usernameStatus === 'taken') e.username = 'Este usuario ya está en uso';
    if (formData.usernameStatus === 'error') e.username = 'Usuario inválido (solo letras, números, guiones)';
    if (formData.usernameStatus === 'checking') e.username = 'Verificando disponibilidad…';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e = {};
    if (!formData.birthDateStr) e.birthDate = 'Selecciona tu fecha de nacimiento';
    if (!formData.gender) e.gender = 'Selecciona tu género';
    if (!formData.country) e.country = 'Selecciona tu país';
    if (!formData.city) e.city = 'Selecciona tu ciudad';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = () => {
    const e = {};
    const bw = parseFloat(formData.bodyweight);
    const ht = parseFloat(formData.height);
    if (!formData.bodyweight || isNaN(bw) || bw < 30 || bw > 300) e.bodyweight = 'Ingresa un peso válido (30–300 kg)';
    if (!formData.height || isNaN(ht) || ht < 100 || ht > 250) e.height = 'Ingresa una talla válida (100–250 cm)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Save profile (after step 3)
  const saveProfile = async () => {
    const uid = getEffectiveUid();
    if (!uid) { setSaveError('No se encontró sesión'); return false; }
    setSavingProfile(true);
    setSaveError(null);
    try {
      const age = calculateAge(formData.birthDateStr);
      const userData = {
        displayName: formData.displayName.trim(),
        username: formData.username.toLowerCase().trim(),
        email: formData.email.trim().toLowerCase(),
        birthDate: formData.birthDateStr,
        age,
        gender: formData.gender,
        country: formData.country,
        city: formData.city,
        bodyweight: parseFloat(formData.bodyweight) || null,
        height: parseFloat(formData.height) || null,
        profileCompleted: true,
        onboardingCompleted: false,
        role: 'user',
        generalTutorials: { mainScreen: false, library: false, profile: false, community: false },
      };
      if (formData.photoURL && formData.photoURL.startsWith('https://')) {
        userData.profilePictureUrl = formData.photoURL;
      }
      if (formData.photoPath) userData.profilePicturePath = formData.photoPath;

      const authUser = user || auth.currentUser;
      if (authUser && authUser.displayName !== userData.displayName) {
        await updateProfile(authUser, { displayName: userData.displayName });
      }
      await hybridDataService.updateUserProfile(uid, userData);

      const statusCache = JSON.stringify({ onboardingCompleted: false, profileCompleted: true, cachedAt: Date.now() });
      try { await AsyncStorage.setItem(`onboarding_status_${uid}`, statusCache); } catch (_) {}
      try { await webStorageService.setItem(`onboarding_status_${uid}`, statusCache); } catch (_) {}

      setSavingProfile(false);
      return true;
    } catch (err) {
      logger.error('[ONBOARDING_FLOW] saveProfile error:', err);
      setSaveError('Hubo un error guardando tu perfil. Intenta de nuevo.');
      setSavingProfile(false);
      return false;
    }
  };

  // ── Save all questions (called from step 11)
  const doSaveAll = async () => {
    const uid = getEffectiveUid();
    if (!uid) return;
    try {
      const userData = {
        onboardingData: {
          primaryGoal: answers.primaryGoal,
          trainingExperience: answers.trainingExperience,
          trainingDaysPerWeek: answers.trainingDaysPerWeek,
          sessionDuration: answers.sessionDuration,
          equipment: answers.equipment,
          nutritionGoal: answers.nutritionGoal,
          dietaryRestrictions: answers.dietaryRestrictions,
          sleepHours: answers.sleepHours,
          stressLevel: answers.stressLevel,
          completedAt: new Date().toISOString(),
        },
        onboardingCompleted: true,
        profileCompleted: true,
      };
      await hybridDataService.updateUserProfile(uid, userData);
      const statusCache = JSON.stringify({ onboardingCompleted: true, profileCompleted: true, cachedAt: Date.now() });
      try { await AsyncStorage.setItem(`onboarding_status_${uid}`, statusCache); } catch (_) {}
      try { await webStorageService.setItem(`onboarding_status_${uid}`, statusCache); } catch (_) {}
    } catch (err) {
      logger.error('[ONBOARDING_FLOW] doSaveAll error:', err);
    }
  };

  // ── Photo pick
  const photoInputRef = useRef(null);
  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uid = getEffectiveUid();
    if (!uid) return;
    setUploadingPhoto(true);
    const localUrl = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, photoURL: localUrl }));
    try {
      const downloadUrl = await profilePictureService.uploadProfilePicture(uid, localUrl);
      if (downloadUrl) {
        setFormData(prev => ({
          ...prev,
          photoURL: downloadUrl,
          photoPath: `profiles/${uid}/profile.jpg`,
        }));
      }
    } catch (err) {
      logger.warn('[ONBOARDING_FLOW] photo upload failed:', err);
    }
    setUploadingPhoto(false);
  };

  // ── Computed
  const progress = step / TOTAL_STEPS;
  const drawnLength = pathLength > 0 ? pathLength * progress : 0;
  const dashOffset = pathLength > 0 ? pathLength - drawnLength : 0;
  const showBackBtn = step > 0 && step < 11;
  const primaryGoalLabel = Q1_OPTIONS.find(o => o.id === answers.primaryGoal)?.label || '';

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER STEPS
  // ──────────────────────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      // ── Step 0: Welcome ─────────────────────────────────────────────────
      case 0:
        return (
          <View style={s.stepCenter}>
            <Image
              source={require('../../../assets/Isotipo WAKE (negativo).png')}
              style={{ width: 140, height: 140, marginBottom: 32 }}
              resizeMode="contain"
            />
            <Text style={s.welcomeSub}>
              Antes de empezar, cuéntanos{'\n'}un poco sobre ti
            </Text>
            <TouchableOpacity style={s.primaryBtn} onPress={() => goToStep(1, 1)}>
              <Text style={s.primaryBtnText}>Comenzar</Text>
            </TouchableOpacity>
          </View>
        );

      // ── Step 1: Identity ─────────────────────────────────────────────────
      case 1:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepScroll} keyboardShouldPersistTaps="handled">
            <View style={s.stepTitleBlock}>
              <Text style={s.stepLabel}>1 de 10</Text>
              <Text style={s.stepHeading}>Cuéntanos quién eres</Text>
            </View>
            <View style={s.stepContentCenter}>
            <View style={s.stepContentFullWidth}>
            {/* Profile photo */}
            <TouchableOpacity
              style={s.photoCircle}
              onPress={() => photoInputRef.current?.click()}
              activeOpacity={0.8}
            >
              {formData.photoURL ? (
                <Image source={{ uri: formData.photoURL }} style={s.photoImage} />
              ) : (
                <View style={s.photoPlaceholder}>
                  <SvgCamera width={40} height={40} stroke="rgba(255,255,255,0.4)" />
                  <Text style={s.photoLabel}>Foto{'\n'}(opcional)</Text>
                </View>
              )}
              {uploadingPhoto && (
                <View style={s.photoOverlay}>
                  <ActivityIndicator color="rgba(255,255,255,0.9)" size="small" />
                </View>
              )}
            </TouchableOpacity>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />

            {/* Display name */}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Nombre</Text>
              <TextInput
                style={[s.input, errors.displayName && s.inputError, formData.displayName && s.inputOk]}
                value={formData.displayName}
                onChangeText={v => { setField('displayName', v); clearError('displayName'); }}
                placeholder="Tu nombre completo"
                placeholderTextColor="rgba(255,255,255,0.3)"
                autoCapitalize="words"
              />
              {!!errors.displayName && <Text style={s.errorText}>{errors.displayName}</Text>}
            </View>

            {/* Username */}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Usuario</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[
                    s.input,
                    errors.username && s.inputError,
                    formData.usernameStatus === 'available' && s.inputOk,
                    formData.usernameStatus === 'taken' && s.inputError,
                    { paddingRight: 40 },
                  ]}
                  value={formData.username}
                  onChangeText={v => {
                    const clean = v.toLowerCase().replace(/[^a-z0-9_-]/g, '');
                    setField('username', clean);
                    clearError('username');
                    scheduleUsernameCheck(clean);
                  }}
                  placeholder="@tu_usuario"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={s.usernameIndicator}>
                  {formData.usernameStatus === 'checking' && <ActivityIndicator size="small" color="rgba(255,255,255,0.9)" />}
                  {formData.usernameStatus === 'available' && <Text style={{ color: '#5AC87C', fontSize: 16 }}>✓</Text>}
                  {formData.usernameStatus === 'taken' && <Text style={{ color: '#E05454', fontSize: 16 }}>✗</Text>}
                </View>
              </View>
              {formData.usernameStatus === 'available' && (
                <Text style={s.fieldHint}>@{formData.username} está disponible</Text>
              )}
              {!!errors.username && <Text style={s.errorText}>{errors.username}</Text>}
            </View>
            </View>

            <View style={{ height: 120 }} />
            </View>
          </ScrollView>
        );

      // ── Step 2: Demographics ─────────────────────────────────────────────
      case 2:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepScroll} keyboardShouldPersistTaps="handled">
            <View style={s.stepTitleBlock}>
              <Text style={s.stepLabel}>2 de 10</Text>
              <Text style={s.stepHeading}>Un poco más sobre ti</Text>
            </View>
            <View style={s.stepContentCenter}>
            <View style={s.stepContentFullWidth}>
            {/* Birthdate */}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Fecha de nacimiento</Text>
              <View style={{ position: 'relative' }}>
                <View style={[s.input, errors.birthDate && s.inputError, formData.birthDateStr && s.inputOk]}>
                  <Text style={formData.birthDateStr ? s.inputText : s.placeholderText}>
                    {formData.birthDateStr ? formatDateDisplay(formData.birthDateStr) : 'Seleccionar fecha'}
                  </Text>
                </View>
                <input
                  type="date"
                  style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}
                  value={formData.birthDateStr || ''}
                  max={maxBirthDate}
                  min={minBirthDate}
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) return;
                    const age = calculateAge(val);
                    if (age < 13) {
                      setErrors(prev => ({ ...prev, birthDate: 'Debes tener al menos 13 años' }));
                    } else {
                      clearError('birthDate');
                      setFormData(prev => ({ ...prev, birthDateStr: val }));
                    }
                  }}
                />
              </View>
              {!!errors.birthDate && <Text style={s.errorText}>{errors.birthDate}</Text>}
            </View>

            {/* Gender */}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Género</Text>
              <View style={s.pillRow}>
                {[{ v: 'male', l: 'Hombre' }, { v: 'female', l: 'Mujer' }, { v: 'other', l: 'Otro' }].map(g => (
                  <TouchableOpacity
                    key={g.v}
                    style={[s.pill, formData.gender === g.v && s.pillSelected]}
                    onPress={() => { setField('gender', g.v); clearError('gender'); }}
                  >
                    <Text style={[s.pillText, formData.gender === g.v && s.pillTextSelected]}>{g.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!!errors.gender && <Text style={s.errorText}>{errors.gender}</Text>}
            </View>

            {/* Country */}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>País</Text>
              <View style={{ position: 'relative' }}>
                <View style={[s.input, errors.country && s.inputError, formData.country && s.inputOk]}>
                  <Text style={formData.country ? s.inputText : s.placeholderText}>
                    {formData.country ? getCountryLabel(formData.country) : 'Selecciona tu país'}
                  </Text>
                </View>
                <select
                  value={formData.country}
                  onChange={e => {
                    setFormData(prev => ({ ...prev, country: e.target.value, city: '' }));
                    clearError('country');
                  }}
                  style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}
                >
                  <option value="">Seleccionar...</option>
                  {countriesList.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </View>
              {!!errors.country && <Text style={s.errorText}>{errors.country}</Text>}
            </View>

            {/* City */}
            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Ciudad</Text>
              <View style={{ position: 'relative' }}>
                <View style={[s.input, !formData.country && s.inputDisabled, errors.city && s.inputError, formData.city && s.inputOk]}>
                  <Text style={formData.city ? s.inputText : s.placeholderText}>
                    {formData.city || (formData.country ? 'Selecciona tu ciudad' : 'Primero selecciona un país')}
                  </Text>
                </View>
                {!!formData.country && (
                  <select
                    value={formData.city}
                    onChange={e => { setField('city', e.target.value); clearError('city'); }}
                    style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}
                  >
                    <option value="">Seleccionar...</option>
                    {getCityOptions().map((c, i) => (
                      <option key={i} value={typeof c === 'string' ? c : c.name}>
                        {typeof c === 'string' ? c : c.name}
                      </option>
                    ))}
                  </select>
                )}
              </View>
              {!!errors.city && <Text style={s.errorText}>{errors.city}</Text>}
            </View>
            </View>

            <View style={{ height: 120 }} />
            </View>
          </ScrollView>
        );

      // ── Step 3: Biometrics ───────────────────────────────────────────────
      case 3:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepScroll} keyboardShouldPersistTaps="handled">
            <View style={s.stepTitleBlock}>
              <Text style={s.stepLabel}>3 de 10</Text>
              <Text style={s.stepHeading}>Tus métricas</Text>
            </View>
            <View style={s.stepContentCenter}>
            <View style={s.stepContentFullWidth}>
            <View style={s.metricFieldsWrap}>
            <View style={[s.fieldGroup, s.fieldGroupMetric]}>
              <Text style={s.fieldLabel}>Peso corporal</Text>
              <View style={s.metricRow}>
                <TextInput
                  style={[s.metricInput, errors.bodyweight && s.inputError, formData.bodyweight && s.inputOk]}
                  value={formData.bodyweight}
                  onChangeText={v => { setField('bodyweight', v); clearError('bodyweight'); }}
                  keyboardType="decimal-pad"
                  placeholder="75"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
                <Text style={s.metricUnit}>kg</Text>
              </View>
              {!!errors.bodyweight && <Text style={s.errorText}>{errors.bodyweight}</Text>}
            </View>

            <View style={[s.fieldGroup, s.fieldGroupMetric]}>
              <Text style={s.fieldLabel}>Estatura</Text>
              <View style={s.metricRow}>
                <TextInput
                  style={[s.metricInput, errors.height && s.inputError, formData.height && s.inputOk]}
                  value={formData.height}
                  onChangeText={v => { setField('height', v); clearError('height'); }}
                  keyboardType="decimal-pad"
                  placeholder="170"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
                <Text style={s.metricUnit}>cm</Text>
              </View>
              {!!errors.height && <Text style={s.errorText}>{errors.height}</Text>}
            </View>
            </View>
            </View>

            {!!saveError && <Text style={[s.errorText, { textAlign: 'center', marginTop: 8 }]}>{saveError}</Text>}
            <View style={{ height: 120 }} />
            </View>
          </ScrollView>
        );

      // ── Step 4: Primary Goal ─────────────────────────────────────────────
      case 4:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepScroll}>
            <View style={s.stepTitleBlock}>
              <Text style={s.stepLabel}>4 de 10</Text>
              <Text style={s.stepHeading}>¿Cuál es tu objetivo número uno ahora mismo?</Text>
            </View>
            <View style={s.stepContentCenter}>
            <View style={s.stepContentFullWidth}>
            <View style={s.cardList}>
              {Q1_OPTIONS.map(opt => {
                const IconComp = opt.Icon;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[s.card, answers.primaryGoal === opt.id && s.cardSelected]}
                    onPress={() => setAnswer('primaryGoal', opt.id)}
                    activeOpacity={0.7}
                  >
                    <View style={s.cardIcon}>
                      <IconComp width={28} height={28} stroke={ICON_COLOR} color={ICON_COLOR} />
                    </View>
                    <Text style={[s.cardText, answers.primaryGoal === opt.id && s.cardTextSelected]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            </View>
            <View style={{ height: 120 }} />
            </View>
          </ScrollView>
        );

      // ── Step 5: Training Experience ──────────────────────────────────────
      case 5:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepScroll}>
            <View style={s.stepTitleBlock}>
              <Text style={s.stepLabel}>5 de 10</Text>
              <Text style={s.stepHeading}>¿Cuánto tiempo llevas entrenando con constancia?</Text>
            </View>
            <View style={s.stepContentCenter}>
            <View style={s.stepContentFullWidth}>
            <View style={s.cardList}>
              {Q2_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.card, answers.trainingExperience === opt.id && s.cardSelected]}
                  onPress={() => setAnswer('trainingExperience', opt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.cardText, answers.trainingExperience === opt.id && s.cardTextSelected, { flex: 1 }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            </View>
            <View style={{ height: 120 }} />
            </View>
          </ScrollView>
        );

      // ── Step 6: Availability ─────────────────────────────────────────────
      case 6:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepScroll}>
            <View style={s.stepTitleBlock}>
              <Text style={s.stepLabel}>6 de 10</Text>
              <Text style={s.stepHeading}>¿Cuándo y cuánto puedes entrenar?</Text>
            </View>
            <View style={s.stepContentCenter}>
            <View style={s.stepContentFullWidth}>
            <Text style={s.subQuestion}>Días a la semana</Text>
            <View style={s.pillRowWrap}>
              {Q3_DAYS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[s.dayPill, answers.trainingDaysPerWeek === d && s.pillSelected]}
                  onPress={() => setAnswer('trainingDaysPerWeek', d)}
                >
                  <Text style={[s.dayPillText, answers.trainingDaysPerWeek === d && s.pillTextSelected]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.subQuestion, { marginTop: 28 }]}>Duración por sesión</Text>
            <View style={s.cardList}>
              {Q3_DURATIONS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.card, answers.sessionDuration === opt.id && s.cardSelected]}
                  onPress={() => setAnswer('sessionDuration', opt.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.cardText, answers.sessionDuration === opt.id && s.cardTextSelected, { flex: 1 }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            </View>
            <View style={{ height: 120 }} />
            </View>
          </ScrollView>
        );

      // ── Step 7: Equipment ────────────────────────────────────────────────
      case 7:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepScroll}>
            <View style={s.stepTitleBlock}>
              <Text style={s.stepLabel}>7 de 10</Text>
              <Text style={s.stepHeading}>¿Dónde entrenas principalmente?</Text>
            </View>
            <View style={s.stepContentCenter}>
            <View style={s.stepContentFullWidth}>
            <View style={s.cardList}>
              {Q4_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.card, answers.equipment === opt.id && s.cardSelected]}
                  onPress={() => setAnswer('equipment', opt.id)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardText, answers.equipment === opt.id && s.cardTextSelected]}>
                      {opt.label}
                    </Text>
                    <Text style={s.cardSub}>{opt.sub}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            </View>
            <View style={{ height: 120 }} />
            </View>
          </ScrollView>
        );

      // ── Step 8: Nutrition Goal ───────────────────────────────────────────
      case 8:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepScroll}>
            <View style={s.stepTitleBlock}>
              <Text style={s.stepLabel}>8 de 10</Text>
              <Text style={s.stepHeading}>¿Cuál es tu meta con la alimentación?</Text>
            </View>
            <View style={s.stepContentCenter}>
            <View style={s.stepContentFullWidth}>
            <View style={s.cardList}>
              {Q5_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.card, answers.nutritionGoal === opt.id && s.cardSelected]}
                  onPress={() => setAnswer('nutritionGoal', opt.id)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardText, answers.nutritionGoal === opt.id && s.cardTextSelected]}>
                      {opt.label}
                    </Text>
                    <Text style={s.cardSub}>{opt.sub}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            </View>
            <View style={{ height: 120 }} />
            </View>
          </ScrollView>
        );

      // ── Step 9: Dietary Restrictions ─────────────────────────────────────
      case 9:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepScroll}>
            <View style={s.stepTitleBlock}>
              <Text style={s.stepLabel}>9 de 10</Text>
              <Text style={s.stepHeading}>¿Tienes alguna restricción alimentaria?</Text>
              <Text style={s.stepSub}>Puedes seleccionar varias</Text>
            </View>
            <View style={s.stepContentCenter}>
            <View style={s.stepContentFullWidth}>
            <View style={s.gridWrap}>
              {Q6_OPTIONS.map(opt => {
                const selected = answers.dietaryRestrictions.includes(opt.id);
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[s.gridTag, selected && s.gridTagSelected]}
                    onPress={() => {
                      setAnswers(prev => {
                        const cur = prev.dietaryRestrictions;
                        if (opt.id === 'none') return { ...prev, dietaryRestrictions: selected ? [] : ['none'] };
                        const without = cur.filter(x => x !== 'none');
                        if (selected) return { ...prev, dietaryRestrictions: without.filter(x => x !== opt.id) };
                        return { ...prev, dietaryRestrictions: [...without, opt.id] };
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.gridTagText, selected && s.gridTagTextSelected]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            </View>
            <View style={{ height: 120 }} />
            </View>
          </ScrollView>
        );

      // ── Step 10: Lifestyle ────────────────────────────────────────────────
      case 10:
        return (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepScroll}>
            <View style={s.stepTitleBlock}>
              <Text style={s.stepLabel}>10 de 10</Text>
              <Text style={s.stepHeading}>Un último detalle sobre tu día a día</Text>
            </View>
            <View style={s.stepContentCenter}>
            <View style={s.stepContentFullWidth}>
            <Text style={s.subQuestion}>¿Cuántas horas duermes normalmente?</Text>
            <View style={s.pillRowWrap}>
              {Q7_SLEEP.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.dayPill, { minWidth: 72 }, answers.sleepHours === opt.id && s.pillSelected]}
                  onPress={() => setAnswer('sleepHours', opt.id)}
                >
                  <Text style={[s.dayPillText, answers.sleepHours === opt.id && s.pillTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.subQuestion, { marginTop: 28 }]}>Nivel de estrés en el día a día</Text>
            <View style={s.cardList}>
              {Q7_STRESS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.card, answers.stressLevel === opt.id && s.cardSelected]}
                  onPress={() => setAnswer('stressLevel', opt.id)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardText, answers.stressLevel === opt.id && s.cardTextSelected]}>
                      {opt.label}
                    </Text>
                    <Text style={s.cardSub}>{opt.sub}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            </View>
            <View style={{ height: 120 }} />
            </View>
          </ScrollView>
        );

      // ── Step 11: Building Profile ─────────────────────────────────────────
      case 11:
        return (
          <View style={s.stepCenter}>
            <Image
              source={require('../../../assets/Isotipo WAKE (negativo).png')}
              style={{ width: 100, height: 100, marginBottom: 40, opacity: 0.9 }}
              resizeMode="contain"
            />
            <ActivityIndicator color="rgba(255,255,255,0.9)" size="large" style={{ marginBottom: 28 }} />
            <Text style={s.loadingPhrase}>{loadingPhrase}</Text>
          </View>
        );

      // ── Step 12: Completion ───────────────────────────────────────────────
      case 12:
        return (
          <View style={s.stepCenter}>
            <View style={s.completionLogoWrap}>
              <CompletionLogo width={200} height={130} />
            </View>
            <View style={s.completionBadgeWrap}>
              <Svg width={56} height={56} viewBox="0 0 56 56">
                <Path d="M28 4C14.7 4 4 14.7 4 28s10.7 24 24 24 24-10.7 24-24S41.3 4 28 4z" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                <Path d="M18 28l7 8 14-16" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <Text style={s.completionName}>
              ¡Bienvenido{formData.displayName ? `, ${formData.displayName.split(' ')[0]}` : ''}!
            </Text>
            {!!primaryGoalLabel && (
              <View style={[s.goalChip, s.completionGoalChip]}>
                <Text style={s.goalChipText}>Tu objetivo · {primaryGoalLabel}</Text>
              </View>
            )}
            <Text style={s.completionTagline}>
              Ahora mides lo que antes solo sentías.
            </Text>
            <TouchableOpacity style={s.completionCta} onPress={() => onComplete && onComplete()}>
              <Text style={s.completionCtaText}>Vamos al Lab</Text>
              <Image
                source={require('../../../assets/Isotipo WAKE (negativo).png')}
                style={[s.primaryBtnLogo, { tintColor: '#1a1a1a' }]}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  // ── Bottom bar action (Continuar)
  const handleContinue = async () => {
    if (step === 1) {
      if (!validateStep1()) return;
      goToStep(2, 1);
    } else if (step === 2) {
      if (!validateStep2()) return;
      goToStep(3, 1);
    } else if (step === 3) {
      if (!validateStep3()) return;
      const ok = await saveProfile();
      if (ok) goToStep(4, 1);
    } else if (step === 4) {
      if (!answers.primaryGoal) return;
      goToStep(5, 1);
    } else if (step === 5) {
      if (!answers.trainingExperience) return;
      goToStep(6, 1);
    } else if (step === 6) {
      if (!answers.trainingDaysPerWeek || !answers.sessionDuration) return;
      goToStep(7, 1);
    } else if (step === 7) {
      if (!answers.equipment) return;
      goToStep(8, 1);
    } else if (step === 8) {
      if (!answers.nutritionGoal) return;
      goToStep(9, 1);
    } else if (step === 9) {
      if (answers.dietaryRestrictions.length === 0) return;
      goToStep(10, 1);
    } else if (step === 10) {
      if (!answers.sleepHours || !answers.stressLevel) return;
      goToStep(11, 1);
    }
  };

  const isContinueEnabled = () => {
    if (step === 1) return !!formData.displayName.trim() && !!formData.username.trim() && formData.usernameStatus === 'available';
    if (step === 2) return !!formData.birthDateStr && !!formData.gender && !!formData.country && !!formData.city;
    if (step === 3) return !!formData.bodyweight && !!formData.height;
    if (step === 4) return !!answers.primaryGoal;
    if (step === 5) return !!answers.trainingExperience;
    if (step === 6) return !!answers.trainingDaysPerWeek && !!answers.sessionDuration;
    if (step === 7) return !!answers.equipment;
    if (step === 8) return !!answers.nutritionGoal;
    if (step === 9) return answers.dietaryRestrictions.length > 0;
    if (step === 10) return !!answers.sleepHours && !!answers.stressLevel;
    return false;
  };

  const enabled = isContinueEnabled();
  const showContinue = step >= 1 && step <= 10;
  const continueBtnLabel = step === 3 ? (savingProfile ? 'Guardando…' : 'Continuar') : step === 10 ? 'Finalizar' : 'Continuar';

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* ── SVG traveling line background */}
      <svg
        style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: Math.min(screenWidth, 480), height: '100%', pointerEvents: 'none', zIndex: 0 }}
        viewBox="0 0 390 900"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Track */}
        <path d={PATH_D} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" strokeLinecap="round" />
        {/* Progress */}
        <path
          ref={progressPathRef}
          d={PATH_D}
          fill="none"
          stroke={step === 12 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.35)'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={pathLength}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.4,0,0.2,1), stroke 600ms ease' }}
        />
        {/* Glowing tip */}
        {step > 0 && pathLength > 0 && (
          <>
            <circle cx={tipPoint.x} cy={tipPoint.y} r="7" fill="rgba(255,255,255,0.10)" />
            <circle cx={tipPoint.x} cy={tipPoint.y} r="3" fill="rgba(255,255,255,0.75)" />
          </>
        )}
      </svg>

      {/* ── Container */}
      <View style={[s.container, { maxWidth: 480, width: '100%', alignSelf: 'center' }]}>
        {/* ── Progress bar */}
        {step > 0 && step < 12 && (
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
          </View>
        )}

        {/* ── Back button */}
        {showBackBtn && (
          <TouchableOpacity style={s.backBtn} onPress={() => goToStep(step - 1, -1)}>
            <Text style={s.backBtnText}>←</Text>
          </TouchableOpacity>
        )}

        {/* ── Animated step content */}
        <Animated.View
          style={[
            s.stepWrapper,
            { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
          ]}
        >
          {renderStep()}
        </Animated.View>

        {/* ── Bottom continue bar */}
        {showContinue && (
          <View style={s.bottomBar}>
            <TouchableOpacity
              style={[s.primaryBtn, !enabled && s.primaryBtnDisabled, savingProfile && s.primaryBtnDisabled]}
              onPress={handleContinue}
              disabled={!enabled || savingProfile}
              activeOpacity={0.8}
            >
              {savingProfile && step === 3
                ? <ActivityIndicator color="rgba(255,255,255,0.9)" size="small" />
                : <Text style={[s.primaryBtnText, !enabled && s.primaryBtnTextDisabled]}>{continueBtnLabel}</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    position: 'relative',
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
    width: '100%',
    zIndex: 10,
  },
  progressFill: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
    transition: 'width 500ms ease',
  },
  backBtn: {
    position: 'absolute',
    top: 14,
    left: 20,
    zIndex: 20,
    padding: 8,
  },
  backBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 22,
  },
  stepWrapper: {
    flex: 1,
    zIndex: 5,
  },
  // ── Centered layout (welcome, loading, complete)
  stepCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  // ── Scroll-based layout (form, questions)
  stepScroll: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 40,
    flexGrow: 1,
  },
  stepTitleBlock: {
    marginBottom: 8,
  },
  stepContentCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  stepHeading: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 34,
    marginBottom: 8,
  },
  stepSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 20,
    marginBottom: 28,
  },
  subQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 12,
  },
  // ── Welcome
  welcomeSub: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 48,
  },
  // ── Profile photo
  photoCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: '#242424',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    overflow: 'hidden',
  },
  photoImage: {
    width: 128,
    height: 128,
    borderRadius: 64,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  photoLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 14,
  },
  photoOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Form fields
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 12,
    color: '#5AC87C',
    marginTop: 4,
    marginLeft: 2,
  },
  input: {
    backgroundColor: '#222222',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#ffffff',
    justifyContent: 'center',
  },
  inputText: {
    fontSize: 16,
    color: '#ffffff',
  },
  placeholderText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.3)',
  },
  inputOk: {
    borderColor: 'rgba(255,255,255,0.35)',
  },
  inputError: {
    borderColor: 'rgba(224,84,84,0.6)',
  },
  inputDisabled: {
    backgroundColor: '#1c1c1c',
    borderColor: 'rgba(255,255,255,0.05)',
  },
  usernameIndicator: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    color: '#E05454',
    marginTop: 5,
    marginLeft: 2,
  },
  // ── Full-width content wrapper (so cards/inputs span full width when parent centers)
  stepContentFullWidth: {
    width: '100%',
    alignSelf: 'stretch',
  },
  // ── Metric inputs (weight / height) — full-width cards
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metricFieldsWrap: {
    width: '100%',
  },
  fieldGroupMetric: {
    width: '100%',
  },
  metricInput: {
    flex: 1,
    backgroundColor: '#222222',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'left',
  },
  metricUnit: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
    width: 36,
  },
  // ── Gender pills
  pillRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pillRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  pillSelected: {
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  pillText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  pillTextSelected: {
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
  },
  // ── Day pills (days/week)
  dayPill: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    minWidth: 52,
  },
  dayPillText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  // ── Question cards (full-width horizontal)
  cardList: {
    gap: 10,
    marginTop: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222222',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  cardSelected: {
    borderLeftColor: 'rgba(255,255,255,0.6)',
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
  },
  cardTextSelected: {
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
  },
  cardSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 3,
    lineHeight: 16,
  },
  // ── Diet restrictions grid
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  gridTag: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  gridTagSelected: {
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  gridTagText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  gridTagTextSelected: {
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
  },
  // ── Loading step
  loadingPhrase: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  // ── Completion step
  completionName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  goalChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  goalChipText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
  },
  completionTagline: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 36,
    paddingHorizontal: 16,
  },
  completionLogoWrap: {
    marginBottom: 20,
  },
  completionBadgeWrap: {
    marginBottom: 20,
  },
  completionStatsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 24,
  },
  completionGoalChip: {
    marginBottom: 24,
  },
  completionCta: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  completionCtaText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  // ── Primary button
  primaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  primaryBtnWithLogo: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryBtnLogo: {
    width: 28,
    height: 28,
    opacity: 0.95,
  },
  primaryBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  primaryBtnTextDisabled: {
    color: 'rgba(255,255,255,0.3)',
  },
  // ── Bottom bar (position matches WorkoutExecutionScreen setInputModalFooter: well above device bottom)
  bottomBar: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: 'rgba(26,26,26,0.96)',
    alignItems: 'center',
    zIndex: 20,
  },
});

export default OnboardingFlow;
