/**
 * Nutrition API service — calls the Phase 3 REST API (FatSecret proxy endpoints).
 * Shapes responses back to the raw FatSecret format that callers expect.
 */
import apiClient from '../utils/apiClient';

/**
 * Search foods by name.
 * Returns data shaped like the old FatSecret v4 response:
 * { foods_search: { results: { food: [...] }, total_results, page_number } }
 */
export async function nutritionFoodSearch(searchExpression, pageNumber = 0, _maxResults = 20) {
  const page = pageNumber + 1; // API is 1-indexed, old service was 0-indexed
  const result = await apiClient.get('/nutrition/foods/search', {
    params: { q: searchExpression, page: String(page) },
  });
  const foods = (result?.data?.foods ?? []).map((f) => ({
    food_id: f.foodId,
    food_name: f.name,
    food_type: f.foodType,
    brand_name: f.brandName ?? null,
    food_category: null,
    food_description: f.servingDescription ?? '',
    calories: f.calories,
    protein: f.protein,
    carbohydrate: f.carbs,
    fat: f.fat,
    servings: { serving: [] },
  }));
  return {
    foods_search: {
      results: { food: foods },
      total_results: String(result?.data?.totalResults ?? 0),
      page_number: String(pageNumber),
    },
  };
}

/**
 * Get full food detail by ID.
 * Returns data shaped like the old FatSecret v5 response:
 * { food: { food_id, food_name, servings: { serving: [...] } } }
 */
export async function nutritionFoodGet(foodId, _options = {}) {
  const result = await apiClient.get(`/nutrition/foods/${foodId}`);
  const d = result?.data ?? {};
  return {
    food: {
      food_id: d.foodId ?? foodId,
      food_name: d.name ?? '',
      brand_name: d.brandName ?? null,
      servings: {
        serving: (d.servings ?? []).map((s) => ({
          serving_id: s.servingId,
          serving_description: s.description,
          calories: s.calories,
          protein: s.protein,
          carbohydrate: s.carbs,
          fat: s.fat,
          grams_per_unit: s.gramsPerUnit ?? null,
          metric_serving_amount: s.metricServingAmount ?? null,
          metric_serving_unit: s.metricServingUnit ?? null,
        })),
      },
    },
  };
}

/**
 * Lookup food by barcode.
 * Returns data shaped like the old FatSecret barcode response:
 * { food: { food_id, food_name, food_category, servings: { serving: [...] } } }
 */
export async function nutritionBarcodeLookup(barcode) {
  const result = await apiClient.get(`/nutrition/foods/barcode/${encodeURIComponent(barcode)}`);
  const d = result?.data ?? {};
  return {
    food: {
      food_id: d.foodId ?? '',
      food_name: d.name ?? '',
      brand_name: d.brandName ?? null,
      food_category: null,
      servings: {
        serving: (d.servings ?? []).map((s) => ({
          serving_id: s.servingId,
          serving_description: s.description,
          calories: s.calories,
          protein: s.protein,
          carbohydrate: s.carbs,
          fat: s.fat,
          grams_per_unit: s.gramsPerUnit ?? null,
          metric_serving_amount: s.metricServingAmount ?? null,
          metric_serving_unit: s.metricServingUnit ?? null,
        })),
      },
    },
  };
}

export default {
  nutritionFoodSearch,
  nutritionFoodGet,
  nutritionBarcodeLookup,
};
