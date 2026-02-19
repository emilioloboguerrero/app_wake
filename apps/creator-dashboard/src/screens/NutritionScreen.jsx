/**
 * Nutrition Screen — Creator recipes and plans.
 * Tabs: Recetas (meals), Planes.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import * as nutritionDb from '../services/nutritionFirestoreService';
import '../components/PropagateChangesModal.css';
import './NutritionScreen.css';

export default function NutritionScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const creatorId = user?.uid ?? '';

  const [activeTab, setActiveTab] = useState('recetas');

  // Meals
  const [meals, setMeals] = useState([]);
  const [mealsLoading, setMealsLoading] = useState(false);
  const [mealSearchQuery, setMealSearchQuery] = useState('');
  const [isNewMealModalOpen, setIsNewMealModalOpen] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [newMealCreating, setNewMealCreating] = useState(false);

  // Plans
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planSearchQuery, setPlanSearchQuery] = useState('');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planFormName, setPlanFormName] = useState('');
  const [planFormCreating, setPlanFormCreating] = useState(false);

  const loadMeals = useCallback(async () => {
    if (!creatorId) return;
    setMealsLoading(true);
    try {
      const list = await nutritionDb.getMealsByCreator(creatorId);
      setMeals(list);
    } catch (e) {
      console.error(e);
    } finally {
      setMealsLoading(false);
    }
  }, [creatorId]);

  const handleCreateMealAndOpen = async () => {
    const name = newMealName.trim();
    if (!name || !creatorId) return;
    setNewMealCreating(true);
    try {
      const mealId = await nutritionDb.createMeal(creatorId, { name, items: [] });
      setIsNewMealModalOpen(false);
      setNewMealName('');
      navigate(`/nutrition/meals/${mealId}`);
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Error al crear la receta');
    } finally {
      setNewMealCreating(false);
    }
  };

  const loadPlans = useCallback(async () => {
    if (!creatorId) return;
    setPlansLoading(true);
    try {
      const list = await nutritionDb.getPlansByCreator(creatorId);
      setPlans(list);
    } catch (e) {
      console.error(e);
    } finally {
      setPlansLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    if (activeTab === 'recetas') {
      loadMeals();
    } else if (activeTab === 'planes') {
      loadPlans();
      loadMeals();
    }
  }, [activeTab, creatorId, loadMeals, loadPlans]);

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
      setIsPlanModalOpen(false);
      setPlanFormName('');
      navigate(`/nutrition/plans/${planId}`);
      loadPlans();
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Error al crear el plan');
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

  return (
    <DashboardLayout screenName="Nutrición">
      <div className="nutrition-screen">
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="nutrition-search-icon">
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
                <p className="nutrition-loading">Cargando…</p>
              ) : (
                <div className="nutrition-grid">
                  {filteredMeals.map((m) => (
                    <div
                      key={m.id}
                      className="nutrition-card nutrition-card-clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/nutrition/meals/${m.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/nutrition/meals/${m.id}`)}
                    >
                      <h3 className="nutrition-card-title">{m.name}</h3>
                      <p className="nutrition-card-meta">
                        {m.items?.length ?? 0} alimento(s) ·{' '}
                        {Math.round(
                          (m.items || []).reduce((s, i) => s + (Number(i.calories) || 0), 0)
                        )}{' '}
                        kcal
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="nutrition-search-icon">
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
                <p className="nutrition-loading">Cargando…</p>
              ) : (
                <div className="nutrition-grid">
                  {filteredPlans.map((p) => (
                    <div
                      key={p.id}
                      className="nutrition-card nutrition-card-clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/nutrition/plans/${p.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/nutrition/plans/${p.id}`)}
                    >
                      <h3 className="nutrition-card-title">{p.name}</h3>
                      <p className="nutrition-card-meta">
                        {p.daily_calories != null && `${p.daily_calories} kcal · `}
                        {(p.categories ?? p.slots)?.length ?? 0} categoría(s)
                      </p>
                      {p.description && (
                        <p className="nutrition-card-desc">{p.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Plan create modal — name only, then open plan editor */}
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

      {/* New meal name modal — propagate style */}
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
