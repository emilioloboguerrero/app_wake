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
 * @param {string} searchExpression - Search term
 * @param {number} [pageNumber=0]
 * @param {number} [maxResults=20]
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
 * @param {string|number} foodId
 * @param {{ include_sub_categories?: boolean }} [options] - include_sub_categories: true uses Premier scope; response may include food_sub_categories
 */
export async function nutritionFoodGet(foodId, options = {}) {
  return post('nutritionFoodGet', { food_id: foodId, ...options });
}

/**
 * Lookup food by barcode via FatSecret proxy.
 * @param {string} barcode - 13-digit GTIN-13
 */
export async function nutritionBarcodeLookup(barcode) {
  return post('nutritionBarcodeLookup', { barcode });
}

export default {
  nutritionFoodSearch,
  nutritionFoodGet,
  nutritionBarcodeLookup,
};
