import { GlowingEffect, AnimatedList, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

function WidgetTitle({ children }) {
  return <p className="ds-widget-title">{children}</p>;
}

function WidgetEmpty({ message }) {
  return <p className="ds-widget-empty">{message}</p>;
}

function formatTime(iso) {
  if (!iso) return '\u2014';
  try {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '\u2014';
  }
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function CallItem({ booking }) {
  const clientName = booking?.clientName ?? booking?.userName ?? 'Cliente';
  const startAt = booking?.startAt ?? booking?.scheduledAt ?? null;
  return (
    <div className="ds-call-item">
      <div className="ds-call-item__avatar">{clientName.charAt(0).toUpperCase()}</div>
      <div className="ds-call-item__info">
        <span className="ds-call-item__name">{clientName}</span>
        <span className="ds-call-item__time">
          {startAt ? `${formatDate(startAt)} \u00B7 ${formatTime(startAt)}` : 'Sin horario'}
        </span>
      </div>
    </div>
  );
}

export default function UpcomingCallsWidget({ bookingsQuery, upcomingBookings }) {
  return (
    <>
      <div className="ds-widget-inner">
        <WidgetTitle>Proximas llamadas</WidgetTitle>
        {bookingsQuery.isLoading ? (
          <SkeletonCard />
        ) : bookingsQuery.isError ? (
          <InlineError
            message="No pudimos cargar las llamadas agendadas. Toca para reintentar."
            field="upcoming-calls"
          />
        ) : upcomingBookings.length === 0 ? (
          <WidgetEmpty message="No hay llamadas agendadas. Comparte tu link de disponibilidad con tus clientes." />
        ) : (
          <div className="ds-upcoming-list">
            <AnimatedList stagger={70}>
              {upcomingBookings.slice(0, 3).map((booking, i) => (
                <CallItem key={booking.id ?? i} booking={booking} />
              ))}
            </AnimatedList>
          </div>
        )}
      </div>
    </>
  );
}
