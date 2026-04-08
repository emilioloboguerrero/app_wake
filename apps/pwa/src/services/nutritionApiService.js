/**
 * Nutrition API service — calls the Phase 3 REST API (FatSecret proxy endpoints).
 * Shapes responses back to the raw FatSecret format that callers expect.
 */
import apiClient, { WakeApiError } from '../utils/apiClient';
import { showOfflineError } from '../utils/offlineError';

/**
 * Search foods by name.
 * Returns data shaped like the old FatSecret v4 response:
 * { foods_search: { results: { food: [...] }, total_results, page_number } }
 */
export async function nutritionFoodSearch(searchExpression, pageNumber = 0, _maxResults = 20) {
  let result;
  try {
    const page = pageNumber + 1; // API is 1-indexed, old service was 0-indexed
    result = await apiClient.get('/nutrition/foods/search', {
      params: { q: searchExpression, page: String(page) },
    });
  } catch (err) {
    if (err instanceof WakeApiError && err.status === 0) {
      showOfflineError();
    }
    throw err;
  }
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
export async function nutritionFoodGet(foodId) {
  let result;
  try {
    result = await apiClient.get(`/nutrition/foods/${foodId}`);
  } catch (err) {
    if (err instanceof WakeApiError && err.status === 0) {
      showOfflineError();
    }
    throw err;
  }
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
  let result;
  try {
    result = await apiClient.get(`/nutrition/foods/barcode/${encodeURIComponent(barcode)}`);
  } catch (err) {
    if (err instanceof WakeApiError && err.status === 0) {
      showOfflineError();
    }
    throw err;
  }
  // API returns raw FatSecret food object (snake_case fields) inside data
  const foodData = result?.data ?? {};
  return { food: foodData };
}

export default {
  nutritionFoodSearch,
  nutritionFoodGet,
  nutritionBarcodeLookup,
};
