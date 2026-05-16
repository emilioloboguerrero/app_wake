import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheConfig } from '../../config/queryClient';
import apiClient from '../../utils/apiClient';
import { isCourseEntryActive } from '../../utils/courseAccess';

function transformCourses(userData) {
  if (!userData?.courses) return [];
  return Object.entries(userData.courses).map(([courseId, e]) => {
    const hasAccess = isCourseEntryActive(e);
    return {
      id: courseId,
      courseId,
      title: e.title || 'Curso sin titulo',
      image_url: e.image_url || '',
      creatorName: e.creatorName || null,
      discipline: e.discipline || 'General',
      status: e.status,
      access_duration: e.access_duration,
      expires_at: e.expires_at,
      purchased_at: e.purchased_at,
      deliveryType: e.deliveryType,
      is_trial: e.is_trial,
      trial_consumed: e.trial_consumed,
      hasAccess,
      userCourseData: {
        is_trial: e.is_trial,
        trial_expires_at: e.trial_expires_at || null,
        expires_at: e.expires_at || null,
      },
      purchasedAt: e.purchased_at || null,
      isTrialCourse: e.is_trial === true,
    };
  });
}

export function useUserCourses(userId, { includeInactive = false } = {}) {
  const { data: profileData, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.user.detail(userId),
    queryFn: () => apiClient.get('/users/me').then(r => r?.data ?? null),
    enabled: !!userId,
    ...cacheConfig.userProfile,
  });

  const all = profileData ? transformCourses(profileData) : [];
  const courses = includeInactive ? all : all.filter((c) => c.hasAccess);

  return {
    courses,
    isLoading,
    error: isError ? 'Error al cargar tus cursos. Intentalo de nuevo.' : null,
    refetch,
  };
}
