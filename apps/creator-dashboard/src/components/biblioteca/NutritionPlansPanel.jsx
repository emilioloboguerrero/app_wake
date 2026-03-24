import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { GlowingEffect, AnimatedList, NumberTicker, ProgressRing } from '../ui';
import PanelShell from './PanelShell';
import * as nutritionDb from '../../services/nutritionFirestoreService';
import { cacheConfig, queryKeys } from '../../config/queryClient';

function MacroRing({ label, grams, total, color }) {
  const percent = total > 0 ? Math.round((grams / total) * 100) : 0;
  return (
    <div className="bib-nutri-ring">
      <ProgressRing percent={percent} size={48} strokeWidth={4} color={color} />
      <span className="bib-nutri-ring-label">{label}</span>
      <span className="bib-nutri-ring-grams">{Number(grams || 0).toFixed(0)} g</span>
    </div>
  );
}

export default function NutritionPlansPanel({ searchQuery = '' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const creatorId = user?.uid ?? '';

  const [selectedId, setSelectedId] = useState(null);

  const { data: plans = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.nutrition.plans(creatorId),
    queryFn: () => nutritionDb.getPlansByCreator(creatorId),
    enabled: !!creatorId,
    ...cacheConfig.otherPrograms,
  });

  const selectedPlanQuery = useQuery({
    queryKey: queryKeys.nutrition.plan(creatorId, selectedId),
    queryFn: () => nutritionDb.getPlanById(creatorId, selectedId),
    enabled: !!selectedId && !!creatorId,
    ...cacheConfig.otherPrograms,
  });

  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return plans;
    return plans.filter((i) => (i.name ?? '').toLowerCase().includes(q));
  }, [plans, q]);

  const selectedDetail = selectedPlanQuery.data;
  const detailLoading = selectedPlanQuery.isLoading;

  const macros = useMemo(() => {
    if (!selectedDetail) return null;
    return {
      protein: selectedDetail.daily_protein_g ?? 0,
      carbs: selectedDetail.daily_carbs_g ?? 0,
      fat: selectedDetail.daily_fat_g ?? 0,
      calories: selectedDetail.daily_calories ?? 0,
    };
  }, [selectedDetail]);

  const totalMacroG = macros ? macros.protein + macros.carbs + macros.fat : 0;

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
      <div className="bib-nutri-master-detail">
        <div className="bib-nutri-left">
          {filtered.length === 0 ? (
            <div className="bib-nutri-list-empty">
              <p>{searchQuery ? `Sin resultados para «${searchQuery}»` : 'Sin planes.'}</p>
            </div>
          ) : (
            <AnimatedList stagger={50}>
              {filtered.map((item) => {
                const isSelected = selectedId === item.id;
                const kcal = item.daily_calories ?? null;
                return (
                  <div
                    key={item.id}
                    className={`bib-card bib-nutri-list-card ${isSelected ? 'bib-card--selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(isSelected ? null : item.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedId(isSelected ? null : item.id)}
                  >
                    <GlowingEffect spread={18} borderWidth={1} />
                    <span className="bib-nutri-card-name">{item.name}</span>
                    {kcal != null && kcal > 0 && <span className="bib-nutri-card-kcal">{kcal} kcal</span>}
                    {item.description && <span className="bib-nutri-card-meta">{item.description}</span>}
                  </div>
                );
              })}
            </AnimatedList>
          )}
        </div>

        <div className="bib-nutri-right">
          {!selectedId ? (
            <div className="bib-detail-empty">
              <div className="bib-detail-empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 000 4h6a2 2 0 000-4M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="bib-detail-empty-text">Selecciona un plan para ver sus detalles</p>
            </div>
          ) : detailLoading ? (
            <div className="bib-nutri-detail-skeletons">
              <div className="bib-skeleton-list" style={{ gap: 12 }}>
                {[1, 2, 3].map((i) => <div key={i} className="bib-card" style={{ height: 48 }} />)}
              </div>
            </div>
          ) : !selectedDetail ? (
            <div className="bib-detail-empty">
              <p className="bib-detail-empty-text">No se encontró el plan seleccionado.</p>
            </div>
          ) : (
            <>
              <div className="bib-nutri-detail" key={selectedId}>
                <div className="bib-nutri-detail-header">
                  <GlowingEffect spread={24} borderWidth={1} />
                  <h2 className="bib-nutri-detail-title">{selectedDetail.name}</h2>
                  {selectedDetail.description && <p className="bib-nutri-detail-desc">{selectedDetail.description}</p>}
                  <button
                    type="button"
                    className="bib-nutri-edit-btn"
                    onClick={() => navigate(`/nutrition/plans/${selectedId}`)}
                  >
                    Editar
                  </button>
                </div>
                {(selectedDetail.categories ?? []).length > 0 && (
                  <div className="bib-nutri-items">
                    <AnimatedList stagger={40}>
                      {(selectedDetail.categories ?? []).map((cat, i) => (
                        <div key={cat.id ?? i} className="bib-nutri-item">
                          <GlowingEffect spread={14} borderWidth={1} />
                          <span className="bib-nutri-item-name">{cat.label ?? `Categoría ${i + 1}`}</span>
                          <span className="bib-nutri-item-sub">
                            {(cat.options ?? []).length} opción{(cat.options ?? []).length !== 1 ? 'es' : ''}
                          </span>
                        </div>
                      ))}
                    </AnimatedList>
                  </div>
                )}
              </div>

              <div className="bib-nutri-macros">
                {macros && macros.calories > 0 ? (
                  <>
                    <div className="bib-nutri-cal-display">
                      <span className="bib-nutri-cal-value"><NumberTicker value={Math.round(macros.calories)} duration={900} /></span>
                      <span className="bib-nutri-cal-unit">kcal</span>
                    </div>
                    <div className="bib-nutri-rings">
                      <MacroRing label="Prot" grams={macros.protein} total={totalMacroG} color="rgba(100,200,150,0.85)" />
                      <MacroRing label="Carbs" grams={macros.carbs} total={totalMacroG} color="rgba(100,160,240,0.85)" />
                      <MacroRing label="Grasa" grams={macros.fat} total={totalMacroG} color="rgba(240,160,80,0.85)" />
                    </div>
                  </>
                ) : (
                  <p className="bib-nutri-macros-empty">Sin datos de macros</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </PanelShell>
  );
}
