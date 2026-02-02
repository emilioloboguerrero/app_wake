/**
 * Muscle Volume Info Service
 * 
 * Provides descriptions and information for muscle volume tracking.
 * If a muscle volume metric is in this dictionary, it has info available.
 */

const MUSCLE_VOLUME_INFO = {
  'series_efectivas': {
    title: 'Series Efectivas',
    description: `Las series efectivas son aquellas series que realmente contribuyen al crecimiento muscular. Se consideran efectivas las series con una intensidad de 7/10 o superior en la escala de esfuerzo percibido, manteniendo siempre una buena técnica.

IMPORTANTE:
• La cantidad óptima varía según cada persona
• Más volumen no siempre significa mejores resultados
• La calidad de las series es más importante que la cantidad
• El volumen debe progresar gradualmente
• Escucha a tu cuerpo y ajusta según tu recuperación

Estas recomendaciones son puntos de partida que debes adaptar según tu experiencia, objetivos y capacidad de recuperación.`,
    disclaimers: [
      'Estas son solo estimaciones y sugerencias',
      'Cada persona debe usar pesos con los que se sienta cómoda',
      'Busca ayuda profesional para cada ejercicio',
      'No nos hacemos responsables de lesiones',
      'Siempre usa técnica perfecta',
      'Consulta nuestros términos y condiciones'
    ]
  },
  // Add more muscle volume metrics here as needed...
};

class MuscleVolumeInfoService {
  /**
   * Get info for a specific muscle volume metric
   * @param {string} metricKey - The metric key (e.g., 'series_efectivas')
   * @returns {object|null} - Info object with title, description, and disclaimers, or null if not found
   */
  getMuscleVolumeInfo(metricKey) {
    const key = metricKey.toLowerCase();
    return MUSCLE_VOLUME_INFO[key] || null;
  }
  
  /**
   * Check if muscle volume metric has info available
   * @param {string} metricKey - The metric key
   * @returns {boolean} - True if info exists, false otherwise
   */
  hasInfo(metricKey) {
    const info = this.getMuscleVolumeInfo(metricKey);
    return info !== null;
  }
  
  /**
   * Get all available muscle volume metrics with info
   * @returns {string[]} - Array of metric keys that have info
   */
  getAllAvailableMetrics() {
    return Object.keys(MUSCLE_VOLUME_INFO);
  }
}

export default new MuscleVolumeInfoService();
