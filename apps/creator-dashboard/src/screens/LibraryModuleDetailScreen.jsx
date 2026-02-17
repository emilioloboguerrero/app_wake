import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import libraryService from '../services/libraryService';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './LibrarySessionDetailScreen.css';

// Drop Zone Component
const DropZone = ({ id, children, className }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? 'dropzone-active' : ''}`}
    >
      {children}
    </div>
  );
};

// Draggable Session Item Component
const DraggableSession = ({ session, isInModule = false, onDelete, isEditMode, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: session.dragId || session.id,
    data: { session }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`draggable-exercise ${isDragging ? 'dragging' : ''} ${isInModule ? 'exercise-in-session' : 'exercise-available'}`}
      {...attributes}
      {...listeners}
      onClick={onClick && !isEditMode ? () => onClick(session) : undefined}
    >
      <div className="draggable-exercise-content">
        {session.image_url ? (
          <div 
            className="draggable-exercise-icon"
            style={{
              backgroundImage: `url(${session.image_url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              width: '60px',
              height: '60px',
              borderRadius: '8px',
            }}
          />
        ) : (
          <div className="draggable-exercise-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14.7519 11.1679L11.5547 9.03647C10.8901 8.59343 10 9.06982 10 9.86852V14.1315C10 14.9302 10.8901 15.4066 11.5547 14.9635L14.7519 12.8321C15.3457 12.4362 15.3457 11.5638 14.7519 11.1679Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
        <div className="draggable-exercise-info">
          <div className="draggable-exercise-name">{session.title || 'Sesión sin nombre'}</div>
          {session.exercises && (
            <div className="draggable-exercise-meta">
              {session.exercises.length} ejercicio{session.exercises.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
      {isInModule && isEditMode && onDelete && (
        <button
          className="draggable-exercise-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
};

const LibraryModuleDetailScreen = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const backPath = location.state?.returnTo || '/content';
  const backState = location.state?.returnState ?? {};
  const [module, setModule] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [availableSessions, setAvailableSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: () => ({ x: 0, y: 0 }),
    })
  );

  const loadModule = useCallback(async () => {
    if (!user || !moduleId) return;

    try {
      const moduleData = await libraryService.getLibraryModuleById(user.uid, moduleId);
      if (!moduleData) {
        setError('Módulo no encontrado');
        return;
      }

      setModule(moduleData);
      
      // Load sessions from sessionRefs
      const sessionRefs = moduleData.sessionRefs || [];
      const loadedSessions = await Promise.all(
        sessionRefs.map(async (sessionRef) => {
          try {
            const session = await libraryService.getLibrarySessionById(
              user.uid, 
              sessionRef.librarySessionRef || sessionRef
            );
            return {
              ...session,
              dragId: `module-${session.id}`,
              order: sessionRef.order !== undefined ? sessionRef.order : 0,
              isInModule: true
            };
          } catch (err) {
            console.error('Error loading session:', err);
            return null;
          }
        })
      );
      
      const validSessions = loadedSessions
        .filter(s => s !== null)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      setSessions(validSessions);
    } catch (err) {
      console.error('Error loading module:', err);
      setError('Error al cargar el módulo');
    }
  }, [user, moduleId]);

  const loadAvailableSessions = useCallback(async () => {
    if (!user) return;

    try {
      const allSessions = await libraryService.getSessionLibrary(user.uid);
      const sessionRefs = module?.sessionRefs || [];
      const existingSessionIds = new Set(
        sessionRefs.map(ref => ref.librarySessionRef || ref)
      );
      
      const available = allSessions
        .filter(s => !existingSessionIds.has(s.id))
        .map(s => ({
          ...s,
          dragId: `available-${s.id}`,
          isInModule: false
        }));

      setAvailableSessions(available);
    } catch (err) {
      console.error('Error loading available sessions:', err);
    }
  }, [user, module]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadModule();
      setLoading(false);
    };
    init();
  }, [loadModule]);

  useEffect(() => {
    if (module) {
      loadAvailableSessions();
    }
  }, [module, loadAvailableSessions]);

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    // Check if dragging from available to module
    if (activeId.startsWith('available-') && overId === 'module-list') {
      await addSessionToModule(active.data.current.session);
      return;
    }

    // Check if reordering within module
    if (activeId.startsWith('module-') && overId.startsWith('module-')) {
      const activeIndex = sessions.findIndex(s => s.dragId === activeId);
      const overIndex = sessions.findIndex(s => s.dragId === overId);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        const newSessions = arrayMove(sessions, activeIndex, overIndex);
        setSessions(newSessions);
        await updateSessionOrder(newSessions);
      }
    }
  };

  const addSessionToModule = async (sessionData) => {
    if (!user || !moduleId || !sessionData.id) return;

    try {
      const moduleData = await libraryService.getLibraryModuleById(user.uid, moduleId);
      const currentSessionRefs = moduleData.sessionRefs || [];
      const nextOrder = currentSessionRefs.length;

      const newSessionRefs = [
        ...currentSessionRefs,
        {
          librarySessionRef: sessionData.id,
          order: nextOrder
        }
      ];

      await libraryService.updateLibraryModule(user.uid, moduleId, {
        sessionRefs: newSessionRefs
      });

      await loadModule();
      await loadAvailableSessions();
    } catch (err) {
      console.error('Error adding session:', err);
      alert('Error al agregar la sesión');
    }
  };

  const updateSessionOrder = async (newSessionsOrder) => {
    if (!user || !moduleId) return;

    try {
      const sessionRefs = newSessionsOrder.map((session, index) => ({
        librarySessionRef: session.id,
        order: index
      }));

      await libraryService.updateLibraryModule(user.uid, moduleId, {
        sessionRefs: sessionRefs
      });
    } catch (err) {
      console.error('Error updating session order:', err);
      alert('Error al actualizar el orden');
    }
  };

  const handleDeleteSession = (session) => {
    setSessionToDelete(session);
    setIsDeleteModalOpen(true);
    setDeleteConfirmation('');
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete || !deleteConfirmation.trim() || !user || !moduleId) return;

    if (deleteConfirmation.trim() !== sessionToDelete.title) return;

    try {
      setIsDeleting(true);
      
      const moduleData = await libraryService.getLibraryModuleById(user.uid, moduleId);
      const currentSessionRefs = moduleData.sessionRefs || [];
      const updatedSessionRefs = currentSessionRefs
        .filter(ref => (ref.librarySessionRef || ref) !== sessionToDelete.id)
        .map((ref, index) => ({
          ...ref,
          order: index
        }));

      await libraryService.updateLibraryModule(user.uid, moduleId, {
        sessionRefs: updatedSessionRefs
      });

      await loadModule();
      await loadAvailableSessions();

      setIsDeleteModalOpen(false);
      setSessionToDelete(null);
      setDeleteConfirmation('');
    } catch (err) {
      console.error('Error removing session:', err);
      alert('Error al remover la sesión');
    } finally {
      setIsDeleting(false);
    }
  };

  const activeSession = activeId 
    ? [...sessions, ...availableSessions].find(s => s.dragId === activeId)
    : null;

  if (loading) {
    return (
      <DashboardLayout 
        screenName={module?.title || 'Módulo'}
        showBackButton={true}
        backPath={backPath}
        backState={backState}
      >
        <div className="library-session-detail-container">
          <div className="library-session-detail-loading">Cargando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !module) {
    return (
      <DashboardLayout 
        screenName="Módulo"
        showBackButton={true}
        backPath={backPath}
        backState={backState}
      >
        <div className="library-session-detail-container">
          <div className="library-session-detail-error">
            <p>{error || 'Módulo no encontrado'}</p>
            <button onClick={() => navigate(backPath, { state: backState })} className="back-button">
              Volver a Contenido
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      screenName={module.title}
      showBackButton={true}
      backPath={backPath}
      backState={backState}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="library-session-detail-container">
          {/* Sidebar - Available Sessions */}
          <div className="library-session-sidebar">
            <div className="library-session-sidebar-header">
              <h3 className="library-session-sidebar-title">Sesiones Disponibles</h3>
            </div>
            
            <div className="library-session-sidebar-content">
              {availableSessions.length === 0 ? (
                <div className="library-session-empty-state">
                  <p>No hay sesiones disponibles</p>
                  <button
                    className="back-button"
                    onClick={() => navigate(backPath, { state: { ...backState, activeTab: 'sessions' } })}
                    style={{ marginTop: '16px' }}
                  >
                    Crear Sesión
                  </button>
                </div>
              ) : (
                <div className="draggable-exercises-list">
                  {availableSessions.map((session) => (
                    <DraggableSession
                      key={session.dragId}
                      session={session}
                      isInModule={false}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main Area - Module Sessions */}
          <div className="library-session-main">
            <div className="library-session-main-header">
              <div>
                <h2 className="library-session-main-title">Sesiones en el Módulo</h2>
                <p className="library-session-main-subtitle">
                  Arrastra sesiones desde el panel izquierdo o reorganiza las existentes
                </p>
              </div>
              <button
                className={`library-session-edit-button ${isEditMode ? 'active' : ''}`}
                onClick={() => setIsEditMode(!isEditMode)}
              >
                {isEditMode ? 'Guardar Orden' : 'Editar Orden'}
              </button>
            </div>

            <DropZone
              id="module-list"
              className={`library-session-exercises-container ${sessions.length === 0 ? 'empty' : ''}`}
            >
              {sessions.length === 0 ? (
                <div className="library-session-dropzone">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" opacity="0.3">
                    <path d="M14.7519 11.1679L11.5547 9.03647C10.8901 8.59343 10 9.06982 10 9.86852V14.1315C10 14.9302 10.8901 15.4066 11.5547 14.9635L14.7519 12.8321C15.3457 12.4362 15.3457 11.5638 14.7519 11.1679Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p>Arrastra sesiones aquí para agregarlas al módulo</p>
                </div>
              ) : (
                <SortableContext
                  items={sessions.map(s => s.dragId)}
                  strategy={verticalListSortingStrategy}
                >
                  {sessions.map((session) => (
                    <DraggableSession
                      key={session.dragId}
                      session={session}
                      isInModule={true}
                      onDelete={isEditMode ? handleDeleteSession : null}
                      isEditMode={isEditMode}
                      onClick={(s) => navigate(`/content/sessions/${s.id}`, { state: { returnTo: location.pathname, returnState: {} } })}
                    />
                  ))}
                </SortableContext>
              )}
            </DropZone>
          </div>
        </div>

        <DragOverlay>
          {activeSession ? (
            <div className="draggable-exercise dragging-overlay">
              <div className="draggable-exercise-content">
                {activeSession.image_url ? (
                  <div 
                    className="draggable-exercise-icon"
                    style={{
                      backgroundImage: `url(${activeSession.image_url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      width: '60px',
                      height: '60px',
                      borderRadius: '8px',
                    }}
                  />
                ) : (
                  <div className="draggable-exercise-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14.7519 11.1679L11.5547 9.03647C10.8901 8.59343 10 9.06982 10 9.86852V14.1315C10 14.9302 10.8901 15.4066 11.5547 14.9635L14.7519 12.8321C15.3457 12.4362 15.3457 11.5638 14.7519 11.1679Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
                <div className="draggable-exercise-info">
                  <div className="draggable-exercise-name">
                    {activeSession.title || 'Sesión sin nombre'}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Delete Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSessionToDelete(null);
          setDeleteConfirmation('');
        }}
        title={sessionToDelete?.title || 'Remover sesión'}
      >
        <div className="modal-library-content">
          <p className="delete-instruction-text">
            Para confirmar, escribe el nombre de la sesión:
          </p>
          <div className="delete-input-button-row">
            <Input
              placeholder={sessionToDelete?.title || 'Nombre de la sesión'}
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              type="text"
              light={true}
            />
            <button
              className={`delete-library-button ${deleteConfirmation.trim() !== sessionToDelete?.title ? 'delete-library-button-disabled' : ''}`}
              onClick={handleConfirmDelete}
              disabled={deleteConfirmation.trim() !== sessionToDelete?.title || isDeleting}
            >
              {isDeleting ? 'Removiendo...' : 'Remover'}
            </button>
          </div>
          <p className="delete-warning-text">
            Esta acción removerá la sesión del módulo, pero no eliminará la sesión de la biblioteca.
          </p>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default LibraryModuleDetailScreen;
