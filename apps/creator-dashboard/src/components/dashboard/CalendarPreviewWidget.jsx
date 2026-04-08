import { memo } from 'react';
import { SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

function formatTime(str) {
  if (!str) return '';
  if (str.includes(':') && str.length <= 5) return str;
  try {
    return new Date(str).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return str;
  }
}

function TimelineEvent({ event }) {
  return (
    <div className="ds-timeline-event">
      <div className="ds-timeline-event__time">{formatTime(event.startTime)}</div>
      <div className="ds-timeline-event__line">
        <span className="ds-timeline-event__dot" />
      </div>
      <div className="ds-timeline-event__info">
        <span className="ds-timeline-event__name">{event.clientName}</span>
        {event.endTime && (
          <span className="ds-timeline-event__range">
            {formatTime(event.startTime)} – {formatTime(event.endTime)}
          </span>
        )}
      </div>
    </div>
  );
}

function CalendarPreviewWidget({ isLoading, isError, calendarData }) {
  const today = calendarData?.today ?? [];
  const tomorrow = calendarData?.tomorrow ?? [];

  return (
    <div className="ds-widget-inner">
      <p className="ds-widget-title">Agenda de hoy</p>
      {isLoading ? (
        <SkeletonCard />
      ) : isError ? (
        <InlineError message="No pudimos cargar la agenda." field="calendar" />
      ) : today.length === 0 && tomorrow.length === 0 ? (
        <p className="ds-widget-empty">No tienes llamadas hoy ni manana. Disfruta el tiempo libre.</p>
      ) : (
        <div className="ds-timeline">
          {today.length > 0 && (
            <>
              <p className="ds-timeline__section-label">Hoy</p>
              {today.map(e => <TimelineEvent key={e.id} event={e} />)}
            </>
          )}
          {tomorrow.length > 0 && (
            <>
              <p className="ds-timeline__section-label">Manana</p>
              {tomorrow.map(e => <TimelineEvent key={e.id} event={e} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(CalendarPreviewWidget);
