import { NumberTicker, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

export default function SessionsWidget({ adherenceQuery, sessionsCompleted }) {
  return (
    <div className="ds-widget-inner">
      <p className="ds-widget-title">Sesiones completadas</p>
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
            <p className="ds-widget-empty">Tus clientes no han completado sesiones aun.</p>
          ) : (
            <p className="ds-widget-label">
              {sessionsCompleted === 1 ? 'sesión completada' : 'sesiones completadas'} · esta semana
            </p>
          )}
        </>
      )}
    </div>
  );
}
