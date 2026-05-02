import apiClient from '../utils/apiClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shapePlanFromApi(p) {
  if (!p) return null;
  return {
    id: p.planId ?? null,
    name: p.name ?? null,
    description: p.description ?? null,
    daily_calories: p.daily_calories ?? null,
    daily_protein_g: p.daily_protein_g ?? null,
    daily_carbs_g: p.daily_carbs_g ?? null,
    daily_fat_g: p.daily_fat_g ?? null,
    categories: p.categories ?? [],
    created_at: p.created_at ?? null,
    updated_at: p.updated_at ?? null,
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
  const video_url = data.video_url ?? data.videoUrl ?? null;
  const result = await apiClient.post('/creator/nutrition/meals', {
    name: data.name ?? '',
    items: data.items ?? [],
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(video_url != null ? { video_url } : {}),
    ...(data.video_source !== undefined ? { video_source: data.video_source } : {}),
  });
  return result?.data?.mealId;
}

export async function updateMeal(_creatorId, mealId, data) {
  const body = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.description !== undefined) body.description = data.description;
  const video_url = data.video_url ?? data.videoUrl;
  if (video_url !== undefined) body.video_url = video_url;
  if (data.video_source !== undefined) body.video_source = data.video_source;
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
    ...(data.daily_calories != null ? { daily_calories: data.daily_calories } : {}),
    ...(data.daily_protein_g != null ? { daily_protein_g: data.daily_protein_g } : {}),
    ...(data.daily_carbs_g != null ? { daily_carbs_g: data.daily_carbs_g } : {}),
    ...(data.daily_fat_g != null ? { daily_fat_g: data.daily_fat_g } : {}),
  });
  return result?.data?.planId;
}

export async function updatePlan(_creatorId, planId, data) {
  const body = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.description !== undefined) body.description = data.description;
  if (data.categories !== undefined) body.categories = data.categories;
  if (data.daily_calories !== undefined) body.daily_calories = data.daily_calories;
  if (data.daily_protein_g !== undefined) body.daily_protein_g = data.daily_protein_g;
  if (data.daily_carbs_g !== undefined) body.daily_carbs_g = data.daily_carbs_g;
  if (data.daily_fat_g !== undefined) body.daily_fat_g = data.daily_fat_g;
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
    mode: a.mode ?? (a.programId ? 'program' : 'single_day'),
    planId: a.planId ?? null,
    planName: a.planName ?? a.plan?.name ?? null,
    programId: a.programId ?? null,
    programName: a.programName ?? null,
    weekCount: a.weekCount ?? null,
    daily_calories: a.plan?.daily_calories ?? a.daily_calories ?? null,
    daily_protein_g: a.plan?.daily_protein_g ?? a.daily_protein_g ?? null,
    daily_carbs_g: a.plan?.daily_carbs_g ?? a.daily_carbs_g ?? null,
    daily_fat_g: a.plan?.daily_fat_g ?? a.daily_fat_g ?? null,
    assignedBy: a.assignedBy ?? null,
    startDate: a.startDate ?? null,
    endDate: a.endDate ?? null,
    status: a.status ?? 'active',
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

export async function updateAssignment(clientId, assignmentId, data) {
  const body = {};
  if (data.planId !== undefined) body.planId = data.planId;
  if (data.startDate !== undefined) body.startDate = data.startDate;
  if (data.endDate !== undefined) body.endDate = data.endDate;
  await apiClient.patch(`/creator/clients/${clientId}/nutrition/assignments/${assignmentId}`, body);
}

// ─── User diary (creator reading client diary) ────────────────────────────────

export async function getDiaryEntries(clientId, date) {
  const result = await apiClient.get(`/creator/clients/${clientId}/nutrition/diary`, {
    params: { date },
  });
  return (result?.data ?? []).map((e) => ({ id: e.entryId ?? e.id, ...e }));
}

export async function getDiaryEntriesInRange(clientId, startDate, endDate) {
  const result = await apiClient.get(`/creator/clients/${clientId}/nutrition/diary`, {
    params: { startDate, endDate },
  });
  return (result?.data ?? []).map((e) => ({ id: e.entryId ?? e.id, ...e }));
}

export async function addDiaryEntry(_userId, data) {
  const result = await apiClient.post(`/creator/clients/${_userId}/nutrition/diary`, {
    date: data.date,
    meal: data.meal ?? '',
    food_id: data.food_id,
    serving_id: data.serving_id ?? '0',
    number_of_units: data.number_of_units ?? 1,
    name: data.name ?? '',
    food_category: data.food_category ?? null,
    calories: data.calories ?? null,
    protein: data.protein ?? null,
    carbs: data.carbs ?? null,
    fat: data.fat ?? null,
    serving_unit: data.serving_unit ?? null,
    grams_per_unit: data.grams_per_unit ?? null,
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

// ─── Nutrition Programs (multi-week sequences of days-of-eating) ─────────

function shapeProgram(p) {
  if (!p) return null;
  return {
    id: p.programId ?? p.id ?? null,
    name: p.name ?? '',
    description: p.description ?? '',
    weekCount: p.weekCount ?? (Array.isArray(p.weeks) ? p.weeks.length : 0),
    weeks: Array.isArray(p.weeks) ? p.weeks : undefined,
    created_at: p.created_at ?? null,
    updated_at: p.updated_at ?? null,
  };
}

export async function getProgramsByCreator(_creatorId) {
  const result = await apiClient.get('/creator/nutrition/programs');
  return (result?.data ?? []).map(shapeProgram);
}

export async function getProgramById(_creatorId, programId) {
  if (!programId) return null;
  const result = await apiClient.get(`/creator/nutrition/programs/${programId}`);
  return result?.data ? shapeProgram(result.data) : null;
}

export async function createProgram(_creatorId, data) {
  const result = await apiClient.post('/creator/nutrition/programs', {
    name: data.name ?? '',
    description: data.description ?? '',
    weeks: Array.isArray(data.weeks) ? data.weeks : [{ days: [null, null, null, null, null, null, null] }],
  });
  return result?.data?.programId;
}

export async function updateProgram(_creatorId, programId, data) {
  await apiClient.patch(`/creator/nutrition/programs/${programId}`, {
    name: data.name ?? '',
    description: data.description ?? '',
    weeks: Array.isArray(data.weeks) ? data.weeks : [],
  });
}

export async function deleteProgram(_creatorId, programId) {
  await apiClient.delete(`/creator/nutrition/programs/${programId}`);
}

export async function createProgramAssignment(clientId, { programId, startDate, endDate }) {
  const result = await apiClient.post(
    `/creator/clients/${clientId}/nutrition/assignments`,
    {
      mode: 'program',
      programId,
      startDate,
      ...(endDate ? { endDate } : {}),
    },
    { idempotent: false }
  );
  return result?.data?.assignmentId;
}

// ─── Program Nutrition Assignments ────────────────────────────────────────

function shapeAssignment(a) {
  return {
    id: a.assignmentId,
    planId: a.planId ?? null,
    planName: a.planName ?? a.plan?.name ?? null,
    daily_calories: a.plan?.daily_calories ?? a.daily_calories ?? null,
    daily_protein_g: a.plan?.daily_protein_g ?? a.daily_protein_g ?? null,
    daily_carbs_g: a.plan?.daily_carbs_g ?? a.daily_carbs_g ?? null,
    daily_fat_g: a.plan?.daily_fat_g ?? a.daily_fat_g ?? null,
    assignedBy: a.assignedBy ?? null,
    source: a.source ?? null,
    programId: a.programId ?? null,
    startDate: a.startDate ?? null,
    endDate: a.endDate ?? null,
    status: a.status ?? 'active',
    createdAt: a.createdAt ?? null,
    updatedAt: a.updatedAt ?? null,
  };
}

export async function getProgramNutritionAssignments(programId) {
  const result = await apiClient.get(`/creator/programs/${programId}/nutrition/assignments`);
  return (result?.data ?? []).map(shapeAssignment);
}

export async function createProgramNutritionAssignment(programId, planId) {
  const result = await apiClient.post(
    `/creator/programs/${programId}/nutrition/assignments`,
    { planId },
    { idempotent: false }
  );
  return result?.data?.assignmentId;
}

export async function deleteProgramNutritionAssignment(programId, assignmentId) {
  await apiClient.delete(`/creator/programs/${programId}/nutrition/assignments/${assignmentId}`);
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
  getProgramNutritionAssignments,
  createProgramNutritionAssignment,
  deleteProgramNutritionAssignment,
};
