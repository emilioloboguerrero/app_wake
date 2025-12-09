/**
 * Get color and opacity for muscle visualization based on set count
 * @param {number} setCount - Number of effective sets
 * @returns {object} - Object with color (hex) and opacity (0-1)
 */
export const getMuscleColor = (setCount) => {
  if (setCount === 0) {
    return { color: '#FFFFFF', opacity: 0.1 }; // No volume - barely visible white
  } else if (setCount <= 6) {
    // 1-6 sets: More opaque white with increasing opacity
    return { color: '#FFFFFF', opacity: 0.3 + ((setCount / 6) * 0.4) }; // 0.3 to 0.7 opacity
  } else if (setCount <= 18) {
    // 6-18 sets: Golden color (app color)
    return { color: '#BFA84D', opacity: 0.6 };
  } else {
    // 18+ sets: Dark red
    return { color: '#8B0000', opacity: 0.8 };
  }
};

/**
 * Get color and opacity for text display
 * @param {number} setCount - Number of effective sets
 * @returns {object} - Object with color (hex) and opacity (0-1)
 */
export const getMuscleColorForText = (setCount) => {
  if (setCount === 0) {
    return { color: '#FFFFFF', opacity: 0.1 };
  } else if (setCount <= 6) {
    // 1-6 sets: More opaque white for text
    return { color: '#FFFFFF', opacity: 0.6 };
  } else if (setCount <= 18) {
    // 6-18 sets: Golden color (app color)
    return { color: '#BFA84D', opacity: 1.0 };
  } else {
    // 18+ sets: Same color as muscle silhouette (fully lit up)
    return { color: '#9f2000', opacity: 1 };
  }
};

/**
 * Get enhanced color and opacity for share card visualization (lighter/more vibrant)
 * @param {number} setCount - Number of effective sets
 * @returns {object} - Object with color (hex) and opacity (0-1)
 */
export const getMuscleColorEnhanced = (setCount) => {
  if (setCount === 0) {
    return { color: '#FFFFFF', opacity: 0.2 }; // Increased from 0.1
  } else if (setCount <= 6) {
    // 1-6 sets: Lighter white with higher opacity
    return { color: '#FFFFFF', opacity: 0.5 + ((setCount / 6) * 0.4) }; // 0.5 to 0.9 (was 0.3 to 0.7)
  } else if (setCount <= 18) {
    // 6-18 sets: Lighter, more vibrant golden color
    return { color: '#D4C070', opacity: 0.85 }; // Lighter gold, higher opacity (was #BFA84D, 0.6)
  } else {
    // 18+ sets: Brighter red
    return { color: '#B00000', opacity: 1.0 }; // Brighter red, full opacity (was #8B0000, 0.8)
  }
};

/**
 * Get color and opacity for workout execution screen
 * Non-active muscles: Same as WorkoutCompletionScreen (white, 0.2 opacity)
 * Active muscles: Button color rgba(191, 168, 77, 0.2) = #BFA84D with 0.2 opacity
 * @param {number} setCount - Number of effective sets
 * @returns {object} - Object with color (hex) and opacity (0-1)
 */
export const getMuscleColorWorkoutExecution = (setCount) => {
  if (setCount === 0) {
    // Non-active muscles: less opaque than WorkoutCompletionScreen
    return { color: '#FFFFFF', opacity: 0.15 };
  } else {
    // Active muscles: button color rgba(191, 168, 77, 0.2) - more opaque
    return { color: '#BFA84D', opacity: 0.35 };
  }
};

/**
 * Get color for selected muscle (for filtering)
 * @param {boolean} isSelected - Whether the muscle is selected
 * @returns {object} - Object with color (hex) and opacity (0-1)
 */
export const getMuscleSelectionColor = (isSelected) => {
  if (isSelected) {
    return { color: '#BFA84D', opacity: 0.2 }; // Match "Aplicar" button background: rgba(191, 168, 77, 0.2)
  } else {
    return { color: '#FFFFFF', opacity: 0.1 }; // Barely visible when not selected
  }
};

