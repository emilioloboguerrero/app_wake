/**
 * Standard Muscle Groups for Volume Tracking
 * 
 * This file defines the canonical list of muscle groups used throughout the app
 * for tracking muscle-specific training volume.
 * 
 * Total: 20 muscle groups
 */

/**
 * Array of all valid muscle group identifiers
 * Used for validation and iteration
 */
export const MUSCLE_GROUPS = [
  // Upper Body - Push (7)
  'pecs',
  'front_delts',
  'side_delts',
  'rear_delts',
  'triceps',
  'traps',
  'abs',
  
  // Upper Body - Pull (4)
  'lats',
  'rhomboids',
  'biceps',
  'forearms',
  
  // Lower Body (5)
  'quads',
  'glutes',
  'hamstrings',
  'calves',
  'hip_flexors',
  
  // Core (2)
  'obliques',
  'lower_back',
  
  // Other (1)
  'neck'
];

/**
 * Display names in Spanish for each muscle group
 * Used for UI display
 */
export const MUSCLE_DISPLAY_NAMES = {
  // Upper Body - Push
  pecs: 'Pectorales',
  front_delts: 'Deltoides Frontales',
  side_delts: 'Deltoides Laterales',
  rear_delts: 'Deltoides Posteriores',
  triceps: 'Tríceps',
  traps: 'Trapecios',
  abs: 'Abdominales',
  
  // Upper Body - Pull
  lats: 'Dorsales',
  rhomboids: 'Romboides',
  biceps: 'Bíceps',
  forearms: 'Antebrazos',
  
  // Lower Body
  quads: 'Cuádriceps',
  glutes: 'Glúteos',
  hamstrings: 'Isquiotibiales',
  calves: 'Gemelos',
  hip_flexors: 'Flexores de Cadera',
  
  // Core
  obliques: 'Oblicuos',
  lower_back: 'Lumbar',
  
  // Other
  neck: 'Cuello'
};

/**
 * Muscle groups organized by category
 * Useful for grouped displays and organization
 */
export const MUSCLE_CATEGORIES = {
  'Upper Push': ['pecs', 'front_delts', 'side_delts', 'rear_delts', 'triceps', 'traps'],
  'Upper Pull': ['lats', 'rhomboids', 'biceps', 'forearms'],
  'Lower Body': ['quads', 'glutes', 'hamstrings', 'calves', 'hip_flexors'],
  'Core': ['abs', 'obliques', 'lower_back'],
  'Other': ['neck']
};

/**
 * Category display names in Spanish
 */
export const CATEGORY_DISPLAY_NAMES = {
  'Upper Push': 'Empuje Superior',
  'Upper Pull': 'Jalón Superior',
  'Lower Body': 'Tren Inferior',
  'Core': 'Core',
  'Other': 'Otros'
};

/**
 * Validate muscle activation distribution
 * @param {Object} distribution - Object with muscle names as keys and percentages as values
 * @returns {Object} - { valid: boolean, error?: string }
 */
export function validateMuscleActivation(distribution) {
  if (!distribution || typeof distribution !== 'object') {
    return { valid: false, error: 'Distribution must be an object' };
  }
  
  // Check all muscles are valid
  const invalidMuscles = Object.keys(distribution).filter(
    muscle => !MUSCLE_GROUPS.includes(muscle)
  );
  
  if (invalidMuscles.length > 0) {
    return { 
      valid: false, 
      error: `Invalid muscle groups: ${invalidMuscles.join(', ')}` 
    };
  }
  
  // Check percentages sum to 100 (allow 0.1% tolerance for rounding)
  const total = Object.values(distribution).reduce((sum, val) => sum + val, 0);
  if (Math.abs(total - 100) > 0.1) {
    return { 
      valid: false, 
      error: `Percentages must sum to 100%, got ${total}%` 
    };
  }
  
  // Check all values are positive
  const negatives = Object.entries(distribution).filter(([_, val]) => val <= 0);
  if (negatives.length > 0) {
    return { 
      valid: false, 
      error: `All percentages must be positive: ${negatives.map(([m]) => m).join(', ')}` 
    };
  }
  
  return { valid: true };
}

/**
 * Get display name for a muscle group
 * @param {string} muscleKey - Muscle group key
 * @returns {string} - Display name in Spanish
 */
export function getMuscleDisplayName(muscleKey) {
  return MUSCLE_DISPLAY_NAMES[muscleKey] || muscleKey;
}

/**
 * Check if a discipline should track muscle volume
 * @param {string} discipline - Course discipline name
 * @returns {boolean} - True if muscle volume tracking is enabled for this discipline
 */
export function shouldTrackMuscleVolume(discipline) {
  if (!discipline || typeof discipline !== 'string') {
    return false;
  }
  
  // Get first word of discipline (before space or hyphen)
  const firstWord = discipline.toLowerCase().split(/[-\s]/)[0].trim();
  
  // Supported disciplines
  const supportedDisciplines = ['fuerza', 'calistenia', 'hibrido'];
  
  return supportedDisciplines.includes(firstWord);
}

/**
 * Get current ISO week string (format: "YYYY-WXX")
 * @param {Date} date - Date to get week for (defaults to now)
 * @returns {string} - ISO week string (e.g., "2025-W41")
 */
export function getISOWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Example muscle activation distributions for common exercises
 * These are examples for reference, not used in the app logic
 */
export const EXAMPLE_DISTRIBUTIONS = {
  // Chest
  "Bench Press": { pecs: 60, triceps: 25, front_delts: 15 },
  "Incline Press": { pecs: 55, front_delts: 30, triceps: 15 },
  "Chest Fly": { pecs: 90, front_delts: 10 },
  "Dips": { pecs: 45, triceps: 40, front_delts: 15 },
  
  // Legs
  "Squat": { quads: 50, glutes: 30, hamstrings: 20 },
  "Front Squat": { quads: 65, glutes: 20, abs: 15 },
  "Deadlift": { hamstrings: 35, glutes: 25, lower_back: 20, lats: 10, traps: 10 },
  "Leg Press": { quads: 60, glutes: 30, hamstrings: 10 },
  "Lunge": { quads: 45, glutes: 35, hamstrings: 20 },
  "Romanian Deadlift": { hamstrings: 60, glutes: 30, lower_back: 10 },
  "Leg Extension": { quads: 100 },
  "Leg Curl": { hamstrings: 100 },
  "Hip Thrust": { glutes: 80, hamstrings: 20 },
  "Bulgarian Split Squat": { quads: 50, glutes: 35, hamstrings: 15 },
  "Calf Raise": { calves: 100 },
  
  // Back
  "Pull Up": { lats: 65, biceps: 25, rhomboids: 10 },
  "Lat Pulldown": { lats: 70, biceps: 20, rhomboids: 10 },
  "Barbell Row": { lats: 50, rhomboids: 25, biceps: 15, traps: 10 },
  "Cable Row": { lats: 50, rhomboids: 30, biceps: 20 },
  "T-Bar Row": { lats: 45, rhomboids: 30, traps: 15, biceps: 10 },
  "Face Pull": { rear_delts: 60, rhomboids: 25, traps: 15 },
  
  // Shoulders
  "Overhead Press": { front_delts: 50, side_delts: 30, triceps: 15, traps: 5 },
  "Arnold Press": { front_delts: 45, side_delts: 35, triceps: 20 },
  "Lateral Raise": { side_delts: 100 },
  "Front Raise": { front_delts: 100 },
  "Reverse Fly": { rear_delts: 100 },
  
  // Arms
  "Bicep Curl": { biceps: 100 },
  "Hammer Curl": { biceps: 70, forearms: 30 },
  "Tricep Extension": { triceps: 100 },
  "Close-Grip Bench": { triceps: 60, pecs: 30, front_delts: 10 },
  
  // Core
  "Plank": { abs: 60, obliques: 30, lower_back: 10 },
  "Crunch": { abs: 100 },
  "Russian Twist": { obliques: 80, abs: 20 },
  "Back Extension": { lower_back: 80, glutes: 20 },
  "Hanging Leg Raise": { abs: 100 }
};

