import React from 'react';
import { useBackgroundTasks } from '../../contexts/BackgroundTaskContext';
import './BackgroundTaskCard.css';

export default function BackgroundTaskCard() {
  const { tasks, removeTask, STATUS } = useBackgroundTasks();

  if (!tasks.length) return null;

  return (
    <div className="btc-stack" role="status" aria-live="polite">
      {tasks.map((task) => (
        <div key={task.id} className={`btc-card btc-card--${task.status}`}>
          <div className="btc-icon">
            {task.status === STATUS.RUNNING && (
              <svg className="btc-spinner" viewBox="0 0 20 20" width="16" height="16">
                <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
                <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2"
                  strokeLinecap="round" strokeDasharray="30 20" />
              </svg>
            )}
            {task.status === STATUS.DONE && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="rgba(74,222,128,0.85)" strokeWidth="1.5" />
                <path d="M5.5 8.2l1.8 1.8 3.2-3.5" stroke="rgba(74,222,128,0.85)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {task.status === STATUS.ERROR && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="rgba(239,68,68,0.85)" strokeWidth="1.5" />
                <path d="M6 6l4 4M10 6l-4 4" stroke="rgba(239,68,68,0.85)" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <span className="btc-label">{task.label}</span>
          {task.status !== STATUS.RUNNING && (
            <button
              type="button"
              className="btc-dismiss"
              onClick={() => removeTask(task.id)}
              aria-label="Descartar"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
