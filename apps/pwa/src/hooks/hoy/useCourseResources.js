// Fetches the "Recursos adicionales" attached to a program. The endpoint is
// access-gated server-side and returns the list already sorted by `order`, so
// consumers can render it as-is.
//
// Resource = { id, type: 'pdf'|'youtube'|'link', title, url, storage_path?, order }
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../utils/apiClient';
import { STALE_TIMES } from '../../config/queryConfig';

export function useCourseResources(courseId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['workout', 'resources', courseId],
    queryFn: () =>
      apiClient
        .get(`/workout/courses/${courseId}/resources`)
        .then((r) => r?.data?.resources ?? []),
    enabled: !!courseId && enabled,
    staleTime: STALE_TIMES.courseResources,
  });
}
