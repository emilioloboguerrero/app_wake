import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
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
import { queryKeys } from '../../config/queryClient';
import programService from '../../services/programService';
import libraryService from '../../services/libraryService';
import apiClient from '../../utils/apiClient';
import useConfirm from '../../hooks/useConfirm';
import logger from '../../utils/logger';
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
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { confirm, ConfirmModal } = useConfirm();

  // ── Accent color ──────────────────────────────────────────────
  const [accentRgb, setAccentRgb] = useState([255, 255, 255]);

  useEffect(() => {
    if (!program?.image_url) return;
    return extractAccentFromImage(program.image_url, setAccentRgb);
  }, [program?.image_url]);

  const cssVars = {
    '--oo-accent-r': accentRgb[0],
    '--oo-accent-g': accentRgb[1],
    '--oo-accent-b': accentRgb[2],
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

  const [isAddClientOpen, setIsAddClientOpen] = useState(false);

  useEffect(() => {
    setWeightSuggestions(!!program?.weight_suggestions);
    setSelectedLibraryIds(new Set(program?.availableLibraries || []));
  }, [program?.weight_suggestions, program?.availableLibraries]);

  // ── Data fetching ─────────────────────────────────────────────
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['clients', 'program', programId],
    queryFn: async () => {
      const res = await apiClient.get(`/creator/clients?programId=${programId}`);
      return res.data;
    },
    enabled: !!programId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: availableLibraries = [] } = useQuery({
    queryKey: ['libraries', 'creator', user?.uid],
    queryFn: async () => {
      const sessions = await libraryService.getSessionLibrary();
      return sessions.map((s) => ({ id: s.sessionId, title: s.title }));
    },
    enabled: !!user?.uid,
    staleTime: 5 * 60 * 1000,
  });

  const stats = useMemo(() => {
    const total = clients.length;
    const active = clients.filter(c => c.status !== 'inactive').length;
    return { total, active };
  }, [clients]);

  const { data: adherenceData } = useQuery({
    queryKey: ['analytics', 'adherence', user?.uid],
    queryFn: async () => {
      const res = await apiClient.get('/analytics/adherence');
      return res.data;
    },
    enabled: !!user?.uid,
    staleTime: 15 * 60 * 1000,
  });

  const programAdherence = useMemo(() => {
    if (!adherenceData?.byProgram) return null;
    return adherenceData.byProgram.find((p) => p.programId === programId) ?? null;
  }, [adherenceData, programId]);

  const enrollmentHistory = adherenceData?.enrollmentHistory ?? null;

  const adherenceChartData = useMemo(() => {
    if (programAdherence?.weeklyHistory?.length) return programAdherence.weeklyHistory;
    return Array.from({ length: 8 }, (_, i) => ({ adherence: 0, week: '' }));
  }, [programAdherence]);

  const overallAdherence = programAdherence?.adherence ?? 0;

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

  // ── Image handlers ────────────────────────────────────────────
  const handleMediaPickerSelect = useCallback(async (item) => {
    try {
      await programService.updateProgram(programId, { image_url: item.url, image_path: null });
      queryClient.setQueryData(queryKeys.programs.detail(programId), (old) => ({ ...old, image_url: item.url, image_path: null }));
    } catch {
      showToast('No pudimos subir la imagen. Revisa tu conexion e intenta de nuevo.', 'error');
    }
    setIsMediaPickerOpen(false);
  }, [programId, queryClient, showToast]);

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

  const handleClientAdded = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['clients', 'program', programId] });
  }, [queryClient, programId]);

  // ── Keyboard handlers ─────────────────────────────────────────
  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveTitle(); }
    if (e.key === 'Escape') { setTitleValue(program?.title || ''); setIsEditingTitle(false); }
  };

  const handleDescKeyDown = (e) => {
    if (e.key === 'Escape') { setDescValue(program?.description || ''); setIsEditingDescription(false); }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <DashboardLayout
      screenName={program?.title || 'Programa'}
      backPath={backTo || '/clientes?tab=asesorias'}
      showBackButton
      headerRight={
        <button
          type="button"
          className={`oo-header-status ${program?.status === 'published' ? 'oo-header-status--published' : ''} ${isUpdatingStatus ? 'oo-header-status--loading' : ''}`}
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
          {isUpdatingStatus && <span className="oo-header-status__spinner" />}
        </button>
      }
    >
      <div className="oo-root" style={cssVars}>

        {/* ═══ TOP: Overview Bento ═══════════════════════════════ */}
        <div className="oo-overview">

          {/* Left — Program image + status + info */}
          <div className="oo-program-card">
            <GlowingEffect spread={30} proximity={80} />
            <div className="oo-program-card__image-area" onClick={() => setIsMediaPickerOpen(true)}>
              {program?.image_url ? (
                <>
                  <img src={program.image_url} alt="" className="oo-program-card__image" />
                  <div className="oo-program-card__image-overlay">
                    <button type="button" className="oo-config__btn" onClick={(e) => { e.stopPropagation(); setIsMediaPickerOpen(true); }}>Cambiar</button>
                    <button type="button" className="oo-config__btn oo-config__btn--danger" onClick={(e) => { e.stopPropagation(); handleImageDelete(); }}>Eliminar</button>
                  </div>
                </>
              ) : (
                <div className="oo-program-card__image-placeholder">
                  Subir imagen
                </div>
              )}
            </div>

            <div className="oo-program-card__info">
              <div className="oo-program-card__info-text">
                {isEditingTitle ? (
                  <input
                    className="oo-program-card__title-input"
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={handleTitleKeyDown}
                    autoFocus
                  />
                ) : (
                  <h2 className="oo-program-card__title" onClick={() => setIsEditingTitle(true)}>
                    {program?.title || 'Sin titulo'}
                  </h2>
                )}

                {isEditingDescription ? (
                  <textarea
                    className="oo-program-card__desc-input"
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    onBlur={saveDescription}
                    onKeyDown={handleDescKeyDown}
                    rows={2}
                    autoFocus
                  />
                ) : (
                  <p className="oo-program-card__desc" onClick={() => setIsEditingDescription(true)}>
                    {program?.description || 'Agregar descripcion...'}
                  </p>
                )}
              </div>
              {!isEditingTitle && !isEditingDescription && (
                <button
                  type="button"
                  className="oo-program-card__edit-btn"
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

          {/* Bottom-middle — Adherence chart */}
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
                  </defs>
                  <YAxis hide domain={[dataMin => Math.max(0, dataMin - 5), dataMax => Math.min(100, dataMax + Math.max(10, Math.ceil(dataMax * 0.3)))]} />
                  <Area
                    type="monotone"
                    dataKey="adherence"
                    stroke={`rgba(${accentRgb[0]},${accentRgb[1]},${accentRgb[2]},0.7)`}
                    strokeWidth={1.5}
                    fill="url(#adh-grad-oo)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right — Scrollable client list */}
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

        {/* ═══ BOTTOM: Config Bento ══════════════════════════════ */}
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
                  className={`oo-seg-toggle__option ${!weightSuggestions ? 'oo-seg-toggle__option--active' : ''}`}
                  onClick={() => saveWeightSuggestions(false)}
                  role="radio"
                  aria-checked={!weightSuggestions}
                >
                  Off
                </button>
                <button
                  type="button"
                  className={`oo-seg-toggle__option ${weightSuggestions ? 'oo-seg-toggle__option--active' : ''}`}
                  onClick={() => saveWeightSuggestions(true)}
                  role="radio"
                  aria-checked={weightSuggestions}
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
                      className={`oo-config__lib-chip ${selectedLibraryIds.has(lib.id) ? 'oo-config__lib-chip--selected' : ''}`}
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
            <BentoCard className="oo-config__card">
              <GlowingEffect spread={24} proximity={60} />
              <h3>Video intro</h3>
              {program?.video_intro_url ? (
                <div className="oo-config__media-wrap">
                  <video src={program.video_intro_url} muted playsInline />
                  <div className="oo-config__media-overlay">
                    <button type="button" className="oo-config__btn" onClick={() => setIsIntroVideoPickerOpen(true)}>Cambiar</button>
                    <button type="button" className="oo-config__btn oo-config__btn--danger" onClick={handleIntroVideoDelete}>Eliminar</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="oo-config__upload-label" onClick={() => setIsIntroVideoPickerOpen(true)}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M15 10l4.553-2.724c.281-.169.628-.169.909 0 .281.169.538.52.538.842v7.764c0 .322-.257.673-.538.842-.281.169-.628.169-.909 0L15 14M5 18h8c.53 0 1.039-.211 1.414-.586C14.789 17.039 15 16.53 15 16V8c0-.53-.211-1.039-.586-1.414C14.039 6.211 13.53 6 13 6H5c-.53 0-1.039.211-1.414.586C3.211 6.961 3 7.47 3 8v8c0 .53.211 1.039.586 1.414C3.961 17.789 4.47 18 5 18z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>Elegir video</span>
                </button>
              )}
            </BentoCard>

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
                        onClick={() => { setMensajePickerScreenKey(screenKey); setIsMensajePickerOpen(true); }}
                      >
                        +
                      </button>
                      {videos.map((url, idx) => (
                        <span key={idx} className="oo-config__tutorial-pill">
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
      </div>

      {/* ── Modals ───────────────────────────────────────────── */}
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

      <AddClientModal
        isOpen={isAddClientOpen}
        onClose={() => setIsAddClientOpen(false)}
        programId={programId}
        programTitle={program?.title}
        clients={clients}
        onAssigned={handleClientAdded}
      />

      {ConfirmModal}
    </DashboardLayout>
  );
}
