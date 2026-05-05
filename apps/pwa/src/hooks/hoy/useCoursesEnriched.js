// Enriches the user's courses with fields not stored on users/{uid}.courses[*].
// useUserCourses only exposes what's in user.courses, so we fetch
// /workout/courses/:courseId per course (cached, low churn) and lift the fields
// downstream screens depend on:
//   - creator_id        → coach grouping on Hoy
//   - weight_suggestions → 1RM-based suggestion card in WorkoutExecutionScreen
//   - availableLibraries → "swap exercise" picker in WorkoutExecutionScreen
//   - discipline        → muscle-volume tracking gate in WorkoutCompletionScreen
//
// This hook does NOT block consumers on enrichment. It returns courses immediately
// with whatever enriched fields are currently cached; missing fields fill in as the
// per-course detail queries resolve. Hoy renders the carousel right away and reflows
// coach grouping when creator_id arrives.
import { useQueries } from '@tanstack/react-query';
import apiClient from '../../utils/apiClient';

export function useCoursesEnriched(courses) {
  const list = courses || [];
  const queries = useQueries({
    queries: list.map((c) => ({
      queryKey: ['preview', 'courseDetail', c.courseId || c.id],
      queryFn: () => apiClient
        .get(`/workout/courses/${c.courseId || c.id}`)
        .then((r) => r?.data ?? null)
        .catch(() => null),
      enabled: !!(c.courseId || c.id),
      staleTime: 10 * 60 * 1000,
    })),
  });
  return {
    courses: list.map((c, i) => {
      const apiData = queries[i]?.data;
      return {
        ...c,
        creator_id: apiData?.creator_id || c.creator_id || null,
        weight_suggestions: apiData?.weight_suggestions ?? c.weight_suggestions,
        availableLibraries: apiData?.availableLibraries ?? c.availableLibraries,
        discipline: apiData?.discipline ?? c.discipline,
      };
    }),
  };
}
