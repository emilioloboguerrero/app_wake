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
  // API returns raw FatSecret objects (snake_case fields) inside data.foods
  const rawFoods = result?.data?.foods ?? [];
  const foods = Array.isArray(rawFoods) ? rawFoods : (rawFoods ? [rawFoods] : []);
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
  // API returns raw FatSecret food object (snake_case fields) inside data
  const foodData = result?.data ?? {};
  return { food: foodData };
}

/**
 * Lookup food by barcode.
 * Returns data shaped like the old FatSecret barcode response:
 * { food: { food_id, food_name, food_category, servings: { serving: [...] } } }
 */
export async function nutritionBarcodeLookup(barcode) {
  const result = await apiClient.get(`/nutrition/foods/barcode/${encodeURIComponent(barcode)}`);
  // API returns raw FatSecret food object (snake_case fields) inside data
  const foodData = result?.data ?? {};
  return { food: foodData };
}

export default {
  nutritionFoodSearch,
  nutritionFoodGet,
  nutritionBarcodeLookup,
};
