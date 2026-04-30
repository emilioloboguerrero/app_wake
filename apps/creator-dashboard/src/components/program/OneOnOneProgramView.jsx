import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import DashboardLayout from '../DashboardLayout';
import MediaPickerModal from '../MediaPickerModal';
import AddClientModal from './AddClientModal';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';
import { BentoCard } from '../ui/BentoGrid';
import GlowingEffect from '../ui/GlowingEffect';
import NumberTicker from '../ui/NumberTicker';
import AnimatedList from '../ui/AnimatedList';
import { extractAccentFromImage } from '../events/eventFieldComponents';
import { detectVideoSource, getEmbedUrl } from '../../utils/videoUtils';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import libraryService from '../../services/libraryService';
import apiClient from '../../utils/apiClient';
import useProgramEditor from '../../hooks/useProgramEditor';
import MediaDropZone from '../ui/MediaDropZone';
import './OneOnOneProgramView.css';

const TUTORIAL_SCREENS = [
  { key: 'dailyWorkout', label: 'Primera vez que abre el programa' },
  { key: 'workoutExecution', label: 'Primer entrenamiento del programa' },
  { key: 'workoutCompletion', label: 'Primera vez que completa un entrenamiento' },
];

function ClientRow({ client, onClick }) {
  const name = client.clientName || client.clientEmail || 'Cliente';
  const isActive = client.status !== 'inactive';

  return (
    <button type="button" className="oo-client-row" onClick={onClick}>
      <div className="oo-client-row__avatar">
        {client.avatarUrl
          ? <img src={client.avatarUrl} alt="" />
          : <span>{name.charAt(0).toUpperCase()}</span>}
      </div>
      <div className="oo-client-row__info">
        <span className="oo-client-row__name">{name}</span>
        {client.clientEmail && client.clientName && (
          <span className="oo-client-row__meta">{client.clientEmail}</span>
        )}
      </div>
      <span className={`oo-client-row__badge ${isActive ? 'oo-client-row__badge--active' : ''}`}>
        {isActive ? 'Activo' : 'Inactivo'}
      </span>
      <svg className="oo-client-row__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export default function OneOnOneProgramView({ program, programId, backTo, refetchProgram }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const editor = useProgramEditor(programId, program);

  // ── Accent color ──────────────────────────────────────────────
  // extractAccentFromImage emits null when the image is CORS-blocked or
  // fails to load. Ignore null callbacks so accentRgb stays at the white
  // default — without the guard the destructuring below crashed every
  // time Firebase Storage returned without CORS headers.
  const [accentRgb, setAccentRgb] = useState([255, 255, 255]);

  useEffect(() => {
    if (!program?.image_url) return;
    return extractAccentFromImage(program.image_url, (rgb) => {
      if (rgb) setAccentRgb(rgb);
    });
  }, [program?.image_url]);

  const cssVars = {
    '--oo-accent-r': accentRgb[0],
    '--oo-accent-g': accentRgb[1],
    '--oo-accent-b': accentRgb[2],
  };

  // ── View-specific state ───────────────────────────────────────
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);

  // ── Data fetching (query keys match pre-warm in ProgramDetailScreen) ──
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: queryKeys.clients.byProgram(programId),
    queryFn: async () => {
      const res = await apiClient.get(`/creator/clients?programId=${programId}`);
      return res.data;
    },
    enabled: !!programId,
    ...cacheConfig.clientsOverview,
  });

  const { data: availableLibraries = [] } = useQuery({
    queryKey: queryKeys.library.libraries(user?.uid),
    queryFn: () => libraryService.getLibrariesByCreator(),
    enabled: !!user?.uid,
    ...cacheConfig.otherPrograms,
  });

  const stats = useMemo(() => {
    const total = clients.length;
    const active = clients.filter(c => c.status !== 'inactive').length;
    return { total, active };
  }, [clients]);

  const { data: adherenceData } = useQuery({
    queryKey: queryKeys.analytics.adherence(user?.uid, { programId }),
    queryFn: async () => {
      const res = await apiClient.get(`/analytics/adherence?programId=${programId}`);
      return res.data;
    },
    enabled: !!user?.uid && !!programId,
    ...cacheConfig.analytics,
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

  // ── View-specific handler ─────────────────────────────────────
  const handleClientAdded = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.clients.byProgram(programId) });
  }, [queryClient, programId]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <DashboardLayout
      screenName={program?.title || 'Programa'}
      backPath={backTo || '/clientes?tab=asesorias'}
      showBackButton
      headerRight={
        <button
          type="button"
          className={`oo-header-status ${program?.status === 'published' ? 'oo-header-status--published' : ''} ${editor.isUpdatingStatus ? 'oo-header-status--loading' : ''}`}
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
          {editor.isUpdatingStatus && <span className="oo-header-status__spinner" />}
        </button>
      }
    >
      <div className="oo-root" style={cssVars}>

        {/* TOP: Overview Bento */}
        <div className="oo-overview">

          {/* Left -- Program image + status + info */}
          <div className="oo-program-card">
            <GlowingEffect spread={30} proximity={80} />
            <MediaDropZone onSelect={editor.handleProgramImageSelect} accept="image/*">
            <div className="oo-program-card__image-area" onClick={() => editor.setIsMediaPickerOpen(true)}>
              {program?.image_url ? (
                <>
                  <img src={program.image_url} alt="" className="oo-program-card__image" />
                  <div className="oo-program-card__image-overlay">
                    <button type="button" className="oo-config__btn" onClick={(e) => { e.stopPropagation(); editor.setIsMediaPickerOpen(true); }}>Cambiar</button>
                    <button type="button" className="oo-config__btn oo-config__btn--danger" onClick={(e) => { e.stopPropagation(); editor.handleImageDelete(); }}>Eliminar</button>
                  </div>
                </>
              ) : (
                <div className="oo-program-card__image-placeholder">
                  Subir imagen
                </div>
              )}
            </div>
            </MediaDropZone>

            <div className="oo-program-card__info">
              <div className="oo-program-card__info-text">
                {editor.isEditingTitle ? (
                  <input
                    className="oo-program-card__title-input"
                    value={editor.titleValue}
                    onChange={(e) => editor.setTitleValue(e.target.value)}
                    onBlur={editor.saveTitle}
                    onKeyDown={editor.handleTitleKeyDown}
                    autoFocus
                  />
                ) : (
                  <h2 className="oo-program-card__title" onClick={() => editor.setIsEditingTitle(true)}>
                    {program?.title || 'Sin titulo'}
                  </h2>
                )}

                {editor.isEditingDescription ? (
                  <textarea
                    className="oo-program-card__desc-input"
                    value={editor.descValue}
                    onChange={(e) => editor.setDescValue(e.target.value)}
                    onBlur={editor.saveDescription}
                    onKeyDown={editor.handleDescKeyDown}
                    rows={2}
                    autoFocus
                  />
                ) : (
                  <p className="oo-program-card__desc" onClick={() => editor.setIsEditingDescription(true)}>
                    {program?.description || 'Agregar descripcion...'}
                  </p>
                )}
              </div>
              {!editor.isEditingTitle && !editor.isEditingDescription && (
                <button
                  type="button"
                  className="oo-program-card__edit-btn"
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
          <div className="oo-users-card">
            <GlowingEffect spread={20} proximity={60} />
            <div className="oo-stat-card__top">
              <span className="oo-stat-card__value"><NumberTicker value={stats.total} /></span>
              <span className="oo-stat-card__label">Clientes</span>
            </div>
            <div className="oo-stat-card__chart">
              <ResponsiveContainer width="100%" height={48}>
                <AreaChart data={enrollmentHistory?.length > 0 ? enrollmentHistory : [{ clients: 0 }, { clients: 0 }]} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="enroll-grad-oo" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#enroll-grad-oo)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottom-middle -- Adherence chart */}
          <div className="oo-adherence-card">
            <GlowingEffect spread={20} proximity={60} />
            <div className="oo-stat-card__top">
              <span className="oo-stat-card__value"><NumberTicker value={overallAdherence} /></span>
              <span className="oo-stat-card__pct">%</span>
              <span className="oo-stat-card__label">Adherencia</span>
            </div>
            <div className="oo-stat-card__chart">
              <ResponsiveContainer width="100%" height={48}>
                <AreaChart data={adherenceChartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adh-grad-oo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={`rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.35)`} />
                      <stop offset="100%" stopColor={`rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0)`} />
                    </linearGradient>
                    <linearGradient id="adh-nutr-grad-oo" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#adh-grad-oo)"
                    dot={false}
                    isAnimationActive={false}
                  />
                  {hasNutrition && (
                    <Area
                      type="monotone"
                      dataKey="nutritionAdherence"
                      stroke="rgba(129,140,248,0.6)"
                      strokeWidth={1.5}
                      fill="url(#adh-nutr-grad-oo)"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="oo-adherence-legend">
              <span className="oo-adherence-legend__item">
                <span className="oo-adherence-legend__dot" style={{ background: `rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.7)` }} />
                Entreno
              </span>
              {hasNutrition && (
                <span className="oo-adherence-legend__item">
                  <span className="oo-adherence-legend__dot" style={{ background: 'rgba(129,140,248,0.7)' }} />
                  Nutricion
                </span>
              )}
            </div>
          </div>

          {/* Right -- Scrollable client list */}
          <div className="oo-clients-card">
            <GlowingEffect spread={20} proximity={60} />
            <div className="oo-clients-card__header">
              <h3 className="oo-clients-card__title">
                Clientes
                <span className="oo-clients-card__count">{stats.total}</span>
              </h3>
              <button type="button" className="oo-clients-card__add-btn" onClick={() => setIsAddClientOpen(true)}>
                +
              </button>
            </div>

            {clientsLoading ? (
              <div className="oo-clients-card__skeleton">
                {[1, 2, 3, 4].map(i => <div key={i} className="oo-clients-card__skeleton-row" />)}
              </div>
            ) : clients.length === 0 ? (
              <div className="oo-clients-card__empty">
                <p>Aun no tienes clientes en este programa</p>
                <button type="button" className="oo-clients-card__empty-cta" onClick={() => setIsAddClientOpen(true)}>
                  Agregar cliente
                </button>
              </div>
            ) : (
              <div className="oo-clients-card__list">
                <AnimatedList stagger={50} initialDelay={200}>
                  {clients.map(client => (
                    <ClientRow
                      key={client.id}
                      client={client}
                      onClick={() => navigate(`/clients/${client.clientUserId || client.userId}`)}
                    />
                  ))}
                </AnimatedList>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM: Config Bento */}
        <div className="oo-config">
          <h2 className="oo-section-title oo-section-title--config">Configuracion</h2>
          <div className="oo-config__grid">

            {/* Weight suggestions */}
            <BentoCard className="oo-config__card">
              <GlowingEffect spread={24} proximity={60} />
              <h3>Sugerencias de peso</h3>
              <div className="oo-seg-toggle" role="radiogroup" aria-label="Sugerencias de peso">
                <button
                  type="button"
                  className={`oo-seg-toggle__option ${!editor.weightSuggestions ? 'oo-seg-toggle__option--active' : ''}`}
                  onClick={() => editor.saveWeightSuggestions(false)}
                  role="radio"
                  aria-checked={!editor.weightSuggestions}
                >
                  Off
                </button>
                <button
                  type="button"
                  className={`oo-seg-toggle__option ${editor.weightSuggestions ? 'oo-seg-toggle__option--active' : ''}`}
                  onClick={() => editor.saveWeightSuggestions(true)}
                  role="radio"
                  aria-checked={editor.weightSuggestions}
                >
                  On
                </button>
              </div>
            </BentoCard>

            {/* Libraries */}
            <BentoCard className="oo-config__card oo-config__card--span-2">
              <GlowingEffect spread={24} proximity={60} />
              <h3>Bibliotecas auxiliares</h3>
              {availableLibraries.length === 0 ? (
                <p className="oo-config__hint">No tienes bibliotecas. Crea una desde Biblioteca.</p>
              ) : (
                <div className="oo-config__libraries">
                  {availableLibraries.map((lib) => (
                    <label
                      key={lib.id}
                      className={`oo-config__lib-chip ${editor.selectedLibraryIds.has(lib.id) ? 'oo-config__lib-chip--selected' : ''}`}
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
            <BentoCard className="oo-config__card">
              <GlowingEffect spread={24} proximity={60} />
              <h3>Video intro</h3>
              {program?.video_intro_url ? (
                <div className="oo-config__media-wrap">
                  {(() => {
                    const source = detectVideoSource(program.video_intro_url);
                    const isExternal = source === 'youtube' || source === 'vimeo';
                    if (isExternal) {
                      return <iframe src={getEmbedUrl(program.video_intro_url, source)} allow="autoplay; encrypted-media" allowFullScreen title="Video intro" style={{ width: '100%', height: '100%', border: 'none' }} />;
                    }
                    return <video src={program.video_intro_url} controls playsInline />;
                  })()}
                  <div className="oo-config__media-actions">
                    <button type="button" className="oo-config__media-action-btn" onClick={() => editor.setIsIntroVideoPickerOpen(true)}>Cambiar</button>
                    <button type="button" className="oo-config__media-action-btn oo-config__media-action-btn--danger" onClick={editor.handleIntroVideoDelete}>Eliminar</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="oo-config__upload-label" onClick={() => editor.setIsIntroVideoPickerOpen(true)}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M15 10l4.553-2.724c.281-.169.628-.169.909 0 .281.169.538.52.538.842v7.764c0 .322-.257.673-.538.842-.281.169-.628.169-.909 0L15 14M5 18h8c.53 0 1.039-.211 1.414-.586C14.789 17.039 15 16.53 15 16V8c0-.53-.211-1.039-.586-1.414C14.039 6.211 13.53 6 13 6H5c-.53 0-1.039.211-1.414.586C3.211 6.961 3 7.47 3 8v8c0 .53.211 1.039.586 1.414C3.961 17.789 4.47 18 5 18z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>Elegir video</span>
                </button>
              )}
            </BentoCard>
            </MediaDropZone>

            {/* Mensajes */}
            <BentoCard className="oo-config__card oo-config__card--span-2">
              <GlowingEffect spread={24} proximity={60} />
              <h3>Video mensajes</h3>
              {TUTORIAL_SCREENS.map(({ key: screenKey, label }) => {
                const videos = program?.tutorials?.[screenKey] || [];
                return (
                  <div key={screenKey} className="oo-config__tutorial-row">
                    <span className="oo-config__tutorial-label">{label}</span>
                    <div className="oo-config__tutorial-actions">
                      <button
                        type="button"
                        className="oo-config__btn"
                        onClick={() => { editor.setMensajePickerScreenKey(screenKey); editor.setIsMensajePickerOpen(true); }}
                      >
                        +
                      </button>
                      {videos.map((url, idx) => (
                        <span key={idx} className="oo-config__tutorial-pill">
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
      </div>

      {/* Modals */}
      <MediaPickerModal
        isOpen={editor.isMediaPickerOpen}
        onClose={() => editor.setIsMediaPickerOpen(false)}
        onSelect={editor.handleProgramImageSelect}
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

      <AddClientModal
        isOpen={isAddClientOpen}
        onClose={() => setIsAddClientOpen(false)}
        programId={programId}
        programTitle={program?.title}
        clients={clients}
        onAssigned={handleClientAdded}
      />

      {editor.ConfirmModal}
    </DashboardLayout>
  );
}
