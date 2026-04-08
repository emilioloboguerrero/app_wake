// Contextual hints — behavior-triggered tips that appear once per screen.
// Each hint is tied to a screenKey and shows on the creator's first visit.
// After dismissal or auto-hide, the hint won't reappear.

export const HINTS = {
  dashboard: {
    title: 'Tu centro de control',
    body: 'Dos vistas: 1 a 1 para gestionar clientes individuales, Programas para ver ventas y adherencia. La vista activa se recuerda entre sesiones.',
  },
  programas: {
    title: 'Programas grupales',
    body: 'Un programa agrupa semanas de sesiones. Crealo primero, luego asigna sesiones desde tu biblioteca.',
  },
  clientes: {
    title: 'Tus clientes en un lugar',
    body: 'Aqui ves todos tus clientes agrupados por programa. Haz clic en uno para ver su progreso detallado.',
  },
  events: {
    title: 'Eventos con check-in',
    body: 'Crea eventos con formulario personalizado. El dia del evento, usa el escaner QR para validar asistentes.',
  },
  nutrition: {
    title: 'Recetas y planes',
    body: 'Arma recetas con macros calculados automaticamente, luego agrupa recetas en planes nutricionales.',
  },
  profile: {
    title: 'Tu identidad publica',
    body: 'Tu foto, usuario y ubicacion se muestran a tus clientes. Conecta Instagram para mostrar tu feed.',
  },
  'client-detail': {
    title: 'Vista de cliente',
    body: 'Las pestanas Lab, Contenido y Perfil te dan el panorama completo de cada cliente.',
  },
  'program-detail': {
    title: 'Estructura del programa',
    body: 'Organiza por semanas y dias. Arrastra sesiones de tu biblioteca a cada dia de la semana.',
  },
  'event-editor': {
    title: 'Editor de evento',
    body: 'Agrega campos personalizados al formulario. Arrastra para reordenar. La imagen de portada define el tono.',
  },
  'meal-editor': {
    title: 'Editor de receta',
    body: 'Busca alimentos, ajusta porciones y los macros se calculan automaticamente.',
  },
  'plan-editor': {
    title: 'Editor de plan nutricional',
    body: 'Organiza por categorias (desayuno, almuerzo...). Cada categoria puede tener multiples opciones.',
  },
  'plan-detail': {
    title: 'Detalle del plan',
    body: 'Arma la semana asignando sesiones a cada dia. Los cambios se propagan automaticamente a los clientes asignados.',
  },
  availability: {
    title: 'Tu disponibilidad',
    body: 'Define tus horarios disponibles para llamadas. Tus clientes podran agendar dentro de esos bloques.',
  },
  client: {
    title: 'Perfil completo del cliente',
    body: 'Navega entre Lab, Contenido y Perfil para ver metricas, plan de entrenamiento, nutricion y datos personales.',
  },
  'create-session': {
    title: 'Nueva sesion de biblioteca',
    body: 'Dale un nombre y una imagen a tu sesion. Despues podras agregar ejercicios desde el editor.',
  },
  'one-on-one': {
    title: 'Programas individuales',
    body: 'Gestiona tus clientes uno a uno. Asigna programas personalizados y revisa su progreso individual.',
  },
};

export const HINT_STORAGE_PREFIX = 'wake_hint_';
