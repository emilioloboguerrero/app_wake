/**
 * Objectives Info Service
 * 
 * Provides descriptions and information for workout objectives.
 * If an objective is in this dictionary, it has info available.
 */

const OBJECTIVES_INFO = {
  'reps': {
    title: 'Repeticiones',
    description: 'Es el número de veces que debes realizar un mismo movimiento dentro de esta serie.\n\nEl objetivo de la serie es completar esa cantidad con buena técnica y control. No se trata solo de terminar rápido, sino de mantener calidad en cada repetición.',
    disclaimers: [
      'Estas son solo estimaciones y sugerencias',
      'Cada persona debe usar pesos con los que se sienta cómoda',
      'Busca ayuda profesional para cada ejercicio',
      'No nos hacemos responsables de lesiones',
      'Siempre usa técnica perfecta',
      'Consulta nuestros términos y condiciones'
    ]
  },
  'weight_suggestion': {
    title: 'Peso Sugerido',
    description: 'Es la carga o resistencia recomendada para esta serie.\n\nEstá calculado específicamente para ti, con base en tus entrenamientos anteriores y los objetivos de esta serie (por ejemplo, intensidad, o repeticiones).\n\nEl objetivo es orientarte hacia un peso que te desafíe sin comprometer la forma o la seguridad. Puedes ajustarlo según cómo te sientas hoy.\n\nPuedes resetear los pesos con los que se hacen los cálculos en la pantalla de tu perfil',
    disclaimers: [
      'Estas son solo estimaciones y sugerencias',
      'Cada persona debe usar pesos con los que se sienta cómoda',
      'Busca ayuda profesional para cada ejercicio',
      'No nos hacemos responsables de lesiones',
      'Siempre usa técnica perfecta',
      'Consulta nuestros términos y condiciones'
    ]
  },
  'previous': {
    title: 'Anterior',
    description: 'Muestra los valores que registraste la última vez que realizaste esta misma serie o ejercicio —como peso, repeticiones o tiempo.\n\nEl objetivo es darte una referencia personal para comparar tu rendimiento actual y ayudarte a decidir si mantener, aumentar o ajustar la intensidad.\n\nVer tu serie anterior te permite seguir tu progreso y entrenar de forma más consciente.',
  },
  'intensity': {
    title: 'Intensidad',
    description: 'Es el nivel de esfuerzo que deberías alcanzar en esta serie.',
    hasVideos: true, // Flag indicating videos are available
    disclaimers: [
      'Estas son solo estimaciones y sugerencias',
      'Cada persona debe usar pesos con los que se sienta cómoda',
      'Busca ayuda profesional para cada ejercicio',
      'No nos hacemos responsables de lesiones',
      'Siempre usa técnica perfecta',
      'Consulta nuestros términos y condiciones'
    ]
  },
  // Add more objectives here as needed...
};

class ObjectivesInfoService {
  /**
   * Get info for a specific objective
   * @param {string} objectiveKey - The objective key (e.g., 'reps', 'weight')
   * @returns {object|null} - Info object with title and description, or null if not found
   */
  getObjectiveInfo(objectiveKey) {
    const key = objectiveKey.toLowerCase();
    return OBJECTIVES_INFO[key] || null;
  }
  
  /**
   * Check if objective has info available
   * @param {string} objectiveKey - The objective key
   * @returns {boolean} - True if info exists, false otherwise
   */
  hasInfo(objectiveKey) {
    const info = this.getObjectiveInfo(objectiveKey);
    return info !== null;
  }
  
  /**
   * Get all available objectives with info
   * @returns {string[]} - Array of objective keys that have info
   */
  getAllAvailableObjectives() {
    return Object.keys(OBJECTIVES_INFO);
  }
}

export default new ObjectivesInfoService();

