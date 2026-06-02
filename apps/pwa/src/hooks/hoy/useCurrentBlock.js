// Reads the currently-unlocked block for a `block_cadence: 'monthly_first_monday'`
// course. Returns:
//   { block, locked, expiresAt, cadence, nextBlockIndex, nextBlockUnlocksAt }
//
// `block` carries `started_at` (from program_state.current_block_started_at)
// which the Contenido calendar uses to bucket session completions into weeks.
//
// The endpoint is only meaningful for cadenced courses. Pass `enabled` from
// the caller (typically `course.block_cadence === 'monthly_first_monday'`)
// so we don't fan out one request per regular course on Hoy.
//
// See memory/project_monthly_drops.md for the product contract.
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../utils/apiClient';
import { STALE_TIMES, GC_TIMES } from '../../config/queryConfig';

export function useCurrentBlock(courseId, { enabled = true } = {}) {
  const q = useQuery({
    queryKey: ['workout', 'currentBlock', courseId],
    queryFn: () => apiClient
      .get(`/workout/programs/${courseId}/current-block`)
      .then((r) => r?.data ?? null),
    enabled: !!courseId && enabled,
    staleTime: STALE_TIMES.currentBlock,
    gcTime: GC_TIMES.currentBlock,
  });
  const data = q.data || null;
  return {
    block: data?.block ?? null,
    locked: !!data?.locked,
    expiresAt: data?.expires_at ?? null,
    cadence: data?.cadence ?? null,
    nextBlockIndex: data?.next_block_index ?? null,
    nextBlockUnlocksAt: data?.next_block_unlocks_at ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}
