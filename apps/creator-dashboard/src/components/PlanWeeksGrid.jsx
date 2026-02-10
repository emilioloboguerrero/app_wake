import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import MediaPickerModal from './MediaPickerModal';
import Input from './Input';
import { DRAG_TYPE_LIBRARY_SESSION } from './PlanStructureSidebar';
import './PlanWeeksGrid.css';

const DAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * Right-side grid: add-week button + rows = Semana 1..N, columns = Día 1..7.
 * Sessions use dayIndex (0-6) when set; otherwise fallback to order.
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
}) => {
  const navigate = useNavigate();
  const [isAddSessionModalOpen, setIsAddSessionModalOpen] = useState(false);
  const [addSessionModuleId, setAddSessionModuleId] = useState(null);
  const [addSessionDayIndex, setAddSessionDayIndex] = useState(0);
  const [newSessionName, setNewSessionName] = useState('');
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [sessionImagePreview, setSessionImagePreview] = useState(null);
  const [sessionImageUrlFromLibrary, setSessionImageUrlFromLibrary] = useState(null);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [openMenuSession, setOpenMenuSession] = useState(null); // { moduleId, sessionId }
  const [menuAnchorEl, setMenuAnchorEl] = useState(null); // DOM element for portal positioning
  const [openWeekMenu, setOpenWeekMenu] = useState(null); // moduleId
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null); // { type: 'week'|'session', mod, modIndex?, session?, moduleId? }

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

  const handleAddSessionClick = (moduleId, dayIndex) => {
    setAddSessionModuleId(moduleId);
    setAddSessionDayIndex(dayIndex);
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
    if (!planId || !onModulesChange || !plansService) return;
    const mods = await plansService.getModulesByPlan(planId);
    const withSessions = await Promise.all(
      mods.map(async (m) => {
        const sessions = await plansService.getSessionsByModule(planId, m.id);
        return { ...m, sessions };
      })
    );
    onModulesChange(withSessions);
  };

  const handleCreateSessionInGrid = async () => {
    if (!newSessionName.trim() || !addSessionModuleId || !planId || !plansService) return;
    try {
      setIsCreatingSession(true);
      let librarySessionRef = null;
      if (libraryService && creatorId) {
        const libSession = await libraryService.createLibrarySession(creatorId, {
          title: newSessionName.trim(),
          image_url: sessionImageUrlFromLibrary || null,
          showInLibrary: saveToLibrary,
        });
        librarySessionRef = libSession.id;
      }
      const created = await plansService.createSession(
        planId,
        addSessionModuleId,
        newSessionName.trim(),
        addSessionDayIndex,
        null,
        librarySessionRef,
        addSessionDayIndex
      );
      await refreshModules();
      setIsAddSessionModalOpen(false);
      setNewSessionName('');
      const modId = addSessionModuleId;
      const sessId = created?.id;
      setAddSessionModuleId(null);
      setAddSessionDayIndex(0);
      if (sessId) {
        navigate(`/plans/${planId}/modules/${modId}/sessions/${sessId}`, {
          state: { librarySessionRef: librarySessionRef || undefined },
        });
      }
    } catch (err) {
      alert(err.message || 'Error al crear la sesión');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleDropLibrarySession = async (moduleId, dayIndex, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('plan-weeks-cell-drag-over');
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type !== DRAG_TYPE_LIBRARY_SESSION || !data.librarySessionRef) return;
      const libSession = await libraryService?.getLibrarySessionById?.(creatorId, data.librarySessionRef);
      const title = libSession?.title || data.title || 'Sesión';
      await plansService.createSession(
        planId,
        moduleId,
        title,
        dayIndex,
        null,
        data.librarySessionRef,
        dayIndex
      );
      await refreshModules();
    } catch (err) {
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
    setDeleteConfirmTarget(null);
    try {
      if (type === 'week') {
        await plansService.deleteModule(planId, mod.id);
        onDeleteWeek?.();
      } else if (type === 'session' && session && moduleId) {
        setOpenMenuSession(null);
        setMenuAnchorEl(null);
        await plansService.deleteSession(planId, moduleId, session.id);
      }
      await refreshModules();
    } catch (err) {
      alert(err.message || (type === 'week' ? 'Error al eliminar la semana' : 'Error al eliminar la sesión'));
    }
  };

  const handleEditSession = (moduleId, sessionId) => {
    setOpenMenuSession(null);
    setMenuAnchorEl(null);
    if (onSessionClick) onSessionClick(moduleId, sessionId);
    else navigate(`/plans/${planId}/modules/${moduleId}/sessions/${sessionId}`);
  };

  const handleDeleteSessionClick = (moduleId, session) => {
    const mod = modules.find((m) => m.id === moduleId);
    const modIndex = modules.findIndex((m) => m.id === moduleId);
    setOpenMenuSession(null);
    setMenuAnchorEl(null);
    setDeleteConfirmTarget({ type: 'session', mod, modIndex, session, moduleId });
  };

  const getSessionForDay = (module, dayIndex) => {
    const sessions = module.sessions || [];
    return sessions.find((s) => s.dayIndex === dayIndex) || null;
  };

  return (
    <div className="plan-weeks-grid">
      <div className="plan-weeks-grid-header">
        <button type="button" className="plan-weeks-add-week-btn" onClick={onAddWeek}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Añadir semana
        </button>
      </div>

      <div className="plan-weeks-list-wrap">
        {modules.length > 0 && (
          <div className="plan-weeks-days-header">
            {DAYS.map((d) => (
              <div key={d} className="plan-weeks-days-header-cell">Día {d}</div>
            ))}
          </div>
        )}
        {modules.length === 0 ? (
          <div className="plan-weeks-empty">No hay semanas. Pulsa «Añadir semana» para crear la primera.</div>
        ) : (
          modules.map((mod, modIndex) => (
            <div key={mod.id} className="plan-weeks-week-block">
              <div className="plan-weeks-week-header">
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
                {DAYS.map((_, dayIndex) => {
                  const session = getSessionForDay(mod, dayIndex);
                  const isEmpty = !session;
                  return (
                    <div
                      key={dayIndex}
                      className="plan-weeks-day-cell"
                      onDragOver={isEmpty ? handleDragOver : undefined}
                      onDragLeave={isEmpty ? handleDragLeave : undefined}
                      onDrop={isEmpty ? (e) => handleDropLibrarySession(mod.id, dayIndex, e) : undefined}
                    >
                      {session ? (
                          <div className="plan-weeks-session-card">
                            <div className="plan-weeks-session-card-body">
                              <span className="plan-weeks-session-title">
                                {session.title || `Sesión ${session.id?.slice(0, 8)}`}
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
                            onClick={() => handleAddSessionClick(mod.id, dayIndex)}
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
              : `¿Eliminar "${deleteConfirmTarget?.session?.title || `Sesión ${deleteConfirmTarget?.session?.id?.slice(0, 8)}`}"? Esta acción no se puede deshacer.`}
          </p>
          <div className="plan-weeks-delete-modal-actions">
            <button
              type="button"
              className="plan-btn plan-btn--secondary"
              onClick={() => setDeleteConfirmTarget(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="plan-btn plan-btn--danger"
              onClick={handleConfirmDelete}
            >
              Eliminar
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
        <div className="plan-weeks-modal-body">
          <div className="plan-weeks-modal-field">
            <label>Nombre de la sesión <span className="plan-weeks-modal-required">*</span></label>
            <Input
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Ej: Día 1 - Fuerza"
              light
            />
          </div>
          <div className="plan-weeks-modal-field">
            <label>
              Imagen de la sesión
              <span className="plan-weeks-modal-recommended-tag">Altamente recomendado</span>
            </label>
            {sessionImagePreview ? (
              <div className="plan-weeks-image-preview-wrap">
                <img src={sessionImagePreview} alt="Sesión" className="plan-weeks-image-preview" />
                <div className="plan-weeks-image-actions">
                  <button type="button" className="plan-weeks-image-btn" onClick={() => setIsMediaPickerOpen(true)}>Cambiar</button>
                  <button type="button" className="plan-weeks-image-btn plan-weeks-image-btn--remove" onClick={() => { setSessionImagePreview(null); setSessionImageUrlFromLibrary(null); }}>Quitar</button>
                </div>
              </div>
            ) : (
              <button type="button" className="plan-weeks-image-upload-area" onClick={() => setIsMediaPickerOpen(true)}>
                <span className="plan-weeks-image-upload-icon">+</span>
                <span>Elegir imagen</span>
              </button>
            )}
          </div>
          <div className="plan-weeks-modal-field">
            <label>¿Dónde guardar?</label>
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
                <span className="plan-weeks-save-option-title">Solo este plan</span>
                <span className="plan-weeks-save-option-desc">No aparecerá en la biblioteca</span>
              </button>
            </div>
          </div>
          <div className="plan-weeks-modal-actions">
            <button
              type="button"
              className="plan-btn plan-btn--secondary"
              onClick={() => setIsAddSessionModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="plan-btn plan-btn--primary"
              onClick={handleCreateSessionInGrid}
              disabled={!newSessionName.trim() || isCreatingSession}
            >
              {isCreatingSession ? 'Creando...' : 'Crear y editar'}
            </button>
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

export default PlanWeeksGrid;
