import React, { useState, useEffect } from 'react';
import programService from '../services/programService';
import clientProgramService from '../services/clientProgramService';
import './PlanningSidebar.css';

const PlanningSidebar = ({ 
  clientId, 
  creatorId, 
  selectedProgramId, 
  onProgramSelect, 
  onProgramsChange 
}) => {
  const [programs, setPrograms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    loadPrograms();
  }, [clientId, creatorId]);

  const loadPrograms = async () => {
    if (!clientId || !creatorId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      // Get all programs for the creator
      const allPrograms = await programService.getProgramsByCreator(creatorId);

      // Only consider 1-on-1 programs
      const oneOnOnePrograms = allPrograms.filter(
        (program) => (program.deliveryType || 'low_ticket') === 'one_on_one'
      );

      // Check which programs are assigned to this client
      const programsWithStatus = await Promise.all(
        oneOnOnePrograms.map(async (program) => {
          try {
            const clientProgram = await clientProgramService.getClientProgram(program.id, clientId);
            return {
              ...program,
              isAssigned: !!clientProgram,
              clientProgramId: clientProgram?.id
            };
          } catch (error) {
            return {
              ...program,
              isAssigned: false
            };
          }
        })
      );
      
      setPrograms(programsWithStatus);
      
      // Notify parent of changes
      if (onProgramsChange) {
        onProgramsChange(programsWithStatus);
      }

      // Auto-select first assigned program if no selection
      if (!selectedProgramId) {
        const firstAssigned = programsWithStatus.find(p => p.isAssigned);
        if (firstAssigned && onProgramSelect) {
          onProgramSelect(firstAssigned.id);
        }
      }
    } catch (error) {
      console.error('Error loading programs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignProgram = async (programId) => {
    try {
      setIsAssigning(true);
      await clientProgramService.assignProgramToClient(programId, clientId);
      await loadPrograms();
      
      // Auto-select newly assigned program
      if (onProgramSelect) {
        onProgramSelect(programId);
      }
    } catch (error) {
      console.error('Error assigning program:', error);
      alert('Error al asignar el programa');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassignProgram = async (programId, event) => {
    event.stopPropagation();
    
    if (!window.confirm('¿Estás seguro de que quieres desasignar este programa?')) {
      return;
    }

    try {
      setIsAssigning(true);
      await clientProgramService.deleteClientProgram(programId, clientId);
      await loadPrograms();
      
      // Clear selection if unassigned program was selected
      if (selectedProgramId === programId && onProgramSelect) {
        const remainingAssigned = programs.find(p => p.isAssigned && p.id !== programId);
        if (remainingAssigned) {
          onProgramSelect(remainingAssigned.id);
        } else {
          onProgramSelect(null);
        }
      }
    } catch (error) {
      console.error('Error unassigning program:', error);
      alert('Error al desasignar el programa');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleProgramClick = (programId) => {
    if (onProgramSelect) {
      onProgramSelect(programId);
    }
  };

  if (isLoading) {
    return (
      <div className="planning-sidebar">
        <div className="planning-sidebar-header">
          <h3 className="planning-sidebar-title">Programas</h3>
        </div>
        <div className="planning-sidebar-loading">
          <p>Cargando programas...</p>
        </div>
      </div>
    );
  }

  const assignedPrograms = programs.filter(p => p.isAssigned);
  const unassignedPrograms = programs.filter(p => !p.isAssigned);

  return (
    <div className="planning-sidebar">
      <div className="planning-sidebar-header">
        <h3 className="planning-sidebar-title">Programas</h3>
        {isAssigning && (
          <span className="planning-sidebar-loading-indicator">...</span>
        )}
      </div>

      <div className="planning-sidebar-content">
        {/* Assigned Programs */}
        {assignedPrograms.length > 0 && (
          <div className="planning-sidebar-section">
            <h4 className="planning-sidebar-section-title">Asignados</h4>
            <div className="planning-sidebar-programs-list">
              {assignedPrograms.map((program) => (
                <div
                  key={program.id}
                  className={`planning-sidebar-program-item ${
                    selectedProgramId === program.id ? 'planning-sidebar-program-item-selected' : ''
                  }`}
                  onClick={() => handleProgramClick(program.id)}
                >
                  <div className="planning-sidebar-program-content">
                    {program.image_url ? (
                      <img 
                        src={program.image_url} 
                        alt={program.title} 
                        className="planning-sidebar-program-image"
                      />
                    ) : (
                      <div className="planning-sidebar-program-image-placeholder">
                        {program.title?.charAt(0) || 'P'}
                      </div>
                    )}
                    <div className="planning-sidebar-program-info">
                      <span className="planning-sidebar-program-name">
                        {program.title || `Programa ${program.id.slice(0, 8)}`}
                      </span>
                      {selectedProgramId === program.id && (
                        <span className="planning-sidebar-program-selected-indicator">Activo</span>
                      )}
                    </div>
                  </div>
                  <button
                    className="planning-sidebar-program-unassign-button"
                    onClick={(e) => handleUnassignProgram(program.id, e)}
                    title="Desasignar programa"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unassigned Programs */}
        {unassignedPrograms.length > 0 && (
          <div className="planning-sidebar-section">
            <h4 className="planning-sidebar-section-title">Disponibles</h4>
            <div className="planning-sidebar-programs-list">
              {unassignedPrograms.map((program) => (
                <div
                  key={program.id}
                  className="planning-sidebar-program-item planning-sidebar-program-item-unassigned"
                >
                  <div className="planning-sidebar-program-content">
                    {program.image_url ? (
                      <img 
                        src={program.image_url} 
                        alt={program.title} 
                        className="planning-sidebar-program-image"
                      />
                    ) : (
                      <div className="planning-sidebar-program-image-placeholder">
                        {program.title?.charAt(0) || 'P'}
                      </div>
                    )}
                    <div className="planning-sidebar-program-info">
                      <span className="planning-sidebar-program-name">
                        {program.title || `Programa ${program.id.slice(0, 8)}`}
                      </span>
                    </div>
                  </div>
                  <button
                    className="planning-sidebar-program-assign-button"
                    onClick={() => handleAssignProgram(program.id)}
                    disabled={isAssigning}
                    title="Asignar programa"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {programs.length === 0 && (
          <div className="planning-sidebar-empty">
            <p>No hay programas disponibles.</p>
            <p className="planning-sidebar-empty-hint">
              Crea un programa 1-on-1 para comenzar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanningSidebar;

