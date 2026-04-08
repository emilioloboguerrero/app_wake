import { memo } from 'react';
import { NumberTicker, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

function DaysLeftBadge({ days }) {
  const urgent = days <= 7;
  return (
    <span
      className="ds-expiring-badge"
      style={{
        color: urgent ? 'rgba(248, 113, 113, 0.95)' : 'rgba(251, 191, 36, 0.9)',
        background: urgent ? 'rgba(248, 113, 113, 0.1)' : 'rgba(251, 191, 36, 0.08)',
        borderColor: urgent ? 'rgba(248, 113, 113, 0.2)' : 'rgba(251, 191, 36, 0.15)',
      }}
    >
      {days}d
    </span>
  );
}

function ExpiringAccessWidget({ isLoading, isError, expiringData }) {
  const expiring = expiringData?.expiring ?? [];
  const count = expiringData?.count ?? 0;

  return (
    <div className="ds-widget-inner">
      <p className="ds-widget-title">Accesos por vencer</p>
      {isLoading ? (
        <SkeletonCard />
      ) : isError ? (
        <InlineError message="No pudimos cargar los accesos." field="expiring" />
      ) : count === 0 ? (
        <p className="ds-widget-empty">Ningun cliente tiene acceso por vencer en los proximos 30 dias.</p>
      ) : (
        <>
          <p className="ds-widget-number">
            <NumberTicker value={count} />
          </p>
          <p className="ds-widget-label">{count === 1 ? 'acceso por vencer' : 'accesos por vencer'}</p>
          <div className="ds-expiring-list">
            {expiring.slice(0, 4).map((item, i) => (
              <div key={`${item.userId}-${item.courseId}-${i}`} className="ds-expiring-row">
                <div className="ds-expiring-row__info">
                  <span className="ds-expiring-row__name">{item.displayName}</span>
                  <span className="ds-expiring-row__course">{item.courseTitle}</span>
                </div>
                <DaysLeftBadge days={item.daysLeft} />
              </div>
            ))}
            {expiring.length > 4 && (
              <p className="ds-activity-more">y {expiring.length - 4} mas...</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(ExpiringAccessWidget);
