import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import * as nutritionApi from '../services/nutritionApiService';
import * as nutritionDb from '../services/nutritionFirestoreService';
import programService from '../services/programService';
import './NutritionTestScreen.css';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function NutritionTestScreen() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('meals');

  // Proxy state
  const [searchQuery, setSearchQuery] = useState('chicken');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [foodIdInput, setFoodIdInput] = useState('');
  const [foodDetail, setFoodDetail] = useState(null);
  const [foodDetailLoading, setFoodDetailLoading] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeResult, setBarcodeResult] = useState(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  // Meals state
  const [meals, setMeals] = useState([]);
  const [mealsLoading, setMealsLoading] = useState(false);
  const [newMealName, setNewMealName] = useState('');
  const [newMealItems, setNewMealItems] = useState([]);
  const [selectedSearchFood, setSelectedSearchFood] = useState(null);
  const [selectedServing, setSelectedServing] = useState(null);
  const [servingUnits, setServingUnits] = useState(1);
  // Manual meal item (no FatSecret)
  const [manualFoodId, setManualFoodId] = useState('');
  const [manualServingId, setManualServingId] = useState('');
  const [manualUnits, setManualUnits] = useState(1);
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');

  // Plans state
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanDescription, setNewPlanDescription] = useState('');
  const [newPlanMealId, setNewPlanMealId] = useState('');
  const [newPlanDailyCalories, setNewPlanDailyCalories] = useState('');
  const [newPlanDailyProtein, setNewPlanDailyProtein] = useState('');
  const [newPlanDailyCarbs, setNewPlanDailyCarbs] = useState('');
  const [newPlanDailyFat, setNewPlanDailyFat] = useState('');

  // Assignments state
  const [assignmentsByUser, setAssignmentsByUser] = useState([]);
  const [assignmentsByCreator, setAssignmentsByCreator] = useState([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignStartDate, setAssignStartDate] = useState(new Date().toISOString().slice(0, 10));

  // Diary state
  const [diaryUserId, setDiaryUserId] = useState('');
  const [diaryDate, setDiaryDate] = useState(new Date().toISOString().slice(0, 10));
  const [diaryMeal, setDiaryMeal] = useState('breakfast');
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [diaryLoading, setDiaryLoading] = useState(false);
  const [logFoodId, setLogFoodId] = useState('');
  const [logServingId, setLogServingId] = useState('');
  const [logUnits, setLogUnits] = useState(1);
  const [logName, setLogName] = useState('');
  const [logMacros, setLogMacros] = useState({});

  // Compare state (creator: user intake vs plan)
  const [compareUserId, setCompareUserId] = useState('');
  const [compareStartDate, setCompareStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [compareEndDate, setCompareEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [compareAssignment, setCompareAssignment] = useState(null);
  const [comparePlan, setComparePlan] = useState(null);
  const [compareDiaryEntries, setCompareDiaryEntries] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);

  // Programs tab: attach nutrition plans to program + questionnaire config
  const [programs, setPrograms] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [programNutritionPlanIds, setProgramNutritionPlanIds] = useState('');
  const [programQuestionnaireConfig, setProgramQuestionnaireConfig] = useState('');
  const [programSaveLoading, setProgramSaveLoading] = useState(false);

  const creatorId = user?.uid ?? '';

  useEffect(() => {
    if (creatorId && activeSection === 'meals') loadMeals();
  }, [creatorId, activeSection]);
  useEffect(() => {
    if (creatorId && activeSection === 'plans') loadPlans();
  }, [creatorId, activeSection]);
  useEffect(() => {
    if (creatorId && activeSection === 'assignments') {
      loadAssignments();
      loadPlans();
    }
  }, [creatorId, activeSection]);

  useEffect(() => {
    if (creatorId && activeSection === 'programs') loadPrograms();
  }, [creatorId, activeSection]);

  async function loadPrograms() {
    if (!creatorId) return;
    setProgramsLoading(true);
    try {
      const list = await programService.getProgramsByCreator(creatorId);
      setPrograms(list);
      if (!selectedProgramId && list.length > 0) setSelectedProgramId(list[0].id);
    } catch (e) {
      console.error(e);
      setPrograms([]);
    } finally {
      setProgramsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedProgramId && programs.length > 0) {
      const p = programs.find((x) => x.id === selectedProgramId);
      if (p) {
        const ids = p.nutrition_plan_ids ?? [];
        setProgramNutritionPlanIds(Array.isArray(ids) ? ids.join(', ') : String(ids));
        const cfg = p.nutrition_questionnaire_config;
        setProgramQuestionnaireConfig(cfg ? JSON.stringify(cfg, null, 2) : '');
      }
    }
  }, [selectedProgramId, programs]);

  async function saveProgramNutritionConfig() {
    if (!selectedProgramId) return;
    setProgramSaveLoading(true);
    try {
      const planIds = programNutritionPlanIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      let config = null;
      try {
        if (programQuestionnaireConfig.trim()) config = JSON.parse(programQuestionnaireConfig);
      } catch {
        alert('Invalid JSON in questionnaire config');
        setProgramSaveLoading(false);
        return;
      }
      await programService.updateProgram(selectedProgramId, {
        nutrition_plan_ids: planIds,
        nutrition_questionnaire_config: config,
      });
      const list = await programService.getProgramsByCreator(creatorId);
      setPrograms(list);
    } catch (e) {
      console.error(e);
      alert(e?.message || 'Failed to save');
    } finally {
      setProgramSaveLoading(false);
    }
  }

  async function loadCompare() {
    if (!compareUserId.trim()) return;
    setCompareLoading(true);
    setCompareAssignment(null);
    setComparePlan(null);
    setCompareDiaryEntries([]);
    try {
      const assignments = await nutritionDb.getAssignmentsByUser(compareUserId.trim());
      const assignment = assignments[0] || null;
      setCompareAssignment(assignment);
      if (assignment?.planId && assignment?.assignedBy) {
        const plan = await nutritionDb.getPlanById(assignment.assignedBy, assignment.planId);
        setComparePlan(plan);
      } else {
        setComparePlan(null);
      }
      const entries = await nutritionDb.getDiaryEntriesInRange(
        compareUserId.trim(),
        compareStartDate,
        compareEndDate
      );
      setCompareDiaryEntries(entries);
    } catch (e) {
      console.error(e);
    } finally {
      setCompareLoading(false);
    }
  }

  async function loadMeals() {
    setMealsLoading(true);
    try {
      const list = await nutritionDb.getMealsByCreator(creatorId);
      setMeals(list);
    } catch (e) {
      console.error(e);
    } finally {
      setMealsLoading(false);
    }
  }

  async function loadPlans() {
    setPlansLoading(true);
    try {
      const list = await nutritionDb.getPlansByCreator(creatorId);
      setPlans(list);
    } catch (e) {
      console.error(e);
    } finally {
      setPlansLoading(false);
    }
  }

  async function loadAssignments() {
    if (!creatorId) return;
    try {
      const byCreator = await nutritionDb.getAssignmentsByCreator(creatorId);
      setAssignmentsByCreator(byCreator);
      if (assignUserId) {
        const byUser = await nutritionDb.getAssignmentsByUser(assignUserId);
        setAssignmentsByUser(byUser);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSearch() {
    setSearchLoading(true);
    setSearchResults(null);
    try {
      const data = await nutritionApi.nutritionFoodSearch(searchQuery.trim(), 0, 20);
      setSearchResults(data);
    } catch (e) {
      setSearchResults({ error: e.message || 'Search failed' });
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleFoodGet() {
    if (!foodIdInput.trim()) return;
    setFoodDetailLoading(true);
    setFoodDetail(null);
    try {
      const data = await nutritionApi.nutritionFoodGet(foodIdInput.trim());
      setFoodDetail(data);
    } catch (e) {
      setFoodDetail({ error: e.message || 'Get failed' });
    } finally {
      setFoodDetailLoading(false);
    }
  }

  async function handleBarcodeLookup() {
    if (!barcodeInput.trim()) return;
    setBarcodeLoading(true);
    setBarcodeResult(null);
    try {
      const data = await nutritionApi.nutritionBarcodeLookup(barcodeInput.trim());
      setBarcodeResult(data);
    } catch (e) {
      setBarcodeResult({ error: e.message || 'Barcode lookup failed', status: e.status });
    } finally {
      setBarcodeLoading(false);
    }
  }

  function addItemToMeal() {
    if (!selectedSearchFood || !selectedServing) return;
    const serving = selectedServing;
    const name = selectedSearchFood.food_name || selectedSearchFood.food_name || 'Food';
    setNewMealItems((prev) => [
      ...prev,
      {
        food_id: selectedSearchFood.food_id,
        serving_id: serving.serving_id,
        number_of_units: Number(servingUnits) || 1,
        name: name,
        calories: serving.calories,
        protein: serving.protein,
        carbs: serving.carbohydrate,
        fat: serving.fat,
      },
    ]);
    setSelectedSearchFood(null);
    setSelectedServing(null);
    setServingUnits(1);
  }

  function addItemFromManual() {
    const name = manualName.trim() || 'Manual item';
    const foodId = manualFoodId.trim() || `manual-${Date.now()}`;
    const servingId = manualServingId.trim() || '0';
    setNewMealItems((prev) => [
      ...prev,
      {
        food_id: foodId,
        serving_id: servingId,
        number_of_units: Number(manualUnits) || 1,
        name,
        calories: manualCalories !== '' ? Number(manualCalories) : null,
        protein: manualProtein !== '' ? Number(manualProtein) : null,
        carbs: manualCarbs !== '' ? Number(manualCarbs) : null,
        fat: manualFat !== '' ? Number(manualFat) : null,
      },
    ]);
    setManualFoodId('');
    setManualServingId('');
    setManualUnits(1);
    setManualName('');
    setManualCalories('');
    setManualProtein('');
    setManualCarbs('');
    setManualFat('');
  }

  async function saveMeal() {
    if (!newMealName.trim() || !creatorId) return;
    try {
      await nutritionDb.createMeal(creatorId, { name: newMealName.trim(), items: newMealItems });
      setNewMealName('');
      setNewMealItems([]);
      loadMeals();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to save meal');
    }
  }

  async function savePlan() {
    if (!newPlanName.trim() || !creatorId) return;
    try {
      const slots = newPlanMealId
        ? [{ slot_type: 'breakfast', options: [{ library_meal_id: newPlanMealId, label: 'Option A' }] }]
        : [];
      await nutritionDb.createPlan(creatorId, {
        name: newPlanName.trim(),
        description: newPlanDescription.trim(),
        daily_calories: newPlanDailyCalories !== '' ? Number(newPlanDailyCalories) : null,
        daily_protein_g: newPlanDailyProtein !== '' ? Number(newPlanDailyProtein) : null,
        daily_carbs_g: newPlanDailyCarbs !== '' ? Number(newPlanDailyCarbs) : null,
        daily_fat_g: newPlanDailyFat !== '' ? Number(newPlanDailyFat) : null,
        slots,
      });
      setNewPlanName('');
      setNewPlanDescription('');
      setNewPlanMealId('');
      setNewPlanDailyCalories('');
      setNewPlanDailyProtein('');
      setNewPlanDailyCarbs('');
      setNewPlanDailyFat('');
      loadPlans();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to save plan');
    }
  }

  async function assignPlan() {
    if (!assignUserId.trim() || !assignPlanId.trim() || !creatorId) return;
    try {
      await nutritionDb.createAssignment({
        userId: assignUserId.trim(),
        planId: assignPlanId.trim(),
        assignedBy: creatorId,
        source: 'one_on_one',
        startDate: assignStartDate || null,
      });
      setAssignUserId('');
      setAssignPlanId('');
      loadAssignments();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to assign plan');
    }
  }

  async function loadDiary() {
    if (!diaryUserId.trim()) return;
    setDiaryLoading(true);
    try {
      const list = await nutritionDb.getDiaryEntries(diaryUserId.trim(), diaryDate);
      setDiaryEntries(list);
    } catch (e) {
      console.error(e);
      setDiaryEntries([]);
    } finally {
      setDiaryLoading(false);
    }
  }

  async function logFood() {
    if (!diaryUserId.trim() || !logFoodId || !logServingId || !diaryDate) return;
    try {
      await nutritionDb.addDiaryEntry(diaryUserId.trim(), {
        date: diaryDate,
        meal: diaryMeal,
        food_id: logFoodId,
        serving_id: logServingId,
        number_of_units: Number(logUnits) || 1,
        name: logName || 'Food',
        ...logMacros,
      });
      setLogFoodId('');
      setLogServingId('');
      setLogName('');
      setLogMacros({});
      loadDiary();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to log food');
    }
  }

  const foodsFromSearch = searchResults?.foods_search?.results?.food ?? [];
  const foodFromGet = foodDetail?.food;

  return (
    <DashboardLayout screenName="Nutrición (pruebas)">
      <div className="nutrition-test-screen">
        <nav className="nutrition-test-nav">
          {['proxy', 'meals', 'plans', 'assignments', 'diary', 'compare', 'programs'].map((s) => (
            <button
              key={s}
              className={activeSection === s ? 'active' : ''}
              onClick={() => setActiveSection(s)}
            >
              {s === 'proxy' && 'FatSecret'}
              {s === 'meals' && 'Meals'}
              {s === 'plans' && 'Plans'}
              {s === 'assignments' && 'Assignments'}
              {s === 'diary' && 'Diary'}
              {s === 'compare' && 'Compare'}
              {s === 'programs' && 'Programs'}
            </button>
          ))}
        </nav>

        {activeSection === 'proxy' && (
          <section className="nutrition-test-section">
            <h2>FatSecret proxy</h2>
            <div className="nutrition-test-block">
              <h3>Food search</h3>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="search_expression"
              />
              <button onClick={handleSearch} disabled={searchLoading}>
                {searchLoading ? 'Searching…' : 'Search'}
              </button>
              {searchResults && (
                <pre className="nutrition-result">
                  {searchResults.error
                    ? (typeof searchResults.error === 'string'
                        ? searchResults.error
                        : JSON.stringify(searchResults.error, null, 2))
                    : JSON.stringify(searchResults, null, 2)}
                </pre>
              )}
              {foodsFromSearch.length > 0 && (
                <ul className="nutrition-food-list">
                  {foodsFromSearch.slice(0, 10).map((f, i) => (
                    <li key={i}>
                      {f.food_name} (id: {f.food_id})
                      {f.servings?.serving && (
                        <span> — {f.servings.serving.length} serving(s)</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="nutrition-test-block">
              <h3>Food by ID</h3>
              <input
                value={foodIdInput}
                onChange={(e) => setFoodIdInput(e.target.value)}
                placeholder="food_id"
              />
              <button onClick={handleFoodGet} disabled={foodDetailLoading}>
                {foodDetailLoading ? 'Loading…' : 'Get food'}
              </button>
              {foodDetail && (
                <pre className="nutrition-result">
                  {foodDetail.error
                    ? (typeof foodDetail.error === 'string'
                        ? foodDetail.error
                        : JSON.stringify(foodDetail.error, null, 2))
                    : JSON.stringify(foodDetail, null, 2)}
                </pre>
              )}
            </div>
            <div className="nutrition-test-block">
              <h3>Barcode lookup</h3>
              <input
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="13-digit barcode"
              />
              <button onClick={handleBarcodeLookup} disabled={barcodeLoading}>
                {barcodeLoading ? 'Looking up…' : 'Lookup'}
              </button>
              {barcodeResult && (
                <pre className="nutrition-result">
                  {barcodeResult.error
                    ? (typeof barcodeResult.error === 'string'
                        ? barcodeResult.error
                        : JSON.stringify(barcodeResult.error, null, 2))
                    : JSON.stringify(barcodeResult, null, 2)}
                </pre>
              )}
            </div>
          </section>
        )}

        {activeSection === 'meals' && (
          <section className="nutrition-test-section">
            <h2>Creator meal library</h2>
            <div className="nutrition-test-block">
              <h3>Create meal</h3>
              <p className="nutrition-test-subtitle">Add items manually (no FatSecret) or from FatSecret search below.</p>
              <div className="nutrition-manual-item-form">
                <h4>Manual add item</h4>
                <input value={manualFoodId} onChange={(e) => setManualFoodId(e.target.value)} placeholder="food_id (or leave blank)" />
                <input value={manualServingId} onChange={(e) => setManualServingId(e.target.value)} placeholder="serving_id (or 0)" />
                <input type="number" min={0.1} step={0.5} value={manualUnits} onChange={(e) => setManualUnits(e.target.value)} placeholder="Units" />
                <input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Display name" />
                <input type="number" value={manualCalories} onChange={(e) => setManualCalories(e.target.value)} placeholder="Calories (optional)" />
                <input type="number" value={manualProtein} onChange={(e) => setManualProtein(e.target.value)} placeholder="Protein g (optional)" />
                <input type="number" value={manualCarbs} onChange={(e) => setManualCarbs(e.target.value)} placeholder="Carbs g (optional)" />
                <input type="number" value={manualFat} onChange={(e) => setManualFat(e.target.value)} placeholder="Fat g (optional)" />
                <button type="button" onClick={addItemFromManual}>Add to meal</button>
              </div>
              <p className="nutrition-test-from-search">Or from FatSecret tab: search, then select food/serving below.</p>
              {searchResults && foodsFromSearch.length > 0 && (
                <div className="nutrition-select-food">
                  <select
                    value={selectedSearchFood?.food_id ?? ''}
                    onChange={(e) => {
                      const id = e.target.value;
                      const f = foodsFromSearch.find((x) => String(x.food_id) === id);
                      setSelectedSearchFood(f || null);
                      setSelectedServing(null);
                    }}
                  >
                    <option value="">Select food</option>
                    {foodsFromSearch.map((f, i) => (
                      <option key={i} value={f.food_id}>
                        {f.food_name}
                      </option>
                    ))}
                  </select>
                  {selectedSearchFood?.servings?.serving && (
                    <select
                      value={selectedServing?.serving_id ?? ''}
                      onChange={(e) => {
                        const id = e.target.value;
                        const s = selectedSearchFood.servings.serving.find(
                          (x) => String(x.serving_id) === id
                        );
                        setSelectedServing(s || null);
                      }}
                    >
                      <option value="">Select serving</option>
                      {selectedSearchFood.servings.serving.map((s, i) => (
                        <option key={i} value={s.serving_id}>
                          {s.serving_description} — {s.calories} kcal
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={servingUnits}
                    onChange={(e) => setServingUnits(e.target.value)}
                  />
                  <button onClick={addItemToMeal} disabled={!selectedServing}>
                    Add to meal
                  </button>
                </div>
              )}
              <input
                value={newMealName}
                onChange={(e) => setNewMealName(e.target.value)}
                placeholder="Meal name"
              />
              <button onClick={saveMeal} disabled={!newMealName.trim() || !newMealItems.length}>
                Save meal
              </button>
              {newMealItems.length > 0 && (
                <ul>
                  {newMealItems.map((item, i) => (
                    <li key={i}>
                      {item.name} — {item.number_of_units} — {item.calories ?? '?'} kcal
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="nutrition-test-block">
              <h3>List meals</h3>
              <button onClick={loadMeals} disabled={mealsLoading}>
                {mealsLoading ? 'Loading…' : 'Refresh'}
              </button>
              <ul>
                {meals.map((m) => (
                  <li key={m.id}>
                    {m.name} — {m.items?.length ?? 0} item(s)
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {activeSection === 'plans' && (
          <section className="nutrition-test-section">
            <h2>Creator plan library</h2>
            <div className="nutrition-test-block">
              <h3>Create plan</h3>
              <input
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                placeholder="Plan name"
              />
              <input
                value={newPlanDescription}
                onChange={(e) => setNewPlanDescription(e.target.value)}
                placeholder="Description"
              />
              <div className="nutrition-plan-macros">
                <h4>Daily macro targets (optional)</h4>
                <input type="number" value={newPlanDailyCalories} onChange={(e) => setNewPlanDailyCalories(e.target.value)} placeholder="Calories" />
                <input type="number" value={newPlanDailyProtein} onChange={(e) => setNewPlanDailyProtein(e.target.value)} placeholder="Protein (g)" />
                <input type="number" value={newPlanDailyCarbs} onChange={(e) => setNewPlanDailyCarbs(e.target.value)} placeholder="Carbs (g)" />
                <input type="number" value={newPlanDailyFat} onChange={(e) => setNewPlanDailyFat(e.target.value)} placeholder="Fat (g)" />
              </div>
              <select
                value={newPlanMealId}
                onChange={(e) => setNewPlanMealId(e.target.value)}
              >
                <option value="">No meal (macros only)</option>
                {meals.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button onClick={savePlan} disabled={!newPlanName.trim()}>
                Save plan
              </button>
            </div>
            <div className="nutrition-test-block">
              <h3>List plans</h3>
              <button onClick={loadPlans} disabled={plansLoading}>
                {plansLoading ? 'Loading…' : 'Refresh'}
              </button>
              <ul>
                {plans.map((p) => (
                  <li key={p.id}>
                    {p.name} — slots: {p.slots?.length ?? 0}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {activeSection === 'assignments' && (
          <section className="nutrition-test-section">
            <h2>Nutrition assignments</h2>
            <div className="nutrition-test-block">
              <h3>Create assignment</h3>
              <input
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                placeholder="userId"
              />
              <select
                value={assignPlanId}
                onChange={(e) => setAssignPlanId(e.target.value)}
              >
                <option value="">Select plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={assignStartDate}
                onChange={(e) => setAssignStartDate(e.target.value)}
              />
              <button
                onClick={assignPlan}
                disabled={!assignUserId.trim() || !assignPlanId}
              >
                Assign plan
              </button>
            </div>
            <div className="nutrition-test-block">
              <h3>List by creator</h3>
              <button onClick={loadAssignments}>Refresh</button>
              <ul>
                {assignmentsByCreator.map((a) => (
                  <li key={a.id}>
                    user: {a.userId} — planId: {a.planId} — {a.startDate?.toDate ? a.startDate.toDate().toISOString() : a.startDate}
                  </li>
                ))}
              </ul>
            </div>
            <div className="nutrition-test-block">
              <h3>List by user</h3>
              <input
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                placeholder="userId"
              />
              <button
                onClick={async () => {
                  if (!assignUserId.trim()) return;
                  try {
                    const list = await nutritionDb.getAssignmentsByUser(assignUserId.trim());
                    setAssignmentsByUser(list);
                  } catch (e) {
                    console.error(e);
                  }
                }}
              >
                Query
              </button>
              <ul>
                {assignmentsByUser.map((a) => (
                  <li key={a.id}>
                    planId: {a.planId} — start: {a.startDate?.toDate ? a.startDate.toDate().toISOString() : a.startDate}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {activeSection === 'diary' && (
          <section className="nutrition-test-section">
            <h2>User diary</h2>
            <div className="nutrition-test-block">
              <h3>Log food</h3>
              <input
                value={diaryUserId}
                onChange={(e) => setDiaryUserId(e.target.value)}
                placeholder="userId"
              />
              <input
                type="date"
                value={diaryDate}
                onChange={(e) => setDiaryDate(e.target.value)}
              />
              <select value={diaryMeal} onChange={(e) => setDiaryMeal(e.target.value)}>
                {MEALS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                value={logFoodId}
                onChange={(e) => setLogFoodId(e.target.value)}
                placeholder="food_id"
              />
              <input
                value={logServingId}
                onChange={(e) => setLogServingId(e.target.value)}
                placeholder="serving_id"
              />
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={logUnits}
                onChange={(e) => setLogUnits(e.target.value)}
              />
              <input
                value={logName}
                onChange={(e) => setLogName(e.target.value)}
                placeholder="Display name"
              />
              <button
                onClick={logFood}
                disabled={!diaryUserId.trim() || !logFoodId || !logServingId}
              >
                Log food
              </button>
            </div>
            <div className="nutrition-test-block">
              <h3>View diary</h3>
              <input
                value={diaryUserId}
                onChange={(e) => setDiaryUserId(e.target.value)}
                placeholder="userId"
              />
              <input
                type="date"
                value={diaryDate}
                onChange={(e) => setDiaryDate(e.target.value)}
              />
              <button onClick={loadDiary} disabled={diaryLoading}>
                {diaryLoading ? 'Loading…' : 'Load'}
              </button>
              <ul>
                {diaryEntries.map((e) => (
                  <li key={e.id}>
                    {e.meal}: {e.name} — {e.number_of_units} — {e.calories ?? '?'} kcal
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {activeSection === 'compare' && (
          <section className="nutrition-test-section">
            <h2>Compare user intake to plan</h2>
            <div className="nutrition-test-block">
              <h3>Load data</h3>
              <input value={compareUserId} onChange={(e) => setCompareUserId(e.target.value)} placeholder="User ID" />
              <input type="date" value={compareStartDate} onChange={(e) => setCompareStartDate(e.target.value)} />
              <input type="date" value={compareEndDate} onChange={(e) => setCompareEndDate(e.target.value)} />
              <button onClick={loadCompare} disabled={compareLoading || !compareUserId.trim()}>
                {compareLoading ? 'Loading…' : 'Load'}
              </button>
            </div>
            {compareAssignment && (
              <div className="nutrition-test-block">
                <h3>Assignment</h3>
                <p>Plan ID: {compareAssignment.planId}, Start: {String(compareAssignment.startDate?.toDate ? compareAssignment.startDate.toDate() : compareAssignment.startDate)}</p>
              </div>
            )}
            {comparePlan && (
              <div className="nutrition-test-block">
                <h3>Plan targets (daily)</h3>
                <p>Calories: {comparePlan.daily_calories ?? '—'}, Protein: {comparePlan.daily_protein_g ?? '—'}g, Carbs: {comparePlan.daily_carbs_g ?? '—'}g, Fat: {comparePlan.daily_fat_g ?? '—'}g</p>
              </div>
            )}
            {compareDiaryEntries.length > 0 && (
              <div className="nutrition-test-block">
                <h3>Diary in range ({compareDiaryEntries.length} entries)</h3>
                <p>
                  Total — Calories: {compareDiaryEntries.reduce((s, e) => s + (Number(e.calories) || 0), 0)},
                  Protein: {compareDiaryEntries.reduce((s, e) => s + (Number(e.protein) || 0), 0)}g,
                  Carbs: {compareDiaryEntries.reduce((s, e) => s + (Number(e.carbs) || 0), 0)}g,
                  Fat: {compareDiaryEntries.reduce((s, e) => s + (Number(e.fat) || 0), 0)}g
                </p>
                <p className="nutrition-compare-avg">
                  Days in range: {[...new Set(compareDiaryEntries.map((e) => e.date))].length}. Use totals vs plan targets for comparison.
                </p>
              </div>
            )}
          </section>
        )}

        {activeSection === 'programs' && (
          <section className="nutrition-test-section">
            <h2>Programs: nutrition plans + questionnaire (test)</h2>
            <p className="nutrition-test-subtitle">Attach nutrition plans to a program and configure questionnaire rules for auto-assignment. Stored on program (courses) document.</p>
            <div className="nutrition-test-block">
              <h3>Select program</h3>
              <select
                value={selectedProgramId}
                onChange={(e) => setSelectedProgramId(e.target.value)}
                disabled={programsLoading}
              >
                <option value="">— Select —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.title || p.id}</option>
                ))}
              </select>
            </div>
            {selectedProgramId && (
              <div className="nutrition-test-block">
                <h3>Nutrition plan IDs (comma-separated)</h3>
                <input
                  value={programNutritionPlanIds}
                  onChange={(e) => setProgramNutritionPlanIds(e.target.value)}
                  placeholder="planId1, planId2"
                />
                <h3>Questionnaire config (JSON)</h3>
                <textarea
                  value={programQuestionnaireConfig}
                  onChange={(e) => setProgramQuestionnaireConfig(e.target.value)}
                  placeholder='{"objective": {"fat_loss": "planId1", "maintenance": "planId2"}}'
                  rows={6}
                  style={{ width: '100%', maxWidth: 480 }}
                />
                <button onClick={saveProgramNutritionConfig} disabled={programSaveLoading}>
                  {programSaveLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
