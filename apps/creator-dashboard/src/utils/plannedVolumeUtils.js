/**
 * Planned volume (effective sets per muscle) computation.
 * Matches LibrarySessionDetailScreen: intensity >= 7, muscle_activation from library.
 * Used for single-session and week-aggregate volume.
 */

export function getPrimaryReferences(exercise) {
  if (!exercise || typeof exercise.primary !== 'object' || exercise.primary === null) {
    return [];
  }
  return Object.entries(exercise.primary)
    .filter(([libraryId, exerciseName]) => Boolean(libraryId) && Boolean(exerciseName))
    .map(([libraryId, exerciseName]) => ({ libraryId, exerciseName }));
}

function parsePlannedIntensity(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim().replace(/\s+/g, '');
  const match = s.match(/^(\d+)\/10$/) || s.match(/^(\d+)$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return n >= 1 && n <= 10 ? n : null;
}

/**
 * Compute planned muscle volumes (effective sets per muscle) from a list of exercises.
 * @param {Array<{ primary?: object, sets?: Array<{ intensity?: any }> }>} exercises
 * @param {Record<string, object>} libraryDataCache - Map libraryId -> library doc (exercise names as keys, muscle_activation per exercise)
 * @returns {Record<string, number>} muscle key -> effective sets (rounded to 1 decimal)
 */
export function computePlannedMuscleVolumes(exercises, libraryDataCache) {
  const muscleSets = {};
  (exercises || []).forEach((exercise) => {
    const refs = getPrimaryReferences(exercise);
    const primary = refs[0];
    if (!primary?.libraryId || !primary?.exerciseName) return;
    const library = libraryDataCache[primary.libraryId];
    const exerciseData = library?.[primary.exerciseName];
    const muscleActivation = exerciseData?.muscle_activation;
    if (!muscleActivation || typeof muscleActivation !== 'object') return;
    const sets = exercise.sets || [];
    let effectiveSets = 0;
    sets.forEach((set) => {
      const intensity = parsePlannedIntensity(set.intensity);
      if (intensity != null && intensity >= 7) effectiveSets++;
    });
    if (effectiveSets <= 0) return;
    Object.entries(muscleActivation).forEach(([muscle, pct]) => {
      const num = typeof pct === 'string' ? parseFloat(pct) : pct;
      if (!Number.isNaN(num)) {
        muscleSets[muscle] = (muscleSets[muscle] || 0) + effectiveSets * (num / 100);
      }
    });
  });
  Object.keys(muscleSets).forEach((m) => {
    muscleSets[m] = Math.round(muscleSets[m] * 10) / 10;
  });
  return muscleSets;
}

export const MUSCLE_DISPLAY_NAMES = {
  pecs: 'Pectorales',
  front_delts: 'Deltoides Frontales',
  side_delts: 'Deltoides Laterales',
  rear_delts: 'Deltoides Posteriores',
  triceps: 'Tríceps',
  traps: 'Trapecios',
  abs: 'Abdominales',
  lats: 'Dorsales',
  rhomboids: 'Romboides',
  biceps: 'Bíceps',
  forearms: 'Antebrazos',
  quads: 'Cuádriceps',
  glutes: 'Glúteos',
  hamstrings: 'Isquiotibiales',
  calves: 'Gemelos',
  hip_flexors: 'Flexores de Cadera',
  obliques: 'Oblicuos',
  lower_back: 'Lumbar',
  neck: 'Cuello',
  "pantorrilla'nt": 'Pantorrilla'
};

export function getMuscleDisplayName(muscleKey) {
  return MUSCLE_DISPLAY_NAMES[muscleKey] || muscleKey;
}
