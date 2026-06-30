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
  // Monthly-drop current block: flips only on the first Monday of each month
  // via a server cron. Polling more than ~5 min adds nothing; the cron either
  // already wrote `current_block_id` on the course doc and the API echoes it
  // back, or it didn't and there's no new content yet either way.
  currentBlock: 5 * 60 * 1000,
  // Additional resources attached to a program (PDFs, videos, links). Creators
  // edit these infrequently and refetchOnWindowFocus picks up changes anyway.
  courseResources: 15 * 60 * 1000,
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
  currentBlock: 30 * 60 * 1000,
};
