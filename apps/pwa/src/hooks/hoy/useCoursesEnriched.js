// Enriches the user's courses with fields not stored on users/{uid}.courses[*].
// useUserCourses only exposes what's in user.courses, so we fetch
// /workout/courses/:courseId per course (cached, low churn) and lift the fields
// downstream screens depend on:
//   - creator_id        → coach grouping on Hoy
//   - weight_suggestions → 1RM-based suggestion card in WorkoutExecutionScreen
//   - availableLibraries → "swap exercise" picker in WorkoutExecutionScreen
//   - discipline        → muscle-volume tracking gate in WorkoutCompletionScreen
//   - image_url, title, creatorName, image_path, video_intro_url → display
//     metadata that creators can update post-purchase. The user.courses snapshot
//     is taken at purchase time and never refreshes; reading from the API means
//     a renamed program / re-uploaded image / rotated download token is reflected
//     immediately for everyone.
//   - block_cadence, current_block_id, current_block_index → monthly-drop
//     subscription model (see memory/project_monthly_drops.md). Hoy + the
//     workout walker branch on cadence to gate the live block.
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
        // Display metadata — fresh value wins over the user.courses snapshot
        image_url: apiData?.image_url ?? c.image_url ?? null,
        image_path: apiData?.image_path ?? c.image_path ?? null,
        title: apiData?.title ?? c.title ?? '',
        creatorName: apiData?.creatorName ?? c.creatorName ?? null,
        video_intro_url: apiData?.video_intro_url ?? c.video_intro_url ?? null,
        block_cadence: apiData?.block_cadence ?? null,
        current_block_id: apiData?.current_block_id ?? null,
        current_block_index: typeof apiData?.current_block_index === 'number' ? apiData.current_block_index : null,
        // Count of "Recursos adicionales" attached to the program — drives the
        // resources card in the Hoy carousel.
        additional_resources_count:
          typeof apiData?.additional_resources_count === 'number'
            ? apiData.additional_resources_count
            : (c.additional_resources_count ?? 0),
        scheduling: apiData?.scheduling ?? c.scheduling ?? null,
        // Level-gating fields — set by creator, read by level-picker modal + workout walker.
        levels: apiData?.levels ?? c.levels ?? null,
        level_plans: apiData?.level_plans ?? c.level_plans ?? null,
      };
    }),
  };
}
