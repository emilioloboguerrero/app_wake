/**
 * Open Food Facts (OFF) adapter — Colombian packaged-product coverage.
 *
 * Why: Wake's FatSecret account is limited to the US dataset (Premier Free),
 * so Colombian barcodes (GS1 prefix 770/771) and local brands (Alpina, Zenú,
 * Colanta, Postobón, Nutresa…) return nothing from FatSecret. OFF is a
 * community food database with real Colombian products, a keyless live JSON
 * API, and an ODbL license that permits commercial use. It is used here as a
 * live proxy (1 request = 1 real user action), which is OFF's sanctioned
 * pattern and avoids building an ODbL-derivative database.
 *
 * Reliability note: OFF's PRODUCT-by-barcode API is reliable; its SEARCH API
 * is intermittently down (503). Callers must treat search as best-effort.
 *
 * This module maps OFF products into the exact FatSecret food shape the PWA's
 * NutritionScreen already consumes, so no client change is needed:
 *   { food_id, food_name, food_type, brand_name, data_source,
 *     servings: { serving: [ { serving_id, serving_description,
 *       metric_serving_amount, metric_serving_unit, calories, protein,
 *       carbohydrate, fat, ... } ] } }
 *
 * OFF-sourced foods carry a namespaced id `off:<barcode>` so the detail route
 * (GET /nutrition/foods/:foodId) can route them back to OFF instead of
 * FatSecret. Attribution ("Datos: Open Food Facts") is required by ODbL when
 * the data is displayed.
 */
import * as functions from "firebase-functions";

const OFF_BASE = "https://world.openfoodfacts.org";
// OFF asks every reuser to send an identifying User-Agent.
const OFF_USER_AGENT = "WakeApp/1.0 (https://wakelab.co; hola@wakelab.co)";
const PRODUCT_TIMEOUT_MS = 4000;
const SEARCH_TIMEOUT_MS = 3000;
const SEARCH_MAX_RESULTS = 10;

/** Namespaced-id prefix marking a food that came from Open Food Facts. */
export const OFF_ID_PREFIX = "off:";

/** Barcodes issued by GS1 Colombia start with 770/771 → OFF is the better first hop. */
export function isColombianBarcode(barcode: string): boolean {
  return /^77[01]/.test(barcode);
}

export function isOffId(foodId: string): boolean {
  return foodId.startsWith(OFF_ID_PREFIX);
}

export function offIdToBarcode(foodId: string): string {
  return foodId.slice(OFF_ID_PREFIX.length);
}

interface OffNutriments {
  [key: string]: number | string | undefined;
}

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_es?: string;
  generic_name?: string;
  generic_name_es?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: OffNutriments;
  countries_tags?: string[];
}

interface OffProductResponse {
  status?: number;
  status_verbose?: string;
  product?: OffProduct;
}

interface OffSearchResponse {
  count?: number;
  products?: OffProduct[];
}

// FatSecret-shaped output (only the fields the PWA reads, plus a source marker).
interface FoodServing {
  serving_id: string;
  serving_description: string;
  metric_serving_amount: number;
  metric_serving_unit: string;
  calories: number;
  protein: number;
  carbohydrate: number;
  fat: number;
  saturated_fat?: number;
  sugar?: number;
  fiber?: number;
  sodium?: number;
}

export interface OffFood {
  food_id: string;
  food_name: string;
  food_type: string;
  brand_name?: string;
  data_source: "openfoodfacts";
  servings: { serving: FoodServing[] };
}

function num(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") {
    // OFF occasionally uses comma decimals (e.g. "5,5") in string fields.
    const n = parseFloat(v.replace(",", "."));
    return isFinite(n) ? n : null;
  }
  return null;
}

function round(v: number | null): number {
  return v == null ? 0 : Math.round(v);
}

function round1(v: number | null): number {
  return v == null ? 0 : Math.round(v * 10) / 10;
}

/** OFF stores sodium in grams; FatSecret servings express sodium in mg. */
function sodiumMg(n: OffNutriments): number | undefined {
  const g = num(n["sodium_100g"]);
  if (g == null) return undefined;
  return Math.round(g * 1000);
}

function pickName(p: OffProduct): string {
  const candidates = [
    p.product_name_es,
    p.product_name,
    p.generic_name_es,
    p.generic_name,
  ];
  for (const c of candidates) {
    if (c && c.trim()) return c.trim();
  }
  return "Producto";
}

/**
 * Map one OFF product to the FatSecret food shape.
 * Returns null when the product carries no usable macro data (energy + protein
 * both missing) — a food row with no nutrition is useless to the diary.
 */
export function offProductToFood(product: OffProduct): OffFood | null {
  const code = String(product.code || "").trim();
  if (!code) return null;

  const n: OffNutriments = product.nutriments || {};
  const protein100 = num(n["proteins_100g"]);
  const carb100 = num(n["carbohydrates_100g"]);
  const fat100 = num(n["fat_100g"]);
  let kcal100 = num(n["energy-kcal_100g"]);
  if (kcal100 == null && (protein100 != null || carb100 != null || fat100 != null)) {
    // Some OFF products omit energy but carry macros — derive kcal via Atwater
    // factors (protein 4, carb 4, fat 9) so the row isn't shown as 0 kcal.
    kcal100 = (protein100 ?? 0) * 4 + (carb100 ?? 0) * 4 + (fat100 ?? 0) * 9;
  }
  if (kcal100 == null && protein100 == null && carb100 == null && fat100 == null) {
    return null;
  }

  const servings: FoodServing[] = [];

  // Per-100g base serving — getPer100g() reads this to derive the 1g option.
  servings.push({
    serving_id: "off-100g",
    serving_description: "100 g",
    metric_serving_amount: 100,
    metric_serving_unit: "g",
    calories: round(kcal100),
    protein: round1(protein100),
    carbohydrate: round1(carb100),
    fat: round1(fat100),
    saturated_fat: round1(num(n["saturated-fat_100g"])),
    sugar: round1(num(n["sugars_100g"])),
    fiber: round1(num(n["fiber_100g"])),
    sodium: sodiumMg(n),
  });

  // Optional per-serving option when OFF knows the portion weight.
  const servG = num(product.serving_quantity);
  if (servG != null && servG > 0 && servG !== 100) {
    const scale = servG / 100;
    servings.push({
      serving_id: "off-serving",
      serving_description: `1 porción (${round1(servG)} g)`,
      metric_serving_amount: servG,
      metric_serving_unit: "g",
      calories: round(num(n["energy-kcal_serving"]) ?? (kcal100 != null ? kcal100 * scale : null)),
      protein: round1(num(n["proteins_serving"]) ?? (protein100 != null ? protein100 * scale : null)),
      carbohydrate: round1(num(n["carbohydrates_serving"]) ?? (carb100 != null ? carb100 * scale : null)),
      fat: round1(num(n["fat_serving"]) ?? (fat100 != null ? fat100 * scale : null)),
    });
  }

  const name = pickName(product);
  const brand = (product.brands || "").split(",")[0].trim();
  const titleBrand = brand ?
    brand.charAt(0).toUpperCase() + brand.slice(1) :
    "";
  const foodName =
    titleBrand && !name.toLowerCase().includes(brand.toLowerCase()) ?
      `${name} (${titleBrand})` :
      name;

  return {
    food_id: `${OFF_ID_PREFIX}${code}`,
    food_name: foodName,
    food_type: "Brand",
    ...(titleBrand ? {brand_name: titleBrand} : {}),
    data_source: "openfoodfacts",
    servings: {serving: servings},
  };
}

async function offFetch(url: string, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    headers: {"User-Agent": OFF_USER_AGENT, "Accept": "application/json"},
    signal: AbortSignal.timeout(timeoutMs),
  });
}

const PRODUCT_FIELDS =
  "code,product_name,product_name_es,generic_name,generic_name_es,brands," +
  "quantity,serving_size,serving_quantity,nutriments,countries_tags";

/**
 * Look up a single product by barcode. Returns the FatSecret-shaped food, or
 * null when the product is unknown / has no usable nutrition / OFF errors.
 * Never throws — the caller falls back to a 404.
 */
export async function fetchOffProduct(barcode: string): Promise<OffFood | null> {
  try {
    const url =
      `${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json` +
      `?fields=${PRODUCT_FIELDS}`;
    const res = await offFetch(url, PRODUCT_TIMEOUT_MS);
    if (!res.ok) return null;
    const json = (await res.json()) as OffProductResponse;
    if (json.status !== 1 || !json.product) return null;
    return offProductToFood(json.product);
  } catch (err) {
    functions.logger.warn("off:product-lookup-failed", {
      barcode,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Search Colombian products by text. Best-effort: OFF's search API is flaky, so
 * any error / timeout resolves to an empty array (search never breaks because
 * of OFF). Scoped to Colombia via countries_tags_en.
 */
export async function searchOffColombia(
  query: string,
  page = 0
): Promise<OffFood[]> {
  try {
    const params = new URLSearchParams({
      search_terms: query,
      countries_tags_en: "colombia",
      fields: PRODUCT_FIELDS,
      page_size: String(SEARCH_MAX_RESULTS),
      page: String(page + 1), // OFF search is 1-indexed
    });
    const res = await offFetch(
      `${OFF_BASE}/api/v2/search?${params}`,
      SEARCH_TIMEOUT_MS
    );
    if (!res.ok) return [];
    const json = (await res.json()) as OffSearchResponse;
    const products = Array.isArray(json.products) ? json.products : [];
    return products
      .map(offProductToFood)
      .filter((f): f is OffFood => f !== null);
  } catch (err) {
    functions.logger.warn("off:search-failed", {
      query,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
