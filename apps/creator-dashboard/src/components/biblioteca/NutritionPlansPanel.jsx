import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../Modal';
import Input from '../Input';
import {
  GlowingEffect,
  SkeletonCard,
  AnimatedList,
  NumberTicker,
  ProgressRing,
  FullScreenError,
} from '../ui';
import * as nutritionDb from '../../services/nutritionFirestoreService';
import { cacheConfig, queryKeys } from '../../config/queryClient';

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

export default function NutritionPlansPanel({ searchQuery = '' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const creatorId = user?.uid ?? '';
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planFormName, setPlanFormName] = useState('');
  const [planFormCreating, setPlanFormCreating] = useState(false);

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

  const handleCreatePlanAndOpen = async () => {
    const name = planFormName.trim();
    if (!name || !creatorId) return;
    setPlanFormCreating(true);
    try {
      const planId = await nutritionDb.createPlan(creatorId, { name, description: '', categories: [] });
      queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.plans(creatorId) });
      setIsPlanModalOpen(false);
      setPlanFormName('');
      navigate(`/nutrition/plans/${planId}`);
    } catch (e) {
      showToast(e?.message || 'No pudimos crear el plan. Intenta de nuevo.', 'error');
    } finally {
      setPlanFormCreating(false);
    }
  };

  if (isLoading && !plans.length) {
    return (
      <div className="ns-list-skeletons">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (isError) {
    return <FullScreenError title="No pudimos cargar tus planes" message="Revisa tu conexion e intenta de nuevo." onRetry={() => window.location.reload()} />;
  }

  return (
    <>
      <div className="ns-panels">
        <aside className="ns-panel-left">
          <div className="ns-list">
            {filtered.length === 0 ? (
              <div className="ns-list-empty">
                {searchQuery ? (
                  <p>Sin resultados para «{searchQuery}»</p>
                ) : (
                  <p>Todavia no tienes planes de nutricion. Crea uno y asignalo a tus clientes.</p>
                )}
              </div>
            ) : (
              <AnimatedList stagger={50}>
                {filtered.map((item) => {
                  const isSelected = selectedId === item.id;
                  const kcal = item.daily_calories ?? null;
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
                      {kcal != null && kcal > 0 && <span className="ns-list-card-kcal">{kcal} kcal</span>}
                      {item.description && <span className="ns-list-card-meta">{item.description}</span>}
                    </div>
                  );
                })}
              </AnimatedList>
            )}
          </div>
        </aside>

        <section className="ns-panel-center">
          {!selectedId ? (
            <div className="ns-detail-empty">
              <div className="ns-detail-empty-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 000 4h6a2 2 0 000-4M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="ns-detail-empty-text">Selecciona un plan para ver sus detalles</p>
            </div>
          ) : detailLoading ? (
            <div className="ns-detail-skeletons">
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
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
                {selectedDetail.description && <p className="ns-detail-desc">{selectedDetail.description}</p>}
                <button
                  type="button"
                  className="ns-detail-edit-btn"
                  onClick={() => navigate(`/nutrition/plans/${selectedId}`)}
                >
                  Editar
                </button>
              </div>
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
        </section>

        <aside className="ns-panel-right">
          <div className="ns-macros-panel" style={{ position: 'relative' }}>
            <GlowingEffect spread={22} borderWidth={1} />
            {!selectedId ? (
              <p className="ns-macros-empty">Selecciona un elemento para ver los macros</p>
            ) : detailLoading ? (
              <div className="ns-macros-loading"><SkeletonCard /></div>
            ) : macros ? (
              <>
                <div className="ns-calories-display">
                  <span className="ns-calories-value"><NumberTicker value={Math.round(macros.calories)} duration={900} /></span>
                  <span className="ns-calories-unit">kcal</span>
                </div>
                <div className="ns-rings">
                  <MacroRing label="Prot" grams={macros.protein} total={totalMacroG} color="rgba(100,200,150,0.85)" />
                  <MacroRing label="Carbs" grams={macros.carbs} total={totalMacroG} color="rgba(100,160,240,0.85)" />
                  <MacroRing label="Grasa" grams={macros.fat} total={totalMacroG} color="rgba(240,160,80,0.85)" />
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
              <label className="propagate-option-title" htmlFor="bib-new-plan-name">Nombre del plan</label>
              <Input
                id="bib-new-plan-name"
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
            <button type="button" className="propagate-modal-btn propagate-modal-btn-dont" onClick={() => setIsPlanModalOpen(false)}>Cancelar</button>
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
    </>
  );
}

NutritionPlansPanel.openCreateModal = null;
