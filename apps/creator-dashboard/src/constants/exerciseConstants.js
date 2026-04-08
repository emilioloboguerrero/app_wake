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
};

export const IMPLEMENTS_LIST = [
  'Peso Corporal',
  'Banco',
  'Banco Inclinado',
  'Pesas Rusas',
  'Bandas de Resistencia',
  'Barra',
  'Barra Z',
  'Mancuernas',
  'Cable',
  'Máquina Smith',
  'Máquina',
  'Lastre',
  'Paralelas',
  'TRX',
  'Otro',
];

export const EXERCISE_PRESETS = {
  horizontal_push: {
    name: 'Empuje Horizontal',
    muscles: { pecs: 100, front_delts: 28, triceps: 45 },
  },
  incline_press: {
    name: 'Press Inclinado',
    muscles: { pecs: 100, front_delts: 38, triceps: 33 },
  },
  vertical_push: {
    name: 'Empuje Vertical',
    muscles: { front_delts: 100, side_delts: 35, triceps: 28, traps: 23 },
  },
  horizontal_pull: {
    name: 'Tirón Horizontal',
    muscles: { lats: 100, rhomboids: 45, rear_delts: 35, biceps: 28, traps: 23 },
  },
  vertical_pull: {
    name: 'Tirón Vertical',
    muscles: { lats: 100, biceps: 45, rear_delts: 28, rhomboids: 23 },
  },
  hip_hinge: {
    name: 'Bisagra de Cadera',
    muscles: { hamstrings: 100, glutes: 65, lower_back: 45, traps: 23 },
  },
  squat: {
    name: 'Sentadilla',
    muscles: { quads: 100, glutes: 55, hamstrings: 35, calves: 23 },
  },
  lunge_split: {
    name: 'Zancada/División',
    muscles: { quads: 100, glutes: 45, hamstrings: 33, calves: 23 },
  },
  bicep_isolation: {
    name: 'Aislamiento de Bíceps',
    muscles: { biceps: 100, forearms: 35 },
  },
  tricep_isolation: {
    name: 'Aislamiento de Tríceps',
    muscles: { triceps: 100, forearms: 23 },
  },
  lateral_raise: {
    name: 'Elevación Lateral',
    muscles: { side_delts: 100, front_delts: 23, traps: 18 },
  },
  face_pull: {
    name: 'Tirón Facial',
    muscles: { rear_delts: 100, rhomboids: 45, traps: 35, biceps: 23 },
  },
  calf_raise: {
    name: 'Elevación de Gemelos',
    muscles: { calves: 100 },
  },
  leg_curl: {
    name: 'Curl de Pierna',
    muscles: { hamstrings: 100, glutes: 23 },
  },
  leg_extension: {
    name: 'Extensión de Pierna',
    muscles: { quads: 100 },
  },
  abdominal_crunch: {
    name: 'Abdominales',
    muscles: { abs: 100, obliques: 23 },
  },
};

export const METADATA_KEYS = new Set([
  'id', 'title', 'creator_id', 'creator_name', 'created_at', 'updated_at', 'icon',
]);
