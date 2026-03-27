import { useMemo } from 'react';
import { ShimmerSkeleton, GlowingEffect } from '../ui';
import { Dumbbell, Plus } from 'lucide-react';
import './ClientPlanWeekView.css';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DAY_FULL = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

function getSessionStatus(session, sessionHistory) {
  if (!sessionHistory?.length) return 'upcoming';
  const match = sessionHistory.find(h =>
    h.sessionId === session.id || h.sessionTitle === session.title
  );
  if (match) return 'done';
  // Simple heuristic: if session has a date in the past, mark as skipped
  if (session.date) {
    const sessionDate = new Date(session.date);
    if (sessionDate < new Date()) return 'skipped';
  }
  return 'upcoming';
}

function getSessionStats(session, sessionHistory) {
  if (!sessionHistory?.length) return null;
  const match = sessionHistory.find(h =>
    h.sessionId === session.id || h.sessionTitle === session.title
  );
  if (!match) return null;
  const exercises = match.exercises || [];
  const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);
  const prCount = exercises.reduce((sum, ex) => {
    return sum + (ex.sets || []).filter(s => s.isPR || s.isPersonalRecord).length;
  }, 0);
  return {
    rpe: match.rpe ?? match.averageRpe ?? null,
    totalSets,
    prCount,
  };
}

const STATUS_LABELS = { done: 'Completada', skipped: 'No realizada', upcoming: 'Pendiente' };

function SessionCard({ session, sessionHistory, onClick }) {
  const exerciseCount = session.exercises?.length || 0;
  const muscles = session.exercises
    ?.flatMap(ex => ex.primaryMuscles || [])
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 2) || [];

  const status = getSessionStatus(session, sessionHistory);
  const stats = getSessionStats(session, sessionHistory);

  return (
    <div className="cpwv-session-wrap">
      <button className="cpwv-session" onClick={() => onClick(session)}>
        <GlowingEffect spread={20} proximity={80} borderWidth={1} />
        <div className="cpwv-session-inner">
          <div className="cpwv-session-header">
            <Dumbbell size={12} className="cpwv-session-icon" />
            <span className="cpwv-session-name">{session.title || 'Sesion'}</span>
            <span className={`cpwv-dot cpwv-dot--${status}`} />
          </div>
          <div className="cpwv-session-meta">
            {exerciseCount > 0 && (
              <span className="cpwv-session-count">{exerciseCount} ej.</span>
            )}
            {muscles.map((m, i) => (
              <span key={i} className="cpwv-session-muscle">{m}</span>
            ))}
          </div>
        </div>
      </button>

      {/* Hover tooltip */}
      <div className="cpwv-tooltip">
        <span className={`cpwv-tooltip-status cpwv-tooltip-status--${status}`}>
          {STATUS_LABELS[status]}
        </span>
        {stats && (
          <>
            {stats.rpe != null && (
              <span className="cpwv-tooltip-stat">RPE: {stats.rpe.toFixed ? stats.rpe.toFixed(1) : stats.rpe}</span>
            )}
            {stats.prCount > 0 && (
              <span className="cpwv-tooltip-stat cpwv-tooltip-stat--pr">{stats.prCount} PR{stats.prCount > 1 ? 's' : ''}</span>
            )}
            <span className="cpwv-tooltip-stat">{stats.totalSets} series</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function ClientPlanWeekView({ sessionsByDay, sessionHistory, isLoading, onSessionClick, clientName }) {
  if (isLoading) {
    return (
      <div className="cpwv-grid">
        {DAY_LABELS.map((_, i) => (
          <div key={i} className="cpwv-day cpwv-day--skeleton">
            <ShimmerSkeleton width={20} height={12} />
            <ShimmerSkeleton width="100%" height={60} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="cpwv-grid">
      {sessionsByDay.map((sessions, dayIndex) => (
        <div
          key={dayIndex}
          className={`cpwv-day ${sessions.length > 0 ? 'cpwv-day--has-sessions' : ''}`}
        >
          <div className="cpwv-day-header">
            <span className="cpwv-day-short">{DAY_LABELS[dayIndex]}</span>
            <span className="cpwv-day-full">{DAY_FULL[dayIndex]}</span>
          </div>

          <div className="cpwv-day-sessions">
            {sessions.map((session, i) => (
              <SessionCard
                key={session.id || i}
                session={session}
                sessionHistory={sessionHistory}
                onClick={onSessionClick}
              />
            ))}

            {sessions.length === 0 && (
              <div className="cpwv-day-empty">
                <Plus size={14} className="cpwv-day-empty-icon" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
