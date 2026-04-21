import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import bundleService from '../services/bundleService';
import { queryKeys, cacheConfig } from '../config/queryClient';

export const useCreatorBundles = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: user ? queryKeys.bundles.byCreator(user.uid) : ['bundles', 'none'],
    queryFn: async () => {
      if (!user) return [];
      return await bundleService.getBundlesByCreator();
    },
    enabled: !!user,
    ...cacheConfig.clientsOverview,
  });
};

export const useBundle = (bundleId) => {
  return useQuery({
    queryKey: bundleId ? queryKeys.bundles.detail(bundleId) : ['bundles', 'none'],
    queryFn: async () => {
      if (!bundleId) return null;
      return await bundleService.getBundleById(bundleId);
    },
    enabled: !!bundleId,
    ...cacheConfig.otherPrograms,
  });
};

export const useBundleAnalytics = (bundleId) => {
  return useQuery({
    queryKey: bundleId ? ['bundles', bundleId, 'analytics'] : ['bundles', 'none', 'analytics'],
    queryFn: async () => {
      if (!bundleId) return null;
      return await bundleService.getBundleAnalytics(bundleId);
    },
    enabled: !!bundleId,
    ...cacheConfig.analytics,
  });
};

export const useCreateBundle = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload) => bundleService.createBundle(payload),
    onSuccess: () => {
      if (user) {
        queryClient.invalidateQueries({ queryKey: queryKeys.bundles.byCreator(user.uid) });
      }
    },
  });
};

export const useUpdateBundle = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ bundleId, updates }) => bundleService.updateBundle(bundleId, updates),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bundles.detail(variables.bundleId) });
      if (user) {
        queryClient.invalidateQueries({ queryKey: queryKeys.bundles.byCreator(user.uid) });
      }
    },
  });
};

export const useUpdateBundleStatus = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ bundleId, status }) => bundleService.updateBundleStatus(bundleId, status),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bundles.detail(variables.bundleId) });
      if (user) {
        queryClient.invalidateQueries({ queryKey: queryKeys.bundles.byCreator(user.uid) });
      }
    },
  });
};

export const useDeleteBundle = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (bundleId) => bundleService.deleteBundle(bundleId),
    onSuccess: (_data, bundleId) => {
      queryClient.removeQueries({ queryKey: queryKeys.bundles.detail(bundleId) });
      if (user) {
        queryClient.invalidateQueries({ queryKey: queryKeys.bundles.byCreator(user.uid) });
      }
    },
  });
};
