export const GUIDE_STORAGE_PREFIX = 'wake_guide_';

export const GUIDE_STEPS = {
  // ── Biblioteca: Ejercicios (first tab — covers shared UI) ──
  'biblioteca-ejercicios': [
    {
      key: 'domain-nav',
      title: 'Entrenamiento y Nutricion',
      body: 'Dos mundos, un solo lugar. Alterna entre ambos aqui.',
      placement: 'bottom',
    },
    {
      key: 'primary-btn',
      title: 'Crea contenido',
      body: 'Bibliotecas de ejercicios, sesiones o planes. Todo empieza con este boton.',
      placement: 'bottom',
    },
    {
      key: 'sub-tabs',
      title: 'Tres tipos de contenido',
      body: 'Ejercicios, Sesiones y Planes. Cada uno tiene su propio flujo.',
      placement: 'bottom',
    },
    {
      key: 'search-filter',
      title: 'Busca y filtra',
      body: 'Encuentra contenido rapido cuando tu biblioteca crezca.',
      placement: 'bottom',
    },
    {
      key: 'content-area',
      title: 'Tus bibliotecas de ejercicios',
      body: 'Cada biblioteca agrupa ejercicios por categoria. Haz clic en una para editarla.',
      placement: 'top',
    },
  ],

  // ── Biblioteca: Sesiones (only what's different) ──
  'biblioteca-sesiones': [
    {
      key: 'content-area',
      title: 'Tus sesiones de entrenamiento',
      body: 'Cada sesion es un bloque reutilizable con ejercicios, series y descansos.',
      placement: 'top',
    },
  ],

  // ── Biblioteca: Planes (only what's different) ──
  'biblioteca-planes': [
    {
      key: 'content-area',
      title: 'Tus planes de entrenamiento',
      body: 'Un plan organiza sesiones en semanas. Es lo que asignas a un programa.',
      placement: 'top',
    },
  ],

  // ── Biblioteca: Planes nutricionales ──
  'biblioteca-planes_nutri': [
    {
      key: 'content-area',
      title: 'Planes nutricionales',
      body: 'Arma planes con comidas y macros. Asignalos a clientes desde sus programas.',
      placement: 'top',
    },
  ],

  // ── Library Exercises Screen ──
  'library-exercises': [
    {
      key: 'exercise-sidebar',
      title: 'Tus ejercicios',
      body: 'Busca o agrega ejercicios con el boton +.',
      placement: 'right',
    },
    {
      key: 'workspace',
      title: 'Editor de ejercicio',
      body: 'Selecciona uno de la lista para editarlo aqui.',
      placement: 'left',
      optional: true,
    },
    {
      key: 'video-panel',
      title: 'Video demostrativo',
      body: 'Sube un video para que tus clientes vean la ejecucion.',
      placement: 'bottom',
      optional: true,
    },
  ],

  // ── Session Detail Screen ──
  'session-detail': [
    {
      key: 'session-header',
      title: 'Identidad de la sesion',
      body: 'Nombre e imagen. Es lo que ven tus clientes.',
      placement: 'bottom',
    },
    {
      key: 'available-exercises',
      title: 'Ejercicios disponibles',
      body: 'Arrastra o haz clic para agregar a la sesion.',
      placement: 'right',
    },
    {
      key: 'session-exercises',
      title: 'Tu sesion',
      body: 'Configura series, medidas y objetivos por ejercicio.',
      placement: 'left',
    },
  ],

  // ── Library Content Screen ──
  'library-content': [
    {
      key: 'content-tabs',
      title: 'Semanas y sesiones',
      body: 'Organiza contenido en semanas o sesiones individuales.',
      placement: 'bottom',
    },
    {
      key: 'module-list',
      title: 'Tu contenido',
      body: 'Cada semana agrupa sesiones. Activa edicion para reordenar.',
      placement: 'right',
    },
    {
      key: 'edit-actions',
      title: 'Modo edicion',
      body: 'Reordena, elimina o agrega contenido.',
      placement: 'bottom',
    },
  ],

  // ── Create Module Screen ──
  'create-module': [
    {
      key: 'module-form',
      title: 'Nombre del modulo',
      body: 'Tus clientes lo veran asi en su programa.',
      placement: 'bottom',
    },
  ],
};
