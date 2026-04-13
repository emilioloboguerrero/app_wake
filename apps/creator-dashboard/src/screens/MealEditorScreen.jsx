import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../config/queryClient';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Button from '../components/Button';
import Modal from '../components/Modal';
import MediaPickerModal from '../components/MediaPickerModal';
import * as nutritionApi from '../services/nutritionApiService';
import * as nutritionDb from '../services/nutritionFirestoreService';
import logger from '../utils/logger';
import { useToast } from '../contexts/ToastContext';
import ShimmerSkeleton from '../components/ui/ShimmerSkeleton';
import { detectVideoSource, getEmbedUrl, isValidExternalVideoUrl } from '../utils/videoUtils';
import { FullScreenError } from '../components/ui';
import ContextualHint from '../components/hints/ContextualHint';
import './LibrarySessionDetailScreen.css';
import './MealEditorScreen.css';
import './PlanEditorScreen.css';
import './ProgramDetailScreen.css';
import './SharedScreenLayout.css';
import '../components/PropagateChangesModal.css';

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
  const { showToast } = useToast();
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
  const [isEditingMealName, setIsEditingMealName] = useState(false);
  const seededRef = useRef(false);
  const justSeededRef = useRef(false);
  const lastSavedRef = useRef({ name: '', itemsJson: '', video_url: '' });
  const pendingSaveRef = useRef(null);
  const [mealSortBy, setMealSortBy] = useState('name'); // 'name' | 'calories' | 'protein' | 'carbs' | 'fat'
  const [mealSortMenuOpen, setMealSortMenuOpen] = useState(false);
  const [videoMediaPickerOpen, setVideoMediaPickerOpen] = useState(false);
  const [videoUrlDirty, setVideoUrlDirty] = useState(false);
  const videoUrlError = useMemo(() => {
    if (!videoUrlDirty) return '';
    const url = (mealFormVideoUrl ?? '').trim();
    if (!url) return '';
    if (!isValidExternalVideoUrl(url)) return 'Solo se permiten enlaces de YouTube o Vimeo';
    return '';
  }, [mealFormVideoUrl, videoUrlDirty]);

  const queryClient = useQueryClient();
  const { data: mealData, isLoading: mealLoading, error: mealError, refetch: refetchMeal } = useQuery({
    queryKey: queryKeys.nutrition.meal(creatorId, mealId),
    queryFn: () => nutritionDb.getMealById(creatorId, mealId),
    enabled: !!mealId && mealId !== 'new' && !!creatorId,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!mealId || mealId === 'new') navigate('/biblioteca?domain=nutricion', { replace: true });
  }, [mealId, navigate]);
  useEffect(() => {
    if (mealData && !seededRef.current) {
      seededRef.current = true;
      justSeededRef.current = true;
      const videoUrl = mealData.video_url ?? mealData.videoUrl ?? '';
      setMealFormName(mealData.name ?? '');
      setMealFormItems(Array.isArray(mealData.items) ? mealData.items : []);
      setMealFormVideoUrl(videoUrl);
      lastSavedRef.current = { name: mealData.name ?? '', itemsJson: JSON.stringify(mealData.items ?? []), video_url: videoUrl };
    }
  }, [mealData]);

  useEffect(() => {
    if (!mealId || !creatorId || mealLoading) return;
    const name = mealFormName.trim();
    const itemsJson = JSON.stringify(mealFormItems);
    const rawUrl = (mealFormVideoUrl ?? '').trim();
    const video_url = rawUrl && isValidExternalVideoUrl(rawUrl) ? rawUrl : (rawUrl ? lastSavedRef.current.video_url : '');
    if (name === lastSavedRef.current.name && itemsJson === lastSavedRef.current.itemsJson && video_url === lastSavedRef.current.video_url) {
      pendingSaveRef.current = null;
      return;
    }
    if (justSeededRef.current) {
      justSeededRef.current = false;
      lastSavedRef.current = { name, itemsJson, video_url };
      return;
    }
    const video_source = video_url ? detectVideoSource(video_url) : null;
    const doSave = async () => {
      pendingSaveRef.current = null;
      queryClient.setQueryData(queryKeys.nutrition.meal(creatorId, mealId), (old) => old ? {
        ...old,
        name,
        items: mealFormItems,
        video_url: video_url || null,
        video_source,
      } : old);
      try {
        await nutritionDb.updateMeal(creatorId, mealId, { name, items: mealFormItems, video_url: video_url || null, video_source });
        lastSavedRef.current = { name, itemsJson, video_url };
        queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.meals(creatorId) });
      } catch (e) {
        queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.meal(creatorId, mealId) });
        logger.error(e);
      }
    };
    pendingSaveRef.current = doSave;
    const t = setTimeout(doSave, 700);
    return () => clearTimeout(t);
  }, [mealId, creatorId, mealLoading, mealFormName, mealFormItems, mealFormVideoUrl, showToast]);

  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) pendingSaveRef.current();
    };
  }, []);

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
      logger.error('Food search failed', e);
      setMealFormSearchResults([]);
      showToast('No pudimos buscar alimentos. Intenta de nuevo.', 'error');
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
          <div className="library-session-sidebar" style={{ padding: 16 }}>
            <ShimmerSkeleton width="100%" height="40px" borderRadius="8px" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <ShimmerSkeleton key={i} width="100%" height="48px" borderRadius="8px" />
              ))}
            </div>
          </div>
          <div className="library-session-main" style={{ padding: 24 }}>
            <ShimmerSkeleton width="200px" height="22px" borderRadius="6px" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <ShimmerSkeleton width="48px" height="48px" borderRadius="8px" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <ShimmerSkeleton width="60%" height="14px" borderRadius="4px" />
                    <ShimmerSkeleton width="40%" height="12px" borderRadius="4px" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (mealError) {
    return (
      <DashboardLayout screenName="Comida" showBackButton backPath="/nutrition">
        <FullScreenError
          title="No pudimos cargar la receta"
          message="Hubo un problema cargando esta receta. Revisa tu conexion e intenta de nuevo."
          onRetry={refetchMeal}
        />
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
          <div className="library-session-sidebar plan-editor-sidebar">
            <div className="pe-left-search">
              <div className="pe-search-input-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input
                  type="text"
                  placeholder="Buscar alimento..."
                  value={mealFormSearchQuery}
                  onChange={(e) => setMealFormSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMealFormSearch()}
                />
                <button type="button" className="pe-search-action" onClick={() => setManualFoodModalOpen(true)} title="Alimento propio">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>
            </div>
            <div className="pe-left-list">
              {mealFormSearchLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="pe-food-card pe-food-card--skeleton" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="pe-skeleton-line pe-skeleton-line--name" />
                    <div className="pe-skeleton-line pe-skeleton-line--meta" />
                  </div>
                ))
              ) : sortedSearchResults.length === 0 ? (
                <p className="pe-left-empty">Escribe y pulsa Enter para buscar alimentos, o usa + para crear uno propio.</p>
              ) : (
                <>
                  {sortedSearchResults.map((f) => {
                    const per100 = getPer100g(f);
                    const portionOptions = getServingsWithStandardOptions(f);
                    const hasServings = portionOptions.length > 0;
                    return (
                      <div
                        key={f.food_id}
                        className="pe-food-card"
                        draggable={hasServings}
                        onDragStart={(e) => {
                          if (!hasServings) return;
                          e.dataTransfer.setData('application/json', JSON.stringify({ food_id: f.food_id }));
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => {
                          if (!hasServings) return;
                          addFoodToMeal(f, portionOptions[0], 1);
                        }}
                      >
                        <span className="pe-food-card-name">{f.food_name}</span>
                        {per100 && (
                          <div className="pe-food-card-meta">
                            <span>{per100.calories} kcal</span>
                            <span>P {per100.protein}g</span>
                            <span>C {per100.carbs}g</span>
                            <span>G {per100.fat}g</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <p className="pe-drag-hint">Click o arrastra para agregar</p>
                </>
              )}
            </div>
          </div>

          <div className="library-session-main">
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

          <div className="library-session-sidebar-right">
            <div className="meal-editor-calories-hero">
              <div className="meal-editor-calories-value">{totals.calories}</div>
              <div className="meal-editor-calories-label">kcal</div>
            </div>
            <div className="meal-editor-macro-cards">
              <div className="meal-editor-macro-card">
                <span className="meal-editor-macro-card-value">{totals.protein.toFixed(0)}g</span>
                <span className="meal-editor-macro-card-label">Proteina</span>
              </div>
              <div className="meal-editor-macro-card">
                <span className="meal-editor-macro-card-value">{totals.carbs.toFixed(0)}g</span>
                <span className="meal-editor-macro-card-label">Carbos</span>
              </div>
              <div className="meal-editor-macro-card">
                <span className="meal-editor-macro-card-value">{totals.fat.toFixed(0)}g</span>
                <span className="meal-editor-macro-card-label">Grasa</span>
              </div>
            </div>
            <div className="meal-editor-video-card">
              <h3 className="meal-editor-video-card-title">Video</h3>
              <div className="meal-editor-video-link-row">
                <input
                  type="url"
                  className={`meal-editor-video-input${videoUrlError ? ' meal-editor-video-input--error' : ''}`}
                  placeholder="YouTube o Vimeo..."
                  value={mealFormVideoUrl}
                  onChange={(e) => { setVideoUrlDirty(true); setMealFormVideoUrl(e.target.value); }}
                />
              </div>
              {videoUrlError && (
                <p className="meal-editor-video-error">{videoUrlError}</p>
              )}
              {mealFormVideoUrl.trim() && !videoUrlError && (() => {
                const url = mealFormVideoUrl.trim();
                const embedUrl = getEmbedUrl(url);
                if (!embedUrl) return null;
                return (
                  <div className="meal-editor-video-preview">
                    <iframe src={embedUrl} allow="autoplay; encrypted-media" allowFullScreen title="Video receta" className="meal-editor-video-player" />
                    <div className="meal-editor-video-actions">
                      <button type="button" className="meal-editor-video-action-btn meal-editor-video-action-btn--danger" onClick={() => { setVideoUrlDirty(true); setMealFormVideoUrl(''); }}>Eliminar</button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="meal-editor-attribution">
          <span>Powered by fatsecret</span>
        </div>
      </div>

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

      {/* MediaPickerModal kept for potential future use with links tab */}
      <MediaPickerModal
        isOpen={videoMediaPickerOpen}
        onClose={() => setVideoMediaPickerOpen(false)}
        onSelect={(item) => {
          const url = item.url ?? '';
          if (isValidExternalVideoUrl(url)) {
            setMealFormVideoUrl(url);
          }
          setVideoMediaPickerOpen(false);
        }}
        creatorId={creatorId}
        accept="video/*"
      />
      <ContextualHint screenKey="meal-editor" />
    </DashboardLayout>
  );
}
