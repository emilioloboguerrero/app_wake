import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';
import MediaPickerModal from './MediaPickerModal';
import Input from './Input';
import Button from './Button';
import { DRAG_TYPE_LIBRARY_SESSION, DRAG_TYPE_PLAN } from './PlanningLibrarySidebar';
import programService from '../services/programService';
import '../screens/ProgramDetailScreen.css';
import './PlanWeeksGrid.css';

const SLOTS = [1, 2, 3, 4, 5, 6, 7];
const DRAG_TYPE_PROGRAM_SESSION = 'program-session';

function arrayMove(arr, fromIndex, toIndex) {
  const a = [...arr];
  const [removed] = a.splice(fromIndex, 1);
  a.splice(toIndex, 0, removed);
  return a;
}

/**
 * Weeks grid for low-ticket program content: rows = weeks (modules), columns = position 1-7.
 * Sessions: slot = position in sorted order (old format) or order 0-6 (new). Plan drop assigns plan to week(s).
 */
const ProgramWeeksGrid = ({
  programId,
  modules = [],
  onAddWeek,
  onDeleteWeek,
  onModulesChange,
  onSessionClick,
  onOpenWeekVolume,
  libraryService = null,
  plansService = null,
  creatorId = null,
  isAddingWeek = false,
  queryClient = null,
  queryKeys = null,
}) => {
  const [isAddSessionModalOpen, setIsAddSessionModalOpen] = useState(false);
  const [addSessionModuleId, setAddSessionModuleId] = useState(null);
  const [addSessionSlotIndex, setAddSessionSlotIndex] = useState(0);
  const [newSessionName, setNewSessionName] = useState('');
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [sessionImagePreview, setSessionImagePreview] = useState(null);
  const [sessionImageUrlFromLibrary, setSessionImageUrlFromLibrary] = useState(null);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [openMenuSession, setOpenMenuSession] = useState(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [openWeekMenu, setOpenWeekMenu] = useState(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAssigningPlan, setIsAssigningPlan] = useState(false);
  const [isMovingOrAddingItem, setIsMovingOrAddingItem] = useState(false);
  const [isDraggingSession, setIsDraggingSession] = useState(false);
  const [dragOverWeekId, setDragOverWeekId] = useState(null);
  const [dragOverBelow, setDragOverBelow] = useState(false);

  useEffect(() => {
    if (!openMenuSession) return;
    const closeMenu = () => {
      setOpenMenuSession(null);
      setMenuAnchorEl(null);
    };
    const t = setTimeout(() => document.addEventListener('click', closeMenu), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', closeMenu);
    };
  }, [openMenuSession]);

  useEffect(() => {
    if (!openWeekMenu) return;
    const closeMenu = () => setOpenWeekMenu(null);
    const t = setTimeout(() => document.addEventListener('click', closeMenu), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', closeMenu);
    };
  }, [openWeekMenu]);

  const handleAddSessionClick = (moduleId, slotIndex) => {
    setAddSessionModuleId(moduleId);
    setAddSessionSlotIndex(slotIndex);
    setNewSessionName('');
    setSaveToLibrary(true);
    setSessionImagePreview(null);
    setSessionImageUrlFromLibrary(null);
    setIsAddSessionModalOpen(true);
  };

  const handleMediaPickerSelect = (item) => {
    setSessionImagePreview(item.url);
    setSessionImageUrlFromLibrary(item.url);
    setIsMediaPickerOpen(false);
  };

  const refreshModules = async () => {
    if (!programId) return;
    try {
      const mods = await programService.getModulesByProgram(programId);
      onModulesChange?.(mods);
      if (queryClient && queryKeys) {
        queryClient.invalidateQueries({ queryKey: queryKeys.modules.all(programId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.modules.withCounts(programId) });
        await queryClient.refetchQueries({ queryKey: queryKeys.modules.all(programId) });
      }
    } catch (err) {
      console.error('Error refreshing program modules:', err);
    }
  };

  const handleCreateSessionInGrid = async () => {
    if (!newSessionName.trim() || !addSessionModuleId || !programId) return;
    try {
      setIsCreatingSession(true);
      let librarySessionRef = null;
      let libSession = null;
      if (libraryService && creatorId) {
        libSession = await libraryService.createLibrarySession(creatorId, {
          title: newSessionName.trim(),
          image_url: sessionImageUrlFromLibrary || null,
          showInLibrary: saveToLibrary,
        });
        librarySessionRef = libSession.id;
      }
      const imageUrl = sessionImageUrlFromLibrary || libSession?.image_url || null;
      const created = await programService.createSession(
        programId,
        addSessionModuleId,
        newSessionName.trim(),
        null,
        imageUrl,
        librarySessionRef
      );
      const modId = addSessionModuleId;
      const newSessionId = created?.id;
      if (newSessionId && addSessionSlotIndex >= 0 && addSessionSlotIndex <= 6) {
        await programService.updateSessionOrder(programId, modId, [
          { sessionId: newSessionId, order: addSessionSlotIndex },
        ]);
      }
      setAddSessionModuleId(null);
      setAddSessionSlotIndex(0);
      setIsAddSessionModalOpen(false);
      setNewSessionName('');
      await refreshModules();
      await new Promise((r) => setTimeout(r, 0));
      if (onSessionClick && newSessionId) {
        const mods = await programService.getModulesByProgram(programId);
        const modAgain = mods.find((m) => m.id === modId);
        const sess = modAgain?.sessions?.find((s) => s.id === newSessionId);
        if (modAgain && sess) onSessionClick(modAgain, sess);
      }
    } catch (err) {
      alert(err.message || 'Error al crear la sesión');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleDropLibrarySession = async (moduleId, slotIndex, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('plan-weeks-cell-drag-over');
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type !== DRAG_TYPE_LIBRARY_SESSION || !data.librarySessionRef) return;
      setIsMovingOrAddingItem(true);
      try {
        const libSession = await libraryService?.getLibrarySessionById?.(creatorId, data.librarySessionRef);
        const title = libSession?.title || data.title || 'Sesión';
        const imageUrl = libSession?.image_url ?? null;
        const created = await programService.createSession(
          programId,
          moduleId,
          title,
          null,
          imageUrl,
          data.librarySessionRef
        );
        if (created?.id && slotIndex >= 0 && slotIndex <= 6) {
          await programService.updateSessionOrder(programId, moduleId, [
            { sessionId: created.id, order: slotIndex },
          ]);
        }
        await refreshModules();
        await new Promise((r) => setTimeout(r, 0));
      } finally {
        setIsMovingOrAddingItem(false);
      }
    } catch (err) {
      setIsMovingOrAddingItem(false);
      alert(err.message || 'Error al asignar la sesión');
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

  const handleDeleteWeekClick = (mod, modIndex) => {
    setOpenWeekMenu(null);
    setDeleteConfirmTarget({ type: 'week', mod, modIndex });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    const { type, mod, modIndex, session, moduleId } = deleteConfirmTarget;
    setIsDeleting(true);
    try {
      if (type === 'week') {
        await programService.deleteModule(programId, mod.id);
        onDeleteWeek?.();
      } else if (type === 'session' && session && moduleId) {
        setOpenMenuSession(null);
        setMenuAnchorEl(null);
        await programService.deleteSession(programId, moduleId, session.id);
      }
      await refreshModules();
      setDeleteConfirmTarget(null);
    } catch (err) {
      alert(err.message || (type === 'week' ? 'Error al eliminar la semana' : 'Error al eliminar la sesión'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSession = (moduleId, sessionId) => {
    console.log('[ProgramWeeksGrid] handleEditSession called', { moduleId, sessionId, modulesCount: modules?.length, hasOnSessionClick: !!onSessionClick });
    setOpenMenuSession(null);
    setMenuAnchorEl(null);
    const mod = modules.find((m) => m.id === moduleId);
    const session = mod?.sessions?.find((s) => s.id === sessionId);
    console.log('[ProgramWeeksGrid] handleEditSession resolved', {
      foundMod: !!mod,
      modId: mod?.id,
      sessionsInMod: mod?.sessions?.length ?? 0,
      foundSession: !!session,
      sessionId: session?.id,
      sessionTitle: session?.title || session?.name,
      sessionLibraryRef: session?.librarySessionRef,
    });
    if (onSessionClick && mod && session) {
      console.log('[ProgramWeeksGrid] handleEditSession: calling onSessionClick(mod, session)');
      onSessionClick(mod, session);
    } else {
      console.warn('[ProgramWeeksGrid] handleEditSession: NOT calling onSessionClick', {
        hasOnSessionClick: !!onSessionClick,
        hasMod: !!mod,
        hasSession: !!session,
      });
    }
  };

  const handleDeleteSessionClick = (moduleId, session) => {
    const mod = modules.find((m) => m.id === moduleId);
    const modIndex = modules.findIndex((m) => m.id === moduleId);
    setOpenMenuSession(null);
    setMenuAnchorEl(null);
    setDeleteConfirmTarget({ type: 'session', mod, modIndex, session, moduleId });
  };

  // Slot = day index (0-6). Each session has order = the day it's on; empty days have no session.
  const getSessionForSlot = (module, slotIndex) => {
    const sessions = module?.sessions || [];
    const orderVal = slotIndex >= 0 && slotIndex <= 6 ? slotIndex : 99;
    return sessions.find((s) => (s.order !== undefined && s.order !== null ? s.order : 99) === orderVal) ?? null;
  };

  const getSortedSessionsForModule = (module) => {
    return (module?.sessions || []).slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  };

  const handleDropReorderSession = async (moduleId, toSlotIndex, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('plan-weeks-cell-drag-over');
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type !== DRAG_TYPE_PROGRAM_SESSION || data.moduleId !== moduleId) return;
      const fromSlotIndex = data.fromSlotIndex;
      if (fromSlotIndex === toSlotIndex) return;
      if (fromSlotIndex < 0 || fromSlotIndex > 6 || toSlotIndex < 0 || toSlotIndex > 6) return;
      const mod = modules.find((m) => m.id === moduleId);
      if (!mod) return;
      const movedSession = getSessionForSlot(mod, fromSlotIndex);
      if (!movedSession) return;
      const sessionAtTarget = getSessionForSlot(mod, toSlotIndex);
      setIsMovingOrAddingItem(true);
      try {
        const sessionOrders = [{ sessionId: movedSession.id, order: toSlotIndex }];
        if (sessionAtTarget) sessionOrders.push({ sessionId: sessionAtTarget.id, order: fromSlotIndex });
        await programService.updateSessionOrder(programId, moduleId, sessionOrders);
        await refreshModules();
        await new Promise((r) => setTimeout(r, 0));
      } finally {
        setIsMovingOrAddingItem(false);
      }
    } catch (err) {
      setIsMovingOrAddingItem(false);
      console.warn('Session reorder failed:', err);
      alert(err?.message || 'Error al cambiar el orden');
    }
  };

  const handleDropMoveSessionToWeek = async (toModuleId, toSlotIndex, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('plan-weeks-cell-drag-over');
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type !== DRAG_TYPE_PROGRAM_SESSION || !data.moduleId || !data.sessionId) return;
      const fromModuleId = data.moduleId;
      if (fromModuleId === toModuleId) return;
      if (toSlotIndex < 0 || toSlotIndex > 6) return;
      const sessionAtTarget = getSessionForSlot(modules.find((m) => m.id === toModuleId), toSlotIndex);
      if (sessionAtTarget) {
        alert('Ese día ya tiene una sesión. Mueve o elimina esa sesión primero.');
        return;
      }
      setIsMovingOrAddingItem(true);
      try {
        await programService.moveSession(programId, fromModuleId, toModuleId, data.sessionId, toSlotIndex);
        await refreshModules();
        await new Promise((r) => setTimeout(r, 0));
      } finally {
        setIsMovingOrAddingItem(false);
      }
    } catch (err) {
      setIsMovingOrAddingItem(false);
      console.warn('Move session to week failed:', err);
      alert(err?.message || 'Error al mover la sesión');
    }
  };

  const copyPlanModuleIntoProgramModule = async (planId, planModule, programModuleId, clearExisting = false) => {
    if (clearExisting) {
      const programModule = modules.find((m) => m.id === programModuleId);
      const sessionsToDelete = (programModule?.sessions || []).slice();
      for (const sess of sessionsToDelete) {
        try {
          await programService.deleteSession(programId, programModuleId, sess.id);
        } catch (_) {}
      }
    }
    const planSessions = await plansService.getSessionsByModule(planId, planModule.id);
    for (let slot = 0; slot < Math.min(planSessions.length, 7); slot++) {
      const ps = planSessions[slot];
      const order = ps.dayIndex != null ? ps.dayIndex : (ps.order != null ? ps.order : slot);
      let title = ps.title || ps.name || 'Sesión';
      let imageUrl = ps.image_url ?? null;
      if (ps.librarySessionRef && libraryService && creatorId) {
        try {
          const lib = await libraryService.getLibrarySessionById(creatorId, ps.librarySessionRef);
          if (lib) {
            title = lib.title || lib.name || title;
            imageUrl = imageUrl ?? lib.image_url ?? null;
          }
        } catch (_) {}
      }
      await programService.createSession(
        programId,
        programModuleId,
        title,
        order,
        imageUrl,
        ps.librarySessionRef || null
      );
    }
  };

  const handleDropPlan = async (planId, targetModuleId, targetModIndex) => {
    if (!programId || !plansService) return;
    setIsAssigningPlan(true);
    try {
      const planModules = await plansService.getModulesByPlan(planId);
      if (!planModules?.length) {
        alert('El plan no tiene semanas.');
        return;
      }
      if (targetModuleId != null && targetModIndex != null) {
        await copyPlanModuleIntoProgramModule(planId, planModules[0], targetModuleId, true);
        for (let i = 1; i < planModules.length; i++) {
          const newMod = await programService.createModule(
            programId,
            planModules[i].title || `Semana ${(modules?.length ?? 0) + i + 1}`,
            null
          );
          await copyPlanModuleIntoProgramModule(planId, planModules[i], newMod.id, false);
        }
      } else {
        for (let i = 0; i < planModules.length; i++) {
          const newMod = await programService.createModule(
            programId,
            planModules[i].title || `Semana ${(modules?.length ?? 0) + i + 1}`,
            null
          );
          await copyPlanModuleIntoProgramModule(planId, planModules[i], newMod.id, false);
        }
      }
      await refreshModules();
      await new Promise((r) => setTimeout(r, 0));
    } catch (err) {
      alert(err?.message || 'Error al asignar el plan');
    } finally {
      setIsAssigningPlan(false);
      setDragOverWeekId(null);
      setDragOverBelow(false);
    }
  };

  const handleDropOnWeekHeader = (e, mod, modIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverWeekId(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === DRAG_TYPE_PLAN && data.planId) {
        handleDropPlan(data.planId, mod.id, modIndex);
      }
    } catch (_) {}
  };

  const handleDropBelow = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverBelow(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === DRAG_TYPE_PLAN && data.planId) {
        handleDropPlan(data.planId, null, null);
      }
    } catch (_) {}
  };

  const handleDragOverWeek = (e, moduleId) => {
    e.preventDefault();
    e.stopPropagation();
    const data = e.dataTransfer.types.includes('application/json') ? (() => {
      try {
        return JSON.parse(e.dataTransfer.getData('application/json'));
      } catch { return {}; }
    })() : {};
    if (data.type === DRAG_TYPE_PLAN) {
      e.dataTransfer.dropEffect = 'copy';
      setDragOverWeekId(moduleId);
    }
  };

  const handleDragOverBelow = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const data = e.dataTransfer.types.includes('application/json') ? (() => {
      try {
        return JSON.parse(e.dataTransfer.getData('application/json'));
      } catch { return {}; }
    })() : {};
    if (data.type === DRAG_TYPE_PLAN) {
      e.dataTransfer.dropEffect = 'copy';
      setDragOverBelow(true);
    }
  };

  const handleDragLeaveWeek = () => {
    setDragOverWeekId(null);
    setDragOverBelow(false);
  };

  const overlayMessage = isAssigningPlan
    ? 'Asignando plan...'
    : isCreatingSession
      ? 'Añadiendo sesión...'
      : isMovingOrAddingItem
        ? 'Moviendo sesión...'
        : null;

  return (
    <div className="plan-weeks-grid">
      {overlayMessage && (
        <div className="plan-weeks-grid-overlay" aria-busy aria-live="polite">
          <span className="plan-weeks-grid-overlay-spinner" aria-hidden />
          <span className="plan-weeks-grid-overlay-text">{overlayMessage}</span>
        </div>
      )}
      {isDraggingSession && (
        <div className="plan-weeks-drag-hint" role="status" aria-live="polite">
          Suelta en un día para cambiar el orden
        </div>
      )}
      <div className="plan-weeks-grid-header">
        {onOpenWeekVolume && (
          <button
            type="button"
            className="plan-weeks-volume-btn"
            onClick={onOpenWeekVolume}
            disabled={modules.length === 0}
            title="Ver volumen por músculo de la semana"
            aria-label="Volumen"
          >
            <svg className="plan-weeks-volume-btn-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12M12 3C16.9706 3 21 7.02944 21 12M12 3V12M21 12H12M18 18.5L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Volumen
          </button>
        )}
        <button type="button" className="plan-weeks-add-week-btn" onClick={onAddWeek} disabled={isAddingWeek}>
          {isAddingWeek ? (
            <>
              <span className="plan-weeks-add-week-spinner" aria-hidden />
              Añadiendo...
            </>
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

      <div className="plan-weeks-list-wrap">
        {modules.length > 0 && (
          <div className="plan-weeks-days-header">
            {SLOTS.map((d) => (
              <div key={d} className="plan-weeks-days-header-cell">Día {d}</div>
            ))}
          </div>
        )}
        {modules.length === 0 ? (
          <div className="plan-weeks-empty">No hay semanas. Pulsa «Añadir semana» para crear la primera.</div>
        ) : (
          modules.map((mod, modIndex) => (
            <div key={mod.id} className="plan-weeks-week-block">
              <div
                className={`plan-weeks-week-header ${dragOverWeekId === mod.id ? 'plan-weeks-week-header--drag-over' : ''}`}
                onDragOver={(e) => handleDragOverWeek(e, mod.id)}
                onDragLeave={handleDragLeaveWeek}
                onDrop={(e) => handleDropOnWeekHeader(e, mod, modIndex)}
              >
                <span className="plan-weeks-week-title">Semana {modIndex + 1}</span>
                <div className="plan-weeks-week-menu-wrap">
                  <button
                    type="button"
                    className="plan-weeks-week-menu-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setOpenWeekMenu(openWeekMenu === mod.id ? null : mod.id);
                    }}
                    title="Opciones de semana"
                    aria-label="Opciones de semana"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </button>
                  {openWeekMenu === mod.id && (
                    <div className="plan-weeks-week-menu" role="menu">
                      <button
                        type="button"
                        className="plan-weeks-session-menu-item plan-weeks-week-menu-item-delete"
                        onClick={() => handleDeleteWeekClick(mod, modIndex)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="plan-weeks-week-days">
                {SLOTS.map((_, slotIndex) => {
                  const session = getSessionForSlot(mod, slotIndex);
                  const isEmpty = !session;
                  const handleCellDrop = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.classList.remove('plan-weeks-cell-drag-over');
                    try {
                      const data = JSON.parse(e.dataTransfer.getData('application/json'));
                      if (data.type === DRAG_TYPE_PLAN && data.planId) {
                        handleDropPlan(data.planId, mod.id, modIndex);
                        return;
                      }
                      if (data.type === DRAG_TYPE_PROGRAM_SESSION) {
                        if (data.moduleId === mod.id) {
                          handleDropReorderSession(mod.id, slotIndex, e);
                        } else {
                          handleDropMoveSessionToWeek(mod.id, slotIndex, e);
                        }
                        return;
                      }
                      if (data.type === DRAG_TYPE_LIBRARY_SESSION && data.librarySessionRef && isEmpty) {
                        handleDropLibrarySession(mod.id, slotIndex, e);
                      }
                    } catch (_) {}
                  };
                  const handleCellDragOver = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const data = e.dataTransfer.types.includes('application/json') ? (() => {
                      try { return JSON.parse(e.dataTransfer.getData('application/json')); } catch { return {}; }
                    })() : {};
                    if (data.type === DRAG_TYPE_PLAN) {
                      e.dataTransfer.dropEffect = 'copy';
                      setDragOverWeekId(mod.id);
                    } else if (isEmpty && data.type === DRAG_TYPE_LIBRARY_SESSION) {
                      handleDragOver(e);
                    } else if (data.type === DRAG_TYPE_PROGRAM_SESSION) {
                      e.dataTransfer.dropEffect = 'move';
                      e.currentTarget.classList.add('plan-weeks-cell-drag-over');
                    }
                  };
                  return (
                    <div
                      key={slotIndex}
                      className="plan-weeks-day-cell"
                      onDragOver={handleCellDragOver}
                      onDragLeave={(e) => {
                    handleDragLeave(e);
                    setDragOverWeekId(null);
                  }}
                      onDrop={handleCellDrop}
                    >
                      {session ? (
                        <div className="plan-weeks-session-card">
                          <div
                            className="plan-weeks-session-card-body"
                            draggable
                            onDragStart={(e) => {
                              setIsDraggingSession(true);
                              e.dataTransfer.setData('application/json', JSON.stringify({
                                type: DRAG_TYPE_PROGRAM_SESSION,
                                moduleId: mod.id,
                                sessionId: session.id,
                                fromSlotIndex: slotIndex,
                              }));
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => setIsDraggingSession(false)}
                            title="Arrastra para cambiar orden"
                          >
                            <span className="plan-weeks-session-title">
                              {session.title || session.name || `Sesión ${session.id?.slice(0, 8)}`}
                            </span>
                          </div>
                          <div className="plan-weeks-session-card-menu">
                            <button
                              type="button"
                              className="plan-weeks-session-menu-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const isOpen = openMenuSession?.moduleId === mod.id && openMenuSession?.sessionId === session.id;
                                if (isOpen) {
                                  setOpenMenuSession(null);
                                  setMenuAnchorEl(null);
                                } else {
                                  setOpenMenuSession({ moduleId: mod.id, sessionId: session.id });
                                  setMenuAnchorEl(e.currentTarget);
                                }
                              }}
                              title="Más opciones"
                              aria-label="Más opciones"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke="currentColor" strokeWidth="2"/>
                                <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" stroke="currentColor" strokeWidth="2"/>
                                <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" stroke="currentColor" strokeWidth="2"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="plan-weeks-cell-add"
                          onClick={() => handleAddSessionClick(mod.id, slotIndex)}
                          title="Añadir sesión o arrastrar desde la biblioteca"
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {modules.length > 0 && (
          <div
            className={`plan-weeks-drop-below ${dragOverBelow ? 'plan-weeks-drop-below--drag-over' : ''}`}
            onDragOver={handleDragOverBelow}
            onDragLeave={handleDragLeaveWeek}
            onDrop={handleDropBelow}
          >
            Arrastra un plan aquí para añadir sus semanas
          </div>
        )}
      </div>

      {openMenuSession && menuAnchorEl && (() => {
        const rect = menuAnchorEl.getBoundingClientRect();
        const menuWidth = 120;
        const menuStyle = {
          top: rect.bottom + 2,
          left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
        };
        if (menuStyle.left < 8) menuStyle.left = 8;
        const mod = modules.find((m) => m.id === openMenuSession.moduleId);
        const session = mod?.sessions?.find((s) => s.id === openMenuSession.sessionId);
        if (!session) return null;
        return createPortal(
          <div
            className="plan-weeks-session-menu-portal"
            style={menuStyle}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="plan-weeks-session-menu-item"
              onClick={() => handleEditSession(openMenuSession.moduleId, openMenuSession.sessionId)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18.5 2.50023C18.8978 2.1024 19.4374 1.87891 20 1.87891C20.5626 1.87891 21.1022 2.1024 21.5 2.50023C21.8978 2.89805 22.1213 3.43762 22.1213 4.00023C22.1213 4.56284 21.8978 5.1024 21.5 5.50023L12 15.0002L8 16.0002L9 12.0002L18.5 2.50023Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Editar
            </button>
            <button
              type="button"
              className="plan-weeks-session-menu-item plan-weeks-week-menu-item-delete"
              onClick={() => handleDeleteSessionClick(openMenuSession.moduleId, session)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Eliminar
            </button>
          </div>,
          document.body
        );
      })()}

      <Modal
        isOpen={!!deleteConfirmTarget}
        onClose={() => setDeleteConfirmTarget(null)}
        title={
          deleteConfirmTarget?.type === 'week'
            ? 'Eliminar semana'
            : 'Eliminar sesión'
        }
      >
        <div className="plan-weeks-delete-modal-body">
          <p className="plan-weeks-delete-modal-message">
            {deleteConfirmTarget?.type === 'week'
              ? `¿Eliminar "${deleteConfirmTarget?.modIndex != null ? `Semana ${deleteConfirmTarget.modIndex + 1}` : (deleteConfirmTarget?.mod?.title || 'Semana')}" y todas sus sesiones? Esta acción no se puede deshacer.`
              : `¿Eliminar "${deleteConfirmTarget?.session?.title || deleteConfirmTarget?.session?.name || `Sesión ${deleteConfirmTarget?.session?.id?.slice(0, 8)}`}"? Esta acción no se puede deshacer.`}
          </p>
          <div className="plan-weeks-delete-modal-actions">
            <button
              type="button"
              className="plan-btn plan-btn--secondary"
              onClick={() => setDeleteConfirmTarget(null)}
              disabled={isDeleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="plan-btn plan-btn--danger"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isAddSessionModalOpen}
        onClose={() => {
          setIsAddSessionModalOpen(false);
          setNewSessionName('');
          setSaveToLibrary(true);
          setSessionImagePreview(null);
          setSessionImageUrlFromLibrary(null);
        }}
        title="Nueva sesión"
      >
        <div className="edit-program-modal-content">
          <div className="edit-program-modal-body">
            <div className="edit-program-modal-left">
              <div className="edit-program-input-group">
                <label className="edit-program-input-label">Nombre de la sesión <span className="plan-weeks-modal-required">*</span></label>
                <Input
                  placeholder="Ej: Día 1 - Fuerza"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  type="text"
                  light={true}
                />
              </div>
              <div className="edit-program-input-group">
                <label className="edit-program-input-label">¿Dónde guardar?</label>
                <div className="plan-weeks-save-options">
                  <button
                    type="button"
                    className={`plan-weeks-save-option ${saveToLibrary ? 'plan-weeks-save-option--selected' : ''}`}
                    onClick={() => setSaveToLibrary(true)}
                  >
                    <span className="plan-weeks-save-option-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                        <path d="M8 7h8"/>
                        <path d="M8 11h8"/>
                      </svg>
                    </span>
                    <span className="plan-weeks-save-option-title">Biblioteca</span>
                    <span className="plan-weeks-save-option-desc">Reutilizable en otros planes</span>
                  </button>
                  <button
                    type="button"
                    className={`plan-weeks-save-option ${!saveToLibrary ? 'plan-weeks-save-option--selected' : ''}`}
                    onClick={() => setSaveToLibrary(false)}
                  >
                    <span className="plan-weeks-save-option-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2"/>
                        <path d="M3 10h18"/>
                        <path d="M10 3v7"/>
                      </svg>
                    </span>
                    <span className="plan-weeks-save-option-title">Solo este programa</span>
                    <span className="plan-weeks-save-option-desc">No aparecerá en la biblioteca</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="edit-program-modal-right">
              <div className="edit-program-image-section">
                {sessionImagePreview ? (
                  <div className="edit-program-image-container">
                    <img src={sessionImagePreview} alt="Sesión" className="edit-program-image" />
                    <div className="edit-program-image-overlay">
                      <div className="edit-program-image-actions">
                        <button type="button" className="edit-program-image-action-pill" onClick={() => setIsMediaPickerOpen(true)}>
                          <span className="edit-program-image-action-text">Cambiar</span>
                        </button>
                        <button
                          type="button"
                          className="edit-program-image-action-pill edit-program-image-delete-pill"
                          onClick={() => { setSessionImagePreview(null); setSessionImageUrlFromLibrary(null); }}
                          disabled={isCreatingSession}
                        >
                          <span className="edit-program-image-action-text">Eliminar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="edit-program-no-image">
                    <p>No hay imagen disponible</p>
                    <button type="button" className="edit-program-image-upload-button" onClick={() => setIsMediaPickerOpen(true)}>
                      Subir Imagen
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="edit-program-modal-actions plan-weeks-add-session-actions">
            <button
              type="button"
              className="cancel-button-onboarding"
              onClick={() => {
                setIsAddSessionModalOpen(false);
                setNewSessionName('');
                setSaveToLibrary(true);
                setSessionImagePreview(null);
                setSessionImageUrlFromLibrary(null);
              }}
            >
              <span className="cancel-button-onboarding-text">Cancelar</span>
            </button>
            <Button
              title={isCreatingSession ? 'Creando...' : 'Crear y editar'}
              onClick={handleCreateSessionInGrid}
              disabled={!newSessionName.trim() || isCreatingSession}
              loading={isCreatingSession}
            />
          </div>
        </div>
      </Modal>
      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelect={handleMediaPickerSelect}
        creatorId={creatorId}
        accept="image/*"
      />
    </div>
  );
};

export default ProgramWeeksGrid;
