// Data validation and type checking utilities
// Provides runtime type checking and data validation

import logger from './logger';
import { handleValidationError } from './errorHandler';

// Type definitions
export const DATA_TYPES = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  OBJECT: 'object',
  ARRAY: 'array',
  DATE: 'date',
  EMAIL: 'email',
  URL: 'url',
  PHONE: 'phone',
  UUID: 'uuid'
};

// Type checking functions
export const TypeChecker = {
  // Check if value is a string
  isString: (value) => typeof value === 'string',
  
  // Check if value is a number
  isNumber: (value) => typeof value === 'number' && !isNaN(value),
  
  // Check if value is a boolean
  isBoolean: (value) => typeof value === 'boolean',
  
  // Check if value is an object (not array or null)
  isObject: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  
  // Check if value is an array
  isArray: (value) => Array.isArray(value),
  
  // Check if value is a date
  isDate: (value) => value instanceof Date && !isNaN(value.getTime()),
  
  // Check if value is a valid email
  isEmail: (value) => {
    if (typeof value !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },
  
  // Check if value is a valid URL
  isUrl: (value) => {
    if (typeof value !== 'string') return false;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  
  // Check if value is a valid phone number
  isPhone: (value) => {
    if (typeof value !== 'string') return false;
    const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
    return phoneRegex.test(value) && value.replace(/\D/g, '').length >= 7;
  },
  
  // Check if value is a valid UUID
  isUuid: (value) => {
    if (typeof value !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }
};

// Data validation schema
export class DataValidator {
  constructor(schema) {
    this.schema = schema;
  }

  // Validate data against schema
  validate(data, context = {}) {
    const errors = {};
    const sanitizedData = {};

    for (const [field, rules] of Object.entries(this.schema)) {
      const value = data[field];
      const result = this.validateField(field, value, rules);

      if (!result.valid) {
        errors[field] = result.error;
      } else {
        sanitizedData[field] = result.value;
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      data: sanitizedData
    };
  }

  // Validate individual field
  validateField(field, value, rules) {
    // Required check
    if (rules.required && (value === null || value === undefined || value === '')) {
      return {
        valid: false,
        error: `${field} es requerido`
      };
    }

    // Skip validation if value is empty and not required
    if (!rules.required && (value === null || value === undefined || value === '')) {
      return { valid: true, value };
    }

    // Type validation
    if (rules.type && !this.checkType(value, rules.type)) {
      return {
        valid: false,
        error: `${field} debe ser de tipo ${rules.type}`
      };
    }

    // Custom validation
    if (rules.validate && typeof rules.validate === 'function') {
      const customResult = rules.validate(value);
      if (!customResult.valid) {
        return {
          valid: false,
          error: customResult.error || `${field} no es válido`
        };
      }
    }

    // Length validation for strings
    if (rules.type === DATA_TYPES.STRING && typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        return {
          valid: false,
          error: `${field} debe tener al menos ${rules.minLength} caracteres`
        };
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        return {
          valid: false,
          error: `${field} debe tener máximo ${rules.maxLength} caracteres`
        };
      }
    }

    // Range validation for numbers
    if (rules.type === DATA_TYPES.NUMBER && typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        return {
          valid: false,
          error: `${field} debe ser mayor o igual a ${rules.min}`
        };
      }
      if (rules.max !== undefined && value > rules.max) {
        return {
          valid: false,
          error: `${field} debe ser menor o igual a ${rules.max}`
        };
      }
    }

    // Array validation
    if (rules.type === DATA_TYPES.ARRAY && Array.isArray(value)) {
      if (rules.minItems && value.length < rules.minItems) {
        return {
          valid: false,
          error: `${field} debe tener al menos ${rules.minItems} elementos`
        };
      }
      if (rules.maxItems && value.length > rules.maxItems) {
        return {
          valid: false,
          error: `${field} debe tener máximo ${rules.maxItems} elementos`
        };
      }
    }

    return { valid: true, value };
  }

  // Check if value matches expected type
  checkType(value, expectedType) {
    switch (expectedType) {
      case DATA_TYPES.STRING:
        return TypeChecker.isString(value);
      case DATA_TYPES.NUMBER:
        return TypeChecker.isNumber(value);
      case DATA_TYPES.BOOLEAN:
        return TypeChecker.isBoolean(value);
      case DATA_TYPES.OBJECT:
        return TypeChecker.isObject(value);
      case DATA_TYPES.ARRAY:
        return TypeChecker.isArray(value);
      case DATA_TYPES.DATE:
        return TypeChecker.isDate(value);
      case DATA_TYPES.EMAIL:
        return TypeChecker.isEmail(value);
      case DATA_TYPES.URL:
        return TypeChecker.isUrl(value);
      case DATA_TYPES.PHONE:
        return TypeChecker.isPhone(value);
      case DATA_TYPES.UUID:
        return TypeChecker.isUuid(value);
      default:
        return true;
    }
  }
}

// Predefined schemas for common data structures
export const CommonSchemas = {
  // User profile schema
  userProfile: {
    displayName: {
      type: DATA_TYPES.STRING,
      required: true,
      minLength: 2,
      maxLength: 50,
      validate: (value) => {
        const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
        return {
          valid: nameRegex.test(value),
          error: 'El nombre solo puede contener letras y espacios'
        };
      }
    },
    username: {
      type: DATA_TYPES.STRING,
      required: true,
      minLength: 3,
      maxLength: 20,
      validate: (value) => {
        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        return {
          valid: usernameRegex.test(value),
          error: 'El nombre de usuario solo puede contener letras, números y guiones bajos'
        };
      }
    },
    email: {
      type: DATA_TYPES.EMAIL,
      required: false,
      maxLength: 254
    },
    phoneNumber: {
      type: DATA_TYPES.PHONE,
      required: false
    },
    age: {
      type: DATA_TYPES.NUMBER,
      required: true,
      min: 13,
      max: 120
    },
    gender: {
      type: DATA_TYPES.STRING,
      required: true,
      validate: (value) => {
        const validGenders = ['male', 'female', 'other'];
        return {
          valid: validGenders.includes(value),
          error: 'Género debe ser masculino, femenino u otro'
        };
      }
    },
    city: {
      type: DATA_TYPES.STRING,
      required: true,
      minLength: 2,
      maxLength: 100
    },
    interests: {
      type: DATA_TYPES.ARRAY,
      required: true,
      minItems: 1,
      maxItems: 10
    },
    objectives: {
      type: DATA_TYPES.ARRAY,
      required: true,
      minItems: 1,
      maxItems: 5
    }
  },

  // Course data schema
  courseData: {
    title: {
      type: DATA_TYPES.STRING,
      required: true,
      minLength: 3,
      maxLength: 100
    },
    description: {
      type: DATA_TYPES.STRING,
      required: true,
      minLength: 10,
      maxLength: 1000
    },
    difficulty: {
      type: DATA_TYPES.STRING,
      required: true,
      validate: (value) => {
        const validDifficulties = ['Principiante', 'Intermedio', 'Avanzado'];
        return {
          valid: validDifficulties.includes(value),
          error: 'Dificultad debe ser Principiante, Intermedio o Avanzado'
        };
      }
    },
    discipline: {
      type: DATA_TYPES.STRING,
      required: true,
      minLength: 2,
      maxLength: 50
    },
    price: {
      type: DATA_TYPES.NUMBER,
      required: true,
      min: 0
    },
    currency: {
      type: DATA_TYPES.STRING,
      required: true,
      validate: (value) => {
        const validCurrencies = ['USD', 'COP', 'EUR'];
        return {
          valid: validCurrencies.includes(value),
          error: 'Moneda debe ser USD, COP o EUR'
        };
      }
    }
  },

  // Workout session schema
  workoutSession: {
    userId: {
      type: DATA_TYPES.UUID,
      required: true
    },
    courseId: {
      type: DATA_TYPES.STRING,
      required: true,
      minLength: 10,
      maxLength: 50
    },
    sessionId: {
      type: DATA_TYPES.STRING,
      required: true,
      minLength: 10,
      maxLength: 50
    },
    startTime: {
      type: DATA_TYPES.DATE,
      required: true
    },
    endTime: {
      type: DATA_TYPES.DATE,
      required: false
    },
    exercises: {
      type: DATA_TYPES.ARRAY,
      required: true,
      minItems: 1
    },
    completed: {
      type: DATA_TYPES.BOOLEAN,
      required: true
    }
  }
};

// Runtime type checking decorator
export const validateData = (schema, context = {}) => {
  return (target, propertyName, descriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = function(...args) {
      // Assume first argument is the data to validate
      const data = args[0];
      
      if (data && typeof data === 'object') {
        const validator = new DataValidator(schema);
        const result = validator.validate(data, context);

        if (!result.isValid) {
          logger.warn(`Validation failed for ${propertyName}:`, result.errors);
          return handleValidationError(new Error('Data validation failed'), {
            method: propertyName,
            errors: result.errors
          });
        }

        // Replace first argument with validated data
        args[0] = result.data;
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
};

// Safe data access with type checking
export const safeGet = (obj, path, expectedType, defaultValue = null) => {
  try {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return defaultValue;
      }
      current = current[key];
    }

    // Type check
    if (expectedType && !TypeChecker[`is${expectedType.charAt(0).toUpperCase() + expectedType.slice(1)}`](current)) {
      logger.warn(`Type mismatch for path ${path}: expected ${expectedType}, got ${typeof current}`);
      return defaultValue;
    }

    return current;
  } catch (error) {
    logger.warn(`Error accessing path ${path}:`, error.message);
    return defaultValue;
  }
};

export default {
  DATA_TYPES,
  TypeChecker,
  DataValidator,
  CommonSchemas,
  validateData,
  safeGet
};
