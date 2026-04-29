// React Query hook for the C-10 client-relationships flow.
// Surfaces pending one-on-one invitations to the user and exposes
// accept/decline mutations. Backend gate (Tier 1) sets new invites to
// status: 'pending'; the creator can't operate on the client until the
// user explicitly accepts.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../utils/apiClient';

const RELATIONSHIPS_KEY = (userId, status) => ['client-relationships', userId, status ?? 'all'];

export function useClientRelationships(userId, { status = 'pending' } = {}) {
  return useQuery({
    queryKey: RELATIONSHIPS_KEY(userId, status),
    queryFn: () =>
      apiClient
        .get('/users/me/client-relationships', { params: { status } })
        .then((r) => r?.data ?? []),
    enabled: !!userId,
    // Pending invites are shown as a banner — refetch on focus so a creator's
    // newly-sent invite appears within seconds without a full reload.
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useAcceptRelationship(userId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (relationshipId) =>
      apiClient
        .post(`/users/me/client-relationships/${relationshipId}/accept`)
        .then((r) => r?.data ?? null),
    onSuccess: () => {
      // C-10 v2: when an invite carried a pendingProgramAssignment, accept
      // also writes user.courses[programId]. Invalidate the user query (which
      // backs purchasedCourses on MainScreen) so the new program card appears
      // immediately, plus the relationship lists so the pending overlay clears.
      queryClient.invalidateQueries({ queryKey: ['client-relationships', userId] });
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
    },
  });
}

export function useDeclineRelationship(userId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (relationshipId) =>
      apiClient
        .post(`/users/me/client-relationships/${relationshipId}/decline`)
        .then((r) => r?.data ?? null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-relationships', userId] });
    },
  });
}
