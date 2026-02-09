import React, { useState, useEffect } from 'react';
import Input from './Input';
import './PlanningSidebar.css';

const DRAG_TYPE_LIBRARY_SESSION = 'plan-structure/library-session';

/**
 * Left sidebar: library of sessions (flat list, searchable, draggable).
 * Sessions can be dragged onto day cells in the grid.
 */
const PlanStructureSidebar = ({
  creatorId,
  libraryService,
  searchQuery = '',
  onSearchChange,
}) => {
  const [librarySessions, setLibrarySessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!creatorId || !libraryService) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const sessions = await libraryService.getSessionLibrary(creatorId);
        setLibrarySessions(sessions || []);
      } catch (err) {
        console.error('Error loading library sessions:', err);
        setLibrarySessions([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [creatorId, libraryService]);

  const q = (searchQuery || '').trim().toLowerCase();
  const filtered = q
    ? librarySessions.filter((s) => (s.title || '').toLowerCase().includes(q))
    : librarySessions;

  const handleDragStart = (e, session) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: DRAG_TYPE_LIBRARY_SESSION,
        librarySessionRef: session.id,
        title: session.title || 'Sesión',
      })
    );
    e.currentTarget.classList.add('plan-structure-item-dragging');
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('plan-structure-item-dragging');
  };

  return (
    <div className="planning-sidebar">
      <div className="planning-sidebar-header">
        <h3 className="planning-sidebar-title">Biblioteca de sesiones</h3>
      </div>
      <div className="plan-structure-search">
        <Input
          placeholder="Buscar sesiones..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          type="text"
          light
        />
      </div>
      <div className="planning-sidebar-content">
        {loading ? (
          <div className="planning-sidebar-loading">
            <p>Cargando sesiones...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="planning-sidebar-empty">
            <p>{q ? 'No hay coincidencias' : 'No hay sesiones en la biblioteca'}</p>
          </div>
        ) : (
          <div className="planning-sidebar-section">
            <h4 className="planning-sidebar-section-title">Arrastra a un día</h4>
            <div className="planning-sidebar-programs-list">
              {filtered.map((session) => (
                <div
                  key={session.id}
                  className="planning-sidebar-program-item plan-structure-library-item"
                  draggable
                  onDragStart={(e) => handleDragStart(e, session)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="planning-sidebar-program-content">
                    <div className="planning-sidebar-program-image-placeholder" style={{ width: 28, height: 28, fontSize: 12 }}>
                      {session.title?.charAt(0) || 'S'}
                    </div>
                    <div className="planning-sidebar-program-info">
                      <span className="planning-sidebar-program-name">
                        {session.title || `Sesión ${session.id?.slice(0, 8)}`}
                      </span>
                    </div>
                  </div>
                  <div className="plan-structure-drag-hint">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 5L15 5M9 12L15 12M9 19L15 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanStructureSidebar;
export { DRAG_TYPE_LIBRARY_SESSION };
