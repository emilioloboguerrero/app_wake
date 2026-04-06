import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Input from './Input';
import { AnimatedList, ShimmerSkeleton, GlowingEffect } from './ui';
import libraryService from '../services/libraryService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import './PlanStructureSidebar.css';

const DRAG_TYPE_LIBRARY_SESSION = 'plan-structure/library-session';

/**
 * Left sidebar: library of sessions (flat list, searchable, draggable).
 * Sessions can be dragged onto day cells in the grid.
 */
const PlanStructureSidebar = ({
  creatorId,
  searchQuery = '',
  onSearchChange,
}) => {
  const { data: librarySessions = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.library.sessionsSlim(creatorId),
    queryFn: () => libraryService.getSessionLibrarySlim(creatorId),
    enabled: !!creatorId,
    ...cacheConfig.librarySessions,
  });

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
        title: session.title || 'Sesion',
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
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                <ShimmerSkeleton width="28px" height="28px" borderRadius="6px" />
                <ShimmerSkeleton width="70%" height="14px" borderRadius="4px" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="planning-sidebar-empty">
            <p>{q ? 'No hay coincidencias' : 'No hay sesiones en la biblioteca'}</p>
          </div>
        ) : (
          <div className="planning-sidebar-section">
            <h4 className="planning-sidebar-section-title">Arrastra a un día</h4>
            <div className="planning-sidebar-programs-list">
              <AnimatedList stagger={40}>
                {filtered.map((session) => (
                  <div
                    key={session.id}
                    className="planning-sidebar-program-item plan-structure-library-item"
                    draggable
                    onDragStart={(e) => handleDragStart(e, session)}
                    onDragEnd={handleDragEnd}
                  >
                    <GlowingEffect spread={20} proximity={40} borderWidth={1} />
                    <div className="planning-sidebar-program-content">
                      {session.image_url ? (
                        <img
                          src={session.image_url}
                          alt=""
                          className="planning-sidebar-program-image"
                          style={{ width: 28, height: 28 }}
                        />
                      ) : (
                        <div className="planning-sidebar-program-image-placeholder" style={{ width: 28, height: 28, fontSize: 12 }}>
                          {session.title?.charAt(0) || 'S'}
                        </div>
                      )}
                      <div className="planning-sidebar-program-info">
                        <span className="planning-sidebar-program-name">
                          {session.title || `Sesion ${session.id?.slice(0, 8)}`}
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
              </AnimatedList>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanStructureSidebar;
export { DRAG_TYPE_LIBRARY_SESSION };
