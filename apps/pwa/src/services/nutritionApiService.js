/**
 * Nutrition API service — calls Cloud Functions (FatSecret proxy).
 * Base URL matches deployed functions (us-central1).
 */
const NUTRITION_BASE =
  'https://us-central1-wolf-20b8b.cloudfunctions.net';

async function post(endpoint, body) {
  const res = await fetch(`${NUTRITION_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error ?? `Request failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Search foods via FatSecret proxy.
 */
export async function nutritionFoodSearch(searchExpression, pageNumber = 0, maxResults = 20) {
  return post('nutritionFoodSearch', {
    search_expression: searchExpression,
    page_number: pageNumber,
    max_results: maxResults,
  });
}

/**
 * Get food by ID via FatSecret proxy.
 */
export async function nutritionFoodGet(foodId) {
  return post('nutritionFoodGet', { food_id: foodId });
}

/**
 * Lookup food by barcode via FatSecret proxy.
 */
export async function nutritionBarcodeLookup(barcode) {
  return post('nutritionBarcodeLookup', { barcode });
}

export default {
  nutritionFoodSearch,
  nutritionFoodGet,
  nutritionBarcodeLookup,
};
