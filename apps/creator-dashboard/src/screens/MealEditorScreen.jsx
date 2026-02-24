/**
 * Meal Editor Screen — Add or edit a meal. Same layout as session edit: left panel (food search + create own),
 * center (meal name + foods list), right panel (calories hero + macro pie chart + grams).
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Button from '../components/Button';
import Modal from '../components/Modal';
import MediaPickerModal from '../components/MediaPickerModal';
import * as nutritionApi from '../services/nutritionApiService';
import * as nutritionDb from '../services/nutritionFirestoreService';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import './LibrarySessionDetailScreen.css';
import './MealEditorScreen.css';
import './PlanEditorScreen.css';
import './ProgramDetailScreen.css';
import '../components/PropagateChangesModal.css';

const MACRO_COLORS = [
  { name: 'Proteína', fill: 'rgba(255, 255, 255, 0.35)' },
  { name: 'Carbohidratos', fill: 'rgba(255, 255, 255, 0.22)' },
  { name: 'Grasa', fill: 'rgba(255, 255, 255, 0.12)' },
];

/** Get per-100g values from food servings (FatSecret: find 100g serving or normalize by metric_serving_amount). */
function getPer100g(food) {
  const servings = food?.servings?.serving;
  if (!Array.isArray(servings) || servings.length === 0) return null;
  const hundred = servings.find((s) => String(s.serving_description || '').toLowerCase().includes('100'));
  if (hundred) {
    return {
      calories: Number(hundred.calories) || 0,
      protein: Number(hundred.protein) || 0,
      carbs: Number(hundred.carbohydrate) || 0,
      fat: Number(hundred.fat) || 0,
    };
  }
  const first = servings[0];
  const grams = Number(first.metric_serving_amount) || 100;
  const scale = 100 / grams;
  return {
    calories: Math.round((Number(first.calories) || 0) * scale),
    protein: Math.round((Number(first.protein) || 0) * scale * 10) / 10,
    carbs: Math.round((Number(first.carbohydrate) || 0) * scale * 10) / 10,
    fat: Math.round((Number(first.fat) || 0) * scale * 10) / 10,
  };
}

const DERIVED_1G_ID = 'derived-1g';

function descriptionLooksLike1g(s) {
  return /^1\s*g$|^1g$/i.test(String(s.serving_description || '').trim());
}

function isGramOnlyServing(s) {
  const d = String(s.serving_description || '').trim();
  return /^\d+([.,]\d+)?\s*g$/i.test(d) || /^\d+([.,]\d+)?g$/i.test(d);
}

function is1gServing(s) {
  return s.serving_id === DERIVED_1G_ID || descriptionLooksLike1g(s);
}

/** Return servings array with a 1g option always present (derived from per-100g when missing). Other gram-only options (e.g. 100 g) are removed so the user uses 1 g + quantity. */
function getServingsWithStandardOptions(food) {
  const raw = food?.servings?.serving;
  const list = Array.isArray(raw) ? [...raw] : [];
  const per100 = getPer100g(food);
  if (!per100) return list;

  if (!list.some(is1gServing)) {
    list.unshift({
      serving_id: DERIVED_1G_ID,
      serving_description: '1 g',
      measurement_description: 'g',
      number_of_units: 1,
      calories: Math.round(per100.calories / 100 * 10) / 10,
      protein: Math.round(per100.protein / 100 * 100) / 100,
      carbohydrate: Math.round(per100.carbs / 100 * 100) / 100,
      fat: Math.round(per100.fat / 100 * 100) / 100,
      metric_serving_amount: 1,
      metric_serving_unit: 'g',
    });
  }
  return list.filter((s) => !isGramOnlyServing(s) || is1gServing(s));
}

export default function MealEditorScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mealId } = useParams();
  const isEdit = Boolean(mealId);
  const { user } = useAuth();
  const creatorId = user?.uid ?? '';

  const [mealFormName, setMealFormName] = useState(() => {
    if (isEdit) return '';
    return (location.state?.mealName ?? '').trim();
  });
  const [mealFormItems, setMealFormItems] = useState([]);
  const [mealFormVideoUrl, setMealFormVideoUrl] = useState('');
  const [mealFormSearchQuery, setMealFormSearchQuery] = useState('');
  const [mealFormSearchResults, setMealFormSearchResults] = useState([]);
  const [mealFormSearchLoading, setMealFormSearchLoading] = useState(false);
  const [manualFoodModalOpen, setManualFoodModalOpen] = useState(false);
  const [mealFormManual, setMealFormManual] = useState({
    name: '', food_id: '', serving_id: '0', units: 1, calories: '', protein: '', carbs: '', fat: '',
  });
  const [mealLoading, setMealLoading] = useState(isEdit);
  const [isEditingMealName, setIsEditingMealName] = useState(false);
  const lastSavedRef = useRef({ name: '', itemsJson: '', video_url: '' });
  const [mealSortBy, setMealSortBy] = useState('name'); // 'name' | 'calories' | 'protein' | 'carbs' | 'fat'
  const [mealSortMenuOpen, setMealSortMenuOpen] = useState(false);
  const [videoMediaPickerOpen, setVideoMediaPickerOpen] = useState(false);

  useEffect(() => {
    if (!mealId || mealId === 'new' || !creatorId) {
      if (!mealId || mealId === 'new') navigate('/nutrition', { replace: true });
      return;
    }
    let cancelled = false;
    setMealLoading(true);
    nutritionDb.getMealById(creatorId, mealId).then((meal) => {
      if (cancelled) return;
      if (meal) {
        const videoUrl = meal.video_url ?? meal.videoUrl ?? '';
        setMealFormName(meal.name ?? '');
        setMealFormItems(Array.isArray(meal.items) ? meal.items : []);
        setMealFormVideoUrl(videoUrl);
        lastSavedRef.current = { name: meal.name ?? '', itemsJson: JSON.stringify(meal.items ?? []), video_url: videoUrl };
      }
      setMealLoading(false);
    }).catch(() => setMealLoading(false));
    return () => { cancelled = true; };
  }, [mealId, creatorId, navigate]);

  useEffect(() => {
    if (!mealId || !creatorId || mealLoading) return;
    const name = mealFormName.trim();
    const itemsJson = JSON.stringify(mealFormItems);
    const video_url = (mealFormVideoUrl ?? '').trim();
    if (name === lastSavedRef.current.name && itemsJson === lastSavedRef.current.itemsJson && video_url === lastSavedRef.current.video_url) return;
    const t = setTimeout(async () => {
      try {
        await nutritionDb.updateMeal(creatorId, mealId, { name, items: mealFormItems, video_url: video_url || null });
        lastSavedRef.current = { name, itemsJson, video_url };
      } catch (e) {
        console.error(e);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [mealId, creatorId, mealLoading, mealFormName, mealFormItems, mealFormVideoUrl]);

  async function handleMealFormSearch() {
    if (!mealFormSearchQuery.trim()) return;
    setMealFormSearchLoading(true);
    setMealFormSearchResults([]);
    try {
      const data = await nutritionApi.nutritionFoodSearch(mealFormSearchQuery.trim(), 0, 20);
      const raw = data?.foods_search?.results?.food ?? [];
      const foods = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      setMealFormSearchResults(foods);
    } catch (e) {
      setMealFormSearchResults([]);
    } finally {
      setMealFormSearchLoading(false);
    }
  }

  /** Add a food to the meal with portion options stored (no modal). When search result has no sub_categories, calls food.get with include_sub_categories to try to get category (Premier). */
  async function addFoodToMeal(food, serving, units) {
    if (!food || !serving) return;
    const mult = Number(units) || 1;
    const portionOptions = getServingsWithStandardOptions(food);
    let foodCategory = null;
    const subCat = food.food_sub_categories?.food_sub_category;
    if (subCat != null) {
      foodCategory = Array.isArray(subCat) ? subCat[0] : subCat;
    } else {
      try {
        const getRes = await nutritionApi.nutritionFoodGet(food.food_id, { include_sub_categories: true });
        const getSub = getRes?.food?.food_sub_categories?.food_sub_category;
        foodCategory = Array.isArray(getSub) ? getSub[0] : (getSub ?? food.food_name ?? null);
      } catch (_) {
        foodCategory = food.food_name ?? null;
      }
    }
    if (foodCategory == null) foodCategory = food.food_name ?? null;
    setMealFormItems((prev) => [
      ...prev,
      {
        food_id: food.food_id,
        serving_id: serving.serving_id,
        number_of_units: mult,
        name: food.food_name || 'Food',
        food_category: foodCategory,
        calories: serving.calories != null ? Math.round(Number(serving.calories) * mult) : null,
        protein: serving.protein != null ? Math.round(Number(serving.protein) * mult * 10) / 10 : null,
        carbs: serving.carbohydrate != null ? Math.round(Number(serving.carbohydrate) * mult * 10) / 10 : null,
        fat: serving.fat != null ? Math.round(Number(serving.fat) * mult * 10) / 10 : null,
        serving_unit: serving.serving_description ?? serving.measurement_description ?? null,
        grams_per_unit: serving.metric_serving_amount != null ? Number(serving.metric_serving_amount) : null,
        servings: portionOptions,
      },
    ]);
  }

  function updateMealFormItem(idx, updates) {
    setMealFormItems((prev) => {
      const next = [...prev];
      const item = { ...next[idx], ...updates };
      next[idx] = item;
      return next;
    });
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
        serving_unit: 'porción',
        calories: m.calories !== '' ? Number(m.calories) : null,
        protein: m.protein !== '' ? Number(m.protein) : null,
        carbs: m.carbs !== '' ? Number(m.carbs) : null,
        fat: m.fat !== '' ? Number(m.fat) : null,
      },
    ]);
    setMealFormManual({ name: '', food_id: '', serving_id: '0', units: 1, calories: '', protein: '', carbs: '', fat: '' });
    setManualFoodModalOpen(false);
  }

  function removeMealFormItem(idx) {
    setMealFormItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const totals = useMemo(() => {
    let calories = 0, protein = 0, carbs = 0, fat = 0;
    mealFormItems.forEach((item) => {
      calories += Number(item.calories) || 0;
      protein += Number(item.protein) || 0;
      carbs += Number(item.carbs) || 0;
      fat += Number(item.fat) || 0;
    });
    return { calories, protein, carbs, fat };
  }, [mealFormItems]);

  const pieData = useMemo(() => {
    const p = Number(totals.protein) || 0;
    const c = Number(totals.carbs) || 0;
    const f = Number(totals.fat) || 0;
    const totalG = p + c + f;
    if (totalG <= 0) return [];
    return [
      { name: 'Proteína', value: p, grams: p },
      { name: 'Carbohidratos', value: c, grams: c },
      { name: 'Grasa', value: f, grams: f },
    ].filter((d) => d.value > 0);
  }, [totals]);

  const sortedSearchResults = useMemo(() => {
    const list = [...mealFormSearchResults];
    const per100 = (f) => getPer100g(f);
    const cmp = (a, b) => {
      const pa = per100(a);
      const pb = per100(b);
      switch (mealSortBy) {
        case 'calories':
          return (pa?.calories ?? 0) - (pb?.calories ?? 0);
        case 'protein':
          return (pb?.protein ?? 0) - (pa?.protein ?? 0);
        case 'carbs':
          return (pb?.carbs ?? 0) - (pa?.carbs ?? 0);
        case 'fat':
          return (pb?.fat ?? 0) - (pa?.fat ?? 0);
        default:
          return (a.food_name || '').localeCompare(b.food_name || '');
      }
    };
    list.sort(cmp);
    return list;
  }, [mealFormSearchResults, mealSortBy]);

  if (mealLoading) {
    return (
      <DashboardLayout screenName="Comida" showBackButton backPath="/nutrition">
        <div className="library-session-detail-container">
          <p style={{ color: 'rgba(255,255,255,0.6)', padding: 24 }}>Cargando…</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      screenName={mealFormName || 'Comida'}
      showBackButton={true}
      backPath="/nutrition"
      onHeaderEditClick={() => setIsEditingMealName(true)}
    >
      <div className="library-session-detail-container">
        <div className="library-session-detail-body">
          {/* Left — Food search + add own */}
          <div className="library-session-sidebar">
            <div className="library-session-sidebar-header">
              <h3 className="library-session-sidebar-title">Alimentos disponibles</h3>
            </div>
            <div className="library-session-search-container meal-editor-search-block">
              <div className="meal-editor-search-row-top">
                <div className="library-session-search-input-container meal-editor-search-input-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="library-session-search-icon">
                    <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    type="text"
                    className="library-session-search-input"
                    placeholder="Buscar alimento (ej. pollo)"
                    value={mealFormSearchQuery}
                    onChange={(e) => setMealFormSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleMealFormSearch()}
                  />
                </div>
                <button
                  type="button"
                  className="meal-editor-add-own-btn"
                  onClick={() => setManualFoodModalOpen(true)}
                  aria-label="Añadir alimento propio"
                  title="Añadir alimento propio"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              <div className="meal-editor-search-row-bottom">
                <button
                  type="button"
                  className="meal-editor-search-btn"
                  onClick={handleMealFormSearch}
                  disabled={mealFormSearchLoading}
                >
                  {mealFormSearchLoading ? '…' : 'Buscar'}
                </button>
                <div className="meal-editor-sort-wrap">
                  <button
                    type="button"
                    className="meal-editor-sort-btn"
                    onClick={() => setMealSortMenuOpen((o) => !o)}
                    aria-label="Ordenar"
                    title="Ordenar"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </button>
                  {mealSortMenuOpen && (
                    <>
                      <div className="meal-editor-sort-backdrop" onClick={() => setMealSortMenuOpen(false)} />
                      <div className="meal-editor-sort-menu">
                        {[
                          { id: 'name', label: 'Nombre' },
                          { id: 'calories', label: 'Calorías' },
                          { id: 'protein', label: 'Proteína' },
                          { id: 'carbs', label: 'Carbos' },
                          { id: 'fat', label: 'Grasa' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            className={`meal-editor-sort-opt ${mealSortBy === opt.id ? 'active' : ''}`}
                            onClick={() => { setMealSortBy(opt.id); setMealSortMenuOpen(false); }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="library-session-sidebar-content">
              {sortedSearchResults.length === 0 && (
                <div className="library-session-empty-state">
                  <p>Escribe y pulsa Buscar para buscar en la base de datos, o usa + para añadir un alimento propio.</p>
                </div>
              )}
              {sortedSearchResults.map((f) => {
                const per100 = getPer100g(f);
                const portionOptions = getServingsWithStandardOptions(f);
                const hasServings = portionOptions.length > 0;
                return (
                  <div
                    key={f.food_id}
                    className="meal-editor-food-card"
                    draggable={hasServings}
                    onDragStart={(e) => hasServings && e.dataTransfer.setData('application/json', JSON.stringify({ food_id: f.food_id }))}
                    onClick={() => {
                      if (!hasServings) return;
                      const first = portionOptions[0];
                      addFoodToMeal(f, first, 1);
                    }}
                  >
                    <span className="meal-editor-food-card-name">{f.food_name}</span>
                    {per100 && (
                      <span className="meal-editor-food-card-per100">
                        {per100.calories} kcal · P:{per100.protein}g C:{per100.carbs}g G:{per100.fat}g
                        <span className="meal-editor-food-card-per100-label">/100g</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center — Video card + Items list */}
          <div className="library-session-main">
            <div className="meal-editor-video-card">
              <h3 className="meal-editor-video-card-title">Vídeo de la receta</h3>
              <p className="meal-editor-video-card-hint">
                Pega un enlace (YouTube, Vimeo, etc.) o elige un vídeo de tu carpeta de medios.
              </p>
              <div className="meal-editor-video-link-row">
                <button
                  type="button"
                  className="meal-editor-video-upload-btn"
                  onClick={() => setVideoMediaPickerOpen(true)}
                >
                  <svg className="meal-editor-video-upload-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Subir vídeo</span>
                </button>
                <input
                  type="url"
                  className="meal-editor-video-input"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={mealFormVideoUrl}
                  onChange={(e) => setMealFormVideoUrl(e.target.value)}
                />
              </div>
              {mealFormVideoUrl.trim() && (
                <div className="meal-editor-video-preview">
                  <a href={mealFormVideoUrl.trim()} target="_blank" rel="noopener noreferrer" className="meal-editor-video-link">
                    Ver vídeo
                  </a>
                </div>
              )}
            </div>
            <div
              className={`library-session-exercises-container meal-editor-items-container ${mealFormItems.length === 0 ? 'empty' : ''}`}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('meal-editor-dropzone-active'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('meal-editor-dropzone-active'); }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('meal-editor-dropzone-active');
                const raw = e.dataTransfer.getData('application/json');
                if (!raw) return;
                try {
                  const { food_id: fid } = JSON.parse(raw);
                  const food = mealFormSearchResults.find((x) => String(x.food_id) === String(fid));
                  if (!food) return;
                  const list = getServingsWithStandardOptions(food);
                  if (list.length > 0) addFoodToMeal(food, list[0], 1);
                } catch (_) {}
              }}
            >
              {mealFormItems.length === 0 ? (
                <div className="meal-editor-empty-hint">Arrastra alimentos aquí o añádelos desde el panel izquierdo</div>
              ) : (
                mealFormItems.map((item, i) => {
                  const hasServings = Array.isArray(item.servings) && item.servings.length > 0;
                  if (hasServings) {
                    return (
                      <div key={i} className="plan-editor-option-item-card">
                        <div className="plan-editor-option-item-card-left">
                          <span className="meal-editor-item-name">{item.name}</span>
                          <span className="meal-editor-item-meta">
                            {item.number_of_units ?? 1} · {item.calories ?? '?'} kcal
                          </span>
                        </div>
                        <div className="plan-editor-option-item-card-right">
                          <div className="plan-editor-option-item-portion">
                            <div className="plan-editor-option-item-portion-inputs">
                              <select
                                className="plan-editor-option-item-portion-select"
                                value={item.serving_id ?? (item.servings?.[0]?.serving_id ?? '')}
                                onChange={(e) => {
                                  const list = item.servings || [];
                                  if (list.length === 0) return;
                                  const s = list.find((x) => String(x.serving_id) === e.target.value);
                                  if (!s) return;
                                  const u = Number(item.number_of_units) || 1;
                                  updateMealFormItem(i, {
                                    serving_id: s.serving_id,
                                    number_of_units: u,
                                    calories: s.calories != null ? Math.round(Number(s.calories) * u) : null,
                                    protein: s.protein != null ? Math.round(Number(s.protein) * u * 10) / 10 : null,
                                    carbs: s.carbohydrate != null ? Math.round(Number(s.carbohydrate) * u * 10) / 10 : null,
                                    fat: s.fat != null ? Math.round(Number(s.fat) * u * 10) / 10 : null,
                                    serving_unit: s.serving_description ?? s.measurement_description ?? null,
                                    grams_per_unit: s.metric_serving_amount != null ? Number(s.metric_serving_amount) : null,
                                  });
                                }}
                              >
                                {item.servings.map((s) => (
                                  <option key={s.serving_id} value={s.serving_id}>
                                    {s.serving_description} — {s.calories} kcal
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                min={0.1}
                                step={0.5}
                                className="plan-editor-option-item-portion-units"
                                value={item.number_of_units ?? 1}
                                onChange={(e) => {
                                  const u = Number(e.target.value) || 1;
                                  const list = item.servings || [];
                                  const sid = item.serving_id ?? list[0]?.serving_id;
                                  const s = list.find((x) => String(x.serving_id) === String(sid)) || list[0];
                                  if (s) {
                                    updateMealFormItem(i, {
                                      number_of_units: u,
                                      calories: s.calories != null ? Math.round(Number(s.calories) * u) : null,
                                      protein: s.protein != null ? Math.round(Number(s.protein) * u * 10) / 10 : null,
                                      carbs: s.carbohydrate != null ? Math.round(Number(s.carbohydrate) * u * 10) / 10 : null,
                                      fat: s.fat != null ? Math.round(Number(s.fat) * u * 10) / 10 : null,
                                      serving_unit: s.serving_description ?? s.measurement_description ?? null,
                                      grams_per_unit: s.metric_serving_amount != null ? Number(s.metric_serving_amount) : null,
                                    });
                                  } else {
                                    const prev = Number(item.number_of_units) || 1;
                                    const scale = u / prev;
                                    updateMealFormItem(i, {
                                      number_of_units: u,
                                      calories: item.calories != null ? Math.round(Number(item.calories) * scale) : null,
                                      protein: item.protein != null ? Math.round(Number(item.protein) * scale * 10) / 10 : null,
                                      carbs: item.carbs != null ? Math.round(Number(item.carbs) * scale * 10) / 10 : null,
                                      fat: item.fat != null ? Math.round(Number(item.fat) * scale * 10) / 10 : null,
                                    });
                                  }
                                }}
                              />
                            </div>
                            <div className="plan-editor-option-item-portion-labels">
                              <span className="plan-editor-option-item-portion-label">Porción</span>
                              <span className="plan-editor-option-item-portion-label">Unidades</span>
                            </div>
                          </div>
                          <button type="button" className="meal-editor-item-remove" onClick={() => removeMealFormItem(i)} aria-label="Quitar">×</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="meal-editor-item-row">
                      <span className="meal-editor-item-name">{item.name}</span>
                      <span className="meal-editor-item-meta">
                        {item.number_of_units ?? 1} · {item.calories ?? '?'} kcal
                      </span>
                      <button type="button" className="meal-editor-item-remove" onClick={() => removeMealFormItem(i)} aria-label="Quitar">×</button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right — Calories + pie + grams */}
          <div className="library-session-sidebar-right">
            <div className="meal-editor-calories-hero">
              <div className="meal-editor-calories-value">{totals.calories}</div>
              <div className="meal-editor-calories-label">kcal</div>
            </div>
            <div className="library-session-sidebar-right-header">
              <h3 className="library-session-sidebar-right-title">Macros</h3>
              <p className="library-session-sidebar-right-subtitle">Distribución y gramos de la comida</p>
            </div>
            <div className="library-session-sidebar-right-content">
              {pieData.length === 0 ? (
                <div className="library-session-volume-empty">
                  Añade alimentos a la comida para ver la distribución de macros.
                </div>
              ) : (
                <div className="library-session-volume-card library-session-volume-pie-card meal-editor-macros-card" style={{ width: '100%' }}>
                  <div className="meal-editor-macros-card-top">
                    <div className="library-session-pie-chart-wrap">
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart className="library-session-pie-chart">
                          <defs>
                            {[0, 1, 2].map((i) => (
                              <linearGradient key={i} id={`meal-editor-pie-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={`rgba(255,255,255,${0.22 + i * 0.06})`} />
                                <stop offset="50%" stopColor={`rgba(255,255,255,${0.12 + i * 0.04})`} />
                                <stop offset="100%" stopColor={`rgba(255,255,255,${0.05 + i * 0.03})`} />
                              </linearGradient>
                            ))}
                          </defs>
                          <Pie
                            key={`macro-${pieData.map((d) => d.value).join('-')}`}
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={64}
                            paddingAngle={2}
                            dataKey="value"
                            nameKey="name"
                            label={false}
                          >
                            {pieData.map((_, i) => (
                              <Cell key={i} fill={`url(#meal-editor-pie-grad-${i})`} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const { name, value, grams } = payload[0].payload;
                              return (
                                <div className="library-session-pie-tooltip">
                                  <span className="library-session-pie-tooltip-name">{name}</span>
                                  <span className="library-session-pie-tooltip-sets">{Number(grams ?? 0).toFixed(0)} g</span>
                                </div>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="meal-editor-macros-list">
                    <div className="meal-editor-macro-row">
                      <span className="meal-editor-macro-name">Proteína</span>
                      <span className="meal-editor-macro-grams">{totals.protein.toFixed(0)} g</span>
                    </div>
                    <div className="meal-editor-macro-row">
                      <span className="meal-editor-macro-name">Carbohidratos</span>
                      <span className="meal-editor-macro-grams">{totals.carbs.toFixed(0)} g</span>
                    </div>
                    <div className="meal-editor-macro-row">
                      <span className="meal-editor-macro-name">Grasa</span>
                      <span className="meal-editor-macro-grams">{totals.fat.toFixed(0)} g</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Manual food (add your own) modal */}
      <Modal
        isOpen={manualFoodModalOpen}
        onClose={() => setManualFoodModalOpen(false)}
        title="Añadir alimento propio"
        containerClassName="propagate-modal-container"
        contentClassName="propagate-modal-content-wrapper"
      >
        <div className="propagate-modal-content">
          <div className="propagate-modal-layout propagate-modal-layout-single">
            <div className="meal-editor-manual-form-in-modal">
              <label className="propagate-option-title">Nombre</label>
              <input
                value={mealFormManual.name}
                onChange={(e) => setMealFormManual((m) => ({ ...m, name: e.target.value }))}
                placeholder="ej. Mi batido"
                className="meal-editor-edit-name-input"
              />
              <label className="propagate-option-title">Unidades</label>
              <input
                type="number"
                value={mealFormManual.units}
                onChange={(e) => setMealFormManual((m) => ({ ...m, units: e.target.value }))}
                placeholder="1"
                className="meal-editor-edit-name-input"
              />
              <label className="propagate-option-title">Calorías</label>
              <input
                type="number"
                value={mealFormManual.calories}
                onChange={(e) => setMealFormManual((m) => ({ ...m, calories: e.target.value }))}
                placeholder="0"
                className="meal-editor-edit-name-input"
              />
              <label className="propagate-option-title">Proteína (g)</label>
              <input
                type="number"
                value={mealFormManual.protein}
                onChange={(e) => setMealFormManual((m) => ({ ...m, protein: e.target.value }))}
                placeholder="0"
                className="meal-editor-edit-name-input"
              />
              <label className="propagate-option-title">Carbohidratos (g)</label>
              <input
                type="number"
                value={mealFormManual.carbs}
                onChange={(e) => setMealFormManual((m) => ({ ...m, carbs: e.target.value }))}
                placeholder="0"
                className="meal-editor-edit-name-input"
              />
              <label className="propagate-option-title">Grasa (g)</label>
              <input
                type="number"
                value={mealFormManual.fat}
                onChange={(e) => setMealFormManual((m) => ({ ...m, fat: e.target.value }))}
                placeholder="0"
                className="meal-editor-edit-name-input"
              />
            </div>
          </div>
          <div className="propagate-modal-footer">
            <button type="button" className="propagate-modal-btn propagate-modal-btn-dont" onClick={() => setManualFoodModalOpen(false)}>Cancelar</button>
            <button type="button" className="propagate-modal-btn propagate-modal-btn-propagate" onClick={addFoodToMealFromManual}>Añadir</button>
          </div>
        </div>
      </Modal>

      {/* Edit meal name modal */}
      <Modal
        isOpen={isEditingMealName}
        onClose={() => setIsEditingMealName(false)}
        title="Editar nombre"
        containerClassName="propagate-modal-container"
        contentClassName="propagate-modal-content-wrapper"
      >
        <div className="propagate-modal-content">
          <div className="propagate-modal-layout propagate-modal-layout-single">
            <div className="meal-editor-edit-modal-field">
              <label className="propagate-option-title" htmlFor="edit-meal-name-input">Nombre</label>
              <input
                id="edit-meal-name-input"
                type="text"
                value={mealFormName}
                onChange={(e) => setMealFormName(e.target.value)}
                placeholder="ej. Desayuno proteico"
                className="meal-editor-edit-name-input"
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingMealName(false)}
              />
            </div>
          </div>
          <div className="propagate-modal-footer">
            <button type="button" className="propagate-modal-btn propagate-modal-btn-dont" onClick={() => setIsEditingMealName(false)}>Cancelar</button>
            <button type="button" className="propagate-modal-btn propagate-modal-btn-propagate" onClick={() => setIsEditingMealName(false)}>Listo</button>
          </div>
        </div>
      </Modal>

      <MediaPickerModal
        isOpen={videoMediaPickerOpen}
        onClose={() => setVideoMediaPickerOpen(false)}
        onSelect={(item) => {
          setMealFormVideoUrl(item.url ?? '');
          setVideoMediaPickerOpen(false);
        }}
        creatorId={creatorId}
        accept="video/*"
      />
    </DashboardLayout>
  );
}
