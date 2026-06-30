import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import DashboardLayout from '../DashboardLayout';
import MediaPickerModal from '../MediaPickerModal';
import TubelightNavBar from '../ui/TubelightNavBar';
import KeepAlivePane from '../ui/KeepAlivePane';
import { BentoCard } from '../ui/BentoGrid';
import GlowingEffect from '../ui/GlowingEffect';
import NumberTicker from '../ui/NumberTicker';
import ProgramRevenueCard from './ProgramRevenueCard';
import ProgramTrainingTab from './ProgramTrainingTab';
import ProgramNutritionTab from './ProgramNutritionTab';
import LevelPlansConfig from './LevelPlansConfig';
import ProgramLandingSectionsEditor from './ProgramLandingSectionsEditor';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { extractAccentFromImage } from '../events/eventFieldComponents';
import { detectVideoSource, getEmbedUrl } from '../../utils/videoUtils';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import libraryService from '../../services/libraryService';
import plansService from '../../services/plansService';
import apiClient from '../../utils/apiClient';
import useProgramEditor from '../../hooks/useProgramEditor';
import MediaDropZone from '../ui/MediaDropZone';
import programService from '../../services/programService';
import { useToast } from '../../contexts/ToastContext';
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
  const queryClient = useQueryClient();

  const editor = useProgramEditor(programId, program);

  const [activeTab, setActiveTab] = useState(() =>
    location.state?.tab || 'programa'
  );
  const [contenidoSubtab, setContenidoSubtab] = useState(() =>
    location.state?.subtab || 'entrenamiento'
  );

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

  // ── Price & trial state (GroupProgramView-specific) ───────────
  // For cadenced (monthly-drop) programs the only price that matters is
  // `subscription_price` — payments.ts requires it to create a PreApproval and
  // refuses the OTP path entirely. The price card below switches its target
  // field based on cadenceActive so the creator never sets the wrong field.
  const [priceValue, setPriceValue] = useState(program?.price != null ? String(program.price) : '');
  const [subscriptionPriceValue, setSubscriptionPriceValue] = useState(program?.subscription_price != null ? String(program.subscription_price) : '');
  const [compareAtPriceValue, setCompareAtPriceValue] = useState(program?.compare_at_price != null ? String(program.compare_at_price) : '');
  const [freeTrialActive, setFreeTrialActive] = useState(!!program?.free_trial?.active);
  const [freeTrialDays, setFreeTrialDays] = useState(String(program?.free_trial?.duration_days ?? 0));
  // Beta cap: max unique purchasers. Empty = uncapped. Buyers past the cap land
  // on a waitlist (see the waitlist panel below).
  const [capacityValue, setCapacityValue] = useState(program?.capacity != null ? String(program.capacity) : '');

  useEffect(() => {
    setPriceValue(program?.price != null ? String(program.price) : '');
    setSubscriptionPriceValue(program?.subscription_price != null ? String(program.subscription_price) : '');
    setCompareAtPriceValue(program?.compare_at_price != null ? String(program.compare_at_price) : '');
    setFreeTrialActive(!!program?.free_trial?.active);
    setFreeTrialDays(String(program?.free_trial?.duration_days ?? 0));
    setCapacityValue(program?.capacity != null ? String(program.capacity) : '');
  }, [program?.price, program?.subscription_price, program?.compare_at_price, program?.free_trial, program?.capacity]);

  // ── Content tab state ─────────────────────────────────────────
  const [mediaPickerContext, setMediaPickerContext] = useState('program');
  const [isMigratingSessionToLibrary, setIsMigratingSessionToLibrary] = useState(false);

  // ── Data fetching (P2: use slim + matching pre-warm key) ──────
  const { data: availableLibraries = [] } = useQuery({
    queryKey: queryKeys.library.libraries(user?.uid),
    queryFn: () => libraryService.getLibrariesByCreator(),
    enabled: !!user?.uid,
    ...cacheConfig.otherPrograms,
  });

  // P1: use filtered adherence endpoint + matching pre-warm key
  const { data: adherenceData } = useQuery({
    queryKey: queryKeys.analytics.adherence(user?.uid, { programId }),
    queryFn: () => apiClient.get(`/analytics/adherence?programId=${programId}`).then((r) => r.data),
    enabled: !!user?.uid && !!programId,
    ...cacheConfig.analytics,
  });

  // P3: unified plans query key matching PlanningLibrarySidebar/ProgramPlanTab
  const { data: plans = [] } = useQuery({
    queryKey: ['library', 'plans', user?.uid],
    queryFn: () => plansService.getPlansByCreator(user?.uid),
    enabled: !!user?.uid && !!programId,
    staleTime: 10 * 60 * 1000,
  });

  // P10: defer demographics until 'programa' tab is active
  const { data: demographics } = useQuery({
    queryKey: ['demographics', 'program', programId],
    queryFn: () => apiClient.get(`/creator/programs/${programId}/demographics`).then(r => r.data),
    enabled: !!programId && activeTab === 'programa',
    staleTime: 15 * 60 * 1000,
  });

  // Beta cap: load the waitlist only for capped programs so uncapped ones pay
  // nothing. Powers the "X/cap vendidos" count and the admit list.
  const isCapped = program?.capacity != null && Number(program.capacity) >= 1;
  const { data: waitlistData, refetch: refetchWaitlist } = useQuery({
    queryKey: ['creator', 'programWaitlist', programId],
    queryFn: () => programService.getWaitlist(programId),
    enabled: !!programId && isCapped,
    staleTime: 60 * 1000,
  });

  const programAdherence = useMemo(() => {
    if (!adherenceData?.byProgram) return null;
    return adherenceData.byProgram.find((p) => p.programId === programId) ?? null;
  }, [adherenceData, programId]);

  const enrollmentHistory = adherenceData?.enrollmentHistory ?? null;

  const adherenceChartData = useMemo(() => {
    if (programAdherence?.weeklyHistory?.length) return programAdherence.weeklyHistory;
    return Array.from({ length: 8 }, () => ({ workoutAdherence: 0, nutritionAdherence: null, week: '' }));
  }, [programAdherence]);

  const overallAdherence = programAdherence?.workoutAdherence ?? 0;
  const hasNutrition = programAdherence?.nutritionAdherence != null;
  const totalEnrolled = demographics?.totalEnrolled ?? 0;

  // ── GroupProgramView-specific save handlers ───────────────────
  const savePrice = useCallback(async () => {
    const numericPrice = priceValue === '' ? null : parseInt(String(priceValue).replace(/\D/g, ''), 10);
    if (numericPrice !== null && numericPrice < 2000) {
      setPriceValue(program?.price != null ? String(program.price) : '');
      return;
    }
    if (numericPrice === program?.price) return;
    await editor.saveField({ price: numericPrice });
  }, [priceValue, program?.price, editor]);

  const saveSubscriptionPrice = useCallback(async () => {
    const numeric = subscriptionPriceValue === '' ? null : parseInt(String(subscriptionPriceValue).replace(/\D/g, ''), 10);
    if (numeric !== null && numeric < 2000) {
      setSubscriptionPriceValue(program?.subscription_price != null ? String(program.subscription_price) : '');
      return;
    }
    if (numeric === program?.subscription_price) return;
    await editor.saveField({ subscription_price: numeric });
  }, [subscriptionPriceValue, program?.subscription_price, editor]);

  const saveCompareAtPrice = useCallback(async () => {
    const numeric = compareAtPriceValue === '' ? null : parseInt(String(compareAtPriceValue).replace(/\D/g, ''), 10);
    if (numeric !== null && numeric < 2000) {
      setCompareAtPriceValue(program?.compare_at_price != null ? String(program.compare_at_price) : '');
      return;
    }
    if (numeric !== null && program?.price && numeric <= program.price) {
      setCompareAtPriceValue(program?.compare_at_price != null ? String(program.compare_at_price) : '');
      return;
    }
    if (numeric === program?.compare_at_price) return;
    await editor.saveField({ compare_at_price: numeric });
  }, [compareAtPriceValue, program?.compare_at_price, program?.price, editor]);

  const saveCapacity = useCallback(async () => {
    const numeric = capacityValue === '' ? null : parseInt(String(capacityValue).replace(/\D/g, ''), 10);
    if (numeric !== null && numeric < 1) {
      setCapacityValue(program?.capacity != null ? String(program.capacity) : '');
      return;
    }
    if (numeric === (program?.capacity ?? null)) return;
    await editor.saveField({ capacity: numeric });
  }, [capacityValue, program?.capacity, editor]);

  const saveTrialDays = useCallback(async () => {
    const days = Math.max(0, parseInt(freeTrialDays, 10) || 0);
    const free_trial = { active: !!freeTrialActive, duration_days: days };
    await editor.saveField({ free_trial });
  }, [freeTrialActive, freeTrialDays, editor]);

  const handleTrialToggle = useCallback(async (active) => {
    setFreeTrialActive(active);
    const days = Math.max(0, parseInt(freeTrialDays, 10) || 0);
    await editor.saveField({ free_trial: { active, duration_days: days } });
  }, [freeTrialDays, editor]);

  // ── Monthly drops (memory/project_monthly_drops.md) ──────────
  // Cohort-synced calendar-anchored content. Cron flips the live block on the
  // first Monday of every month. Felipe opts a program in here; the per-module
  // Publicado chip in ProgramContentTab writes published_at, which is the
  // cron's gate. module.order doubles as the block ordinal.
  const cadenceActive = program?.block_cadence === 'monthly_first_monday';

  const handleCadenceToggle = useCallback(async (active) => {
    await editor.saveField({ block_cadence: active ? 'monthly_first_monday' : null });
  }, [editor]);

  // Weekly scheduling: pins each session to a weekday (dayIndex 1..7 = Lun..Dom)
  // so the Hoy carousel shows the right session per day and surfaces "Descanso"
  // on rest days, instead of the legacy "next incomplete" walker.
  const weeklyScheduling = program?.scheduling === 'weekly';
  const handleWeeklyToggle = useCallback(async (active) => {
    await editor.saveField({ scheduling: active ? 'weekly' : null });
  }, [editor]);

  // Initialize program_state so the monthly-drop cron has something to advance.
  // The button is the dashboard replacement for seed-bejarano-program-state.js;
  // it's disabled until at least one module is published, and refuses to
  // overwrite an existing state doc (server-side 409 ALREADY_INITIALIZED).
  const { showToast } = useToast();

  const handleAdmitFromWaitlist = useCallback(async (waitlistId) => {
    try {
      await programService.admitFromWaitlist(programId, waitlistId);
      showToast('Cupo abierto. Avísale a la persona para que lo tome.', 'success');
      await refetchWaitlist();
      await refetchProgram?.();
    } catch {
      showToast('No pudimos admitir desde la lista. Intenta de nuevo.', 'error');
    }
  }, [programId, refetchWaitlist, refetchProgram, showToast]);

  const [isInitializingCadence, setIsInitializingCadence] = useState(false);
  const hasProgramState = typeof program?.current_block_index === 'number';
  const handleInitializeCadence = useCallback(async () => {
    if (!programId || isInitializingCadence) return;
    setIsInitializingCadence(true);
    try {
      await programService.initializeCadence(programId);
      showToast('Cadencia iniciada. El primer bloque ya está en vivo.', 'success');
      await refetchProgram?.();
      queryClient.invalidateQueries({ queryKey: ['program', 'modules', programId, 'cadence'] });
    } catch (err) {
      const code = err?.code || err?.error?.code;
      if (code === 'ALREADY_INITIALIZED') {
        showToast('Esta cadencia ya estaba iniciada.', 'info');
      } else if (code === 'NO_PUBLISHED_MODULES') {
        showToast('Publica al menos un bloque antes de iniciar la cadencia.', 'error');
      } else if (code === 'CADENCE_NOT_ENABLED') {
        showToast('Activa "Bloques mensuales" antes de iniciar la cadencia.', 'error');
      } else {
        showToast(err?.message || 'No pudimos iniciar la cadencia. Intenta de nuevo.', 'error');
      }
    } finally {
      setIsInitializingCadence(false);
    }
  }, [programId, isInitializingCadence, showToast, refetchProgram, queryClient]);

  // Cadence telemetry surfaced to the creator: which block is live, when the
  // next drop happens, and whether the next module is ready. Without these
  // the cadence calendar in Entrenamiento owns per-block telemetry; this
  // card only surfaces the currently-live block's title.
  const { data: cadenceModulesRes } = useQuery({
    queryKey: ['program', 'modules', programId, 'cadence'],
    queryFn: () => apiClient.get(`/creator/programs/${programId}/modules`).then((r) => r?.data ?? []),
    enabled: !!programId && cadenceActive,
    staleTime: 60 * 1000,
  });
  const cadenceModules = useMemo(() => {
    const list = Array.isArray(cadenceModulesRes) ? cadenceModulesRes :
      (cadenceModulesRes?.data ?? []);
    return [...list].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
  }, [cadenceModulesRes]);

  const cadenceInfo = useMemo(() => {
    if (!cadenceActive) return null;
    const currentIdx = typeof program?.current_block_index === 'number'
      ? program.current_block_index
      : -1;
    const currentModule = cadenceModules.find((m) => m?.order === currentIdx) ?? null;
    return {
      currentIdx,
      currentTitle: currentModule?.title ?? null,
    };
  }, [cadenceActive, cadenceModules, program?.current_block_index]);

  // ── Image handler wrapper (handles mediaPickerContext) ────────
  const handleMediaPickerSelect = useCallback(async (item) => {
    if (mediaPickerContext === 'program') {
      await editor.handleProgramImageSelect(item);
    }
  }, [mediaPickerContext, editor]);

  // ── Tab change ────────────────────────────────────────────────
  const handleTabChange = useCallback((tabId) => {
    if (tabId === activeTab) return;
    setActiveTab(tabId);
  }, [activeTab]);

  const handleSubtabChange = useCallback((subtabId) => {
    setContenidoSubtab(subtabId);
  }, []);

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
          className={`gp-header-status ${program?.status === 'published' ? 'gp-header-status--published' : ''} ${editor.isUpdatingStatus ? 'gp-header-status--loading' : ''}`}
          onClick={() => { if (!editor.isUpdatingStatus) editor.saveStatus(program?.status === 'published' ? 'draft' : 'published'); }}
          disabled={editor.isUpdatingStatus}
          title={program?.status === 'published' ? 'Cambiar a borrador' : 'Publicar programa'}
        >
          <span>{editor.isUpdatingStatus ? 'Cambiando...' : (program?.status === 'published' ? 'Publicado' : 'Borrador')}</span>
          {!editor.isUpdatingStatus && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {editor.isUpdatingStatus && <span className="gp-header-status__spinner" />}
        </button>
      }
    >
      <div className="gp-root" style={cssVars}>

        {/* Tab Navigation */}
        <div className="gp-tab-nav">
          <TubelightNavBar
            items={TAB_ITEMS}
            activeId={activeTab}
            onSelect={handleTabChange}
          />
        </div>

        <KeepAlivePane active={activeTab === 'programa'}>
          {/* TOP: Overview Bento */}
          <div className="gp-overview">

              {/* Left -- Program image + info */}
              <div className="gp-program-card">
                <GlowingEffect spread={30} proximity={80} />
                <MediaDropZone onSelect={editor.handleProgramImageSelect} accept="image/*">
                <div className="gp-program-card__image-area" onClick={() => { setMediaPickerContext('program'); editor.setIsMediaPickerOpen(true); }}>
                  {program?.image_url ? (
                    <>
                      <img src={program.image_url} alt="" className="gp-program-card__image" />
                      <div className="gp-program-card__image-overlay">
                        <button type="button" className="gp-config__btn" onClick={(e) => { e.stopPropagation(); setMediaPickerContext('program'); editor.setIsMediaPickerOpen(true); }}>Cambiar</button>
                        <button type="button" className="gp-config__btn gp-config__btn--danger" onClick={(e) => { e.stopPropagation(); editor.handleImageDelete(); }}>Eliminar</button>
                      </div>
                    </>
                  ) : (
                    <div className="gp-program-card__image-placeholder">Subir imagen</div>
                  )}
                </div>
                </MediaDropZone>

                <div className="gp-program-card__info">
                  <div className="gp-program-card__info-text">
                    {editor.isEditingTitle ? (
                      <input
                        className="gp-program-card__title-input"
                        value={editor.titleValue}
                        onChange={(e) => editor.setTitleValue(e.target.value)}
                        onBlur={editor.saveTitle}
                        onKeyDown={editor.handleTitleKeyDown}
                        autoFocus
                      />
                    ) : (
                      <h2 className="gp-program-card__title" onClick={() => editor.setIsEditingTitle(true)}>
                        {program?.title || 'Sin titulo'}
                      </h2>
                    )}

                    {editor.isEditingDescription ? (
                      <textarea
                        className="gp-program-card__desc-input"
                        value={editor.descValue}
                        onChange={(e) => editor.setDescValue(e.target.value)}
                        onBlur={editor.saveDescription}
                        onKeyDown={editor.handleDescKeyDown}
                        rows={2}
                        autoFocus
                      />
                    ) : (
                      <p className="gp-program-card__desc" onClick={() => editor.setIsEditingDescription(true)}>
                        {program?.description || 'Agregar descripcion...'}
                      </p>
                    )}
                  </div>
                  {!editor.isEditingTitle && !editor.isEditingDescription && (
                    <button
                      type="button"
                      className="gp-program-card__edit-btn"
                      onClick={() => editor.setIsEditingTitle(true)}
                      aria-label="Editar nombre y descripcion"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Top-middle -- Users count + trend chart */}
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

              {/* Bottom-middle -- Adherence chart */}
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
                        <linearGradient id="adh-nutr-grad-gp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(129,140,248,0.25)" />
                          <stop offset="100%" stopColor="rgba(129,140,248,0)" />
                        </linearGradient>
                      </defs>
                      <YAxis hide domain={[dataMin => Math.max(0, dataMin - 5), dataMax => Math.min(100, dataMax + Math.max(10, Math.ceil(dataMax * 0.3)))]} />
                      <Area
                        type="monotone"
                        dataKey="workoutAdherence"
                        stroke={`rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.7)`}
                        strokeWidth={1.5}
                        fill="url(#adh-grad-gp)"
                        dot={false}
                        isAnimationActive={false}
                      />
                      {hasNutrition && (
                        <Area
                          type="monotone"
                          dataKey="nutritionAdherence"
                          stroke="rgba(129,140,248,0.6)"
                          strokeWidth={1.5}
                          fill="url(#adh-nutr-grad-gp)"
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="gp-adherence-legend">
                  <span className="gp-adherence-legend__item">
                    <span className="gp-adherence-legend__dot" style={{ background: `rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.7)` }} />
                    Entreno
                  </span>
                  {hasNutrition && (
                    <span className="gp-adherence-legend__item">
                      <span className="gp-adherence-legend__dot" style={{ background: 'rgba(129,140,248,0.7)' }} />
                      Nutricion
                    </span>
                  )}
                </div>
              </div>

              {/* Right -- Revenue */}
              <ProgramRevenueCard programId={programId} accentRgb={accentRgb} />

            </div>

            {/* BOTTOM: Config Bento */}
            <div className="gp-config">
              <h2 className="gp-section-title gp-section-title--config">Configuracion</h2>
              <div className="gp-config__grid">

                {/* Price — switches input target to subscription_price when
                    monthly cadence is on. payments.ts requires
                    subscription_price (not price) to issue a PreApproval for
                    cadenced programs, so without this branch a creator would
                    silently leave the program unsubscribable. */}
                <BentoCard className="gp-config__card">
                  <GlowingEffect spread={24} proximity={60} />
                  <h3>{cadenceActive ? 'Precio mensual' : 'Precio'}</h3>
                  <div className="gp-price-field">
                    <span className="gp-price-field__currency">$</span>
                    <input
                      className="gp-price-field__input"
                      type="text"
                      inputMode="numeric"
                      value={cadenceActive
                        ? (subscriptionPriceValue ? Number(subscriptionPriceValue).toLocaleString('es-CO', { maximumFractionDigits: 0 }) : '')
                        : (priceValue ? Number(priceValue).toLocaleString('es-CO', { maximumFractionDigits: 0 }) : '')}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        if (cadenceActive) setSubscriptionPriceValue(raw);
                        else setPriceValue(raw);
                      }}
                      onBlur={cadenceActive ? saveSubscriptionPrice : savePrice}
                      placeholder={cadenceActive ? 'Sin precio' : 'Gratis'}
                    />
                    <span className="gp-price-field__hint">{cadenceActive ? 'COP / mes' : 'COP'}</span>
                  </div>
                </BentoCard>

                {/* Compare at price — only meaningful for OTP. Hidden when
                    monthly cadence is on so the creator isn't tempted to set a
                    value that the subscription path silently ignores. */}
                {!cadenceActive && (
                  <BentoCard className="gp-config__card">
                    <GlowingEffect spread={24} proximity={60} />
                    <h3>Precio comparativo</h3>
                    <div className="gp-price-field">
                      <span className="gp-price-field__currency">$</span>
                      <input
                        className="gp-price-field__input"
                        type="text"
                        inputMode="numeric"
                        value={compareAtPriceValue ? Number(compareAtPriceValue).toLocaleString('es-CO', { maximumFractionDigits: 0 }) : ''}
                        onChange={(e) => setCompareAtPriceValue(e.target.value.replace(/\D/g, ''))}
                        onBlur={saveCompareAtPrice}
                        placeholder="Opcional"
                      />
                      <span className="gp-price-field__hint">COP</span>
                    </div>
                  </BentoCard>
                )}

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

                {/* Cupos (beta cap) — max unique purchasers. Empty = sin
                    límite. Once full, the buy button on every surface turns
                    into a waitlist that captures email + name. */}
                <BentoCard className="gp-config__card">
                  <GlowingEffect spread={24} proximity={60} />
                  <h3>Cupos</h3>
                  <div className="gp-price-field">
                    <input
                      className="gp-price-field__input"
                      type="text"
                      inputMode="numeric"
                      value={capacityValue ? Number(capacityValue).toLocaleString('es-CO', { maximumFractionDigits: 0 }) : ''}
                      onChange={(e) => setCapacityValue(e.target.value.replace(/\D/g, ''))}
                      onBlur={saveCapacity}
                      placeholder="Sin límite"
                    />
                    <span className="gp-price-field__hint">personas</span>
                  </div>
                  {isCapped && waitlistData && (
                    <p className="gp-capacity-count">
                      {waitlistData.seatsTaken}/{waitlistData.capacity} vendidos
                    </p>
                  )}
                </BentoCard>

                {/* Waitlist — only shown when capped and people are waiting.
                    Admitir abre un cupo (capacity += 1); the freed seat goes to
                    whoever checks out next, so reach out to the person. */}
                {isCapped && waitlistData?.waitlist?.length > 0 && (
                  <BentoCard className="gp-config__card gp-config__card--span-2">
                    <GlowingEffect spread={24} proximity={60} />
                    <h3>
                      Lista de espera{' '}
                      <span className="gp-waitlist-count">{waitlistData.waitlist.length}</span>
                    </h3>
                    <div className="gp-waitlist">
                      {waitlistData.waitlist.map((w) => (
                        <div key={w.id} className="gp-waitlist__row">
                          <div className="gp-waitlist__info">
                            <span className="gp-waitlist__name">{w.name || 'Sin nombre'}</span>
                            <span className="gp-waitlist__email">{w.email}</span>
                          </div>
                          <button
                            type="button"
                            className="gp-waitlist__admit"
                            onClick={() => handleAdmitFromWaitlist(w.id)}
                          >
                            Admitir
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="gp-waitlist__hint">
                      Admitir abre un cupo. Avísale a la persona para que lo tome.
                    </p>
                  </BentoCard>
                )}

                {/* Bloques mensuales — structural toggle. Per-block authoring,
                    publish state, and unlock dates live in the cadence
                    calendar (ProgramCadenceCalendar) under Contenido →
                    Entrenamiento. Carry-over is now a normal state, so
                    there's nothing to warn about here. */}
                <BentoCard className="gp-config__card gp-config__card--span-2 gp-cadence-card">
                  <GlowingEffect spread={24} proximity={60} />
                  <div className="gp-cadence-card__header">
                    <h3>Bloques mensuales</h3>
                    <button
                      type="button"
                      className={`gp-trial__toggle ${cadenceActive ? 'gp-trial__toggle--active' : ''}`}
                      onClick={() => handleCadenceToggle(!cadenceActive)}
                    >
                      <span className="gp-trial__toggle-dot" />
                      <span>{cadenceActive ? 'Activos' : 'Inactivos'}</span>
                    </button>
                  </div>

                  {!cadenceActive && (
                    <p className="gp-config__hint">
                      Programas mensuales que se renuevan solos. Activa para que tus suscriptores reciban un bloque nuevo cada primer lunes.
                    </p>
                  )}

                  {cadenceActive && !hasProgramState && (
                    <div className="gp-cadence-card__init">
                      <button
                        type="button"
                        className="gp-cadence-card__init-btn"
                        onClick={handleInitializeCadence}
                        disabled={isInitializingCadence}
                      >
                        {isInitializingCadence ? 'Iniciando…' : 'Iniciar cadencia desde el primer bloque publicado'}
                      </button>
                      <p className="gp-cadence-card__init-hint">
                        Publica al menos un bloque desde Contenido → Entrenamiento y pulsa este botón para que el cron lo entregue en vivo.
                      </p>
                    </div>
                  )}

                  {cadenceActive && hasProgramState && cadenceInfo && (
                    <p className="gp-config__hint">
                      {cadenceInfo.currentIdx >= 0 && cadenceInfo.currentTitle
                        ? `En vivo: ${cadenceInfo.currentTitle}. Edita los próximos drops desde Contenido → Entrenamiento.`
                        : 'Edita los próximos drops desde Contenido → Entrenamiento.'}
                    </p>
                  )}
                </BentoCard>

                {/* Calendario semanal — pins each session to a weekday so Hoy
                    shows the right session per day and "Descanso" on rest days.
                    Cadence programs already author dayIndex via the drag-drop
                    calendar; non-cadence weekly programs fall back to
                    order-as-weekday (Lun=order 0). */}
                <BentoCard className="gp-config__card gp-config__card--span-2">
                  <GlowingEffect spread={24} proximity={60} />
                  <div className="gp-cadence-card__header">
                    <h3>Calendario semanal</h3>
                    <button
                      type="button"
                      className={`gp-trial__toggle ${weeklyScheduling ? 'gp-trial__toggle--active' : ''}`}
                      onClick={() => handleWeeklyToggle(!weeklyScheduling)}
                    >
                      <span className="gp-trial__toggle-dot" />
                      <span>{weeklyScheduling ? 'Activo' : 'Inactivo'}</span>
                    </button>
                  </div>
                  {!weeklyScheduling ? (
                    <p className="gp-config__hint">
                      Hoy avanza la siguiente sesión sin completar, sin importar el día. Activa para asignar cada sesión a un día de la semana y mostrar "Descanso" en los días libres.
                    </p>
                  ) : (
                    <p className="gp-config__hint">
                      Cada sesión se ancla a un día (Lun–Dom). Hoy muestra la sesión del día y "Descanso" en los días sin sesión.
                    </p>
                  )}
                </BentoCard>

                {/* Level plans config — maps principiante/intermedio/avanzado
                    each to an existing plan. Writes levels + level_plans on
                    the program shell doc. Toggle off = no-op (program behaves
                    as today). */}
                <LevelPlansConfig
                  programId={programId}
                  creatorId={user?.uid}
                  initial={{ levels: program?.levels, level_plans: program?.level_plans }}
                />

                {/* Weight suggestions */}
                <BentoCard className="gp-config__card">
                  <GlowingEffect spread={24} proximity={60} />
                  <h3>Sugerencias de peso</h3>
                  <div className="gp-seg-toggle" role="radiogroup" aria-label="Sugerencias de peso">
                    <button
                      type="button"
                      className={`gp-seg-toggle__option ${!editor.weightSuggestions ? 'gp-seg-toggle__option--active' : ''}`}
                      onClick={() => editor.saveWeightSuggestions(false)}
                      role="radio"
                      aria-checked={!editor.weightSuggestions}
                    >
                      Off
                    </button>
                    <button
                      type="button"
                      className={`gp-seg-toggle__option ${editor.weightSuggestions ? 'gp-seg-toggle__option--active' : ''}`}
                      onClick={() => editor.saveWeightSuggestions(true)}
                      role="radio"
                      aria-checked={editor.weightSuggestions}
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
                          className={`gp-config__lib-chip ${editor.selectedLibraryIds.has(lib.id) ? 'gp-config__lib-chip--selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={editor.selectedLibraryIds.has(lib.id)}
                            onChange={() => editor.handleToggleLibrary(lib.id)}
                          />
                          {lib.title || `Biblioteca ${lib.id?.slice(0, 8)}`}
                        </label>
                      ))}
                    </div>
                  )}
                </BentoCard>

                {/* Video intro */}
                <MediaDropZone onSelect={editor.handleIntroVideoSelect} accept="video/*">
                <BentoCard className="gp-config__card gp-config__card--tall">
                  <GlowingEffect spread={24} proximity={60} />
                  <h3>Video intro</h3>
                  {program?.video_intro_url ? (
                    <div className="gp-config__media-wrap">
                      {(() => {
                        const source = detectVideoSource(program.video_intro_url);
                        const isExternal = source === 'youtube' || source === 'vimeo';
                        if (isExternal) {
                          return <iframe src={getEmbedUrl(program.video_intro_url, source)} allow="autoplay; encrypted-media" allowFullScreen title="Video intro" style={{ width: '100%', height: '100%', border: 'none' }} />;
                        }
                        return <video src={program.video_intro_url} controls playsInline />;
                      })()}
                      <div className="gp-config__media-actions">
                        <button type="button" className="gp-config__media-action-btn" onClick={() => editor.setIsIntroVideoPickerOpen(true)}>Cambiar</button>
                        <button type="button" className="gp-config__media-action-btn gp-config__media-action-btn--danger" onClick={editor.handleIntroVideoDelete}>Eliminar</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="gp-config__upload-label" onClick={() => editor.setIsIntroVideoPickerOpen(true)}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M15 10l4.553-2.724c.281-.169.628-.169.909 0 .281.169.538.52.538.842v7.764c0 .322-.257.673-.538.842-.281.169-.628.169-.909 0L15 14M5 18h8c.53 0 1.039-.211 1.414-.586C14.789 17.039 15 16.53 15 16V8c0-.53-.211-1.039-.586-1.414C14.039 6.211 13.53 6 13 6H5c-.53 0-1.039.211-1.414.586C3.211 6.961 3 7.47 3 8v8c0 .53.211 1.039.586 1.414C3.961 17.789 4.47 18 5 18z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span>Elegir video</span>
                    </button>
                  )}
                </BentoCard>
                </MediaDropZone>

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
                            onClick={() => { editor.setMensajePickerScreenKey(screenKey); editor.setIsMensajePickerOpen(true); }}
                          >
                            +
                          </button>
                          {videos.map((url, idx) => (
                            <span key={idx} className="gp-config__tutorial-pill">
                              <span>Video {idx + 1}</span>
                              <button type="button" onClick={() => editor.handleTutorialVideoDelete(screenKey, idx)}>x</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </BentoCard>

                {/* Página de venta — optional "Qué incluye / Qué hay de nuevo"
                    sections rendered on the public buy page. Persists the full
                    array verbatim under courses/{id}.landing_sections. */}
                <ProgramLandingSectionsEditor
                  program={program}
                  onSave={(arr) => editor.saveField({ landing_sections: arr })}
                />

              </div>
            </div>
        </KeepAlivePane>

        <KeepAlivePane active={activeTab === 'contenido'}>
            <div className="gp-subtab-bar">
              <TubelightNavBar
                items={CONTENIDO_SUBTABS}
                activeId={contenidoSubtab}
                onSelect={handleSubtabChange}
              />
            </div>
            <KeepAlivePane active={contenidoSubtab === 'entrenamiento'}>
                <ProgramTrainingTab
                  programId={programId}
                  creatorId={user.uid}
                  program={program}
                />
            </KeepAlivePane>
            <KeepAlivePane active={contenidoSubtab === 'nutricion'}>
                <ProgramNutritionTab
                  programId={programId}
                  creatorId={user.uid}
                />
            </KeepAlivePane>
        </KeepAlivePane>

      </div>

      {/* Migration overlay */}
      {isMigratingSessionToLibrary && (
        <div className="program-detail-migrating-overlay" role="alert" aria-busy="true">
          <div className="program-detail-migrating-content">
            <div className="program-detail-migrating-spinner" aria-hidden />
            <p className="program-detail-migrating-text">Preparando sesion para editar...</p>
          </div>
        </div>
      )}

      {/* Modals */}
      <MediaPickerModal
        isOpen={editor.isMediaPickerOpen}
        onClose={() => editor.setIsMediaPickerOpen(false)}
        onSelect={handleMediaPickerSelect}
        accept="image/*"
      />

      <MediaPickerModal
        isOpen={editor.isIntroVideoPickerOpen}
        onClose={() => editor.setIsIntroVideoPickerOpen(false)}
        onSelect={editor.handleIntroVideoSelect}
        accept="video/*"
      />

      <MediaPickerModal
        isOpen={editor.isMensajePickerOpen}
        onClose={() => { editor.setIsMensajePickerOpen(false); editor.setMensajePickerScreenKey(null); }}
        onSelect={editor.handleMensajeMediaSelect}
        accept="video/*"
      />

      {editor.ConfirmModal}
    </DashboardLayout>
  );
}
