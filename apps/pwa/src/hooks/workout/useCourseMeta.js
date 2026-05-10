// Single-course version of useCoursesEnriched — fetches fresh display metadata
// (image_url, title, creatorName, etc.) from /workout/courses/:courseId so screens
// don't render the stale snapshot stored on users/{uid}.courses[*].
//
// Shares its query key (['preview','courseDetail',courseId]) with useCoursesEnriched,
// so if Hoy already loaded the carousel this returns instantly from cache.
//
// Returns the enriched course object: snapshot fields fall through, fresh API
// fields override. While the API call is in flight, snapshot values render so
// the screen never goes blank.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../utils/apiClient';

export function useCourseMeta(courseSnapshot, courseIdOverride) {
  const courseId = courseIdOverride
    || courseSnapshot?.courseId
    || courseSnapshot?.id
    || null;

  const { data: apiData } = useQuery({
    queryKey: ['preview', 'courseDetail', courseId],
    queryFn: () => apiClient
      .get(`/workout/courses/${courseId}`)
      .then((r) => r?.data ?? null)
      .catch(() => null),
    enabled: !!courseId,
    staleTime: 10 * 60 * 1000,
  });

  // Memoize: callers commonly list this object in useEffect/useCallback deps,
  // so a new reference every render would trigger infinite render loops.
  return useMemo(() => {
    const c = courseSnapshot || {};
    return {
      ...c,
      id: courseId,
      courseId,
      creator_id: apiData?.creator_id || c.creator_id || null,
      creatorName: apiData?.creatorName ?? c.creatorName ?? null,
      title: apiData?.title ?? c.title ?? '',
      image_url: apiData?.image_url ?? c.image_url ?? null,
      image_path: apiData?.image_path ?? c.image_path ?? null,
      video_intro_url: apiData?.video_intro_url ?? c.video_intro_url ?? null,
      discipline: apiData?.discipline ?? c.discipline ?? null,
      deliveryType: apiData?.deliveryType ?? c.deliveryType ?? null,
      weight_suggestions: apiData?.weight_suggestions ?? c.weight_suggestions,
      availableLibraries: apiData?.availableLibraries ?? c.availableLibraries,
    };
  }, [courseSnapshot, apiData, courseId]);
}
