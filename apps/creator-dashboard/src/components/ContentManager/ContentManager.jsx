/**
 * ContentManager - Reusable component for managing content (modules, sessions, exercises)
 * Can be used with plans or programs via the contentService prop.
 *
 * Props:
 *   - contentType: 'plan' | 'program'
 *   - contentId: planId or programId
 *   - contentService: plansService or programService
 *   - creatorId: user.uid
 *   - libraryService: optional; when provided with contentType='plan', sessions are created in library first for full editing UX
 *   - onBack: () => void
 *   - backLabel: string
 *   - headerTitle: string
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../Modal';
import Input from '../Input';
import Button from '../Button';
import './ContentManager.css';

const ContentManager = ({
  contentType = 'plan',
  contentId,
  contentService,
  creatorId,
  libraryService = null,
  onBack,
  backLabel = 'Volver',
  headerTitle = 'Contenido',
  showBackButton = true,
  compactHeader = false,
}) => {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('modules'); // 'modules' | 'sessions' | 'exercises'

  // Modals
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [moduleName, setModuleName] = useState('');
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [moduleToDelete, setModuleToDelete] = useState(null);
  const [deleteModuleConfirmation, setDeleteModuleConfirmation] = useState('');
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [deleteSessionConfirmation, setDeleteSessionConfirmation] = useState('');
  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [exerciseName, setExerciseName] = useState('');
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [exerciseToDelete, setExerciseToDelete] = useState(null);
  const [deleteExerciseConfirmation, setDeleteExerciseConfirmation] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  const getModules = () => {
    if (contentType === 'plan') return contentService.getModulesByPlan(contentId);
    return contentService.getModulesByProgram(contentId);
  };

  const getSessions = (moduleId) => {
    if (contentType === 'plan') return contentService.getSessionsByModule(contentId, moduleId);
    return contentService.getSessionsByModule(contentId, moduleId);
  };

  const getExercises = (moduleId, sessionId) => {
    if (contentType === 'plan') return contentService.getExercisesBySession(contentId, moduleId, sessionId);
    return contentService.getExercisesBySession(contentId, moduleId, sessionId);
  };

  const createModule = (name) => {
    if (contentType === 'plan') return contentService.createModule(contentId, name);
    return contentService.createModule(contentId, name);
  };

  const createSession = (moduleId, name) => {
    if (contentType === 'plan') return contentService.createSession(contentId, moduleId, name);
    return contentService.createSession(contentId, moduleId, name);
  };

  const createExercise = (moduleId, sessionId, name) => {
    if (contentType === 'plan') return contentService.createExercise(contentId, moduleId, sessionId, name);
    return contentService.createExercise(contentId, moduleId, sessionId, name);
  };

  const deleteModule = (moduleId) => {
    return contentService.deleteModule(contentId, moduleId);
  };

  const deleteSession = (planIdOrProgramId, moduleId, sessionId) => {
    return contentService.deleteSession(planIdOrProgramId, moduleId, sessionId);
  };

  const deleteExercise = (planIdOrProgramId, moduleId, sessionId, exerciseId) => {
    return contentService.deleteExercise(planIdOrProgramId, moduleId, sessionId, exerciseId);
  };

  useEffect(() => {
    if (!contentId || !contentService) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const mods = await getModules();
        setModules(mods);
      } catch (err) {
        console.error('Error loading modules:', err);
        setError(err.message || 'Error al cargar');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [contentId]);

  useEffect(() => {
    if (!contentId || !selectedModule) {
      setSessions([]);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const sess = await getSessions(selectedModule.id);
        setSessions(sess);
      } catch (err) {
        console.error('Error loading sessions:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [contentId, selectedModule?.id]);

  useEffect(() => {
    if (!contentId || !selectedModule || !selectedSession) {
      setExercises([]);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const exs = await getExercises(selectedModule.id, selectedSession.id);
        setExercises(exs);
      } catch (err) {
        console.error('Error loading exercises:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [contentId, selectedModule?.id, selectedSession?.id]);

  const handleModuleClick = (module) => {
    if (isEditMode) return;
    setSelectedModule(module);
    setSelectedSession(null);
    setView('sessions');
  };

  const handleSessionClick = (session) => {
    if (isEditMode) return;
    if (contentType === 'plan' && contentId && selectedModule) {
      navigate(`/plans/${contentId}/modules/${selectedModule.id}/sessions/${session.id}`);
      return;
    }
    setSelectedSession(session);
    setView('exercises');
  };

  const handleBackToModules = () => {
    setSelectedModule(null);
    setSelectedSession(null);
    setView('modules');
  };

  const handleBackToSessions = () => {
    setSelectedSession(null);
    setView('sessions');
  };

  const handleCreateModule = async () => {
    if (!moduleName.trim()) return;
    try {
      setIsCreatingModule(true);
      await createModule(moduleName.trim());
      const mods = await getModules();
      setModules(mods);
      setIsModuleModalOpen(false);
      setModuleName('');
    } catch (err) {
      alert(err.message || 'Error al crear la semana');
    } finally {
      setIsCreatingModule(false);
    }
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim() || !selectedModule) return;
    try {
      setIsCreatingSession(true);
      let librarySessionRef = null;
      if (contentType === 'plan' && libraryService && creatorId) {
        const librarySession = await libraryService.createLibrarySession(creatorId, {
          title: sessionName.trim(),
          image_url: null
        });
        librarySessionRef = librarySession.id;
      }
      const created = contentType === 'plan' && librarySessionRef
        ? await contentService.createSession(contentId, selectedModule.id, sessionName.trim(), null, null, librarySessionRef)
        : await createSession(selectedModule.id, sessionName.trim());
      if (contentType === 'plan' && contentId && created?.id) {
        setIsSessionModalOpen(false);
        setSessionName('');
        navigate(`/plans/${contentId}/modules/${selectedModule.id}/sessions/${created.id}`, {
          state: { librarySessionRef: librarySessionRef || undefined }
        });
        return;
      }
      const sess = await getSessions(selectedModule.id);
      setSessions(sess);
      setIsSessionModalOpen(false);
      setSessionName('');
    } catch (err) {
      alert(err.message || 'Error al crear la sesión');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleCreateExercise = async () => {
    if (!exerciseName.trim() || !selectedModule || !selectedSession) return;
    try {
      setIsCreatingExercise(true);
      await createExercise(selectedModule.id, selectedSession.id, exerciseName.trim());
      const exs = await getExercises(selectedModule.id, selectedSession.id);
      setExercises(exs);
      setIsExerciseModalOpen(false);
      setExerciseName('');
    } catch (err) {
      alert(err.message || 'Error al crear el ejercicio');
    } finally {
      setIsCreatingExercise(false);
    }
  };

  const handleDeleteModule = async () => {
    if (!moduleToDelete || deleteModuleConfirmation !== (moduleToDelete.title || `Semana ${moduleToDelete.id?.slice(0, 8)}`)) return;
    try {
      await deleteModule(moduleToDelete.id);
      const mods = await getModules();
      setModules(mods);
      if (selectedModule?.id === moduleToDelete.id) {
        setSelectedModule(null);
        setSelectedSession(null);
        setView('modules');
      }
      setModuleToDelete(null);
      setDeleteModuleConfirmation('');
    } catch (err) {
      alert(err.message || 'Error al eliminar');
    }
  };

  const handleDeleteSession = async () => {
    if (!sessionToDelete || !selectedModule || deleteSessionConfirmation !== (sessionToDelete.title || `Sesión ${sessionToDelete.id?.slice(0, 8)}`)) return;
    try {
      await deleteSession(contentId, selectedModule.id, sessionToDelete.id);
      const sess = await getSessions(selectedModule.id);
      setSessions(sess);
      if (selectedSession?.id === sessionToDelete.id) {
        setSelectedSession(null);
        setView('sessions');
      }
      setSessionToDelete(null);
      setDeleteSessionConfirmation('');
    } catch (err) {
      alert(err.message || 'Error al eliminar');
    }
  };

  const handleDeleteExercise = async () => {
    if (!exerciseToDelete || !selectedModule || !selectedSession || deleteExerciseConfirmation !== (exerciseToDelete.title || `Ejercicio ${exerciseToDelete.id?.slice(0, 8)}`)) return;
    try {
      await deleteExercise(contentId, selectedModule.id, selectedSession.id, exerciseToDelete.id);
      const exs = await getExercises(selectedModule.id, selectedSession.id);
      setExercises(exs);
      setExerciseToDelete(null);
      setDeleteExerciseConfirmation('');
    } catch (err) {
      alert(err.message || 'Error al eliminar');
    }
  };

  if (!contentId) return null;

  return (
    <div className="content-manager">
      <div className={`content-manager-header ${compactHeader ? 'content-manager-header--compact' : ''}`}>
        {showBackButton && (
          <button type="button" className="content-manager-back" onClick={onBack}>
            ← {backLabel}
          </button>
        )}
        {!compactHeader && <h2 className="content-manager-title">{headerTitle}</h2>}
        <button
          type="button"
          className="content-manager-edit-toggle"
          onClick={() => setIsEditMode(!isEditMode)}
        >
          {isEditMode ? 'Guardar' : 'Editar'}
        </button>
      </div>

      {loading && !modules.length ? (
        <div className="content-manager-loading">Cargando...</div>
      ) : error ? (
        <div className="content-manager-error">{error}</div>
      ) : (
        <div className="content-manager-content">
          {view === 'modules' && (
            <div className="content-manager-section">
              <div className="content-manager-section-header">
                <h3>Semanas</h3>
                <button
                  type="button"
                  className="content-manager-add-btn"
                  onClick={() => setIsModuleModalOpen(true)}
                  disabled={isEditMode}
                >
                  + Nueva semana
                </button>
              </div>
              <div className="content-manager-list">
                {modules.map((m, i) => (
                  <div
                    key={m.id}
                    className={`content-manager-card ${isEditMode ? 'content-manager-card-edit' : ''}`}
                    onClick={() => handleModuleClick(m)}
                  >
                    <span className="content-manager-card-number">{i + 1}</span>
                    <span className="content-manager-card-title">{m.title || `Semana ${m.id?.slice(0, 8)}`}</span>
                    {isEditMode && (
                      <button
                        type="button"
                        className="content-manager-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModuleToDelete(m);
                          setDeleteModuleConfirmation('');
                        }}
                      >
                        −
                      </button>
                    )}
                  </div>
                ))}
                {modules.length === 0 && (
                  <p className="content-manager-empty">No hay semanas. Crea una para empezar.</p>
                )}
              </div>
            </div>
          )}

          {view === 'sessions' && selectedModule && (
            <div className="content-manager-section">
              <div className="content-manager-section-header">
                <button type="button" className="content-manager-back-inline" onClick={handleBackToModules}>
                  ← Semanas
                </button>
                <h3>{selectedModule.title || 'Sesiones'}</h3>
                <button
                  type="button"
                  className="content-manager-add-btn"
                  onClick={() => setIsSessionModalOpen(true)}
                  disabled={isEditMode}
                >
                  + Nueva sesión
                </button>
              </div>
              <div className="content-manager-list">
                {sessions.map((s, i) => (
                  <div
                    key={s.id}
                    className={`content-manager-card ${isEditMode ? 'content-manager-card-edit' : ''}`}
                    onClick={() => handleSessionClick(s)}
                  >
                    <span className="content-manager-card-number">{i + 1}</span>
                    <span className="content-manager-card-title">{s.title || `Sesión ${s.id?.slice(0, 8)}`}</span>
                    {isEditMode && (
                      <button
                        type="button"
                        className="content-manager-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessionToDelete(s);
                          setDeleteSessionConfirmation('');
                        }}
                      >
                        −
                      </button>
                    )}
                  </div>
                ))}
                {sessions.length === 0 && (
                  <p className="content-manager-empty">No hay sesiones. Crea una para empezar.</p>
                )}
              </div>
            </div>
          )}

          {view === 'exercises' && selectedModule && selectedSession && (
            <div className="content-manager-section">
              <div className="content-manager-section-header">
                <button type="button" className="content-manager-back-inline" onClick={handleBackToSessions}>
                  ← Sesiones
                </button>
                <h3>{selectedSession.title || 'Ejercicios'}</h3>
                <button
                  type="button"
                  className="content-manager-add-btn"
                  onClick={() => setIsExerciseModalOpen(true)}
                  disabled={isEditMode}
                >
                  + Nuevo ejercicio
                </button>
              </div>
              <div className="content-manager-list">
                {exercises.map((e, i) => (
                  <div
                    key={e.id}
                    className={`content-manager-card content-manager-card-exercise ${isEditMode ? 'content-manager-card-edit' : ''}`}
                  >
                    <span className="content-manager-card-number">{i + 1}</span>
                    <span className="content-manager-card-title">{e.title || e.name || `Ejercicio ${e.id?.slice(0, 8)}`}</span>
                    {isEditMode && (
                      <button
                        type="button"
                        className="content-manager-delete-btn"
                        onClick={() => {
                          setExerciseToDelete(e);
                          setDeleteExerciseConfirmation('');
                        }}
                      >
                        −
                      </button>
                    )}
                  </div>
                ))}
                {exercises.length === 0 && (
                  <p className="content-manager-empty">No hay ejercicios. Crea uno para empezar.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Module Modal */}
      <Modal isOpen={isModuleModalOpen} onClose={() => setIsModuleModalOpen(false)} title="Nueva semana">
        <div className="content-manager-modal-body">
          <Input
            placeholder="Nombre de la semana (ej: Semana 1)"
            value={moduleName}
            onChange={(e) => setModuleName(e.target.value)}
            light
          />
          <div className="content-manager-modal-actions">
            <Button title={isCreatingModule ? 'Creando...' : 'Crear'} onClick={handleCreateModule} disabled={!moduleName.trim() || isCreatingModule} loading={isCreatingModule} />
          </div>
        </div>
      </Modal>

      {/* Create Session Modal */}
      <Modal isOpen={isSessionModalOpen} onClose={() => setIsSessionModalOpen(false)} title="Nueva sesión">
        <div className="content-manager-modal-body">
          <Input
            placeholder="Nombre de la sesión (ej: Día 1 - Piernas)"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            light
          />
          <div className="content-manager-modal-actions">
            <Button title={isCreatingSession ? 'Creando...' : 'Crear'} onClick={handleCreateSession} disabled={!sessionName.trim() || isCreatingSession} loading={isCreatingSession} />
          </div>
        </div>
      </Modal>

      {/* Create Exercise Modal */}
      <Modal isOpen={isExerciseModalOpen} onClose={() => setIsExerciseModalOpen(false)} title="Nuevo ejercicio">
        <div className="content-manager-modal-body">
          <Input
            placeholder="Nombre del ejercicio"
            value={exerciseName}
            onChange={(e) => setExerciseName(e.target.value)}
            light
          />
          <div className="content-manager-modal-actions">
            <Button title={isCreatingExercise ? 'Creando...' : 'Crear'} onClick={handleCreateExercise} disabled={!exerciseName.trim() || isCreatingExercise} loading={isCreatingExercise} />
          </div>
        </div>
      </Modal>

      {/* Delete Module Modal */}
      <Modal isOpen={!!moduleToDelete} onClose={() => { setModuleToDelete(null); setDeleteModuleConfirmation(''); }} title="Eliminar semana">
        <div className="content-manager-modal-body">
          <p>Escribe &quot;{moduleToDelete?.title || `Semana ${moduleToDelete?.id?.slice(0, 8)}`}&quot; para confirmar:</p>
          <Input value={deleteModuleConfirmation} onChange={(e) => setDeleteModuleConfirmation(e.target.value)} light />
          <div className="content-manager-modal-actions">
            <Button title="Eliminar" onClick={handleDeleteModule} disabled={deleteModuleConfirmation !== (moduleToDelete?.title || `Semana ${moduleToDelete?.id?.slice(0, 8)}`)} />
          </div>
        </div>
      </Modal>

      {/* Delete Session Modal */}
      <Modal isOpen={!!sessionToDelete} onClose={() => { setSessionToDelete(null); setDeleteSessionConfirmation(''); }} title="Eliminar sesión">
        <div className="content-manager-modal-body">
          <p>Escribe &quot;{sessionToDelete?.title || `Sesión ${sessionToDelete?.id?.slice(0, 8)}`}&quot; para confirmar:</p>
          <Input value={deleteSessionConfirmation} onChange={(e) => setDeleteSessionConfirmation(e.target.value)} light />
          <div className="content-manager-modal-actions">
            <Button title="Eliminar" onClick={handleDeleteSession} disabled={deleteSessionConfirmation !== (sessionToDelete?.title || `Sesión ${sessionToDelete?.id?.slice(0, 8)}`)} />
          </div>
        </div>
      </Modal>

      {/* Delete Exercise Modal */}
      <Modal isOpen={!!exerciseToDelete} onClose={() => { setExerciseToDelete(null); setDeleteExerciseConfirmation(''); }} title="Eliminar ejercicio">
        <div className="content-manager-modal-body">
          <p>Escribe &quot;{exerciseToDelete?.title || exerciseToDelete?.name || `Ejercicio ${exerciseToDelete?.id?.slice(0, 8)}`}&quot; para confirmar:</p>
          <Input value={deleteExerciseConfirmation} onChange={(e) => setDeleteExerciseConfirmation(e.target.value)} light />
          <div className="content-manager-modal-actions">
            <Button title="Eliminar" onClick={handleDeleteExercise} disabled={deleteExerciseConfirmation !== (exerciseToDelete?.title || exerciseToDelete?.name || `Ejercicio ${exerciseToDelete?.id?.slice(0, 8)}`)} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ContentManager;
