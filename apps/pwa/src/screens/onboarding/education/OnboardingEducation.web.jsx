import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { updateProfile } from 'firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import AuroraBackground from './components/AuroraBackground';
import countriesRaw from '../../../../assets/data/countries.json';
import citiesData from '../../../../assets/data/cities.json';
import { Image } from 'react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { auth } from '../../../config/firebase';
import apiClient from '../../../utils/apiClient';
import profilePictureService from '../../../services/profilePictureService';
import logger from '../../../utils/logger';
import { queryKeys } from '../../../config/queryClient';
import './OnboardingEducation.css';

let _logoUri = null;
try {
  const _asset = require('../../../../assets/Isotipo WAKE (negativo).png');
  if (typeof _asset === 'string') _logoUri = _asset;
  else if (_asset?.uri) _logoUri = _asset.uri;
  else if (Image?.resolveAssetSource) {
    const r = Image.resolveAssetSource(_asset);
    if (r?.uri) _logoUri = r.uri;
  }
} catch (_) {}

const ease = [0.22, 1, 0.36, 1];

const morph = {
  type: 'spring',
  damping: 28,
  stiffness: 65,
  mass: 1.4,
};

const countries = (countriesRaw || []).map(c => ({ label: c.name, value: c.iso2 }));

const LOADING_PHRASES = [
  'Configurando tu espacio...',
  'Personalizando tu experiencia...',
  'Preparando todo...',
  'Casi listo...',
];

// ─── Figure geometry ───
const SIZES = [
  [14, 38, 48],
  [10, 27, 34],
  [11, 29, 36],
  [9, 25, 31],
  [10, 27, 34],
];

const POS = [
  [[150, 105, 1, 1], [52, 58, 0.72, 0.82], [248, 64, 0.78, 0.82], [62, 200, 0.66, 0.72], [238, 195, 0.72, 0.72]],
  [[150, 52, 1.2, 1], [-30, 20, 0.3, 0], [330, 15, 0.3, 0], [-35, 270, 0.25, 0], [335, 265, 0.25, 0]],
  [[150, 100, 1.05, 1], [76, 62, 0.85, 0.92], [224, 68, 0.85, 0.92], [82, 182, 0.78, 0.85], [218, 178, 0.78, 0.85]],
];

const CONNS = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 3], [2, 4], [1, 2], [3, 4]];
const centerY = (i) => SIZES[i][0] + SIZES[i][2] * 0.3;

const PARTICLES = [
  { x: 40, y: 50, dx: 12, dy: -8, dur: 6, r: 1.4, op: 0.15 },
  { x: 260, y: 80, dx: -10, dy: 6, dur: 7, r: 1.2, op: 0.12 },
  { x: 150, y: 30, dx: 8, dy: 10, dur: 5.5, r: 1.6, op: 0.18 },
  { x: 80, y: 160, dx: -6, dy: -12, dur: 6.5, r: 1, op: 0.1 },
  { x: 220, y: 180, dx: 10, dy: -6, dur: 5, r: 1.3, op: 0.14 },
  { x: 120, y: 240, dx: -8, dy: 8, dur: 7.5, r: 1.1, op: 0.11 },
  { x: 200, y: 40, dx: 6, dy: 12, dur: 6, r: 1.5, op: 0.16 },
  { x: 30, y: 130, dx: 14, dy: -4, dur: 5.5, r: 1, op: 0.1 },
  { x: 270, y: 150, dx: -12, dy: -8, dur: 6.5, r: 1.2, op: 0.12 },
  { x: 160, y: 200, dx: 4, dy: -14, dur: 7, r: 1.4, op: 0.13 },
  { x: 90, y: 90, dx: -10, dy: 10, dur: 5, r: 1.1, op: 0.11 },
  { x: 240, y: 240, dx: 8, dy: -10, dur: 6, r: 1.3, op: 0.15 },
];

// ─── Helpers ───
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${d} ${months[m - 1]} ${y}`;
}

function getMaxBirthDate() {
  const t = new Date();
  return `${t.getFullYear() - 13}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════
// SVG Components (education visuals)
// ═══════════════════════════════════════════════════════════════════

function Figure({ idx, step }) {
  const [hr, bw, bh] = SIZES[idx];
  const [x, y, scale, opacity] = POS[step][idx];
  const isMain = idx === 0;
  const fill = isMain ? 0.09 : 0.05;
  const stroke = isMain ? 0.25 : 0.14;

  return (
    <motion.g
      initial={{ x: POS[0][idx][0], y: POS[0][idx][1] + 25, scale: 0, opacity: 0 }}
      animate={{ x, y, scale, opacity }}
      transition={morph}
    >
      <motion.circle
        cx={0} cy={hr * 0.4}
        r={hr * 2.2}
        fill="rgba(255,87,168,1)"
        animate={{
          r: [hr * 2.2, hr * 2.6, hr * 2.2],
          opacity: [isMain ? 0.04 : 0.02, isMain ? 0.07 : 0.04, isMain ? 0.04 : 0.02],
        }}
        transition={{ duration: 3.5 + idx * 0.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.circle
        cx={0} cy={0} r={hr}
        fill={`rgba(255,87,168,${fill})`}
        stroke={`rgba(255,87,168,${stroke})`}
        strokeWidth={1}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 3 + idx * 0.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <circle cx={0} cy={0} r={hr * 0.55} fill={`rgba(255,255,255,${isMain ? 0.04 : 0.02})`} />
      <motion.rect
        x={-bw / 2} y={hr + 5}
        width={bw} height={bh}
        rx={bw * 0.3}
        fill={`rgba(255,87,168,${fill * 0.7})`}
        stroke={`rgba(255,87,168,${stroke * 0.55})`}
        strokeWidth={0.7}
        animate={{ scale: [1, 1.03, 1] }}
        transition={{ duration: 3 + idx * 0.4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
    </motion.g>
  );
}

function Connections({ step }) {
  const visible = step !== 1;
  const strong = step === 2;

  return (
    <AnimatePresence>
      {visible && (
        <motion.g
          key={`conns-${step}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease }}
        >
          {CONNS.map(([a, b], i) => {
            const x1 = POS[step][a][0];
            const y1 = POS[step][a][1] + centerY(a);
            const x2 = POS[step][b][0];
            const y2 = POS[step][b][1] + centerY(b);

            return (
              <motion.path
                key={i}
                d={`M ${x1} ${y1} L ${x2} ${y2}`}
                stroke={`rgba(255,87,168,${strong ? 0.18 : 0.045})`}
                strokeWidth={strong ? 1.2 : 0.5}
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, ease, delay: 0.25 + i * 0.06 }}
              />
            );
          })}
        </motion.g>
      )}
    </AnimatePresence>
  );
}

function FlowParticles({ step }) {
  return (
    <AnimatePresence>
      {step === 2 && (
        <motion.g
          key="flow"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
        >
          {CONNS.slice(0, 5).map(([a, b], i) => {
            const x1 = POS[2][a][0];
            const y1 = POS[2][a][1] + centerY(a);
            const x2 = POS[2][b][0];
            const y2 = POS[2][b][1] + centerY(b);
            const path = `M ${x1} ${y1} L ${x2} ${y2}`;
            const pathRev = `M ${x2} ${y2} L ${x1} ${y1}`;

            return [0, 1].map((j) => (
              <circle
                key={`${i}-${j}`}
                r={1.5}
                fill="rgba(255,87,168,0.35)"
              >
                <animate
                  attributeName="opacity"
                  values="0;0.6;0"
                  dur="2.5s"
                  repeatCount="indefinite"
                  begin={`${1.2 + i * 0.4 + j * 1.2}s`}
                />
                <animateMotion
                  dur="2.5s"
                  repeatCount="indefinite"
                  begin={`${1.2 + i * 0.4 + j * 1.2}s`}
                  path={j === 0 ? path : pathRev}
                />
              </circle>
            ));
          })}
        </motion.g>
      )}
    </AnimatePresence>
  );
}

function PulseWave({ step }) {
  return (
    <AnimatePresence>
      {step === 2 && (
        <>
          <motion.circle
            key="pulse-1"
            cx={150} cy={130}
            fill="none"
            stroke="rgba(255,87,168,1)"
            strokeWidth={1.5}
            initial={{ r: 15, opacity: 0.35 }}
            animate={{ r: 140, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, ease: 'easeOut', delay: 0.2 }}
          />
          <motion.circle
            key="pulse-2"
            cx={150} cy={130}
            fill="none"
            stroke="rgba(255,87,168,1)"
            strokeWidth={1}
            initial={{ r: 15, opacity: 0.2 }}
            animate={{ r: 160, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.8, ease: 'easeOut', delay: 0.45 }}
          />
        </>
      )}
    </AnimatePresence>
  );
}

function ProgramCard({ step }) {
  const show = step === 1;

  return (
    <motion.g
      animate={{
        opacity: show ? 1 : 0,
        y: show ? 0 : 25,
        scale: show ? 1 : 0.85,
      }}
      transition={{
        ...morph,
        opacity: { duration: show ? 0.6 : 0.3, ease },
      }}
    >
      <motion.path
        d="M 150 108 L 150 138"
        stroke="rgba(255,87,168,0.2)"
        strokeWidth={1}
        strokeDasharray="4 3"
        fill="none"
        strokeLinecap="round"
        animate={{ pathLength: show ? 1 : 0 }}
        transition={{ duration: 0.5, ease, delay: show ? 0.3 : 0 }}
      />
      <rect x={88} y={142} width={124} height={105} rx={10}
        fill="rgba(255,255,255,0.03)"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={0.8}
      />
      <rect x={102} y={155} width={52} height={4} rx={2} fill="rgba(255,255,255,0.12)" />
      <rect x={102} y={163} width={36} height={3} rx={1.5} fill="rgba(255,255,255,0.05)" />
      {[0, 1, 2].map((i) => {
        const ry = 178 + i * 19;
        return (
          <g key={i}>
            <rect x={100} y={ry} width={90} height={14} rx={4} fill="rgba(255,255,255,0.02)" />
            <rect x={105} y={ry + 4} width={8} height={6} rx={2} fill="rgba(255,255,255,0.08)" />
            <rect x={118} y={ry + 4} width={24} height={6} rx={2} fill="rgba(255,255,255,0.06)" />
            <rect x={148} y={ry + 4} width={16} height={6} rx={2} fill="rgba(255,255,255,0.06)" />
            <motion.circle
              cx={198} cy={ry + 7} r={5}
              fill="rgba(255,87,168,0.12)"
              animate={{ scale: show ? 1 : 0, opacity: show ? 1 : 0 }}
              transition={{ duration: 0.3, ease, delay: show ? 0.6 + i * 0.15 : 0 }}
            />
            <motion.path
              d={`M ${195} ${ry + 7} L ${197} ${ry + 9} L ${201} ${ry + 4}`}
              stroke="rgba(255,87,168,0.45)"
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              animate={{ pathLength: show ? 1 : 0 }}
              transition={{ duration: 0.25, ease, delay: show ? 0.7 + i * 0.15 : 0 }}
            />
          </g>
        );
      })}
      <rect x={102} y={237} width={88} height={4} rx={2} fill="rgba(255,255,255,0.04)" />
      <motion.rect
        x={102} y={237} rx={2} height={4}
        fill="rgba(255,87,168,0.3)"
        animate={{ width: show ? 58 : 0 }}
        transition={{ duration: 1, ease, delay: show ? 0.5 : 0 }}
      />
      <motion.rect
        x={88} y={142} width={124} height={105} rx={10}
        fill="none"
        stroke="rgba(255,87,168,0.12)"
        strokeWidth={1.5}
        animate={{ opacity: show ? [0, 0.5, 0] : 0 }}
        transition={{ duration: 2.5, repeat: Infinity, delay: 1.5, ease: 'easeInOut' }}
      />
    </motion.g>
  );
}

function AmbientParticles() {
  return (
    <g>
      {PARTICLES.map((p, i) => (
        <motion.circle
          key={i}
          cx={p.x} cy={p.y}
          r={p.r}
          fill="rgba(255,87,168,1)"
          animate={{
            cx: [p.x, p.x + p.dx, p.x],
            cy: [p.y, p.y + p.dy, p.y],
            opacity: [p.op * 0.4, p.op, p.op * 0.4],
          }}
          transition={{
            duration: p.dur,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.3,
          }}
        />
      ))}
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export default function OnboardingEducation({ onComplete }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState('welcome');
  const [eduStep, setEduStep] = useState(0);
  const [titleVisible, setTitleVisible] = useState(true);
  const [completionStep, setCompletionStep] = useState('loading'); // 'loading' | 'check' | 'done'
  const [loadingPhrase, setLoadingPhrase] = useState(LOADING_PHRASES[0]);

  const [profile, setProfile] = useState({
    name: '', username: '', photoPreview: null,
    birthDate: '', gender: null,
    country: '', city: '',
    weight: '', height: '',
  });

  const photoRef = useRef(null);
  const dateRef = useRef(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const saveCompleteRef = useRef(false);
  const animReadyRef = useRef(false);

  // Pre-fill from auth user
  const prefillDoneRef = useRef(false);
  useEffect(() => {
    if (prefillDoneRef.current) return;
    const authUser = user || auth.currentUser;
    if (authUser) {
      prefillDoneRef.current = true;
      setProfile(p => ({
        ...p,
        name: p.name || authUser.displayName || '',
      }));
    }
  }, [user]);

  const setField = useCallback((key, val) => {
    setProfile(p => ({ ...p, [key]: val }));
  }, []);

  // Username uniqueness check
  const [usernameStatus, setUsernameStatus] = useState(null); // null | 'checking' | 'available' | 'taken'
  const usernameTimer = useRef(null);

  const checkUsername = useCallback((value) => {
    const clean = value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (clean.length < 3) { setUsernameStatus(null); return; }
    setUsernameStatus('checking');
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    usernameTimer.current = setTimeout(async () => {
      try {
        const res = await apiClient.get('/users/me/username-check', { params: { username: clean } });
        setUsernameStatus(res?.data?.available ? 'available' : 'taken');
      } catch {
        setUsernameStatus(null);
      }
    }, 500);
  }, []);

  const getCities = useCallback(() => {
    if (!profile.country) return [];
    return (citiesData[profile.country] || []).slice(0, 200);
  }, [profile.country]);

  const isProfileValid = !!(
    profile.name.trim() && profile.username.trim() &&
    profile.birthDate && profile.gender &&
    profile.country && profile.city &&
    profile.weight && profile.height &&
    usernameStatus !== 'taken' && usernameStatus !== 'checking'
  );

  // ── Navigation ──

  const start = useCallback(() => {
    setTitleVisible(false);
    setTimeout(() => setPhase('education'), 800);
  }, []);

  const eduNext = useCallback(() => {
    if (eduStep < 2) setEduStep(s => s + 1);
  }, [eduStep]);

  const eduPrev = useCallback(() => {
    if (eduStep > 0) setEduStep(s => s - 1);
  }, [eduStep]);

  const goToProfile = useCallback(() => {
    setPhase('profile');
  }, []);

  const tryShowDone = useCallback(() => {
    if (saveCompleteRef.current && animReadyRef.current) {
      setCompletionStep('done');
    }
  }, []);

  const saveProfile = useCallback(async () => {
    const uid = (user || auth.currentUser)?.uid;
    if (!uid) return;
    try {
      // Update Firebase Auth displayName
      const authUser = user || auth.currentUser;
      if (authUser && authUser.displayName !== profile.name.trim()) {
        await updateProfile(authUser, { displayName: profile.name.trim() });
      }

      // Upload photo if selected
      if (profile.photoPreview) {
        try {
          await profilePictureService.uploadProfilePicture(uid, profile.photoPreview);
        } catch (err) {
          logger.error('[ONBOARDING_EDU] Photo upload error:', err);
        }
      }

      // Save profile fields
      await apiClient.patch('/users/me', {
        displayName: profile.name.trim(),
        username: profile.username.toLowerCase().trim(),
        birthDate: profile.birthDate,
        gender: profile.gender,
        country: profile.country,
        city: profile.city,
        weight: parseFloat(profile.weight) || null,
        height: parseFloat(profile.height) || null,
        profileCompleted: true,
        onboardingCompleted: true,
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.user.detail(uid) });

      // Update localStorage cache
      const statusCache = JSON.stringify({ onboardingCompleted: true, profileCompleted: true, cachedAt: Date.now() });
      try { localStorage.setItem(`onboarding_status_${uid}`, statusCache); } catch (_) {}
    } catch (err) {
      logger.error('[ONBOARDING_EDU] saveProfile error:', err);
    }
  }, [user, profile, queryClient]);

  const goToCompletion = useCallback(() => {
    setPhase('completion');
    setCompletionStep('loading');
    saveCompleteRef.current = false;
    animReadyRef.current = false;

    // Start save in background
    saveProfile().finally(() => {
      saveCompleteRef.current = true;
      tryShowDone();
    });
  }, [saveProfile, tryShowDone]);

  const handlePhotoSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) setField('photoPreview', URL.createObjectURL(file));
  }, [setField]);

  const enterApp = useCallback(() => {
    if (onComplete) onComplete();
  }, [onComplete]);

  // ── Touch (education only) ──

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (phase !== 'education') return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) eduNext();
    if (dx > 0) eduPrev();
  }, [phase, eduNext, eduPrev]);

  // ── Keyboard (education only) ──

  useEffect(() => {
    if (phase !== 'education') return;
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') eduNext();
      if (e.key === 'ArrowLeft') eduPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, eduNext, eduPrev]);

  // ── Completion loading timer ──

  useEffect(() => {
    if (phase !== 'completion') return;
    if (completionStep === 'loading') {
      let idx = 0;
      const interval = setInterval(() => {
        idx = (idx + 1) % LOADING_PHRASES.length;
        setLoadingPhrase(LOADING_PHRASES[idx]);
      }, 900);
      const timer = setTimeout(() => setCompletionStep('check'), 3500);
      return () => { clearInterval(interval); clearTimeout(timer); };
    }
    if (completionStep === 'check') {
      const timer = setTimeout(() => {
        animReadyRef.current = true;
        tryShowDone();
      }, 1400);
      return () => clearTimeout(timer);
    }
  }, [phase, completionStep, tryShowDone]);

  // ── Derived ──

  const auroraStep = phase === 'education' ? eduStep : phase === 'completion' ? 1 : 0;
  const firstName = profile.name.trim().split(' ')[0] || (user?.displayName || '').split(' ')[0];

  // ── Render ──

  return (
    <div
      className="pwa-ob-root"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <AuroraBackground step={auroraStep} />
      <div className="pwa-ob-grid" />

      <AnimatePresence>
        {/* ── Welcome ── */}
        {phase === 'welcome' && titleVisible && (
          <motion.div
            key="welcome"
            className="pwa-ob-welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.6, ease }}
          >
            <div className="pwa-ob-welcome-center">
              {/* WAKE logotype */}
              <motion.div
                className="pwa-ob-welcome-logo"
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 1.2, ease, delay: 0.15 }}
              >
                <svg viewBox="0 0 4500 4500" preserveAspectRatio="xMidYMid meet" style={{ width: 240, height: 156 }}>
                  <g transform="translate(0,4500) scale(0.1,-0.1)" fill="rgba(255,255,255,0.9)" stroke="none">
                    <path d="M20306 27933 c-110 -37 -192 -147 -372 -498 -187 -365 -4626 -9726 -4666 -9840 -32 -89 -38 -121 -35 -167 4 -70 40 -121 106 -152 43 -19 62 -21 261 -20 228 0 302 9 510 60 288 71 470 185 662 414 90 107 349 491 458 680 101 175 132 238 268 555 274 639 859 1903 2279 4925 283 602 524 1103 535 1113 29 25 91 22 121 -5 15 -14 562 -1184 1412 -3018 763 -1647 1405 -3030 1427 -3073 51 -102 190 -331 296 -487 236 -347 590 -747 788 -889 149 -107 368 -201 589 -252 63 -14 140 -22 257 -26 150 -5 173 -3 236 16 82 25 125 62 144 122 16 54 0 132 -56 269 -51 126 -4615 9642 -4723 9850 -114 217 -172 310 -224 361 -77 75 -169 96 -273 62z" />
                    <path d="M1318 27780 c-129 -20 -208 -80 -248 -187 -25 -67 -25 -129 -1 -224 16 -60 3643 -9405 3797 -9782 127 -312 224 -456 343 -510 68 -32 188 -31 256 2 100 49 177 151 265 348 60 135 -61 -193 1250 3403 617 1691 1128 3085 1136 3098 31 48 111 53 151 9 13 -13 466 -1241 1133 -3072 612 -1677 1132 -3102 1157 -3165 64 -165 175 -392 227 -464 109 -153 234 -211 368 -172 67 19 141 81 200 169 47 70 135 251 201 417 228 573 3759 9671 3772 9720 27 100 24 185 -8 246 -53 103 -122 138 -267 137 -229 -3 -609 -146 -875 -331 -331 -229 -630 -576 -812 -942 -45 -90 -364 -933 -1148 -3035 -597 -1600 -1091 -2921 -1097 -2933 -14 -27 -57 -52 -88 -52 -31 0 -76 29 -89 57 -6 13 -506 1413 -1112 3111 -605 1698 -1120 3135 -1144 3193 -60 147 -139 302 -190 375 -100 141 -256 189 -402 124 -118 -52 -226 -217 -362 -555 -22 -55 -538 -1488 -1146 -3185 -609 -1697 -1113 -3097 -1121 -3112 -42 -80 -143 -57 -195 45 -82 159 -717 1870 -1840 4950 -192 527 -365 989 -384 1027 -190 376 -566 849 -818 1027 -259 182 -667 300 -909 263z" />
                    <path d="M37820 27756 c-133 -38 -214 -111 -260 -232 l-20 -55 0 -4923 -1 -4924 24 -65 c63 -172 189 -285 372 -332 148 -38 261 -40 2425 -38 2452 2 3297 11 3350 35 187 86 169 380 -41 678 -67 96 -222 248 -327 323 -176 126 -415 226 -627 262 -92 16 -246 17 -1861 15 -1178 0 -1769 2 -1787 9 -15 6 -36 25 -47 43 -20 33 -20 52 -20 1845 0 1105 4 1821 9 1836 6 14 20 35 32 46 l23 21 1122 0 c716 0 1159 4 1225 11 205 20 383 71 554 156 396 198 578 457 579 823 1 126 -12 170 -62 208 l-35 27 -1686 5 c-1378 4 -1690 7 -1709 18 -54 31 -52 -28 -52 1450 0 950 3 1378 11 1400 23 67 -142 62 1981 62 1272 0 1952 4 2008 10 367 45 699 276 860 598 58 116 81 213 87 367 9 216 -22 299 -121 324 -70 17 -5945 14 -6006 -3z" />
                    <path d="M27721 27729 c-60 -12 -127 -46 -151 -76 -11 -14 -28 -49 -38 -77 -16 -48 -17 -321 -20 -5041 -2 -3429 1 -5011 8 -5058 17 -111 55 -168 135 -204 37 -16 86 -18 580 -21 483 -3 547 -1 604 14 85 23 132 68 157 149 18 58 19 223 19 5070 0 4882 0 5012 -19 5079 -22 81 -60 124 -133 152 -44 17 -89 19 -573 20 -289 1 -545 -2 -569 -7z" />
                    <path d="M34735 27733 c-619 -43 -1207 -293 -1654 -706 -46 -43 -293 -333 -606 -712 -1784 -2159 -2662 -3209 -2907 -3472 -99 -107 -129 -153 -153 -237 -33 -113 0 -238 88 -333 24 -26 797 -956 1717 -2066 1175 -1419 1710 -2057 1799 -2146 200 -202 426 -386 667 -544 396 -260 821 -348 1349 -282 66 8 145 18 177 21 31 3 75 15 99 27 114 58 114 160 0 312 -21 28 -966 1148 -2099 2490 -2034 2406 -2062 2440 -2062 2482 0 38 8 51 88 146 48 58 962 1138 2032 2401 1070 1263 1958 2318 1973 2345 78 137 24 242 -138 270 -57 10 -252 12 -370 4z" />
                  </g>
                </svg>
              </motion.div>

              {/* Tagline */}
              <motion.p
                className="pwa-ob-welcome-tagline"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease, delay: 0.6 }}
              >
                Sé lo que <span className="pwa-ob-bold">admiras</span>
              </motion.p>
            </div>

            {/* CTA at bottom */}
            <motion.button
              className="pwa-ob-cta pwa-ob-welcome-cta"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.6, ease, delay: 1.0 }}
              onClick={start}
            >
              Comenzar
            </motion.button>
          </motion.div>
        )}

        {/* ── Education ── */}
        {phase === 'education' && (
          <motion.div
            key="education"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease }}
            style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}
          >
            {eduStep > 0 && <div className="pwa-ob-tap-left" onClick={eduPrev} />}
            {eduStep < 2 && <div className="pwa-ob-tap-right" onClick={eduNext} />}

            <div className="pwa-ob-scene">
              <svg viewBox="0 0 300 300" fill="none" style={{ overflow: 'visible' }}>
                <Connections step={eduStep} />
                <AmbientParticles />
                <ProgramCard step={eduStep} />
                {SIZES.map((_, i) => <Figure key={i} idx={i} step={eduStep} />)}
                <PulseWave step={eduStep} />
                <FlowParticles step={eduStep} />
              </svg>
            </div>

            <div className="pwa-ob-text">
              <AnimatePresence mode="wait">
                <motion.h1
                  key={eduStep}
                  className="pwa-ob-copy"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.45, ease }}
                >
                  {eduStep === 0 && (
                    <><span className="pwa-ob-bold">Descubre</span> los mejores<br />coaches y atletas</>
                  )}
                  {eduStep === 1 && (
                    <>Entrena con <span className="pwa-ob-bold">su programa</span><br />dise&ntilde;ado para ti</>
                  )}
                  {eduStep === 2 && (
                    <>Porque entrenar solo<br />est&aacute; <span className="pwa-ob-bold">sobrevalorado</span></>
                  )}
                </motion.h1>
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {eduStep === 2 && (
                <motion.button
                  className="pwa-ob-cta pwa-ob-cta-fixed"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.5, ease, delay: 0.6 }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={goToProfile}
                >
                  Crear perfil
                </motion.button>
              )}
            </AnimatePresence>

            <div className="pwa-ob-nav">
              <motion.button
                className="pwa-ob-nav-arrow"
                onClick={eduPrev}
                initial={{ opacity: 0 }}
                animate={{ opacity: eduStep > 0 ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                style={{ pointerEvents: eduStep > 0 ? 'auto' : 'none' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </motion.button>

              <div className="pwa-ob-dots">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="pwa-ob-dot"
                    animate={{
                      width: i === eduStep ? 24 : 6,
                      opacity: i === eduStep ? 1 : 0.3,
                      background: i === eduStep
                        ? 'rgba(255,87,168,0.5)'
                        : 'rgba(255,255,255,0.15)',
                    }}
                    transition={{ duration: 0.4, ease }}
                  />
                ))}
              </div>

              <motion.button
                className="pwa-ob-nav-arrow"
                onClick={eduNext}
                animate={{ opacity: eduStep < 2 ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                style={{ pointerEvents: eduStep < 2 ? 'auto' : 'none' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Profile ── */}
        {phase === 'profile' && (
          <motion.div
            key="profile"
            className="pwa-ob-profile"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease }}
          >
            <motion.button
              className="pwa-ob-back"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              onClick={() => { setPhase('education'); setEduStep(2); }}
            >
              &larr;
            </motion.button>

            <div className="pwa-ob-profile-scroll">

              {/* ── Hero: Avatar + Title ── */}
              <div className="pwa-ob-profile-hero">
                <motion.div
                  className="pwa-ob-photo-wrap"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...morph, delay: 0.1 }}
                >
                  <div className="pwa-ob-photo-glow" />
                  <div
                    className="pwa-ob-photo"
                    onClick={() => photoRef.current?.click()}
                  >
                    {profile.photoPreview ? (
                      <img src={profile.photoPreview} className="pwa-ob-photo-img" alt="" />
                    ) : (
                      <div className="pwa-ob-photo-placeholder">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </div>
                    )}
                    <input
                      ref={photoRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handlePhotoSelect}
                    />
                  </div>
                </motion.div>

                <motion.h1
                  className="pwa-ob-profile-title"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease, delay: 0.15 }}
                >
                  Crea tu <span className="pwa-ob-bold">perfil</span>
                </motion.h1>
              </div>

              {/* ── Section: Identidad ── */}
              <motion.div
                className="pwa-ob-section"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease, delay: 0.3 }}
              >
                <div className="pwa-ob-section-header">
                  <span className="pwa-ob-section-label">Identidad</span>
                  <motion.div
                    className="pwa-ob-section-line"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.6, ease, delay: 0.45 }}
                  />
                </div>
                <div className="pwa-ob-section-fields">
                  <motion.div
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, ease, delay: 0.4 }}
                  >
                    <input
                      className="pwa-ob-input"
                      type="text"
                      placeholder="Tu nombre"
                      value={profile.name}
                      onChange={e => setField('name', e.target.value)}
                      autoCapitalize="words"
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, ease, delay: 0.48 }}
                  >
                    <input
                      className="pwa-ob-input"
                      type="text"
                      placeholder="@usuario"
                      value={profile.username}
                      onChange={e => {
                        const v = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
                        setField('username', v);
                        checkUsername(v);
                      }}
                    />
                    {usernameStatus === 'checking' && (
                      <span className="pwa-ob-field-hint">Verificando...</span>
                    )}
                    {usernameStatus === 'taken' && (
                      <span className="pwa-ob-field-hint pwa-ob-field-error">Este usuario ya esta en uso</span>
                    )}
                    {usernameStatus === 'available' && (
                      <span className="pwa-ob-field-hint pwa-ob-field-success">Usuario disponible</span>
                    )}
                  </motion.div>
                </div>
              </motion.div>

              {/* ── Section: Sobre ti ── */}
              <motion.div
                className="pwa-ob-section"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease, delay: 0.5 }}
              >
                <div className="pwa-ob-section-header">
                  <span className="pwa-ob-section-label">Sobre ti</span>
                  <motion.div
                    className="pwa-ob-section-line"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.6, ease, delay: 0.65 }}
                  />
                </div>
                <div className="pwa-ob-section-fields">
                  <motion.div
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, ease, delay: 0.58 }}
                  >
                    <div
                      className={`pwa-ob-input pwa-ob-date-display ${profile.birthDate ? 'filled' : ''}`}
                    >
                      {profile.birthDate ? formatDate(profile.birthDate) : 'Fecha de nacimiento'}
                      <input
                        ref={dateRef}
                        type="date"
                        className="pwa-ob-date-native"
                        value={profile.birthDate}
                        max={getMaxBirthDate()}
                        onChange={e => setField('birthDate', e.target.value)}
                      />
                    </div>
                  </motion.div>

                  <motion.div
                    className="pwa-ob-pill-row-profile"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, ease, delay: 0.64 }}
                  >
                    {[{ v: 'male', l: 'Hombre' }, { v: 'female', l: 'Mujer' }, { v: 'other', l: 'Otro' }].map(g => (
                      <button
                        key={g.v}
                        className={`pwa-ob-pill-profile ${profile.gender === g.v ? 'active' : ''}`}
                        onClick={() => setField('gender', g.v)}
                      >
                        {g.l}
                      </button>
                    ))}
                  </motion.div>
                </div>
              </motion.div>

              {/* ── Section: Ubicacion ── */}
              <motion.div
                className="pwa-ob-section"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease, delay: 0.7 }}
              >
                <div className="pwa-ob-section-header">
                  <span className="pwa-ob-section-label">Ubicaci&oacute;n</span>
                  <motion.div
                    className="pwa-ob-section-line"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.6, ease, delay: 0.85 }}
                  />
                </div>
                <div className="pwa-ob-section-fields">
                  <motion.div
                    className="pwa-ob-location-row"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, ease, delay: 0.78 }}
                  >
                    <div className="pwa-ob-select-wrap">
                      <div className={`pwa-ob-input pwa-ob-select-display ${profile.country ? 'filled' : ''}`}>
                        <span className="pwa-ob-select-text">
                          {profile.country
                            ? countries.find(c => c.value === profile.country)?.label || profile.country
                            : 'Pa\u00eds'}
                        </span>
                        <svg className="pwa-ob-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                      <select
                        className="pwa-ob-select-native"
                        value={profile.country}
                        onChange={e => { setField('country', e.target.value); setField('city', ''); }}
                      >
                        <option value="">Pa&iacute;s</option>
                        {countries.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div className="pwa-ob-select-wrap">
                      <div className={`pwa-ob-input pwa-ob-select-display ${profile.city ? 'filled' : ''}`}>
                        <span className="pwa-ob-select-text">
                          {profile.city || 'Ciudad'}
                        </span>
                        <svg className="pwa-ob-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                      <select
                        className="pwa-ob-select-native"
                        value={profile.city}
                        onChange={e => setField('city', e.target.value)}
                        disabled={!profile.country}
                      >
                        <option value="">Ciudad</option>
                        {getCities().map((c, i) => {
                          const name = typeof c === 'string' ? c : c.name;
                          return <option key={i} value={name}>{name}</option>;
                        })}
                      </select>
                    </div>
                  </motion.div>
                </div>
              </motion.div>

              {/* ── Section: Tu punto de partida ── */}
              <motion.div
                className="pwa-ob-section"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease, delay: 0.88 }}
              >
                <div className="pwa-ob-section-header">
                  <span className="pwa-ob-section-label">Tu punto de partida</span>
                  <motion.div
                    className="pwa-ob-section-line"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.6, ease, delay: 1.0 }}
                  />
                </div>
                <div className="pwa-ob-section-fields">
                  <motion.div
                    className="pwa-ob-metric-row-profile"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, ease, delay: 0.95 }}
                  >
                    <div className="pwa-ob-metric-field">
                      <input
                        className="pwa-ob-input pwa-ob-metric-input"
                        type="number"
                        placeholder="75"
                        value={profile.weight}
                        onChange={e => setField('weight', e.target.value)}
                      />
                      <span className="pwa-ob-metric-unit">kg</span>
                    </div>
                    <div className="pwa-ob-metric-field">
                      <input
                        className="pwa-ob-input pwa-ob-metric-input"
                        type="number"
                        placeholder="170"
                        value={profile.height}
                        onChange={e => setField('height', e.target.value)}
                      />
                      <span className="pwa-ob-metric-unit">cm</span>
                    </div>
                  </motion.div>
                </div>
              </motion.div>

              <div style={{ height: 100 }} />
            </div>

            {/* Profile CTA */}
            <motion.div
              className="pwa-ob-profile-cta"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease, delay: 1.05 }}
            >
              <button
                className={`pwa-ob-cta ${!isProfileValid ? 'disabled' : ''}`}
                onClick={isProfileValid ? goToCompletion : undefined}
              >
                Continuar
              </button>
            </motion.div>
          </motion.div>
        )}

        {/* ── Completion ── */}
        {phase === 'completion' && (
          <motion.div
            key="completion"
            className="pwa-ob-completion"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease }}
          >
            <AnimatePresence mode="wait">
              {completionStep === 'loading' && (
                <motion.div
                  key="loading"
                  className="pwa-ob-loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, ease }}
                >
                  <div className="pwa-ob-loading-rings">
                    <div className="pwa-ob-pulse-ring" />
                    <div className="pwa-ob-pulse-ring pwa-ob-pulse-ring-2" />
                    <div className="pwa-ob-pulse-ring pwa-ob-pulse-ring-3" />
                  </div>
                  <p className="pwa-ob-loading-text">{loadingPhrase}</p>
                </motion.div>
              )}

              {completionStep === 'check' && (
                <motion.div
                  key="check"
                  className="pwa-ob-check"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.35, ease }}
                >
                  <svg className="pwa-ob-check-svg" viewBox="0 0 80 80" fill="none">
                    <motion.circle
                      cx="40" cy="40" r="36"
                      stroke="rgba(255,87,168,0.4)"
                      strokeWidth="2.5"
                      fill="none"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.6, ease }}
                    />
                    <motion.path
                      d="M24 41 L35 52 L56 28"
                      stroke="rgba(255,87,168,0.9)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.4, ease, delay: 0.45 }}
                    />
                  </svg>
                </motion.div>
              )}

              {completionStep === 'done' && (
                <motion.div
                  key="done"
                  className="pwa-ob-done"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, ease }}
                >
                  <div className="pwa-ob-done-content">
                    <motion.img
                      src={_logoUri}
                      alt=""
                      className="pwa-ob-done-logo"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.7, ease, delay: 0.1 }}
                    />

                    <motion.h1
                      className="pwa-ob-done-title"
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, ease, delay: 0.2 }}
                    >
                      {firstName ? `\u00a1Bienvenido, ${firstName}!` : '\u00a1Todo listo!'}
                    </motion.h1>

                    <motion.p
                      className="pwa-ob-done-message"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.6, ease, delay: 0.4 }}
                    >
                      Wake es donde mides lo que antes solo sent&iacute;as.
                    </motion.p>
                  </div>

                  <motion.div
                    className="pwa-ob-done-bottom"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease, delay: 0.6 }}
                  >
                    <button
                      className="pwa-ob-done-cta"
                      onClick={enterApp}
                    >
                      Entrar a Wake
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
