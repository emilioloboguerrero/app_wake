import { SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

function formatTime(str) {
  if (!str) return '';
  // Handle HH:mm format
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

export default function CalendarPreviewWidget({ calendarQuery }) {
  const data = calendarQuery?.data?.data;
  const today = data?.today ?? [];
  const tomorrow = data?.tomorrow ?? [];

  return (
    <div className="ds-widget-inner">
      <p className="ds-widget-title">Agenda de hoy</p>
      {calendarQuery?.isLoading ? (
        <SkeletonCard />
      ) : calendarQuery?.isError ? (
        <InlineError message="No pudimos cargar la agenda." field="calendar" />
      ) : today.length === 0 && tomorrow.length === 0 ? (
        <p className="ds-widget-empty">No tienes llamadas hoy ni mañana. Disfruta el tiempo libre.</p>
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
              <p className="ds-timeline__section-label">Mañana</p>
              {tomorrow.map(e => <TimelineEvent key={e.id} event={e} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
