import { ProgressRing, SkeletonCard } from '../ui';
import { InlineError } from '../ui/ErrorStates';

const MAX_PROGRAMS_SHOWN = 3;

export default function AdherenceWidget({ adherenceQuery, overallAdherence, byProgram }) {
  const visiblePrograms = byProgram.slice(0, MAX_PROGRAMS_SHOWN);
  const hiddenCount = byProgram.length - MAX_PROGRAMS_SHOWN;

  return (
    <div className="ds-widget-inner ds-widget-inner--adherence">
      <p className="ds-widget-title">Adherencia</p>
      {adherenceQuery.isLoading ? (
        <SkeletonCard />
      ) : adherenceQuery.isError ? (
        <InlineError
          message="No pudimos cargar los datos de adherencia. Toca para reintentar."
          field="adherence"
        />
      ) : overallAdherence === 0 && byProgram.length === 0 ? (
        <p className="ds-widget-empty">Sin datos de adherencia aun. Los veras cuando tus clientes completen sesiones.</p>
      ) : (
        <>
          <div className="ds-adherence-ring">
            <ProgressRing
              percent={overallAdherence}
              size={72}
              strokeWidth={5}
              color="rgba(255,255,255,0.85)"
              label={`${Math.round(overallAdherence)}%`}
            />
          </div>
          <p className="ds-widget-label">de adherencia promedio</p>
          {visiblePrograms.length > 0 && (
            <div className="ds-adherence-breakdown">
              {visiblePrograms.map(p => (
                <div key={p.programId} className="ds-adherence-breakdown__item">
                  <span className="ds-adherence-breakdown__title">{p.title || 'Programa'}</span>
                  <span className="ds-adherence-breakdown__value">{p.adherence}%</span>
                </div>
              ))}
              {hiddenCount > 0 && (
                <p className="ds-adherence-breakdown__more">y {hiddenCount} más…</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
