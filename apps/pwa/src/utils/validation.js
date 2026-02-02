// Input validation and sanitization utilities
import { handleValidationError } from './errorHandler';
import logger from './logger';

// Validation rules
export const VALIDATION_RULES = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s\-\(\)]+$/,
  USERNAME: /^[a-zA-Z0-9_]{3,20}$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
  NAME: /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,50}$/
};

// Sanitization functions
export const sanitizeInput = {
  // Remove HTML tags and dangerous characters
  html: (input) => {
    if (typeof input !== 'string') return input;
    return input
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[<>]/g, '') // Remove remaining angle brackets
      .trim();
  },

  // Remove special characters except basic punctuation
  text: (input) => {
    if (typeof input !== 'string') return input;
    return input
      .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ.,!?@#$%&*()-]/g, '')
      .trim();
  },

  // Remove all non-numeric characters
  numeric: (input) => {
    if (typeof input !== 'string') return input;
    return input.replace(/\D/g, '');
  },

  // Remove extra whitespace
  whitespace: (input) => {
    if (typeof input !== 'string') return input;
    return input.replace(/\s+/g, ' ').trim();
  },

  // Convert to lowercase
  lowercase: (input) => {
    if (typeof input !== 'string') return input;
    return input.toLowerCase().trim();
  }
};

// Validation functions
export const validateInput = {
  // Email validation
  email: (email) => {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Email es requerido' };
    }

    const sanitized = sanitizeInput.html(email).toLowerCase();
    
    if (!VALIDATION_RULES.EMAIL.test(sanitized)) {
      return { valid: false, error: 'Formato de email inválido' };
    }

    if (sanitized.length > 254) {
      return { valid: false, error: 'Email demasiado largo' };
    }

    return { valid: true, value: sanitized };
  },

  // Phone validation
  phone: (phone) => {
    if (!phone || typeof phone !== 'string') {
      return { valid: false, error: 'Teléfono es requerido' };
    }

    const sanitized = sanitizeInput.numeric(phone);
    
    if (sanitized.length < 7 || sanitized.length > 15) {
      return { valid: false, error: 'Número de teléfono inválido' };
    }

    return { valid: true, value: sanitized };
  },

  // Username validation
  username: (username) => {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Nombre de usuario es requerido' };
    }

    const sanitized = sanitizeInput.text(username);
    
    if (!VALIDATION_RULES.USERNAME.test(sanitized)) {
      return { 
        valid: false, 
        error: 'Nombre de usuario debe tener entre 3-20 caracteres y solo letras, números y guiones bajos' 
      };
    }

    return { valid: true, value: sanitized };
  },

  // Password validation
  password: (password) => {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Contraseña es requerida' };
    }

    if (password.length < 8) {
      return { valid: false, error: 'Contraseña debe tener al menos 8 caracteres' };
    }

    if (!VALIDATION_RULES.PASSWORD.test(password)) {
      return { 
        valid: false, 
        error: 'Contraseña debe contener al menos una mayúscula, una minúscula y un número' 
      };
    }

    return { valid: true, value: password };
  },

  // Name validation
  name: (name) => {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Nombre es requerido' };
    }

    const sanitized = sanitizeInput.text(name);
    
    if (!VALIDATION_RULES.NAME.test(sanitized)) {
      return { 
        valid: false, 
        error: 'Nombre debe tener entre 2-50 caracteres y solo letras' 
      };
    }

    return { valid: true, value: sanitized };
  },

  // Required field validation
  required: (value, fieldName = 'Campo') => {
    if (value === null || value === undefined || value === '') {
      return { valid: false, error: `${fieldName} es requerido` };
    }

    if (typeof value === 'string' && value.trim() === '') {
      return { valid: false, error: `${fieldName} es requerido` };
    }

    return { valid: true, value };
  },

  // Length validation
  length: (value, min, max, fieldName = 'Campo') => {
    if (typeof value !== 'string') {
      return { valid: false, error: `${fieldName} debe ser texto` };
    }

    if (value.length < min) {
      return { valid: false, error: `${fieldName} debe tener al menos ${min} caracteres` };
    }

    if (value.length > max) {
      return { valid: false, error: `${fieldName} debe tener máximo ${max} caracteres` };
    }

    return { valid: true, value };
  },

  // Number validation
  number: (value, min = null, max = null, fieldName = 'Número') => {
    const num = Number(value);
    
    if (isNaN(num)) {
      return { valid: false, error: `${fieldName} debe ser un número válido` };
    }

    if (min !== null && num < min) {
      return { valid: false, error: `${fieldName} debe ser mayor o igual a ${min}` };
    }

    if (max !== null && num > max) {
      return { valid: false, error: `${fieldName} debe ser menor o igual a ${max}` };
    }

    return { valid: true, value: num };
  }
};

// Form validation helper
export const validateForm = (formData, rules) => {
  const errors = {};
  const sanitizedData = {};

  for (const [field, rule] of Object.entries(rules)) {
    const value = formData[field];
    const result = rule(value);

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
};

// Safe JSON parsing
export const safeJsonParse = (jsonString, defaultValue = null) => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    logger.warn('Failed to parse JSON:', error.message);
    return defaultValue;
  }
};

// Safe JSON stringify
export const safeJsonStringify = (obj, defaultValue = '{}') => {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    logger.warn('Failed to stringify JSON:', error.message);
    return defaultValue;
  }
};

// XSS protection for user input
export const escapeHtml = (unsafe) => {
  if (typeof unsafe !== 'string') return unsafe;
  
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// SQL injection protection (for future database queries)
export const escapeSql = (unsafe) => {
  if (typeof unsafe !== 'string') return unsafe;
  
  return unsafe
    .replace(/'/g, "''")
    .replace(/;/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '');
};

export default {
  sanitizeInput,
  validateInput,
  validateForm,
  safeJsonParse,
  safeJsonStringify,
  escapeHtml,
  escapeSql,
  VALIDATION_RULES
};
