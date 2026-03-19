import apiClient from '../utils/apiClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shapePlanFromApi(p) {
  if (!p) return null;
  return {
    id: p.planId ?? null,
    name: p.name ?? null,
    description: p.description ?? null,
    daily_calories: p.dailyCalories ?? null,
    daily_protein_g: p.dailyProteinG ?? null,
    daily_carbs_g: p.dailyCarbsG ?? null,
    daily_fat_g: p.dailyFatG ?? null,
    categories: p.categories ?? [],
    createdAt: p.createdAt ?? null,
    updatedAt: p.updatedAt ?? null,
  };
}

// ─── Meals ────────────────────────────────────────────────────────────────────

export async function getMealsByCreator(_creatorId) {
  const result = await apiClient.get('/creator/nutrition/meals');
  return (result?.data ?? []).map((m) => ({ ...m, id: m.mealId }));
}

export async function getMealById(_creatorId, mealId) {
  const result = await apiClient.get(`/creator/nutrition/meals/${mealId}`);
  return result?.data ? { ...result.data, id: result.data.mealId } : null;
}

export async function createMeal(_creatorId, data) {
  const result = await apiClient.post('/creator/nutrition/meals', {
    name: data.name ?? '',
    items: data.items ?? [],
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.videoUrl !== undefined ? { videoUrl: data.videoUrl } : {}),
    ...(data.video_url !== undefined ? { videoUrl: data.video_url } : {}),
  });
  return result?.data?.mealId;
}

export async function updateMeal(_creatorId, mealId, data) {
  const body = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.description !== undefined) body.description = data.description;
  if (data.videoUrl !== undefined) body.videoUrl = data.videoUrl;
  if (data.video_url !== undefined) body.videoUrl = data.video_url;
  if (data.items !== undefined) body.items = data.items;
  await apiClient.patch(`/creator/nutrition/meals/${mealId}`, body);
}

export async function deleteMeal(_creatorId, mealId) {
  await apiClient.delete(`/creator/nutrition/meals/${mealId}`);
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export async function getPlansByCreator(_creatorId) {
  const result = await apiClient.get('/creator/nutrition/plans');
  return (result?.data ?? []).map((p) => ({ ...shapePlanFromApi(p), id: p.planId }));
}

export async function getPlanById(_creatorId, planId) {
  const result = await apiClient.get(`/creator/nutrition/plans/${planId}`);
  return result?.data ? { ...shapePlanFromApi(result.data), id: result.data.planId } : null;
}

export async function createPlan(_creatorId, data) {
  const result = await apiClient.post('/creator/nutrition/plans', {
    name: data.name ?? '',
    description: data.description ?? '',
    categories: data.categories ?? [],
    ...(data.daily_calories != null ? { dailyCalories: data.daily_calories } : {}),
    ...(data.daily_protein_g != null ? { dailyProteinG: data.daily_protein_g } : {}),
    ...(data.daily_carbs_g != null ? { dailyCarbsG: data.daily_carbs_g } : {}),
    ...(data.daily_fat_g != null ? { dailyFatG: data.daily_fat_g } : {}),
  });
  return result?.data?.planId;
}

export async function updatePlan(_creatorId, planId, data) {
  const body = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.description !== undefined) body.description = data.description;
  if (data.categories !== undefined) body.categories = data.categories;
  if (data.daily_calories !== undefined) body.dailyCalories = data.daily_calories;
  if (data.daily_protein_g !== undefined) body.dailyProteinG = data.daily_protein_g;
  if (data.daily_carbs_g !== undefined) body.dailyCarbsG = data.daily_carbs_g;
  if (data.daily_fat_g !== undefined) body.dailyFatG = data.daily_fat_g;
  await apiClient.patch(`/creator/nutrition/plans/${planId}`, body);
}

export async function deletePlan(_creatorId, planId) {
  await apiClient.delete(`/creator/nutrition/plans/${planId}`);
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export async function getAssignmentsByUser(clientId) {
  const result = await apiClient.get(`/creator/clients/${clientId}/nutrition/assignments`);
  return (result?.data ?? []).map((a) => ({
    id: a.assignmentId,
    planId: a.planId ?? null,
    plan: { name: a.planName ?? null },
    assignedBy: null,
    startDate: a.startDate ?? null,
    endDate: a.endDate ?? null,
    createdAt: a.createdAt ?? null,
  }));
}

export async function getAssignmentsByCreator(_creatorId) {
  const result = await apiClient.get('/creator/nutrition/assignments');
  return (result?.data ?? []).map((a) => ({ id: a.assignmentId, ...a }));
}

export async function createAssignment(data) {
  const result = await apiClient.post(
    `/creator/clients/${data.userId}/nutrition/assignments`,
    {
      planId: data.planId,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
    },
    { idempotent: false }
  );
  return result?.data?.assignmentId;
}

export async function deleteAssignment(assignmentId, clientId) {
  await apiClient.delete(`/creator/clients/${clientId}/nutrition/assignments/${assignmentId}`);
}

export async function getAssignmentById(assignmentId) {
  if (!assignmentId) return null;
  const result = await apiClient.get(`/creator/nutrition/assignments/${assignmentId}`);
  return result?.data ?? null;
}

export async function updateAssignment(assignmentId, data) {
  const body = {};
  if (data.planId !== undefined) body.planId = data.planId;
  if (data.startDate !== undefined) body.startDate = data.startDate;
  if (data.endDate !== undefined) body.endDate = data.endDate;
  await apiClient.patch(`/creator/nutrition/assignments/${assignmentId}`, body);
}

// ─── User diary (creator reading client diary) ────────────────────────────────

export async function getDiaryEntries(clientId, date) {
  const result = await apiClient.get(`/creator/clients/${clientId}/nutrition/diary`, {
    params: { date },
  });
  return (result?.data ?? []).map((e) => ({
    id: e.entryId,
    date: e.date ?? null,
    meal: e.meal ?? null,
    food_id: e.foodId ?? null,
    serving_id: e.servingId ?? null,
    number_of_units: e.numberOfUnits ?? 1,
    name: e.name ?? null,
    food_category: e.foodCategory ?? null,
    calories: e.calories ?? null,
    protein: e.protein ?? null,
    carbs: e.carbs ?? null,
    fat: e.fat ?? null,
    createdAt: e.createdAt ?? null,
  }));
}

export async function getDiaryEntriesInRange(clientId, startDate, endDate) {
  const result = await apiClient.get(`/creator/clients/${clientId}/nutrition/diary`, {
    params: { startDate, endDate },
  });
  return (result?.data ?? []).map((e) => ({
    id: e.entryId,
    date: e.date ?? null,
    meal: e.meal ?? null,
    food_id: e.foodId ?? null,
    serving_id: e.servingId ?? null,
    number_of_units: e.numberOfUnits ?? 1,
    name: e.name ?? null,
    food_category: e.foodCategory ?? null,
    calories: e.calories ?? null,
    protein: e.protein ?? null,
    carbs: e.carbs ?? null,
    fat: e.fat ?? null,
    createdAt: e.createdAt ?? null,
  }));
}

export async function addDiaryEntry(_userId, data) {
  const result = await apiClient.post(`/creator/clients/${_userId}/nutrition/diary`, {
    date: data.date,
    meal: data.meal ?? '',
    foodId: data.food_id,
    servingId: data.serving_id ?? '0',
    numberOfUnits: data.number_of_units ?? 1,
    name: data.name ?? '',
    foodCategory: data.food_category ?? null,
    calories: data.calories ?? null,
    protein: data.protein ?? null,
    carbs: data.carbs ?? null,
    fat: data.fat ?? null,
    servingUnit: data.serving_unit ?? null,
    gramsPerUnit: data.grams_per_unit ?? null,
    ...(data.servings ? { servings: data.servings } : {}),
  }, { idempotent: false });
  return result?.data?.entryId;
}

export async function deleteDiaryEntry(_userId, _entryId) {
  await apiClient.delete(`/creator/clients/${_userId}/nutrition/diary/${_entryId}`);
}

// ─── Recipe expansion ─────────────────────────────────────────────────────────

export async function expandRecipeRefsInCategories(creatorId, categories) {
  if (!creatorId || !Array.isArray(categories)) return categories;
  const result = [];
  for (const cat of categories) {
    const options = [];
    for (const opt of cat.options || []) {
      const items = opt.items || [];
      let newItems = [];
      let recipe_meal_id = null;
      let recipe_name = null;
      let recipe_video_url = null;
      for (const item of items) {
        if (item.recipe === true && item.meal_id) {
          const meal = await getMealById(creatorId, item.meal_id);
          if (meal && Array.isArray(meal.items) && meal.items.length > 0) {
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
      const expandedOpt = { id: opt.id, label: opt.label ?? '', items: newItems };
      if (recipe_meal_id != null) {
        expandedOpt.recipe_meal_id = recipe_meal_id;
        expandedOpt.recipe_name = recipe_name;
        expandedOpt.recipe_video_url = recipe_video_url;
      } else if (opt.recipe_meal_id != null || opt.recipe_video_url != null) {
        expandedOpt.recipe_meal_id = opt.recipe_meal_id;
        expandedOpt.recipe_name = opt.recipe_name;
        expandedOpt.recipe_video_url = opt.recipe_video_url;
      }
      options.push(expandedOpt);
    }
    result.push({
      id: cat.id,
      label: cat.label ?? '',
      order: cat.order ?? result.length,
      options,
    });
  }
  return result;
}

export default {
  getMealsByCreator,
  getMealById,
  createMeal,
  updateMeal,
  deleteMeal,
  expandRecipeRefsInCategories,
  getPlansByCreator,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  getAssignmentsByUser,
  getAssignmentsByCreator,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getDiaryEntries,
  getDiaryEntriesInRange,
  addDiaryEntry,
  deleteDiaryEntry,
};
