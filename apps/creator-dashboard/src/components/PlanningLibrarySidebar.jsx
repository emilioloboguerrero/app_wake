import React, { useState, useEffect } from 'react';
import Input from './Input';
import libraryService from '../services/libraryService';
import plansService from '../services/plansService';
import './PlanningSidebar.css';

const LIBRARY_TAB_SESSIONS = 'sessions';
const LIBRARY_TAB_PLANS = 'plans';

const DRAG_TYPE_LIBRARY_SESSION = 'plan-structure/library-session';
const DRAG_TYPE_PLAN = 'planning/plan';

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
  const [librarySessions, setLibrarySessions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [isPulsing, setIsPulsing] = useState(false);

  // When parent triggers pulse (e.g. user chose "add from library"), switch to Sessions tab and play pulse once
  useEffect(() => {
    if (pulseTrigger == null) return;
    setActiveTab(LIBRARY_TAB_SESSIONS);
    // Small delay so tab switch paints before the pulse animation runs
    const start = setTimeout(() => setIsPulsing(true), 50);
    const end = setTimeout(() => setIsPulsing(false), 650);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [pulseTrigger]);

  // Load library sessions
  useEffect(() => {
    if (!creatorId || activeTab !== LIBRARY_TAB_SESSIONS) return;
    const load = async () => {
      try {
        setSessionsLoading(true);
        const sessions = await libraryService.getSessionLibrary(creatorId);
        setLibrarySessions(sessions || []);
      } catch (err) {
        console.error('Error loading library sessions:', err);
        setLibrarySessions([]);
      } finally {
        setSessionsLoading(false);
      }
    };
    load();
  }, [creatorId, activeTab]);

  // Load plans
  useEffect(() => {
    if (!creatorId || activeTab !== LIBRARY_TAB_PLANS) return;
    const load = async () => {
      try {
        setPlansLoading(true);
        const allPlans = await plansService.getPlansByCreator(creatorId);
        setPlans(allPlans || []);
      } catch (err) {
        console.error('Error loading plans:', err);
        setPlans([]);
      } finally {
        setPlansLoading(false);
      }
    };
    load();
  }, [creatorId, activeTab]);

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

  const handleSessionDragStart = (e, session) => {
    const payload = { type: DRAG_TYPE_LIBRARY_SESSION, librarySessionRef: session.id, title: session.title || 'Sesión' };
    console.log('[PlanningLibrarySidebar] dragStart SESSION', { sessionId: session.id, payload });
    e.dataTransfer.effectAllowed = 'all';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.currentTarget.classList.add('plan-structure-item-dragging');
  };

  const handlePlanDragStart = (e, plan) => {
    const payload = { type: DRAG_TYPE_PLAN, planId: plan.id, planTitle: plan.title };
    console.log('[PlanningLibrarySidebar] dragStart PLAN', { planId: plan.id, payload });
    e.dataTransfer.effectAllowed = 'all';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.currentTarget.classList.add('plan-structure-item-dragging');
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('plan-structure-item-dragging');
  };

  const title =
    activeTab === LIBRARY_TAB_SESSIONS ? 'Biblioteca de sesiones' : 'Biblioteca de planes';
  const searchPlaceholder =
    activeTab === LIBRARY_TAB_SESSIONS ? 'Buscar sesiones...' : 'Buscar planes...';
  const isLoading =
    activeTab === LIBRARY_TAB_SESSIONS ? sessionsLoading : plansLoading;
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

      <div className="planning-sidebar-header">
        <h3 className="planning-sidebar-title">{title}</h3>
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
                  <div
                    key={session.id}
                    className="planning-sidebar-program-item plan-structure-library-item"
                    draggable
                    onDragStart={(e) => handleSessionDragStart(e, session)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="planning-sidebar-program-content">
                      <div
                        className="planning-sidebar-program-image-placeholder"
                        style={{ width: 28, height: 28, fontSize: 12 }}
                      >
                        {session.title?.charAt(0) || 'S'}
                      </div>
                      <div className="planning-sidebar-program-info">
                        <span className="planning-sidebar-program-name">
                          {session.title || `Sesión ${session.id?.slice(0, 8)}`}
                        </span>
                      </div>
                    </div>
                    <div className="plan-structure-drag-hint">
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
                  <div className="planning-sidebar-program-content">
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
                  <div className="plan-structure-drag-hint">
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
