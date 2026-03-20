import React, { useMemo, useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { FixedWakeHeader, WakeHeaderSpacer, WakeHeaderContent } from '../components/WakeHeader';
import BottomSpacer from '../components/BottomSpacer';
import WakeLoader from '../components/WakeLoader';
import LabNutritionPie from '../components/LabNutritionPie';
import LabStrengthChart from '../components/LabStrengthChart';
import LabVolumeBarChart from '../components/LabVolumeBarChart';
import LabRpeChart from '../components/LabRpeChart';
import LabNutritionAdherenceChart from '../components/LabNutritionAdherenceChart';
import LabProteinMealBars from '../components/LabProteinMealBars';
import LabEnergyAvailabilityChart from '../components/LabEnergyAvailabilityChart';
import LabConsistencyGrid from '../components/LabConsistencyGrid';
import LabReadinessChart from '../components/LabReadinessChart';
import LabMuscleHeatmap from '../components/LabMuscleHeatmap.web.jsx';
import LabReadinessRpeScatter from '../components/LabReadinessRpeScatter.web.jsx';
import LabWeightChart from '../components/LabWeightChart.web.jsx';
import { WakeModalOverlay } from '../components/WakeModalOverlay.web';
import { useNavigate } from 'react-router-dom';
import { consumePendingOpenBodyEntry } from '../navigation/openBodyEntryFlag';
import bodyProgressService from '../services/bodyProgressService';
import exerciseHistoryService from '../services/exerciseHistoryService';
import oneRepMaxService from '../services/oneRepMaxService';
import apiClient from '../utils/apiClient';
import { getReadinessInRange } from '../services/readinessService';
import { getDiaryEntriesInRange, getEffectivePlanForUser } from '../services/nutritionFirestoreService';
import {
  getMondayWeek,
  getPreviousWeekKey,
  getWeekDates,
  formatWeekDisplay,
} from '../utils/weekCalculation';
import logger from '../utils/logger';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIMES, GC_TIMES } from '../config/queryConfig';

// ─── CSS ───────────────────────────────────────────────────────────────────────

if (typeof document !== 'undefined') {
  const ID = 'lab-web-v2-css';
  if (!document.getElementById(ID)) {
    const s = document.createElement('style');
    s.id = ID;
    s.textContent = `
      @keyframes labOrbDrift1 { from { transform: translate(0,0) scale(1); } to { transform: translate(-28px,44px) scale(1.08); } }
      @keyframes labOrbDrift2 { from { transform: translate(0,0) scale(1); } to { transform: translate(38px,-32px) scale(0.92); } }
      @keyframes labOrbDrift3 { from { transform: translate(0,0) scale(1); } to { transform: translate(-18px,26px) scale(1.06); } }
      @keyframes labScreenEnter { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes labFabPulse { 0%,100% { box-shadow: 0 0 0 0 var(--lab-fab-glow,rgba(74,222,128,0.45)); } 60% { box-shadow: 0 0 0 14px transparent; } }
      .lab-screen-anim { animation: labScreenEnter 0.42s cubic-bezier(0.22,1,0.36,1) both; }
      .drum-picker-scroll::-webkit-scrollbar { display: none; }
      @keyframes labTilePulse { 0%,100% { box-shadow: 0 0 0 0 var(--lab-accent-glow,rgba(255,255,255,0.35)); } 60% { box-shadow: 0 0 0 12px transparent; } }
      @keyframes labShimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
      @keyframes labNumReveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes labSubtabEnter { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes labInsightFade { from { opacity: 0; } to { opacity: 1; } }
      .lab-hero-tile-1 { animation: labScreenEnter 0.42s cubic-bezier(0.22,1,0.36,1) 0.05s both; }
      .lab-hero-tile-2 { animation: labScreenEnter 0.42s cubic-bezier(0.22,1,0.36,1) 0.13s both; }
      .lab-hero-tile-3 { animation: labScreenEnter 0.42s cubic-bezier(0.22,1,0.36,1) 0.21s both; }
      .lab-num-reveal { animation: labNumReveal 0.5s cubic-bezier(0.22,1,0.36,1) 0.3s both; }
      .lab-subtab-enter { animation: labSubtabEnter 0.3s cubic-bezier(0.22,1,0.36,1) both; }
      .lab-insight-shimmer { position: relative; overflow: hidden; }
      .lab-insight-shimmer::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%); transform: translateX(-100%); animation: labShimmer 2.5s ease-in-out 1.2s infinite; pointer-events: none; border-radius: inherit; }
    `;
    document.head.appendChild(s);
  }
}

// ─── constants ────────────────────────────────────────────────────────────────

const CARD_MARGIN = 24;

// ─── helpers ──────────────────────────────────────────────────────────────────

function toYYYYMMDD(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
}

function parseIntensity(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isNaN(v) ? null : v;
}

function aggregateDiaryByDay(entries) {
  const byDay = {};
  entries.forEach(e => {
    if (!e.date) return;
    if (!byDay[e.date]) byDay[e.date] = { calories:0, protein:0, carbs:0, fat:0, count:0 };
    byDay[e.date].calories += Number(e.calories)||0;
    byDay[e.date].protein  += Number(e.protein)||0;
    byDay[e.date].carbs    += Number(e.carbs)||0;
    byDay[e.date].fat      += Number(e.fat)||0;
    byDay[e.date].count    += 1;
  });
  return byDay;
}

function averageMacrosLast7AndPrev7(byDay, todayStr) {
  if (!byDay || Object.keys(byDay).length === 0) return null;
  const today = new Date(todayStr + 'T12:00:00');
  const last7=[], prev7=[];
  for (let i=0;i<7;i++){const d=new Date(today);d.setDate(d.getDate()-i);last7.push(toYYYYMMDD(d));}
  for (let i=7;i<14;i++){const d=new Date(today);d.setDate(d.getDate()-i);prev7.push(toYYYYMMDD(d));}
  const avg=(dates,key)=>dates.map(d=>byDay[d]?.[key]||0).reduce((s,v)=>s+v,0)/dates.length;
  const l={calories:avg(last7,'calories'),protein:avg(last7,'protein'),carbs:avg(last7,'carbs'),fat:avg(last7,'fat')};
  const p={calories:avg(prev7,'calories'),protein:avg(prev7,'protein'),carbs:avg(prev7,'carbs'),fat:avg(prev7,'fat')};
  const pct=(c,pr)=>pr>0?Math.round(((c-pr)/pr)*100):(c>0?100:0);
  return {last7:l,prev7:p,pctCalories:pct(l.calories,p.calories),pctProtein:pct(l.protein,p.protein),pctCarbs:pct(l.carbs,p.carbs),pctFat:pct(l.fat,p.fat)};
}

function formatDaysAgo(iso) {
  if (!iso) return '';
  const days=Math.floor((Date.now()-new Date(iso))/86400000);
  if(days===0)return'Hoy';if(days===1)return'Ayer';
  if(days<7)return`Hace ${days} días`;if(days<30)return`Hace ${Math.floor(days/7)} sem`;
  return`Hace ${Math.floor(days/30)} mes`;
}

function getAdherenceColor(pct){
  if(pct==null)return'rgba(255,255,255,0.45)';
  if(pct>=90)return'#4ade80';if(pct>=70)return'rgba(255,255,255,0.95)';return'#f87171';
}

function formatSetsNumber(value){
  const n=Number(value||0);if(!Number.isFinite(n))return'0';
  return parseFloat((Math.round(n*100)/100).toFixed(2)).toString();
}

function formatBodyDate(dateStr) {
  if (!dateStr) return '';
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const [, m, d] = dateStr.split('-');
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
}

function computeWeightSlope(entries, days) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-days);
  const cutoffStr = toYYYYMMDD(cutoff);
  const data = entries.filter(e=>e.weight!=null&&e.date>=cutoffStr)
    .map(e=>({x:new Date(e.date+'T12:00:00').getTime(),y:e.weight}));
  if (data.length<3) return null;
  const n=data.length, meanX=data.reduce((s,d)=>s+d.x,0)/n, meanY=data.reduce((s,d)=>s+d.y,0)/n;
  const num=data.reduce((s,d)=>s+(d.x-meanX)*(d.y-meanY),0);
  const den=data.reduce((s,d)=>s+Math.pow(d.x-meanX,2),0);
  if(den===0)return null;
  return Math.round((num/den)*7*24*60*60*1000*10)/10;
}

function compute7DayMA(chartData) {
  return chartData.map((d,i,arr)=>{
    const win=arr.slice(Math.max(0,i-6),i+1);
    return {...d, ma:Math.round(win.reduce((s,w)=>s+w.value,0)/win.length*10)/10};
  });
}

// ─── WeightDrumPicker ─────────────────────────────────────────────────────────

const DRUM_ITEM_H = 65;
const KG_STEP = 0.1;
const LBS_STEP = 0.2;

function WeightDrumPicker({ value, unit, onChange }) {
  const values = useMemo(() => {
    const arr = [];
    const step = unit === 'lbs' ? LBS_STEP : KG_STEP;
    const [lo, hi] = unit === 'lbs' ? [66, 660] : [30, 300];
    for (let v = lo; v <= hi + 0.001; v = Math.round((v + step) * 100) / 100) {
      arr.push(Math.round(v * 10) / 10);
    }
    return arr;
  }, [unit]);

  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const suppressRef = useRef(false);
  const prevUnitRef = useRef(unit);
  const userHasScrolled = useRef(false);

  const getIdx = useCallback(
    (val) => {
      if (val == null) return Math.floor(values.length / 2);
      let bestIdx = 0, bestDist = Infinity;
      for (let i = 0; i < values.length; i++) {
        const d = Math.abs(values[i] - val);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      return bestIdx;
    },
    [values],
  );

  useLayoutEffect(() => {
    if (!containerRef.current || value == null || userHasScrolled.current) return;
    suppressRef.current = true;
    containerRef.current.scrollTop = getIdx(value) * DRUM_ITEM_H;
    const t = setTimeout(() => { suppressRef.current = false; }, 300);
    return () => clearTimeout(t);
  }, [value, getIdx]);

  useLayoutEffect(() => {
    if (prevUnitRef.current === unit) return;
    prevUnitRef.current = unit;
    userHasScrolled.current = false;
    if (!containerRef.current) return;
    suppressRef.current = true;
    containerRef.current.scrollTop = getIdx(value) * DRUM_ITEM_H;
    const t = setTimeout(() => { suppressRef.current = false; }, 300);
    return () => clearTimeout(t);
  }, [unit, value, getIdx]);

  const handleScroll = () => {
    if (suppressRef.current) return;
    userHasScrolled.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      const idx = Math.max(0, Math.min(
        Math.round(containerRef.current.scrollTop / DRUM_ITEM_H),
        values.length - 1,
      ));
      containerRef.current.scrollTop = idx * DRUM_ITEM_H;
      onChange(values[idx]);
    }, 80);
  };

  return (
    <div style={{ position: 'relative', height: DRUM_ITEM_H * 3, overflow: 'hidden', userSelect: 'none' }}>
      <div style={{
        position: 'absolute', top: DRUM_ITEM_H, left: 16, right: 16, height: DRUM_ITEM_H,
        backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
        borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)',
        pointerEvents: 'none', zIndex: 1,
      }} />
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: DRUM_ITEM_H,
        background: 'linear-gradient(to bottom, rgba(26,26,26,1) 0%, rgba(26,26,26,0) 100%)',
        pointerEvents: 'none', zIndex: 2,
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: DRUM_ITEM_H,
        background: 'linear-gradient(to top, rgba(26,26,26,1) 0%, rgba(26,26,26,0) 100%)',
        pointerEvents: 'none', zIndex: 2,
      }} />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="drum-picker-scroll"
        style={{
          height: '100%', overflowY: 'scroll', scrollSnapType: 'y mandatory',
          paddingTop: DRUM_ITEM_H, paddingBottom: DRUM_ITEM_H, scrollbarWidth: 'none',
        }}
      >
        {values.map((v) => (
          <div
            key={v}
            style={{
              height: DRUM_ITEM_H, scrollSnapAlign: 'center',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: '500', color: 'rgba(255,255,255,0.85)',
            }}
          >
            {Number.isInteger(v) ? v : v.toFixed(1)} {unit}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PhotoLightbox ────────────────────────────────────────────────────────────

function PhotoLightbox({ photo, onClose, onDelete }) {
  const ANGLE_LABELS = { front: 'Frente', back: 'Espalda', side: 'Lateral' };
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)',
        zIndex: 2147483647, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        animation: 'wFadeIn 0.2s ease both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 12px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 20,
            color: '#fff', fontSize: 14, fontWeight: '600', padding: '8px 16px', cursor: 'pointer',
          }}
        >
          Cerrar
        </button>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500' }}>
          {photo.angle ? ANGLE_LABELS[photo.angle] || photo.angle : ''}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            background: 'rgba(224,84,84,0.15)', border: '1px solid rgba(224,84,84,0.3)',
            borderRadius: 20, color: 'rgba(255,100,100,0.9)', fontSize: 14, fontWeight: '600',
            padding: '8px 16px', cursor: 'pointer',
          }}
        >
          Eliminar
        </button>
      </div>
      <img
        src={photo.storageUrl}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain',
          borderRadius: 12,
          animation: 'wScaleIn 0.3s var(--ease-spring) both',
        }}
      />
    </div>
  );
}

// ─── BodyEntryModal ───────────────────────────────────────────────────────────

const ANGLE_LABELS = { front: 'Frente', back: 'Espalda', side: 'Lateral' };
const ANGLES = ['front', 'back', 'side'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatEntryDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(day, 10)} de ${months[parseInt(month, 10) - 1]}, ${year}`;
}

function BodyEntryModal({ visible, onClose, entry, userId, unit, onUnitChange, onSaved, defaultWeightKg = 70 }) {
  const isEditing = entry != null;

  const [dateStr, setDateStr] = useState(todayStr);
  const [weightKg, setWeightKg] = useState(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [originalPhotos, setOriginalPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingAngle, setUploadingAngle] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [photoPicking, setPhotoPicking] = useState('idle');

  const fileInputRefs = useRef({});
  const confirmDeleteTimerRef = useRef(null);

  useLayoutEffect(() => {
    if (!visible) return;
    if (isEditing && entry) {
      setDateStr(entry.date || todayStr());
      setWeightKg(entry.weight ?? defaultWeightKg ?? 70);
      setNote(entry.note || '');
      setPhotos(entry.photos || []);
      setOriginalPhotos(entry.photos || []);
    } else {
      setDateStr(todayStr());
      setWeightKg(defaultWeightKg ?? 70);
      setNote('');
      setPhotos([]);
      setOriginalPhotos([]);
    }
    setSaving(false);
    setDeleting(false);
    setConfirmDelete(false);
    setUploadingAngle(null);
    setPhotoPicking('idle');
  }, [visible, isEditing, entry, defaultWeightKg]);

  const displayWeight = unit === 'lbs' && weightKg != null
    ? Math.round(weightKg * 2.20462 * 10) / 10
    : weightKg;

  const handleWeightChange = (val) => {
    const kg = unit === 'lbs' ? Math.round((val / 2.20462) * 100) / 100 : val;
    setWeightKg(kg);
  };

  const pickAngle = (angle) => {
    setPhotoPicking('idle');
    if (!fileInputRefs.current[angle]) return;
    fileInputRefs.current[angle].click();
  };

  const handleFileChange = async (angle, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;
    setUploadingAngle(angle);
    setUploadProgress(0);
    try {
      const photo = await bodyProgressService.uploadPhoto(
        userId, dateStr, file, angle,
        (pct) => setUploadProgress(pct),
      );
      setPhotos((prev) => [...prev, photo]);
    } catch (err) {
      logger.error('[BodyEntryModal] photo upload error', err?.message);
    } finally {
      setUploadingAngle(null);
      setUploadProgress(0);
    }
  };

  const handleDeletePhoto = async (photo) => {
    setLightboxPhoto(null);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    if (originalPhotos.find((p) => p.id === photo.id)) {
      await bodyProgressService.cleanupPhoto(photo.storagePath);
    }
  };

  const handleSave = async () => {
    if (!userId || saving) return;
    setSaving(true);
    try {
      await bodyProgressService.saveEntry(userId, dateStr, {
        weight: weightKg !== null ? weightKg : undefined,
        note: note.trim() || undefined,
        photos: photos.length > 0 ? photos : undefined,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      logger.error('[BodyEntryModal] save error', err?.message);
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    const newPhotos = photos.filter((p) => !originalPhotos.find((o) => o.id === p.id));
    await Promise.all(newPhotos.map((p) => bodyProgressService.cleanupPhoto(p.storagePath)));
    onClose();
  };

  const handleDeleteEntry = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      confirmDeleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    if (!userId || deleting) return;
    clearTimeout(confirmDeleteTimerRef.current);
    setDeleting(true);
    try {
      await bodyProgressService.deleteEntry(userId, dateStr);
      onSaved?.();
      onClose();
    } catch (err) {
      logger.error('[BodyEntryModal] delete error', err?.message);
      setDeleting(false);
    }
  };

  return (
    <>
      <WakeModalOverlay
        visible={visible}
        onClose={handleCancel}
        contentAnimation="slideUp"
        contentPlacement="full"
      >
        <div
          className="wake-modal-panel"
          style={{
            width: '100%', maxHeight: '95vh', overflowY: 'auto',
            display: 'flex', flexDirection: 'column',
            backgroundColor: '#1a1a1a',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2, flexShrink: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 20px 12px', flexShrink: 0,
          }}>
            <button
              onClick={handleCancel}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)',
                fontSize: 16, cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit',
              }}
            >
              Cancelar
            </button>
            <span style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>
              {isEditing ? 'Editar registro' : 'Nuevo registro'}
            </span>
            <div style={{ width: 70 }} />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 28px' }}>
            {/* Date */}
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
                Fecha
              </p>
              <div style={{ position: 'relative' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px',
                }}>
                  <span style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>
                    {formatEntryDate(dateStr)}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 16 }}>›</span>
                </div>
                <input
                  type="date"
                  value={dateStr}
                  onChange={(e) => e.target.value && setDateStr(e.target.value)}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', fontSize: 16, width: '100%' }}
                />
              </div>
            </div>

            {/* Weight */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <p style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  Peso
                </p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['kg', 'lbs'].map((u) => (
                    <button
                      key={u}
                      onClick={() => onUnitChange(u)}
                      style={{
                        padding: '7px 20px', borderRadius: 999, border: '1px solid',
                        borderColor: unit === u ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.12)',
                        backgroundColor: unit === u ? 'rgba(255,255,255,0.12)' : 'transparent',
                        color: unit === u ? '#fff' : 'rgba(255,255,255,0.35)',
                        fontSize: 12, fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                      }}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <WeightDrumPicker value={displayWeight} unit={unit} onChange={handleWeightChange} />
            </div>

            {/* Photos */}
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
                Fotos
              </p>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {photos.map((photo) => (
                  <div key={photo.id} style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      onClick={() => setLightboxPhoto(photo)}
                      style={{
                        width: 68, height: 68, borderRadius: 10, overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.12)', background: 'none',
                        cursor: 'pointer', padding: 0, display: 'block',
                      }}
                    >
                      <img src={photo.storageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                    <span style={{
                      position: 'absolute', bottom: 4, left: 0, right: 0,
                      textAlign: 'center', fontSize: 9, fontWeight: '600',
                      color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      textTransform: 'uppercase', letterSpacing: 0.4,
                    }}>
                      {ANGLE_LABELS[photo.angle]}
                    </span>
                  </div>
                ))}
                {uploadingAngle != null ? (
                  <div style={{
                    width: 68, height: 68, borderRadius: 10, flexShrink: 0,
                    border: '1.5px solid rgba(255,255,255,0.15)',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>
                      {uploadProgress}%
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => setPhotoPicking(photoPicking === 'picking' ? 'idle' : 'picking')}
                    style={{
                      width: 68, height: 68, borderRadius: 10, flexShrink: 0,
                      border: '1.5px dashed rgba(255,255,255,0.25)',
                      backgroundColor: photoPicking === 'picking' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'background 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 24, color: 'rgba(255,255,255,0.45)', lineHeight: 1 }}>+</span>
                  </button>
                )}
                {ANGLES.map((angle) => (
                  <input
                    key={angle}
                    type="file"
                    accept="image/*"
                    ref={(el) => { fileInputRefs.current[angle] = el; }}
                    onChange={(e) => handleFileChange(angle, e)}
                    style={{ display: 'none' }}
                  />
                ))}
              </div>
              {photoPicking === 'picking' && (
                <div style={{
                  marginTop: 10, padding: '12px 14px',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
                  animation: 'wFadeIn 0.15s ease both',
                }}>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 10 }}>
                    Seleccionar ángulo
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {ANGLES.map((angle) => (
                      <button
                        key={angle}
                        onClick={() => pickAngle(angle)}
                        style={{
                          flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)',
                          backgroundColor: 'rgba(255,255,255,0.07)', color: '#fff',
                          fontSize: 13, fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {ANGLE_LABELS[angle]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
                Notas
              </p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Agregar una nota..."
                rows={2}
                style={{
                  width: '100%', backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
                  padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: 'inherit',
                  resize: 'none', outline: 'none', boxSizing: 'border-box',
                  caretColor: '#fff',
                }}
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving || weightKg === null}
              style={{
                width: '100%', paddingTop: 14, paddingBottom: 14, borderRadius: 14,
                backgroundColor: (saving || weightKg === null) ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.95)',
                border: 'none', color: '#1a1a1a', fontSize: 15, fontWeight: '700',
                cursor: (saving || weightKg === null) ? 'default' : 'pointer',
                fontFamily: 'inherit', transition: 'background 0.2s',
              }}
            >
              {saving ? 'Guardando…' : (isEditing ? 'Guardar cambios' : 'Guardar')}
            </button>

            {isEditing && (
              <button
                onClick={handleDeleteEntry}
                disabled={deleting}
                style={{
                  width: '100%', marginTop: 10, padding: '9px 0',
                  background: 'none', border: 'none',
                  color: confirmDelete ? '#ff6b6b' : 'rgba(255,100,100,0.7)',
                  fontSize: 14, fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {deleting ? 'Eliminando…' : (confirmDelete ? '¿Confirmar?' : 'Eliminar registro')}
              </button>
            )}
          </div>
        </div>
      </WakeModalOverlay>

      {lightboxPhoto && (
        <PhotoLightbox
          photo={lightboxPhoto}
          onClose={() => setLightboxPhoto(null)}
          onDelete={() => handleDeletePhoto(lightboxPhoto)}
        />
      )}
    </>
  );
}

// ─── GoalWeightModal ──────────────────────────────────────────────────────────

function GoalWeightModal({ visible, onClose, currentGoal, unit, userId, onSaved }) {
  const defaultDisplay = unit === 'lbs' ? 154 : 70;
  const [goalDisplay, setGoalDisplay] = useState(defaultDisplay);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      const display = currentGoal != null
        ? (unit === 'lbs' ? Math.round(currentGoal * 2.20462 * 10) / 10 : currentGoal)
        : (unit === 'lbs' ? 154 : 70);
      setGoalDisplay(display);
      setSaving(false);
    }
  }, [visible, currentGoal, unit]);

  const handleSave = async () => {
    if (!goalDisplay || !userId || saving) return;
    setSaving(true);
    const kg = unit === 'lbs' ? Math.round((goalDisplay / 2.20462) * 100) / 100 : goalDisplay;
    try {
      await bodyProgressService.setGoalWeight(userId, kg);
      onSaved(kg);
      onClose();
    } catch (err) {
      logger.error('[GoalWeightModal] save error', err?.message);
      setSaving(false);
    }
  };

  return (
    <WakeModalOverlay visible={visible} onClose={onClose} contentAnimation="slideUp" contentPlacement="full">
      <div
        className="wake-modal-panel"
        style={{
          width: '100%', backgroundColor: '#1a1a1a',
          borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '12px 20px 36px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
        </div>
        <p style={{ color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 16 }}>
          Objetivo de peso
        </p>
        <WeightDrumPicker value={goalDisplay} unit={unit} onChange={setGoalDisplay} />
        <div style={{ height: 20 }} />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 14, border: 'none',
            backgroundColor: saving ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.95)',
            color: '#1a1a1a', fontSize: 15, fontWeight: '700',
            cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {saving ? 'Guardando…' : 'Guardar objetivo'}
        </button>
      </div>
    </WakeModalOverlay>
  );
}

// ─── EstadoScreen ─────────────────────────────────────────────────────────────

function EstadoScreen({
  userData, bodyLogEntries, weightStats, weightUnit, goalWeight,
  thisWeekSessions, proteinAdherence7d, topExercises, topInsight,
  accentRGB, onOpenBodyEntry, readinessScoreToday,
  bodyCompInference,
  sessionList, oneRepMaxHistories, readinessByDay,
}) {
  const [r, g, b] = accentRGB;
  const trainingTarget = userData?.onboardingData?.trainingDaysPerWeek || 4;

  const latestKg = bodyLogEntries.filter(e => e.weight != null).slice(-1)[0]?.weight;
  const latestDisplay = latestKg != null
    ? parseFloat((weightUnit === 'lbs' ? latestKg * 2.20462 : latestKg).toFixed(2))
    : null;
  const goalWeightDisplay = goalWeight != null
    ? parseFloat((weightUnit === 'lbs' ? goalWeight * 2.20462 : goalWeight).toFixed(2))
    : null;
  const delta30 = weightStats?.delta30;

  const glass = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 16,
  };

  // ── Muscle volume (current & previous week) ───────────────────────────────
  const currentWeekKey = getMondayWeek(new Date());
  const prevWeekKey = getPreviousWeekKey(currentWeekKey);
  const weekVolume = userData?.weeklyMuscleVolume?.[currentWeekKey] || {};
  const prevWeekVolume = userData?.weeklyMuscleVolume?.[prevWeekKey] || {};
  const thisWeekTotalSets = Object.values(weekVolume).reduce((s, v) => s + (v || 0), 0);

  const muscleGroups = useMemo(() => {
    const groups = [
      { key: 'empuje',  label: 'Empuje',  muscles: ['pecs', 'triceps', 'front_delts'] },
      { key: 'jalon',   label: 'Jalón',   muscles: ['lats', 'rhomboids', 'biceps', 'rear_delts'] },
      { key: 'piernas', label: 'Piernas', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { key: 'hombros', label: 'Hombros', muscles: ['side_delts', 'traps'] },
      { key: 'core',    label: 'Core',    muscles: ['abs', 'obliques', 'lower_back', 'hip_flexors'] },
    ];
    return groups
      .map(grp => ({ ...grp, sets: grp.muscles.reduce((s, m) => s + (weekVolume[m] || 0), 0) }))
      .filter(grp => grp.sets > 0)
      .sort((a, z) => z.sets - a.sets);
  }, [weekVolume]);

  // ── 28-day calendar ───────────────────────────────────────────────────────
  const { calendar28, trainedCount28, currentStreak } = useMemo(() => {
    const trainedDates = new Set(
      (sessionList || []).map(s => s.completedAt ? toYYYYMMDD(new Date(s.completedAt)) : null).filter(Boolean)
    );
    const today = new Date();
    const days = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const ds = toYYYYMMDD(d);
      days.push({ date: ds, trained: trainedDates.has(ds), isToday: i === 0 });
    }
    const count = days.filter(d => d.trained).length;
    let streak = 0;
    for (let i = 0; i < 90; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      if (trainedDates.has(toYYYYMMDD(d))) streak++;
      else if (i > 0) break;
    }
    return { calendar28: days, trainedCount28: count, currentStreak: streak };
  }, [sessionList]);

  // ── Recovery 7-day average ────────────────────────────────────────────────
  const recoveryAvg7d = useMemo(() => {
    const entries = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const e = readinessByDay?.[toYYYYMMDD(d)];
      if (e) entries.push(e);
    }
    if (!entries.length) return null;
    return {
      energy: Math.round(entries.reduce((s, e) => s + (e.energy || 0), 0) / entries.length * 10) / 10,
      sleep:  Math.round(entries.reduce((s, e) => s + (e.sleep  || 0), 0) / entries.length * 10) / 10,
      count:  entries.length,
    };
  }, [readinessByDay]);

  // ── Balance status pill ───────────────────────────────────────────────────
  const balanceStatus = useMemo(() => {
    const dayOfWeek = (new Date().getDay() + 6) % 7;
    const expectedSoFar = dayOfWeek >= 4 ? Math.ceil(trainingTarget * 0.6) : Math.ceil(trainingTarget * 0.3);
    const lowEnergy = readinessScoreToday !== null && readinessScoreToday < 5;
    if (thisWeekSessions >= trainingTarget && !lowEnergy) return { label: 'Semana completa', color: '#4ade80' };
    if (lowEnergy) return { label: 'Prioriza el descanso', color: '#f87171' };
    if (thisWeekSessions < Math.max(0, expectedSoFar - 1) && dayOfWeek >= 3) return { label: 'Ponle más', color: `rgb(${r},${g},${b})` };
    return { label: 'En progreso', color: `rgb(${r},${g},${b})` };
  }, [thisWeekSessions, trainingTarget, readinessScoreToday, r, g, b]);

  // ── Star lift (most improved exercise) ───────────────────────────────────
  const starLift = useMemo(() => {
    if (!topExercises.length) return null;
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    let best = null, bestGain = -Infinity;
    topExercises.forEach(ex => {
      const hist = (oneRepMaxHistories || []).find(h => h.exerciseKey === ex.key);
      if (!hist?.records?.length) return;
      const oldRecs = hist.records.filter(r => new Date(r.date) <= thirtyDaysAgo);
      if (oldRecs.length > 0 && ex.current > 0) {
        const oldVal = oldRecs[oldRecs.length - 1].value;
        const gain = ex.current - oldVal;
        if (gain > bestGain) {
          bestGain = gain;
          best = { ...ex, oldVal, gain, gainPct: oldVal > 0 ? Math.round((gain / oldVal) * 1000) / 10 : null, history: hist.records.slice(-12) };
        }
      }
    });
    if (!best) {
      const ex = topExercises[0];
      const hist = (oneRepMaxHistories || []).find(h => h.exerciseKey === ex.key);
      best = { ...ex, oldVal: null, gain: null, gainPct: null, history: hist?.records?.slice(-12) || [] };
    }
    return best;
  }, [topExercises, oneRepMaxHistories]);

  // ── Weight sparkline ──────────────────────────────────────────────────────
  const weightSparkData = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60);
    const cutoffStr = toYYYYMMDD(cutoff);
    return bodyLogEntries
      .filter(e => e.weight != null && e.date >= cutoffStr)
      .map(e => ({ date: e.date, value: parseFloat((weightUnit === 'lbs' ? e.weight * 2.20462 : e.weight).toFixed(2)) }));
  }, [bodyLogEntries, weightUnit]);

  return (
    <div style={{ paddingTop: 8 }}>

      {/* ── 1. INSIGHT ─────────────────────────────────────────────────────── */}
      {topInsight && (
        <div
          className="lab-insight-shimmer"
          style={{ ...glass, padding: '16px 18px', marginBottom: 12, borderColor: `rgba(${r},${g},${b},0.3)`, animation: 'labInsightFade 0.5s ease 0.1s both' }}
        >
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: `rgba(${r},${g},${b},0.7)`, marginBottom: 8 }}>INSIGHT</div>
          <div style={{ fontSize: '0.93rem', color: 'rgba(255,255,255,0.9)', lineHeight: 1.55, fontWeight: 500 }}>{topInsight}</div>
        </div>
      )}

      {/* ── 2. CARGA Y RECUPERACIÓN ─────────────────────────────────────────── */}
      <div style={{ ...glass, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>CARGA Y RECUPERACIÓN</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', marginBottom: proteinAdherence7d ? 14 : 0 }}>
          {/* Left: load */}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Semana</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{thisWeekSessions}</span>
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>/ {trainingTarget}</span>
            </div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)' }}>sesiones</div>
            {thisWeekTotalSets > 0 && (
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.25)', marginTop: 3 }}>{parseFloat(Number(thisWeekTotalSets).toFixed(2))} series totales</div>
            )}
          </div>
          {/* Center */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ padding: '4px 10px', borderRadius: 999, background: `rgba(${r},${g},${b},0.12)`, border: `1px solid rgba(${r},${g},${b},0.3)`, fontSize: '0.6rem', fontWeight: 700, color: balanceStatus.color, textAlign: 'center', whiteSpace: 'nowrap' }}>{balanceStatus.label}</div>
            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.08)' }} />
          </div>
          {/* Right: recovery */}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Recuperación</div>
            {recoveryAvg7d ? (
              <>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#60a5fa', lineHeight: 1 }}>{recoveryAvg7d.energy}</span>
                  <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>energía</span>
                </div>
                <div>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>{recoveryAvg7d.sleep}</span>
                  <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>sueño</span>
                </div>
                <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>prom {recoveryAvg7d.count} días</div>
              </>
            ) : (
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>Sin datos de readiness</div>
            )}
          </div>
        </div>
        {/* Protein bar */}
        {proteinAdherence7d && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)' }}>Proteína prom. 7 días</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: proteinAdherence7d.pct >= 80 ? '#4ade80' : 'rgba(255,255,255,0.8)' }}>
                {proteinAdherence7d.avg}g <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/ {proteinAdherence7d.target}g</span>
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 999, width: `${Math.min(100, proteinAdherence7d.pct)}%`, background: proteinAdherence7d.pct >= 80 ? '#4ade80' : `rgb(${r},${g},${b})`, transition: 'width 0.6s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── 3. MÚSCULO ACTIVO ───────────────────────────────────────────────── */}
      <div style={{ ...glass, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>MÚSCULO ACTIVO — ESTA SEMANA</div>
        {muscleGroups.length > 0 ? (
          <>
            <LabMuscleHeatmap weekVolume={weekVolume} previousWeekVolume={prevWeekVolume} />
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {muscleGroups.map((grp, i) => (
                <div key={grp.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.72rem', color: i === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)' }}>{grp.label}</span>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>{grp.sets} series</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.07)' }}>
                    <div style={{ height: '100%', borderRadius: 999, width: `${Math.min(100, (grp.sets / (muscleGroups[0]?.sets || 1)) * 100)}%`, background: i === 0 ? `rgb(${r},${g},${b})` : 'rgba(255,255,255,0.22)', transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ paddingBottom: 4, fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
            Completa sesiones esta semana para ver qué músculos has trabajado.
          </div>
        )}
      </div>

      {/* ── 4. TU HISTORIAL — 28 días ───────────────────────────────────────── */}
      <div style={{ ...glass, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>TU HISTORIAL</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ color: `rgb(${r},${g},${b})`, fontWeight: 700 }}>{trainedCount28}</span>
            <span> / 28 días entrenados</span>
            {currentStreak >= 2 && <span style={{ color: `rgb(${r},${g},${b})`, fontWeight: 700 }}> · {currentStreak} racha</span>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {calendar28.map(({ date, trained, isToday }) => (
            <div
              key={date}
              style={{
                aspectRatio: '1',
                borderRadius: 4,
                background: trained ? `rgba(${r},${g},${b},0.85)` : 'rgba(255,255,255,0.05)',
                border: isToday ? `1.5px solid rgba(${r},${g},${b},0.8)` : '1px solid rgba(255,255,255,0.06)',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: `rgba(${r},${g},${b},0.85)` }} />
            <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.28)' }}>Entrenado</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.28)' }}>Descanso</span>
          </div>
        </div>
      </div>

      {/* ── 5. LEVANTAMIENTO ESTRELLA ───────────────────────────────────────── */}
      {starLift && (
        <div style={{ ...glass, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>LEVANTAMIENTO ESTRELLA</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: starLift.history?.length > 1 ? 14 : 0 }}>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>{starLift.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: '2.2rem', fontWeight: 800, color: `rgb(${r},${g},${b})`, lineHeight: 1, letterSpacing: '-0.02em' }}>{Math.round(starLift.current)}</span>
                <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>kg</span>
                <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)' }}>1RM est.</span>
              </div>
            </div>
            {starLift.gain !== null && starLift.gain > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ padding: '5px 14px', borderRadius: 999, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80', fontSize: '0.9rem', fontWeight: 700, marginBottom: 4 }}>
                  +{Math.round(starLift.gain * 10) / 10} kg
                </div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>últimos 30 días</div>
              </div>
            )}
          </div>
          {starLift.history?.length > 1 && (
            <div style={{ height: 64 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={starLift.history} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <Line type="monotone" dataKey="value" stroke={`rgb(${r},${g},${b})`} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                  <YAxis domain={['auto', 'auto']} hide />
                  <Tooltip
                    contentStyle={{ background: 'rgba(26,26,26,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.72rem', color: '#fff' }}
                    formatter={(v) => [`${parseFloat(Number(v).toFixed(2))} kg`, '1RM est.']}
                    labelFormatter={() => ''}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {topExercises.length > 1 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {topExercises.filter(ex => ex.key !== starLift?.key).slice(0, 2).map(ex => (
                <div key={ex.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>{ex.name}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{Math.round(ex.current)} kg</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 6. COMPOSICIÓN ──────────────────────────────────────────────────── */}
      {latestDisplay != null ? (
        <div style={{ ...glass, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>COMPOSICIÓN</div>
          {bodyCompInference && (
            <div style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, marginBottom: 12, background: `rgba(${r},${g},${b},0.12)`, border: `1px solid rgba(${r},${g},${b},0.3)`, color: `rgb(${r},${g},${b})`, lineHeight: 1.5 }}>
              {bodyCompInference}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: weightSparkData.length > 1 ? 12 : 0 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: '2.4rem', fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>{latestDisplay}</span>
                <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)' }}>{weightUnit}</span>
              </div>
              {delta30 != null && (
                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: delta30 < 0 ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.07)', color: delta30 < 0 ? '#4ade80' : 'rgba(255,255,255,0.7)', border: `1px solid ${delta30 < 0 ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.12)'}` }}>
                  {delta30 > 0 ? '+' : ''}{Math.round(delta30 * 10) / 10} {weightUnit} · 30 días
                </span>
              )}
            </div>
            {goalWeightDisplay != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>META</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>{goalWeightDisplay} {weightUnit}</div>
              </div>
            )}
          </div>
          {weightSparkData.length > 1 && (
            <div style={{ height: 60 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightSparkData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <Line type="monotone" dataKey="value" stroke={`rgba(${r},${g},${b},0.8)`} strokeWidth={2} dot={false} />
                  {goalWeightDisplay != null && <ReferenceLine y={goalWeightDisplay} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 3" />}
                  <YAxis domain={['auto', 'auto']} hide />
                  <Tooltip
                    contentStyle={{ background: 'rgba(26,26,26,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: '0.72rem', color: '#fff' }}
                    formatter={(v) => [`${parseFloat(Number(v).toFixed(2))} ${weightUnit}`, 'Peso']}
                    labelFormatter={(l) => l}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {goalWeightDisplay != null && latestDisplay != null && weightSparkData.length > 0 && (() => {
            const startW = weightSparkData[0]?.value;
            if (!startW || Math.abs(goalWeightDisplay - startW) < 0.1) return null;
            const total = Math.abs(goalWeightDisplay - startW);
            const done = Math.abs(latestDisplay - startW);
            const pct = Math.min(100, Math.max(0, (done / total) * 100));
            return (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>Progreso hacia meta</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: `rgb(${r},${g},${b})` }}>{Math.round(pct)}%</span>
                </div>
                <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: `rgba(${r},${g},${b},0.8)`, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div style={{ ...glass, padding: 16, marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>COMPOSICIÓN</div>
          <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>Registra tu primer peso para comenzar</div>
          <button
            onClick={onOpenBodyEntry}
            style={{ padding: '9px 22px', borderRadius: 999, background: `rgba(${r},${g},${b},0.9)`, border: 'none', color: '#1a1a1a', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            + Registrar peso
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ProgresoScreen ───────────────────────────────────────────────────────────

function ProgresoScreen({ bodyLogEntries, weightUnit, goalWeightDisplay, trainingDatesSet, nutritionByDay, plan, topExercises, selectedExerciseKey, setSelectedExerciseKey, strengthChartData, current1RM, readinessChartData, volumeByWeekGrouped, rangeWeeks, setRangeWeeks, accentRGB }) {
  const [weightRange, setWeightRange] = useState(30);

  const filteredWeightData = useMemo(() => {
    const cutoff = weightRange === 0 ? null : (() => {
      const d = new Date(); d.setDate(d.getDate() - weightRange);
      return toYYYYMMDD(d);
    })();
    return bodyLogEntries
      .filter(e => e.weight != null && (!cutoff || e.date >= cutoff))
      .map(e => ({
        date: e.date,
        value: weightUnit === 'lbs' ? Math.round(e.weight * 2.20462 * 10) / 10 : e.weight,
      }));
  }, [bodyLogEntries, weightRange, weightUnit]);

  const weightMaData = useMemo(() => compute7DayMA(filteredWeightData), [filteredWeightData]);

  const trainingInRange = useMemo(() => {
    const cutoff = weightRange === 0 ? null : (() => {
      const d = new Date(); d.setDate(d.getDate() - weightRange);
      return toYYYYMMDD(d);
    })();
    return [...trainingDatesSet].filter(d => !cutoff || d >= cutoff);
  }, [trainingDatesSet, weightRange]);

  const nutWeightData = useMemo(() => {
    const result = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const date = toYYYYMMDD(d);
      const cal = nutritionByDay[date]?.calories || null;
      const wEntry = bodyLogEntries.find(e => e.date === date);
      const wt = wEntry?.weight != null
        ? (weightUnit === 'lbs' ? Math.round(wEntry.weight * 2.20462 * 10) / 10 : wEntry.weight)
        : null;
      result.push({ date, calories: cal, weight: wt });
    }
    return result;
  }, [nutritionByDay, bodyLogEntries, weightUnit]);

  const glassCard = {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    backdropFilter: 'blur(8px)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 8,
  };

  const pillBtn = (active) => ({
    padding: '6px 14px', borderRadius: 999, border: '1px solid',
    borderColor: active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.15)',
    background: active ? 'rgba(255,255,255,0.13)' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.5)',
    fontSize: 12, fontWeight: active ? '600' : '500',
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  });

  const fmtDate = (d) => {
    if (!d) return '';
    const parts = d.split('-');
    if (!parts[1] || !parts[2]) return '';
    return `${parseInt(parts[2])}/${parseInt(parts[1])}`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
        <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{fmtDate(label)}</div>
        {payload.map((p, i) => p.value != null && (
          <div key={i} style={{ color: p.color || '#fff' }}>
            {p.name}: {typeof p.value === 'number' ? Math.round(p.value * 10) / 10 : p.value}
          </div>
        ))}
      </div>
    );
  };

  const SectionHeader = ({ title, subtitle, extra }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{title}</span>
        {extra}
      </div>
      {subtitle && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', display: 'block', marginTop: 2 }}>{subtitle}</span>}
    </div>
  );

  const Legend = ({ items }) => (
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
      {items.map(({ color, label, dash }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 16, height: 2, borderRadius: 1,
            background: dash ? 'none' : color,
            backgroundImage: dash ? `repeating-linear-gradient(90deg, ${color}, ${color} 3px, transparent 3px, transparent 6px)` : 'none',
            border: 'none',
          }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {/* Section 1: Cuerpo */}
      <SectionHeader
        title="Cuerpo"
        subtitle="Tendencia de peso"
        extra={
          <div style={{ display: 'flex', gap: 6 }}>
            {[['14d',14],['30d',30],['90d',90],['Todo',0]].map(([l,v]) => (
              <button key={v} onClick={() => setWeightRange(v)} style={pillBtn(weightRange===v)}>{l}</button>
            ))}
          </div>
        }
      />
      <div style={{ ...glassCard, marginBottom: 24 }}>
        {weightMaData.length >= 2 ? (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightMaData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto','auto']} />
                <Tooltip content={<CustomTooltip />} />
                {trainingInRange.slice(0, 50).map(d => (
                  <ReferenceLine key={d} x={d} stroke="rgba(74,222,128,0.15)" strokeWidth={4} />
                ))}
                {goalWeightDisplay != null && (
                  <ReferenceLine y={goalWeightDisplay} stroke="rgba(74,222,128,0.5)" strokeDasharray="4 4" strokeWidth={1.5} />
                )}
                <Line type="monotone" dataKey="value" stroke="#ffffff" strokeWidth={2} dot={{ fill:'#fff', r:2.5 }} name={`Peso (${weightUnit})`} />
                <Line type="monotone" dataKey="ma" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Media 7d" />
              </LineChart>
            </ResponsiveContainer>
            <Legend items={[
              { color: '#fff', label: 'Peso' },
              { color: 'rgba(255,255,255,0.4)', label: 'Media 7d', dash: true },
              { color: 'rgba(74,222,128,0.5)', label: 'Entreno' },
            ]} />
          </>
        ) : (
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Registra al menos dos pesos para ver la gráfica.</span>
        )}
      </div>

      {/* Section 2: Fuerza */}
      <SectionHeader title="Fuerza" subtitle="Progresión de 1RM estimado" />
      <div style={{ ...glassCard, marginBottom: 24 }}>
        {topExercises.length === 0 ? (
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Completa sesiones con peso para ver tu progresión de fuerza.</span>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
              {topExercises.map(ex => (
                <button key={ex.key} onClick={() => setSelectedExerciseKey(ex.key)} style={pillBtn(selectedExerciseKey===ex.key)}>
                  {ex.name}
                </button>
              ))}
            </div>
            {current1RM && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>{Math.round(current1RM.current)}</span>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>kg 1RM est.</span>
                </div>
                {current1RM.delta != null && (
                  <span style={{ fontSize: 12, fontWeight: '600', color: current1RM.delta >= 0 ? '#4ade80' : '#f87171' }}>
                    {current1RM.delta >= 0 ? '+' : ''}{current1RM.delta.toFixed(1)} kg en 4 semanas
                  </span>
                )}
              </div>
            )}
            {strengthChartData.length >= 2
              ? <LabStrengthChart data={strengthChartData} />
              : <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Necesitas más sesiones para ver la tendencia.</span>
            }
            {current1RM?.achievedWith?.weight && (
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', display: 'block', marginTop: 8 }}>
                Mejor serie: {current1RM.achievedWith.weight} kg × {current1RM.achievedWith.reps} reps
              </span>
            )}
          </>
        )}
      </div>

      {/* Section 3: Nutrición */}
      <SectionHeader title="Nutrición" subtitle="Calorías y peso · últimos 14 días" />
      <div style={{ ...glassCard, marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={nutWeightData} margin={{ top: 5, right: 30, left: -10, bottom: 5 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickLine={false} axisLine={false} interval={3} />
            <YAxis yAxisId="left" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto','auto']} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickLine={false} axisLine={false} domain={['auto','auto']} />
            <Tooltip content={<CustomTooltip />} />
            {plan?.daily_calories && (
              <ReferenceLine yAxisId="left" y={plan.daily_calories} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4" strokeWidth={1.5} />
            )}
            <Line yAxisId="left" type="monotone" dataKey="calories" stroke="rgba(255,255,255,0.6)" strokeWidth={2} dot={false} name="Calorías" connectNulls />
            <Line yAxisId="right" type="monotone" dataKey="weight" stroke="#ffffff" strokeWidth={2} dot={{ fill:'#fff', r:2.5 }} name={`Peso (${weightUnit})`} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <Legend items={[
          { color: 'rgba(255,255,255,0.6)', label: 'Calorías' },
          { color: '#fff', label: 'Peso' },
        ]} />
      </div>

      {/* Section 4: Recuperación */}
      <SectionHeader title="Recuperación" subtitle="Energía, sueño y frescura · 30 días" />
      <div style={{ ...glassCard, marginBottom: 24 }}>
        {readinessChartData.every(d => d.energy == null) ? (
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Registra tu preparación diaria para ver la tendencia.</span>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={readinessChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickLine={false} axisLine={false} interval={5} />
                <YAxis domain={[0,10]} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="energy" stroke="#60a5fa" strokeWidth={2} dot={false} name="Energía" connectNulls />
                <Line type="monotone" dataKey="sleep" stroke="#a78bfa" strokeWidth={2} dot={false} name="Sueño" connectNulls />
                <Line type="monotone" dataKey="soreness" stroke="#4ade80" strokeWidth={2} dot={false} name="Frescura" connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <Legend items={[
              { color: '#60a5fa', label: 'Energía' },
              { color: '#a78bfa', label: 'Sueño' },
              { color: '#4ade80', label: 'Frescura' },
            ]} />
          </>
        )}
      </div>

      {/* Section 5: Volumen */}
      <SectionHeader
        title="Volumen"
        subtitle="Series por grupo muscular"
        extra={
          <div style={{ display: 'flex', gap: 6 }}>
            {[4,8].map(w => (
              <button key={w} onClick={() => setRangeWeeks(w)} style={pillBtn(rangeWeeks===w)}>{w} sem</button>
            ))}
          </div>
        }
      />
      <div style={{ ...glassCard, marginBottom: 24 }}>
        <LabVolumeBarChart data={volumeByWeekGrouped} rangeWeeks={rangeWeeks} />
      </div>
    </div>
  );
}

// ─── LabScreen ────────────────────────────────────────────────────────────────

const LabScreen = () => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user: contextUser } = useAuth();
  const [fallbackUser, setFallbackUser] = useState(null);
  const user = contextUser || fallbackUser || auth.currentUser;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const uid = user?.uid ?? null;

  const [activeScreen, setActiveScreen] = useState('estado');
  const [historialTab, setHistorialTab] = useState('fuerza');
  const [selectedExerciseKey, setSelectedExerciseKey] = useState(null);
  const [rangeWeeks, setRangeWeeks] = useState(8);
  const [weightUnit, setWeightUnit] = useState('kg');
  const [goalWeight, setGoalWeight] = useState(null);
  const [weightRange, setWeightRange] = useState(30);
  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  const currentWeek = useMemo(() => getMondayWeek(), []);
  const previousWeek = useMemo(() => getPreviousWeekKey(currentWeek), [currentWeek]);

  // ─── data loading ──────────────────────────────────────────────────────────

  const mainQuery = useQuery({
    queryKey: ['progress', 'lab-main', uid],
    queryFn: async () => {
      const end = toYYYYMMDD(new Date());
      const startD = new Date(); startD.setDate(startD.getDate() - 56);
      const start = toYYYYMMDD(startD);
      const [uData, sessionResult, entries, planResult, readinessData] = await Promise.all([
        apiClient.get('/users/me').then(r => r?.data ?? null),
        exerciseHistoryService.getSessionHistoryPaginated(uid, 100),
        getDiaryEntriesInRange(uid, start, end),
        getEffectivePlanForUser(uid).catch(() => ({ plan: null, assignment: null })),
        getReadinessInRange(uid, start, end),
      ]);
      return {
        userData: uData || null,
        sessions: sessionResult?.sessions || {},
        diaryEntries: entries || [],
        plan: planResult?.plan || null,
        readinessEntries: readinessData || [],
      };
    },
    enabled: !!uid,
    staleTime: STALE_TIMES.exerciseHistory,
    gcTime: GC_TIMES.exerciseHistory,
  });

  const topKeys = useMemo(() => {
    const est = mainQuery.data?.userData?.oneRepMaxEstimates;
    if (!est) return [];
    return Object.entries(est)
      .filter(([, v]) => v?.current && v?.lastUpdated)
      .sort((a, b) => new Date(b[1].lastUpdated) - new Date(a[1].lastUpdated))
      .slice(0, 5)
      .map(([k]) => k);
  }, [mainQuery.data?.userData?.oneRepMaxEstimates]);

  const oneRmQuery = useQuery({
    queryKey: ['workout', '1rm-histories', uid, topKeys],
    queryFn: () =>
      Promise.all(
        topKeys.map(key =>
          oneRepMaxService.getHistoryByKey(uid, key).then(records => ({ exerciseKey: key, records }))
        )
      ),
    enabled: !!uid && topKeys.length > 0,
    staleTime: STALE_TIMES.exerciseHistory,
    gcTime: GC_TIMES.exerciseHistory,
  });

  const bodyQuery = useQuery({
    queryKey: ['progress', 'body-log', uid],
    queryFn: () => bodyProgressService.getEntries(uid),
    enabled: !!uid,
    staleTime: STALE_TIMES.bodyLog,
    gcTime: GC_TIMES.bodyLog,
  });

  const loading = mainQuery.isLoading;
  const userData = mainQuery.data?.userData ?? null;
  const sessions = mainQuery.data?.sessions ?? {};
  const diaryEntries = mainQuery.data?.diaryEntries ?? [];
  const plan = mainQuery.data?.plan ?? null;
  const readinessEntries = mainQuery.data?.readinessEntries ?? [];
  const oneRepMaxHistories = oneRmQuery.data ?? [];
  const bodyLogEntries = bodyQuery.data ?? [];

  useEffect(() => {
    if (!contextUser && auth.currentUser) setFallbackUser(auth.currentUser);
  }, [contextUser]);

  const openBodyEntryModal = useCallback(() => {
    setEditingEntry(null);
    setEntryModalVisible(true);
  }, []);

  useEffect(() => {
    if (consumePendingOpenBodyEntry()) openBodyEntryModal();
  }, [openBodyEntryModal]);

  useEffect(() => {
    const handler = () => openBodyEntryModal();
    window.addEventListener('wakeOpenBodyEntry', handler);
    return () => window.removeEventListener('wakeOpenBodyEntry', handler);
  }, [openBodyEntryModal]);

  useEffect(() => {
    if (userData?.goalWeight != null) setGoalWeight(userData.goalWeight);
    if (userData?.weightUnit) setWeightUnit(userData.weightUnit);
  }, [userData]);

  // ─── helpers ───────────────────────────────────────────────────────────────

  const openNewEntry = () => { setEditingEntry(null); setEntryModalVisible(true); };
  const openEditEntry = (entry) => { setEditingEntry(entry); setEntryModalVisible(true); };

  const handleEntrySaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['progress', 'body-log', uid] });
  }, [queryClient, uid]);

  const handleWeightUnitChange = (u) => {
    setWeightUnit(u);
    const uid = user?.uid || auth.currentUser?.uid;
    if (uid) apiClient.patch('/users/me', { weightUnit: u }).catch(() => {});
  };

  const handleDeletePhoto = async (photo) => {
    setLightboxPhoto(null);
    try {
      const uid = user?.uid || auth.currentUser?.uid;
      if (!uid) return;
      const entry = bodyLogEntries.find(e => e.photos?.find(p => p.id === photo.id));
      if (entry) {
        const newPhotos = (entry.photos || []).filter(p => p.id !== photo.id);
        await bodyProgressService.saveEntry(uid, entry.date, { photos: newPhotos });
        await bodyProgressService.cleanupPhoto(photo.storagePath);
      }
      handleEntrySaved();
    } catch (err) {
      logger.error('[Lab] handleDeletePhoto error', err?.message);
    }
  };

  const handleSessionPress = (session, completedAtIso) => {
    const sessionId = session.completionDocId || session.sessionId || session.id;
    if (!sessionId) return;
    navigate(`/sessions/${sessionId}`, { state: { sessionId, sessionName: session.sessionName||'Sesión', date: completedAtIso||session.completedAt, sessionData: session } });
  };

  // ─── computations ────────────────────────────────────────────────────���─────

  const sessionList = useMemo(() =>
    Object.values(sessions).sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0)),
    [sessions]
  );

  const topExercises = useMemo(() => {
    const est = userData?.oneRepMaxEstimates;
    if (!est) return [];
    return Object.entries(est)
      .filter(([, v]) => v?.current && v?.lastUpdated)
      .sort((a, b) => new Date(b[1].lastUpdated) - new Date(a[1].lastUpdated))
      .slice(0, 5)
      .map(([key, v]) => ({
        key,
        name: key.split('_').slice(1).join(' '),
        current: v.current,
        lastUpdated: v.lastUpdated,
        achievedWith: v.achievedWith,
      }));
  }, [userData?.oneRepMaxEstimates]);

  useEffect(() => {
    if (!selectedExerciseKey && topExercises.length > 0) setSelectedExerciseKey(topExercises[0].key);
  }, [topExercises, selectedExerciseKey]);

  const strengthChartData = useMemo(() => {
    if (!selectedExerciseKey) return [];
    const hist = oneRepMaxHistories.find(h => h.exerciseKey === selectedExerciseKey);
    return hist?.records || [];
  }, [selectedExerciseKey, oneRepMaxHistories]);

  const current1RM = useMemo(() => {
    if (!selectedExerciseKey || !userData?.oneRepMaxEstimates) return null;
    const est = userData.oneRepMaxEstimates[selectedExerciseKey];
    if (!est?.current) return null;
    const fourWeeksAgo = new Date(); fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const hist = oneRepMaxHistories.find(h => h.exerciseKey === selectedExerciseKey);
    let delta = null;
    if (hist?.records?.length >= 2) {
      const old = hist.records.filter(r => new Date(r.date) <= fourWeeksAgo);
      if (old.length > 0) delta = est.current - old[old.length - 1].value;
    }
    return { current: est.current, delta, achievedWith: est.achievedWith };
  }, [selectedExerciseKey, userData?.oneRepMaxEstimates, oneRepMaxHistories]);

  const volumeByWeekGrouped = useMemo(() => {
    const wv = userData?.weeklyMuscleVolume || {};
    const now = new Date();
    const weeks = [];
    for (let i = rangeWeeks - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i * 7);
      weeks.push(getMondayWeek(d));
    }
    return weeks.map(wk => {
      const v = wv[wk] || {};
      const label = formatWeekDisplay(wk).replace('Semana del ', '');
      return {
        week: wk, weekDisplay: label,
        empuje: (v.pecs||0)+(v.triceps||0)+(v.front_delts||0),
        jalon: (v.lats||0)+(v.rhomboids||0)+(v.biceps||0)+(v.rear_delts||0),
        piernas: (v.quads||0)+(v.hamstrings||0)+(v.glutes||0)+(v.calves||0),
        core: (v.abs||0)+(v.obliques||0)+(v.lower_back||0)+(v.hip_flexors||0),
        hombros: (v.side_delts||0)+(v.traps||0),
      };
    });
  }, [userData?.weeklyMuscleVolume, rangeWeeks]);

  const rpeBySession = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - rangeWeeks * 7);
    return sessionList
      .filter(s => s.completedAt && new Date(s.completedAt) >= cutoff)
      .map(s => {
        const vals = [];
        Object.values(s.exercises || {}).forEach(ex => {
          (ex.sets || []).forEach(set => { const v = parseIntensity(set.intensity); if (v != null) vals.push(v); });
        });
        if (!vals.length) return null;
        return { date: s.completedAt, avgRpe: vals.reduce((a,b)=>a+b,0)/vals.length, sessionName: s.sessionName||'' };
      })
      .filter(Boolean)
      .sort((a,b) => new Date(a.date)-new Date(b.date));
  }, [sessionList, rangeWeeks]);

  const planAdherenceData = useMemo(() =>
    sessionList
      .filter(s => s.planned?.exercises?.length > 0 && s.exercises)
      .slice(0, 10)
      .map(s => {
        const plannedSets = (s.planned.exercises||[]).reduce((t,ex)=>t+(ex.sets?.length||0),0);
        const performedSets = Object.values(s.exercises||{}).reduce((t,ex)=>t+(ex.sets?.length||0),0);
        const pct = plannedSets > 0 ? Math.min(150, Math.round((performedSets/plannedSets)*100)) : null;
        return { date: s.completedAt, sessionName: s.sessionName||'Sesión', pct, planned: plannedSets, performed: performedSets };
      })
      .filter(d => d.pct != null),
    [sessionList]
  );

  const nutritionByDay = useMemo(() => aggregateDiaryByDay(diaryEntries), [diaryEntries]);
  const nutritionStats = useMemo(() => averageMacrosLast7AndPrev7(nutritionByDay, toYYYYMMDD(new Date())), [nutritionByDay]);

  const macroPieData = useMemo(() => {
    if (!nutritionStats) return [];
    const { last7 } = nutritionStats;
    const p=Math.round(last7.protein), c=Math.round(last7.carbs), f=Math.round(last7.fat);
    if (p+c+f<=0) return [];
    return [
      { name:'Proteína', value:p, grams:p },
      { name:'Carbohidratos', value:c, grams:c },
      { name:'Grasa', value:f, grams:f },
    ].filter(d=>d.value>0);
  }, [nutritionStats]);

  const nutritionAdherence30 = useMemo(() => {
    const target = plan?.daily_calories || 0;
    const today = new Date();
    const result = [];
    for (let i=29;i>=0;i--) {
      const d=new Date(today); d.setDate(d.getDate()-i);
      const dateStr=toYYYYMMDD(d);
      const dayData=nutritionByDay[dateStr];
      const logged=dayData?.calories||0;
      const pct=target>0?(logged/target)*100:null;
      result.push({ date:dateStr, logged, target, pct });
    }
    return result;
  }, [nutritionByDay, plan]);

  const nutritionAdherenceBadges = useMemo(() => {
    if (!plan?.daily_calories) return null;
    const last7=nutritionAdherence30.slice(-7).filter(d=>d.logged>0);
    if (!last7.length) return null;
    const avgCalPct=Math.round(last7.reduce((s,d)=>s+(d.pct||0),0)/last7.length);
    let proteinPct=null;
    if (plan.daily_protein_g) {
      const pDays=last7.map(d=>nutritionByDay[d.date]?.protein||0).filter(v=>v>0);
      if (pDays.length) proteinPct=Math.round(pDays.reduce((s,v)=>s+(v/plan.daily_protein_g)*100,0)/pDays.length);
    }
    return { calPct:avgCalPct, proteinPct, days:last7.length };
  }, [nutritionAdherence30, plan, nutritionByDay]);

  const proteinByMeal = useMemo(() => {
    const cutoffStr=toYYYYMMDD(new Date(Date.now()-14*86400000));
    const relevant=diaryEntries.filter(e=>e.date&&e.date>=cutoffStr&&e.meal);
    const mealDayProtein={}, mealTimeMinutes={};
    relevant.forEach(e=>{
      const meal=e.meal;
      if (!mealDayProtein[meal]) mealDayProtein[meal]={};
      if (!mealDayProtein[meal][e.date]) mealDayProtein[meal][e.date]=0;
      mealDayProtein[meal][e.date]+=Number(e.protein)||0;
      let ts=e.createdAt;
      if (ts&&typeof ts.toDate==='function') ts=ts.toDate();
      else if (typeof ts==='string') ts=new Date(ts);
      if (ts instanceof Date&&!isNaN(ts)) {
        if (!mealTimeMinutes[meal]) mealTimeMinutes[meal]=[];
        mealTimeMinutes[meal].push(ts.getHours()*60+ts.getMinutes());
      }
    });
    const avgProtein={}, avgTimes={};
    ['Breakfast','Lunch','Dinner','Snack'].forEach(meal=>{
      const days=Object.values(mealDayProtein[meal]||{});
      avgProtein[meal]=days.length>0?days.reduce((a,b)=>a+b,0)/days.length:0;
      const times=mealTimeMinutes[meal]||[];
      avgTimes[meal]=times.length>0?times.reduce((a,b)=>a+b,0)/times.length:null;
    });
    return { protein:avgProtein, mealTimes:avgTimes };
  }, [diaryEntries]);

  const trainingVsRest = useMemo(() => {
    const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-28);
    const cutoffStr=toYYYYMMDD(cutoff);
    const trainingDates=new Set(
      sessionList.filter(s=>s.completedAt&&new Date(s.completedAt)>=cutoff).map(s=>toYYYYMMDD(new Date(s.completedAt)))
    );
    const trainingDays=[], restDays=[];
    Object.entries(nutritionByDay).forEach(([date,data])=>{
      if (date<cutoffStr) return;
      if (trainingDates.has(date)) trainingDays.push(data);
      else restDays.push(data);
    });
    const avg=(arr,key)=>arr.length>0?arr.reduce((s,d)=>s+(d[key]||0),0)/arr.length:0;
    return {
      training:{ days:trainingDays.length, calories:avg(trainingDays,'calories'), protein:avg(trainingDays,'protein'), carbs:avg(trainingDays,'carbs'), fat:avg(trainingDays,'fat') },
      rest:{ days:restDays.length, calories:avg(restDays,'calories'), protein:avg(restDays,'protein'), carbs:avg(restDays,'carbs'), fat:avg(restDays,'fat') },
    };
  }, [sessionList, nutritionByDay]);

  const energyByWeek = useMemo(() => {
    const wv=userData?.weeklyMuscleVolume||{};
    const now=new Date();
    const weeks=[];
    for (let i=rangeWeeks-1;i>=0;i--) { const d=new Date(now); d.setDate(d.getDate()-i*7); weeks.push(getMondayWeek(d)); }
    return weeks.map(wk=>{
      const vol=wv[wk]||{};
      const effectiveSets=Object.values(vol).reduce((s,n)=>s+(Number(n)||0),0);
      const { start, end }=getWeekDates(wk);
      let totalCalories=0, hasNutritionData=false;
      const cur=new Date(start);
      while (cur<=end) {
        const ds=toYYYYMMDD(cur);
        const dd=nutritionByDay[ds];
        if (dd?.calories>0) { totalCalories+=dd.calories; hasNutritionData=true; }
        cur.setDate(cur.getDate()+1);
      }
      return { week:wk, weekDisplay:formatWeekDisplay(wk).replace('Semana del ',''), totalCalories, effectiveSets, hasNutritionData };
    });
  }, [userData?.weeklyMuscleVolume, nutritionByDay, rangeWeeks]);

  const consistencyWeeks = useMemo(() => {
    const sessionDateMap={};
    sessionList.forEach(s=>{ if (!s.completedAt) return; const d=toYYYYMMDD(new Date(s.completedAt)); sessionDateMap[d]=(sessionDateMap[d]||0)+1; });
    const weeks=[];
    const now=new Date();
    const startDate=new Date(now); startDate.setDate(startDate.getDate()-83);
    const dow=startDate.getDay();
    startDate.setDate(startDate.getDate()+(dow===0?1:dow===1?0:8-dow));
    let cur=new Date(startDate);
    while (weeks.length<12) {
      const wk=getMondayWeek(cur);
      const days=[];
      for (let d=0;d<7;d++) { const dd=new Date(cur); dd.setDate(cur.getDate()+d); const ds=toYYYYMMDD(dd); days.push({ date:ds, count:sessionDateMap[ds]||0 }); }
      weeks.push({ weekKey:wk, days });
      cur.setDate(cur.getDate()+7);
    }
    return weeks;
  }, [sessionList]);

  const volumeInsight = useMemo(() => {
    if (volumeByWeekGrouped.length<2) return null;
    const last=volumeByWeekGrouped[volumeByWeekGrouped.length-1];
    const prev=volumeByWeekGrouped[volumeByWeekGrouped.length-2];
    const labels={ empuje:'Empuje', jalon:'Jalón', piernas:'Piernas', core:'Core', hombros:'Hombros' };
    const changes=Object.keys(labels).map(g=>{ const pv=prev[g]||0; if (!pv) return null; return { g, label:labels[g], pct:Math.round(((last[g]-pv)/pv)*100) }; }).filter(Boolean).sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct));
    if (!changes.length||Math.abs(changes[0].pct)<10) return null;
    const { label, pct }=changes[0];
    return `${label} ${pct>0?'↑':'↓'}${Math.abs(pct)}% esta semana`;
  }, [volumeByWeekGrouped]);

  const rpeInsight = useMemo(() => {
    if (rpeBySession.length<3) return null;
    const recent=rpeBySession.slice(-3);
    const avg=recent.reduce((s,d)=>s+d.avgRpe,0)/recent.length;
    if (avg<7) return `Tus últimas ${recent.length} sesiones tuvieron RPE promedio de ${avg.toFixed(1)} — por debajo del umbral efectivo de 7`;
    return null;
  }, [rpeBySession]);

  const proteinInsight = useMemo(() => {
    const { protein }=proteinByMeal;
    const total=Object.values(protein||{}).reduce((s,v)=>s+v,0);
    if (total<=0) return null;
    const highest=Object.entries(protein||{}).sort((a,b)=>b[1]-a[1])[0];
    if (!highest) return null;
    const pct=Math.round((highest[1]/total)*100);
    const labels={ Breakfast:'el desayuno', Lunch:'el almuerzo', Dinner:'la cena', Snack:'los snacks' };
    if (pct>50) return `El ${pct}% de tu proteína llega en ${labels[highest[0]]||highest[0]}. Distribuirla en más comidas puede mejorar la síntesis muscular.`;
    return null;
  }, [proteinByMeal]);

  const trainingVsRestInsight = useMemo(() => {
    const { training, rest }=trainingVsRest;
    if (training.days<3||rest.days<3) return null;
    if (rest.calories>training.calories&&training.calories>0) {
      const diff=Math.round(rest.calories-training.calories);
      return `Comes ${diff} kcal más en días de descanso. En días de entrenamiento tu cuerpo necesita más energía para rendir y recuperarse.`;
    }
    return null;
  }, [trainingVsRest]);

  const energyInsight = useMemo(() => {
    if (energyByWeek.length<2) return null;
    const last=energyByWeek[energyByWeek.length-1];
    const prev=energyByWeek[energyByWeek.length-2];
    if (!last.hasNutritionData||prev.effectiveSets===0||prev.totalCalories===0) return null;
    const setChg=(last.effectiveSets-prev.effectiveSets)/prev.effectiveSets;
    const calChg=(last.totalCalories-prev.totalCalories)/prev.totalCalories;
    if (setChg>0.2&&calChg<-0.1) return `Esta semana entrenaste ${Math.round(setChg*100)}% más pero consumiste ${Math.abs(Math.round(calChg*100))}% menos calorías. Esto puede frenar la recuperación.`;
    return null;
  }, [energyByWeek]);

  const readinessByDay = useMemo(() => {
    const map={};
    readinessEntries.forEach(r=>{ if (r.date) map[r.date]=r; });
    return map;
  }, [readinessEntries]);

  const readinessChartData = useMemo(() => {
    const today=new Date();
    const result=[];
    for (let i=29;i>=0;i--) {
      const d=new Date(today); d.setDate(d.getDate()-i);
      const dateStr=toYYYYMMDD(d);
      const entry=readinessByDay[dateStr];
      result.push({ date:dateStr, energy:entry?entry.energy:null, soreness:entry?entry.soreness:null, sleep:entry?entry.sleep:null, sorenessInverted:entry?entry.soreness:null });
    }
    return result;
  }, [readinessByDay]);

  const readinessWeeklyAvg = useMemo(() => {
    const today=new Date();
    const thisWeekDates=[], lastWeekDates=[];
    for (let i=0;i<7;i++) { const d=new Date(today); d.setDate(d.getDate()-i); thisWeekDates.push(toYYYYMMDD(d)); }
    for (let i=7;i<14;i++) { const d=new Date(today); d.setDate(d.getDate()-i); lastWeekDates.push(toYYYYMMDD(d)); }
    const avg=(dates,key)=>{ const vals=dates.map(d=>readinessByDay[d]?.[key]).filter(v=>v!=null); return vals.length>0?vals.reduce((a,b)=>a+b,0)/vals.length:null; };
    return {
      this:{ energy:avg(thisWeekDates,'energy'), soreness:avg(thisWeekDates,'soreness'), sleep:avg(thisWeekDates,'sleep'), count:thisWeekDates.filter(d=>readinessByDay[d]).length },
      last:{ energy:avg(lastWeekDates,'energy'), soreness:avg(lastWeekDates,'soreness'), sleep:avg(lastWeekDates,'sleep') },
    };
  }, [readinessByDay]);

  const readinessOnTrainingDays = useMemo(() => {
    const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-28);
    const trainingDays=sessionList.filter(s=>s.completedAt&&new Date(s.completedAt)>=cutoff).map(s=>toYYYYMMDD(new Date(s.completedAt)));
    const entries=trainingDays.map(d=>readinessByDay[d]).filter(Boolean);
    if (!entries.length) return null;
    return { count:entries.length, energy:entries.reduce((s,e)=>s+e.energy,0)/entries.length, soreness:entries.reduce((s,e)=>s+e.soreness,0)/entries.length, sleep:entries.reduce((s,e)=>s+e.sleep,0)/entries.length };
  }, [sessionList, readinessByDay]);

  const rpeReadinessCorrelation = useMemo(() => {
    const pairs=[];
    rpeBySession.forEach(rpeEntry=>{
      const dateStr=toYYYYMMDD(new Date(rpeEntry.date));
      const readiness=readinessByDay[dateStr];
      if (readiness) pairs.push({ date:rpeEntry.date, sessionName:rpeEntry.sessionName, avgRpe:rpeEntry.avgRpe, energy:readiness.energy, soreness:readiness.soreness, sleep:readiness.sleep });
    });
    return pairs;
  }, [rpeBySession, readinessByDay]);

  const readinessRpeInsight = useMemo(() => {
    if (rpeReadinessCorrelation.length<4) return null;
    const highEnergy=rpeReadinessCorrelation.filter(p=>p.energy>=7);
    const lowEnergy=rpeReadinessCorrelation.filter(p=>p.energy<=4);
    if (highEnergy.length<2||lowEnergy.length<2) return null;
    const avgHigh=highEnergy.reduce((s,p)=>s+p.avgRpe,0)/highEnergy.length;
    const avgLow=lowEnergy.reduce((s,p)=>s+p.avgRpe,0)/lowEnergy.length;
    if (avgHigh-avgLow>0.5) return `Cuando tu energía es ≥7, tu RPE promedio es ${avgHigh.toFixed(1)} vs ${avgLow.toFixed(1)} cuando es ≤4. Los días de alta energía produces esfuerzo más efectivo.`;
    return null;
  }, [rpeReadinessCorrelation]);

  const recoveryWarning = useMemo(() => {
    const last3=[];
    const today=new Date();
    for (let i=0;i<3;i++) { const d=new Date(today); d.setDate(d.getDate()-i); const entry=readinessByDay[toYYYYMMDD(d)]; if (entry) last3.push(entry); }
    if (last3.length<2) return null;
    const avgEnergy=last3.reduce((s,e)=>s+e.energy,0)/last3.length;
    const avgSoreness=last3.reduce((s,e)=>s+e.soreness,0)/last3.length;
    if (avgEnergy<=4&&avgSoreness<=4) return `Energía baja (${avgEnergy.toFixed(1)}/10) y musculatura muy cargada (${avgSoreness.toFixed(1)}/10) en los últimos días — considera una sesión de recuperación activa o un día de descanso.`;
    if (avgEnergy<=3) return `Tu energía ha estado muy baja estos días (${avgEnergy.toFixed(1)}/10). Revisa tu calidad de sueño y nutrición.`;
    return null;
  }, [readinessByDay]);

  const currentWeekVolume = useMemo(() => userData?.weeklyMuscleVolume?.[currentWeek]||{}, [userData?.weeklyMuscleVolume, currentWeek]);

  const historicalMuscleMax = useMemo(() => {
    const wv=userData?.weeklyMuscleVolume||{};
    const keys=['pecs','triceps','front_delts','lats','rhomboids','biceps','rear_delts','quads','hamstrings','glutes','calves','abs','obliques','lower_back','hip_flexors','side_delts','traps'];
    const max={}; keys.forEach(k=>{ max[k]=0; });
    Object.values(wv).forEach(wkVol=>{ keys.forEach(k=>{ max[k]=Math.max(max[k],wkVol[k]||0); }); });
    return max;
  }, [userData?.weeklyMuscleVolume]);

  const muscleGroupStats = useMemo(() => {
    const prevVol=userData?.weeklyMuscleVolume?.[previousWeek]||{};
    const wv=userData?.weeklyMuscleVolume||{};
    const GROUPS=[
      { key:'empuje', label:'Empuje', muscles:['pecs','triceps','front_delts'] },
      { key:'jalon', label:'Jalón', muscles:['lats','rhomboids','biceps','rear_delts'] },
      { key:'piernas', label:'Piernas', muscles:['quads','hamstrings','glutes','calves'] },
      { key:'core', label:'Core', muscles:['abs','obliques','lower_back','hip_flexors'] },
      { key:'hombros', label:'Hombros', muscles:['side_delts','traps'] },
    ];
    const maxByGroup={}; GROUPS.forEach(({ key })=>{ maxByGroup[key]=0; });
    Object.values(wv).forEach(wkVol=>{ GROUPS.forEach(({ key, muscles })=>{ const s=muscles.reduce((a,m)=>a+(wkVol[m]||0),0); maxByGroup[key]=Math.max(maxByGroup[key],s); }); });
    return GROUPS.map(({ key, label, muscles })=>({
      key, label,
      current:muscles.reduce((a,m)=>a+(currentWeekVolume[m]||0),0),
      previous:muscles.reduce((a,m)=>a+(prevVol[m]||0),0),
      maxEver:maxByGroup[key],
    }));
  }, [userData?.weeklyMuscleVolume, currentWeekVolume, previousWeek]);

  const weekTotals = useMemo(() => {
    const total=Object.values(currentWeekVolume).reduce((s,v)=>s+(v||0),0);
    const prevVol=userData?.weeklyMuscleVolume?.[previousWeek]||{};
    const prevTotal=Object.values(prevVol).reduce((s,v)=>s+(v||0),0);
    const pct=prevTotal>0?Math.round(((total-prevTotal)/prevTotal)*100):null;
    return { total, prevTotal, pct };
  }, [currentWeekVolume, userData?.weeklyMuscleVolume, previousWeek]);

  const recentRpeAvg = useMemo(() => {
    const recent=rpeBySession.slice(-3);
    return recent.length?recent.reduce((s,d)=>s+d.avgRpe,0)/recent.length:null;
  }, [rpeBySession]);

  const weeklyWellnessScore = useMemo(() =>
    volumeByWeekGrouped.map(wk=>{
      const { start, end }=getWeekDates(wk.week);
      const scores=[];
      const cur=new Date(start);
      while (cur<=end) { const ds=toYYYYMMDD(cur); const r=readinessByDay[ds]; if (r) scores.push((r.energy+r.sleep+r.soreness)/3); cur.setDate(cur.getDate()+1); }
      return { ...wk, wellness:scores.length>0?scores.reduce((a,b)=>a+b,0)/scores.length:null };
    }),
    [volumeByWeekGrouped, readinessByDay]
  );

  const sleepNextDayEnergyInsight = useMemo(() => {
    const pairs=[];
    readinessEntries.forEach(entry=>{
      const next=new Date(entry.date+'T12:00:00'); next.setDate(next.getDate()+1);
      const nextEntry=readinessByDay[toYYYYMMDD(next)];
      if (nextEntry) pairs.push({ sleep:entry.sleep, nextEnergy:nextEntry.energy });
    });
    if (pairs.length<5) return null;
    const good=pairs.filter(p=>p.sleep>=7), poor=pairs.filter(p=>p.sleep<=5);
    if (good.length<2||poor.length<2) return null;
    const avgGood=good.reduce((s,p)=>s+p.nextEnergy,0)/good.length;
    const avgPoor=poor.reduce((s,p)=>s+p.nextEnergy,0)/poor.length;
    if (avgGood-avgPoor<1) return null;
    return `Cuando duermes ≥7/10, tu energía al día siguiente es ${avgGood.toFixed(1)}/10 en promedio (vs ${avgPoor.toFixed(1)} cuando duermes ≤5).`;
  }, [readinessEntries, readinessByDay]);

  const nutritionReadinessInsight = useMemo(() => {
    if (!plan?.daily_calories) return null;
    const pairs=[];
    readinessEntries.forEach(entry=>{
      const prev=new Date(entry.date+'T12:00:00'); prev.setDate(prev.getDate()-1);
      const prevNutrition=nutritionByDay[toYYYYMMDD(prev)];
      if (!prevNutrition?.calories) return;
      pairs.push({ metTarget:prevNutrition.calories/plan.daily_calories>=0.85, energy:entry.energy });
    });
    if (pairs.length<5) return null;
    const met=pairs.filter(p=>p.metTarget), notMet=pairs.filter(p=>!p.metTarget);
    if (met.length<2||notMet.length<2) return null;
    const avgMet=met.reduce((s,p)=>s+p.energy,0)/met.length;
    const avgNotMet=notMet.reduce((s,p)=>s+p.energy,0)/notMet.length;
    if (avgMet-avgNotMet<0.8) return null;
    return `Cuando cumples tu objetivo calórico el día anterior, tu energía matutina es ${avgMet.toFixed(1)}/10 vs ${avgNotMet.toFixed(1)} cuando no lo cumples.`;
  }, [readinessEntries, nutritionByDay, plan]);

  const chronicReadinessTrend = useMemo(() => {
    const today=new Date();
    const recent=[], prior=[];
    for (let i=0;i<7;i++) { const d=new Date(today); d.setDate(d.getDate()-i); const e=readinessByDay[toYYYYMMDD(d)]; if (e) recent.push(e); }
    for (let i=7;i<14;i++) { const d=new Date(today); d.setDate(d.getDate()-i); const e=readinessByDay[toYYYYMMDD(d)]; if (e) prior.push(e); }
    if (recent.length<3||prior.length<3) return null;
    const avgE=(arr)=>arr.reduce((s,e)=>s+e.energy,0)/arr.length;
    const slope=avgE(recent)-avgE(prior);
    if (slope>=-1.5) return null;
    const last=volumeByWeekGrouped[volumeByWeekGrouped.length-1];
    const prev=volumeByWeekGrouped[volumeByWeekGrouped.length-2];
    if (prev) {
      const totalLast=last.empuje+last.jalon+last.piernas+last.core+last.hombros;
      const totalPrev=prev.empuje+prev.jalon+prev.piernas+prev.core+prev.hombros;
      const volIncrease=totalPrev>0?(totalLast-totalPrev)/totalPrev:0;
      if (volIncrease>0.15) return `Tu energía bajó ${Math.abs(slope).toFixed(1)} pts en 2 semanas mientras el volumen subió ${Math.round(volIncrease*100)}% — posible señal de sobreentrenamiento.`;
    }
    return `Tu energía ha bajado progresivamente (${avgE(prior).toFixed(1)} → ${avgE(recent).toFixed(1)}/10). Revisa tu descanso y nutrición.`;
  }, [readinessByDay, volumeByWeekGrouped]);

  // ─── Cuerpo computations ───────────────────────────────────────────────────

  const latestBodyEntry = useMemo(() => {
    const withWeight=bodyLogEntries.filter(e=>e.weight!=null);
    return withWeight.length>0?withWeight[withWeight.length-1]:null;
  }, [bodyLogEntries]);

  const weightChartData = useMemo(() => {
    const cutoffStr=weightRange===0?null:(()=>{ const d=new Date(); d.setDate(d.getDate()-weightRange); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
    return bodyLogEntries.filter(e=>e.weight!=null&&(!cutoffStr||e.date>=cutoffStr)).map(e=>({
      date:e.date,
      value:weightUnit==='lbs'?Math.round(e.weight*2.20462*10)/10:e.weight,
    }));
  }, [bodyLogEntries, weightRange, weightUnit]);

  const weightStats = useMemo(() => {
    const withWeight=bodyLogEntries.filter(e=>e.weight!=null);
    if (!withWeight.length) return null;
    const weights=withWeight.map(e=>e.weight);
    const latest=withWeight[withWeight.length-1].weight;
    const d30=new Date(); d30.setDate(d30.getDate()-30);
    const d30str=`${d30.getFullYear()}-${String(d30.getMonth()+1).padStart(2,'0')}-${String(d30.getDate()).padStart(2,'0')}`;
    const d90=new Date(); d90.setDate(d90.getDate()-90);
    const d90str=`${d90.getFullYear()}-${String(d90.getMonth()+1).padStart(2,'0')}-${String(d90.getDate()).padStart(2,'0')}`;
    const entry30=withWeight.filter(e=>e.date<=d30str).pop();
    const entry90=withWeight.filter(e=>e.date<=d90str).pop();
    const minKg=Math.min(...weights), maxKg=Math.max(...weights);
    const toDisplay=(kg)=>weightUnit==='lbs'?Math.round(kg*2.20462*10)/10:kg;
    return {
      latest:toDisplay(latest),
      delta30:entry30!=null?Math.round((latest-entry30.weight)*10)/10*(weightUnit==='lbs'?2.20462:1):null,
      delta90:entry90!=null?Math.round((latest-entry90.weight)*10)/10*(weightUnit==='lbs'?2.20462:1):null,
      min:toDisplay(minKg),
      max:toDisplay(maxKg),
    };
  }, [bodyLogEntries, weightUnit]);

  const goalWeightDisplay = useMemo(() =>
    goalWeight==null?null:(weightUnit==='lbs'?Math.round(goalWeight*2.20462*10)/10:goalWeight),
    [goalWeight, weightUnit]
  );

  // ─── new Estado computations ───────────────────────────────────────────────

  const accentRGB = useMemo(() => {
    const todayEntry = readinessByDay[toYYYYMMDD(new Date())];
    if (todayEntry) {
      const score = ((todayEntry.energy || 0) + (11 - (todayEntry.soreness || 5)) + (todayEntry.sleep || 0)) / 3;
      if (score >= 7.5) return [80, 200, 120];
      if (score >= 5)   return [160, 180, 220];
      return [200, 80, 80];
    }
    return [120, 140, 180];
  }, [readinessByDay]);

  const readinessScoreToday = useMemo(() => {
    const entry = readinessByDay[toYYYYMMDD(new Date())];
    if (!entry) return null;
    return Math.round(((entry.energy || 0) + (11 - (entry.soreness || 5)) + (entry.sleep || 0)) / 3 * 10) / 10;
  }, [readinessByDay]);

  const tendencia30d = useMemo(() => {
    if (!topExercises.length || !oneRepMaxHistories.length) return null;
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const gains = [];
    topExercises.forEach(ex => {
      const hist = oneRepMaxHistories.find(h => h.exerciseKey === ex.key);
      if (!hist?.records?.length) return;
      const oldRecs = hist.records.filter(r => new Date(r.date) <= thirtyDaysAgo);
      if (oldRecs.length > 0 && ex.current > 0) {
        const oldVal = oldRecs[oldRecs.length - 1].value;
        if (oldVal > 0) gains.push(((ex.current - oldVal) / oldVal) * 100);
      }
    });
    if (!gains.length) return null;
    return Math.round(gains.reduce((a, b) => a + b, 0) / gains.length * 10) / 10;
  }, [topExercises, oneRepMaxHistories]);

  const bodyCompInference = useMemo(() => {
    const slope30 = computeWeightSlope(bodyLogEntries, 30);
    if (slope30 === null || tendencia30d === null) return null;
    const sDir = tendencia30d > 1 ? 'up' : tendencia30d < -1 ? 'down' : 'flat';
    const wDir = slope30 > 0.1 ? 'up' : slope30 < -0.1 ? 'down' : 'flat';
    if (sDir === 'up' && wDir === 'down') return 'Indicadores de recomposición corporal — ganando fuerza mientras bajas peso';
    if (sDir === 'up' && wDir === 'up')   return 'Fase de ganancia — tu fuerza y peso suben juntos';
    if (sDir === 'up' && wDir === 'flat') return 'Consolidación — manteniendo peso con mejora de fuerza';
    if (sDir === 'flat' && wDir === 'down') return 'Pérdida de peso manteniendo fuerza';
    if (sDir === 'down' && wDir === 'down') return 'Déficit agresivo — aumenta proteína para proteger músculo';
    return null;
  }, [bodyLogEntries, tendencia30d]);

  const thisWeekSessions = useMemo(() => {
    const today=new Date();
    const monday=new Date(today); monday.setDate(today.getDate()-((today.getDay()+6)%7)); monday.setHours(0,0,0,0);
    return sessionList.filter(s=>s.completedAt&&new Date(s.completedAt)>=monday).length;
  }, [sessionList]);

  const proteinAdherence7d = useMemo(() => {
    if (!plan?.daily_protein_g) return null;
    const vals=[];
    for (let i=0;i<7;i++) { const d=new Date(); d.setDate(d.getDate()-i); vals.push(nutritionByDay[toYYYYMMDD(d)]?.protein||0); }
    const avg=Math.round(vals.reduce((s,v)=>s+v,0)/7);
    return { avg, target:Math.round(plan.daily_protein_g), pct:Math.round((avg/plan.daily_protein_g)*100) };
  }, [nutritionByDay, plan]);

  const topInsight = useMemo(() =>
    recoveryWarning||energyInsight||trainingVsRestInsight||proteinInsight||rpeInsight||null,
    [recoveryWarning, energyInsight, trainingVsRestInsight, proteinInsight, rpeInsight]
  );

  // ─── styles ────────────────────────────────────────────────────────────────

  const styles = useMemo(() => createStyles(screenWidth, screenHeight), [screenWidth, screenHeight]);

  // ─── render helpers ────────────────────────────────────────────────────────

  const renderRangeToggle = () => (
    <View style={styles.rangeToggle}>
      {[4, 8].map((w) => (
        <TouchableOpacity key={w} style={[styles.rangeBtn, rangeWeeks===w && styles.rangeBtnActive]} onPress={() => setRangeWeeks(w)} activeOpacity={0.7}>
          <Text style={[styles.rangeBtnLabel, rangeWeeks===w && styles.rangeBtnLabelActive]}>{w} sem</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderInsight = (text) => text ? <Text style={styles.insightCaption}>{text}</Text> : null;

  const renderCard = (title, content, extra=null) => (
    <View className="lab-card" style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {extra}
      </View>
      {content}
    </View>
  );

  // ─── Fuerza Tab ────────────────────────────────────────────────────────────

  const renderFuerzaTab = () => (
    <>
      {renderCard('Progresión de fuerza',
        <>
          {topExercises.length===0 ? (
            <Text style={styles.emptyText}>Completa sesiones con peso y repeticiones para ver tu progresión de fuerza.</Text>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.exerciseChipsScroll} contentContainerStyle={styles.exerciseChipsContent}>
                {topExercises.map(ex=>(
                  <TouchableOpacity key={ex.key} style={[styles.exerciseChip, selectedExerciseKey===ex.key && styles.exerciseChipActive]} onPress={()=>setSelectedExerciseKey(ex.key)} activeOpacity={0.7}>
                    <Text style={[styles.exerciseChipLabel, selectedExerciseKey===ex.key && styles.exerciseChipLabelActive]} numberOfLines={1}>{ex.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {current1RM && (
                <View style={styles.strengthHeader}>
                  <View style={styles.tendenciesMain}>
                    <Text style={styles.tendenciesNumber}>{Math.round(current1RM.current)}</Text>
                    <Text style={styles.tendenciesUnit}>kg 1RM est.</Text>
                  </View>
                  {current1RM.delta!=null && (
                    <Text style={[styles.deltaBadge, current1RM.delta>=0?styles.deltaUp:styles.deltaDown]}>
                      {current1RM.delta>=0?'+':''}{current1RM.delta.toFixed(1)} kg en 4 semanas
                    </Text>
                  )}
                </View>
              )}
              {strengthChartData.length>=2 ? <LabStrengthChart data={strengthChartData} /> : <Text style={styles.emptyText}>Necesitas más sesiones para ver la tendencia.</Text>}
              {current1RM?.achievedWith?.weight && <Text style={styles.contextLine}>Mejor serie: {current1RM.achievedWith.weight} kg × {current1RM.achievedWith.reps} reps</Text>}
            </>
          )}
        </>
      )}

      {renderCard('Carga muscular',
        <>
          {volumeByWeekGrouped.every(w=>w.empuje+w.jalon+w.piernas+w.core+w.hombros===0) ? (
            <Text style={styles.emptyText}>Completa sesiones para ver el análisis de carga muscular.</Text>
          ) : (
            <>
              <View style={styles.muscleCardSummary}>
                <View>
                  <Text style={styles.muscleCardTotal}>{formatSetsNumber(weekTotals.total)}</Text>
                  <Text style={styles.muscleCardTotalLabel}>series esta semana</Text>
                </View>
                {weekTotals.pct!=null && (
                  <View style={[styles.muscleCardBadge, weekTotals.pct>=0?styles.muscleCardBadgeUp:styles.muscleCardBadgeDown]}>
                    <Text style={[styles.muscleCardBadgeText, weekTotals.pct>=0?styles.deltaUp:styles.deltaDown]}>
                      {weekTotals.pct>0?'+':''}{weekTotals.pct}% vs sem. ant.
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.muscleGroupList}>
                {muscleGroupStats.map(({ key, label, current, previous, maxEver })=>{
                  const trendPct=previous>0?Math.round(((current-previous)/previous)*100):null;
                  const barFrac=maxEver>0?current/maxEver:0;
                  const trendColor=trendPct==null?'rgba(255,255,255,0.3)':trendPct>10?'#4ade80':trendPct<-10?'#f87171':'rgba(255,255,255,0.5)';
                  const barColor=current===0?'rgba(255,255,255,0.06)':current<=6?'rgba(255,255,255,0.35)':current<=15?'rgba(255,255,255,0.7)':'rgba(139,0,0,0.7)';
                  const trendLabel=trendPct==null?'':trendPct>10?`↑${trendPct}%`:trendPct<-10?`↓${Math.abs(trendPct)}%`:'→';
                  return (
                    <View key={key} style={styles.muscleGroupRow}>
                      <Text style={styles.muscleGroupLabel}>{label}</Text>
                      <View style={styles.muscleGroupBar}><View style={[styles.muscleGroupBarFill, { width:`${Math.min(100,Math.round(barFrac*100))}%`, backgroundColor:barColor }]} /></View>
                      <Text style={styles.muscleGroupSets}>{current>0?`${formatSetsNumber(current)}s`:'—'}</Text>
                      <Text style={[styles.muscleGroupTrend, { color:trendColor }]}>{trendLabel}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.muscleCardDivider} />
              <LabMuscleHeatmap weekVolume={currentWeekVolume} previousWeekVolume={userData?.weeklyMuscleVolume?.[previousWeek]||{}} />
              <View style={styles.muscleCardDivider} />
              <View style={styles.muscleHistoryHeader}>
                <Text style={styles.chartSubtitle}>Historial de volumen</Text>
                {renderRangeToggle()}
              </View>
              <LabVolumeBarChart data={weeklyWellnessScore} rangeWeeks={rangeWeeks} />
              {renderInsight(volumeInsight)}
              {(readinessOnTrainingDays||recentRpeAvg!=null||recoveryWarning) && (
                <>
                  <View style={styles.muscleCardDivider} />
                  {readinessOnTrainingDays && (
                    <View style={styles.muscleContextRow}>
                      <Text style={styles.muscleContextLabel}>Preparación en entrenos ({readinessOnTrainingDays.count}d)</Text>
                      <View style={styles.muscleContextValues}>
                        <Text style={styles.muscleContextVal}>E {readinessOnTrainingDays.energy.toFixed(1)}</Text>
                        <Text style={styles.muscleContextVal}>S {readinessOnTrainingDays.sleep.toFixed(1)}</Text>
                        <Text style={styles.muscleContextVal}>D {readinessOnTrainingDays.soreness.toFixed(1)}</Text>
                      </View>
                    </View>
                  )}
                  {recentRpeAvg!=null && (
                    <View style={[styles.muscleContextRow, { marginTop:8 }]}>
                      <Text style={styles.muscleContextLabel}>RPE promedio (últimas 3 sesiones)</Text>
                      <Text style={[styles.muscleContextVal, { color:recentRpeAvg>=7?'#FFFFFF':'rgba(255,255,255,0.65)' }]}>{recentRpeAvg.toFixed(1)}</Text>
                    </View>
                  )}
                  {recoveryWarning && <Text style={[styles.insightCaption, { color:'#f87171', fontStyle:'normal', marginTop:8 }]}>⚠ {recoveryWarning}</Text>}
                </>
              )}
            </>
          )}
        </>
      )}

      {renderCard('Intensidad promedio (RPE)',
        <>
          {rpeBySession.length===0 ? (
            <Text style={styles.emptyText}>Registra intensidad en tus series para ver la tendencia de esfuerzo.</Text>
          ) : (
            <>
              <LabRpeChart data={rpeBySession} />
              {readinessOnTrainingDays && (
                <View style={styles.readinessTrainingRow}>
                  <Text style={styles.readinessTrainingLabel}>Preparación en días de entreno ({readinessOnTrainingDays.count}d):</Text>
                  <View style={styles.readinessTrainingValues}>
                    <Text style={styles.readinessTrainingVal}>E: {readinessOnTrainingDays.energy.toFixed(1)}</Text>
                    <Text style={styles.readinessTrainingVal}>D: {readinessOnTrainingDays.soreness.toFixed(1)}</Text>
                    <Text style={styles.readinessTrainingVal}>S: {readinessOnTrainingDays.sleep.toFixed(1)}</Text>
                  </View>
                </View>
              )}
              {renderInsight(readinessRpeInsight)}
              {renderInsight(rpeInsight)}
              {rpeReadinessCorrelation.length>=4 && (
                <>
                  <Text style={[styles.chartSubtitle, { marginTop:16, marginBottom:6 }]}>Energía vs RPE por sesión</Text>
                  <LabReadinessRpeScatter data={rpeReadinessCorrelation} />
                </>
              )}
            </>
          )}
        </>
      )}

      {planAdherenceData.length===0 ? null : renderCard('Adherencia al plan',
        <>
          {(()=>{
            const avg=Math.round(planAdherenceData.reduce((s,d)=>s+d.pct,0)/planAdherenceData.length);
            return (
              <>
                <View style={styles.adherenceAvgRow}>
                  <Text style={[styles.adherenceAvgPct, { color:getAdherenceColor(avg) }]}>{avg}%</Text>
                  <Text style={styles.adherenceAvgLabel}> del volumen planificado completado (últimas {planAdherenceData.length} sesiones)</Text>
                </View>
                {planAdherenceData.map((d,i)=>(
                  <View key={i} style={styles.adherenceRow}>
                    <View style={styles.adherenceInfo}>
                      <Text style={styles.adherenceSessionName} numberOfLines={1}>{d.sessionName}</Text>
                      <Text style={styles.adherenceDate}>{formatDaysAgo(d.date)}</Text>
                    </View>
                    <View style={styles.adherenceBarWrap}><View style={[styles.adherenceBarFill, { width:`${Math.min(100,d.pct)}%`, backgroundColor:getAdherenceColor(d.pct) }]} /></View>
                    <Text style={[styles.adherencePct, { color:getAdherenceColor(d.pct) }]}>{d.pct}%</Text>
                  </View>
                ))}
              </>
            );
          })()}
        </>
      )}
    </>
  );

  // ─── Nutrición Tab ─────────────────────────────────────────────────────────

  const renderNutricionTab = () => (
    <>
      {renderCard('Adherencia calórica (30 días)',
        <>
          {nutritionAdherenceBadges && (
            <View style={styles.badgesRow}>
              <View style={[styles.badge, { borderColor:getAdherenceColor(nutritionAdherenceBadges.calPct) }]}>
                <Text style={[styles.badgeValue, { color:getAdherenceColor(nutritionAdherenceBadges.calPct) }]}>{nutritionAdherenceBadges.calPct}%</Text>
                <Text style={styles.badgeLabel}>calorías · última semana</Text>
              </View>
              {nutritionAdherenceBadges.proteinPct!=null && (
                <View style={[styles.badge, { borderColor:getAdherenceColor(nutritionAdherenceBadges.proteinPct) }]}>
                  <Text style={[styles.badgeValue, { color:getAdherenceColor(nutritionAdherenceBadges.proteinPct) }]}>{nutritionAdherenceBadges.proteinPct}%</Text>
                  <Text style={styles.badgeLabel}>proteína · última semana</Text>
                </View>
              )}
            </View>
          )}
          {nutritionAdherence30.some(d=>d.logged>0) ? (
            <LabNutritionAdherenceChart data={nutritionAdherence30} target={plan?.daily_calories||0} />
          ) : (
            <Text style={styles.emptyText}>Registra comidas para ver tu adherencia calórica.</Text>
          )}
          {!plan && nutritionAdherence30.some(d=>d.logged>0) && <Text style={styles.contextLine}>Asigna un plan nutricional para ver tu adherencia al objetivo.</Text>}
        </>
      )}

      {renderCard('Distribución de macros',
        <>
          {!nutritionStats ? (
            <Text style={styles.emptyText}>Registra comidas en los últimos 14 días para ver tus macros.</Text>
          ) : (
            <View style={styles.macroCardBlock}>
              <View style={styles.macroCardKcalRow}>
                <View style={styles.tendenciesMain}>
                  <Text style={styles.tendenciesNumber}>{Math.round(nutritionStats.last7.calories)}</Text>
                  <Text style={styles.tendenciesUnit}>kcal prom. última semana</Text>
                </View>
                {nutritionStats.prev7.calories>0 && (
                  <Text style={[styles.deltaBadge, nutritionStats.pctCalories>=0?styles.deltaUp:styles.deltaDown]}>
                    {nutritionStats.pctCalories>0?'+':''}{nutritionStats.pctCalories}% vs sem. ant.
                  </Text>
                )}
              </View>
              {plan && (
                <Text style={styles.macroCardGoalLine}>
                  Objetivo: {plan.daily_calories?`${Math.round(plan.daily_calories)} kcal`:''}
                  {plan.daily_protein_g?` · ${Math.round(plan.daily_protein_g)}g P`:''}
                  {plan.daily_carbs_g?` · ${Math.round(plan.daily_carbs_g)}g C`:''}
                  {plan.daily_fat_g?` · ${Math.round(plan.daily_fat_g)}g G`:''}
                </Text>
              )}
              <View style={styles.macroCardContentRow}>
                {macroPieData.length>0 && <View style={styles.pieWrap}><LabNutritionPie data={macroPieData} screenWidth={screenWidth} /></View>}
                <View style={styles.macroListCol}>
                  {[
                    { label:'Proteína', val:Math.round(nutritionStats.last7.protein), pct:nutritionStats.pctProtein },
                    { label:'Carbos', val:Math.round(nutritionStats.last7.carbs), pct:nutritionStats.pctCarbs },
                    { label:'Grasa', val:Math.round(nutritionStats.last7.fat), pct:nutritionStats.pctFat },
                  ].map(({ label, val, pct })=>(
                    <View key={label} style={styles.macroListRow}>
                      <Text style={styles.macroListLabel}>{label}</Text>
                      <Text style={styles.macroListVal}>{val}g</Text>
                      {nutritionStats.prev7.protein>0 && <Text style={[styles.macroPct, pct>=0?styles.deltaUp:styles.deltaDown]}>{pct>0?'+':''}{pct}%</Text>}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
        </>
      )}

      {renderCard('Proteína por comida',
        <>
          {Object.values(proteinByMeal.protein||{}).every(v=>v===0) ? (
            <Text style={styles.emptyText}>Clasifica tus comidas (Desayuno/Almuerzo/Cena/Snack) al registrarlas para ver la distribución.</Text>
          ) : (
            <>
              <LabProteinMealBars data={proteinByMeal.protein} totalProtein={Object.values(proteinByMeal.protein||{}).reduce((s,v)=>s+v,0)} mealTimes={proteinByMeal.mealTimes} />
              {renderInsight(proteinInsight)}
            </>
          )}
        </>
      )}

      {renderCard('Entrenamiento vs descanso',
        <>
          {trainingVsRest.training.days<3||trainingVsRest.rest.days<3 ? (
            <Text style={styles.emptyText}>Necesitas más datos combinados de entrenamiento y nutrición para este análisis.</Text>
          ) : (
            <>
              <View style={styles.twoColumns}>
                {[
                  { label:`Entreno (${trainingVsRest.training.days}d)`, data:trainingVsRest.training },
                  { label:`Descanso (${trainingVsRest.rest.days}d)`, data:trainingVsRest.rest },
                ].map(({ label, data })=>(
                  <View key={label} style={styles.columnCard}>
                    <Text style={styles.columnCardTitle}>{label}</Text>
                    <Text style={styles.columnCardKcal}>{Math.round(data.calories)} kcal</Text>
                    <Text style={styles.columnCardMacro}>{Math.round(data.protein)}g P · {Math.round(data.carbs)}g C · {Math.round(data.fat)}g G</Text>
                  </View>
                ))}
              </View>
              {trainingVsRest.training.calories>0&&trainingVsRest.rest.calories>0 && (
                <View style={styles.trainingVsRestDelta}>
                  {(()=>{ const diff=Math.round(trainingVsRest.training.calories-trainingVsRest.rest.calories); const isPositive=diff>=0; return <Text style={[styles.deltaLine, isPositive?styles.deltaUp:styles.deltaDown]}>{isPositive?'+':''}{diff} kcal en días de entrenamiento</Text>; })()}
                </View>
              )}
              {renderInsight(trainingVsRestInsight)}
            </>
          )}
        </>
      )}
    </>
  );

  // ─── Hábitos Tab ───────────────────────────────────────────────────────────

  const renderHabitosTab = () => (
    <>
      {[sleepNextDayEnergyInsight, nutritionReadinessInsight, chronicReadinessTrend, readinessRpeInsight].some(Boolean) && renderCard('Patrones detectados',
        <>
          {renderInsight(chronicReadinessTrend)}
          {renderInsight(readinessRpeInsight)}
          {renderInsight(sleepNextDayEnergyInsight)}
          {renderInsight(nutritionReadinessInsight)}
        </>
      )}

      {renderCard('Consistencia de entrenamiento',
        <>
          {sessionList.length===0 ? (
            <Text style={styles.emptyText}>Completa sesiones para ver tu heatmap de consistencia.</Text>
          ) : (
            <>
              <LabConsistencyGrid weeks={consistencyWeeks} readinessByDay={readinessByDay} />
              <View style={styles.consistencyReadinessLegend}>
                {[{ color:'rgba(74,222,128,0.8)', label:'Entreno con alta energía' }, { color:'rgba(248,113,113,0.7)', label:'Entreno con baja energía' }].map(({ color, label })=>(
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor:color }]} />
                    <Text style={styles.legendLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}

      {renderCard('Energía disponible',
        <>
          <Text style={styles.chartSubtitle}>Calorías semanales vs carga de entrenamiento</Text>
          {energyByWeek.every(w=>w.effectiveSets===0&&w.totalCalories===0) ? (
            <Text style={styles.emptyText}>Necesitas datos de entrenamiento y nutrición para este análisis.</Text>
          ) : (
            <>
              <LabEnergyAvailabilityChart data={energyByWeek} />
              {renderInsight(energyInsight)}
            </>
          )}
        </>,
        renderRangeToggle()
      )}

      {renderCard('Racha y hábitos',
        <>
          {!userData?.activityStreak ? (
            <Text style={styles.emptyText}>Comienza a entrenar para construir tu racha.</Text>
          ) : (
            <>
              <View style={styles.streakRow}>
                <View>
                  <View style={styles.tendenciesMain}>
                    <Text style={[styles.tendenciesNumber, { fontSize:Math.min(screenWidth*0.12,48) }]}>{userData.activityStreak.streakNumber||0}</Text>
                    <Text style={styles.tendenciesUnit}>días</Text>
                  </View>
                  <Text style={styles.streakSub}>racha actual</Text>
                </View>
                {userData.activityStreak.longestStreak>0 && (
                  <View style={styles.streakBest}>
                    <Text style={styles.streakBestNum}>{userData.activityStreak.longestStreak}</Text>
                    <Text style={styles.streakBestLabel}>mejor racha</Text>
                  </View>
                )}
              </View>
              {(()=>{
                const sessionDateMap={}, diaryDateMap={};
                sessionList.forEach(s=>{ if (s.completedAt) sessionDateMap[toYYYYMMDD(new Date(s.completedAt))]=true; });
                diaryEntries.forEach(e=>{ if (e.date) diaryDateMap[e.date]=true; });
                const days=[];
                const dayLabels=['L','M','X','J','V','S','D'];
                for (let i=6;i>=0;i--) { const d=new Date(); d.setDate(d.getDate()-i); const ds=toYYYYMMDD(d); const dow=(d.getDay()+6)%7; days.push({ ds, label:dayLabels[dow], active:sessionDateMap[ds]||diaryDateMap[ds] }); }
                return (
                  <View style={styles.activityPills}>
                    {days.map(({ ds, label, active })=>(
                      <View key={ds} style={styles.activityPillWrap}>
                        <View style={[styles.activityPill, active&&styles.activityPillActive]} />
                        <Text style={styles.activityPillLabel}>{label}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </>
          )}
        </>
      )}

      {readinessEntries.length>0 && renderCard('Preparación diaria',
        <>
          {readinessWeeklyAvg.this.count>0 && (
            <View style={styles.readinessWeekRow}>
              {[{ label:'Energía', key:'energy' }, { label:'Frescura', key:'soreness' }, { label:'Sueño', key:'sleep' }].map(({ label, key })=>{
                const val=readinessWeeklyAvg.this[key];
                const prevVal=readinessWeeklyAvg.last[key];
                const delta=val!=null&&prevVal!=null?((val-prevVal)/prevVal*100):null;
                return (
                  <View key={key} style={styles.readinessStat}>
                    <Text style={styles.readinessStatVal}>{val!=null?val.toFixed(1):'—'}</Text>
                    <Text style={styles.readinessStatLabel}>{label}</Text>
                    {delta!=null&&Math.abs(delta)>=5 && <Text style={[styles.readinessStatDelta, delta>=0?styles.deltaUp:styles.deltaDown]}>{delta>0?'+':''}{Math.round(delta)}%</Text>}
                  </View>
                );
              })}
            </View>
          )}
          <LabReadinessChart data={readinessChartData} />
          <View style={styles.readinessLegend}>
            {[{ color:'rgba(74,222,128,0.8)', label:'Energía' }, { color:'rgba(147,197,253,0.8)', label:'Sueño' }, { color:'rgba(255,255,255,0.7)', label:'Frescura' }].map(({ color, label })=>(
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor:color }]} />
                <Text style={styles.legendLabel}>{label}</Text>
              </View>
            ))}
          </View>
          {recoveryWarning && <Text style={[styles.insightCaption, { color:'#f87171', fontStyle:'normal' }]}>⚠ {recoveryWarning}</Text>}
          {renderInsight(sleepNextDayEnergyInsight)}
          {renderInsight(nutritionReadinessInsight)}
        </>
      )}
    </>
  );

  // ─── Sesiones Tab ──────────────────────────────────────────────────────────

  const renderSesionesTab = () => (
    <>
      {renderCard('Historial de sesiones',
        <>
          {sessionList.length===0 ? (
            <Text style={styles.emptyText}>Completa sesiones para ver tu historial.</Text>
          ) : (
            <View style={styles.sessionList}>
              {sessionList.map(s=>{
                const id=s.id||s.sessionId;
                let completedAtIso=null;
                if (typeof s.completedAt==='string') completedAtIso=s.completedAt;
                else if (s.completedAt&&typeof s.completedAt.toDate==='function') completedAtIso=s.completedAt.toDate().toISOString();
                const relative=completedAtIso?formatDaysAgo(completedAtIso):'';
                const completedDate=completedAtIso?new Date(completedAtIso):null;
                const absoluteDate=completedDate?completedDate.toLocaleDateString('es-ES',{ day:'numeric', month:'short' }):'';
                const exerciseEntries=Object.values(s.exercises||{});
                const exerciseCount=exerciseEntries.length;
                const totalSets=exerciseEntries.reduce((sum,ex)=>sum+(ex.sets?ex.sets.length:0),0);
                return (
                  <TouchableOpacity key={id} className="session-row" style={styles.sessionHistoryCard} onPress={()=>handleSessionPress(s,completedAtIso)} activeOpacity={0.7}>
                    <View style={styles.sessionRow}>
                      <View style={styles.sessionRowMain}>
                        <Text style={styles.sessionRowTitle} numberOfLines={1}>{s.sessionName||'Sesión de entrenamiento'}</Text>
                        {s.courseName ? <Text style={styles.sessionRowCourse} numberOfLines={1}>{s.courseName}</Text> : null}
                        <Text style={styles.sessionRowMeta}>{absoluteDate}{relative?` · ${relative}`:''}</Text>
                      </View>
                      <View style={styles.sessionRowRight}>
                        <Text style={styles.sessionRowStat}>{exerciseCount} ej.</Text>
                        <Text style={styles.sessionRowStat}>{totalSets} series</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}
    </>
  );

  // ─── Cuerpo Tab ────────────────────────────────────────────────────────────

  const renderCuerpoTab = () => {
    const uid = user?.uid || auth.currentUser?.uid;
    const allDates = [...bodyLogEntries].reverse();
    const cardPad = Math.max(16, screenWidth * 0.04);
    const cardMx = CARD_MARGIN;

    const sectionCard = {
      marginHorizontal: cardMx, marginBottom: 14,
      backgroundColor: '#2a2a2a',
      borderRadius: Math.max(12, screenWidth * 0.04),
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
    };

    const SectionLabel = ({ children, action }) => (
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginHorizontal:cardMx, marginBottom:8, marginTop:4 }}>
        <Text style={{ fontSize:13, fontWeight:'600', color:'rgba(255,255,255,0.45)' }}>{children}</Text>
        {action}
      </View>
    );

    const StatRow = ({ label, value, valueColor, isLast }) => (
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:cardPad, paddingVertical:13, borderBottomWidth:isLast?0:1, borderBottomColor:'rgba(255,255,255,0.07)' }}>
        <Text style={{ fontSize:15, color:'rgba(255,255,255,0.85)', fontWeight:'400' }}>{label}</Text>
        <Text style={{ fontSize:15, fontWeight:'600', color:valueColor||'rgba(255,255,255,0.85)' }}>{value}</Text>
      </View>
    );

    const latestW = latestBodyEntry?.weight!=null
      ? (weightUnit==='lbs' ? Math.round(latestBodyEntry.weight*2.20462*10)/10 : latestBodyEntry.weight)
      : null;

    return (
      <>
        {/* Hero */}
        <View style={{ alignItems:'center', paddingVertical:20, marginBottom:8 }}>
          <View style={{ marginBottom:10 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="5" r="3" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5"/>
              <path d="M8 10c0-1 .5-2 4-2s4 1 4 2v9H8V10Z" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 19v-2M14 19v-2" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </View>
          {latestW!=null ? (
            <>
              <Text style={{ fontSize:Math.min(screenWidth*0.13,52), fontWeight:'700', color:'#fff', letterSpacing:-1 }}>
                {latestW} <Text style={{ fontSize:Math.min(screenWidth*0.06,24), fontWeight:'500', color:'rgba(255,255,255,0.6)' }}>{weightUnit}</Text>
              </Text>
              <Text style={{ fontSize:13, color:'rgba(255,255,255,0.4)', marginTop:4 }}>Actualizado {formatBodyDate(latestBodyEntry.date)}</Text>
            </>
          ) : (
            <Text style={{ fontSize:15, color:'rgba(255,255,255,0.4)', marginTop:4 }}>Registra tu primer peso para comenzar</Text>
          )}
          <View style={{ flexDirection:'row', gap:6, marginTop:14 }}>
            {['kg','lbs'].map(u=>(
              <TouchableOpacity key={u} onPress={()=>handleWeightUnitChange(u)} style={[styles.rangeBtn, weightUnit===u&&styles.rangeBtnActive]} activeOpacity={0.7}>
                <Text style={[styles.rangeBtnLabel, weightUnit===u&&styles.rangeBtnLabelActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* History */}
        <SectionLabel>Historial</SectionLabel>
        <View style={sectionCard}>
          <View style={{ flexDirection:'row', gap:6, padding:cardPad, paddingBottom:12 }}>
            {[{ label:'30d', val:30 }, { label:'90d', val:90 }, { label:'1a', val:365 }, { label:'Todo', val:0 }].map(({ label, val })=>(
              <TouchableOpacity key={val} style={[styles.rangeBtn, weightRange===val&&styles.rangeBtnActive]} onPress={()=>setWeightRange(val)} activeOpacity={0.7}>
                <Text style={[styles.rangeBtnLabel, weightRange===val&&styles.rangeBtnLabelActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ paddingHorizontal:8, paddingBottom:cardPad }}>
            {weightChartData.length>=2 ? (
              <LabWeightChart data={weightChartData} goalValue={goalWeightDisplay} unit={weightUnit} />
            ) : (
              <Text style={[styles.emptyText, { padding:cardPad }]}>Registra al menos dos pesos para ver la gráfica.</Text>
            )}
          </View>
        </View>

        {/* Statistics */}
        {weightStats && (
          <>
            <SectionLabel>Estadísticas</SectionLabel>
            <View style={sectionCard}>
              {[
                { label:'Cambio en 30 días', val:weightStats.delta30, isDelta:true },
                { label:'Cambio en 90 días', val:weightStats.delta90, isDelta:true },
                { label:'Mínimo', val:weightStats.min, isDelta:false },
                { label:'Máximo', val:weightStats.max, isDelta:false },
              ].map(({ label, val, isDelta }, idx, arr) => val!=null && (
                <StatRow key={label} label={label}
                  value={isDelta?`${val>0?'+':''}${Math.round(val*10)/10} ${weightUnit}`:`${val} ${weightUnit}`}
                  valueColor={isDelta?(val<0?'#4ade80':val>0?'rgba(255,255,255,0.75)':'rgba(255,255,255,0.6)'):(label==='Mínimo'?'#4ade80':'rgba(255,255,255,0.75)')}
                  isLast={idx===arr.length-1}
                />
              ))}
            </View>
          </>
        )}

        {/* Body comp inference */}
        {bodyCompInference && (
          <View style={[sectionCard, { marginBottom: 14 }]}>
            <View style={{ paddingHorizontal: cardPad, paddingVertical: 14 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Composición corporal</Text>
              <Text style={{ fontSize: 14, color: `rgba(${accentRGB[0]},${accentRGB[1]},${accentRGB[2]},0.9)`, fontWeight: '500', lineHeight: 20 }}>{bodyCompInference}</Text>
            </View>
          </View>
        )}

        {/* Goal */}
        <SectionLabel>Objetivo</SectionLabel>
        <View style={sectionCard}>
          <TouchableOpacity onPress={()=>setGoalModalVisible(true)} activeOpacity={0.7} style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:cardPad, paddingVertical:14, gap:12 }}>
            <View style={{ width:36, height:36, alignItems:'center', justifyContent:'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="5.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.8)"/>
              </svg>
            </View>
            <View style={{ flex:1 }}>
              {goalWeightDisplay!=null ? (
                <>
                  <Text style={{ fontSize:15, fontWeight:'600', color:'#fff' }}>Objetivo: {goalWeightDisplay} {weightUnit}</Text>
                  {weightStats?.latest!=null && (
                    <Text style={{ fontSize:13, color:'rgba(255,255,255,0.45)', marginTop:2 }}>
                      {Math.round((goalWeightDisplay-weightStats.latest)*10)/10>0
                        ?`+${Math.round((goalWeightDisplay-weightStats.latest)*10)/10} ${weightUnit} para llegar`
                        :`${Math.round((goalWeightDisplay-weightStats.latest)*10)/10} ${weightUnit} para llegar`}
                    </Text>
                  )}
                </>
              ) : (
                <Text style={{ fontSize:15, color:'rgba(255,255,255,0.45)' }}>Establecer objetivo</Text>
              )}
            </View>
            <Text style={{ color:'rgba(255,255,255,0.25)', fontSize:18 }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* All Entries */}
        <SectionLabel action={
          <TouchableOpacity onPress={openNewEntry} activeOpacity={0.7} style={{ width:28, height:28, borderRadius:14, backgroundColor:'rgba(255,255,255,0.12)', borderWidth:1, borderColor:'rgba(255,255,255,0.2)', alignItems:'center', justifyContent:'center' }}>
            <Text style={{ color:'#fff', fontSize:18, lineHeight:20, fontWeight:'300', marginTop:-1 }}>+</Text>
          </TouchableOpacity>
        }>Todos los registros</SectionLabel>
        <View style={[sectionCard, { marginBottom:32 }]}>
          {allDates.length===0 ? (
            <Text style={[styles.emptyText, { padding:cardPad }]}>Toca "+" para registrar tu primer peso.</Text>
          ) : (
            allDates.map((entry, idx)=>{
              const displayW=entry.weight!=null
                ?(weightUnit==='lbs'?`${Math.round(entry.weight*2.20462*10)/10} lbs`:`${entry.weight} kg`)
                :null;
              const hasPhotos=entry.photos?.length>0;
              const thumbPhoto=hasPhotos?entry.photos[0]:null;
              return (
                <TouchableOpacity key={entry.id} onPress={()=>openEditEntry(entry)} activeOpacity={0.7}
                  style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:cardPad, paddingVertical:12, borderBottomWidth:idx===allDates.length-1?0:1, borderBottomColor:'rgba(255,255,255,0.07)', gap:10 }}>
                  <View style={{ flex:1, flexDirection:'row', alignItems:'center', gap:8 }}>
                    <View>
                      <Text style={{ fontSize:15, fontWeight:'600', color:'#fff', marginBottom:2 }}>{formatBodyDate(entry.date)}</Text>
                      {displayW && <Text style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>{displayW}</Text>}
                    </View>
                    {thumbPhoto && (
                      <TouchableOpacity
                        onPress={(e)=>{ e.stopPropagation?.(); setLightboxPhoto({ ...thumbPhoto, entryDate:entry.date }); }}
                        activeOpacity={0.8}
                      >
                        <View style={{ width:40, height:40, borderRadius:8, overflow:'hidden', borderWidth:1, borderColor:'rgba(255,255,255,0.1)' }}>
                          <img src={thumbPhoto.storageUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={{ color:'rgba(255,255,255,0.25)', fontSize:17 }}>›</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </>
    );
  };

  // ─── main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:'#1a1a1a' }} edges={['left','right']}>
      <FixedWakeHeader />
      <ScrollView style={{ flex:1 }} contentContainerStyle={{ flexGrow:1, paddingBottom:100 }} showsVerticalScrollIndicator={false}>
        <WakeHeaderContent>
          <WakeHeaderSpacer />
          <View style={{ paddingTop:16, marginBottom:8 }}>
            <Text style={{ fontSize:28, fontWeight:'600', color:'#fff', paddingLeft:screenWidth*0.12 }}>Lab</Text>
          </View>

          {/* 2-screen nav */}
          <div style={{ display:'flex', gap:8, padding:'0 24px 20px', overflowX:'auto' }}>
            {[['estado','Estado'],['historial','Historial']].map(([s,l])=>(
              <button key={s} onClick={()=>setActiveScreen(s)} style={{
                padding:'8px 20px', borderRadius:999, border:'1px solid',
                borderColor: activeScreen===s?'rgba(255,255,255,0.45)':'rgba(255,255,255,0.15)',
                background: activeScreen===s?'rgba(255,255,255,0.13)':'transparent',
                color: activeScreen===s?'#fff':'rgba(255,255,255,0.5)',
                fontSize:13, fontWeight: activeScreen===s?'600':'500',
                cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', transition:'all 0.2s',
              }}>{l}</button>
            ))}
          </div>

          {loading ? (
            <View style={{ flex:1, alignItems:'center', justifyContent:'center', paddingTop:60 }}>
              <WakeLoader />
            </View>
          ) : (
            <>
              {activeScreen==='estado' && (
                <div className="lab-screen-anim" style={{ padding:'0 20px' }}>
                  <EstadoScreen
                    userData={userData}
                    bodyLogEntries={bodyLogEntries}
                    weightStats={weightStats}
                    weightUnit={weightUnit}
                    goalWeight={goalWeight}
                    thisWeekSessions={thisWeekSessions}
                    proteinAdherence7d={proteinAdherence7d}
                    topExercises={topExercises}
                    topInsight={topInsight}
                    accentRGB={accentRGB}
                    onOpenBodyEntry={()=>{ setEditingEntry(null); setEntryModalVisible(true); }}
                    readinessScoreToday={readinessScoreToday}
                    bodyCompInference={bodyCompInference}
                    sessionList={sessionList}
                    oneRepMaxHistories={oneRepMaxHistories}
                    readinessByDay={readinessByDay}
                  />
                </div>
              )}

{activeScreen==='historial' && (
                <div className="lab-screen-anim">
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom:16 }}
                    contentContainerStyle={{ paddingHorizontal:CARD_MARGIN, gap:8, flexDirection:'row' }}
                  >
                    {[['fuerza','Fuerza'],['cuerpo','Cuerpo'],['nutricion','Nutrición'],['habitos','Hábitos'],['sesiones','Sesiones']].map(([k,l])=>(
                      <TouchableOpacity key={k} style={[tabStyles.pill, historialTab===k&&tabStyles.pillActive]} onPress={()=>setHistorialTab(k)} activeOpacity={0.7}>
                        <Text style={[tabStyles.label, historialTab===k&&tabStyles.labelActive]}>{l}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {historialTab==='fuerza'    && renderFuerzaTab()}
                  {historialTab==='cuerpo'    && renderCuerpoTab()}
                  {historialTab==='nutricion' && renderNutricionTab()}
                  {historialTab==='habitos'   && renderHabitosTab()}
                  {historialTab==='sesiones'  && renderSesionesTab()}
                </div>
              )}
            </>
          )}

          <BottomSpacer />
          <View style={{ height:120 }} />
        </WakeHeaderContent>
      </ScrollView>

      <BodyEntryModal
        visible={entryModalVisible}
        onClose={()=>setEntryModalVisible(false)}
        entry={editingEntry}
        userId={user?.uid||auth.currentUser?.uid}
        unit={weightUnit}
        onUnitChange={handleWeightUnitChange}
        onSaved={handleEntrySaved}
        defaultWeightKg={latestBodyEntry?.weight||(weightUnit==='lbs'?180/2.20462:70)}
      />

      <GoalWeightModal
        visible={goalModalVisible}
        onClose={()=>setGoalModalVisible(false)}
        currentGoal={goalWeight}
        unit={weightUnit}
        userId={user?.uid||auth.currentUser?.uid}
        onSaved={(kg)=>setGoalWeight(kg)}
      />

      {lightboxPhoto && (
        <PhotoLightbox
          photo={lightboxPhoto}
          onClose={()=>setLightboxPhoto(null)}
          onDelete={()=>handleDeletePhoto(lightboxPhoto)}
        />
      )}
    </SafeAreaView>
  );
};

// ─── styles ───────────────────────────────────────────────────────────────────

const createStyles = (screenWidth, screenHeight) => StyleSheet.create({
  container: { flex:1, backgroundColor:'#1a1a1a' },
  scrollView: { flex:1 },
  scrollContent: { flexGrow:1, paddingBottom:80 },
  titleSection: { paddingTop:Math.max(16,screenHeight*0.02), marginBottom:Math.max(16,screenHeight*0.02) },
  screenTitle: { fontSize:Math.min(screenWidth*0.08,32), fontWeight:'600', color:'#ffffff', paddingLeft:screenWidth*0.12 },
  tabBar: { flexDirection:'row', paddingHorizontal:CARD_MARGIN, gap:8, marginBottom:Math.max(16,screenHeight*0.02) },
  tabPill: { paddingHorizontal:Math.max(14,screenWidth*0.06), paddingVertical:9, borderRadius:999, borderWidth:1, borderColor:'rgba(255,255,255,0.15)', alignItems:'center' },
  tabPillActive: { backgroundColor:'rgba(255,255,255,0.8)', borderColor:'rgba(255,255,255,0.8)' },
  tabLabel: { fontSize:13, fontWeight:'500', color:'rgba(255,255,255,0.5)' },
  tabLabelActive: { color:'#1a1a1a', fontWeight:'600' },
  tabBarContent: { paddingHorizontal:0, gap:8, flexDirection:'row' },
  sessionList: { marginTop:4, gap:10 },
  sessionHistoryCard: { borderRadius:12, borderWidth:1, borderColor:'rgba(255,255,255,0.08)', backgroundColor:'rgba(255,255,255,0.03)', paddingHorizontal:12, paddingVertical:10 },
  sessionRow: { flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between' },
  sessionRowMain: { flex:1, paddingRight:12 },
  sessionRowTitle: { fontSize:13, fontWeight:'600', color:'#ffffff', marginBottom:2 },
  sessionRowCourse: { fontSize:11, color:'rgba(255,255,255,0.65)', marginBottom:2 },
  sessionRowMeta: { fontSize:11, color:'rgba(255,255,255,0.5)' },
  sessionRowRight: { alignItems:'flex-end', justifyContent:'center', minWidth:72 },
  sessionRowStat: { fontSize:11, color:'rgba(255,255,255,0.7)' },
  card: { marginHorizontal:CARD_MARGIN, marginBottom:Math.max(14,screenHeight*0.018), backgroundColor:'#2a2a2a', borderRadius:Math.max(12,screenWidth*0.04), borderWidth:1, borderColor:'rgba(255,255,255,0.08)', padding:Math.max(16,screenWidth*0.04) },
  cardHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14 },
  cardTitle: { fontSize:16, fontWeight:'600', color:'#ffffff', flex:1, marginRight:8 },
  emptyText: { fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:20 },
  insightCaption: { fontSize:12, color:'rgba(255,255,255,0.5)', fontStyle:'italic', marginTop:10, lineHeight:17 },
  contextLine: { fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:8 },
  chartSubtitle: { fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:10, marginTop:-4 },
  rangeToggle: { flexDirection:'row', gap:6 },
  rangeBtn: { paddingHorizontal:10, paddingVertical:4, borderRadius:999, borderWidth:1, borderColor:'rgba(255,255,255,0.15)' },
  rangeBtnActive: { backgroundColor:'rgba(255,255,255,0.12)', borderColor:'rgba(255,255,255,0.3)' },
  rangeBtnLabel: { fontSize:11, color:'rgba(255,255,255,0.4)' },
  rangeBtnLabelActive: { color:'rgba(255,255,255,0.9)' },
  tendenciesMain: { flexDirection:'row', alignItems:'baseline', gap:4 },
  tendenciesNumber: { color:'#ffffff', fontSize:Math.min(screenWidth*0.08,32), fontWeight:'700' },
  tendenciesUnit: { color:'rgba(255,255,255,0.6)', fontSize:Math.min(screenWidth*0.035,14) },
  deltaBadge: { fontSize:12, fontWeight:'600' },
  deltaUp: { color:'#4ade80' },
  deltaDown: { color:'#f87171' },
  exerciseChipsScroll: { marginBottom:12, marginHorizontal:-4 },
  exerciseChipsContent: { paddingHorizontal:4, gap:6, flexDirection:'row' },
  exerciseChip: { paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor:'rgba(255,255,255,0.18)', maxWidth:160 },
  exerciseChipActive: { backgroundColor:'rgba(255,255,255,0.12)', borderColor:'rgba(255,255,255,0.4)' },
  exerciseChipLabel: { fontSize:12, color:'rgba(255,255,255,0.5)' },
  exerciseChipLabelActive: { color:'#ffffff', fontWeight:'500' },
  strengthHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  adherenceAvgRow: { flexDirection:'row', alignItems:'baseline', marginBottom:14, flexWrap:'wrap' },
  adherenceAvgPct: { fontSize:22, fontWeight:'700' },
  adherenceAvgLabel: { fontSize:12, color:'rgba(255,255,255,0.5)', flex:1, marginLeft:4 },
  adherenceRow: { flexDirection:'row', alignItems:'center', marginBottom:10, gap:8 },
  adherenceInfo: { width:110 },
  adherenceSessionName: { fontSize:12, color:'#ffffff', fontWeight:'500' },
  adherenceDate: { fontSize:10, color:'rgba(255,255,255,0.4)', marginTop:1 },
  adherenceBarWrap: { flex:1, height:5, backgroundColor:'rgba(255,255,255,0.08)', borderRadius:3, overflow:'hidden' },
  adherenceBarFill: { height:5, borderRadius:3 },
  adherencePct: { width:36, textAlign:'right', fontSize:12, fontWeight:'600' },
  badgesRow: { flexDirection:'row', gap:10, marginBottom:12 },
  badge: { borderWidth:1, borderRadius:10, paddingHorizontal:12, paddingVertical:8, alignItems:'center', minWidth:80 },
  badgeValue: { fontSize:18, fontWeight:'700' },
  badgeLabel: { fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:2 },
  nutritionRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  macroCardBlock: { gap:12 },
  macroCardKcalRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  macroCardGoalLine: { fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:4 },
  macroCardContentRow: { flexDirection:'row', alignItems:'flex-start', justifyContent:'flex-start', gap:20 },
  pieWrap: { width:140, minWidth:140, alignItems:'center', justifyContent:'flex-start', overflow:'visible' },
  macroListCol: { flex:1, justifyContent:'flex-start', gap:6 },
  macroListRow: { flexDirection:'row', alignItems:'center', gap:8 },
  macroListLabel: { fontSize:13, color:'rgba(255,255,255,0.7)', minWidth:70 },
  macroListVal: { fontSize:15, fontWeight:'600', color:'#ffffff' },
  macroRow: { flexDirection:'row', justifyContent:'space-around', marginTop:6 },
  macroItem: { alignItems:'center' },
  macroVal: { fontSize:16, fontWeight:'600', color:'#ffffff' },
  macroLabel: { fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:2 },
  macroPct: { fontSize:11, fontWeight:'600', marginTop:0 },
  planTargetsRow: { flexDirection:'row', marginTop:8, paddingTop:8, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.06)', flexWrap:'wrap' },
  planTargetsLabel: { fontSize:12, color:'rgba(255,255,255,0.4)' },
  planTargetsValues: { fontSize:12, color:'rgba(255,255,255,0.6)', flex:1 },
  twoColumns: { flexDirection:'row', gap:10, marginBottom:12 },
  columnCard: { flex:1, backgroundColor:'rgba(255,255,255,0.05)', borderRadius:10, padding:12 },
  columnCardTitle: { fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:6 },
  columnCardKcal: { fontSize:18, fontWeight:'700', color:'#ffffff', marginBottom:4 },
  columnCardMacro: { fontSize:10, color:'rgba(255,255,255,0.5)' },
  trainingVsRestDelta: { alignItems:'center', marginBottom:4 },
  deltaLine: { fontSize:13, fontWeight:'600' },
  streakRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-end', marginBottom:16 },
  streakSub: { fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 },
  streakBest: { alignItems:'flex-end' },
  streakBestNum: { fontSize:22, fontWeight:'700', color:'rgba(255,255,255,0.7)' },
  streakBestLabel: { fontSize:11, color:'rgba(255,255,255,0.4)' },
  activityPills: { flexDirection:'row', gap:8, justifyContent:'center' },
  activityPillWrap: { alignItems:'center', gap:4 },
  activityPill: { width:28, height:28, borderRadius:14, backgroundColor:'rgba(255,255,255,0.07)', borderWidth:1, borderColor:'rgba(255,255,255,0.1)' },
  activityPillActive: { backgroundColor:'rgba(255,255,255,0.75)', borderColor:'rgba(255,255,255,0.8)' },
  activityPillLabel: { fontSize:10, color:'rgba(255,255,255,0.35)' },
  readinessWeekRow: { flexDirection:'row', justifyContent:'space-around', marginBottom:16, paddingBottom:14, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.06)' },
  readinessStat: { alignItems:'center' },
  readinessStatVal: { fontSize:22, fontWeight:'700', color:'#ffffff' },
  readinessStatLabel: { fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:2 },
  readinessStatDelta: { fontSize:11, fontWeight:'600', marginTop:2 },
  readinessLegend: { flexDirection:'row', justifyContent:'center', gap:16, marginTop:12 },
  legendItem: { flexDirection:'row', alignItems:'center', gap:5 },
  legendDot: { width:7, height:7, borderRadius:3.5 },
  legendLabel: { fontSize:11, color:'rgba(255,255,255,0.5)' },
  readinessTrainingRow: { marginTop:12, paddingTop:10, borderTopWidth:1, borderTopColor:'rgba(255,255,255,0.06)' },
  readinessTrainingLabel: { fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:6 },
  readinessTrainingValues: { flexDirection:'row', gap:14 },
  readinessTrainingVal: { fontSize:12, color:'rgba(255,255,255,0.65)', fontWeight:'500' },
  consistencyReadinessLegend: { flexDirection:'row', flexWrap:'wrap', gap:12, marginTop:10 },
  muscleCardSummary: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-end', marginBottom:16 },
  muscleCardTotal: { fontSize:32, fontWeight:'700', color:'#ffffff', lineHeight:36 },
  muscleCardTotalLabel: { fontSize:12, color:'rgba(255,255,255,0.45)', marginTop:2 },
  muscleCardBadge: { paddingHorizontal:10, paddingVertical:5, borderRadius:8, borderWidth:1 },
  muscleCardBadgeUp: { backgroundColor:'rgba(74,222,128,0.12)', borderColor:'rgba(74,222,128,0.28)' },
  muscleCardBadgeDown: { backgroundColor:'rgba(248,113,113,0.08)', borderColor:'rgba(248,113,113,0.25)' },
  muscleCardBadgeText: { fontSize:12, fontWeight:'600' },
  muscleGroupList: { gap:8, marginBottom:4 },
  muscleGroupRow: { flexDirection:'row', alignItems:'center', gap:8 },
  muscleGroupLabel: { width:58, fontSize:12, color:'rgba(255,255,255,0.6)', fontWeight:'500' },
  muscleGroupBar: { flex:1, height:5, backgroundColor:'rgba(255,255,255,0.07)', borderRadius:3, overflow:'hidden' },
  muscleGroupBarFill: { height:5, borderRadius:3 },
  muscleGroupSets: { width:26, textAlign:'right', fontSize:12, color:'rgba(255,255,255,0.7)', fontWeight:'500' },
  muscleGroupTrend: { width:42, textAlign:'right', fontSize:11, fontWeight:'600' },
  muscleCardDivider: { height:1, backgroundColor:'rgba(255,255,255,0.06)', marginVertical:14 },
  muscleHistoryHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 },
  muscleContextRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  muscleContextLabel: { fontSize:11, color:'rgba(255,255,255,0.4)', flex:1, marginRight:8 },
  muscleContextValues: { flexDirection:'row', gap:10 },
  muscleContextVal: { fontSize:12, color:'rgba(255,255,255,0.65)', fontWeight:'500' },
});

const tabStyles = StyleSheet.create({
  pill: { paddingHorizontal:16, paddingVertical:9, borderRadius:999, borderWidth:1, borderColor:'rgba(255,255,255,0.15)' },
  pillActive: { backgroundColor:'rgba(255,255,255,0.8)', borderColor:'rgba(255,255,255,0.8)' },
  label: { fontSize:13, fontWeight:'500', color:'rgba(255,255,255,0.5)' },
  labelActive: { color:'#1a1a1a', fontWeight:'600' },
});

export default LabScreen;
