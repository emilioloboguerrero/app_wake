/**
 * Plan Editor Screen — Edit a nutrition plan. Layout like meal editor:
 * Left: food search + recipes (library meals); Center: macro objectives + categories/options; Right: macros summary.
 * Each category has a standalone title (edit icon → modal) and options as pills (Opción 1, Opción 2, +).
 * Each option has items: same structure as a recipe (foods + recipe refs with recipe: true in data only).
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cacheConfig, queryKeys } from '../config/queryClient';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import Modal from '../components/Modal';
// PieChart removed in v4 redesign — kept import comment for reference
import * as nutritionApi from '../services/nutritionApiService';
import * as nutritionDb from '../services/nutritionFirestoreService';
import clientNutritionPlanContentService from '../services/clientNutritionPlanContentService';
import propagationService from '../services/propagationService';
import PropagateChangesModal from '../components/PropagateChangesModal';
import PropagateNavigateModal from '../components/PropagateNavigateModal';
import EditScopeInfoModal from '../components/EditScopeInfoModal';
import logger from '../utils/logger';
import { useToast } from '../contexts/ToastContext';
import ShimmerSkeleton from '../components/ui/ShimmerSkeleton';
import { FullScreenError, GlowingEffect, ScrollProgress } from '../components/ui';
import ContextualHint from '../components/hints/ContextualHint';
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
  const list = Array.isArray(raw) ? [...raw] : (raw ? [raw] : []);
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

function expandRecipeRefsLocally(categories, mealsMap) {
  return categories.map((cat) => ({
    ...cat,
    options: (cat.options || []).map((opt) => {
      let newItems = [];
      let recipe_meal_id = null;
      let recipe_name = null;
      let recipe_video_url = null;
      for (const item of opt.items || []) {
        if (item.recipe === true && item.meal_id) {
          const meal = mealsMap.get(item.meal_id);
          if (meal?.items?.length) {
            newItems = newItems.concat(meal.items);
            recipe_meal_id = meal.id;
            recipe_name = meal.name ?? item.name ?? '';
            recipe_video_url = meal.video_url ?? meal.videoUrl ?? null;
          } else {
            newItems.push({ ...item, name: item.name || meal?.name || 'Receta' });
          }
        } else {
          newItems.push(item);
        }
      }
      const expanded = { id: opt.id, label: opt.label ?? '', items: newItems };
      if (recipe_meal_id != null) {
        expanded.recipe_meal_id = recipe_meal_id;
        expanded.recipe_name = recipe_name;
        expanded.recipe_video_url = recipe_video_url;
      } else if (opt.recipe_meal_id != null || opt.recipe_video_url != null) {
        expanded.recipe_meal_id = opt.recipe_meal_id;
        expanded.recipe_name = opt.recipe_name;
        expanded.recipe_video_url = opt.recipe_video_url;
      }
      return expanded;
    }),
  }));
}

export default function PlanEditorScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { planId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const creatorId = user?.uid ?? '';

  const editScope = location.state?.editScope;
  const assignmentId = location.state?.assignmentId;
  const assignmentPlanId = location.state?.assignmentPlanId ?? planId;
  const clientName = location.state?.clientName ?? 'Cliente';
  const assignmentClientId = location.state?.clientId ?? null;
  const returnTo = location.state?.returnTo;
  const returnState = location.state?.returnState;
  const isAssignmentScope = editScope === 'assignment' && assignmentId;
  const [showScopeInfo, setShowScopeInfo] = useState(false);

  const [planName, setPlanName] = useState('');
  const [dailyCalories, setDailyCalories] = useState('');
  const [dailyProtein, setDailyProtein] = useState('');
  const [dailyCarbs, setDailyCarbs] = useState('');
  const [dailyFat, setDailyFat] = useState('');
  /** 'balanced' | 'high_protein' | 'low_carb' | 'keto' | 'custom'. When not 'custom', grams are derived from calories + preset. */
  const [distributionPreset, setDistributionPreset] = useState('balanced');
  const [categories, setCategories] = useState(() => DEFAULT_CATEGORIES.map((c, i) => normalizeCategory({ ...c, options: c.options || [] }, i)));
  const seededRef = useRef(false);
  const justSeededRef = useRef(false);
  const lastSavedRef = useRef({ name: '', macros: '', categoriesJson: '' });
  const pendingSaveRef = useRef(null);
  const assignmentCopyExistsRef = useRef(false);
  const [editingCategoryIndex, setEditingCategoryIndex] = useState(null);
  const [editingCategoryLabel, setEditingCategoryLabel] = useState('');
  const [deletingCategoryIndex, setDeletingCategoryIndex] = useState(null);
  const [deleteOptionModal, setDeleteOptionModal] = useState({ open: false, categoryIndex: -1, optionIndex: -1, optionLabel: '', itemCount: 0 });
  const [selectedOptionByCategory, setSelectedOptionByCategory] = useState({}); // { [catIdx]: optIdx }
  const selectedOption = (catIdx) => selectedOptionByCategory[catIdx] ?? 0;
  const setSelectedOption = (catIdx, optIdx) => setSelectedOptionByCategory((prev) => ({ ...prev, [catIdx]: optIdx }));

  const [meals, setMeals] = useState([]);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('');

  const [leftPanelTab, setLeftPanelTab] = useState('alimentos'); // 'alimentos' | 'recetas'

  const [foodSearchQuery, setFoodSearchQuery] = useState('');
  const [submittedFoodQuery, setSubmittedFoodQuery] = useState('');
  const [foodSortBy, setFoodSortBy] = useState('name'); // 'name' | 'calories' | 'protein' | 'carbs' | 'fat'
  const [foodSortMenuOpen, setFoodSortMenuOpen] = useState(false);
  const [customFoods, setCustomFoods] = useState([]); // manual food items for Alimentos tab
  const [manualFoodModalOpen, setManualFoodModalOpen] = useState(false);
  const [planEditorManualFood, setPlanEditorManualFood] = useState({
    name: '', food_id: '', serving_id: '0', units: 1, calories: '', protein: '', carbs: '', fat: '',
  });

  const [isPropagateModalOpen, setIsPropagateModalOpen] = useState(false);
  const [isNavigateModalOpen, setIsNavigateModalOpen] = useState(false);
  const [propagateAffectedCount, setPropagateAffectedCount] = useState(0);
  const [propagateAffectedUsers, setPropagateAffectedUsers] = useState([]);
  const [isPropagating, setIsPropagating] = useState(false);
  const [hasMadeChanges, setHasMadeChanges] = useState(false);

  useEffect(() => {
    if (!planId || planId === 'new' || !creatorId) navigate('/biblioteca?domain=nutricion&tab=planes_nutri', { replace: true });
    else if (isAssignmentScope && !assignmentId) navigate(returnTo || '/biblioteca?domain=nutricion', { replace: true });
  }, [planId, creatorId, isAssignmentScope, assignmentId, navigate, returnTo]);

  const { data: mealsData } = useQuery({
    queryKey: queryKeys.nutrition.meals(creatorId),
    queryFn: () => nutritionDb.getMealsByCreator(creatorId),
    enabled: !!creatorId,
    ...cacheConfig.otherPrograms,
    refetchOnMount: true,
  });

  const { data: planData, isLoading: planLoading, error: planError, refetch: refetchPlan } = useQuery({
    queryKey: isAssignmentScope
      ? ['nutrition', 'plan', 'assignment', assignmentId]
      : ['nutrition', 'plan', creatorId, planId],
    queryFn: async () => {
      if (isAssignmentScope) {
        const copy = await clientNutritionPlanContentService.getByAssignmentId(assignmentId);
        if (copy) { assignmentCopyExistsRef.current = true; return copy; }
        const effectivePlanId = assignmentPlanId || planId;
        return nutritionDb.getPlanById(creatorId, effectivePlanId);
      }
      return nutritionDb.getPlanById(creatorId, planId);
    },
    enabled: !!planId && !!creatorId && (!isAssignmentScope || !!assignmentId),
    ...cacheConfig.activeProgram,
  });

  const { data: foodSearchResults = [], isLoading: foodSearchLoading } = useQuery({
    queryKey: queryKeys.nutrition.foodSearch(submittedFoodQuery),
    queryFn: async () => {
      const data = await nutritionApi.nutritionFoodSearch(submittedFoodQuery, 0, 20);
      const raw = data?.foods_search?.results?.food ?? [];
      return Array.isArray(raw) ? raw : (raw ? [raw] : []);
    },
    enabled: !!submittedFoodQuery.trim(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const mealsMap = useMemo(() => new Map(meals.map((m) => [m.id, m])), [meals]);

  useEffect(() => {
    if (mealsData) setMeals(mealsData);
  }, [mealsData]);

  useEffect(() => {
    if (planData && !seededRef.current) {
      seededRef.current = true;
      setPlanName(planData.name ?? '');
      const cal = planData.daily_calories != null ? String(planData.daily_calories) : '';
      const p = planData.daily_protein_g != null ? String(planData.daily_protein_g) : '';
      const c = planData.daily_carbs_g != null ? String(planData.daily_carbs_g) : '';
      const f = planData.daily_fat_g != null ? String(planData.daily_fat_g) : '';
      setDailyCalories(cal);
      setDailyProtein(p);
      setDailyCarbs(c);
      setDailyFat(f);
      const hasStoredMacros = planData.daily_protein_g != null || planData.daily_carbs_g != null || planData.daily_fat_g != null;
      if (hasStoredMacros) {
        const inferred = inferPresetFromGrams(
          planData.daily_calories ?? 0,
          planData.daily_protein_g,
          planData.daily_carbs_g,
          planData.daily_fat_g
        );
        setDistributionPreset(inferred);
      }
      const cats = Array.isArray(planData.categories) && planData.categories.length > 0
        ? planData.categories.map((c, i) => normalizeCategory(c, i))
        : DEFAULT_CATEGORIES.map((c, i) => normalizeCategory({ ...c, options: c.options || [] }, i));
      setCategories(cats);
      justSeededRef.current = true;
    }
  }, [planData]);

  // When calories or distribution preset change (and not custom), recompute macro grams.
  useEffect(() => {
    if (justSeededRef.current) return;
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

  const planPayload = useMemo(() => ({
    name: (planName || '').trim() || 'Plan',
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
  }), [planName, dailyCalories, dailyProtein, dailyCarbs, dailyFat, categories, meals]);

  useEffect(() => {
    if (!planId || !creatorId || planLoading) return;
    const name = planPayload.name;
    const macros = JSON.stringify({
      cal: planPayload.daily_calories,
      p: planPayload.daily_protein_g,
      c: planPayload.daily_carbs_g,
      f: planPayload.daily_fat_g,
    });
    const categoriesJson = JSON.stringify(planPayload.categories);
    if (name === lastSavedRef.current.name && macros === lastSavedRef.current.macros && categoriesJson === lastSavedRef.current.categoriesJson) return;

    // First render after seeding: sync lastSavedRef from planPayload's shape without triggering changes
    if (justSeededRef.current) {
      justSeededRef.current = false;
      lastSavedRef.current = { name, macros, categoriesJson };
      return;
    }

    if (!isAssignmentScope) setHasMadeChanges(true);

    const doSave = async () => {
      pendingSaveRef.current = null;
      try {
        const expandedCategories = expandRecipeRefsLocally(planPayload.categories, mealsMap);
        const payloadToSave = {
          ...planPayload,
          categories: expandedCategories,
        };
        if (isAssignmentScope) {
          if (assignmentCopyExistsRef.current) {
            await clientNutritionPlanContentService.update(assignmentId, payloadToSave);
          } else {
            const effectivePlanId = assignmentPlanId || planId;
            await clientNutritionPlanContentService.setFromLibrary(assignmentId, effectivePlanId, {
              name: payloadToSave.name,
              description: '',
              daily_calories: payloadToSave.daily_calories,
              daily_protein_g: payloadToSave.daily_protein_g,
              daily_carbs_g: payloadToSave.daily_carbs_g,
              daily_fat_g: payloadToSave.daily_fat_g,
              categories: payloadToSave.categories,
            });
            assignmentCopyExistsRef.current = true;
          }
        } else {
          await nutritionDb.updatePlan(creatorId, planId, payloadToSave);
        }
        lastSavedRef.current = { name, macros, categoriesJson };
        queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.plans(creatorId) });
        if (isAssignmentScope) {
          queryClient.invalidateQueries({ queryKey: ['nutrition', 'plan', 'assignment', assignmentId] });
          if (assignmentClientId) {
            queryClient.invalidateQueries({ queryKey: ['nutrition', 'assignments', assignmentClientId] });
          }
        } else {
          queryClient.invalidateQueries({ queryKey: queryKeys.nutrition.plan(creatorId, planId) });
        }
      } catch (e) {
        logger.error(e);
        showToast('Error guardando el plan. Intenta de nuevo.', 'error');
      }
    };

    pendingSaveRef.current = doSave;
    const t = setTimeout(doSave, 700);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, creatorId, planLoading, planPayload, isAssignmentScope, assignmentId, assignmentPlanId]);

  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) pendingSaveRef.current();
    };
  }, []);

  useEffect(() => {
    if (!planId || isAssignmentScope || !hasMadeChanges) return;
    propagationService.findAffectedByNutritionPlan(planId)
      .then(({ affectedUserIds }) => setPropagateAffectedCount(affectedUserIds.length))
      .catch((err) => logger.warn('Error fetching nutrition propagation count:', err));
  }, [planId, isAssignmentScope, hasMadeChanges]);

  useEffect(() => {
    if (!isNavigateModalOpen || !planId || propagateAffectedCount === 0) return;
    if (propagateAffectedUsers.length > 0) return;
    propagationService.getAffectedUsersWithDetailsByNutritionPlan(planId)
      .then(setPropagateAffectedUsers)
      .catch((err) => logger.warn('Error fetching affected users:', err));
  }, [isNavigateModalOpen, planId, propagateAffectedCount, propagateAffectedUsers.length]);

  useEffect(() => {
    const shouldBlock = !isAssignmentScope && hasMadeChanges && propagateAffectedCount > 0;
    const handler = (e) => {
      if (shouldBlock) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isAssignmentScope, hasMadeChanges, propagateAffectedCount]);

  const handleBack = () => {
    if (!isAssignmentScope && hasMadeChanges && propagateAffectedCount > 0) {
      setIsNavigateModalOpen(true);
    } else if (returnTo) {
      navigate(returnTo, { state: returnState });
    } else {
      navigate('/biblioteca?domain=nutricion&tab=planes_nutri');
    }
  };

  const handleOpenPropagateModal = async () => {
    if (!planId) return;
    try {
      const users = await propagationService.getAffectedUsersWithDetailsByNutritionPlan(planId);
      setPropagateAffectedUsers(users);
      setPropagateAffectedCount(users.length);
      setIsPropagateModalOpen(true);
    } catch (err) {
      logger.warn(err);
    }
  };

  const handlePropagateNutrition = async () => {
    if (!planId || !creatorId) return;
    setIsPropagating(true);
    try {
      const { propagated, errors } = await propagationService.propagateNutritionPlan(planId, creatorId);
      if (errors.length > 0) {
        showToast(`Propagado parcialmente. ${propagated} copias actualizadas. Algunos errores: ${errors.slice(0, 3).join('; ')}`, 'error');
      } else if (propagated > 0) {
        showToast(`Cambios propagados correctamente a ${propagated} usuario(s).`, 'success');
      }
      setHasMadeChanges(false);
    } catch (err) {
      logger.error('Error propagating:', err);
      showToast(`No pudimos propagar los cambios: ${err?.message || 'Inténtalo de nuevo.'}`, 'error');
    } finally {
      setIsPropagating(false);
    }
  };

  const handleNavigatePropagate = async () => {
    await handlePropagateNutrition();
    setIsNavigateModalOpen(false);
    if (returnTo) navigate(returnTo, { state: returnState });
    else navigate('/biblioteca?domain=nutricion&tab=planes_nutri');
  };

  const handleNavigateLeaveWithoutPropagate = () => {
    setIsNavigateModalOpen(false);
    if (returnTo) navigate(returnTo, { state: returnState });
    else navigate('/biblioteca?domain=nutricion&tab=planes_nutri');
  };

  function handleFoodSearch() {
    if (!foodSearchQuery.trim()) return;
    setSubmittedFoodQuery(foodSearchQuery.trim());
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
        serving_unit: 'porción',
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
    setEditingCategoryIndex(null);
    setEditingCategoryLabel('');
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
    setDeletingCategoryIndex(null);
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
  async function applyDropToOption(e, ci, optIdx) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('pe-dropzone-active');
    e.currentTarget.classList.remove('pe-items-dropzone-active');
    e.currentTarget.classList.remove('pe-opt-dropzone-active');
    e.currentTarget.closest?.('.pe-category')?.classList.remove('pe-dropzone-active');
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
        addItemToOption(ci, optIdx, {
          food_id: food.food_id,
          serving_id: s.serving_id,
          number_of_units: mult,
          name: food.food_name || 'Alimento',
          food_category: foodCategory,
          calories: s.calories != null ? Math.round(Number(s.calories) * mult) : null,
          protein: s.protein != null ? Math.round(Number(s.protein) * mult * 10) / 10 : null,
          carbs: s.carbohydrate != null ? Math.round(Number(s.carbohydrate) * mult * 10) / 10 : null,
          fat: s.fat != null ? Math.round(Number(s.fat) * mult * 10) / 10 : null,
          serving_unit: s.serving_description ?? s.measurement_description ?? null,
          grams_per_unit: s.metric_serving_amount != null ? Number(s.metric_serving_amount) : null,
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

  /** Pie chart data from planned macros (selected options only). Slice size = grams / sum(grams). */
  const planEditorPieData = useMemo(() => {
    const p = Number(selectedOptionsTotals.protein) || 0;
    const c = Number(selectedOptionsTotals.carbs) || 0;
    const f = Number(selectedOptionsTotals.fat) || 0;
    const totalG = p + c + f;
    if (totalG <= 0) return [];
    return [
      { name: 'Proteína', value: p, grams: p },
      { name: 'Carbohidratos', value: c, grams: c },
      { name: 'Grasa', value: f, grams: f },
    ].filter((d) => d.value > 0);
  }, [selectedOptionsTotals]);

  const displayCal = dailyCalories === '' ? 0 : Number(dailyCalories) || 0;
  const displayProtein = dailyProtein === '' ? 0 : Number(dailyProtein) || 0;
  const displayCarbs = dailyCarbs === '' ? 0 : Number(dailyCarbs) || 0;
  const displayFat = dailyFat === '' ? 0 : Number(dailyFat) || 0;

  // Gauge arc: semicircle, r=84, arc length = pi*84 ≈ 264
  const GAUGE_ARC = Math.PI * 84;
  const gaugeRatio = displayCal > 0 ? Math.min(1, selectedOptionsTotals.calories / displayCal) : 0;
  const gaugeOffset = GAUGE_ARC * (1 - gaugeRatio);

  /** Helper: get short unit label for a serving */
  const getShortUnit = (item) => {
    if (!item.servings || item.servings.length === 0) return item.serving_unit || '--';
    const sid = item.serving_id ?? item.servings[0]?.serving_id;
    const s = item.servings.find((x) => String(x.serving_id) === String(sid)) || item.servings[0];
    const desc = s?.serving_description || s?.measurement_description || '--';
    // Strip leading number+space to get just the unit (e.g. "1 cup" → "cup", "100 g" → "g")
    return desc.replace(/^\d+([.,]\d+)?\s*/, '').trim() || desc;
  };

  if (planLoading) {
    return (
      <DashboardLayout screenName="Plan" showBackButton onBack={handleBack} backPath={returnTo || '/nutrition'} backState={returnState}>
        <div className="library-session-detail-container">
          <div className="library-session-detail-body">
            {/* Left sidebar skeleton */}
            <div className="lsd-glow-wrap lsd-glow-wrap--sidebar plan-editor-sidebar-wrap" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ShimmerSkeleton width="100%" height="40px" borderRadius="10px" />
              <div style={{ display: 'flex', gap: 0 }}>
                <ShimmerSkeleton width="50%" height="32px" borderRadius="0" />
                <ShimmerSkeleton width="50%" height="32px" borderRadius="0" />
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <ShimmerSkeleton key={i} width="100%" height="44px" borderRadius="10px" />
              ))}
            </div>
            {/* Center skeleton */}
            <div className="lsd-glow-wrap lsd-glow-wrap--main" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <ShimmerSkeleton width="100px" height="20px" borderRadius="6px" />
                <ShimmerSkeleton width="90px" height="32px" borderRadius="8px" />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 12, overflow: 'hidden' }}>
                  <ShimmerSkeleton width="100%" height="44px" borderRadius="0" />
                  {i < 3 && Array.from({ length: 2 }).map((__, j) => (
                    <ShimmerSkeleton key={j} width="100%" height="38px" borderRadius="0" />
                  ))}
                </div>
              ))}
            </div>
            {/* Right panel skeleton */}
            <div className="lsd-glow-wrap lsd-glow-wrap--volume" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ShimmerSkeleton width="100%" height="48px" borderRadius="10px" />
              <ShimmerSkeleton width="60%" height="14px" borderRadius="6px" />
              <ShimmerSkeleton width="100%" height="40px" borderRadius="0" />
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <ShimmerSkeleton key={i} width="100%" height="64px" borderRadius="12px" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (planError) {
    return (
      <DashboardLayout screenName="Plan" showBackButton onBack={handleBack} backPath={returnTo || '/nutrition'} backState={returnState}>
        <FullScreenError
          title="No pudimos cargar el plan"
          message="Hubo un problema cargando este plan. Revisa tu conexion e intenta de nuevo."
          onRetry={refetchPlan}
        />
      </DashboardLayout>
    );
  }

  return (
    <>
    <ScrollProgress />
    <DashboardLayout
      screenName={planName || 'Plan'}
      showBackButton
      onBack={handleBack}
      backPath={returnTo || '/nutrition'}
      backState={returnState}
      headerRight={!isAssignmentScope && hasMadeChanges && propagateAffectedCount > 0 ? (
        <div className="library-session-propagate-group">
          <button type="button" className="library-session-propagate-button" onClick={handleOpenPropagateModal}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {isPropagating ? 'Propagando...' : `Propagar a ${propagateAffectedCount} cliente(s)`}
          </button>
          <button type="button" className="library-session-propagate-dismiss" onClick={() => setHasMadeChanges(false)} title="Descartar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      ) : null}
    >
      {isAssignmentScope && (
        <div className="library-session-client-edit-banner plan-editor-assignment-banner esim-clickable" role="button" tabIndex={0} onClick={() => setShowScopeInfo(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowScopeInfo(true); }}>
          <svg className="library-session-client-only-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 16V12M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="library-session-client-edit-banner-text">
            Estas editando este plan solo para <strong>{clientName}</strong>. Los cambios no afectan la biblioteca ni otros clientes.
          </span>
        </div>
      )}
      {isAssignmentScope && (
        <EditScopeInfoModal isOpen={showScopeInfo} onClose={() => setShowScopeInfo(false)} scope="nutrition-assignment" clientName={clientName} planName={planName} />
      )}
      <div className="library-session-detail-container">
        <div className="library-session-detail-body">

          {/* ══ LEFT: Food/Recipe Search ══ */}
          <div className="lsd-glow-wrap lsd-glow-wrap--sidebar plan-editor-sidebar-wrap">
            <GlowingEffect spread={40} proximity={120} borderWidth={1} />
            <div className="library-session-sidebar plan-editor-sidebar">
              <div className="pe-left-search">
                <div className="pe-search-input-wrap">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  <input
                    type="text"
                    placeholder={leftPanelTab === 'alimentos' ? 'Buscar alimento...' : 'Buscar receta...'}
                    value={leftPanelTab === 'alimentos' ? foodSearchQuery : recipeSearchQuery}
                    onChange={(e) => leftPanelTab === 'alimentos' ? setFoodSearchQuery(e.target.value) : setRecipeSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && leftPanelTab === 'alimentos' && handleFoodSearch()}
                  />
                  {leftPanelTab === 'alimentos' && (
                    <button type="button" className="pe-search-action" onClick={() => setManualFoodModalOpen(true)} title="Alimento propio">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    </button>
                  )}
                </div>
              </div>
              <div className="pe-left-filter">
                <button type="button" className={`pe-filter-tab${leftPanelTab === 'alimentos' ? ' active' : ''}`} onClick={() => setLeftPanelTab('alimentos')}>Alimentos</button>
                <button type="button" className={`pe-filter-tab${leftPanelTab === 'recetas' ? ' active' : ''}`} onClick={() => setLeftPanelTab('recetas')}>Recetas</button>
              </div>
              <div className="pe-left-list">
                {leftPanelTab === 'alimentos' ? (
                  foodSearchLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="pe-food-card pe-food-card--skeleton" style={{ animationDelay: `${i * 60}ms` }}>
                        <div className="pe-skeleton-line pe-skeleton-line--name" />
                        <div className="pe-skeleton-line pe-skeleton-line--meta" />
                      </div>
                    ))
                  ) : sortedFoodSearchResults.length === 0 && customFoods.length === 0 ? (
                    <p className="pe-left-empty">Escribe y pulsa Enter para buscar alimentos, o usa + para crear uno propio.</p>
                  ) : (
                    <>
                      {sortedFoodSearchResults.map((f, fi) => {
                        const portionOptions = getServingsWithStandardOptions(f);
                        const hasServings = portionOptions.length > 0;
                        const per100 = getPer100g(f);
                        return (
                          <div
                            key={`${f.food_id}-${fi}`}
                            draggable={hasServings}
                            className="pe-food-card"
                            onDragStart={(e) => {
                              if (!hasServings) return;
                              e.dataTransfer.setData('application/json', JSON.stringify({ food_id: f.food_id }));
                              e.dataTransfer.effectAllowed = 'copy';
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
                      {customFoods.map((item, idx) => (
                        <div
                          key={`custom-${item.food_id}-${idx}`}
                          draggable
                          className="pe-food-card"
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/json', JSON.stringify({ custom_food_item: item }));
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                        >
                          <span className="pe-food-card-name">{item.name}</span>
                          <div className="pe-food-card-meta">
                            <span>{item.calories ?? '?'} kcal</span>
                            {item.protein != null && <span>P {item.protein}g</span>}
                            {item.carbs != null && <span>C {item.carbs}g</span>}
                            {item.fat != null && <span>G {item.fat}g</span>}
                          </div>
                        </div>
                      ))}
                      {(sortedFoodSearchResults.length > 0 || customFoods.length > 0) && <p className="pe-drag-hint">Arrastra al centro para agregar</p>}
                    </>
                  )
                ) : (
                  filteredMeals.length === 0 ? (
                    <p className="pe-left-empty">{recipeSearchQuery.trim() ? 'No se encontraron recetas.' : 'No tienes recetas creadas todavia.'}</p>
                  ) : (
                    <>
                      {filteredMeals.map((meal) => (
                        <div
                          key={meal.id}
                          draggable
                          className="pe-food-card"
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/json', JSON.stringify({ meal_id: meal.id, meal_name: meal.name || '' }));
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                        >
                          <span className="pe-food-card-name">{meal.name || 'Receta'}</span>
                          {Array.isArray(meal.items) && meal.items.length > 0 && (
                            <div className="pe-food-card-meta">
                              <span>{meal.items.length} {meal.items.length === 1 ? 'alimento' : 'alimentos'}</span>
                            </div>
                          )}
                        </div>
                      ))}
                      <p className="pe-drag-hint">Arrastra al centro para agregar</p>
                    </>
                  )
                )}
              </div>
            </div>
          </div>

          {/* ══ CENTER: Categories ══ */}
          <div className="lsd-glow-wrap lsd-glow-wrap--main">
            <GlowingEffect spread={40} proximity={120} borderWidth={1} />
            <div className="pe-center">
              <div className="pe-center-header">
                <h3>Comidas</h3>
                <button type="button" className="pe-center-add-btn" onClick={addCategory}>+ Comida</button>
              </div>
              <div className="pe-center-body">
                {categories.map((cat, ci) => (
                  <div
                    key={cat.id || ci}
                    className="pe-category"
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; e.currentTarget.classList.add('pe-dropzone-active'); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('pe-dropzone-active'); }}
                    onDrop={(e) => { e.currentTarget.classList.remove('pe-dropzone-active'); handleDropOnCategory(e, ci); }}
                  >
                    <GlowingEffect spread={30} proximity={80} borderWidth={1} />
                    <div className="pe-category-header">
                      {deletingCategoryIndex === ci ? (
                        <div className="pe-inline-delete">
                          <span className="pe-inline-delete-text">Eliminar &quot;{cat.label}&quot;?</span>
                          <button type="button" className="pe-inline-delete-yes" onClick={() => deleteCategory(ci)}>Si</button>
                          <button type="button" className="pe-inline-delete-no" onClick={() => setDeletingCategoryIndex(null)}>No</button>
                        </div>
                      ) : editingCategoryIndex === ci ? (
                        <input
                          type="text"
                          className="pe-category-name-input"
                          value={editingCategoryLabel}
                          onChange={(e) => setEditingCategoryLabel(e.target.value)}
                          onBlur={() => updateCategoryLabel(ci, editingCategoryLabel)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') updateCategoryLabel(ci, editingCategoryLabel);
                            if (e.key === 'Escape') { setEditingCategoryIndex(null); setEditingCategoryLabel(''); }
                          }}
                          autoFocus
                        />
                      ) : (
                        <span className="pe-category-name">{cat.label || 'Categoria'}</span>
                      )}
                      <div className="pe-options-tabs">
                        {(cat.options || []).map((opt, oi) => {
                          const isRecipeOpt = (opt.items || []).some((it) => it.recipe === true);
                          return (
                          <button
                            key={`${ci}-${opt.id || oi}`}
                            type="button"
                            className={`pe-opt-tab ${selectedOption(ci) === oi ? 'active' : ''}`}
                            onClick={() => setSelectedOption(ci, oi)}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; e.currentTarget.classList.add('pe-opt-dropzone-active'); }}
                            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('pe-opt-dropzone-active'); }}
                            onDrop={(e) => { e.stopPropagation(); e.currentTarget.classList.remove('pe-opt-dropzone-active'); e.currentTarget.closest('.pe-category')?.classList.remove('pe-dropzone-active'); applyDropToOption(e, ci, oi); }}
                          >
                            {opt.label || `Opc ${oi + 1}`}
                            {isRecipeOpt && <span className="pe-opt-recipe-tag">receta</span>}
                          </button>);
                        })}
                        <button type="button" className="pe-opt-tab-add" onClick={() => addOption(ci)}>+</button>
                      </div>
                      {editingCategoryIndex !== ci && deletingCategoryIndex !== ci && (
                        <div className="pe-category-actions">
                          <button type="button" className="pe-category-action-btn" onClick={() => { setEditingCategoryIndex(ci); setEditingCategoryLabel(cat.label || ''); }} aria-label="Editar nombre">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          {categories.length > 1 && (
                            <button type="button" className="pe-category-action-btn" onClick={() => setDeletingCategoryIndex(ci)} aria-label="Eliminar">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {((cat.options || [])[selectedOption(ci)]?.items || []).length === 0 ? (
                      <div
                        className="pe-category-empty"
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                        onDrop={(e) => handleDropOnCategory(e, ci)}
                      >
                        Arrastra alimentos o recetas aqui
                      </div>
                    ) : (
                      <div
                        className="pe-category-items"
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; e.currentTarget.classList.add('pe-items-dropzone-active'); }}
                        onDragLeave={(e) => e.currentTarget.classList.remove('pe-items-dropzone-active')}
                        onDrop={(e) => { e.currentTarget.classList.remove('pe-items-dropzone-active'); handleDropOnCategory(e, ci); }}
                      >
                        {(cat.options || [])[selectedOption(ci)]?.items?.map((item, ii) => (
                          item.recipe === true ? (
                            <div key={`${ci}-${selectedOption(ci)}-r-${ii}`} className="pe-recipe-block">
                              <div className="pe-recipe-block-header">
                                <span className="pe-item-name">{item.name || 'Receta'}</span>
                                <span className="pe-recipe-label">receta</span>
                                <button type="button" className="pe-item-remove" onClick={() => removeOptionItem(ci, selectedOption(ci), ii)} aria-label="Quitar">&times;</button>
                              </div>
                              {(() => {
                                const meal = mealsMap.get(item.meal_id);
                                const subItems = meal?.items;
                                if (!Array.isArray(subItems) || subItems.length === 0) return null;
                                return (
                                  <div className="pe-recipe-block-items">
                                    {subItems.map((sub, si) => (
                                      <div key={si} className="pe-recipe-sub-item">
                                        <span className="pe-recipe-sub-name">{sub.name || 'Alimento'}</span>
                                        <span className="pe-recipe-sub-meta">
                                          {sub.number_of_units ?? 1} {sub.serving_unit ? `· ${sub.serving_unit}` : ''}
                                        </span>
                                        <span className="pe-recipe-sub-kcal">{sub.calories ?? '?'} kcal</span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          ) : (
                            <div key={`${ci}-${selectedOption(ci)}-f-${ii}`} className="pe-item-row">
                              <span className="pe-item-name">{item.name || 'Alimento'}</span>
                              <div className="pe-item-portion">
                                <input
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  className="pe-item-portion-qty"
                                  value={item.number_of_units ?? ''}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '') { updateOptionItem(ci, selectedOption(ci), ii, { number_of_units: '' }); return; }
                                    const u = Number(raw) || 0;
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
                                          serving_unit: s.serving_description ?? s.measurement_description ?? null,
                                          grams_per_unit: s.metric_serving_amount != null ? Number(s.metric_serving_amount) : null,
                                        });
                                      }
                                    } else {
                                      const prev = Number(item.number_of_units) || 1;
                                      const scale = prev > 0 ? u / prev : 0;
                                      updateOptionItem(ci, selectedOption(ci), ii, {
                                        number_of_units: u,
                                        calories: item.calories != null ? Math.round(Number(item.calories) * scale) : null,
                                        protein: item.protein != null ? Math.round(Number(item.protein) * scale * 10) / 10 : null,
                                        carbs: item.carbs != null ? Math.round(Number(item.carbs) * scale * 10) / 10 : null,
                                        fat: item.fat != null ? Math.round(Number(item.fat) * scale * 10) / 10 : null,
                                      });
                                    }
                                  }}
                                  onBlur={() => {
                                    const raw = item.number_of_units;
                                    if (raw === '' || raw == null || Number(raw) <= 0 || Number.isNaN(Number(raw))) {
                                      const list = item.servings || [];
                                      const sid = item.serving_id ?? list[0]?.serving_id;
                                      const s = list.find((x) => String(x.serving_id) === String(sid)) || list[0];
                                      if (s) {
                                        updateOptionItem(ci, selectedOption(ci), ii, {
                                          number_of_units: 1,
                                          calories: s.calories != null ? Math.round(Number(s.calories)) : null,
                                          protein: s.protein != null ? Math.round(Number(s.protein) * 10) / 10 : null,
                                          carbs: s.carbohydrate != null ? Math.round(Number(s.carbohydrate) * 10) / 10 : null,
                                          fat: s.fat != null ? Math.round(Number(s.fat) * 10) / 10 : null,
                                        });
                                      } else {
                                        updateOptionItem(ci, selectedOption(ci), ii, { number_of_units: 1 });
                                      }
                                    }
                                  }}
                                />
                                <span className="pe-item-portion-unit">
                                  {getShortUnit(item)}
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 4.5l3 3 3-3"/></svg>
                                  <select
                                    className="pe-item-portion-select"
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
                                        serving_unit: s.serving_description ?? s.measurement_description ?? null,
                                        grams_per_unit: s.metric_serving_amount != null ? Number(s.metric_serving_amount) : null,
                                      });
                                    }}
                                  >
                                    {Array.isArray(item.servings) && item.servings.length > 0 ? (
                                      item.servings.map((s, si) => <option key={`${ii}-${si}-${s.serving_id}`} value={s.serving_id}>{s.serving_description}</option>)
                                    ) : (
                                      <option value="">--</option>
                                    )}
                                  </select>
                                </span>
                              </div>
                              <span className="pe-item-kcal">{item.calories ?? '?'} kcal</span>
                              <button type="button" className="pe-item-remove" onClick={() => removeOptionItem(ci, selectedOption(ci), ii)} aria-label="Quitar">&times;</button>
                            </div>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ══ RIGHT: Gauge + Controls + Macros ══ */}
          <div className="lsd-glow-wrap lsd-glow-wrap--volume">
            <div className="library-session-sidebar-right pe-right">
              <GlowingEffect spread={40} proximity={120} borderWidth={1} />
              <div className="pe-right-inner">
                <div className="pe-gauge-section">
                  <div className="pe-gauge-wrap">
                    <svg viewBox="0 0 200 108" fill="none">
                      <path d="M 16 100 A 84 84 0 0 1 184 100" stroke="rgba(255,255,255,0.06)" strokeWidth="10" strokeLinecap="round" fill="none"/>
                      <path d="M 16 100 A 84 84 0 0 1 184 100" stroke="rgba(255,255,255,0.28)" strokeWidth="10" strokeLinecap="round" fill="none"
                        strokeDasharray={GAUGE_ARC.toFixed(1)}
                        strokeDashoffset={gaugeOffset.toFixed(1)}/>
                    </svg>
                    <div className="pe-gauge-labels">
                      <div>
                        <span className="pe-gauge-planned">{selectedOptionsTotals.calories.toLocaleString()}</span>
                        <span className="pe-gauge-planned-unit"> kcal</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pe-controls-strip">
                  <div className="pe-ctrl-cell pe-ctrl-cell--obj">
                    <span className="pe-ctrl-label">Objetivo</span>
                    <input className={`pe-ctrl-obj-input${!dailyCalories ? ' pe-input-empty' : ''}`} type="number" min={0} value={dailyCalories} onChange={(e) => setDailyCalories(e.target.value)} />
                    <span className="pe-ctrl-unit">kcal</span>
                  </div>
                  <div className="pe-ctrl-cell pe-ctrl-cell--dist">
                    <span className="pe-ctrl-label">Dist.</span>
                    <select className="pe-ctrl-select" value={distributionPreset} onChange={(e) => setDistributionPreset(e.target.value)}>
                      {MACRO_PRESETS.map((pre) => <option key={pre.id} value={pre.id}>{pre.label}</option>)}
                      <option value="custom">Personalizado</option>
                    </select>
                    <svg className="pe-ctrl-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 4.5l3 3 3-3"/></svg>
                  </div>
                </div>

                <div className="pe-macros-section">
                  {[
                    { key: 'p', name: 'Proteina', current: selectedOptionsTotals.protein, value: dailyProtein, setter: setDailyProtein, target: displayProtein },
                    { key: 'c', name: 'Carbohidratos', current: selectedOptionsTotals.carbs, value: dailyCarbs, setter: setDailyCarbs, target: displayCarbs },
                    { key: 'f', name: 'Grasa', current: selectedOptionsTotals.fat, value: dailyFat, setter: setDailyFat, target: displayFat },
                  ].map((m) => (
                    <div key={m.key} className="pe-macro-block">
                      <GlowingEffect spread={25} proximity={70} borderWidth={1} />
                      <div className="pe-macro-head">
                        <span className="pe-macro-name">{m.name}</span>
                        <div className="pe-macro-nums">
                          <span className="pe-macro-current">{m.current.toFixed(0)}</span>
                          <span className="pe-macro-slash">/</span>
                          <input
                            className={`pe-macro-obj-input${!m.value ? ' pe-input-empty' : ''}`}
                            type="number"
                            min={0}
                            value={m.value}
                            onChange={(e) => { setDistributionPreset('custom'); m.setter(e.target.value); }}
                          />
                          <span className="pe-macro-unit">g</span>
                        </div>
                      </div>
                      <div className="pe-macro-bar">
                        <div className={`pe-macro-bar-fill ${m.key}`} style={{ width: `${m.target > 0 ? Math.min(100, (m.current / m.target) * 100) : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <Modal
        isOpen={deleteOptionModal.open}
        onClose={() => setDeleteOptionModal({ open: false, categoryIndex: -1, optionIndex: -1, optionLabel: '', itemCount: 0 })}
        title="Eliminar opcion"
      >
        <div className="plan-editor-category-edit-modal">
          <p className="plan-editor-category-edit-confirm-text">
            La opcion &quot;{deleteOptionModal.optionLabel}&quot; tiene {deleteOptionModal.itemCount} alimento(s). Eliminarla?
          </p>
          <div className="plan-editor-category-edit-actions">
            <button type="button" className="plan-editor-category-edit-cancel" onClick={() => setDeleteOptionModal({ open: false, categoryIndex: -1, optionIndex: -1, optionLabel: '', itemCount: 0 })}>Cancelar</button>
            <button type="button" className="plan-editor-category-edit-delete" onClick={() => { if (deleteOptionModal.categoryIndex >= 0 && deleteOptionModal.optionIndex >= 0) deleteOption(deleteOptionModal.categoryIndex, deleteOptionModal.optionIndex); setDeleteOptionModal({ open: false, categoryIndex: -1, optionIndex: -1, optionLabel: '', itemCount: 0 }); }}>Eliminar</button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={manualFoodModalOpen}
        onClose={() => setManualFoodModalOpen(false)}
        title="Anadir alimento propio"
        containerClassName="propagate-modal-container"
        contentClassName="propagate-modal-content-wrapper"
      >
        <div className="propagate-modal-content">
          <div className="propagate-modal-layout propagate-modal-layout-single">
            <div className="meal-editor-manual-form-in-modal">
              <label className="propagate-option-title">Nombre</label>
              <input value={planEditorManualFood.name} onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, name: e.target.value }))} placeholder="ej. Mi batido" className="meal-editor-edit-name-input" />
              <label className="propagate-option-title">Unidades</label>
              <input type="number" value={planEditorManualFood.units} onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, units: e.target.value }))} placeholder="1" className="meal-editor-edit-name-input" />
              <label className="propagate-option-title">Calorias</label>
              <input type="number" value={planEditorManualFood.calories} onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, calories: e.target.value }))} placeholder="0" className="meal-editor-edit-name-input" />
              <label className="propagate-option-title">Proteina (g)</label>
              <input type="number" value={planEditorManualFood.protein} onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, protein: e.target.value }))} placeholder="0" className="meal-editor-edit-name-input" />
              <label className="propagate-option-title">Carbohidratos (g)</label>
              <input type="number" value={planEditorManualFood.carbs} onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, carbs: e.target.value }))} placeholder="0" className="meal-editor-edit-name-input" />
              <label className="propagate-option-title">Grasa (g)</label>
              <input type="number" value={planEditorManualFood.fat} onChange={(e) => setPlanEditorManualFood((m) => ({ ...m, fat: e.target.value }))} placeholder="0" className="meal-editor-edit-name-input" />
            </div>
          </div>
          <div className="propagate-modal-footer">
            <button type="button" className="propagate-modal-btn propagate-modal-btn-dont" onClick={() => setManualFoodModalOpen(false)}>Cancelar</button>
            <button type="button" className="propagate-modal-btn propagate-modal-btn-propagate" onClick={addCustomFoodFromModal}>Anadir</button>
          </div>
        </div>
      </Modal>

      <PropagateChangesModal
        isOpen={isPropagateModalOpen}
        onClose={() => setIsPropagateModalOpen(false)}
        type="nutrition_plan"
        itemName={planName || 'Plan'}
        affectedCount={propagateAffectedCount}
        affectedUsers={propagateAffectedUsers}
        isPropagating={isPropagating}
        onPropagate={handlePropagateNutrition}
        onDontPropagate={() => { setIsPropagateModalOpen(false); setHasMadeChanges(false); }}
      />
      <PropagateNavigateModal
        isOpen={isNavigateModalOpen}
        onClose={() => setIsNavigateModalOpen(false)}
        type="nutrition_plan"
        itemName={planName || 'Plan'}
        affectedCount={propagateAffectedCount}
        affectedUsers={propagateAffectedUsers}
        isPropagating={isPropagating}
        onPropagate={handleNavigatePropagate}
        onLeaveWithoutPropagate={handleNavigateLeaveWithoutPropagate}
      />
      <ContextualHint screenKey="plan-editor" />
    </DashboardLayout>
    </>
  );
}
