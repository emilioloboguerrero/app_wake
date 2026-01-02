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

