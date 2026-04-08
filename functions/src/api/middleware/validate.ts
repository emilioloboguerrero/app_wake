import { WakeApiServerError } from "../errors.js";

type SchemaType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "optional_string"
  | "optional_number"
  | "optional_boolean"
  | "optional_array"
  | "optional_object"
  | "string_or_number"
  | "optional_string_or_number";

export type ValidationSchema = Record<string, SchemaType>;

export interface ValidateBodyOptions {
  /** When true, fields not declared in the schema are stripped from the result. Default: true. */
  stripUnknown?: boolean;
  /** Max allowed string length for any string field (default: 5000). */
  maxStringLength?: number;
  /** Max allowed array length for any array field (default: 200). */
  maxArrayLength?: number;
}

// Keys that should never appear in validated bodies (prototype pollution guard)
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Validates `body` against `schema` and returns only declared fields.
 *
 * Notes on scope:
 * - Arrays and objects are verified at the top-level type only; their contents
 *   are not recursively validated. Route handlers must validate deeper
 *   structures when needed (e.g. array item types, nested object shapes).
 */
export function validateBody<T>(
  schema: ValidationSchema,
  body: unknown,
  options: ValidateBodyOptions = {}
): T {
  const {
    stripUnknown = true,
    maxStringLength = 5000,
    maxArrayLength = 200,
  } = options;

  if (!body || typeof body !== "object") {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "Request body debe ser un objeto JSON"
    );
  }

  const obj = body as Record<string, unknown>;

  // Filter dangerous keys
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      delete obj[key];
    }
  }

  for (const [field, type] of Object.entries(schema)) {
    const isOptional = type.startsWith("optional_");
    const baseType = isOptional ? type.replace("optional_", "") : type;
    const value = obj[field];

    if (value === undefined || value === null) {
      if (!isOptional) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR",
          400,
          `${field} es requerido`,
          field
        );
      }
      continue;
    }

    if (baseType === "array") {
      if (!Array.isArray(value)) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR",
          400,
          `${field} debe ser un array`,
          field
        );
      }
      if (value.length > maxArrayLength) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR",
          400,
          `${field} excede el máximo de ${maxArrayLength} elementos`,
          field
        );
      }
    } else if (baseType === "string") {
      if (typeof value !== "string") {
        throw new WakeApiServerError(
          "VALIDATION_ERROR",
          400,
          `${field} debe ser de tipo string`,
          field
        );
      }
      if (value.length > maxStringLength) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR",
          400,
          `${field} excede el máximo de ${maxStringLength} caracteres`,
          field
        );
      }
    } else if (baseType === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR",
          400,
          `${field} debe ser un número finito`,
          field
        );
      }
    } else if (baseType === "object") {
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR",
          400,
          `${field} debe ser de tipo object`,
          field
        );
      }
      // Validate object size (rough check — JSON size cap at 50KB)
      const objSize = JSON.stringify(value).length;
      if (objSize > 50_000) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR",
          400,
          `${field} excede el tamaño máximo permitido`,
          field
        );
      }
    } else if (baseType === "string_or_number") {
      if (typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value))) {
        throw new WakeApiServerError(
          "VALIDATION_ERROR",
          400,
          `${field} debe ser de tipo string o number`,
          field
        );
      }
    } else if (typeof value !== baseType) {
      throw new WakeApiServerError(
        "VALIDATION_ERROR",
        400,
        `${field} debe ser de tipo ${baseType}`,
        field
      );
    }

    // Required string fields must not be empty after trimming
    if (baseType === "string" && !isOptional && typeof value === "string" && value.trim() === "") {
      throw new WakeApiServerError(
        "VALIDATION_ERROR",
        400,
        `${field} no puede estar vacío`,
        field
      );
    }
  }

  // Strip fields not declared in the schema to prevent injection of arbitrary data
  if (stripUnknown) {
    const result: Record<string, unknown> = {};
    for (const field of Object.keys(schema)) {
      if (obj[field] !== undefined) {
        result[field] = obj[field];
      }
    }
    return result as T;
  }

  return obj as T;
}

/**
 * Picks only the specified fields from an object.
 * Use this when you need to allowlist fields from req.body for Firestore writes
 * without going through full validateBody schema validation.
 */
export function pickFields<T extends Record<string, unknown>>(
  source: Record<string, unknown>,
  allowedFields: string[]
): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (source[field] !== undefined && !DANGEROUS_KEYS.has(field)) {
      result[field] = source[field];
    }
  }
  return result as Partial<T>;
}

/** Validates that a string matches YYYY-MM-DD format. */
export function validateDateFormat(value: string, fieldName: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      `${fieldName} debe tener formato YYYY-MM-DD`,
      fieldName
    );
  }
}

/** Validates a storage path starts with the expected prefix. */
export function validateStoragePath(storagePath: string, expectedPrefix: string): void {
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "Ruta de almacenamiento inválida",
      "storagePath"
    );
  }
}
