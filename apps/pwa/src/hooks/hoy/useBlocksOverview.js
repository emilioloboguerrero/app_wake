// Lightweight block-list reader for monthly-drop courses.
//
// Returns the full list of blocks (title + unlock date) for a `block_cadence:
// 'monthly_first_monday'` course — no sessions, no exercises. Used by Contenido
// to render the future-block tiles (which /current-block doesn't carry) and by
// the pre-purchase course-detail strip.
//
// Returns `{ cadence: null, blocks: [] }` for non-cadenced courses so callers
// can branch on `data.cadence` without an extra round-trip.
//
// See memory/project_monthly_drops.md for the product contract.
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../utils/apiClient';
import { STALE_TIMES, GC_TIMES } from '../../config/queryConfig';

export function useBlocksOverview(courseId, { enabled = true } = {}) {
  const q = useQuery({
    queryKey: ['workout', 'blocksOverview', courseId],
    queryFn: () => apiClient
      .get(`/workout/programs/${courseId}/blocks-overview`)
      .then((r) => r?.data ?? null),
    enabled: !!courseId && enabled,
    staleTime: STALE_TIMES.currentBlock,
    gcTime: GC_TIMES.currentBlock,
  });
  const data = q.data || null;
  return {
    cadence: data?.cadence ?? null,
    currentBlockIndex: data?.current_block_index ?? null,
    currentBlockStartedAt: data?.current_block_started_at ?? null,
    nextBlockUnlocksAt: data?.next_block_unlocks_at ?? null,
    blocks: data?.blocks ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}
