// Mission definitions for the creator Getting Started track.
// Each mission auto-detects completion from React Query cache — zero extra network cost.
// Missions are ordered by the natural creator workflow.

export const MISSIONS = [
  {
    id: 'complete-profile',
    title: 'Completa tu perfil',
    description: 'Agrega una foto y tu nombre de usuario para que tus clientes te reconozcan.',
    route: '/profile',
    cta: 'Ir al perfil',
    detect: (data) => !!(data.profile?.profilePicture && data.profile?.username),
  },
  {
    id: 'create-session',
    title: 'Crea tu primera sesion',
    description: 'Disena una sesion de entrenamiento en tu biblioteca. Es el bloque base de todo.',
    route: '/biblioteca',
    cta: 'Ir a biblioteca',
    detect: (data) => (data.librarySessions?.length ?? 0) > 0,
  },
  {
    id: 'create-program',
    title: 'Crea tu primer programa',
    description: 'Un programa agrupa sesiones en semanas. Es lo que tus clientes van a seguir.',
    route: '/programas',
    cta: 'Ir a programas',
    detect: (data) => (data.programs?.length ?? 0) > 0,
  },
  {
    id: 'add-client',
    title: 'Agrega tu primer cliente',
    description: 'Invita a alguien a tu programa y empieza a entrenar juntos.',
    route: '/clientes',
    cta: 'Ir a clientes',
    detect: (data) => (data.clients?.length ?? 0) > 0,
  },
  {
    id: 'create-event',
    title: 'Crea tu primer evento',
    description: 'Organiza un evento con inscripcion, formulario personalizado y check-in por QR.',
    route: '/events',
    cta: 'Ir a eventos',
    detect: (data) => (data.events?.length ?? 0) > 0,
  },
];

export const STORAGE_KEY_CELEBRATED = 'wake_missions_celebrated';
export const STORAGE_KEY_DISMISSED = 'wake_missions_dismissed';
