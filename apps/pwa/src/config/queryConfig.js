export const STALE_TIMES = {
  activeSession: 0,
  userProfile: 5 * 60 * 1000,
  // Shorter window so coach edits to library exercises (rename, video, muscle activation)
  // propagate to clients within ~2 min instead of 30. Combined with refetchOnWindowFocus
  // in cacheConfig.programStructure this means clients see the change on next focus.
  programStructure: 2 * 60 * 1000,
  nutritionDiary: 30 * 1000,
  exerciseHistory: 15 * 60 * 1000,
  sessionHistory: 10 * 60 * 1000,
  clientList: 2 * 60 * 1000,
  bodyLog: 5 * 60 * 1000,
  events: 2 * 60 * 1000,
  eventRegistrations: 60 * 1000,
};

export const GC_TIMES = {
  activeSession: 30 * 60 * 1000,
  userProfile: 60 * 60 * 1000,
  programStructure: 60 * 60 * 1000,
  nutritionDiary: 30 * 60 * 1000,
  exerciseHistory: 60 * 60 * 1000,
  sessionHistory: 60 * 60 * 1000,
  clientList: 5 * 60 * 1000,
  bodyLog: 60 * 60 * 1000,
  events: 5 * 60 * 1000,
  eventRegistrations: 2 * 60 * 1000,
};
