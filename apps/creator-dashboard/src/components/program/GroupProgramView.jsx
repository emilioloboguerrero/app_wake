import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import DashboardLayout from '../DashboardLayout';
import MediaPickerModal from '../MediaPickerModal';
import TubelightNavBar from '../ui/TubelightNavBar';
import { BentoCard } from '../ui/BentoGrid';
import GlowingEffect from '../ui/GlowingEffect';
import NumberTicker from '../ui/NumberTicker';
import DemographicsCard from './DemographicsCard';
import ProgramPlanTab from './ProgramPlanTab';
import ProgramNutritionTab from './ProgramNutritionTab';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { extractAccentFromImage } from '../events/eventFieldComponents';
import { useModules } from '../../hooks/usePrograms';
import { queryKeys } from '../../config/queryClient';
import programService from '../../services/programService';
import libraryService from '../../services/libraryService';
import plansService from '../../services/plansService';
import apiClient from '../../utils/apiClient';
import useConfirm from '../../hooks/useConfirm';
import logger from '../../utils/logger';
import './GroupProgramView.css';

const TAB_ITEMS = [
  { id: 'programa', label: 'Programa' },
  { id: 'contenido', label: 'Contenido' },
];

const CONTENIDO_SUBTABS = [
  { id: 'entrenamiento', label: 'Entrenamiento' },
  { id: 'nutricion', label: 'Nutricion' },
];

const TUTORIAL_SCREENS = [
  { key: 'dailyWorkout', label: 'Primera vez que abre el programa' },
  { key: 'workoutExecution', label: 'Primer entrenamiento del programa' },
  { key: 'workoutCompletion', label: 'Primera vez que completa un entrenamiento' },
];

export default function GroupProgramView({ program, programId, backTo, refetchProgram }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { confirm, ConfirmModal } = useConfirm();

  const [activeTab, setActiveTab] = useState('programa');
  const [contenidoSubtab, setContenidoSubtab] = useState('entrenamiento');

  // ── Accent color ──────────────────────────────────────────────
  const [accentRgb, setAccentRgb] = useState([255, 255, 255]);
  const [hasExtractedAccent, setHasExtractedAccent] = useState(false);

  useEffect(() => {
    if (!program?.image_url) { setHasExtractedAccent(false); return; }
    return extractAccentFromImage(program.image_url, (rgb) => {
      setAccentRgb(rgb);
      setHasExtractedAccent(true);
    });
  }, [program?.image_url]);

  const programAccentColor = hasExtractedAccent
    ? `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.18)`
    : null;

  const cssVars = {
    '--gp-accent-r': accentRgb[0],
    '--gp-accent-g': accentRgb[1],
    '--gp-accent-b': accentRgb[2],
  };

  // ── Inline editing state ──────────────────────────────────────
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(program?.title || '');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descValue, setDescValue] = useState(program?.description || '');

  useEffect(() => {
    setTitleValue(program?.title || '');
    setDescValue(program?.description || '');
  }, [program?.title, program?.description]);

  // ── Settings state ────────────────────────────────────────────
  const [weightSuggestions, setWeightSuggestions] = useState(!!program?.weight_suggestions);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState(new Set(program?.availableLibraries || []));
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [isIntroVideoPickerOpen, setIsIntroVideoPickerOpen] = useState(false);
  const [isMensajePickerOpen, setIsMensajePickerOpen] = useState(false);
  const [mensajePickerScreenKey, setMensajePickerScreenKey] = useState(null);

  // ── Price & trial state ──────────────────────────────────────
  const [priceValue, setPriceValue] = useState(program?.price != null ? String(program.price) : '');
  const [freeTrialActive, setFreeTrialActive] = useState(!!program?.free_trial?.active);
  const [freeTrialDays, setFreeTrialDays] = useState(String(program?.free_trial?.duration_days ?? 0));

  useEffect(() => {
    setWeightSuggestions(!!program?.weight_suggestions);
    setSelectedLibraryIds(new Set(program?.availableLibraries || []));
    setPriceValue(program?.price != null ? String(program.price) : '');
    setFreeTrialActive(!!program?.free_trial?.active);
    setFreeTrialDays(String(program?.free_trial?.duration_days ?? 0));
  }, [program?.weight_suggestions, program?.availableLibraries, program?.price, program?.free_trial]);

  // ── Content tab state ─────────────────────────────────────────
  const [mediaPickerContext, setMediaPickerContext] = useState('program');
  const [isMigratingSessionToLibrary, setIsMigratingSessionToLibrary] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────
  const { data: availableLibraries = [] } = useQuery({
    queryKey: ['libraries', 'creator', user?.uid],
    queryFn: async () => {
      const sessions = await libraryService.getSessionLibrary();
      return sessions.map((s) => ({ id: s.sessionId, title: s.title }));
    },
    enabled: !!user?.uid,
    staleTime: 5 * 60 * 1000,
  });

  const { data: adherenceData } = useQuery({
    queryKey: ['analytics', 'adherence', user?.uid],
    queryFn: async () => {
      const res = await apiClient.get('/analytics/adherence');
      return res.data;
    },
    enabled: !!user?.uid,
    staleTime: 15 * 60 * 1000,
  });

  const { data: modules = [] } = useModules(programId);
  const moduleCount = modules.length;

  const { data: plans = [] } = useQuery({
    queryKey: ['plans', user?.uid],
    queryFn: async () => (user ? plansService.getPlansByCreator(user.uid) : []),
    enabled: !!user && !!programId,
  });

  const { data: demographics } = useQuery({
    queryKey: ['demographics', 'program', programId],
    queryFn: () => apiClient.get(`/creator/programs/${programId}/demographics`).then(r => r.data),
    enabled: !!programId,
    staleTime: 15 * 60 * 1000,
  });

  const programAdherence = useMemo(() => {
    if (!adherenceData?.byProgram) return null;
    return adherenceData.byProgram.find((p) => p.programId === programId) ?? null;
  }, [adherenceData, programId]);

  const enrollmentHistory = adherenceData?.enrollmentHistory ?? null;

  const adherenceChartData = useMemo(() => {
    if (programAdherence?.weeklyHistory?.length) return programAdherence.weeklyHistory;
    return Array.from({ length: 8 }, () => ({ adherence: 0, week: '' }));
  }, [programAdherence]);

  const overallAdherence = programAdherence?.adherence ?? 0;
  const totalEnrolled = demographics?.totalEnrolled ?? 0;

  // ── Save handlers ─────────────────────────────────────────────
  const saveField = useCallback(async (updates) => {
    try {
      await programService.updateProgram(programId, updates);
      queryClient.setQueryData(queryKeys.programs.detail(programId), (old) => ({ ...old, ...updates }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    }
  }, [programId, queryClient, showToast]);

  const saveTitle = useCallback(async () => {
    const t = titleValue.trim();
    if (!t || t === (program?.title || '')) { setIsEditingTitle(false); return; }
    await saveField({ title: t });
    setIsEditingTitle(false);
  }, [titleValue, program?.title, saveField]);

  const saveDescription = useCallback(async () => {
    if (descValue === (program?.description || '')) { setIsEditingDescription(false); return; }
    await saveField({ description: descValue });
    setIsEditingDescription(false);
  }, [descValue, program?.description, saveField]);

  const saveStatus = useCallback(async (status) => {
    if (status === program?.status) return;
    setIsUpdatingStatus(true);
    try {
      await apiClient.patch(`/creator/programs/${programId}/status`, { status });
      queryClient.setQueryData(queryKeys.programs.detail(programId), (old) => ({ ...old, status }));
    } catch (err) {
      logger.error(err);
      showToast('No se pudo cambiar el estado.', 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [program?.status, programId, queryClient, showToast]);

  const saveWeightSuggestions = useCallback(async (enabled) => {
    setWeightSuggestions(enabled);
    await saveField({ weight_suggestions: !!enabled });
  }, [saveField]);

  const handleToggleLibrary = useCallback(async (libraryId) => {
    const next = new Set(selectedLibraryIds);
    if (next.has(libraryId)) next.delete(libraryId);
    else next.add(libraryId);
    setSelectedLibraryIds(next);
    await saveField({ availableLibraries: Array.from(next).filter(Boolean) });
  }, [selectedLibraryIds, saveField]);

  const savePrice = useCallback(async () => {
    const numericPrice = priceValue === '' ? null : parseInt(String(priceValue).replace(/\D/g, ''), 10);
    if (numericPrice !== null && numericPrice < 2000) {
      setPriceValue(program?.price != null ? String(program.price) : '');
      return;
    }
    if (numericPrice === program?.price) return;
    await saveField({ price: numericPrice });
  }, [priceValue, program?.price, saveField]);

  const saveTrialDays = useCallback(async () => {
    const days = Math.max(0, parseInt(freeTrialDays, 10) || 0);
    const free_trial = { active: !!freeTrialActive, duration_days: days };
    await saveField({ free_trial });
  }, [freeTrialActive, freeTrialDays, saveField]);

  const handleTrialToggle = useCallback(async (active) => {
    setFreeTrialActive(active);
    const days = Math.max(0, parseInt(freeTrialDays, 10) || 0);
    await saveField({ free_trial: { active, duration_days: days } });
  }, [freeTrialDays, saveField]);

  // ── Image handlers ────────────────────────────────────────────
  const handleMediaPickerSelect = useCallback(async (item) => {
    if (mediaPickerContext === 'program') {
      try {
        await programService.updateProgram(programId, { image_url: item.url, image_path: null });
        queryClient.setQueryData(queryKeys.programs.detail(programId), (old) => ({ ...old, image_url: item.url, image_path: null }));
      } catch {
        showToast('No pudimos subir la imagen. Revisa tu conexion e intenta de nuevo.', 'error');
      }
      setIsMediaPickerOpen(false);
    }
  }, [mediaPickerContext, programId, queryClient, showToast]);

  const handleImageDelete = useCallback(async () => {
    if (!program?.image_path) return;
    const ok = await confirm('Vas a eliminar la imagen del programa. Seguro?');
    if (!ok) return;
    try {
      await programService.deleteProgramImage(programId, program.image_path);
      queryClient.setQueryData(queryKeys.programs.detail(programId), (old) => ({ ...old, image_url: null, image_path: null }));
    } catch (err) {
      logger.error(err);
      showToast('No pudimos eliminar la imagen.', 'error');
    }
  }, [program?.image_path, programId, queryClient, showToast, confirm]);

  // ── Video handlers ────────────────────────────────────────────
  const handleIntroVideoSelect = useCallback(async (item) => {
    try {
      await programService.updateProgram(programId, { video_intro_url: item.url });
      queryClient.setQueryData(queryKeys.programs.detail(programId), (old) => ({ ...old, video_intro_url: item.url }));
    } catch (err) {
      logger.error(err);
      showToast('No pudimos guardar el video.', 'error');
    }
    setIsIntroVideoPickerOpen(false);
  }, [programId, queryClient, showToast]);

  const handleIntroVideoDelete = useCallback(async () => {
    if (!program?.video_intro_url) return;
    const ok = await confirm('Vas a eliminar el video de introduccion. Seguro?');
    if (!ok) return;
    try {
      await programService.deleteProgramIntroVideo(programId, program.video_intro_url);
      await programService.updateProgram(programId, { video_intro_url: null });
      queryClient.setQueryData(queryKeys.programs.detail(programId), (old) => ({ ...old, video_intro_url: null }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron.', 'error');
    }
  }, [program?.video_intro_url, programId, queryClient, showToast, confirm]);

  const handleMensajeMediaSelect = useCallback(async (item) => {
    if (!mensajePickerScreenKey) return;
    try {
      const tutorials = { ...(program?.tutorials || {}) };
      if (!tutorials[mensajePickerScreenKey]) tutorials[mensajePickerScreenKey] = [];
      tutorials[mensajePickerScreenKey].push(item.url);
      await programService.updateProgram(programId, { tutorials });
      queryClient.setQueryData(queryKeys.programs.detail(programId), (old) => ({ ...old, tutorials }));
    } catch (err) {
      logger.error(err);
      showToast('No pudimos guardar el mensaje.', 'error');
    }
    setIsMensajePickerOpen(false);
    setMensajePickerScreenKey(null);
  }, [mensajePickerScreenKey, programId, program?.tutorials, queryClient, showToast]);

  const handleTutorialVideoDelete = useCallback(async (screenKey, videoIndex) => {
    const videos = program?.tutorials?.[screenKey] || [];
    if (videoIndex >= videos.length) return;
    const ok = await confirm('Vas a eliminar este video. Seguro?');
    if (!ok) return;
    try {
      const videoURL = videos[videoIndex];
      await programService.deleteTutorialVideo(programId, screenKey, videoURL);
      const tutorials = { ...(program?.tutorials || {}) };
      tutorials[screenKey] = tutorials[screenKey].filter((_, i) => i !== videoIndex);
      if (tutorials[screenKey].length === 0) delete tutorials[screenKey];
      await programService.updateProgram(programId, { tutorials });
      queryClient.setQueryData(queryKeys.programs.detail(programId), (old) => ({ ...old, tutorials }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron.', 'error');
    }
  }, [program?.tutorials, programId, queryClient, showToast, confirm]);

  const handleOpenMediaPicker = (context) => {
    setMediaPickerContext(context);
    setIsMediaPickerOpen(true);
  };

  // ── Keyboard handlers ─────────────────────────────────────────
  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveTitle(); }
    if (e.key === 'Escape') { setTitleValue(program?.title || ''); setIsEditingTitle(false); }
  };

  const handleDescKeyDown = (e) => {
    if (e.key === 'Escape') { setDescValue(program?.description || ''); setIsEditingDescription(false); }
  };

  // ── Tab change ────────────────────────────────────────────────
  const handleTabChange = useCallback((tabId) => {
    if (tabId === activeTab) return;
    setActiveTab(tabId);
  }, [activeTab]);

  // ── Screen name for header ────────────────────────────────────
  const getScreenName = () => program?.title || 'Programa';

  const getBackPath = () => backTo || location.state?.returnTo || '/programas';

  // ── Render ────────────────────────────────────────────────────
  return (
    <DashboardLayout
      screenName={getScreenName()}
      backPath={getBackPath()}
      showBackButton
      backState={location.state?.returnState ?? {}}
      headerRight={
        <button
          type="button"
          className={`gp-header-status ${program?.status === 'published' ? 'gp-header-status--published' : ''} ${isUpdatingStatus ? 'gp-header-status--loading' : ''}`}
          onClick={() => { if (!isUpdatingStatus) saveStatus(program?.status === 'published' ? 'draft' : 'published'); }}
          disabled={isUpdatingStatus}
          title={program?.status === 'published' ? 'Cambiar a borrador' : 'Publicar programa'}
        >
          <span>{isUpdatingStatus ? 'Cambiando...' : (program?.status === 'published' ? 'Publicado' : 'Borrador')}</span>
          {!isUpdatingStatus && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {isUpdatingStatus && <span className="gp-header-status__spinner" />}
        </button>
      }
    >
      <div className="gp-root" style={cssVars}>

        {/* ── Tab Navigation ──────────────────────────────────── */}
        <div className="gp-tab-nav">
          <TubelightNavBar
            items={TAB_ITEMS}
            activeId={activeTab}
            onSelect={handleTabChange}
          />
        </div>

        {activeTab === 'programa' && (
          <>
            {/* ═══ TOP: Overview Bento ═══════════════════════════ */}
            <div className="gp-overview">

              {/* Left — Program image + info */}
              <div className="gp-program-card">
                <GlowingEffect spread={30} proximity={80} />
                <div className="gp-program-card__image-area" onClick={() => { setMediaPickerContext('program'); setIsMediaPickerOpen(true); }}>
                  {program?.image_url ? (
                    <>
                      <img src={program.image_url} alt="" className="gp-program-card__image" />
                      <div className="gp-program-card__image-overlay">
                        <button type="button" className="gp-config__btn" onClick={(e) => { e.stopPropagation(); setMediaPickerContext('program'); setIsMediaPickerOpen(true); }}>Cambiar</button>
                        <button type="button" className="gp-config__btn gp-config__btn--danger" onClick={(e) => { e.stopPropagation(); handleImageDelete(); }}>Eliminar</button>
                      </div>
                    </>
                  ) : (
                    <div className="gp-program-card__image-placeholder">Subir imagen</div>
                  )}
                </div>

                <div className="gp-program-card__info">
                  <div className="gp-program-card__info-text">
                    {isEditingTitle ? (
                      <input
                        className="gp-program-card__title-input"
                        value={titleValue}
                        onChange={(e) => setTitleValue(e.target.value)}
                        onBlur={saveTitle}
                        onKeyDown={handleTitleKeyDown}
                        autoFocus
                      />
                    ) : (
                      <h2 className="gp-program-card__title" onClick={() => setIsEditingTitle(true)}>
                        {program?.title || 'Sin titulo'}
                      </h2>
                    )}

                    {isEditingDescription ? (
                      <textarea
                        className="gp-program-card__desc-input"
                        value={descValue}
                        onChange={(e) => setDescValue(e.target.value)}
                        onBlur={saveDescription}
                        onKeyDown={handleDescKeyDown}
                        rows={2}
                        autoFocus
                      />
                    ) : (
                      <p className="gp-program-card__desc" onClick={() => setIsEditingDescription(true)}>
                        {program?.description || 'Agregar descripcion...'}
                      </p>
                    )}
                  </div>
                  {!isEditingTitle && !isEditingDescription && (
                    <button
                      type="button"
                      className="gp-program-card__edit-btn"
                      onClick={() => setIsEditingTitle(true)}
                      aria-label="Editar nombre y descripcion"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Top-middle — Users count + trend chart */}
              <div className="gp-users-card">
                <GlowingEffect spread={20} proximity={60} />
                <div className="gp-stat-card__top">
                  <span className="gp-stat-card__value"><NumberTicker value={totalEnrolled} /></span>
                  <span className="gp-stat-card__label">Inscritos</span>
                </div>
                <div className="gp-stat-card__chart">
                  <ResponsiveContainer width="100%" height={48}>
                    <AreaChart data={enrollmentHistory?.length > 0 ? enrollmentHistory : [{ clients: 0 }, { clients: 0 }]} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="enroll-grad-gp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={`rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.35)`} />
                          <stop offset="100%" stopColor={`rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0)`} />
                        </linearGradient>
                      </defs>
                      <YAxis hide domain={[dataMin => Math.max(0, dataMin - 1), dataMax => dataMax + Math.max(1, Math.ceil(dataMax * 0.3))]} />
                      <Area
                        type="monotone"
                        dataKey="clients"
                        stroke={`rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.7)`}
                        strokeWidth={1.5}
                        fill="url(#enroll-grad-gp)"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bottom-middle — Adherence chart */}
              <div className="gp-adherence-card">
                <GlowingEffect spread={20} proximity={60} />
                <div className="gp-stat-card__top">
                  <span className="gp-stat-card__value"><NumberTicker value={overallAdherence} /></span>
                  <span className="gp-stat-card__pct">%</span>
                  <span className="gp-stat-card__label">Adherencia</span>
                </div>
                <div className="gp-stat-card__chart">
                  <ResponsiveContainer width="100%" height={48}>
                    <AreaChart data={adherenceChartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="adh-grad-gp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={`rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.35)`} />
                          <stop offset="100%" stopColor={`rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0)`} />
                        </linearGradient>
                      </defs>
                      <YAxis hide domain={[dataMin => Math.max(0, dataMin - 5), dataMax => Math.min(100, dataMax + Math.max(10, Math.ceil(dataMax * 0.3)))]} />
                      <Area
                        type="monotone"
                        dataKey="adherence"
                        stroke={`rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.7)`}
                        strokeWidth={1.5}
                        fill="url(#adh-grad-gp)"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right — Demographics */}
              <DemographicsCard programId={programId} accentRgb={accentRgb} />

            </div>

            {/* ═══ BOTTOM: Config Bento ══════════════════════════ */}
            <div className="gp-config">
              <h2 className="gp-section-title gp-section-title--config">Configuracion</h2>
              <div className="gp-config__grid">

                {/* Price */}
                <BentoCard className="gp-config__card">
                  <GlowingEffect spread={24} proximity={60} />
                  <h3>Precio</h3>
                  <div className="gp-price-field">
                    <span className="gp-price-field__currency">$</span>
                    <input
                      className="gp-price-field__input"
                      type="text"
                      inputMode="numeric"
                      value={priceValue ? Number(priceValue).toLocaleString('es-CO', { maximumFractionDigits: 0 }) : ''}
                      onChange={(e) => setPriceValue(e.target.value.replace(/\D/g, ''))}
                      onBlur={savePrice}
                      placeholder="Gratis"
                    />
                    <span className="gp-price-field__hint">COP</span>
                  </div>
                </BentoCard>

                {/* Free trial */}
                <BentoCard className="gp-config__card">
                  <GlowingEffect spread={24} proximity={60} />
                  <h3>Prueba gratis</h3>
                  <div className="gp-trial">
                    <button
                      type="button"
                      className={`gp-trial__toggle ${freeTrialActive ? 'gp-trial__toggle--active' : ''}`}
                      onClick={() => handleTrialToggle(!freeTrialActive)}
                    >
                      <span className="gp-trial__toggle-dot" />
                      <span>{freeTrialActive ? 'Activa' : 'Inactiva'}</span>
                    </button>
                    {freeTrialActive && (
                      <>
                        <input
                          className="gp-trial__days-input"
                          type="text"
                          inputMode="numeric"
                          value={freeTrialDays}
                          onChange={(e) => setFreeTrialDays(e.target.value.replace(/\D/g, ''))}
                          onBlur={saveTrialDays}
                        />
                        <span className="gp-trial__days-label">dias</span>
                      </>
                    )}
                  </div>
                </BentoCard>

                {/* Weight suggestions */}
                <BentoCard className="gp-config__card">
                  <GlowingEffect spread={24} proximity={60} />
                  <h3>Sugerencias de peso</h3>
                  <div className="gp-seg-toggle" role="radiogroup" aria-label="Sugerencias de peso">
                    <button
                      type="button"
                      className={`gp-seg-toggle__option ${!weightSuggestions ? 'gp-seg-toggle__option--active' : ''}`}
                      onClick={() => saveWeightSuggestions(false)}
                      role="radio"
                      aria-checked={!weightSuggestions}
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      className={`gp-seg-toggle__option ${weightSuggestions ? 'gp-seg-toggle__option--active' : ''}`}
                      onClick={() => saveWeightSuggestions(true)}
                      role="radio"
                      aria-checked={weightSuggestions}
                    >
                      On
                    </button>
                  </div>
                </BentoCard>

                {/* Libraries */}
                <BentoCard className="gp-config__card gp-config__card--span-2">
                  <GlowingEffect spread={24} proximity={60} />
                  <h3>Bibliotecas auxiliares</h3>
                  {availableLibraries.length === 0 ? (
                    <p className="gp-config__hint">No tienes bibliotecas. Crea una desde Biblioteca.</p>
                  ) : (
                    <div className="gp-config__libraries">
                      {availableLibraries.map((lib) => (
                        <label
                          key={lib.id}
                          className={`gp-config__lib-chip ${selectedLibraryIds.has(lib.id) ? 'gp-config__lib-chip--selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedLibraryIds.has(lib.id)}
                            onChange={() => handleToggleLibrary(lib.id)}
                          />
                          {lib.title || `Biblioteca ${lib.id?.slice(0, 8)}`}
                        </label>
                      ))}
                    </div>
                  )}
                </BentoCard>

                {/* Video intro */}
                <BentoCard className="gp-config__card gp-config__card--tall">
                  <GlowingEffect spread={24} proximity={60} />
                  <h3>Video intro</h3>
                  {program?.video_intro_url ? (
                    <div className="gp-config__media-wrap">
                      <video src={program.video_intro_url} muted playsInline />
                      <div className="gp-config__media-overlay">
                        <button type="button" className="gp-config__btn" onClick={() => setIsIntroVideoPickerOpen(true)}>Cambiar</button>
                        <button type="button" className="gp-config__btn gp-config__btn--danger" onClick={handleIntroVideoDelete}>Eliminar</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="gp-config__upload-label" onClick={() => setIsIntroVideoPickerOpen(true)}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M15 10l4.553-2.724c.281-.169.628-.169.909 0 .281.169.538.52.538.842v7.764c0 .322-.257.673-.538.842-.281.169-.628.169-.909 0L15 14M5 18h8c.53 0 1.039-.211 1.414-.586C14.789 17.039 15 16.53 15 16V8c0-.53-.211-1.039-.586-1.414C14.039 6.211 13.53 6 13 6H5c-.53 0-1.039.211-1.414.586C3.211 6.961 3 7.47 3 8v8c0 .53.211 1.039.586 1.414C3.961 17.789 4.47 18 5 18z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span>Elegir video</span>
                    </button>
                  )}
                </BentoCard>

                {/* Mensajes */}
                <BentoCard className="gp-config__card gp-config__card--span-2">
                  <GlowingEffect spread={24} proximity={60} />
                  <h3>Video mensajes</h3>
                  {TUTORIAL_SCREENS.map(({ key: screenKey, label }) => {
                    const videos = program?.tutorials?.[screenKey] || [];
                    return (
                      <div key={screenKey} className="gp-config__tutorial-row">
                        <span className="gp-config__tutorial-label">{label}</span>
                        <div className="gp-config__tutorial-actions">
                          <button
                            type="button"
                            className="gp-config__btn"
                            onClick={() => { setMensajePickerScreenKey(screenKey); setIsMensajePickerOpen(true); }}
                          >
                            +
                          </button>
                          {videos.map((url, idx) => (
                            <span key={idx} className="gp-config__tutorial-pill">
                              <span>Video {idx + 1}</span>
                              <button type="button" onClick={() => handleTutorialVideoDelete(screenKey, idx)}>x</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </BentoCard>

              </div>
            </div>
          </>
        )}

        {activeTab === 'contenido' && (
          <>
            <div className="gp-subtab-bar">
              <TubelightNavBar
                items={CONTENIDO_SUBTABS}
                activeId={contenidoSubtab}
                onSelect={setContenidoSubtab}
              />
            </div>
            {contenidoSubtab === 'entrenamiento' && (
              <div className="gp-content-wrap">
                <ProgramPlanTab
                  programId={programId}
                  programName={program?.title}
                  creatorId={user.uid}
                  programAccentColor={programAccentColor}
                />
              </div>
            )}
            {contenidoSubtab === 'nutricion' && (
              <div className="gp-content-wrap">
                <ProgramNutritionTab
                  programId={programId}
                  creatorId={user.uid}
                />
              </div>
            )}
          </>
        )}

      </div>

      {/* ── Migration overlay ──────────────────────────────────── */}
      {isMigratingSessionToLibrary && (
        <div className="program-detail-migrating-overlay" role="alert" aria-busy="true">
          <div className="program-detail-migrating-content">
            <div className="program-detail-migrating-spinner" aria-hidden />
            <p className="program-detail-migrating-text">Preparando sesion para editar...</p>
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────── */}
      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelect={handleMediaPickerSelect}
        accept="image/*"
      />

      <MediaPickerModal
        isOpen={isIntroVideoPickerOpen}
        onClose={() => setIsIntroVideoPickerOpen(false)}
        onSelect={handleIntroVideoSelect}
        accept="video/*"
      />

      <MediaPickerModal
        isOpen={isMensajePickerOpen}
        onClose={() => { setIsMensajePickerOpen(false); setMensajePickerScreenKey(null); }}
        onSelect={handleMensajeMediaSelect}
        accept="video/*"
      />

      {ConfirmModal}
    </DashboardLayout>
  );
}
