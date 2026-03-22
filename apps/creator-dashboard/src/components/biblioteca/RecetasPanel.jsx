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
  InlineError,
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

export default function RecetasPanel({ searchQuery = '' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const creatorId = user?.uid ?? '';
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState(null);
  const [isNewMealModalOpen, setIsNewMealModalOpen] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [newMealCreating, setNewMealCreating] = useState(false);

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
      showToast(e?.message || 'No pudimos crear la receta. Intenta de nuevo.', 'error');
    } finally {
      setNewMealCreating(false);
    }
  };

  if (isLoading && !meals.length) {
    return (
      <div className="ns-list-skeletons">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (isError) {
    return <FullScreenError title="No pudimos cargar tus recetas" message="Revisa tu conexion e intenta de nuevo." onRetry={() => window.location.reload()} />;
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
                  <p>Tu biblioteca de recetas esta vacia. Crea tu primera receta y empieza a armar planes.</p>
                )}
              </div>
            ) : (
              <AnimatedList stagger={50}>
                {filtered.map((item) => {
                  const isSelected = selectedId === item.id;
                  const kcal = Math.round((item.items || []).reduce((s, i) => s + (Number(i.calories) || 0), 0));
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
                      {kcal > 0 && <span className="ns-list-card-kcal">{kcal} kcal</span>}
                      <span className="ns-list-card-meta">
                        {(item.items ?? []).length} alimento{(item.items ?? []).length !== 1 ? 's' : ''}
                      </span>
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
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" fill="rgba(255,255,255,0.15)"/>
                </svg>
              </div>
              <p className="ns-detail-empty-text">Selecciona una receta para ver sus detalles</p>
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
                  onClick={() => navigate(`/nutrition/meals/${selectedId}`)}
                >
                  Editar
                </button>
              </div>
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
        isOpen={isNewMealModalOpen}
        onClose={() => setIsNewMealModalOpen(false)}
        title="Nueva receta"
        containerClassName="propagate-modal-container"
        contentClassName="propagate-modal-content-wrapper"
      >
        <div className="propagate-modal-content new-meal-modal-content">
          <div className="propagate-modal-layout propagate-modal-layout-single new-meal-modal-layout">
            <div className="new-meal-modal-field">
              <label className="propagate-option-title" htmlFor="bib-new-meal-name">Nombre</label>
              <Input
                id="bib-new-meal-name"
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
            <button type="button" className="propagate-modal-btn propagate-modal-btn-dont" onClick={() => setIsNewMealModalOpen(false)}>Cancelar</button>
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
    </>
  );
}

RecetasPanel.openCreateModal = null;
