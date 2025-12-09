// Simple input validation utilities

/**
 * Validate display name
 */
export function validateDisplayName(name) {
  if (!name || name.trim().length === 0) {
    throw new Error('El nombre no puede estar vacío');
  }
  if (name.trim().length < 2) {
    throw new Error('El nombre debe tener al menos 2 caracteres');
  }
  if (name.length > 50) {
    throw new Error('El nombre debe tener menos de 50 caracteres');
  }
  return name.trim();
}

/**
 * Validate username
 */
export function validateUsername(username) {
  if (!username || username.trim().length === 0) {
    throw new Error('El nombre de usuario no puede estar vacío');
  }
  if (username.trim().length < 3) {
    throw new Error('El nombre de usuario debe tener al menos 3 caracteres');
  }
  if (username.length > 20) {
    throw new Error('El nombre de usuario debe tener menos de 20 caracteres');
  }
  // Only alphanumeric, underscore, and hyphen
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    throw new Error('El nombre de usuario solo puede contener letras, números, guiones y guiones bajos');
  }
  return username.trim();
}

/**
 * Validate email
 */
export function validateEmail(email) {
  if (!email || email.trim().length === 0) {
    throw new Error('El correo electrónico no puede estar vacío');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Por favor ingresa un correo electrónico válido');
  }
  return email.toLowerCase().trim();
}

/**
 * Validate password
 */
export function validatePassword(password) {
  if (!password || password.length === 0) {
    throw new Error('La contraseña no puede estar vacía');
  }
  if (password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres');
  }
  if (password.length > 128) {
    throw new Error('La contraseña es demasiado larga');
  }
  return password;
}

/**
 * Validate phone number (optional field)
 */
export function validatePhoneNumber(phone) {
  if (!phone || phone.trim().length === 0) {
    return ''; // Optional field
  }
  // Remove spaces and dashes
  const cleaned = phone.replace(/[\s-]/g, '');
  if (cleaned.length < 8 || cleaned.length > 15) {
    throw new Error('El número de teléfono debe tener entre 8 y 15 dígitos');
  }
  if (!/^\+?[0-9]+$/.test(cleaned)) {
    throw new Error('El número de teléfono solo puede contener números y un + opcional al inicio');
  }
  return cleaned;
}

/**
 * Validate gender selection
 */
export function validateGender(gender) {
  const validGenders = ['male', 'female', 'other', 'prefer-not-to-say'];
  if (!gender || !validGenders.includes(gender)) {
    throw new Error('Por favor selecciona un género válido');
  }
  return gender;
}

/**
 * Validate interests array
 */
export function validateInterests(interests) {
  if (!Array.isArray(interests)) {
    throw new Error('Los intereses deben ser una lista');
  }
  if (interests.length === 0) {
    throw new Error('Por favor selecciona al menos un interés');
  }
  if (interests.length > 10) {
    throw new Error('Puedes seleccionar hasta 10 intereses');
  }
  return interests;
}

/**
 * Validate profile picture file size
 */
export function validateProfilePictureSize(fileSizeInBytes) {
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (fileSizeInBytes > MAX_SIZE) {
    throw new Error('La imagen debe ser menor a 5MB');
  }
  return true;
}
