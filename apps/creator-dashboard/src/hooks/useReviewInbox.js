import { useQuery } from '@tanstack/react-query';
import apiClient from '../utils/apiClient';
import { queryKeys, cacheConfig } from '../config/queryClient';

/**
 * Fetches the creator's queue of client video submissions awaiting a response.
 * Each item is a thread where lastMessageBy === 'client' and status === 'open',
 * with the latest client message denormalised on the server side.
 */
export default function useReviewInbox(creatorId) {
  return useQuery({
    queryKey: queryKeys.videoExchanges.inbox(creatorId),
    queryFn: async () => {
      const res = await apiClient.get('/video-exchanges/inbox');
      const items = res.data || res;
      return Array.isArray(items) ? items : [];
    },
    enabled: !!creatorId,
    ...cacheConfig.videoExchanges,
  });
}
