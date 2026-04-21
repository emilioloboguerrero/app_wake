import { useState, useEffect } from 'react';
import { queryKeys } from '../../config/queryClient';
import programService from '../../services/programService';
import libraryService from '../../services/libraryService';
import logger from '../../utils/logger';
import Button from '../Button';
import { getAccessTypeLabel } from '../../utils/durationHelper';
import { detectVideoSource, getEmbedUrl } from '../../utils/videoUtils';
import MediaDropZone from '../ui/MediaDropZone';

const TUTORIAL_SCREENS = [
  { key: 'dailyWorkout', label: 'Entrenamiento diario' },
  { key: 'workoutExecution', label: 'Ejecucion del entrenamiento' },
  { key: 'workoutCompletion', label: 'Completar entrenamiento' },
  { key: 'warmup', label: 'Calentamiento' },
];

export default function ProgramConfigTab({ program, programId, user, queryClient, showToast, confirm, onOpenMediaPicker, onDropImageSelect, onDropIntroVideoSelect }) {
  const [programNameValue, setProgramNameValue] = useState('');
  const [priceValue, setPriceValue] = useState('');
  const [compareAtPriceValue, setCompareAtPriceValue] = useState('');
  const [subscriptionPriceValue, setSubscriptionPriceValue] = useState('');
  const [durationValue, setDurationValue] = useState(1);
  const [descriptionValue, setDescriptionValue] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);

  const [freeTrialActive, setFreeTrialActive] = useState(false);
  const [freeTrialDurationDays, setFreeTrialDurationDays] = useState('0');

  const [weightSuggestionsEnabled, setWeightSuggestionsEnabled] = useState(false);

  const [selectedLibraryIds, setSelectedLibraryIds] = useState(new Set());
  const [availableLibraries, setAvailableLibraries] = useState([]);
  const [isLoadingLibraries, setIsLoadingLibraries] = useState(false);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);

  const [isUploadingIntroVideo, setIsUploadingIntroVideo] = useState(false);
  const [introVideoUploadProgress, setIntroVideoUploadProgress] = useState(0);

  const [isUploadingAnuncioVideo, setIsUploadingAnuncioVideo] = useState(false);
  const [anuncioVideoUploadProgress, setAnuncioVideoUploadProgress] = useState(0);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);
  const [isUpdatingCompareAtPrice, setIsUpdatingCompareAtPrice] = useState(false);
  const [isUpdatingSubscriptionPrice, setIsUpdatingSubscriptionPrice] = useState(false);
  const [isUpdatingDuration, setIsUpdatingDuration] = useState(false);
  const [isUpdatingProgram, setIsUpdatingProgram] = useState(false);
  const [isUpdatingDescription, setIsUpdatingDescription] = useState(false);
  const [isUpdatingFreeTrial, setIsUpdatingFreeTrial] = useState(false);
  const [isUpdatingWeightSuggestions, setIsUpdatingWeightSuggestions] = useState(false);
  const [isUpdatingAuxiliaryLibraries, setIsUpdatingAuxiliaryLibraries] = useState(false);

  useEffect(() => {
    if (!program) return;
    setProgramNameValue(program.title || '');
    // Simplified model: price = OTP (1-year) amount, subscription_price = monthly.
    // Legacy read: if a program was historically set up as monthly-subscription
    // (access_duration === 'monthly') its `price` is really the monthly amount, so
    // surface it in the subscription slot and leave the OTP slot empty.
    const legacyMonthlyAmount = program.access_duration === 'monthly' && program.price != null;
    setPriceValue(!legacyMonthlyAmount && program.price != null ? String(program.price) : '');
    setSubscriptionPriceValue(
      program.subscription_price != null ? String(program.subscription_price) :
        (legacyMonthlyAmount ? String(program.price) : '')
    );
    setCompareAtPriceValue(program.compare_at_price != null ? String(program.compare_at_price) : '');
    let dur = 1;
    if (program.duration) {
      const m = typeof program.duration === 'string' ? program.duration.match(/^(\d+)/) : null;
      dur = m ? parseInt(m[1], 10) : (typeof program.duration === 'number' ? program.duration : 1);
    }
    setDurationValue(dur);
    setFreeTrialActive(!!program.free_trial?.active);
    setFreeTrialDurationDays(String(program.free_trial?.duration_days ?? 0));
    setWeightSuggestionsEnabled(!!program.weight_suggestions);
    setSelectedLibraryIds(new Set(program.availableLibraries || []));
  }, [program?.id, program?.title, program?.price, program?.subscription_price, program?.access_duration, program?.compare_at_price, program?.duration, program?.free_trial, program?.weight_suggestions, program?.availableLibraries]);

  useEffect(() => {
    if (!program || !user) return;
    setIsLoadingLibraries(true);
    libraryService.getLibrariesByCreator(user.uid)
      .then((libs) => setAvailableLibraries(libs || []))
      .catch((err) => logger.error(err))
      .finally(() => setIsLoadingLibraries(false));
  }, [program?.id, user?.uid]);

  const isOneTimePayment = () => program?.access_duration !== 'monthly';

  const saveStatus = async (status) => {
    if (!program || status === program.status) return;
    try {
      setIsUpdatingStatus(true);
      await programService.updateProgram(program.id, { status });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, status }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const saveTitle = async (title) => {
    if (!program || title.trim() === (program.title || '')) return;
    try {
      setIsUpdatingProgram(true);
      const t = title.trim();
      await programService.updateProgram(program.id, { title: t });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, title: t }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsUpdatingProgram(false);
    }
  };

  const savePrice = async (value) => {
    if (!program) return;
    const numericPrice = value === '' ? null : parseInt(String(value).replace(/\D/g, ''), 10);
    if (numericPrice !== null && numericPrice < 2000) return;
    if (numericPrice === program.price) return;
    try {
      setIsUpdatingPrice(true);
      await programService.updateProgram(program.id, { price: numericPrice });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, price: numericPrice }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  const saveSubscriptionPrice = async (value) => {
    if (!program) return;
    const numeric = value === '' ? null : parseInt(String(value).replace(/\D/g, ''), 10);
    if (numeric !== null && numeric < 2000) return;
    if (numeric === program.subscription_price) return;
    try {
      setIsUpdatingSubscriptionPrice(true);
      await programService.updateProgram(program.id, { subscription_price: numeric });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, subscription_price: numeric }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsUpdatingSubscriptionPrice(false);
    }
  };

  const saveCompareAtPrice = async (value) => {
    if (!program) return;
    const numeric = value === '' ? null : parseInt(String(value).replace(/\D/g, ''), 10);
    if (numeric !== null && numeric < 2000) return;
    if (numeric !== null && program.price && numeric <= program.price) return;
    if (numeric === program.compare_at_price) return;
    try {
      setIsUpdatingCompareAtPrice(true);
      await programService.updateProgram(program.id, { compare_at_price: numeric });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, compare_at_price: numeric }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsUpdatingCompareAtPrice(false);
    }
  };

  const saveDuration = async (weeks) => {
    if (!program || !isOneTimePayment()) return;
    const w = Math.max(1, parseInt(weeks, 10) || 1);
    const durationString = `${w} semanas`;
    if (durationString === (typeof program.duration === 'string' ? program.duration : program.duration ? `${program.duration} semanas` : null)) return;
    try {
      setIsUpdatingDuration(true);
      await programService.updateProgram(program.id, { duration: durationString });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, duration: durationString }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsUpdatingDuration(false);
    }
  };

  const saveFreeTrial = async (active, durationDays) => {
    if (!program) return;
    const days = Math.max(0, parseInt(durationDays, 10) || 0);
    const free_trial = { active: !!active, duration_days: days };
    try {
      setIsUpdatingFreeTrial(true);
      await programService.updateProgram(program.id, { free_trial });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, free_trial }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsUpdatingFreeTrial(false);
    }
  };

  const saveWeightSuggestions = async (enabled) => {
    if (!program) return;
    try {
      setIsUpdatingWeightSuggestions(true);
      await programService.updateProgram(program.id, { weight_suggestions: !!enabled });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, weight_suggestions: !!enabled }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsUpdatingWeightSuggestions(false);
    }
  };

  const saveAuxiliaryLibraries = async (libraryIds) => {
    if (!program) return;
    const ids = Array.from(libraryIds || []).filter(Boolean);
    try {
      setIsUpdatingAuxiliaryLibraries(true);
      await programService.updateProgram(program.id, { availableLibraries: ids });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, availableLibraries: ids }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    } finally {
      setIsUpdatingAuxiliaryLibraries(false);
    }
  };

  const handleImageDelete = async () => {
    if (!program || !program.image_path) return;
    const ok = await confirm('Vas a eliminar la imagen del programa. Seguro?');
    if (!ok) return;
    try {
      await programService.deleteProgramImage(program.id, program.image_path);
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, image_url: null, image_path: null }));
    } catch (err) {
      logger.error(err);
      showToast('No pudimos subir la imagen. Revisa tu conexion e intenta de nuevo.', 'error');
    }
  };

  const handleIntroVideoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !program) return;
    if (!file.type.startsWith('video/')) {
      showToast('Selecciona un archivo de video valido.', 'error');
      return;
    }
    try {
      setIsUploadingIntroVideo(true);
      setIntroVideoUploadProgress(0);
      const videoURL = await programService.uploadProgramIntroVideo(program.id, file, (p) => setIntroVideoUploadProgress(Math.round(p)));
      await programService.updateProgram(program.id, { video_intro_url: videoURL });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, video_intro_url: videoURL }));
      setIntroVideoUploadProgress(100);
    } catch (err) {
      logger.error(err);
      showToast('No pudimos subir la imagen. Revisa tu conexion e intenta de nuevo.', 'error');
    } finally {
      setIsUploadingIntroVideo(false);
      event.target.value = '';
    }
  };

  const handleIntroVideoDelete = async () => {
    if (!program || !program.video_intro_url) return;
    const ok = await confirm('Vas a eliminar el video de introduccion. Seguro?');
    if (!ok) return;
    try {
      await programService.deleteProgramIntroVideo(program.id, program.video_intro_url);
      await programService.updateProgram(program.id, { video_intro_url: null });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, video_intro_url: null }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    }
  };

  const handleAnuncioVideoUploadForScreen = async (event, screenKey, isReplacing = false, videoIndex = 0) => {
    const file = event.target.files[0];
    if (!file || !program) return;
    if (!file.type.startsWith('video/')) {
      showToast('Selecciona un archivo de video valido.', 'error');
      return;
    }
    try {
      setIsUploadingAnuncioVideo(true);
      setAnuncioVideoUploadProgress(0);
      const videoURL = await programService.uploadTutorialVideo(program.id, screenKey, file, (p) => setAnuncioVideoUploadProgress(Math.round(p)));
      const tutorials = { ...(program.tutorials || {}) };
      if (!tutorials[screenKey]) tutorials[screenKey] = [];
      if (isReplacing && tutorials[screenKey][videoIndex]) {
        try {
          await programService.deleteTutorialVideo(program.id, screenKey, tutorials[screenKey][videoIndex]);
        } catch (_) { /* ignore */ }
        tutorials[screenKey][videoIndex] = videoURL;
      } else {
        tutorials[screenKey].push(videoURL);
      }
      await programService.updateProgram(program.id, { tutorials });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, tutorials }));
      setAnuncioVideoUploadProgress(100);
    } catch (err) {
      logger.error(err);
      showToast('No pudimos subir la imagen. Revisa tu conexion e intenta de nuevo.', 'error');
    } finally {
      setIsUploadingAnuncioVideo(false);
      event.target.value = '';
    }
  };

  const handleAnuncioVideoDeleteForScreen = async (screenKey, videoIndex) => {
    if (!program) return;
    const videos = program.tutorials?.[screenKey] || [];
    if (videoIndex >= videos.length) return;
    const ok = await confirm('Vas a eliminar este video. Seguro?');
    if (!ok) return;
    try {
      const videoURL = videos[videoIndex];
      await programService.deleteTutorialVideo(program.id, screenKey, videoURL);
      const tutorials = { ...(program.tutorials || {}) };
      tutorials[screenKey] = tutorials[screenKey].filter((_, i) => i !== videoIndex);
      if (tutorials[screenKey].length === 0) delete tutorials[screenKey];
      await programService.updateProgram(program.id, { tutorials });
      queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, tutorials }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    }
  };

  const handleToggleLibrary = (libraryId) => {
    setSelectedLibraryIds((prev) => {
      const next = new Set(prev);
      if (next.has(libraryId)) {
        next.delete(libraryId);
      } else {
        next.add(libraryId);
      }
      return next;
    });
  };

  if (!program) return null;

  return (
    <div className="program-tab-content">
      <h1 className="program-page-title">Configuracion</h1>

      {program.deliveryType === 'one_on_one' && (
        <div className="program-section pd-one-on-one-notice">
          <p className="pd-one-on-one-notice-text">
            Este programa es un contenedor general (1-on-1). Los cambios aqui se aplican por referencia a todos los clientes.
          </p>
        </div>
      )}

      {/* Contenido visual */}
      <div className="program-section">
        <div className="program-section__header">
          <h2 className="program-section__title">Contenido visual</h2>
        </div>
        <div className="program-visual-cards">
          {/* Image card */}
          <MediaDropZone onSelect={onDropImageSelect} accept="image/*">
            <div className="program-visual-card program-visual-card--editable" onClick={(e) => e.stopPropagation()}>
              <div className="program-visual-card__label">Imagen del programa</div>
              <div className="program-visual-card__media">
                {program.image_url ? (
                  <>
                    <img src={program.image_url} alt="Programa" />
                    <div className="program-visual-card__overlay">
                      <button type="button" className="program-visual-card__btn program-visual-card__btn--change" onClick={() => onOpenMediaPicker('program')}>
                        Cambiar
                      </button>
                      {isUploadingImage && (
                        <div className="program-visual-card__progress">
                          <div className="program-visual-card__progress-bar"><div className="program-visual-card__progress-fill" style={{ width: `${imageUploadProgress}%` }} /></div>
                        </div>
                      )}
                      <button type="button" className="program-visual-card__btn program-visual-card__btn--delete" onClick={handleImageDelete} disabled={isUploadingImage}>Eliminar</button>
                    </div>
                  </>
                ) : (
                  <button type="button" className="program-visual-card__placeholder program-visual-card__placeholder--clickable" onClick={() => onOpenMediaPicker('program')}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span>Subir imagen</span>
                  </button>
                )}
              </div>
            </div>
          </MediaDropZone>

          {/* Video intro card */}
          <MediaDropZone onSelect={onDropIntroVideoSelect} accept="video/*">
          <div className="program-visual-card program-visual-card--editable" onClick={(e) => e.stopPropagation()}>
            <div className="program-visual-card__label">Video intro</div>
            <div className="program-visual-card__media">
              {program.video_intro_url ? (
                <>
                  {(() => {
                    const source = detectVideoSource(program.video_intro_url);
                    const isExternal = source === 'youtube' || source === 'vimeo';
                    if (isExternal) {
                      return <iframe src={getEmbedUrl(program.video_intro_url, source)} allow="autoplay; encrypted-media" allowFullScreen title="Video intro" style={{ width: '100%', height: '100%', border: 'none' }} />;
                    }
                    return <video src={program.video_intro_url} controls playsInline />;
                  })()}
                  <div className="program-visual-card__actions">
                    <label className="program-visual-card__action-btn">
                      <input type="file" accept="video/*" onChange={handleIntroVideoUpload} disabled={isUploadingIntroVideo} className="pd-hidden-input" />
                      {isUploadingIntroVideo ? `Subiendo ${introVideoUploadProgress}%` : 'Cambiar'}
                    </label>
                    <button type="button" className="program-visual-card__action-btn program-visual-card__action-btn--danger" onClick={handleIntroVideoDelete} disabled={isUploadingIntroVideo}>Eliminar</button>
                  </div>
                  {isUploadingIntroVideo && (
                    <div className="program-visual-card__progress program-visual-card__progress--bottom">
                      <div className="program-visual-card__progress-bar"><div className="program-visual-card__progress-fill" style={{ width: `${introVideoUploadProgress}%` }} /></div>
                    </div>
                  )}
                </>
              ) : (
                <label className="program-visual-card__placeholder program-visual-card__placeholder--clickable">
                  <input type="file" accept="video/*" onChange={handleIntroVideoUpload} disabled={isUploadingIntroVideo} className="pd-hidden-input" />
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 10l4.553-2.724c.281-.169.628-.169.909 0 .281.169.538.52.538.842v7.764c0 .322-.257.673-.538.842-.281.169-.628.169-.909 0L15 14M5 18h8c.53 0 1.039-.211 1.414-.586C14.789 17.039 15 16.53 15 16V8c0-.53-.211-1.039-.586-1.414C14.039 6.211 13.53 6 13 6H5c-.53 0-1.039.211-1.414.586C3.211 6.961 3 7.47 3 8v8c0 .53.211 1.039.586 1.414C3.961 17.789 4.47 18 5 18z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>{isUploadingIntroVideo ? `Subiendo ${introVideoUploadProgress}%` : 'Subir video'}</span>
                  {isUploadingIntroVideo && <div className="program-visual-card__progress"><div className="program-visual-card__progress-bar"><div className="program-visual-card__progress-fill" style={{ width: `${introVideoUploadProgress}%` }} /></div></div>}
                </label>
              )}
            </div>
          </div>
          </MediaDropZone>

          {/* Tutorials card */}
          <div className="program-visual-card program-visual-card--editable program-visual-card--tutorials" onClick={(e) => e.stopPropagation()}>
            <div className="program-visual-card__label">Tutoriales</div>
            <div className="program-visual-card__tutorials-body">
              {TUTORIAL_SCREENS.map(({ key: screenKey, label }) => {
                const videos = program.tutorials?.[screenKey] || [];
                return (
                  <div key={screenKey} className="program-visual-card__tutorial-row">
                    <span className="program-visual-card__tutorial-label">{label}</span>
                    <div className="program-visual-card__tutorial-actions">
                      <label className="program-visual-card__btn program-visual-card__btn--small">
                        <input type="file" accept="video/*" onChange={(e) => handleAnuncioVideoUploadForScreen(e, screenKey, false)} disabled={isUploadingAnuncioVideo} className="pd-hidden-input" />
                        {isUploadingAnuncioVideo ? 'Subiendo...' : '+'}
                      </label>
                      {videos.map((url, idx) => (
                        <span key={idx} className="program-visual-card__tutorial-video-pill">
                          <span>Video {idx + 1}</span>
                          <button type="button" className="program-visual-card__btn program-visual-card__btn--small program-visual-card__btn--delete" onClick={() => handleAnuncioVideoDeleteForScreen(screenKey, idx)} disabled={isUploadingAnuncioVideo}>x</button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Informacion basica */}
      <div className="program-section">
        <div className="program-section__header">
          <h2 className="program-section__title">Informacion basica</h2>
        </div>
        <div className="program-section__content program-config-inline">
          <div className="program-config-inline-row">
            <span className="program-config-item-label">Nombre</span>
            <div className="program-config-inline-field">
              <input type="text" className="program-config-inline-input pd-inline-input-min200" value={programNameValue} onChange={(e) => setProgramNameValue(e.target.value)} placeholder="Nombre del programa" />
              <button type="button" className="program-config-inline-btn" onClick={() => saveTitle(programNameValue)} disabled={isUpdatingProgram || !programNameValue.trim() || programNameValue.trim() === (program?.title || '')}>
                {isUpdatingProgram ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
          <div className="program-config-inline-row">
            <span className="program-config-item-label">Disciplina</span>
            <span className="program-config-item-value">{program.discipline || 'No especificada'}</span>
          </div>
          <div className="program-config-inline-row">
            <span className="program-config-item-label">Tipo</span>
            <span className="program-config-item-value">{getAccessTypeLabel(program.access_duration)}</span>
          </div>
          <div className="program-config-inline-row">
            <span className="program-config-item-label">Estado</span>
            <div className="program-config-inline-field program-config-status-btns">
              <button type="button" className={`program-config-status-btn ${program.status === 'draft' ? 'program-config-status-btn--active' : ''} program-config-status-btn--draft`} onClick={() => saveStatus('draft')} disabled={isUpdatingStatus || program.status === 'draft'}>Borrador</button>
              <button type="button" className={`program-config-status-btn ${program.status === 'published' ? 'program-config-status-btn--active' : ''} program-config-status-btn--published`} onClick={() => saveStatus('published')} disabled={isUpdatingStatus || program.status === 'published'}>Publicado</button>
            </div>
          </div>
          <div className="program-config-inline-row program-config-inline-row--full">
            <span className="program-config-item-label">Descripcion</span>
            {isEditingDescription ? (
              <div className="program-config-description-edit">
                <textarea className="program-config-description-textarea" value={descriptionValue} onChange={(e) => setDescriptionValue(e.target.value)} placeholder="Escribe la descripcion del programa..." rows={5} />
                <div className="program-config-description-actions">
                  <Button
                    title={isUpdatingDescription ? 'Guardando...' : 'Guardar'}
                    onClick={async () => {
                      if (!program) return;
                      try {
                        setIsUpdatingDescription(true);
                        await programService.updateProgram(program.id, { description: descriptionValue });
                        queryClient.setQueryData(queryKeys.programs.detail(program.id), (old) => ({ ...old, description: descriptionValue }));
                        setIsEditingDescription(false);
                      } catch (err) {
                        logger.error(err);
                        showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
                      } finally {
                        setIsUpdatingDescription(false);
                      }
                    }}
                    disabled={isUpdatingDescription}
                    loading={isUpdatingDescription}
                  />
                </div>
              </div>
            ) : (
              <div className="program-config-inline-field">
                <p className="program-config-description">{program.description || 'Sin descripcion'}</p>
                <button type="button" className="program-config-inline-btn" onClick={() => { setIsEditingDescription(true); setDescriptionValue(program.description || ''); }}>Editar</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Precio y duracion */}
      <div className="program-section">
        <div className="program-section__header">
          <h2 className="program-section__title">Precio y duracion</h2>
        </div>
        <div className="program-section__content program-config-inline">
          <div className="program-config-inline-row">
            <span className="program-config-item-label">Pago único (1 año)</span>
            <div className="program-config-inline-field">
              <input type="text" className="program-config-inline-input pd-inline-input-max140" value={priceValue} onChange={(e) => setPriceValue(e.target.value.replace(/\D/g, ''))} placeholder="Sin oferta" />
              <span className="program-config-inline-hint">$ (min. 2000)</span>
              <button type="button" className="program-config-inline-btn" onClick={() => savePrice(priceValue)} disabled={isUpdatingPrice || (priceValue !== '' && parseInt(priceValue, 10) < 2000)}>{isUpdatingPrice ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
          <div className="program-config-inline-row">
            <span className="program-config-item-label">Suscripción mensual</span>
            <div className="program-config-inline-field">
              <input type="text" className="program-config-inline-input pd-inline-input-max140" value={subscriptionPriceValue} onChange={(e) => setSubscriptionPriceValue(e.target.value.replace(/\D/g, ''))} placeholder="Sin oferta" />
              <span className="program-config-inline-hint">$ / mes (min. 2000)</span>
              <button type="button" className="program-config-inline-btn" onClick={() => saveSubscriptionPrice(subscriptionPriceValue)} disabled={isUpdatingSubscriptionPrice || (subscriptionPriceValue !== '' && parseInt(subscriptionPriceValue, 10) < 2000)}>{isUpdatingSubscriptionPrice ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
          <div className="program-config-inline-row">
            <span className="program-config-item-label">Precio comparativo</span>
            <div className="program-config-inline-field">
              <input type="text" className="program-config-inline-input pd-inline-input-max140" value={compareAtPriceValue} onChange={(e) => setCompareAtPriceValue(e.target.value.replace(/\D/g, ''))} placeholder="Se muestra tachado" />
              <span className="program-config-inline-hint">$ (mayor al precio)</span>
              <button type="button" className="program-config-inline-btn" onClick={() => saveCompareAtPrice(compareAtPriceValue)} disabled={isUpdatingCompareAtPrice || (compareAtPriceValue !== '' && (parseInt(compareAtPriceValue, 10) < 2000 || (priceValue && parseInt(compareAtPriceValue, 10) <= parseInt(priceValue, 10))))}>{isUpdatingCompareAtPrice ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
          <div className="program-config-inline-row">
            <span className="program-config-item-label">Prueba gratis</span>
            <div className="program-config-inline-field program-config-inline-toggle-row">
              <label className="program-config-toggle-wrap">
                <input type="checkbox" checked={freeTrialActive} onChange={(e) => setFreeTrialActive(e.target.checked)} />
                <span className="program-config-toggle-slider" />
              </label>
              {freeTrialActive && (
                <>
                  <input type="number" min={0} className="program-config-inline-input pd-inline-input-w56" value={freeTrialDurationDays} onChange={(e) => setFreeTrialDurationDays(e.target.value.replace(/\D/g, ''))} />
                  <span className="program-config-inline-hint">dias</span>
                </>
              )}
              <button type="button" className="program-config-inline-btn" onClick={() => saveFreeTrial(freeTrialActive, freeTrialDurationDays)} disabled={isUpdatingFreeTrial}>{isUpdatingFreeTrial ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
          <div className="program-config-inline-row">
            <span className="program-config-item-label">Duracion</span>
            {isOneTimePayment() ? (
              <div className="program-config-inline-field">
                <input type="number" min={1} className="program-config-inline-input pd-inline-input-w64" value={durationValue} onChange={(e) => setDurationValue(Math.max(1, parseInt(e.target.value, 10) || 1))} />
                <span className="program-config-inline-hint">semanas</span>
                <button type="button" className="program-config-inline-btn" onClick={() => saveDuration(durationValue)} disabled={isUpdatingDuration}>{isUpdatingDuration ? 'Guardando...' : 'Guardar'}</button>
              </div>
            ) : (
              <span className="program-config-item-value">Mensual</span>
            )}
          </div>
        </div>
      </div>

      {/* Ejecucion */}
      <div className="program-section">
        <div className="program-section__header">
          <h2 className="program-section__title">Ejecucion</h2>
        </div>
        <div className="program-section__content program-config-inline">
          <div className="program-config-inline-row">
            <span className="program-config-item-label">Sugerencias de peso</span>
            <div className="program-config-inline-field program-config-inline-toggle-row">
              <label className="program-config-toggle-wrap">
                <input type="checkbox" checked={weightSuggestionsEnabled} onChange={(e) => setWeightSuggestionsEnabled(e.target.checked)} />
                <span className="program-config-toggle-slider" />
              </label>
              <button type="button" className="program-config-inline-btn" onClick={() => saveWeightSuggestions(weightSuggestionsEnabled)} disabled={isUpdatingWeightSuggestions}>{isUpdatingWeightSuggestions ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
          <div className="program-config-inline-row program-config-inline-row--full">
            <span className="program-config-item-label">Bibliotecas auxiliares</span>
            <div className="program-config-inline-field program-config-libraries-inline">
              {isLoadingLibraries ? (
                <p className="program-config-inline-hint">Cargando bibliotecas...</p>
              ) : availableLibraries.length === 0 ? (
                <p className="program-config-inline-hint">No tienes bibliotecas. Crea una desde Ejercicios.</p>
              ) : (
                <>
                  <div className="program-config-libraries-checkboxes">
                    {availableLibraries.map((lib) => (
                      <label key={lib.id} className="program-config-library-chip">
                        <input type="checkbox" checked={selectedLibraryIds.has(lib.id)} onChange={() => handleToggleLibrary(lib.id)} />
                        <span>{lib.title || `Biblioteca ${lib.id?.slice(0, 8)}`}</span>
                      </label>
                    ))}
                  </div>
                  <button type="button" className="program-config-inline-btn" onClick={() => saveAuxiliaryLibraries(selectedLibraryIds)} disabled={isUpdatingAuxiliaryLibraries}>{isUpdatingAuxiliaryLibraries ? 'Guardando...' : 'Guardar'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
