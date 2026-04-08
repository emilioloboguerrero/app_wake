import { memo } from 'react';
import { SkeletonCard } from '../ui';
import AnimatedCircularProgressBar from '../ui/AnimatedCircularProgressBar';
import { InlineError } from '../ui/ErrorStates';

const MAX_PROGRAMS_SHOWN = 3;

function AdherenceWidget({ isLoading, isError, overallWorkoutAdherence, overallNutritionAdherence, byProgram }) {
  const visiblePrograms = (byProgram ?? []).slice(0, MAX_PROGRAMS_SHOWN);
  const hiddenCount = (byProgram ?? []).length - MAX_PROGRAMS_SHOWN;
  const hasNutrition = overallNutritionAdherence != null;

  return (
    <div className="ds-widget-inner ds-widget-inner--adherence">
      <p className="ds-widget-title">Adherencia</p>
      {isLoading ? (
        <SkeletonCard />
      ) : isError ? (
        <InlineError
          message="No pudimos cargar los datos de adherencia. Toca para reintentar."
          field="adherence"
        />
      ) : overallWorkoutAdherence === 0 && (!byProgram || byProgram.length === 0) ? (
        <p className="ds-widget-empty">Sin datos de adherencia aun. Los veras cuando tus clientes completen sesiones.</p>
      ) : (
        <>
          <div className="ds-adherence-rings">
            <div className="ds-adherence-ring">
              <AnimatedCircularProgressBar
                value={overallWorkoutAdherence}
                size={hasNutrition ? 60 : 72}
                strokeWidth={5}
                gaugePrimaryColor="rgba(255,255,255,0.85)"
                gaugeSecondaryColor="rgba(255,255,255,0.08)"
                label={`${Math.round(overallWorkoutAdherence)}%`}
              />
            </div>
            {hasNutrition && (
              <div className="ds-adherence-ring">
                <AnimatedCircularProgressBar
                  value={overallNutritionAdherence}
                  size={60}
                  strokeWidth={5}
                  gaugePrimaryColor="rgba(129,140,248,0.85)"
                  gaugeSecondaryColor="rgba(129,140,248,0.12)"
                  label={`${Math.round(overallNutritionAdherence)}%`}
                />
              </div>
            )}
          </div>
          <div className="ds-adherence-legend">
            <span className="ds-adherence-legend__item">
              <span className="ds-adherence-legend__dot ds-adherence-legend__dot--workout" />
              Entrenamiento
            </span>
            {hasNutrition && (
              <span className="ds-adherence-legend__item">
                <span className="ds-adherence-legend__dot ds-adherence-legend__dot--nutrition" />
                Nutricion
              </span>
            )}
          </div>
          {visiblePrograms.length > 0 && (
            <div className="ds-adherence-breakdown">
              {visiblePrograms.map(p => (
                <div key={p.programId} className="ds-adherence-breakdown__item">
                  <span className="ds-adherence-breakdown__title">{p.title || 'Programa'}</span>
                  <span className="ds-adherence-breakdown__values">
                    <span className="ds-adherence-breakdown__value">{p.workoutAdherence}%</span>
                    {p.nutritionAdherence != null && (
                      <span className="ds-adherence-breakdown__value ds-adherence-breakdown__value--nutrition">{p.nutritionAdherence}%</span>
                    )}
                  </span>
                </div>
              ))}
              {hiddenCount > 0 && (
                <p className="ds-adherence-breakdown__more">y {hiddenCount} mas...</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default memo(AdherenceWidget);
