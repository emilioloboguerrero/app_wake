// Enriches the user's courses with creator_id from the top-level courses doc.
// useUserCourses only exposes what's in user.courses (no creator_id on most accounts), so we
// fetch /workout/courses/:courseId per course (cached, low churn) to get the canonical creator_id.
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
  return list.map((c, i) => ({
    ...c,
    creator_id: queries[i]?.data?.creator_id || c.creator_id || null,
  }));
}
