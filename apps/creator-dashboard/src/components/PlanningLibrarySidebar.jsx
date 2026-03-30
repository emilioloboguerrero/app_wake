import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Input from './Input';
import { GlowingEffect } from './ui';
import libraryService from '../services/libraryService';
import plansService from '../services/plansService';
import { queryKeys, cacheConfig } from '../config/queryClient';
import './PlanningLibrarySidebar.css';

const LIBRARY_TAB_SESSIONS = 'sessions';
const LIBRARY_TAB_PLANS = 'plans';

const DRAG_TYPE_LIBRARY_SESSION = 'plan-structure/library-session';
const DRAG_TYPE_PLAN = 'planning/plan';

// Uses native HTML5 drag (same as plans) so it's compatible with CalendarView's native onDrop
const DraggableSessionItem = ({ session }) => {
  const handleDragStart = (e) => {
    const payload = { type: DRAG_TYPE_LIBRARY_SESSION, librarySessionRef: session.id, title: session.title || 'Sesion' };
    e.dataTransfer.effectAllowed = 'all';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.currentTarget.classList.add('plan-structure-item-dragging');
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('plan-structure-item-dragging');
  };

  return (
    <div
      className="planning-sidebar-program-item plan-structure-library-item"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <GlowingEffect spread={16} proximity={70} borderWidth={1} />
      <div className="planning-sidebar-program-content" style={{ position: 'relative', zIndex: 2 }}>
        <div
          className="planning-sidebar-program-image-placeholder"
          style={{ width: 28, height: 28, fontSize: 12 }}
        >
          {session.title?.charAt(0) || 'S'}
        </div>
        <div className="planning-sidebar-program-info">
          <span className="planning-sidebar-program-name">
            {session.title || `Sesion ${session.id?.slice(0, 8)}`}
          </span>
        </div>
      </div>
      <div className="plan-structure-drag-hint" style={{ position: 'relative', zIndex: 2 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 5L15 5M9 12L15 12M9 19L15 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
};

/**
 * Left sidebar for client planning: toggle between Sessions library and Plans library,
 * search box, and draggable content. Matches PlanDetailScreen PlanStructureSidebar design.
 */
const PlanningLibrarySidebar = ({
  creatorId,
  searchQuery = '',
  onSearchChange,
  pulseTrigger,
}) => {
  const [activeTab, setActiveTab] = useState(LIBRARY_TAB_SESSIONS);
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (pulseTrigger == null) return;
    setActiveTab(LIBRARY_TAB_SESSIONS);
    const start = setTimeout(() => setIsPulsing(true), 50);
    const end = setTimeout(() => setIsPulsing(false), 650);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [pulseTrigger]);

  const { data: librarySessions = [], isLoading: sessionsLoading, isError: sessionsError } = useQuery({
    queryKey: queryKeys.library.sessionsSlim(creatorId),
    queryFn: () => libraryService.getSessionLibrarySlim(creatorId),
    enabled: !!creatorId && activeTab === LIBRARY_TAB_SESSIONS,
    ...cacheConfig.librarySessions,
  });

  const { data: plans = [], isLoading: plansLoading, isError: plansError } = useQuery({
    queryKey: ['library', 'plans', creatorId],
    queryFn: () => plansService.getPlansByCreator(creatorId),
    enabled: !!creatorId && activeTab === LIBRARY_TAB_PLANS,
    staleTime: 10 * 60 * 1000,
  });

  const q = (searchQuery || '').trim().toLowerCase();
  const filteredSessions = q
    ? librarySessions.filter((s) => (s.title || '').toLowerCase().includes(q))
    : librarySessions;
  const filteredPlans = q
    ? plans.filter((p) =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      )
    : plans;

  const handlePlanDragStart = (e, plan) => {
    const payload = { type: DRAG_TYPE_PLAN, planId: plan.id, planTitle: plan.title };
    e.dataTransfer.effectAllowed = 'all';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.currentTarget.classList.add('plan-structure-item-dragging');
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('plan-structure-item-dragging');
  };

  const searchPlaceholder =
    activeTab === LIBRARY_TAB_SESSIONS ? 'Buscar sesiones...' : 'Buscar planes...';
  const isLoading =
    activeTab === LIBRARY_TAB_SESSIONS ? sessionsLoading : plansLoading;
  const isError =
    activeTab === LIBRARY_TAB_SESSIONS ? sessionsError : plansError;
  const emptyMessage =
    activeTab === LIBRARY_TAB_SESSIONS
      ? (q ? 'No hay coincidencias' : 'No hay sesiones en la biblioteca')
      : (q ? 'No hay coincidencias' : 'No hay planes disponibles');
  const dragHint =
    activeTab === LIBRARY_TAB_SESSIONS
      ? 'Arrastra a un día'
      : 'Arrastra a una semana';

  return (
    <div className={`planning-library-sidebar ${isPulsing ? 'planning-library-sidebar--pulse' : ''}`}>
      {/* Toggle: Sessions | Plans */}
      <div className="planning-library-tabs">
        <button
          type="button"
          className={`planning-library-tab ${activeTab === LIBRARY_TAB_SESSIONS ? 'active' : ''}`}
          onClick={() => setActiveTab(LIBRARY_TAB_SESSIONS)}
        >
          Sesiones
        </button>
        <button
          type="button"
          className={`planning-library-tab ${activeTab === LIBRARY_TAB_PLANS ? 'active' : ''}`}
          onClick={() => setActiveTab(LIBRARY_TAB_PLANS)}
        >
          Planes
        </button>
      </div>

      <div className="plan-structure-search">
        <Input
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          type="text"
          light
        />
      </div>

      <div className="planning-sidebar-content">
        {isLoading ? (
          <div className="planning-sidebar-loading">
            <p>Cargando...</p>
          </div>
        ) : isError ? (
          <div className="planning-sidebar-empty">
            <p>No se pudo cargar la biblioteca. Intenta de nuevo.</p>
          </div>
        ) : activeTab === LIBRARY_TAB_SESSIONS ? (
          filteredSessions.length === 0 ? (
            <div className="planning-sidebar-empty">
              <p>{emptyMessage}</p>
            </div>
          ) : (
            <div className="planning-sidebar-section">
              <h4 className="planning-sidebar-section-title">{dragHint}</h4>
              <div className="planning-sidebar-programs-list">
                {filteredSessions.map((session) => (
                  <DraggableSessionItem key={session.id} session={session} />
                ))}
              </div>
            </div>
          )
        ) : filteredPlans.length === 0 ? (
          <div className="planning-sidebar-empty">
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <div className="planning-sidebar-section">
            <h4 className="planning-sidebar-section-title">{dragHint}</h4>
            <div className="planning-sidebar-programs-list">
              {filteredPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="planning-sidebar-program-item plan-structure-library-item"
                  draggable
                  onDragStart={(e) => handlePlanDragStart(e, plan)}
                  onDragEnd={handleDragEnd}
                >
                  <GlowingEffect spread={16} proximity={70} borderWidth={1} />
                  <div className="planning-sidebar-program-content" style={{ position: 'relative', zIndex: 2 }}>
                    <div
                      className="planning-sidebar-program-image-placeholder"
                      style={{ width: 28, height: 28, fontSize: 12 }}
                    >
                      {plan.title?.charAt(0) || 'P'}
                    </div>
                    <div className="planning-sidebar-program-info">
                      <span className="planning-sidebar-program-name">
                        {plan.title || `Plan ${plan.id?.slice(0, 8)}`}
                      </span>
                    </div>
                  </div>
                  <div className="plan-structure-drag-hint" style={{ position: 'relative', zIndex: 2 }}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M9 5L15 5M9 12L15 12M9 19L15 19"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
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

export default PlanningLibrarySidebar;
export { DRAG_TYPE_LIBRARY_SESSION, DRAG_TYPE_PLAN };
