import { GlowingEffect, NumberTicker, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

function WidgetTitle({ children }) {
  return <p className="ds-widget-title">{children}</p>;
}

function WidgetEmpty({ message }) {
  return <p className="ds-widget-empty">{message}</p>;
}

export default function ClientsWidget({ revenueQuery, oneOnOne }) {
  return (
    <>
      <div className="ds-widget-inner">
        <WidgetTitle>Clientes activos</WidgetTitle>
        {revenueQuery.isLoading ? (
          <SkeletonCard />
        ) : revenueQuery.isError ? (
          <InlineError
            message="No pudimos cargar tus clientes. Toca para reintentar."
            field="clients"
          />
        ) : oneOnOne.clientCount === 0 ? (
          <WidgetEmpty message="Todavia no tienes clientes. Invita al primero desde Clientes." />
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
          </>
        )}
      </div>
    </>
  );
}
