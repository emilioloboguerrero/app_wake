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

export default function RecetasPanel({ searchQuery = '' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const creatorId = user?.uid ?? '';

  const [selectedId, setSelectedId] = useState(null);

  const { data: meals = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.nutrition.meals(creatorId),
    queryFn: () => nutritionDb.getMealsByCreator(creatorId),
    enabled: !!creatorId,
    ...cacheConfig.otherPrograms,
  });

  const selectedMealQuery = useQuery({
    queryKey: queryKeys.nutrition.meal(creatorId, selectedId),
    queryFn: () => nutritionDb.getMealById(creatorId, selectedId),
    enabled: !!selectedId && !!creatorId,
    ...cacheConfig.otherPrograms,
  });

  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return meals;
    return meals.filter((i) => (i.name ?? '').toLowerCase().includes(q));
  }, [meals, q]);

  const selectedDetail = selectedMealQuery.data;
  const detailLoading = selectedMealQuery.isLoading;

  const macros = useMemo(() => {
    if (!selectedDetail) return null;
    const its = Array.isArray(selectedDetail.items) ? selectedDetail.items : [];
    const protein = its.reduce((s, i) => s + (Number(i.protein) || 0), 0);
    const carbs = its.reduce((s, i) => s + (Number(i.carbs) || 0), 0);
    const fat = its.reduce((s, i) => s + (Number(i.fat) || 0), 0);
    const calories = its.reduce((s, i) => s + (Number(i.calories) || 0), 0);
    return { protein, carbs, fat, calories };
  }, [selectedDetail]);

  const totalMacroG = macros ? macros.protein + macros.carbs + macros.fat : 0;

  return (
    <PanelShell
      isLoading={isLoading && !meals.length}
      isError={isError}
      isEmpty={!meals.length && !isLoading}
      emptyTitle="Tu biblioteca de recetas esta vacia"
      emptySub="Crea tu primera receta y empieza a armar planes."
      emptyCta="+ Crear receta"
      onCta={() => navigate('/nutrition/meals/new')}
      onRetry={() => window.location.reload()}
    >
      <div className="bib-nutri-master-detail">
        <div className="bib-nutri-left">
          {filtered.length === 0 ? (
            <div className="bib-nutri-list-empty">
              <p>{searchQuery ? `Sin resultados para «${searchQuery}»` : 'Sin recetas.'}</p>
            </div>
          ) : (
            <AnimatedList stagger={50}>
              {filtered.map((item) => {
                const isSelected = selectedId === item.id;
                const kcal = Math.round((item.items || []).reduce((s, i) => s + (Number(i.calories) || 0), 0));
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
                    {kcal > 0 && <span className="bib-nutri-card-kcal">{kcal} kcal</span>}
                    <span className="bib-nutri-card-meta">
                      {(item.items ?? []).length} alimento{(item.items ?? []).length !== 1 ? 's' : ''}
                    </span>
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
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" fill="rgba(255,255,255,0.15)"/>
                </svg>
              </div>
              <p className="bib-detail-empty-text">Selecciona una receta para ver sus detalles</p>
            </div>
          ) : detailLoading ? (
            <div className="bib-nutri-detail-skeletons">
              <div className="bib-skeleton-list" style={{ gap: 12 }}>
                {[1, 2, 3].map((i) => <div key={i} className="bib-card" style={{ height: 48 }} />)}
              </div>
            </div>
          ) : !selectedDetail ? (
            <div className="bib-detail-empty">
              <p className="bib-detail-empty-text">No se encontró el elemento seleccionado.</p>
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
                    onClick={() => navigate(`/nutrition/meals/${selectedId}`)}
                  >
                    Editar
                  </button>
                </div>
                <div className="bib-nutri-items">
                  {(selectedDetail.items ?? []).length === 0 ? (
                    <p className="bib-nutri-no-items">Esta receta no tiene alimentos todavía.</p>
                  ) : (
                    <AnimatedList stagger={40}>
                      {(selectedDetail.items ?? []).map((item, i) => (
                        <div key={i} className="bib-nutri-item">
                          <GlowingEffect spread={14} borderWidth={1} />
                          <span className="bib-nutri-item-name">{item.name}</span>
                          <span className="bib-nutri-item-sub">{item.calories ?? 0} kcal</span>
                        </div>
                      ))}
                    </AnimatedList>
                  )}
                </div>
              </div>

              <div className="bib-nutri-macros">
                {macros ? (
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
