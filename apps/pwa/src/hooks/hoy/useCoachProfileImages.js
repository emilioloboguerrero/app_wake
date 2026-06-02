// Fetches public-profile images for every coach environment in a single React Query.
// Returns a map keyed by coachId so the WeekCoachCard can render avatars in the
// selector and derive its accent from the active coach's profile picture.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiService from '../../services/apiService';

const pickImageUrl = (profile) =>
  profile?.profilePictureUrl ||
  profile?.image_url ||
  profile?.imageUrl ||
  null;

export function useCoachProfileImages(coachEnvironments = []) {
  const pairs = useMemo(() => {
    const seen = new Set();
    const out = [];
    (coachEnvironments || []).forEach((c) => {
      if (!c?.creatorId || seen.has(c.creatorId)) return;
      seen.add(c.creatorId);
      out.push({ coachId: c.coachId, creatorId: c.creatorId });
    });
    return out;
  }, [coachEnvironments]);

  const cacheKey = useMemo(
    () => pairs.map((p) => `${p.coachId}:${p.creatorId}`).sort().join('|'),
    [pairs],
  );

  const { data } = useQuery({
    queryKey: ['hoy', 'coach-profile-images', cacheKey],
    queryFn: async () => {
      const entries = await Promise.all(
        pairs.map(async (p) => {
          const profile = await apiService.getPublicProfile(p.creatorId);
          return [p.coachId, pickImageUrl(profile)];
        }),
      );
      return Object.fromEntries(entries);
    },
    enabled: pairs.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  return data || {};
}
