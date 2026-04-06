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
import DemographicsCard from './DemographicsCard';
import ProgramTrainingTab from './ProgramTrainingTab';
import ProgramNutritionTab from './ProgramNutritionTab';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { extractAccentFromImage } from '../events/eventFieldComponents';
import { detectVideoSource, getEmbedUrl } from '../../utils/videoUtils';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import libraryService from '../../services/libraryService';
import plansService from '../../services/plansService';
import apiClient from '../../utils/apiClient';
import useProgramEditor from '../../hooks/useProgramEditor';
import MediaDropZone from '../ui/MediaDropZone';
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
  const [priceValue, setPriceValue] = useState(program?.price != null ? String(program.price) : '');
  const [compareAtPriceValue, setCompareAtPriceValue] = useState(program?.compare_at_price != null ? String(program.compare_at_price) : '');
  const [freeTrialActive, setFreeTrialActive] = useState(!!program?.free_trial?.active);
  const [freeTrialDays, setFreeTrialDays] = useState(String(program?.free_trial?.duration_days ?? 0));

  useEffect(() => {
    setPriceValue(program?.price != null ? String(program.price) : '');
    setCompareAtPriceValue(program?.compare_at_price != null ? String(program.compare_at_price) : '');
    setFreeTrialActive(!!program?.free_trial?.active);
    setFreeTrialDays(String(program?.free_trial?.duration_days ?? 0));
  }, [program?.price, program?.compare_at_price, program?.free_trial]);

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

              {/* Right -- Demographics */}
              <DemographicsCard programId={programId} accentRgb={accentRgb} />

            </div>

            {/* BOTTOM: Config Bento */}
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

                {/* Compare at price */}
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
