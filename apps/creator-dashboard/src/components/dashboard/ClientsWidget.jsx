import { useNavigate } from 'react-router-dom';
import { NumberTicker, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

export default function ClientsWidget({ revenueQuery, oneOnOne }) {
  const navigate = useNavigate();

  return (
    <div className="ds-widget-inner">
      <p className="ds-widget-title">Clientes activos</p>
      {revenueQuery.isLoading ? (
        <SkeletonCard />
      ) : revenueQuery.isError ? (
        <InlineError
          message="No pudimos cargar tus clientes. Toca para reintentar."
          field="clients"
        />
      ) : oneOnOne.clientCount === 0 ? (
        <p className="ds-widget-empty">Todavia no tienes clientes. Invita al primero desde Clientes.</p>
      ) : (
        <>
          <p className="ds-widget-number">
            <NumberTicker value={oneOnOne.clientCount} />
          </p>
          <p className="ds-widget-label">
            {oneOnOne.clientCount === 1 ? 'cliente activo' : 'clientes activos'}
            {oneOnOne.callCount > 0 && (
              <> · {oneOnOne.callCount} {oneOnOne.callCount === 1 ? 'llamada' : 'llamadas'}</>
            )}
          </p>
          <button className="ds-widget-link" onClick={() => navigate('/clientes')}>
            Ver todos →
          </button>
        </>
      )}
    </div>
  );
}
