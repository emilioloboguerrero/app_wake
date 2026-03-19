import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import purchaseService from '../../services/purchaseService';

export function useUserCourses(userId) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.user.courses(userId),
    queryFn: () => purchaseService.getUserPurchasedCourses(userId),
    enabled: !!userId,
    ...cacheConfig.programStructure,
  });

  return {
    courses: Array.isArray(data) ? data : [],
    isLoading,
    error: isError ? 'Error al cargar tus cursos. Inténtalo de nuevo.' : null,
    refetch,
  };
}
