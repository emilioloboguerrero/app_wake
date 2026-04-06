import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { queryKeys } from '../config/queryClient';
import programService from '../services/programService';
import apiClient from '../utils/apiClient';
import useConfirm from './useConfirm';
import logger from '../utils/logger';

const LISTING_FIELDS = ['title', 'description', 'image_url', 'image_path', 'status'];

export default function useProgramEditor(programId, program) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { confirm, ConfirmModal } = useConfirm();

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
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [isIntroVideoPickerOpen, setIsIntroVideoPickerOpen] = useState(false);
  const [isMensajePickerOpen, setIsMensajePickerOpen] = useState(false);
  const [mensajePickerScreenKey, setMensajePickerScreenKey] = useState(null);

  useEffect(() => {
    setWeightSuggestions(!!program?.weight_suggestions);
    setSelectedLibraryIds(new Set(program?.availableLibraries || []));
  }, [program?.weight_suggestions, program?.availableLibraries]);

  // ── Mutations (P8) ────────────────────────────────────────────
  const detailKey = queryKeys.programs.detail(programId);

  const updateFieldMutation = useMutation({
    mutationKey: ['programs', 'update-field'],
    mutationFn: (updates) => programService.updateProgram(programId, updates),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData(detailKey);
      queryClient.setQueryData(detailKey, (old) => ({ ...old, ...updates }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
      showToast('Los cambios no se guardaron. Revisa tu conexion.', 'error');
    },
    onSettled: (_data, _error, updates) => {
      if (user?.uid && Object.keys(updates).some((k) => LISTING_FIELDS.includes(k))) {
        queryClient.invalidateQueries({ queryKey: queryKeys.programs.byCreator(user.uid) });
        queryClient.invalidateQueries({ queryKey: ['clients', 'overview'] });
      }
    },
  });

  const updateStatusMutation = useMutation({
    mutationKey: ['programs', 'update-status'],
    mutationFn: (status) => apiClient.patch(`/creator/programs/${programId}/status`, { status }),
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const previous = queryClient.getQueryData(detailKey);
      queryClient.setQueryData(detailKey, (old) => ({ ...old, status }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous);
      showToast('No se pudo cambiar el estado.', 'error');
    },
    onSettled: () => {
      if (user?.uid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.programs.byCreator(user.uid) });
        queryClient.invalidateQueries({ queryKey: ['clients', 'overview'] });
      }
    },
  });

  const isSaving = updateFieldMutation.isPending || updateStatusMutation.isPending;

  // ── Save handlers ─────────────────────────────────────────────
  const saveField = useCallback(
    (updates) => updateFieldMutation.mutateAsync(updates),
    [updateFieldMutation],
  );

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

  const saveStatus = useCallback(
    (status) => {
      if (status === program?.status) return;
      return updateStatusMutation.mutateAsync(status);
    },
    [program?.status, updateStatusMutation],
  );

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
  const handleProgramImageSelect = useCallback(async (item) => {
    try {
      await programService.updateProgram(programId, { image_url: item.url, image_path: null });
      queryClient.setQueryData(detailKey, (old) => ({ ...old, image_url: item.url, image_path: null }));
      if (user?.uid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.programs.byCreator(user.uid) });
        queryClient.invalidateQueries({ queryKey: ['clients', 'overview'] });
      }
    } catch {
      showToast('No pudimos subir la imagen. Revisa tu conexion e intenta de nuevo.', 'error');
    }
    setIsMediaPickerOpen(false);
  }, [programId, queryClient, showToast, detailKey, user?.uid]);

  const handleImageDelete = useCallback(async () => {
    if (!program?.image_path) return;
    const ok = await confirm('Vas a eliminar la imagen del programa. Seguro?');
    if (!ok) return;
    try {
      await programService.deleteProgramImage(programId, program.image_path);
      queryClient.setQueryData(detailKey, (old) => ({ ...old, image_url: null, image_path: null }));
      if (user?.uid) {
        queryClient.invalidateQueries({ queryKey: queryKeys.programs.byCreator(user.uid) });
        queryClient.invalidateQueries({ queryKey: ['clients', 'overview'] });
      }
    } catch (err) {
      logger.error(err);
      showToast('No pudimos eliminar la imagen.', 'error');
    }
  }, [program?.image_path, programId, queryClient, showToast, confirm, detailKey, user?.uid]);

  // ── Video handlers ────────────────────────────────────────────
  const handleIntroVideoSelect = useCallback(async (item) => {
    try {
      await programService.updateProgram(programId, { video_intro_url: item.url });
      queryClient.setQueryData(detailKey, (old) => ({ ...old, video_intro_url: item.url }));
    } catch (err) {
      logger.error(err);
      showToast('No pudimos guardar el video.', 'error');
    }
    setIsIntroVideoPickerOpen(false);
  }, [programId, queryClient, showToast, detailKey]);

  const handleIntroVideoDelete = useCallback(async () => {
    if (!program?.video_intro_url) return;
    const ok = await confirm('Vas a eliminar el video de introduccion. Seguro?');
    if (!ok) return;
    try {
      await programService.deleteProgramIntroVideo(programId, program.video_intro_url);
      await programService.updateProgram(programId, { video_intro_url: null });
      queryClient.setQueryData(detailKey, (old) => ({ ...old, video_intro_url: null }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron.', 'error');
    }
  }, [program?.video_intro_url, programId, queryClient, showToast, confirm, detailKey]);

  const handleMensajeMediaSelect = useCallback(async (item) => {
    if (!mensajePickerScreenKey) return;
    try {
      const tutorials = { ...(program?.tutorials || {}) };
      if (!tutorials[mensajePickerScreenKey]) tutorials[mensajePickerScreenKey] = [];
      tutorials[mensajePickerScreenKey].push(item.url);
      await programService.updateProgram(programId, { tutorials });
      queryClient.setQueryData(detailKey, (old) => ({ ...old, tutorials }));
    } catch (err) {
      logger.error(err);
      showToast('No pudimos guardar el mensaje.', 'error');
    }
    setIsMensajePickerOpen(false);
    setMensajePickerScreenKey(null);
  }, [mensajePickerScreenKey, programId, program?.tutorials, queryClient, showToast, detailKey]);

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
      queryClient.setQueryData(detailKey, (old) => ({ ...old, tutorials }));
    } catch (err) {
      logger.error(err);
      showToast('Los cambios no se guardaron.', 'error');
    }
  }, [program?.tutorials, programId, queryClient, showToast, confirm, detailKey]);

  // ── Keyboard handlers ─────────────────────────────────────────
  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveTitle(); }
    if (e.key === 'Escape') { setTitleValue(program?.title || ''); setIsEditingTitle(false); }
  };

  const handleDescKeyDown = (e) => {
    if (e.key === 'Escape') { setDescValue(program?.description || ''); setIsEditingDescription(false); }
  };

  return {
    // State
    titleValue, setTitleValue,
    isEditingTitle, setIsEditingTitle,
    descValue, setDescValue,
    isEditingDescription, setIsEditingDescription,
    weightSuggestions, setWeightSuggestions,
    selectedLibraryIds, setSelectedLibraryIds,
    isUpdatingStatus: updateStatusMutation.isPending,
    isMediaPickerOpen, setIsMediaPickerOpen,
    isIntroVideoPickerOpen, setIsIntroVideoPickerOpen,
    isMensajePickerOpen, setIsMensajePickerOpen,
    mensajePickerScreenKey, setMensajePickerScreenKey,
    // Handlers
    saveField, saveTitle, saveDescription, saveStatus,
    saveWeightSuggestions, handleToggleLibrary,
    handleProgramImageSelect, handleImageDelete,
    handleIntroVideoSelect, handleIntroVideoDelete,
    handleMensajeMediaSelect, handleTutorialVideoDelete,
    handleTitleKeyDown, handleDescKeyDown,
    // Mutation state
    isSaving,
    // Confirm modal (must be rendered by consuming component)
    ConfirmModal,
  };
}
