import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import programService from '../services/programService';
import './SessionAssignmentModal.css';

const SessionAssignmentModal = ({ 
  isOpen, 
  onClose, 
  selectedDate,
  assignedPrograms = [],
  selectedProgramId = null,
  onSessionAssigned,
  onSessionCreated,
  onSaveToLibrary 
}) => {
  const [mode, setMode] = useState('choose'); // 'choose', 'create', 'fromProgram'
  const [selectedProgramForSession, setSelectedProgramForSession] = useState(selectedProgramId);
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [modules, setModules] = useState([]);

  useEffect(() => {
    if (selectedProgramId) {
      setSelectedProgramForSession(selectedProgramId);
    }
  }, [selectedProgramId]);

  useEffect(() => {
    if (mode === 'fromProgram' && selectedProgramForSession) {
      loadProgramSessions(selectedProgramForSession);
    }
  }, [mode, selectedProgramForSession]);

  const loadProgramSessions = async (programId) => {
    try {
      setIsLoadingSessions(true);
      
      // Get all modules for the program
      const programModules = await programService.getModulesByProgram(programId);
      setModules(programModules);

      // Get sessions from all modules
      const allSessions = [];
      for (const module of programModules) {
        try {
          const moduleSessions = await programService.getSessionsByModule(programId, module.id);
          // Add module info to each session
          const sessionsWithModule = moduleSessions.map(session => ({
            ...session,
            moduleId: module.id,
            moduleTitle: module.title
          }));
          allSessions.push(...sessionsWithModule);
        } catch (error) {
          console.error(`Error loading sessions for module ${module.id}:`, error);
        }
      }

      setSessions(allSessions);
    } catch (error) {
      console.error('Error loading program sessions:', error);
      setSessions([]);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleClose = () => {
    setMode('choose');
    setSelectedProgramForSession(selectedProgramId);
    setSessions([]);
    setModules([]);
    onClose();
  };

  const handleSessionSelect = (session) => {
    if (onSessionAssigned) {
      onSessionAssigned({
        sessionId: session.id,
        sessionTitle: session.title,
        programId: selectedProgramForSession,
        moduleId: session.moduleId,
        moduleTitle: session.moduleTitle,
        date: selectedDate
      });
    }
    handleClose();
  };

  const handleCreateSession = () => {
    if (onSessionCreated) {
      onSessionCreated({
        programId: selectedProgramForSession,
        date: selectedDate
      });
    }
    handleClose();
  };

  const formatDate = (date) => {
    if (!date) return '';
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${dayName}, ${day} de ${month} ${year}`;
  };

  if (!isOpen) return null;

  // Choose mode: Select program context first if multiple programs
  if (mode === 'choose') {
    const assignedCount = assignedPrograms.filter(p => p.isAssigned).length;
    const needsProgramSelection = assignedCount > 1 && !selectedProgramForSession;

    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Agregar Entrenamiento"
      >
        <div className="session-assignment-modal-content">
          <div className="session-assignment-date">
            {formatDate(selectedDate)}
          </div>

          {/* Program Selection (if multiple programs assigned) */}
          {needsProgramSelection && (
            <div className="session-assignment-program-selector">
              <label className="session-assignment-program-label">
                Selecciona un programa:
              </label>
              <select
                className="session-assignment-program-select"
                value={selectedProgramForSession || ''}
                onChange={(e) => setSelectedProgramForSession(e.target.value)}
              >
                <option value="">-- Selecciona un programa --</option>
                {assignedPrograms.filter(p => p.isAssigned).map(program => (
                  <option key={program.id} value={program.id}>
                    {program.title || `Programa ${program.id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(!needsProgramSelection || selectedProgramForSession) && (
            <div className="session-assignment-options">
              <button
                type="button"
                className="session-assignment-option-card"
                onClick={() => {
                  if (assignedCount > 0) {
                    setMode('fromProgram');
                  } else {
                    handleCreateSession();
                  }
                }}
                disabled={assignedCount === 0}
              >
                <div className="session-assignment-option-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 19.5V4.5C4 3.67157 4.67157 3 5.5 3H19.5C20.3284 3 21 3.67157 21 4.5V19.5C21 20.3284 20.3284 21 19.5 21H5.5C4.67157 21 4 20.3284 4 19.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 9L15 15M15 9L9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="session-assignment-option-content">
                  <h3 className="session-assignment-option-title">Desde Programa</h3>
                  <p className="session-assignment-option-description">
                    {assignedCount > 0 
                      ? 'Usar una sesión del programa asignado'
                      : 'Asigna un programa primero para usar sus sesiones'
                    }
                  </p>
                </div>
              </button>
              <button
                type="button"
                className="session-assignment-option-card"
                onClick={handleCreateSession}
              >
                <div className="session-assignment-option-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="session-assignment-option-content">
                  <h3 className="session-assignment-option-title">Crear Nueva Sesión</h3>
                  <p className="session-assignment-option-description">
                    Crear una sesión nueva desde cero
                    {selectedProgramForSession && ' (para este programa)'}
                  </p>
                </div>
              </button>
            </div>
          )}

          {assignedCount === 0 && (
            <div className="session-assignment-no-programs">
              <p>No hay programas asignados. Asigna un programa primero desde el panel lateral.</p>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  // Browse sessions from program
  if (mode === 'fromProgram') {
    const selectedProgram = assignedPrograms.find(p => p.id === selectedProgramForSession);
    
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={`Sesiones de ${selectedProgram?.title || 'Programa'}`}
      >
        <div className="session-assignment-modal-content">
          <div className="session-assignment-date">
            {formatDate(selectedDate)}
          </div>

          {/* Program selector (can switch program) */}
          {assignedPrograms.filter(p => p.isAssigned).length > 1 && (
            <div className="session-assignment-program-selector">
              <label className="session-assignment-program-label">
                Programa:
              </label>
              <select
                className="session-assignment-program-select"
                value={selectedProgramForSession || ''}
                onChange={(e) => {
                  setSelectedProgramForSession(e.target.value);
                  setSessions([]);
                }}
              >
                {assignedPrograms.filter(p => p.isAssigned).map(program => (
                  <option key={program.id} value={program.id}>
                    {program.title || `Programa ${program.id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sessions List */}
          <div className="session-assignment-library">
            {isLoadingSessions ? (
              <div className="session-assignment-library-loading">
                <p>Cargando sesiones...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="session-assignment-library-empty">
                <p>No hay sesiones en este programa.</p>
                <Button
                  title="Crear Nueva Sesión"
                  onClick={handleCreateSession}
                />
              </div>
            ) : (
              <div className="session-assignment-sessions-list">
                {modules.map(module => {
                  const moduleSessions = sessions.filter(s => s.moduleId === module.id);
                  if (moduleSessions.length === 0) return null;

                  return (
                    <div key={module.id} className="session-assignment-module-group">
                      <h4 className="session-assignment-module-title">{module.title}</h4>
                      <div className="session-assignment-module-sessions">
                        {moduleSessions.map(session => (
                          <button
                            key={session.id}
                            className="session-assignment-session-item"
                            onClick={() => handleSessionSelect(session)}
                          >
                            <div className="session-assignment-session-content">
                              <span className="session-assignment-session-name">
                                {session.title || `Sesión ${session.id.slice(0, 8)}`}
                              </span>
                              {session.image_url && (
                                <img
                                  src={session.image_url}
                                  alt={session.title}
                                  className="session-assignment-session-image"
                                />
                              )}
                            </div>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="session-assignment-actions">
            <Button
              title="Cancelar"
              onClick={handleClose}
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
            />
            <Button
              title="Crear Nueva Sesión"
              onClick={handleCreateSession}
            />
          </div>
        </div>
      </Modal>
    );
  }

  return null;
};

export default SessionAssignmentModal;
