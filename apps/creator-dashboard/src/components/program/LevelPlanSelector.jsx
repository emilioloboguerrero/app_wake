import { useNavigate } from 'react-router-dom';
import './LevelPlanSelector.css';

const LEVEL_LABELS = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

export default function LevelPlanSelector({ program }) {
  const navigate = useNavigate();
  const options = program?.levels?.options || Object.keys(program?.level_plans || {});
  const map = program?.level_plans || {};

  return (
    <div className="lps-wrap">
      <h3 className="lps-title">Planificaciones por nivel</h3>
      <p className="lps-hint">
        Este programa usa una planificacion distinta para cada nivel. Elige cual quieres
        editar: abriras su contenido (meses, semanas y sesiones) en el editor de planes.
      </p>
      <div className="lps-grid">
        {options.map((lvl) => {
          const planId = map[lvl];
          return (
            <button
              key={lvl}
              type="button"
              className="lps-card"
              disabled={!planId}
              onClick={() => planId && navigate(`/plans/${planId}`)}
            >
              <span className="lps-card__level">{LEVEL_LABELS[lvl] || lvl}</span>
              <span className="lps-card__cta">
                {planId ? 'Editar planificacion →' : 'Sin plan asignado'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
