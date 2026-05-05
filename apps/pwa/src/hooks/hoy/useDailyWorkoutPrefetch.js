// Prefetches /workout/daily for every course on Hoy, in parallel with enrichment.
//
// TodayWorkoutCard fires this same query keyed by courseId; by warming the cache
// at the screen level we avoid a second waterfall (program load → card mount →
// card fires daily fetch). With this, by the time cards mount the data is already
// cached and the back face is ready immediately.
//
// Query key MUST match TodayWorkoutCard's exactly: ['preview', 'todaySession', userId, courseId]
import { useQueries } from '@tanstack/react-query';
import sessionService from '../../services/sessionService';

export function useDailyWorkoutPrefetch(userId, courses) {
  const list = courses || [];
  useQueries({
    queries: list.map((c) => {
      const courseId = c.courseId || c.id;
      const expired = !c?.is_trial && c?.expires_at && new Date(c.expires_at) <= new Date();
      return {
        queryKey: ['preview', 'todaySession', userId, courseId],
        queryFn: () => sessionService.getCurrentSession(userId, courseId),
        enabled: !!userId && !!courseId && !expired,
        staleTime: 60 * 1000,
      };
    }),
  });
}
