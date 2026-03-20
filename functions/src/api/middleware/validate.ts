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

export function validateBody<T>(
  schema: ValidationSchema,
  body: unknown
): T {
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
  }

  return obj as T;
}
