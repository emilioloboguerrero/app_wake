import { useNavigate } from 'react-router-dom';
import { NumberTicker, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

export default function CallsWidget({ bookingsQuery, callCountThisWeek, nextCallTime }) {
  const navigate = useNavigate();

  return (
    <div className="ds-widget-inner">
      <p className="ds-widget-title">Llamadas esta semana</p>
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
            <>
              <p className="ds-widget-empty">Sin llamadas programadas.</p>
              <button className="ds-widget-link" onClick={() => navigate('/availability')}>
                Configurar disponibilidad →
              </button>
            </>
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
  );
}
