/**
 * Nutrition Screen — Creator nutrition library, assignments, client comparison.
 * Tabs: Biblioteca (Meals + Plans), Asignaciones, Clientes, Programas.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Button from '../components/Button';
import * as nutritionApi from '../services/nutritionApiService';
import * as nutritionDb from '../services/nutritionFirestoreService';
import programService from '../services/programService';
import oneOnOneService from '../services/oneOnOneService';
import './NutritionScreen.css';

const SLOT_TYPES = [
  { id: 'breakfast', label: 'Desayuno' },
  { id: 'lunch', label: 'Almuerzo' },
  { id: 'dinner', label: 'Cena' },
  { id: 'snack_1', label: 'Snack 1' },
  { id: 'snack_2', label: 'Snack 2' },
];
const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function NutritionScreen() {
  const { user } = useAuth();
  const creatorId = user?.uid ?? '';

  const [activeTab, setActiveTab] = useState('biblioteca');
  const [bibliotecaSubTab, setBibliotecaSubTab] = useState('meals');

  // Meals
  const [meals, setMeals] = useState([]);
  const [mealsLoading, setMealsLoading] = useState(false);
  const [mealSearchQuery, setMealSearchQuery] = useState('');
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  const [mealFormName, setMealFormName] = useState('');
  const [mealFormItems, setMealFormItems] = useState([]);
  const [mealFormSearchQuery, setMealFormSearchQuery] = useState('');
  const [mealFormSearchResults, setMealFormSearchResults] = useState([]);
  const [mealFormSearchLoading, setMealFormSearchLoading] = useState(false);
  const [mealFormSelectedFood, setMealFormSelectedFood] = useState(null);
  const [mealFormSelectedServing, setMealFormSelectedServing] = useState(null);
  const [mealFormServingUnits, setMealFormServingUnits] = useState(1);
  const [mealFormManualOpen, setMealFormManualOpen] = useState(false);
  const [mealFormManual, setMealFormManual] = useState({
    name: '', food_id: '', serving_id: '0', units: 1, calories: '', protein: '', carbs: '', fat: '',
  });
  const [mealFormSaving, setMealFormSaving] = useState(false);

  // Plans
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planSearchQuery, setPlanSearchQuery] = useState('');
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planFormName, setPlanFormName] = useState('');
  const [planFormDescription, setPlanFormDescription] = useState('');
  const [planFormMacros, setPlanFormMacros] = useState({ calories: '', protein: '', carbs: '', fat: '' });
  const [planFormSlots, setPlanFormSlots] = useState([]);
  const [planFormSaving, setPlanFormSaving] = useState(false);

  // Assignments
  const [assignments, setAssignments] = useState([]);
  const [clients, setClients] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignFormClientId, setAssignFormClientId] = useState('');
  const [assignFormPlanId, setAssignFormPlanId] = useState('');
  const [assignFormStartDate, setAssignFormStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assignFormSaving, setAssignFormSaving] = useState(false);

  // Clientes (compare)
  const [compareClientId, setCompareClientId] = useState('');
  const [compareStartDate, setCompareStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [compareEndDate, setCompareEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [compareAssignment, setCompareAssignment] = useState(null);
  const [comparePlan, setComparePlan] = useState(null);
  const [compareEntries, setCompareEntries] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);

  // Programas
  const [programs, setPrograms] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [programPlanIds, setProgramPlanIds] = useState('');
  const [programQuestionnaireConfig, setProgramQuestionnaireConfig] = useState('');
  const [programSaving, setProgramSaving] = useState(false);

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

  const loadAssignments = useCallback(async () => {
    if (!creatorId) return;
    setAssignmentsLoading(true);
    try {
      const list = await nutritionDb.getAssignmentsByCreator(creatorId);
      setAssignments(list);
    } catch (e) {
      console.error(e);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [creatorId]);

  const loadClients = useCallback(async () => {
    if (!creatorId) return;
    setClientsLoading(true);
    try {
      const list = await oneOnOneService.getClientsByCreator(creatorId);
      setClients(list);
    } catch (e) {
      console.error(e);
    } finally {
      setClientsLoading(false);
    }
  }, [creatorId]);

  const loadPrograms = useCallback(async () => {
    if (!creatorId) return;
    setProgramsLoading(true);
    try {
      const list = await programService.getProgramsByCreator(creatorId);
      setPrograms(list);
      if (!selectedProgramId && list.length > 0) setSelectedProgramId(list[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setProgramsLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    if (activeTab === 'biblioteca') {
      if (bibliotecaSubTab === 'meals') loadMeals();
      else loadPlans();
    } else if (activeTab === 'asignaciones') {
      loadAssignments();
      loadClients();
      loadPlans();
    } else if (activeTab === 'clientes') {
      loadClients();
    } else if (activeTab === 'programas') {
      loadPrograms();
    }
  }, [activeTab, bibliotecaSubTab, creatorId, loadMeals, loadPlans, loadAssignments, loadClients, loadPrograms]);

  useEffect(() => {
    if (selectedProgramId && programs.length > 0) {
      const p = programs.find((x) => x.id === selectedProgramId);
      if (p) {
        const ids = p.nutrition_plan_ids ?? [];
        setProgramPlanIds(Array.isArray(ids) ? ids.join(', ') : String(ids));
        const cfg = p.nutrition_questionnaire_config;
        setProgramQuestionnaireConfig(cfg ? JSON.stringify(cfg, null, 2) : '');
      }
    }
  }, [selectedProgramId, programs]);

  async function handleMealFormSearch() {
    if (!mealFormSearchQuery.trim()) return;
    setMealFormSearchLoading(true);
    setMealFormSearchResults([]);
    try {
      const data = await nutritionApi.nutritionFoodSearch(mealFormSearchQuery.trim(), 0, 20);
      const foods = data?.foods_search?.results?.food ?? [];
      setMealFormSearchResults(Array.isArray(foods) ? foods : []);
    } catch (e) {
      setMealFormSearchResults([]);
    } finally {
      setMealFormSearchLoading(false);
    }
  }

  function addFoodToMealFromSearch() {
    if (!mealFormSelectedFood || !mealFormSelectedServing) return;
    const s = mealFormSelectedServing;
    const mult = Number(mealFormServingUnits) || 1;
    setMealFormItems((prev) => [
      ...prev,
      {
        food_id: mealFormSelectedFood.food_id,
        serving_id: s.serving_id,
        number_of_units: mult,
        name: mealFormSelectedFood.food_name || 'Food',
        calories: s.calories != null ? Math.round(Number(s.calories) * mult) : null,
        protein: s.protein != null ? Math.round(Number(s.protein) * mult) : null,
        carbs: s.carbohydrate != null ? Math.round(Number(s.carbohydrate) * mult) : null,
        fat: s.fat != null ? Math.round(Number(s.fat) * mult) : null,
      },
    ]);
    setMealFormSelectedFood(null);
    setMealFormSelectedServing(null);
    setMealFormServingUnits(1);
  }

  function addFoodToMealFromManual() {
    const m = mealFormManual;
    const name = m.name.trim() || 'Manual';
    const foodId = m.food_id.trim() || `manual-${Date.now()}`;
    setMealFormItems((prev) => [
      ...prev,
      {
        food_id: foodId,
        serving_id: m.serving_id.trim() || '0',
        number_of_units: Number(m.units) || 1,
        name,
        calories: m.calories !== '' ? Number(m.calories) : null,
        protein: m.protein !== '' ? Number(m.protein) : null,
        carbs: m.carbs !== '' ? Number(m.carbs) : null,
        fat: m.fat !== '' ? Number(m.fat) : null,
      },
    ]);
    setMealFormManual({ name: '', food_id: '', serving_id: '0', units: 1, calories: '', protein: '', carbs: '', fat: '' });
  }

  function removeMealFormItem(idx) {
    setMealFormItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveMeal() {
    if (!mealFormName.trim() || !creatorId) return;
    setMealFormSaving(true);
    try {
      await nutritionDb.createMeal(creatorId, { name: mealFormName.trim(), items: mealFormItems });
      setIsMealModalOpen(false);
      setMealFormName('');
      setMealFormItems([]);
      loadMeals();
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Error al guardar');
    } finally {
      setMealFormSaving(false);
    }
  }

  function addPlanSlot() {
    setPlanFormSlots((prev) => [
      ...prev,
      { slot_type: 'breakfast', options: [{ library_meal_id: '', label: 'Opción A' }] },
    ]);
  }

  function updatePlanSlot(idx, field, value) {
    setPlanFormSlots((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function addPlanSlotOption(slotIdx) {
    setPlanFormSlots((prev) => {
      const next = [...prev];
      const slot = next[slotIdx] || { slot_type: 'breakfast', options: [] };
      const opts = [...(slot.options || []), { library_meal_id: '', label: `Opción ${(slot.options?.length || 0) + 1}` }];
      next[slotIdx] = { ...slot, options: opts };
      return next;
    });
  }

  function updatePlanSlotOption(slotIdx, optIdx, field, value) {
    setPlanFormSlots((prev) => {
      const next = [...prev];
      const slot = next[slotIdx] || { options: [] };
      const opts = [...(slot.options || [])];
      opts[optIdx] = { ...opts[optIdx], [field]: value };
      next[slotIdx] = { ...slot, options: opts };
      return next;
    });
  }

  function removePlanSlot(idx) {
    setPlanFormSlots((prev) => prev.filter((_, i) => i !== idx));
  }

  async function savePlan() {
    if (!planFormName.trim() || !creatorId) return;
    setPlanFormSaving(true);
    try {
      const slots = planFormSlots
        .map((s) => ({
          slot_type: s.slot_type,
          options: (s.options || []).filter((o) => o.library_meal_id).map((o) => ({ library_meal_id: o.library_meal_id, label: o.label || 'Opción' })),
        }))
        .filter((s) => s.options.length > 0);
      await nutritionDb.createPlan(creatorId, {
        name: planFormName.trim(),
        description: planFormDescription.trim(),
        daily_calories: planFormMacros.calories !== '' ? Number(planFormMacros.calories) : null,
        daily_protein_g: planFormMacros.protein !== '' ? Number(planFormMacros.protein) : null,
        daily_carbs_g: planFormMacros.carbs !== '' ? Number(planFormMacros.carbs) : null,
        daily_fat_g: planFormMacros.fat !== '' ? Number(planFormMacros.fat) : null,
        slots,
      });
      setIsPlanModalOpen(false);
      setPlanFormName('');
      setPlanFormDescription('');
      setPlanFormMacros({ calories: '', protein: '', carbs: '', fat: '' });
      setPlanFormSlots([]);
      loadPlans();
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Error al guardar');
    } finally {
      setPlanFormSaving(false);
    }
  }

  async function handleAssign() {
    const clientUserId = assignFormClientId.trim();
    if (!clientUserId || !assignFormPlanId || !creatorId) return;
    setAssignFormSaving(true);
    try {
      await nutritionDb.createAssignment({
        userId: clientUserId,
        planId: assignFormPlanId,
        assignedBy: creatorId,
        source: 'one_on_one',
        startDate: assignFormStartDate || null,
      });
      setIsAssignModalOpen(false);
      setAssignFormClientId('');
      setAssignFormPlanId('');
      loadAssignments();
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Error al asignar');
    } finally {
      setAssignFormSaving(false);
    }
  }

  async function loadCompare() {
    if (!compareClientId.trim()) return;
    setCompareLoading(true);
    setCompareAssignment(null);
    setComparePlan(null);
    setCompareEntries([]);
    try {
      const assignments = await nutritionDb.getAssignmentsByUser(compareClientId.trim());
      const a = assignments[0] || null;
      setCompareAssignment(a);
      if (a?.planId && a?.assignedBy) {
        const plan = await nutritionDb.getPlanById(a.assignedBy, a.planId);
        setComparePlan(plan);
      }
      const entries = await nutritionDb.getDiaryEntriesInRange(
        compareClientId.trim(),
        compareStartDate,
        compareEndDate
      );
      setCompareEntries(entries);
    } catch (e) {
      console.error(e);
    } finally {
      setCompareLoading(false);
    }
  }

  async function saveProgramConfig() {
    if (!selectedProgramId) return;
    setProgramSaving(true);
    try {
      const planIds = programPlanIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      let config = null;
      if (programQuestionnaireConfig.trim()) {
        try {
          config = JSON.parse(programQuestionnaireConfig);
        } catch {
          alert('JSON de cuestionario inválido');
          setProgramSaving(false);
          return;
        }
      }
      await programService.updateProgram(selectedProgramId, {
        nutrition_plan_ids: planIds,
        nutrition_questionnaire_config: config,
      });
      loadPrograms();
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Error al guardar');
    } finally {
      setProgramSaving(false);
    }
  }

  const filteredMeals = mealSearchQuery.trim()
    ? meals.filter((m) => m.name?.toLowerCase().includes(mealSearchQuery.toLowerCase()))
    : meals;
  const filteredPlans = planSearchQuery.trim()
    ? plans.filter((p) => p.name?.toLowerCase().includes(planSearchQuery.toLowerCase()))
    : plans;

  const compareTotalCal = compareEntries.reduce((s, e) => s + (Number(e.calories) || 0), 0);
  const compareTotalProtein = compareEntries.reduce((s, e) => s + (Number(e.protein) || 0), 0);
  const compareTotalCarbs = compareEntries.reduce((s, e) => s + (Number(e.carbs) || 0), 0);
  const compareTotalFat = compareEntries.reduce((s, e) => s + (Number(e.fat) || 0), 0);
  const compareDays = new Set(compareEntries.map((e) => e.date)).size;

  const getClientDisplayName = (userId) => {
    const c = clients.find((x) => x.clientUserId === userId || x.id === userId);
    return c?.clientName || c?.displayName || c?.clientDisplayName || userId?.slice(0, 8) || userId;
  };

  const getPlanName = (planId) => plans.find((p) => p.id === planId)?.name || planId;

  return (
    <DashboardLayout screenName="Nutrición">
      <div className="nutrition-screen">
        <nav className="nutrition-tabs">
          {[
            { id: 'biblioteca', label: 'Biblioteca' },
            { id: 'asignaciones', label: 'Asignaciones' },
            { id: 'clientes', label: 'Clientes' },
            { id: 'programas', label: 'Programas' },
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

        {activeTab === 'biblioteca' && (
          <div className="nutrition-tab-content">
            <div className="nutrition-sub-tabs">
              <button
                className={bibliotecaSubTab === 'meals' ? 'active' : ''}
                onClick={() => setBibliotecaSubTab('meals')}
              >
                Comidas
              </button>
              <button
                className={bibliotecaSubTab === 'plans' ? 'active' : ''}
                onClick={() => setBibliotecaSubTab('plans')}
              >
                Planes
              </button>
            </div>

            {bibliotecaSubTab === 'meals' && (
              <section className="nutrition-section">
                <div className="nutrition-section-header">
                  <h2 className="nutrition-section-title">Comidas</h2>
                  <Button
                    title="+ Nueva comida"
                    onClick={() => setIsMealModalOpen(true)}
                  />
                </div>
                <Input
                  placeholder="Buscar comidas…"
                  value={mealSearchQuery}
                  onChange={(e) => setMealSearchQuery(e.target.value)}
                />
                {mealsLoading ? (
                  <p className="nutrition-loading">Cargando…</p>
                ) : (
                  <div className="nutrition-grid">
                    {filteredMeals.map((m) => (
                      <div key={m.id} className="nutrition-card">
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
            )}

            {bibliotecaSubTab === 'plans' && (
              <section className="nutrition-section">
                <div className="nutrition-section-header">
                  <h2 className="nutrition-section-title">Planes</h2>
                  <Button
                    title="+ Nuevo plan"
                    onClick={() => setIsPlanModalOpen(true)}
                  />
                </div>
                <Input
                  placeholder="Buscar planes…"
                  value={planSearchQuery}
                  onChange={(e) => setPlanSearchQuery(e.target.value)}
                />
                {plansLoading ? (
                  <p className="nutrition-loading">Cargando…</p>
                ) : (
                  <div className="nutrition-grid">
                    {filteredPlans.map((p) => (
                      <div key={p.id} className="nutrition-card">
                        <h3 className="nutrition-card-title">{p.name}</h3>
                        <p className="nutrition-card-meta">
                          {p.daily_calories != null && `${p.daily_calories} kcal · `}
                          {p.slots?.length ?? 0} slot(s)
                        </p>
                        {p.description && (
                          <p className="nutrition-card-desc">{p.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {activeTab === 'asignaciones' && (
          <div className="nutrition-tab-content">
            <div className="nutrition-section-header">
              <h2 className="nutrition-section-title">Asignaciones de planes</h2>
              <Button
                title="+ Asignar plan"
                onClick={() => setIsAssignModalOpen(true)}
                disabled={plans.length === 0 || clients.length === 0}
              />
            </div>
            {assignmentsLoading ? (
              <p className="nutrition-loading">Cargando…</p>
            ) : (
              <ul className="nutrition-list">
                {assignments.map((a) => (
                  <li key={a.id} className="nutrition-list-item">
                    <span className="nutrition-list-client">{getClientDisplayName(a.userId)}</span>
                    <span className="nutrition-list-plan">{getPlanName(a.planId)}</span>
                    <span className="nutrition-list-date">
                      desde {a.startDate?.toDate ? a.startDate.toDate().toLocaleDateString() : String(a.startDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'clientes' && (
          <div className="nutrition-tab-content">
            <section className="nutrition-compare-section">
              <h2 className="nutrition-section-title">Comparar consumo vs plan</h2>
              <div className="nutrition-compare-controls">
                <div className="nutrition-compare-field">
                  <label>Cliente</label>
                  <select
                    value={compareClientId}
                    onChange={(e) => setCompareClientId(e.target.value)}
                  >
                    <option value="">Seleccionar</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.clientUserId || c.id}>
                        {c.clientName || c.displayName || c.clientDisplayName || c.clientUserId?.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="nutrition-compare-field">
                  <label>Desde</label>
                  <input
                    type="date"
                    value={compareStartDate}
                    onChange={(e) => setCompareStartDate(e.target.value)}
                  />
                </div>
                <div className="nutrition-compare-field">
                  <label>Hasta</label>
                  <input
                    type="date"
                    value={compareEndDate}
                    onChange={(e) => setCompareEndDate(e.target.value)}
                  />
                </div>
                <Button
                  title={compareLoading ? 'Cargando…' : 'Cargar'}
                  onClick={loadCompare}
                  disabled={!compareClientId.trim() || compareLoading}
                />
              </div>
              {compareAssignment && (
                <div className="nutrition-compare-results">
                  <div className="nutrition-compare-plan">
                    <h3>Plan asignado</h3>
                    <p>{getPlanName(compareAssignment.planId)}</p>
                    {comparePlan && (
                      <div className="nutrition-macros-row">
                        <span>Cal: {comparePlan.daily_calories ?? '—'}</span>
                        <span>P: {comparePlan.daily_protein_g ?? '—'}g</span>
                        <span>C: {comparePlan.daily_carbs_g ?? '—'}g</span>
                        <span>G: {comparePlan.daily_fat_g ?? '—'}g</span>
                      </div>
                    )}
                  </div>
                  <div className="nutrition-compare-actual">
                    <h3>Consumo real ({compareDays} día(s))</h3>
                    <div className="nutrition-macros-row">
                      <span>Cal: {compareTotalCal}</span>
                      <span>P: {compareTotalProtein}g</span>
                      <span>C: {compareTotalCarbs}g</span>
                      <span>G: {compareTotalFat}g</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'programas' && (
          <div className="nutrition-tab-content">
            <section className="nutrition-section">
              <h2 className="nutrition-section-title">Planes de nutrición por programa</h2>
              <p className="nutrition-section-desc">
                Asigna varios planes a un programa y configura el cuestionario para asignar automáticamente según las respuestas.
              </p>
              <div className="nutrition-program-form">
                <div className="nutrition-form-field">
                  <label>Programa</label>
                  <select
                    value={selectedProgramId}
                    onChange={(e) => setSelectedProgramId(e.target.value)}
                    disabled={programsLoading}
                  >
                    <option value="">— Seleccionar —</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>{p.title || p.id}</option>
                    ))}
                  </select>
                </div>
                {selectedProgramId && (
                  <>
                    <div className="nutrition-form-field">
                      <label>IDs de planes (separados por coma)</label>
                      <Input
                        placeholder="planId1, planId2"
                        value={programPlanIds}
                        onChange={(e) => setProgramPlanIds(e.target.value)}
                      />
                    </div>
                    <div className="nutrition-form-field">
                      <label>Configuración de cuestionario (JSON)</label>
                      <textarea
                        value={programQuestionnaireConfig}
                        onChange={(e) => setProgramQuestionnaireConfig(e.target.value)}
                        placeholder='{"objective": {"fat_loss": "planId1", "maintenance": "planId2"}}'
                        rows={6}
                        className="nutrition-textarea"
                      />
                    </div>
                    <Button
                      title={programSaving ? 'Guardando…' : 'Guardar'}
                      onClick={saveProgramConfig}
                      disabled={programSaving}
                    />
                  </>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Meal create modal */}
      <Modal
        isOpen={isMealModalOpen}
        onClose={() => setIsMealModalOpen(false)}
        title="Nueva comida"
        wide
      >
        <div className="nutrition-modal-content">
          <div className="nutrition-form-field">
            <label>Nombre de la comida</label>
            <Input
              value={mealFormName}
              onChange={(e) => setMealFormName(e.target.value)}
              placeholder="ej. Desayuno proteico"
            />
          </div>
          <div className="nutrition-meal-add-section">
            <h4>Añadir alimentos</h4>
            <div className="nutrition-search-row">
              <Input
                value={mealFormSearchQuery}
                onChange={(e) => setMealFormSearchQuery(e.target.value)}
                placeholder="Buscar alimento (ej. pollo)"
                onKeyDown={(e) => e.key === 'Enter' && handleMealFormSearch()}
              />
              <Button title={mealFormSearchLoading ? 'Buscando…' : 'Buscar'} onClick={handleMealFormSearch} disabled={mealFormSearchLoading} />
            </div>
            {mealFormSearchResults.length > 0 && (
              <div className="nutrition-food-picker">
                <select
                  value={mealFormSelectedFood?.food_id ?? ''}
                  onChange={(e) => {
                    const f = mealFormSearchResults.find((x) => String(x.food_id) === e.target.value);
                    setMealFormSelectedFood(f || null);
                    setMealFormSelectedServing(null);
                  }}
                >
                  <option value="">Seleccionar alimento</option>
                  {mealFormSearchResults.map((f) => (
                    <option key={f.food_id} value={f.food_id}>{f.food_name}</option>
                  ))}
                </select>
                {mealFormSelectedFood?.servings?.serving && (
                  <>
                    <select
                      value={mealFormSelectedServing?.serving_id ?? ''}
                      onChange={(e) => {
                        const s = mealFormSelectedFood.servings.serving.find(
                          (x) => String(x.serving_id) === e.target.value
                        );
                        setMealFormSelectedServing(s || null);
                      }}
                    >
                      <option value="">Porción</option>
                      {mealFormSelectedFood.servings.serving.map((s) => (
                        <option key={s.serving_id} value={s.serving_id}>
                          {s.serving_description} — {s.calories} kcal
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0.1}
                      step={0.5}
                      value={mealFormServingUnits}
                      onChange={(e) => setMealFormServingUnits(e.target.value)}
                      className="nutrition-units-input"
                    />
                    <Button
                      title="Añadir"
                      onClick={addFoodToMealFromSearch}
                      disabled={!mealFormSelectedServing}
                    />
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              className="nutrition-manual-toggle"
              onClick={() => setMealFormManualOpen((x) => !x)}
            >
              {mealFormManualOpen ? 'Ocultar' : 'Añadir manualmente'}
            </button>
            {mealFormManualOpen && (
              <div className="nutrition-manual-form">
                <Input value={mealFormManual.name} onChange={(e) => setMealFormManual((m) => ({ ...m, name: e.target.value }))} placeholder="Nombre" />
                <Input value={mealFormManual.units} onChange={(e) => setMealFormManual((m) => ({ ...m, units: e.target.value }))} type="number" placeholder="Unidades" />
                <Input value={mealFormManual.calories} onChange={(e) => setMealFormManual((m) => ({ ...m, calories: e.target.value }))} type="number" placeholder="Cal" />
                <Input value={mealFormManual.protein} onChange={(e) => setMealFormManual((m) => ({ ...m, protein: e.target.value }))} type="number" placeholder="Proteína (g)" />
                <Button title="Añadir" onClick={addFoodToMealFromManual} />
              </div>
            )}
          </div>
          {mealFormItems.length > 0 && (
            <div className="nutrition-meal-items">
              <h4>Alimentos en la comida</h4>
              <ul>
                {mealFormItems.map((item, i) => (
                  <li key={i}>
                    {item.name} — {item.number_of_units} — {item.calories ?? '?'} kcal
                    <button type="button" className="nutrition-remove-item" onClick={() => removeMealFormItem(i)}>×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="nutrition-modal-actions">
            <Button title="Cancelar" variant="outline" onClick={() => setIsMealModalOpen(false)} />
            <Button
              title={mealFormSaving ? 'Guardando…' : 'Guardar comida'}
              onClick={saveMeal}
              disabled={!mealFormName.trim() || mealFormItems.length === 0 || mealFormSaving}
            />
          </div>
        </div>
      </Modal>

      {/* Plan create modal */}
      <Modal
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        title="Nuevo plan"
        wide
      >
        <div className="nutrition-modal-content">
          <div className="nutrition-form-field">
            <label>Nombre</label>
            <Input value={planFormName} onChange={(e) => setPlanFormName(e.target.value)} placeholder="ej. Plan definición" />
          </div>
          <div className="nutrition-form-field">
            <label>Descripción</label>
            <Input value={planFormDescription} onChange={(e) => setPlanFormDescription(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="nutrition-form-field">
            <label>Objetivos diarios (opcional)</label>
            <div className="nutrition-macros-inputs">
              <input type="number" placeholder="Cal" value={planFormMacros.calories} onChange={(e) => setPlanFormMacros((m) => ({ ...m, calories: e.target.value }))} />
              <input type="number" placeholder="P (g)" value={planFormMacros.protein} onChange={(e) => setPlanFormMacros((m) => ({ ...m, protein: e.target.value }))} />
              <input type="number" placeholder="C (g)" value={planFormMacros.carbs} onChange={(e) => setPlanFormMacros((m) => ({ ...m, carbs: e.target.value }))} />
              <input type="number" placeholder="G (g)" value={planFormMacros.fat} onChange={(e) => setPlanFormMacros((m) => ({ ...m, fat: e.target.value }))} />
            </div>
          </div>
          <div className="nutrition-plan-slots">
            <h4>Slots de comidas</h4>
            {planFormSlots.map((slot, si) => (
              <div key={si} className="nutrition-slot-block">
                <div className="nutrition-slot-header">
                  <select
                    value={slot.slot_type}
                    onChange={(e) => updatePlanSlot(si, 'slot_type', e.target.value)}
                  >
                    {SLOT_TYPES.map((st) => (
                      <option key={st.id} value={st.id}>{st.label}</option>
                    ))}
                  </select>
                  <button type="button" className="nutrition-remove-slot" onClick={() => removePlanSlot(si)}>Eliminar</button>
                </div>
                {(slot.options || []).map((opt, oi) => (
                  <div key={oi} className="nutrition-slot-option">
                    <select
                      value={opt.library_meal_id}
                      onChange={(e) => updatePlanSlotOption(si, oi, 'library_meal_id', e.target.value)}
                    >
                      <option value="">Seleccionar comida</option>
                      {meals.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <Input
                      value={opt.label}
                      onChange={(e) => updatePlanSlotOption(si, oi, 'label', e.target.value)}
                      placeholder="Etiqueta"
                    />
                  </div>
                ))}
                <Button title="+ Opción" variant="outline" onClick={() => addPlanSlotOption(si)} />
              </div>
            ))}
            <Button title="+ Slot" variant="outline" onClick={addPlanSlot} />
          </div>
          <div className="nutrition-modal-actions">
            <Button title="Cancelar" variant="outline" onClick={() => setIsPlanModalOpen(false)} />
            <Button
              title={planFormSaving ? 'Guardando…' : 'Guardar plan'}
              onClick={savePlan}
              disabled={!planFormName.trim() || planFormSaving}
            />
          </div>
        </div>
      </Modal>

      {/* Assign modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Asignar plan de nutrición"
      >
        <div className="nutrition-modal-content">
          <div className="nutrition-form-field">
            <label>Cliente</label>
            <select
              value={assignFormClientId}
              onChange={(e) => setAssignFormClientId(e.target.value)}
            >
              <option value="">Seleccionar</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.clientUserId || c.id}>
                        {c.clientName || c.displayName || c.clientDisplayName || c.clientUserId?.slice(0, 8)}
                      </option>
                    ))}
            </select>
          </div>
          <div className="nutrition-form-field">
            <label>Plan</label>
            <select
              value={assignFormPlanId}
              onChange={(e) => setAssignFormPlanId(e.target.value)}
            >
              <option value="">Seleccionar</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="nutrition-form-field">
            <label>Fecha de inicio</label>
            <input
              type="date"
              value={assignFormStartDate}
              onChange={(e) => setAssignFormStartDate(e.target.value)}
            />
          </div>
          <div className="nutrition-modal-actions">
            <Button title="Cancelar" variant="outline" onClick={() => setIsAssignModalOpen(false)} />
            <Button
              title={assignFormSaving ? 'Asignando…' : 'Asignar'}
              onClick={handleAssign}
              disabled={!assignFormClientId || !assignFormPlanId || assignFormSaving}
            />
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
