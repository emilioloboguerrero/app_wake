import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useMissions, { isDismissed, dismissMissions, restoreMissions } from '../../hooks/useMissions';
import { Check, ArrowRight } from 'lucide-react';
import './MissionTrack.css';

export default function MissionTrack() {
  const { missions, completedCount, totalCount, allComplete, progress, celebrate } = useMissions();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(isDismissed);
  const [celebrating, setCelebrating] = useState(null);
  const prevCompleted = useRef(new Set());

  // Detect newly completed missions for celebration
  useEffect(() => {
    const nowCompleted = new Set(missions.filter(m => m.completed).map(m => m.id));
    for (const id of nowCompleted) {
      if (!prevCompleted.current.has(id)) {
        const mission = missions.find(m => m.id === id);
        if (mission && !mission.celebrated) {
          setCelebrating(id);
          celebrate(id);
          const timer = setTimeout(() => setCelebrating(null), 1600);
          return () => clearTimeout(timer);
        }
      }
    }
    prevCompleted.current = nowCompleted;
  }, [missions, celebrate]);

  // Auto-dismiss when all complete
  useEffect(() => {
    if (allComplete && !isDismissed()) {
      const timer = setTimeout(() => {
        setDismissed(true);
        dismissMissions();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [allComplete]);

  if (dismissed && !allComplete) {
    return (
      <button
        className="mt-restore"
        onClick={() => { setDismissed(false); restoreMissions(); }}
        title="Mostrar progreso"
      >
        <span className="mt-restore__label">Tu camino</span>
        <span className="mt-restore__badge">{completedCount}/{totalCount}</span>
      </button>
    );
  }

  if (dismissed && allComplete) return null;

  const nextMission = missions.find(m => !m.completed);

  return (
    <div className="mt-track">
      <div className="mt-header">
        <span className="mt-header__title">Tu camino</span>
      </div>

      {missions.map((m, i) => {
        const isNext = nextMission?.id === m.id;
        const isCelebrating = celebrating === m.id;
        return (
          <div
            key={m.id}
            className={[
              'mt-item',
              m.completed ? 'mt-item--done' : '',
              isCelebrating ? 'mt-item--celebrating' : '',
              isNext ? 'mt-item--next' : '',
            ].filter(Boolean).join(' ')}
            style={{ '--item-index': i }}
          >
            <div className="mt-item__check">
              {m.completed ? (
                <div className="mt-item__check-done">
                  <Check size={8} strokeWidth={3} />
                </div>
              ) : (
                <div className={`mt-item__check-empty ${isNext ? 'mt-item__check-empty--next' : ''}`} />
              )}
            </div>
            <span className="mt-item__title">{m.title}</span>
            {!m.completed && isNext && (
              <button
                className="mt-item__go"
                onClick={() => navigate(m.route)}
                aria-label={m.cta}
              >
                <ArrowRight size={10} />
              </button>
            )}
          </div>
        );
      })}

      <div className="mt-progress">
        <div className="mt-progress__fill" style={{ width: `${progress * 100}%` }} />
      </div>

      {allComplete && (
        <div className="mt-complete">
          <p className="mt-complete__text">Todo listo. Ya dominas lo esencial.</p>
        </div>
      )}
    </div>
  );
}
