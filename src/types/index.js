// Type definitions for Wake

export const UserRoles = {
  USER: 'user',
  CREATOR: 'creator',
  ADMIN: 'admin'
};

export const CourseLevels = {
  BEGINNER: 'principiante',
  INTERMEDIATE: 'intermedio',
  ADVANCED: 'avanzado'
};

export const CourseDisciplines = {
  RUNNING: 'running',
  STRENGTH: 'fuerza',
  HYBRID: 'híbrido',
  CALISTHENICS: 'calistenia',
  MOBILITY: 'movilidad',
  TRIATHLON: 'triatlón',
  YOGA: 'yoga'
};

export const ProgressStatus = {
  PENDING: 'pendiente',
  IN_PROGRESS: 'en_progreso',
  COMPLETED: 'completado'
};

export const PostTypes = {
  POST: 'post',
  ANNOUNCEMENT: 'anuncio',
  CHALLENGE: 'reto',
  EVENT: 'evento'
};

export const AchievementTypes = {
  BADGE: 'medalla',
  TROPHY: 'trofeo'
};

export const MediaTypes = {
  VIDEO: 'video',
  PDF: 'pdf',
  IMAGE: 'img'
};

export const CourseAccessTypes = {
  ONE_TIME: 'one-time',
  SUBSCRIPTION: 'subscription'
};

export const SubscriptionIntervals = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
};

export const CourseStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published', 
  ARCHIVED: 'archived'
};
