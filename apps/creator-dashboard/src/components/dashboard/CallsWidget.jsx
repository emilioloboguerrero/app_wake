import { GlowingEffect, NumberTicker, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

function WidgetTitle({ children }) {
  return <p className="ds-widget-title">{children}</p>;
}

function WidgetEmpty({ message }) {
  return <p className="ds-widget-empty">{message}</p>;
}

export default function CallsWidget({ bookingsQuery, callCountThisWeek, nextCallTime }) {
  return (
    <>
      <div className="ds-widget-inner">
        <WidgetTitle>Llamadas esta semana</WidgetTitle>
        {bookingsQuery.isLoading ? (
          <SkeletonCard />
        ) : bookingsQuery.isError ? (
          <InlineError
            message="No pudimos cargar las llamadas. Toca para reintentar."
            field="calls"
          />
        ) : (
          <>
            <p className="ds-widget-number">
              <NumberTicker value={callCountThisWeek} />
            </p>
            {callCountThisWeek === 0 ? (
              <WidgetEmpty message="Sin llamadas programadas. Configura tu disponibilidad." />
            ) : (
              <>
                <p className="ds-widget-label">
                  {callCountThisWeek === 1 ? 'llamada' : 'llamadas'}
                </p>
                {nextCallTime && (
                  <p className="ds-widget-next-call">Proxima: {nextCallTime}</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
