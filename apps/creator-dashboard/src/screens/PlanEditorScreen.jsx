/**
 * Plan Editor Screen — Edit a nutrition plan. Layout like meal editor:
 * Left: food search + recipes (library meals); Center: macro objectives + categories/options; Right: macros summary.
 * Each category has a standalone title (edit icon → modal) and options as pills (Opción 1, Opción 2, +).
 * Each option has items: same structure as a recipe (foods + recipe refs with recipe: true in data only).
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import * as nutritionApi from '../services/nutritionApiService';
import * as nutritionDb from '../services/nutritionFirestoreService';
import './LibrarySessionDetailScreen.css';
import './MealEditorScreen.css';
import './PlanEditorScreen.css';
import '../components/PropagateChangesModal.css';

const DEFAULT_CATEGORIES = [
  { id: 'breakfast', label: 'Desayuno', order: 0, options: [{ id: 'opt_1', label: 'Opción 1', items: [] }] },
  { id: 'lunch', label: 'Almuerzo', order: 1, options: [{ id: 'opt_1', label: 'Opción 1', items: [] }] },
  { id: 'dinner', label: 'Cena', order: 2, options: [{ id: 'opt_1', label: 'Opción 1', items: [] }] },
  { id: 'snacks', label: 'Snacks', order: 3, options: [{ id: 'opt_1', label: 'Opción 1', items: [] }] },
];

/** Macro distribution presets: P% / C% / F% (sum = 100). Grams = (calories * pct/100) / kcalPerGram. */
const MACRO_PRESETS = [
  { id: 'balanced', label: 'Equilibrado (30 / 40 / 30)', pctProtein: 30, pctCarbs: 40, pctFat: 30 },
  { id: 'high_protein', label: 'Alto proteína (35 / 35 / 30)', pctProtein: 35, pctCarbs: 35, pctFat: 30 },
  { id: 'low_carb', label: 'Bajo carbos (40 / 25 / 35)', pctProtein: 40, pctCarbs: 25, pctFat: 35 },
  { id: 'keto', label: 'Keto (20 / 5 / 75)', pctProtein: 20, pctCarbs: 5, pctFat: 75 },
];

const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARBS = 4;
const KCAL_PER_G_FAT = 9;

function gramsFromCaloriesAndPreset(calories, preset) {
  if (!preset || !Number.isFinite(calories) || calories <= 0) return { protein: 0, carbs: 0, fat: 0 };
  const p = (calories * (preset.pctProtein / 100)) / KCAL_PER_G_PROTEIN;
  const c = (calories * (preset.pctCarbs / 100)) / KCAL_PER_G_CARBS;
  const f = (calories * (preset.pctFat / 100)) / KCAL_PER_G_FAT;
  return { protein: Math.round(p * 10) / 10, carbs: Math.round(c * 10) / 10, fat: Math.round(f * 10) / 10 };
}

/** Infer preset id from stored grams and calories, or 'custom' if no match. */
function inferPresetFromGrams(calories, proteinG, carbsG, fatG) {
  if (!Number.isFinite(calories) || calories <= 0) return 'custom';
  const calP = (Number(proteinG) || 0) * KCAL_PER_G_PROTEIN;
  const calC = (Number(carbsG) || 0) * KCAL_PER_G_CARBS;
  const calF = (Number(fatG) || 0) * KCAL_PER_G_FAT;
  const pctP = (calP / calories) * 100;
  const pctC = (calC / calories) * 100;
  const pctF = (calF / calories) * 100;
  for (const preset of MACRO_PRESETS) {
    if (Math.abs(pctP - preset.pctProtein) <= 3 && Math.abs(pctC - preset.pctCarbs) <= 3 && Math.abs(pctF - preset.pctFat) <= 3) {
      return preset.id;
    }
  }
  return 'custom';
}

/** Get per-100g values from food (FatSecret API shape) for sorting and display. Handles serving as array or single object. */
function getPer100g(food) {
  const raw = food?.servings?.serving;
  const servings = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  if (servings.length === 0) return null;
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

const DERIVED_100G_ID = 'derived-100g';
const DERIVED_1G_ID = 'derived-1g';
function descriptionLooksLike100g(s) {
  return /100\s*g|100g/i.test(String(s.serving_description || ''));
}
function descriptionLooksLike1g(s) {
  return /^1\s*g$|^1g$/i.test(String(s.serving_description || '').trim());
}
/** Return servings array with 100g and 1g options when missing (same as meal editor). */
function getServingsWithStandardOptions(food) {
  const raw = food?.servings?.serving;
  const list = Array.isArray(raw) ? [...raw] : (raw ? [raw] : []);
  const per100 = getPer100g(food);
  if (!per100) return list;
  if (!list.some(descriptionLooksLike100g)) {
    list.unshift({
      serving_id: DERIVED_100G_ID,
      serving_description: '100 g',
      calories: per100.calories,
      protein: per100.protein,
      carbohydrate: per100.carbs,
      fat: per100.fat,
      metric_serving_amount: 100,
      metric_serving_unit: 'g',
    });
  }
  if (!list.some(descriptionLooksLike1g)) {
    list.unshift({
      serving_id: DERIVED_1G_ID,
      serving_description: '1 g',
      calories: Math.round(per100.calories / 100 * 10) / 10,
      protein: Math.round(per100.protein / 100 * 100) / 100,
      carbohydrate: Math.round(per100.carbs / 100 * 100) / 100,
      fat: Math.round(per100.fat / 100 * 100) / 100,
      metric_serving_amount: 1,
      metric_serving_unit: 'g',
    });
  }
  return list;
}

/** Normalize category from legacy meal_options or ensure options[].items exist. */
function normalizeCategory(c, i) {
  const opts = c.options;
  if (Array.isArray(opts) && opts.length > 0) {
    return {
      id: c.id || `cat_${i}`,
      label: c.label || 'Categoría',
      order: i,
      options: opts.map((o, oi) => ({
        id: o.id || `opt_${oi + 1}`,
        label: o.label || `Opción ${oi + 1}`,
        items: Array.isArray(o.items) ? o.items : [],
      })),
    };
  }
  const legacy = c.meal_options || [];
  return {
    id: c.id || `cat_${i}`,
    label: c.label || 'Categoría',
    order: i,
    options: [
      {
        id: 'opt_1',
        label: 'Opción 1',
        items: legacy.map((o) => ({ recipe: true, meal_id: o.meal_id, name: o.name || '' })),
      },
    ],
  };
}

export default function PlanEditorScreen() {
  const navigate = useNavigate();
  const { planId } = useParams();
  const { user } = useAuth();
  const creatorId = user?.uid ?? '';

  const [planName, setPlanName] = useState('');
  const [planLoading, setPlanLoading] = useState(true);
  const [dailyCalories, setDailyCalories] = useState('');
  const [dailyProtein, setDailyProtein] = useState('');
  const [dailyCarbs, setDailyCarbs] = useState('');
  const [dailyFat, setDailyFat] = useState('');
  /** 'balanced' | 'high_protein' | 'low_carb' | 'keto' | 'custom'. When not 'custom', grams are derived from calories + preset. */
  const [distributionPreset, setDistributionPreset] = useState('balanced');
  const [categories, setCategories] = useState(() => DEFAULT_CATEGORIES.map((c, i) => normalizeCategory({ ...c, options: c.options || [] }, i)));
  const lastSavedRef = useRef({ name: '', macros: '', categoriesJson: '' });
  const [categoryEditModal, setCategoryEditModal] = useState({ open: false, categoryIndex: -1, label: '', confirmingDelete: false });
  const [deleteOptionModal, setDeleteOptionModal] = useState({ open: false, categoryIndex: -1, optionIndex: -1, optionLabel: '', itemCount: 0 });
  const [selectedOptionByCategory, setSelectedOptionByCategory] = useState({}); // { [catIdx]: optIdx }
  const selectedOption = (catIdx) => selectedOptionByCategory[catIdx] ?? 0;
  const setSelectedOption = (catIdx, optIdx) => setSelectedOptionByCategory((prev) => ({ ...prev, [catIdx]: optIdx }));

  const [meals, setMeals] = useState([]);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('');

  const [leftPanelTab, setLeftPanelTab] = useState('alimentos'); // 'alimentos' | 'recetas'

  const [foodSearchQuery, setFoodSearchQuery] = useState('');
  const [foodSearchResults, setFoodSearchResults] = useState([]);
  const [foodSearchLoading, setFoodSearchLoading] = useState(false);
  const [foodSortBy, setFoodSortBy] = useState('name'); // 'name' | 'calories' | 'protein' | 'carbs' | 'fat'
  const [foodSortMenuOpen, setFoodSortMenuOpen] = useState(false);
  const [customFoods, setCustomFoods] = useState([]); // manual food items for Alimentos tab
  const [manualFoodModalOpen, setManualFoodModalOpen] = useState(false);
  const [planEditorManualFood, setPlanEditorManualFood] = useState({
    name: '', food_id: '', serving_id: '0', units: 1, calories: '', protein: '', carbs: '', fat: '',
  });

  useEffect(() => {
    if (!planId || !creatorId) {
      navigate('/nutrition', { replace: true });
      return;
    }
    let cancelled = false;
    setPlanLoading(true);
    Promise.all([
      nutritionDb.getPlanById(creatorId, planId),
      nutritionDb.getMealsByCreator(creatorId),
    ]).then(([plan, mealsList]) => {
      if (cancelled) return;
      if (plan) {
        setPlanName(plan.name ?? '');
        const cal = plan.daily_calories != null ? String(plan.daily_calories) : '';
        const p = plan.daily_protein_g != null ? String(plan.daily_protein_g) : '';
        const c = plan.daily_carbs_g != null ? String(plan.daily_carbs_g) : '';
        const f = plan.daily_fat_g != null ? String(plan.daily_fat_g) : '';
        setDailyCalories(cal);
        setDailyProtein(p);
        setDailyCarbs(c);
        setDailyFat(f);
        const inferred = inferPresetFromGrams(
          plan.daily_calories ?? 0,
          plan.daily_protein_g,
          plan.daily_carbs_g,
          plan.daily_fat_g
        );
        setDistributionPreset(inferred);
        const cats = Array.isArray(plan.categories) && plan.categories.length > 0
          ? plan.categories.map((c, i) => normalizeCategory(c, i))
          : DEFAULT_CATEGORIES.map((c, i) => normalizeCategory({ ...c, options: c.options || [] }, i));
        setCategories(cats);
        lastSavedRef.current = {
          name: plan.name ?? '',
          macros: JSON.stringify({ cal: plan.daily_calories, p: plan.daily_protein_g, c: plan.daily_carbs_g, f: plan.daily_fat_g }),
          categoriesJson: JSON.stringify(cats),
        };
      }
      setMeals(mealsList || []);
      setPlanLoading(false);
    }).catch(() => setPlanLoading(false));
    return () => { cancelled = true; };
  }, [planId, creatorId, navigate]);

  // When calories or distribution preset change (and not custom), recompute macro grams.
  useEffect(() => {
    if (distributionPreset === 'custom') return;
    const cal = Number(dailyCalories);
    if (!Number.isFinite(cal) || cal <= 0) return;
    const preset = MACRO_PRESETS.find((x) => x.id === distributionPreset);
    if (!preset) return;
    const { protein, carbs, fat } = gramsFromCaloriesAndPreset(cal, preset);
    setDailyProtein(String(protein));
    setDailyCarbs(String(carbs));
    setDailyFat(String(fat));
  }, [dailyCalories, distributionPreset]);

  useEffect(() => {
    if (!planId || !creatorId || planLoading) return;
    const name = planName.trim();
    const macros = JSON.stringify({
      cal: dailyCalories === '' ? null : Number(dailyCalories),
      p: dailyProtein === '' ? null : Number(dailyProtein),
      c: dailyCarbs === '' ? null : Number(dailyCarbs),
      f: dailyFat === '' ? null : Number(dailyFat),
    });
    const categoriesJson = JSON.stringify(categories);
    if (name === lastSavedRef.current.name && macros === lastSavedRef.current.macros && categoriesJson === lastSavedRef.current.categoriesJson) return;
    const t = setTimeout(async () => {
      try {
        await nutritionDb.updatePlan(creatorId, planId, {
          name: name || 'Plan',
          daily_calories: dailyCalories === '' ? null : Number(dailyCalories),
          daily_protein_g: dailyProtein === '' ? null : Number(dailyProtein),
          daily_carbs_g: dailyCarbs === '' ? null : Number(dailyCarbs),
          daily_fat_g: dailyFat === '' ? null : Number(dailyFat),
          categories: categories.map((c, i) => ({
            id: c.id || `cat_${i}`,
            label: (c.label || '').trim() || 'Categoría',
            order: i,
            options: (c.options || []).map((o, oi) => ({
              id: o.id || `opt_${oi + 1}`,
              label: (o.label || '').trim() || `Opción ${oi + 1}`,
              items: (o.items || []).map((item) => {
                if (item.recipe === true) {
                  return { recipe: true, meal_id: item.meal_id, name: (item.name || '').trim() || (meals.find((m) => m.id === item.meal_id)?.name || 'Opción') };
                }
                return { ...item, name: (item.name || '').trim() || 'Alimento' };
              }),
            })),
          })),
        });
        lastSavedRef.current = { name, macros, categoriesJson };
      } catch (e) {
        console.error(e);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [planId, creatorId, planLoading, planName, dailyCalories, dailyProtein, dailyCarbs, dailyFat, categories, meals]);

  async function handleFoodSearch() {
    if (!foodSearchQuery.trim()) return;
    setFoodSearchLoading(true);
    setFoodSearchResults([]);
    try {
      const data = await nutritionApi.nutritionFoodSearch(foodSearchQuery.trim(), 0, 20);
      const raw = data?.foods_search?.results?.food ?? [];
      const foods = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      setFoodSearchResults(foods);
    } catch (e) {
      setFoodSearchResults([]);
    } finally {
      setFoodSearchLoading(false);
    }
  }

  const filteredMeals = recipeSearchQuery.trim()
    ? meals.filter((m) => (m.name || '').toLowerCase().includes(recipeSearchQuery.toLowerCase()))
    : meals;

  const sortedFoodSearchResults = useMemo(() => {
    const list = [...foodSearchResults];
    const per100 = (f) => getPer100g(f);
    const cmp = (a, b) => {
      const pa = per100(a);
      const pb = per100(b);
      switch (foodSortBy) {
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
  }, [foodSearchResults, foodSortBy]);

  function addCustomFoodFromModal() {
    const m = planEditorManualFood;
    const name = (m.name || '').trim() || 'Alimento propio';
    const foodId = (m.food_id || '').trim() || `manual-${Date.now()}`;
    const units = Number(m.units) || 1;
    setCustomFoods((prev) => [
      ...prev,
      {
        food_id: foodId,
        serving_id: m.serving_id || '0',
        number_of_units: units,
        name,
        calories: m.calories !== '' ? Number(m.calories) : null,
        protein: m.protein !== '' ? Number(m.protein) : null,
        carbs: m.carbs !== '' ? Number(m.carbs) : null,
        fat: m.fat !== '' ? Number(m.fat) : null,
      },
    ]);
    setPlanEditorManualFood({ name: '', food_id: '', serving_id: '0', units: 1, calories: '', protein: '', carbs: '', fat: '' });
    setManualFoodModalOpen(false);
  }

  function addCategory() {
    setCategories((prev) => [
      ...prev,
      { id: `cat_${Date.now()}`, label: 'Nueva categoría', order: prev.length, options: [{ id: `opt_${Date.now()}`, label: 'Opción 1', items: [] }] },
    ]);
  }

  function updateCategoryLabel(catIdx, newLabel) {
    setCategories((prev) => {
      const next = [...prev];
      next[catIdx] = { ...next[catIdx], label: (newLabel || '').trim() || next[catIdx].label };
      return next;
    });
    setCategoryEditModal({ open: false, categoryIndex: -1, label: '', confirmingDelete: false });
  }

  function deleteCategory(catIdx) {
    setCategories((prev) => prev.filter((_, i) => i !== catIdx).map((c, i) => ({ ...c, order: i })));
    setSelectedOptionByCategory((prev) => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const idx = Number(k);
        if (idx === catIdx) return;
        next[idx < catIdx ? idx : idx - 1] = v;
      });
      return next;
    });
    setCategoryEditModal({ open: false, categoryIndex: -1, label: '', confirmingDelete: false });
  }

  function addOption(catIdx) {
    setCategories((prev) => {
      const next = [...prev];
      const cat = next[catIdx];
      const opts = [...(cat.options || [])];
      const optionNumbers = opts
        .map((o) => /^Opción (\d+)$/.exec(o.label || ''))
        .filter(Boolean)
        .map((m) => parseInt(m[1], 10));
      const nextNum = optionNumbers.length > 0 ? Math.max(...optionNumbers) + 1 : opts.length + 1;
      opts.push({ id: `opt_${Date.now()}`, label: `Opción ${nextNum}`, items: [] });
      next[catIdx] = { ...cat, options: opts };
      return next;
    });
  }

  function deleteOption(catIdx, optIdx) {
    setCategories((prev) => {
      const next = [...prev];
      const cat = next[catIdx];
      const opts = (cat.options || []).filter((_, i) => i !== optIdx);
      next[catIdx] = { ...cat, options: opts };
      return next;
    });
    setSelectedOptionByCategory((prev) => {
      const current = prev[catIdx] ?? 0;
      if (current === optIdx) {
        return { ...prev, [catIdx]: Math.max(0, optIdx - 1) };
      }
      if (current > optIdx) {
        return { ...prev, [catIdx]: current - 1 };
      }
      return prev;
    });
  }

  /** Add a recipe as a new option in the category (label = recipe name, single item). */
  function addRecipeAsNewOption(catIdx, meal) {
    const recipeRef = { recipe: true, meal_id: meal.id, name: meal.name || '' };
    setCategories((prev) => {
      const next = [...prev];
      const cat = next[catIdx];
      const opts = [...(cat.options || [])];
      opts.push({
        id: `opt_${Date.now()}`,
        label: (meal.name || '').trim() || 'Receta',
        items: [recipeRef],
      });
      next[catIdx] = { ...cat, options: opts };
      return next;
    });
    setSelectedOption(catIdx, categories[catIdx].options.length);
  }

  function addItemToOption(catIdx, optIdx, item) {
    setCategories((prev) => {
      const next = [...prev];
      const cat = next[catIdx];
      const opts = [...(cat.options || [])];
      const opt = opts[optIdx];
      if (!opt) return prev;
      const items = [...(opt.items || [])];
      if (item.recipe === true && items.some((i) => i.recipe === true && i.meal_id === item.meal_id)) return prev;
      items.push(item);
      const recipeName = (item.recipe === true && (item.name || '').trim()) || null;
      opts[optIdx] = {
        ...opt,
        items,
        label: recipeName ? recipeName : opt.label,
      };
      next[catIdx] = { ...cat, options: opts };
      return next;
    });
  }

  function removeOptionItem(catIdx, optIdx, itemIdx) {
    setCategories((prev) => {
      const next = [...prev];
      const cat = next[catIdx];
      const opts = [...(cat.options || [])];
      const opt = opts[optIdx];
      if (!opt?.items) return prev;
      opts[optIdx] = { ...opt, items: opt.items.filter((_, i) => i !== itemIdx) };
      next[catIdx] = { ...cat, options: opts };
      return next;
    });
  }

  function updateOptionItem(catIdx, optIdx, itemIdx, updates) {
    setCategories((prev) => {
      const next = [...prev];
      const cat = next[catIdx];
      const opts = [...(cat.options || [])];
      const opt = opts[optIdx];
      if (!opt?.items || !opt.items[itemIdx]) return prev;
      const items = [...opt.items];
      items[itemIdx] = { ...items[itemIdx], ...updates };
      opts[optIdx] = { ...opt, items };
      next[catIdx] = { ...cat, options: opts };
      return next;
    });
  }

  /** Add dropped item to category ci, option optIdx. Used by both category block and option pill drop targets. */
  function applyDropToOption(e, ci, optIdx) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('plan-editor-category-block-dropzone-active');
    e.currentTarget.classList.remove('meal-editor-dropzone-active');
    e.currentTarget.classList.remove('plan-editor-option-pill-dropzone-active');
    e.currentTarget.closest?.('.plan-editor-category-block')?.classList.remove('plan-editor-category-block-dropzone-active');
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.custom_food_item) {
        addItemToOption(ci, optIdx, data.custom_food_item);
      } else if (data.meal_id != null) {
        const meal = meals.find((m) => m.id === data.meal_id) || { id: data.meal_id, name: data.meal_name || '' };
        addRecipeAsNewOption(ci, meal);
      } else if (data.food_id != null) {
        const food = foodSearchResults.find((f) => String(f.food_id) === String(data.food_id));
        if (!food) return;
        const portionOptions = getServingsWithStandardOptions(food);
        if (portionOptions.length === 0) return;
        const s = portionOptions[0];
        const mult = 1;
        addItemToOption(ci, optIdx, {
          food_id: food.food_id,
          serving_id: s.serving_id,
          number_of_units: mult,
          name: food.food_name || 'Alimento',
          calories: s.calories != null ? Math.round(Number(s.calories) * mult) : null,
          protein: s.protein != null ? Math.round(Number(s.protein) * mult * 10) / 10 : null,
          carbs: s.carbohydrate != null ? Math.round(Number(s.carbohydrate) * mult * 10) / 10 : null,
          fat: s.fat != null ? Math.round(Number(s.fat) * mult * 10) / 10 : null,
          servings: portionOptions,
        });
      }
    } catch (_) {}
  }

  function handleDropOnCategory(e, ci) {
    applyDropToOption(e, ci, selectedOption(ci));
  }

  /** Totals from the currently selected option in each category (planned food only). */
  const selectedOptionsTotals = useMemo(() => {
    let calories = 0, protein = 0, carbs = 0, fat = 0;
    for (let ci = 0; ci < categories.length; ci++) {
      const cat = categories[ci];
      const optIdx = selectedOption(ci);
      const opt = (cat.options || [])[optIdx];
      if (!opt?.items?.length) continue;
      for (const item of opt.items || []) {
        if (item.recipe === true && item.meal_id) {
          const meal = meals.find((m) => m.id === item.meal_id);
          if (meal?.items?.length) {
            for (const sub of meal.items) {
              calories += Number(sub.calories) || 0;
              protein += Number(sub.protein) || 0;
              carbs += Number(sub.carbs) || Number(sub.carbohydrate) || 0;
              fat += Number(sub.fat) || 0;
            }
          }
        } else {
          calories += Number(item.calories) || 0;
          protein += Number(item.protein) || 0;
          carbs += Number(item.carbs) || Number(item.carbohydrate) || 0;
          fat += Number(item.fat) || 0;
        }
      }
    }
    return { calories: Math.round(calories), protein, carbs, fat };
  }, [categories, selectedOptionByCategory, meals]);

  /** Pie chart data from planned macros (selected options only). */
  const planEditorPieData = useMemo(() => {
    const pCal = selectedOptionsTotals.protein * 4;
    const cCal = selectedOptionsTotals.carbs * 4;
    const fCal = selectedOptionsTotals.fat * 9;
    const totalCal = pCal + cCal + fCal;
    if (totalCal <= 0) return [];
    return [
      { name: 'Proteína', value: pCal, grams: selectedOptionsTotals.protein },
      { name: 'Carbohidratos', value: cCal, grams: selectedOptionsTotals.carbs },
      { name: 'Grasa', value: fCal, grams: selectedOptionsTotals.fat },
    ].filter((d) => d.value > 0);
  }, [selectedOptionsTotals]);

  const displayCal = dailyCalories === '' ? 0 : Number(dailyCalories) || 0;
  const displayProtein = dailyProtein === '' ? 0 : Number(dailyProtein) || 0;
  const displayCarbs = dailyCarbs === '' ? 0 : Number(dailyCarbs) || 0;
  const displayFat = dailyFat === '' ? 0 : Number(dailyFat) || 0;

  if (planLoading) {
    return (
      <DashboardLayout screenName="Plan" showBackButton backPath="/nutrition">
        <div className="library-session-detail-container">
          <p style={{ color: 'rgba(255,255,255,0.6)', padding: 24 }}>Cargando…</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      screenName={planName || 'Plan'}
      showBackButton
      backPath="/nutrition"
    >
      <div className="library-session-detail-container">
        <div className="library-session-detail-body">
          {/* Left — Tabs: Alimentos | Recetas, then section content */}
          <div className="library-session-sidebar plan-editor-sidebar">
            <div className="plan-editor-sidebar-tabs">
              <button
                type="button"
                className={`plan-editor-sidebar-tab ${leftPanelTab === 'alimentos' ? 'active' : ''}`}
                onClick={() => setLeftPanelTab('alimentos')}
              >
                Alimentos
              </button>
              <button
                type="button"
                className={`plan-editor-sidebar-tab ${leftPanelTab === 'recetas' ? 'active' : ''}`}
                onClick={() => setLeftPanelTab('recetas')}
              >
                Recetas
              </button>
            </div>

            {leftPanelTab === 'alimentos' && (
              <div className="plan-editor-sidebar-panel">
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
                        value={foodSearchQuery}
                        onChange={(e) => setFoodSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleFoodSearch()}
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
                    <button type="button" className="meal-editor-search-btn" onClick={handleFoodSearch} disabled={foodSearchLoading}>
                      {foodSearchLoading ? '…' : 'Buscar'}
                    </button>
                    <div className="meal-editor-sort-wrap">
                      <button
                        type="button"
                        className="meal-editor-sort-btn"
                        onClick={() => setFoodSortMenuOpen((o) => !o)}
                        aria-label="Ordenar"
                        title="Ordenar"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                      {foodSortMenuOpen && (
                        <>
                          <div className="meal-editor-sort-backdrop" onClick={() => setFoodSortMenuOpen(false)} />
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
                                className={`meal-editor-sort-opt ${foodSortBy === opt.id ? 'active' : ''}`}
                                onClick={() => { setFoodSortBy(opt.id); setFoodSortMenuOpen(false); }}
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
                <div className="plan-editor-sidebar-section plan-editor-sidebar-list-wrap">
                  <div className="library-session-sidebar-content plan-editor-panel-list">
                    {sortedFoodSearchResults.length === 0 && customFoods.length === 0 ? (
                      <p className="library-session-empty-state">Escribe y pulsa Buscar para buscar alimentos en la base de datos, o usa + para añadir un alimento propio.</p>
                    ) : (
                      <>
                        {sortedFoodSearchResults.map((f) => {
                          const portionOptions = getServingsWithStandardOptions(f);
                          const hasServings = portionOptions.length > 0;
                          const per100 = getPer100g(f);
                          return (
                            <div
                              key={f.food_id}
                              draggable={hasServings}
                              className={`meal-editor-food-card plan-editor-panel-card plan-editor-food-card-readonly ${hasServings ? 'plan-editor-recipe-card-draggable' : ''}`}
                              onDragStart={(e) => {
                                if (!hasServings) return;
                                e.dataTransfer.setData('application/json', JSON.stringify({ food_id: f.food_id }));
                                e.dataTransfer.effectAllowed = 'copy';
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
                        {customFoods.map((item, idx) => (
                          <div
                            key={`custom-${item.food_id}-${idx}`}
                            draggable
                            className="meal-editor-food-card plan-editor-panel-card plan-editor-recipe-card-draggable"
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/json', JSON.stringify({ custom_food_item: item }));
                              e.dataTransfer.effectAllowed = 'copy';
                            }}
                          >
                            <span className="meal-editor-food-card-name">{item.name}</span>
                            <span className="meal-editor-food-card-per100">
                              {item.calories ?? '?'} kcal
                              {(item.protein != null || item.carbs != null || item.fat != null) && (
                                <> · P:{item.protein ?? '?'}g C:{item.carbs ?? '?'}g G:{item.fat ?? '?'}g</>
                              )}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {leftPanelTab === 'recetas' && (
              <div className="plan-editor-sidebar-panel">
                <div className="library-session-search-container meal-editor-search-block">
                  <div className="meal-editor-search-row-top">
                    <div className="library-session-search-input-container meal-editor-search-input-wrap">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="library-session-search-icon">
                        <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <input
                        type="text"
                        className="library-session-search-input"
                        placeholder="Buscar recetas…"
                        value={recipeSearchQuery}
                        onChange={(e) => setRecipeSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="plan-editor-sidebar-section plan-editor-sidebar-list-wrap">
                  <div className="library-session-sidebar-content plan-editor-panel-list plan-editor-recipes-list">
                    {filteredMeals.length === 0 ? (
                      <p className="library-session-empty-state">No hay recetas. Créalas en la pestaña Recetas.</p>
                    ) : (
                      filteredMeals.map((m) => (
                        <div
                          key={m.id}
                          draggable
                          className="meal-editor-food-card plan-editor-panel-card plan-editor-recipe-card plan-editor-recipe-card-draggable"
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/json', JSON.stringify({ meal_id: m.id, meal_name: m.name || '' }));
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                        >
                          <span className="meal-editor-food-card-name">{m.name}</span>
                          <span className="meal-editor-food-card-per100">
                            {m.items?.length ?? 0} alimento(s)
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Center — Macro objectives + Categories */}
          <div className="library-session-main plan-editor-main">
            <div className="plan-editor-macros-objectives">
              <h3 className="plan-editor-macros-objectives-title">Objetivos diarios</h3>
              <p className="plan-editor-macros-objectives-hint">Indica las calorías y cómo repartirlas en macros. Si eliges un preset, los gramos se calculan solos.</p>
              <div className="plan-editor-macros-inputs">
                <div className="plan-editor-macro-input-wrap">
                  <label>Calorías (kcal)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="ej. 2000"
                    value={dailyCalories}
                    onChange={(e) => setDailyCalories(e.target.value)}
                  />
                </div>
                <div className="plan-editor-macro-input-wrap plan-editor-macro-distribution-wrap">
                  <label>Distribución</label>
                  <select
                    className="plan-editor-distribution-select"
                    value={distributionPreset}
                    onChange={(e) => setDistributionPreset(e.target.value)}
                  >
                    {MACRO_PRESETS.map((pre) => (
                      <option key={pre.id} value={pre.id}>{pre.label}</option>
                    ))}
                    <option value="custom">Personalizado (gramos a mano)</option>
                  </select>
                </div>
              </div>
              {distributionPreset === 'custom' ? (
                <div className="plan-editor-macros-inputs plan-editor-macros-inputs-gram">
                  <div className="plan-editor-macro-input-wrap">
                    <label>Proteína (g)</label>
                    <input type="number" min={0} placeholder="—" value={dailyProtein} onChange={(e) => setDailyProtein(e.target.value)} />
                  </div>
                  <div className="plan-editor-macro-input-wrap">
                    <label>Carbos (g)</label>
                    <input type="number" min={0} placeholder="—" value={dailyCarbs} onChange={(e) => setDailyCarbs(e.target.value)} />
                  </div>
                  <div className="plan-editor-macro-input-wrap">
                    <label>Grasa (g)</label>
                    <input type="number" min={0} placeholder="—" value={dailyFat} onChange={(e) => setDailyFat(e.target.value)} />
                  </div>
                </div>
              ) : (
                <div className="plan-editor-macros-computed">
                  <span>Proteína: {displayProtein} g</span>
                  <span>Carbos: {displayCarbs} g</span>
                  <span>Grasa: {displayFat} g</span>
                </div>
              )}
            </div>
            <div className="plan-editor-categories-area">
              <div className="plan-editor-categories-header">
                <h3 className="plan-editor-categories-title">Categorías y opciones</h3>
                <button type="button" className="plan-editor-add-category-btn" onClick={addCategory}>+ Categoría</button>
              </div>
              <div className="plan-editor-categories-list">
                {categories.map((cat, ci) => (
                  <div
                    key={cat.id || ci}
                    className="plan-editor-category-block"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                      e.currentTarget.classList.add('plan-editor-category-block-dropzone-active');
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) {
                        e.currentTarget.classList.remove('plan-editor-category-block-dropzone-active');
                      }
                    }}
                    onDrop={(e) => handleDropOnCategory(e, ci)}
                  >
                    <div className="plan-editor-category-title-row">
                      <h4 className="plan-editor-category-title">{cat.label || 'Categoría'}</h4>
                      <button
                        type="button"
                        className="plan-editor-category-edit-btn"
                        onClick={() => setCategoryEditModal({ open: true, categoryIndex: ci, label: cat.label || '', confirmingDelete: false })}
                        aria-label="Editar nombre"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    </div>
                    <div className="plan-editor-options-pills">
                      {(cat.options || []).map((opt, oi) => (
                        <div
                          key={opt.id || oi}
                          className={`plan-editor-option-pill-wrap ${selectedOption(ci) === oi ? 'active' : ''}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'copy';
                            e.currentTarget.classList.add('plan-editor-option-pill-dropzone-active');
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) {
                              e.currentTarget.classList.remove('plan-editor-option-pill-dropzone-active');
                            }
                          }}
                          onDrop={(e) => applyDropToOption(e, ci, oi)}
                        >
                          <button
                            type="button"
                            className="plan-editor-option-pill"
                            onClick={() => setSelectedOption(ci, oi)}
                            aria-label={opt.label || `Opción ${oi + 1}`}
                          >
                            {opt.label || `Opción ${oi + 1}`}
                          </button>
                          <button
                            type="button"
                            className="plan-editor-option-pill-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              const opt = (cat.options || [])[oi];
                              const itemCount = opt?.items?.length ?? 0;
                              if (itemCount > 0) {
                                setDeleteOptionModal({
                                  open: true,
                                  categoryIndex: ci,
                                  optionIndex: oi,
                                  optionLabel: opt?.label || `Opción ${oi + 1}`,
                                  itemCount,
                                });
                              } else {
                                deleteOption(ci, oi);
                              }
                            }}
                            aria-label="Eliminar opción"
                            title="Eliminar opción"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button type="button" className="plan-editor-option-pill-add" onClick={() => addOption(ci)} aria-label="Añadir opción">
                        +
                      </button>
                    </div>
                    <div className="plan-editor-option-items-wrap">
                      <div
                        className={`plan-editor-option-items-dropzone ${((cat.options || [])[selectedOption(ci)]?.items || []).length === 0 ? 'empty' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; e.currentTarget.classList.add('meal-editor-dropzone-active'); }}
                        onDragLeave={(e) => e.currentTarget.classList.remove('meal-editor-dropzone-active')}
                        onDrop={(e) => handleDropOnCategory(e, ci)}
                      >
                        {((cat.options || [])[selectedOption(ci)]?.items || []).length === 0 ? (
                          <p className="plan-editor-add-hint">Arrastra alimentos o recetas aquí.</p>
                        ) : (
                          (cat.options || [])[selectedOption(ci)]?.items?.map((item, ii) => (
                            item.recipe === true ? (
                              <div key={ii} className="meal-editor-item-row">
                                <span className="meal-editor-item-name">{item.name || 'Receta'}</span>
                                <span className="meal-editor-item-meta">—</span>
                                <button type="button" className="meal-editor-item-remove" onClick={() => removeOptionItem(ci, selectedOption(ci), ii)} aria-label="Quitar">×</button>
                              </div>
                            ) : (
                              <div key={ii} className="plan-editor-option-item-card">
                                <div className="plan-editor-option-item-card-left">
                                  <span className="meal-editor-item-name">{item.name || 'Alimento'}</span>
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
                                          updateOptionItem(ci, selectedOption(ci), ii, {
                                            serving_id: s.serving_id,
                                            number_of_units: u,
                                            calories: s.calories != null ? Math.round(Number(s.calories) * u) : null,
                                            protein: s.protein != null ? Math.round(Number(s.protein) * u * 10) / 10 : null,
                                            carbs: s.carbohydrate != null ? Math.round(Number(s.carbohydrate) * u * 10) / 10 : null,
                                            fat: s.fat != null ? Math.round(Number(s.fat) * u * 10) / 10 : null,
                                          });
                                        }}
                                      >
                                        {Array.isArray(item.servings) && item.servings.length > 0 ? (
                                          item.servings.map((s) => (
                                            <option key={s.serving_id} value={s.serving_id}>
                                              {s.serving_description} — {s.calories} kcal
                                            </option>
                                          ))
                                        ) : (
                                          <option value="">—</option>
                                        )}
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
                                          if (list.length > 0) {
                                            const sid = item.serving_id ?? list[0]?.serving_id;
                                            const s = list.find((x) => String(x.serving_id) === String(sid)) || list[0];
                                            if (s) {
                                              updateOptionItem(ci, selectedOption(ci), ii, {
                                                number_of_units: u,
                                                calories: s.calories != null ? Math.round(Number(s.calories) * u) : null,
                                                protein: s.protein != null ? Math.round(Number(s.protein) * u * 10) / 10 : null,
                                                carbs: s.carbohydrate != null ? Math.round(Number(s.carbohydrate) * u * 10) / 10 : null,
                                                fat: s.fat != null ? Math.round(Number(s.fat) * u * 10) / 10 : null,
                                              });
                                            }
                                          } else {
                                            const prev = Number(item.number_of_units) || 1;
                                            const scale = u / prev;
                                            updateOptionItem(ci, selectedOption(ci), ii, {
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
                                  <button type="button" className="meal-editor-item-remove" onClick={() => removeOptionItem(ci, selectedOption(ci), ii)} aria-label="Quitar">×</button>
                                </div>
                              </div>
                            )
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Planned (selected options) + pie + planned/objective */}
          <div className="library-session-sidebar-right">
            <div className="meal-editor-calories-hero">
              <div className="meal-editor-calories-value">
                {selectedOptionsTotals.calories}
                {displayCal > 0 && (
                  <span className="plan-editor-calories-vs-objective"> / {displayCal}</span>
                )}
              </div>
              <div className="meal-editor-calories-label">kcal (plan / objetivo)</div>
            </div>
            <div className="library-session-sidebar-right-header">
              <h3 className="library-session-sidebar-right-title">Macros</h3>
              <p className="library-session-sidebar-right-subtitle">Distribución de la selección actual</p>
            </div>
            <div className="library-session-sidebar-right-content">
              {planEditorPieData.length === 0 ? (
                <div className="library-session-volume-empty">
                  Selecciona opciones en cada categoría y añade alimentos para ver la distribución.
                </div>
              ) : (
                <div className="library-session-volume-card library-session-volume-pie-card meal-editor-macros-card" style={{ width: '100%' }}>
                  <div className="meal-editor-macros-card-top">
                    <div className="library-session-pie-chart-wrap">
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart className="library-session-pie-chart">
                          <defs>
                            {[0, 1, 2].map((i) => (
                              <linearGradient key={i} id={`plan-editor-pie-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={`rgba(255,255,255,${0.22 + i * 0.06})`} />
                                <stop offset="50%" stopColor={`rgba(255,255,255,${0.12 + i * 0.04})`} />
                                <stop offset="100%" stopColor={`rgba(255,255,255,${0.05 + i * 0.03})`} />
                              </linearGradient>
                            ))}
                          </defs>
                          <Pie
                            data={planEditorPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={64}
                            paddingAngle={2}
                            dataKey="value"
                            label={false}
                          >
                            {planEditorPieData.map((_, i) => (
                              <Cell key={i} fill={`url(#plan-editor-pie-grad-${i})`} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const { name, grams } = payload[0].payload;
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
                      <span className="meal-editor-macro-grams">
                        {selectedOptionsTotals.protein.toFixed(0)} g
                        <span className="plan-editor-macro-vs-objective"> / {displayProtein}</span>
                      </span>
                    </div>
                    <div className="meal-editor-macro-row">
                      <span className="meal-editor-macro-name">Carbohidratos</span>
                      <span className="meal-editor-macro-grams">
                        {selectedOptionsTotals.carbs.toFixed(0)} g
                        <span className="plan-editor-macro-vs-objective"> / {displayCarbs}</span>
                      </span>
                    </div>
                    <div className="meal-editor-macro-row">
                      <span className="meal-editor-macro-name">Grasa</span>
                      <span className="meal-editor-macro-grams">
                        {selectedOptionsTotals.fat.toFixed(0)} g
                        <span className="plan-editor-macro-vs-objective"> / {displayFat}</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={categoryEditModal.open}
        onClose={() => setCategoryEditModal({ open: false, categoryIndex: -1, label: '', confirmingDelete: false })}
        title={categoryEditModal.confirmingDelete ? 'Eliminar categoría' : 'Editar categoría'}
      >
        <div className="plan-editor-category-edit-modal">
          {categoryEditModal.confirmingDelete ? (
            <>
              <p className="plan-editor-category-edit-confirm-text">
                ¿Eliminar la categoría &quot;{categoryEditModal.label || 'Categoría'}&quot; y todas sus opciones?
              </p>
              <div className="plan-editor-category-edit-actions">
                <button type="button" className="plan-editor-category-edit-cancel" onClick={() => setCategoryEditModal((m) => ({ ...m, confirmingDelete: false }))}>
                  Cancelar
                </button>
                <button type="button" className="plan-editor-category-edit-delete" onClick={() => categoryEditModal.categoryIndex >= 0 && deleteCategory(categoryEditModal.categoryIndex)}>
                  Eliminar
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="plan-editor-category-edit-label">Nombre</label>
              <input
                type="text"
                className="plan-editor-category-edit-input"
                value={categoryEditModal.label}
                onChange={(e) => setCategoryEditModal((m) => ({ ...m, label: e.target.value }))}
                placeholder="Ej. Desayuno"
              />
              <div className="plan-editor-category-edit-actions">
                <button type="button" className="plan-editor-category-edit-cancel" onClick={() => setCategoryEditModal({ open: false, categoryIndex: -1, label: '', confirmingDelete: false })}>
                  Cancelar
                </button>
                <button type="button" className="plan-editor-category-edit-save" onClick={() => categoryEditModal.categoryIndex >= 0 && updateCategoryLabel(categoryEditModal.categoryIndex, categoryEditModal.label)}>
                  Guardar
                </button>
              </div>
              {categories.length > 1 && (
                <div className="plan-editor-category-edit-delete-row">
                  <button type="button" className="plan-editor-category-edit-delete-btn" onClick={() => setCategoryEditModal((m) => ({ ...m, confirmingDelete: true }))}>
                    Eliminar categoría
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={deleteOptionModal.open}
        onClose={() => setDeleteOptionModal({ open: false, categoryIndex: -1, optionIndex: -1, optionLabel: '', itemCount: 0 })}
        title="Eliminar opción"
      >
        <div className="plan-editor-category-edit-modal">
          <p className="plan-editor-category-edit-confirm-text">
            La opción &quot;{deleteOptionModal.optionLabel}&quot; tiene {deleteOptionModal.itemCount} alimento(s). ¿Eliminarla?
          </p>
          <div className="plan-editor-category-edit-actions">
            <button
              type="button"
              className="plan-editor-category-edit-cancel"
              onClick={() => setDeleteOptionModal({ open: false, categoryIndex: -1, optionIndex: -1, optionLabel: '', itemCount: 0 })}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="plan-editor-category-edit-delete"
              onClick={() => {
                if (deleteOptionModal.categoryIndex >= 0 && deleteOptionModal.optionIndex >= 0) {
                  deleteOption(deleteOptionModal.categoryIndex, deleteOptionModal.optionIndex);
                }
                setDeleteOptionModal({ open: false, categoryIndex: -1, optionIndex: -1, optionLabel: '', itemCount: 0 });
              }}
            >
              Eliminar
            </button>
          </div>
        </div>
      </Modal>

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
                value={planEditorManualFood.name}
                onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, name: e.target.value }))}
                placeholder="ej. Mi batido"
                className="meal-editor-edit-name-input"
              />
              <label className="propagate-option-title">Unidades</label>
              <input
                type="number"
                value={planEditorManualFood.units}
                onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, units: e.target.value }))}
                placeholder="1"
                className="meal-editor-edit-name-input"
              />
              <label className="propagate-option-title">Calorías</label>
              <input
                type="number"
                value={planEditorManualFood.calories}
                onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, calories: e.target.value }))}
                placeholder="0"
                className="meal-editor-edit-name-input"
              />
              <label className="propagate-option-title">Proteína (g)</label>
              <input
                type="number"
                value={planEditorManualFood.protein}
                onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, protein: e.target.value }))}
                placeholder="0"
                className="meal-editor-edit-name-input"
              />
              <label className="propagate-option-title">Carbohidratos (g)</label>
              <input
                type="number"
                value={planEditorManualFood.carbs}
                onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, carbs: e.target.value }))}
                placeholder="0"
                className="meal-editor-edit-name-input"
              />
              <label className="propagate-option-title">Grasa (g)</label>
              <input
                type="number"
                value={planEditorManualFood.fat}
                onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, fat: e.target.value }))}
                placeholder="0"
                className="meal-editor-edit-name-input"
              />
            </div>
          </div>
          <div className="propagate-modal-footer">
            <button type="button" className="propagate-modal-btn propagate-modal-btn-dont" onClick={() => setManualFoodModalOpen(false)}>Cancelar</button>
            <button type="button" className="propagate-modal-btn propagate-modal-btn-propagate" onClick={addCustomFoodFromModal}>Añadir</button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
