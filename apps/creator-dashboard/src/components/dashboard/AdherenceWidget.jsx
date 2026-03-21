import { GlowingEffect, ProgressRing, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

function WidgetTitle({ children }) {
  return <p className="ds-widget-title">{children}</p>;
}

function WidgetEmpty({ message }) {
  return <p className="ds-widget-empty">{message}</p>;
}

export default function AdherenceWidget({ adherenceQuery, overallAdherence, byProgram }) {
  return (
    <>
      <GlowingEffect />
      <div className="ds-widget-inner ds-widget-inner--adherence">
        <WidgetTitle>Adherencia</WidgetTitle>
        {adherenceQuery.isLoading ? (
          <SkeletonCard />
        ) : adherenceQuery.isError ? (
          <InlineError
            message="No pudimos cargar los datos de adherencia. Toca para reintentar."
            field="adherence"
          />
        ) : overallAdherence === 0 && byProgram.length === 0 ? (
          <WidgetEmpty message="Sin datos de adherencia aun. Los veras cuando tus clientes completen sesiones." />
        ) : (
          <>
            <div className="ds-adherence-ring">
              <ProgressRing
                percent={overallAdherence}
                size={96}
                strokeWidth={6}
                color="rgba(255,255,255,0.85)"
                label={`${Math.round(overallAdherence)}%`}
              />
            </div>
            <p className="ds-widget-label">de adherencia promedio</p>
            {byProgram.length > 0 && (
              <div className="ds-adherence-breakdown">
                {byProgram.map(p => (
                  <div key={p.programId} className="ds-adherence-breakdown__item">
                    <span className="ds-adherence-breakdown__title">{p.title || 'Programa'}</span>
                    <span className="ds-adherence-breakdown__value">{p.adherence}%</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
