/**
 * Get color and opacity for muscle visualization based on set count
 * @param {number} setCount - Number of effective sets
 * @returns {object} - Object with color (hex) and opacity (0-1)
 */
export const getMuscleColor = (volume) => {
  // volume is 0.0 to 1.0 (effective sets)
  if (volume <= 0) {
    return { color: '#FFFFFF', opacity: 0.05 };
  }
  // Scale from dim white (low activation) to bright white (high activation)
  // 0.1 → faint, 0.5 → medium, 1.0 → fully lit
  const opacity = 0.1 + volume * 0.7; // 0.1 to 0.8
  return { color: '#FFFFFF', opacity };
};

/**
 * Get color for selected muscle (for filtering)
 * @param {boolean} isSelected - Whether the muscle is selected
 * @returns {object} - Object with color (hex) and opacity (0-1)
 */
export const getMuscleSelectionColor = (isSelected) => {
  if (isSelected) {
    return { color: '#ffffff', opacity: 0.2 }; // Match "Aplicar" button background: rgba(255, 255, 255, 0.2)
  } else {
    return { color: '#FFFFFF', opacity: 0.1 }; // Barely visible when not selected
  }
};

