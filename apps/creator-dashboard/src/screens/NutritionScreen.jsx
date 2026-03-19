import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import * as nutritionDb from '../services/nutritionFirestoreService';
import { cacheConfig, queryKeys } from '../config/queryClient';
import {
  TubelightNavBar,
  AnimatedList,
  GlowingEffect,
  SkeletonCard,
  NumberTicker,
  ProgressRing,
} from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import '../components/PropagateChangesModal.css';
import './NutritionScreen.css';

const TAB_ITEMS = [
  { id: 'recetas', label: 'Recetas' },
  { id: 'planes', label: 'Planes' },
];

function MacroRing({ label, grams, total, color }) {
  const percent = total > 0 ? Math.round((grams / total) * 100) : 0;
  return (
    <div className="ns-macro-ring">
      <ProgressRing percent={percent} size={64} strokeWidth={5} color={color} />
      <div className="ns-macro-ring-info">
        <span className="ns-macro-ring-label">{label}</span>
        <span className="ns-macro-ring-grams">{Number(grams || 0).toFixed(0)} g</span>
      </div>
    </div>
  );
}

function DeltaBadge({ actual, target, label }) {
  if (target == null || actual == null) return null;
  const diff = actual - target;
  const pct = target > 0 ? Math.abs(diff) / target : 0;
  let cls = 'ns-delta--green';
  if (pct > 0.2) cls = 'ns-delta--red';
  else if (pct > 0.1) cls = 'ns-delta--amber';
  const sign = diff >= 0 ? '+' : '';
  return (
    <div className="ns-delta-row">
      <span className="ns-delta-label">{label}</span>
      <span className="ns-delta-values">
        <span className="ns-delta-actual">{Math.round(actual)}</span>
        <span className="ns-delta-sep">/</span>
        <span className="ns-delta-target">{Math.round(target)}</span>
        <span className={`ns-delta-badge ${cls}`}>{sign}{Math.round(diff)}</span>
      </span>
    </div>
  );
}

export default function NutritionScreen({ clientId = null }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const creatorId = user?.uid ?? '';
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('recetas');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [isNewMealModalOpen, setIsNewMealModalOpen] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [newMealCreating, setNewMealCreating] = useState(false);

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planFormName, setPlanFormName] = useState('');
  const [planFormCreating, setPlanFormCreating] = useState(false);

  const nutritionCache = cacheConfig.otherPrograms;

  const { data: meals = [], isLoading: mealsLoading } = useQuery({
    queryKey: queryKeys.nutrition.meals(creatorId),
    queryFn: () => nutritionDb.getMealsByCreator(creatorId),
    enabled: !!creatorId,
    ...nutritionCache,
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: queryKeys.nutrition.plans(creatorId),
    queryFn: () => nutritionDb.getPlansByCreator(creatorId),
    enabled: !!creatorId,
    ...nutritionCache,
  });

  const selectedMealQuery = useQuery({
    queryKey: queryKeys.nutrition.meal(creatorId, selectedId),
    queryFn: () => nutritionDb.getMealById(creatorId, selectedId),
    enabled: activeTab === 'recetas' && !!selectedId && !!creatorId,
    ...nutritionCache,
  });

  const selectedPlanQuery = useQuery({
    queryKey: queryKeys.nutrition.plan(creatorId, selectedId),
    queryFn: () => nutritionDb.getPlanById(creatorId, selectedId),
    enabled: activeTab === 'planes' && !!selectedId && !!creatorId,
    ...nutritionCache,
  });

  const clientDiaryQuery = useQuery({
    queryKey: queryKeys.nutrition.diary(clientId, new Date().toISOString().slice(0, 10)),
    queryFn: () => nutritionDb.getDiaryEntries(clientId, new Date().toISOString().slice(0, 10)),
    enabled: !!clientId,
    ...nutritionCache,
  });

  const isLoading = activeTab === 'recetas' ? mealsLoading : plansLoading;
  const items = activeTab === 'recetas' ? meals : plans;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => (i.name ?? '').toLowerCase().includes(q));
  }, [items, searchQuery]);

  const selectedDetail =
    activeTab === 'recetas' ? selectedMealQuery.data : selectedPlanQuery.data;
  const detailLoading =
    activeTab === 'recetas' ? selectedMealQuery.isLoading : selectedPlanQuery.isLoading;

  const macros = useMemo(() => {
    if (!selectedDetail) return null;
    if (activeTab === 'recetas') {
      const its = Array.isArray(selectedDetail.items) ? selectedDetail.items : [];
      const protein = its.reduce((s, i) => s + (Number(i.protein) || 0), 0);
      const carbs = its.reduce((s, i) => s + (Number(i.carbs) || 0), 0);
      const fat = its.reduce((s, i) => s + (Number(i.fat) || 0), 0);
      const calories = its.reduce((s, i) => s + (Number(i.calories) || 0), 0);
      return { protein, carbs, fat, calories };
    }
    return {
      protein: selectedDetail.daily_protein_g ?? 0,
      carbs: selectedDetail.daily_carbs_g ?? 0,
      fat: selectedDetail.daily_fat_g ?? 0,
      calories: selectedDetail.daily_calories ?? 0,
    };
  }, [selectedDetail, activeTab]);

  const totalMacroG = macros ? macros.protein + macros.carbs + macros.fat : 0;

  const diaryTotals = useMemo(() => {
    if (!clientId || !clientDiaryQuery.data) return null;
    const entries = clientDiaryQuery.data;
    return {
      calories: entries.reduce((s, e) => s + (Number(e.calories) || 0), 0),
      protein: entries.reduce((s, e) => s + (Number(e.protein) || 0), 0),
      carbs: entries.reduce((s, e) => s + (Number(e.carbs) || 0), 0),
      fat: entries.reduce((s, e) => s + (Number(e.fat) || 0), 0),
    };
  }, [clientId, clientDiaryQuery.data]);

  const planTarget = useMemo(() => {
    if (!clientId || activeTab !== 'planes' || !selectedDetail) return null;
    return {
      calories: selectedDetail.daily_calories ?? null,
      protein: selectedDetail.daily_protein_g ?? null,
      carbs: selectedDetail.daily_carbs_g ?? null,
      fat: selectedDetail.daily_fat_g ?? null,
    };
  }, [clientId, activeTab, selectedDetail]);

  const handleTabChange = (id) => {
    setActiveTab(id);
    setSelectedId(null);
    setSearchQuery('');
  };

  const handleCreateMealAndOpen = async () => {
    const name = newMealName.trim();
    if (!name || !creatorId) return;
    setNewMealCreating(true);
    try {
      const mealId = await nutritionDb.createMeal(creatorId, { name, items: [] });
      queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.meals(creatorId) });
      setIsNewMealModalOpen(false);
      setNewMealName('');
      navigate(`/nutrition/meals/${mealId}`);
    } catch (e) {
      showToast(e?.message || 'Error al crear la receta', 'error');
    } finally {
      setNewMealCreating(false);
    }
  };

  const handleCreatePlanAndOpen = async () => {
    const name = planFormName.trim();
    if (!name || !creatorId) return;
    setPlanFormCreating(true);
    try {
      const planId = await nutritionDb.createPlan(creatorId, {
        name,
        description: '',
        categories: [],
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.plans(creatorId) });
      setIsPlanModalOpen(false);
      setPlanFormName('');
      navigate(`/nutrition/plans/${planId}`);
    } catch (e) {
      showToast(e?.message || 'Error al crear el plan', 'error');
    } finally {
      setPlanFormCreating(false);
    }
  };

  return (
    <DashboardLayout screenName="Nutrición">
      <div className="ns-root">

        {/* ── Nav bar ─────────────────────────────────────────── */}
        <div className="ns-navbar-row">
          <TubelightNavBar
            items={TAB_ITEMS}
            activeId={activeTab}
            onSelect={handleTabChange}
          />
          <button
            type="button"
            className="ns-add-btn"
            onClick={() => {
              if (activeTab === 'recetas') {
                setNewMealName('');
                setIsNewMealModalOpen(true);
              } else {
                setPlanFormName('');
                setIsPlanModalOpen(true);
              }
            }}
          >
            <span className="ns-add-btn-plus">+</span>
            {activeTab === 'recetas' ? 'Nueva receta' : 'Nuevo plan'}
          </button>
        </div>

        {/* ── 3-panel layout ──────────────────────────────────── */}
        <div className="ns-panels">

          {/* Left panel — search + list */}
          <aside className="ns-panel-left">
            <div className="ns-search-wrap">
              <svg className="ns-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <input
                type="text"
                className="ns-search-input"
                placeholder={activeTab === 'recetas' ? 'Buscar recetas…' : 'Buscar planes…'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="ns-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                >
                  ×
                </button>
              )}
            </div>

            <div className="ns-list">
              {isLoading ? (
                <div className="ns-list-skeletons">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonCard key={i} className="ns-list-skeleton" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="ns-list-empty">
                  {searchQuery ? (
                    <p>Sin resultados para «{searchQuery}»</p>
                  ) : activeTab === 'recetas' ? (
                    <p>Aún no tienes recetas. Crea tu primera para empezar.</p>
                  ) : (
                    <p>Aún no tienes planes nutricionales.</p>
                  )}
                </div>
              ) : (
                <AnimatedList stagger={50}>
                  {filtered.map((item) => {
                    const isSelected = selectedId === item.id;
                    const kcal =
                      activeTab === 'recetas'
                        ? Math.round((item.items || []).reduce((s, i) => s + (Number(i.calories) || 0), 0))
                        : (item.daily_calories ?? null);
                    return (
                      <div
                        key={item.id}
                        className={`ns-list-card ${isSelected ? 'ns-list-card--selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(isSelected ? null : item.id)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelectedId(isSelected ? null : item.id)}
                        style={{ position: 'relative' }}
                      >
                        <GlowingEffect spread={18} borderWidth={1} />
                        <span className="ns-list-card-name">{item.name}</span>
                        {kcal != null && kcal > 0 && (
                          <span className="ns-list-card-kcal">{kcal} kcal</span>
                        )}
                        {activeTab === 'recetas' && (
                          <span className="ns-list-card-meta">
                            {(item.items ?? []).length} alimento{(item.items ?? []).length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {activeTab === 'planes' && item.description ? (
                          <span className="ns-list-card-meta">{item.description}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </AnimatedList>
              )}
            </div>
          </aside>

          {/* Center panel — detail */}
          <section className="ns-panel-center">
            {!selectedId ? (
              <div className="ns-detail-empty">
                <div className="ns-detail-empty-icon">
                  {activeTab === 'recetas' ? (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" fill="rgba(255,255,255,0.15)"/>
                    </svg>
                  ) : (
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 000 4h6a2 2 0 000-4M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <p className="ns-detail-empty-text">
                  {activeTab === 'recetas'
                    ? 'Selecciona una receta para ver sus detalles'
                    : 'Selecciona un plan para ver sus detalles'}
                </p>
              </div>
            ) : detailLoading ? (
              <div className="ns-detail-skeletons">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : !selectedDetail ? (
              <div className="ns-detail-empty">
                <p className="ns-detail-empty-text">No se encontró el elemento seleccionado.</p>
              </div>
            ) : (
              <div className="ns-detail" key={selectedId}>
                <div className="ns-detail-header" style={{ position: 'relative' }}>
                  <GlowingEffect spread={24} borderWidth={1} />
                  <h2 className="ns-detail-title">{selectedDetail.name}</h2>
                  {selectedDetail.description && (
                    <p className="ns-detail-desc">{selectedDetail.description}</p>
                  )}
                  <button
                    type="button"
                    className="ns-detail-edit-btn"
                    onClick={() =>
                      navigate(
                        activeTab === 'recetas'
                          ? `/nutrition/meals/${selectedId}`
                          : `/nutrition/plans/${selectedId}`
                      )
                    }
                  >
                    Editar
                  </button>
                </div>

                {activeTab === 'recetas' && (
                  <div className="ns-detail-items">
                    {(selectedDetail.items ?? []).length === 0 ? (
                      <p className="ns-detail-no-items">Esta receta no tiene alimentos todavía.</p>
                    ) : (
                      <AnimatedList stagger={40}>
                        {(selectedDetail.items ?? []).map((item, i) => (
                          <div key={i} className="ns-detail-item" style={{ position: 'relative' }}>
                            <GlowingEffect spread={14} borderWidth={1} />
                            <span className="ns-detail-item-name">{item.name}</span>
                            <span className="ns-detail-item-kcal">{item.calories ?? 0} kcal</span>
                          </div>
                        ))}
                      </AnimatedList>
                    )}
                  </div>
                )}

                {activeTab === 'planes' && (
                  <div className="ns-detail-plan-meta">
                    {(selectedDetail.categories ?? []).length > 0 && (
                      <div className="ns-detail-categories">
                        {(selectedDetail.categories ?? []).map((cat, i) => (
                          <div key={cat.id ?? i} className="ns-detail-category" style={{ position: 'relative' }}>
                            <GlowingEffect spread={14} borderWidth={1} />
                            <span className="ns-detail-category-label">{cat.label ?? `Categoría ${i + 1}`}</span>
                            <span className="ns-detail-category-count">
                              {(cat.options ?? []).length} opción{(cat.options ?? []).length !== 1 ? 'es' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Right panel — macros */}
          <aside className="ns-panel-right">
            {clientId && planTarget && diaryTotals ? (
              <div className="ns-real-vs-target" style={{ position: 'relative' }}>
                <GlowingEffect spread={20} borderWidth={1} />
                <p className="ns-rvt-title">Real vs objetivo</p>
                <DeltaBadge
                  label="Calorías"
                  actual={diaryTotals.calories}
                  target={planTarget.calories}
                />
                <DeltaBadge
                  label="Proteína (g)"
                  actual={diaryTotals.protein}
                  target={planTarget.protein}
                />
                <DeltaBadge
                  label="Carbos (g)"
                  actual={diaryTotals.carbs}
                  target={planTarget.carbs}
                />
                <DeltaBadge
                  label="Grasa (g)"
                  actual={diaryTotals.fat}
                  target={planTarget.fat}
                />
              </div>
            ) : clientId && clientDiaryQuery.isLoading ? (
              <SkeletonCard className="ns-rvt-skeleton" />
            ) : null}

            <div className="ns-macros-panel" style={{ position: 'relative' }}>
              <GlowingEffect spread={22} borderWidth={1} />
              {!selectedId ? (
                <p className="ns-macros-empty">Selecciona un elemento para ver los macros</p>
              ) : detailLoading ? (
                <div className="ns-macros-loading">
                  <SkeletonCard />
                </div>
              ) : macros ? (
                <>
                  <div className="ns-calories-display">
                    <span className="ns-calories-value">
                      <NumberTicker value={Math.round(macros.calories)} duration={900} />
                    </span>
                    <span className="ns-calories-unit">kcal</span>
                  </div>
                  <div className="ns-rings">
                    <MacroRing
                      label="Prot"
                      grams={macros.protein}
                      total={totalMacroG}
                      color="rgba(100,200,150,0.85)"
                    />
                    <MacroRing
                      label="Carbs"
                      grams={macros.carbs}
                      total={totalMacroG}
                      color="rgba(100,160,240,0.85)"
                    />
                    <MacroRing
                      label="Grasa"
                      grams={macros.fat}
                      total={totalMacroG}
                      color="rgba(240,160,80,0.85)"
                    />
                  </div>
                  <div className="ns-macro-totals">
                    <div className="ns-macro-total-row">
                      <span className="ns-macro-total-dot ns-macro-total-dot--protein" />
                      <span className="ns-macro-total-name">Proteína</span>
                      <span className="ns-macro-total-val">{Number(macros.protein).toFixed(0)} g</span>
                    </div>
                    <div className="ns-macro-total-row">
                      <span className="ns-macro-total-dot ns-macro-total-dot--carbs" />
                      <span className="ns-macro-total-name">Carbohidratos</span>
                      <span className="ns-macro-total-val">{Number(macros.carbs).toFixed(0)} g</span>
                    </div>
                    <div className="ns-macro-total-row">
                      <span className="ns-macro-total-dot ns-macro-total-dot--fat" />
                      <span className="ns-macro-total-name">Grasa</span>
                      <span className="ns-macro-total-val">{Number(macros.fat).toFixed(0)} g</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="ns-macros-empty">Sin datos de macros disponibles</p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ── New meal modal ─────────────────────────────────────── */}
      <Modal
        isOpen={isNewMealModalOpen}
        onClose={() => setIsNewMealModalOpen(false)}
        title="Nueva receta"
        containerClassName="propagate-modal-container"
        contentClassName="propagate-modal-content-wrapper"
      >
        <div className="propagate-modal-content new-meal-modal-content">
          <div className="propagate-modal-layout propagate-modal-layout-single new-meal-modal-layout">
            <div className="new-meal-modal-field">
              <label className="propagate-option-title" htmlFor="ns-new-meal-name">Nombre</label>
              <Input
                id="ns-new-meal-name"
                value={newMealName}
                onChange={(e) => setNewMealName(e.target.value)}
                placeholder="ej. Desayuno proteico"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newMealName.trim() && creatorId) handleCreateMealAndOpen();
                  }
                }}
              />
            </div>
          </div>
          <div className="propagate-modal-footer">
            <button
              type="button"
              className="propagate-modal-btn propagate-modal-btn-dont"
              onClick={() => setIsNewMealModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="propagate-modal-btn propagate-modal-btn-propagate"
              onClick={handleCreateMealAndOpen}
              disabled={!newMealName.trim() || newMealCreating}
            >
              {newMealCreating ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── New plan modal ──────────────────────────────────────── */}
      <Modal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        title="Nuevo plan"
        containerClassName="propagate-modal-container"
        contentClassName="propagate-modal-content-wrapper"
      >
        <div className="propagate-modal-content new-meal-modal-content">
          <div className="propagate-modal-layout propagate-modal-layout-single new-meal-modal-layout">
            <div className="new-meal-modal-field">
              <label className="propagate-option-title" htmlFor="ns-new-plan-name">Nombre del plan</label>
              <Input
                id="ns-new-plan-name"
                value={planFormName}
                onChange={(e) => setPlanFormName(e.target.value)}
                placeholder="ej. Plan definición"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (planFormName.trim() && creatorId) handleCreatePlanAndOpen();
                  }
                }}
              />
            </div>
          </div>
          <div className="propagate-modal-footer">
            <button
              type="button"
              className="propagate-modal-btn propagate-modal-btn-dont"
              onClick={() => setIsPlanModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="propagate-modal-btn propagate-modal-btn-propagate"
              onClick={handleCreatePlanAndOpen}
              disabled={!planFormName.trim() || planFormCreating}
            >
              {planFormCreating ? 'Creando…' : 'Crear y editar'}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
