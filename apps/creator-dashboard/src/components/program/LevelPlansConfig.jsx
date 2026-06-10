import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import programService from '../../services/programService';
import plansService from '../../services/plansService';
import { buildLevelConfig, isLevelConfigComplete } from '../../utils/levelPlans';
import { BentoCard } from '../ui/BentoGrid';
import GlowingEffect from '../ui/GlowingEffect';
import { queryKeys } from '../../config/queryClient';

const OPTIONS = ['principiante', 'intermedio', 'avanzado'];

const LEVEL_LABELS = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

export default function LevelPlansConfig({ programId, initial, creatorId }) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(!!initial?.levels);
  const [def, setDef] = useState(initial?.levels?.default ?? 'principiante');
  const [mapping, setMapping] = useState(initial?.level_plans ?? {});
  const [disabling, setDisabling] = useState(false);

  useEffect(() => {
    setEnabled(!!initial?.levels);
    setDef(initial?.levels?.default ?? 'principiante');
    setMapping(initial?.level_plans ?? {});
  }, [initial]);

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['library', 'plans', creatorId],
    queryFn: () => plansService.getPlansByCreator(creatorId),
    enabled: !!creatorId && enabled,
    staleTime: 10 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: () =>
      programService.updateProgram(
        programId,
        buildLevelConfig(OPTIONS, def, mapping)
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.programs.detail(programId) });
    },
  });

  const handleDisable = async () => {
    setDisabling(true);
    setEnabled(false);
    try {
      await programService.updateProgram(programId, { levels: null, level_plans: null });
      qc.invalidateQueries({ queryKey: queryKeys.programs.detail(programId) });
    } catch {
      setEnabled(true);
    } finally {
      setDisabling(false);
    }
  };

  useEffect(() => {
    if (!save.isSuccess) return;
    const t = setTimeout(() => save.reset(), 2500);
    return () => clearTimeout(t);
  }, [save.isSuccess]);

  const isComplete = isLevelConfigComplete(OPTIONS, mapping);

  return (
    <BentoCard className="gp-config__card gp-config__card--span-2 gp-cadence-card">
      <GlowingEffect spread={24} proximity={60} />
      <div className="gp-cadence-card__header">
        <h3>Planificaciones por nivel</h3>
        <button
          type="button"
          className={`gp-trial__toggle ${enabled ? 'gp-trial__toggle--active' : ''}`}
          disabled={disabling}
          onClick={() => (enabled ? handleDisable() : setEnabled(true))}
        >
          <span className="gp-trial__toggle-dot" />
          <span>{enabled ? 'Activas' : 'Inactivas'}</span>
        </button>
      </div>

      {!enabled && (
        <p className="gp-config__hint">
          Asigna un plan de entrenamiento distinto para cada nivel. Cuando un cliente entra al programa, recibe el plan de su nivel.
        </p>
      )}

      {enabled && (
        <div className="lpc-body">
          {plansLoading ? (
            <p className="gp-config__hint">Cargando planes...</p>
          ) : plans.length === 0 ? (
            <p className="gp-config__hint">
              No tienes planes creados. Crea al menos tres desde Biblioteca antes de configurar los niveles.
            </p>
          ) : (
            <>
              <div className="lpc-rows">
                {OPTIONS.map((opt) => (
                  <div key={opt} className="lpc-row">
                    <label htmlFor={`lpc-select-${opt}`} className="lpc-row__label">{LEVEL_LABELS[opt]}</label>
                    <select
                      id={`lpc-select-${opt}`}
                      className="lpc-row__select"
                      value={mapping[opt] ?? ''}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [opt]: e.target.value }))
                      }
                    >
                      <option value="">Elegir plan</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="lpc-row lpc-row--default">
                <label htmlFor="lpc-default" className="lpc-row__label">Nivel por defecto</label>
                <select
                  id="lpc-default"
                  className="lpc-row__select"
                  value={def}
                  onChange={(e) => setDef(e.target.value)}
                >
                  {OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {LEVEL_LABELS[o]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lpc-footer">
                <button
                  type="button"
                  className="gp-config__btn lpc-save-btn"
                  disabled={!isComplete || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? 'Guardando...' : 'Guardar'}
                </button>
                {!isComplete && (
                  <p className="gp-config__hint">
                    Asigna un plan a cada nivel para poder guardar.
                  </p>
                )}
                {save.isError && (
                  <p className="lpc-error" role="alert">
                    No pudimos guardar los niveles. Revisa tu conexión e intenta de nuevo.
                  </p>
                )}
                {save.isSuccess && (
                  <p className="lpc-success" role="status">
                    Niveles guardados.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </BentoCard>
  );
}
