import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import * as nutritionDb from '../services/nutritionFirestoreService';
import logger from '../utils/logger';
import { useToast } from '../contexts/ToastContext';
import '../components/PropagateChangesModal.css';
import './NutritionScreen.css';

export default function NutritionScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const creatorId = user?.uid ?? '';

  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('recetas');

  const [mealSearchQuery, setMealSearchQuery] = useState('');
  const [isNewMealModalOpen, setIsNewMealModalOpen] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [newMealCreating, setNewMealCreating] = useState(false);

  const [planSearchQuery, setPlanSearchQuery] = useState('');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planFormName, setPlanFormName] = useState('');
  const [planFormCreating, setPlanFormCreating] = useState(false);

  const { data: meals = [], isLoading: mealsLoading } = useQuery({
    queryKey: ['nutrition', 'meals', creatorId],
    queryFn: () => nutritionDb.getMealsByCreator(creatorId),
    enabled: !!creatorId,
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['nutrition', 'plans', creatorId],
    queryFn: () => nutritionDb.getPlansByCreator(creatorId),
    enabled: !!creatorId,
  });

  const handleCreateMealAndOpen = async () => {
    const name = newMealName.trim();
    if (!name || !creatorId) return;
    setNewMealCreating(true);
    try {
      const mealId = await nutritionDb.createMeal(creatorId, { name, items: [] });
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'meals', creatorId] });
      setIsNewMealModalOpen(false);
      setNewMealName('');
      navigate(`/nutrition/meals/${mealId}`);
    } catch (e) {
      logger.error(e);
      showToast(e?.message || 'Error al crear la receta', 'error');
    } finally {
      setNewMealCreating(false);
    }
  };

  async function handleCreatePlanAndOpen() {
    const name = planFormName.trim();
    if (!name || !creatorId) return;
    setPlanFormCreating(true);
    try {
      const planId = await nutritionDb.createPlan(creatorId, {
        name,
        description: '',
        categories: [],
      });
      queryClient.invalidateQueries({ queryKey: ['nutrition', 'plans', creatorId] });
      setIsPlanModalOpen(false);
      setPlanFormName('');
      navigate(`/nutrition/plans/${planId}`);
    } catch (e) {
      logger.error(e);
      showToast(e?.message || 'Error al crear el plan', 'error');
    } finally {
      setPlanFormCreating(false);
    }
  }

  const filteredMeals = mealSearchQuery.trim()
    ? meals.filter((m) => m.name?.toLowerCase().includes(mealSearchQuery.toLowerCase()))
    : meals;
  const filteredPlans = planSearchQuery.trim()
    ? plans.filter((p) => p.name?.toLowerCase().includes(planSearchQuery.toLowerCase()))
    : plans;

  const primaryLabels = { recetas: 'Nueva receta', planes: 'Nuevo plan' };

  return (
    <DashboardLayout screenName="Nutrición">
      <div className="nutrition-screen">

        {/* Page header */}
        <div className="nutrition-page-header">
          <div className="nutrition-page-header-text">
            <h1 className="nutrition-page-title">Nutrición</h1>
            <p className="nutrition-page-subtitle">Tus planes nutricionales</p>
          </div>
          <button
            type="button"
            className="nutrition-primary-btn"
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
            <span>+</span>
            {primaryLabels[activeTab]}
          </button>
        </div>

        {/* Tab navigation */}
        <nav className="nutrition-tabs">
          {[
            { id: 'recetas', label: 'Recetas' },
            { id: 'planes', label: 'Planes' },
          ].map((t) => (
            <button
              key={t.id}
              className={`nutrition-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* ── Recetas tab ── */}
        {activeTab === 'recetas' && (
          <div className="nutrition-tab-content">
            <section className="nutrition-section">
              <div className="nutrition-section-header">
                <h2 className="nutrition-section-title">Recetas</h2>
                <div className="nutrition-header-actions">
                  <button
                    type="button"
                    className="nutrition-pill"
                    onClick={() => {
                      setNewMealName('');
                      setIsNewMealModalOpen(true);
                    }}
                    title="Nueva receta"
                  >
                    <span className="nutrition-pill-icon">+</span>
                  </button>
                  <button type="button" className="nutrition-pill" title="Editar">
                    <span className="nutrition-pill-text">Editar</span>
                  </button>
                </div>
              </div>
              <div className="nutrition-search-container">
                <div className="nutrition-search-input-container">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="nutrition-search-icon">
                    <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    type="text"
                    className="nutrition-search-input"
                    placeholder="Buscar recetas…"
                    value={mealSearchQuery}
                    onChange={(e) => setMealSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              {mealsLoading ? (
                <div className="nutrition-skeleton-grid">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="nutrition-skeleton-card">
                      <div className="nutrition-skeleton-line nutrition-skeleton-line-title" />
                      <div className="nutrition-skeleton-line nutrition-skeleton-line-meta" />
                    </div>
                  ))}
                </div>
              ) : filteredMeals.length === 0 ? (
                <div className="nutrition-empty">
                  <div className="nutrition-empty-icon">🥗</div>
                  <h3 className="nutrition-empty-title">
                    {mealSearchQuery ? 'Sin resultados' : 'Aún no tienes recetas'}
                  </h3>
                  <p className="nutrition-empty-sub">
                    {mealSearchQuery
                      ? 'Intenta con otro término de búsqueda'
                      : 'Crea tu primera receta para empezar a construir tu biblioteca nutricional'}
                  </p>
                  {!mealSearchQuery && (
                    <button
                      type="button"
                      className="nutrition-empty-cta"
                      onClick={() => { setNewMealName(''); setIsNewMealModalOpen(true); }}
                    >
                      <span>+</span> Nueva receta
                    </button>
                  )}
                </div>
              ) : (
                <div className="nutrition-grid">
                  {filteredMeals.map((m) => {
                    const totalKcal = Math.round(
                      (m.items || []).reduce((s, i) => s + (Number(i.calories) || 0), 0)
                    );
                    return (
                      <div
                        key={m.id}
                        className="nutrition-card nutrition-card-clickable"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/nutrition/meals/${m.id}`)}
                        onKeyDown={(e) => e.key === 'Enter' && navigate(`/nutrition/meals/${m.id}`)}
                      >
                        <h3 className="nutrition-card-title">{m.name}</h3>
                        <div className="nutrition-card-badges">
                          <span className="nutrition-macro-pill">
                            {m.items?.length ?? 0} alimento{m.items?.length !== 1 ? 's' : ''}
                          </span>
                          {totalKcal > 0 && (
                            <span className="nutrition-kcal-badge">{totalKcal} kcal</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── Planes tab ── */}
        {activeTab === 'planes' && (
          <div className="nutrition-tab-content">
            <section className="nutrition-section">
              <div className="nutrition-section-header">
                <h2 className="nutrition-section-title">Planes</h2>
                <div className="nutrition-header-actions">
                  <button
                    type="button"
                    className="nutrition-pill"
                    onClick={() => setIsPlanModalOpen(true)}
                    title="Nuevo plan"
                  >
                    <span className="nutrition-pill-icon">+</span>
                  </button>
                  <button type="button" className="nutrition-pill" title="Editar">
                    <span className="nutrition-pill-text">Editar</span>
                  </button>
                </div>
              </div>
              <div className="nutrition-search-container">
                <div className="nutrition-search-input-container">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="nutrition-search-icon">
                    <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    type="text"
                    className="nutrition-search-input"
                    placeholder="Buscar planes…"
                    value={planSearchQuery}
                    onChange={(e) => setPlanSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              {plansLoading ? (
                <div className="nutrition-skeleton-grid">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="nutrition-skeleton-card">
                      <div className="nutrition-skeleton-line nutrition-skeleton-line-title" />
                      <div className="nutrition-skeleton-line nutrition-skeleton-line-meta" />
                    </div>
                  ))}
                </div>
              ) : filteredPlans.length === 0 ? (
                <div className="nutrition-empty">
                  <div className="nutrition-empty-icon">📋</div>
                  <h3 className="nutrition-empty-title">
                    {planSearchQuery ? 'Sin resultados' : 'Aún no tienes planes nutricionales'}
                  </h3>
                  <p className="nutrition-empty-sub">
                    {planSearchQuery
                      ? 'Intenta con otro término de búsqueda'
                      : 'Crea tu primer plan nutricional para asignarlo a tus clientes'}
                  </p>
                  {!planSearchQuery && (
                    <button
                      type="button"
                      className="nutrition-empty-cta"
                      onClick={() => { setPlanFormName(''); setIsPlanModalOpen(true); }}
                    >
                      <span>+</span> Nuevo plan
                    </button>
                  )}
                </div>
              ) : (
                <div className="nutrition-grid">
                  {filteredPlans.map((p) => {
                    const categoryCount = (p.categories ?? p.slots)?.length ?? 0;
                    return (
                      <div
                        key={p.id}
                        className="nutrition-card nutrition-card-clickable"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/nutrition/plans/${p.id}`)}
                        onKeyDown={(e) => e.key === 'Enter' && navigate(`/nutrition/plans/${p.id}`)}
                      >
                        <h3 className="nutrition-card-title">{p.name}</h3>
                        {p.description && (
                          <p className="nutrition-card-desc">{p.description}</p>
                        )}
                        <div className="nutrition-card-badges">
                          {p.macros?.protein != null && (
                            <span className="nutrition-macro-pill">P {p.macros.protein}g</span>
                          )}
                          {p.macros?.carbs != null && (
                            <span className="nutrition-macro-pill">C {p.macros.carbs}g</span>
                          )}
                          {p.macros?.fat != null && (
                            <span className="nutrition-macro-pill">G {p.macros.fat}g</span>
                          )}
                          {p.daily_calories != null && (
                            <span className="nutrition-kcal-badge">{p.daily_calories} kcal</span>
                          )}
                          {categoryCount > 0 && (
                            <span className="nutrition-client-badge">
                              {categoryCount} categoría{categoryCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* ── Plan create modal ── */}
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
              <label className="propagate-option-title" htmlFor="new-plan-name-input">Nombre del plan</label>
              <Input
                id="new-plan-name-input"
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
            <button type="button" className="propagate-modal-btn propagate-modal-btn-dont" onClick={() => setIsPlanModalOpen(false)}>
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

      {/* ── New meal modal ── */}
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
              <label className="propagate-option-title" htmlFor="new-meal-name-input">Nombre</label>
              <Input
                id="new-meal-name-input"
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
    </DashboardLayout>
  );
}
