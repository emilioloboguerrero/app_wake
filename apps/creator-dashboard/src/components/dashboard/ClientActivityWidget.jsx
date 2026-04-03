import { memo } from 'react';
import { SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

const STATUS_CONFIG = {
  active:   { label: 'Activo',   dot: 'rgba(74, 222, 128, 0.9)' },
  inactive: { label: 'Inactivo', dot: 'rgba(251, 191, 36, 0.9)' },
  ghost:    { label: 'Fantasma', dot: 'rgba(248, 113, 113, 0.8)' },
};

function StatusDot({ status }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.ghost;
  return (
    <span
      className="ds-activity-dot"
      style={{ background: config.dot }}
      title={config.label}
    />
  );
}

function ClientActivityWidget({ isLoading, isError, activityData }) {
  const clients = activityData?.clients ?? [];
  const summary = activityData?.summary ?? { activeCount: 0, inactiveCount: 0, ghostCount: 0, total: 0 };

  return (
    <div className="ds-widget-inner">
      <p className="ds-widget-title">Actividad de clientes</p>
      {isLoading ? (
        <SkeletonCard />
      ) : isError ? (
        <InlineError message="No pudimos cargar la actividad." field="client-activity" />
      ) : summary.total === 0 ? (
        <p className="ds-widget-empty">Cuando tengas clientes, aqui veras quien esta entrenando.</p>
      ) : (
        <>
          <div className="ds-activity-summary">
            <span className="ds-activity-stat">
              <StatusDot status="active" />
              <span className="ds-activity-stat__num">{summary.activeCount}</span>
            </span>
            <span className="ds-activity-stat">
              <StatusDot status="inactive" />
              <span className="ds-activity-stat__num">{summary.inactiveCount}</span>
            </span>
            <span className="ds-activity-stat">
              <StatusDot status="ghost" />
              <span className="ds-activity-stat__num">{summary.ghostCount}</span>
            </span>
          </div>
          <div className="ds-activity-list">
            {clients.slice(0, 5).map(c => (
              <div key={c.userId} className="ds-activity-row">
                <StatusDot status={c.status} />
                <span className="ds-activity-row__name">{c.displayName}</span>
                <span className="ds-activity-row__count">
                  {c.sessionsThisWeek > 0 ? `${c.sessionsThisWeek} esta semana` : c.lastSessionDate ?? 'sin sesiones'}
                </span>
              </div>
            ))}
            {clients.length > 5 && (
              <p className="ds-activity-more">y {clients.length - 5} mas...</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(ClientActivityWidget);
