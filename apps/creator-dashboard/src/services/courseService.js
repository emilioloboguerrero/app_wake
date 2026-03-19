import apiClient from '../utils/apiClient';

export const getAvailableCourses = async () => {
  const result = await apiClient.get('/creator/programs');
  const programs = result?.data ?? [];

  return programs
    .sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    })
    .map((p) => ({
      id: p.programId,
      ...p,
      creatorName: p.creatorName || 'Unknown Creator',
      creator_name: p.creatorName || 'Unknown Creator',
    }));
};
