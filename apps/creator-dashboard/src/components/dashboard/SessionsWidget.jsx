import { GlowingEffect, NumberTicker, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

function WidgetTitle({ children }) {
  return <p className="ds-widget-title">{children}</p>;
}

function WidgetEmpty({ message }) {
  return <p className="ds-widget-empty">{message}</p>;
}

export default function SessionsWidget({ adherenceQuery, sessionsCompleted }) {
  return (
    <>
      <GlowingEffect />
      <div className="ds-widget-inner">
        <WidgetTitle>Sesiones completadas</WidgetTitle>
        {adherenceQuery.isLoading ? (
          <SkeletonCard />
        ) : adherenceQuery.isError ? (
          <InlineError
            message="No pudimos cargar las sesiones. Toca para reintentar."
            field="sessions"
          />
        ) : (
          <>
            <p className="ds-widget-number">
              <NumberTicker value={sessionsCompleted} />
            </p>
            {sessionsCompleted === 0 ? (
              <WidgetEmpty message="Tus clientes no han completado sesiones aun." />
            ) : (
              <p className="ds-widget-label">
                {sessionsCompleted === 1 ? 'sesion completada' : 'sesiones completadas'}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
