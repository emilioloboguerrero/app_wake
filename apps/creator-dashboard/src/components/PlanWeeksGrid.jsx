import React, { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useToast } from '../contexts/ToastContext';
import logger from '../utils/logger';
import { MenuDropdown, ConfirmDeleteModal, GlowingEffect, ShimmerSkeleton, Tooltip } from './ui';
import MuscleSilhouetteSVG from './MuscleSilhouetteSVG';
import { computePlannedMuscleVolumes, getPrimaryReferences } from '../utils/plannedVolumeUtils';
import { extractAccentFromImage } from './events/eventFieldComponents';
import { DRAG_TYPE_LIBRARY_SESSION } from './PlanStructureSidebar';
import './PlanWeeksGrid.css';

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const DRAG_TYPE_MOVE_SESSION = 'plan-structure/move-session';
const SPRING_EASE = [0.22, 1, 0.36, 1];

// ─── SVG Icons (inline, small) ──────────────────────────────────────────────

const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconDuplicate = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M8 16h10a2 2 0 002-2V8a2 2 0 00-2-2H8a2 2 0 00-2 2v6a2 2 0 002 2z" />
  </svg>
);
const IconDelete = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const IconMove = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 9l4-4 4 4M9 5v14M15 19l4-4-4-4M19 15H5" />
  </svg>
);
const IconLink = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);
const IconLocal = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const IconChevron = ({ down }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: down ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/**
 * Right-side grid: weeks × 7 days with session cards.
 * Supports drag-drop from library, session move/duplicate, week collapse, menus, delete confirm.
 */
const PlanWeeksGrid = ({
  planId,
  modules = [],
  onAddWeek,
  onDeleteWeek,
  onModulesChange,
  onSessionClick,
  plansService,
  libraryService = null,
  creatorId = null,
  isAddingWeek = false,
  onOpenWeekVolume = null,
}) => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ─── Add session overlay state ──────────────────────────────────────────
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionStep, setSessionStep] = useState('name'); // 'name' | 'location' | 'creating' | 'success'
  const [addSessionModuleId, setAddSessionModuleId] = useState(null);
  const [addSessionDayIndex, setAddSessionDayIndex] = useState(0);
  const [newSessionName, setNewSessionName] = useState('');
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const sessionInputRef = useRef(null);
  const createdSessionRef = useRef(null);

  // ─── Delete state ───────────────────────────────────────────────────────
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── Drag-drop state ────────────────────────────────────────────────────
  const [addingToModuleId, setAddingToModuleId] = useState(null);
  const [addingToDayIndex, setAddingToDayIndex] = useState(null);
  const [dragMoveTarget, setDragMoveTarget] = useState(null); // { sourceModuleId, sourceSessionId, sourceSession, targetModuleId, targetDayIndex }

  // ─── Duplicate week state ───────────────────────────────────────────────
  const [isDuplicatingWeek, setIsDuplicatingWeek] = useState(false);
  const [duplicatingWeekModuleId, setDuplicatingWeekModuleId] = useState(null);

  // ─── Week collapse state ────────────────────────────────────────────────
  const [collapsedWeeks, setCollapsedWeeks] = useState(new Set());

  // ─── Heatmap hover ─────────────────────────────────────────────────────
  const heatmapTimerRef = useRef(null);
  const heatmapCacheRef = useRef({}); // { [sessionKey]: { volumes, accentRgb } }
  const [heatmapData, setHeatmapData] = useState(null); // { sessionId, volumes, accentRgb, rect }
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const accentCleanupRef = useRef(null);

  const handleSessionHoverStart = useCallback((session, e) => {
    if (!session || session._optimistic) return;
    clearTimeout(heatmapTimerRef.current);
    if (accentCleanupRef.current) { accentCleanupRef.current(); accentCleanupRef.current = null; }
    const cardEl = e.currentTarget;
    const sessionKey = session.source_library_session_id ?? session.librarySessionRef ?? session.id;
    heatmapTimerRef.current = setTimeout(async () => {
      if (!cardEl) return;
      const rect = cardEl.getBoundingClientRect();

      // Check cache
      if (heatmapCacheRef.current[sessionKey]) {
        const cached = heatmapCacheRef.current[sessionKey];
        setHeatmapData({ sessionId: session.id, volumes: cached.volumes, accentRgb: cached.accentRgb, rect });
        return;
      }

      setHeatmapLoading(true);
      setHeatmapData({ sessionId: session.id, volumes: null, accentRgb: null, rect });

      // Extract accent color from session image
      let accentRgb = null;
      if (session.image_url) {
        accentRgb = await new Promise((resolve) => {
          const cleanup = extractAccentFromImage(session.image_url, (rgb) => resolve(rgb));
          accentCleanupRef.current = cleanup;
          setTimeout(() => resolve(null), 2000); // timeout fallback
        });
      }

      try {
        let exercises = [];
        // New model: prefer local exercises on the session
        if (session.exercises?.length > 0) {
          exercises = session.exercises;
        } else if (plansService && planId) {
          const mod = modules.find(m => m.sessions?.some(s => s.id === session.id));
          if (mod) {
            const fullSession = await plansService.getSessionById(planId, mod.id, session.id);
            exercises = fullSession?.exercises ?? [];
          }
        }
        // Legacy fallback: resolve from library
        if (exercises.length === 0) {
          const libRef = session.source_library_session_id ?? session.librarySessionRef;
          if (libRef && libraryService && creatorId) {
            const libSession = await libraryService.getLibrarySessionById(creatorId, libRef);
            exercises = libSession?.exercises ?? [];
          }
        }

        const libraryIds = new Set();
        exercises.forEach(ex => {
          getPrimaryReferences(ex).forEach(({ libraryId }) => { if (libraryId) libraryIds.add(libraryId); });
        });
        const libraryDataCache = {};
        for (const libId of libraryIds) {
          if (libraryService) {
            const lib = await libraryService.getLibraryById(libId);
            if (lib) libraryDataCache[libId] = lib;
          }
        }
        const volumes = computePlannedMuscleVolumes(exercises, libraryDataCache);
        heatmapCacheRef.current[sessionKey] = { volumes, accentRgb };
        setHeatmapData(prev => prev?.sessionId === session.id ? { ...prev, volumes, accentRgb } : prev);
      } catch (err) {
        logger.warn('[PlanWeeksGrid] Heatmap load failed:', err);
        setHeatmapData(prev => prev?.sessionId === session.id ? { ...prev, volumes: {}, accentRgb } : prev);
      } finally {
        setHeatmapLoading(false);
      }
    }, 200);
  }, [libraryService, creatorId, plansService, planId, modules]);

  const handleSessionHoverEnd = useCallback(() => {
    clearTimeout(heatmapTimerRef.current);
    if (accentCleanupRef.current) { accentCleanupRef.current(); accentCleanupRef.current = null; }
    setHeatmapData(null);
    setHeatmapLoading(false);
  }, []);

  // ─── Helpers ────────────────────────────────────────────────────────────

  const refreshModules = async () => {
    if (!planId || !onModulesChange || !plansService) return;
    const mods = await plansService.getModulesByPlan(planId);
    const withSessions = mods.map((m) => ({
      ...m,
      sessions: (m.sessions ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }));
    onModulesChange(withSessions);
  };

  const getSessionForDay = (module, dayIndex) => {
    const sessions = module.sessions || [];
    return sessions.find((s) => (s.dayIndex ?? s.order) === dayIndex) || null;
  };

  const isSessionLinked = (session) =>
    !!(session.source_library_session_id ?? session.librarySessionRef);

  const toggleWeekCollapse = useCallback((moduleId) => {
    setCollapsedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }, []);

  // ─── Add session ───────────────────────────────────────────────────────

  const handleAddSessionClick = (moduleId, dayIndex) => {
    setAddSessionModuleId(moduleId);
    setAddSessionDayIndex(dayIndex);
    setNewSessionName('');
    setSaveToLibrary(true);
    setSessionStep('name');
    setShowCreateSession(true);
    setTimeout(() => sessionInputRef.current?.focus(), 300);
  };

  const handleCreateSessionInGrid = async () => {
    if (!newSessionName.trim() || !addSessionModuleId || !planId || !plansService) return;
    setSessionStep('creating');
    try {
      let sourceLibrarySessionId = null;
      if (libraryService && creatorId) {
        const libSession = await libraryService.createLibrarySession(creatorId, {
          title: newSessionName.trim(),
          showInLibrary: saveToLibrary,
        });
        sourceLibrarySessionId = libSession.id;
      }
      const created = await plansService.createSession(
        planId, addSessionModuleId, newSessionName.trim(),
        addSessionDayIndex, null, sourceLibrarySessionId, addSessionDayIndex
      );
      await refreshModules();
      createdSessionRef.current = { modId: addSessionModuleId, sessId: created?.id };
      setSessionStep('success');
      setTimeout(() => {
        setShowCreateSession(false);
        setNewSessionName('');
        const ref = createdSessionRef.current;
        setAddSessionModuleId(null);
        setAddSessionDayIndex(0);
        if (ref?.sessId) {
          navigate(`/plans/${planId}/modules/${ref.modId}/sessions/${ref.sessId}`);
        }
      }, 1600);
    } catch (err) {
      showToast(err.message || 'No pudimos crear la sesión. Intenta de nuevo.', 'error');
      setSessionStep('name');
    }
  };

  // ─── Library drag-drop ──────────────────────────────────────────────────

  const handleDropOnCell = async (moduleId, dayIndex, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('plan-weeks-cell-drag-over');
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }

    // Handle move/duplicate from existing session
    if (data.type === DRAG_TYPE_MOVE_SESSION && data.sessionId) {
      if (data.moduleId === moduleId && data.dayIndex === dayIndex) return;
      setDragMoveTarget({
        sourceModuleId: data.moduleId,
        sourceSessionId: data.sessionId,
        sourceSession: data,
        targetModuleId: moduleId,
        targetDayIndex: dayIndex,
      });
      return;
    }

    // Handle library session drop
    const libSessionId = data.librarySessionRef || data.sourceLibrarySessionId;
    if (data.type !== DRAG_TYPE_LIBRARY_SESSION || !libSessionId) return;

    const prevModules = (modules || []).map((m) => ({ ...m, sessions: [...(m.sessions || [])] }));
    const optimisticSession = { id: `temp-${Date.now()}`, title: data.title || 'Sesion', dayIndex, _optimistic: true };
    const optimisticModules = prevModules.map((m) =>
      m.id === moduleId ? { ...m, sessions: [...(m.sessions || []), optimisticSession] } : m
    );
    onModulesChange?.(optimisticModules);
    setAddingToModuleId(moduleId);
    setAddingToDayIndex(dayIndex);

    try {
      const libSession = await libraryService?.getLibrarySessionById?.(creatorId, libSessionId);
      const title = libSession?.title || data.title || 'Sesion';
      const imageUrl = libSession?.image_url ?? null;
      await plansService.createSession(planId, moduleId, title, dayIndex, imageUrl, libSessionId, dayIndex);
      await refreshModules();
      showToast('Sesión asignada', 'success');
    } catch (err) {
      onModulesChange?.(prevModules);
      showToast(err.message || 'No pudimos asignar la sesión. Intenta de nuevo.', 'error');
    } finally {
      setAddingToModuleId(null);
      setAddingToDayIndex(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    e.currentTarget.classList.add('plan-weeks-cell-drag-over');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('plan-weeks-cell-drag-over');
  };

  // ─── Session drag (move/duplicate) ──────────────────────────────────────

  const handleSessionDragStart = (e, moduleId, session) => {
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: DRAG_TYPE_MOVE_SESSION,
      moduleId,
      sessionId: session.id,
      dayIndex: session.dayIndex ?? session.order,
      title: session.title,
      source_library_session_id: session.source_library_session_id ?? session.librarySessionRef ?? null,
      image_url: session.image_url ?? null,
    }));
  };

  const handleMoveSession = async () => {
    if (!dragMoveTarget) return;
    const { sourceModuleId, sourceSessionId, targetModuleId, targetDayIndex } = dragMoveTarget;
    setDragMoveTarget(null);
    try {
      if (sourceModuleId === targetModuleId) {
        await plansService.updateSession(planId, sourceModuleId, sourceSessionId, {
          order: targetDayIndex, dayIndex: targetDayIndex,
        });
      } else {
        const sourceSession = await plansService.getSessionById(planId, sourceModuleId, sourceSessionId);
        if (!sourceSession) throw new Error('Sesion no encontrada');
        await plansService.createSession(
          planId, targetModuleId, sourceSession.title || 'Sesion',
          targetDayIndex, sourceSession.image_url ?? null,
          sourceSession.source_library_session_id ?? sourceSession.librarySessionRef ?? null, targetDayIndex
        );
        await plansService.deleteSession(planId, sourceModuleId, sourceSessionId);
      }
      await refreshModules();
      showToast('Sesión movida', 'success');
    } catch (err) {
      showToast(err.message || 'No pudimos mover la sesión.', 'error');
    }
  };

  const handleDuplicateSession = async () => {
    if (!dragMoveTarget) return;
    const { sourceModuleId, sourceSessionId, targetModuleId, targetDayIndex, sourceSession: srcData } = dragMoveTarget;
    setDragMoveTarget(null);
    try {
      await plansService.createSession(
        planId, targetModuleId, srcData?.title || 'Sesion',
        targetDayIndex, srcData?.image_url ?? null,
        srcData?.source_library_session_id ?? null, targetDayIndex
      );
      await refreshModules();
      showToast('Sesión duplicada', 'success');
    } catch (err) {
      showToast(err.message || 'No pudimos duplicar la sesión.', 'error');
    }
  };

  // ─── Week actions ───────────────────────────────────────────────────────

  const handleDuplicateWeek = async (mod) => {
    if (!planId || !plansService) return;
    setDuplicatingWeekModuleId(mod.id);
    setIsDuplicatingWeek(true);
    try {
      await plansService.duplicateModule(planId, mod.id);
      await refreshModules();
      showToast('Semana duplicada', 'success');
    } catch (err) {
      logger.error('Error duplicating week:', err);
      showToast(err.message || 'No pudimos duplicar la semana. Intenta de nuevo.', 'error');
    } finally {
      setIsDuplicatingWeek(false);
      setDuplicatingWeekModuleId(null);
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    const { type, mod, session, moduleId } = deleteConfirmTarget;
    setIsDeleting(true);
    try {
      if (type === 'week') {
        await plansService.deleteModule(planId, mod.id);
        onDeleteWeek?.();
      } else if (type === 'session' && session && moduleId) {
        await plansService.deleteSession(planId, moduleId, session.id);
      }
      await refreshModules();
      setDeleteConfirmTarget(null);
      showToast(type === 'week' ? 'Semana eliminada' : 'Sesión eliminada', 'success');
    } catch (err) {
      showToast(err.message || (type === 'week' ? 'No pudimos eliminar la semana' : 'No pudimos eliminar la sesión'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Helpers for collapse ───────────────────────────────────────────────
  const shouldShowCollapse = modules.length >= 12;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="plan-weeks-grid">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="plan-weeks-grid-header">
        {onOpenWeekVolume && (
          <button type="button" className="plan-weeks-volume-btn" onClick={onOpenWeekVolume} disabled={modules.length === 0} title="Ver volumen por músculo de la semana" aria-label="Volumen">
            <svg className="plan-weeks-volume-btn-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12M12 3C16.9706 3 21 7.02944 21 12M12 3V12M21 12H12M18 18.5L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Volumen
          </button>
        )}
        <button type="button" className="plan-weeks-add-week-btn" onClick={onAddWeek} disabled={isAddingWeek}>
          {isAddingWeek ? (
            <><span className="plan-weeks-add-week-spinner" aria-hidden />Añadiendo...</>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Añadir semana
            </>
          )}
        </button>
      </div>

      {/* ── Days header ───────────────────────────────────── */}
      <div className="plan-weeks-list-wrap">
        {modules.length > 0 && (
          <div className="plan-weeks-days-header">
            {DAYS.map((d) => (
              <div key={d} className="plan-weeks-days-header-cell">Día {d}</div>
            ))}
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────── */}
        {modules.length === 0 ? (
          <div className="plan-weeks-empty">No hay semanas. Pulsa «Añadir semana» para crear la primera.</div>
        ) : (
          <AnimatePresence mode="popLayout">
            {modules.map((mod, modIndex) => {
              const isCollapsed = shouldShowCollapse && collapsedWeeks.has(mod.id);

              return (
                <motion.div
                  key={mod.id}
                  layout
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, x: -30, filter: 'blur(4px)' }}
                  transition={{ duration: 0.42, ease: SPRING_EASE }}
                >
                  <div className="plan-weeks-week-block">
                    <GlowingEffect spread={25} proximity={80} borderWidth={1} />
                    {/* ── Week header ──────────────────────── */}
                    <div
                      className="plan-weeks-week-header"
                      onClick={shouldShowCollapse ? () => toggleWeekCollapse(mod.id) : undefined}
                      style={shouldShowCollapse ? { cursor: 'pointer' } : undefined}
                    >
                      <span className="plan-weeks-week-title">
                        {shouldShowCollapse && <IconChevron down={!isCollapsed} />}
                        {' '}Semana {modIndex + 1}
                        {duplicatingWeekModuleId === mod.id && (
                          <span className="plan-weeks-week-duplicating"> · Duplicando...</span>
                        )}
                      </span>
                      <div className="plan-weeks-week-menu-wrap" onClick={(e) => e.stopPropagation()}>
                        <MenuDropdown
                          trigger={
                            <button type="button" className="plan-weeks-week-menu-btn" title="Opciones de semana" aria-label="Opciones de semana" disabled={duplicatingWeekModuleId === mod.id}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke="currentColor" strokeWidth="2"/>
                                <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" stroke="currentColor" strokeWidth="2"/>
                                <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" stroke="currentColor" strokeWidth="2"/>
                              </svg>
                            </button>
                          }
                          items={[
                            { label: duplicatingWeekModuleId === mod.id ? 'Duplicando...' : 'Duplicar semana', icon: <IconDuplicate />, onClick: () => handleDuplicateWeek(mod) },
                            { divider: true },
                            { label: 'Eliminar', icon: <IconDelete />, danger: true, onClick: () => setDeleteConfirmTarget({ type: 'week', mod, modIndex }) },
                          ]}
                        />
                      </div>
                    </div>

                    {/* ── Week days grid ───────────────────── */}
                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                        <motion.div
                          initial={shouldShowCollapse ? { height: 0, opacity: 0 } : false}
                          animate={{ height: 'auto', opacity: 1, overflow: 'visible' }}
                          exit={shouldShowCollapse ? { height: 0, opacity: 0, overflow: 'hidden' } : undefined}
                          transition={{ duration: 0.3, ease: SPRING_EASE }}
                        >
                          <div className="plan-weeks-week-days">
                            {DAYS.map((_, dayIndex) => {
                              const session = getSessionForDay(mod, dayIndex);
                              const isEmpty = !session;
                              const isAddingToThisCell = addingToModuleId === mod.id && addingToDayIndex === dayIndex;
                              const linked = session ? isSessionLinked(session) : false;

                              return (
                                <div
                                  key={dayIndex}
                                  className={`plan-weeks-day-cell ${isAddingToThisCell ? 'plan-weeks-day-cell-adding' : ''}`}
                                  onDragOver={handleDragOver}
                                  onDragLeave={handleDragLeave}
                                  onDrop={(e) => handleDropOnCell(mod.id, dayIndex, e)}
                                >
                                  {session ? (
                                    <div className="plan-weeks-session-card-wrapper">
                                      <div
                                        className={`plan-weeks-session-card ${linked ? 'plan-weeks-session-card--linked' : 'plan-weeks-session-card--local'}`}
                                        style={session.image_url ? {
                                          backgroundImage: `linear-gradient(to bottom, rgba(26,26,26,0.55), rgba(26,26,26,0.85)), url(${session.image_url})`,
                                          backgroundSize: 'cover',
                                          backgroundPosition: 'center',
                                        } : undefined}
                                        draggable={!session._optimistic}
                                        onDragStart={!session._optimistic ? (e) => handleSessionDragStart(e, mod.id, session) : undefined}
                                        onMouseEnter={(e) => handleSessionHoverStart(session, e)}
                                        onMouseLeave={handleSessionHoverEnd}
                                      >
                                        <GlowingEffect spread={30} proximity={60} borderWidth={1} />
                                        <div className="plan-weeks-session-card-body">
                                          <div className="plan-weeks-session-card-top">
                                            <Tooltip label={linked ? 'Sesión compartida — al editar, los cambios se aplican en todos los planes que la usen.' : 'Copia local — los cambios solo aplican en esta semana.'} placement="top">
                                              <span className="plan-weeks-session-type-icon">
                                                {linked ? <IconLink /> : <IconLocal />}
                                              </span>
                                            </Tooltip>
                                          </div>
                                          <span className="plan-weeks-session-title">
                                            {session.title || `Sesión ${session.id?.slice(0, 8)}`}
                                          </span>
                                        </div>
                                        {!session._optimistic && (
                                          <div className="plan-weeks-session-card-menu" onClick={(e) => e.stopPropagation()}>
                                            <MenuDropdown
                                              trigger={
                                                <button type="button" className="plan-weeks-session-menu-btn" title="Más opciones" aria-label="Más opciones">
                                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke="currentColor" strokeWidth="2"/>
                                                    <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" stroke="currentColor" strokeWidth="2"/>
                                                    <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" stroke="currentColor" strokeWidth="2"/>
                                                  </svg>
                                                </button>
                                              }
                                              items={[
                                                { label: 'Editar', icon: <IconEdit />, onClick: () => onSessionClick ? onSessionClick(mod.id, session.id) : navigate(`/plans/${planId}/modules/${mod.id}/sessions/${session.id}`) },
                                                { divider: true },
                                                { label: 'Eliminar', icon: <IconDelete />, danger: true, onClick: () => setDeleteConfirmTarget({ type: 'session', mod, modIndex, session, moduleId: mod.id }) },
                                              ]}
                                            />
                                          </div>
                                        )}
                                        <div className={`plan-weeks-session-bar ${linked ? 'plan-weeks-session-bar--linked' : 'plan-weeks-session-bar--local'}`} />
                                      </div>
                                      {isAddingToThisCell && (
                                        <div className="plan-weeks-cell-adding-indicator" role="status" aria-live="polite">
                                          <span className="plan-weeks-cell-adding-spinner" aria-hidden />
                                          <span>Guardando...</span>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="plan-weeks-cell-add"
                                      onClick={() => handleAddSessionClick(mod.id, dayIndex)}
                                      title="Arrastra una sesión o haz clic para crear"
                                    >
                                      <span className="plan-weeks-cell-add-label">Arrastra o crea</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Skeleton for duplicating week */}
                  {duplicatingWeekModuleId === mod.id && (
                    <motion.div
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.42, ease: SPRING_EASE }}
                    >
                      <div className="plan-weeks-week-block plan-weeks-week-block--skeleton">
                        <div className="plan-weeks-week-header">
                          <ShimmerSkeleton width="90px" height="14px" borderRadius="4px" />
                        </div>
                        <div className="plan-weeks-week-days">
                          {DAYS.map((_, i) => (
                            <div key={i} className="plan-weeks-day-cell">
                              <ShimmerSkeleton width="100%" height="54px" borderRadius="8px" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}

            {/* Skeleton for adding week */}
            {isAddingWeek && (
              <motion.div
                key="adding-week-skeleton"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, ease: SPRING_EASE }}
              >
                <div className="plan-weeks-week-block plan-weeks-week-block--skeleton">
                  <div className="plan-weeks-week-header">
                    <ShimmerSkeleton width="90px" height="14px" borderRadius="4px" />
                  </div>
                  <div className="plan-weeks-week-days">
                    {DAYS.map((_, i) => (
                      <div key={i} className="plan-weeks-day-cell">
                        <ShimmerSkeleton width="100%" height="54px" borderRadius="8px" />
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* ── Delete confirmation ─────────────────────────────── */}
      <ConfirmDeleteModal
        isOpen={!!deleteConfirmTarget}
        onClose={() => setDeleteConfirmTarget(null)}
        onConfirm={handleConfirmDelete}
        itemName={
          deleteConfirmTarget?.type === 'week'
            ? `Semana ${(deleteConfirmTarget.modIndex ?? 0) + 1}`
            : (deleteConfirmTarget?.session?.title || 'Sesión')
        }
        title={deleteConfirmTarget?.type === 'week' ? '¿Eliminar semana?' : '¿Eliminar sesión?'}
        description={
          deleteConfirmTarget?.type === 'week'
            ? 'Se eliminará la semana y todas sus sesiones. Esta acción no se puede deshacer.'
            : 'Se eliminará esta sesión del plan. Esta acción no se puede deshacer.'
        }
        isDeleting={isDeleting}
      />

      {/* ── Move/Duplicate choice overlay ────────────────────── */}
      {dragMoveTarget && (
        <div className="cfo-overlay" onClick={() => setDragMoveTarget(null)}>
          <div className="cfo-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <GlowingEffect spread={40} borderWidth={1} />
            <div className="cfo-topbar">
              <div />
              <button type="button" className="cfo-close" onClick={() => setDragMoveTarget(null)} aria-label="Cerrar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="cfo-body">
              <div className="cfo-step" key="move-choice">
                <div className="cfo-step__header">
                  <h1 className="cfo-step__title">¿Mover o duplicar?</h1>
                  <p className="cfo-step__desc">¿Qué quieres hacer con <strong>{dragMoveTarget?.sourceSession?.title || 'esta sesión'}</strong>?</p>
                </div>
                <div className="cfo-step__content">
                  <div className="cfo-choice">
                    <button type="button" className="cfo-choice-card" onClick={handleMoveSession}>
                      <span className="cfo-choice-card__icon"><IconMove /></span>
                      <span className="cfo-choice-card__text">
                        <span className="cfo-choice-card__label">Mover aquí</span>
                        <span className="cfo-choice-card__desc">La sesión se mueve a esta posición</span>
                      </span>
                    </button>
                    <button type="button" className="cfo-choice-card" onClick={handleDuplicateSession}>
                      <span className="cfo-choice-card__icon"><IconDuplicate /></span>
                      <span className="cfo-choice-card__text">
                        <span className="cfo-choice-card__label">Duplicar aquí</span>
                        <span className="cfo-choice-card__desc">Se crea una copia en esta posición</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create session overlay (cfo experience) ────────── */}
      {showCreateSession && (
        <div className="cfo-overlay" onClick={(sessionStep === 'name' || sessionStep === 'location') ? () => setShowCreateSession(false) : undefined}>
          <div className="cfo-card" onClick={(e) => e.stopPropagation()}>
            <GlowingEffect spread={40} borderWidth={1} />

            <div className="cfo-topbar">
              {sessionStep === 'location' ? (
                <button type="button" className="cfo-back-btn" onClick={() => setSessionStep('name')} aria-label="Volver">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                </button>
              ) : <div />}
              {(sessionStep === 'name' || sessionStep === 'location') && (
                <button type="button" className="cfo-close" onClick={() => setShowCreateSession(false)} aria-label="Cerrar">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            <div className="cfo-body">
              {/* Step 1: Name */}
              {sessionStep === 'name' && (
                <div className="cfo-step" key="session-name">
                  <div className="cfo-step__header">
                    <h1 className="cfo-step__title">Nueva sesión</h1>
                    <p className="cfo-step__desc">Dale un nombre a tu sesión. Luego agregarás imagen y ejercicios.</p>
                  </div>
                  <div className="cfo-step__content">
                    <input
                      ref={sessionInputRef}
                      className="cfo-name-input"
                      type="text"
                      placeholder="Ej: Empuje día A, Pierna fuerza..."
                      value={newSessionName}
                      onChange={(e) => setNewSessionName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && newSessionName.trim()) setSessionStep('location'); }}
                      maxLength={80}
                    />
                  </div>
                  <div className="cfo-footer" style={{ justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="cfo-next-btn"
                      onClick={() => setSessionStep('location')}
                      disabled={!newSessionName.trim()}
                    >
                      Siguiente
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Save location */}
              {sessionStep === 'location' && (
                <div className="cfo-step" key="session-location">
                  <div className="cfo-step__header">
                    <h1 className="cfo-step__title">¿Dónde guardar?</h1>
                    <p className="cfo-step__desc">Elige si quieres reutilizar esta sesión en otros planes o mantenerla solo aquí.</p>
                  </div>
                  <div className="cfo-step__content">
                    <div className="cfo-choice">
                      <button
                        type="button"
                        className={`cfo-choice-card ${saveToLibrary ? 'cfo-choice-card--active' : ''}`}
                        onClick={() => setSaveToLibrary(true)}
                      >
                        <span className="cfo-choice-card__icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                          </svg>
                        </span>
                        <span className="cfo-choice-card__text">
                          <span className="cfo-choice-card__label">Guardar en biblioteca</span>
                          <span className="cfo-choice-card__desc">Reutilizable en otros planes</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`cfo-choice-card ${!saveToLibrary ? 'cfo-choice-card--active' : ''}`}
                        onClick={() => setSaveToLibrary(false)}
                      >
                        <span className="cfo-choice-card__icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>
                          </svg>
                        </span>
                        <span className="cfo-choice-card__text">
                          <span className="cfo-choice-card__label">Solo este plan</span>
                          <span className="cfo-choice-card__desc">No aparecerá en la biblioteca</span>
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="cfo-footer" style={{ justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="cfo-next-btn cfo-next-btn--final"
                      onClick={handleCreateSessionInGrid}
                    >
                      Crear sesión
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
              )}

              {sessionStep === 'creating' && (
                <div className="cfo-step cfo-step--center" key="session-creating">
                  <div className="cfo-spinner" />
                  <p className="cfo-status-text">Creando sesión</p>
                </div>
              )}

              {sessionStep === 'success' && (
                <div className="cfo-step cfo-step--center" key="session-success">
                  <div className="cfo-check-wrap">
                    <svg className="cfo-check-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <circle className="cfo-check-circle" cx="24" cy="24" r="22" stroke="rgba(74,222,128,0.8)" strokeWidth="2.5" />
                      <path className="cfo-check-path" d="M14 25l7 7 13-14" stroke="rgba(74,222,128,0.9)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 className="cfo-success-title">Sesión creada</h2>
                  <p className="cfo-success-desc">Agrega ejercicios y configura tus series.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Muscle heatmap popover ──────────────────────────── */}
      {heatmapData && createPortal(
        <div
          className="plan-weeks-heatmap-popover"
          style={{
            top: Math.max(8, (heatmapData.rect?.top ?? 0) - 160),
            left: Math.max(8, (heatmapData.rect?.left ?? 0) + ((heatmapData.rect?.width ?? 0) / 2) - 65),
          }}
        >
          {heatmapData.volumes && Object.keys(heatmapData.volumes).length > 0 ? (
            <MuscleSilhouetteSVG muscleVolumes={heatmapData.volumes} accentRgb={heatmapData.accentRgb} />
          ) : heatmapLoading ? (
            <div className="plan-weeks-heatmap-loading">
              <ShimmerSkeleton width="100px" height="120px" borderRadius="8px" />
            </div>
          ) : (
            <div className="plan-weeks-heatmap-empty">Sin datos</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default PlanWeeksGrid;
