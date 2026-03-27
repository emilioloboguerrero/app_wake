import { useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { GlowingEffect, AnimatedList } from '../ui';
import PanelShell from './PanelShell';
import * as nutritionDb from '../../services/nutritionFirestoreService';
import { cacheConfig, queryKeys } from '../../config/queryClient';

const MACRO_COLORS = {
  protein: 'rgba(235,120,100,0.9)',
  carbs: 'rgba(220,170,90,0.85)',
  fat: 'rgba(200,180,150,0.5)',
};

function MacroDonut({ protein = 0, carbs = 0, fat = 0, size = 72 }) {
  const total = protein + carbs + fat;
  if (total === 0) return null;

  const strokeWidth = 13;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const pPct = protein / total;
  const cPct = carbs / total;
  const fPct = fat / total;

  const gap = 0.02;
  const segments = [
    { pct: pPct, color: MACRO_COLORS.protein },
    { pct: cPct, color: MACRO_COLORS.carbs },
    { pct: fPct, color: MACRO_COLORS.fat },
  ].filter((s) => s.pct > 0);

  const totalGap = gap * segments.length;
  const scale = segments.length > 1 ? 1 - totalGap : 1;

  let offset = 0;
  const arcs = segments.map((seg, i) => {
    const len = seg.pct * scale * circumference;
    const dashOffset = circumference - len;
    const rotation = -90 + offset * 360;
    const arc = { ...seg, len, dashOffset, rotation, key: i };
    offset += seg.pct * scale + (segments.length > 1 ? gap : 0);
    return arc;
  });

  const arcRefs = useRef([]);

  useEffect(() => {
    arcRefs.current.forEach((el, i) => {
      if (!el) return;
      el.style.transition = 'none';
      el.style.strokeDashoffset = `${circumference}`;
      requestAnimationFrame(() => {
        el.style.transition = 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)';
        el.style.strokeDashoffset = `${arcs[i].dashOffset}`;
      });
    });
  }, [protein, carbs, fat, circumference, arcs]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
      {arcs.map((arc) => (
        <circle
          key={arc.key}
          ref={(el) => { arcRefs.current[arc.key] = el; }}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={arc.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          transform={`rotate(${arc.rotation} ${center} ${center})`}
        />
      ))}
    </svg>
  );
}

export default function NutritionPlansPanel({ searchQuery = '' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const creatorId = user?.uid ?? '';

  const { data: plans = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.nutrition.plans(creatorId),
    queryFn: () => nutritionDb.getPlansByCreator(creatorId),
    enabled: !!creatorId,
    ...cacheConfig.otherPrograms,
  });

  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return plans;
    return plans.filter((i) => (i.name ?? '').toLowerCase().includes(q));
  }, [plans, q]);

  return (
    <PanelShell
      isLoading={isLoading && !plans.length}
      isError={isError}
      isEmpty={!plans.length && !isLoading}
      emptyTitle="Sin planes de nutricion"
      emptySub="Crea un plan y asignalo a tus clientes."
      emptyCta="+ Crear plan"
      onCta={() => navigate('/nutrition/plans/new')}
      onRetry={() => window.location.reload()}
    >
      <div className="bib-nutri-list">
        {filtered.length === 0 ? (
          <div className="bib-nutri-list-empty">
            <p>{searchQuery ? `Sin resultados para "${searchQuery}"` : 'Sin planes.'}</p>
          </div>
        ) : (
          <AnimatedList stagger={50}>
            {filtered.map((item) => {
              const kcal = item.daily_calories ?? 0;
              const p = item.daily_protein_g ?? 0;
              const c = item.daily_carbs_g ?? 0;
              const f = item.daily_fat_g ?? 0;
              const hasMacros = p + c + f > 0;

              return (
                <div
                  key={item.id}
                  className="bib-card bib-nutri-plan-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/nutrition/plans/${item.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/nutrition/plans/${item.id}`)}
                >
                  <GlowingEffect spread={18} borderWidth={1} />
                  <div className="bib-nutri-plan-card__left">
                    <span className="bib-nutri-card-name">{item.name}</span>
                    {item.description && <span className="bib-nutri-card-meta">{item.description}</span>}
                  </div>
                  {hasMacros && (
                    <div className="bib-nutri-plan-card__right">
                      <div className="bib-nutri-plan-card__macros">
                        <MacroDonut protein={p} carbs={c} fat={f} size={72} />
                        <div className="bib-nutri-plan-card__macro-labels">
                          <span className="bib-nutri-plan-card__macro" style={{ color: MACRO_COLORS.protein }}>
                            {Math.round(p)}P
                          </span>
                          <span className="bib-nutri-plan-card__macro" style={{ color: MACRO_COLORS.carbs }}>
                            {Math.round(c)}C
                          </span>
                          <span className="bib-nutri-plan-card__macro" style={{ color: MACRO_COLORS.fat }}>
                            {Math.round(f)}G
                          </span>
                        </div>
                      </div>
                      {kcal > 0 && (
                        <span className="bib-nutri-plan-card__kcal">{Math.round(kcal)} kcal</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </AnimatedList>
        )}
      </div>
    </PanelShell>
  );
}
