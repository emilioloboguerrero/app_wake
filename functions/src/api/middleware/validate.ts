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
  | "optional_object";

export type ValidationSchema = Record<string, SchemaType>;

export interface ValidateBodyOptions {
  /** When true, fields not declared in the schema are stripped from the result. Default: true. */
  stripUnknown?: boolean;
}

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
  const { stripUnknown = true } = options;

  if (!body || typeof body !== "object") {
    throw new WakeApiServerError(
      "VALIDATION_ERROR",
      400,
      "Request body debe ser un objeto JSON"
    );
  }

  const obj = body as Record<string, unknown>;

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
